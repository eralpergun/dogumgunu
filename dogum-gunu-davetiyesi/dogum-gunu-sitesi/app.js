import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Yönetici şifresinin (2908) SHA-256 özeti. Şifre yalnızca tarayıcıda kontrol edilir.
const PW_HASH = "6f4ddc5420f60ad526b4481607023708075caad06c1e392c2ec1f04c2548fd4f";

// Analytics isteğe bağlı: reklam engelleyici yüklemeyi engellerse site yine çalışır.
import("https://www.gstatic.com/firebasejs/13.2.0/firebase-analytics.js")
  .then(async ({ getAnalytics, isSupported }) => { if (await isSupported()) getAnalytics(app); })
  .catch(() => {});

const $ = (s) => document.querySelector(s);
const MAX_PHOTOS = 12;
const state = { uid: null, isAdmin: false, info: {}, rsvps: [], photos: [], formTouched: false, adminDirty: false };

const fmtDate = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });
const fmtWeekday = new Intl.DateTimeFormat("tr-TR", { weekday: "long" });
const fmtShort = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const str = (v, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");
const safeUrl = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : "");
const safeImg = (u) => (typeof u === "string" && u.startsWith("data:image/") ? u : "");
function parseDate(d, t) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const dt = new Date(d + "T" + (/^\d{2}:\d{2}$/.test(t || "") ? t : "00:00"));
  return isNaN(dt) ? null : dt;
}

// Her misafire bu tarayıcıda saklanan rastgele bir kimlik verilir; yanıtı bu anahtarla kaydedilir.
function guestId() {
  let id = null;
  try { id = localStorage.getItem("guestId"); } catch {}
  if (!id || !/^[A-Za-z0-9-]{10,64}$/.test(id)) {
    id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
    try { localStorage.setItem("guestId", id); } catch {}
  }
  return id;
}
state.uid = guestId();
try { state.isAdmin = sessionStorage.getItem("adminUnlocked") === "1"; } catch {}

async function sha256(t) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function setAdmin(on) {
  state.isAdmin = on;
  try { on ? sessionStorage.setItem("adminUnlocked", "1") : sessionStorage.removeItem("adminUnlocked"); } catch {}
  $("#admin-btn-text").textContent = on ? "Yönetim Paneli" : "Yönetici Girişi";
}

/* ---------------- herkese açık görünüm ---------------- */
function renderInfo() {
  const i = state.info;
  const hasInfo = Object.keys(i).length > 0;
  $("#v-title").textContent = str(i.title, 60) || "Doğum günü partisi";
  $("#v-honoree").textContent = str(i.honoree, 60) || "Doğum Günü Partisi";
  $("#v-message").textContent = str(i.message) || (hasInfo ? "" : "Parti detayları yakında burada olacak.");
  const age = Number(i.age);
  $("#age-box").hidden = !(age > 0 && age < 200);
  $("#v-age").textContent = age > 0 ? String(Math.round(age)) : "";

  const start = parseDate(i.date, i.time);
  $("#v-date").textContent = start ? fmtDate.format(start) : "—";
  $("#v-weekday").textContent = start ? fmtWeekday.format(start) : "";
  $("#v-time").textContent = /^\d{2}:\d{2}$/.test(i.time || "") ? i.time : "—";
  $("#v-timeend").textContent = /^\d{2}:\d{2}$/.test(i.end || "") ? "Bitiş " + i.end : "";
  $("#v-venue").textContent = str(i.venue, 80) || "—";
  $("#v-address").textContent = str(i.address, 160);
  const map = safeUrl(i.map);
  $("#v-map").hidden = !map;
  if (map) $("#v-map").href = map;

  const ex = $("#extras");
  ex.textContent = "";
  const addExtra = (k, v) => {
    if (!v) return;
    const s = document.createElement("span"), b = document.createElement("b");
    b.textContent = k + ": ";
    s.append(b, v);
    ex.append(s);
  };
  addExtra("Kıyafet", str(i.dress, 80));
  addExtra("İletişim", str(i.contact, 80));
  const dl = parseDate(i.deadline);
  if (dl) addExtra("Son yanıt", fmtDate.format(dl));
  renderCountdown();
}

