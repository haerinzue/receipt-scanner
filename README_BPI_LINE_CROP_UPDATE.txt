BPI CONFIRMATION LINE CROP UPDATE

This update narrows the BPI Confirmation No. crop to the line containing the label and number, rather than extending to the far edge of the receipt. It also creates a separate high-contrast monochrome image for OCRAD before its independent read.

The supplied sample's visible confirmation number is 1629907847689. This value is a test reference only; it is NOT hardcoded into the scanner.

Safety remains unchanged: the app must not guess or auto-fill a BPI reference when the full-image Tesseract, targeted Tesseract crop, and OCRAD readings do not agree exactly. Manual review is still required.

Validation performed: JavaScript syntax check only. Actual browser OCR accuracy must be tested after deployment with the original receipt image.
