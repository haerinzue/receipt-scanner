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
  const anchors = [
    /total\s*(?:amount|payment)/i, /amount\s*(?:sent|paid|transferred)/i,
    /transaction\s*amount/i, /transfer\s*amount/i, /^amount\b/i,
    ...(provider === 'Maya' ? [/sent\s*money/i] : [])
  ];
  const moneyRe = /(?:PHP|₱|P\s*)\s*([0-9][0-9,]*\.\d{2})|([0-9][0-9,]*\.\d{2})\s*(?:PHP|₱)/i;
  for (let i=0;i<lines.length;i++) {
    if (anchors.some(r=>r.test(lines[i]))) {
      for (let j=i;j<=Math.min(i+2,lines.length-1);j++) {
        const m=lines[j].match(moneyRe);
        if(m) return (m[1]||m[2]).replace(/,/g,'');
      }
    }
  }
  // Conservative fallback: currency-marked amount only, not arbitrary numbers.
  const marked=[...norm(text).matchAll(/(?:PHP|₱)\s*([0-9][0-9,]*\.\d{2})/gi)];
  return marked.length ? marked[0][1].replace(/,/g,'') : '';
}

function parseReference(text, provider) {
  const lines=linesOf(text);
  const label=/reference\s*(?:number|no\.?|#|id)?|ref(?:erence)?\s*(?:no\.?|#|id)|transaction\s*(?:number|no\.?|#|id)|trace\s*(?:number|no\.?|#)|confirmation\s*(?:number|no\.?|#)/i;
  for(let i=0;i<lines.length;i++) {
    if(!label.test(lines[i])) continue;
    let tail=lines[i].replace(/^.*?(?:reference\s*(?:number|no\.?|#|id)?|ref(?:erence)?\s*(?:no\.?|#|id)|transaction\s*(?:number|no\.?|#|id)|trace\s*(?:number|no\.?|#)|confirmation\s*(?:number|no\.?|#))\s*[:#-]?\s*/i,'');
    let candidates=[tail,lines[i+1]||''];
    for(let candidate of candidates) {
      candidate=candidate.replace(/\b(?:date|time|amount|paid|sent)\b/ig,'').trim();
      const tokens=candidate.match(/[A-Z0-9][A-Z0-9 -]{4,39}/ig)||[];
      for(let token of tokens) {
        let value=token.replace(/[^A-Z0-9]/gi,'').toUpperCase();
        if(provider==='Maya' && /^[A-Z0-9]{6,40}$/.test(value)) return value;
        if((provider==='GCash'||provider==='BPI') && /^\d{6,30}$/.test(value)) return value;
        // Provider unknown: allow only long numeric IDs, never guess a short fragment.
        if(!provider && /^\d{8,30}$/.test(value)) return value;
      }
    }
  }
  return '';
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
      confidence:Math.round(Number(rec.data.confidence)||0),pass:v.name,numericDate:dt.numericDate};
    if(r.date) dateSet.add(r.date); if(r.time) timeSet.add(r.time);
    if(!best||score(r)>score(best)) best=r;
  }
  best.warnings=[];
  if(!best.method) best.warnings.push('Hindi matukoy ang payment method; piliin ito nang mano-mano.');
  if(!best.amount) best.warnings.push('Hindi ligtas matukoy ang amount. Pakilagay mula sa mismong resibo.');
  if(!best.reference) best.warnings.push('Hindi ligtas matukoy ang reference number. Pakikopya mula sa mismong resibo.');
  if(!best.date) best.warnings.push('Hindi mabasa nang malinaw ang transaction date.');
  if(!best.time) best.warnings.push('Hindi mabasa nang malinaw ang transaction time.');
  if(dateSet.size>1) { best.date=''; best.warnings.push('Hindi pare-pareho ang petsang nabasa sa OCR attempts; pakikumpirma sa resibo.'); }
  if(timeSet.size>1) { best.time=''; best.warnings.push('Hindi pare-pareho ang oras na nabasa; pakikumpirma sa resibo.'); }
  if(best.numericDate) best.warnings.push('Numeric date format ang nabasa. Pakikumpirma kung tama ang buwan at araw.');
  if(best.confidence<60) best.warnings.push('Mababa ang overall OCR confidence. Gumamit ng malinaw at tuwid na screenshot kung maaari.');
  return best;
}