function renderCountdown() {
  const box = $("#countdown");
  box.textContent = "";
  const start = parseDate(state.info.date, state.info.time);
  if (!start) return;
  const diff = start - Date.now();
  if (diff <= 0) {
    const m = document.createElement("span");
    m.className = "cd-msg";
    m.textContent = diff > -12 * 3600e3 ? "Parti başladı, iyi eğlenceler!" : "Bu parti sona erdi. Gelen herkese teşekkürler!";
    box.append(m);
    return;
  }
  const d = Math.floor(diff / 864e5), h = Math.floor(diff / 36e5) % 24, mi = Math.floor(diff / 6e4) % 60;
  const lbl = document.createElement("span");
  lbl.className = "label";
  lbl.textContent = "Partiye kalan";
  box.append(lbl);
  for (const [n, u] of [[d, "gün"], [h, "saat"], [mi, "dakika"]]) {
    const w = document.createElement("span"), a = document.createElement("span"), b = document.createElement("span");
    w.className = "cd-unit"; a.className = "cd-num"; b.className = "label";
    a.textContent = String(n).padStart(2, "0");
    b.textContent = u;
    w.append(a, b);
    box.append(w);
  }
}
setInterval(renderCountdown, 30000);

function renderGallery() {
  const g = $("#gallery");
  g.textContent = "";
  for (const p of state.photos) {
    const src = safeImg(p.data);
    if (!src) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", p.caption || "Fotoğrafı büyüt");
    const img = document.createElement("img");
    img.src = src; img.alt = p.caption || ""; img.loading = "lazy";
    b.append(img);
    b.addEventListener("click", () => openLightbox(src, p.caption));
    g.append(b);
  }
  $("#gallery-sec").hidden = g.childElementCount === 0;
}
function openLightbox(src, cap) {
  $("#lb-img").src = src;
  $("#lb-img").alt = cap || "";
  $("#lb-cap").textContent = cap || "";
  $("#lightbox").hidden = false;
  $("#lb-close").focus();
}
const closeLightbox = () => { $("#lightbox").hidden = true; $("#lb-img").removeAttribute("src"); };
$("#lb-close").addEventListener("click", closeLightbox);
$("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeLightbox(); });

function renderGuests() {
  const yes = state.rsvps.filter((r) => r.status === "yes");
  $("#g-count").textContent = String(yes.reduce((s, r) => s + r.count, 0));
  const ul = $("#g-list");
  ul.textContent = "";
  [...yes].sort((a, b) => a.name.localeCompare(b.name, "tr")).forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r.name;
    if (r.count > 1) { const s = document.createElement("span"); s.textContent = "+" + (r.count - 1); li.append(s); }
    ul.append(li);
  });
  $("#g-empty").hidden = yes.length > 0;
}

function renderMine() {
  const mine = state.uid ? state.rsvps.find((r) => r.id === state.uid) : null;
  const pill = $("#mine-pill");
  pill.textContent = "";
  $("#r-submit").textContent = mine ? "Yanıtı güncelle" : "Yanıtı gönder";
  if (!mine) return;
  const p = document.createElement("span");
  p.className = "saved-pill " + mine.status;
  p.textContent = mine.status === "yes" ? "✓ Geliyorsun olarak kayıtlı" : "Gelemiyorsun olarak kayıtlı";
  pill.append(p);
  if (!state.formTouched) {
    $("#r-name").value = mine.name;
    $("#r-note").value = mine.note;
    $("#r-count").value = mine.count || 1;
    $(mine.status === "yes" ? "#r-yes" : "#r-no").checked = true;
    syncCount();
  }
}
function syncCount() { $("#r-count-row").hidden = !$("#r-yes").checked; }

/* ---------------- LCV formu ---------------- */
$("#rsvp-form").addEventListener("input", () => { state.formTouched = true; });
$("#r-yes").addEventListener("change", syncCount);
$("#r-no").addEventListener("change", syncCount);
syncCount();

