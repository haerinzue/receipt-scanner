/* PaddleOCR PP-OCRv6 Small, running locally in the browser.
   Images are processed on-device; no OCR API or paid service is used.
   The SDK/model are cached by the browser after their first download. */

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const norm = s => String(s || '').replace(/[：]/g, ':').replace(/[，]/g, ',').replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
function linesOf(text) { return norm(text).split(/\r?\n/).map(clean).filter(Boolean); }

let paddlePromise;
async function getPaddleOCR(onProgress) {
  if (!paddlePromise) {
    paddlePromise = (async () => {
      onProgress('Unang load: kinukuha ang PaddleOCR Small model (31.2 MB). Ise-save ito sa browser cache.', 0.04);
      const { PaddleOCR } = await import('https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm');
      const engine = await PaddleOCR.create({
        lang: 'en',
        ocrVersion: 'PP-OCRv6',
        ortOptions: { backend: 'auto' }
      });
      return engine;
    })().catch(err => { paddlePromise = null; throw err; });
  }
  return paddlePromise;
}

function makeEnhancedCanvas(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 2600;
      const scale = Math.min(2, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = frame.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = .299*d[i] + .587*d[i+1] + .114*d[i+2];
        const v = Math.max(0, Math.min(255, (g - 118) * 1.35 + 138));
        d[i] = d[i+1] = d[i+2] = v;
      }
      ctx.putImageData(frame, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Hindi mabuksan ang image.'));
    img.src = dataUrl;
  });
}

function orderedTextItems(items) {
  return (items || []).filter(x => clean(x.text)).map(x => {
    const p = Array.isArray(x.poly) ? x.poly : [];
    const ys = p.map(v => Number(v[1])).filter(Number.isFinite);
    const xs = p.map(v => Number(v[0])).filter(Number.isFinite);
    return { text: clean(x.text), score: Number(x.score) || 0,
      y: ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0,
      x: xs.length ? Math.min(...xs) : 0,
      height: ys.length ? Math.max(1, Math.max(...ys) - Math.min(...ys)) : 1,
      poly: p };
  }).sort((a,b) => a.y - b.y || a.x - b.x);
}

function detectProvider(text) {
  const s = text.toLowerCase();
  if (/\bmaya\b|paymaya/.test(s)) return 'Maya';
  if (/gcash|g-xchange|g\s*cash/.test(s)) return 'GCash';
  if (/\bbpi\b|bank of the philippine islands/.test(s)) return 'BPI';
  return '';
}

