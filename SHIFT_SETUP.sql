-- Run this once in Supabase > SQL Editor.
-- Adds staff and shift fields to the existing receipts table.
alter table public.receipts
  add column if not exists staff_name text,
  add column if not exists shift_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'receipts_shift_code_check'
      and conrelid = 'public.receipts'::regclass
  ) then
    alter table public.receipts
      add constraint receipts_shift_code_check
      check (shift_code is null or shift_code in ('S1', 'S2', 'S3'));
  end if;
end $$;

create index if not exists receipts_staff_name_idx on public.receipts (staff_name);
create index if not exists receipts_shift_code_idx on public.receipts (shift_code);
