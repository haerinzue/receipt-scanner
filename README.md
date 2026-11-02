# Receipt Auto Reader – OCR safety patch

This version keeps the existing Supabase setup and browser-only Tesseract OCR.

## Changes
- Four OCR passes remain enabled.
- Corrected progress display to use 4 passes.
- GCash and BPI reference extraction now rejects mixed letter/number strings instead of saving likely OCR contamination.
- Uncertain dates/times remain blank for cashier confirmation.

## Important
This is not AI vision and does not verify whether a payment reached the merchant account. Cashiers must verify payment in the official GCash, Maya, or BPI account before confirming an order.

Deploy by replacing the contents of the GitHub Pages repository with this folder's contents. Keep the existing Supabase project and table/bucket policies unchanged.
