import type { CsvSessionRecord } from "./study-data";
import type { StudySessionRecordV3 } from "./session-record";
import { isStudySessionDraftV3, isStudySessionRecordV3 } from "./session-validation.ts";
import {
  createRecoveryProof,
  isParticipantProfile,
  isValidParticipantName,
  normalizeParticipantName,
  normalizeRecoveryCode,
  type LocalParticipantProfile,
  type ParticipantProfile,
} from "./participant-profile.ts";

export {
  forgetLocalParticipantProfile,
  generateParticipantRecoveryCode,
  isValidParticipantName,
  isValidRecoveryCode,
  loadLocalParticipantProfile,
  loadLocalParticipantProfiles,
  normalizeParticipantName,
  normalizeRecoveryCode,
  rememberLocalParticipantProfile,
} from "./participant-profile.ts";
export type { LocalParticipantProfile, ParticipantProfile } from "./participant-profile.ts";

const SUPABASE_URL = "https://appircpepatqltaejrkn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4pl4bV07WR3DQmi0kkp_zA_7-ohxH2g";

export const ADMIN_EMAIL = "dkm26355@gmail.com";

export type LegacyStoredSessionRecord = CsvSessionRecord & {
  schemaVersion: 2;
  conditionId: "bright-red" | "dim-red" | "bright-blue" | "dim-blue";
  status: "completed" | "terminated";
  endedAtIso: string;
  trialPlan: Array<{
    trialNumber: number;
    plannedOnsetMs: number;
    crossXPercent: number;
    crossYPercent: number;
  }>;
};

export type StoredSessionRecord = LegacyStoredSessionRecord | StudySessionRecordV3;

export type RemoteStudySession = {
  record: StoredSessionRecord;
  createdAt: string;
};

export type RemoteStudySessionsResult = {
  sessions: RemoteStudySession[];
  invalidCount: number;
};

export type ParticipantProfileClaim = LocalParticipantProfile & {
  created: boolean;
};

export type CompletedProfileSession = {
  sessionId: string;
  conditionId: StudySessionRecordV3["conditionId"];
  completedAt: string;
  studyBuildVersion: string | null;
};

export type ParticipantProgress = {
  profile: ParticipantProfile;
  completedSessions: CompletedProfileSession[];
  completedConditionIds: StudySessionRecordV3["conditionId"][];
  remainingConditionIds: StudySessionRecordV3["conditionId"][];
};

export type ParticipantFeedbackType = "feedback" | "question";

export type ParticipantFeedbackReceipt = {
  feedbackId: string;
  createdAt: string;
};

export type AdminParticipantProfile = ParticipantProfile & {
  completedSessionCount: number;
  completedConditionIds: StudySessionRecordV3["conditionId"][];
  feedbackCount: number;
};

export type AdminParticipantFeedback = {
  feedbackId: string;
  profileId: string;
  displayName: string;
  sessionId: string;
  conditionId: StudySessionRecordV3["conditionId"];
  messageType: ParticipantFeedbackType;
  message: string;
  language: "en" | "zh";
  promptVersion: string;
  studyBuildVersion: string | null;
  createdAt: string;
};

export type PaginatedAdminResult<T> = {
  items: T[];
  total: number;
};

