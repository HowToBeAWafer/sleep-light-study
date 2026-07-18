export const PROTOCOL_V3_VERSION = 3 as const;

export const PRE_STUDY_QUESTIONNAIRE_VERSION = "pre-study-v1" as const;
export const POST_STUDY_QUESTIONNAIRE_VERSION = "post-study-v1" as const;
export const REACTION_TEST_PROTOCOL_VERSION = "relaxed-reaction-test-v1" as const;
export const DEVICE_DETECTION_VERSION = "capabilities-v1" as const;

export const CONDITION_IDS = [
  "bright-red",
  "dim-red",
  "bright-blue",
  "dim-blue",
  "control",
] as const;

export type ConditionId = (typeof CONDITION_IDS)[number];

export const KSS_OPTIONS = [
  { value: 1, label: "Extremely alert" },
  { value: 2, label: "Very alert" },
  { value: 3, label: "Alert" },
  { value: 4, label: "Rather alert" },
  { value: 5, label: "Neither alert nor sleepy" },
  { value: 6, label: "Some signs of sleepiness" },
  { value: 7, label: "Sleepy, but no effort to keep awake" },
  { value: 8, label: "Sleepy, some effort to keep awake" },
  {
    value: 9,
    label: "Very sleepy, great effort keeping awake, fighting sleep",
  },
] as const;

export type KssScore = (typeof KSS_OPTIONS)[number]["value"];

export const DEVICE_CATEGORIES = ["phone", "tablet", "computer"] as const;
export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];

export type DeviceCapabilitySnapshot = {
  maxTouchPoints: number;
  coarsePointer: boolean;
  finePointer: boolean;
  hoverCapable: boolean;
  viewportWidth: number;
  viewportHeight: number;
  screenWidth: number;
  screenHeight: number;
};

export type DeviceInfo = {
  detectionVersion: typeof DEVICE_DETECTION_VERSION;
  detectedCategory: DeviceCategory;
  confirmedCategory: DeviceCategory;
  confirmationSource: "automatic" | "participant-correction";
  touchCapable: boolean;
  coarsePointer: boolean;
  finePointer: boolean;
  hoverCapable: boolean;
};

export type YesNoPreferNotToAnswer = "yes" | "no" | "prefer-not-to-answer";
export type FivePointScore = 1 | 2 | 3 | 4 | 5;
export type SleepLightColor =
  | "warm-white-yellow"
  | "cool-white"
  | "red"
  | "blue"
  | "green"
  | "multicolor"
  | "other"
  | "unsure";
export type SleepTemperature =
  | "cold"
  | "slightly-cold"
  | "comfortable"
  | "slightly-warm"
  | "hot"
  | "prefer-not-to-answer";
export type SleepNoiseLevel =
  | "none"
  | "low"
  | "moderate"
  | "high"
  | "prefer-not-to-answer";

export type PreStudySurvey = {
  questionnaireVersion: typeof PRE_STUDY_QUESTIONNAIRE_VERSION;
  answeredAtIso: string;
  previousNightSleepTime: string;
  sleepinessKss: KssScore;
  screenUseBeforeSleep: YesNoPreferNotToAnswer;
  screenUseMinutes: number | null;
  sleepsWithLight: YesNoPreferNotToAnswer;
  sleepLightColor: SleepLightColor | null;
  sleepTemperature: SleepTemperature;
  sleepAidMedicationOrSupplement: YesNoPreferNotToAnswer;
  morningRestedness: FivePointScore;
  previousNightSleepQuality: FivePointScore;
  caffeineInPast8Hours: YesNoPreferNotToAnswer;
  musicBeforeSleep: YesNoPreferNotToAnswer;
  sleepNoiseLevel: SleepNoiseLevel;
  vigorousExerciseInPast12Hours: YesNoPreferNotToAnswer;
};

