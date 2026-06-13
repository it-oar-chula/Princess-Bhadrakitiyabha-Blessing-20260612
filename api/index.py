from __future__ import annotations

import csv
import io
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from textwrap import dedent
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
DB_PATH_RAW = os.getenv("DB_PATH", str(ROOT / "data" / "signatures.db"))
DB_PATH = Path(DB_PATH_RAW)
if not DB_PATH.is_absolute():
    DB_PATH = (ROOT / DB_PATH).resolve()
else:
    DB_PATH = DB_PATH.resolve()

ADMIN_CODE = os.getenv("ADMIN_CODE", "change-me")
APP_TITLE = os.getenv("APP_TITLE", "ร่วมลงนามถวายความอาลัย")
EXPORT_BASENAME = os.getenv("EXPORT_BASENAME", "20260612-Bhadrakitiyabha-Blessing")
BANGKOK_TZ = timezone(timedelta(hours=7))

PHRASES = [
    "เสด็จสู่แดนสรวง\nไทยทั้งปวงน้อมสำนึกในพระกรุณาธิคุณตราบนิรันดร์",
    "สถิตในใจปวงประชาตราบนิรันดร์\nด้วยสำนึกในพระกรุณาธิคุณเป็นล้นพ้น",
    "สถิตในใจไทยนิรันดร์\nน้อมสำนึกในพระกรุณาธิคุณเป็นล้นพ้น",
    "ผองไทยน้อมสำนึกในพระกรุณาธิคุณตราบนิจนิรันดร์",
    "ผองพสกนิกรน้อมสำนึกในพระกรุณาธิคุณตราบนิจนิรันดร์",
    "น้อมสำนึกในพระกรุณาธิคุณตราบนิรันดร์",
    "พระกรุณาธิคุณจารึกในใจไทยตราบนิจนิรันดร์",
    "สถิตกลางใจปวงประชา\nด้วยสำนึกในพระกรุณาธิคุณตราบนิรันดร์",
]

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at_ms INTEGER NOT NULL,
    submitted_at TEXT NOT NULL,
    name TEXT NOT NULL,
    phrase_index INTEGER NOT NULL,
    phrase TEXT NOT NULL
)
"""

# ย้ายข้อมูลจาก schema เดิม (id แบบ UUID + คอลัมน์ status/note) มาเป็น id เลขรัน 1,2,3...
MIGRATE_SQL = """
CREATE TABLE signatures_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at_ms INTEGER NOT NULL,
    submitted_at TEXT NOT NULL,
    name TEXT NOT NULL,
    phrase_index INTEGER NOT NULL,
    phrase TEXT NOT NULL
);
INSERT INTO signatures_new (created_at_ms, submitted_at, name, phrase_index, phrase)
    SELECT created_at_ms, submitted_at, name, phrase_index, phrase
    FROM signatures
    ORDER BY created_at_ms ASC, rowid ASC;
DROP TABLE signatures;
ALTER TABLE signatures_new RENAME TO signatures;
"""

app = FastAPI(title=APP_TITLE)


class SignatureCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phrase_index: Optional[int] = Field(default=None, ge=0, le=len(PHRASES) - 1)
    phrase: Optional[str] = Field(default=None, max_length=300)


def now_bangkok() -> datetime:
    return datetime.now(BANGKOK_TZ)


def normalize_text(value: str) -> str:
    return " ".join(str(value).split()).strip()


def ensure_database() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH, timeout=10) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.execute(CREATE_TABLE_SQL)

        # ถ้าเป็น schema เดิม (มีคอลัมน์ status/note) ให้ย้ายข้อมูลมา schema ใหม่ + ออกเลขรันใหม่
        columns = [row[1] for row in conn.execute("PRAGMA table_info(signatures)").fetchall()]
        if "status" in columns or "note" in columns:
            conn.executescript(MIGRATE_SQL)

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_signatures_created_at_ms "
            "ON signatures(created_at_ms DESC)"
        )
        conn.commit()


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn


def row_to_entry(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "at": row["created_at_ms"],
        "submitted_at": row["submitted_at"],
        "name": row["name"],
        "phrase_index": row["phrase_index"],
        "phrase": row["phrase"],
    }


def resolve_phrase(payload: SignatureCreate) -> tuple[int, str]:
    if payload.phrase_index is not None:
        return payload.phrase_index, PHRASES[payload.phrase_index]

    if payload.phrase:
        normalized = payload.phrase.replace("\r\n", "\n").strip()
        if normalized in PHRASES:
            return PHRASES.index(normalized), normalized

    raise HTTPException(status_code=400, detail="phrase_index is required")


def fetch_entries(order: str = "DESC") -> list[dict]:
    if order not in {"ASC", "DESC"}:
        raise ValueError("order must be ASC or DESC")

    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT id, created_at_ms, submitted_at, name, phrase_index, phrase
            FROM signatures
            ORDER BY created_at_ms {order}, id {order}
            """
        ).fetchall()
    return [row_to_entry(row) for row in rows]


