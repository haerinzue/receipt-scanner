/* Improved local OCR for GCash, Maya and BPI screenshots.
   Tesseract runs in the browser; no paid API or server-side AI is used.
   OCR is not proof of payment. Always verify against the provider account. */

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const norm = s => String(s || '').replace(/[：]/g, ':').replace(/[，]/g, ',').replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');

function linesOf(text) { return norm(text).split(/\r?\n/).map(clean).filter(Boolean); }

function preprocess(dataUrl, mode) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 3000;
      const scale = Math.min(2.5, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const frame = ctx.getImageData(0, 0, c.width, c.height);
      const d = frame.data;
      for (let i=0; i<d.length; i+=4) {
        const g = .299*d[i] + .587*d[i+1] + .114*d[i+2];
        let v = g;
        if (mode === 'contrast') v = Math.max(0, Math.min(255, (g-128)*1.55+128));
        if (mode === 'bright') v = Math.max(0, Math.min(255, 255*Math.pow(g/255,.78)));
        if (mode === 'threshold') v = g > 172 ? 255 : 0;
        if (mode === 'soft') v = Math.max(0, Math.min(255, (g-105)*1.25+145));
        d[i]=d[i+1]=d[i+2]=v;
      }
      ctx.putImageData(frame,0,0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Hindi mabuksan ang image.'));
    img.src = dataUrl;
  });
}

function detectProvider(text) {
  const s = text.toLowerCase();
  if (/\bmaya\b|paymaya/.test(s)) return 'Maya';
  if (/gcash|g-xchange|g\s*cash/.test(s)) return 'GCash';
  if (/\bbpi\b|bank of the philippine islands/.test(s)) return 'BPI';
  return '';
}

