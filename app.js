import { getSession, signIn, signOut } from "./auth.js";
import { readReceipt } from "./ocr.js";
import { saveReceipt, getReceipts, getReceiptImageUrl } from "./database.js";

const $ = id => document.getElementById(id);
let imageData = null, imageBlob = null, stream = null;
let activeStaff = "", activeShift = "";
const shiftLabels = { S1: "Shift 1 · 12 MN–9 AM", S2: "Shift 2 · 9 AM–9 PM", S3: "Shift 3 · 9 PM–12 MN" };

function status(message) { $("status").textContent = message; }
function loginStatus(message) { $("loginStatus").textContent = message; }
function showSelection() {
  $("loginPanel").classList.add("hidden");
  $("staffShiftPanel").classList.remove("hidden");
  $("appPanel").classList.add("hidden");
}
function setLoggedIn(session) {
  $("loginPanel").classList.toggle("hidden", !!session);
  $("staffShiftPanel").classList.toggle("hidden", !session);
  $("appPanel").classList.add("hidden");
  $("userEmail").textContent = session?.user?.email || "";
  if (session) showSelection();
}
function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = (head.match(/data:(.*?);/) || [,"image/jpeg"])[1];
  const binary = atob(body); const bytes = new Uint8Array(binary.length);
  for (let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
function showImage(data, blob) {
  imageData = data; imageBlob = blob || dataUrlToBlob(data);
  $("ocrWarnings")?.classList.add("hidden");
  $("preview").innerHTML = "";
  const img = document.createElement("img"); img.src = data; $("preview").appendChild(img);
  $("readBtn").disabled = false; $("saveBtn").disabled = false;
}
function stopCamera() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  $("cameraControls").classList.add("hidden");
}
async function refresh() {
  try {
    let records = await getReceipts($("search").value);
    const staffFilter = $("staffFilter")?.value || "";
    const shiftFilter = $("shiftFilter")?.value || "";
    if (staffFilter) records = records.filter(r => r.staff_name === staffFilter);
    if (shiftFilter) records = records.filter(r => r.shift_code === shiftFilter);
    const box = $("recordList"); box.innerHTML = "";
    if (!records.length) { box.innerHTML = '<div class="empty">Wala pang tugmang records.</div>'; return; }
    for (const r of records) {
      const el = document.createElement("div"); el.className = "record";
      const left = document.createElement("div");
      const strong = document.createElement("strong"); strong.textContent = `${r.payment_method} · ₱${Number(r.amount).toLocaleString("en-PH",{minimumFractionDigits:2})}`;
      const meta = document.createElement("div"); meta.className = "meta";
      meta.textContent = `Ref: ${r.reference_number} · Transaction: ${r.transaction_date || "—"} ${r.transaction_time || ""}`;
      const assignment = document.createElement("div"); assignment.className = "meta";
      const shiftNames = { S1: "Shift 1 · 12 MN–9 AM", S2: "Shift 2 · 9 AM–9 PM", S3: "Shift 3 · 9 PM–12 MN" };
      assignment.textContent = `Staff: ${r.staff_name || "Hindi nakatalaga"} · ${shiftNames[r.shift_code] || "Walang shift"}`;
      const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = `Saved ${new Date(r.created_at).toLocaleString()}`;
      left.append(strong, meta, assignment, tag);
      const right = document.createElement("div"); const view = document.createElement("button");
      view.className = "btn"; view.textContent = "Tingnan";
      view.onclick = async () => { try { const url = await getReceiptImageUrl(r.receipt_image_path); window.open(url, "_blank", "noopener"); } catch(e) { alert("Hindi mabuksan ang image: " + e.message); } };
      right.append(view); el.append(left,right); box.append(el);
    }
  } catch (e) { $("recordList").innerHTML = `<div class="empty">Hindi makuha ang records: ${escapeHtml(e.message)}</div>`; }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

$("staffShiftForm").addEventListener("submit", e => {
  e.preventDefault();
  activeStaff = $("sessionStaff").value;
  activeShift = $("sessionShift").value;
  if (!activeStaff || !activeShift) {
    $("selectionStatus").textContent = "Piliin ang admin at shift.";
    return;
  }
  $("activeStaffShift").textContent = `${activeStaff} · ${shiftLabels[activeShift]}`;
  $("staffShiftPanel").classList.add("hidden");
  $("appPanel").classList.remove("hidden");
  refresh();
});
$("changeStaffShift").onclick = () => {
  $("sessionStaff").value = activeStaff;
  $("sessionShift").value = activeShift;
  showSelection();
};
$("selectionLogoutBtn").onclick = async () => {
  try { await signOut(); activeStaff = ""; activeShift = ""; setLoggedIn(null); }
  catch(e) { $("selectionStatus").textContent = e.message; }
};

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); loginStatus("Nagla-login...");
  try { const session = await signIn($("email").value.trim(), $("password").value); $("password").value = ""; loginStatus(""); setLoggedIn(session); }
  catch (err) { loginStatus("Hindi makapag-login: " + err.message); }
});
$("logoutBtn").onclick = async () => { try { await signOut(); activeStaff = ""; activeShift = ""; setLoggedIn(null); } catch(e) { status(e.message); } };
$("openCamera").onclick = async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires HTTPS or localhost.");
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    $("preview").innerHTML = ""; const v = document.createElement("video"); v.autoplay = true; v.playsInline = true; v.srcObject = stream; $("preview").appendChild(v);
    $("cameraControls").classList.remove("hidden"); status("Camera ready. Iposisyon nang tuwid at buo ang resibo.");
  } catch(e) { status("Hindi mabuksan ang camera: " + e.message); }
};
$("captureBtn").onclick = () => {
  const v = $("preview").querySelector("video"); if (!v) return;
  const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext("2d").drawImage(v,0,0); const data = c.toDataURL("image/jpeg",.92);
  showImage(data, dataUrlToBlob(data)); stopCamera(); status("Nakuha ang larawan. Pindutin ang Basahin ang resibo.");
};
$("closeCamera").onclick = stopCamera;
$("uploadBtn").onclick = () => $("fileInput").click();
$("fileInput").onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  if (!["image/jpeg","image/png","image/webp"].includes(f.type)) { status("JPG, PNG o WEBP image lamang."); return; }
  if (f.size > 5*1024*1024) { status("Maximum file size ay 5 MB."); return; }
  const reader = new FileReader(); reader.onload = () => { showImage(reader.result, f); status("Na-upload ang larawan."); }; reader.readAsDataURL(f); e.target.value = "";
};
$("readBtn").onclick = async () => {
  if (!imageData) return;
  $("readBtn").disabled = true; $("progress").classList.remove("hidden"); $("bar").style.width = "5%"; status("Sinusuri ang resibo gamit ang Hybrid OCR...");
  try {
    const result = await readReceipt(imageData, (state, progress) => {
      status(state === "recognizing text" ? "Hybrid OCR: sinusuri ang teksto at mga detalye..." : state);
      $("bar").style.width = Math.max(5,Math.round(progress*100)) + "%";
    });
    // Clear previous OCR-derived values first so an unread field cannot retain
    // data from the previously scanned receipt by accident.
    ["method","amount","reference","txDate","txTime"].forEach(id => $(id).value = "");
    $("rawText").value = result.text;
    $("ocrWarnings").textContent = (result.warnings || []).join(" ");
    $("ocrWarnings").classList.toggle("hidden", !(result.warnings || []).length);
    if (result.method) $("method").value = result.method;
    if (result.reference) $("reference").value = result.reference;
    if (result.amount) $("amount").value = result.amount;
    if (result.date) $("txDate").value = result.date;
    if (result.time) $("txTime").value = result.time;
    const filled = [result.method,result.amount,result.reference,result.date,result.time].filter(Boolean).length;
    status(`Tapos ang Hybrid OCR (${result.pass || "multi-pass"}; overall text confidence ${result.confidence ?? "—"}%; ${filled}/5 fields nakuha). I-review at itama ang lahat ng field. Para sa BPI reference, may dagdag na OCRAD cross-check kung available.`); $("bar").style.width = "100%";
  } catch(e) { status("Nagkaproblema sa OCR: " + e.message); }
  finally { $("readBtn").disabled = false; }
};
$("saveBtn").onclick = async () => {
  const method = $("method").value, reference = $("reference").value.trim(), amount = $("amount").value.trim();
  if (!imageBlob) return status("Kailangan munang pumili o kumuha ng receipt image.");
  if (!["GCash","Maya","BPI"].includes(method)) return status("Piliin ang GCash, Maya o BPI.");
  if (!reference || !amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return status("Maglagay ng wastong Reference Number at Amount.");
  const staffName = activeStaff;
  const shiftCode = activeShift;
  if (!staffName || !shiftCode) return status("Piliin muna ang admin at shift bago magpatuloy.");
  $("saveBtn").disabled = true; status("Sine-save ang image at record sa Supabase...");
  try {
    await saveReceipt({ method, reference, amount, txDate: $("txDate").value, txTime: $("txTime").value, rawText: $("rawText").value, staffName, shiftCode }, imageBlob);
    status("Matagumpay na na-save sa Supabase!"); $("duplicateNotice").classList.add("hidden"); await refresh();
  } catch(e) { status("Hindi na-save: " + e.message); }
  finally { $("saveBtn").disabled = false; }
};
$("clearBtn").onclick = () => {
  stopCamera(); imageData = null; imageBlob = null;
  $("preview").innerHTML = '<div class="placeholder">📄<br><b>Wala pang napipiling resibo</b></div>';
  $("ocrWarnings").classList.add("hidden");
  $("readBtn").disabled = true; $("saveBtn").disabled = true; $("fileInput").value = ""; status("");
};
$("resetFields").onclick = () => ["method","amount","reference","txDate","txTime","rawText"].forEach(id => $(id).value = "");
$("search").oninput = refresh;
$("staffFilter").onchange = refresh;
$("shiftFilter").onchange = refresh;

try { const session = await getSession(); setLoggedIn(session); }
catch(e) { loginStatus("Supabase connection error: " + e.message); }
