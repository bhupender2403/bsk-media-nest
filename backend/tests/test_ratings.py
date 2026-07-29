from datetime import UTC, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.main import set_file_rating
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

        assert result.rating == 4
        assert result.md5 == unique_file.md5
        assert db.get(PhotoRating, unique_file.md5).rating == 4
