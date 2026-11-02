CUSTOMER NAME FIELD UPDATE

- Added a manual Customer Name field to the receipt review form.
- Customer name is required before saving a new receipt.
- Name is stored in public.receipts.customer_name.
- Existing receipts are preserved; their customer_name remains NULL until edited separately.
- Customer name is searchable in the saved-receipt list and included in the overall printable report.

SUPABASE STEP:
Run ADD_CUSTOMER_NAME_COLUMN.sql once in Supabase SQL Editor before deploying this update.
No table recreation or data deletion is required.