const CONDITION_DETAILS = {
  "bright-red": { name: "Bright Red", hex: "#ff0000", rgb: "255, 0, 0" },
  "dim-red": { name: "Dim Red", hex: "#660000", rgb: "102, 0, 0" },
  "bright-blue": { name: "Bright Blue", hex: "#0000ff", rgb: "0, 0, 255" },
  "dim-blue": { name: "Dim Blue", hex: "#000066", rgb: "0, 0, 102" },
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const INPUT_METHODS = new Set(["pointer", "space", "enter"]);
const TRIAL_STATUSES = new Set(["hit", "missed", "omitted", "cancelled"]);
const ENVIRONMENT_EVENT_TYPES = new Set([
  "visibility_hidden",
  "visibility_visible",
  "fullscreen_entered",
  "fullscreen_exited",
]);
const PROFILE_CONDITIONS = new Set<StudySessionRecordV3["conditionId"]>([
  "bright-red",
  "dim-red",
  "bright-blue",
  "dim-blue",
  "control",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || isNonNegativeNumber(value);
}

function isPercent(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 100;
}

function isNullablePercent(value: unknown): value is number | null {
  return value === null || isPercent(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function isNullableIsoDate(value: unknown): value is string | null {
  return value === null || isIsoDate(value);
}

function isPlannedTrial(value: unknown) {
  if (!isObject(value)) return false;
  return (
    Number.isInteger(value.trialNumber) &&
    (value.trialNumber as number) >= 1 &&
    (value.trialNumber as number) <= 20 &&
    Number.isInteger(value.plannedOnsetMs) &&
    (value.plannedOnsetMs as number) >= 0 &&
    (value.plannedOnsetMs as number) <= 300000 &&
    isPercent(value.crossXPercent) &&
    isPercent(value.crossYPercent)
  );
}

function isTrial(value: unknown) {
  if (!isObject(value)) return false;
  if (
    !Number.isInteger(value.trialNumber) ||
    (value.trialNumber as number) < 1 ||
    typeof value.status !== "string" ||
    !TRIAL_STATUSES.has(value.status) ||
    !isNonNegativeNumber(value.plannedOnsetMs) ||
    !isNullableNonNegativeNumber(value.appearedElapsedMs) ||
    !isNullableIsoDate(value.appearedAtIso) ||
    !isNullableNonNegativeNumber(value.clickedElapsedMs) ||
    !isNullableIsoDate(value.clickedAtIso) ||
    !isNullableNonNegativeNumber(value.reactionTimeMs) ||
    !(value.inputMethod === null || (typeof value.inputMethod === "string" && INPUT_METHODS.has(value.inputMethod))) ||
    !isPercent(value.crossXPercent) ||
    !isPercent(value.crossYPercent) ||
    !isNullablePercent(value.clickXPercent) ||
    !isNullablePercent(value.clickYPercent)
  ) return false;

  if (value.status === "hit") {
    return (
      value.appearedElapsedMs !== null &&
      value.appearedAtIso !== null &&
      value.clickedElapsedMs !== null &&
      value.clickedAtIso !== null &&
      value.reactionTimeMs !== null &&
      value.inputMethod !== null
    );
  }
  return (
    value.clickedElapsedMs === null &&
    value.clickedAtIso === null &&
    value.reactionTimeMs === null &&
    value.inputMethod === null &&
    value.clickXPercent === null &&
    value.clickYPercent === null &&
    (value.status !== "missed" || (value.appearedElapsedMs !== null && value.appearedAtIso !== null)) &&
    (value.status !== "omitted" || (value.appearedElapsedMs === null && value.appearedAtIso === null))
  );
}

function isFalseClick(value: unknown) {
  if (!isObject(value)) return false;
  return (
    isNonNegativeNumber(value.clickedElapsedMs) &&
    isIsoDate(value.clickedAtIso) &&
    typeof value.inputMethod === "string" &&
    INPUT_METHODS.has(value.inputMethod) &&
    isNullablePercent(value.clickXPercent) &&
    isNullablePercent(value.clickYPercent)
  );
}

function isPause(value: unknown) {
  if (!isObject(value)) return false;
  return (
    Number.isInteger(value.pauseNumber) &&
    (value.pauseNumber as number) >= 1 &&
    isNonNegativeNumber(value.startedElapsedMs) &&
    isIsoDate(value.startedAtIso) &&
    isNullableIsoDate(value.endedAtIso) &&
    isNonNegativeNumber(value.durationMs)
  );
}

function isEnvironmentEvent(value: unknown) {
  if (!isObject(value)) return false;
  return (
    typeof value.type === "string" &&
    ENVIRONMENT_EVENT_TYPES.has(value.type) &&
    isNonNegativeNumber(value.elapsedMs) &&
    isIsoDate(value.atIso)
  );
}

function isStoredSessionRecordV2(value: unknown): value is LegacyStoredSessionRecord {
  if (!isObject(value)) return false;
  const conditionId = value.conditionId;
  if (typeof conditionId !== "string" || !(conditionId in CONDITION_DETAILS)) return false;
  const condition = CONDITION_DETAILS[conditionId as keyof typeof CONDITION_DETAILS];
  const participantId = typeof value.participantId === "string" ? value.participantId : "";
  const normalizedParticipantId = participantId.trim().toLowerCase();

  if (
    value.schemaVersion !== 2 ||
    typeof value.sessionId !== "string" ||
    !UUID_PATTERN.test(value.sessionId) ||
    participantId !== participantId.trim() ||
    participantId.length < 1 ||
    participantId.length > 80 ||
    /[\u0000-\u001f\u007f]/.test(participantId) ||
    normalizedParticipantId === "test" ||
    normalizedParticipantId === "admin" ||
    value.conditionName !== condition.name ||
    typeof value.stimulusColorHex !== "string" ||
    value.stimulusColorHex.toLowerCase() !== condition.hex ||
    value.stimulusColorRgb !== condition.rgb ||
    value.plannedDurationMs !== 300000 ||
    value.crossVisibleMs !== 1800 ||
    !isNonNegativeNumber(value.actualDurationMs) ||
    !isNonNegativeNumber(value.wallClockDurationMs) ||
    !isNonNegativeNumber(value.totalPausedDurationMs) ||
    !isIsoDate(value.startedAtIso) ||
    !isIsoDate(value.plannedEndAtIso) ||
    !isIsoDate(value.endedAtIso) ||
    Date.parse(value.endedAtIso) < Date.parse(value.startedAtIso) ||
    (value.status !== "completed" && value.status !== "terminated") ||
    !(
      value.terminationReason === null ||
      value.terminationReason === "end_sequence" ||
      value.terminationReason === "touch_end"
    ) ||
    (value.status === "completed" && value.terminationReason !== null) ||
    (
      value.status === "terminated" &&
      value.terminationReason !== "end_sequence" &&
      value.terminationReason !== "touch_end"
    ) ||
    typeof value.fullscreenAtStart !== "boolean" ||
    typeof value.fullscreenRequestFailed !== "boolean" ||
    !Array.isArray(value.trialPlan) ||
    value.trialPlan.length !== 20 ||
    !value.trialPlan.every(isPlannedTrial) ||
    !Array.isArray(value.trials) ||
    value.trials.length > 20 ||
    !value.trials.every(isTrial) ||
    !Array.isArray(value.falseClicks) ||
    value.falseClicks.length > 10000 ||
    !value.falseClicks.every(isFalseClick) ||
    !Array.isArray(value.pauses) ||
    value.pauses.length > 1000 ||
    !value.pauses.every(isPause) ||
    !Array.isArray(value.environmentEvents) ||
    value.environmentEvents.length > 1000 ||
    !value.environmentEvents.every(isEnvironmentEvent)
  ) return false;

  const plans = new Map(
    value.trialPlan.map((trial) => {
      const item = trial as Record<string, unknown>;
      return [item.trialNumber, item];
    }),
  );
  const recordedTrialNumbers = new Set(value.trials.map((trial) => (trial as Record<string, unknown>).trialNumber));
  return (
    plans.size === value.trialPlan.length &&
    recordedTrialNumbers.size === value.trials.length &&
    value.trials.every((trial) => {
      const item = trial as Record<string, unknown>;
      const plan = plans.get(item.trialNumber);
      return Boolean(
        plan &&
        item.plannedOnsetMs === plan.plannedOnsetMs &&
        item.crossXPercent === plan.crossXPercent &&
        item.crossYPercent === plan.crossYPercent
      );
    }) &&
    (value.status !== "completed" || value.trials.length === 20)
  );
}

export function isStoredSessionRecord(value: unknown): value is StoredSessionRecord {
  return isStoredSessionRecordV2(value) || isStudySessionRecordV3(value);
}

function apiHeaders(accessToken?: string) {
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as {
      message?: string;
      msg?: string;
      error?: string;
      error_description?: string;
      hint?: string;
    };
    return body.error_description || body.message || body.msg || body.error || body.hint || fallback;
  } catch {
    return fallback;
  }
}

function isProfileCondition(value: unknown): value is StudySessionRecordV3["conditionId"] {
  return typeof value === "string" && PROFILE_CONDITIONS.has(value as StudySessionRecordV3["conditionId"]);
}

function isProfileClaimResponse(value: unknown): value is ParticipantProfile & { created: boolean } {
  return isParticipantProfile(value) && typeof (value as Record<string, unknown>).created === "boolean";
}

function profileRpcBody(profile: Pick<LocalParticipantProfile, "profileId" | "recoveryCode">) {
  if (!UUID_PATTERN.test(profile.profileId)) {
    throw new Error("The participant profile is not valid.");
  }
  return createRecoveryProof(profile.recoveryCode).then((recoveryProof) => ({
    participant_profile_id: profile.profileId,
    recovery_proof: recoveryProof,
  }));
}

async function postAnonymousRpc(functionName: string, body: Record<string, unknown>, fallback: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      ...apiHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await responseError(response, fallback));
  return response;
}

/**
 * Claims a new case-insensitive study name, or reopens the same name when the
 * supplied recovery code matches. The raw recovery code never leaves the browser.
 */
export async function claimParticipantProfile(
  displayName: string,
  recoveryCode: string,
): Promise<ParticipantProfileClaim> {
  const canonicalName = normalizeParticipantName(displayName);
  if (!isValidParticipantName(displayName)) {
    throw new Error("Use a name between 1 and 80 characters without control characters.");
  }
  const normalizedCode = normalizeRecoveryCode(recoveryCode);
  const recoveryProof = await createRecoveryProof(normalizedCode);
  const response = await postAnonymousRpc(
    "claim_participant_profile",
    { participant_name: canonicalName, recovery_proof: recoveryProof },
    "The study name could not be registered.",
  );
  const value: unknown = await response.json();
  if (!isProfileClaimResponse(value)) {
    throw new Error("The participant profile response was not valid.");
  }
  return { ...value, recoveryCode: normalizedCode };
}

/** Reopens an existing study name without creating a new one. */
export async function reclaimParticipantProfile(
  displayName: string,
  recoveryCode: string,
): Promise<LocalParticipantProfile> {
  const canonicalName = normalizeParticipantName(displayName);
  if (!isValidParticipantName(displayName)) {
    throw new Error("The study name is not valid.");
  }
  const normalizedCode = normalizeRecoveryCode(recoveryCode);
  const recoveryProof = await createRecoveryProof(normalizedCode);
  const response = await postAnonymousRpc(
    "reclaim_participant_profile",
    { participant_name: canonicalName, recovery_proof: recoveryProof },
    "The study name could not be recovered.",
  );
  const value: unknown = await response.json();
  if (!isParticipantProfile(value)) {
    throw new Error("The participant profile response was not valid.");
  }
  return { ...value, recoveryCode: normalizedCode };
}

export async function fetchParticipantProgress(
  profile: Pick<LocalParticipantProfile, "profileId" | "recoveryCode">,
): Promise<ParticipantProgress> {
  const authentication = await profileRpcBody(profile);
  const response = await postAnonymousRpc(
    "get_participant_progress",
    authentication,
    "The participant progress could not be loaded.",
  );
  const value: unknown = await response.json();
  if (!isObject(value) || !isParticipantProfile(value.profile)) {
    throw new Error("The participant progress response was not valid.");
  }
  if (
    !Array.isArray(value.completedSessions) ||
    !value.completedSessions.every((session) =>
      isObject(session) &&
      typeof session.sessionId === "string" &&
      UUID_PATTERN.test(session.sessionId) &&
      isProfileCondition(session.conditionId) &&
      typeof session.completedAt === "string" &&
      isIsoDate(session.completedAt) &&
      (session.studyBuildVersion === null || typeof session.studyBuildVersion === "string")
    ) ||
    !Array.isArray(value.completedConditionIds) ||
    !value.completedConditionIds.every(isProfileCondition) ||
    !Array.isArray(value.remainingConditionIds) ||
    !value.remainingConditionIds.every(isProfileCondition)
  ) {
    throw new Error("The participant progress response was not valid.");
  }
  return value as ParticipantProgress;
}

export async function uploadProfileStudySession(
  profile: Pick<LocalParticipantProfile, "profileId" | "displayName" | "recoveryCode">,
  record: StudySessionRecordV3,
  options: { keepalive?: boolean } = {},
) {
  if (
    !isStudySessionRecordV3(record) ||
    (record.status !== "completed" && record.status !== "terminated") ||
    !record.endedAtIso ||
    record.participantId !== profile.displayName ||
    (record.participantProfileId !== undefined && record.participantProfileId !== profile.profileId)
  ) {
    throw new Error("Only a final session belonging to this participant profile can be saved.");
  }
  const authentication = await profileRpcBody(profile);
  const body = JSON.stringify({ ...authentication, session_payload: record });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_profile_study_session`, {
    method: "POST",
    headers: {
      ...apiHeaders(),
      "Content-Type": "application/json",
    },
    body,
    keepalive: Boolean(options.keepalive) && new TextEncoder().encode(body).byteLength <= 60000,
  });
  if (!response.ok) {
    throw new Error(await responseError(response, "The participant session could not be saved."));
  }
}

export async function submitParticipantFeedback(
  profile: Pick<LocalParticipantProfile, "profileId" | "recoveryCode">,
  input: {
    sessionId: string;
    messageType: ParticipantFeedbackType;
    message: string;
    language: "en" | "zh";
    promptVersion: string;
    studyBuildVersion?: string | null;
  },
): Promise<ParticipantFeedbackReceipt> {
  const message = input.message.trim();
  if (!UUID_PATTERN.test(input.sessionId) || !["feedback", "question"].includes(input.messageType)) {
    throw new Error("The feedback record is not valid.");
  }
  if (message.length < 1 || message.length > 4000) {
    throw new Error("Feedback must contain between 1 and 4,000 characters.");
  }
  if (!/^[A-Za-z0-9._+-]{1,80}$/.test(input.promptVersion)) {
    throw new Error("The feedback prompt version is not valid.");
  }
  if (
    input.studyBuildVersion !== undefined &&
    input.studyBuildVersion !== null &&
    !/^[A-Za-z0-9._+-]{1,80}$/.test(input.studyBuildVersion)
  ) {
    throw new Error("The study build version is not valid.");
  }
  const authentication = await profileRpcBody(profile);
  const response = await postAnonymousRpc(
    "submit_participant_feedback",
    {
      ...authentication,
      session_id: input.sessionId,
      message_type: input.messageType,
      message_body: message,
      response_language: input.language,
      prompt_version: input.promptVersion,
      study_build_version: input.studyBuildVersion ?? null,
    },
    "The feedback could not be saved.",
  );
  const value: unknown = await response.json();
  if (
    !isObject(value) ||
    typeof value.feedbackId !== "string" ||
    !UUID_PATTERN.test(value.feedbackId) ||
    typeof value.createdAt !== "string" ||
    !isIsoDate(value.createdAt)
  ) {
    throw new Error("The feedback receipt was not valid.");
  }
  return value as ParticipantFeedbackReceipt;
}

export function isAdminParticipantId(value: string) {
  return value.trim().toLowerCase() === "admin";
}

export async function uploadStudySession(
  record: StoredSessionRecord,
  options: { keepalive?: boolean } = {},
) {
  if (
    !isStoredSessionRecord(record) ||
    (record.status !== "completed" && record.status !== "terminated") ||
    !record.endedAtIso ||
    isAdminParticipantId(record.participantId) ||
    record.participantId.trim().toLowerCase() === "test"
  ) {
    throw new Error("Only final participant sessions can be saved remotely.");
  }
  const body = JSON.stringify({
    session_id: record.sessionId,
    participant_id: record.participantId,
    condition_id: record.conditionId,
    status: record.status,
    started_at: record.startedAtIso,
    ended_at: record.endedAtIso,
    payload: record,
  });
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/study_sessions?on_conflict=session_id`,
    {
      method: "POST",
      headers: {
        ...apiHeaders(),
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body,
      keepalive: Boolean(options.keepalive) && new TextEncoder().encode(body).byteLength <= 60000,
    },
  );

  if (!response.ok) {
    throw new Error(await responseError(response, "The remote session could not be saved."));
  }
}

function assertResumeToken(resumeToken: string) {
  if (!/^[0-9a-f]{64}$/i.test(resumeToken)) {
    throw new Error("The overnight resume token is not valid.");
  }
}

export async function saveStudyDraft(
  resumeToken: string,
  record: StudySessionRecordV3,
  options: { keepalive?: boolean } = {},
) {
  assertResumeToken(resumeToken);
  if (!isStudySessionDraftV3(record)) {
    throw new Error("The overnight study draft is not valid.");
  }
  const body = JSON.stringify({ resume_token: resumeToken, draft_payload: record });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_study_draft`, {
    method: "POST",
    headers: {
      ...apiHeaders(),
      "Content-Type": "application/json",
    },
    body,
    keepalive: Boolean(options.keepalive) && new TextEncoder().encode(body).byteLength <= 60000,
  });
  if (!response.ok) {
    throw new Error(await responseError(response, "The overnight draft could not be saved."));
  }
}

export async function loadStudyDraft(resumeToken: string) {
  assertResumeToken(resumeToken);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/load_study_draft`, {
    method: "POST",
    headers: {
      ...apiHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ resume_token: resumeToken }),
  });
  if (!response.ok) {
    throw new Error(await responseError(response, "The overnight draft could not be loaded."));
  }
  const payload: unknown = await response.json();
  if (payload === null) return null;
  if (!isStudySessionDraftV3(payload)) {
    throw new Error("The stored overnight draft was not valid.");
  }
  return payload;
}

