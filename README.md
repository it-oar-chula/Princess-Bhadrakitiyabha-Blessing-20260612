# เว็บร่วมลงนามถวายความอาลัย

เว็บนี้ออกแบบมาให้ใช้งานบนเครื่องเดียวผ่าน Docker โดยใช้ `SQLite` เป็นฐานข้อมูลหลัก
เหมาะกับงานระยะสั้น ปริมาณข้อมูลไม่เยอะ และต้องการ export ข้อมูลออกไปทำสรุปได้ง่าย

## โครงสร้าง

```text
index.html        หน้าเว็บหลัก
css/style.css     ธีมหน้าเว็บ
js/app.js         logic ฝั่ง browser
api/index.py      FastAPI backend + SQLite + export endpoint
Dockerfile        สำหรับ build container
docker-compose.yml
data/             ไฟล์ฐานข้อมูล SQLite
```

## จุดเด่นของชุดนี้

- ไม่ใช้ Google Sheets
- ไม่ใช้ Google Apps Script
- ไม่ใช้ SharePoint
- ไม่มีปุ่ม Export บนหน้าแรก
- Export ทำผ่านหน้า `Admin` แยกต่างหาก
- ข้อมูลอยู่ใน `SQLite` ไฟล์เดียว จัดการง่าย สำรองง่าย

## Schema ฐานข้อมูล

ตาราง `signatures` เก็บข้อมูลหลักเหล่านี้:

```text
id              เลขรันอัตโนมัติ 1, 2, 3, ...
created_at_ms   เวลาที่ลงนาม (Unix ms, ใช้ภายใน)
submitted_at    เวลาที่ลงนาม (อ่านได้)
name            ชื่อผู้ลงนาม
phrase_index    หมายเลขถ้อยคำ 0-7
phrase          ข้อความถ้อยคำเต็ม
```

## วิธีรันด้วย Docker

1. สร้างไฟล์ `.env` จาก `.env.example`
2. ตั้งค่า `ADMIN_CODE`
3. รัน

```bash
docker compose up --build
```

4. เปิดเว็บที่

```text
http://<server-ip>:<port>
```

## หน้าผู้ดูแล

เปิด:

```text
http://<server-ip>:<port>/admin
```

ใส่รหัส `ADMIN_CODE` แล้วกดดาวน์โหลดได้ทันที

## Export endpoints

```text
GET /api/admin/export.csv?code=YOUR_CODE
GET /api/admin/export.xlsx?code=YOUR_CODE
GET /api/admin/summary?code=YOUR_CODE
```

## ข้อควรรู้เรื่อง SQLite

- สำหรับงานที่มีข้อมูลแค่ไม่กี่พันถึงราว `10,000` รายการ และเขียนทีละรายการ SQLite สบายมาก
- ถ้ามีหลายคนเขียนพร้อมกันหนัก ๆ ค่อยขยับไป PostgreSQL
- ถ้าเปิด `WAL` mode แล้ว สำรองฐานข้อมูลควรเอาไฟล์ `signatures.db` พร้อม `-wal` และ `-shm` ไปด้วย หรือใช้ export endpoint แทน

## ถ้าจะเพิ่มข้อมูลภายหลัง

- เพิ่มฟิลด์ moderation ได้ในตารางเดิม
- เพิ่ม summary sheet ใน XLSX ได้
- ถ้าจะเอาไปใช้ยาว ๆ ค่อยแยก backend/admin ออกเป็นโมดูลเพิ่มภายหลัง