export type PreStudySurveyDraft = {
  questionnaireVersion: typeof PRE_STUDY_QUESTIONNAIRE_VERSION;
  answeredAtIso: null;
  previousNightSleepTime: string | null;
  sleepinessKss: KssScore | null;
  screenUseBeforeSleep: YesNoPreferNotToAnswer | null;
  screenUseMinutes: number | null;
  sleepsWithLight: YesNoPreferNotToAnswer | null;
  sleepLightColor: SleepLightColor | null;
  sleepTemperature: SleepTemperature | null;
  sleepAidMedicationOrSupplement: YesNoPreferNotToAnswer | null;
  morningRestedness: FivePointScore | null;
  previousNightSleepQuality: FivePointScore | null;
  caffeineInPast8Hours: YesNoPreferNotToAnswer | null;
  musicBeforeSleep: YesNoPreferNotToAnswer | null;
  sleepNoiseLevel: SleepNoiseLevel | null;
  vigorousExerciseInPast12Hours: YesNoPreferNotToAnswer | null;
};

export type PostStudySurvey = {
  questionnaireVersion: typeof POST_STUDY_QUESTIONNAIRE_VERSION;
  answeredAtIso: string;
  sleepinessKss: KssScore;
};

export type ReactionInputMethod = "pointer" | "space" | "enter";
export type ReactionTrialStatus = "valid" | "false-start" | "missed";

export type ReactionTrialRecord = {
  trialNumber: 1 | 2 | 3;
  status: ReactionTrialStatus;
  startedAtIso: string;
  stimulusDelayMs: number;
  stimulusShownAtIso: string | null;
  respondedAtIso: string | null;
  reactionTimeMs: number | null;
  inputMethod: ReactionInputMethod | null;
};

export type ReactionTestRecord = {
  protocolVersion: typeof REACTION_TEST_PROTOCOL_VERSION;
  startedAtIso: string;
  completedAtIso: string;
  /** The three valid formal responses. Invalid attempts are retained as counts below. */
  trials: [ReactionTrialRecord, ReactionTrialRecord, ReactionTrialRecord];
  validCount: 3;
  averageReactionTimeMs: number;
  medianReactionTimeMs: number;
  falseStartCount: number;
  missCount: number;
};

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const TIME_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const YES_NO_PREFER = new Set<unknown>(["yes", "no", "prefer-not-to-answer"]);
const LIGHT_COLORS = new Set<unknown>([
  "warm-white-yellow",
  "cool-white",
  "red",
  "blue",
  "green",
  "multicolor",
  "other",
  "unsure",
]);
const TEMPERATURES = new Set<unknown>([
  "cold",
  "slightly-cold",
  "comfortable",
  "slightly-warm",
  "hot",
  "prefer-not-to-answer",
]);
const NOISE_LEVELS = new Set<unknown>([
  "none",
  "low",
  "moderate",
  "high",
  "prefer-not-to-answer",
]);
const REACTION_INPUT_METHODS = new Set<unknown>(["pointer", "space", "enter"]);

const DEVICE_INFO_KEYS = [
  "detectionVersion",
  "detectedCategory",
  "confirmedCategory",
  "confirmationSource",
  "touchCapable",
  "coarsePointer",
  "finePointer",
  "hoverCapable",
] as const;

const PRE_STUDY_KEYS = [
  "questionnaireVersion",
  "answeredAtIso",
  "previousNightSleepTime",
  "sleepinessKss",
  "screenUseBeforeSleep",
  "screenUseMinutes",
  "sleepsWithLight",
  "sleepLightColor",
  "sleepTemperature",
  "sleepAidMedicationOrSupplement",
  "morningRestedness",
  "previousNightSleepQuality",
  "caffeineInPast8Hours",
  "musicBeforeSleep",
  "sleepNoiseLevel",
  "vigorousExerciseInPast12Hours",
] as const;

const POST_STUDY_KEYS = ["questionnaireVersion", "answeredAtIso", "sleepinessKss"] as const;

