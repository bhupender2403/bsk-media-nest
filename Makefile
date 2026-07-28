.PHONY: dev up down build logs test

dev:
	docker compose -f compose.yaml -f compose.dev.yaml up --build

up:
	docker compose up --build -d

down:
	docker compose -f compose.yaml -f compose.dev.yaml down

build:
	docker compose build

logs:
	docker compose logs -f

test:
	docker compose run --rm --user root backend sh -c "pip install --no-cache-dir -r requirements-dev.txt && python -m pytest"
