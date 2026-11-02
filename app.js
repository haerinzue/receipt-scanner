import { getSession, signIn, signOut } from "./auth.js";
import { readReceipt } from "./ocr.js";
import { saveReceipt, getReceipts, getReceiptImageUrl, deleteReceipt, findDuplicateReceipt } from "./database.js";

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
let cachedRecords = [];
function peso(v) { return Number(v || 0).toLocaleString("en-PH",{style:"currency",currency:"PHP"}); }
async function refresh() {
  try {
    cachedRecords = await getReceipts();
    const searchTerm = ($("search").value || "").trim().toLowerCase();
    let records = searchTerm ? cachedRecords.filter(r => `${r.reference_number} ${r.payment_method} ${r.amount} ${r.customer_name || ""} ${r.staff_name || ""}`.toLowerCase().includes(searchTerm)) : [...cachedRecords];
    const staffFilter = $("staffFilter")?.value || "";
    const shiftFilter = $("shiftFilter")?.value || "";
    if (staffFilter) records = records.filter(r => r.staff_name === staffFilter);
    if (shiftFilter) records = records.filter(r => r.shift_code === shiftFilter);
    const box = $("recordList"); box.innerHTML = "";
    if (!records.length) { box.innerHTML = '<div class="empty">Wala pang tugmang records.</div>'; return; }
    const grouped = new Map();
    for (const r of records) {
      const key = `${r.shift_code || "UNASSIGNED"}|${r.staff_name || "Hindi nakatalaga"}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(r);
    }
    const labels = {S1:"Shift 1 · 12 MN–9 AM",S2:"Shift 2 · 9 AM–9 PM",S3:"Shift 3 · 9 PM–12 MN"};
    for (const [key, list] of grouped) {
      const [shift, staff] = key.split("|");
      const group = document.createElement("section"); group.className = "record-group";
      const heading = document.createElement("h3"); heading.className = "record-group-title";
      heading.textContent = `${labels[shift] || "Walang shift"} · ${staff} (${list.length})`;
      group.append(heading);
      for (const r of list) {
        const el = document.createElement("div"); el.className = "record";
        const left = document.createElement("div");
        const strong = document.createElement("strong"); strong.textContent = `${r.payment_method} · ${peso(r.amount)}`;
        const meta = document.createElement("div"); meta.className = "meta";
        meta.textContent = `Customer: ${r.customer_name || "—"} · Ref: ${r.reference_number} · Transaction: ${r.transaction_date || "—"} ${r.transaction_time || ""}`;
        const assignment = document.createElement("div"); assignment.className = "meta";
        assignment.textContent = `Staff: ${r.staff_name || "Hindi nakatalaga"} · ${labels[r.shift_code] || "Walang shift"}`;
        const tag = document.createElement("span"); tag.className = "tag";
        tag.textContent = `Saved ${r.created_at ? new Date(r.created_at).toLocaleString("en-PH") : "—"}`;
        left.append(strong,meta,assignment,tag);
        const right = document.createElement("div"); right.className = "record-buttons";
        const view = document.createElement("button"); view.className = "btn"; view.textContent = "Tingnan";
        view.onclick = async () => { try { const url = await getReceiptImageUrl(r.receipt_image_path); window.open(url,"_blank","noopener"); } catch(e) { alert("Hindi mabuksan ang image: "+e.message); } };
        const del = document.createElement("button"); del.className = "btn danger"; del.textContent = "Delete";
        del.onclick = async () => {
          const ok = confirm(`Sigurado ka bang ide-delete ang resibong ito?\\n\\n${r.payment_method} · ${peso(r.amount)}\\nReference: ${r.reference_number}\\nStaff: ${r.staff_name || "—"} / ${labels[r.shift_code] || "—"}\\n\\nHindi na ito maibabalik.`);
          if (!ok) return;
          del.disabled = true;
          try { await deleteReceipt(r); status("Na-delete ang resibo."); await refresh(); }
          catch(e) { alert("Hindi kumpleto ang deletion: "+e.message); del.disabled = false; await refresh(); }
        };
        right.append(view,del); el.append(left,right); group.append(el);
      }
      box.append(group);
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
  $("readBtn").disabled = true; $("progress").classList.remove("hidden"); $("bar").style.width = "5%"; status("Sinusuri ang resibo gamit ang PaddleOCR PP-OCRv6 Small...");
  try {
    const result = await readReceipt(imageData, (state, progress) => {
      status(state === "recognizing text" ? "PaddleOCR: sinusuri ang teksto at mga detalye..." : state);
      $("bar").style.width = Math.max(5,Math.round(progress*100)) + "%";
    });
    // Clear previous OCR-derived values first so an unread field cannot retain
    // data from the previously scanned receipt by accident.
    ["method","amount","customerName","reference","txDate","txTime"].forEach(id => $(id).value = "");
    $("rawText").value = result.text;
    $("ocrWarnings").textContent = (result.warnings || []).join(" ");
    $("ocrWarnings").classList.toggle("hidden", !(result.warnings || []).length);
    if (result.method) $("method").value = result.method;
    if (result.reference) $("reference").value = result.reference;
    if (result.amount) $("amount").value = result.amount;
    if (result.date) $("txDate").value = result.date;
    if (result.time) $("txTime").value = result.time;
    const filled = [result.method,result.amount,result.reference,result.date,result.time].filter(Boolean).length;
    let engineNote = "";
    if (result.method === "BPI" && result.referenceDiagnostics) {
      const d = result.referenceDiagnostics;
      const mask = value => value ? `••••${String(value).slice(-4)}` : "walang malinaw na basa";
      engineNote = ` BPI Confirmation No. line: ${mask(d.confirmationLine)}. ` +
        (result.referenceCheck === "paddle-confirmation-line" ? "Nakuha mula sa mismong confirmation line; pakisuri pa rin." : "Kailangan ng manual review.");
    }
    status(`Tapos ang PaddleOCR (${result.pass || "PP-OCRv6 Small"}; average line confidence ${result.confidence ?? "—"}%; ${filled}/5 fields nakuha). I-review at itama ang lahat ng field.${engineNote}`); $("bar").style.width = "100%";
  } catch(e) { status("Nagkaproblema sa OCR: " + e.message); }
  finally { $("readBtn").disabled = false; }
};
$("saveBtn").onclick = async () => {
  const method = $("method").value, reference = $("reference").value.trim(), amount = $("amount").value.trim();
  if (!imageBlob) return status("Kailangan munang pumili o kumuha ng receipt image.");
  if (!["GCash","Maya","BPI"].includes(method)) return status("Piliin ang GCash, Maya o BPI.");
  const customerName = $("customerName").value.trim();
  if (!customerName) return status("Ilagay muna ang pangalan ng customer.");
  if (!reference || !amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return status("Maglagay ng wastong Reference Number at Amount.");
  const staffName = activeStaff;
  const shiftCode = activeShift;
  if (!staffName || !shiftCode) return status("Piliin muna ang admin at shift bago magpatuloy.");
  $("saveBtn").disabled = true; status("Sinusuri muna kung duplicate ang reference number...");
  try {
    const duplicate = await findDuplicateReceipt(method, reference);
    if (duplicate) {
      $("duplicateNotice").textContent = `DUPLICATE: May existing ${duplicate.payment_method} receipt na may reference ${duplicate.reference_number} (amount ${peso(duplicate.amount)}). Hindi ito ise-save.`;
      $("duplicateNotice").classList.remove("hidden");
      status("Hindi itinuloy ang save dahil duplicate ang reference number.");
      $("saveBtn").disabled = false;
      return;
    }
  } catch(e) { status("Hindi ma-check ang duplicate: " + e.message); $("saveBtn").disabled = false; return; }
  $("duplicateNotice").classList.add("hidden");
  status("Walang kaparehong reference. Sine-save ang image at record...");
  try {
    await saveReceipt({ method, reference, amount, customerName, txDate: $("txDate").value, txTime: $("txTime").value, rawText: $("rawText").value, staffName, shiftCode }, imageBlob);
    status("Matagumpay na na-save sa Supabase!"); $("duplicateNotice").classList.add("hidden"); await refresh();
  } catch(e) {
    if (String(e.message).startsWith("DUPLICATE_RECEIPT:")) {
      $("duplicateNotice").textContent = String(e.message).replace("DUPLICATE_RECEIPT:","");
      $("duplicateNotice").classList.remove("hidden");
      status("Hindi na-save: duplicate reference number.");
    } else status("Hindi na-save: " + e.message);
  }
  finally { $("saveBtn").disabled = false; }
};
$("clearBtn").onclick = () => {
  stopCamera(); imageData = null; imageBlob = null;
  $("preview").innerHTML = '<div class="placeholder">📄<br><b>Wala pang napipiling resibo</b></div>';
  $("ocrWarnings").classList.add("hidden");
  $("readBtn").disabled = true; $("saveBtn").disabled = true; $("fileInput").value = ""; status("");
};
$("resetFields").onclick = () => ["method","amount","customerName","reference","txDate","txTime","rawText"].forEach(id => $(id).value = "");
$("search").oninput = refresh;
$("staffFilter").onchange = refresh;
$("shiftFilter").onchange = refresh;


const reportShiftNames = {S1:"12 MN–9 AM",S2:"9 AM–9 PM",S3:"9 PM–12 MN"};
function reportRows() {
  const from=$("reportDateFrom").value, to=$("reportDateTo").value;
  if (from && to && from>to) throw new Error("Mali ang date range: ang FROM ay hindi puwedeng mas huli sa TO.");
  return cachedRecords.filter(r =>
    (!from || (r.transaction_date || "") >= from) &&
    (!to || (r.transaction_date || "") <= to) &&
    (!$("reportShift").value || r.shift_code === $("reportShift").value) &&
    (!$("reportStaff").value || r.staff_name === $("reportStaff").value) &&
    (!$("reportMethod").value || r.payment_method === $("reportMethod").value)
  ).sort((a,b)=>`${a.transaction_date||""} ${a.transaction_time||""}`.localeCompare(`${b.transaction_date||""} ${b.transaction_time||""}`));
}
function buildReportHTML(rows) {
  const from=$("reportDateFrom").value || "All dates";
  const to=$("reportDateTo").value || "All dates";
  const shift=$("reportShift").value ? `Shift: ${reportShiftNames[$("reportShift").value]}` : "All shifts";
  const staff=$("reportStaff").value || "All staff";
  const method=$("reportMethod").value || "All payment methods";
  const branch="MGH Concepcion";
  const title = $("reportMethod").value === "GCash" ? "GCash Receivable Report"
    : $("reportMethod").value ? `${$("reportMethod").value} Receivable Report`
    : "Overall Receivable Report";
  const total=rows.reduce((s,r)=>s+Number(r.amount||0),0);
  const fmt=n=>Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const groupedByDate = new Map();
  rows.forEach(r => {
    const day = r.transaction_date || "No transaction date";
    if (!groupedByDate.has(day)) groupedByDate.set(day, []);
    groupedByDate.get(day).push(r);
  });
  let table = "";
  for (const [day, dayRows] of groupedByDate) {
    const dayTotal = dayRows.reduce((s,r)=>s+Number(r.amount||0),0);
    table += `<tr class="day-band"><th colspan="6">Date: ${esc(day)}</th></tr>`;
    table += dayRows.map(r=>`<tr>
      <td>${esc(branch)}</td>
      <td>${esc(r.customer_name||"—")}</td>
      <td>${esc(r.payment_method||"—")}</td>
      <td>${esc(r.reference_number||"—")}</td>
      <td class="money">₱${fmt(r.amount)}</td>
      <td>${esc(r.staff_name||"—")}</td>
    </tr>`).join("");
    table += `<tr class="day-subtotal"><th colspan="4">Sub-total for ${esc(day)} (${dayRows.length} receipts)</th><th class="money">₱${fmt(dayTotal)}</th><th></th></tr>`;
  }
  return `<div class="print-report"><header>
    <h1>${esc(title)}</h1>
    <p>Date: ${esc(from)} to ${esc(to)}</p>
    <p>Branch: ${esc(branch)}</p>
    <p class="report-filter-line">${esc(shift)} · ${esc(staff)} · ${esc(method)}</p>
  </header>
  <table><thead><tr>
    <th>Branch</th><th>Customer</th><th>Payment Method</th><th>Reference</th><th class="money">Amount</th><th>Encoded By</th>
  </tr></thead><tbody>${table||'<tr><td colspan="6">No matching receipts</td></tr>'}</tbody>
  <tfoot><tr><th colspan="4">GRAND TOTAL (${rows.length} receipts)</th><th class="money">₱${fmt(total)}</th><th></th></tr></tfoot></table>
  <p class="report-generated">Generated: ${esc(new Date().toLocaleString("en-PH"))}</p></div>`;
}
function previewReport() {
  try { const rows=reportRows(); $("reportPreview").innerHTML=buildReportHTML(rows); }
  catch(e) { $("reportPreview").textContent=e.message; }
}
$("openReport").onclick=()=>{ $("reportDialog").showModal(); previewReport(); };
$("closeReport").onclick=()=>$("reportDialog").close();
["reportDateFrom","reportDateTo","reportShift","reportStaff","reportMethod"].forEach(id=>$(id).addEventListener("change",previewReport));
$("previewReport").onclick=previewReport;
$("printReport").onclick=()=>{
  let rows;
  try { rows=reportRows(); } catch(e) { alert(e.message); return; }
  if (!rows.length) { alert("Walang resibong pasok sa napiling report filters."); return; }
  const report=buildReportHTML(rows);
  const w=window.open("","_blank");
  if (!w) { alert("Na-block ang print window. Payagan ang pop-ups para sa site na ito."); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receivable Report</title><style>
  @page{size:A4 landscape;margin:12mm}
  *{box-sizing:border-box}
  body{font:11px Arial,Helvetica,sans-serif;color:#222;margin:0}
  .print-report header{text-align:center;margin:0 0 18px}
  .print-report h1{font-size:19px;font-weight:700;margin:0 0 5px}
  .print-report header p{font-size:12px;color:#555;margin:2px 0}
  .report-filter-line{font-size:10px!important;margin-top:5px!important}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th,td{border:1px solid #c8cbd0;padding:7px 6px;text-align:left;vertical-align:middle;overflow-wrap:anywhere}
  thead{display:table-header-group}
  thead th{background:#f0f1f3;font-weight:700}
  tbody tr{page-break-inside:avoid}
  .day-band th{background:#e4e6e9;text-align:left;font-weight:700}
  .day-subtotal th{background:#f7f8fa;font-weight:700}
  tfoot{display:table-row-group}
  tfoot th{background:#f2f3f5;font-weight:700}
  .money{text-align:right;white-space:nowrap}
  .report-generated{text-align:right;color:#666;font-size:9px;margin-top:12px}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-report{width:100%}}
  </style></head><body>${report}<script>window.onload=()=>{window.focus();window.print();};<\\/script></body></html>`);
  w.document.close();
};
try { const session = await getSession(); setLoggedIn(session); }
catch(e) { loginStatus("Supabase connection error: " + e.message); }
