# Supabase setup for Sleep Light Study

The public website contains only the Supabase publishable key. Final-session reads remain protected by Row Level Security (RLS) and a private administrator allow-list. Protocol v4 uses the participant's study-name/password proof to save and resume one profile-linked overnight draft for 48 hours after its most recent save, including after a browser or device change. Historical Protocol v3 bearer-token drafts remain supported without being converted. Participant credentials are separate from Supabase Auth. The participant website has no participant-email field and does not solicit reminder addresses; participants should not enter an email as their study name or in free-text feedback.

> **Production release status — completed 2026-07-18:** the existing project ran `20260718_protocol_v3.sql` followed by `20260718_participant_profiles.sql`. Both transactions returned `Success. No rows returned`; all expected tables, functions, constraints, append-only triggers, and the administrator allow-list entry were verified. `study_sessions` contained zero rows before and after migration, so the historical count/fingerprint result remained unchanged. The matching website build was then released to GitHub Pages. The OpenAI Sites source repository was unreachable from the restricted release network and its public domain still returned a Cloudflare block page, so that older address was not recorded as a successful deployment of this build.

> **Protocol v4 production status — verified 2026-07-31:** the production project successfully ran [`supabase/migrations/20260731_protocol_v4.sql`](./supabase/migrations/20260731_protocol_v4.sql). Read-only verification confirmed the profile-linked draft table and index, Row Level Security, all v4 RPCs, anonymous grants, private validator permissions, all three validated session constraints, and server-side enforcement of `fixed-four-v1`. The one historical schema 3 session remained readable, and its count and payload fingerprint `b9cf9c7fbb0656882991ce141f221ebf` exactly matched the administrator export from 2026-07-26. No participant names were used in the verification results. The matching v4 frontend source is therefore cleared for deployment.

## Required 2026-07-31 Protocol v4 migration — run before the frontend

Use this path for the existing production project after the 2026-07-18 v3/profile migrations and `20260723_password_accounts.sql` are confirmed.

1. Confirm the project is running, the administrator can sign in, and the three earlier production migrations are present.
2. Take the backup appropriate for the study, then record counts and a stable fingerprint for every existing schema:

   ```sql
   select
     payload ->> 'schemaVersion' as schema_version,
     count(*) as session_count,
     md5(string_agg(session_id::text || ':' || payload::text, '|' order by session_id))
       as payload_fingerprint
   from public.study_sessions
   group by payload ->> 'schemaVersion'
   order by payload ->> 'schemaVersion';
   ```

   Save the complete result outside SQL Editor. Historical schema v2/v3 payloads, including every v3 Control and questionnaire answer, must have the same count and fingerprint after migration.
3. Open **SQL Editor → New query** and paste the complete contents of [`supabase/migrations/20260731_protocol_v4.sql`](./supabase/migrations/20260731_protocol_v4.sql).
4. Run the **entire file once**. It is one transaction; do not run selected fragments. The normal successful result is `Success. No rows returned`.
5. Run the v4 verification queries below. Then rerun the fingerprint query and compare every old v2/v3 row to the saved result.
6. Before public recruitment, use a non-identifying pilot profile to verify the fixed sequence **dim red → dim blue → bright blue → bright red**, a partial v4 draft, refresh recovery, another-browser sign-in and recovery, the immediate post-exposure Karolinska Sleepiness Scale, the next-morning questionnaire, final submission, administrator detail view, and CSV/JSON export.
7. Only after all database and end-to-end checks pass, deploy the matching v4 frontend. Do not deploy v4 first: the previous database does not have the profile-linked draft RPCs or schema-v4 final-record contract.

The v4 migration is additive and backward-compatible with historical data. It:

- accepts `schemaVersion: 4`, `protocolVersion: "overnight-v2"`, and `sequenceVersion: "fixed-four-v1"` while retaining the existing v2/v3 contracts;
- validates the exact four-position order and excludes `control` only from new v4 records;
- keeps every v3 Control, v3 `postSurvey`, v3 standalone `reactionTest`, and earlier questionnaire answer unchanged;
- links one 48-hour draft to an authenticated participant profile and adds `save_participant_study_draft`, `load_participant_study_draft`, and `delete_participant_study_draft`;
- updates profile progress so only completed v4 exposure positions advance the fixed order;
- keeps historical random-token v3 draft RPCs available for old drafts;
- requires v4 final submissions to pass through the profile-authenticated `submit_profile_study_session` path.

