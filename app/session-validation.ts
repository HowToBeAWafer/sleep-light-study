import {
  isConditionId,
  isDeviceInfo,
  isPostStudySurvey,
  isPreStudySurvey,
  isReactionTestRecord,
} from "./protocol-v3.ts";
import type {
  EnvironmentEvent,
  FalseClickRecord,
  PauseRecord,
  PlannedTrial,
  StudySessionRecordV3,
  TrialRecord,
} from "./session-record";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const INPUT_METHODS = new Set(["pointer", "space", "enter"]);
const TRIAL_STATUSES = new Set(["pending", "hit", "missed", "omitted", "cancelled"]);
const TERMINATION_REASONS = new Set(["end_sequence", "touch_end", "page_reload"]);
const ENVIRONMENT_EVENT_TYPES = new Set([
  "visibility_hidden",
  "visibility_visible",
  "fullscreen_entered",
  "fullscreen_exited",
]);

const CONDITION_DETAILS = {
  "bright-red": { name: "Bright Red", hex: "#ff0000", rgb: "255, 0, 0" },
  "dim-red": { name: "Dim Red", hex: "#660000", rgb: "102, 0, 0" },
  "bright-blue": { name: "Bright Blue", hex: "#0000ff", rgb: "0, 0, 255" },
  "dim-blue": { name: "Dim Blue", hex: "#000066", rgb: "0, 0, 102" },
  control: { name: "Control — Normal Sleep", hex: null, rgb: null },
} as const;

