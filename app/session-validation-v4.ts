import { isDeviceInfo, isPreStudySurvey } from "./protocol-v3.ts";
import {
  FIXED_SEQUENCE_VERSION,
  OVERNIGHT_V2_PROTOCOL_VERSION,
  conditionForSequencePosition,
  isMorningStudySurvey,
  isPostExposureSurvey,
  isV4ConditionId,
  type SequencePosition,
} from "./protocol-v4.ts";
import type {
  EnvironmentEvent,
  FalseClickRecord,
  PauseRecord,
  PlannedTrial,
  StudySessionRecordV4,
  TrialRecord,
} from "./session-record";

const UUID_CANONICAL_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
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
  "dim-red": { name: "Dim Red", hex: "#660000", rgb: "102, 0, 0" },
  "dim-blue": { name: "Dim Blue", hex: "#000066", rgb: "0, 0, 102" },
  "bright-blue": { name: "Bright Blue", hex: "#0000ff", rgb: "0, 0, 255" },
  "bright-red": { name: "Bright Red", hex: "#ff0000", rgb: "255, 0, 0" },
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

function isSequencePosition(value: unknown): value is SequencePosition {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 4;
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

  const appeared = trial.appearedElapsedMs !== null && trial.appearedAtIso !== null;
  const notAppeared = trial.appearedElapsedMs === null && trial.appearedAtIso === null;
  if (!appeared && !notAppeared) return false;
  if (trial.status === "hit") {
    return appeared &&
      trial.clickedElapsedMs !== null &&
      trial.clickedAtIso !== null &&
      trial.reactionTimeMs !== null &&
      (trial.reactionTimeMs as number) <= 1800 &&
      trial.inputMethod !== null &&
      (trial.clickedElapsedMs as number) >= (trial.appearedElapsedMs as number) &&
      trial.reactionTimeMs === (trial.clickedElapsedMs as number) - (trial.appearedElapsedMs as number) &&
      isAtOrAfter(trial.clickedAtIso as string, trial.appearedAtIso as string);
  }
  const noResponse = trial.clickedElapsedMs === null && trial.clickedAtIso === null &&
    trial.reactionTimeMs === null && trial.inputMethod === null &&
    trial.clickXPercent === null && trial.clickYPercent === null;
  if (!noResponse) return false;
  if (trial.status === "pending") return true;
  if (trial.status === "missed") return appeared;
  if (trial.status === "omitted") return notAppeared;
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

function hasValidTrialLinks(value: StudySessionRecordV4) {
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

function hasConsistentDeviceChange(value: StudySessionRecordV4) {
  const afterWaking = value.deviceInfo.afterWaking;
  if (afterWaking === null) return value.deviceInfo.deviceChanged === null;
  return value.deviceInfo.deviceChanged ===
    (afterWaking.confirmedCategory !== value.deviceInfo.beforeSleep.confirmedCategory);
}

function hasValidActiveTimeline(value: StudySessionRecordV4) {
  if (value.endedAtIso !== null || value.assessmentCompletedAtIso !== null) return false;
  if (value.postExposureSurvey === null) {
    return value.sleepStartedAtIso === null &&
      value.morningReturnedAtIso === null &&
      value.morningSurvey === null &&
      value.deviceInfo.afterWaking === null &&
      value.deviceInfo.deviceChanged === null;
  }
  if (
    value.stimulusEndedAtIso === null ||
    !isAtOrAfter(value.postExposureSurvey.answeredAtIso, value.stimulusEndedAtIso)
  ) return false;
  if (value.sleepStartedAtIso === null) {
    return value.morningReturnedAtIso === null &&
      value.morningSurvey === null &&
      value.deviceInfo.afterWaking === null &&
      value.deviceInfo.deviceChanged === null;
  }
  if (!isAtOrAfter(value.sleepStartedAtIso, value.postExposureSurvey.answeredAtIso)) return false;
  if (value.morningReturnedAtIso === null) {
    return value.morningSurvey === null &&
      value.deviceInfo.afterWaking === null &&
      value.deviceInfo.deviceChanged === null;
  }
  if (!isAtOrAfter(value.morningReturnedAtIso, value.sleepStartedAtIso)) return false;
  if (value.deviceInfo.afterWaking === null || value.deviceInfo.deviceChanged === null) return false;
  return value.morningSurvey === null ||
    isAtOrAfter(value.morningSurvey.answeredAtIso, value.morningReturnedAtIso);
}

function hasValidFinalTimeline(value: StudySessionRecordV4) {
  if (
    value.stimulusEndedAtIso === null ||
    value.postExposureSurvey === null ||
    value.sleepStartedAtIso === null ||
    value.morningReturnedAtIso === null ||
    value.morningSurvey === null ||
    value.deviceInfo.afterWaking === null ||
    value.deviceInfo.deviceChanged === null ||
    value.assessmentCompletedAtIso === null ||
    value.endedAtIso === null
  ) return false;
  return isAtOrAfter(value.postExposureSurvey.answeredAtIso, value.stimulusEndedAtIso) &&
    isAtOrAfter(value.sleepStartedAtIso, value.postExposureSurvey.answeredAtIso) &&
    isAtOrAfter(value.morningReturnedAtIso, value.sleepStartedAtIso) &&
    isAtOrAfter(value.morningSurvey.answeredAtIso, value.morningReturnedAtIso) &&
    isAtOrAfter(value.assessmentCompletedAtIso, value.morningSurvey.answeredAtIso) &&
    isAtOrAfter(value.endedAtIso, value.assessmentCompletedAtIso);
}

export function isStudySessionRecordV4(
  value: unknown,
  options: ValidationOptions = {},
): value is StudySessionRecordV4 {
  if (!isObject(value) || value.schemaVersion !== 4 || !isV4ConditionId(value.conditionId)) return false;
  if (Object.hasOwn(value, "postSurvey") || Object.hasOwn(value, "reactionTest")) return false;
  if (!isSequencePosition(value.sequencePosition)) return false;
  const condition = CONDITION_DETAILS[value.conditionId];
  const participantId = typeof value.participantId === "string" ? value.participantId : "";
  const finalStatus = value.status === "completed" || value.status === "terminated";
  const reserved = participantId.toLowerCase() === "test" || participantId.toLowerCase() === "admin";

  if (
    value.protocolVersion !== OVERNIGHT_V2_PROTOCOL_VERSION ||
    value.sequenceVersion !== FIXED_SEQUENCE_VERSION ||
    conditionForSequencePosition(value.sequencePosition) !== value.conditionId ||
    value.attentionProtocolVersion !== "sparse-4-50-70-v1" ||
    typeof value.sessionId !== "string" || !UUID_CANONICAL_PATTERN.test(value.sessionId) ||
    typeof value.participantProfileId !== "string" || !UUID_CANONICAL_PATTERN.test(value.participantProfileId) ||
    typeof value.studyBuildVersion !== "string" ||
    value.studyBuildVersion.length < 1 || value.studyBuildVersion.length > 80 ||
    participantId !== participantId.trim() || participantId.length < 1 || participantId.length > 80 ||
    /[\u0000-\u001f\u007f]/.test(participantId) ||
    (!options.allowReservedParticipantId && reserved) ||
    value.conditionName !== condition.name ||
    value.stimulusColorHex !== condition.hex ||
    value.stimulusColorRgb !== condition.rgb ||
    value.plannedDurationMs !== 300000 ||
    !isNullableIsoDate(value.plannedEndAtIso) ||
    !isNonNegativeNumber(value.actualDurationMs) || value.actualDurationMs > value.plannedDurationMs ||
    !isNonNegativeNumber(value.wallClockDurationMs) ||
    value.wallClockDurationMs < value.actualDurationMs ||
    !isNonNegativeNumber(value.totalPausedDurationMs) ||
    value.totalPausedDurationMs > value.wallClockDurationMs ||
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
    (value.exposureStatus !== "not-started" &&
      value.exposureStatus !== "in-progress" &&
      value.exposureStatus !== "completed" &&
      value.exposureStatus !== "terminated") ||
    typeof value.fullscreenAtStart !== "boolean" ||
    typeof value.fullscreenRequestFailed !== "boolean" ||
    !isObject(value.deviceInfo) ||
    !isDeviceInfo(value.deviceInfo.beforeSleep) ||
    !(value.deviceInfo.afterWaking === null || isDeviceInfo(value.deviceInfo.afterWaking)) ||
    !(value.deviceInfo.deviceChanged === null || typeof value.deviceInfo.deviceChanged === "boolean") ||
    !isPreStudySurvey(value.preSurvey) ||
    value.preSurvey.answeredAtIso !== value.startedAtIso ||
    !(value.postExposureSurvey === null || isPostExposureSurvey(value.postExposureSurvey)) ||
    !(value.morningSurvey === null || isMorningStudySurvey(value.morningSurvey)) ||
    !Array.isArray(value.trialPlan) || !value.trialPlan.every(isPlannedTrial) ||
    !Array.isArray(value.trials) || !value.trials.every(isTrial) ||
    !Array.isArray(value.falseClicks) || value.falseClicks.length > 10000 || !value.falseClicks.every(isFalseClick) ||
    !Array.isArray(value.pauses) || value.pauses.length > 1000 || !value.pauses.every(isPause) ||
    !Array.isArray(value.environmentEvents) ||
    value.environmentEvents.length > 1000 ||
    !value.environmentEvents.every(isEnvironmentEvent)
  ) return false;

  const record = value as unknown as StudySessionRecordV4;
  if (!hasValidSparseTrialSchedule(record.trialPlan) ||
      !hasValidTrialLinks(record) ||
      !hasConsistentDeviceChange(record)) return false;

  if (record.exposureStatus === "not-started") {
    if (
      finalStatus || record.plannedEndAtIso !== null || record.stimulusStartedAtIso !== null ||
      record.stimulusEndedAtIso !== null || record.actualDurationMs !== 0 ||
      record.wallClockDurationMs !== 0 || record.totalPausedDurationMs !== 0 ||
      record.terminationReason !== null || record.trials.length !== 0 ||
      record.falseClicks.length !== 0 || record.pauses.length !== 0 ||
      record.environmentEvents.length !== 0 || record.fullscreenAtStart
    ) return false;
  } else if (record.exposureStatus === "in-progress") {
    if (
      finalStatus || record.plannedEndAtIso === null || record.stimulusStartedAtIso === null ||
      record.stimulusEndedAtIso !== null || record.terminationReason !== null ||
      !isAtOrAfter(record.stimulusStartedAtIso, record.startedAtIso) ||
      !isAtOrAfter(record.plannedEndAtIso, record.stimulusStartedAtIso) ||
      record.trials.filter((trial) => trial.status === "pending").length > 1
    ) return false;
  } else if (record.exposureStatus === "completed") {
    if (
      record.plannedEndAtIso === null || record.stimulusStartedAtIso === null ||
      record.stimulusEndedAtIso === null || record.terminationReason !== null ||
      record.trials.length !== 4 ||
      record.trials.some((trial) => trial.status === "pending" || trial.status === "cancelled") ||
      !isAtOrAfter(record.stimulusEndedAtIso, record.stimulusStartedAtIso)
    ) return false;
  } else if (
    record.plannedEndAtIso === null || record.stimulusStartedAtIso === null ||
    record.stimulusEndedAtIso === null || record.terminationReason === null ||
    !TERMINATION_REASONS.has(record.terminationReason) ||
    record.trials.some((trial) => trial.status === "pending") ||
    !isAtOrAfter(record.stimulusEndedAtIso, record.stimulusStartedAtIso)
  ) return false;

  if (finalStatus) {
    if (
      (record.status === "completed" && record.exposureStatus !== "completed") ||
      (record.status === "terminated" && record.exposureStatus !== "terminated") ||
      record.trials.some((trial) => trial.status === "pending") ||
      !hasValidFinalTimeline(record)
    ) return false;
  } else if (!hasValidActiveTimeline(record)) {
    return false;
  }
  return true;
}

export function isStudySessionDraftV4(
  value: unknown,
  options: Pick<ValidationOptions, "allowReservedParticipantId"> = {},
): value is StudySessionRecordV4 {
  return isStudySessionRecordV4(value, { ...options, allowActive: true }) && value.status === "active";
}
