# BSK Media Nest

A desktop-first local media catalog built with Tauri, React, FastAPI, and
SQLite.

Media files stay in their original folders. The application stores paths,
content hashes, and metadata in a local SQLite database; it does not upload or
copy media.

## Requirements

- Python 3.12+
- Node.js 22+
- Rust, installed through [rustup](https://rustup.rs/), for the desktop shell
- Tauri's operating-system prerequisites

Docker and PostgreSQL are no longer required.

## First-time setup

Create an optional local environment file:

```bash
cp .env.example .env
```

Install the Python dependencies:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cd ..
```

Install the frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

On Windows, activate Python with:

```powershell
backend\.venv\Scripts\Activate.ps1
```

## Run the desktop application

Start Tauri, React, and FastAPI together:

```bash
make desktop
```

The desktop window has a native **Choose folder** button. Selecting a folder
immediately creates an import job. FastAPI's integrated background worker
indexes its image, video, and audio files without copying them.

During desktop development, SQLite is stored at:

```text
backend/.data/bsk-media-nest.db
```

Packaged applications store it in the operating system's application-data
directory.

## Run in a browser

The browser version remains available:

```bash
make dev
```

Open <http://localhost:5173>. API documentation is available at
<http://localhost:8000/docs>.

The browser cannot reveal an absolute folder path itself. For local
development, the **Choose folder** button asks FastAPI to open the operating
system's folder dialog and return the selection. The manual path field remains
available as a fallback. This helper only works when FastAPI runs on the same
desktop as the browser.

Press `Ctrl+C` to stop the development services.

## Build an installer

Build the Python sidecar, React frontend, and platform-native Tauri package:

```bash
cd frontend
npm run desktop:build
```

Desktop builds are platform-specific. Build on macOS for `.app`/`.dmg`,
Windows for `.exe`/`.msi`, and Linux for the configured Linux package formats.
Signing and notarization credentials are still required for public
distribution.

## Import model

The schema separates a file's location from its content:

- `file_records` contains one row per folder-relative location.
- `unique_files` contains one row per MD5.
- `import_jobs` and `import_job_items` track asynchronous progress.

Identical files in two locations produce two `file_records` rows referencing
one `unique_files` row. Photo ratings are stored in `photo_ratings` by MD5, so
every location containing the same photo shows the same 1–5 star rating.

## Useful commands

```bash
make desktop   # native desktop development
make dev       # browser development
make test      # backend tests, frontend lint, and frontend build
make db-clear  # permanently clear the local SQLite database after confirmation
```

## Project layout

```text
backend/app/                 FastAPI API, SQLite models, and import worker
backend/desktop_entry.py     Entry point bundled as the desktop API sidecar
backend/build_desktop.py     PyInstaller sidecar build
backend/tests/               Python tests
frontend/src/                React media browser
frontend/src-tauri/          Tauri desktop shell, permissions, and icons
```
