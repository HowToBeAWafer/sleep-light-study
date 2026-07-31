begin;

-- Protocol v4 is additive. Historical schema-v2/v3 rows and answers remain
-- untouched and continue to validate under their original contracts.
create or replace function private.is_valid_study_session_v4(
  candidate jsonb,
  allow_active boolean default false
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  sequence_position integer;
  candidate_condition text;
  candidate_status text;
  exposure_status text;
  pre_survey jsonb;
  post_exposure jsonb;
  morning jsonb;
  before_device jsonb;
  after_device jsonb;
begin
  if candidate is null
    or pg_catalog.jsonb_typeof(candidate) <> 'object'
    or pg_catalog.pg_column_size(candidate) > 1048576
    or pg_catalog.jsonb_typeof(candidate -> 'schemaVersion') <> 'number'
    or candidate ->> 'schemaVersion' <> '4'
    or not candidate ?& array[
      'schemaVersion', 'protocolVersion', 'sequenceVersion', 'sequencePosition',
      'attentionProtocolVersion', 'sessionId', 'participantId',
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

  candidate_status := candidate ->> 'status';
  exposure_status := candidate ->> 'exposureStatus';
  candidate_condition := candidate ->> 'conditionId';
  sequence_position := (candidate ->> 'sequencePosition')::integer;
  pre_survey := candidate -> 'preSurvey';
  post_exposure := candidate -> 'postExposureSurvey';
  morning := candidate -> 'morningSurvey';
  before_device := candidate #> '{deviceInfo,beforeSleep}';
  after_device := candidate #> '{deviceInfo,afterWaking}';

  if candidate ->> 'protocolVersion' <> 'overnight-v2'
    or candidate ->> 'sequenceVersion' <> 'fixed-four-v1'
    or candidate ->> 'attentionProtocolVersion' <> 'sparse-4-50-70-v1'
    or pg_catalog.jsonb_typeof(candidate -> 'sequencePosition') <> 'number'
    or coalesce(candidate ->> 'sequencePosition', '') !~ '^[1-4]$'
    or pg_catalog.jsonb_typeof(candidate -> 'crossVisibleMs') <> 'number'
    or candidate ->> 'crossVisibleMs' <> '1800'
    or pg_catalog.jsonb_typeof(candidate -> 'plannedDurationMs') <> 'number'
    or candidate ->> 'plannedDurationMs' <> '300000'
    or pg_catalog.jsonb_typeof(candidate -> 'actualDurationMs') <> 'number'
    or pg_catalog.jsonb_typeof(candidate -> 'wallClockDurationMs') <> 'number'
    or pg_catalog.jsonb_typeof(candidate -> 'totalPausedDurationMs') <> 'number'
    or (candidate ->> 'actualDurationMs')::numeric < 0
    or (candidate ->> 'actualDurationMs')::numeric > 300000
    or (candidate ->> 'wallClockDurationMs')::numeric < 0
    or (candidate ->> 'wallClockDurationMs')::numeric
      < (candidate ->> 'actualDurationMs')::numeric
    or (candidate ->> 'totalPausedDurationMs')::numeric < 0
    or (candidate ->> 'totalPausedDurationMs')::numeric
      > (candidate ->> 'wallClockDurationMs')::numeric
    or sequence_position not between 1 and 4
    or candidate_condition <> (
      case sequence_position
        when 1 then 'dim-red'
        when 2 then 'dim-blue'
        when 3 then 'bright-blue'
        when 4 then 'bright-red'
      end
    )
    or candidate_condition not in ('dim-red', 'dim-blue', 'bright-blue', 'bright-red')
    or coalesce(candidate ->> 'sessionId', '') !~
      '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$'
    or coalesce(candidate ->> 'participantProfileId', '') !~
      '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$'
    or coalesce(candidate ->> 'participantId', '') = ''
    or char_length(candidate ->> 'participantId') > 80
    or candidate ->> 'participantId' <> pg_catalog.btrim(candidate ->> 'participantId')
    or candidate ->> 'participantId' ~ '[[:cntrl:]]'
    or pg_catalog.lower(candidate ->> 'participantId') in ('admin', 'test')
    or pg_catalog.jsonb_typeof(candidate -> 'studyBuildVersion') <> 'string'
    or coalesce(candidate ->> 'studyBuildVersion', '') !~ '^[A-Za-z0-9._+-]{1,80}$'
    or pg_catalog.jsonb_typeof(candidate -> 'startedAtIso') <> 'string'
    or coalesce(candidate ->> 'startedAtIso', '') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
    or (
      candidate -> 'plannedEndAtIso' <> 'null'::jsonb
      and (
        pg_catalog.jsonb_typeof(candidate -> 'plannedEndAtIso') <> 'string'
        or coalesce(candidate ->> 'plannedEndAtIso', '') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      )
    )
    or (
      candidate -> 'stimulusStartedAtIso' <> 'null'::jsonb
      and (
        pg_catalog.jsonb_typeof(candidate -> 'stimulusStartedAtIso') <> 'string'
        or coalesce(candidate ->> 'stimulusStartedAtIso', '') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      )
    )
    or (
      candidate -> 'stimulusEndedAtIso' <> 'null'::jsonb
      and (
        pg_catalog.jsonb_typeof(candidate -> 'stimulusEndedAtIso') <> 'string'
        or coalesce(candidate ->> 'stimulusEndedAtIso', '') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      )
    )
    or (
      candidate -> 'sleepStartedAtIso' <> 'null'::jsonb
      and (
        pg_catalog.jsonb_typeof(candidate -> 'sleepStartedAtIso') <> 'string'
        or coalesce(candidate ->> 'sleepStartedAtIso', '') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      )
    )
    or (
      candidate -> 'morningReturnedAtIso' <> 'null'::jsonb
      and (
        pg_catalog.jsonb_typeof(candidate -> 'morningReturnedAtIso') <> 'string'
        or coalesce(candidate ->> 'morningReturnedAtIso', '') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      )
    )
    or (
      candidate -> 'assessmentCompletedAtIso' <> 'null'::jsonb
      and (
        pg_catalog.jsonb_typeof(candidate -> 'assessmentCompletedAtIso') <> 'string'
        or coalesce(candidate ->> 'assessmentCompletedAtIso', '') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      )
    )
    or (
      candidate -> 'endedAtIso' <> 'null'::jsonb
      and (
        pg_catalog.jsonb_typeof(candidate -> 'endedAtIso') <> 'string'
        or coalesce(candidate ->> 'endedAtIso', '') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      )
    )
    or candidate_status not in ('active', 'completed', 'terminated')
    or (not allow_active and candidate_status = 'active')
    or exposure_status not in ('not-started', 'in-progress', 'completed', 'terminated')
    or (
      candidate -> 'terminationReason' <> 'null'::jsonb
      and (
        pg_catalog.jsonb_typeof(candidate -> 'terminationReason') <> 'string'
        or candidate ->> 'terminationReason'
          not in ('end_sequence', 'touch_end', 'page_reload')
      )
    )
    or pg_catalog.jsonb_typeof(candidate -> 'fullscreenAtStart') <> 'boolean'
    or pg_catalog.jsonb_typeof(candidate -> 'fullscreenRequestFailed') <> 'boolean'
    or pg_catalog.jsonb_typeof(candidate -> 'trialPlan') <> 'array'
    or pg_catalog.jsonb_array_length(candidate -> 'trialPlan') <> 4
    or pg_catalog.jsonb_typeof(candidate -> 'trials') <> 'array'
    or pg_catalog.jsonb_array_length(candidate -> 'trials') > 4
    or pg_catalog.jsonb_typeof(candidate -> 'falseClicks') <> 'array'
    or pg_catalog.jsonb_array_length(candidate -> 'falseClicks') > 10000
    or pg_catalog.jsonb_typeof(candidate -> 'pauses') <> 'array'
    or pg_catalog.jsonb_array_length(candidate -> 'pauses') > 1000
    or pg_catalog.jsonb_typeof(candidate -> 'environmentEvents') <> 'array'
    or pg_catalog.jsonb_array_length(candidate -> 'environmentEvents') > 1000
    or pg_catalog.jsonb_typeof(candidate -> 'deviceInfo') <> 'object'
    or not ((candidate -> 'deviceInfo') ?& array[
      'beforeSleep', 'afterWaking', 'deviceChanged'
    ])
    or pg_catalog.jsonb_typeof(before_device) <> 'object'
    or not (before_device ?& array[
      'detectionVersion', 'detectedCategory', 'confirmedCategory',
      'confirmationSource', 'touchCapable', 'coarsePointer', 'finePointer',
      'hoverCapable'
    ])
    or before_device ->> 'detectionVersion' <> 'capabilities-v1'
    or before_device ->> 'detectedCategory' not in ('phone', 'tablet', 'computer')
    or before_device ->> 'confirmedCategory' not in ('phone', 'tablet', 'computer')
    or before_device ->> 'confirmationSource'
      not in ('automatic', 'participant-correction')
    or (
      before_device ->> 'confirmationSource' = 'automatic'
      and before_device ->> 'detectedCategory'
        <> before_device ->> 'confirmedCategory'
    )
    or (
      before_device ->> 'confirmationSource' = 'participant-correction'
      and before_device ->> 'detectedCategory'
        = before_device ->> 'confirmedCategory'
    )
    or pg_catalog.jsonb_typeof(before_device -> 'touchCapable') <> 'boolean'
    or pg_catalog.jsonb_typeof(before_device -> 'coarsePointer') <> 'boolean'
    or pg_catalog.jsonb_typeof(before_device -> 'finePointer') <> 'boolean'
    or pg_catalog.jsonb_typeof(before_device -> 'hoverCapable') <> 'boolean'
    or pg_catalog.jsonb_typeof(after_device) not in ('null', 'object')
    or pg_catalog.jsonb_typeof(candidate #> '{deviceInfo,deviceChanged}')
      not in ('null', 'boolean')
    or pg_catalog.jsonb_typeof(candidate -> 'preSurvey') <> 'object'
    or not ((candidate -> 'preSurvey') ?& array[
      'questionnaireVersion', 'answeredAtIso', 'previousNightSleepTime',
      'sleepinessKss', 'screenUseBeforeSleep', 'screenUseMinutes',
      'sleepsWithLight', 'sleepLightColor', 'sleepTemperature',
      'sleepAidMedicationOrSupplement', 'morningRestedness',
      'previousNightSleepQuality', 'caffeineInPast8Hours',
      'musicBeforeSleep', 'sleepNoiseLevel', 'vigorousExerciseInPast12Hours'
    ])
    or candidate #>> '{preSurvey,questionnaireVersion}' <> 'pre-study-v1'
    or pg_catalog.jsonb_typeof(candidate #> '{preSurvey,sleepinessKss}') <> 'number'
    or coalesce(candidate #>> '{preSurvey,sleepinessKss}', '') !~ '^[1-9]$'
    or coalesce(candidate #>> '{preSurvey,answeredAtIso}', '') <>
      candidate ->> 'startedAtIso'
    or pg_catalog.jsonb_typeof(pre_survey -> 'previousNightSleepTime') <> 'string'
    or coalesce(pre_survey ->> 'previousNightSleepTime', '')
      !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or pg_catalog.jsonb_typeof(pre_survey -> 'screenUseBeforeSleep') <> 'string'
    or pre_survey ->> 'screenUseBeforeSleep'
      not in ('yes', 'no', 'prefer-not-to-answer')
    or (
      pre_survey ->> 'screenUseBeforeSleep' = 'yes'
      and (
        pg_catalog.jsonb_typeof(pre_survey -> 'screenUseMinutes') <> 'number'
        or coalesce(pre_survey ->> 'screenUseMinutes', '')
          !~ '^([1-9]|[1-9][0-9]|1[01][0-9]|120)$'
      )
    )
    or (
      pre_survey ->> 'screenUseBeforeSleep' = 'no'
      and (
        pg_catalog.jsonb_typeof(pre_survey -> 'screenUseMinutes') <> 'number'
        or pre_survey ->> 'screenUseMinutes' <> '0'
      )
    )
    or (
      pre_survey ->> 'screenUseBeforeSleep' = 'prefer-not-to-answer'
      and pre_survey -> 'screenUseMinutes' <> 'null'::jsonb
    )
    or pg_catalog.jsonb_typeof(pre_survey -> 'sleepsWithLight') <> 'string'
    or pre_survey ->> 'sleepsWithLight'
      not in ('yes', 'no', 'prefer-not-to-answer')
    or (
      pre_survey ->> 'sleepsWithLight' = 'yes'
      and (
        pg_catalog.jsonb_typeof(pre_survey -> 'sleepLightColor') <> 'string'
        or pre_survey ->> 'sleepLightColor' not in (
          'warm-white-yellow', 'cool-white', 'red', 'blue', 'green',
          'multicolor', 'other', 'unsure'
        )
      )
    )
    or (
      pre_survey ->> 'sleepsWithLight' <> 'yes'
      and pre_survey -> 'sleepLightColor' <> 'null'::jsonb
    )
    or pg_catalog.jsonb_typeof(pre_survey -> 'sleepTemperature') <> 'string'
    or pre_survey ->> 'sleepTemperature' not in (
      'cold', 'slightly-cold', 'comfortable', 'slightly-warm', 'hot',
      'prefer-not-to-answer'
    )
    or pg_catalog.jsonb_typeof(
      pre_survey -> 'sleepAidMedicationOrSupplement'
    ) <> 'string'
    or pre_survey ->> 'sleepAidMedicationOrSupplement'
      not in ('yes', 'no', 'prefer-not-to-answer')
    or pg_catalog.jsonb_typeof(pre_survey -> 'morningRestedness') <> 'number'
    or coalesce(pre_survey ->> 'morningRestedness', '') !~ '^[1-5]$'
    or pg_catalog.jsonb_typeof(
      pre_survey -> 'previousNightSleepQuality'
    ) <> 'number'
    or coalesce(pre_survey ->> 'previousNightSleepQuality', '') !~ '^[1-5]$'
    or pg_catalog.jsonb_typeof(pre_survey -> 'caffeineInPast8Hours') <> 'string'
    or pre_survey ->> 'caffeineInPast8Hours'
      not in ('yes', 'no', 'prefer-not-to-answer')
    or pg_catalog.jsonb_typeof(pre_survey -> 'musicBeforeSleep') <> 'string'
    or pre_survey ->> 'musicBeforeSleep'
      not in ('yes', 'no', 'prefer-not-to-answer')
    or pg_catalog.jsonb_typeof(pre_survey -> 'sleepNoiseLevel') <> 'string'
    or pre_survey ->> 'sleepNoiseLevel'
      not in ('none', 'low', 'moderate', 'high', 'prefer-not-to-answer')
    or pg_catalog.jsonb_typeof(
      pre_survey -> 'vigorousExerciseInPast12Hours'
    ) <> 'string'
    or pre_survey ->> 'vigorousExerciseInPast12Hours'
      not in ('yes', 'no', 'prefer-not-to-answer')
  then
    return false;
  end if;

  if not (
    (candidate_condition = 'dim-red'
      and candidate ->> 'conditionName' = 'Dim Red'
      and candidate ->> 'stimulusColorHex' = '#660000'
      and candidate ->> 'stimulusColorRgb' = '102, 0, 0')
    or (candidate_condition = 'dim-blue'
      and candidate ->> 'conditionName' = 'Dim Blue'
      and candidate ->> 'stimulusColorHex' = '#000066'
      and candidate ->> 'stimulusColorRgb' = '0, 0, 102')
    or (candidate_condition = 'bright-blue'
      and candidate ->> 'conditionName' = 'Bright Blue'
      and candidate ->> 'stimulusColorHex' = '#0000ff'
      and candidate ->> 'stimulusColorRgb' = '0, 0, 255')
    or (candidate_condition = 'bright-red'
      and candidate ->> 'conditionName' = 'Bright Red'
      and candidate ->> 'stimulusColorHex' = '#ff0000'
      and candidate ->> 'stimulusColorRgb' = '255, 0, 0')
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(candidate -> 'trialPlan')
      with ordinality as plan_entry(item, ordinal)
    where pg_catalog.jsonb_typeof(plan_entry.item) <> 'object'
      or not (plan_entry.item ?& array[
        'trialNumber', 'plannedOnsetMs', 'crossXPercent', 'crossYPercent'
      ])
      or pg_catalog.jsonb_typeof(plan_entry.item -> 'trialNumber') <> 'number'
      or coalesce(plan_entry.item ->> 'trialNumber', '') !~ '^[1-4]$'
      or (plan_entry.item ->> 'trialNumber')::integer <> plan_entry.ordinal
      or pg_catalog.jsonb_typeof(plan_entry.item -> 'plannedOnsetMs') <> 'number'
      or coalesce(plan_entry.item ->> 'plannedOnsetMs', '') !~ '^[0-9]+$'
      or pg_catalog.jsonb_typeof(plan_entry.item -> 'crossXPercent') <> 'number'
      or (plan_entry.item ->> 'crossXPercent')::numeric not between 0 and 100
      or pg_catalog.jsonb_typeof(plan_entry.item -> 'crossYPercent') <> 'number'
      or (plan_entry.item ->> 'crossYPercent')::numeric not between 0 and 100
  ) then
    return false;
  end if;

  if exists (
    select 1
    from (
      select
        (plan_entry.item ->> 'trialNumber')::integer as trial_number,
        (plan_entry.item ->> 'plannedOnsetMs')::integer as planned_onset_ms,
        pg_catalog.lag(
          (plan_entry.item ->> 'plannedOnsetMs')::integer
        ) over (
          order by (plan_entry.item ->> 'trialNumber')::integer
        ) as previous_onset_ms
      from pg_catalog.jsonb_array_elements(candidate -> 'trialPlan')
        as plan_entry(item)
    ) as planned_schedule
    where (
      planned_schedule.trial_number = 1
      and planned_schedule.planned_onset_ms not between 50000 and 70000
    ) or (
      planned_schedule.trial_number > 1
      and (
        planned_schedule.planned_onset_ms
          - planned_schedule.previous_onset_ms
      ) not between 50000 and 70000
    )
  ) then
    return false;
  end if;

  if (
    select pg_catalog.count(distinct trial_entry.item ->> 'trialNumber')
    from pg_catalog.jsonb_array_elements(candidate -> 'trials')
      as trial_entry(item)
  ) <> pg_catalog.jsonb_array_length(candidate -> 'trials') then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(candidate -> 'trials')
      as trial_entry(item)
    where pg_catalog.jsonb_typeof(trial_entry.item) <> 'object'
      or not (trial_entry.item ?& array[
        'trialNumber', 'plannedOnsetMs', 'crossXPercent', 'crossYPercent',
        'status', 'appearedElapsedMs', 'appearedAtIso', 'clickedElapsedMs',
        'clickedAtIso', 'reactionTimeMs', 'inputMethod', 'clickXPercent',
        'clickYPercent'
      ])
      or pg_catalog.jsonb_typeof(trial_entry.item -> 'trialNumber') <> 'number'
      or coalesce(trial_entry.item ->> 'trialNumber', '') !~ '^[1-4]$'
      or not exists (
        select 1
        from pg_catalog.jsonb_array_elements(candidate -> 'trialPlan')
          as matching_plan(item)
        where matching_plan.item -> 'trialNumber'
            = trial_entry.item -> 'trialNumber'
          and matching_plan.item -> 'plannedOnsetMs'
            = trial_entry.item -> 'plannedOnsetMs'
          and matching_plan.item -> 'crossXPercent'
            = trial_entry.item -> 'crossXPercent'
          and matching_plan.item -> 'crossYPercent'
            = trial_entry.item -> 'crossYPercent'
      )
      or pg_catalog.jsonb_typeof(trial_entry.item -> 'status') <> 'string'
      or trial_entry.item ->> 'status'
        not in ('pending', 'hit', 'missed', 'omitted', 'cancelled')
      or pg_catalog.jsonb_typeof(trial_entry.item -> 'appearedElapsedMs')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(trial_entry.item -> 'appearedElapsedMs') = 'number'
        and (trial_entry.item ->> 'appearedElapsedMs')::numeric < 0
      )
      or pg_catalog.jsonb_typeof(trial_entry.item -> 'appearedAtIso')
        not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(trial_entry.item -> 'appearedAtIso') = 'string'
        and coalesce(trial_entry.item ->> 'appearedAtIso', '') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      )
      or (
        (trial_entry.item -> 'appearedElapsedMs' = 'null'::jsonb)
          <> (trial_entry.item -> 'appearedAtIso' = 'null'::jsonb)
      )
      or pg_catalog.jsonb_typeof(trial_entry.item -> 'clickedElapsedMs')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(trial_entry.item -> 'clickedElapsedMs') = 'number'
        and (trial_entry.item ->> 'clickedElapsedMs')::numeric < 0
      )
      or pg_catalog.jsonb_typeof(trial_entry.item -> 'clickedAtIso')
        not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(trial_entry.item -> 'clickedAtIso') = 'string'
        and coalesce(trial_entry.item ->> 'clickedAtIso', '') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      )
      or pg_catalog.jsonb_typeof(trial_entry.item -> 'reactionTimeMs')
        not in ('null', 'number')
      or pg_catalog.jsonb_typeof(trial_entry.item -> 'inputMethod')
        not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(trial_entry.item -> 'inputMethod') = 'string'
        and trial_entry.item ->> 'inputMethod' not in ('pointer', 'space', 'enter')
      )
      or pg_catalog.jsonb_typeof(trial_entry.item -> 'clickXPercent')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(trial_entry.item -> 'clickXPercent') = 'number'
        and (trial_entry.item ->> 'clickXPercent')::numeric not between 0 and 100
      )
      or pg_catalog.jsonb_typeof(trial_entry.item -> 'clickYPercent')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(trial_entry.item -> 'clickYPercent') = 'number'
        and (trial_entry.item ->> 'clickYPercent')::numeric not between 0 and 100
      )
      or (
        trial_entry.item ->> 'status' = 'hit'
        and (
          trial_entry.item -> 'appearedElapsedMs' = 'null'::jsonb
          or trial_entry.item -> 'appearedAtIso' = 'null'::jsonb
          or trial_entry.item -> 'clickedElapsedMs' = 'null'::jsonb
          or trial_entry.item -> 'clickedAtIso' = 'null'::jsonb
          or trial_entry.item -> 'reactionTimeMs' = 'null'::jsonb
          or trial_entry.item -> 'inputMethod' = 'null'::jsonb
          or (trial_entry.item ->> 'reactionTimeMs')::numeric not between 0 and 1800
          or (trial_entry.item ->> 'clickedElapsedMs')::numeric
            < (trial_entry.item ->> 'appearedElapsedMs')::numeric
          or (trial_entry.item ->> 'reactionTimeMs')::numeric
            <> (
              (trial_entry.item ->> 'clickedElapsedMs')::numeric
              - (trial_entry.item ->> 'appearedElapsedMs')::numeric
            )
          or (trial_entry.item ->> 'clickedAtIso')::timestamptz
            < (trial_entry.item ->> 'appearedAtIso')::timestamptz
        )
      )
      or (
        trial_entry.item ->> 'status' <> 'hit'
        and (
          trial_entry.item -> 'clickedElapsedMs' <> 'null'::jsonb
          or trial_entry.item -> 'clickedAtIso' <> 'null'::jsonb
          or trial_entry.item -> 'reactionTimeMs' <> 'null'::jsonb
          or trial_entry.item -> 'inputMethod' <> 'null'::jsonb
          or trial_entry.item -> 'clickXPercent' <> 'null'::jsonb
          or trial_entry.item -> 'clickYPercent' <> 'null'::jsonb
        )
      )
      or (
        trial_entry.item ->> 'status' = 'missed'
        and trial_entry.item -> 'appearedElapsedMs' = 'null'::jsonb
      )
      or (
        trial_entry.item ->> 'status' = 'omitted'
        and trial_entry.item -> 'appearedElapsedMs' <> 'null'::jsonb
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(candidate -> 'falseClicks')
      as false_click(item)
    where pg_catalog.jsonb_typeof(false_click.item) <> 'object'
      or not (false_click.item ?& array[
        'clickedElapsedMs', 'clickedAtIso', 'inputMethod',
        'clickXPercent', 'clickYPercent'
      ])
      or pg_catalog.jsonb_typeof(false_click.item -> 'clickedElapsedMs') <> 'number'
      or (false_click.item ->> 'clickedElapsedMs')::numeric < 0
      or pg_catalog.jsonb_typeof(false_click.item -> 'clickedAtIso') <> 'string'
      or coalesce(false_click.item ->> 'clickedAtIso', '') !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      or pg_catalog.jsonb_typeof(false_click.item -> 'inputMethod') <> 'string'
      or false_click.item ->> 'inputMethod' not in ('pointer', 'space', 'enter')
      or pg_catalog.jsonb_typeof(false_click.item -> 'clickXPercent')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(false_click.item -> 'clickXPercent') = 'number'
        and (false_click.item ->> 'clickXPercent')::numeric not between 0 and 100
      )
      or pg_catalog.jsonb_typeof(false_click.item -> 'clickYPercent')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(false_click.item -> 'clickYPercent') = 'number'
        and (false_click.item ->> 'clickYPercent')::numeric not between 0 and 100
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(candidate -> 'pauses')
      as pause_entry(item)
    where pg_catalog.jsonb_typeof(pause_entry.item) <> 'object'
      or not (pause_entry.item ?& array[
        'pauseNumber', 'startedElapsedMs', 'startedAtIso',
        'endedAtIso', 'durationMs'
      ])
      or pg_catalog.jsonb_typeof(pause_entry.item -> 'pauseNumber') <> 'number'
      or coalesce(pause_entry.item ->> 'pauseNumber', '') !~ '^[1-9][0-9]*$'
      or pg_catalog.jsonb_typeof(pause_entry.item -> 'startedElapsedMs') <> 'number'
      or (pause_entry.item ->> 'startedElapsedMs')::numeric < 0
      or pg_catalog.jsonb_typeof(pause_entry.item -> 'startedAtIso') <> 'string'
      or coalesce(pause_entry.item ->> 'startedAtIso', '') !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      or pg_catalog.jsonb_typeof(pause_entry.item -> 'endedAtIso')
        not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(pause_entry.item -> 'endedAtIso') = 'string'
        and coalesce(pause_entry.item ->> 'endedAtIso', '') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      )
      or pg_catalog.jsonb_typeof(pause_entry.item -> 'durationMs') <> 'number'
      or (pause_entry.item ->> 'durationMs')::numeric < 0
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(candidate -> 'environmentEvents')
      as environment_event(item)
    where pg_catalog.jsonb_typeof(environment_event.item) <> 'object'
      or not (environment_event.item ?& array['type', 'elapsedMs', 'atIso'])
      or pg_catalog.jsonb_typeof(environment_event.item -> 'type') <> 'string'
      or environment_event.item ->> 'type' not in (
        'visibility_hidden', 'visibility_visible',
        'fullscreen_entered', 'fullscreen_exited'
      )
      or pg_catalog.jsonb_typeof(environment_event.item -> 'elapsedMs') <> 'number'
      or (environment_event.item ->> 'elapsedMs')::numeric < 0
      or pg_catalog.jsonb_typeof(environment_event.item -> 'atIso') <> 'string'
      or coalesce(environment_event.item ->> 'atIso', '') !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  ) then
    return false;
  end if;

  if exposure_status = 'not-started' and (
      candidate -> 'plannedEndAtIso' <> 'null'::jsonb
      or candidate -> 'stimulusStartedAtIso' <> 'null'::jsonb
      or candidate -> 'stimulusEndedAtIso' <> 'null'::jsonb
      or candidate ->> 'actualDurationMs' <> '0'
      or candidate ->> 'wallClockDurationMs' <> '0'
      or candidate ->> 'totalPausedDurationMs' <> '0'
      or candidate -> 'terminationReason' <> 'null'::jsonb
      or pg_catalog.jsonb_array_length(candidate -> 'trials') <> 0
      or pg_catalog.jsonb_array_length(candidate -> 'falseClicks') <> 0
      or pg_catalog.jsonb_array_length(candidate -> 'pauses') <> 0
      or pg_catalog.jsonb_array_length(candidate -> 'environmentEvents') <> 0
      or (candidate ->> 'fullscreenAtStart')::boolean
    )
  then
    return false;
  elsif exposure_status = 'in-progress' and (
      candidate_status <> 'active'
      or pg_catalog.jsonb_typeof(candidate -> 'plannedEndAtIso') <> 'string'
      or pg_catalog.jsonb_typeof(candidate -> 'stimulusStartedAtIso') <> 'string'
      or candidate -> 'stimulusEndedAtIso' <> 'null'::jsonb
      or candidate -> 'terminationReason' <> 'null'::jsonb
      or (candidate ->> 'stimulusStartedAtIso')::timestamptz
        < (candidate ->> 'startedAtIso')::timestamptz
      or (candidate ->> 'plannedEndAtIso')::timestamptz
        < (candidate ->> 'stimulusStartedAtIso')::timestamptz
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(candidate -> 'trials')
          as pending_trial(item)
        where pending_trial.item ->> 'status' = 'pending'
      ) > 1
    )
  then
    return false;
  elsif exposure_status = 'completed' and (
      pg_catalog.jsonb_typeof(candidate -> 'plannedEndAtIso') <> 'string'
      or pg_catalog.jsonb_typeof(candidate -> 'stimulusStartedAtIso') <> 'string'
      or pg_catalog.jsonb_typeof(candidate -> 'stimulusEndedAtIso') <> 'string'
      or pg_catalog.jsonb_array_length(candidate -> 'trials') <> 4
      or candidate -> 'terminationReason' <> 'null'::jsonb
      or (candidate ->> 'stimulusEndedAtIso')::timestamptz
        < (candidate ->> 'stimulusStartedAtIso')::timestamptz
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(candidate -> 'trials') as trial(item)
        where trial.item ->> 'status' in ('pending', 'cancelled')
      )
    )
  then
    return false;
  elsif exposure_status = 'terminated' and (
      pg_catalog.jsonb_typeof(candidate -> 'plannedEndAtIso') <> 'string'
      or pg_catalog.jsonb_typeof(candidate -> 'stimulusStartedAtIso') <> 'string'
      or pg_catalog.jsonb_typeof(candidate -> 'stimulusEndedAtIso') <> 'string'
      or candidate ->> 'terminationReason'
        not in ('end_sequence', 'touch_end', 'page_reload')
      or (candidate ->> 'stimulusEndedAtIso')::timestamptz
        < (candidate ->> 'stimulusStartedAtIso')::timestamptz
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(candidate -> 'trials') as trial(item)
        where trial.item ->> 'status' = 'pending'
      )
    )
  then
    return false;
  end if;

  if post_exposure <> 'null'::jsonb and (
      pg_catalog.jsonb_typeof(post_exposure) <> 'object'
      or not (post_exposure ?& array[
        'questionnaireVersion', 'answeredAtIso', 'sleepinessKss'
      ])
      or post_exposure ->> 'questionnaireVersion' <> 'post-exposure-kss-v1'
      or pg_catalog.jsonb_typeof(post_exposure -> 'sleepinessKss') <> 'number'
      or coalesce(post_exposure ->> 'sleepinessKss', '') !~ '^[1-9]$'
      or pg_catalog.jsonb_typeof(post_exposure -> 'answeredAtIso') <> 'string'
      or coalesce(post_exposure ->> 'answeredAtIso', '') !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
    )
  then
    return false;
  end if;

  if morning <> 'null'::jsonb and (
      pg_catalog.jsonb_typeof(morning) <> 'object'
      or not (morning ?& array[
        'questionnaireVersion', 'answeredAtIso', 'attemptedSleepTime',
        'wakeTime', 'awakenings', 'sleepQuality', 'restedness', 'alertness',
        'unusualFactors', 'unusualFactorsNote'
      ])
      or morning ->> 'questionnaireVersion' <> 'morning-study-v1'
      or pg_catalog.jsonb_typeof(morning -> 'attemptedSleepTime') <> 'string'
      or coalesce(morning ->> 'attemptedSleepTime', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or pg_catalog.jsonb_typeof(morning -> 'wakeTime') <> 'string'
      or coalesce(morning ->> 'wakeTime', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or pg_catalog.jsonb_typeof(morning -> 'awakenings') <> 'number'
      or coalesce(morning ->> 'awakenings', '') !~ '^(0|[1-9]|1[0-9]|20)$'
      or pg_catalog.jsonb_typeof(morning -> 'sleepQuality') <> 'number'
      or coalesce(morning ->> 'sleepQuality', '') !~ '^[1-5]$'
      or pg_catalog.jsonb_typeof(morning -> 'restedness') <> 'number'
      or coalesce(morning ->> 'restedness', '') !~ '^[1-5]$'
      or pg_catalog.jsonb_typeof(morning -> 'alertness') <> 'number'
      or coalesce(morning ->> 'alertness', '') !~ '^[1-5]$'
      or pg_catalog.jsonb_typeof(morning -> 'unusualFactors') <> 'string'
      or morning ->> 'unusualFactors' not in ('yes', 'no', 'prefer-not-to-answer')
      or pg_catalog.jsonb_typeof(morning -> 'answeredAtIso') <> 'string'
      or coalesce(morning ->> 'answeredAtIso', '') !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      or (
        morning ->> 'unusualFactors' = 'yes'
        and (
          pg_catalog.jsonb_typeof(morning -> 'unusualFactorsNote') <> 'string'
          or char_length(pg_catalog.btrim(morning ->> 'unusualFactorsNote')) < 1
          or char_length(morning ->> 'unusualFactorsNote') > 1000
        )
      )
      or (
        morning ->> 'unusualFactors' <> 'yes'
        and morning -> 'unusualFactorsNote' <> 'null'::jsonb
      )
    )
  then
    return false;
  end if;

  if candidate -> 'morningReturnedAtIso' <> 'null'::jsonb and (
      pg_catalog.jsonb_typeof(after_device) <> 'object'
      or not (after_device ?& array[
        'detectionVersion', 'detectedCategory', 'confirmedCategory',
        'confirmationSource', 'touchCapable', 'coarsePointer', 'finePointer',
        'hoverCapable'
      ])
      or after_device ->> 'detectionVersion' <> 'capabilities-v1'
      or after_device ->> 'detectedCategory' not in ('phone', 'tablet', 'computer')
      or after_device ->> 'confirmedCategory' not in ('phone', 'tablet', 'computer')
      or after_device ->> 'confirmationSource'
        not in ('automatic', 'participant-correction')
      or (
        after_device ->> 'confirmationSource' = 'automatic'
        and after_device ->> 'detectedCategory'
          <> after_device ->> 'confirmedCategory'
      )
      or (
        after_device ->> 'confirmationSource' = 'participant-correction'
        and after_device ->> 'detectedCategory'
          = after_device ->> 'confirmedCategory'
      )
      or pg_catalog.jsonb_typeof(after_device -> 'touchCapable') <> 'boolean'
      or pg_catalog.jsonb_typeof(after_device -> 'coarsePointer') <> 'boolean'
      or pg_catalog.jsonb_typeof(after_device -> 'finePointer') <> 'boolean'
      or pg_catalog.jsonb_typeof(after_device -> 'hoverCapable') <> 'boolean'
      or pg_catalog.jsonb_typeof(candidate #> '{deviceInfo,deviceChanged}') <> 'boolean'
      or (candidate #>> '{deviceInfo,deviceChanged}')::boolean
        <> (
          after_device ->> 'confirmedCategory'
            <> before_device ->> 'confirmedCategory'
        )
    )
  then
    return false;
  end if;

  if candidate_status = 'active' then
    if candidate -> 'assessmentCompletedAtIso' <> 'null'::jsonb
      or candidate -> 'endedAtIso' <> 'null'::jsonb
    then
      return false;
    end if;

    if post_exposure = 'null'::jsonb then
      if candidate -> 'sleepStartedAtIso' <> 'null'::jsonb
        or candidate -> 'morningReturnedAtIso' <> 'null'::jsonb
        or morning <> 'null'::jsonb
        or after_device <> 'null'::jsonb
        or candidate #> '{deviceInfo,deviceChanged}' <> 'null'::jsonb
      then
        return false;
      end if;
    else
      if candidate -> 'stimulusEndedAtIso' = 'null'::jsonb
        or (post_exposure ->> 'answeredAtIso')::timestamptz
          < (candidate ->> 'stimulusEndedAtIso')::timestamptz
      then
        return false;
      end if;

      if candidate -> 'sleepStartedAtIso' = 'null'::jsonb then
        if candidate -> 'morningReturnedAtIso' <> 'null'::jsonb
          or morning <> 'null'::jsonb
          or after_device <> 'null'::jsonb
          or candidate #> '{deviceInfo,deviceChanged}' <> 'null'::jsonb
        then
          return false;
        end if;
      else
        if (candidate ->> 'sleepStartedAtIso')::timestamptz
            < (post_exposure ->> 'answeredAtIso')::timestamptz
        then
          return false;
        end if;
        if candidate -> 'morningReturnedAtIso' = 'null'::jsonb then
          if morning <> 'null'::jsonb
            or after_device <> 'null'::jsonb
            or candidate #> '{deviceInfo,deviceChanged}' <> 'null'::jsonb
          then
            return false;
          end if;
        elsif (candidate ->> 'morningReturnedAtIso')::timestamptz
            < (candidate ->> 'sleepStartedAtIso')::timestamptz
          or after_device = 'null'::jsonb
          or candidate #> '{deviceInfo,deviceChanged}' = 'null'::jsonb
          or (
            morning <> 'null'::jsonb
            and (morning ->> 'answeredAtIso')::timestamptz
              < (candidate ->> 'morningReturnedAtIso')::timestamptz
          )
        then
          return false;
        end if;
      end if;
    end if;
  elsif candidate_status in ('completed', 'terminated') then
    if exposure_status not in ('completed', 'terminated')
      or (candidate_status = 'completed' and exposure_status <> 'completed')
      or (candidate_status = 'terminated' and exposure_status <> 'terminated')
      or post_exposure = 'null'::jsonb
      or morning = 'null'::jsonb
      or candidate -> 'sleepStartedAtIso' = 'null'::jsonb
      or candidate -> 'morningReturnedAtIso' = 'null'::jsonb
      or candidate -> 'assessmentCompletedAtIso' = 'null'::jsonb
      or candidate -> 'endedAtIso' = 'null'::jsonb
      or after_device = 'null'::jsonb
    then
      return false;
    end if;

    if (candidate #>> '{postExposureSurvey,answeredAtIso}')::timestamptz
        < (candidate ->> 'stimulusEndedAtIso')::timestamptz
      or (candidate ->> 'sleepStartedAtIso')::timestamptz
        < (candidate #>> '{postExposureSurvey,answeredAtIso}')::timestamptz
      or (candidate ->> 'morningReturnedAtIso')::timestamptz
        < (candidate ->> 'sleepStartedAtIso')::timestamptz
      or (candidate #>> '{morningSurvey,answeredAtIso}')::timestamptz
        < (candidate ->> 'morningReturnedAtIso')::timestamptz
      or (candidate ->> 'assessmentCompletedAtIso')::timestamptz
        < (candidate #>> '{morningSurvey,answeredAtIso}')::timestamptz
      or (candidate ->> 'endedAtIso')::timestamptz
        < (candidate ->> 'assessmentCompletedAtIso')::timestamptz
    then
      return false;
    end if;
  end if;

  if candidate ? 'postSurvey' or candidate ? 'reactionTest' then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function private.is_valid_study_session_v4(jsonb, boolean)
  from public, anon, authenticated;
grant execute on function private.is_valid_study_session_v4(jsonb, boolean)
  to service_role;

alter table public.study_sessions
  drop constraint if exists study_payload_array_lengths_ck,
  drop constraint if exists study_payload_matches_columns_ck,
  drop constraint if exists study_payload_v4_contract_ck;

alter table public.study_sessions
  add constraint study_payload_array_lengths_ck
    check (
      (
        (
          payload ->> 'schemaVersion' = '2'
          and condition_id in ('bright-red', 'dim-red', 'bright-blue', 'dim-blue')
          and jsonb_array_length(payload -> 'trialPlan') = 20
          and jsonb_array_length(payload -> 'trials') <= 20
        )
        or (
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
            or (
              condition_id = 'control'
              and jsonb_array_length(payload -> 'trialPlan') = 0
              and jsonb_array_length(payload -> 'trials') = 0
            )
          )
        )
        or (
          payload ->> 'schemaVersion' = '4'
          and condition_id in ('dim-red', 'dim-blue', 'bright-blue', 'bright-red')
          and jsonb_array_length(payload -> 'trialPlan') = 4
          and jsonb_array_length(payload -> 'trials') <= 4
          and (
            payload ->> 'exposureStatus' <> 'completed'
            or jsonb_array_length(payload -> 'trials') = 4
          )
        )
      )
      and jsonb_array_length(payload -> 'falseClicks') <= 10000
      and jsonb_array_length(payload -> 'pauses') <= 1000
      and jsonb_array_length(payload -> 'environmentEvents') <= 1000
    ),
  add constraint study_payload_matches_columns_ck
    check (
      payload ->> 'schemaVersion' in ('2', '3', '4')
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
  add constraint study_payload_v4_contract_ck
    check (
      case
        when payload ->> 'schemaVersion' = '4'
          then private.is_valid_study_session_v4(payload, false)
        else true
      end
    );

drop policy if exists "anonymous insert final study sessions" on public.study_sessions;
create policy "anonymous insert final study sessions"
  on public.study_sessions
  for insert
  to anon
  with check (
    status in ('completed', 'terminated')
    and lower(participant_id) not in ('test', 'admin')
    and payload ->> 'schemaVersion' in ('2', '3')
  );

-- Link the existing protected draft table to participant accounts. The random
-- bearer-token RPCs remain unchanged for historical v3 drafts.
alter table private.study_drafts
  add column if not exists participant_profile_id uuid
    references private.participant_profiles(profile_id) on delete cascade;

alter table private.study_drafts enable row level security;
revoke all on table private.study_drafts from public, anon, authenticated;

create unique index if not exists study_drafts_profile_uidx
  on private.study_drafts (participant_profile_id)
  where participant_profile_id is not null;

create or replace function public.save_participant_study_draft(
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
    or private.is_valid_study_session_v4(draft_payload, true) is not true
    or draft_payload ->> 'status' <> 'active'
    or draft_payload ->> 'participantProfileId' <> participant_profile_id::text
    or draft_payload ->> 'participantId' <> profile_record.display_name
  then
    raise exception 'The participant draft is not valid.' using errcode = '22023';
  end if;

  delete from private.study_drafts where expires_at <= clock_timestamp();
  select stored.payload ->> 'sessionId' into stored_session_id
  from private.study_drafts as stored
  where stored.participant_profile_id = profile_record.profile_id;
  if stored_session_id is not null
    and stored_session_id <> draft_payload ->> 'sessionId'
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
  select generated.position into expected_position
  from pg_catalog.generate_series(1, 4) as generated(position)
  where not exists (
    select 1
    from private.participant_profile_sessions as linked
    join public.study_sessions as saved on saved.session_id = linked.session_id
    where linked.profile_id = profile_record.profile_id
      and saved.status = 'completed'
      and saved.payload ->> 'schemaVersion' = '4'
      and saved.payload ->> 'protocolVersion' = 'overnight-v2'
      and saved.payload ->> 'sequenceVersion' = 'fixed-four-v1'
      and saved.payload ->> 'exposureStatus' = 'completed'
      and (saved.payload ->> 'sequencePosition')::integer = generated.position
  )
  order by generated.position
  limit 1;
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
      token_hash, payload, created_at, updated_at, expires_at, participant_profile_id
    ) values (
      draft_token_hash, draft_payload, clock_timestamp(), clock_timestamp(),
      draft_expires_at, profile_record.profile_id
    );
  end if;

  return pg_catalog.jsonb_build_object('expiresAt', draft_expires_at);
end;
$$;

create or replace function public.load_participant_study_draft(
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
  draft_payload jsonb;
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
  delete from private.study_drafts as expired_draft
  where expired_draft.participant_profile_id = profile_record.profile_id
    and expired_draft.expires_at <= clock_timestamp();
  select stored.payload into draft_payload
  from private.study_drafts as stored
  where stored.participant_profile_id = profile_record.profile_id
    and stored.expires_at > clock_timestamp();
  return draft_payload;
end;
$$;

create or replace function public.delete_participant_study_draft(
  participant_profile_id uuid,
  recovery_proof text,
  session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_profile_id uuid := participant_profile_id;
  deleted_count integer;
begin
  if requested_profile_id is null
    or session_id is null
    or recovery_proof is null
    or recovery_proof !~ '^[0-9A-Fa-f]{64}$'
    or not exists (
      select 1 from private.participant_profiles as existing
      where existing.profile_id = requested_profile_id
        and existing.recovery_code_hash = private.participant_recovery_hash(recovery_proof)
    )
  then
    raise exception 'Participant authentication failed.' using errcode = '28000';
  end if;
  delete from private.study_drafts as participant_draft
  where participant_draft.participant_profile_id = requested_profile_id
    and participant_draft.payload ->> 'sessionId' = session_id::text;
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.save_participant_study_draft(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.load_participant_study_draft(uuid, text)
  from public, anon, authenticated;
revoke all on function public.delete_participant_study_draft(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.save_participant_study_draft(uuid, text, jsonb) to anon;
grant execute on function public.load_participant_study_draft(uuid, text) to anon;
grant execute on function public.delete_participant_study_draft(uuid, text, uuid) to anon;

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
    ) as has_completed
    from conditions
  ) as historical_condition_progress;

  select coalesce(
    pg_catalog.jsonb_agg(position order by position),
    '[]'::jsonb
  ) into completed_sequence_positions
  from (
    select distinct (saved.payload ->> 'sequencePosition')::integer as position
    from private.participant_profile_sessions as linked
    join public.study_sessions as saved on saved.session_id = linked.session_id
    where linked.profile_id = profile_record.profile_id
      and saved.status = 'completed'
      and saved.payload ->> 'schemaVersion' = '4'
      and saved.payload ->> 'protocolVersion' = 'overnight-v2'
      and saved.payload ->> 'sequenceVersion' = 'fixed-four-v1'
      and saved.payload ->> 'exposureStatus' = 'completed'
  ) as completed_positions;

  select generated.position into next_sequence_position
  from pg_catalog.generate_series(1, 4) as generated(position)
  where not (
    completed_sequence_positions
      @> pg_catalog.jsonb_build_array(generated.position)
  )
  order by generated.position
  limit 1;
  next_condition_id := case next_sequence_position
    when 1 then 'dim-red'
    when 2 then 'dim-blue'
    when 3 then 'bright-blue'
    when 4 then 'bright-red'
    else null
  end;

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
    'activeProtocolVersion', 'overnight-v2',
    'sequenceVersion', 'fixed-four-v1',
    'completedSequencePositions', completed_sequence_positions,
    'nextSequencePosition', next_sequence_position,
    'nextConditionId', next_condition_id
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
    or session_payload ->> 'schemaVersion' not in ('3', '4')
    or session_payload ->> 'participantId' <> profile_record.display_name
    or session_payload ->> 'status' not in ('completed', 'terminated')
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
    raise exception 'The final session payload exceeds the 1 MiB limit.'
      using errcode = '22001';
  end if;
  candidate_session_id := (final_payload ->> 'sessionId')::uuid;

  -- Return an identical retry before checking the next sequence position. This
  -- keeps a successful submission idempotent when its first response is lost.
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

  if final_payload ->> 'schemaVersion' = '4' then
    if private.is_valid_study_session_v4(final_payload, false) is not true then
      raise exception 'The Protocol v4 session payload is not valid.' using errcode = '22023';
    end if;
    candidate_position := (final_payload ->> 'sequencePosition')::integer;
    select generated.position into expected_position
    from pg_catalog.generate_series(1, 4) as generated(position)
    where not exists (
      select 1
      from private.participant_profile_sessions as linked
      join public.study_sessions as saved on saved.session_id = linked.session_id
      where linked.profile_id = profile_record.profile_id
        and saved.status = 'completed'
        and saved.payload ->> 'schemaVersion' = '4'
        and saved.payload ->> 'protocolVersion' = 'overnight-v2'
        and saved.payload ->> 'sequenceVersion' = 'fixed-four-v1'
        and saved.payload ->> 'exposureStatus' = 'completed'
        and (saved.payload ->> 'sequencePosition')::integer = generated.position
    )
    order by generated.position
    limit 1;
    if expected_position is null or candidate_position <> expected_position then
      raise exception 'This is not the participant''s next assigned condition.'
        using errcode = '22023';
    end if;
  elsif final_payload ->> 'conditionId' not in (
    'bright-red', 'dim-red', 'bright-blue', 'dim-blue', 'control'
  ) then
    raise exception 'The historical session condition is not valid.' using errcode = '22023';
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
        select pg_catalog.jsonb_agg(completed.condition_id order by completed.condition_id)
        from (
          select distinct saved.condition_id
          from private.participant_profile_sessions as linked
          join public.study_sessions as saved on saved.session_id = linked.session_id
          where linked.profile_id = profile.profile_id and saved.status = 'completed'
        ) as completed
      ), '[]'::jsonb),
      'completedSequencePositions', coalesce((
        select pg_catalog.jsonb_agg(completed.position order by completed.position)
        from (
          select distinct (saved.payload ->> 'sequencePosition')::integer as position
          from private.participant_profile_sessions as linked
          join public.study_sessions as saved on saved.session_id = linked.session_id
          where linked.profile_id = profile.profile_id
            and saved.status = 'completed'
            and saved.payload ->> 'schemaVersion' = '4'
            and saved.payload ->> 'protocolVersion' = 'overnight-v2'
            and saved.payload ->> 'sequenceVersion' = 'fixed-four-v1'
            and saved.payload ->> 'exposureStatus' = 'completed'
        ) as completed
      ), '[]'::jsonb),
      'nextSequencePosition', (
        select generated.position
        from pg_catalog.generate_series(1, 4) as generated(position)
        where not exists (
          select 1
          from private.participant_profile_sessions as linked
          join public.study_sessions as saved on saved.session_id = linked.session_id
          where linked.profile_id = profile.profile_id
            and saved.status = 'completed'
            and saved.payload ->> 'schemaVersion' = '4'
            and saved.payload ->> 'sequenceVersion' = 'fixed-four-v1'
            and saved.payload ->> 'exposureStatus' = 'completed'
            and (saved.payload ->> 'sequencePosition')::integer = generated.position
        )
        order by generated.position limit 1
      ),
      'nextConditionId', (
        select case generated.position
          when 1 then 'dim-red'
          when 2 then 'dim-blue'
          when 3 then 'bright-blue'
          when 4 then 'bright-red'
        end
        from pg_catalog.generate_series(1, 4) as generated(position)
        where not exists (
          select 1
          from private.participant_profile_sessions as linked
          join public.study_sessions as saved on saved.session_id = linked.session_id
          where linked.profile_id = profile.profile_id
            and saved.status = 'completed'
            and saved.payload ->> 'schemaVersion' = '4'
            and saved.payload ->> 'sequenceVersion' = 'fixed-four-v1'
            and saved.payload ->> 'exposureStatus' = 'completed'
            and (saved.payload ->> 'sequencePosition')::integer = generated.position
        )
        order by generated.position limit 1
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
  return pg_catalog.jsonb_build_object('items', result_items, 'total', result_total);
end;
$$;

commit;