Running the migration does not publish the website. Record the production migration and frontend deployment as separate completed events only after each one actually succeeds.

## 2026-07-23 password-account production migration and release

> **Production release status — partially verified 2026-07-26:** the project owner reports that the complete `20260723_password_accounts.sql` ran successfully in production and SQL Editor displayed `Success. No rows returned`. The matching `2026-07-26-password-practice-admin-results-v1` build was deployed by GitHub Pages workflow #42, and its public password-account entry and release assets were checked. The full overnight flow and authenticated administrator review against real records remain project-owner end-to-end checks. The morning-email prototype was cancelled before production and is not part of this release.

The production project already has both 2026-07-18 migrations and the owner-confirmed password migration. Complete the remaining release checks in this order:

1. Record an appropriate backup and confirm the 2026-07-18 profile verification queries still pass.
2. Run the password-account verification query below against production. Do not rerun or replace participant history merely to obtain a second success message.
3. Confirm GitHub Pages still serves the deployed `2026-07-26-password-practice-admin-results-v1` build from workflow #42.
4. Complete the password-account, administrator, bilingual, practice, overnight-resume, final-save, cross-browser sign-in, in-page detailed-result review, and CSV/JSON download tests with the project owner's credentials and designated test data.

### Participant-password model

- A participant chooses an 8–128-character password for a unique study name. The browser derives a slow PBKDF2 credential proof; the raw password is not sent to PostgreSQL.
- Existing July 18 profiles keep every linked session, survey, progress entry, feedback item, and build version. `upgrade_participant_profile_credential` verifies the old 20-character recovery-code proof once and replaces only the stored credential hash.
- New and upgraded participants use the existing profile claim/progress RPCs with the password-derived proof. A returning participant can sign in from another browser with the same study name and password.
- Participant accounts do **not** use Supabase Auth and do not need Auth sign-up enabled. Supabase Email Auth remains enabled only for the administrator dashboard as described under **Authentication settings**.

Verify the additive credential-upgrade function by its exact name:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'upgrade_participant_profile_credential';

select
  has_function_privilege(
    'anon',
    'public.upgrade_participant_profile_credential(text,text,text)',
    'EXECUTE'
  ) as anon_can_upgrade_legacy_profile;
