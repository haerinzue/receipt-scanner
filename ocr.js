import { getSession } from "./auth.js";
import { TEXTRACT_FUNCTION_URL } from "./config.js";

const MAX_REQUEST_DATA_URL_LENGTH = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function makeJpegDataUrl(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        let scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
        let quality = 0.88;
        let dataUrl = "";

        for (let attempt = 0; attempt < 10; attempt++) {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("Hindi maihanda ang image para sa OCR.");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          dataUrl = canvas.toDataURL("image/jpeg", quality);

          if (dataUrl.length <= MAX_REQUEST_DATA_URL_LENGTH) {
            resolve(dataUrl);
            return;
          }

          if (quality > 0.58) quality -= 0.08;
          else scale *= 0.82;
        }

        reject(new Error("Masyadong malaki ang image para ipadala sa OCR. Gumamit ng mas maliit o mas malinaw na crop ng resibo."));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Hindi mabuksan ang napiling receipt image."));
    image.src = source;
  });
}

function providerFromText(text) {
  const value = String(text || "").toLowerCase();
  if (/\bmaya\b|paymaya/.test(value)) return "Maya";
  if (/gcash|g-xchange|g\s*cash/.test(value)) return "GCash";
  if (/\bbpi\b|bank of the philippine islands/.test(value)) return "BPI";
  return "";
}

function parseAmount(text, summaryFields = []) {
  const priority = ["TOTAL", "AMOUNT_DUE", "TOTAL_AMOUNT", "AMOUNT_PAID"];
  for (const type of priority) {
    const field = summaryFields.find(item => item?.type === type);
    const candidate = field?.value || "";
    const match = candidate.match(/(?:PHP|₱|P)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
    if (match) {
      const amount = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(amount) && amount > 0 && amount < 100000000) return amount.toFixed(2);
    }
  }

  const lines = String(text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/total|amount|sent|paid|transfer/i.test(lines[i])) continue;
    const candidates = [lines[i], lines[i + 1] || ""];
    for (const candidate of candidates) {
      const matches = candidate.match(/(?:PHP|₱|P)?\s*[0-9][0-9,]*(?:\.\d{1,2})?/gi) || [];
      for (const value of matches) {
        const number = value.match(/[0-9][0-9,]*(?:\.\d{1,2})?/);
        if (!number) continue;
        const amount = Number(number[0].replace(/,/g, ""));
        if (Number.isFinite(amount) && amount > 0 && amount < 100000000) return amount.toFixed(2);
      }
    }
  }
  return "";
}

function parseReference(text) {
  const lines = String(text || "").split(/\r?\n/).map(clean).filter(Boolean);
  const label = /\b(?:reference(?:\s*(?:number|no\.?|#|id))?|ref(?:erence)?\s*(?:no\.?|#|id)|transaction\s*(?:number|no\.?|#|id)|trace\s*(?:number|no\.?|#)|confirmation\s*(?:number|no\.?|#))\b/i;

  for (let i = 0; i < lines.length; i++) {
    if (!label.test(lines[i])) continue;
    const candidates = [lines[i].replace(label, ""), lines[i + 1] || ""];
    for (const candidate of candidates) {
      const tokens = candidate.match(/[A-Z0-9][A-Z0-9 -]{5,39}/ig) || [];
      for (const token of tokens) {
        const value = token.replace(/[^A-Z0-9]/gi, "").toUpperCase();
        if (/^[A-Z0-9]{6,40}$/.test(value)) return value;
      }
    }
  }
  return "";
}

function parseDateTime(text) {
  const value = String(text || "");
  let date = "";
  let match = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (match) date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;

  if (!date) {
    match = value.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
    if (match) date = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }

  if (!date) {
    match = value.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20\d{2})\b/i);
    if (match) {
      const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
      date = `${match[3]}-${months[match[1].slice(0, 3).toLowerCase()]}-${match[2].padStart(2, "0")}`;
    }
  }

  let time = "";
  match = value.match(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/i);
  if (match) {
    let hour = Number(match[1]) % 12;
    if (match[3].toUpperCase() === "PM") hour += 12;
    time = `${String(hour).padStart(2, "0")}:${match[2]}`;
  } else {
    match = value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (match) time = `${String(match[1]).padStart(2, "0")}:${match[2]}`;
  }
  return { date, time };
}

export async function readReceipt(imageData, onProgress = () => {}) {
  onProgress("Inihahanda ang resibo para sa Amazon Textract...", 0.12);
  const session = await getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error("Walang aktibong Supabase session. Mag-login ulit.");

  const optimizedImage = await makeJpegDataUrl(imageData);
  const imageBase64 = optimizedImage.slice(optimizedImage.indexOf(",") + 1);
  const estimatedBytes = Math.floor(imageBase64.length * 3 / 4);
  if (!estimatedBytes || estimatedBytes > MAX_IMAGE_BYTES) {
    throw new Error("Lumampas sa 5 MB ang optimized image. Gumamit ng mas maliit na larawan.");
  }

  onProgress("Ipinapadala sa Amazon Textract...", 0.35);
  const response = await fetch(TEXTRACT_FUNCTION_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ imageBase64, mimeType: "image/jpeg" })
  });

  onProgress("Binabasa at kinukuha ang detalye ng resibo...", 0.82);
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Hindi wastong response mula sa OCR server (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(result?.error || `OCR server error (HTTP ${response.status}).`);
  }

  const text = String(result.text || "");
  const method = result.method || providerFromText(text);
  const amount = result.amount || parseAmount(text, result.summaryFields || []);
  const reference = result.reference || parseReference(text);
  const parsed = parseDateTime(text);
  const date = result.date || parsed.date;
  const time = result.time || parsed.time;
  const confidence = Number(result.confidence) || 0;
  const warnings = [];

  if (!method) warnings.push("Hindi matukoy ang payment method; piliin ito nang mano-mano.");
  if (!amount) warnings.push("Hindi ligtas matukoy ang amount. Pakilagay mula sa mismong resibo.");
  if (!reference) warnings.push("Hindi ligtas matukoy ang reference number. Pakikopya mula sa mismong resibo.");
  if (!date) warnings.push("Hindi mabasa nang malinaw ang transaction date.");
  if (!time) warnings.push("Hindi mabasa nang malinaw ang transaction time.");
  if (confidence && confidence < 65) warnings.push("Mababa ang OCR confidence. Pakisuri nang mabuti ang mga field bago i-save.");

  onProgress("Tapos na ang Amazon Textract OCR.", 1);
  return {
    engine: result.engine || "Amazon Textract AnalyzeExpense",
    text,
    method,
    amount,
    reference,
    date,
    time,
    confidence,
    summaryFields: result.summaryFields || [],
    warnings
  };
}
