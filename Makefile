.PHONY: dev restart stop db-up db-down db-clear db-logs backend worker frontend test

dev: db-up
	@cleanup() { \
		trap - INT TERM EXIT; \
		kill "$$backend_pid" "$$worker_pid" "$$frontend_pid" 2>/dev/null || true; \
		wait "$$backend_pid" "$$worker_pid" "$$frontend_pid" 2>/dev/null || true; \
	}; \
	trap cleanup INT TERM EXIT; \
	(cd backend && exec .venv/bin/uvicorn app.main:app --reload --port 8000) & backend_pid=$$!; \
	(cd backend && exec .venv/bin/python -m app.worker) & worker_pid=$$!; \
	(cd frontend && exec npm run dev) & frontend_pid=$$!; \
	wait

restart: stop
	@$(MAKE) dev

stop: db-down

db-up:
	docker compose up -d db

db-down:
	docker compose down

db-clear:
	@printf "Delete all PostgreSQL data for this project? [y/N] "; \
	read answer; \
	case "$$answer" in \
		y|Y|yes|YES) docker compose down --volumes ;; \
		*) echo "Database clear cancelled." ;; \
	esac

db-logs:
	docker compose logs -f db

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

worker:
	cd backend && .venv/bin/python -m app.worker

frontend:
	cd frontend && npm run dev

test:
	cd backend && .venv/bin/python -m pytest
