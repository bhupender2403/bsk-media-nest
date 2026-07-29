from app.worker import file_md5, media_kind


def test_file_md5(tmp_path) -> None:
    file_path = tmp_path / "sample.jpg"
    file_path.write_bytes(b"same content")

    assert file_md5(file_path) == "793953ee398d864ec40252df9554c3e6"


def test_media_kind() -> None:
    assert media_kind("image/jpeg") == "image"
    assert media_kind("video/mp4") == "video"
    assert media_kind("application/pdf") == "other"
