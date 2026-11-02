# BPI Reference Number Safety Fix

This update corrects the previous close-up OCR behavior.

Previously, the close-up OCR could win by majority even if it included extra digits or disagreed with the full-receipt OCR. It will no longer overwrite the full-receipt reference number.

New behavior:
- The full-image OCR and close-up OCR must produce exactly the same reference number.
- If they disagree, the reference field is left blank and a manual-review warning is shown.
- It will not guess or automatically replace one digit with another.

All existing shift setup, staff choices, GCash amount/reference improvements, and five-pass OCR files from the previous BPI-fix package are retained.

Install:
1. Back up the current GitHub project.
2. Extract this ZIP and replace the project files in the repository, keeping folder structure.
3. No new Supabase SQL or API key is needed.
4. Hard refresh with Ctrl+F5.

Review the reference against the original receipt and verify the payment in the BPI account before saving.
