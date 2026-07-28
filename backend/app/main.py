from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import Base, engine, get_db
from app.models import ImageFile, ImageFolder
from app.schemas import (
    ImageFolderCreate,
    ImageFolderCreateResult,
    ImageFolderSummary,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="BSK Media Nest API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080"],
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


def folder_summary(folder: ImageFolder, image_count: int) -> ImageFolderSummary:
    return ImageFolderSummary(
        id=folder.id,
        name=folder.name,
        image_count=image_count,
        created_at=folder.created_at,
    )


@app.get("/api/folders", response_model=list[ImageFolderSummary])
def list_folders(db: Session = Depends(get_db)) -> list[ImageFolderSummary]:
    rows = db.execute(
        select(ImageFolder, func.count(ImageFile.id))
        .outerjoin(ImageFile)
        .group_by(ImageFolder.id)
        .order_by(ImageFolder.created_at.desc())
    ).all()
    return [folder_summary(folder, image_count) for folder, image_count in rows]


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
