/**
 * สมุดลงนามถวายความอาลัย — ฝั่งฐานข้อมูล Google Sheets
 *
 * วิธีติดตั้ง (ทำครั้งเดียว ประมาณ 5 นาที):
 * 1. สร้าง Google Sheet ใหม่ ตั้งชื่อชีต (แท็บล่าง) ว่า  entries
 *    และใส่หัวตารางแถวแรก 3 ช่อง:  at | name | phrase
 * 2. เมนู Extensions → Apps Script → ลบโค้ดเดิม วางไฟล์นี้ลงไป → Save
 * 3. กด Deploy → New deployment → ประเภท Web app
 *      - Execute as:        Me
 *      - Who has access:    Anyone
 *    กด Deploy แล้วคัดลอก "Web app URL" (ลงท้าย /exec)
 * 4. นำ URL ไปวางในตัวแปร API_URL ที่ไฟล์ js/app.js ของเว็บ
 *
 * ข้อมูลทุกรายการจะปรากฏใน Google Sheet ทันที เปิดดู/ลบแถวที่ไม่เหมาะสม/
 * ดาวน์โหลดเป็น Excel (.xlsx) ได้จากเมนู File → Download
 */

const SHEET_NAME = "entries";

// อ่านรายนามทั้งหมด (ใหม่ → เก่า)
function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const entries = rows
    .slice(1) // ข้ามหัวตาราง
    .filter((r) => r[1] && r[2])
    .map((r) => ({ at: Number(r[0]), name: String(r[1]), phrase: String(r[2]) }))
    .sort((a, b) => b.at - a.at);
  return ContentService
    .createTextOutput(JSON.stringify(entries))
    .setMimeType(ContentService.MimeType.JSON);
}

// บันทึกรายการลงนามใหม่
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // กันเขียนชนกันเมื่อมีผู้ลงนามพร้อมกัน
  try {
    const data = JSON.parse(e.postData.contents);
    const name = String(data.name || "").trim().slice(0, 120);
    const phrase = String(data.phrase || "").trim().slice(0, 300);
    if (!name || !phrase) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "missing fields" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    sheet.appendRow([Date.now(), name, phrase]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
