begin;

-- HARD PREREQUISITE: run and verify 20260731_protocol_v4.sql first. This file
-- calls private.is_valid_study_session_v4() to preserve the unchanged parts of
-- the record contract. Before running this transaction in production, save the
-- schema-v2/v3/v4 count and payload fingerprint shown at the end of this file.
-- Apply the database migration before deploying the matching v5 frontend.

-- Protocol v5 is additive. It does not reinterpret the historical schema-v3
-- conditionId "control", which remains Control — Normal Sleep with no display
-- and no attention trials. The new black-screen exposure therefore uses the
-- distinct conditionId "black-control".
--
-- The v5 validator reuses the already-deployed v4 validator only for the
-- unchanged survey, timeline, device, pause, event, and sparse-trial rules.
-- Every scientific field that differs in v5 is checked below before a
-- normalized copy is passed to the v4 validator. No v4 payload or function is
-- changed by this migration.
create or replace function private.is_valid_study_session_v5(
  candidate jsonb,
  allow_active boolean default false
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  candidate_condition text;
  sequence_position integer;
  normalized_candidate jsonb;
begin
  if candidate is null
    or pg_catalog.jsonb_typeof(candidate) <> 'object'
    or pg_catalog.pg_column_size(candidate) > 1048576
    or pg_catalog.jsonb_typeof(candidate -> 'schemaVersion') <> 'number'
    or candidate ->> 'schemaVersion' <> '5'
    or not candidate ?& array[
      'schemaVersion', 'protocolVersion', 'sequenceVersion', 'sequencePosition',
      'attentionProtocolVersion', 'attentionCrossColorHex',
      'attentionCrossColorRgb', 'sessionId', 'participantId',
      'participantProfileId', 'studyBuildVersion', 'conditionId',
      'conditionName', 'stimulusColorHex', 'stimulusColorRgb',
      'plannedDurationMs', 'plannedEndAtIso', 'actualDurationMs',
      'wallClockDurationMs', 'totalPausedDurationMs', 'crossVisibleMs',
      'startedAtIso', 'stimulusStartedAtIso', 'stimulusEndedAtIso',
      'sleepStartedAtIso', 'morningReturnedAtIso',
      'assessmentCompletedAtIso', 'endedAtIso', 'status', 'exposureStatus',
      'terminationReason', 'fullscreenAtStart', 'fullscreenRequestFailed',
      'deviceInfo', 'preSurvey', 'postExposureSurvey', 'morningSurvey',
      'trialPlan', 'trials', 'falseClicks', 'pauses', 'environmentEvents'
    ]
  then
    return false;
  end if;

  if pg_catalog.jsonb_typeof(candidate -> 'protocolVersion') <> 'string'
    or candidate ->> 'protocolVersion' <> 'overnight-v3'
    or pg_catalog.jsonb_typeof(candidate -> 'sequenceVersion') <> 'string'
    or candidate ->> 'sequenceVersion' <> 'fixed-five-v1'
    or pg_catalog.jsonb_typeof(candidate -> 'attentionProtocolVersion') <> 'string'
    or candidate ->> 'attentionProtocolVersion' <> 'sparse-4-50-70-v1'
    or pg_catalog.jsonb_typeof(candidate -> 'sequencePosition') <> 'number'
    or coalesce(candidate ->> 'sequencePosition', '') !~ '^[1-5]$'
    or pg_catalog.jsonb_typeof(candidate -> 'conditionId') <> 'string'
    or pg_catalog.jsonb_typeof(candidate -> 'conditionName') <> 'string'
    or pg_catalog.jsonb_typeof(candidate -> 'stimulusColorHex') <> 'string'
    or pg_catalog.jsonb_typeof(candidate -> 'stimulusColorRgb') <> 'string'
    or pg_catalog.jsonb_typeof(candidate -> 'attentionCrossColorHex') <> 'string'
    or pg_catalog.jsonb_typeof(candidate -> 'attentionCrossColorRgb') <> 'string'
    or pg_catalog.jsonb_typeof(candidate -> 'plannedDurationMs') <> 'number'
    or candidate ->> 'plannedDurationMs' <> '300000'
    or pg_catalog.jsonb_typeof(candidate -> 'crossVisibleMs') <> 'number'
    or candidate ->> 'crossVisibleMs' <> '1800'
    or pg_catalog.jsonb_typeof(candidate -> 'trialPlan') <> 'array'
    or pg_catalog.jsonb_array_length(candidate -> 'trialPlan') <> 4
    or pg_catalog.jsonb_typeof(candidate -> 'trials') <> 'array'
    or pg_catalog.jsonb_array_length(candidate -> 'trials') > 4
    or (
      candidate ->> 'exposureStatus' = 'completed'
      and pg_catalog.jsonb_array_length(candidate -> 'trials') <> 4
    )
  then
    return false;
  end if;

  sequence_position := (candidate ->> 'sequencePosition')::integer;
  candidate_condition := candidate ->> 'conditionId';

  -- Spell out the five valid pairs. This is equivalent to comparing with a
  -- CASE expression, but avoids nested WHEN ... THEN tokens inside a PL/pgSQL
  -- IF and is safer when copying the migration through a browser SQL editor.
  if not (
    (sequence_position = 1 and candidate_condition = 'dim-red')
    or (sequence_position = 2 and candidate_condition = 'dim-blue')
    or (sequence_position = 3 and candidate_condition = 'black-control')
    or (sequence_position = 4 and candidate_condition = 'bright-blue')
    or (sequence_position = 5 and candidate_condition = 'bright-red')
  ) then
    return false;
  end if;

  if not (
    (candidate_condition = 'dim-red'
      and candidate ->> 'conditionName' = 'Dim Red'
      and candidate ->> 'stimulusColorHex' = '#660000'
      and candidate ->> 'stimulusColorRgb' = '102, 0, 0'
      and candidate ->> 'attentionCrossColorHex' = '#000000'
      and candidate ->> 'attentionCrossColorRgb' = '0, 0, 0')
    or (candidate_condition = 'dim-blue'
      and candidate ->> 'conditionName' = 'Dim Blue'
      and candidate ->> 'stimulusColorHex' = '#000066'
      and candidate ->> 'stimulusColorRgb' = '0, 0, 102'
      and candidate ->> 'attentionCrossColorHex' = '#000000'
      and candidate ->> 'attentionCrossColorRgb' = '0, 0, 0')
    or (candidate_condition = 'black-control'
      and candidate ->> 'conditionName' = 'Black-screen Control'
      and candidate ->> 'stimulusColorHex' = '#000000'
      and candidate ->> 'stimulusColorRgb' = '0, 0, 0'
      and candidate ->> 'attentionCrossColorHex' = '#808080'
      and candidate ->> 'attentionCrossColorRgb' = '128, 128, 128')
    or (candidate_condition = 'bright-blue'
      and candidate ->> 'conditionName' = 'Bright Blue'
      and candidate ->> 'stimulusColorHex' = '#0000ff'
      and candidate ->> 'stimulusColorRgb' = '0, 0, 255'
      and candidate ->> 'attentionCrossColorHex' = '#000000'
      and candidate ->> 'attentionCrossColorRgb' = '0, 0, 0')
    or (candidate_condition = 'bright-red'
      and candidate ->> 'conditionName' = 'Bright Red'
      and candidate ->> 'stimulusColorHex' = '#ff0000'
      and candidate ->> 'stimulusColorRgb' = '255, 0, 0'
      and candidate ->> 'attentionCrossColorHex' = '#000000'
      and candidate ->> 'attentionCrossColorRgb' = '0, 0, 0')
  ) then
    return false;
  end if;

  -- Normalize only the v5 fields that intentionally differ, so the proven v4
  -- structural validator can enforce the unchanged five-minute exposure,
  -- four 50–70-second sparse trials, surveys, devices, and complete timeline.
  normalized_candidate := (
    candidate - 'attentionCrossColorHex' - 'attentionCrossColorRgb'
  ) || pg_catalog.jsonb_build_object(
    'schemaVersion', 4,
    'protocolVersion', 'overnight-v2',
    'sequenceVersion', 'fixed-four-v1',
    'sequencePosition', 1,
    'conditionId', 'dim-red',
    'conditionName', 'Dim Red',
    'stimulusColorHex', '#660000',
    'stimulusColorRgb', '102, 0, 0'
  );

  return private.is_valid_study_session_v4(normalized_candidate, allow_active);
exception
  when others then
    return false;
end;
$$;

revoke all on function private.is_valid_study_session_v5(jsonb, boolean)
  from public, anon, authenticated;
grant execute on function private.is_valid_study_session_v5(jsonb, boolean)
  to service_role;

-- A participant-facing recovery draft intentionally expires after 48 hours,
-- but an administrator still needs an auditable record when the evening
-- exposure and immediate post-exposure questionnaire were completed and the
-- next-morning questionnaire was never submitted. Keep those checkpoints in a
-- separate append-only private table. The table stores distinct validated
-- payload versions so refreshing the recovery draft never overwrites an older
-- captured answer. It supports both the already-deployed v4 save RPC and the
-- v5 save RPC below through one trigger on private.study_drafts.
create table if not exists private.incomplete_study_session_snapshots (
  participant_profile_id uuid not null
    references private.participant_profiles(profile_id) on delete restrict,
  session_id uuid not null,
  payload_hash bytea not null,
  payload jsonb not null,
  captured_at timestamptz not null default clock_timestamp(),

  primary key (session_id, payload_hash),
  constraint incomplete_session_snapshot_hash_ck
    check (
      pg_catalog.octet_length(payload_hash) = 32
      and payload_hash = pg_catalog.sha256(
        pg_catalog.convert_to(payload::text, 'UTF8')
      )
    ),
  constraint incomplete_session_snapshot_payload_ck
    check (
      pg_catalog.jsonb_typeof(payload) = 'object'
      and pg_catalog.pg_column_size(payload) <= 131072
      and payload ->> 'schemaVersion' in ('4', '5')
      and payload ->> 'status' = 'active'
      and payload ->> 'exposureStatus' = 'completed'
      and payload -> 'postExposureSurvey' <> 'null'::jsonb
      and payload -> 'morningSurvey' = 'null'::jsonb
      and payload ->> 'participantProfileId' = participant_profile_id::text
      and payload ->> 'sessionId' = session_id::text
      and case payload ->> 'schemaVersion'
        when '4' then private.is_valid_study_session_v4(payload, true)
        when '5' then private.is_valid_study_session_v5(payload, true)
        else false
      end
    )
);

create index if not exists incomplete_session_snapshots_profile_idx
  on private.incomplete_study_session_snapshots (
    participant_profile_id,
    captured_at desc
  );
create index if not exists incomplete_session_snapshots_captured_idx
  on private.incomplete_study_session_snapshots (captured_at desc);

alter table private.incomplete_study_session_snapshots enable row level security;
revoke all on table private.incomplete_study_session_snapshots
  from public, anon, authenticated;
grant all on table private.incomplete_study_session_snapshots to service_role;

drop trigger if exists incomplete_study_session_snapshots_append_only
  on private.incomplete_study_session_snapshots;
create trigger incomplete_study_session_snapshots_append_only
before update or delete on private.incomplete_study_session_snapshots
for each row execute function private.reject_study_history_mutation();

create or replace function private.capture_incomplete_study_session_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_hash bytea;
begin
  if new.participant_profile_id is null
    or new.payload ->> 'schemaVersion' not in ('4', '5')
    or new.payload ->> 'status' <> 'active'
    or new.payload ->> 'exposureStatus' <> 'completed'
    or new.payload -> 'postExposureSurvey' = 'null'::jsonb
    or new.payload -> 'morningSurvey' <> 'null'::jsonb
  then
    return new;
  end if;

  if (
      new.payload ->> 'schemaVersion' = '4'
      and private.is_valid_study_session_v4(new.payload, true) is not true
    ) or (
      new.payload ->> 'schemaVersion' = '5'
      and private.is_valid_study_session_v5(new.payload, true) is not true
    )
  then
    return new;
  end if;

  candidate_hash := pg_catalog.sha256(
    pg_catalog.convert_to(new.payload::text, 'UTF8')
  );
  insert into private.incomplete_study_session_snapshots (
    participant_profile_id,
    session_id,
    payload_hash,
    payload,
    captured_at
  ) values (
    new.participant_profile_id,
    (new.payload ->> 'sessionId')::uuid,
    candidate_hash,
    new.payload,
    clock_timestamp()
  ) on conflict (session_id, payload_hash) do nothing;

  return new;
end;
$$;

revoke all on function private.capture_incomplete_study_session_snapshot()
  from public, anon, authenticated;
grant execute on function private.capture_incomplete_study_session_snapshot()
  to service_role;

drop trigger if exists capture_incomplete_study_session_snapshot
  on private.study_drafts;
create trigger capture_incomplete_study_session_snapshot
after insert or update of payload, participant_profile_id
on private.study_drafts
for each row execute function private.capture_incomplete_study_session_snapshot();

-- Capture a qualifying v4 draft that already exists when this additive
-- migration is applied. Existing recovery rows are read only; none are
-- converted, updated, deleted, or given a longer participant recovery window.
insert into private.incomplete_study_session_snapshots (
  participant_profile_id,
  session_id,
  payload_hash,
  payload,
  captured_at
)
select
  stored.participant_profile_id,
  (stored.payload ->> 'sessionId')::uuid,
  pg_catalog.sha256(pg_catalog.convert_to(stored.payload::text, 'UTF8')),
  stored.payload,
  stored.updated_at
from private.study_drafts as stored
where stored.participant_profile_id is not null
  and stored.payload ->> 'schemaVersion' in ('4', '5')
  and stored.payload ->> 'status' = 'active'
  and stored.payload ->> 'exposureStatus' = 'completed'
  and stored.payload -> 'postExposureSurvey' <> 'null'::jsonb
  and stored.payload -> 'morningSurvey' = 'null'::jsonb
  and case stored.payload ->> 'schemaVersion'
    when '4' then private.is_valid_study_session_v4(stored.payload, true)
    when '5' then private.is_valid_study_session_v5(stored.payload, true)
    else false
  end
on conflict (session_id, payload_hash) do nothing;

-- Retain every historical condition and schema branch exactly as deployed,
-- then add only the new v5 branch and black-screen condition.
alter table public.study_sessions
  drop constraint if exists study_condition_ck,
  drop constraint if exists study_payload_array_lengths_ck,
  drop constraint if exists study_payload_matches_columns_ck,
  drop constraint if exists study_payload_v5_contract_ck;

alter table public.study_sessions
  add constraint study_condition_ck
    check (condition_id in (
      'bright-red', 'dim-red', 'bright-blue', 'dim-blue', 'control',
      'black-control'
    )),
  add constraint study_payload_array_lengths_ck
    check (
      (
        (
          payload ->> 'schemaVersion' = '2'
          and condition_id in ('bright-red', 'dim-red', 'bright-blue', 'dim-blue')
          and pg_catalog.jsonb_array_length(payload -> 'trialPlan') = 20
          and pg_catalog.jsonb_array_length(payload -> 'trials') <= 20
        )
        or (
          payload ->> 'schemaVersion' = '3'
          and (
            (
              condition_id in ('bright-red', 'dim-red', 'bright-blue', 'dim-blue')
              and pg_catalog.jsonb_array_length(payload -> 'trialPlan') = 4
              and pg_catalog.jsonb_array_length(payload -> 'trials') <= 4
              and (
                payload ->> 'exposureStatus' <> 'completed'
                or pg_catalog.jsonb_array_length(payload -> 'trials') = 4
              )
            )
            or (
              condition_id = 'control'
              and pg_catalog.jsonb_array_length(payload -> 'trialPlan') = 0
              and pg_catalog.jsonb_array_length(payload -> 'trials') = 0
            )
          )
        )
        or (
          payload ->> 'schemaVersion' = '4'
          and condition_id in ('dim-red', 'dim-blue', 'bright-blue', 'bright-red')
          and pg_catalog.jsonb_array_length(payload -> 'trialPlan') = 4
          and pg_catalog.jsonb_array_length(payload -> 'trials') <= 4
          and (
            payload ->> 'exposureStatus' <> 'completed'
            or pg_catalog.jsonb_array_length(payload -> 'trials') = 4
          )
        )
        or (
          payload ->> 'schemaVersion' = '5'
          and condition_id in (
            'dim-red', 'dim-blue', 'black-control', 'bright-blue', 'bright-red'
          )
          and pg_catalog.jsonb_array_length(payload -> 'trialPlan') = 4
          and pg_catalog.jsonb_array_length(payload -> 'trials') <= 4
          and (
            payload ->> 'exposureStatus' <> 'completed'
            or pg_catalog.jsonb_array_length(payload -> 'trials') = 4
          )
        )
      )
      and pg_catalog.jsonb_array_length(payload -> 'falseClicks') <= 10000
      and pg_catalog.jsonb_array_length(payload -> 'pauses') <= 1000
      and pg_catalog.jsonb_array_length(payload -> 'environmentEvents') <= 1000
    ),
  add constraint study_payload_matches_columns_ck
    check (
      payload ->> 'schemaVersion' in ('2', '3', '4', '5')
      and coalesce(payload ->> 'sessionId', '') = session_id::text
      and coalesce(payload ->> 'participantId', '') = participant_id
      and coalesce(payload ->> 'conditionId', '') = condition_id
      and coalesce(payload ->> 'status', '') = status
      and coalesce((payload ->> 'startedAtIso')::timestamptz = started_at, false)
      and coalesce((payload ->> 'endedAtIso')::timestamptz = ended_at, false)
      and (
        payload ->> 'schemaVersion' <> '2'
        or condition_id in ('bright-red', 'dim-red', 'bright-blue', 'dim-blue')
      )
    ),
  add constraint study_payload_v5_contract_ck
    check (
      case
        when payload ->> 'schemaVersion' = '5'
          then private.is_valid_study_session_v5(payload, false)
        else true
      end
    );

-- Only schema-v2/v3 historical clients retain direct anonymous final inserts.
-- v4 continues through its existing authenticated profile RPC and v5 uses the
-- versioned RPC below. The existing RLS policy is intentionally unchanged.

-- A participant's completed, contiguous v4 dim-red/dim-blue prefix is carried
-- forward into the equivalent v5 positions without changing either historical
-- row. Specifically: completed v4 position 1 maps to v5 position 1; completed
-- v4 position 2 maps to v5 position 2 only when completed v4 position 1 also
-- exists. Historical v4 bright-blue/bright-red never map to v5 positions 4/5.
-- Native completed v5 positions always count normally.
create or replace function private.is_v5_sequence_position_completed(
  candidate_profile_id uuid,
  candidate_position integer
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    case
      when candidate_position between 1 and 5 then
        exists (
          select 1
          from private.participant_profile_sessions as linked
          join public.study_sessions as saved on saved.session_id = linked.session_id
          where linked.profile_id = candidate_profile_id
            and saved.status = 'completed'
            and saved.payload ->> 'schemaVersion' = '5'
            and saved.payload ->> 'protocolVersion' = 'overnight-v3'
            and saved.payload ->> 'sequenceVersion' = 'fixed-five-v1'
            and saved.payload ->> 'exposureStatus' = 'completed'
            and (saved.payload ->> 'sequencePosition')::integer = candidate_position
        )
        or (
          candidate_position = 1
          and exists (
            select 1
            from private.participant_profile_sessions as linked
            join public.study_sessions as saved on saved.session_id = linked.session_id
            where linked.profile_id = candidate_profile_id
              and saved.status = 'completed'
              and saved.condition_id = 'dim-red'
              and saved.payload ->> 'schemaVersion' = '4'
              and saved.payload ->> 'protocolVersion' = 'overnight-v2'
              and saved.payload ->> 'sequenceVersion' = 'fixed-four-v1'
              and saved.payload ->> 'exposureStatus' = 'completed'
              and saved.payload ->> 'sequencePosition' = '1'
          )
        )
        or (
          candidate_position = 2
          and exists (
            select 1
            from private.participant_profile_sessions as linked
            join public.study_sessions as saved on saved.session_id = linked.session_id
            where linked.profile_id = candidate_profile_id
              and saved.status = 'completed'
              and saved.condition_id = 'dim-red'
              and saved.payload ->> 'schemaVersion' = '4'
              and saved.payload ->> 'protocolVersion' = 'overnight-v2'
              and saved.payload ->> 'sequenceVersion' = 'fixed-four-v1'
              and saved.payload ->> 'exposureStatus' = 'completed'
              and saved.payload ->> 'sequencePosition' = '1'
          )
          and exists (
            select 1
            from private.participant_profile_sessions as linked
            join public.study_sessions as saved on saved.session_id = linked.session_id
            where linked.profile_id = candidate_profile_id
              and saved.status = 'completed'
              and saved.condition_id = 'dim-blue'
              and saved.payload ->> 'schemaVersion' = '4'
              and saved.payload ->> 'protocolVersion' = 'overnight-v2'
              and saved.payload ->> 'sequenceVersion' = 'fixed-four-v1'
              and saved.payload ->> 'exposureStatus' = 'completed'
              and saved.payload ->> 'sequencePosition' = '2'
          )
        )
      else false
    end,
    false
  );
$$;

create or replace function private.next_v5_sequence_position(
  candidate_profile_id uuid
)
returns integer
language sql
stable
set search_path = ''
as $$
  select generated.position
  from pg_catalog.generate_series(1, 5) as generated(position)
  where private.is_v5_sequence_position_completed(
    candidate_profile_id,
    generated.position
  ) is not true
  order by generated.position
  limit 1;
$$;

create or replace function private.v5_condition_for_position(
  candidate_position integer
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case candidate_position
    when 1 then 'dim-red'
    when 2 then 'dim-blue'
    when 3 then 'black-control'
    when 4 then 'bright-blue'
    when 5 then 'bright-red'
    else null
  end;
$$;

revoke all on function private.is_v5_sequence_position_completed(uuid, integer)
  from public, anon, authenticated;
revoke all on function private.next_v5_sequence_position(uuid)
  from public, anon, authenticated;
revoke all on function private.v5_condition_for_position(integer)
  from public, anon, authenticated;
grant execute on function private.is_v5_sequence_position_completed(uuid, integer)
  to service_role;
grant execute on function private.next_v5_sequence_position(uuid) to service_role;
grant execute on function private.v5_condition_for_position(integer) to service_role;

-- This RPC is versioned so the already-deployed v4 page can continue using
-- get_participant_progress() and receiving fixed-four-v1 while the database is
-- upgraded before the matching v5 frontend.
create or replace function public.get_participant_progress_v5(
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
  completed_sequence_positions jsonb;
  next_sequence_position integer;
  next_condition_id text;
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

  -- Historical sessions remain visible as account history. Active progress is
  -- computed by the shared helper, including only the eligible v4 dim prefix.
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'sessionId', saved.session_id,
        'schemaVersion', (saved.payload ->> 'schemaVersion')::integer,
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
      ('dim-red'::text, 1), ('dim-blue'::text, 2),
      ('black-control'::text, 3), ('bright-blue'::text, 4),
      ('bright-red'::text, 5)
  )
  select
    coalesce(pg_catalog.jsonb_agg(condition_id order by ordinal)
      filter (where has_completed), '[]'::jsonb),
    coalesce(pg_catalog.jsonb_agg(condition_id order by ordinal)
      filter (where not has_completed), '[]'::jsonb)
  into completed_conditions, remaining_conditions
  from (
    select
      conditions.condition_id,
      conditions.ordinal,
      private.is_v5_sequence_position_completed(
        profile_record.profile_id,
        conditions.ordinal
      ) as has_completed
    from conditions
  ) as active_condition_progress;

  select coalesce(
    pg_catalog.jsonb_agg(position order by position),
    '[]'::jsonb
  ) into completed_sequence_positions
  from (
    select generated.position
    from pg_catalog.generate_series(1, 5) as generated(position)
    where private.is_v5_sequence_position_completed(
      profile_record.profile_id,
      generated.position
    ) is true
  ) as completed_positions;

  next_sequence_position := private.next_v5_sequence_position(profile_record.profile_id);
  next_condition_id := private.v5_condition_for_position(next_sequence_position);

  return pg_catalog.jsonb_build_object(
    'profile', pg_catalog.jsonb_build_object(
      'profileId', profile_record.profile_id,
      'displayName', profile_record.display_name,
      'createdAt', profile_record.created_at,
      'lastAccessedAt', profile_record.last_accessed_at
    ),
    'completedSessions', completed_sessions,
    'completedConditionIds', completed_conditions,
    'remainingConditionIds', remaining_conditions,
    'activeProtocolVersion', 'overnight-v3',
    'sequenceVersion', 'fixed-five-v1',
    'completedSequencePositions', completed_sequence_positions,
    'nextSequencePosition', next_sequence_position,
    'nextConditionId', next_condition_id
  );
end;
$$;

-- One protected draft remains associated with each participant profile. The
-- shared load/delete RPCs require no schema change and can return/remove a v5
-- payload. This versioned save RPC prevents a v5 draft from overwriting a
-- still-unfinished historical draft.
create or replace function public.save_participant_study_draft_v5(
  participant_profile_id uuid,
  recovery_proof text,
  draft_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_record private.participant_profiles%rowtype;
  stored_session_id text;
  stored_schema_version text;
  draft_token_hash bytea;
  draft_expires_at timestamptz := clock_timestamp() + interval '48 hours';
  expected_position integer;
  candidate_position integer;
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
    and existing.recovery_code_hash = private.participant_recovery_hash(recovery_proof)
  for update;
  if profile_record.profile_id is null then
    raise exception 'Participant authentication failed.' using errcode = '28000';
  end if;

  if draft_payload is null
    or pg_catalog.jsonb_typeof(draft_payload) <> 'object'
    or pg_catalog.pg_column_size(draft_payload) > 131072
    or private.is_valid_study_session_v5(draft_payload, true) is not true
    or draft_payload ->> 'status' <> 'active'
    or draft_payload ->> 'participantProfileId' <> participant_profile_id::text
    or draft_payload ->> 'participantId' <> profile_record.display_name
  then
    raise exception 'The Protocol v5 participant draft is not valid.'
      using errcode = '22023';
  end if;

  delete from private.study_drafts where expires_at <= clock_timestamp();
  select
    stored.payload ->> 'sessionId',
    stored.payload ->> 'schemaVersion'
  into stored_session_id, stored_schema_version
  from private.study_drafts as stored
  where stored.participant_profile_id = profile_record.profile_id;

  if stored_session_id is not null and (
      stored_session_id <> draft_payload ->> 'sessionId'
      or stored_schema_version is distinct from '5'
    )
  then
    raise exception 'Finish or remove the existing unfinished session first.'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from private.participant_profile_sessions as linked
    where linked.profile_id = profile_record.profile_id
      and linked.session_id = (draft_payload ->> 'sessionId')::uuid
  ) then
    raise exception 'This session is already final.' using errcode = '23505';
  end if;

  candidate_position := (draft_payload ->> 'sequencePosition')::integer;
  expected_position := private.next_v5_sequence_position(profile_record.profile_id);
  if expected_position is null or candidate_position <> expected_position then
    raise exception 'This is not the participant''s next assigned condition.'
      using errcode = '22023';
  end if;

  draft_token_hash := pg_catalog.sha256(
    pg_catalog.convert_to(
      'participant-draft-v1:' || profile_record.profile_id::text,
      'UTF8'
    )
  );

  update private.study_drafts as existing_draft
  set payload = draft_payload,
      updated_at = clock_timestamp(),
      expires_at = draft_expires_at
  where existing_draft.participant_profile_id = profile_record.profile_id;
  if not found then
    insert into private.study_drafts (
      token_hash, payload, created_at, updated_at, expires_at,
      participant_profile_id
    ) values (
      draft_token_hash, draft_payload, clock_timestamp(), clock_timestamp(),
      draft_expires_at, profile_record.profile_id
    );
  end if;

  return pg_catalog.jsonb_build_object('expiresAt', draft_expires_at);
end;
$$;

create or replace function public.submit_profile_study_session_v5(
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
  expected_position integer;
  candidate_position integer;
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
    and existing.recovery_code_hash = private.participant_recovery_hash(recovery_proof)
  for update;
  if profile_record.profile_id is null then
    raise exception 'Participant authentication failed.' using errcode = '28000';
  end if;

  if session_payload is null
    or pg_catalog.jsonb_typeof(session_payload) <> 'object'
    or pg_catalog.pg_column_size(session_payload) > 1048576
    or session_payload ->> 'schemaVersion' <> '5'
    or session_payload ->> 'participantId' <> profile_record.display_name
    or session_payload ->> 'status' not in ('completed', 'terminated')
    or coalesce(session_payload ->> 'sessionId', '') !~
      '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$'
    or coalesce(session_payload ->> 'startedAtIso', '') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
    or coalesce(session_payload ->> 'endedAtIso', '') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  then
    raise exception 'The final Protocol v5 session payload is not valid.'
      using errcode = '22023';
  end if;

  if session_payload ? 'participantProfileId' and (
      pg_catalog.jsonb_typeof(session_payload -> 'participantProfileId') <> 'string'
      or session_payload ->> 'participantProfileId' <> participant_profile_id::text
    )
  then
    raise exception 'The session belongs to a different participant profile.'
      using errcode = '22023';
  end if;

  final_payload := session_payload || pg_catalog.jsonb_build_object(
    'participantProfileId', participant_profile_id::text
  );
  if pg_catalog.pg_column_size(final_payload) > 1048576
    or private.is_valid_study_session_v5(final_payload, false) is not true
  then
    raise exception 'The final Protocol v5 session payload is not valid.'
      using errcode = '22023';
  end if;

  candidate_session_id := (final_payload ->> 'sessionId')::uuid;

  -- Identical retries are returned before sequence enforcement. This keeps a
  -- successful save idempotent if the first HTTP response was lost.
  select saved.payload, linked.profile_id
  into stored_payload, linked_profile_id
  from public.study_sessions as saved
  left join private.participant_profile_sessions as linked
    on linked.session_id = saved.session_id
  where saved.session_id = candidate_session_id;
  if stored_payload is not null then
    if stored_payload is distinct from final_payload then
      raise exception 'This session identifier is already used by another record.'
        using errcode = '23505';
    end if;
    if linked_profile_id is not null
      and linked_profile_id is distinct from profile_record.profile_id
    then
      raise exception 'This session identifier belongs to another participant profile.'
        using errcode = '23505';
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

    delete from private.study_drafts as completed_draft
    where completed_draft.participant_profile_id = profile_record.profile_id
      and completed_draft.payload ->> 'sessionId' = candidate_session_id::text;
    update private.participant_profiles
    set last_accessed_at = clock_timestamp()
    where profile_id = profile_record.profile_id;
    return pg_catalog.jsonb_build_object(
      'sessionId', candidate_session_id,
      'saved', false
    );
  end if;

  candidate_position := (final_payload ->> 'sequencePosition')::integer;
  expected_position := private.next_v5_sequence_position(profile_record.profile_id);
  if expected_position is null or candidate_position <> expected_position then
    raise exception 'This is not the participant''s next assigned condition.'
      using errcode = '22023';
  end if;

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

  delete from private.study_drafts as completed_draft
  where completed_draft.participant_profile_id = profile_record.profile_id
    and completed_draft.payload ->> 'sessionId' = candidate_session_id::text;
  update private.participant_profiles
  set last_accessed_at = clock_timestamp()
  where profile_id = profile_record.profile_id;

  return pg_catalog.jsonb_build_object(
    'sessionId', candidate_session_id,
    'saved', inserted_count = 1
  );
end;
$$;

-- The v5 administrator list reports active-protocol progress without changing
-- the old fixed-four administrator RPC used by the deployed v4 page.
create or replace function public.admin_list_participant_profiles_v5(
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
  if page_size is null or page_offset is null
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
        select pg_catalog.jsonb_agg(
          private.v5_condition_for_position(generated.position)
          order by generated.position
        )
        from pg_catalog.generate_series(1, 5) as generated(position)
        where private.is_v5_sequence_position_completed(
          profile.profile_id,
          generated.position
        ) is true
      ), '[]'::jsonb),
      'completedSequencePositions', coalesce((
        select pg_catalog.jsonb_agg(generated.position order by generated.position)
        from pg_catalog.generate_series(1, 5) as generated(position)
        where private.is_v5_sequence_position_completed(
          profile.profile_id,
          generated.position
        ) is true
      ), '[]'::jsonb),
      'nextSequencePosition', private.next_v5_sequence_position(profile.profile_id),
      'nextConditionId', private.v5_condition_for_position(
        private.next_v5_sequence_position(profile.profile_id)
      ),
      'feedbackCount', (
        select count(*) from private.participant_feedback as feedback
        where feedback.profile_id = profile.profile_id
      )
    ) as profile_item
    from private.participant_profiles as profile
    order by profile.created_at desc, profile.profile_id
    limit page_size offset page_offset
  ) as listed;

  return pg_catalog.jsonb_build_object(
    'items', result_items,
    'total', result_total,
    'activeProtocolVersion', 'overnight-v3',
    'sequenceVersion', 'fixed-five-v1'
  );
