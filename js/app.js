/* ============================================================
   สมุดลงนามถวายความอาลัย
   ข้อมูลจริงมาจาก backend บนเครื่องเดียวกัน
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
  "สถิตกลางใจปวงประชา\nด้วยสำนึกในพระกรุณาธิคุณตราบนิรันดร์",
];

const PAGE_SIZE = 3;

const THAI_DIGITS = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const API = {
  signatures: "/api/signatures",
};

// ---------- เครื่องมือแปลงวันที่ ----------

function toThaiDigits(value) {
  return String(value).replace(/\d/g, (d) => THAI_DIGITS[+d]);
}

function formatThaiDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  const day = toThaiDigits(d.getDate());
  const month = THAI_MONTHS[d.getMonth()];
  const year = toThaiDigits(d.getFullYear() + 543);
  const hh = toThaiDigits(String(d.getHours()).padStart(2, "0"));
  const mm = toThaiDigits(String(d.getMinutes()).padStart(2, "0"));
  return `${day} ${month} ${year} เวลา ${hh}.${mm} น.`;
}

async function fetchJson(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.error || "ขัดข้องในการเชื่อมต่อ");
  }
  return data;
}

async function loadEntries() {
  const data = await fetchJson(API.signatures, { method: "GET" });
  return Array.isArray(data) ? data : data.entries || [];
}

async function saveEntry(entry) {
  const data = await fetchJson(API.signatures, {
    method: "POST",
    body: JSON.stringify(entry),
  });
  return data.entry || data;
}

// ---------- สถานะหน้า ----------

let entries = [];
let currentPage = 1;
let selectedPhraseIndex = null;
let newestHighlight = false;

// ---------- หน้าต่างลงนาม (Popup) ----------

const modalOverlay = document.getElementById("modalOverlay");
const openModalBtn = document.getElementById("openModalBtn");
const closeModalBtn = document.getElementById("closeModalBtn");

let modalOpenedAt = 0;
let pressOnOverlay = false;

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

// ---------- สร้างรายการถ้อยคำ ----------

const phraseList = document.getElementById("phraseList");

PHRASES.forEach((phrase, index) => {
  const label = document.createElement("label");
  label.className = "phrase-item";
  const compact = phrase.replace(/\n/g, " ");
  label.innerHTML = `
    <input type="radio" name="phrase" value="${index}">
    <span class="mark"></span>
    <span class="phrase-text">${compact}</span>
  `;
  label.addEventListener("click", () => {
    selectedPhraseIndex = index;
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

function showError(msg) {
  formError.textContent = msg;
}

function clearError() {
  formError.textContent = "";
}

async function submitEntry() {
  const name = nameInput.value.trim();
  if (selectedPhraseIndex === null) {
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
    const saved = await saveEntry({
      name,
      phrase_index: selectedPhraseIndex,
    });
    entries = [saved, ...entries];
    newestHighlight = true;
  } catch (error) {
    showError(error.message || "ขัดข้องในการบันทึก โปรดลองอีกครั้ง");
    submitBtn.disabled = false;
    return;
  }
  submitBtn.disabled = false;

  nameInput.value = "";
  selectedPhraseIndex = null;
  document.querySelectorAll(".phrase-item").forEach((el) => el.classList.remove("selected"));
  document.querySelectorAll('input[name="phrase"]').forEach((el) => {
    el.checked = false;
  });
  closeModal();

  currentPage = 1;
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

function renderEmptyState() {
  entryList.innerHTML = `
    <li class="entry entry-empty">
      ยังไม่มีรายนามในสมุดลงนาม
    </li>
  `;
  pagination.innerHTML = "";
}

function render() {
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);

  bookCount.textContent = `ผู้ร่วมลงนามทั้งสิ้น ${toThaiDigits(entries.length)} รายนาม`;

  if (entries.length === 0) {
    renderEmptyState();
    newestHighlight = false;
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(start, start + PAGE_SIZE);

  entryList.innerHTML = "";
  pageEntries.forEach((entry, index) => {
    const li = document.createElement("li");
    li.className = "entry";
    if (newestHighlight && currentPage === 1 && index === 0) {
      li.classList.add("entry-new");
    }

    const phraseEl = document.createElement("p");
    phraseEl.className = "entry-phrase";
    phraseEl.textContent = (entry.phrase || "").replace(/\n/g, " ");

    const nameEl = document.createElement("p");
    nameEl.className = "entry-name";
    nameEl.textContent = entry.name || "";

    const timeEl = document.createElement("p");
    timeEl.className = "entry-time";
    timeEl.textContent = formatThaiDateTime(entry.at || entry.submitted_at);

    li.append(phraseEl, nameEl, timeEl);
    entryList.appendChild(li);
  });
  newestHighlight = false;

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
    renderEmptyState();
    return;
  }
  render();
})();
