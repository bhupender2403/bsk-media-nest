from datetime import UTC, datetime
import hashlib
import mimetypes
from pathlib import Path
from threading import Event

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select

from app.database import SessionLocal, THUMBNAIL_DIR, initialize_schema
from app.models import FileRecord, ImportJob, ImportJobItem, UniqueFile

POLL_INTERVAL_SECONDS = 2
THUMBNAIL_MAX_SIZE = (480, 480)


def file_md5(path: Path) -> str:
    digest = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def media_kind(media_type: str) -> str:
    prefix = media_type.split("/", 1)[0]
    return prefix if prefix in {"image", "video", "audio"} else "other"


def thumbnail_path(md5: str) -> Path:
    return THUMBNAIL_DIR / md5[:2] / f"{md5[2:]}.jpg"


def create_thumbnail(source: Path, md5: str) -> Path:
    destination = thumbnail_path(md5)
    if destination.is_file():
        return destination

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    try:
        with Image.open(source) as image:
            image.seek(0)
            image = ImageOps.exif_transpose(image)
            image.thumbnail(THUMBNAIL_MAX_SIZE, Image.Resampling.LANCZOS)
            if image.mode not in {"RGB", "L"}:
                background = Image.new("RGB", image.size, "white")
                if "A" in image.getbands():
                    background.paste(image, mask=image.getchannel("A"))
                else:
                    background.paste(image)
                image = background
            elif image.mode == "L":
                image = image.convert("RGB")
            image.save(temporary, format="JPEG", quality=82, optimize=True)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def claim_job() -> str | None:
    with SessionLocal.begin() as db:
        job = db.scalar(
            select(ImportJob)
            .where(ImportJob.status == "pending")
            .order_by(ImportJob.created_at)
            .limit(1)
        )
        if job is None:
            return None
        job.status = "processing"
        job.started_at = datetime.now(UTC)
        return job.id


def process_job(job_id: str) -> None:
    with SessionLocal() as db:
        job = db.get(ImportJob, job_id)
        if job is None:
            return
        items = db.scalars(
            select(ImportJobItem)
            .where(ImportJobItem.job_id == job_id)
            .order_by(ImportJobItem.id)
        ).all()

        for item in items:
            try:
                path = Path(item.storage_path)
                md5 = file_md5(path)
                detected_type = (
                    item.media_type
                    or mimetypes.guess_type(path.name)[0]
                    or "application/octet-stream"
                )
                kind = media_kind(detected_type)
                if kind == "image":
                    try:
                        create_thumbnail(path, md5)
                    except UnidentifiedImageError:
                        # Keep browser-supported formats such as SVG in the catalog
                        # even when Pillow cannot create a raster preview for them.
                        pass
                if db.get(UniqueFile, md5) is None:
                    db.add(
                        UniqueFile(
                        md5=md5,
                        size=item.size,
                        media_type=detected_type,
                        media_kind=kind,
                        created_at=datetime.now(UTC),
                        )
                    )
                    db.flush()
                record = db.scalar(
                    select(FileRecord).where(
                        FileRecord.folder_id == job.folder_id,
                        FileRecord.relative_path == item.relative_path,
                    )
                )
                if record is None:
                    record = FileRecord(
                        folder_id=job.folder_id,
                        unique_md5=md5,
                        relative_path=item.relative_path,
                        storage_path=item.storage_path,
                        media_type=detected_type,
                        media_kind=kind,
                        size=item.size,
                        imported_at=datetime.now(UTC),
                    )
                    db.add(record)
                else:
                    record.unique_md5 = md5
                    record.storage_path = item.storage_path
                    record.media_type = detected_type
                    record.media_kind = kind
                    record.size = item.size
                    record.imported_at = datetime.now(UTC)
                item.status = "completed"
                job.imported_files += 1
            except Exception as exc:
                item.status = "failed"
                item.error = str(exc)
                job.failed_files += 1
            finally:
                job.processed_files += 1
                db.commit()

        job.status = "completed" if job.failed_files == 0 else "completed_with_errors"
        job.completed_at = datetime.now(UTC)
        db.commit()


def run(stop_event: Event | None = None) -> None:
    stop_event = stop_event or Event()
    initialize_schema()
    with SessionLocal.begin() as db:
        interrupted_jobs = db.scalars(
            select(ImportJob).where(ImportJob.status == "processing")
        ).all()
        for job in interrupted_jobs:
            job.status = "pending"
            job.started_at = None
            job.error = "Recovered after worker restart."
    while not stop_event.is_set():
        job_id = claim_job()
        if job_id is None:
            stop_event.wait(POLL_INTERVAL_SECONDS)
            continue
        try:
            process_job(job_id)
        except Exception as exc:
            with SessionLocal.begin() as db:
                job = db.get(ImportJob, job_id)
                if job:
                    job.status = "failed"
                    job.error = str(exc)
                    job.completed_at = datetime.now(UTC)


if __name__ == "__main__":
    run()
