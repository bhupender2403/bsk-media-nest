import os
from collections.abc import Generator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / ".data"
DATA_DIR = Path(os.getenv("BSK_DATA_DIR", DEFAULT_DATA_DIR)).expanduser().resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
THUMBNAIL_DIR = DATA_DIR / "thumbnails"
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.getenv(
    "BSK_DATABASE_URL",
    f"sqlite:///{DATA_DIR / 'bsk-media-nest.db'}",
)

engine_options: dict[str, object] = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite:"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session


def initialize_schema() -> None:
    Base.metadata.create_all(bind=engine)
