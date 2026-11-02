# Receipt Scanner – BPI Confirmation Number Accuracy Fix

This update adds a focused close-up OCR check for the BPI "Confirmation No." row:
- It locates the confirmation label from OCR word positions.
- It crops and enlarges that row.
- It runs three digit-focused OCR reads.
- It uses a close-up result only when at least two reads agree.
- If full-image and close-up reads conflict, it leaves the reference blank and asks for manual review rather than guessing.

The existing five-pass OCR and GCash amount/reference improvements remain included.

Install:
1. Back up the current GitHub Pages project.
2. Extract this ZIP and replace the project files in the repository, keeping folder structure.
3. No new Supabase SQL or API key is needed.
4. Hard refresh the site with Ctrl+F5.

Important: OCR can still misread digits. Review the reference number against the original receipt and verify payment in the BPI account before relying on it.
