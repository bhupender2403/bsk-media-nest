# BSK Media Nest

A Docker-managed application with a FastAPI backend and a React + TypeScript
frontend.

## Requirements

- Docker Desktop (Windows/macOS) or Docker Engine with the Compose plugin (Linux)
- Git

Python and Node.js are only needed when developing without Docker.

## Start the application

```bash
cp .env.example .env
docker compose up --build
```

Open <http://localhost:8080>. The API documentation is available inside the
Docker network; during development it is exposed at <http://localhost:8000/docs>.

Stop the application with:

```bash
docker compose down
```

## Development

The development stack mounts source files into the containers and enables live
reload:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

- Frontend: <http://localhost:5173>
- Backend API docs: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/api/health>

Changes under `frontend/src` or `backend/app` reload automatically.

## Test

```bash
docker compose run --rm --user root backend sh -c \
  "pip install --no-cache-dir -r requirements-dev.txt && python -m pytest"
docker compose -f compose.yaml -f compose.dev.yaml run --rm frontend npm run lint
docker compose -f compose.yaml -f compose.dev.yaml run --rm frontend npm run build
```

## Share with other users

The most portable release is a pair of multi-platform Docker images plus the
Compose files. The included GitHub Actions workflow publishes both images to
GitHub Container Registry whenever a version tag such as `v1.0.0` is pushed.

1. Commit and push the repository.
2. Create and push a version tag:

   ```bash
   git tag v1.0.0
   git push origin main --tags
   ```

3. Make the generated GHCR packages public, or have users authenticate with
   `docker login ghcr.io`.
4. Give users `compose.yaml`, `compose.release.yaml`, and an `.env` file:

   ```dotenv
   FRONTEND_PORT=8080
   BACKEND_IMAGE=ghcr.io/bhupender2403/bsk-media-nest-backend:1.0.0
   FRONTEND_IMAGE=ghcr.io/bhupender2403/bsk-media-nest-frontend:1.0.0
   ```

5. Users start it without the source code:

   ```bash
   docker compose -f compose.yaml -f compose.release.yaml pull
   docker compose -f compose.yaml -f compose.release.yaml up -d
   ```

This works on Intel/AMD and Apple Silicon machines because the workflow builds
both `linux/amd64` and `linux/arm64` images.

If a native installer (`.exe`, `.dmg`, or Linux package) is required, add a
desktop shell such as Tauri or Electron later. A native executable still needs
a strategy for running the Python service and is more complex to sign, update,
and support than the Docker distribution.

## Project layout

```text
backend/                   FastAPI application and tests
frontend/                  React + TypeScript application and Nginx config
.github/workflows/         Multi-platform container publishing
compose.yaml               Normal/local production stack
compose.dev.yaml           Live-reload development overrides
compose.release.yaml       Published-image release overrides
```
