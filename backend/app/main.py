from contextlib import asynccontextmanager
from datetime import UTC, datetime
import mimetypes
from pathlib import Path
import platform
import subprocess
from threading import Event, Thread
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from sqlalchemy import case, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db, initialize_schema
from app.models import (
    FileRecord,
    ImageFile,
    ImageFolder,
    ImportJob,
    ImportJobItem,
    PhotoRating,
)
from app.schemas import (
    FileRating,
    ImageFolderCreate,
    ImageFolderCreateResult,
    ImageFolderSummary,
    ImportJobSummary,
    FileRecordSummary,
    FolderScanCreate,
    FolderSelectionResult,
    RatingUpdate,
)
from app.worker import run as run_worker


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_schema()
    worker_stop = Event()
    worker_thread = Thread(
        target=run_worker,
        args=(worker_stop,),
        name="media-import-worker",
        daemon=True,
    )
    worker_thread.start()
    try:
        yield
    finally:
        worker_stop.set()
        worker_thread.join(timeout=5)


app = FastAPI(title="BSK Media Nest API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://tauri.localhost",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/message")
def message() -> dict[str, str]:
    return {"message": "Hello from the Python backend"}


def select_folder_path() -> str | None:
    system = platform.system()
    try:
        if system == "Darwin":
            result = subprocess.run(
                [
                    "osascript",
                    "-e",
                    'POSIX path of (choose folder with prompt "Choose a media folder")',
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=300,
            )
        elif system == "Windows":
            result = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    (
                        "Add-Type -AssemblyName System.Windows.Forms; "
                        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; "
                        "$dialog.Description = 'Choose a media folder'; "
                        "if ($dialog.ShowDialog() -eq 'OK') { $dialog.SelectedPath }"
                    ),
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=300,
            )
        elif system == "Linux":
            result = subprocess.run(
                [
                    "zenity",
                    "--file-selection",
                    "--directory",
                    "--title=Choose a media folder",
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=300,
            )
        else:
            raise HTTPException(
                status_code=501,
                detail=f"Folder selection is not supported on {system}.",
            )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=501,
            detail="No native folder-selection utility is available.",
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(
            status_code=504,
            detail="Folder selection timed out.",
        ) from exc

    if result.returncode != 0:
        return None
    selected_path = result.stdout.strip()
    return str(Path(selected_path).resolve()) if selected_path else None


@app.post("/api/system/select-folder", response_model=FolderSelectionResult)
def select_folder() -> FolderSelectionResult:
    return FolderSelectionResult(path=select_folder_path())


def folder_summary(
    folder: ImageFolder,
    image_count: int,
    movie_count: int = 0,
    pending_rating_count: int = 0,
) -> ImageFolderSummary:
    return ImageFolderSummary(
        id=folder.id,
        name=folder.name,
        image_count=image_count,
        movie_count=movie_count,
        pending_rating_count=pending_rating_count,
        created_at=folder.created_at,
    )


@app.get("/api/folders", response_model=list[ImageFolderSummary])
def list_folders(db: Session = Depends(get_db)) -> list[ImageFolderSummary]:
    rows = db.execute(
        select(
            ImageFolder,
            func.sum(
                case((FileRecord.media_kind == "image", 1), else_=0)
            ).label("image_count"),
            func.sum(
                case((FileRecord.media_kind == "video", 1), else_=0)
            ).label("movie_count"),
            func.sum(
                case(
                    (
                        (
                            (FileRecord.media_kind == "image")
                            | (FileRecord.media_kind == "video")
                        )
                        & (PhotoRating.md5.is_(None)),
                        1,
                    ),
                    else_=0,
                )
            ).label("pending_rating_count"),
        )
        .outerjoin(FileRecord, FileRecord.folder_id == ImageFolder.id)
        .outerjoin(PhotoRating, PhotoRating.md5 == FileRecord.unique_md5)
        .group_by(ImageFolder.id)
        .order_by(ImageFolder.created_at.desc())
    ).all()
    return [
        folder_summary(
            folder,
            int(image_count or 0),
            int(movie_count or 0),
            int(pending_rating_count or 0),
        )
        for folder, image_count, movie_count, pending_rating_count in rows
    ]


@app.delete("/api/folders/{folder_id}", status_code=204)
def remove_folder(
    folder_id: int,
    db: Session = Depends(get_db),
) -> Response:
    folder = db.get(ImageFolder, folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found.")

    active_job = db.scalar(
        select(ImportJob.id)
        .where(
            ImportJob.folder_id == folder_id,
            ImportJob.status.in_(["pending", "processing"]),
        )
        .limit(1)
    )
    if active_job is not None:
        raise HTTPException(
            status_code=409,
            detail="Wait for the active import to finish before removing this folder.",
        )

    job_ids = select(ImportJob.id).where(ImportJob.folder_id == folder_id)
    db.execute(delete(ImportJobItem).where(ImportJobItem.job_id.in_(job_ids)))
    db.execute(delete(ImportJob).where(ImportJob.folder_id == folder_id))
    db.execute(delete(FileRecord).where(FileRecord.folder_id == folder_id))
    db.execute(delete(ImageFile).where(ImageFile.folder_id == folder_id))
    db.delete(folder)
    db.commit()
    return Response(status_code=204)


@app.get(
    "/api/folders/{folder_id}/files",
    response_model=list[FileRecordSummary],
)
def list_folder_files(
    folder_id: int,
    db: Session = Depends(get_db),
) -> list[FileRecordSummary]:
    if db.get(ImageFolder, folder_id) is None:
        raise HTTPException(status_code=404, detail="Folder not found.")
    rows = db.execute(
        select(FileRecord, PhotoRating.rating)
        .outerjoin(PhotoRating, PhotoRating.md5 == FileRecord.unique_md5)
        .where(FileRecord.folder_id == folder_id)
        .order_by(FileRecord.relative_path)
    ).all()
    return [
        FileRecordSummary(
            id=record.id,
            relative_path=record.relative_path,
            media_type=record.media_type,
            media_kind=record.media_kind,
            size=record.size,
            md5=record.unique_md5,
            rating=rating,
            content_url=f"/api/files/{record.id}/content",
        )
        for record, rating in rows
    ]


@app.put("/api/files/{file_id}/rating", response_model=FileRating)
def set_file_rating(
    file_id: int,
    payload: RatingUpdate,
    db: Session = Depends(get_db),
) -> FileRating:
    record = db.get(FileRecord, file_id)
    if record is None:
        raise HTTPException(status_code=404, detail="File not found.")
    if record.media_kind not in {"image", "video"}:
        raise HTTPException(
            status_code=400,
            detail="Only images and movies can be rated.",
        )

    rating = db.get(PhotoRating, record.unique_md5)
    if rating is None:
        rating = PhotoRating(
            md5=record.unique_md5,
            rating=payload.rating,
            updated_at=datetime.now(UTC),
        )
        db.add(rating)
    else:
        rating.rating = payload.rating
        rating.updated_at = datetime.now(UTC)
    db.commit()
    return FileRating(md5=record.unique_md5, rating=rating.rating)


@app.get("/api/files/{file_id}/content", response_class=FileResponse)
def serve_file(
    file_id: int,
    db: Session = Depends(get_db),
) -> FileResponse:
    record = db.get(FileRecord, file_id)
    if record is None:
        raise HTTPException(status_code=404, detail="File not found.")
    path = Path(record.storage_path).resolve()
    folder = db.get(ImageFolder, record.folder_id)
    if folder is None or folder.source_path is None:
        raise HTTPException(status_code=404, detail="Media folder not found.")
    source_root = Path(folder.source_path).resolve()
    if not path.is_relative_to(source_root) or not path.is_file():
        raise HTTPException(status_code=404, detail="Media content not found.")
    return FileResponse(
        path,
        media_type=record.media_type,
        filename=Path(record.relative_path).name,
        content_disposition_type="inline",
    )


@app.post("/api/folders", response_model=ImageFolderCreateResult)
def add_folder(
    payload: ImageFolderCreate,
    db: Session = Depends(get_db),
) -> ImageFolderCreateResult:
    name = payload.name.strip()
    normalized_name = name.casefold()
    existing = db.scalar(
        select(ImageFolder).where(ImageFolder.normalized_name == normalized_name)
    )
    if existing:
        return ImageFolderCreateResult(
            created=False,
            folder=folder_summary(existing, len(existing.images)),
        )

    folder = ImageFolder(
        name=name,
        normalized_name=normalized_name,
        created_at=datetime.now(UTC),
        images=[
            ImageFile(
                relative_path=image.relative_path,
                media_type=image.media_type,
                size=image.size,
                last_modified=image.last_modified,
            )
            for image in payload.images
        ],
    )
    db.add(folder)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(
            select(ImageFolder).where(ImageFolder.normalized_name == normalized_name)
        )
        if existing is None:
            raise
        return ImageFolderCreateResult(
            created=False,
            folder=folder_summary(existing, len(existing.images)),
        )

    db.refresh(folder)
    return ImageFolderCreateResult(
        created=True,
        folder=folder_summary(folder, len(folder.images)),
    )


def job_summary(job: ImportJob, folder_name: str) -> ImportJobSummary:
    return ImportJobSummary(
        id=job.id,
        folder_id=job.folder_id,
        folder_name=folder_name,
        status=job.status,
        total_files=job.total_files,
        processed_files=job.processed_files,
        imported_files=job.imported_files,
        failed_files=job.failed_files,
        error=job.error,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )


@app.post("/api/import-jobs", response_model=ImportJobSummary)
def create_import_job(
    payload: FolderScanCreate,
    db: Session = Depends(get_db),
) -> ImportJobSummary:
    source_path = Path(payload.folder_path).expanduser().resolve()
    if not source_path.is_dir():
        raise HTTPException(status_code=400, detail="Folder path does not exist.")

    media_paths = [
        path
        for path in source_path.rglob("*")
        if path.is_file()
        and (mimetypes.guess_type(path.name)[0] or "").split("/", 1)[0]
        in {"image", "video", "audio"}
    ]
    if not media_paths:
        raise HTTPException(
            status_code=400,
            detail="Folder does not contain supported media files.",
        )

    clean_name = source_path.name
    folder = db.scalar(
        select(ImageFolder).where(ImageFolder.source_path == str(source_path))
    )
    if folder is None:
        folder = ImageFolder(
            name=clean_name,
            normalized_name=str(source_path).casefold(),
            source_path=str(source_path),
            created_at=datetime.now(UTC),
        )
        db.add(folder)
        db.flush()

    job = ImportJob(
        id=str(uuid4()),
        folder_id=folder.id,
        status="pending",
        total_files=len(media_paths),
        created_at=datetime.now(UTC),
    )
    db.add(job)

    try:
        for path in media_paths:
            relative_path = path.relative_to(source_path)
            media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            db.add(
                ImportJobItem(
                    job_id=job.id,
                    relative_path=str(relative_path),
                    storage_path=str(path),
                    media_type=media_type,
                    size=path.stat().st_size,
                    status="pending",
                )
            )
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(job)
    return job_summary(job, folder.name)


@app.get("/api/import-jobs", response_model=list[ImportJobSummary])
def list_import_jobs(db: Session = Depends(get_db)) -> list[ImportJobSummary]:
    rows = db.execute(
        select(ImportJob, ImageFolder.name)
        .join(ImageFolder, ImageFolder.id == ImportJob.folder_id)
        .order_by(ImportJob.created_at.desc())
        .limit(50)
    ).all()
    return [job_summary(job, folder_name) for job, folder_name in rows]
