# Runbook: Princess Bhadrakitiyabha Blessing Site

Last checked: 2026-06-13, Asia/Bangkok

## Current State

This project is now a single-machine condolence signing site backed by `SQLite`.
The browser talks to the local backend at `/api/*`, and the backend serves the static site from the same container.

## What Changed

- Removed Google Sheets / Google Apps Script flow
- Removed the SharePoint example folder
- Added `FastAPI` backend in `api/index.py`
- Added `SQLite` database storage
- Added protected export endpoints for CSV/XLSX
- Added a hidden admin page at `/admin`

## Runtime Layout

```text
Browser -> FastAPI -> SQLite
```

## Required Files

- `index.html`
- `css/style.css`
- `js/app.js`
- `api/index.py`
- `Dockerfile`
- `docker-compose.yml`
- `.env`

## Environment Variables

```env
ADMIN_CODE=change-me
DB_PATH=data/signatures.db
EXPORT_BASENAME=20260612-Bhadrakitiyabha-Blessing
APP_TITLE=ร่วมลงนามถวายความอาลัย
```

## Startup

```bash
docker compose up --build
```

Then open:

```text
http://161.200.145.18:8000
```

## Admin Export

Open:

```text
http://161.200.145.18:8000/admin
```

Use the fixed admin code to export:

- CSV
- XLSX
- JSON summary

## Database Notes

- SQLite is enough for a few thousand records and even around `10,000` rows in this usage pattern
- The real bottleneck is concurrent writes, not row count
- If WAL mode is active, back up the database with the `-wal` and `-shm` files too, or use the export endpoint

## Endpoints

- `GET /api/health`
- `GET /api/signatures`
- `POST /api/signatures`
- `GET /api/admin/summary?code=...`
- `GET /api/admin/export.csv?code=...`
- `GET /api/admin/export.xlsx?code=...`