end;
$$;

-- Return only durable evening checkpoints that do not yet have a final row.
-- The authenticated administrator receives the latest validated snapshot plus
-- the first/latest capture times and an explicit stage. Earlier distinct
-- snapshots remain private and unchanged for auditability.
create or replace function public.admin_list_incomplete_study_sessions_v5(
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
  if page_size is null or page_offset is null
    or page_size not between 1 and 500
    or page_offset not between 0 and 1000000
  then
    raise exception 'The requested page is not valid.' using errcode = '22023';
  end if;

  with unresolved as (
    select
      snapshot.*,
      profile.display_name,
      pg_catalog.row_number() over (
        partition by snapshot.session_id
        order by snapshot.captured_at desc, snapshot.payload_hash desc
      ) as snapshot_rank
    from private.incomplete_study_session_snapshots as snapshot
    join private.participant_profiles as profile
      on profile.profile_id = snapshot.participant_profile_id
    where not exists (
      select 1
      from public.study_sessions as final_session
      where final_session.session_id = snapshot.session_id
    )
  )
  select count(*)::integer into result_total
  from unresolved
  where snapshot_rank = 1;

  with unresolved as (
    select
      snapshot.*,
      profile.display_name,
      pg_catalog.min(snapshot.captured_at) over (
        partition by snapshot.session_id
      ) as first_saved_at,
      pg_catalog.max(snapshot.captured_at) over (
        partition by snapshot.session_id
      ) as latest_saved_at,
      pg_catalog.count(*) over (
        partition by snapshot.session_id
      ) as snapshot_count,
      pg_catalog.row_number() over (
        partition by snapshot.session_id
        order by snapshot.captured_at desc, snapshot.payload_hash desc
      ) as snapshot_rank
    from private.incomplete_study_session_snapshots as snapshot
    join private.participant_profiles as profile
      on profile.profile_id = snapshot.participant_profile_id
    where not exists (
      select 1
      from public.study_sessions as final_session
      where final_session.session_id = snapshot.session_id
    )
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      listed.incomplete_item
      order by listed.latest_saved_at desc, listed.session_id
    ),
    '[]'::jsonb
  ) into result_items
  from (
    select pg_catalog.jsonb_build_object(
      'profileId', latest.participant_profile_id,
      'displayName', latest.display_name,
      'sessionId', latest.session_id,
      'conditionId', latest.payload ->> 'conditionId',
      'sequencePosition', latest.payload -> 'sequencePosition',
      'schemaVersion', latest.payload -> 'schemaVersion',
      'studyBuildVersion', latest.payload ->> 'studyBuildVersion',
      'recordStatus', 'active',
      'exposureStatus', 'completed',
      'incompleteStage', case
        when latest.payload -> 'sleepStartedAtIso' = 'null'::jsonb
          then 'awaiting-sleep-start'
        when latest.payload -> 'morningReturnedAtIso' = 'null'::jsonb
          then 'awaiting-morning-return'
        else 'awaiting-morning-questionnaire'
      end,
      'startedAt', latest.payload ->> 'startedAtIso',
      'stimulusEndedAt', latest.payload ->> 'stimulusEndedAtIso',
      'postExposureAnsweredAt',
        latest.payload #>> '{postExposureSurvey,answeredAtIso}',
      'sleepStartedAt', latest.payload ->> 'sleepStartedAtIso',
      'morningReturnedAt', latest.payload ->> 'morningReturnedAtIso',
      'morningQuestionnaireSubmitted', false,
      'actualDurationMs', latest.payload -> 'actualDurationMs',
      'firstSavedAt', latest.first_saved_at,
      'latestSavedAt', latest.latest_saved_at,
      'snapshotCount', latest.snapshot_count,
      'record', latest.payload
    ) as incomplete_item,
    latest.latest_saved_at,
    latest.session_id
    from unresolved as latest
    where latest.snapshot_rank = 1
    order by latest.latest_saved_at desc, latest.session_id
    limit page_size offset page_offset
  ) as listed;

  return pg_catalog.jsonb_build_object(
    'items', result_items,
    'total', result_total
  );