$("#rsvp-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#r-msg");
  msg.className = "msg err";
  const name = $("#r-name").value.trim();
  const status = $("#r-yes").checked ? "yes" : $("#r-no").checked ? "no" : "";
  if (!name) { msg.textContent = "Lütfen adını yaz."; $("#r-name").focus(); return; }
  if (!status) { msg.textContent = "Lütfen Geliyorum veya Gelemiyorum seç."; return; }
  if (!state.uid) { msg.textContent = "Bağlantı henüz kurulmadı. Birkaç saniye sonra tekrar dene."; return; }
  const count = Math.min(10, Math.max(1, Math.round(Number($("#r-count").value) || 1)));
  const btn = $("#r-submit");
  btn.disabled = true;
  msg.className = "msg";
  msg.textContent = "Kaydediliyor...";
  try {
    await set(ref(db, "rsvps/" + state.uid), {
      name: name.slice(0, 80),
      status,
      count: status === "yes" ? count : 0,
      note: $("#r-note").value.trim().slice(0, 300),
      updatedAt: serverTimestamp(),
    });
    state.formTouched = false;
    msg.className = "msg ok";
    msg.textContent = status === "yes" ? "Harika! Seni bekliyoruz." : "Yanıtın kaydedildi. Gelemediğin için üzgünüz.";
  } catch (err) {
    console.error(err);
    msg.className = "msg err";
    msg.textContent = "Yanıt kaydedilemedi. Bağlantını kontrol edip tekrar dene.";
  } finally {
    btn.disabled = false;
  }
});

/* ---------------- yönetici girişi ---------------- */
$("#admin-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.isAdmin) { openPanel(); return; }
  const pop = $("#admin-pop");
  pop.hidden = !pop.hidden;
  if (!pop.hidden) { $("#pw-msg").textContent = ""; $("#pw-input").value = ""; $("#pw-input").focus(); }
});
document.addEventListener("click", (e) => { if (!$("#admin-pop").contains(e.target)) $("#admin-pop").hidden = true; });

$("#pw-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#pw-msg");
  const pw = $("#pw-input").value;
  if (!pw) { msg.className = "msg err"; msg.textContent = "Şifreyi yaz."; return; }
  let ok = false;
  try { ok = (await sha256(pw.trim())) === PW_HASH; }
  catch { msg.className = "msg err"; msg.textContent = "Şifre bu tarayıcıda kontrol edilemedi."; return; }
  if (!ok) { msg.className = "msg err"; msg.textContent = "Şifre yanlış."; $("#pw-input").select(); return; }
  setAdmin(true);
  $("#admin-pop").hidden = true;
  openPanel();
});

$("#logout").addEventListener("click", () => {
  closePanel();
  setAdmin(false);
});

/* ---------------- yönetim paneli ---------------- */
const adminFields = ["honoree", "age", "title", "message", "date", "deadline", "time", "end", "venue", "address", "map", "dress", "contact"];
function fillAdminForm() {
  if (state.adminDirty) return;
  for (const k of adminFields) {
    const v = state.info[k];
    $("#a-" + k).value = v == null ? "" : String(v);
  }
}
$("#admin-form").addEventListener("input", () => { state.adminDirty = true; });
$("#admin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#a-msg");
  msg.className = "msg err";
  const data = {};
  for (const k of adminFields) {
    const v = $("#a-" + k).value.trim();
    if (k === "age") { const n = Math.round(Number(v)); if (v && n > 0) data.age = n; continue; }
    if (k === "map" && v && !/^https:\/\//i.test(v)) { msg.textContent = "Harita bağlantısı https:// ile başlamalı."; return; }
    if (v) data[k] = v;
  }
  data.updatedAt = serverTimestamp();
  const btn = $("#a-save");
  btn.disabled = true;
  msg.className = "msg";
  msg.textContent = "Kaydediliyor...";
  try {
    await set(ref(db, "party"), data);
    state.adminDirty = false;
    msg.className = "msg ok";
    msg.textContent = "Kaydedildi. Misafirler yeni bilgileri hemen görüyor.";
  } catch (err) {
    console.error(err);
    msg.className = "msg err";
    msg.textContent = "Kaydedilemedi. İnternet bağlantını ve veritabanı kurallarını kontrol et.";
  } finally {
    btn.disabled = false;
  }
});

