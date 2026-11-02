
const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04",
  may: "05", jun: "06", jul: "07", aug: "08",
  sep: "09", oct: "10", nov: "11", dec: "12"
};

function detectProvider(text) {
  const s = text.toLowerCase();

  if (/gcash|g-xchange|g\s*cash/.test(s)) return "GCash";
  if (/\bmaya\b|paymaya/.test(s)) return "Maya";
  if (/\bbpi\b|bank of the philippine islands/.test(s)) return "BPI";

  return "";
}

function parseAmount(text) {
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (/amount|total amount sent|total/i.test(line)) {
      const match = line.match(
        /(?:₱|PHP)?\s*([0-9,]+\.\d{2})/i
      );

      if (match) return match[1].replace(/,/g, "");
    }
  }

  return "";
}

function parseReference(text) {
  const patterns = [
    /(?:reference|ref)\s*(?:no\.?|number|id)?\s*[:#-]?\s*([0-9][0-9\s-]{5,})/i,
    /transaction\s*id\s*[:#-]?\s*([A-Z0-9\s-]{6,})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return match[1].trim().replace(/\s+/g, "").replace(/-+/g, "");
    }
  }

  return "";
}

function parseDateTime(text) {
  let date = "";
  let time = "";

  // Example: Nov 03, 2026
  let match = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20\d{2})\b/i
  );

  if (match) {
    const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
    date = `${match[3]}-${month}-${match[2].padStart(2, "0")}`;
  } else {
    // Example: 2026-11-03
    match = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);

    if (match) {
      date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    }
  }

  // Example: 1:06 AM
  match = text.match(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/i);

  if (match) {
    let hour = Number(match[1]) % 12;

    if (match[3].toUpperCase() === "PM") hour += 12;

    time = `${String(hour).padStart(2, "0")}:${match[2]}`;
  } else {
    match = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);

    if (match) {
      time = `${match[1].padStart(2, "0")}:${match[2]}`;
    }
  }

  return { date, time };
}

export async function readReceipt(imageData, onProgress = () => {}) {
  if (!window.Tesseract) {
    throw new Error("Hindi ma-load ang OCR library.");
  }

  const result = await window.Tesseract.recognize(
    imageData,
    "eng",
    {
      logger: message => {
        if (message.status) {
          onProgress(message.status, message.progress || 0);
        }
      }
    }
  );

  const text = result.data.text || "";
  const dateTime = parseDateTime(text);

  return {
    text,
    method: detectProvider(text),
    amount: parseAmount(text),
    reference: parseReference(text),
    date: dateTime.date,
    time: dateTime.time
  };
}
