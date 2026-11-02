export function detectProvider(text) {
  const s = text.toLowerCase();
  if (/gcash|g-xchange|g\\s*cash/.test(s)) return "GCash";
  if (/\\bmaya\\b|paymaya/.test(s)) return "Maya";
  if (/\\bbpi\\b|bank of the philippine islands/.test(s)) return "BPI";
  return "";
}
function parseAmount(text) {
  const lines = text.split(/\\n/);
  for (const line of lines) {
    if (/amount|total|sent|paid|transfer amount/i.test(line)) {
      const m = line.match(/(?:₱|php|p\\s*)?\\s*([\\d,]+\\.\\d{2})/i);
      if (m) return m[1].replace(/,/g, "");
    }
  }
  const vals = [...text.matchAll(/(?:₱|PHP)\\s*([\\d,]+\\.\\d{2})/gi)];
  return vals.length ? vals[0][1].replace(/,/g, "") : "";
}
function parseReference(text) {
  const patterns = [
    /(?:reference\\s*(?:no\\.?|number|#)?|ref(?:erence)?\\s*id|transaction\\s*id|trace\\s*no\\.?)\\s*[:#\\-]?\\s*([A-Z0-9\\-]{6,})/i,
    /(?:confirmation\\s*no\\.?)\\s*[:#\\-]?\\s*([A-Z0-9\\-]{6,})/i
  ];
  for (const p of patterns) { const m = text.match(p); if (m) return m[1]; }
  return "";
}
function parseDateTime(text) {
  let date = "", time = "";
  let m = text.match(/\\b(20\\d{2})[-/](\\d{1,2})[-/](\\d{1,2})\\b/);
  if (m) date = `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  else {
    m = text.match(/\\b(\\d{1,2})[/-](\\d{1,2})[/-](20\\d{2})\\b/);
    if (m) date = `${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
  }
  m = text.match(/\\b(1[0-2]|0?[1-9]):([0-5]\\d)\\s*(AM|PM)\\b/i);
  if (m) { let h = +m[1] % 12; if (m[3].toUpperCase() === "PM") h += 12; time = String(h).padStart(2,"0")+":"+m[2]; }
  else { m = text.match(/\\b([01]?\\d|2[0-3]):([0-5]\\d)\\b/); if (m) time = m[1].padStart(2,"0")+":"+m[2]; }
  return [date, time];
}
export async function readReceipt(imageData, onProgress = () => {}) {
  if (!window.Tesseract) throw new Error("Hindi ma-load ang OCR library.");
  const result = await window.Tesseract.recognize(imageData, "eng", {
    logger: m => { if (m.status) onProgress(m.status, m.progress || 0); }
  });
  const text = result.data.text || "";
  const [date, time] = parseDateTime(text);
  return { text, method: detectProvider(text), amount: parseAmount(text), reference: parseReference(text), date, time };
}
