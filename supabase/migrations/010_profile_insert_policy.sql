-- Allow a logged-in user to create their own profile row.
-- The handle_new_user trigger creates profiles for fresh signups, but if it ever
-- fails (or a user predates it), the PATCH /api/profile upsert needs an INSERT
-- path scoped to the same identity check we use for SELECT/UPDATE.
create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);
