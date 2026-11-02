-- Add a manually entered customer name to each receipt.
-- Safe to run once; existing receipts remain valid and show a blank name (—).
alter table public.receipts
add column if not exists customer_name text;
