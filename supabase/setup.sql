begin;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
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
  constraint study_payload_arrays_ck
    check (
      coalesce(jsonb_typeof(payload -> 'trialPlan'), '') = 'array'
      and coalesce(jsonb_typeof(payload -> 'trials'), '') = 'array'
      and coalesce(jsonb_typeof(payload -> 'falseClicks'), '') = 'array'
      and coalesce(jsonb_typeof(payload -> 'pauses'), '') = 'array'
      and coalesce(jsonb_typeof(payload -> 'environmentEvents'), '') = 'array'
    )
);

-- These constraints are replaced on every setup run so this file upgrades an
-- existing v2 project as well as creating a fresh project. Historical v2 rows
-- retain their original 20-trial protocol. New v3 light rows have four planned
-- trials, while the no-light control has no attention trials.
alter table public.study_sessions
  drop constraint if exists study_condition_ck,
  drop constraint if exists study_payload_keys_ck,
  drop constraint if exists study_payload_array_lengths_ck,
  drop constraint if exists study_payload_matches_columns_ck,
  drop constraint if exists study_payload_v3_objects_ck,
  drop constraint if exists study_payload_v3_contract_ck;

alter table public.study_sessions
  add constraint study_condition_ck
    check (condition_id in ('bright-red', 'dim-red', 'bright-blue', 'dim-blue', 'control')),
  add constraint study_payload_keys_ck
    check (
      payload ?& array[
        'schemaVersion', 'sessionId', 'participantId', 'conditionId', 'status',
        'startedAtIso', 'endedAtIso', 'trialPlan', 'trials', 'falseClicks',
        'pauses', 'environmentEvents'
      ]
      and (
        payload ->> 'schemaVersion' <> '3'
        or payload ?& array['deviceInfo', 'preSurvey', 'postSurvey', 'reactionTest']
      )
    ),
  add constraint study_payload_v3_objects_ck
    check (
      payload ->> 'schemaVersion' <> '3'
      or (
        coalesce(jsonb_typeof(payload -> 'deviceInfo'), '') = 'object'
        and coalesce(jsonb_typeof(payload -> 'preSurvey'), '') = 'object'
        and coalesce(jsonb_typeof(payload -> 'postSurvey'), '') = 'object'
        and coalesce(jsonb_typeof(payload -> 'reactionTest'), '') = 'object'
      )
    ),
  add constraint study_payload_array_lengths_ck
    check (
      (
        payload ->> 'schemaVersion' = '2'
        and condition_id in ('bright-red', 'dim-red', 'bright-blue', 'dim-blue')
        and jsonb_array_length(payload -> 'trialPlan') = 20
        and jsonb_array_length(payload -> 'trials') <= 20
      )
      or
      (
        payload ->> 'schemaVersion' = '3'
        and (
          (
            condition_id in ('bright-red', 'dim-red', 'bright-blue', 'dim-blue')
            and jsonb_array_length(payload -> 'trialPlan') = 4
            and jsonb_array_length(payload -> 'trials') <= 4
            and (
              payload ->> 'exposureStatus' <> 'completed'
              or jsonb_array_length(payload -> 'trials') = 4
            )
          )
          or
          (
            condition_id = 'control'
            and jsonb_array_length(payload -> 'trialPlan') = 0
            and jsonb_array_length(payload -> 'trials') = 0
          )
        )
      )
    and jsonb_array_length(payload -> 'falseClicks') <= 10000
    and jsonb_array_length(payload -> 'pauses') <= 1000
    and jsonb_array_length(payload -> 'environmentEvents') <= 1000
    ),
  add constraint study_payload_matches_columns_ck
    check (
      payload ->> 'schemaVersion' in ('2', '3')
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
  add constraint study_payload_v3_contract_ck
    check (
      coalesce(
        payload ->> 'schemaVersion' <> '3'
        or (
        payload ?& array[
          'schemaVersion', 'protocolVersion', 'attentionProtocolVersion',
          'sessionId', 'participantId', 'conditionId', 'conditionName',
          'stimulusColorHex', 'stimulusColorRgb', 'plannedDurationMs',
          'plannedEndAtIso', 'actualDurationMs', 'wallClockDurationMs',
          'totalPausedDurationMs', 'crossVisibleMs', 'startedAtIso',
          'stimulusStartedAtIso', 'stimulusEndedAtIso', 'sleepStartedAtIso',
          'morningReturnedAtIso', 'assessmentCompletedAtIso', 'endedAtIso',
          'status', 'exposureStatus', 'terminationReason', 'fullscreenAtStart',
          'fullscreenRequestFailed', 'deviceInfo', 'preSurvey', 'postSurvey',
          'reactionTest', 'trialPlan', 'trials', 'falseClicks', 'pauses',
          'environmentEvents'
        ]
        and payload ->> 'protocolVersion' = 'overnight-v1'
        and payload ->> 'attentionProtocolVersion' = 'sparse-4-50-70-v1'
        and payload ->> 'crossVisibleMs' = '1800'
        and coalesce(jsonb_typeof(payload -> 'deviceInfo'), '') = 'object'
        and (payload -> 'deviceInfo') ?& array['beforeSleep', 'afterWaking', 'deviceChanged']
        and coalesce(jsonb_typeof(payload #> '{deviceInfo,beforeSleep}'), '') = 'object'
        and coalesce(jsonb_typeof(payload #> '{deviceInfo,afterWaking}'), '') = 'object'
        and (payload #> '{deviceInfo,beforeSleep}') ?& array[
          'detectionVersion', 'detectedCategory', 'confirmedCategory',
          'confirmationSource', 'touchCapable', 'coarsePointer', 'finePointer',
          'hoverCapable'
        ]
        and (payload #> '{deviceInfo,afterWaking}') ?& array[
          'detectionVersion', 'detectedCategory', 'confirmedCategory',
          'confirmationSource', 'touchCapable', 'coarsePointer', 'finePointer',
          'hoverCapable'
        ]
        and payload #>> '{deviceInfo,beforeSleep,detectionVersion}' = 'capabilities-v1'
        and payload #>> '{deviceInfo,afterWaking,detectionVersion}' = 'capabilities-v1'
        and payload #>> '{deviceInfo,beforeSleep,detectedCategory}' in ('phone', 'tablet', 'computer')
        and payload #>> '{deviceInfo,beforeSleep,confirmedCategory}' in ('phone', 'tablet', 'computer')
        and payload #>> '{deviceInfo,afterWaking,detectedCategory}' in ('phone', 'tablet', 'computer')
        and payload #>> '{deviceInfo,afterWaking,confirmedCategory}' in ('phone', 'tablet', 'computer')
        and coalesce(jsonb_typeof(payload #> '{deviceInfo,deviceChanged}'), '') = 'boolean'
        and coalesce(jsonb_typeof(payload -> 'preSurvey'), '') = 'object'
        and (payload -> 'preSurvey') ?& array[
          'questionnaireVersion', 'answeredAtIso', 'previousNightSleepTime',
          'sleepinessKss', 'screenUseBeforeSleep', 'screenUseMinutes',
          'sleepsWithLight', 'sleepLightColor', 'sleepTemperature',
          'sleepAidMedicationOrSupplement', 'morningRestedness',
          'previousNightSleepQuality', 'caffeineInPast8Hours',
          'musicBeforeSleep', 'sleepNoiseLevel', 'vigorousExerciseInPast12Hours'
        ]
        and payload #>> '{preSurvey,questionnaireVersion}' = 'pre-study-v1'
        and coalesce(jsonb_typeof(payload #> '{preSurvey,sleepinessKss}'), '') = 'number'
        and coalesce(payload #>> '{preSurvey,sleepinessKss}', '') ~ '^[1-9]$'
        and coalesce(jsonb_typeof(payload -> 'postSurvey'), '') = 'object'
        and (payload -> 'postSurvey') ?& array[
          'questionnaireVersion', 'answeredAtIso', 'sleepinessKss'
        ]
        and payload #>> '{postSurvey,questionnaireVersion}' = 'post-study-v1'
        and coalesce(jsonb_typeof(payload #> '{postSurvey,sleepinessKss}'), '') = 'number'
        and coalesce(payload #>> '{postSurvey,sleepinessKss}', '') ~ '^[1-9]$'
        and coalesce(jsonb_typeof(payload -> 'reactionTest'), '') = 'object'
        and (payload -> 'reactionTest') ?& array[
          'protocolVersion', 'startedAtIso', 'completedAtIso', 'trials',
          'validCount', 'averageReactionTimeMs', 'medianReactionTimeMs',
          'falseStartCount', 'missCount'
        ]
        and payload #>> '{reactionTest,protocolVersion}' = 'relaxed-reaction-test-v1'
        and coalesce(jsonb_typeof(payload #> '{reactionTest,trials}'), '') = 'array'
        and jsonb_array_length(
          case
            when jsonb_typeof(payload #> '{reactionTest,trials}') = 'array'
              then payload #> '{reactionTest,trials}'
            else '[]'::jsonb
          end
        ) = 3
        and coalesce(jsonb_typeof(payload #> '{reactionTest,validCount}'), '') = 'number'
        and payload #>> '{reactionTest,validCount}' = '3'
        and coalesce(jsonb_typeof(payload #> '{reactionTest,averageReactionTimeMs}'), '') = 'number'
        and coalesce(jsonb_typeof(payload #> '{reactionTest,medianReactionTimeMs}'), '') = 'number'
        and coalesce(jsonb_typeof(payload #> '{reactionTest,falseStartCount}'), '') = 'number'
        and coalesce(payload #>> '{reactionTest,falseStartCount}', '') ~ '^(0|[1-9][0-9]{0,2}|1000)$'
        and coalesce(jsonb_typeof(payload #> '{reactionTest,missCount}'), '') = 'number'
        and coalesce(payload #>> '{reactionTest,missCount}', '') ~ '^(0|[1-9][0-9]{0,2}|1000)$'
        and coalesce(jsonb_typeof(payload #> '{reactionTest,trials,0}'), '') = 'object'
        and coalesce(jsonb_typeof(payload #> '{reactionTest,trials,1}'), '') = 'object'
        and coalesce(jsonb_typeof(payload #> '{reactionTest,trials,2}'), '') = 'object'
        and (payload #> '{reactionTest,trials,0}') ?& array[
          'trialNumber', 'status', 'startedAtIso', 'stimulusDelayMs',
          'stimulusShownAtIso', 'respondedAtIso', 'reactionTimeMs', 'inputMethod'
        ]
        and (payload #> '{reactionTest,trials,1}') ?& array[
          'trialNumber', 'status', 'startedAtIso', 'stimulusDelayMs',
          'stimulusShownAtIso', 'respondedAtIso', 'reactionTimeMs', 'inputMethod'
        ]
        and (payload #> '{reactionTest,trials,2}') ?& array[
          'trialNumber', 'status', 'startedAtIso', 'stimulusDelayMs',
          'stimulusShownAtIso', 'respondedAtIso', 'reactionTimeMs', 'inputMethod'
        ]
        and payload #>> '{reactionTest,trials,0,trialNumber}' = '1'
        and payload #>> '{reactionTest,trials,1,trialNumber}' = '2'
        and payload #>> '{reactionTest,trials,2,trialNumber}' = '3'
        and payload #>> '{reactionTest,trials,0,status}' = 'valid'
        and payload #>> '{reactionTest,trials,1,status}' = 'valid'
        and payload #>> '{reactionTest,trials,2,status}' = 'valid'
        and coalesce(jsonb_typeof(payload #> '{reactionTest,trials,0,reactionTimeMs}'), '') = 'number'
        and coalesce(jsonb_typeof(payload #> '{reactionTest,trials,1,reactionTimeMs}'), '') = 'number'
        and coalesce(jsonb_typeof(payload #> '{reactionTest,trials,2,reactionTimeMs}'), '') = 'number'
        and payload #>> '{reactionTest,trials,0,inputMethod}' in ('pointer', 'space', 'enter')
        and payload #>> '{reactionTest,trials,1,inputMethod}' in ('pointer', 'space', 'enter')
        and payload #>> '{reactionTest,trials,2,inputMethod}' in ('pointer', 'space', 'enter')
        and coalesce(jsonb_typeof(payload -> 'sleepStartedAtIso'), '') = 'string'
        and coalesce(jsonb_typeof(payload -> 'morningReturnedAtIso'), '') = 'string'
        and coalesce(jsonb_typeof(payload -> 'assessmentCompletedAtIso'), '') = 'string'
        and coalesce(jsonb_typeof(payload -> 'endedAtIso'), '') = 'string'
        and (
          (
            condition_id = 'control'
            and payload ->> 'conditionName' = 'Control — Normal Sleep'
            and payload -> 'stimulusColorHex' = 'null'::jsonb
            and payload -> 'stimulusColorRgb' = 'null'::jsonb
            and payload ->> 'plannedDurationMs' = '0'
            and payload -> 'plannedEndAtIso' = 'null'::jsonb
            and payload ->> 'actualDurationMs' = '0'
            and payload ->> 'wallClockDurationMs' = '0'
            and payload ->> 'totalPausedDurationMs' = '0'
            and payload -> 'stimulusStartedAtIso' = 'null'::jsonb
            and payload -> 'stimulusEndedAtIso' = 'null'::jsonb
            and payload ->> 'status' = 'completed'
            and payload ->> 'exposureStatus' = 'not-applicable'
            and payload -> 'terminationReason' = 'null'::jsonb
            and payload -> 'fullscreenAtStart' = 'false'::jsonb
            and payload -> 'fullscreenRequestFailed' = 'false'::jsonb
            and jsonb_array_length(payload -> 'trialPlan') = 0
            and jsonb_array_length(payload -> 'trials') = 0
            and jsonb_array_length(payload -> 'falseClicks') = 0
            and jsonb_array_length(payload -> 'pauses') = 0
            and jsonb_array_length(payload -> 'environmentEvents') = 0
          )
          or
          (
            condition_id in ('bright-red', 'dim-red', 'bright-blue', 'dim-blue')
            and payload ->> 'plannedDurationMs' = '300000'
            and coalesce(jsonb_typeof(payload -> 'plannedEndAtIso'), '') = 'string'
            and coalesce(jsonb_typeof(payload -> 'stimulusStartedAtIso'), '') = 'string'
            and coalesce(jsonb_typeof(payload -> 'stimulusEndedAtIso'), '') = 'string'
            and (
              (condition_id = 'bright-red'
                and payload ->> 'conditionName' = 'Bright Red'
                and payload ->> 'stimulusColorHex' = '#ff0000'
                and payload ->> 'stimulusColorRgb' = '255, 0, 0')
              or (condition_id = 'dim-red'
                and payload ->> 'conditionName' = 'Dim Red'
                and payload ->> 'stimulusColorHex' = '#660000'
                and payload ->> 'stimulusColorRgb' = '102, 0, 0')
              or (condition_id = 'bright-blue'
                and payload ->> 'conditionName' = 'Bright Blue'
                and payload ->> 'stimulusColorHex' = '#0000ff'
                and payload ->> 'stimulusColorRgb' = '0, 0, 255')
              or (condition_id = 'dim-blue'
                and payload ->> 'conditionName' = 'Dim Blue'
                and payload ->> 'stimulusColorHex' = '#000066'
                and payload ->> 'stimulusColorRgb' = '0, 0, 102')
            )
            and (
              (
                payload ->> 'exposureStatus' = 'completed'
                and payload ->> 'status' = 'completed'
                and payload -> 'terminationReason' = 'null'::jsonb
                and jsonb_array_length(payload -> 'trials') = 4
              )
              or
              (
                payload ->> 'exposureStatus' = 'terminated'
                and payload ->> 'status' in ('completed', 'terminated')
                and payload ->> 'terminationReason' in ('end_sequence', 'touch_end', 'page_reload')
                and jsonb_array_length(payload -> 'trials') <= 4
              )
            )
          )
          )
        ),
        false
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

revoke all on table public.study_sessions from public, anon, authenticated;
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

-- Overnight control drafts are bearer-token protected. The caller generates a
-- cryptographically random 32-byte token and sends its 64-character hex form.
-- Only its PostgreSQL-core SHA-256 digest is stored. The private table has no
-- direct grants or policies; callers can use only the three scoped RPCs.
create table if not exists private.study_drafts (
  token_hash bytea primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),

  constraint study_drafts_token_hash_length_ck
    check (octet_length(token_hash) = 32),
  constraint study_drafts_payload_object_ck
    check (jsonb_typeof(payload) = 'object'),
  constraint study_drafts_payload_size_ck
    check (pg_column_size(payload) <= 131072),
  constraint study_drafts_expiry_order_ck
    check (expires_at > updated_at)
);

-- Rebuild the limit on reruns too; CREATE TABLE IF NOT EXISTS does not update
-- a constraint left by an earlier protocol revision.
alter table private.study_drafts
  drop constraint if exists study_drafts_payload_size_ck,
  add constraint study_drafts_payload_size_ck
    check (pg_column_size(payload) <= 131072);

create index if not exists study_drafts_expires_at_idx
  on private.study_drafts (expires_at);

revoke all on table private.study_drafts from public, anon, authenticated;

create or replace function private.is_valid_study_draft_v3(candidate jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  candidate_condition text;
  candidate_participant text;
begin
  if candidate is null or jsonb_typeof(candidate) <> 'object' then
    return false;
  end if;

  if not (candidate ?& array[
    'schemaVersion', 'protocolVersion', 'attentionProtocolVersion',
    'sessionId', 'participantId', 'conditionId', 'conditionName',
    'stimulusColorHex', 'stimulusColorRgb', 'plannedDurationMs',
    'plannedEndAtIso', 'actualDurationMs', 'wallClockDurationMs',
    'totalPausedDurationMs', 'crossVisibleMs', 'startedAtIso',
    'stimulusStartedAtIso', 'stimulusEndedAtIso', 'sleepStartedAtIso',
    'morningReturnedAtIso', 'assessmentCompletedAtIso', 'endedAtIso',
    'status', 'exposureStatus', 'terminationReason', 'fullscreenAtStart',
    'fullscreenRequestFailed', 'deviceInfo', 'preSurvey', 'postSurvey',
    'reactionTest', 'trialPlan', 'trials', 'falseClicks', 'pauses',
    'environmentEvents'
  ]) then
    return false;
  end if;

  if jsonb_typeof(candidate -> 'schemaVersion') <> 'number'
    or coalesce(candidate ->> 'schemaVersion', '') <> '3'
    or coalesce(candidate ->> 'protocolVersion', '') <> 'overnight-v1'
    or coalesce(candidate ->> 'attentionProtocolVersion', '') <> 'sparse-4-50-70-v1'
    or coalesce(candidate ->> 'crossVisibleMs', '') <> '1800'
    or coalesce(candidate ->> 'status', '') <> 'active'
    or coalesce(jsonb_typeof(candidate -> 'sessionId'), '') <> 'string'
    or coalesce(candidate ->> 'sessionId', '') !~
      '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$'
  then
    return false;
  end if;

  candidate_participant := candidate ->> 'participantId';
  if candidate_participant is null
    or candidate_participant <> btrim(candidate_participant)
    or char_length(candidate_participant) not between 1 and 80
    or candidate_participant ~ '[[:cntrl:]]'
    or lower(candidate_participant) in ('test', 'admin')
  then
    return false;
  end if;

  candidate_condition := candidate ->> 'conditionId';
  if candidate_condition is null
    or candidate_condition not in ('bright-red', 'dim-red', 'bright-blue', 'dim-blue', 'control')
  then
    return false;
  end if;

  if coalesce(jsonb_typeof(candidate -> 'deviceInfo'), '') <> 'object'
    or not ((candidate -> 'deviceInfo') ?& array['beforeSleep', 'afterWaking', 'deviceChanged'])
    or coalesce(jsonb_typeof(candidate #> '{deviceInfo,beforeSleep}'), '') <> 'object'
    or jsonb_typeof(candidate #> '{deviceInfo,afterWaking}') not in ('null', 'object')
    or jsonb_typeof(candidate #> '{deviceInfo,deviceChanged}') not in ('null', 'boolean')
    or not ((candidate #> '{deviceInfo,beforeSleep}') ?& array[
      'detectionVersion', 'detectedCategory', 'confirmedCategory',
      'confirmationSource', 'touchCapable', 'coarsePointer', 'finePointer',
      'hoverCapable'
    ])
    or coalesce(candidate #>> '{deviceInfo,beforeSleep,detectionVersion}', '') <> 'capabilities-v1'
    or coalesce(candidate #>> '{deviceInfo,beforeSleep,detectedCategory}', '') not in ('phone', 'tablet', 'computer')
    or coalesce(candidate #>> '{deviceInfo,beforeSleep,confirmedCategory}', '') not in ('phone', 'tablet', 'computer')
  then
    return false;
  end if;

  if jsonb_typeof(candidate #> '{deviceInfo,afterWaking}') = 'object'
    and (
      not ((candidate #> '{deviceInfo,afterWaking}') ?& array[
        'detectionVersion', 'detectedCategory', 'confirmedCategory',
        'confirmationSource', 'touchCapable', 'coarsePointer', 'finePointer',
        'hoverCapable'
      ])
      or coalesce(candidate #>> '{deviceInfo,afterWaking,detectionVersion}', '') <> 'capabilities-v1'
      or coalesce(candidate #>> '{deviceInfo,afterWaking,detectedCategory}', '') not in ('phone', 'tablet', 'computer')
      or coalesce(candidate #>> '{deviceInfo,afterWaking,confirmedCategory}', '') not in ('phone', 'tablet', 'computer')
    )
  then
    return false;
  end if;

  if coalesce(jsonb_typeof(candidate -> 'preSurvey'), '') <> 'object'
    or not ((candidate -> 'preSurvey') ?& array[
      'questionnaireVersion', 'answeredAtIso', 'previousNightSleepTime',
      'sleepinessKss', 'screenUseBeforeSleep', 'screenUseMinutes',
      'sleepsWithLight', 'sleepLightColor', 'sleepTemperature',
      'sleepAidMedicationOrSupplement', 'morningRestedness',
      'previousNightSleepQuality', 'caffeineInPast8Hours',
      'musicBeforeSleep', 'sleepNoiseLevel', 'vigorousExerciseInPast12Hours'
    ])
    or coalesce(candidate #>> '{preSurvey,questionnaireVersion}', '') <> 'pre-study-v1'
    or coalesce(jsonb_typeof(candidate #> '{preSurvey,sleepinessKss}'), '') <> 'number'
    or coalesce(candidate #>> '{preSurvey,sleepinessKss}', '') !~ '^[1-9]$'
  then
    return false;
  end if;

  if jsonb_typeof(candidate -> 'postSurvey') not in ('null', 'object')
    or jsonb_typeof(candidate -> 'reactionTest') <> 'null'
    or coalesce(jsonb_typeof(candidate -> 'trialPlan'), '') <> 'array'
    or coalesce(jsonb_typeof(candidate -> 'trials'), '') <> 'array'
    or coalesce(jsonb_typeof(candidate -> 'falseClicks'), '') <> 'array'
    or coalesce(jsonb_typeof(candidate -> 'pauses'), '') <> 'array'
    or coalesce(jsonb_typeof(candidate -> 'environmentEvents'), '') <> 'array'
  then
    return false;
  end if;

  if jsonb_typeof(candidate -> 'postSurvey') = 'object'
    and (
      not ((candidate -> 'postSurvey') ?& array[
        'questionnaireVersion', 'answeredAtIso', 'sleepinessKss'
      ])
      or coalesce(candidate #>> '{postSurvey,questionnaireVersion}', '') <> 'post-study-v1'
      or coalesce(jsonb_typeof(candidate #> '{postSurvey,sleepinessKss}'), '') <> 'number'
      or coalesce(candidate #>> '{postSurvey,sleepinessKss}', '') !~ '^[1-9]$'
    )
  then
    return false;
  end if;

  if jsonb_array_length(candidate -> 'falseClicks') > 10000
    or jsonb_array_length(candidate -> 'pauses') > 1000
    or jsonb_array_length(candidate -> 'environmentEvents') > 1000
    or candidate -> 'endedAtIso' <> 'null'::jsonb
    or candidate -> 'assessmentCompletedAtIso' <> 'null'::jsonb
  then
    return false;
  end if;

  if candidate_condition = 'control' then
    return coalesce(candidate ->> 'conditionName' = 'Control — Normal Sleep'
      and candidate -> 'stimulusColorHex' = 'null'::jsonb
      and candidate -> 'stimulusColorRgb' = 'null'::jsonb
      and candidate ->> 'plannedDurationMs' = '0'
      and candidate -> 'plannedEndAtIso' = 'null'::jsonb
      and candidate ->> 'actualDurationMs' = '0'
      and candidate ->> 'wallClockDurationMs' = '0'
      and candidate ->> 'totalPausedDurationMs' = '0'
      and candidate -> 'stimulusStartedAtIso' = 'null'::jsonb
      and candidate -> 'stimulusEndedAtIso' = 'null'::jsonb
      and candidate ->> 'exposureStatus' = 'not-applicable'
      and candidate -> 'terminationReason' = 'null'::jsonb
      and candidate -> 'fullscreenAtStart' = 'false'::jsonb
      and candidate -> 'fullscreenRequestFailed' = 'false'::jsonb
      and jsonb_array_length(candidate -> 'trialPlan') = 0
      and jsonb_array_length(candidate -> 'trials') = 0
      and jsonb_array_length(candidate -> 'falseClicks') = 0
      and jsonb_array_length(candidate -> 'pauses') = 0
      and jsonb_array_length(candidate -> 'environmentEvents') = 0, false);
  end if;

  return coalesce(candidate ->> 'plannedDurationMs' = '300000'
    and jsonb_array_length(candidate -> 'trialPlan') = 4
    and jsonb_array_length(candidate -> 'trials') <= 4
    and (
      (candidate_condition = 'bright-red'
        and candidate ->> 'conditionName' = 'Bright Red'
        and candidate ->> 'stimulusColorHex' = '#ff0000'
        and candidate ->> 'stimulusColorRgb' = '255, 0, 0')
      or (candidate_condition = 'dim-red'
        and candidate ->> 'conditionName' = 'Dim Red'
        and candidate ->> 'stimulusColorHex' = '#660000'
        and candidate ->> 'stimulusColorRgb' = '102, 0, 0')
      or (candidate_condition = 'bright-blue'
        and candidate ->> 'conditionName' = 'Bright Blue'
        and candidate ->> 'stimulusColorHex' = '#0000ff'
        and candidate ->> 'stimulusColorRgb' = '0, 0, 255')
      or (candidate_condition = 'dim-blue'
        and candidate ->> 'conditionName' = 'Dim Blue'
        and candidate ->> 'stimulusColorHex' = '#000066'
        and candidate ->> 'stimulusColorRgb' = '0, 0, 102')
    )
    and (
      (
        candidate ->> 'exposureStatus' = 'not-started'
        and candidate -> 'plannedEndAtIso' = 'null'::jsonb
        and candidate -> 'stimulusStartedAtIso' = 'null'::jsonb
        and candidate -> 'stimulusEndedAtIso' = 'null'::jsonb
        and candidate ->> 'actualDurationMs' = '0'
        and candidate ->> 'wallClockDurationMs' = '0'
        and candidate ->> 'totalPausedDurationMs' = '0'
        and candidate -> 'terminationReason' = 'null'::jsonb
        and candidate -> 'sleepStartedAtIso' = 'null'::jsonb
        and jsonb_array_length(candidate -> 'trials') = 0
        and jsonb_array_length(candidate -> 'falseClicks') = 0
        and jsonb_array_length(candidate -> 'pauses') = 0
        and jsonb_array_length(candidate -> 'environmentEvents') = 0
      )
      or
      (
        candidate ->> 'exposureStatus' = 'in-progress'
        and jsonb_typeof(candidate -> 'plannedEndAtIso') = 'string'
        and jsonb_typeof(candidate -> 'stimulusStartedAtIso') = 'string'
        and candidate -> 'stimulusEndedAtIso' = 'null'::jsonb
        and candidate -> 'terminationReason' = 'null'::jsonb
        and candidate -> 'sleepStartedAtIso' = 'null'::jsonb
      )
      or
      (
        candidate ->> 'exposureStatus' = 'completed'
        and jsonb_typeof(candidate -> 'plannedEndAtIso') = 'string'
        and jsonb_typeof(candidate -> 'stimulusStartedAtIso') = 'string'
        and jsonb_typeof(candidate -> 'stimulusEndedAtIso') = 'string'
        and candidate -> 'terminationReason' = 'null'::jsonb
        and jsonb_array_length(candidate -> 'trials') = 4
      )
      or
      (
        candidate ->> 'exposureStatus' = 'terminated'
        and jsonb_typeof(candidate -> 'plannedEndAtIso') = 'string'
        and jsonb_typeof(candidate -> 'stimulusStartedAtIso') = 'string'
        and jsonb_typeof(candidate -> 'stimulusEndedAtIso') = 'string'
        and candidate ->> 'terminationReason' in ('end_sequence', 'touch_end', 'page_reload')
      )
    ), false);
end;
$$;
revoke all on function private.is_valid_study_draft_v3(jsonb)
  from public, anon, authenticated;

create or replace function public.save_study_draft(
  resume_token text,
  draft_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_token_hash bytea;
  draft_expires_at timestamptz := clock_timestamp() + interval '48 hours';
begin
  if resume_token is null or resume_token !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'The resume token must be a 64-character hexadecimal value.'
      using errcode = '22023';
  end if;
  if draft_payload is null or jsonb_typeof(draft_payload) <> 'object' then
    raise exception 'The draft payload must be a JSON object.'
      using errcode = '22023';
  end if;
  if pg_column_size(draft_payload) > 131072 then
    raise exception 'The draft payload exceeds the 128 KiB limit.'
      using errcode = '22001';
  end if;
  if private.is_valid_study_draft_v3(draft_payload) is not true then
    raise exception 'The draft payload does not match the active Protocol v3 contract.'
      using errcode = '22023';
  end if;

  draft_token_hash := pg_catalog.sha256(
    pg_catalog.convert_to(resume_token, 'UTF8')
  );

  -- Opportunistic cleanup prevents expired drafts from accumulating while the
  -- study remains active. A scheduled cleanup may also call the same DELETE.
  delete from private.study_drafts
  where expires_at <= clock_timestamp();

  insert into private.study_drafts (
    token_hash,
    payload,
    created_at,
    updated_at,
    expires_at
  )
  values (
    draft_token_hash,
    draft_payload,
    clock_timestamp(),
    clock_timestamp(),
    draft_expires_at
  )
  on conflict (token_hash) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      expires_at = excluded.expires_at;

  return jsonb_build_object('expiresAt', draft_expires_at);
end;
$$;

create or replace function public.load_study_draft(resume_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_token_hash bytea;
  draft_payload jsonb;
begin
  if resume_token is null or resume_token !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'The resume token must be a 64-character hexadecimal value.'
      using errcode = '22023';
  end if;

  draft_token_hash := pg_catalog.sha256(
    pg_catalog.convert_to(resume_token, 'UTF8')
  );

  delete from private.study_drafts
  where token_hash = draft_token_hash
    and expires_at <= clock_timestamp();

  select stored.payload
  into draft_payload
  from private.study_drafts as stored
  where stored.token_hash = draft_token_hash
    and stored.expires_at > clock_timestamp();

  return draft_payload;
end;
$$;

create or replace function public.delete_study_draft(resume_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_token_hash bytea;
  deleted_count integer;
begin
  if resume_token is null or resume_token !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'The resume token must be a 64-character hexadecimal value.'
      using errcode = '22023';
  end if;

  draft_token_hash := pg_catalog.sha256(
    pg_catalog.convert_to(resume_token, 'UTF8')
  );

  delete from private.study_drafts
  where token_hash = draft_token_hash;
  get diagnostics deleted_count = row_count;

  return deleted_count > 0;
end;
$$;

revoke all on function public.save_study_draft(text, jsonb) from public, anon, authenticated;
revoke all on function public.load_study_draft(text) from public, anon, authenticated;
revoke all on function public.delete_study_draft(text) from public, anon, authenticated;
grant execute on function public.save_study_draft(text, jsonb) to anon;
grant execute on function public.load_study_draft(text) to anon;
grant execute on function public.delete_study_draft(text) to anon;

-- Unique study-name profiles, token-authenticated progress, append-only
-- participant feedback, and profile-authenticated final session submission.
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
