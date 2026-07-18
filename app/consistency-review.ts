import { CONDITION_IDS, type ConditionId, type PreStudySurvey } from "./protocol-v3.ts";
import type { StudySessionRecordV3 } from "./session-record";

/**
 * Stable machine-readable keys used by the administrator dashboard. Keep these
 * keys unchanged when the wording shown to researchers is revised.
 */
export const CONSISTENCY_REVIEW_REASON_LABELS = {
  sleep_time_spread: {
    en: "Reported sleep times span more than 90 minutes.",
    zh: "报告的入睡时间跨度超过 90 分钟。",
  },
  temperature_spread: {
    en: "Sleep-environment temperature differs by more than one category.",
    zh: "睡眠环境温度相差超过一个等级。",
  },
  noise_spread: {
    en: "Sleep-environment noise differs by more than one category.",
    zh: "睡眠环境噪音相差超过一个等级。",
  },
  sleep_light_use_changed: {
    en: "Use of a sleep light changed between sessions.",
    zh: "不同实验之间的睡眠开灯情况发生了变化。",
  },
  sleep_light_color_changed: {
    en: "The reported sleep-light color changed between sessions.",
    zh: "不同实验之间报告的睡眠灯颜色发生了变化。",
  },
  multiple_behavior_changes: {
    en: "At least two of screen use, music, caffeine, or sleep-aid use changed.",
    zh: "屏幕、音乐、咖啡因或睡眠辅助品中至少有两项发生了变化。",
  },
} as const;

export type ConsistencyReviewReasonKey = keyof typeof CONSISTENCY_REVIEW_REASON_LABELS;
export type BehaviorReviewKey =
  | "screen_use"
  | "music"
  | "caffeine"
  | "sleep_aid";

export type ConsistencyReviewReason = {
  key: ConsistencyReviewReasonKey;
  label: {
    en: string;
    zh: string;
  };
};

export type ConsistencyReview = {
  needsReview: boolean;
  completedSessionCount: number;
  reasons: ConsistencyReviewReason[];
  metrics: {
    sleepTimeSpreadMinutes: number | null;
    temperatureOrdinalSpread: number | null;
    noiseOrdinalSpread: number | null;
    changedBehaviors: BehaviorReviewKey[];
  };
};

export type ConditionHistorySummary = {
  completedConditions: ConditionId[];
  remainingConditions: ConditionId[];
  completedSessionCountByCondition: Record<ConditionId, number>;
};

export type CompletedV3Session = Pick<
  StudySessionRecordV3,
  | "schemaVersion"
  | "sessionId"
  | "participantId"
  | "conditionId"
  | "status"
  | "exposureStatus"
  | "preSurvey"
>;

export type ParticipantHistoryGroup = {
  /** First encountered spelling, retained for display. */
  participantName: string;
  /** Case-insensitive NFKC key suitable for joining a participant profile. */
  normalizedParticipantName: string;
  sessions: CompletedV3Session[];
  consistencyReview: ConsistencyReview;
  conditionHistory: ConditionHistorySummary;
};

const CONDITION_SET = new Set<string>(CONDITION_IDS);

const TEMPERATURE_ORDINAL = {
  cold: 0,
  "slightly-cold": 1,
  comfortable: 2,
  "slightly-warm": 3,
  hot: 4,
} as const;

const NOISE_ORDINAL = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * This deliberately accepts mixed historical input. Legacy records are left in
 * storage and ignored by the version-3 history analysis rather than rewritten.
 */
export function isCompletedV3Session(value: unknown): value is CompletedV3Session {
  if (!isObject(value) || !isObject(value.preSurvey)) return false;
  return (
    value.schemaVersion === 3 &&
    value.status === "completed" &&
    typeof value.sessionId === "string" &&
    typeof value.participantId === "string" &&
    value.participantId.trim().length > 0 &&
    typeof value.conditionId === "string" &&
    CONDITION_SET.has(value.conditionId) &&
    typeof value.exposureStatus === "string"
  );
}

export function normalizeParticipantName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

function completedV3Sessions(records: readonly unknown[]) {
  return records.filter(isCompletedV3Session);
}

