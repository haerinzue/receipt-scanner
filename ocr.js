/* Receipt OCR: multi-pass image enhancement + provider-aware parsing.
   OCR is an aid only. Always verify payment in the provider's official account. */

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

function normalizeOcrText(text) {
  return String(text || '')
    .replace(/[：]/g, ':').replace(/[，]/g, ',')
    .replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
}

function enhanceImage(dataUrl, mode = 'contrast') {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 2600;
      const scale = Math.min(2.2, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = frame.data;
      for (let i = 0; i < d.length; i += 4) {
        let gray = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
        if (mode === 'threshold') gray = gray > 165 ? 255 : 0;
        else if (mode === 'contrast') gray = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 140));
        else if (mode === 'brighten') gray = Math.max(0, Math.min(255, 255 * Math.pow(gray / 255, 0.72)));
        else if (mode === 'soft') gray = Math.max(0, Math.min(255, (gray - 110) * 1.18 + 150));
        d[i] = d[i+1] = d[i+2] = gray;
      }
      ctx.putImageData(frame, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Hindi mabuksan ang image para sa enhancement.'));
    img.src = dataUrl;
  });
}

function detectProvider(text) {
  const s = text.toLowerCase();
  // Avoid treating a destination bank named GCash as definitive if Maya branding is present.
  if (/\bmaya\b|paymaya/.test(s)) return 'Maya';
  if (/gcash|g-xchange|g\s*cash/.test(s)) return 'GCash';
  if (/\bbpi\b|bank of the philippine islands/.test(s)) return 'BPI';
  return '';
}

function linesOf(text) { return normalizeOcrText(text).split(/\r?\n/).map(clean).filter(Boolean); }

function parseAmount(text, provider) {
  const lines = linesOf(text);
  const anchors = provider === 'Maya'
    ? [/total amount/i, /amount sent/i, /sent money/i, /transfer amount/i, /^[-–]\s*₱?/i]
    : [/total amount/i, /amount sent/i, /transfer amount/i, /transaction amount/i, /^amount\b/i, /paid/i];
  const money = /(?:PHP|₱|P\s*)?\s*-?\s*([\d,]+\.\d{2})/i;
  for (let i = 0; i < lines.length; i++) {
    if (anchors.some(re => re.test(lines[i]))) {
      const same = lines[i].match(money);
      if (same) return same[1].replace(/[\s,]/g, '');
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
        const next = lines[j].match(money);
        if (next) return next[1].replace(/[\s,]/g, '');
      }
    }
  }
  // Fallback only when a currency marker is present; do not guess from arbitrary numbers.
  const marked = [...text.matchAll(/(?:PHP|₱)\s*([\d,]+\.\d{2})/gi)];
  return marked.length ? marked[0][1].replace(/,/g, '') : '';
}