function armDelete(btn, action) {
  btn.addEventListener("click", async () => {
    if (!btn.classList.contains("arm")) {
      btn.classList.add("arm");
      btn.textContent = "Emin misin?";
      setTimeout(() => { if (!btn.disabled) { btn.classList.remove("arm"); btn.textContent = "Sil"; } }, 4000);
      return;
    }
    btn.disabled = true;
    btn.textContent = "Siliniyor...";
    try { await action(); } catch (err) { console.error(err); btn.disabled = false; btn.textContent = "Silinemedi"; }
  });
}

function renderAdminRsvps() {
  const yes = state.rsvps.filter((r) => r.status === "yes"), no = state.rsvps.filter((r) => r.status === "no");
  $("#s-yes").textContent = yes.length;
  $("#s-no").textContent = no.length;
  $("#s-people").textContent = yes.reduce((s, r) => s + r.count, 0);
  $("#tab-count").textContent = state.rsvps.length ? "(" + state.rsvps.length + ")" : "";
  const tb = $("#a-rows");
  tb.textContent = "";
  const rows = [...state.rsvps].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const r of rows) {
    const tr = document.createElement("tr");
    const td = (t, cls) => { const c = document.createElement("td"); if (cls) c.className = cls; if (t != null) c.textContent = t; tr.append(c); return c; };
    td(r.name);
    const p = document.createElement("span");
    p.className = "pill " + r.status;
    p.textContent = r.status === "yes" ? "Geliyor" : "Gelmiyor";
    td(null).append(p);
    td(r.status === "yes" ? String(r.count) : "—", "num");
    td(r.note || "—", "note-cell");
    td(r.updatedAt ? fmtShort.format(new Date(r.updatedAt)) : "—", "num");
    const b = document.createElement("button");
    b.type = "button"; b.className = "del"; b.textContent = "Sil";
    armDelete(b, () => remove(ref(db, "rsvps/" + r.id)));
    td(null).append(b);
    tb.append(tr);
  }
  $("#a-empty").hidden = rows.length > 0;
}

function renderAdminPhotos() {
  $("#tab-pcount").textContent = state.photos.length ? "(" + state.photos.length + ")" : "";
  const grid = $("#ph-grid");
  grid.textContent = "";
  for (const p of state.photos) {
    const card = document.createElement("div");
    card.className = "ph";
    const img = document.createElement("img");
    img.src = safeImg(p.data); img.alt = p.caption || "";
    const body = document.createElement("div");
    body.className = "ph-body";
    const cap = document.createElement("input");
    cap.type = "text"; cap.maxLength = 140; cap.placeholder = "Açıklama (isteğe bağlı)";
    cap.id = "cap-" + p.id; cap.value = p.caption || "";
    cap.setAttribute("aria-label", "Fotoğraf açıklaması");
    cap.addEventListener("change", async () => {
      try { await set(ref(db, "photos/" + p.id + "/caption"), cap.value.trim().slice(0, 140)); }
      catch (err) { console.error(err); $("#p-msg").className = "msg err"; $("#p-msg").textContent = "Açıklama kaydedilemedi."; }
    });
    const del = document.createElement("button");
    del.type = "button"; del.className = "del"; del.textContent = "Sil";
    armDelete(del, () => remove(ref(db, "photos/" + p.id)));
    body.append(cap, del);
    card.append(img, body);
    grid.append(card);
  }
  $("#p-empty").hidden = state.photos.length > 0;
}

