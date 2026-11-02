# Receipt Scanner – GCash Amount & Reference Recognition Update

This update improves OCR field extraction for receipts where:
- GCash "Total Amount Sent" is read without the peso sign or with a misread currency symbol.
- The amount appears on an "Amount" / "Total Amount Sent" line.
- The reference label is printed as "Ref No.".

It keeps the five-pass image preprocessing and conservative validation. If the OCR cannot confidently identify a value, it leaves the field blank for manual review.

Install:
1. Back up your current GitHub Pages project.
2. Replace the project files with this ZIP's contents, preserving folders.
3. No new Supabase SQL is required.
4. Hard refresh with Ctrl+F5.

This is still local Tesseract OCR, not a guarantee of exact reading. Check every field against the receipt and verify payment in the provider account.
