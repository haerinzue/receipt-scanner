# Receipt Scanner + Supabase

## Files
- `index.html` – website interface
- `css/style.css` – design
- `js/config.js` – Supabase URL and publishable key
- `js/supabase.js` – Supabase client
- `js/auth.js` – login/logout
- `js/ocr.js` – OCR and basic text parsing
- `js/database.js` – database and private image storage
- `js/app.js` – app behavior

## Deploy to GitHub Pages
1. Upload all files and folders to the root of your GitHub repository.
2. GitHub repository → Settings → Pages.
3. Choose Deploy from a branch, select `main` and `/ (root)`, then Save.
4. Open the HTTPS GitHub Pages URL. Camera access requires HTTPS or localhost.

## Supabase requirements
This project expects:
- Table `public.receipts` with columns: `id`, `payment_method`, `amount`, `reference_number`, `transaction_date`, `transaction_time`, `receipt_image_path`, `ocr_raw_text`, `created_at`, `created_by`.
- Private Storage bucket named `receipt-images`.
- Auth email/password users.

Run the SQL below in Supabase SQL Editor if the table and bucket already exist, do not recreate them blindly:

```sql
-- Check the payment method constraint. The app writes BPI, not "BPI Transfer".
alter table public.receipts drop constraint if exists receipts_payment_method_check;
alter table public.receipts add constraint receipts_payment_method_check
  check (payment_method in ('GCash', 'Maya', 'BPI'));

-- Make sure the bucket is private and limit uploads to common receipt images.
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'receipt-images';
```

The earlier setup policies allow authenticated users to read/insert/update/delete all receipts. That is acceptable only for a trusted small test group. Before production use, implement role-based permissions, audit logs, and stricter delete/update policies. Do not expose a service_role/secret key in frontend code.

## Important
- The publishable key in `js/config.js` is designed for browser use, but RLS is mandatory.
- OCR is approximate. Staff must review the fields and independently verify the payment in the provider account.
- This build stores image files in a private Supabase bucket and metadata in the Supabase table.
- Current list loads up to 200 most recent rows and filters them in the browser.
- Do not commit real receipt images or customer data into GitHub.
