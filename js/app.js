/* ============================================================
   สมุดลงนามถวายความอาลัย
   ขณะนี้เก็บข้อมูลใน localStorage (ต้นแบบ)
   ภายหลังเปลี่ยนเฉพาะ loadEntries() / saveEntry()
   ให้เรียก API (Vercel → SharePoint Excel) ได้ทันที
   ============================================================ */

// ถ้อยคำมาตรฐาน ๘ แบบ ตามประกาศสำนักงานราชบัณฑิตยสภา
const PHRASES = [
  "เสด็จสู่แดนสรวง\nไทยทั้งปวงน้อมสำนึกในพระกรุณาธิคุณตราบนิรันดร์",
  "สถิตในใจปวงประชาตราบนิรันดร์\nด้วยสำนึกในพระกรุณาธิคุณเป็นล้นพ้น",
  "สถิตในใจไทยนิรันดร์\nน้อมสำนึกในพระกรุณาธิคุณเป็นล้นพ้น",
  "ผองไทยน้อมสำนึกในพระกรุณาธิคุณตราบนิจนิรันดร์",
  "ผองพสกนิกรน้อมสำนึกในพระกรุณาธิคุณตราบนิจนิรันดร์",
  "น้อมสำนึกในพระกรุณาธิคุณตราบนิรันดร์",
  "พระกรุณาธิคุณจารึกในใจไทยตราบนิจนิรันดร์",
  "สถิตกลางใจปวงประชา\nด้วยสำนึกในพระกรุณาธิคุณตราบนิจนิรันดร์",
];

const PAGE_SIZE = 5;
const STORAGE_KEY = "condolence-entries-v1";

// ============================================================
// ตั้งค่าฐานข้อมูล: วาง URL ของ Google Apps Script (Web App)
// ที่ deploy แล้วลงในบรรทัดล่างนี้ → ข้อมูลจะถูกบันทึกลง Google Sheets
// ปล่อยว่าง ("") = โหมดทดลอง เก็บในเครื่องผู้ใช้ (localStorage)
// วิธีตั้งค่าดูใน apps-script/README หรือไฟล์ README.md
// ============================================================
const API_URL = "";

// ---------- ชั้นข้อมูล ----------

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || seedEntries();
  } catch {
    return seedEntries();
  }
}

function persistEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

async function loadEntries() {
  if (API_URL) {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
    return await res.json(); // เซิร์ฟเวอร์เรียงใหม่→เก่าให้แล้ว
  }
  return loadLocal();
}

async function saveEntry(entry) {
  if (API_URL) {
    // ส่งแบบ text/plain เพื่อเลี่ยง CORS preflight ของ Apps Script
    const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(entry) });
    if (!res.ok) throw new Error("บันทึกไม่สำเร็จ");
    return await loadEntries();
  }
  const entries = loadLocal();
  entries.unshift(entry); // รายการใหม่อยู่บนสุด
  persistEntries(entries);
  return entries;
}

// ข้อมูลตัวอย่างเริ่มต้น เพื่อให้เห็นหน้าตาสมุดลงนาม
function seedEntries() {
  const base = Date.parse("2026-06-12T08:09:00+07:00");
  const seeds = [
    { phraseIndex: 1, name: "ผู้อำนวยการ ผู้บริหาร และบุคลากร สำนักงานวิทยทรัพยากร จุฬาลงกรณ์มหาวิทยาลัย", at: base },
    { phraseIndex: 0, name: "คณะผู้บริหารและพนักงาน บริษัทตัวอย่าง จำกัด", at: base - 9 * 60000 },
    { phraseIndex: 6, name: "นางสาวภักดี มีคุณธรรม", at: base - 17 * 60000 },
    { phraseIndex: 7, name: "คณะครูและนักเรียน โรงเรียนตัวอย่างวิทยา", at: base - 26 * 60000 },
    { phraseIndex: 3, name: "นายจงรัก รักษ์สัตย์", at: base - 41 * 60000 },
    { phraseIndex: 5, name: "ชมรมนิสิตเก่าตัวอย่าง", at: base - 58 * 60000 },
  ];
  const entries = seeds.map((s) => ({
    phrase: PHRASES[s.phraseIndex],
    name: s.name,
    at: s.at,
  }));
  persistEntries(entries);
  return entries;
}

// ---------- เครื่องมือแสดงผล ----------

const THAI_DIGITS = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function toThaiDigits(value) {
  return String(value).replace(/\d/g, (d) => THAI_DIGITS[+d]);
}

function formatThaiDateTime(ms) {
  const d = new Date(ms);
  const day = toThaiDigits(d.getDate());
  const month = THAI_MONTHS[d.getMonth()];
  const year = toThaiDigits(d.getFullYear() + 543);
  const hh = toThaiDigits(String(d.getHours()).padStart(2, "0"));
  const mm = toThaiDigits(String(d.getMinutes()).padStart(2, "0"));
  return `${day} ${month} ${year} เวลา ${hh}.${mm} น.`;
}

// ---------- สถานะหน้า ----------

let entries = [];
let currentPage = 1;
let selectedPhrase = null;
let newestHighlight = false; // เน้นรายการแรกหลังลงนามใหม่

// ---------- หน้าต่างลงนาม (Popup) ----------

const modalOverlay = document.getElementById("modalOverlay");
const openModalBtn = document.getElementById("openModalBtn");
const closeModalBtn = document.getElementById("closeModalBtn");

let modalOpenedAt = 0;     // กันคลิกซ้ำ/ดับเบิลคลิกแล้วหน้าต่างปิดเองทันที
let pressOnOverlay = false; // ปิดเฉพาะเมื่อกดลงและปล่อยบนฉากหลังจริง ๆ