```

Expected: one `upgrade_participant_profile_credential` row and `anon_can_upgrade_legacy_profile = true`.

The cancelled reminder migration and worker must not be deployed. If an earlier manual test ever created reminder database objects, an Edge Function, Cron entry, or reminder secrets, remove them before release and confirm that the participant page never asks for an email address.

## If the existing Supabase project is paused

1. Open the Supabase dashboard and select project `appircpepatqltaejrkn`.
2. Use **Restore project**, **Resume project**, or the equivalent action shown by the dashboard.
3. Wait until Database, Auth, and the API report a healthy/running state before opening SQL Editor.
4. Do not create a replacement project unless the existing one cannot be restored. A replacement would require changing the project URL and publishable key in the website and would not automatically contain the existing sessions or administrator account.

Restoring the project does not apply any missing migration. Audit which historical migrations are already present, then run only the required remaining migrations in date order. For the current production upgrade, `20260731_protocol_v4.sql` must be verified before the v4 frontend is deployed.

## Upgrade an existing v2 project to Protocol v3

Use this path for the current project if `supabase/setup.sql` was already run for the July 11 version.

1. Confirm that the administrator can still sign in and, if appropriate for the study, create a database backup before changing constraints.
2. Open **SQL Editor → New query**.
3. Paste the complete contents of [`supabase/migrations/20260718_protocol_v3.sql`](./supabase/migrations/20260718_protocol_v3.sql).
4. Run the entire file once. Do not run selected fragments separately because the migration is wrapped in one transaction.
5. The normal successful result is `Success. No rows returned`.
6. Run the verification queries below.
7. Complete one full Test-mode flow and one non-identifying end-to-end test before collecting real v3 data.
8. Deploy the v3 website only after the migration succeeds. A v3 webpage used against the old database will be rejected by the old four-condition/20-trial constraints.

The migration is backward-compatible. It preserves all existing schema v2 rows and the existing private administrator allow-list. It adds:

- the fifth `control` condition;
- schema v3 payload requirements for device, pre-survey, post-survey, and reaction-test objects;
- four planned attention trials for v3 color sessions;
- zero attention trials for Control;
- the private 48-hour overnight draft table;
- resume-token hashing through PostgreSQL's core SHA-256 function, without an extension dependency;
- narrowly scoped anonymous RPCs to save, load, and delete a draft.

It does not transform historical 20-trial v2 payloads into v3 payloads.

## Historical 2026-07-18 profile migration, progress, and feedback

This section records how the 2026-07-18 recovery-code release was migrated and verified. Keep it for audit and restoration, but do not instruct current participants to create recovery-code profiles; the current account model uses study name plus password. Run this additive migration only after the Protocol v3 migration above is confirmed when restoring a project that does not yet have participant profiles.

**Current production status:** [`supabase/migrations/20260718_participant_profiles.sql`](./supabase/migrations/20260718_participant_profiles.sql) was run successfully on 2026-07-18 after the Protocol v3 migration. The following steps remain the required audit procedure for another existing project or a future restoration:

1. Confirm the Protocol v3 verification queries pass and take an appropriate database backup.
2. Record counts and a stable fingerprint of each historical payload generation before migration so retention can be checked:

   ```sql
   select
     payload ->> 'schemaVersion' as schema_version,
     count(*) as session_count,
     md5(string_agg(session_id::text || ':' || payload::text, '|' order by session_id))
       as payload_fingerprint
   from public.study_sessions
   group by payload ->> 'schemaVersion'
   order by payload ->> 'schemaVersion';
   ```

3. Open **SQL Editor → New query** and paste the complete contents of `20260718_participant_profiles.sql`.
4. Run the complete file as one transaction. A normal result is `Success. No rows returned`.
5. Run the profile verification queries below, then rerun the pre-migration count/fingerprint query. Every old v2/v3 row and fingerprint must match exactly.
6. Test a non-identifying nickname through profile creation, recovery on another browser/device, all five-condition progress, one feedback entry, and administrator review.
7. Only after those checks pass, deploy the matching website build.

The migration is additive. It creates private profile, session-link, and feedback tables plus narrowly scoped RPCs. It does not rename, convert, update, or delete any existing v2/v3 session or questionnaire answer. It also installs append-only database protection: final study sessions and submitted feedback cannot be updated or deleted through ordinary application paths. Every new site session carries `studyBuildVersion`, while each feedback/question carries its prompt version and site build version, so future releases remain distinguishable without replacing prior answers.

### Historical July 18 profile and privacy model

- A study name may be a real name or nickname. The participant UI recommends a non-identifying nickname and warns against entering email, phone, student number, or similar identifiers.
- Names are NFKC-normalized, trimmed, have internal whitespace collapsed, and are compared case-insensitively. The normalized value is unique, so cosmetic case or spacing changes cannot create duplicate profiles.
- The browser generates a 20-character recovery code. The raw code stays in the browser or with the participant; the client sends a SHA-256 proof and the database stores a second SHA-256 hash, not the displayable code.
- In the July 18 build, possession of the matching name and recovery code permitted that participant to reopen the profile and see only its completed/remaining five-condition progress. The RPC did not choose the next condition or enforce an order. The 2026-07-23 migration upgrades this credential in place to the participant's password-derived proof.
- A lost recovery code cannot be reconstructed from its database hash. Project owners should not manually expose or replace profile history to bypass this control.

### Append-only feedback and consistency review

Each post-session Feedback or Question is inserted as a separate record with its own ID, timestamp, language, prompt version, and build version. A later message never overwrites an earlier one.

The admin dashboard computes a yellow review warning from completed v3 histories when circular sleep-time spread is over 90 minutes, temperature or noise spans more than one ordinal category, sleep-light use/color changes, or at least two of screen use, music, caffeine, and sleep-aid use change. Assigned Bright/Dim Red/Blue/Control differences are experimental conditions and are never flagged. The warning is for manual review only; it does not update, exclude, or delete data.

### Read-only in-page session review

The administrator dashboard can expand one session at a time and organize its already-fetched, validated payload into record/profile provenance, condition and exposure, exact timeline and durations, pre/post surveys, device records, attention trials, false/extra clicks, pauses, environment events, reaction results, feedback, and consistency-review sections. Large event arrays are paged in groups of 50. A raw validated JSON view is available only when the administrator explicitly expands it, and the existing single/all CSV and JSON downloads remain available.

This viewer is a client-side presentation change. It uses the same authenticated full-session reads, profile RPC, feedback RPC, administrator allow-list, and RLS policies that already protect the summary dashboard. It adds no database writes, tables, SQL migrations, RPCs, grants, or RLS policies. Free text and JSON are rendered as ordinary escaped React text rather than executable HTML. For historical schema v2 records, fields introduced only in v3 are labelled **Not collected in schema v2**; the dashboard must not infer, backfill, or rewrite them.

## Set up a completely new project

Use this path only when the database has never been initialized.

1. Open **Authentication → Users → Add user**.
2. Create `dkm26355@gmail.com`, choose a strong password, and mark the email as confirmed.
3. Open **SQL Editor → New query**.
4. Paste and run the complete contents of [`supabase/setup.sql`](./supabase/setup.sql).
5. A normal successful run displays `Success. No rows returned`.
6. Run the Protocol v3 and profile verification queries below. The current `setup.sql` already contains the 2026-07-18 profile/feedback objects, so a database initialized from this file does not need either separate 2026-07-18 migration.
7. Run the complete `20260723_password_accounts.sql` and verify `upgrade_participant_profile_credential`. This additive 2026-07-23 migration is **not** included in `setup.sql`.
8. Run the complete `20260731_protocol_v4.sql`, verify the v4 objects and fixed-sequence contract below, and save the initial schema fingerprint result. This migration is also **not** included in `setup.sql`.
9. Complete administrator sign-in, password profile creation, bilingual safety/tutorial screens, fixed assignment, practice, exposure, the immediate Karolinska Sleepiness Scale, overnight save, same-browser and cross-browser recovery, next-morning questionnaire, final save, administrator details, and CSV/JSON tests before publishing the matching v4 website.

The current setup script creates the final-session table, RLS policies, private administrator allow-list, v2/v3-compatible constraints, v3 overnight-draft functions, unique-name profiles, progress links, append-only feedback and history-protection triggers. The administrator Auth user must exist before the script runs because its immutable Auth UUID is inserted into the allow-list. `20260718_participant_profiles.sql` is for upgrading the existing project without recreating it. Both `20260723_password_accounts.sql` and `20260731_protocol_v4.sql` must follow `setup.sql` because they have intentionally not been folded into the base script.

## Verification queries

Run these in SQL Editor after setup or migration:

```sql
select
  to_regclass('public.study_sessions') as final_sessions_table,
  to_regclass('private.study_drafts') as overnight_drafts_table;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'save_study_draft',
    'load_study_draft',
    'delete_study_draft'
  )