/* Fotoğrafı tarayıcıda küçültüp JPEG'e çevirir (veritabanında ~700 KB sınırı). */
async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let max = 1600, q = 0.82, out = "";
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      out = c.toDataURL("image/jpeg", q);
      if (out.length < 700000) return out;
      max = Math.round(max * 0.8);
      q = Math.max(0.6, q - 0.06);
    }
    return out.length < 900000 ? out : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadFiles(files) {
  const msg = $("#p-msg");
  const list = [...files].filter((f) => f.type.startsWith("image/"));
  if (!list.length) { msg.className = "msg err"; msg.textContent = "Lütfen bir fotoğraf dosyası seç."; return; }
  const room = MAX_PHOTOS - state.photos.length;
  if (room <= 0) { msg.className = "msg err"; msg.textContent = "En fazla " + MAX_PHOTOS + " fotoğraf eklenebilir. Yenisini eklemek için birini sil."; return; }
  const batch = list.slice(0, room);
  let ok = 0, failed = 0;
  for (const [n, f] of batch.entries()) {
    msg.className = "msg";
    msg.textContent = `Yükleniyor ${n + 1} / ${batch.length}...`;
    try {
      const data = await compressImage(f);
      if (!data) { failed++; continue; }
      await set(push(ref(db, "photos")), { data, caption: "", createdAt: serverTimestamp() });
      ok++;
    } catch (err) {
      console.error(err);
      failed++;
    }
  }
  const skipped = list.length - batch.length;
  msg.className = failed ? "msg err" : "msg ok";
  msg.textContent = `${ok} fotoğraf eklendi.` +
    (failed ? ` ${failed} fotoğraf eklenemedi (dosya açılamadı ya da çok büyük; HEIC yerine JPG deneyin).` : "") +
    (skipped ? ` ${skipped} fotoğraf sınır nedeniyle eklenmedi.` : "");
}
$("#p-input").addEventListener("change", (e) => { uploadFiles(e.target.files); e.target.value = ""; });
const dz = $("#dropzone");
dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
dz.addEventListener("dragleave", () => dz.classList.remove("over"));
dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("over"); uploadFiles(e.dataTransfer.files); });

function selectTab(which) {
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", t.dataset.tab === which));
  $("#pane-info").hidden = which !== "info";
  $("#pane-photos").hidden = which !== "photos";
  $("#pane-rsvp").hidden = which !== "rsvp";
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => selectTab(t.dataset.tab)));

function openPanel() {
  fillAdminForm();
  renderAdminRsvps();
  renderAdminPhotos();
  $("#overlay").hidden = false;
  document.body.style.overflow = "hidden";
  $("#panel-close").focus();
}
function closePanel() {
  $("#overlay").hidden = true;
  document.body.style.overflow = "";
}
$("#panel-close").addEventListener("click", closePanel);
$("#overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closePanel(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("#lightbox").hidden) closeLightbox();
  else if (!$("#overlay").hidden) closePanel();
  $("#admin-pop").hidden = true;
});

/* ---------------- Firebase bağlantısı ---------------- */
setAdmin(state.isAdmin);
$("#r-submit").disabled = false;

const showLoadError = (err) => {
  console.error(err);
  $("#v-message").textContent = "Parti bilgileri yüklenemedi. Sayfayı yenilemeyi dene.";
};

onValue(ref(db, "party"), (snap) => {
  state.info = snap.val() || {};
  renderInfo();
  if (!$("#overlay").hidden) fillAdminForm();
}, showLoadError);

onValue(ref(db, "rsvps"), (snap) => {
  const val = snap.val() || {};
  state.rsvps = Object.entries(val).map(([id, d]) => ({
    id,
    name: str(d && d.name, 80) || "İsimsiz",
    status: d && d.status === "yes" ? "yes" : "no",
    count: Math.min(10, Math.max(0, Math.round(Number(d && d.count) || 0))) || 1,
    note: str(d && d.note, 300),
    updatedAt: Number(d && d.updatedAt) || 0,
  }));
  renderGuests();
  renderMine();
  renderAdminRsvps();
}, showLoadError);

onValue(ref(db, "photos"), (snap) => {
  const val = snap.val() || {};
  state.photos = Object.entries(val)
    .map(([id, d]) => ({ id, data: d && d.data, caption: str(d && d.caption, 140), createdAt: Number(d && d.createdAt) || 0 }))
    .filter((p) => safeImg(p.data))
    .sort((a, b) => a.createdAt - b.createdAt);
  renderGallery();
  renderAdminPhotos();
}, showLoadError);

renderInfo();
