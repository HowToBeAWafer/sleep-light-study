import {
  FIXED_FIVE_SEQUENCE_VERSION,
  OVERNIGHT_V3_PROTOCOL_VERSION,
  V5_CONDITION_DETAILS,
  conditionForV5SequencePosition,
  isV5ConditionId,
  type V5SequencePosition,
} from "./protocol-v5.ts";
import type { StudySessionRecordV5 } from "./session-record.ts";
import { isStudySessionRecordV4 } from "./session-validation-v4.ts";

type ValidationOptions = {
  allowActive?: boolean;
  allowReservedParticipantId?: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isV5SequencePosition(value: unknown): value is V5SequencePosition {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5;
}

/**
 * Validate the Protocol v5 discriminants and visual settings, then reuse the
 * otherwise unchanged v4 timeline, questionnaire, device and sparse-attention
 * invariants through a non-mutating validation projection. Historical v4
 * records continue to be checked by their original validator and are never
 * converted or rewritten in storage.
 */
export function isStudySessionRecordV5(
  value: unknown,
  options: ValidationOptions = {},
): value is StudySessionRecordV5 {
  if (
    !isObject(value) ||
    value.schemaVersion !== 5 ||
    value.protocolVersion !== OVERNIGHT_V3_PROTOCOL_VERSION ||
    value.sequenceVersion !== FIXED_FIVE_SEQUENCE_VERSION ||
    !isV5ConditionId(value.conditionId) ||
    !isV5SequencePosition(value.sequencePosition) ||
    conditionForV5SequencePosition(value.sequencePosition) !== value.conditionId
  ) return false;

  const condition = V5_CONDITION_DETAILS[value.conditionId];
  if (
    typeof value.studyBuildVersion !== "string" ||
    !/^[A-Za-z0-9._+-]{1,80}$/.test(value.studyBuildVersion) ||
    value.conditionName !== condition.name ||
    value.stimulusColorHex !== condition.stimulusColorHex ||
    value.stimulusColorRgb !== condition.stimulusColorRgb ||
    value.attentionCrossColorHex !== condition.attentionCrossColorHex ||
    value.attentionCrossColorRgb !== condition.attentionCrossColorRgb
  ) return false;

  // The remaining record contract is intentionally identical to Protocol v4.
  // A fixed v4 discriminant/condition projection lets the mature strict
  // validator enforce it without modifying either the caller's object or the
  // immutable v4 validation rules.
  const validationProjection = {
    ...value,
    schemaVersion: 4,
    protocolVersion: "overnight-v2",
    sequenceVersion: "fixed-four-v1",
    sequencePosition: 1,
    conditionId: "dim-red",
    conditionName: "Dim Red",
    stimulusColorHex: "#660000",
    stimulusColorRgb: "102, 0, 0",
  };

  return isStudySessionRecordV4(validationProjection, options);
}

export function isStudySessionDraftV5(
  value: unknown,
  options: Pick<ValidationOptions, "allowReservedParticipantId"> = {},
): value is StudySessionRecordV5 {
  return isStudySessionRecordV5(value, { ...options, allowActive: true }) &&
    value.status === "active";
}
