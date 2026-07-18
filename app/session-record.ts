import type {
  ConditionId,
  DeviceInfo,
  PostStudySurvey,
  PreStudySurvey,
  ReactionTestRecord,
} from "./protocol-v3";

export type SessionStatus = "active" | "completed" | "terminated";
export type ExposureStatus =
  | "not-applicable"
  | "not-started"
  | "in-progress"
  | "completed"
  | "terminated";
export type AttentionInputMethod = "pointer" | "space" | "enter";

export type PlannedTrial = {
  trialNumber: number;
  plannedOnsetMs: number;
  crossXPercent: number;
  crossYPercent: number;
};

export type TrialRecord = PlannedTrial & {
  status: "pending" | "hit" | "missed" | "omitted" | "cancelled";
  appearedElapsedMs: number | null;
  appearedAtIso: string | null;
  clickedElapsedMs: number | null;
  clickedAtIso: string | null;
  reactionTimeMs: number | null;
  inputMethod: AttentionInputMethod | null;
  clickXPercent: number | null;
  clickYPercent: number | null;
};

export type EnvironmentEvent = {
  type: "visibility_hidden" | "visibility_visible" | "fullscreen_entered" | "fullscreen_exited";
  elapsedMs: number;
  atIso: string;
};

export type FalseClickRecord = {
  clickedElapsedMs: number;
  clickedAtIso: string;
  inputMethod: AttentionInputMethod;
  clickXPercent: number | null;
  clickYPercent: number | null;
};

export type PauseRecord = {
  pauseNumber: number;
  startedElapsedMs: number;
  startedAtIso: string;
  endedAtIso: string | null;
  durationMs: number;
};

export type SessionDeviceInfo = {
  beforeSleep: DeviceInfo;
  afterWaking: DeviceInfo | null;
  deviceChanged: boolean | null;
};

export type StudySessionRecordV3 = {
  schemaVersion: 3;
  protocolVersion: "overnight-v1";
  attentionProtocolVersion: "sparse-4-50-70-v1";
  sessionId: string;
  participantId: string;
  /** Present for sessions created through the unique study-name profile flow. */
  participantProfileId?: string;
  /** Identifies the website/data-contract build without changing older records. */
  studyBuildVersion?: string;
  conditionId: ConditionId;
  conditionName: string;
  stimulusColorHex: string | null;
  stimulusColorRgb: string | null;
  plannedDurationMs: number;
  plannedEndAtIso: string | null;
  actualDurationMs: number;
  wallClockDurationMs: number;
  totalPausedDurationMs: number;
  crossVisibleMs: number;
  startedAtIso: string;
  stimulusStartedAtIso: string | null;
  stimulusEndedAtIso: string | null;
  sleepStartedAtIso: string | null;
  morningReturnedAtIso: string | null;
  assessmentCompletedAtIso: string | null;
  endedAtIso: string | null;
  status: SessionStatus;
  exposureStatus: ExposureStatus;
  terminationReason: "end_sequence" | "touch_end" | "page_reload" | null;
  fullscreenAtStart: boolean;
  fullscreenRequestFailed: boolean;
  deviceInfo: SessionDeviceInfo;
  preSurvey: PreStudySurvey;
  postSurvey: PostStudySurvey | null;
  reactionTest: ReactionTestRecord | null;
  trialPlan: PlannedTrial[];
  trials: TrialRecord[];
  falseClicks: FalseClickRecord[];
  pauses: PauseRecord[];
  environmentEvents: EnvironmentEvent[];
};

export type LocalOvernightDraft = {
  storageVersion: 1;
  resumeToken: string;
  record: StudySessionRecordV3;
};
