begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists private.study_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on table private.study_admins from public, anon, authenticated;

create table if not exists public.study_sessions (
  session_id uuid primary key,
  participant_id text not null,
  condition_id text not null,
  status text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),

  constraint study_participant_trimmed_ck
    check (participant_id = btrim(participant_id)),
  constraint study_participant_length_ck
    check (char_length(participant_id) between 1 and 80),
  constraint study_participant_control_chars_ck
    check (participant_id !~ '[[:cntrl:]]'),
  constraint study_participant_reserved_ck
    check (lower(participant_id) not in ('test', 'admin')),
  constraint study_condition_ck
    check (condition_id in ('bright-red', 'dim-red', 'bright-blue', 'dim-blue')),
  constraint study_status_ck
    check (status in ('completed', 'terminated')),
  constraint study_time_order_ck
    check (ended_at >= started_at),
  constraint study_payload_object_ck
    check (jsonb_typeof(payload) = 'object'),
  constraint study_payload_schema_version_type_ck
    check (coalesce(jsonb_typeof(payload -> 'schemaVersion'), '') = 'number'),
  constraint study_payload_scalar_types_ck
    check (
      coalesce(jsonb_typeof(payload -> 'sessionId'), '') = 'string'
      and coalesce(jsonb_typeof(payload -> 'participantId'), '') = 'string'
      and coalesce(jsonb_typeof(payload -> 'conditionId'), '') = 'string'
      and coalesce(jsonb_typeof(payload -> 'status'), '') = 'string'
      and coalesce(jsonb_typeof(payload -> 'startedAtIso'), '') = 'string'
      and coalesce(jsonb_typeof(payload -> 'endedAtIso'), '') = 'string'
    ),
  constraint study_payload_size_ck
    check (pg_column_size(payload) <= 1048576),
  constraint study_payload_keys_ck
    check (payload ?& array[
      'schemaVersion', 'sessionId', 'participantId', 'conditionId', 'status',
      'startedAtIso', 'endedAtIso', 'trialPlan', 'trials', 'falseClicks',
      'pauses', 'environmentEvents'
    ]),
  constraint study_payload_arrays_ck
    check (
      coalesce(jsonb_typeof(payload -> 'trialPlan'), '') = 'array'
      and coalesce(jsonb_typeof(payload -> 'trials'), '') = 'array'
      and coalesce(jsonb_typeof(payload -> 'falseClicks'), '') = 'array'
      and coalesce(jsonb_typeof(payload -> 'pauses'), '') = 'array'
      and coalesce(jsonb_typeof(payload -> 'environmentEvents'), '') = 'array'
    ),
  constraint study_payload_array_lengths_ck
    check (
      case when jsonb_typeof(payload -> 'trialPlan') = 'array'
        then jsonb_array_length(payload -> 'trialPlan') = 20 else false end
      and case when jsonb_typeof(payload -> 'trials') = 'array'
        then jsonb_array_length(payload -> 'trials') <= 20 else false end
      and case when jsonb_typeof(payload -> 'falseClicks') = 'array'
        then jsonb_array_length(payload -> 'falseClicks') <= 10000 else false end
      and case when jsonb_typeof(payload -> 'pauses') = 'array'
        then jsonb_array_length(payload -> 'pauses') <= 1000 else false end
      and case when jsonb_typeof(payload -> 'environmentEvents') = 'array'
        then jsonb_array_length(payload -> 'environmentEvents') <= 1000 else false end
    ),
  constraint study_payload_matches_columns_ck
    check (
      payload ->> 'schemaVersion' = '2'
      and coalesce(payload ->> 'sessionId', '') = session_id::text
      and coalesce(payload ->> 'participantId', '') = participant_id
      and coalesce(payload ->> 'conditionId', '') = condition_id
      and coalesce(payload ->> 'status', '') = status
      and coalesce((payload ->> 'startedAtIso')::timestamptz = started_at, false)
      and coalesce((payload ->> 'endedAtIso')::timestamptz = ended_at, false)
    )
);

create index if not exists study_sessions_received_at_idx
  on public.study_sessions (received_at desc);
create index if not exists study_sessions_participant_id_idx
  on public.study_sessions (participant_id);
create index if not exists study_sessions_condition_id_idx
  on public.study_sessions (condition_id);

alter table public.study_sessions enable row level security;
alter table public.study_sessions force row level security;

revoke all on table public.study_sessions from anon, authenticated;
grant insert (session_id, participant_id, condition_id, status, started_at, ended_at, payload)
  on table public.study_sessions to anon;
grant select on table public.study_sessions to authenticated;
grant all on table public.study_sessions to service_role;

create or replace function private.is_study_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.study_admins as administrator
    where administrator.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_study_admin() from public, anon, authenticated;
grant execute on function private.is_study_admin() to authenticated;

drop policy if exists "anonymous insert final study sessions" on public.study_sessions;
create policy "anonymous insert final study sessions"
  on public.study_sessions
  for insert
  to anon
  with check (
    status in ('completed', 'terminated')
    and lower(participant_id) not in ('test', 'admin')
  );

drop policy if exists "study admins read sessions" on public.study_sessions;
create policy "study admins read sessions"
  on public.study_sessions
  for select
  to authenticated
  using ((select private.is_study_admin()));

do $$
declare
  administrator_id uuid;
begin
  select id into administrator_id
  from auth.users
  where lower(email) = lower('dkm26355@gmail.com')
  limit 1;

  if administrator_id is null then
    raise exception 'Create and confirm the admin Auth user dkm26355@gmail.com first';
  end if;

  insert into private.study_admins(user_id)
  values (administrator_id)
  on conflict (user_id) do nothing;
end $$;

commit;
