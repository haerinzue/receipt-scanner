OCR FIELD CONSENSUS UPDATE

- All five Tesseract image variants now contribute candidates separately for payment method, amount, reference number, transaction date and transaction time.
- Each field is resolved independently. A field is not forced to use the values from the single globally highest-scoring OCR pass.
- When competing values exist, the update prefers a value repeated by at least two image variants. If there is no repeat, it leaves the conflicting field blank rather than silently choosing a potentially wrong value.
- BPI Confirmation No. uses the targeted close-up crop. It auto-fills when at least two Tesseract segmentation passes agree and the independent OCRAD result agrees with that crop result. The full-image read remains diagnostic because it can include nearby digits.
- The existing app.js automatically puts the resulting date, time, amount and reference number into their corresponding form fields. Existing admin/shift, Supabase, save and history code is retained.
- This is a free, browser-side OCR update. It does not use a paid API or require downloading a new OCR model.

IMPORTANT: OCR cannot guarantee perfect transcription from glare, blur, perspective distortion or low-resolution screenshots. Review the filled values before saving, especially long reference numbers.