export async function deleteStudyDraft(resumeToken: string) {
  assertResumeToken(resumeToken);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_study_draft`, {
    method: "POST",
    headers: {
      ...apiHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ resume_token: resumeToken }),
  });
  if (!response.ok) {
    throw new Error(await responseError(response, "The overnight draft could not be removed."));
  }
}

export async function signInAdmin(password: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      ...apiHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: ADMIN_EMAIL, password }),
  });

  if (!response.ok) {
    throw new Error(await responseError(response, "Administrator sign-in failed."));
  }

  const body = await response.json() as {
    access_token?: string;
    user?: { email?: string | null };
  };
  if (
    !body.access_token ||
    body.user?.email?.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()
  ) {
    throw new Error("This account is not authorized for the study dashboard.");
  }
  return body.access_token;
}

export async function fetchRemoteStudySessions(accessToken: string): Promise<RemoteStudySessionsResult> {
  const pageSize = 500;
  const sessions: RemoteStudySession[] = [];
  const seenSessionIds = new Set<string>();
  let invalidCount = 0;

  for (let offset = 0, page = 0; ; offset += pageSize, page += 1) {
    if (page >= 2000) {
      throw new Error("The study contains too many records to load safely in one dashboard request.");
    }
    const query = new URLSearchParams({
      select: "session_id,payload,received_at",
      order: "received_at.asc,session_id.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/study_sessions?${query}`, {
      headers: {
        ...apiHeaders(accessToken),
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(await responseError(response, "The study data could not be loaded."));
    }

    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) {
      throw new Error("The remote study data response was not valid.");
    }

    for (const row of rows) {
      if (
        isObject(row) &&
        typeof row.session_id === "string" &&
        isStoredSessionRecord(row.payload) &&
        row.session_id === row.payload.sessionId &&
        isIsoDate(row.received_at)
      ) {
        if (!seenSessionIds.has(row.session_id)) {
          seenSessionIds.add(row.session_id);
          sessions.push({ record: row.payload, createdAt: row.received_at });
        }
      } else {
        invalidCount += 1;
      }
    }

    if (rows.length < pageSize) break;
  }

  sessions.reverse();
  return { sessions, invalidCount };
}