function parseTimeOfDay(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Return the shortest arc containing all times on a 24-hour clock. */
export function circularTimeSpreadMinutes(values: readonly string[]) {
  const minutes = values
    .map(parseTimeOfDay)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  if (minutes.length < 2) return minutes.length === 1 ? 0 : null;

  let largestGap = 0;
  for (let index = 1; index < minutes.length; index += 1) {
    largestGap = Math.max(largestGap, minutes[index] - minutes[index - 1]);
  }
  largestGap = Math.max(largestGap, minutes[0] + 24 * 60 - minutes.at(-1)!);
  return 24 * 60 - largestGap;
}

function ordinalSpread<T extends string>(
  values: readonly T[],
  ordinals: Readonly<Partial<Record<T, number>>>,
) {
  const scores = values
    .map((value) => ordinals[value])
    .filter((value): value is number => typeof value === "number");
  if (scores.length < 2) return scores.length === 1 ? 0 : null;
  return Math.max(...scores) - Math.min(...scores);
}

function hasKnownYesNoChange(values: readonly unknown[]) {
  const knownValues = new Set(values.filter((value) => value === "yes" || value === "no"));
  return knownValues.size > 1;
}

function makeReason(key: ConsistencyReviewReasonKey): ConsistencyReviewReason {
  return { key, label: { ...CONSISTENCY_REVIEW_REASON_LABELS[key] } };
}

export function reviewParticipantConsistency(records: readonly unknown[]): ConsistencyReview {
  const sessions = completedV3Sessions(records);
  const surveys = sessions.map((session) => session.preSurvey);
  const sleepTimeSpreadMinutes = circularTimeSpreadMinutes(
    surveys.map((survey) => survey.previousNightSleepTime),
  );
  const temperatureOrdinalSpread = ordinalSpread(
    surveys.map((survey) => survey.sleepTemperature),
    TEMPERATURE_ORDINAL,
  );
  const noiseOrdinalSpread = ordinalSpread(
    surveys.map((survey) => survey.sleepNoiseLevel),
    NOISE_ORDINAL,
  );

  const changedBehaviors: BehaviorReviewKey[] = [];
  const behaviorFields: ReadonlyArray<[
    BehaviorReviewKey,
    keyof Pick<
      PreStudySurvey,
      | "screenUseBeforeSleep"
      | "musicBeforeSleep"
      | "caffeineInPast8Hours"
      | "sleepAidMedicationOrSupplement"
    >,
  ]> = [
    ["screen_use", "screenUseBeforeSleep"],
    ["music", "musicBeforeSleep"],
    ["caffeine", "caffeineInPast8Hours"],
    ["sleep_aid", "sleepAidMedicationOrSupplement"],
  ];
  for (const [key, field] of behaviorFields) {
    if (hasKnownYesNoChange(surveys.map((survey) => survey[field]))) {
      changedBehaviors.push(key);
    }
  }

  const reasons: ConsistencyReviewReason[] = [];
  if (sleepTimeSpreadMinutes !== null && sleepTimeSpreadMinutes > 90) {
    reasons.push(makeReason("sleep_time_spread"));
  }
  if (temperatureOrdinalSpread !== null && temperatureOrdinalSpread > 1) {
    reasons.push(makeReason("temperature_spread"));
  }
  if (noiseOrdinalSpread !== null && noiseOrdinalSpread > 1) {
    reasons.push(makeReason("noise_spread"));
  }
  if (hasKnownYesNoChange(surveys.map((survey) => survey.sleepsWithLight))) {
    reasons.push(makeReason("sleep_light_use_changed"));
  }

  const lightColors = new Set(
    surveys
      .filter((survey) => survey.sleepsWithLight === "yes")
      .map((survey) => survey.sleepLightColor)
      .filter((color): color is NonNullable<typeof color> => color !== null),
  );
  if (lightColors.size > 1) reasons.push(makeReason("sleep_light_color_changed"));
  if (changedBehaviors.length >= 2) reasons.push(makeReason("multiple_behavior_changes"));

  return {
    needsReview: reasons.length > 0,
    completedSessionCount: sessions.length,
    reasons,
    metrics: {
      sleepTimeSpreadMinutes,
      temperatureOrdinalSpread,
      noiseOrdinalSpread,
      changedBehaviors,
    },
  };
}

function isConditionSuccessfullyCompleted(session: CompletedV3Session) {
  return session.conditionId === "control"
    ? session.exposureStatus === "not-applicable"
    : session.exposureStatus === "completed";
}

/**
 * Summarize all five conditions without recommending or assigning a next one.
 * Repeated sessions remain visible in the per-condition counts.
 */
export function summarizeConditionHistory(records: readonly unknown[]): ConditionHistorySummary {
  const completedSessionCountByCondition = Object.fromEntries(
    CONDITION_IDS.map((conditionId) => [conditionId, 0]),
  ) as Record<ConditionId, number>;

  for (const session of completedV3Sessions(records)) {
    if (isConditionSuccessfullyCompleted(session)) {
      completedSessionCountByCondition[session.conditionId] += 1;
    }
  }

  const completedConditions = CONDITION_IDS.filter(
    (conditionId) => completedSessionCountByCondition[conditionId] > 0,
  );
  const remainingConditions = CONDITION_IDS.filter(
    (conditionId) => completedSessionCountByCondition[conditionId] === 0,
  );
  return {
    completedConditions: [...completedConditions],
    remainingConditions: [...remainingConditions],
    completedSessionCountByCondition,
  };
}

export function groupParticipantHistories(records: readonly unknown[]): ParticipantHistoryGroup[] {
  const groups = new Map<string, { participantName: string; sessions: CompletedV3Session[] }>();
  for (const session of completedV3Sessions(records)) {
    const normalizedParticipantName = normalizeParticipantName(session.participantId);
    const group = groups.get(normalizedParticipantName);
    if (group) {
      group.sessions.push(session);
    } else {
      groups.set(normalizedParticipantName, {
        participantName: session.participantId,
        sessions: [session],
      });
    }
  }

  return [...groups.entries()].map(([normalizedParticipantName, group]) => ({
    participantName: group.participantName,
    normalizedParticipantName,
    sessions: [...group.sessions],
    consistencyReview: reviewParticipantConsistency(group.sessions),
    conditionHistory: summarizeConditionHistory(group.sessions),
  }));
}
