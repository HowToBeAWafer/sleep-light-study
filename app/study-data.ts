import type {
  DeviceInfo,
  PostStudySurvey,
  PreStudySurvey,
  ReactionTestRecord,
} from "./protocol-v3";

type CsvAttentionTrial = {
  trialNumber: number;
  status: string;
  plannedOnsetMs: number;
  appearedElapsedMs: number | null;
  appearedAtIso: string | null;
  clickedElapsedMs: number | null;
  clickedAtIso: string | null;
  reactionTimeMs: number | null;
  inputMethod: string | null;
  crossXPercent: number;
  crossYPercent: number;
  clickXPercent: number | null;
  clickYPercent: number | null;
};

type CsvSessionDeviceInfo = {
  beforeSleep: DeviceInfo;
  afterWaking: DeviceInfo | null;
  deviceChanged: boolean | null;
};

export type CsvSessionRecord = {
  schemaVersion?: 2 | 3;
  protocolVersion?: string;
  attentionProtocolVersion?: string;
  sessionId: string;
  participantId: string;
  participantProfileId?: string;
  studyBuildVersion?: string;
  conditionId: string;
  conditionName: string;
  stimulusColorHex: string | null;
  stimulusColorRgb: string | null;
  startedAtIso: string;
  stimulusStartedAtIso?: string | null;
  stimulusEndedAtIso?: string | null;
  sleepStartedAtIso?: string | null;
  morningReturnedAtIso?: string | null;
  assessmentCompletedAtIso?: string | null;
  plannedEndAtIso: string | null;
  endedAtIso: string | null;
  plannedDurationMs: number;
  actualDurationMs: number;
  wallClockDurationMs: number;
  totalPausedDurationMs: number;
  crossVisibleMs: number;
  status: string;
  exposureStatus?: string;
  terminationReason: string | null;
  fullscreenAtStart: boolean;
  fullscreenRequestFailed: boolean;
  deviceInfo?: CsvSessionDeviceInfo;
  preSurvey?: PreStudySurvey;
  postSurvey?: PostStudySurvey | null;
  reactionTest?: ReactionTestRecord | null;
  trials: CsvAttentionTrial[];
  falseClicks: Array<{
    clickedElapsedMs: number;
    clickedAtIso: string;
    inputMethod: string;
    clickXPercent: number | null;
    clickYPercent: number | null;
  }>;
  environmentEvents: Array<{
    type: string;
    elapsedMs: number;
    atIso: string;
  }>;
  pauses: Array<{
    startedElapsedMs: number;
    startedAtIso: string;
    endedAtIso: string | null;
    durationMs: number;
  }>;
};