export async function fetchAdminParticipantProfiles(
  accessToken: string,
  options: { limit?: number; offset?: number } = {},
): Promise<PaginatedAdminResult<AdminParticipantProfile>> {
  const requestedLimit = options.limit ?? 500;
  const requestedOffset = options.offset ?? 0;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(500, Math.max(1, Math.trunc(requestedLimit)))
    : 500;
  const offset = Number.isFinite(requestedOffset)
    ? Math.max(0, Math.trunc(requestedOffset))
    : 0;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_list_participant_profiles`, {
    method: "POST",
    headers: {
      ...apiHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_size: limit, page_offset: offset }),
  });
  if (!response.ok) {
    throw new Error(await responseError(response, "Participant profiles could not be loaded."));
  }
  const value: unknown = await response.json();
  if (!isObject(value) || !Number.isInteger(value.total) || (value.total as number) < 0 || !Array.isArray(value.items)) {
    throw new Error("The participant profile list was not valid.");
  }
  const items: AdminParticipantProfile[] = [];
  for (const item of value.items) {
    const fields = item as Record<string, unknown>;
    if (
      !isParticipantProfile(item) ||
      !isObject(item) ||
      !Number.isInteger(fields.completedSessionCount) ||
      (fields.completedSessionCount as number) < 0 ||
      !Number.isInteger(fields.feedbackCount) ||
      (fields.feedbackCount as number) < 0 ||
      !Array.isArray(fields.completedConditionIds) ||
      !fields.completedConditionIds.every(isProfileCondition)
    ) {
      throw new Error("The participant profile list was not valid.");
    }
    items.push(item as AdminParticipantProfile);
  }
  return { items, total: value.total as number };
}

export async function fetchAdminParticipantFeedback(
  accessToken: string,
  options: { limit?: number; offset?: number } = {},
): Promise<PaginatedAdminResult<AdminParticipantFeedback>> {
  const requestedLimit = options.limit ?? 500;
  const requestedOffset = options.offset ?? 0;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(500, Math.max(1, Math.trunc(requestedLimit)))
    : 500;
  const offset = Number.isFinite(requestedOffset)
    ? Math.max(0, Math.trunc(requestedOffset))
    : 0;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_list_participant_feedback`, {
    method: "POST",
    headers: {
      ...apiHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_size: limit, page_offset: offset }),
  });
  if (!response.ok) {
    throw new Error(await responseError(response, "Participant feedback could not be loaded."));
  }
  const value: unknown = await response.json();
  if (!isObject(value) || !Number.isInteger(value.total) || (value.total as number) < 0 || !Array.isArray(value.items)) {
    throw new Error("The participant feedback list was not valid.");
  }
  const items: AdminParticipantFeedback[] = [];
  for (const item of value.items) {
    if (
      !isObject(item) ||
      typeof item.feedbackId !== "string" ||
      !UUID_PATTERN.test(item.feedbackId) ||
      typeof item.profileId !== "string" ||
      !UUID_PATTERN.test(item.profileId) ||
      typeof item.displayName !== "string" ||
      typeof item.sessionId !== "string" ||
      !UUID_PATTERN.test(item.sessionId) ||
      !isProfileCondition(item.conditionId) ||
      (item.messageType !== "feedback" && item.messageType !== "question") ||
      typeof item.message !== "string" ||
      (item.language !== "en" && item.language !== "zh") ||
      typeof item.promptVersion !== "string" ||
      !(item.studyBuildVersion === null || typeof item.studyBuildVersion === "string") ||
      typeof item.createdAt !== "string" ||
      !isIsoDate(item.createdAt)
    ) {
      throw new Error("The participant feedback list was not valid.");
    }
    items.push(item as AdminParticipantFeedback);
  }
  return { items, total: value.total as number };
}
