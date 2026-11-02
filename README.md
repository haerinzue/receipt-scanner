# Receipt Scanner + Supabase (PaddleOCR build)

## OCR update
- Replaced Tesseract.js/OCRAD.js with the official browser SDK `@paddleocr/paddleocr-js` using PP-OCRv6 Small (`lang: en`).
- The OCR runs locally in the cashier's browser. Receipt images are not sent to a hosted OCR API.
- The first scan downloads the PaddleOCR Small model (about 31.2 MB). The browser caches the SDK/model assets for later visits; normal internet access is needed for the initial load.
- The OCR reads the original image and an enhanced copy, then selects the stronger field result. Text line polygons and confidence scores are used to preserve line-level reading order.
- For BPI, the Confirmation No. is only auto-filled when the confirmation line contains exactly 13 digits. Otherwise it is left blank for manual correction.
- OCR is approximate. Staff must review all fields before saving and independently check the payment in the provider account.

## Preserved existing features
- Supabase email/password login and cloud receipt storage.
- Camera capture and image upload.
- Staff/admin selection and shift assignment.
- Saved receipt history, search, staff filter and shift filter.
- Existing database schema, storage bucket, and save workflow.

## Files
- `index.html` – website interface and browser library loading
- `css/style.css` – design
- `js/config.js` – Supabase URL and publishable key
- `js/supabase.js` – Supabase client
- `js/auth.js` – login/logout
- `js/ocr.js` – PaddleOCR engine and field parsing (OCR-only replacement)
- `js/database.js` – database and private image storage
- `js/app.js` – app behavior; only OCR status text was updated

## Deploy to GitHub Pages
Upload the contents of this folder to the root of the GitHub repository and allow GitHub Pages to deploy from the selected branch. Camera access requires HTTPS or localhost.

## Supabase safety
- Keep the publishable key in `js/config.js`; never put a service_role/secret key in frontend code.
- Keep RLS enabled and review policies before production use.
\n\n## Receipt management update\nSee `README_REPORT_DELETE_DUPLICATE.txt` and run `RECEIPT_REPORT_DELETE_DUPLICATE_SETUP.sql` before enabling delete and database-level duplicate protection.\n