# Receipt Scanner — latest AWS-connected source package

This package combines the frontend files supplied in the uploaded ZIP with the latest saved AWS Lambda `index.mjs` source from the November 5, 2026 OCR upgrade.

## What was updated
- Added `lambda/index.mjs`: latest saved Lambda implementation using both Amazon Textract `AnalyzeExpense` and `DetectDocumentText`.
- Added `lambda/package.json` for the Lambda dependency.
- Kept the supplied frontend files and existing Supabase integration unchanged to avoid overwriting working features.

## Important compatibility notes
- The frontend `config.js` already points to the current AWS Lambda Function URL.
- The frontend sends a JPEG image and Supabase Bearer access token; the Lambda validates that token before running Textract.
- The Lambda returns `text`, `method`, `amount`, `reference`, `date`, `time`, `confidence`, `warnings`, `engine`, and `detectedText`, which are compatible with the supplied `ocr.js` / `app.js` flow.
- CORS is configured on the Lambda Function URL. The Lambda code intentionally does not add `Access-Control-Allow-Origin` because doing so caused duplicate CORS headers previously.
- This Lambda source does not implement automatic customer-name extraction. Customer Name remains a manual required field in the supplied frontend.
- Payment method detection is retained exactly as in the saved latest Lambda source. Review the selected payment method before saving.

## Lambda environment and permissions
Set `SUPABASE_URL` in the Lambda environment. The code validates Supabase JWTs using the project's JWKS endpoint.

The Lambda execution role needs:
- `textract:AnalyzeExpense`
- `textract:DetectDocumentText`
- CloudWatch Logs permissions

Keep the Function URL CORS configuration aligned with the allowed origins in `lambda/index.mjs`:
- `https://haerinzuge.github.io`
- `https://main.d1b0u4rp1d7tkm.amplifyapp.com`

## Deploying Lambda
1. Back up the currently working Lambda code first.
2. In `lambda/`, install dependencies with `npm install`.
3. Package the contents of the `lambda/` folder (not the folder itself) for deployment, including `index.mjs`, `package.json`, `package-lock.json`, and `node_modules`.
4. Deploy only after confirming the Lambda environment variables, IAM permissions, and Function URL CORS settings.
5. Test with a receipt before switching production traffic.

Do not deploy the entire frontend ZIP to Amplify until its contents have been compared with the currently live Amplify frontend.

## Existing frontend and database notes
- The original uploaded frontend files are preserved.
- `ADD_CUSTOMER_NAME_COLUMN.sql` is included for reference. Run it only if the `customer_name` column does not already exist; it uses `ADD COLUMN IF NOT EXISTS`.
- Do not disable Supabase authentication or Row Level Security.
