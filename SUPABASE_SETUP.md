# Supabase setup for Sleep Light Study

The website contains only the Supabase publishable key. Database reads remain protected by Row Level Security and an authenticated administrator account.

## One-time setup

1. Open the Supabase project `appircpepatqltaejrkn`.
2. Open **Authentication → Users → Add user**.
3. Create the user `dkm26355@gmail.com`, choose a strong password, and mark the email as confirmed.
4. Open **SQL Editor**, create a new query, paste the complete contents of [`supabase/setup.sql`](./supabase/setup.sql), and run it once.
5. Open **Authentication → Sign In / Providers → Email**. Keep **Enable Email provider** turned **on**, because the administrator dashboard uses email/password sign-in.
6. In the Email/general authentication settings, turn only **Allow new users to sign up** (sometimes labelled **Enable sign ups**) **off** after the administrator exists. Do not disable the Email provider itself.
7. Keep that password private. Never place a secret key, database password, or `service_role` key in the website.

## Resulting access rules

- Unauthenticated participants can insert completed or terminated sessions.
- Participants cannot read, update, or delete any session.
- `test` and `admin` cannot be stored as participant IDs.
- Only the immutable Auth user ID created for `dkm26355@gmail.com` is added to the private administrator allow-list and can read sessions.
- Entering `admin` as the Participant ID opens the password-protected dashboard.

Existing sessions stored on other participants' devices cannot be recovered automatically. New sessions upload after the setup is complete. A final record remains in the browser retry queue only while remote saving has not yet succeeded.

The current dashboard uses password authentication. Do not enable an MFA requirement unless the website login flow and the database policy are both upgraded to verify an `aal2` session.