order by routine_name;

select conname
from pg_constraint
where conrelid = 'public.study_sessions'::regclass
  and conname in (
    'study_condition_ck',
    'study_payload_keys_ck',
    'study_payload_v3_objects_ck',
    'study_payload_array_lengths_ck',
    'study_payload_matches_columns_ck',
    'study_payload_v3_contract_ck'
  )
order by conname;
```

Expected results:

- both table names are non-null;
- all three draft functions are listed;
- all six named study-session constraints are listed.

After the project owner runs `20260718_participant_profiles.sql`, verify its additive objects separately:

```sql
select
  to_regclass('private.participant_profiles') as profiles_table,
  to_regclass('private.participant_profile_sessions') as profile_sessions_table,
  to_regclass('private.participant_feedback') as feedback_table;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'claim_participant_profile',
    'reclaim_participant_profile',
    'get_participant_progress',
    'submit_profile_study_session',
    'submit_participant_feedback',
    'admin_list_participant_profiles',
    'admin_list_participant_feedback'
  )
order by routine_name;

select event_object_schema, event_object_table, trigger_name
from information_schema.triggers
where trigger_name in (
  'study_sessions_append_only',
  'participant_feedback_append_only'
)
order by event_object_schema, event_object_table;
```

Expected results after—not before—the owner-run migration:

- all three private table names are non-null;
- all seven public profile/feedback functions are listed;
- both append-only triggers are listed;
- the v2/v3 count and payload fingerprints exactly match the values recorded before migration.

After `20260731_protocol_v4.sql`, verify the new contract and profile-linked draft surface:

```sql
select conname
from pg_constraint
where conrelid = 'public.study_sessions'::regclass
  and conname in (
    'study_payload_array_lengths_ck',
    'study_payload_matches_columns_ck',
    'study_payload_v3_contract_ck',
    'study_payload_v4_contract_ck'
  )
