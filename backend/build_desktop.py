from pathlib import Path
import platform
import shutil
import sys

import PyInstaller.__main__


def rust_target_triple() -> str:
    machine = platform.machine().lower()
    architectures = {
        "amd64": "x86_64",
        "x86_64": "x86_64",
        "arm64": "aarch64",
        "aarch64": "aarch64",
    }
    architecture = architectures.get(machine)
    if architecture is None:
        raise RuntimeError(f"Unsupported desktop architecture: {machine}")

    if sys.platform == "darwin":
        platform_name = "apple-darwin"
    elif sys.platform == "win32":
        platform_name = "pc-windows-msvc"
    elif sys.platform.startswith("linux"):
        platform_name = "unknown-linux-gnu"
    else:
        raise RuntimeError(f"Unsupported desktop platform: {sys.platform}")

    return f"{architecture}-{platform_name}"


def main() -> None:
    backend_dir = Path(__file__).resolve().parent
    binaries_dir = backend_dir.parent / "frontend" / "src-tauri" / "binaries"
    build_dir = backend_dir / ".desktop-build"
    binary_name = f"bsk-media-nest-api-{rust_target_triple()}"

    binaries_dir.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(build_dir, ignore_errors=True)

    PyInstaller.__main__.run(
        [
            str(backend_dir / "desktop_entry.py"),
            "--name",
            binary_name,
            "--onefile",
            "--clean",
            "--noconfirm",
            "--distpath",
            str(binaries_dir),
            "--workpath",
            str(build_dir / "work"),
            "--specpath",
            str(build_dir),
            "--paths",
            str(backend_dir),
            "--collect-all",
            "uvicorn",
        ]
    )


if __name__ == "__main__":
    main()