function parseReference(text, provider) {
  const lines = linesOf(text);
  const labels = provider === 'Maya'
    ? [/reference\s*(?:id|number|no\.?|#)?/i, /transaction\s*(?:id|number)/i]
    : [/reference\s*(?:number|no\.?|#)?/i, /ref\s*(?:id|no\.?|#)?/i, /transaction\s*(?:id|number)/i, /trace\s*(?:no\.?|number)/i, /confirmation\s*(?:no\.?|number)/i];
  for (let i = 0; i < lines.length; i++) {
    if (labels.some(re => re.test(lines[i]))) {
      let candidate = lines[i].replace(/.*?(?:reference\s*(?:id|number|no\.?|#)?|ref\s*(?:id|no\.?|#)?|transaction\s*(?:id|number)|trace\s*(?:no\.?|number)|confirmation\s*(?:no\.?|number))\s*[:#-]?/i, '');
      if (!/[A-Z0-9]{5,}/i.test(candidate) && lines[i+1]) candidate = lines[i+1];
      candidate = candidate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      // GCash/BPI reference values are treated as numeric here. Reject OCR-added
      // letters instead of silently saving a corrupted reference number.
      if (provider === 'GCash' || provider === 'BPI') {
        if (/^\d{5,30}$/.test(candidate)) return candidate;
      } else if (provider === 'Maya' && /^[A-Z0-9]{5,40}$/.test(candidate)) {
        return candidate;
      }
    }
  }
  return '';
}

function parseDateTime(text) {
  const s = normalizeOcrText(text);
  let date = '', time = '';
  let m = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (m) date = `${m[3]}-${String(MONTHS[m[1].slice(0,3).toLowerCase()]).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  if (!date) {
    m = s.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+(20\d{2})\b/i);
    if (m) date = `${m[3]}-${String(MONTHS[m[2].slice(0,3).toLowerCase()]).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  if (!date) {
    m = s.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (m) date = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  }
  if (!date) {
    m = s.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
    if (m) date = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  }
  // Prefer a time on the same line as a date/status, then any explicit clock time.
  const timeMatch = s.match(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/i);
  if (timeMatch) {
    let h = Number(timeMatch[1]) % 12;
    if (timeMatch[3].toUpperCase() === 'PM') h += 12;
    time = `${String(h).padStart(2,'0')}:${timeMatch[2]}`;
  } else {
    const h24 = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (h24) time = `${h24[1].padStart(2,'0')}:${h24[2]}`;
  }
  return { date, time };
}

function scoreResult(result) {
  const t = result.text || '';
  return (result.method ? 10 : 0) + (result.amount ? 8 : 0) + (result.reference ? 10 : 0) + (result.date ? 4 : 0) + (result.time ? 3 : 0) + Math.min(5, t.length / 120) + (Number(result.confidence) || 0) / 100;
}

function fieldConfidence(result) {
  const base = Math.max(0, Math.min(100, Number(result.confidence) || 0));
  return {
    method: result.method ? Math.min(98, Math.round(base * .75 + 20)) : 0,
    amount: result.amount ? Math.min(95, Math.round(base * .7 + 22)) : 0,
    reference: result.reference ? Math.min(95, Math.round(base * .72 + 18)) : 0,
    date: result.date ? Math.min(95, Math.round(base * .7 + 20)) : 0,
    time: result.time ? Math.min(95, Math.round(base * .7 + 20)) : 0
  };
}


export async function readReceipt(imageData, onProgress = () => {}) {
  if (!window.Tesseract) throw new Error('Hindi ma-load ang Tesseract OCR library.');
  const passes = [
    { label: 'Original image', image: imageData, psm: 6 },
    { label: 'Brightened image', image: await enhanceImage(imageData, 'brighten'), psm: 6 },
    { label: 'Soft contrast', image: await enhanceImage(imageData, 'soft'), psm: 6 },
    { label: 'High contrast', image: await enhanceImage(imageData, 'threshold'), psm: 11 }
  ];
  let best = null;
  const dateReads = [];
  const timeReads = [];
  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    onProgress(`OCR pass ${i+1}/4: ${pass.label}`, i/4);
    const rec = await window.Tesseract.recognize(pass.image, 'eng', {
      logger: m => { if (m.status) onProgress(`${pass.label}: ${m.status}`, (i + (m.progress || 0))/4); },
      tessedit_pageseg_mode: pass.psm,
      preserve_interword_spaces: '1'
    });
    const text = rec.data.text || '';
    const method = detectProvider(text);
    const dt = parseDateTime(text);
    const candidate = {
      text, method,
      amount: parseAmount(text, method),
      reference: parseReference(text, method),
      date: dt.date, time: dt.time,
      confidence: Math.round(Number(rec.data.confidence) || 0),
      pass: pass.label
    };
    candidate.fieldConfidence = fieldConfidence(candidate);
    candidate.warnings = [];
    if (candidate.date) dateReads.push(candidate.date);
    if (candidate.time) timeReads.push(candidate.time);
    if (!candidate.method) candidate.warnings.push('Hindi matukoy ang payment provider. Piliin ito nang mano-mano.');
    if (!candidate.amount) candidate.warnings.push('Hindi makita nang malinaw ang amount. Suriin ang halagang nasa resibo.');
    if (!candidate.reference) candidate.warnings.push('Hindi nakuha nang ligtas ang reference number. Kung may sobrang letra o numero sa OCR, huwag itong gamitin; ilagay mula sa mismong resibo.');
    if (!candidate.date || !candidate.time) candidate.warnings.push('Kulang ang petsa o oras; tingnan ang orihinal na resibo.');
    if (candidate.confidence < 65) candidate.warnings.push('Mababa ang OCR confidence. Mas mainam ang malinaw at tuwid na screenshot.');
    if (!best || scoreResult(candidate) > scoreResult(best)) best = candidate;
  }
  if (best) {
    const distinctDates = [...new Set(dateReads)];
    const distinctTimes = [...new Set(timeReads)];
    // Never silently choose a date/time when OCR passes disagree or the image read is weak.
    if (distinctDates.length > 1 || best.confidence < 60) {
      best.date = '';
      best.warnings.push('Hindi tiyak ang petsa dahil malabo o mababa ang OCR confidence. Pakikumpirma at ilagay ang petsa mula sa mismong resibo.');
    }
    if (distinctTimes.length > 1 || best.confidence < 45) {
      best.time = '';
      best.warnings.push('Pakikumpirma ang oras sa orihinal na resibo bago i-save.');
    }
    if (distinctDates.length > 1) best.warnings.push('Magkakaiba ang petsang nabasa sa iba’t ibang image pass; hindi kami pipili nang hulaan.');
  }
  return best || { text: '', method: '', amount: '', reference: '', date: '', time: '', confidence: 0, pass: '', fieldConfidence: {}, warnings: ['Walang tekstong nabasa.'] };
}
