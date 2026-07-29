from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.database import SessionLocal, initialize_schema
from app.models import (
    FileRecord,
    ImageFile,
    ImageFolder,
    ImportJob,
    ImportJobItem,
    PhotoRating,
    UniqueFile,
)


def clear_database(db: Session) -> None:
    active_jobs = db.query(ImportJob).filter(
        ImportJob.status.in_(["pending", "processing"])
    )
    if active_jobs.first() is not None:
        raise RuntimeError("Cannot clear the database while an import is active.")

    for model in [
        PhotoRating,
        FileRecord,
        ImportJobItem,
        ImportJob,
        ImageFile,
        ImageFolder,
        UniqueFile,
    ]:
        db.execute(delete(model))
    db.commit()


def main() -> None:
    initialize_schema()
    with SessionLocal() as db:
        clear_database(db)
    print("Database cleared.")


if __name__ == "__main__":
    main()