def fetch_summary() -> dict:
    with get_connection() as conn:
        total = conn.execute("SELECT COUNT(*) AS count FROM signatures").fetchone()["count"]
        phrase_rows = conn.execute(
            """
            SELECT phrase_index, COUNT(*) AS count
            FROM signatures
            GROUP BY phrase_index
            """
        ).fetchall()

    counts = {row["phrase_index"]: row["count"] for row in phrase_rows}
    phrases = [
        {
            "phrase_index": index,
            "phrase": phrase,
            "count": int(counts.get(index, 0)),
        }
        for index, phrase in enumerate(PHRASES)
    ]
    return {"total": int(total), "phrases": phrases}


def summary_from_entries(entries: list[dict]) -> dict:
    counts = {index: 0 for index in range(len(PHRASES))}
    for entry in entries:
        phrase_index = entry.get("phrase_index")
        if isinstance(phrase_index, int) and phrase_index in counts:
            counts[phrase_index] += 1

    phrases = [
        {
            "phrase_index": index,
            "phrase": phrase,
            "count": counts[index],
        }
        for index, phrase in enumerate(PHRASES)
    ]
    return {"total": len(entries), "phrases": phrases}


def require_admin(code: Optional[str]) -> None:
    if not code or not secrets.compare_digest(code, ADMIN_CODE):
        raise HTTPException(status_code=401, detail="Invalid admin code")


EXPORT_HEADERS = ["id", "submitted_at", "name", "phrase_index", "phrase"]


def entry_to_row(entry: dict) -> list[object]:
    return [
        entry["id"],
        entry["submitted_at"],
        entry["name"],
        entry["phrase_index"],
        entry["phrase"],
    ]


def build_csv_bytes(entries: list[dict]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(EXPORT_HEADERS)
    for entry in entries:
        writer.writerow(entry_to_row(entry))
    return buffer.getvalue().encode("utf-8-sig")


def set_sheet_widths(worksheet, rows: list[list[object]], headers: list[str]) -> None:
    widths = [len(str(header)) for header in headers]
    for row in rows:
        for index, value in enumerate(row):
            widths[index] = max(widths[index], len(str(value)))

    for index, width in enumerate(widths, start=1):
        worksheet.column_dimensions[get_column_letter(index)].width = min(width + 4, 48)


def build_xlsx_bytes(entries: list[dict]) -> bytes:
    summary = summary_from_entries(entries)
    workbook = Workbook()

    sheet = workbook.active
    sheet.title = "entries"
    headers = EXPORT_HEADERS
    sheet.append(headers)
    entry_rows: list[list[object]] = []
    for entry in entries:
        row = entry_to_row(entry)
        entry_rows.append(row)
        sheet.append(row)
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    set_sheet_widths(sheet, entry_rows, headers)

    summary_sheet = workbook.create_sheet("summary")
    summary_sheet.append(["total_entries", summary["total"]])
    summary_sheet.append([])
    summary_sheet.append(["phrase_index", "phrase", "count"])
    summary_rows: list[list[object]] = []
    for item in summary["phrases"]:
        row = [item["phrase_index"], item["phrase"], item["count"]]
        summary_rows.append(row)
        summary_sheet.append(row)
    summary_sheet.freeze_panes = "A3"
    set_sheet_widths(summary_sheet, summary_rows, ["phrase_index", "phrase", "count"])

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


@app.on_event("startup")
def startup() -> None:
    ensure_database()


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "online",
        "records": fetch_summary()["total"],
        "database": str(DB_PATH.name),
    }