end;
$$;

revoke all on function public.get_participant_progress_v5(uuid, text)
  from public, anon, authenticated;
revoke all on function public.save_participant_study_draft_v5(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.submit_profile_study_session_v5(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.admin_list_participant_profiles_v5(integer, integer)
  from public, anon, authenticated;
revoke all on function public.admin_list_incomplete_study_sessions_v5(integer, integer)
  from public, anon, authenticated;

grant execute on function public.get_participant_progress_v5(uuid, text) to anon;
grant execute on function public.save_participant_study_draft_v5(uuid, text, jsonb)
  to anon;
grant execute on function public.submit_profile_study_session_v5(uuid, text, jsonb)
  to anon;
grant execute on function public.admin_list_participant_profiles_v5(integer, integer)
  to authenticated;
grant execute on function public.admin_list_incomplete_study_sessions_v5(integer, integer)
  to authenticated;

commit;

-- POST-MIGRATION VERIFICATION (run separately; intentionally commented so the
-- migration itself remains one transaction and reports no result rows):
--
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.study_sessions'::regclass
--   and conname in (
--     'study_condition_ck', 'study_payload_array_lengths_ck',
--     'study_payload_matches_columns_ck', 'study_payload_v4_contract_ck',
--     'study_payload_v5_contract_ck'
--   )
-- order by conname;
--
-- select routine_name
-- from information_schema.routines
-- where routine_schema in ('private', 'public')
--   and routine_name in (
--     'is_valid_study_session_v4', 'is_valid_study_session_v5',
--     'capture_incomplete_study_session_snapshot',
--     'is_v5_sequence_position_completed', 'next_v5_sequence_position',
--     'get_participant_progress', 'get_participant_progress_v5',
--     'save_participant_study_draft', 'save_participant_study_draft_v5',
--     'load_participant_study_draft', 'delete_participant_study_draft',
--     'submit_profile_study_session', 'submit_profile_study_session_v5',
--     'admin_list_participant_profiles',
--     'admin_list_participant_profiles_v5',
--     'admin_list_incomplete_study_sessions_v5'
--   )
-- order by routine_schema, routine_name;
--
-- select
--   to_regclass('private.incomplete_study_session_snapshots')
--     as incomplete_snapshot_table,
--   exists (
--     select 1
--     from pg_catalog.pg_trigger as installed_trigger
--     where installed_trigger.tgrelid = 'private.study_drafts'::regclass
--       and installed_trigger.tgname =
--         'capture_incomplete_study_session_snapshot'
--       and not installed_trigger.tgisinternal
--   ) as incomplete_snapshot_trigger;
--
-- Inspect active v5 progress without exposing participant names. Positions 1/2
-- may be inherited only from the completed contiguous v4 dim-condition prefix;
-- positions 3/4/5 require native completed v5 sessions:
-- select
--   profile.profile_id,
--   coalesce((
--     select pg_catalog.array_agg(generated.position order by generated.position)
--     from pg_catalog.generate_series(1, 5) as generated(position)
--     where private.is_v5_sequence_position_completed(
--       profile.profile_id, generated.position
--     ) is true
--   ), '{}'::integer[]) as completed_v5_positions,
--   private.next_v5_sequence_position(profile.profile_id) as next_v5_position
-- from private.participant_profiles as profile
-- order by profile.profile_id;
--
-- select
--   has_function_privilege(
--     'anon', 'public.get_participant_progress_v5(uuid,text)', 'EXECUTE'
--   ) as anon_progress_v5,
--   has_function_privilege(
--     'anon', 'public.save_participant_study_draft_v5(uuid,text,jsonb)',
--     'EXECUTE'
--   ) as anon_save_draft_v5,
--   has_function_privilege(
--     'anon', 'public.submit_profile_study_session_v5(uuid,text,jsonb)',
--     'EXECUTE'
--   ) as anon_submit_v5,
--   has_function_privilege(
--     'authenticated',
--     'public.admin_list_participant_profiles_v5(integer,integer)',
--     'EXECUTE'
--   ) as authenticated_admin_list_v5,
--   has_function_privilege(
--     'authenticated',
--     'public.admin_list_incomplete_study_sessions_v5(integer,integer)',
--     'EXECUTE'
--   ) as authenticated_admin_incomplete_v5,
--   has_function_privilege(
--     'anon',
--     'public.admin_list_incomplete_study_sessions_v5(integer,integer)',
--     'EXECUTE'
--   ) as anon_admin_incomplete_v5;
--
-- The following is non-identifying and should report only unresolved sessions;
-- the public final row, when present, atomically removes that session from the
-- administrator incomplete list without deleting its private audit snapshots:
-- select
--   snapshot.payload ->> 'schemaVersion' as schema_version,
--   count(distinct snapshot.session_id) as unresolved_incomplete_sessions
-- from private.incomplete_study_session_snapshots as snapshot
-- where not exists (
--   select 1 from public.study_sessions as final_session
--   where final_session.session_id = snapshot.session_id
-- )
-- group by snapshot.payload ->> 'schemaVersion'
-- order by snapshot.payload ->> 'schemaVersion';
--
-- Re-run the pre-migration fingerprint and compare every schema-v2/v3/v4 row:
-- select
--   payload ->> 'schemaVersion' as schema_version,
--   count(*) as session_count,
--   md5(string_agg(session_id::text || ':' || payload::text, '|' order by session_id))
--     as payload_fingerprint
-- from public.study_sessions
-- group by payload ->> 'schemaVersion'
-- order by payload ->> 'schemaVersion';
