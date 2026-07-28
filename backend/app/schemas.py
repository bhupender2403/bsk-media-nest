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
    created_at: datetime


class ImageFolderCreateResult(BaseModel):
    created: bool
    folder: ImageFolderSummary
