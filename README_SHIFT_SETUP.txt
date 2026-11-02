# Receipt Scanner – Admin/Shift selection screen

## New behavior
1. User first logs in with the existing Supabase account.
2. Before the scanner appears, a screen asks the user to choose:
   - ADMIN MARJORIE / ADMIN BHELL / ADMIN THEA
   - Shift 1 (12 MN–9 AM), Shift 2 (9 AM–9 PM), or Shift 3 (9 PM–12 MN)
3. The scanner opens only after both choices are selected.
4. Every receipt saved in that session is stored with the selected staff name and shift.
5. The top bar shows the active admin/shift. "Palitan Admin / Shift" returns to the selection screen.
6. Section 3 can filter saved receipts by staff and by shift.

## Supabase setup (one-time)
1. Open Supabase > SQL Editor.
2. Open `SHIFT_SETUP.sql` from this folder.
3. Copy all SQL, paste it into SQL Editor, and click Run.

## Deploy
Replace the contents of the existing GitHub Pages project with the contents of this ZIP, preserving the `js` and `css` folders. Then hard-refresh the website (Ctrl+F5).

## Important clarification
The staff choice is an operational label attached to each receipt; it is not a separate Supabase login account or secure proof of which person is operating the device. The existing Supabase login remains the account used for authentication. If you need each admin's identity enforced, create separate Supabase Auth accounts and map each login to a permitted staff/shift on the server side.

Existing receipts remain intact. Old records without staff/shift values display as unassigned.
