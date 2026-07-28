from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ImageFolder(Base):
    __tablename__ = "image_folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    normalized_name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
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
