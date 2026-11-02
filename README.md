# Receipt Scanner — improved OCR build

## What's improved
- Fixed JavaScript regex escaping in the OCR parser.
- Three OCR passes: original, grayscale/contrast-enhanced, and thresholded image.
- Provider detection for GCash, Maya/PayMaya, and BPI.
- Provider-aware amount/reference parsing plus date/time formats including `09 Oct 2026, 01:31AM` and `Oct 9, 2026, 09:25 PM`.
- Displays OCR confidence and selected pass in the status message.
- Preserves original uploaded/captured image for Supabase Storage upload.

## GitHub Pages layout
Upload the folders and files exactly as shown:

```
index.html
css/style.css
js/app.js
js/auth.js
js/config.js
js/database.js
js/ocr.js
js/supabase.js
README.md
```

## Deploy
1. Extract this ZIP.
2. Upload the contents (not the parent folder) to the root of your GitHub repository.
3. Ensure GitHub Pages deploys from `main` / root.
4. Open the HTTPS site and hard-refresh with Ctrl+F5.

## Supabase
This build retains the project's existing Supabase URL and publishable key in `js/config.js`. Publishable keys are intended for browser use; never put a service-role/secret key in frontend code. Ensure Row Level Security policies restrict receipts and Storage access to authenticated users.

The app expects the `receipts` table and private `receipt-images` bucket described in the earlier project setup. The `receipts` table should have a unique constraint on `(payment_method, reference_number)` to prevent duplicates.

## Accuracy and limitations
OCR is probabilistic, especially for photos of cracked screens, glare, blur, perspective distortion, tiny text, and low light. Multi-pass OCR can improve recognition but cannot guarantee exact extraction. The cashier must review every field and independently verify the payment in the official GCash/Maya/BPI account. OCR does not prove that funds were received.

This build uses Tesseract.js in the browser. It does not use a paid vision API or a server-side AI model. For a further accuracy upgrade, collect clear, redacted sample receipts from each provider and build/test provider-specific templates against them. Do not upload unredacted customer information for testing.
