from datetime import UTC, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.clear_database import clear_database
from app.database import Base
from app.models import ImageFolder, UniqueFile


def test_clear_database_removes_catalog_data() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        db.add(
            ImageFolder(
                name="Photos",
                normalized_name="photos",
                source_path="/tmp/photos",
                created_at=datetime.now(UTC),
            )
        )
        db.add(
            UniqueFile(
                md5="a" * 32,
                size=10,
                media_type="image/jpeg",
                media_kind="image",
                created_at=datetime.now(UTC),
            )
        )
        db.commit()

        clear_database(db)

        assert db.query(ImageFolder).count() == 0
        assert db.query(UniqueFile).count() == 0