order by conname;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'save_participant_study_draft',
    'load_participant_study_draft',
    'delete_participant_study_draft',
    'get_participant_progress',
    'submit_profile_study_session',
    'admin_list_participant_profiles'
  )
order by routine_name;

select column_name, data_type
from information_schema.columns
where table_schema = 'private'
  and table_name = 'study_drafts'
  and column_name = 'participant_profile_id';

select indexname
from pg_indexes
where schemaname = 'private'
  and tablename = 'study_drafts'
  and indexname = 'study_drafts_profile_uidx';
```

Expected:

- all four named v2/v3/v4-compatible constraints are listed;
- all six named functions are listed, including all three participant-draft RPCs;
- `participant_profile_id` is present with data type `uuid`;
- `study_drafts_profile_uidx` is present;
- rerunning the earlier fingerprint query gives exactly the saved counts and hashes for schema v2/v3, including historical Control rows.

Structure checks are necessary but not sufficient. A non-identifying v4 pilot must also prove that a partial draft can be recovered after signing in with the same study name and password from another browser, and that only completed v4 sequence positions advance progress.

The administrator allow-list can be checked without exposing a password:

```sql
select users.email, administrators.created_at
from private.study_admins as administrators
join auth.users as users on users.id = administrators.user_id;
```

It should contain the confirmed administrator email. Do not copy the Auth UUID into client code.

## Authentication settings

1. Open **Authentication → Sign In / Providers → Email**.
2. Keep **Enable Email provider** turned **on** because the administrator dashboard uses email/password sign-in.
3. After the administrator exists, turn only **Allow new users to sign up** (sometimes labelled **Enable sign ups**) **off**.
4. Do not disable the Email provider itself.
5. Keep the administrator password private. Never place a database password, secret key, or `service_role` key in the website or GitHub repository.

These settings apply to the administrator only. Participant study-name/password accounts are implemented by the private participant-profile table and scoped RPCs; they do not create Supabase Auth users and do not require public Auth registration. The participant website has no participant-email field; participants should not put an email in their study name or free-text feedback.

The current administrator flow uses password authentication. Do not require MFA unless both the website login and database authorization are upgraded to verify an `aal2` session.

## Final-session access rules

- The legacy anonymous insert policy accepts only final `completed` or `terminated` schema v2/v3 sessions. It does not accept schema v4.
- V4 final records are submitted through the participant-profile RPC with the matching profile ID and password-derived proof.
- Participants cannot read, update, or delete final sessions.
- `test` and `admin` cannot be stored as formal study names.
- Only an authenticated Auth UUID in `private.study_admins` can read final sessions through the dashboard.
- The database accepts historical schema v2, historical schema v3, and new schema v4 sessions under separate strict contracts without rewriting any format.
- Old v2/v3 answers, including v3 Control, `postSurvey`, and standalone `reactionTest`, are never transformed, overwritten, or automatically deleted. New sessions and feedback are appended with new IDs and version metadata.
- New profile-based sessions store `studyBuildVersion`; analyses should retain and stratify by this value alongside schema, protocol, questionnaire, and prompt versions.
- V3 color sessions require four planned attention trials; v3 Control requires zero.
- V4 requires four planned attention trials, excludes Control from new v4 payloads, and enforces the exact sequence-position mapping dim red → dim blue → bright blue → bright red.
- V4 profile progress advances only from completed v4 exposure positions. The database does not impose a washout day; the current protocol allows consecutive nights while instructing participants to keep their normal bedtime.

RLS and the profile-authenticated submission path protect record access, but they cannot prove that every submission came from a genuine participant. If the study URL is widely distributed, add researcher-issued participant tokens, server-side rate limiting, or a Supabase Edge Function before relying on the data.

## How Protocol v4 cross-browser draft recovery works

The overnight draft exists because the participant completes the pre-sleep stage and returns after waking.

- A v4 draft is an active `overnight-v2` schema-v4 object linked to one authenticated participant profile.
- The browser uses the participant's profile ID and password-derived proof to call `save_participant_study_draft`, `load_participant_study_draft`, and `delete_participant_study_draft`. The raw password is not sent.
- One profile can have at most one unexpired profile-linked draft. Saving refreshes its expiry to 48 hours; expired drafts are removed during later draft operations.
- After a refresh or browser/device change, the participant signs in with the same study name and password and can retrieve that remote draft. The scientific instructions still require the same device/browser and display settings whenever possible; cross-device recovery is a fallback, not a protocol preference.
- Neither `anon` nor ordinary `authenticated` users receive direct table privileges on `private.study_drafts`.
- Completion deletes the temporary profile draft and appends the final schema-v4 record through `submit_profile_study_session`.
- The administrator dashboard does not expose active drafts to participants and does not grant direct draft-table access. Supabase project owners and `service_role` retain normal administrative database access.

## Historical Protocol v3 bearer-token draft protection

The following mechanism remains only so unfinished v3 records can retain their original recovery behavior:

- The browser generates a cryptographically random 32-byte token and keeps its 64-character hexadecimal form.
- The raw token is sent only when calling the draft RPCs. PostgreSQL's core SHA-256 function produces the digest stored in `private.study_drafts`; `pgcrypto` is not required.
- Neither `anon` nor ordinary `authenticated` users receive direct table privileges.
- Anonymous users can execute only `save_study_draft`, `load_study_draft`, and `delete_study_draft`.
- A draft payload must be an active `overnight-v1` schema v3 object that satisfies the server-side shape checks and is no larger than `128 KiB`.
- Saving sets expiry to 48 hours after that save. Once expired, a draft cannot be loaded; expired rows are deleted opportunistically during later draft operations.
- The final-session administrator dashboard does not grant direct draft-table access. Supabase project owners and the `service_role` still retain administrative database access.
- Completion removes the temporary draft and inserts the final schema v3 record through the normal final-session path.

The v3 resume token is a bearer secret: possession of it permits loading that one draft until expiry. Do not log it, email it, put it in analytics, or share it. Token/profile controls and a private table are access controls; they are not end-to-end encryption of the survey JSON.

## Protocol v4 data added to final records

Each completed v4 record includes:

- `schemaVersion: 4`, `protocolVersion: "overnight-v2"`, `sequenceVersion: "fixed-four-v1"`, and the enforced sequence position;
- one of the four color exposures in the exact fixed order, never `control`;
- the versioned experiment-before questionnaire and baseline Karolinska Sleepiness Scale;
- an immediate post-exposure Karolinska Sleepiness Scale in `postExposureSurvey` (`post-exposure-kss-v1`);
- a next-morning `morningSurvey` (`morning-study-v1`) with attempted sleep time, wake time, remembered awakenings, sleep quality, restedness, alertness, and the unusual-factor response; its note is required at 1–1,000 characters when that response is `yes`, and must be `null` otherwise;
- device records, exact exposure timing, four sparse attention trials, false/extra clicks, pauses, environment events, and termination state.

Protocol v4 has no `postSurvey` and no standalone `reactionTest`. Mean and median reaction time are derived only from exposure trials whose status is `hit` and whose `reactionTimeMs` is present; raw misses and false/extra clicks remain separately available. The morning stage consists of device confirmation and the questionnaire; it has no separate reaction-time task.

## Historical Protocol v3 data added to final records

Each completed v3 record includes:

- one of five conditions: four color exposures or `control`;
- versioned pre-sleep and post-waking KSS 1–9 responses;
- the requested screen, light, temperature, coarse medication/supplement, restedness, sleep-quality, caffeine, music, noise, and vigorous-exercise fields;
- automatically detected and participant-confirmed device category before sleep and after waking, plus whether it changed;
- four sparse attention trials for a color session or none for Control;
- three valid formal reaction responses, with separate cumulative false-start and missed-attempt counts.

Medication/supplement use is deliberately coarse (`yes`, `no`, or `prefer-not-to-answer`). The application must not collect medication names in this protocol.

## Troubleshooting

- **The migration says the project is unavailable:** finish restoring/resuming the Supabase project and wait for the API to become healthy.
- **A v4 upload is rejected or the v4 draft RPC is missing:** `20260731_protocol_v4.sql` was not successfully applied to the Supabase project used by the page. Stop the v4 deployment, run the complete transaction and verification queries, then retest before publishing.
- **A participant can sign in but another browser cannot find the unfinished v4 session:** confirm both browsers use the exact same normalized study name and password, fewer than 48 hours have passed since the draft's most recent save, and `load_participant_study_draft` exists. Check that the saved payload is schema 4 and linked to that profile; do not copy or rewrite a production draft manually.
- **V4 progress assigns the wrong condition:** verify `get_participant_progress` was replaced by the v4 migration and inspect completed schema-v4 `sequencePosition` values. Historical v3 completions and Control must not advance the new four-position sequence.
- **A v3 upload fails with a condition or 20-trial constraint:** the v3 migration was not applied to the database used by the deployed site.
- **A profile/name request reports that an RPC is missing:** `20260718_participant_profiles.sql` is still pending or was run against a different Supabase project. Do not deploy the profile-enabled site until its verification succeeds.
- **A name is already in use:** sign in with that profile's password. Case and spacing variants intentionally resolve to the same unique normalized name; do not create a cosmetic duplicate.
- **A participant has a July 18 recovery code:** use the legacy-upgrade path once, choose a new 8–128-character password, and verify that the existing progress remains. Do not create a second cosmetic name.
- **A participant password was lost:** the stored proof cannot reconstruct the password, and the website has no email-reset channel. Follow the study's documented lost-profile procedure rather than editing or deleting prior history.
- **The password-upgrade RPC is missing:** run and verify `20260723_password_accounts.sql` before deploying the password-account website.
- **A yellow consistency warning appears:** inspect the bilingual reason list and the original session answers. It is a manual-review prompt, not proof of invalid data, and must not trigger deletion or automatic exclusion.
- **Admin login fails after public registration was disabled:** verify that Email provider remains enabled; only sign-ups should be disabled.
- **Admin login works but no records appear:** verify the signed-in Auth UUID is present in `private.study_admins` and that the site points to this project.
- **A historical v3 overnight draft cannot be recovered:** verify the original 64-character token is still available and fewer than 48 hours have passed since that draft's most recent successful save. The token itself does not age, but the draft row expires; a study name and participant password (or a legacy July 18 recovery code) cannot replace the separate bearer token.
- **More than 48 hours have passed since the latest draft save:** the draft is expired by design. Do not bypass the expiry by editing a production row manually; follow the study's missing-session procedure.
- **SQL Editor reports a failure inside the migration:** the transaction rolls back. Fix the reported issue and rerun the complete migration; do not assume a partial upgrade succeeded.

Existing final sessions on Supabase remain available after every additive migration. Old v2/v3 questionnaire answers and Control sessions, new v4 profile-linked sessions, and submitted feedback/questions remain separate historical records and are never overwritten by a later website version. V4 can restore an unexpired server draft after same-name/password sign-in from another browser; historical v3 drafts and retry records that exist only on a participant's device still cannot be reconstructed if their browser data or bearer token is lost. Participant password proofs and legacy recovery-code hashes are not reversible by the administrator.
