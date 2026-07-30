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
indexes its image, video, and audio files without copying them. It also creates
small JPEG previews for images so gallery and thumbnail-strip views load
quickly.

During desktop development, SQLite is stored at:

```text
backend/.data/bsk-media-nest.db
```

Generated previews are stored under `backend/.data/thumbnails`. Their paths use
the image MD5 in a Git-style layout, for example an MD5 beginning with `ab`
is stored as `thumbnails/ab/<remaining-md5>.jpg`.

Packaged applications store it in the operating system's application-data
directory.

## Run in a browser

The browser version remains available:

```bash
make dev
```

Open <http://localhost:5173>. API documentation is available at
<http://localhost:8000/docs>.

To keep the database and thumbnail cache somewhere else, configure the backend
data root when starting the services:

```bash
make dev BSK_DATA_DIR=/absolute/path/to/bsk-media-data
```

The backend creates the data root and its `thumbnails` directory automatically.

The browser cannot reveal an absolute folder path itself. For local
development, the **Choose folder** button asks FastAPI to open the operating
system's folder dialog and return the selection. This helper only works when
FastAPI runs on the same desktop as the browser.

Removing a folder from the sidebar deletes its catalog, location, and import
job records. Original media files are never deleted, and MD5 ratings are kept
so they return if the same content is imported again.

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
one `unique_files` row. Image and movie ratings are stored in `photo_ratings`
by MD5, so every location containing the same media shows the same 1–5 star
rating. Image grids and the slideshow's lower strip use generated thumbnails;
the selected slideshow image uses the original full-resolution file.

## Useful commands

```bash
make desktop   # native desktop development
make dev       # browser development
make test      # backend tests, frontend lint, and frontend build
make db-clear  # permanently clear the local SQLite database after confirmation
```

Stop `make dev` or `make desktop` with `Ctrl+C` before running
`make db-clear`.

## Project layout

```text
backend/app/                 FastAPI API, SQLite models, and import worker
backend/desktop_entry.py     Entry point bundled as the desktop API sidecar
backend/build_desktop.py     PyInstaller sidecar build
backend/tests/               Python tests
frontend/src/                React media browser
frontend/src-tauri/          Tauri desktop shell, permissions, and icons
```