const REACTION_TRIAL_KEYS = [
  "trialNumber",
  "status",
  "startedAtIso",
  "stimulusDelayMs",
  "stimulusShownAtIso",
  "respondedAtIso",
  "reactionTimeMs",
  "inputMethod",
] as const;

const REACTION_TEST_KEYS = [
  "protocolVersion",
  "startedAtIso",
  "completedAtIso",
  "trials",
  "validCount",
  "averageReactionTimeMs",
  "medianReactionTimeMs",
  "falseStartCount",
  "missCount",
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
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

function isYesNoPrefer(value: unknown): value is YesNoPreferNotToAnswer {
  return YES_NO_PREFER.has(value);
}

function isFivePointScore(value: unknown): value is FivePointScore {
  return isIntegerInRange(value, 1, 5);
}

function isLightColor(value: unknown): value is SleepLightColor {
  return LIGHT_COLORS.has(value);
}

function isTemperature(value: unknown): value is SleepTemperature {
  return TEMPERATURES.has(value);
}

function isNoiseLevel(value: unknown): value is SleepNoiseLevel {
  return NOISE_LEVELS.has(value);
}

function isValidScreenUsePair(response: unknown, minutes: unknown) {
  if (!isYesNoPrefer(response)) return false;
  if (response === "yes") return isIntegerInRange(minutes, 1, 120);
  if (response === "no") return minutes === 0;
  return minutes === null;
}

function isValidLightPair(response: unknown, color: unknown) {
  if (!isYesNoPrefer(response)) return false;
  return response === "yes" ? isLightColor(color) : color === null;
}

export function isConditionId(value: unknown): value is ConditionId {
  return typeof value === "string" && (CONDITION_IDS as readonly string[]).includes(value);
}

export function isKssScore(value: unknown): value is KssScore {
  return isIntegerInRange(value, 1, 9);
}

export function isDeviceCategory(value: unknown): value is DeviceCategory {
  return typeof value === "string" && (DEVICE_CATEGORIES as readonly string[]).includes(value);
}

export function isDeviceCapabilitySnapshot(value: unknown): value is DeviceCapabilitySnapshot {
  if (!isObject(value)) return false;
  const expectedKeys = [
    "maxTouchPoints",
    "coarsePointer",
    "finePointer",
    "hoverCapable",
    "viewportWidth",
    "viewportHeight",
    "screenWidth",
    "screenHeight",
  ] as const;
  return (
    hasExactKeys(value, expectedKeys) &&
    isIntegerInRange(value.maxTouchPoints, 0, 100) &&
    typeof value.coarsePointer === "boolean" &&
    typeof value.finePointer === "boolean" &&
    typeof value.hoverCapable === "boolean" &&
    isIntegerInRange(value.viewportWidth, 0, 100000) &&
    isIntegerInRange(value.viewportHeight, 0, 100000) &&
    isIntegerInRange(value.screenWidth, 0, 100000) &&
    isIntegerInRange(value.screenHeight, 0, 100000)
  );
}

export function detectDeviceCategory(capabilities: DeviceCapabilitySnapshot): DeviceCategory {
  const touchCapable = capabilities.maxTouchPoints > 0 || capabilities.coarsePointer;
  if (!touchCapable) return "computer";

  const screenShortEdge = Math.min(capabilities.screenWidth, capabilities.screenHeight);
  const viewportShortEdge = Math.min(capabilities.viewportWidth, capabilities.viewportHeight);
  const shortEdge = screenShortEdge > 0 ? screenShortEdge : viewportShortEdge;

  if (shortEdge > 0 && shortEdge < 600) return "phone";
  if (capabilities.coarsePointer) return "tablet";
  if (capabilities.finePointer && capabilities.hoverCapable) return "computer";
  return "tablet";
}

export function detectBrowserDeviceInfo(): DeviceInfo {
  const browserAvailable = typeof window !== "undefined" && typeof navigator !== "undefined";
  const mediaMatches = (query: string) =>
    browserAvailable && typeof window.matchMedia === "function" && window.matchMedia(query).matches;

  const capabilities: DeviceCapabilitySnapshot = {
    maxTouchPoints: browserAvailable ? Math.max(0, navigator.maxTouchPoints || 0) : 0,
    coarsePointer: mediaMatches("(pointer: coarse)"),
    finePointer: mediaMatches("(pointer: fine)"),
    hoverCapable: mediaMatches("(hover: hover)"),
    viewportWidth: browserAvailable ? Math.max(0, window.innerWidth) : 0,
    viewportHeight: browserAvailable ? Math.max(0, window.innerHeight) : 0,
    screenWidth: browserAvailable ? Math.max(0, window.screen?.width ?? 0) : 0,
    screenHeight: browserAvailable ? Math.max(0, window.screen?.height ?? 0) : 0,
  };
  const detectedCategory = detectDeviceCategory(capabilities);

  return {
    detectionVersion: DEVICE_DETECTION_VERSION,
    detectedCategory,
    confirmedCategory: detectedCategory,
    confirmationSource: "automatic",
    touchCapable: capabilities.maxTouchPoints > 0 || capabilities.coarsePointer,
    coarsePointer: capabilities.coarsePointer,
    finePointer: capabilities.finePointer,
    hoverCapable: capabilities.hoverCapable,
  };
}

export function confirmDeviceCategory(
  deviceInfo: DeviceInfo,
  confirmedCategory: DeviceCategory,
): DeviceInfo {
  return {
    ...deviceInfo,
    confirmedCategory,
    confirmationSource:
      confirmedCategory === deviceInfo.detectedCategory ? "automatic" : "participant-correction",
  };
}

export function createDefaultPreStudySurvey(): PreStudySurveyDraft {
  return {
    questionnaireVersion: PRE_STUDY_QUESTIONNAIRE_VERSION,
    answeredAtIso: null,
    previousNightSleepTime: null,
    sleepinessKss: null,
    screenUseBeforeSleep: null,
    screenUseMinutes: null,
    sleepsWithLight: null,
    sleepLightColor: null,
    sleepTemperature: null,
    sleepAidMedicationOrSupplement: null,
    morningRestedness: null,
    previousNightSleepQuality: null,
    caffeineInPast8Hours: null,
    musicBeforeSleep: null,
    sleepNoiseLevel: null,
    vigorousExerciseInPast12Hours: null,
  };
}

export function isDeviceInfo(value: unknown): value is DeviceInfo {
  if (!isObject(value) || !hasExactKeys(value, DEVICE_INFO_KEYS)) return false;
  return (
    value.detectionVersion === DEVICE_DETECTION_VERSION &&
    isDeviceCategory(value.detectedCategory) &&
    isDeviceCategory(value.confirmedCategory) &&
    (value.confirmationSource === "automatic" ||
      value.confirmationSource === "participant-correction") &&
    (value.confirmationSource !== "automatic" ||
      value.confirmedCategory === value.detectedCategory) &&
    (value.confirmationSource !== "participant-correction" ||
      value.confirmedCategory !== value.detectedCategory) &&
    typeof value.touchCapable === "boolean" &&
    typeof value.coarsePointer === "boolean" &&
    typeof value.finePointer === "boolean" &&
    typeof value.hoverCapable === "boolean"
  );
}

export function isPreStudySurveyDraft(value: unknown): value is PreStudySurveyDraft {
  if (!isObject(value) || !hasExactKeys(value, PRE_STUDY_KEYS)) return false;
  return (
    value.questionnaireVersion === PRE_STUDY_QUESTIONNAIRE_VERSION &&
    value.answeredAtIso === null &&
    (value.previousNightSleepTime === null || isTimeOfDay(value.previousNightSleepTime)) &&
    (value.sleepinessKss === null || isKssScore(value.sleepinessKss)) &&
    (value.screenUseBeforeSleep === null || isYesNoPrefer(value.screenUseBeforeSleep)) &&
    (value.screenUseMinutes === null || isIntegerInRange(value.screenUseMinutes, 0, 120)) &&
    (value.sleepsWithLight === null || isYesNoPrefer(value.sleepsWithLight)) &&
    (value.sleepLightColor === null || isLightColor(value.sleepLightColor)) &&
    (value.sleepTemperature === null || isTemperature(value.sleepTemperature)) &&
    (value.sleepAidMedicationOrSupplement === null ||
      isYesNoPrefer(value.sleepAidMedicationOrSupplement)) &&
    (value.morningRestedness === null || isFivePointScore(value.morningRestedness)) &&
    (value.previousNightSleepQuality === null ||
      isFivePointScore(value.previousNightSleepQuality)) &&
    (value.caffeineInPast8Hours === null || isYesNoPrefer(value.caffeineInPast8Hours)) &&
    (value.musicBeforeSleep === null || isYesNoPrefer(value.musicBeforeSleep)) &&
    (value.sleepNoiseLevel === null || isNoiseLevel(value.sleepNoiseLevel)) &&
    (value.vigorousExerciseInPast12Hours === null ||
      isYesNoPrefer(value.vigorousExerciseInPast12Hours))
  );
}

export function isPreStudySurvey(value: unknown): value is PreStudySurvey {
  if (!isObject(value) || !hasExactKeys(value, PRE_STUDY_KEYS)) return false;
  return (
    value.questionnaireVersion === PRE_STUDY_QUESTIONNAIRE_VERSION &&
    isIsoDate(value.answeredAtIso) &&
    isTimeOfDay(value.previousNightSleepTime) &&
    isKssScore(value.sleepinessKss) &&
    isValidScreenUsePair(value.screenUseBeforeSleep, value.screenUseMinutes) &&
    isValidLightPair(value.sleepsWithLight, value.sleepLightColor) &&
    isTemperature(value.sleepTemperature) &&
    isYesNoPrefer(value.sleepAidMedicationOrSupplement) &&
    isFivePointScore(value.morningRestedness) &&
    isFivePointScore(value.previousNightSleepQuality) &&
    isYesNoPrefer(value.caffeineInPast8Hours) &&
    isYesNoPrefer(value.musicBeforeSleep) &&
    isNoiseLevel(value.sleepNoiseLevel) &&
    isYesNoPrefer(value.vigorousExerciseInPast12Hours)
  );
}

export function isPostStudySurvey(value: unknown): value is PostStudySurvey {
  if (!isObject(value) || !hasExactKeys(value, POST_STUDY_KEYS)) return false;
  return (
    value.questionnaireVersion === POST_STUDY_QUESTIONNAIRE_VERSION &&
    isIsoDate(value.answeredAtIso) &&
    isKssScore(value.sleepinessKss)
  );
}

export function isReactionTrialRecord(value: unknown): value is ReactionTrialRecord {
  if (!isObject(value) || !hasExactKeys(value, REACTION_TRIAL_KEYS)) return false;
  if (
    !isIntegerInRange(value.trialNumber, 1, 3) ||
    (value.status !== "valid" && value.status !== "false-start" && value.status !== "missed") ||
    !isIsoDate(value.startedAtIso) ||
    !isIntegerInRange(value.stimulusDelayMs, 500, 15000) ||
    !(value.stimulusShownAtIso === null || isIsoDate(value.stimulusShownAtIso)) ||
    !(value.respondedAtIso === null || isIsoDate(value.respondedAtIso)) ||
    !(value.reactionTimeMs === null || isFiniteNumber(value.reactionTimeMs)) ||
    !(value.inputMethod === null || REACTION_INPUT_METHODS.has(value.inputMethod))
  ) return false;

  const startedAt = Date.parse(value.startedAtIso);
  if (value.status === "valid") {
    if (
      value.stimulusShownAtIso === null ||
      value.respondedAtIso === null ||
      value.reactionTimeMs === null ||
      value.inputMethod === null ||
      value.reactionTimeMs < 0 ||
      value.reactionTimeMs > 2000
    ) return false;
    const stimulusAt = Date.parse(value.stimulusShownAtIso);
    const respondedAt = Date.parse(value.respondedAtIso);
    return stimulusAt >= startedAt && respondedAt >= stimulusAt;
  }

  if (value.status === "false-start") {
    return (
      value.stimulusShownAtIso === null &&
      value.respondedAtIso !== null &&
      Date.parse(value.respondedAtIso) >= startedAt &&
      value.reactionTimeMs === null &&
      value.inputMethod !== null
    );
  }

  return (
    (value.stimulusShownAtIso === null || Date.parse(value.stimulusShownAtIso) >= startedAt) &&
    value.respondedAtIso === null &&
    value.reactionTimeMs === null &&
    value.inputMethod === null
  );
}

export function isReactionTestRecord(value: unknown): value is ReactionTestRecord {
  if (!isObject(value) || !hasExactKeys(value, REACTION_TEST_KEYS)) return false;
  if (
    value.protocolVersion !== REACTION_TEST_PROTOCOL_VERSION ||
    !isIsoDate(value.startedAtIso) ||
    !isIsoDate(value.completedAtIso) ||
    Date.parse(value.completedAtIso) < Date.parse(value.startedAtIso) ||
    !Array.isArray(value.trials) ||
    value.trials.length !== 3 ||
    !value.trials.every(isReactionTrialRecord) ||
    value.validCount !== 3 ||
    !isFiniteNumber(value.averageReactionTimeMs) ||
    !isFiniteNumber(value.medianReactionTimeMs) ||
    !isIntegerInRange(value.falseStartCount, 0, 1000) ||
    !isIntegerInRange(value.missCount, 0, 1000)
  ) return false;

  const trials = value.trials as ReactionTrialRecord[];
  if (Date.parse(trials[0].startedAtIso) < Date.parse(value.startedAtIso)) return false;
  for (let index = 0; index < trials.length; index += 1) {
    const trial = trials[index];
    if (trial.trialNumber !== index + 1 || trial.status !== "valid") return false;
    if (index > 0) {
      const previous = trials[index - 1];
      const previousEventAt = previous.respondedAtIso ?? previous.stimulusShownAtIso;
      if (previousEventAt === null) return false;
      if (Date.parse(trial.startedAtIso) < Date.parse(previousEventAt)) return false;
    }
  }

  const finalTrial = trials.at(-1);
  const finalTrialEventAt = finalTrial?.respondedAtIso ?? finalTrial?.stimulusShownAtIso ?? null;
  if (finalTrialEventAt === null || Date.parse(finalTrialEventAt) > Date.parse(value.completedAtIso)) return false;

  const validReactionTimes = trials
    .filter((trial) => trial.status === "valid")
    .map((trial) => trial.reactionTimeMs as number)
    .sort((left, right) => left - right);
  if (value.validCount !== validReactionTimes.length) return false;

  const calculatedAverage =
    validReactionTimes.reduce((total, reactionTime) => total + reactionTime, 0) /
    validReactionTimes.length;
  const middleIndex = Math.floor(validReactionTimes.length / 2);
  const calculatedMedian =
    validReactionTimes.length % 2 === 1
      ? validReactionTimes[middleIndex]
      : (validReactionTimes[middleIndex - 1] + validReactionTimes[middleIndex]) / 2;
  return (
    Math.abs(calculatedAverage - value.averageReactionTimeMs) <= 0.5 &&
    Math.abs(calculatedMedian - value.medianReactionTimeMs) <= 0.5
  );
}