function openModal() {
  modalOverlay.hidden = false;
  document.body.classList.add("modal-open");
  modalOpenedAt = Date.now();
}

function closeModal() {
  modalOverlay.hidden = true;
  document.body.classList.remove("modal-open");
  clearError();
}

openModalBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);
modalOverlay.addEventListener("pointerdown", (e) => {
  pressOnOverlay = e.target === modalOverlay;
});
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay && pressOnOverlay && Date.now() - modalOpenedAt > 350) {
    closeModal();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalOverlay.hidden) closeModal();
});

// ---------- สร้างรายการถ้อยคำให้เลือก ----------

const phraseList = document.getElementById("phraseList");

PHRASES.forEach((phrase, i) => {
  const label = document.createElement("label");
  label.className = "phrase-item";
  // ในตัวเลือกแสดงเป็นบรรทัดเดียวให้กระชับ (ตอนบันทึกยังคงรูปแบบขึ้นบรรทัดเดิม)
  const compact = phrase.replace(/\n/g, " ");
  label.innerHTML = `
    <input type="radio" name="phrase" value="${i}">
    <span class="mark"></span>
    <span class="phrase-text">${compact}</span>
  `;
  label.addEventListener("click", () => {
    selectedPhrase = phrase;
    document.querySelectorAll(".phrase-item").forEach((el) => el.classList.remove("selected"));
    label.classList.add("selected");
    clearError();
  });
  phraseList.appendChild(label);
});

// ---------- ฟอร์มลงนาม ----------

const nameInput = document.getElementById("nameInput");
const submitBtn = document.getElementById("submitBtn");
const formError = document.getElementById("formError");

function showError(msg) { formError.textContent = msg; }
function clearError() { formError.textContent = ""; }

async function submitEntry() {
  const name = nameInput.value.trim();
  if (!selectedPhrase) {
    showError("โปรดเลือกถ้อยคำแสดงความอาลัย");
    return;
  }
  if (!name) {
    showError("โปรดระบุชื่อบุคคล คณะบุคคล หรือหน่วยงาน");
    nameInput.focus();
    return;
  }

  submitBtn.disabled = true;
  try {
    entries = await saveEntry({ phrase: selectedPhrase, name, at: Date.now() });
  } catch {
    showError("ขัดข้องในการบันทึก โปรดลองอีกครั้ง");
    submitBtn.disabled = false;
    return;
  }
  submitBtn.disabled = false;

  // ล้างฟอร์ม ปิดหน้าต่าง กลับไปหน้าแรก และเน้นรายการใหม่
  nameInput.value = "";
  selectedPhrase = null;
  document.querySelectorAll(".phrase-item").forEach((el) => el.classList.remove("selected"));
  closeModal();

  currentPage = 1;
  newestHighlight = true;
  render();
  document.getElementById("book-title").scrollIntoView({ behavior: "smooth", block: "start" });
}

submitBtn.addEventListener("click", submitEntry);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitEntry();
});

// ---------- แสดงสมุดลงนาม + แบ่งหน้า ----------

const entryList = document.getElementById("entryList");
const pagination = document.getElementById("pagination");
const bookCount = document.getElementById("bookCount");

function render() {
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);

  bookCount.textContent = `ผู้ร่วมลงนามทั้งสิ้น ${toThaiDigits(entries.length)} รายนาม`;

  // รายการของหน้าปัจจุบัน
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(start, start + PAGE_SIZE);

  entryList.innerHTML = "";
  pageEntries.forEach((entry, i) => {
    const li = document.createElement("li");
    li.className = "entry";
    if (newestHighlight && currentPage === 1 && i === 0) li.classList.add("entry-new");
    const phraseEl = document.createElement("p");
    phraseEl.className = "entry-phrase";
    phraseEl.textContent = entry.phrase;
    const nameEl = document.createElement("p");
    nameEl.className = "entry-name";
    nameEl.textContent = entry.name;
    const timeEl = document.createElement("p");
    timeEl.className = "entry-time";
    timeEl.textContent = formatThaiDateTime(entry.at);
    li.append(phraseEl, nameEl, timeEl);
    entryList.appendChild(li);
  });
  newestHighlight = false;

  // ปุ่มแบ่งหน้า
  pagination.innerHTML = "";
  if (totalPages <= 1) return;

  const makeBtn = (labelText, page, opts = {}) => {
    const btn = document.createElement("button");
    btn.className = "page-btn" + (opts.active ? " active" : "");
    btn.textContent = labelText;
    btn.disabled = !!opts.disabled;
    if (!opts.disabled && !opts.active) {
      btn.addEventListener("click", () => {
        currentPage = page;
        render();
        document.getElementById("book-title").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    return btn;
  };

  pagination.appendChild(makeBtn("ก่อนหน้า", currentPage - 1, { disabled: currentPage === 1 }));
  for (let p = 1; p <= totalPages; p++) {
    pagination.appendChild(makeBtn(toThaiDigits(p), p, { active: p === currentPage }));
  }
  pagination.appendChild(makeBtn("ถัดไป", currentPage + 1, { disabled: currentPage === totalPages }));
}

// ---------- เริ่มต้น ----------

(async () => {
  bookCount.textContent = "กำลังโหลดรายนาม...";
  try {
    entries = await loadEntries();
  } catch {
    bookCount.textContent = "ไม่สามารถโหลดรายนามได้ โปรดลองใหม่ภายหลัง";
    return;
  }
  render();
})();