const CSV_HEADERS = [
  "session_id",
  "participant_id",
  "condition_id",
  "condition_name",
  "stimulus_color_hex",
  "stimulus_color_rgb",
  "session_started_at_iso",
  "planned_end_at_iso",
  "actual_end_at_iso",
  "planned_duration_ms",
  "actual_duration_ms",
  "wall_clock_duration_ms",
  "total_paused_duration_ms",
  "cross_visible_ms",
  "session_status",
  "termination_reason",
  "fullscreen_at_start",
  "fullscreen_request_failed",
  "trial_number",
  "event_type",
  "event_status",
  "event_elapsed_ms",
  "event_at_iso",
  "planned_cross_onset_ms",
  "cross_appeared_elapsed_ms",
  "cross_appeared_at_iso",
  "click_elapsed_ms",
  "click_at_iso",
  "reaction_time_ms",
  "input_method",
  "cross_x_percent",
  "cross_y_percent",
  "click_x_percent",
  "click_y_percent",
  "pause_started_at_iso",
  "pause_ended_at_iso",
  "pause_duration_ms",
  "schema_version",
  "protocol_version",
  "attention_protocol_version",
  "stimulus_started_at_iso",
  "stimulus_ended_at_iso",
  "sleep_started_at_iso",
  "morning_returned_at_iso",
  "assessment_completed_at_iso",
  "exposure_status",
  "device_detection_version_before_sleep",
  "device_detected_before_sleep",
  "device_confirmed_before_sleep",
  "device_confirmation_source_before_sleep",
  "device_touch_capable_before_sleep",
  "device_coarse_pointer_before_sleep",
  "device_fine_pointer_before_sleep",
  "device_hover_capable_before_sleep",
  "device_detection_version_after_waking",
  "device_detected_after_waking",
  "device_confirmed_after_waking",
  "device_confirmation_source_after_waking",
  "device_touch_capable_after_waking",
  "device_coarse_pointer_after_waking",
  "device_fine_pointer_after_waking",
  "device_hover_capable_after_waking",
  "device_changed",
  "pre_questionnaire_version",
  "pre_answered_at_iso",
  "previous_night_sleep_time",
  "pre_sleepiness_kss",
  "screen_use_before_sleep",
  "screen_use_minutes",
  "sleeps_with_light",
  "sleep_light_color",
  "sleep_temperature",
  "sleep_aid_medication_or_supplement",
  "morning_restedness",
  "previous_night_sleep_quality",
  "caffeine_in_past_8_hours",
  "music_before_sleep",
  "sleep_noise_level",
  "vigorous_exercise_in_past_12_hours",
  "post_questionnaire_version",
  "post_answered_at_iso",
  "post_sleepiness_kss",
  "reaction_test_protocol_version",
  "reaction_test_started_at_iso",
  "reaction_test_completed_at_iso",
  "reaction_test_valid_count",
  "reaction_test_average_ms",
  "reaction_test_median_ms",
  "reaction_test_false_start_count",
  "reaction_test_miss_count",
  "reaction_trial_number",
  "reaction_trial_status",
  "reaction_trial_started_at_iso",
  "reaction_trial_stimulus_delay_ms",
  "reaction_trial_stimulus_shown_at_iso",
  "reaction_trial_responded_at_iso",
  "reaction_trial_reaction_time_ms",
  "reaction_trial_input_method",
  "participant_profile_id",
  "study_build_version",
] as const;

type CsvHeader = (typeof CSV_HEADERS)[number];
type CsvCell = string | number | boolean | null;
type CsvRow = Partial<Record<CsvHeader, CsvCell>>;

