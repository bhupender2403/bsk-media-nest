from PIL import Image

from app.worker import create_thumbnail, file_md5, media_kind


def test_file_md5(tmp_path) -> None:
    file_path = tmp_path / "sample.jpg"
    file_path.write_bytes(b"same content")

    assert file_md5(file_path) == "793953ee398d864ec40252df9554c3e6"


def test_media_kind() -> None:
    assert media_kind("image/jpeg") == "image"
    assert media_kind("video/mp4") == "video"
    assert media_kind("application/pdf") == "other"


def test_create_thumbnail_uses_git_style_md5_path(tmp_path, monkeypatch) -> None:
    source = tmp_path / "source.png"
    Image.new("RGB", (1200, 600), "red").save(source)
    digest = file_md5(source)
    thumbnail_root = tmp_path / "data" / "thumbnails"
    monkeypatch.setattr("app.worker.THUMBNAIL_DIR", thumbnail_root)

    result = create_thumbnail(source, digest)

    assert result == thumbnail_root / digest[:2] / f"{digest[2:]}.jpg"
    assert result.is_file()
    with Image.open(result) as thumbnail:
        assert thumbnail.format == "JPEG"
        assert thumbnail.width <= 480
        assert thumbnail.height <= 480
