# Receipt Scanner – Staff & Shift choices

## What changed
- Added a Staff dropdown: ADMIN MARJORIE, ADMIN BHELL, ADMIN THEA.
- Added a Shift dropdown:
  - S1: 12:00 midnight–9:00 AM
  - S2: 9:00 AM–9:00 PM
  - S3: 9:00 PM–12:00 midnight
- Saving requires both selections.
- Saved receipts display the selected staff and shift.
- Section 3 has filters for staff and shift.
- The selected staff and shift are saved with each receipt. This is a manual selection, not tied to the signed-in email yet.

## Setup
1. Back up or keep a copy of your current GitHub Pages project.
2. In Supabase, open SQL Editor.
3. Open `SHIFT_SETUP.sql`, copy all SQL, paste it into SQL Editor, and click Run.
4. Replace the files in your GitHub Pages repository with the files in this ZIP (keep folder structure).
5. Reload the website. If old page files remain cached, hard refresh with Ctrl+F5.

## Notes
- Existing receipts remain in the database. Old records will show "Hindi nakatalaga" / "Walang shift" because no staff/shift was saved for them.
- You can still choose any staff and any shift for each receipt.
- This version does not create Supabase login accounts. It records the staff name selected by the logged-in user.
- Do not put Supabase service-role or secret keys in the website.