function parseAmount(text) {
  const lines = linesOf(text);
  const labelRules = [/total\s*amount\s*sent/i,/total\s*(?:amount|payment)/i,/amount\s*(?:sent|paid|transferred)/i,/transaction\s*amount/i,/transfer\s*amount/i,/^amount\b/i];
  for (let i = 0; i < lines.length; i++) {
    if (!labelRules.some(r => r.test(lines[i]))) continue;
    const nearby = [lines[i], lines[i+1] || '', lines[i+2] || ''].join(' ');
    const m = nearby.match(/(?:PHP|₱|P\s*)\s*([0-9][0-9,]*(?:\.\d{1,2})?)|\b([0-9][0-9,]*\.\d{2})\b/i);
    const raw = m && (m[1] || m[2]);
    if (raw) { const n = Number(raw.replace(/,/g,'')); if (n > 0 && n < 100000000) return n.toFixed(2); }
  }
  const marked = norm(text).match(/(?:PHP|₱|P\s*)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  if (marked) { const n = Number(marked[1].replace(/,/g,'')); if (n > 0 && n < 100000000) return n.toFixed(2); }
  return '';
}

function parseReference(text, provider) {
  const lines = linesOf(text);
  const label = /\b(?:reference\s*(?:number|no\.?|#|id)?|ref(?:erence)?\s*(?:no\.?|#|id)|transaction\s*(?:number|no\.?|#|id)|trace\s*(?:number|no\.?|#)|confirmation\s*(?:number|no\.?|#))(?=\s|[:#.-]|$)/i;
  const cleanRef = value => {
    const v = String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (provider === 'GCash' || provider === 'BPI') return /^\d{6,30}$/.test(v) ? v : '';
    if (provider === 'Maya') return /^[A-Z0-9]{6,40}$/.test(v) ? v : '';
    return /^\d{8,30}$/.test(v) ? v : '';
  };
  for (let i = 0; i < lines.length; i++) {
    if (!label.test(lines[i])) continue;
    const tail = lines[i].replace(/^.*?\b(?:reference\s*(?:number|no\.?|#|id)?|ref(?:erence)?\s*(?:no\.?|#|id)|transaction\s*(?:number|no\.?|#|id)|trace\s*(?:number|no\.?|#)|confirmation\s*(?:number|no\.?|#))\s*[:#.-]?\s*/i, '');
    for (const candidate of [tail, lines[i+1] || '']) {
      const tokens = candidate.match(/[A-Z0-9][A-Z0-9 -]{5,39}/ig) || [];
      for (const token of tokens) { const ref = cleanRef(token); if (ref) return ref; }
      const compact = cleanRef(candidate); if (compact) return compact;
    }
  }
  return '';
}

function parseDateTime(text) {
  const s = norm(text); let date = '', time = '', numericDate = false;
  let m = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (m) date = `${m[3]}-${String(MONTHS[m[1].slice(0,3).toLowerCase()]).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  if (!date) { m = s.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+(20\d{2})\b/i); if (m) date = `${m[3]}-${String(MONTHS[m[2].slice(0,3).toLowerCase()]).padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  if (!date) { m = s.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/); if (m) date = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`; }
  if (!date) { m = s.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/); if (m) { date = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; numericDate = true; } }
  const tm = s.match(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/i);
  if (tm) { let h = Number(tm[1]) % 12; if (tm[3].toUpperCase() === 'PM') h += 12; time = `${String(h).padStart(2,'0')}:${tm[2]}`; }
  else { const h24 = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/); if (h24) time = `${h24[1].padStart(2,'0')}:${h24[2]}`; }
  return { date, time, numericDate };
}

function resultFromItems(items, passName) {
  const ordered = orderedTextItems(items);
  const text = ordered.map(x => x.text).join('\n');
  const method = detectProvider(text);
  const dt = parseDateTime(text);
  const confidence = ordered.length ? Math.round(ordered.reduce((a,x) => a + x.score, 0) / ordered.length * 100) : 0;
  return { text, method, amount: parseAmount(text), reference: parseReference(text, method), date: dt.date, time: dt.time,
    confidence, pass: passName, numericDate: dt.numericDate, items: ordered };
}
function quality(r) { return (r.method?8:0)+(r.amount?9:0)+(r.reference?12:0)+(r.date?4:0)+(r.time?3:0)+r.confidence/100; }

export async function readReceipt(imageData, onProgress = () => {}) {
  const ocr = await getPaddleOCR(onProgress);
  onProgress('PaddleOCR: binabasa ang orihinal na larawan...', 0.18);
  const originalBlob = await (await fetch(imageData)).blob();
  const [originalResult] = await ocr.predict(originalBlob, { textRecScoreThresh: 0.15 });
  let best = resultFromItems(originalResult?.items, 'PP-OCRv6 Small · Original');
  onProgress('PaddleOCR: sinusuri rin ang enhanced image...', 0.62);
  try {
    const enhanced = await makeEnhancedCanvas(imageData);
    const [enhancedResult] = await ocr.predict(enhanced, { textRecScoreThresh: 0.15 });
    const candidate = resultFromItems(enhancedResult?.items, 'PP-OCRv6 Small · Enhanced');
    if (quality(candidate) > quality(best)) best = candidate;
  } catch (e) {
    best.warnings = ['Hindi nakumpleto ang enhanced-image pass; ginamit ang original-image OCR.'];
  }
  best.warnings = best.warnings || [];
  best.ocrEngines = ['PaddleOCR PP-OCRv6 Small'];
  if (best.method === 'BPI') {
    const confirmationLine = linesOf(best.text).find(line => /confirm/i.test(line));
    const lineDigits = confirmationLine ? confirmationLine.replace(/\D/g, '') : '';
    const strictBpiRef = lineDigits.match(/^\d{13}$/);
    if (strictBpiRef) {
      best.reference = strictBpiRef[0];
      best.referenceCheck = 'paddle-confirmation-line';
      best.referenceDiagnostics = { confirmationLine: strictBpiRef[0], engine: 'PaddleOCR PP-OCRv6 Small' };
    } else if (confirmationLine) {
      best.reference = '';
      best.referenceCheck = 'needs-manual-check';
      best.referenceDiagnostics = { confirmationLine: lineDigits.slice(-4), engine: 'PaddleOCR PP-OCRv6 Small' };
      best.warnings.push('Nakita ang Confirmation No. line pero hindi kumpleto o hindi malinaw ang 13-digit number. Pakikopya mula sa orihinal na resibo.');
    }
  }
  if (!best.method) best.warnings.push('Hindi matukoy ang payment method; piliin ito nang mano-mano.');
  if (!best.amount) best.warnings.push('Hindi ligtas matukoy ang amount. Pakilagay mula sa mismong resibo.');
  if (!best.reference) best.warnings.push('Hindi ligtas matukoy ang reference number. Pakikopya mula sa mismong resibo.');
  if (!best.date) best.warnings.push('Hindi mabasa nang malinaw ang transaction date.');
  if (!best.time) best.warnings.push('Hindi mabasa nang malinaw ang transaction time.');
  if (best.numericDate) best.warnings.push('Numeric date format ang nabasa. Pakikumpirma kung tama ang buwan at araw.');
  if (best.confidence < 65) best.warnings.push('Mababa ang OCR confidence. Pakisuri nang mabuti ang mga field bago i-save.');
  delete best.items;
  return best;
}
