from datetime import datetime

from pydantic import BaseModel, Field


class ImageMetadataCreate(BaseModel):
    relative_path: str = Field(min_length=1, max_length=1024)
    media_type: str = Field(min_length=1, max_length=100)
    size: int = Field(ge=0)
    last_modified: datetime


class ImageFolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    images: list[ImageMetadataCreate] = Field(min_length=1)


class ImageFolderSummary(BaseModel):
    id: int
    name: str
    image_count: int
    movie_count: int
    pending_rating_count: int
    created_at: datetime


class ImageFolderCreateResult(BaseModel):
    created: bool
    folder: ImageFolderSummary


class ImportJobSummary(BaseModel):
    id: str
    folder_id: int
    folder_name: str
    status: str
    total_files: int
    processed_files: int
    imported_files: int
    failed_files: int
    error: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class FolderScanCreate(BaseModel):
    folder_path: str = Field(min_length=1, max_length=2048)


class FolderSelectionResult(BaseModel):
    path: str | None


class FileRecordSummary(BaseModel):
    id: int
    relative_path: str
    media_type: str
    media_kind: str
    size: int
    md5: str
    rating: int | None
    content_url: str


class RatingUpdate(BaseModel):
    rating: int = Field(ge=1, le=5)


class FileRating(BaseModel):
    md5: str
    rating: int
