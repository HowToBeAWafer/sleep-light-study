-- Upgrade an existing Sleep Light Study database from protocol v2 to v3.
-- This migration preserves every v2 row and adds the v3 survey, device,
-- reaction-test, sparse-attention, control, and overnight-draft contracts.

begin;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

revoke all on table public.study_sessions from public;

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

commit;
