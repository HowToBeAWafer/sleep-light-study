import {
  isKssScore,
  type FivePointScore,
  type KssScore,
  type YesNoPreferNotToAnswer,
} from "./protocol-v3.ts";

export const PROTOCOL_V4_VERSION = 4 as const;
export const OVERNIGHT_V2_PROTOCOL_VERSION = "overnight-v2" as const;
export const FIXED_SEQUENCE_VERSION = "fixed-four-v1" as const;
export const POST_EXPOSURE_QUESTIONNAIRE_VERSION = "post-exposure-kss-v1" as const;
export const MORNING_QUESTIONNAIRE_VERSION = "morning-study-v1" as const;

export const V4_CONDITION_ORDER = [
  "dim-red",
  "dim-blue",
  "bright-blue",
  "bright-red",
] as const;

export type V4ConditionId = (typeof V4_CONDITION_ORDER)[number];
export type SequencePosition = 1 | 2 | 3 | 4;

export const V4_SEQUENCE: ReadonlyArray<{
  position: SequencePosition;
  conditionId: V4ConditionId;
}> = V4_CONDITION_ORDER.map((conditionId, index) => ({
  position: (index + 1) as SequencePosition,
  conditionId,
}));

export type PostExposureSurvey = {
  questionnaireVersion: typeof POST_EXPOSURE_QUESTIONNAIRE_VERSION;
  answeredAtIso: string;
  sleepinessKss: KssScore;
};

export type MorningStudySurvey = {
  questionnaireVersion: typeof MORNING_QUESTIONNAIRE_VERSION;
  answeredAtIso: string;
  attemptedSleepTime: string;
  wakeTime: string;
  awakenings: number;
  sleepQuality: FivePointScore;
  restedness: FivePointScore;
  alertness: FivePointScore;
  unusualFactors: YesNoPreferNotToAnswer;
  unusualFactorsNote: string | null;
};

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const TIME_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const YES_NO_PREFER = new Set<unknown>(["yes", "no", "prefer-not-to-answer"]);
const POST_EXPOSURE_KEYS = ["questionnaireVersion", "answeredAtIso", "sleepinessKss"] as const;
const MORNING_KEYS = [
  "questionnaireVersion",
  "answeredAtIso",
  "attemptedSleepTime",
  "wakeTime",
  "awakenings",
  "sleepQuality",
  "restedness",
  "alertness",
  "unusualFactors",
  "unusualFactorsNote",
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_DATE_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isTimeOfDay(value: unknown): value is string {
  return typeof value === "string" && TIME_OF_DAY_PATTERN.test(value);
}

function isFivePointScore(value: unknown): value is FivePointScore {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5;
}

export function isV4ConditionId(value: unknown): value is V4ConditionId {
  return typeof value === "string" && (V4_CONDITION_ORDER as readonly string[]).includes(value);
}

export function conditionForSequencePosition(position: SequencePosition) {
  return V4_SEQUENCE[position - 1].conditionId;
}

export function sequencePositionForCondition(conditionId: V4ConditionId): SequencePosition {
  return (V4_CONDITION_ORDER.indexOf(conditionId) + 1) as SequencePosition;
}

export function isPostExposureSurvey(value: unknown): value is PostExposureSurvey {
  if (!isObject(value) || !hasExactKeys(value, POST_EXPOSURE_KEYS)) return false;
  return (
    value.questionnaireVersion === POST_EXPOSURE_QUESTIONNAIRE_VERSION &&
    isIsoDate(value.answeredAtIso) &&
    isKssScore(value.sleepinessKss)
  );
}

export function isMorningStudySurvey(value: unknown): value is MorningStudySurvey {
  if (!isObject(value) || !hasExactKeys(value, MORNING_KEYS)) return false;
  return (
    value.questionnaireVersion === MORNING_QUESTIONNAIRE_VERSION &&
    isIsoDate(value.answeredAtIso) &&
    isTimeOfDay(value.attemptedSleepTime) &&
    isTimeOfDay(value.wakeTime) &&
    Number.isInteger(value.awakenings) &&
    (value.awakenings as number) >= 0 &&
    (value.awakenings as number) <= 20 &&
    isFivePointScore(value.sleepQuality) &&
    isFivePointScore(value.restedness) &&
    isFivePointScore(value.alertness) &&
    YES_NO_PREFER.has(value.unusualFactors) &&
    (
      value.unusualFactors === "yes"
        ? typeof value.unusualFactorsNote === "string" &&
          value.unusualFactorsNote.trim().length >= 1 &&
          value.unusualFactorsNote.length <= 1000
        : value.unusualFactorsNote === null
    )
  );
}