function escapeCsv(value: CsvCell) {
  if (value === null) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function deviceColumns(
  device: DeviceInfo | null | undefined,
  period: "before_sleep" | "after_waking",
): CsvRow {
  if (!device) return {};
  return {
    [`device_detection_version_${period}`]: device.detectionVersion,
    [`device_detected_${period}`]: device.detectedCategory,
    [`device_confirmed_${period}`]: device.confirmedCategory,
    [`device_confirmation_source_${period}`]: device.confirmationSource,
    [`device_touch_capable_${period}`]: device.touchCapable,
    [`device_coarse_pointer_${period}`]: device.coarsePointer,
    [`device_fine_pointer_${period}`]: device.finePointer,
    [`device_hover_capable_${period}`]: device.hoverCapable,
  } as CsvRow;
}

function elapsedFromSessionStart(session: CsvSessionRecord, eventAtIso: string) {
  const elapsed = Date.parse(eventAtIso) - Date.parse(session.startedAtIso);
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
}

function commonColumns(session: CsvSessionRecord): CsvRow {
  const preSurvey = session.preSurvey;
  const postSurvey = session.postSurvey;
  const reactionTest = session.reactionTest;
  const beforeSleep = session.deviceInfo?.beforeSleep;
  const afterWaking = session.deviceInfo?.afterWaking;

  return {
    schema_version: session.schemaVersion ?? null,
    protocol_version: session.protocolVersion ?? null,
    attention_protocol_version: session.attentionProtocolVersion ?? null,
    session_id: session.sessionId,
    participant_id: session.participantId,
    participant_profile_id: session.participantProfileId ?? null,
    study_build_version: session.studyBuildVersion ?? null,
    condition_id: session.conditionId,
    condition_name: session.conditionName,
    stimulus_color_hex: session.stimulusColorHex,
    stimulus_color_rgb: session.stimulusColorRgb,
    session_started_at_iso: session.startedAtIso,
    stimulus_started_at_iso: session.stimulusStartedAtIso ?? null,
    stimulus_ended_at_iso: session.stimulusEndedAtIso ?? null,
    sleep_started_at_iso: session.sleepStartedAtIso ?? null,
    morning_returned_at_iso: session.morningReturnedAtIso ?? null,
    assessment_completed_at_iso: session.assessmentCompletedAtIso ?? null,
    planned_end_at_iso: session.plannedEndAtIso,
    actual_end_at_iso: session.endedAtIso,
    planned_duration_ms: session.plannedDurationMs,
    actual_duration_ms: session.actualDurationMs,
    wall_clock_duration_ms: session.wallClockDurationMs,
    total_paused_duration_ms: session.totalPausedDurationMs,
    cross_visible_ms: session.crossVisibleMs,
    session_status: session.status,
    exposure_status: session.exposureStatus ?? null,
    termination_reason: session.terminationReason,
    fullscreen_at_start: session.fullscreenAtStart,
    fullscreen_request_failed: session.fullscreenRequestFailed,
    ...deviceColumns(beforeSleep, "before_sleep"),
    ...deviceColumns(afterWaking, "after_waking"),
    device_changed: session.deviceInfo?.deviceChanged ?? null,
    pre_questionnaire_version: preSurvey?.questionnaireVersion ?? null,
    pre_answered_at_iso: preSurvey?.answeredAtIso ?? null,
    previous_night_sleep_time: preSurvey?.previousNightSleepTime ?? null,
    pre_sleepiness_kss: preSurvey?.sleepinessKss ?? null,
    screen_use_before_sleep: preSurvey?.screenUseBeforeSleep ?? null,
    screen_use_minutes: preSurvey?.screenUseMinutes ?? null,
    sleeps_with_light: preSurvey?.sleepsWithLight ?? null,
    sleep_light_color: preSurvey?.sleepLightColor ?? null,
    sleep_temperature: preSurvey?.sleepTemperature ?? null,
    sleep_aid_medication_or_supplement:
      preSurvey?.sleepAidMedicationOrSupplement ?? null,
    morning_restedness: preSurvey?.morningRestedness ?? null,
    previous_night_sleep_quality: preSurvey?.previousNightSleepQuality ?? null,
    caffeine_in_past_8_hours: preSurvey?.caffeineInPast8Hours ?? null,
    music_before_sleep: preSurvey?.musicBeforeSleep ?? null,
    sleep_noise_level: preSurvey?.sleepNoiseLevel ?? null,
    vigorous_exercise_in_past_12_hours:
      preSurvey?.vigorousExerciseInPast12Hours ?? null,
    post_questionnaire_version: postSurvey?.questionnaireVersion ?? null,
    post_answered_at_iso: postSurvey?.answeredAtIso ?? null,
    post_sleepiness_kss: postSurvey?.sleepinessKss ?? null,
    reaction_test_protocol_version: reactionTest?.protocolVersion ?? null,
    reaction_test_started_at_iso: reactionTest?.startedAtIso ?? null,
    reaction_test_completed_at_iso: reactionTest?.completedAtIso ?? null,
    reaction_test_valid_count: reactionTest?.validCount ?? null,
    reaction_test_average_ms: reactionTest?.averageReactionTimeMs ?? null,
    reaction_test_median_ms: reactionTest?.medianReactionTimeMs ?? null,
    reaction_test_false_start_count: reactionTest?.falseStartCount ?? null,
    reaction_test_miss_count: reactionTest?.missCount ?? null,
  };
}

export function sessionToCsv(session: CsvSessionRecord) {
  const common = commonColumns(session);
  const rows: Array<{ elapsed: number; order: number; row: CsvRow }> = [
    {
      elapsed: -1,
      order: 0,
      row: {
        ...common,
        event_type: "session_summary",
        event_status: session.status,
        event_elapsed_ms: 0,
        event_at_iso: session.startedAtIso,
      },
    },
  ];
  let insertionOrder = 1;

  for (const trial of session.trials) {
    rows.push({
      elapsed: trial.appearedElapsedMs ?? trial.plannedOnsetMs,
      order: insertionOrder++,
      row: {
        ...common,
        trial_number: trial.trialNumber,
        event_type: "attention_trial",
        event_status: trial.status,
        event_elapsed_ms: trial.appearedElapsedMs,
        event_at_iso: trial.appearedAtIso,
        planned_cross_onset_ms: trial.plannedOnsetMs,
        cross_appeared_elapsed_ms: trial.appearedElapsedMs,
        cross_appeared_at_iso: trial.appearedAtIso,
        click_elapsed_ms: trial.clickedElapsedMs,
        click_at_iso: trial.clickedAtIso,
        reaction_time_ms: trial.reactionTimeMs,
        input_method: trial.inputMethod,
        cross_x_percent: trial.crossXPercent,
        cross_y_percent: trial.crossYPercent,
        click_x_percent: trial.clickXPercent,
        click_y_percent: trial.clickYPercent,
      },
    });
  }

  for (const falseClick of session.falseClicks) {
    rows.push({
      elapsed: falseClick.clickedElapsedMs,
      order: insertionOrder++,
      row: {
        ...common,
        event_type: "false_click",
        event_status: "false_click",
        event_elapsed_ms: falseClick.clickedElapsedMs,
        event_at_iso: falseClick.clickedAtIso,
        click_elapsed_ms: falseClick.clickedElapsedMs,
        click_at_iso: falseClick.clickedAtIso,
        input_method: falseClick.inputMethod,
        click_x_percent: falseClick.clickXPercent,
        click_y_percent: falseClick.clickYPercent,
      },
    });
  }

  for (const environmentEvent of session.environmentEvents) {
    rows.push({
      elapsed: environmentEvent.elapsedMs,
      order: insertionOrder++,
      row: {
        ...common,
        event_type: "environment",
        event_status: environmentEvent.type,
        event_elapsed_ms: environmentEvent.elapsedMs,
        event_at_iso: environmentEvent.atIso,
      },
    });
  }

  for (const pause of session.pauses) {
    rows.push({
      elapsed: pause.startedElapsedMs,
      order: insertionOrder++,
      row: {
        ...common,
        event_type: "pause",
        event_status: pause.endedAtIso ? "completed" : "incomplete",
        event_elapsed_ms: pause.startedElapsedMs,
        event_at_iso: pause.startedAtIso,
        pause_started_at_iso: pause.startedAtIso,
        pause_ended_at_iso: pause.endedAtIso,
        pause_duration_ms: pause.durationMs,
      },
    });
  }

  for (const reactionTrial of session.reactionTest?.trials ?? []) {
    const eventAtIso =
      reactionTrial.respondedAtIso ??
      reactionTrial.stimulusShownAtIso ??
      reactionTrial.startedAtIso;
    const elapsed = elapsedFromSessionStart(session, eventAtIso);
    rows.push({
      elapsed,
      order: insertionOrder++,
      row: {
        ...common,
        event_type: "reaction_test_trial",
        event_status: reactionTrial.status,
        event_elapsed_ms: elapsed,
        event_at_iso: eventAtIso,
        reaction_time_ms: reactionTrial.reactionTimeMs,
        input_method: reactionTrial.inputMethod,
        reaction_trial_number: reactionTrial.trialNumber,
        reaction_trial_status: reactionTrial.status,
        reaction_trial_started_at_iso: reactionTrial.startedAtIso,
        reaction_trial_stimulus_delay_ms: reactionTrial.stimulusDelayMs,
        reaction_trial_stimulus_shown_at_iso: reactionTrial.stimulusShownAtIso,
        reaction_trial_responded_at_iso: reactionTrial.respondedAtIso,
        reaction_trial_reaction_time_ms: reactionTrial.reactionTimeMs,
        reaction_trial_input_method: reactionTrial.inputMethod,
      },
    });
  }

  rows.sort((left, right) => left.elapsed - right.elapsed || left.order - right.order);
  const csvRows = [
    [...CSV_HEADERS],
    ...rows.map(({ row }) => CSV_HEADERS.map((header) => row[header] ?? null)),
  ];
  return csvRows
    .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
    .join("\n");
}

export function sessionsToCsv(sessions: CsvSessionRecord[]) {
  return sessions
    .map((session, index) => {
      const csv = sessionToCsv(session);
      if (index === 0) return csv;
      const firstLineBreak = csv.indexOf("\n");
      return firstLineBreak === -1 ? "" : csv.slice(firstLineBreak + 1);
    })
    .filter(Boolean)
    .join("\n");
}
