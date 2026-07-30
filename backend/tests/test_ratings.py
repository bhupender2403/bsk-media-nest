from datetime import UTC, datetime

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database import Base
from app.main import (
    list_folder_files,
    list_folders,
    remove_folder,
    set_file_rating,
)
from app.models import FileRecord, ImageFolder, PhotoRating, UniqueFile
from app.schemas import RatingUpdate


def test_rating_is_stored_by_md5() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        unique_file = UniqueFile(
            md5="a" * 32,
            size=10,
            media_type="image/jpeg",
            media_kind="image",
            created_at=datetime.now(UTC),
        )
        folder = ImageFolder(
            name="Photos",
            normalized_name="photos",
            source_path="/tmp/photos",
            created_at=datetime.now(UTC),
        )
        db.add_all([unique_file, folder])
        db.flush()
        record = FileRecord(
            folder_id=folder.id,
            unique_md5=unique_file.md5,
            relative_path="photo.jpg",
            storage_path="/tmp/photos/photo.jpg",
            media_type="image/jpeg",
            media_kind="image",
            size=10,
            imported_at=datetime.now(UTC),
        )
        db.add(record)
        db.commit()

        result = set_file_rating(record.id, RatingUpdate(rating=4), db)
        summary = list_folder_files(folder.id, db)[0]

        assert result.rating == 4
        assert result.md5 == unique_file.md5
        assert db.get(PhotoRating, unique_file.md5).rating == 4
        assert summary.content_url == (
            f"/api/files/{record.id}/content?v={unique_file.md5}"
        )
        assert summary.thumbnail_url == (
            f"/api/files/{record.id}/thumbnail?v={unique_file.md5}"
        )


def test_folder_summary_counts_media_and_unrated_images() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        folder = ImageFolder(
            name="Mixed media",
            normalized_name="mixed media",
            source_path="/tmp/mixed-media",
            created_at=datetime.now(UTC),
        )
        files = [
            UniqueFile(
                md5=character * 32,
                size=10,
                media_type=media_type,
                media_kind=media_kind,
                created_at=datetime.now(UTC),
            )
            for character, media_type, media_kind in [
                ("a", "image/jpeg", "image"),
                ("b", "image/png", "image"),
                ("c", "video/mp4", "video"),
            ]
        ]
        db.add_all([folder, *files])
        db.flush()
        db.add_all(
            [
                FileRecord(
                    folder_id=folder.id,
                    unique_md5=file.md5,
                    relative_path=f"{index}.{file.media_type.split('/')[1]}",
                    storage_path=f"/tmp/mixed-media/{index}",
                    media_type=file.media_type,
                    media_kind=file.media_kind,
                    size=file.size,
                    imported_at=datetime.now(UTC),
                )
                for index, file in enumerate(files)
            ]
        )
        db.add(
            PhotoRating(
                md5=files[0].md5,
                rating=5,
                updated_at=datetime.now(UTC),
            )
        )
        db.commit()

        summaries = list_folders(db)

        assert len(summaries) == 1
        assert summaries[0].image_count == 2
        assert summaries[0].movie_count == 1
        assert summaries[0].pending_rating_count == 2

        movie = db.scalar(
            select(FileRecord).where(FileRecord.media_kind == "video")
        )
        result = set_file_rating(movie.id, RatingUpdate(rating=3), db)
        updated_summary = list_folders(db)[0]

        assert result.rating == 3
        assert result.md5 == movie.unique_md5
        assert updated_summary.pending_rating_count == 1


def test_remove_folder_keeps_md5_rating_and_original_content_metadata() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        unique_file = UniqueFile(
            md5="d" * 32,
            size=10,
            media_type="image/jpeg",
            media_kind="image",
            created_at=datetime.now(UTC),
        )
        folder = ImageFolder(
            name="Removable",
            normalized_name="removable",
            source_path="/tmp/removable",
            created_at=datetime.now(UTC),
        )
        db.add_all([unique_file, folder])
        db.flush()
        record = FileRecord(
            folder_id=folder.id,
            unique_md5=unique_file.md5,
            relative_path="photo.jpg",
            storage_path="/tmp/removable/photo.jpg",
            media_type="image/jpeg",
            media_kind="image",
            size=10,
            imported_at=datetime.now(UTC),
        )
        rating = PhotoRating(
            md5=unique_file.md5,
            rating=5,
            updated_at=datetime.now(UTC),
        )
        db.add_all([record, rating])
        db.commit()
        folder_id = folder.id

        response = remove_folder(folder_id, db)

        assert response.status_code == 204
        assert db.get(ImageFolder, folder_id) is None
        assert db.query(FileRecord).count() == 0
        assert db.get(UniqueFile, unique_file.md5) is not None
        assert db.get(PhotoRating, unique_file.md5).rating == 5