type ValidationOptions = {
  allowActive?: boolean;
  allowReservedParticipantId?: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function isNullableIsoDate(value: unknown): value is string | null {
  return value === null || isIsoDate(value);
}

function isPercent(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 100;
}

function isAtOrAfter(later: string, earlier: string) {
  return Date.parse(later) >= Date.parse(earlier);
}

function isPlannedTrial(value: unknown): value is PlannedTrial {
  return isObject(value) &&
    Number.isInteger(value.trialNumber) &&
    (value.trialNumber as number) >= 1 &&
    (value.trialNumber as number) <= 4 &&
    Number.isInteger(value.plannedOnsetMs) &&
    (value.plannedOnsetMs as number) >= 50000 &&
    (value.plannedOnsetMs as number) <= 280000 &&
    isPercent(value.crossXPercent) &&
    isPercent(value.crossYPercent);
}

function hasValidSparseTrialSchedule(trialPlan: PlannedTrial[]) {
  if (trialPlan.length !== 4) return false;
  const ordered = [...trialPlan].sort((left, right) => left.trialNumber - right.trialNumber);
  if (!ordered.every((trial, index) => trial.trialNumber === index + 1)) return false;
  if (ordered[0].plannedOnsetMs < 50000 || ordered[0].plannedOnsetMs > 70000) return false;
  return ordered.slice(1).every((trial, index) => {
    const interval = trial.plannedOnsetMs - ordered[index].plannedOnsetMs;
    return interval >= 50000 && interval <= 70000;
  });
}

function isTrial(value: unknown): value is TrialRecord {
  if (!isObject(value) || !isPlannedTrial(value)) return false;
  const trial = value as unknown as Record<string, unknown>;
  if (
    typeof trial.status !== "string" ||
    !TRIAL_STATUSES.has(trial.status) ||
    !(trial.appearedElapsedMs === null || isNonNegativeNumber(trial.appearedElapsedMs)) ||
    !isNullableIsoDate(trial.appearedAtIso) ||
    !(trial.clickedElapsedMs === null || isNonNegativeNumber(trial.clickedElapsedMs)) ||
    !isNullableIsoDate(trial.clickedAtIso) ||
    !(trial.reactionTimeMs === null || isNonNegativeNumber(trial.reactionTimeMs)) ||
    !(trial.inputMethod === null || INPUT_METHODS.has(String(trial.inputMethod))) ||
    !(trial.clickXPercent === null || isPercent(trial.clickXPercent)) ||
    !(trial.clickYPercent === null || isPercent(trial.clickYPercent))
  ) return false;

  const hasAppeared = trial.appearedElapsedMs !== null && trial.appearedAtIso !== null;
  const hasNoAppearance = trial.appearedElapsedMs === null && trial.appearedAtIso === null;
  if (!hasAppeared && !hasNoAppearance) return false;

  if (trial.status === "hit") {
    return hasAppeared &&
      trial.clickedElapsedMs !== null && trial.clickedAtIso !== null &&
      trial.reactionTimeMs !== null && trial.inputMethod !== null &&
      (trial.clickedElapsedMs as number) >= (trial.appearedElapsedMs as number) &&
      trial.reactionTimeMs === (trial.clickedElapsedMs as number) - (trial.appearedElapsedMs as number) &&
      isAtOrAfter(trial.clickedAtIso as string, trial.appearedAtIso as string);
  }

  const hasNoResponse = trial.clickedElapsedMs === null && trial.clickedAtIso === null &&
    trial.reactionTimeMs === null && trial.inputMethod === null &&
    trial.clickXPercent === null && trial.clickYPercent === null;
  if (!hasNoResponse) return false;
  if (trial.status === "pending") return true;
  if (trial.status === "missed") return hasAppeared;
  if (trial.status === "omitted") return hasNoAppearance;
  return trial.status === "cancelled";
}

function isFalseClick(value: unknown): value is FalseClickRecord {
  return isObject(value) && isNonNegativeNumber(value.clickedElapsedMs) &&
    isIsoDate(value.clickedAtIso) && INPUT_METHODS.has(String(value.inputMethod)) &&
    (value.clickXPercent === null || isPercent(value.clickXPercent)) &&
    (value.clickYPercent === null || isPercent(value.clickYPercent));
}

function isPause(value: unknown): value is PauseRecord {
  return isObject(value) && Number.isInteger(value.pauseNumber) &&
    (value.pauseNumber as number) >= 1 && isNonNegativeNumber(value.startedElapsedMs) &&
    isIsoDate(value.startedAtIso) && isNullableIsoDate(value.endedAtIso) &&
    isNonNegativeNumber(value.durationMs);
}

function isEnvironmentEvent(value: unknown): value is EnvironmentEvent {
  return isObject(value) && ENVIRONMENT_EVENT_TYPES.has(String(value.type)) &&
    isNonNegativeNumber(value.elapsedMs) && isIsoDate(value.atIso);
}

function hasConsistentDeviceChange(value: StudySessionRecordV3) {
  const afterWaking = value.deviceInfo.afterWaking;
  if (afterWaking === null) return value.deviceInfo.deviceChanged === null;
  return value.deviceInfo.deviceChanged ===
    (afterWaking.confirmedCategory !== value.deviceInfo.beforeSleep.confirmedCategory);
}

function hasValidTrialLinks(value: StudySessionRecordV3) {
  const planByTrial = new Map(value.trialPlan.map((trial) => [trial.trialNumber, trial]));
  if (
    planByTrial.size !== value.trialPlan.length ||
    new Set(value.trials.map((trial) => trial.trialNumber)).size !== value.trials.length
  ) return false;
  return value.trials.every((trial) => {
    const plan = planByTrial.get(trial.trialNumber);
    return Boolean(
      plan &&
      trial.plannedOnsetMs === plan.plannedOnsetMs &&
      trial.crossXPercent === plan.crossXPercent &&
      trial.crossYPercent === plan.crossYPercent
    );
  });
}

function hasValidActiveTimeline(value: StudySessionRecordV3) {
  if (value.endedAtIso !== null || value.assessmentCompletedAtIso !== null) return false;
  if (value.reactionTest !== null) return false;
  if (value.sleepStartedAtIso === null) {
    return value.morningReturnedAtIso === null && value.postSurvey === null &&
      value.deviceInfo.afterWaking === null && value.deviceInfo.deviceChanged === null;
  }
  if (!isAtOrAfter(value.sleepStartedAtIso, value.startedAtIso)) return false;
  if (value.morningReturnedAtIso === null) {
    return value.postSurvey === null && value.deviceInfo.afterWaking === null &&
      value.deviceInfo.deviceChanged === null;
  }
  if (!isAtOrAfter(value.morningReturnedAtIso, value.sleepStartedAtIso)) return false;
  if (value.deviceInfo.afterWaking === null || value.deviceInfo.deviceChanged === null) return false;
  return value.postSurvey === null || isAtOrAfter(value.postSurvey.answeredAtIso, value.morningReturnedAtIso);
}

function hasValidFinalTimeline(value: StudySessionRecordV3) {
  const afterWaking = value.deviceInfo.afterWaking;
  const postSurvey = value.postSurvey;
  const reactionTest = value.reactionTest;
  if (
    value.endedAtIso === null || value.assessmentCompletedAtIso === null ||
    value.sleepStartedAtIso === null || value.morningReturnedAtIso === null ||
    afterWaking === null || value.deviceInfo.deviceChanged === null ||
    postSurvey === null || reactionTest === null
  ) return false;
  return isAtOrAfter(value.sleepStartedAtIso, value.startedAtIso) &&
    isAtOrAfter(value.morningReturnedAtIso, value.sleepStartedAtIso) &&
    isAtOrAfter(postSurvey.answeredAtIso, value.morningReturnedAtIso) &&
    isAtOrAfter(reactionTest.startedAtIso, postSurvey.answeredAtIso) &&
    isAtOrAfter(reactionTest.completedAtIso, reactionTest.startedAtIso) &&
    isAtOrAfter(value.assessmentCompletedAtIso, reactionTest.completedAtIso) &&
    isAtOrAfter(value.endedAtIso, value.assessmentCompletedAtIso);
}

export function isStudySessionRecordV3(
  value: unknown,
  options: ValidationOptions = {},
): value is StudySessionRecordV3 {
  if (!isObject(value) || value.schemaVersion !== 3 || !isConditionId(value.conditionId)) return false;
  const condition = CONDITION_DETAILS[value.conditionId];
  const participantId = typeof value.participantId === "string" ? value.participantId : "";
  const finalStatus = value.status === "completed" || value.status === "terminated";
  const reservedParticipantId = participantId.toLowerCase() === "test" || participantId.toLowerCase() === "admin";

  if (
    value.protocolVersion !== "overnight-v1" ||
    value.attentionProtocolVersion !== "sparse-4-50-70-v1" ||
    typeof value.sessionId !== "string" || !UUID_PATTERN.test(value.sessionId) ||
    !(value.participantProfileId === undefined ||
      (typeof value.participantProfileId === "string" && UUID_PATTERN.test(value.participantProfileId))) ||
    !(value.studyBuildVersion === undefined ||
      (typeof value.studyBuildVersion === "string" && value.studyBuildVersion.length >= 1 && value.studyBuildVersion.length <= 80)) ||
    participantId !== participantId.trim() || participantId.length < 1 || participantId.length > 80 ||
    /[\u0000-\u001f\u007f]/.test(participantId) ||
    (!options.allowReservedParticipantId && reservedParticipantId) ||
    value.conditionName !== condition.name ||
    value.stimulusColorHex !== condition.hex || value.stimulusColorRgb !== condition.rgb ||
    !isNonNegativeNumber(value.plannedDurationMs) ||
    !isNullableIsoDate(value.plannedEndAtIso) ||
    !isNonNegativeNumber(value.actualDurationMs) ||
    !isNonNegativeNumber(value.wallClockDurationMs) ||
    !isNonNegativeNumber(value.totalPausedDurationMs) ||
    value.crossVisibleMs !== 1800 ||
    !isIsoDate(value.startedAtIso) ||
    !isNullableIsoDate(value.stimulusStartedAtIso) ||
    !isNullableIsoDate(value.stimulusEndedAtIso) ||
    !isNullableIsoDate(value.sleepStartedAtIso) ||
    !isNullableIsoDate(value.morningReturnedAtIso) ||
    !isNullableIsoDate(value.assessmentCompletedAtIso) ||
    !isNullableIsoDate(value.endedAtIso) ||
    (value.status !== "active" && !finalStatus) ||
    (!options.allowActive && !finalStatus) ||
    typeof value.fullscreenAtStart !== "boolean" ||
    typeof value.fullscreenRequestFailed !== "boolean" ||
    !isObject(value.deviceInfo) ||
    !isDeviceInfo(value.deviceInfo.beforeSleep) ||
    !(value.deviceInfo.afterWaking === null || isDeviceInfo(value.deviceInfo.afterWaking)) ||
    !(value.deviceInfo.deviceChanged === null || typeof value.deviceInfo.deviceChanged === "boolean") ||
    !isPreStudySurvey(value.preSurvey) ||
    value.preSurvey.answeredAtIso !== value.startedAtIso ||
    !(value.postSurvey === null || isPostStudySurvey(value.postSurvey)) ||
    !(value.reactionTest === null || isReactionTestRecord(value.reactionTest)) ||
    !Array.isArray(value.trialPlan) || !value.trialPlan.every(isPlannedTrial) ||
    !Array.isArray(value.trials) || !value.trials.every(isTrial) ||
    !Array.isArray(value.falseClicks) || value.falseClicks.length > 10000 || !value.falseClicks.every(isFalseClick) ||
    !Array.isArray(value.pauses) || value.pauses.length > 1000 || !value.pauses.every(isPause) ||
    !Array.isArray(value.environmentEvents) || value.environmentEvents.length > 1000 || !value.environmentEvents.every(isEnvironmentEvent)
  ) return false;

  const record = value as unknown as StudySessionRecordV3;
  if (!hasConsistentDeviceChange(record) || !hasValidTrialLinks(record)) return false;

  if (record.conditionId === "control") {
    if (
      record.plannedDurationMs !== 0 || record.plannedEndAtIso !== null ||
      record.actualDurationMs !== 0 || record.wallClockDurationMs !== 0 ||
      record.totalPausedDurationMs !== 0 || record.stimulusStartedAtIso !== null ||
      record.stimulusEndedAtIso !== null || record.exposureStatus !== "not-applicable" ||
      record.terminationReason !== null || record.fullscreenAtStart ||
      record.fullscreenRequestFailed || record.trialPlan.length !== 0 ||
      record.trials.length !== 0 || record.falseClicks.length !== 0 ||
      record.pauses.length !== 0 || record.environmentEvents.length !== 0
    ) return false;
  } else {
    if (
      record.plannedDurationMs !== 300000 ||
      !hasValidSparseTrialSchedule(record.trialPlan) ||
      record.trials.length > 4 ||
      record.actualDurationMs > record.plannedDurationMs ||
      record.totalPausedDurationMs > record.wallClockDurationMs
    ) return false;

    if (record.exposureStatus === "not-started") {
      if (
        finalStatus || record.plannedEndAtIso !== null || record.stimulusStartedAtIso !== null ||
        record.stimulusEndedAtIso !== null || record.actualDurationMs !== 0 ||
        record.wallClockDurationMs !== 0 || record.totalPausedDurationMs !== 0 ||
        record.terminationReason !== null || record.trials.length !== 0 ||
        record.falseClicks.length !== 0 || record.pauses.length !== 0 ||
        record.environmentEvents.length !== 0 || record.fullscreenAtStart ||
        record.sleepStartedAtIso !== null
      ) return false;
    } else if (record.exposureStatus === "in-progress") {
      if (
        finalStatus || record.plannedEndAtIso === null || record.stimulusStartedAtIso === null ||
        record.stimulusEndedAtIso !== null || record.terminationReason !== null ||
        !isAtOrAfter(record.stimulusStartedAtIso, record.startedAtIso) ||
        !isAtOrAfter(record.plannedEndAtIso, record.stimulusStartedAtIso) ||
        record.trials.filter((trial) => trial.status === "pending").length > 1 ||
        record.sleepStartedAtIso !== null
      ) return false;
    } else if (record.exposureStatus === "completed") {
      if (
        record.plannedEndAtIso === null || record.stimulusStartedAtIso === null ||
        record.stimulusEndedAtIso === null || record.terminationReason !== null ||
        record.trials.length !== 4 ||
        record.trials.some((trial) => trial.status === "pending" || trial.status === "cancelled") ||
        !isAtOrAfter(record.stimulusStartedAtIso, record.startedAtIso) ||
        !isAtOrAfter(record.plannedEndAtIso, record.stimulusStartedAtIso) ||
        !isAtOrAfter(record.stimulusEndedAtIso, record.stimulusStartedAtIso)
      ) return false;
    } else if (record.exposureStatus === "terminated") {
      if (
        record.plannedEndAtIso === null || record.stimulusStartedAtIso === null ||
        record.stimulusEndedAtIso === null || record.terminationReason === null ||
        !TERMINATION_REASONS.has(record.terminationReason) ||
        record.trials.some((trial) => trial.status === "pending") ||
        !isAtOrAfter(record.stimulusStartedAtIso, record.startedAtIso) ||
        !isAtOrAfter(record.plannedEndAtIso, record.stimulusStartedAtIso) ||
        !isAtOrAfter(record.stimulusEndedAtIso, record.stimulusStartedAtIso)
      ) return false;
    } else {
      return false;
    }

    if (
      record.sleepStartedAtIso !== null && record.stimulusEndedAtIso !== null &&
      !isAtOrAfter(record.sleepStartedAtIso, record.stimulusEndedAtIso)
    ) return false;
  }

  if (finalStatus) {
    if (
      (record.conditionId === "control" && record.status !== "completed") ||
      (record.status === "terminated" && record.exposureStatus !== "terminated") ||
      (record.conditionId !== "control" &&
        record.exposureStatus !== "completed" && record.exposureStatus !== "terminated") ||
      record.trials.some((trial) => trial.status === "pending") ||
      !hasValidFinalTimeline(record)
    ) return false;
  } else if (!hasValidActiveTimeline(record)) {
    return false;
  }

  return true;
}

export function isStudySessionDraftV3(
  value: unknown,
  options: Pick<ValidationOptions, "allowReservedParticipantId"> = {},
): value is StudySessionRecordV3 {
  return isStudySessionRecordV3(value, { ...options, allowActive: true }) && value.status === "active";
}
