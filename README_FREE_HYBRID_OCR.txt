FREE HYBRID OCR TEST BUILD

- Tesseract.js remains the primary OCR engine and runs in the browser.
- OCRAD.js is added as a second independent browser-side OCR engine.
- Both run locally in the user's browser; receipt images are not sent to a paid OCR API.
- BPI confirmation number remains conservative: the app only autofills when the existing Tesseract full-image/crop checks agree and the independent OCR check does not conflict. Otherwise it leaves the field blank for manual confirmation.
- OCRAD.js is an experimental secondary check and may be less accurate than Tesseract. It is not guaranteed to improve recognition. Test with real GCash, Maya and BPI screenshots before using in production.
- Keep cashier review and verify payment in the provider's account. OCR output is not proof of payment.

This build preserves the existing login, staff/shift selection, Supabase database/storage, and receipt history files from the strict-reference safety build.


UI LABEL UPDATE:
- Button: Basahin gamit ang Hybrid OCR
- Status: Tapos ang Hybrid OCR
- Note: Tesseract ang pangunahing multi-pass OCR; OCRAD ay dagdag na cross-check para sa BPI confirmation reference kung available. Hindi ito garantiya ng 100% accuracy.


HYBRID OCR CROSS-CHECK UPDATE
- Tesseract close-up candidates and OCRAD output are stored separately; OCRAD is no longer accidentally counted as a Tesseract pass.
- BPI confirmation row crop starts near the Confirmation label to reduce unrelated digits.
- BPI reference is auto-filled only when full-image Tesseract, close-up Tesseract majority, and OCRAD all return the exact same number. Otherwise it stays blank for manual review.
- The status line displays masked last-four-digit diagnostics for each engine.
- This is a conservative accuracy/safety improvement, not a guarantee of correct OCR.