function parseAmount(text, provider) {
  const lines = linesOf(text);
  const moneyToken = /(?:PHP|₱|P\s*|[£$])\s*([0-9][0-9,]*(?:\.\d{1,2})?)|([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:PHP|₱)/i;
  const numericToken = /(?:₱|PHP|P\s*)?\s*([0-9][0-9,]*\.\d{2})\b/i;
  const labelRules = [
    /total\s*amount\s*sent/i,
    /total\s*(?:amount|payment)/i,
    /amount\s*(?:sent|paid|transferred)/i,
    /transaction\s*amount/i,
    /transfer\s*amount/i,
    /^amount\b/i
  ];

  // Prefer explicit "Total Amount Sent" / transaction amount labels.
  // GCash screenshots often OCR the peso sign incorrectly or omit it.
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const priority = labelRules.findIndex(r => r.test(line));
    if (priority < 0) continue;
    const nearby = [line, lines[i + 1] || "", lines[i + 2] || ""].join(" ");
    const currency = nearby.match(moneyToken);
    const numeric = nearby.match(numericToken);
    const raw = currency ? (currency[1] || currency[2]) : numeric?.[1];
    if (raw) {
      const value = Number(raw.replace(/,/g, ""));
      if (Number.isFinite(value) && value > 0 && value < 100000000) {
        candidates.push({ value, priority, distance: i });
      }
    }
  }
  if (candidates.length) {
    candidates.sort((a,b) => a.priority-b.priority || a.distance-b.distance);
    return candidates[0].value.toFixed(2);
  }

  // Fallback only to a clearly currency-marked value; avoid arbitrary IDs/dates.
  const marked = [...norm(text).matchAll(/(?:PHP|₱|P\s*|[£$])\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi)];
  for (const m of marked) {
    const value = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0 && value < 100000000) return value.toFixed(2);
  }
  return "";
}
function parseReference(text, provider) {
  const lines = linesOf(text);
  const label = /\b(?:reference\s*(?:number|no\.?|#|id)?|ref(?:erence)?\s*(?:no\.?|#|id)|transaction\s*(?:number|no\.?|#|id)|trace\s*(?:number|no\.?|#)|confirmation\s*(?:number|no\.?|#))(?=\s|[:#.-]|$)/i;
  const cleanRef = value => {
    let v = String(value || "")
      .replace(/\b(?:date|time|amount|paid|sent|total|nov|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|dec)\b/ig, " ")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase();
    // OCR can add a trailing punctuation mark, but do not silently invent digits.
    if (provider === "GCash" || provider === "BPI") return /^\d{6,30}$/.test(v) ? v : "";
    if (provider === "Maya") return /^[A-Z0-9]{6,40}$/.test(v) ? v : "";
    return /^\d{8,30}$/.test(v) ? v : "";
  };

  for (let i = 0; i < lines.length; i++) {
    if (!label.test(lines[i])) continue;
    const tail = lines[i].replace(/^.*?\b(?:reference\s*(?:number|no\.?|#|id)?|ref(?:erence)?\s*(?:no\.?|#|id)|transaction\s*(?:number|no\.?|#|id)|trace\s*(?:number|no\.?|#)|confirmation\s*(?:number|no\.?|#))\s*[:#.-]?\s*/i, "");
    // First try the remainder of the same line, then the next line.
    for (const candidate of [tail, lines[i + 1] || ""]) {
      const tokens = candidate.match(/[A-Z0-9][A-Z0-9 -]{5,39}/ig) || [];
      for (const token of tokens) {
        const ref = cleanRef(token);
        if (ref) return ref;
      }
      const compact = cleanRef(candidate);
      if (compact) return compact;
    }
  }

  // GCash commonly prints "Ref No." followed by a long numeric transaction ID.
  // This fallback still requires a nearby explicit reference label.
  const gcashRef = norm(text).match(/\bref(?:erence)?\s*(?:no\.?|number|#)?\s*[:.-]?\s*([0-9][0-9\s-]{5,35})/i);
  if (gcashRef) return cleanRef(gcashRef[1]);
  return "";
}
function parseDateTime(text) {
  const s=norm(text);
  let date='', time='';
  let m=s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if(m) date=`${m[3]}-${String(MONTHS[m[1].slice(0,3).toLowerCase()]).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  if(!date) {
    m=s.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+(20\d{2})\b/i);
    if(m) date=`${m[3]}-${String(MONTHS[m[2].slice(0,3).toLowerCase()]).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  if(!date) {
    m=s.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if(m) date=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  }
  // Numeric date is ambiguous in some formats. Accept MM/DD/YYYY as used by
  // common PH app screenshots, but flag it for manual review in the UI.
  let numericDate=false;
  if(!date) {
    m=s.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
    if(m) { date=`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; numericDate=true; }
  }
  const tm=s.match(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/i);
  if(tm) {
    let h=Number(tm[1])%12; if(tm[3].toUpperCase()==='PM') h+=12;
    time=`${String(h).padStart(2,'0')}:${tm[2]}`;
  } else {
    const h24=s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if(h24) time=`${h24[1].padStart(2,'0')}:${h24[2]}`;
  }
  return {date,time,numericDate};
}


async function readBpiConfirmationCrop(imageData, words) {
  if (!Array.isArray(words) || !words.length) return { tesseractCandidates: [], ocradText: '', ocradRef: '' };
  const marker = words.find(w => /confirm/i.test(w.text || ''));
  if (!marker || !marker.bbox) return { tesseractCandidates: [], ocradText: '', ocradRef: '' };
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = imageData; });
  const b = marker.bbox;
  // Isolate the single Confirmation No. line. The supplied BPI sample places
  // the 13-digit ID immediately after the label on the same line. Scanning to
  // the right edge of the whole receipt included unrelated text and weakened OCR.
  const markerHeight = Math.max(12, b.y1 - b.y0);
  const x1 = Math.max(0, Math.floor(b.x0 - 6));
  const x2 = Math.min(
    img.naturalWidth,
    Math.ceil(Math.max(b.x1 + img.naturalWidth * 0.34, b.x0 + img.naturalWidth * 0.52))
  );
  const y1 = Math.max(0, Math.floor(b.y0 - markerHeight * 0.28));
  const y2 = Math.min(img.naturalHeight, Math.ceil(b.y1 + markerHeight * 0.72));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, x2 - x1);
  canvas.height = Math.max(1, y2 - y1);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, x1, y1, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  // Upscale and enhance contrast without applying a hard threshold that can erase thin digits.
  const scale = Math.min(5, Math.max(2.5, 2200 / canvas.width));
  const enlarged = document.createElement('canvas');
  enlarged.width = Math.max(1, Math.round(canvas.width * scale));
  enlarged.height = Math.max(1, Math.round(canvas.height * scale));
  const ectx = enlarged.getContext('2d', { willReadFrequently: true });
  ectx.imageSmoothingEnabled = true;
  ectx.imageSmoothingQuality = 'high';
  ectx.drawImage(canvas, 0, 0, enlarged.width, enlarged.height);
  const pixels = ectx.getImageData(0, 0, enlarged.width, enlarged.height);
  // Normalize the photographed screen line while retaining thin digit strokes.
  for (let i = 0; i < pixels.data.length; i += 4) {
    const g = .299 * pixels.data[i] + .587 * pixels.data[i+1] + .114 * pixels.data[i+2];
    const v = Math.max(0, Math.min(255, (g - 142) * 1.9 + 142));
    pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = v;
  }
  ectx.putImageData(pixels, 0, 0);
  const crop = enlarged.toDataURL('image/png');
  const tesseractCandidates = [];
  let ocradText = '', ocradRef = '';
  // OCRAD is a genuinely separate local OCR engine. Keep its result separate
  // from Tesseract votes so it cannot accidentally count as a Tesseract pass.
  if (window.OCRAD) {
    try {
      // OCRAD gets its own high-contrast monochrome copy. It remains an
      // independent check and is never counted as a Tesseract pass.
      const mono = document.createElement('canvas');
      mono.width = enlarged.width;
      mono.height = enlarged.height;
      const mctx = mono.getContext('2d', { willReadFrequently: true });
      mctx.drawImage(enlarged, 0, 0);
      const mp = mctx.getImageData(0, 0, mono.width, mono.height);
      for (let i = 0; i < mp.data.length; i += 4) {
        const g = mp.data[i];
        const v = g < 176 ? 0 : 255;
        mp.data[i] = mp.data[i+1] = mp.data[i+2] = v;
      }
      mctx.putImageData(mp, 0, 0);
      ocradText = String(window.OCRAD(mono, { numeric: true }) || '').trim();
      const digits = ocradText.replace(/\D/g, '');
      const matches = digits.match(/\d{10,20}/g) || [];
      ocradRef = matches.find(v => v.length === 13) || matches[0] || '';
    } catch (e) { ocradText = ''; ocradRef = ''; }
  }
  for (const psm of [7, 8, 13]) {
    const r = await window.Tesseract.recognize(crop, 'eng', {
      tessedit_pageseg_mode: psm,
      tessedit_char_whitelist: '0123456789',
      preserve_interword_spaces: '1'
    });
    const digits = String(r.data.text || '').replace(/\D/g, '');
    const matches = digits.match(/\d{10,20}/g) || [];
    tesseractCandidates.push(...matches);
  }
  return { tesseractCandidates, ocradText, ocradRef };
}

function score(r) {
  return (r.method?8:0)+(r.amount?9:0)+(r.reference?10:0)+(r.date?4:0)+(r.time?3:0)+Math.min(5,(r.text||'').length/140)+(Number(r.confidence)||0)/100;
}

export async function readReceipt(imageData,onProgress=()=>{}) {
  if(!window.Tesseract) throw new Error('Hindi ma-load ang Tesseract OCR library.');
  const variants=[
    {name:'Original',image:imageData,psm:6},
    {name:'Enhanced contrast',image:await preprocess(imageData,'contrast'),psm:6},
    {name:'Brightened',image:await preprocess(imageData,'bright'),psm:6},
    {name:'Soft contrast',image:await preprocess(imageData,'soft'),psm:11},
    {name:'Black and white',image:await preprocess(imageData,'threshold'),psm:11}
  ];
  let best=null; const dateSet=new Set(),timeSet=new Set();
  for(let i=0;i<variants.length;i++) {
    const v=variants[i];
    onProgress(`OCR ${i+1}/${variants.length}: ${v.name}`,i/variants.length);
    const rec=await window.Tesseract.recognize(v.image,'eng',{
      logger:m=>{if(m.status) onProgress(`${v.name}: ${m.status}`,(i+(m.progress||0))/variants.length);},
      tessedit_pageseg_mode:v.psm,
      preserve_interword_spaces:'1'
    });
    const text=rec.data.text||'';
    const method=detectProvider(text);
    const dt=parseDateTime(text);
    const r={text,method,amount:parseAmount(text,method),reference:parseReference(text,method),date:dt.date,time:dt.time,
      confidence:Math.round(Number(rec.data.confidence)||0),pass:v.name,numericDate:dt.numericDate,words:rec.data.words||[],sourceImage:v.image};
    if(r.date) dateSet.add(r.date); if(r.time) timeSet.add(r.time);
    if(!best||score(r)>score(best)) best=r;
  }
  best.warnings=[];
  best.ocrEngines = window.OCRAD ? ["Tesseract.js", "OCRAD.js"] : ["Tesseract.js"];
  if (best.method === "BPI" && /confirm/i.test(best.text || "")) {
    try {
      const cropRead = await readBpiConfirmationCrop(best.sourceImage || imageData, best.words);
      const counts = new Map();
      for (const candidate of cropRead.tesseractCandidates) counts.set(candidate, (counts.get(candidate) || 0) + 1);
      const ranked = [...counts.entries()].sort((a,b) => b[1]-a[1]);
      const cropWinner = ranked.length && ranked[0][1] >= 2 &&
        (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : "";
      best.referenceDiagnostics = {
        fullImageTesseract: best.reference || "",
        closeupTesseract: cropWinner,
        closeupTesseractVotes: cropWinner ? counts.get(cropWinner) : 0,
        ocrad: cropRead.ocradRef || "",
        ocradLoaded: !!window.OCRAD
      };
      // The targeted confirmation-line crop is the primary source for the ID.
      // Accept a strict majority across the three independent Tesseract page
      // segmentation passes. OCRAD is an auxiliary cross-check, not a veto:
      // it can miss thin digits in photos of another phone screen.
      if (cropWinner) {
        best.reference = cropWinner;
        best.referenceCheck = "closeup-tesseract-majority";
        if (cropRead.ocradRef && cropRead.ocradRef !== cropWinner) {
          best.warnings.push("May pagkakaiba ang OCRAD at close-up Tesseract. Ginamit ang numerong may majority sa close-up Tesseract; pakitingnan ang reference sa orihinal na resibo.");
        } else if (!cropRead.ocradRef) {
          best.warnings.push("Walang malinaw na OCRAD cross-check. Ginamit ang majority reading ng close-up Tesseract; pakitingnan ang reference sa orihinal na resibo.");
        }
        if (best.referenceDiagnostics.fullImageTesseract &&
            best.referenceDiagnostics.fullImageTesseract !== cropWinner) {
          best.warnings.push("Iba ang full-image OCR. Mas binigyan ng bigat ang close-up Tesseract majority dahil nakatutok ito sa Confirmation No.");
        }
      } else if (cropRead.ocradRef && cropRead.tesseractCandidates.includes(cropRead.ocradRef)) {
        // If Tesseract has no strict majority, accept only an exact match
        // between at least one targeted Tesseract pass and OCRAD.
        best.reference = cropRead.ocradRef;
        best.referenceCheck = "closeup-cross-engine-match";
      } else {
        best.reference = "";
        best.referenceCheck = "needs-manual-check";
        best.warnings.push("Walang sapat na pagkakatugma sa close-up OCR para sa BPI Confirmation No. Iniwan itong blanko sa halip na manghula.");
      }
    } catch (e) {
      best.reference = "";
      best.referenceCheck = "needs-manual-check";
      best.referenceDiagnostics = { fullImageTesseract: "", closeupTesseract: "", ocrad: "", ocradLoaded: !!window.OCRAD, error: "close-up-check-failed" };
      best.warnings.push("Hindi nakumpleto ang BPI reference cross-check. Pakikopya nang mano-mano mula sa orihinal na resibo.");
    }
  }
  if(!best.method) best.warnings.push('Hindi matukoy ang payment method; piliin ito nang mano-mano.');
  if(!best.amount) best.warnings.push('Hindi ligtas matukoy ang amount. Pakilagay mula sa mismong resibo.');
  if(!best.reference) best.warnings.push('Hindi ligtas matukoy ang reference number. Pakikopya mula sa mismong resibo.');
  if(!best.date) best.warnings.push('Hindi mabasa nang malinaw ang transaction date.');
  if(!best.time) best.warnings.push('Hindi mabasa nang malinaw ang transaction time.');
  if(dateSet.size>1) { best.date=''; best.warnings.push('Hindi pare-pareho ang petsang nabasa sa OCR attempts; pakikumpirma sa resibo.'); }
  if(timeSet.size>1) { best.time=''; best.warnings.push('Hindi pare-pareho ang oras na nabasa; pakikumpirma sa resibo.'); }
  if(best.numericDate) best.warnings.push('Numeric date format ang nabasa. Pakikumpirma kung tama ang buwan at araw.');
  if(best.confidence<60) best.warnings.push('Mababa ang overall OCR confidence. Gumamit ng malinaw at tuwid na screenshot kung maaari.');
  delete best.words;
  delete best.sourceImage;
  return best;
}
