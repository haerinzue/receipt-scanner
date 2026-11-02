RECEIPT SCANNER — RECEIPT MANAGEMENT UPDATE

Features:
- Delete button on each saved receipt with confirmation prompt.
- Duplicate pre-check before image upload; duplicate key is payment method + reference number.
- Database unique index prevents race-condition duplicates from simultaneous saves.
- Overall report filters: transaction date from/to, shift, staff, payment method.
- Report preview with count, grand total, per-method totals, transaction list, staff/encoded-by and shift.
- Print / Save as PDF through the browser print dialog (choose "Save as PDF").
- Records are loaded in pages of 500, not just the first 200.
- Existing PaddleOCR, Supabase login, admin/shift choice and upload/camera flow retained.
- Mobile upload input no longer uses capture="environment", so Upload Receipt can offer Photos/Gallery/Files separately from the Camera button.

IMPORTANT DATABASE SETUP:
1. Back up your Supabase project before changing policies/indexes.
2. Open Supabase > SQL Editor.
3. Run RECEIPT_REPORT_DELETE_DUPLICATE_SETUP.sql.
4. The first SELECT lists any duplicates already stored. If it returns rows, manually decide which duplicate entries to keep/remove, then run the unique index statement again. Do not blindly delete old records.
5. The DELETE policies allow a signed-in user to delete only rows where created_by equals their auth user ID. If your operational setup uses multiple logins and an admin needs to delete receipts created by other accounts, that requires a deliberate admin-role policy; do not make all records publicly deletable.
6. If the storage image deletion policy cannot be created because your existing Storage policy setup differs, the database row may delete while the image remains in Storage. Review Supabase Storage policies.

REPORT NOTES:
- Date filtering uses transaction_date (not saved/created date).
- Encoded By uses the existing staff_name field; shift uses shift_code.
- The current receipts table does not include customer name or hours, so those columns are not fabricated in the report.
- PDF is generated from the browser's Print dialog; select "Save as PDF".
- Report totals are calculated from the currently loaded matching receipts.
