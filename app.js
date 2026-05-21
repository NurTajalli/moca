// MoCa — a local-first monthly money tracker.
// Everything is stored on the device in IndexedDB; nothing leaves the phone.
//
// Data model — one record per month:
//   { id: "2026-05",                    // YYYY-MM, also the key
//     income:   [{ id, name, amount }],
//     bills:    [{ id, name, amount, payTo, notes, done }],   // "To Pay"
//     spending: [{ id, name, amount, date }],                 // actual log
//     updated:  <ms> }

// ---------- Storage: IndexedDB ----------
const DB_NAME = "moca";
const STORE = "months";
let dbPromise;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function idb(mode, makeReq) {
  return new Promise(async (resolve, reject) => {
    const os = (await db()).transaction(STORE, mode).objectStore(STORE);
    const req = makeReq(os);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const getAllMonths = () => idb("readonly", (os) => os.getAll());
const putMonth = (m) => idb("readwrite", (os) => os.put(m));
const deleteMonthRec = (id) => idb("readwrite", (os) => os.delete(id));

// ---------- Helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sum = (arr) => arr.reduce((t, x) => t + (Number(x.amount) || 0), 0);

const RM = (n) =>
  "RM " +
  (Number(n) || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function monthLabel(id) {
  const [y, m] = id.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function curMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const listKeyOf = (kind) =>
  kind === "income" ? "income" : kind === "bill" ? "bills" : "spending";

// ---------- State ----------
let months = [];
let currentId = null; // open month, or null on home
let draft = null; // working COPY of the open month — edits live here until Save
let dirty = false; // draft has unsaved changes
let editing = null; // { kind, id } while the item modal is open

const $ = (id) => document.getElementById(id);

// Popup at the bottom of the screen.
// persist = true keeps it up (e.g. "Saving…") until the next toast replaces it.
let toastTimer;
function toast(msg, persist) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  el.classList.toggle("busy", !!persist);
  clearTimeout(toastTimer);
  if (!persist) toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---------- Home: list of months ----------
function renderHome() {
  const list = $("monthList");
  list.innerHTML = "";
  const sorted = [...months].sort((a, b) => b.id.localeCompare(a.id));
  $("empty").hidden = sorted.length > 0;

  const thisMonth = curMonthISO();
  for (const m of sorted) {
    const li = document.createElement("li");
    li.className = "month-card";
    if (m.id === thisMonth) li.classList.add("current"); // this month = pink
    li.textContent = monthLabel(m.id); // just the month + year
    li.addEventListener("click", () => openMonth(m.id));
    list.appendChild(li);
  }
}

// ---------- Month detail ----------
// All edits happen on `draft` (a copy). Nothing reaches storage until Save.
function currentMonth() {
  return draft;
}

const clone = (obj) => JSON.parse(JSON.stringify(obj));

function markDirty() {
  dirty = true;
  updateSaveBtn();
}

function updateSaveBtn() {
  const btn = $("saveMonthBtn");
  btn.textContent = dirty ? "Save" : "Saved";
  btn.classList.toggle("primary", dirty);
  btn.disabled = !dirty;
}

function openMonth(id) {
  const stored = months.find((m) => m.id === id);
  if (!stored) return;
  currentId = id;
  draft = clone(stored); // edit the copy, not the stored record
  draft.income ||= [];
  draft.bills ||= [];
  draft.spending ||= [];
  dirty = false;
  renderMonth();
  updateSaveBtn();
  $("monthView").hidden = false;
}

// Commit the draft to storage.
async function saveMonth() {
  if (!draft) return;

  // Show a "Saving…" popup so the user sees the save start.
  toast("Saving…", true);
  const btn = $("saveMonthBtn");
  btn.textContent = "Saving…";
  btn.disabled = true;
  const started = Date.now();

  draft.updated = Date.now();
  await putMonth(clone(draft));
  const i = months.findIndex((m) => m.id === draft.id);
  if (i >= 0) months[i] = clone(draft);
  else months.push(clone(draft));
  dirty = false;
  updateSaveBtn();

  // Keep "Saving…" visible long enough to be noticed, even though
  // writing to local storage is near-instant.
  const wait = Math.max(0, 500 - (Date.now() - started));
  setTimeout(() => toast("Saved ✓"), wait);
}

function closeMonth() {
  if (dirty && !confirm("You have unsaved changes. Discard them?")) return;
  currentId = null;
  draft = null;
  dirty = false;
  $("monthView").hidden = true;
  renderHome();
}

function renderMonth() {
  const m = currentMonth();
  if (!m) return closeMonth();

  $("monthTitle").textContent = monthLabel(m.id);

  const income = sum(m.income);
  const bills = sum(m.bills);
  const paid = sum(m.bills.filter((b) => b.done));
  const unpaid = bills - paid;
  const balance = income - bills;
  const spent = sum(m.spending);

  $("summary").innerHTML = `
    <div class="sm"><span>Income</span><strong>${RM(income)}</strong></div>
    <div class="sm"><span>To pay</span><strong>${RM(bills)}</strong></div>
    <div class="sm"><span>Paid</span><strong>${RM(paid)}</strong></div>
    <div class="sm"><span>Still unpaid</span><strong class="${unpaid > 0 ? "neg" : ""}">${RM(unpaid)}</strong></div>
    <div class="sm wide"><span>Balance — income minus to-pay</span><strong class="${balance < 0 ? "neg" : ""}">${RM(balance)}</strong></div>
    <div class="sm wide"><span>Logged spending this month</span><strong>${RM(spent)}</strong></div>`;

  renderRows("income", m.income, $("incomeList"));
  appendBalanceRow($("incomeList"), balance);
  renderRows("bill", m.bills, $("billList"));
  renderRows("spending", m.spending, $("spendList"));
}

// A read-only row at the foot of the Income list: Income minus all To Pay.
function appendBalanceRow(ul, balance) {
  const li = document.createElement("li");
  li.className = "row balance-row";
  li.innerHTML = `
    <div class="row-main"><div class="row-name">Balance</div>
      <div class="row-sub">Income minus all To Pay</div></div>
    <div class="row-amt"></div>`;
  const amt = li.querySelector(".row-amt");
  amt.textContent = RM(balance);
  amt.classList.add(balance < 0 ? "neg" : "pos");
  ul.appendChild(li);
}

function renderRows(kind, items, ul) {
  ul.innerHTML = "";
  // To Pay and the HSBC Spending Log show as a 2-up grid of small cards.
  const cardMode = kind === "bill" || kind === "spending";
  ul.className = "rows" + (cardMode ? " cards" : "");

  if (!items.length) {
    const li = document.createElement("li");
    li.className = "row-empty";
    li.textContent = "Nothing yet — tap + Add.";
    ul.appendChild(li);
    return;
  }

  // Spending shows newest first; income & bills keep entry order.
  const ordered =
    kind === "spending"
      ? [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      : items;

  for (const it of ordered) {
    const li = document.createElement("li");
    li.className = "row" + (cardMode ? " card " + kind : "");

    if (kind === "bill") {
      li.innerHTML = `
        <input type="checkbox" class="row-chk" />
        <div class="row-main"><div class="row-name"></div><div class="row-sub"></div></div>
        <div class="row-amt"></div>`;
      const chk = li.querySelector(".row-chk");
      chk.checked = !!it.done;
      chk.addEventListener("click", (e) => e.stopPropagation());
      chk.addEventListener("change", () => {
        it.done = chk.checked;
        markDirty();
        renderMonth();
      });
      li.querySelector(".row-name").textContent = it.name || "Untitled";
      const subParts = [it.payTo, it.notes].filter(Boolean);
      if (isCcHsbc(it.name)) subParts.push("auto: sum of HSBC Spending Log");
      const sub = subParts.join("  ·  ");
      const subEl = li.querySelector(".row-sub");
      if (sub) subEl.textContent = sub;
      else subEl.remove();
      if (it.done) li.classList.add("done");
    } else if (kind === "spending") {
      li.innerHTML = `
        <div class="row-main"><div class="row-name"></div><div class="row-sub"></div></div>
        <div class="row-amt"></div>`;
      li.querySelector(".row-name").textContent = it.name || "Untitled";
      li.querySelector(".row-sub").textContent = fmtDate(it.date);
    } else {
      li.innerHTML = `<div class="row-main"><div class="row-name"></div></div><div class="row-amt"></div>`;
      li.querySelector(".row-name").textContent = it.name || "Untitled";
    }

    const amtEl = li.querySelector(".row-amt");
    amtEl.textContent = RM(it.amount);
    if (kind === "income") amtEl.classList.add("pos");

    li.addEventListener("click", () => openItemModal(kind, it));
    ul.appendChild(li);
  }
}

// The Spending Log IS the CC HSBC card breakdown — keep the "CC HSBC"
// bill's amount equal to the running sum of every logged expense.
// Runs whenever a spending entry is added, edited, or deleted.
const isCcHsbc = (name) => (name || "").trim().toLowerCase() === "cc hsbc";

function syncCcHsbc(m) {
  const total = sum(m.spending);
  let cc = m.bills.find((b) => isCcHsbc(b.name));
  if (!cc) {
    cc = { id: uid(), name: "CC HSBC", amount: 0, payTo: "HSBC", notes: "", done: false };
    m.bills.push(cc);
  }
  cc.amount = total;
}

// ---------- Item modal (add / edit income, bill, or expense) ----------
function openItemModal(kind, item) {
  editing = { kind, id: item ? item.id : null };
  const noun = { income: "income", bill: "bill", spending: "expense" }[kind];
  $("itemModalTitle").textContent = (item ? "Edit " : "Add ") + noun;

  $("fName").value = item ? item.name || "" : "";
  $("fAmount").value = item && item.amount != null ? item.amount : "";
  $("fPayTo").value = item ? item.payTo || "" : "";
  $("fNotes").value = item ? item.notes || "" : "";
  $("fDate").value = item ? item.date || todayISO() : todayISO();
  $("fDone").checked = item ? !!item.done : false;

  $("fldPayTo").hidden = kind !== "bill";
  $("fldNotes").hidden = kind !== "bill";
  $("fldDone").hidden = kind !== "bill";
  $("fldDate").hidden = kind !== "spending";
  $("itemDelete").hidden = !item;

  $("itemModal").hidden = false;
  $("fName").focus();
}

function closeItemModal() {
  $("itemModal").hidden = true;
  editing = null;
}

async function saveItem() {
  if (!editing) return;
  const m = currentMonth();
  if (!m) return closeItemModal();

  const { kind, id } = editing;
  const key = listKeyOf(kind);
  const name = $("fName").value.trim();
  const amount = parseFloat($("fAmount").value) || 0;

  if (!name && !amount) return closeItemModal(); // nothing entered

  let it = id ? m[key].find((x) => x.id === id) : null;
  if (!it) {
    it = { id: uid() };
    m[key].push(it);
  }
  it.name = name;
  it.amount = amount;
  if (kind === "bill") {
    it.payTo = $("fPayTo").value.trim();
    it.notes = $("fNotes").value.trim();
    it.done = $("fDone").checked;
  }
  if (kind === "spending") {
    it.date = $("fDate").value || todayISO();
    syncCcHsbc(m); // Spending Log total flows into the CC HSBC bill
  }

  markDirty();
  renderMonth();
  closeItemModal();
}

function deleteItem() {
  if (!editing || !editing.id) return closeItemModal();
  if (!confirm("Delete this item?")) return;
  const m = currentMonth();
  const key = listKeyOf(editing.kind);
  m[key] = m[key].filter((x) => x.id !== editing.id);
  if (editing.kind === "spending") syncCcHsbc(m);
  markDirty();
  renderMonth();
  closeItemModal();
  toast("Item removed ✓");
}

// ---------- New month ----------
function openMonthModal() {
  $("fMonth").value = curMonthISO();
  $("fCopy").checked = months.length > 0;
  $("fldCopy").hidden = months.length === 0;
  $("monthModal").hidden = false;
}

async function createMonth() {
  const id = $("fMonth").value;
  if (!id) return;

  // Month already exists — just open it.
  if (months.some((m) => m.id === id)) {
    $("monthModal").hidden = true;
    openMonth(id);
    return;
  }

  const m = { id, income: [], bills: [], spending: [], updated: Date.now() };

  // Optionally carry over the recurring "To Pay" list from the latest month.
  if ($("fCopy").checked) {
    const latest = [...months].sort((a, b) => b.id.localeCompare(a.id))[0];
    if (latest) {
      m.bills = latest.bills.map((b) => ({
        id: uid(),
        name: b.name,
        amount: b.amount,
        payTo: b.payTo || "",
        notes: b.notes || "",
        done: false,
      }));
    }
  }

  months.push(m);
  await putMonth(m);
  $("monthModal").hidden = true;
  renderHome();
  openMonth(id);
}

async function deleteCurrentMonth() {
  if (!currentId) return;
  if (!confirm(`Delete ${monthLabel(currentId)}? This removes all its items.`)) return;
  await deleteMonthRec(currentId);
  months = months.filter((m) => m.id !== currentId);
  dirty = false; // deleting the month — skip the discard prompt
  closeMonth();
  toast("Month deleted ✓");
}

// ---------- Wire up controls ----------
$("addMonthBtn").addEventListener("click", openMonthModal);
$("backBtn").addEventListener("click", closeMonth);
$("saveMonthBtn").addEventListener("click", saveMonth);
$("deleteMonthBtn").addEventListener("click", deleteCurrentMonth);

document.querySelectorAll(".add-link").forEach((btn) => {
  btn.addEventListener("click", () => openItemModal(btn.dataset.kind, null));
});

$("itemSave").addEventListener("click", saveItem);
$("itemCancel").addEventListener("click", closeItemModal);
$("itemDelete").addEventListener("click", deleteItem);

$("monthCreate").addEventListener("click", createMonth);
$("monthCancel").addEventListener("click", () => ($("monthModal").hidden = true));

// Tap the dimmed backdrop to dismiss a modal.
$("itemModal").addEventListener("click", (e) => {
  if (e.target === $("itemModal")) closeItemModal();
});
$("monthModal").addEventListener("click", (e) => {
  if (e.target === $("monthModal")) $("monthModal").hidden = true;
});

// ---------- Keep the data resident (resist iOS storage eviction) ----------
async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return;
  try {
    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {}
}

// One-time seed: on the very first launch, load the months parsed from
// Financial.xlsx (seed.js). After that the flag stops it ever running again,
// so deleting a month won't bring it back.
async function seedIfFirstRun() {
  if (months.length > 0) return;
  if (localStorage.getItem("moca.seeded")) return;
  if (!Array.isArray(window.MOCA_SEED)) return;
  for (const m of window.MOCA_SEED) {
    await putMonth({
      id: m.id,
      income: m.income || [],
      bills: m.bills || [],
      spending: m.spending || [],
      updated: m.updated || Date.now(),
    });
  }
  localStorage.setItem("moca.seeded", "1");
  months = await getAllMonths();
}

// ---------- Boot ----------
(async function init() {
  await requestPersistentStorage();
  months = await getAllMonths();
  await seedIfFirstRun();
  // Guard against older/partial records missing a list.
  for (const m of months) {
    m.income ||= [];
    m.bills ||= [];
    m.spending ||= [];
  }
  renderHome();
})();

// ---------- Service worker (offline support) ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
