.PHONY: dev desktop desktop-services desktop-build-assets restart stop db-clear backend frontend test

dev:
	@cleanup() { \
		trap - INT TERM EXIT; \
		kill "$$backend_pid" "$$frontend_pid" 2>/dev/null || true; \
		wait "$$backend_pid" "$$frontend_pid" 2>/dev/null || true; \
	}; \
	trap cleanup INT TERM EXIT; \
	(cd backend && exec .venv/bin/uvicorn app.main:app --reload --port 8000) & backend_pid=$$!; \
	(cd frontend && exec npm run dev) & frontend_pid=$$!; \
	wait

desktop:
	cd frontend && npm run desktop

desktop-services:
	@cleanup() { \
		trap - INT TERM EXIT; \
		kill "$$backend_pid" "$$frontend_pid" 2>/dev/null || true; \
		wait "$$backend_pid" "$$frontend_pid" 2>/dev/null || true; \
	}; \
	trap cleanup INT TERM EXIT; \
	(cd backend && exec .venv/bin/uvicorn app.main:app --reload --port 8765) & backend_pid=$$!; \
	(cd frontend && exec npm run dev) & frontend_pid=$$!; \
	wait

desktop-build-assets:
	cd backend && .venv/bin/python build_desktop.py
	cd frontend && npm run build

restart: dev

stop:
	@echo "Development services run in the foreground; press Ctrl+C in their terminal."

db-clear:
	@printf "Delete the local BSK Media Nest database? [y/N] "; \
	read answer; \
	case "$$answer" in \
		y|Y|yes|YES) \
			rm -f backend/.data/bsk-media-nest.db \
				backend/.data/bsk-media-nest.db-shm \
				backend/.data/bsk-media-nest.db-wal; \
			echo "Database cleared." ;; \
		*) echo "Database clear cancelled." ;; \
	esac

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && .venv/bin/python -m pytest
	cd frontend && npm run lint
	cd frontend && npm run build
