# Receipt Scanner + Supabase + Amazon Textract

## OCR integration
- Receipt images are prepared in the browser and sent to the AWS Lambda Function URL for Amazon Textract AnalyzeExpense.
- The request includes the active Supabase access token. Lambda validates the session through Supabase Auth before calling Textract.
- JPEG, PNG, and WEBP uploads are converted to a size-limited JPEG for the OCR request. The original image remains the image saved to Supabase.
- OCR results include detected text, payment method, amount, reference number, transaction date, transaction time, and confidence where available.
- OCR is approximate. Staff must review and correct every field before saving and independently verify the payment in the provider account.

## Preserved existing features
- Supabase email/password login and cloud receipt storage.
- Camera capture and image upload.
- Staff/admin selection and shift assignment.
- Saved receipt history, search, staff filter and shift filter.
- Duplicate checking and deletion workflow.
- Existing database schema, storage bucket, reports and print workflow.

## Configuration
- `js/config.js` contains the Supabase project URL, publishable key, receipt bucket, and AWS Lambda Function URL.
- The Supabase publishable key is intended for browser use when RLS is correctly configured. Never put a service-role or secret key in frontend code.
- Lambda environment variables required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `ALLOWED_ORIGIN`.
- Lambda execution role requires `textract:AnalyzeExpense` and CloudWatch Logs permissions.
- Function URL CORS must allow the GitHub Pages origin and POST/OPTIONS with content-type and authorization headers.

## Deploy to GitHub Pages
Upload the contents of this folder to the root of the GitHub repository and allow GitHub Pages to deploy from the selected branch. Camera access requires HTTPS or localhost.

## Supabase safety
Keep RLS enabled and review policies before production use. The frontend publishable key is not a secret; do not expose AWS credentials or Supabase service-role keys.
