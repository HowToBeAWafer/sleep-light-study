import type {
  MorningStudySurvey,
  PostExposureSurvey,
} from "./protocol-v4.ts";

export const PROTOCOL_V5_VERSION = 5 as const;
export const OVERNIGHT_V3_PROTOCOL_VERSION = "overnight-v3" as const;
export const FIXED_FIVE_SEQUENCE_VERSION = "fixed-five-v1" as const;

export const V5_CONDITION_ORDER = [
  "dim-red",
  "dim-blue",
  "black-control",
  "bright-blue",
  "bright-red",
] as const;

export type V5ConditionId = (typeof V5_CONDITION_ORDER)[number];
export type V5SequencePosition = 1 | 2 | 3 | 4 | 5;

export type V5ConditionDetails = {
  name: string;
  stimulusColorHex: string;
  stimulusColorRgb: string;
  attentionCrossColorHex: string;
  attentionCrossColorRgb: string;
};

export const V5_CONDITION_DETAILS: Readonly<Record<V5ConditionId, V5ConditionDetails>> = {
  "dim-red": {
    name: "Dim Red",
    stimulusColorHex: "#660000",
    stimulusColorRgb: "102, 0, 0",
    attentionCrossColorHex: "#000000",
    attentionCrossColorRgb: "0, 0, 0",
  },
  "dim-blue": {
    name: "Dim Blue",
    stimulusColorHex: "#000066",
    stimulusColorRgb: "0, 0, 102",
    attentionCrossColorHex: "#000000",
    attentionCrossColorRgb: "0, 0, 0",
  },
  "black-control": {
    name: "Black-screen Control",
    stimulusColorHex: "#000000",
    stimulusColorRgb: "0, 0, 0",
    attentionCrossColorHex: "#808080",
    attentionCrossColorRgb: "128, 128, 128",
  },
  "bright-blue": {
    name: "Bright Blue",
    stimulusColorHex: "#0000ff",
    stimulusColorRgb: "0, 0, 255",
    attentionCrossColorHex: "#000000",
    attentionCrossColorRgb: "0, 0, 0",
  },
  "bright-red": {
    name: "Bright Red",
    stimulusColorHex: "#ff0000",
    stimulusColorRgb: "255, 0, 0",
    attentionCrossColorHex: "#000000",
    attentionCrossColorRgb: "0, 0, 0",
  },
};

export const V5_SEQUENCE: ReadonlyArray<{
  position: V5SequencePosition;
  conditionId: V5ConditionId;
}> = V5_CONDITION_ORDER.map((conditionId, index) => ({
  position: (index + 1) as V5SequencePosition,
  conditionId,
}));

export function isV5ConditionId(value: unknown): value is V5ConditionId {
  return typeof value === "string" && (V5_CONDITION_ORDER as readonly string[]).includes(value);
}

export function conditionForV5SequencePosition(position: V5SequencePosition): V5ConditionId {
  return V5_SEQUENCE[position - 1].conditionId;
}

export function sequencePositionForV5Condition(
  conditionId: V5ConditionId,
): V5SequencePosition {
  return (V5_CONDITION_ORDER.indexOf(conditionId) + 1) as V5SequencePosition;
}

// The questionnaire contracts are unchanged from Protocol v4. Re-exporting
// their types here makes that intentional compatibility explicit without
// duplicating or weakening the historical v4 validators.
export type { MorningStudySurvey, PostExposureSurvey };
