from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ImageFolder(Base):
    __tablename__ = "image_folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    normalized_name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    source_path: Mapped[str | None] = mapped_column(
        String(2048),
        nullable=True,
        unique=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    images: Mapped[list["ImageFile"]] = relationship(
        back_populates="folder",
        cascade="all, delete-orphan",
        order_by="ImageFile.relative_path",
    )


class ImageFile(Base):
    __tablename__ = "image_files"
    __table_args__ = (
        UniqueConstraint("folder_id", "relative_path", name="uq_folder_image_path"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    folder_id: Mapped[int] = mapped_column(
        ForeignKey("image_folders.id", ondelete="CASCADE"),
        index=True,
    )
    relative_path: Mapped[str] = mapped_column(String(1024))
    media_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(BigInteger)
    last_modified: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    folder: Mapped[ImageFolder] = relationship(back_populates="images")


class UniqueFile(Base):
    __tablename__ = "unique_files"

    md5: Mapped[str] = mapped_column(String(32), primary_key=True)
    size: Mapped[int] = mapped_column(BigInteger)
    media_type: Mapped[str] = mapped_column(String(100))
    media_kind: Mapped[str] = mapped_column(String(20), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PhotoRating(Base):
    __tablename__ = "photo_ratings"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_photo_rating_range"),
    )

    md5: Mapped[str] = mapped_column(
        ForeignKey("unique_files.md5", ondelete="CASCADE"),
        primary_key=True,
    )
    rating: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FileRecord(Base):
    __tablename__ = "file_records"
    __table_args__ = (
        UniqueConstraint("folder_id", "relative_path", name="uq_folder_file_path"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    folder_id: Mapped[int] = mapped_column(
        ForeignKey("image_folders.id", ondelete="CASCADE"),
        index=True,
    )
    unique_md5: Mapped[str] = mapped_column(
        ForeignKey("unique_files.md5"),
        index=True,
    )
    relative_path: Mapped[str] = mapped_column(String(1024))
    storage_path: Mapped[str] = mapped_column(String(2048))
    media_type: Mapped[str] = mapped_column(String(100))
    media_kind: Mapped[str] = mapped_column(String(20), index=True)
    size: Mapped[int] = mapped_column(BigInteger)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    folder_id: Mapped[int] = mapped_column(
        ForeignKey("image_folders.id", ondelete="CASCADE"),
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), index=True)
    total_files: Mapped[int] = mapped_column(Integer, default=0)
    processed_files: Mapped[int] = mapped_column(Integer, default=0)
    imported_files: Mapped[int] = mapped_column(Integer, default=0)
    failed_files: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class ImportJobItem(Base):
    __tablename__ = "import_job_items"
    __table_args__ = (
        UniqueConstraint("job_id", "relative_path", name="uq_job_file_path"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[str] = mapped_column(
        ForeignKey("import_jobs.id", ondelete="CASCADE"),
        index=True,
    )
    relative_path: Mapped[str] = mapped_column(String(1024))
    storage_path: Mapped[str] = mapped_column(String(2048))
    media_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
