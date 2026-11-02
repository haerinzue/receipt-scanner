-- RECEIPT SCANNER: duplicate prevention + safe delete policies
-- Run in Supabase SQL Editor after checking the duplicate report below.
-- 1) First inspect any existing duplicates. Resolve these manually before creating the unique index.
select lower(btrim(payment_method)) as method_key,
       lower(btrim(reference_number)) as reference_key,
       count(*) as duplicate_count,
       array_agg(id order by created_at) as receipt_ids
from public.receipts
where nullif(btrim(reference_number), '') is not null
group by lower(btrim(payment_method)), lower(btrim(reference_number))
having count(*) > 1;

-- 2) Enforce uniqueness at database level (prevents two cashiers saving the same
-- payment method + reference even if they click Save at nearly the same time).
create unique index if not exists receipts_method_reference_unique
on public.receipts (lower(btrim(payment_method)), lower(btrim(reference_number)))
where nullif(btrim(reference_number), '') is not null;

-- 3) Allow authenticated users to delete only receipts they created.
-- Existing SELECT/INSERT policies remain unchanged.
drop policy if exists "Users can delete own receipts" on public.receipts;
create policy "Users can delete own receipts"
on public.receipts for delete to authenticated
using (auth.uid() = created_by);

-- 4) Allow authenticated users to remove receipt images they own in this bucket.
-- If your Storage bucket already has a compatible DELETE policy, this additional
-- policy is not required; policy names must be unique.
drop policy if exists "Users can delete own receipt images" on storage.objects;
create policy "Users can delete own receipt images"
on storage.objects for delete to authenticated
using (bucket_id = 'receipt-images' and owner_id = auth.uid()::text);
