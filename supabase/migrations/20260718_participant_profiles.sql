begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to service_role;

create or replace function private.canonical_participant_name(candidate text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.translate(
        normalize(candidate, NFKC),
        U&'\0085\1680\2028\2029\FEFF',
        '     '
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function private.participant_name_key(candidate text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.lower(private.canonical_participant_name(candidate));
$$;

-- The browser sends SHA-256(raw 20-character code). The database stores a
-- second SHA-256, so neither the raw recovery code nor its bearer proof is
-- retained in any table.
create or replace function private.participant_recovery_hash(recovery_proof text)
returns bytea
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.sha256(pg_catalog.decode(pg_catalog.lower(recovery_proof), 'hex'));
$$;

revoke all on function private.canonical_participant_name(text) from public, anon, authenticated;
revoke all on function private.participant_name_key(text) from public, anon, authenticated;
revoke all on function private.participant_recovery_hash(text) from public, anon, authenticated;

create table if not exists private.participant_profiles (
  profile_id uuid primary key default pg_catalog.gen_random_uuid(),
  display_name text not null,
  normalized_name text not null,
  recovery_code_hash bytea not null,
  created_at timestamptz not null default clock_timestamp(),
  last_accessed_at timestamptz not null default clock_timestamp(),

  constraint participant_profiles_display_name_ck
    check (
      display_name = private.canonical_participant_name(display_name)
      and char_length(display_name) between 1 and 80
      and display_name !~ '[[:cntrl:]]'
      and private.participant_name_key(display_name) not in ('admin', 'test')
    ),
  constraint participant_profiles_normalized_name_ck
    check (normalized_name = private.participant_name_key(display_name)),
  constraint participant_profiles_recovery_hash_ck
    check (octet_length(recovery_code_hash) = 32),
  constraint participant_profiles_time_order_ck
    check (last_accessed_at >= created_at)
);

create unique index if not exists participant_profiles_normalized_name_uidx
  on private.participant_profiles (normalized_name);
create unique index if not exists participant_profiles_recovery_hash_uidx
  on private.participant_profiles (recovery_code_hash);
create index if not exists participant_profiles_created_at_idx
  on private.participant_profiles (created_at desc);

create table if not exists private.participant_profile_sessions (
  profile_id uuid not null references private.participant_profiles(profile_id) on delete restrict,
  session_id uuid not null references public.study_sessions(session_id) on delete restrict,
  linked_at timestamptz not null default clock_timestamp(),
  primary key (profile_id, session_id),
  unique (session_id)
);
create index if not exists participant_profile_sessions_profile_idx
  on private.participant_profile_sessions (profile_id, linked_at desc);

create table if not exists private.participant_feedback (
  feedback_id uuid primary key default pg_catalog.gen_random_uuid(),
  profile_id uuid not null,
  session_id uuid not null,
  message_type text not null,
  message_body text not null,
  response_language text not null,
  prompt_version text not null,
  study_build_version text,
  created_at timestamptz not null default clock_timestamp(),

  constraint participant_feedback_profile_session_fk
    foreign key (profile_id, session_id)
    references private.participant_profile_sessions(profile_id, session_id)
    on delete restrict,
  constraint participant_feedback_type_ck
    check (message_type in ('feedback', 'question')),
  constraint participant_feedback_body_ck
    check (char_length(pg_catalog.btrim(message_body)) between 1 and 4000),
  constraint participant_feedback_language_ck
    check (response_language in ('en', 'zh')),
  constraint participant_feedback_prompt_version_ck
    check (prompt_version ~ '^[A-Za-z0-9._+-]{1,80}$'),
  constraint participant_feedback_build_version_ck
    check (
      study_build_version is null
      or study_build_version ~ '^[A-Za-z0-9._+-]{1,80}$'
    )
);
create index if not exists participant_feedback_created_at_idx
  on private.participant_feedback (created_at desc);
create index if not exists participant_feedback_profile_idx
  on private.participant_feedback (profile_id, created_at desc);

alter table private.participant_profiles enable row level security;
alter table private.participant_profile_sessions enable row level security;
alter table private.participant_feedback enable row level security;

revoke all on table private.participant_profiles from public, anon, authenticated;
revoke all on table private.participant_profile_sessions from public, anon, authenticated;
revoke all on table private.participant_feedback from public, anon, authenticated;
grant all on table private.participant_profiles to service_role;
grant all on table private.participant_profile_sessions to service_role;
grant all on table private.participant_feedback to service_role;

create or replace function private.reject_study_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Final study history is append-only.' using errcode = '55000';
end;
$$;
revoke all on function private.reject_study_history_mutation() from public, anon, authenticated;

drop trigger if exists study_sessions_append_only on public.study_sessions;
create trigger study_sessions_append_only
before update or delete on public.study_sessions
for each row execute function private.reject_study_history_mutation();

drop trigger if exists participant_feedback_append_only on private.participant_feedback;
create trigger participant_feedback_append_only
before update or delete on private.participant_feedback
for each row execute function private.reject_study_history_mutation();

drop trigger if exists participant_profile_sessions_append_only
  on private.participant_profile_sessions;
create trigger participant_profile_sessions_append_only
before update or delete on private.participant_profile_sessions
for each row execute function private.reject_study_history_mutation();

create or replace function public.claim_participant_profile(
  participant_name text,
  recovery_proof text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_name text;
  name_key text;
  proof_hash bytea;
  profile_record private.participant_profiles%rowtype;
  profile_created boolean := false;
begin
  if participant_name is null or octet_length(participant_name) > 512 then
    raise exception 'The study name is not valid.' using errcode = '22023';
  end if;

  canonical_name := private.canonical_participant_name(participant_name);
  name_key := private.participant_name_key(canonical_name);
  if char_length(canonical_name) not between 1 and 80
    or canonical_name ~ '[[:cntrl:]]'
    or name_key in ('admin', 'test')
  then
    raise exception 'The study name is not valid.' using errcode = '22023';
  end if;
  if recovery_proof is null or recovery_proof !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'The recovery proof is not valid.' using errcode = '22023';
  end if;

  proof_hash := private.participant_recovery_hash(recovery_proof);
  begin
    insert into private.participant_profiles (
      display_name, normalized_name, recovery_code_hash, created_at, last_accessed_at
    ) values (
      canonical_name, name_key, proof_hash, clock_timestamp(), clock_timestamp()
    )
    on conflict (normalized_name) do nothing
    returning * into profile_record;
  exception
    when unique_violation then
      raise exception 'Generate a new recovery code and try again.' using errcode = '23505';
  end;

  if profile_record.profile_id is not null then
    profile_created := true;
  else
    select existing.* into profile_record
    from private.participant_profiles as existing
    where existing.normalized_name = name_key;

    if profile_record.profile_id is null
      or profile_record.recovery_code_hash <> proof_hash
    then
      raise exception 'This study name is already in use. Enter its recovery code.'
        using errcode = '28000';
    end if;

    update private.participant_profiles as existing
    set last_accessed_at = clock_timestamp()
    where existing.profile_id = profile_record.profile_id
    returning existing.* into profile_record;
  end if;

  return pg_catalog.jsonb_build_object(
    'profileId', profile_record.profile_id,
    'displayName', profile_record.display_name,
    'createdAt', profile_record.created_at,
    'lastAccessedAt', profile_record.last_accessed_at,
    'created', profile_created
  );
end;
$$;

create or replace function public.reclaim_participant_profile(
  participant_name text,
  recovery_proof text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_name text;
  proof_hash bytea;
  profile_record private.participant_profiles%rowtype;
begin
  if participant_name is null
    or octet_length(participant_name) > 512
    or recovery_proof is null
    or recovery_proof !~ '^[0-9A-Fa-f]{64}$'
  then
    raise exception 'The study name or recovery proof is not valid.' using errcode = '22023';
  end if;
  canonical_name := private.canonical_participant_name(participant_name);
  if char_length(canonical_name) not between 1 and 80
    or canonical_name ~ '[[:cntrl:]]'
  then
    raise exception 'The study name or recovery proof is not valid.' using errcode = '22023';
  end if;
  proof_hash := private.participant_recovery_hash(recovery_proof);

  select existing.* into profile_record
  from private.participant_profiles as existing
  where existing.normalized_name = private.participant_name_key(canonical_name)
    and existing.recovery_code_hash = proof_hash;
  if profile_record.profile_id is null then
    raise exception 'The study name or recovery code did not match.' using errcode = '28000';
  end if;

  update private.participant_profiles as existing
  set last_accessed_at = clock_timestamp()
  where existing.profile_id = profile_record.profile_id
  returning existing.* into profile_record;

  return pg_catalog.jsonb_build_object(
    'profileId', profile_record.profile_id,
    'displayName', profile_record.display_name,
    'createdAt', profile_record.created_at,
    'lastAccessedAt', profile_record.last_accessed_at
  );
end;
$$;

create or replace function public.get_participant_progress(
  participant_profile_id uuid,
  recovery_proof text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_record private.participant_profiles%rowtype;
  completed_sessions jsonb;
  completed_conditions jsonb;
  remaining_conditions jsonb;
begin
  if participant_profile_id is null
    or recovery_proof is null
    or recovery_proof !~ '^[0-9A-Fa-f]{64}$'
  then
    raise exception 'Participant authentication failed.' using errcode = '28000';
  end if;
  select existing.* into profile_record
  from private.participant_profiles as existing
  where existing.profile_id = participant_profile_id
    and existing.recovery_code_hash = private.participant_recovery_hash(recovery_proof);
  if profile_record.profile_id is null then
    raise exception 'Participant authentication failed.' using errcode = '28000';
  end if;

  update private.participant_profiles
  set last_accessed_at = clock_timestamp()
  where profile_id = profile_record.profile_id
  returning * into profile_record;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'sessionId', saved.session_id,
        'conditionId', saved.condition_id,
        'completedAt', saved.ended_at,
        'studyBuildVersion', saved.payload ->> 'studyBuildVersion'
      ) order by saved.ended_at asc, saved.session_id asc
    ),
    '[]'::jsonb
  ) into completed_sessions
  from private.participant_profile_sessions as linked
  join public.study_sessions as saved on saved.session_id = linked.session_id
  where linked.profile_id = profile_record.profile_id
    and saved.status = 'completed';

  with conditions(condition_id, ordinal) as (
    values
      ('bright-red'::text, 1), ('dim-red'::text, 2),
      ('bright-blue'::text, 3), ('dim-blue'::text, 4), ('control'::text, 5)
  )
  select
    coalesce(pg_catalog.jsonb_agg(condition_id order by ordinal)
      filter (where has_completed), '[]'::jsonb),
    coalesce(pg_catalog.jsonb_agg(condition_id order by ordinal)
      filter (where not has_completed), '[]'::jsonb)
  into completed_conditions, remaining_conditions
  from (
    select conditions.condition_id, conditions.ordinal, exists (
      select 1
      from private.participant_profile_sessions as linked
      join public.study_sessions as saved on saved.session_id = linked.session_id
      where linked.profile_id = profile_record.profile_id
        and saved.status = 'completed'
        and saved.condition_id = conditions.condition_id
        and (
          (
            saved.condition_id = 'control'
            and saved.payload ->> 'exposureStatus' = 'not-applicable'
          )
          or (
            saved.condition_id in ('bright-red', 'dim-red', 'bright-blue', 'dim-blue')
            and saved.payload ->> 'exposureStatus' = 'completed'
          )
        )
    ) as has_completed
    from conditions
  ) as condition_progress;

  return pg_catalog.jsonb_build_object(
    'profile', pg_catalog.jsonb_build_object(
      'profileId', profile_record.profile_id,
      'displayName', profile_record.display_name,
      'createdAt', profile_record.created_at,
      'lastAccessedAt', profile_record.last_accessed_at
    ),
    'completedSessions', completed_sessions,
    'completedConditionIds', completed_conditions,
    'remainingConditionIds', remaining_conditions
  );
end;
$$;

create or replace function public.submit_profile_study_session(
  participant_profile_id uuid,
  recovery_proof text,
  session_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_record private.participant_profiles%rowtype;
  final_payload jsonb;
  candidate_session_id uuid;
  inserted_count integer;
  stored_payload jsonb;
  linked_profile_id uuid;
begin
  if participant_profile_id is null
    or recovery_proof is null
    or recovery_proof !~ '^[0-9A-Fa-f]{64}$'
  then
    raise exception 'Participant authentication failed.' using errcode = '28000';
  end if;
  select existing.* into profile_record
  from private.participant_profiles as existing
  where existing.profile_id = participant_profile_id
    and existing.recovery_code_hash = private.participant_recovery_hash(recovery_proof);
  if profile_record.profile_id is null then
    raise exception 'Participant authentication failed.' using errcode = '28000';
  end if;

  if session_payload is null
    or pg_catalog.jsonb_typeof(session_payload) <> 'object'
    or pg_catalog.pg_column_size(session_payload) > 1048576
    or session_payload ->> 'schemaVersion' <> '3'
    or session_payload ->> 'participantId' <> profile_record.display_name
    or session_payload ->> 'status' not in ('completed', 'terminated')
    or session_payload ->> 'conditionId' not in (
      'bright-red', 'dim-red', 'bright-blue', 'dim-blue', 'control'
    )
    or coalesce(session_payload ->> 'sessionId', '') !~
      '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$'
    or coalesce(session_payload ->> 'startedAtIso', '') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
    or coalesce(session_payload ->> 'endedAtIso', '') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  then
    raise exception 'The final session payload is not valid.' using errcode = '22023';
  end if;

  if session_payload ? 'participantProfileId'
    and (
      pg_catalog.jsonb_typeof(session_payload -> 'participantProfileId') <> 'string'
      or session_payload ->> 'participantProfileId' <> participant_profile_id::text
    )
  then
    raise exception 'The session belongs to a different participant profile.' using errcode = '22023';
  end if;
  if session_payload ? 'studyBuildVersion'
    and (
      pg_catalog.jsonb_typeof(session_payload -> 'studyBuildVersion') <> 'string'
      or session_payload ->> 'studyBuildVersion' !~ '^[A-Za-z0-9._+-]{1,80}$'
    )
  then
    raise exception 'The study build version is not valid.' using errcode = '22023';
  end if;

  final_payload := session_payload || pg_catalog.jsonb_build_object(
    'participantProfileId', participant_profile_id::text
  );
  if pg_catalog.pg_column_size(final_payload) > 1048576 then
    raise exception 'The final session payload exceeds the 1 MiB limit.' using errcode = '22001';
  end if;
  candidate_session_id := (final_payload ->> 'sessionId')::uuid;

  insert into public.study_sessions (
    session_id, participant_id, condition_id, status, started_at, ended_at, payload
  ) values (
    candidate_session_id,
    profile_record.display_name,
    final_payload ->> 'conditionId',
    final_payload ->> 'status',
    (final_payload ->> 'startedAtIso')::timestamptz,
    (final_payload ->> 'endedAtIso')::timestamptz,
    final_payload
  )
  on conflict (session_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    select saved.payload into stored_payload
    from public.study_sessions as saved
    where saved.session_id = candidate_session_id;
    if stored_payload is distinct from final_payload then
      raise exception 'This session identifier is already used by another record.'
        using errcode = '23505';
    end if;
  end if;

  insert into private.participant_profile_sessions (profile_id, session_id)
  values (profile_record.profile_id, candidate_session_id)
  on conflict (session_id) do nothing;

  select linked.profile_id into linked_profile_id
  from private.participant_profile_sessions as linked
  where linked.session_id = candidate_session_id;
  if linked_profile_id is distinct from profile_record.profile_id then
    raise exception 'This session identifier belongs to another participant profile.'
      using errcode = '23505';
  end if;

  update private.participant_profiles
  set last_accessed_at = clock_timestamp()
  where profile_id = profile_record.profile_id;

  return pg_catalog.jsonb_build_object(
    'sessionId', candidate_session_id,
    'saved', inserted_count = 1
  );
end;
$$;

create or replace function public.submit_participant_feedback(
  participant_profile_id uuid,
  recovery_proof text,
  session_id uuid,
  message_type text,
  message_body text,
  response_language text,
  prompt_version text,
  study_build_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  proof_hash bytea;
  candidate_session_id uuid := session_id;
  candidate_message_type text := message_type;
  candidate_message_body text := message_body;
  candidate_response_language text := response_language;
  candidate_prompt_version text := prompt_version;
  candidate_build_version text := study_build_version;
  new_feedback_id uuid := pg_catalog.gen_random_uuid();
  created_time timestamptz := clock_timestamp();
begin
  if participant_profile_id is null
    or recovery_proof is null
    or recovery_proof !~ '^[0-9A-Fa-f]{64}$'
  then
    raise exception 'Participant authentication failed.' using errcode = '28000';
  end if;
  proof_hash := private.participant_recovery_hash(recovery_proof);
  if not exists (
    select 1 from private.participant_profiles as existing
    where existing.profile_id = participant_profile_id
      and existing.recovery_code_hash = proof_hash
  ) then
    raise exception 'Participant authentication failed.' using errcode = '28000';
  end if;
  if candidate_session_id is null or not exists (
    select 1 from private.participant_profile_sessions as linked
    where linked.profile_id = participant_profile_id
      and linked.session_id = candidate_session_id
  ) then
    raise exception 'Feedback must refer to one of this participant''s saved sessions.'
      using errcode = '22023';
  end if;
  if candidate_message_type not in ('feedback', 'question')
    or candidate_message_body is null
    or char_length(pg_catalog.btrim(candidate_message_body)) not between 1 and 4000
    or candidate_response_language not in ('en', 'zh')
    or candidate_prompt_version is null
    or candidate_prompt_version !~ '^[A-Za-z0-9._+-]{1,80}$'
    or (
      candidate_build_version is not null
      and candidate_build_version !~ '^[A-Za-z0-9._+-]{1,80}$'
    )
  then
    raise exception 'The feedback response is not valid.' using errcode = '22023';
  end if;

  insert into private.participant_feedback (
    feedback_id, profile_id, session_id, message_type, message_body,
    response_language, prompt_version, study_build_version, created_at
  ) values (
    new_feedback_id, participant_profile_id, candidate_session_id,
    candidate_message_type, candidate_message_body, candidate_response_language,
    candidate_prompt_version, candidate_build_version, created_time
  );

  return pg_catalog.jsonb_build_object(
    'feedbackId', new_feedback_id,
    'createdAt', created_time
  );
end;
$$;

create or replace function public.admin_list_participant_profiles(
  page_size integer default 500,
  page_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_items jsonb;
  result_total integer;
begin
  if private.is_study_admin() is not true then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if page_size is null
    or page_offset is null
    or page_size not between 1 and 500
    or page_offset not between 0 and 1000000
  then
    raise exception 'The requested page is not valid.' using errcode = '22023';
  end if;

  select count(*)::integer into result_total from private.participant_profiles;
  select coalesce(
    pg_catalog.jsonb_agg(profile_item order by profile_item ->> 'createdAt' desc),
    '[]'::jsonb
  ) into result_items
  from (
    select pg_catalog.jsonb_build_object(
      'profileId', profile.profile_id,
      'displayName', profile.display_name,
      'createdAt', profile.created_at,
      'lastAccessedAt', profile.last_accessed_at,
      'completedSessionCount', (
        select count(*)
        from private.participant_profile_sessions as linked
        join public.study_sessions as saved on saved.session_id = linked.session_id
        where linked.profile_id = profile.profile_id and saved.status = 'completed'
      ),
      'completedConditionIds', coalesce((
        select pg_catalog.jsonb_agg(completed.condition_id order by completed.condition_id)
        from (
          select distinct saved.condition_id
          from private.participant_profile_sessions as linked
          join public.study_sessions as saved on saved.session_id = linked.session_id
          where linked.profile_id = profile.profile_id and saved.status = 'completed'
            and (
              (
                saved.condition_id = 'control'
                and saved.payload ->> 'exposureStatus' = 'not-applicable'
              )
              or (
                saved.condition_id in ('bright-red', 'dim-red', 'bright-blue', 'dim-blue')
                and saved.payload ->> 'exposureStatus' = 'completed'
              )
            )
        ) as completed
      ), '[]'::jsonb),
      'feedbackCount', (
        select count(*) from private.participant_feedback as feedback
        where feedback.profile_id = profile.profile_id
      )
    ) as profile_item
    from private.participant_profiles as profile
    order by profile.created_at desc, profile.profile_id
    limit page_size offset page_offset
  ) as listed;

  return pg_catalog.jsonb_build_object('items', result_items, 'total', result_total);
end;
$$;

create or replace function public.admin_list_participant_feedback(
  page_size integer default 500,
  page_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_items jsonb;
  result_total integer;
begin
  if private.is_study_admin() is not true then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if page_size is null
    or page_offset is null
    or page_size not between 1 and 500
    or page_offset not between 0 and 1000000
  then
    raise exception 'The requested page is not valid.' using errcode = '22023';
  end if;

  select count(*)::integer into result_total from private.participant_feedback;
  select coalesce(
    pg_catalog.jsonb_agg(feedback_item order by feedback_item ->> 'createdAt' desc),
    '[]'::jsonb
  ) into result_items
  from (
    select pg_catalog.jsonb_build_object(
      'feedbackId', feedback.feedback_id,
      'profileId', feedback.profile_id,
      'displayName', profile.display_name,
      'sessionId', feedback.session_id,
      'conditionId', saved.condition_id,
      'messageType', feedback.message_type,
      'message', feedback.message_body,
      'language', feedback.response_language,
      'promptVersion', feedback.prompt_version,
      'studyBuildVersion', feedback.study_build_version,
      'createdAt', feedback.created_at
    ) as feedback_item
    from private.participant_feedback as feedback
    join private.participant_profiles as profile on profile.profile_id = feedback.profile_id
    join public.study_sessions as saved on saved.session_id = feedback.session_id
    order by feedback.created_at desc, feedback.feedback_id
    limit page_size offset page_offset
  ) as listed;

  return pg_catalog.jsonb_build_object('items', result_items, 'total', result_total);
end;
$$;

revoke all on function public.claim_participant_profile(text, text)
  from public, anon, authenticated;
revoke all on function public.reclaim_participant_profile(text, text)
  from public, anon, authenticated;
revoke all on function public.get_participant_progress(uuid, text)
  from public, anon, authenticated;
revoke all on function public.submit_profile_study_session(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.submit_participant_feedback(
  uuid, text, uuid, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.admin_list_participant_profiles(integer, integer)
  from public, anon, authenticated;
revoke all on function public.admin_list_participant_feedback(integer, integer)
  from public, anon, authenticated;

grant execute on function public.claim_participant_profile(text, text) to anon;
grant execute on function public.reclaim_participant_profile(text, text) to anon;
grant execute on function public.get_participant_progress(uuid, text) to anon;
grant execute on function public.submit_profile_study_session(uuid, text, jsonb) to anon;
grant execute on function public.submit_participant_feedback(
  uuid, text, uuid, text, text, text, text, text
) to anon;
grant execute on function public.admin_list_participant_profiles(integer, integer)
  to authenticated;
grant execute on function public.admin_list_participant_feedback(integer, integer)
  to authenticated;

commit;