@app.get("/api/signatures")
def list_signatures() -> list[dict]:
    return fetch_entries(order="DESC")


@app.post("/api/signatures")
def create_signature(payload: SignatureCreate) -> dict:
    name = normalize_text(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    phrase_index, phrase = resolve_phrase(payload)
    created_at = now_bangkok()
    created_at_ms = int(created_at.timestamp() * 1000)
    submitted_at = created_at.isoformat(timespec="seconds")

    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO signatures (
                created_at_ms, submitted_at, name, phrase_index, phrase
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (created_at_ms, submitted_at, name, phrase_index, phrase),
        )
        new_id = cursor.lastrowid
        conn.commit()

    entry = {
        "id": new_id,
        "at": created_at_ms,
        "submitted_at": submitted_at,
        "name": name,
        "phrase_index": phrase_index,
        "phrase": phrase,
    }

    return {"ok": True, "entry": entry}


@app.get("/api/admin/summary")
def admin_summary(code: str = Query(default="")) -> dict:
    require_admin(code)
    return fetch_summary()


@app.get("/api/admin/export.csv")
def admin_export_csv(code: str = Query(default="")) -> Response:
    require_admin(code)
    entries = fetch_entries(order="ASC")
    payload = build_csv_bytes(entries)
    filename = f"{EXPORT_BASENAME}.csv"
    return Response(
        content=payload,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/admin/export.xlsx")
def admin_export_xlsx(code: str = Query(default="")) -> Response:
    require_admin(code)
    entries = fetch_entries(order="ASC")
    payload = build_xlsx_bytes(entries)
    filename = f"{EXPORT_BASENAME}.xlsx"
    return Response(
        content=payload,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/admin", response_class=HTMLResponse)
def admin_page() -> str:
    html = dedent(
        f"""
        <!doctype html>
        <html lang="th">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>{APP_TITLE} - Admin</title>
          <style>
            :root {{
              color-scheme: dark;
              --bg: #070708;
              --panel: #121214;
              --line: #303036;
              --ink: #f3f0ea;
              --muted: #a39d93;
              --accent: #d5cdbd;
            }}
            * {{ box-sizing: border-box; }}
            body {{
              margin: 0;
              font-family: system-ui, -apple-system, Segoe UI, sans-serif;
              background:
                radial-gradient(900px 500px at 50% 0%, rgba(255,255,255,0.08), transparent 62%),
                linear-gradient(180deg, #050506 0%, #0f0f11 100%);
              color: var(--ink);
            }}
            main {{
              max-width: 760px;
              margin: 0 auto;
              padding: 32px 20px 48px;
            }}
            h1 {{
              margin: 0 0 8px;
              font-size: 1.7rem;
              font-weight: 650;
            }}
            p {{ color: var(--muted); line-height: 1.6; }}
            .panel {{
              margin-top: 24px;
              border: 1px solid var(--line);
              background: rgba(18, 18, 20, 0.96);
              border-radius: 8px;
              padding: 20px;
            }}
            label {{
              display: block;
              margin-bottom: 8px;
              color: var(--accent);
              font-size: 0.95rem;
            }}
            input {{
              width: 100%;
              padding: 12px 14px;
              border: 1px solid var(--line);
              background: #09090a;
              color: var(--ink);
              border-radius: 6px;
              font: inherit;
            }}
            .row {{
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
              margin-top: 14px;
            }}
            button {{
              padding: 12px 16px;
              border: 1px solid var(--accent);
              border-radius: 6px;
              background: var(--accent);
              color: #111;
              font: inherit;
              cursor: pointer;
            }}
            button.secondary {{
              background: transparent;
              color: var(--ink);
              border-color: var(--line);
            }}
            pre {{
              margin-top: 16px;
              padding: 16px;
              white-space: pre-wrap;
              border: 1px solid var(--line);
              background: #0b0b0c;
              border-radius: 6px;
              min-height: 88px;
            }}
            small {{
              display: block;
              margin-top: 12px;
              color: var(--muted);
            }}
          </style>
        </head>
        <body>
          <main>
            <h1>{APP_TITLE}</h1>
            <p>หน้าผู้ดูแลสำหรับโหลด CSV/XLSX และดูสรุปข้อมูลจาก SQLite</p>

            <section class="panel">
              <label for="adminCode">Admin code</label>
              <input id="adminCode" type="password" autocomplete="off" placeholder="ใส่รหัสผู้ดูแล">

              <div class="row">
                <button type="button" id="downloadCsv">Download CSV</button>
                <button type="button" id="downloadXlsx">Download XLSX</button>
                <button type="button" class="secondary" id="loadSummary">Load Summary</button>
              </div>

              <pre id="status">พร้อมใช้งาน</pre>
              <small>หน้านี้ไม่ถูกลิงก์จากหน้าแรกของเว็บ</small>
            </section>
          </main>

          <script>
            const codeInput = document.getElementById('adminCode');
            const statusEl = document.getElementById('status');
            const storageKey = 'blessing-admin-code';
            codeInput.value = localStorage.getItem(storageKey) || '';

            function getCode() {{
              return codeInput.value.trim() || localStorage.getItem(storageKey) || '';
            }}

            function requireCode() {{
              const code = getCode();
              if (!code) {{
                statusEl.textContent = 'กรุณาใส่รหัส admin';
                throw new Error('missing code');
              }}
              localStorage.setItem(storageKey, code);
              return code;
            }}

            async function download(path, filename) {{
              let code;
              try {{ code = requireCode(); }} catch (e) {{ return; }}
              statusEl.textContent = 'กำลังดาวน์โหลด...';
              try {{
                const res = await fetch(`${{path}}?code=${{encodeURIComponent(code)}}`);
                if (!res.ok) {{
                  if (res.status === 401) {{
                    statusEl.textContent = 'รหัสผ่านไม่ถูกต้อง';
                    return;
                  }}
                  let detail = 'ดาวน์โหลดไม่สำเร็จ';
                  try {{ const d = await res.json(); detail = d.detail || detail; }} catch (_e) {{}}
                  statusEl.textContent = detail;
                  return;
                }}
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                statusEl.textContent = 'ดาวน์โหลดสำเร็จ: ' + filename;
              }} catch (error) {{
                statusEl.textContent = error.message || 'เกิดข้อผิดพลาด';
              }}
            }}

            document.getElementById('downloadCsv').addEventListener('click', () => download('/api/admin/export.csv', '{EXPORT_BASENAME}.csv'));
            document.getElementById('downloadXlsx').addEventListener('click', () => download('/api/admin/export.xlsx', '{EXPORT_BASENAME}.xlsx'));
            document.getElementById('loadSummary').addEventListener('click', async () => {{
              let code;
              try {{ code = requireCode(); }} catch (e) {{ return; }}
              statusEl.textContent = 'กำลังโหลดสรุป...';
              try {{
                const res = await fetch(`/api/admin/summary?code=${{encodeURIComponent(code)}}`);
                const data = await res.json().catch(() => ({{}}));
                if (!res.ok) {{
                  statusEl.textContent = res.status === 401
                    ? 'รหัสผ่านไม่ถูกต้อง'
                    : (data.detail || 'โหลดสรุปไม่สำเร็จ');
                  return;
                }}
                statusEl.textContent = JSON.stringify(data, null, 2);
              }} catch (error) {{
                statusEl.textContent = error.message || 'เกิดข้อผิดพลาด';
              }}
            }});
          </script>
        </body>
        </html>
        """
    ).strip()
    return html


@app.get("/")
def home() -> FileResponse:
    return FileResponse(ROOT / "index.html", media_type="text/html")


app.mount("/css", StaticFiles(directory=ROOT / "css"), name="css")
app.mount("/js", StaticFiles(directory=ROOT / "js"), name="js")
app.mount("/images", StaticFiles(directory=ROOT / "images"), name="images")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api.index:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)
