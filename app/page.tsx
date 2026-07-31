"use client";

import { Fragment, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { isTouchCapable } from "./device-controls";
import {
  type ConditionId,
  type DeviceInfo,
  type PostStudySurvey,
  type PreStudySurvey,
  type ReactionTestRecord,
  detectBrowserDeviceInfo,
} from "./protocol-v3";
import {
  V4_CONDITION_ORDER,
  sequencePositionForCondition,
  type MorningStudySurvey,
  type PostExposureSurvey,
  type V4ConditionId,
} from "./protocol-v4";
import { clearReactionTestProgress, ReactionTest } from "./reaction-test";
import {
  ADMIN_EMAIL,
  deleteStudyDraft,
  deleteParticipantStudyDraft,
  fetchAdminParticipantFeedback,
  fetchAdminParticipantProfiles,
  fetchParticipantProgress,
  fetchRemoteStudySessions,
  forgetLocalParticipantProfile,
  isAdminParticipantId,
  isValidParticipantPassword,
  isValidParticipantName,
  isValidRecoveryCode,
  isStoredSessionRecord,
  loadLocalParticipantProfile,
  loadLocalParticipantProfiles,
  loadStudyDraft,
  loadParticipantStudyDraft,
  normalizeParticipantName,
  normalizeRecoveryCode,
  rememberLocalParticipantProfile,
  registerParticipantAccount,
  saveStudyDraft,
  saveParticipantStudyDraft,
  signInParticipantAccount,
  signInAdmin,
  submitParticipantFeedback,
  type AdminParticipantFeedback,
  type AdminParticipantProfile,
  type LocalParticipantProfile,
  type ParticipantProgress,
  type RemoteStudySession,
  type StoredSessionRecord,
  uploadProfileStudySession,
  uploadStudySession,
  upgradeLegacyParticipantAccount,
} from "./remote-storage";
import type {
  AttentionInputMethod,
  EnvironmentEvent,
  ExposureStatus,
  FalseClickRecord,
  LocalOvernightDraft,
  PauseRecord,
  PlannedTrial,
  StudySessionRecordV3,
  StudySessionRecordV4,
  StudySessionRecord,
  TrialRecord,
} from "./session-record";
import { isStudySessionDraftV3, isStudySessionRecordV3 } from "./session-validation";
import { isStudySessionDraftV4, isStudySessionRecordV4 } from "./session-validation-v4";
import { sessionToCsv, sessionsToCsv } from "./study-data";
import {
  MorningSurveyForm,
  PostExposureSurveyForm,
  PostStudySurveyForm,
  PreStudySurveyForm,
} from "./study-surveys";
import { StudyTutorial } from "./study-tutorial";
import { SessionFeedback, type SessionFeedbackPayload } from "./session-feedback";
import { AttentionPractice } from "./attention-practice";
import {
  groupParticipantHistories,
  normalizeParticipantName as normalizeParticipantHistoryName,
} from "./consistency-review";
import { isLanguage, type Language } from "./i18n";
import { AdminSessionDetails } from "./admin-session-details";

type Phase =
  | "setup"
  | "admin"
  | "tutorial"
  | "practice"
  | "pre-survey"
  | "instructions"
  | "countdown"
  | "running"
  | "paused"
  | "post-exposure-survey"
  | "sleep-ready"
  | "awaiting-morning"
  | "morning-survey"
  | "post-survey"
  | "reaction-test"
  | "results";

type RemoteSaveStatus = "idle" | "saving" | "saved" | "failed";
type ParticipantAccountMode = "create" | "signin";
type ParticipantProgressStatus = "idle" | "loading" | "loaded" | "failed";
type DraftProtection = {
  sessionId: string | null;
  localSaved: boolean;
  remoteStatus: "idle" | "saving" | "saved" | "failed";
};

type Condition = {
  id: ConditionId;
  name: string;
  luminance: string;
  color: string | null;
  rgb: string | null;
};

const CONDITIONS: Condition[] = [
  {
    id: "dim-red",
    name: "Dim Red",
    luminance: "Low digital intensity",
    color: "#660000",
    rgb: "102, 0, 0",
  },
  {
    id: "dim-blue",
    name: "Dim Blue",
    luminance: "Low digital intensity",
    color: "#000066",
    rgb: "0, 0, 102",
  },
  {
    id: "bright-blue",
    name: "Bright Blue",
    luminance: "High digital intensity",
    color: "#0000ff",
    rgb: "0, 0, 255",
  },
  {
    id: "bright-red",
    name: "Bright Red",
    luminance: "High digital intensity",
    color: "#ff0000",
    rgb: "255, 0, 0",
  },
  {
    id: "control",
    name: "Control — Normal Sleep",
    luminance: "No light exposure",
    color: null,
    rgb: null,
  },
];

const ACTIVE_CONDITIONS = CONDITIONS.filter(
  (condition): condition is Condition & { id: V4ConditionId } =>
    (V4_CONDITION_ORDER as readonly string[]).includes(condition.id),
);

const CONDITION_MAP = Object.fromEntries(
  CONDITIONS.map((condition) => [condition.id, condition]),
) as Record<ConditionId, Condition>;

const SESSION_DURATION_MS = 5 * 60 * 1000;
const CROSS_VISIBLE_MS = 1800;
const FINAL_STORAGE_KEY = "sleep-light-study:sessions:v2";
const OVERNIGHT_DRAFT_KEY = "sleep-light-study:overnight-draft:v1";
const RETIRED_EMAIL_PLAN_KEY = "sleep-light-study:morning-reminder-plan:v1";
const LANGUAGE_STORAGE_KEY = "sleep-light-study:language:v1";
const STUDY_BUILD_VERSION = "2026-07-31-fixed-four-immediate-alertness-v1";
const DRAFT_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const TEST_PROFILE_ID = "00000000-0000-4000-8000-000000000001";

function isTestParticipantId(value: string) {
  return value.trim().toLowerCase() === "test";
}

function isReservedParticipantId(value: string) {
  return isTestParticipantId(value) || isAdminParticipantId(value);
}

function tr(language: Language, english: string, chinese: string) {
  return language === "zh" ? chinese : english;
}

function conditionLabel(conditionId: ConditionId, language: Language) {
  const labels: Record<ConditionId, [string, string]> = {
    "bright-red": ["Bright red", "亮红色"],
    "dim-red": ["Dim red", "暗红色"],
    "bright-blue": ["Bright blue", "亮蓝色"],
    "dim-blue": ["Dim blue", "暗蓝色"],
    control: ["Control — normal sleep", "对照组——正常睡眠"],
  };
  return labels[conditionId][language === "zh" ? 1 : 0];
}

function conditionLuminanceLabel(condition: Condition, language: Language) {
  if (condition.id === "control") return tr(language, "No light exposure", "不进行光照刺激");
  return condition.id.startsWith("bright")
    ? tr(language, "High digital intensity", "高数字亮度")
    : tr(language, "Low digital intensity", "低数字亮度");
}

function deviceCategoryLabel(value: string, language: Language) {
  if (language === "en") return value;
  return ({ phone: "手机", tablet: "平板电脑", computer: "电脑" } as Record<string, string>)[value] ?? value;
}

function randomBetween(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

export function makeTrialPlan(count = 4): PlannedTrial[] {
  let plannedOnsetMs = 0;
  return Array.from({ length: count }, (_, index) => {
    plannedOnsetMs += randomBetween(50000, 70000);
    return {
      trialNumber: index + 1,
      plannedOnsetMs,
      crossXPercent: randomBetween(12, 88),
      crossYPercent: randomBetween(15, 60),
    };
  });
}

function makeSessionId() {
  const browserCrypto = globalThis.crypto;
  if (browserCrypto?.randomUUID) return browserCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (browserCrypto?.getRandomValues) {
    browserCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function makeResumeToken() {
  const browserCrypto = globalThis.crypto;
  if (!browserCrypto?.getRandomValues) {
    throw new Error("This browser cannot create a secure overnight recovery key.");
  }
  const bytes = new Uint8Array(32);
  browserCrypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatRemainingTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDateTime(value: string | null, language: Language) {
  return value ? new Date(value).toLocaleString(language === "zh" ? "zh-CN" : "en") : "—";
}

function downloadFile(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFilenamePart(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalized || "study-name";
}

function removeStoredSession(sessionId: string) {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FINAL_STORAGE_KEY) || "[]");
    const saved = Array.isArray(parsed) ? parsed : [];
    const retained = saved.filter((item) => (
      typeof item !== "object" || item === null || !("sessionId" in item) || item.sessionId !== sessionId
    ));
    localStorage.setItem(FINAL_STORAGE_KEY, JSON.stringify(retained));
    return true;
  } catch {
    return false;
  }
}

function getDraftAgeAnchor(record: StudySessionRecord) {
  return Date.parse(record.sleepStartedAtIso ?? record.stimulusEndedAtIso ?? record.startedAtIso);
}

function isFreshDraft(record: StudySessionRecord) {
  const anchor = getDraftAgeAnchor(record);
  return Number.isFinite(anchor) && Date.now() - anchor <= DRAFT_MAX_AGE_MS;
}

function getRecordProgressTime(record: StudySessionRecord) {
  const checkpointAt = record.exposureStatus === "in-progress" && record.stimulusStartedAtIso
    ? Date.parse(record.stimulusStartedAtIso) + record.wallClockDurationMs
    : Number.NaN;
  const candidates = [
    ...(record.schemaVersion === 3
      ? [record.reactionTest?.completedAtIso, record.postSurvey?.answeredAtIso]
      : [record.morningSurvey?.answeredAtIso, record.postExposureSurvey?.answeredAtIso]),
    record.morningReturnedAtIso,
    record.sleepStartedAtIso,
    record.stimulusEndedAtIso,
    record.stimulusStartedAtIso,
    record.startedAtIso,
  ];
  return Math.max(
    ...candidates.flatMap((value) => value ? [Date.parse(value)] : []),
    ...(Number.isFinite(checkpointAt) ? [checkpointAt] : []),
  );
}

function hasMoreStudyProgress(candidate: StudySessionRecord, current: StudySessionRecord) {
  const candidateTime = getRecordProgressTime(candidate);
  const currentTime = getRecordProgressTime(current);
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  if (candidate.wallClockDurationMs !== current.wallClockDurationMs) {
    return candidate.wallClockDurationMs > current.wallClockDurationMs;
  }
  const candidateEvents = candidate.trials.length
    + candidate.falseClicks.length
    + candidate.pauses.length
    + candidate.environmentEvents.length;
  const currentEvents = current.trials.length
    + current.falseClicks.length
    + current.pauses.length
    + current.environmentEvents.length;
  return candidateEvents > currentEvents;
}

function terminateInterruptedExposure<RecordType extends StudySessionRecord>(
  record: RecordType,
  now = Date.now(),
): RecordType {
  if (record.exposureStatus !== "in-progress" || record.conditionId === "control") return record;
  const stimulusStartedAt = record.stimulusStartedAtIso
    ? Date.parse(record.stimulusStartedAtIso)
    : now;
  const hasRuntimeCheckpoint = record.wallClockDurationMs > 0
    || record.actualDurationMs > 0
    || record.trials.length > 0
    || record.falseClicks.length > 0
    || record.pauses.length > 0
    || record.environmentEvents.length > 0;
  const wallClockDurationMs = hasRuntimeCheckpoint
    ? record.wallClockDurationMs
    : 0;
  const endedAt = Number.isFinite(stimulusStartedAt)
    ? stimulusStartedAt + wallClockDurationMs
    : now;
  const totalPausedDurationMs = Math.min(record.totalPausedDurationMs, wallClockDurationMs);
  const actualDurationMs = hasRuntimeCheckpoint
    ? Math.min(record.plannedDurationMs, record.actualDurationMs)
    : Math.min(record.plannedDurationMs, wallClockDurationMs - totalPausedDurationMs);
  const stimulusEndedAtIso = new Date(endedAt).toISOString();

  return {
    ...record,
    exposureStatus: "terminated" as const,
    terminationReason: "page_reload" as const,
    stimulusEndedAtIso,
    actualDurationMs,
    wallClockDurationMs,
    totalPausedDurationMs,
    trials: record.trials.map((trial) => (
      trial.status === "pending" ? { ...trial, status: "cancelled" as const } : { ...trial }
    )),
    pauses: record.pauses.map((pause) => (
      pause.endedAtIso === null
        ? {
            ...pause,
            endedAtIso: stimulusEndedAtIso,
            durationMs: Math.max(
              pause.durationMs,
              Math.max(0, endedAt - Date.parse(pause.startedAtIso)),
            ),
          }
        : { ...pause }
    )),
  } as RecordType;
}

function TouchSessionControls({
  language,
  paused,
  endArmed,
  onPauseToggle,
  onEnd,
}: {
  language: Language;
  paused: boolean;
  endArmed: boolean;
  onPauseToggle: () => void;
  onEnd: () => void;
}) {
  return (
    <div
      className="touch-session-controls"
      role="group"
      aria-label={tr(language, "Experiment controls", "实验控制")}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button className="touch-pause-button" type="button" onClick={onPauseToggle}>
        {paused ? tr(language, "Resume", "继续") : tr(language, "Pause", "暂停")}
      </button>
      <button
        className={`touch-end-button ${endArmed ? "armed" : ""}`}
        type="button"
        aria-pressed={endArmed}
        onClick={onEnd}
      >
        {endArmed ? tr(language, "Tap again to end", "再次点击以结束") : tr(language, "End", "结束")}
      </button>
      <span className="touch-control-status" aria-live="polite">
        {endArmed
          ? tr(language, "Tap End again within three seconds to end the light exposure.", "请在三秒内再次点击“结束”以提前结束光照。")
          : ""}
      </span>
    </div>
  );
}

function AdminPortal({ language, onExit }: { language: Language; onExit: () => void }) {
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sessions, setSessions] = useState<RemoteStudySession[]>([]);
  const [profiles, setProfiles] = useState<AdminParticipantProfile[]>([]);
  const [feedback, setFeedback] = useState<AdminParticipantFeedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [invalidRemoteCount, setInvalidRemoteCount] = useState(0);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => () => {
    requestIdRef.current += 1;
  }, []);

  const loadSessions = useCallback(async (token: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const [remoteResult, firstProfiles, firstFeedback] = await Promise.all([
        fetchRemoteStudySessions(token),
        fetchAdminParticipantProfiles(token),
        fetchAdminParticipantFeedback(token),
      ]);
      const allProfiles = [...firstProfiles.items];
      for (let offset = allProfiles.length; offset < firstProfiles.total; offset = allProfiles.length) {
        const page = await fetchAdminParticipantProfiles(token, { offset });
        if (!page.items.length) break;
        allProfiles.push(...page.items);
      }
      const allFeedback = [...firstFeedback.items];
      for (let offset = allFeedback.length; offset < firstFeedback.total; offset = allFeedback.length) {
        const page = await fetchAdminParticipantFeedback(token, { offset });
        if (!page.items.length) break;
        allFeedback.push(...page.items);
      }
      if (requestIdRef.current !== requestId) return;
      setSessions(remoteResult.sessions);
      setExpandedSessionId((current) => (
        current && remoteResult.sessions.some(({ record }) => record.sessionId === current)
          ? current
          : null
      ));
      setProfiles(allProfiles);
      setFeedback(allFeedback);
      setInvalidRemoteCount(remoteResult.invalidCount);
    } catch (loadError) {
      if (requestIdRef.current !== requestId) return;
      setError(loadError instanceof Error ? loadError.message : tr(language, "The study data could not be loaded.", "无法加载研究数据。"));
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [language]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) return;
    const submittedPassword = password;
    setPassword("");
    setLoading(true);
    setError("");
    try {
      const token = await signInAdmin(submittedPassword);
      setAccessToken(token);
      await loadSessions(token);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : tr(language, "Administrator sign-in failed.", "管理员登录失败。"));
      setLoading(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter(({ record }) => (
      record.participantId.toLowerCase().includes(query)
      || record.conditionName.toLowerCase().includes(query)
      || conditionLabel(record.conditionId, "zh").includes(query)
      || record.status.toLowerCase().includes(query)
      || record.sessionId.toLowerCase().includes(query)
    ));
  }, [search, sessions]);

  const participantHistories = useMemo(
    () => groupParticipantHistories(sessions.map(({ record }) => record)),
    [sessions],
  );
  const reviewByName = useMemo(() => new Map(
    participantHistories.map((history) => [history.normalizedParticipantName, history]),
  ), [participantHistories]);
  const profileByName = useMemo(() => new Map(
    profiles.map((profile) => [normalizeParticipantHistoryName(profile.displayName), profile]),
  ), [profiles]);
  const profileById = useMemo(() => new Map(
    profiles.map((profile) => [profile.profileId, profile]),
  ), [profiles]);
  const feedbackBySession = useMemo(() => {
    const grouped = new Map<string, AdminParticipantFeedback[]>();
    for (const item of feedback) {
      grouped.set(item.sessionId, [...(grouped.get(item.sessionId) ?? []), item]);
    }
    return grouped;
  }, [feedback]);

  const dashboardStats = useMemo(() => ({
    sessions: sessions.length,
    participants: Math.max(profiles.length, participantHistories.length),
    completed: sessions.filter(({ record }) => record.status === "completed").length,
    terminated: sessions.filter(({ record }) => record.status === "terminated").length,
    flagged: participantHistories.filter(({ consistencyReview }) => consistencyReview.needsReview).length,
    feedback: feedback.length,
  }), [feedback.length, participantHistories, profiles.length, sessions]);

  const downloadRemoteSession = (session: RemoteStudySession, format: "csv" | "json") => {
    const safeParticipant = safeFilenamePart(session.record.participantId);
    const filename = `sleep-light-${safeParticipant}-${session.record.conditionId}`;
    if (format === "csv") {
      downloadFile(`${filename}.csv`, sessionToCsv(session.record), "text/csv;charset=utf-8");
    } else {
      downloadFile(`${filename}.json`, JSON.stringify(session.record, null, 2), "application/json;charset=utf-8");
    }
  };

  if (!accessToken) {
    return (
      <main className="admin-shell">
        <section className="admin-login-card" aria-labelledby="admin-login-title">
          <p className="eyebrow">{tr(language, "Restricted access", "受限访问")}</p>
          <h1 id="admin-login-title">{tr(language, "Study administrator", "研究管理员")}</h1>
          <p>{tr(language, "Sign in to view remotely saved participant sessions. The administrator email is fixed to", "登录后查看远程保存的参与者实验记录。管理员邮箱固定为")} <strong>{ADMIN_EMAIL}</strong>.</p>
          <form onSubmit={handleLogin}>
            <label className="field-label" htmlFor="admin-password">{tr(language, "Password", "密码")}</label>
            <input
              id="admin-password"
              className="participant-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="primary-button" type="submit" disabled={loading || !password}>
              {loading ? tr(language, "Signing in…", "正在登录…") : tr(language, "Sign in", "登录")}
            </button>
          </form>
          <button className="text-button" type="button" onClick={onExit}>{tr(language, "Back to participant setup", "返回参与者首页")}</button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <section className="admin-dashboard" aria-labelledby="admin-dashboard-title">
        <header className="admin-header">
          <div>
            <p className="eyebrow">{tr(language, "Remote study data", "远程研究数据")}</p>
            <h1 id="admin-dashboard-title">{tr(language, "Study-name records", "实验姓名记录")}</h1>
            <p>{tr(language, `Authenticated as ${ADMIN_EMAIL}. Old and current record versions remain available; updates never overwrite prior answers.`, `已以 ${ADMIN_EMAIL} 登录。旧版和当前版本记录都会保留，更新不会覆盖以前的回答。`)}</p>
          </div>
          <div className="admin-header-actions">
            <button className="secondary-button" type="button" onClick={() => loadSessions(accessToken)} disabled={loading}>
              {loading ? tr(language, "Refreshing…", "刷新中…") : tr(language, "Refresh", "刷新")}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                requestIdRef.current += 1;
                setAccessToken(null);
                setSessions([]);
                setProfiles([]);
                setFeedback([]);
                setInvalidRemoteCount(0);
                setError("");
                setSearch("");
                setExpandedSessionId(null);
              }}
            >
              {tr(language, "Sign out", "退出登录")}
            </button>
          </div>
        </header>

        <div className="admin-stats" aria-label={tr(language, "Remote data summary", "远程数据汇总")}>
          <div><span>{tr(language, "Sessions", "实验记录")}</span><strong>{dashboardStats.sessions}</strong></div>
          <div><span>{tr(language, "Study names", "实验姓名")}</span><strong>{dashboardStats.participants}</strong></div>
          <div><span>{tr(language, "Needs review", "需要复核")}</span><strong>{dashboardStats.flagged}</strong></div>
          <div><span>{tr(language, "Feedback", "反馈/问题")}</span><strong>{dashboardStats.feedback}</strong></div>
        </div>

        <div className="admin-toolbar">
          <input
            className="admin-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr(language, "Search name, condition, status, or session ID", "搜索姓名、条件、状态或实验编号")}
            aria-label={tr(language, "Search remote sessions", "搜索远程实验记录")}
          />
          <button
            className="secondary-button"
            type="button"
            disabled={!sessions.length}
            onClick={() => downloadFile(
              `sleep-light-all-sessions-${new Date().toISOString().slice(0, 10)}.csv`,
              sessionsToCsv(sessions.map(({ record }) => record)),
              "text/csv;charset=utf-8",
            )}
          >
            {tr(language, "Download all CSV", "下载全部 CSV")}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!sessions.length}
            onClick={() => downloadFile(
              `sleep-light-all-sessions-${new Date().toISOString().slice(0, 10)}.json`,
              JSON.stringify(sessions.map(({ record }) => record), null, 2),
              "application/json;charset=utf-8",
            )}
          >
            {tr(language, "Download all JSON", "下载全部 JSON")}
          </button>
        </div>

        {error ? <p className="admin-error" role="alert">{error}</p> : null}
        {invalidRemoteCount ? (
          <p className="admin-warning" role="status">
            {tr(language, `${invalidRemoteCount} malformed remote record${invalidRemoteCount === 1 ? " was" : "s were"} hidden from this dashboard.`, `${invalidRemoteCount} 条格式异常的远程记录已从面板隐藏。`)}
          </p>
        ) : null}
        {!loading && !error && sessions.length === 0 ? <p className="admin-empty">{tr(language, "No remote sessions were found.", "未找到远程实验记录。")}</p> : null}

        {sessions.length ? (
          <div className="admin-table-wrap">
            <table>
              <caption>{tr(language, `${filteredSessions.length} of ${sessions.length} remote sessions`, `显示 ${sessions.length} 条记录中的 ${filteredSessions.length} 条`)}</caption>
              <thead>
                <tr>
                  <th>{tr(language, "Study name", "实验姓名")}</th>
                  <th>{tr(language, "Review", "复核")}</th>
                  <th>{tr(language, "Condition / progress", "条件 / 进度")}</th>
                  <th>{tr(language, "Started", "开始时间")}</th>
                  <th>{tr(language, "Version", "版本")}</th>
                  <th>{tr(language, "Status", "状态")}</th>
                  <th>{tr(language, "Pre-exposure Karolinska score", "光照前卡罗林斯卡分数")}</th>
                  <th>{tr(language, "Post-exposure / legacy post score", "光照后／旧版睡后分数")}</th>
                  <th>{tr(language, "Reaction mean", "平均反应")}</th>
                  <th>{tr(language, "Attention", "注意任务")}</th>
                  <th>{tr(language, "Feedback / question", "反馈 / 问题")}</th>
                  <th>{tr(language, "Files", "文件")}</th>
                  <th>{tr(language, "Details", "详细结果")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => {
                  const record = session.record;
                  const v3 = record.schemaVersion === 3 ? record : null;
                  const v4 = record.schemaVersion === 4 ? record : null;
                  const hits = record.trials.filter((trial) => trial.status === "hit").length;
                  const attentionReactionTimes = record.trials
                    .filter((trial) => trial.status === "hit" && trial.reactionTimeMs !== null)
                    .map((trial) => trial.reactionTimeMs as number);
                  const attentionReactionMean = attentionReactionTimes.length
                    ? attentionReactionTimes.reduce((sum, value) => sum + value, 0) /
                      attentionReactionTimes.length
                    : null;
                  const normalizedName = normalizeParticipantHistoryName(record.participantId);
                  const history = reviewByName.get(normalizedName);
                  const exactProfileId = record.schemaVersion === 2
                    ? undefined
                    : record.participantProfileId;
                  const exactProfile = exactProfileId
                    ? profileById.get(exactProfileId)
                    : undefined;
                  const historicalProfile = profileByName.get(normalizedName);
                  const profile = exactProfile ?? historicalProfile;
                  const profileMatch = exactProfile
                    ? "profile-id" as const
                    : historicalProfile
                      ? "normalized-name" as const
                      : "none" as const;
                  const sessionFeedback = feedbackBySession.get(record.sessionId) ?? [];
                  const isExpanded = expandedSessionId === record.sessionId;
                  const detailsId = `admin-session-details-${record.sessionId}`;
                  const reviewTitle = history?.consistencyReview.reasons
                    .map((reason) => reason.label[language])
                    .join(" ");
                  return (
                    <Fragment key={record.sessionId}>
                      <tr>
                        <td>{record.participantId}</td>
                        <td>
                          {history?.consistencyReview.needsReview ? (
                            <details>
                              <summary className="admin-review-flag" title={reviewTitle} aria-label={tr(language, `Needs careful review: ${reviewTitle}`, `需要认真复核：${reviewTitle}`)}><span aria-hidden="true">⚠</span>{tr(language, "Review carefully", "认真复核")}</summary>
                              <ul className="admin-review-reasons">
                                {history.consistencyReview.reasons.map((reason) => (
                                  <li key={reason.key}>{reason.label[language]}</li>
                                ))}
                              </ul>
                            </details>
                          ) : <span aria-label={tr(language, "No automatic environment warning", "没有自动环境警告")}>—</span>}
                        </td>
                        <td>
                          <strong>{conditionLabel(record.conditionId, language)}</strong>
                          {profile ? <small>{profile.completedSequencePositions.length}/4 {tr(language, "current-protocol sessions complete", "项当前版本实验已完成")}</small> : null}
                        </td>
                        <td>{new Date(record.startedAtIso).toLocaleString(language === "zh" ? "zh-CN" : "en")}</td>
                        <td>v{record.schemaVersion}{record.schemaVersion !== 2 && record.studyBuildVersion ? <small>{record.studyBuildVersion}</small> : <small>{tr(language, "historical", "历史版本")}</small>}</td>
                        <td><span className={`status-pill ${record.status}`}>{record.status}</span></td>
                        <td>{v4?.preSurvey.sleepinessKss ?? v3?.preSurvey.sleepinessKss ?? "—"}</td>
                        <td>{v4?.postExposureSurvey?.sleepinessKss ?? v3?.postSurvey?.sleepinessKss ?? "—"}</td>
                        <td>{v4 ? (attentionReactionMean == null ? "—" : `${Math.round(attentionReactionMean)} ms`) : v3?.reactionTest?.averageReactionTimeMs == null ? "—" : `${Math.round(v3.reactionTest.averageReactionTimeMs)} ms`}</td>
                        <td>{v3?.conditionId === "control" ? tr(language, "N/A", "不适用") : `${hits}/${record.trials.length}`}</td>
                        <td>
                          {sessionFeedback.length ? sessionFeedback.map((item) => (
                            <details className="admin-feedback-details" key={item.feedbackId}>
                              <summary>{item.messageType === "question" ? tr(language, "Question", "问题") : tr(language, "Feedback", "反馈")}</summary>
                              <p className="admin-feedback-entry">{item.message}</p>
                              <small>{new Date(item.createdAt).toLocaleString(language === "zh" ? "zh-CN" : "en")}</small>
                            </details>
                          )) : "—"}
                        </td>
                        <td>
                          <div className="admin-file-actions">
                            <button type="button" onClick={() => downloadRemoteSession(session, "csv")}>CSV</button>
                            <button type="button" onClick={() => downloadRemoteSession(session, "json")}>JSON</button>
                          </div>
                        </td>
                        <td>
                          <button
                            className="admin-view-details-button"
                            type="button"
                            aria-expanded={isExpanded}
                            aria-controls={detailsId}
                            onClick={() => setExpandedSessionId(isExpanded ? null : record.sessionId)}
                          >
                            {isExpanded
                              ? tr(language, "Hide details", "收起详情")
                              : tr(language, "View details", "查看详情")}
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="admin-details-row">
                          <td colSpan={13}>
                            <div id={detailsId}>
                              <AdminSessionDetails
                                language={language}
                                session={session}
                                profile={profile ?? null}
                                profileMatch={profileMatch}
                                feedback={sessionFeedback}
                                history={history}
                                onDownload={(format) => downloadRemoteSession(session, format)}
                              />
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <button className="text-button" type="button" onClick={onExit}>{tr(language, "Back to participant setup", "返回参与者首页")}</button>
      </section>
    </main>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [language, setLanguage] = useState<Language>("en");
  const [participantId, setParticipantId] = useState("");
  const [participantAccountMode, setParticipantAccountMode] = useState<ParticipantAccountMode>("create");
  const [participantPassword, setParticipantPassword] = useState("");
  const [participantPasswordConfirmation, setParticipantPasswordConfirmation] = useState("");
  const [participantRecoveryCodeInput, setParticipantRecoveryCodeInput] = useState("");
  const [participantProfile, setParticipantProfile] = useState<LocalParticipantProfile | null>(null);
  const [participantProgress, setParticipantProgress] = useState<ParticipantProgress | null>(null);
  const [participantProgressStatus, setParticipantProgressStatus] = useState<ParticipantProgressStatus>("idle");
  const [profileChecking, setProfileChecking] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackSkipped, setFeedbackSkipped] = useState(false);
  const [conditionId, setConditionId] = useState<ConditionId | null>(null);
  const [formError, setFormError] = useState("");
  const [countdown, setCountdown] = useState(3);
  const [remainingMs, setRemainingMs] = useState(SESSION_DURATION_MS);
  const [target, setTarget] = useState<{ trialNumber: number; x: number; y: number } | null>(null);
  const [result, setResult] = useState<StudySessionRecord | null>(null);
  const [overnightRecord, setOvernightRecord] = useState<StudySessionRecord | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [draftProtection, setDraftProtection] = useState<DraftProtection>({
    sessionId: null,
    localSaved: false,
    remoteStatus: "idle",
  });
  const [restoringDraft, setRestoringDraft] = useState(true);
  const [useTouchControls, setUseTouchControls] = useState(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false;
    const coarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    return isTouchCapable(navigator.maxTouchPoints, coarsePointer);
  });
  const [touchEndArmed, setTouchEndArmed] = useState(false);
  const [remoteSave, setRemoteSave] = useState<{ sessionId: string | null; status: RemoteSaveStatus }>({
    sessionId: null,
    status: "idle",
  });
  const [detectedDevice, setDetectedDevice] = useState<DeviceInfo>(() => detectBrowserDeviceInfo());

  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const participantRef = useRef("");
  const participantProfileIdRef = useRef<string | null>(null);
  const participantProfileRef = useRef<LocalParticipantProfile | null>(null);
  const conditionRef = useRef<ConditionId>("bright-red");
  const sessionIdRef = useRef("");
  const resumeTokenRef = useRef("");
  const draftSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const startedAtIsoRef = useRef("");
  const stimulusStartedAtIsoRef = useRef<string | null>(null);
  const stimulusEndedAtIsoRef = useRef<string | null>(null);
  const startedAtPerformanceRef = useRef(0);
  const exposureActualDurationRef = useRef(0);
  const exposureWallClockDurationRef = useRef(0);
  const totalPausedMsRef = useRef(0);
  const currentPauseStartedPerformanceRef = useRef<number | null>(null);
  const plannedEndAtIsoRef = useRef<string | null>(null);
  const fullscreenAtStartRef = useRef(false);
  const fullscreenRequestFailedRef = useRef(false);
  const preSurveyRef = useRef<PreStudySurvey | null>(null);
  const deviceBeforeRef = useRef<DeviceInfo | null>(null);
  const exposureStatusRef = useRef<ExposureStatus>("not-started");
  const overnightRecordRef = useRef<StudySessionRecord | null>(null);
  const postSurveyRef = useRef<PostStudySurvey | null>(null);
  const postExposureSurveyRef = useRef<PostExposureSurvey | null>(null);
  const morningSurveyRef = useRef<MorningStudySurvey | null>(null);
  const trialPlanRef = useRef<PlannedTrial[]>([]);
  const nextPlannedTrialIndexRef = useRef(0);
  const trialsRef = useRef<TrialRecord[]>([]);
  const falseClicksRef = useRef<FalseClickRecord[]>([]);
  const pausesRef = useRef<PauseRecord[]>([]);
  const environmentEventsRef = useRef<EnvironmentEvent[]>([]);
  const activeTrialRef = useRef<TrialRecord | null>(null);
  const crossExpiresAtElapsedRef = useRef<number | null>(null);
  const pendingPlannedTrialRef = useRef<PlannedTrial | null>(null);
  const nextCrossTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideCrossTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endSequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchEndArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchEndArmedRef = useRef(false);
  const controlModeOverrideRef = useRef<"touch" | "keyboard" | null>(null);

  useEffect(() => {
    // The email-reminder prototype never shipped, but remove its preview-only
    // browser value once so no retired contact data can linger on test devices.
    try {
      localStorage.removeItem(RETIRED_EMAIL_PLAN_KEY);
    } catch {
      // Storage access is optional and must not block the study.
    }
  }, []);
  const paintFrameRef = useRef<number | null>(null);
  const scheduleNextCrossRef = useRef<() => void>(() => undefined);
  const displayActiveTrialRef = useRef<() => void>(() => undefined);
  const checkpointActiveExposureRef = useRef<(includeRemoteBackup?: boolean) => void>(() => undefined);
  const finishExposureRef = useRef<(status?: "completed" | "terminated") => void>(() => undefined);
  const applyRestoredRecordRef = useRef<(record: StudySessionRecord, resumeToken: string) => boolean>(
    () => false,
  );
  const endSequenceRef = useRef("");
  const terminationReasonRef = useRef<"end_sequence" | "touch_end" | "page_reload" | null>(null);
  const participantInputRef = useRef<HTMLInputElement>(null);

  const setupIsTestMode = isTestParticipantId(participantId);
  const setupIsAdminMode = isAdminParticipantId(participantId);
  const resultIsTestMode = result ? isTestParticipantId(result.participantId) : false;

  const setCurrentOvernightRecord = useCallback((record: StudySessionRecord | null) => {
    overnightRecordRef.current = record;
    setOvernightRecord(record);
  }, []);

  const changeLanguage = useCallback((nextLanguage: Language) => {
    setLanguage(nextLanguage);
    document.documentElement.lang = nextLanguage === "zh" ? "zh-CN" : "en";
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // Language selection remains active even when browser storage is disabled.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let preferred: Language = navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
      try {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (isLanguage(stored)) preferred = stored;
      } catch {
        // Browser preference remains a safe fallback.
      }
      setLanguage(preferred);
      document.documentElement.lang = preferred === "zh" ? "zh-CN" : "en";
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const storedProfile = loadLocalParticipantProfile();
      if (!storedProfile) return;
      setParticipantId(storedProfile.displayName);
      if ("credentialProof" in storedProfile) {
        setProfileChecking(true);
        setParticipantProgressStatus("loading");
        void fetchParticipantProgress(storedProfile).then((progress) => {
          if (cancelled) return;
          participantProfileRef.current = storedProfile;
          setParticipantProfile(storedProfile);
          setParticipantProgress(progress);
          setParticipantProgressStatus("loaded");
          setFormError("");
        }, () => {
          if (cancelled) return;
          participantProfileRef.current = null;
          setParticipantProfile(null);
          setParticipantProgress(null);
          setParticipantProgressStatus("failed");
          setParticipantAccountMode("signin");
          setFormError("This browser's saved sign-in could not be verified. Enter your password to sign in again; if the network is unavailable, try later. / 无法验证本浏览器保存的登录状态。请重新输入密码登录；如果网络不可用，请稍后再试。");
        }).finally(() => {
          if (!cancelled) setProfileChecking(false);
        });
      } else {
        setParticipantAccountMode("signin");
        setParticipantRecoveryCodeInput(storedProfile.recoveryCode);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    const updateControlMode = () => {
      if (controlModeOverrideRef.current) return;
      setUseTouchControls(isTouchCapable(navigator.maxTouchPoints, coarsePointer.matches));
    };
    const detectActualTouch = (event: PointerEvent) => {
      if (event.pointerType === "touch" && !controlModeOverrideRef.current) setUseTouchControls(true);
    };
    window.addEventListener("pointerdown", detectActualTouch, { capture: true });
    if (typeof coarsePointer.addEventListener === "function") {
      coarsePointer.addEventListener("change", updateControlMode);
      return () => {
        coarsePointer.removeEventListener("change", updateControlMode);
        window.removeEventListener("pointerdown", detectActualTouch, { capture: true });
      };
    }
    coarsePointer.addListener(updateControlMode);
    return () => {
      coarsePointer.removeListener(updateControlMode);
      window.removeEventListener("pointerdown", detectActualTouch, { capture: true });
    };
  }, []);

  const getActiveElapsedMs = useCallback((now = performance.now()) => {
    if (!startedAtPerformanceRef.current) return 0;
    const ongoingPauseMs = currentPauseStartedPerformanceRef.current === null
      ? 0
      : Math.max(0, now - currentPauseStartedPerformanceRef.current);
    return Math.max(0, Math.round(now - startedAtPerformanceRef.current - totalPausedMsRef.current - ongoingPauseMs));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(FINAL_STORAGE_KEY) || "[]");
        const saved = Array.isArray(parsed) ? parsed : [];
        const retained = saved.filter(isStoredSessionRecord);
        if (!Array.isArray(parsed) || retained.length !== saved.length) {
          localStorage.setItem(FINAL_STORAGE_KEY, JSON.stringify(retained));
        }
        void (async () => {
          for (const record of retained) {
            try {
              const profileRecord = record.schemaVersion === 3 || record.schemaVersion === 4
                ? record
                : null;
              const profile = profileRecord?.participantProfileId
                ? loadLocalParticipantProfiles().find((candidate) => candidate.profileId === profileRecord.participantProfileId)
                : null;
              if (profileRecord?.participantProfileId) {
                if (!profile) continue;
                await uploadProfileStudySession(profile, profileRecord);
              } else {
                await uploadStudySession(record);
              }
              removeStoredSession(record.sessionId);
            } catch {
              // Keep the failed final record for a later visit.
            }
          }
        })();
        setStorageAvailable(true);
      } catch {
        setStorageAvailable(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const applyRestoredRecord = (record: StudySessionRecord, resumeToken: string) => {
      if (cancelled) return false;
      const interrupted = record.exposureStatus === "in-progress";
      const restoredRecord = terminateInterruptedExposure(record);
      resumeTokenRef.current = resumeToken;
      participantRef.current = restoredRecord.participantId;
      participantProfileIdRef.current = restoredRecord.participantProfileId ?? null;
      const activeProfile = participantProfileRef.current;
      const rememberedProfile = loadLocalParticipantProfile(restoredRecord.participantId);
      const restoredProfile = (
        activeProfile &&
        activeProfile.displayName === restoredRecord.participantId &&
        (
          !restoredRecord.participantProfileId ||
          activeProfile.profileId === restoredRecord.participantProfileId
        )
      ) ? activeProfile : rememberedProfile;
      const matchingProfile = restoredProfile && (
        !restoredRecord.participantProfileId || restoredProfile.profileId === restoredRecord.participantProfileId
      ) ? restoredProfile : null;
      participantProfileRef.current = matchingProfile;
      setParticipantProfile(matchingProfile);
      if (matchingProfile) {
        setParticipantProgressStatus("loading");
        void fetchParticipantProgress(matchingProfile).then((progress) => {
          setParticipantProgress(progress);
          setParticipantProgressStatus("loaded");
        }, () => {
          setParticipantProgressStatus("failed");
          setFormError("Your overnight progress was restored, but the participant account could not be verified. Keep this browser record and contact the researcher before final submission. / 整晚进度已恢复，但无法验证参与者账户。请保留此浏览器中的记录，并在最终提交前联系研究者。");
        });
      } else {
        setParticipantProgressStatus("idle");
      }
      conditionRef.current = restoredRecord.conditionId;
      sessionIdRef.current = restoredRecord.sessionId;
      startedAtIsoRef.current = restoredRecord.startedAtIso;
      stimulusStartedAtIsoRef.current = restoredRecord.stimulusStartedAtIso;
      stimulusEndedAtIsoRef.current = restoredRecord.stimulusEndedAtIso;
      plannedEndAtIsoRef.current = restoredRecord.plannedEndAtIso;
      exposureActualDurationRef.current = restoredRecord.actualDurationMs;
      exposureWallClockDurationRef.current = restoredRecord.wallClockDurationMs;
      totalPausedMsRef.current = restoredRecord.totalPausedDurationMs;
      fullscreenAtStartRef.current = restoredRecord.fullscreenAtStart;
      fullscreenRequestFailedRef.current = restoredRecord.fullscreenRequestFailed;
      preSurveyRef.current = restoredRecord.preSurvey;
      deviceBeforeRef.current = restoredRecord.deviceInfo.beforeSleep;
      exposureStatusRef.current = restoredRecord.exposureStatus;
      terminationReasonRef.current = restoredRecord.terminationReason;
      postSurveyRef.current = restoredRecord.schemaVersion === 3 ? restoredRecord.postSurvey : null;
      postExposureSurveyRef.current = restoredRecord.schemaVersion === 4
        ? restoredRecord.postExposureSurvey
        : null;
      morningSurveyRef.current = restoredRecord.schemaVersion === 4
        ? restoredRecord.morningSurvey
        : null;
      trialPlanRef.current = restoredRecord.trialPlan.map((trial) => ({ ...trial }));
      trialsRef.current = restoredRecord.trials.map((trial) => ({ ...trial }));
      falseClicksRef.current = restoredRecord.falseClicks.map((click) => ({ ...click }));
      pausesRef.current = restoredRecord.pauses.map((pause) => ({ ...pause }));
      environmentEventsRef.current = restoredRecord.environmentEvents.map((event) => ({ ...event }));
      nextPlannedTrialIndexRef.current = restoredRecord.trials.length;
      activeRef.current = false;
      pausedRef.current = false;
      activeTrialRef.current = null;
      pendingPlannedTrialRef.current = null;
      currentPauseStartedPerformanceRef.current = null;
      startedAtPerformanceRef.current = 0;
      setRemainingMs(Math.max(0, SESSION_DURATION_MS - restoredRecord.actualDurationMs));
      setParticipantId(restoredRecord.participantId);
      setConditionId(restoredRecord.conditionId);
      const currentDevice = detectBrowserDeviceInfo();
      setDetectedDevice(currentDevice);
      setUseTouchControls(currentDevice.touchCapable);
      setCurrentOvernightRecord(restoredRecord);
      let localSaved = false;
      try {
        const localDraft: LocalOvernightDraft = {
          storageVersion: restoredRecord.schemaVersion === 4 ? 2 : 1,
          resumeToken,
          record: restoredRecord,
        };
        localStorage.setItem(OVERNIGHT_DRAFT_KEY, JSON.stringify(localDraft));
        setStorageAvailable(true);
        localSaved = true;
      } catch {
        setStorageAvailable(false);
      }
      setDraftProtection({ sessionId: restoredRecord.sessionId, localSaved, remoteStatus: "saving" });
      if (restoredRecord.schemaVersion === 4) {
        if (restoredRecord.morningReturnedAtIso) setPhase("morning-survey");
        else if (restoredRecord.sleepStartedAtIso) setPhase("awaiting-morning");
        else if (restoredRecord.postExposureSurvey) setPhase("sleep-ready");
        else if (restoredRecord.exposureStatus === "not-started") setPhase("instructions");
        else setPhase("post-exposure-survey");
      } else if (restoredRecord.postSurvey) setPhase("reaction-test");
      else if (restoredRecord.morningReturnedAtIso) setPhase("post-survey");
      else if (restoredRecord.sleepStartedAtIso) setPhase("awaiting-morning");
      else if (restoredRecord.exposureStatus === "not-started") setPhase("instructions");
      else setPhase("sleep-ready");

      return interrupted;
    };
    applyRestoredRecordRef.current = applyRestoredRecord;
    const persistInterruptedRecord = (record: StudySessionRecord, resumeToken: string) => {
      const matchingProfile = participantProfileRef.current;
      const saveOperation = draftSaveChainRef.current
        .catch(() => undefined)
        .then(() => (
          record.schemaVersion === 4 &&
          matchingProfile?.profileId === record.participantProfileId
            ? saveParticipantStudyDraft(matchingProfile, record, { keepalive: true })
            : saveStudyDraft(resumeToken, record, { keepalive: true })
        ));
      draftSaveChainRef.current = saveOperation;
      void saveOperation.then(
        () => setDraftProtection((currentProtection) => (
          currentProtection.sessionId === record.sessionId
            ? { ...currentProtection, remoteStatus: "saved" }
            : currentProtection
        )),
        () => setDraftProtection((currentProtection) => (
          currentProtection.sessionId === record.sessionId
            ? { ...currentProtection, remoteStatus: "failed" }
            : currentProtection
        )),
      );
    };
    const restoreDraft = async () => {
      let savedDraft: LocalOvernightDraft | null = null;
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(OVERNIGHT_DRAFT_KEY) || "null");
        if (
          typeof parsed === "object"
          && parsed !== null
          && "storageVersion" in parsed
          && (parsed.storageVersion === 1 || parsed.storageVersion === 2)
          && "resumeToken" in parsed
          && typeof parsed.resumeToken === "string"
          && /^[0-9a-f]{64}$/i.test(parsed.resumeToken)
          && "record" in parsed
          && (isStudySessionDraftV3(parsed.record) || isStudySessionDraftV4(parsed.record))
        ) {
          savedDraft = parsed as LocalOvernightDraft;
        }
      } catch {
        setStorageAvailable(false);
      }
      if (!savedDraft) {
        if (!cancelled) setRestoringDraft(false);
        return;
      }
      if (!isFreshDraft(savedDraft.record)) {
        try {
          localStorage.removeItem(OVERNIGHT_DRAFT_KEY);
        } catch {
          setStorageAvailable(false);
        }
        if (!cancelled) setRestoringDraft(false);
        return;
      }

      let interruptedRecord = applyRestoredRecord(savedDraft.record, savedDraft.resumeToken);
      const initiallyAppliedRecord = overnightRecordRef.current;
      setRestoringDraft(false);
      let remote: StudySessionRecord | null = null;
      let remoteLookupFailed = false;
      try {
        const restoredProfile = participantProfileRef.current;
        remote = savedDraft.record.schemaVersion === 4
          ? (
              restoredProfile?.profileId === savedDraft.record.participantProfileId
                ? await loadParticipantStudyDraft(restoredProfile)
                : null
            )
          : await loadStudyDraft(savedDraft.resumeToken);
        const liveCurrent = overnightRecordRef.current;
        if (
          remote
          && hasMoreStudyProgress(remote, savedDraft.record)
          && (
            !liveCurrent
            || liveCurrent === initiallyAppliedRecord
            || hasMoreStudyProgress(remote, liveCurrent)
          )
        ) {
          interruptedRecord = applyRestoredRecord(remote, savedDraft.resumeToken);
        }
      } catch {
        remoteLookupFailed = true;
      }

      const current = overnightRecordRef.current;
      if (interruptedRecord && current) {
        persistInterruptedRecord(current, savedDraft.resumeToken);
      } else {
        setDraftProtection((currentProtection) => (
          currentProtection.sessionId === savedDraft.record.sessionId
            ? {
                ...currentProtection,
                remoteStatus: !remoteLookupFailed && remote ? "saved" : "failed",
              }
            : currentProtection
        ));
      }
    };
    void restoreDraft();
    return () => {
      cancelled = true;
    };
  }, [setCurrentOvernightRecord]);

  const clearSessionTimers = useCallback(() => {
    if (nextCrossTimerRef.current) clearTimeout(nextCrossTimerRef.current);
    if (hideCrossTimerRef.current) clearTimeout(hideCrossTimerRef.current);
    if (endSessionTimerRef.current) clearTimeout(endSessionTimerRef.current);
    if (paintFrameRef.current !== null) cancelAnimationFrame(paintFrameRef.current);
    nextCrossTimerRef.current = null;
    hideCrossTimerRef.current = null;
    endSessionTimerRef.current = null;
    paintFrameRef.current = null;
  }, []);

  const clearTouchEndArm = useCallback(() => {
    if (touchEndArmTimerRef.current) clearTimeout(touchEndArmTimerRef.current);
    touchEndArmTimerRef.current = null;
    touchEndArmedRef.current = false;
    setTouchEndArmed(false);
  }, []);

  const clearEndSequence = useCallback(() => {
    if (endSequenceTimerRef.current) clearTimeout(endSequenceTimerRef.current);
    endSequenceTimerRef.current = null;
    endSequenceRef.current = "";
  }, []);

  const persistFinalLocally = useCallback((record: StudySessionRecord) => {
    if (isReservedParticipantId(record.participantId)) {
      setStorageAvailable(true);
      return true;
    }
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(FINAL_STORAGE_KEY) || "[]");
      const saved = Array.isArray(parsed) ? parsed : [];
      const next: StoredSessionRecord[] = saved
        .filter(isStoredSessionRecord)
        .filter((item) => item.sessionId !== record.sessionId);
      next.push(record);
      localStorage.setItem(FINAL_STORAGE_KEY, JSON.stringify(next));
      setStorageAvailable(true);
      return true;
    } catch {
      setStorageAvailable(false);
      return false;
    }
  }, []);

  const saveRemoteRecord = useCallback((record: StudySessionRecord, onSuccess?: () => void) => {
    if (isReservedParticipantId(record.participantId)) return;
    setRemoteSave({ sessionId: record.sessionId, status: "saving" });
    const profile = participantProfileRef.current;
    const saveRequest = record.participantProfileId
      ? profile?.profileId === record.participantProfileId
        ? uploadProfileStudySession(profile, record, { keepalive: true })
        : Promise.reject(new Error("The participant profile credential is unavailable."))
      : uploadStudySession(record, { keepalive: true });
    void saveRequest.then(
      () => {
        if (!removeStoredSession(record.sessionId)) setStorageAvailable(false);
        onSuccess?.();
        if (profile) {
          setParticipantProgressStatus("loading");
          void fetchParticipantProgress(profile).then((progress) => {
            setParticipantProgress(progress);
            setParticipantProgressStatus("loaded");
          }, () => setParticipantProgressStatus("failed"));
        }
        setRemoteSave((current) => (
          current.sessionId === record.sessionId
            ? { sessionId: record.sessionId, status: "saved" }
            : current
        ));
      },
      () => setRemoteSave((current) => (
        current.sessionId === record.sessionId
          ? { sessionId: record.sessionId, status: "failed" }
          : current
      )),
    );
  }, []);

  const saveOvernightDraft = useCallback((
    record: StudySessionRecord,
    options: { requireLocal?: boolean } = {},
  ) => {
    if (isTestParticipantId(record.participantId)) {
      setCurrentOvernightRecord(record);
      setDraftProtection({ sessionId: record.sessionId, localSaved: false, remoteStatus: "idle" });
      return true;
    }
    const token = resumeTokenRef.current;
    let localSaved = false;
    try {
      const localDraft: LocalOvernightDraft = {
        storageVersion: record.schemaVersion === 4 ? 2 : 1,
        resumeToken: token,
        record,
      };
      localStorage.setItem(OVERNIGHT_DRAFT_KEY, JSON.stringify(localDraft));
      setStorageAvailable(true);
      localSaved = true;
    } catch {
      setStorageAvailable(false);
    }
    setDraftProtection({
      sessionId: record.sessionId,
      localSaved,
      remoteStatus: options.requireLocal && !localSaved ? "failed" : "saving",
    });
    if (options.requireLocal && !localSaved) return false;
    setCurrentOvernightRecord(record);
    const profile = participantProfileRef.current;
    const saveOperation = draftSaveChainRef.current
      .catch(() => undefined)
      .then(() => (
        record.schemaVersion === 4 && profile?.profileId === record.participantProfileId
          ? saveParticipantStudyDraft(profile, record, { keepalive: true })
          : saveStudyDraft(token, record, { keepalive: true })
      ));
    draftSaveChainRef.current = saveOperation;
    void saveOperation.then(
      () => setDraftProtection((current) => (
        current.sessionId === record.sessionId ? { ...current, remoteStatus: "saved" } : current
      )),
      () => setDraftProtection((current) => (
        current.sessionId === record.sessionId ? { ...current, remoteStatus: "failed" } : current
      )),
    );
    return localSaved;
  }, [setCurrentOvernightRecord]);

  const deleteLocalOvernightDraft = useCallback((record: StudySessionRecord) => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(OVERNIGHT_DRAFT_KEY) || "null");
      if (
        typeof parsed === "object"
        && parsed !== null
        && "record" in parsed
        && typeof parsed.record === "object"
        && parsed.record !== null
        && "sessionId" in parsed.record
        && parsed.record.sessionId === record.sessionId
      ) {
        localStorage.removeItem(OVERNIGHT_DRAFT_KEY);
      }
    } catch {
      setStorageAvailable(false);
    }
  }, []);

  const deleteRemoteOvernightDraft = useCallback((record: StudySessionRecord) => {
    const profile = participantProfileRef.current;
    if (
      record.schemaVersion === 4 &&
      profile?.profileId === record.participantProfileId
    ) {
      draftSaveChainRef.current = draftSaveChainRef.current
        .catch(() => undefined)
        .then(() => deleteParticipantStudyDraft(profile, record.sessionId).then(() => undefined));
    } else if (!isTestParticipantId(record.participantId) && resumeTokenRef.current) {
      const token = resumeTokenRef.current;
      draftSaveChainRef.current = draftSaveChainRef.current
        .catch(() => undefined)
        .then(() => deleteStudyDraft(token));
    }
  }, []);

  const requestTouchEnd = useCallback(() => {
    if (touchEndArmedRef.current) {
      clearTouchEndArm();
      terminationReasonRef.current = "touch_end";
      finishExposureRef.current("terminated");
      return;
    }
    touchEndArmedRef.current = true;
    setTouchEndArmed(true);
    touchEndArmTimerRef.current = setTimeout(() => {
      touchEndArmTimerRef.current = null;
      touchEndArmedRef.current = false;
      setTouchEndArmed(false);
    }, 3000);
  }, [clearTouchEndArm]);

  useEffect(() => () => {
    if (touchEndArmTimerRef.current) clearTimeout(touchEndArmTimerRef.current);
  }, []);

  const closeCurrentPause = useCallback(() => {
    const pauseStarted = currentPauseStartedPerformanceRef.current;
    if (pauseStarted === null) return;
    const durationMs = Math.max(0, Math.round(performance.now() - pauseStarted));
    const pause = pausesRef.current.at(-1);
    if (pause && pause.endedAtIso === null) {
      pause.endedAtIso = new Date().toISOString();
      pause.durationMs = durationMs;
    }
    totalPausedMsRef.current += durationMs;
    currentPauseStartedPerformanceRef.current = null;
    pausedRef.current = false;
  }, []);

  const buildExposureRecord = useCallback((conditionIdForRecord: V4ConditionId): StudySessionRecordV4 => {
    const condition = CONDITION_MAP[conditionIdForRecord];
    const beforeSleep = deviceBeforeRef.current;
    const preSurvey = preSurveyRef.current;
    if (!beforeSleep || !preSurvey) throw new Error("The pre-study questionnaire is incomplete.");
    const participantProfileId = participantProfileIdRef.current ??
      (isTestParticipantId(participantRef.current) ? TEST_PROFILE_ID : null);
    if (!participantProfileId) throw new Error("The participant account is not available.");
    return {
      schemaVersion: 4,
      protocolVersion: "overnight-v2",
      sequenceVersion: "fixed-four-v1",
      sequencePosition: sequencePositionForCondition(conditionIdForRecord),
      attentionProtocolVersion: "sparse-4-50-70-v1",
      sessionId: sessionIdRef.current,
      participantId: participantRef.current,
      participantProfileId,
      studyBuildVersion: STUDY_BUILD_VERSION,
      conditionId: conditionIdForRecord,
      conditionName: condition.name,
      stimulusColorHex: condition.color as string,
      stimulusColorRgb: condition.rgb as string,
      plannedDurationMs: SESSION_DURATION_MS,
      plannedEndAtIso: plannedEndAtIsoRef.current,
      actualDurationMs: exposureActualDurationRef.current,
      wallClockDurationMs: exposureWallClockDurationRef.current,
      totalPausedDurationMs: totalPausedMsRef.current,
      crossVisibleMs: CROSS_VISIBLE_MS,
      startedAtIso: startedAtIsoRef.current,
      stimulusStartedAtIso: stimulusStartedAtIsoRef.current,
      stimulusEndedAtIso: stimulusEndedAtIsoRef.current,
      sleepStartedAtIso: null,
      morningReturnedAtIso: null,
      assessmentCompletedAtIso: null,
      endedAtIso: null,
      status: "active",
      exposureStatus: exposureStatusRef.current === "not-applicable"
        ? "not-started"
        : exposureStatusRef.current,
      terminationReason: terminationReasonRef.current,
      fullscreenAtStart: fullscreenAtStartRef.current,
      fullscreenRequestFailed: fullscreenRequestFailedRef.current,
      deviceInfo: { beforeSleep, afterWaking: null, deviceChanged: null },
      preSurvey,
      postExposureSurvey: postExposureSurveyRef.current,
      morningSurvey: morningSurveyRef.current,
      trialPlan: trialPlanRef.current.map((trial) => ({ ...trial })),
      trials: trialsRef.current.map((trial) => ({ ...trial })),
      falseClicks: falseClicksRef.current.map((click) => ({ ...click })),
      pauses: pausesRef.current.map((pause) => ({ ...pause })),
      environmentEvents: environmentEventsRef.current.map((event) => ({ ...event })),
    };
  }, []);

  const checkpointActiveExposure = useCallback((includeRemoteBackup = false) => {
    if (!activeRef.current || conditionRef.current === "control") return;
    const nowPerformance = performance.now();
    exposureActualDurationRef.current = Math.min(
      SESSION_DURATION_MS,
      getActiveElapsedMs(nowPerformance),
    );
    exposureWallClockDurationRef.current = Math.max(
      0,
      Math.round(nowPerformance - startedAtPerformanceRef.current),
    );

    let record: StudySessionRecordV4;
    try {
      record = buildExposureRecord(conditionRef.current as V4ConditionId);
      record.totalPausedDurationMs = Math.max(
        record.totalPausedDurationMs,
        record.wallClockDurationMs - record.actualDurationMs,
      );
      const openPause = record.pauses.at(-1);
      if (openPause?.endedAtIso === null && currentPauseStartedPerformanceRef.current !== null) {
        openPause.durationMs = Math.max(
          openPause.durationMs,
          Math.round(nowPerformance - currentPauseStartedPerformanceRef.current),
        );
      }
      overnightRecordRef.current = record;
    } catch {
      return;
    }

    if (isTestParticipantId(record.participantId)) return;
    const resumeToken = resumeTokenRef.current;
    try {
      const localDraft: LocalOvernightDraft = {
        storageVersion: 1,
        resumeToken,
        record,
      };
      localStorage.setItem(OVERNIGHT_DRAFT_KEY, JSON.stringify(localDraft));
    } catch {
      setStorageAvailable(false);
      setDraftProtection((current) => (
        current.sessionId === record.sessionId ? { ...current, localSaved: false } : current
      ));
    }

    if (includeRemoteBackup) {
      const saveOperation = draftSaveChainRef.current
        .catch(() => undefined)
        .then(() => saveStudyDraft(resumeToken, record, { keepalive: true }));
      draftSaveChainRef.current = saveOperation;
      void saveOperation.catch(() => undefined);
    }
  }, [buildExposureRecord, getActiveElapsedMs]);

  useEffect(() => {
    checkpointActiveExposureRef.current = checkpointActiveExposure;
  }, [checkpointActiveExposure]);

  useEffect(() => {
    if (phase !== "running" && phase !== "paused") return;
    const interval = window.setInterval(() => checkpointActiveExposure(false), 5000);
    const onPageHide = () => checkpointActiveExposure(true);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [checkpointActiveExposure, phase]);

  const displayActiveTrial = useCallback(() => {
    const trial = activeTrialRef.current;
    if (!activeRef.current || pausedRef.current || !trial || trial.status !== "pending") return;
    flushSync(() => setTarget({ trialNumber: trial.trialNumber, x: trial.crossXPercent, y: trial.crossYPercent }));

    const markMissed = () => {
      if (activeRef.current && !pausedRef.current && activeTrialRef.current === trial && trial.status === "pending") {
        trial.status = "missed";
        activeTrialRef.current = null;
        crossExpiresAtElapsedRef.current = null;
        setTarget(null);
        checkpointActiveExposureRef.current();
      }
    };

    if (trial.appearedElapsedMs === null) {
      paintFrameRef.current = requestAnimationFrame(() => {
        paintFrameRef.current = null;
        if (!activeRef.current || pausedRef.current || activeTrialRef.current !== trial) return;
        trial.appearedElapsedMs = getActiveElapsedMs();
        trial.appearedAtIso = new Date().toISOString();
        crossExpiresAtElapsedRef.current = trial.appearedElapsedMs + CROSS_VISIBLE_MS;
        checkpointActiveExposureRef.current();
        hideCrossTimerRef.current = setTimeout(markMissed, CROSS_VISIBLE_MS);
      });
      return;
    }

    const expiresAt = crossExpiresAtElapsedRef.current ?? trial.appearedElapsedMs + CROSS_VISIBLE_MS;
    crossExpiresAtElapsedRef.current = expiresAt;
    const visibleTimeRemaining = Math.max(0, expiresAt - getActiveElapsedMs());
    if (visibleTimeRemaining === 0) markMissed();
    else hideCrossTimerRef.current = setTimeout(markMissed, visibleTimeRemaining);
  }, [getActiveElapsedMs]);

  useEffect(() => {
    displayActiveTrialRef.current = displayActiveTrial;
  }, [displayActiveTrial]);

  const showCross = useCallback((plannedTrial: PlannedTrial) => {
    if (!activeRef.current || pausedRef.current) return;
    const lateness = getActiveElapsedMs() - plannedTrial.plannedOnsetMs;
    if (document.hidden || lateness > CROSS_VISIBLE_MS) {
      trialsRef.current.push({
        ...plannedTrial,
        status: "omitted",
        appearedElapsedMs: null,
        appearedAtIso: null,
        clickedElapsedMs: null,
        clickedAtIso: null,
        reactionTimeMs: null,
        inputMethod: null,
        clickXPercent: null,
        clickYPercent: null,
      });
      checkpointActiveExposureRef.current();
      scheduleNextCrossRef.current();
      return;
    }
    const trial: TrialRecord = {
      ...plannedTrial,
      status: "pending",
      appearedElapsedMs: null,
      appearedAtIso: null,
      clickedElapsedMs: null,
      clickedAtIso: null,
      reactionTimeMs: null,
      inputMethod: null,
      clickXPercent: null,
      clickYPercent: null,
    };
    trialsRef.current.push(trial);
    activeTrialRef.current = trial;
    crossExpiresAtElapsedRef.current = null;
    displayActiveTrialRef.current();
    scheduleNextCrossRef.current();
  }, [getActiveElapsedMs]);

  const scheduleNextCross = useCallback(() => {
    if (!activeRef.current || pausedRef.current || nextCrossTimerRef.current) return;
    const plannedTrial = pendingPlannedTrialRef.current ?? trialPlanRef.current[nextPlannedTrialIndexRef.current];
    if (!plannedTrial) return;
    pendingPlannedTrialRef.current = plannedTrial;
    const delay = Math.max(0, plannedTrial.plannedOnsetMs - getActiveElapsedMs());
    nextCrossTimerRef.current = setTimeout(() => {
      nextCrossTimerRef.current = null;
      if (!activeRef.current || pausedRef.current) return;
      pendingPlannedTrialRef.current = null;
      nextPlannedTrialIndexRef.current += 1;
      showCross(plannedTrial);
    }, delay);
  }, [getActiveElapsedMs, showCross]);

  useEffect(() => {
    scheduleNextCrossRef.current = scheduleNextCross;
  }, [scheduleNextCross]);

  const finishExposure = useCallback((status: "completed" | "terminated" = "completed") => {
    if (!activeRef.current) return;
    clearTouchEndArm();
    clearEndSequence();
    closeCurrentPause();
    const nowPerformance = performance.now();
    exposureActualDurationRef.current = Math.min(SESSION_DURATION_MS, getActiveElapsedMs(nowPerformance));
    exposureWallClockDurationRef.current = Math.max(0, Math.round(nowPerformance - startedAtPerformanceRef.current));
    activeRef.current = false;
    pausedRef.current = false;
    clearSessionTimers();

    if (activeTrialRef.current?.status === "pending") {
      activeTrialRef.current.status = status === "terminated"
        ? "cancelled"
        : activeTrialRef.current.appearedAtIso
          ? "missed"
          : "omitted";
    }
    activeTrialRef.current = null;
    crossExpiresAtElapsedRef.current = null;
    pendingPlannedTrialRef.current = null;
    setTarget(null);

    if (status === "completed") {
      const recordedTrialNumbers = new Set(trialsRef.current.map((trial) => trial.trialNumber));
      for (const plannedTrial of trialPlanRef.current) {
        if (recordedTrialNumbers.has(plannedTrial.trialNumber)) continue;
        trialsRef.current.push({
          ...plannedTrial,
          status: "omitted",
          appearedElapsedMs: null,
          appearedAtIso: null,
          clickedElapsedMs: null,
          clickedAtIso: null,
          reactionTimeMs: null,
          inputMethod: null,
          clickXPercent: null,
          clickYPercent: null,
        });
      }
    }
    trialsRef.current.sort((left, right) => left.trialNumber - right.trialNumber);
    exposureStatusRef.current = status;
    terminationReasonRef.current = status === "terminated"
      ? terminationReasonRef.current ?? "end_sequence"
      : null;
    stimulusEndedAtIsoRef.current = new Date().toISOString();
    setRemainingMs(Math.max(0, SESSION_DURATION_MS - exposureActualDurationRef.current));

    try {
      const record = buildExposureRecord(conditionRef.current as V4ConditionId);
      saveOvernightDraft(record);
      setPhase("post-exposure-survey");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : tr(language, "The overnight record could not be prepared.", "无法准备整晚实验记录。"));
      setPhase("setup");
    }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [buildExposureRecord, clearEndSequence, clearSessionTimers, clearTouchEndArm, closeCurrentPause, getActiveElapsedMs, language, saveOvernightDraft]);

  useEffect(() => {
    finishExposureRef.current = finishExposure;
  }, [finishExposure]);

  const pauseSession = useCallback(() => {
    if (!activeRef.current || pausedRef.current) return;
    clearTouchEndArm();
    clearEndSequence();
    pausedRef.current = true;
    const now = performance.now();
    const activeElapsedMs = getActiveElapsedMs(now);
    clearSessionTimers();
    setTarget(null);
    currentPauseStartedPerformanceRef.current = now;
    pausesRef.current.push({
      pauseNumber: pausesRef.current.length + 1,
      startedElapsedMs: activeElapsedMs,
      startedAtIso: new Date().toISOString(),
      endedAtIso: null,
      durationMs: 0,
    });
    checkpointActiveExposureRef.current();
    setRemainingMs(Math.max(0, SESSION_DURATION_MS - activeElapsedMs));
    setPhase("paused");
  }, [clearEndSequence, clearSessionTimers, clearTouchEndArm, getActiveElapsedMs]);

  const resumeSession = useCallback(() => {
    if (!activeRef.current || !pausedRef.current) return;
    clearTouchEndArm();
    clearEndSequence();
    closeCurrentPause();
    const remaining = Math.max(0, SESSION_DURATION_MS - getActiveElapsedMs());
    if (remaining === 0) {
      finishExposureRef.current("completed");
      return;
    }
    plannedEndAtIsoRef.current = new Date(Date.now() + remaining).toISOString();
    checkpointActiveExposureRef.current();
    setRemainingMs(remaining);
    setPhase("running");
    displayActiveTrialRef.current();
    scheduleNextCrossRef.current();
    endSessionTimerRef.current = setTimeout(() => finishExposureRef.current("completed"), remaining);
  }, [clearEndSequence, clearTouchEndArm, closeCurrentPause, getActiveElapsedMs]);

  useEffect(() => {
    const recordEnvironmentEvent = (type: EnvironmentEvent["type"]) => {
      if (!activeRef.current) return;
      environmentEventsRef.current.push({ type, elapsedMs: getActiveElapsedMs(), atIso: new Date().toISOString() });
    };
    const onVisibilityChange = () => {
      if (document.hidden && !pausedRef.current && activeTrialRef.current?.status === "pending") {
        activeTrialRef.current.status = activeTrialRef.current.appearedAtIso ? "missed" : "omitted";
        activeTrialRef.current = null;
        crossExpiresAtElapsedRef.current = null;
        if (hideCrossTimerRef.current) clearTimeout(hideCrossTimerRef.current);
        hideCrossTimerRef.current = null;
        if (paintFrameRef.current !== null) cancelAnimationFrame(paintFrameRef.current);
        paintFrameRef.current = null;
        setTarget(null);
      }
      recordEnvironmentEvent(document.hidden ? "visibility_hidden" : "visibility_visible");
      if (document.hidden) checkpointActiveExposureRef.current(true);
      if (!document.hidden && activeRef.current && !pausedRef.current && getActiveElapsedMs() >= SESSION_DURATION_MS) {
        finishExposureRef.current("completed");
      }
    };
    const onFullscreenChange = () => {
      recordEnvironmentEvent(document.fullscreenElement ? "fullscreen_entered" : "fullscreen_exited");
      checkpointActiveExposureRef.current();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [getActiveElapsedMs]);

  const beginRunning = useCallback(() => {
    startedAtPerformanceRef.current = performance.now();
    const startedAtEpoch = Date.now();
    stimulusStartedAtIsoRef.current = new Date(startedAtEpoch).toISOString();
    plannedEndAtIsoRef.current = new Date(startedAtEpoch + SESSION_DURATION_MS).toISOString();
    exposureStatusRef.current = "in-progress";
    terminationReasonRef.current = null;
    fullscreenAtStartRef.current = Boolean(document.fullscreenElement);
    activeRef.current = true;
    pausedRef.current = false;
    setRemainingMs(SESSION_DURATION_MS);
    try {
      const locallyProtected = saveOvernightDraft(
        buildExposureRecord(conditionRef.current as V4ConditionId),
        { requireLocal: true },
      );
      if (!locallyProtected && !isTestParticipantId(participantRef.current)) {
        throw new Error("Browser storage became unavailable. The exposure has not started; enable site storage and try again.");
      }
    } catch (error) {
      activeRef.current = false;
      exposureStatusRef.current = "not-started";
      stimulusStartedAtIsoRef.current = null;
      plannedEndAtIsoRef.current = null;
      fullscreenAtStartRef.current = false;
      setFormError(error instanceof Error ? error.message : "The exposure record could not be prepared.");
      setPhase("instructions");
      return;
    }
    setPhase("running");
    scheduleNextCross();
    endSessionTimerRef.current = setTimeout(() => finishExposureRef.current("completed"), SESSION_DURATION_MS);
  }, [buildExposureRecord, saveOvernightDraft, scheduleNextCross]);

  useEffect(() => {
    if (phase !== "countdown") return;
    countdownTimerRef.current = setTimeout(() => {
      if (countdown > 1) setCountdown((value) => value - 1);
      else beginRunning();
    }, 1000);
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    };
  }, [beginRunning, countdown, phase]);

  useEffect(() => {
    if (phase !== "running") return;
    const updateRemaining = () => {
      const remaining = Math.max(0, SESSION_DURATION_MS - getActiveElapsedMs());
      setRemainingMs(remaining);
      if (remaining === 0) finishExposureRef.current("completed");
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(timer);
  }, [getActiveElapsedMs, phase]);

  useEffect(() => () => {
    activeRef.current = false;
    clearSessionTimers();
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    if (endSequenceTimerRef.current) clearTimeout(endSequenceTimerRef.current);
  }, [clearSessionTimers]);

  const registerResponse = useCallback((
    method: AttentionInputMethod,
    clickXPercent: number | null = null,
    clickYPercent: number | null = null,
  ) => {
    if (!activeRef.current || pausedRef.current) return;
    const clickedElapsedMs = getActiveElapsedMs();
    const clickedAtIso = new Date().toISOString();
    const trial = activeTrialRef.current;
    if (trial?.status === "pending" && trial.appearedElapsedMs !== null) {
      if (hideCrossTimerRef.current) clearTimeout(hideCrossTimerRef.current);
      hideCrossTimerRef.current = null;
      trial.status = "hit";
      trial.clickedElapsedMs = clickedElapsedMs;
      trial.clickedAtIso = clickedAtIso;
      trial.reactionTimeMs = Math.max(0, clickedElapsedMs - trial.appearedElapsedMs);
      trial.inputMethod = method;
      trial.clickXPercent = clickXPercent;
      trial.clickYPercent = clickYPercent;
      activeTrialRef.current = null;
      crossExpiresAtElapsedRef.current = null;
      setTarget(null);
      checkpointActiveExposureRef.current();
      return;
    }
    falseClicksRef.current.push({ clickedElapsedMs, clickedAtIso, inputMethod: method, clickXPercent, clickYPercent });
    checkpointActiveExposureRef.current();
  }, [getActiveElapsedMs]);

  const continueToCountdown = useCallback(() => {
    if (phase !== "instructions") return;
    if (!isTestParticipantId(participantRef.current) && !draftProtection.localSaved) {
      const record = overnightRecordRef.current;
      if (!record || !saveOvernightDraft(record, { requireLocal: true })) {
        setFormError("Browser storage is unavailable. Enable site storage, then press Start again so overnight progress can be recovered.");
        return;
      }
    }
    setFormError("");
    setCountdown(3);
    setPhase("countdown");
    if (!document.fullscreenElement) {
      if (typeof document.documentElement.requestFullscreen !== "function") {
        fullscreenRequestFailedRef.current = true;
        return;
      }
      void document.documentElement.requestFullscreen().catch(() => {
        fullscreenRequestFailedRef.current = true;
      });
    }
  }, [draftProtection.localSaved, phase, saveOvernightDraft]);

  useEffect(() => {
    if (phase !== "instructions" && phase !== "running" && phase !== "paused") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (phase === "instructions") {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          continueToCountdown();
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        clearEndSequence();
        if (pausedRef.current) resumeSession();
        else pauseSession();
        return;
      }
      if (key === "e" || key === "n" || key === "d") {
        event.preventDefault();
        const expected = "end"[endSequenceRef.current.length];
        endSequenceRef.current = key === expected ? `${endSequenceRef.current}${key}` : key === "e" ? "e" : "";
        if (endSequenceTimerRef.current) clearTimeout(endSequenceTimerRef.current);
        if (endSequenceRef.current === "end") {
          endSequenceRef.current = "";
          terminationReasonRef.current = "end_sequence";
          finishExposureRef.current("terminated");
          return;
        }
        endSequenceTimerRef.current = setTimeout(() => {
          endSequenceRef.current = "";
        }, 2500);
        return;
      }
      endSequenceRef.current = "";
      if (endSequenceTimerRef.current) clearTimeout(endSequenceTimerRef.current);
      if (phase === "running" && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        registerResponse(event.key === " " ? "space" : "enter");
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearEndSequence();
    };
  }, [clearEndSequence, continueToCountdown, pauseSession, phase, registerResponse, resumeSession]);

  const initializeSession = (
    cleanParticipantId: string,
    selectedConditionId: V4ConditionId,
    participantProfileId: string | null = null,
  ) => {
    participantRef.current = cleanParticipantId;
    participantProfileIdRef.current = participantProfileId;
    conditionRef.current = selectedConditionId;
    sessionIdRef.current = makeSessionId();
    resumeTokenRef.current = makeResumeToken();
    activeRef.current = false;
    pausedRef.current = false;
    startedAtIsoRef.current = "";
    stimulusStartedAtIsoRef.current = null;
    stimulusEndedAtIsoRef.current = null;
    startedAtPerformanceRef.current = 0;
    exposureActualDurationRef.current = 0;
    exposureWallClockDurationRef.current = 0;
    totalPausedMsRef.current = 0;
    currentPauseStartedPerformanceRef.current = null;
    plannedEndAtIsoRef.current = null;
    fullscreenAtStartRef.current = false;
    fullscreenRequestFailedRef.current = false;
    preSurveyRef.current = null;
    deviceBeforeRef.current = null;
    exposureStatusRef.current = "not-started";
    postSurveyRef.current = null;
    postExposureSurveyRef.current = null;
    morningSurveyRef.current = null;
    trialPlanRef.current = makeTrialPlan();
    nextPlannedTrialIndexRef.current = 0;
    pendingPlannedTrialRef.current = null;
    trialsRef.current = [];
    falseClicksRef.current = [];
    pausesRef.current = [];
    environmentEventsRef.current = [];
    activeTrialRef.current = null;
    crossExpiresAtElapsedRef.current = null;
    terminationReasonRef.current = null;
    endSequenceRef.current = "";
    setTarget(null);
    setResult(null);
    setCurrentOvernightRecord(null);
    setRemoteSave({ sessionId: null, status: "idle" });
    setFeedbackSubmitted(false);
    setFeedbackSkipped(false);
    setDraftProtection({ sessionId: null, localSaved: false, remoteStatus: "idle" });
    setCountdown(3);
    setRemainingMs(SESSION_DURATION_MS);
    const device = detectBrowserDeviceInfo();
    setDetectedDevice(device);
    setUseTouchControls(device.touchCapable);
    controlModeOverrideRef.current = null;
  };

  const openAssignedSession = async (
    profile: LocalParticipantProfile,
    progress: ParticipantProgress,
  ) => {
    const remoteDraft = await loadParticipantStudyDraft(profile);
    if (remoteDraft && isFreshDraft(remoteDraft)) {
      const resumeToken = makeResumeToken();
      applyRestoredRecordRef.current(remoteDraft, resumeToken);
      setFormError(tr(
        language,
        "Your unfinished session was restored from your account.",
        "已从你的账户恢复未完成的实验。",
      ));
      return;
    }
    if (remoteDraft) {
      await deleteParticipantStudyDraft(profile, remoteDraft.sessionId).catch(() => undefined);
    }
    const assignedCondition = progress.nextConditionId;
    if (!assignedCondition) {
      setConditionId(null);
      setFormError(tr(
        language,
        "You have completed all four assigned sessions. No additional condition is available.",
        "你已经完成全部四次指定实验，目前没有新的条件。",
      ));
      return;
    }
    setConditionId(assignedCondition);
    initializeSession(profile.displayName, assignedCondition, profile.profileId);
    setFormError("");
    setPhase("tutorial");
  };

  const startSession = async () => {
    if (restoringDraft) {
      setFormError(tr(language, "Please wait while this browser checks for saved overnight progress.", "请稍候，浏览器正在检查已保存的整晚实验进度。"));
      return;
    }
    const cleanParticipantId = normalizeParticipantName(participantId);
    if (isAdminParticipantId(cleanParticipantId)) {
      setFormError("");
      setConditionId(null);
      setResult(null);
      setPhase("admin");
      return;
    }
    if (!cleanParticipantId || (isTestParticipantId(cleanParticipantId) && !conditionId)) {
      setFormError(tr(language, "Enter your study name. Test mode must also select a condition.", "请输入实验姓名；测试模式还需要选择一个条件。"));
      requestAnimationFrame(() => {
        if (!cleanParticipantId) participantInputRef.current?.focus();
        else document.querySelector<HTMLInputElement>('input[name="light-condition"]')?.focus();
      });
      return;
    }
    if (!isTestParticipantId(cleanParticipantId) && !isValidParticipantName(cleanParticipantId)) {
      setFormError(tr(language, "Use a study name between 1 and 80 characters without control characters. A nickname is recommended.", "实验姓名需为 1–80 个字符且不能包含控制字符。建议使用不暴露身份的网名。"));
      participantInputRef.current?.focus();
      return;
    }
    if (isTestParticipantId(cleanParticipantId)) {
      try {
        if (!conditionId || !(V4_CONDITION_ORDER as readonly string[]).includes(conditionId)) {
          throw new Error("Select one of the four current protocol conditions.");
        }
        participantProfileRef.current = null;
        setParticipantProfile(null);
        setParticipantProgress(null);
        setParticipantProgressStatus("idle");
        initializeSession(cleanParticipantId, conditionId as V4ConditionId);
        setFormError("");
        setPhase("tutorial");
      } catch (error) {
        setFormError(error instanceof Error ? error.message : tr(language, "This browser cannot begin the overnight protocol.", "此浏览器无法开始整晚实验。"));
      }
      return;
    }

    const activeProfile = participantProfileRef.current;
    if (
      activeProfile
      && normalizeParticipantName(activeProfile.displayName).toLowerCase() === cleanParticipantId.toLowerCase()
    ) {
      let progress = participantProgress;
      if (participantProgressStatus !== "loaded" || !progress) {
        setProfileChecking(true);
        setParticipantProgressStatus("loading");
        try {
          progress = await fetchParticipantProgress(activeProfile);
          setParticipantProgress(progress);
          setParticipantProgressStatus("loaded");
        } catch {
          setParticipantProgressStatus("failed");
          setFormError(tr(
            language,
            "Your account is remembered, but its progress could not be loaded. Check the connection and press Begin again, or sign out and sign in with your password.",
            "浏览器记住了你的账户，但暂时无法读取进度。请检查网络后再次点击开始，或退出后使用密码重新登录。",
          ));
          return;
        } finally {
          setProfileChecking(false);
        }
      }
      if (!progress) return;
      setProfileChecking(true);
      try {
        await openAssignedSession(activeProfile, progress);
      } catch {
        setFormError(tr(
          language,
          "Your account opened, but its unfinished session could not be checked. Check the connection and try again.",
          "账户已打开，但暂时无法检查未完成的实验。请检查网络后重试。",
        ));
      } finally {
        setProfileChecking(false);
      }
      return;
    }

    if (!isValidParticipantPassword(participantPassword)) {
      setFormError(tr(language, "Use a password containing 8–128 characters.", "请输入 8–128 个字符的密码。"));
      document.getElementById("participant-password")?.focus();
      return;
    }

    const suppliedRecoveryCode = participantRecoveryCodeInput.trim();
    if (suppliedRecoveryCode && !isValidRecoveryCode(suppliedRecoveryCode)) {
      setFormError(tr(language, "The recovery code should contain 20 characters using A–Z or 2–7. Check it and try again.", "恢复码应包含 20 个字符，只使用 A–Z 或数字 2–7。请检查后重试。"));
      return;
    }
    if (
      (participantAccountMode === "create" || suppliedRecoveryCode)
      && participantPassword !== participantPasswordConfirmation
    ) {
      setFormError(tr(language, "The two passwords do not match.", "两次输入的密码不一致。"));
      document.getElementById("participant-password-confirmation")?.focus();
      return;
    }

    setProfileChecking(true);
    setFormError("");
    let openedProfile: LocalParticipantProfile | null = null;
    try {
      const rememberedProfile = loadLocalParticipantProfile(cleanParticipantId);
      const rememberedLegacyCode = rememberedProfile && "recoveryCode" in rememberedProfile
        ? rememberedProfile.recoveryCode
        : null;
      const legacyCode = suppliedRecoveryCode
        ? normalizeRecoveryCode(suppliedRecoveryCode)
        : rememberedLegacyCode;
      const localProfile = legacyCode
        ? await upgradeLegacyParticipantAccount(cleanParticipantId, legacyCode, participantPassword)
        : participantAccountMode === "create"
          ? await registerParticipantAccount(cleanParticipantId, participantPassword)
          : await signInParticipantAccount(cleanParticipantId, participantPassword);
      openedProfile = localProfile;
      if (!rememberLocalParticipantProfile(localProfile)) setStorageAvailable(false);
      participantProfileRef.current = localProfile;
      setParticipantProfile(localProfile);
      setParticipantProgress(null);
      setParticipantProgressStatus("loading");
      setParticipantId(localProfile.displayName);
      setParticipantPassword("");
      setParticipantPasswordConfirmation("");
      setParticipantRecoveryCodeInput("");
      const progress = await fetchParticipantProgress(localProfile);
      setParticipantProgress(progress);
      setParticipantProgressStatus("loaded");
      await openAssignedSession(localProfile, progress);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (openedProfile) {
        setParticipantProgressStatus("failed");
        setParticipantAccountMode("signin");
        setFormError(tr(
          language,
          "Your account was opened, but its progress could not be loaded. Check the connection and press Begin again; the account and its previous records were not lost.",
          "账户已经打开，但暂时无法读取进度。请检查网络后再次点击开始；账户和以前的记录都没有丢失。",
        ));
        return;
      }
      const nameConflict = /already in use|already has an account/i.test(message);
      const credentialMismatch = /did not match|authentication failed|could not be opened|recovery code/i.test(message);
      const serviceUnavailable = /failed to fetch|network|could not find|not found|schema cache|unavailable/i.test(message);
      setFormError(nameConflict
        ? tr(
          language,
          "This study name already has an account. Choose Sign in, or use a different unique nickname.",
          "这个实验姓名已经有账户。请选择“登录”，或使用另一个独一无二的网名。",
        )
        : credentialMismatch
          ? tr(
            language,
            "The study name and password did not match. Check both and try again. Older accounts can be upgraded with their original recovery code.",
            "实验姓名与密码不匹配，请检查后重试。旧账户可以使用原来的恢复码升级。",
          )
        : serviceUnavailable
          ? tr(
            language,
            "The profile service is temporarily unavailable. Please try again later.",
            "档案服务暂时不可用，请稍后重试。",
          )
          : tr(
          language,
          message || "The profile service is temporarily unavailable. Please try again later.",
          "档案服务暂时不可用，请稍后重试。",
          ));
    } finally {
      setProfileChecking(false);
    }
  };

  const submitPreSurvey = (survey: PreStudySurvey, deviceInfo: DeviceInfo) => {
    preSurveyRef.current = survey;
    deviceBeforeRef.current = deviceInfo;
    startedAtIsoRef.current = survey.answeredAtIso;
    setUseTouchControls(deviceInfo.touchCapable);
    try {
      const record = buildExposureRecord(conditionRef.current as V4ConditionId);
      saveOvernightDraft(record);
      setFormError("");
      setPhase("instructions");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : tr(language, "The overnight record could not be prepared.", "无法准备整晚实验记录。"));
      setPhase("setup");
    }
  };

  const markSleepStarted = () => {
    const record = overnightRecordRef.current;
    if (!record) return;
    if (record.schemaVersion === 4 && !record.postExposureSurvey) return;
    const sleepStartedAt = new Date();
    const nextRecord: StudySessionRecord = {
      ...record,
      sleepStartedAtIso: sleepStartedAt.toISOString(),
    };
    const savedLocally = saveOvernightDraft(nextRecord, { requireLocal: true });
    if (!savedLocally && !isTestParticipantId(record.participantId)) {
      setFormError(tr(language, "The sleep-start checkpoint could not be saved in this browser. Enable site storage and try again before closing the page.", "无法在此浏览器保存入睡节点。请允许网站存储，然后在关闭页面前重试。"));
      return;
    }
    setFormError("");
    setPhase("awaiting-morning");
  };

  const continueAfterWaking = () => {
    const record = overnightRecordRef.current;
    if (!record || !record.sleepStartedAtIso) return;
    const afterWaking = detectBrowserDeviceInfo();
    const nextRecord: StudySessionRecord = {
      ...record,
      morningReturnedAtIso: new Date().toISOString(),
      deviceInfo: {
        ...record.deviceInfo,
        afterWaking,
        deviceChanged: afterWaking.confirmedCategory !== record.deviceInfo.beforeSleep.confirmedCategory,
      },
    };
    setDetectedDevice(afterWaking);
    setUseTouchControls(afterWaking.touchCapable);
    const savedLocally = saveOvernightDraft(nextRecord, { requireLocal: true });
    if (!savedLocally && !isTestParticipantId(record.participantId)) {
      setFormError(tr(language, "The morning checkpoint could not be saved in this browser. Enable site storage and try again.", "无法在此浏览器保存早晨节点，请允许网站存储后重试。"));
      return;
    }
    setFormError("");
    setPhase(record.schemaVersion === 4 ? "morning-survey" : "post-survey");
  };

  const submitPostSurvey = (survey: PostStudySurvey, afterWakingDevice: DeviceInfo) => {
    const record = overnightRecordRef.current;
    if (!record || record.schemaVersion !== 3) return;
    postSurveyRef.current = survey;
    const nextRecord: StudySessionRecordV3 = {
      ...record,
      postSurvey: survey,
      deviceInfo: {
        ...record.deviceInfo,
        afterWaking: afterWakingDevice,
        deviceChanged: afterWakingDevice.confirmedCategory !== record.deviceInfo.beforeSleep.confirmedCategory,
      },
    };
    const savedLocally = saveOvernightDraft(nextRecord, { requireLocal: true });
    if (!savedLocally && !isTestParticipantId(record.participantId)) {
      setFormError(tr(language, "The post-sleep questionnaire could not be saved in this browser. Enable site storage and submit again.", "无法在此浏览器保存睡后问卷，请允许网站存储后重新提交。"));
      return;
    }
    setFormError("");
    setPhase("reaction-test");
  };

  const completeReactionTest = (reactionTest: ReactionTestRecord) => {
    const record = overnightRecordRef.current;
    if (
      !record ||
      record.schemaVersion !== 3 ||
      !record.postSurvey ||
      !record.deviceInfo.afterWaking
    ) return;
    const endedAtIso = reactionTest.completedAtIso;
    const completedRecord: StudySessionRecordV3 = {
      ...record,
      status: "completed",
      assessmentCompletedAtIso: endedAtIso,
      endedAtIso,
      reactionTest,
    };
    const isTestMode = isTestParticipantId(completedRecord.participantId);
    if (!isStudySessionRecordV3(completedRecord, { allowReservedParticipantId: isTestMode })) {
      setResult(completedRecord);
      setFormError(tr(language, "The completed study record did not pass validation. Download the recovery JSON and contact the researcher before closing this page.", "完成的实验记录未通过验证。请下载恢复 JSON，并在关闭页面前联系研究者。"));
      setPhase("results");
      return;
    }
    const finalSavedLocally = persistFinalLocally(completedRecord);
    if (finalSavedLocally) {
      deleteLocalOvernightDraft(completedRecord);
      clearReactionTestProgress(completedRecord.sessionId);
    }
    setCurrentOvernightRecord(null);
    setFormError("");
    setResult(completedRecord);
    setPhase("results");
    saveRemoteRecord(completedRecord, () => {
      deleteLocalOvernightDraft(completedRecord);
      deleteRemoteOvernightDraft(completedRecord);
      clearReactionTestProgress(completedRecord.sessionId);
    });
  };

  const submitPostExposureSurvey = (survey: PostExposureSurvey) => {
    const record = overnightRecordRef.current;
    if (!record || record.schemaVersion !== 4 || !record.stimulusEndedAtIso) return;
    postExposureSurveyRef.current = survey;
    const nextRecord: StudySessionRecordV4 = {
      ...record,
      postExposureSurvey: survey,
    };
    const savedLocally = saveOvernightDraft(nextRecord, { requireLocal: true });
    if (!savedLocally && !isTestParticipantId(record.participantId)) {
      setFormError(tr(
        language,
        "The immediate sleepiness scale could not be saved. Enable site storage and submit again.",
        "无法保存画面结束后的困倦量表。请允许网站存储后重新提交。",
      ));
      return;
    }
    setFormError("");
    setPhase("sleep-ready");
  };

  const submitMorningSurvey = (survey: MorningStudySurvey, afterWakingDevice: DeviceInfo) => {
    const record = overnightRecordRef.current;
    if (
      !record ||
      record.schemaVersion !== 4 ||
      !record.postExposureSurvey ||
      !record.morningReturnedAtIso
    ) return;
    morningSurveyRef.current = survey;
    const endedAtIso = survey.answeredAtIso;
    const completedRecord: StudySessionRecordV4 = {
      ...record,
      status: record.exposureStatus === "terminated" ? "terminated" : "completed",
      assessmentCompletedAtIso: endedAtIso,
      endedAtIso,
      morningSurvey: survey,
      deviceInfo: {
        ...record.deviceInfo,
        afterWaking: afterWakingDevice,
        deviceChanged:
          afterWakingDevice.confirmedCategory !== record.deviceInfo.beforeSleep.confirmedCategory,
      },
    };
    const isTestMode = isTestParticipantId(completedRecord.participantId);
    if (!isStudySessionRecordV4(completedRecord, { allowReservedParticipantId: isTestMode })) {
      setResult(completedRecord);
      setFormError(tr(
        language,
        "The completed study record did not pass validation. Download the recovery JSON and contact the researcher before closing this page.",
        "完成的实验记录未通过验证。请下载恢复 JSON，并在关闭页面前联系研究者。",
      ));
      setPhase("results");
      return;
    }
    const finalSavedLocally = persistFinalLocally(completedRecord);
    if (finalSavedLocally) deleteLocalOvernightDraft(completedRecord);
    setCurrentOvernightRecord(null);
    setFormError("");
    setResult(completedRecord);
    setPhase("results");
    saveRemoteRecord(completedRecord, () => {
      deleteLocalOvernightDraft(completedRecord);
      deleteRemoteOvernightDraft(completedRecord);
    });
  };

  const summary = useMemo(() => {
    if (!result) return null;
    const hits = result.trials.filter((trial) => trial.status === "hit");
    const misses = result.trials.filter((trial) => trial.status === "missed").length;
    const omitted = result.trials.filter((trial) => trial.status === "omitted").length;
    const cancelled = result.trials.filter((trial) => trial.status === "cancelled").length;
    const meanAttentionReactionTime = hits.length
      ? Math.round(hits.reduce((total, trial) => total + (trial.reactionTimeMs || 0), 0) / hits.length)
      : null;
    const shownTrials = hits.length + misses;
    return {
      hits: hits.length,
      misses,
      omitted,
      cancelled,
      falseClicks: result.falseClicks.length,
      pauses: result.pauses.length,
      totalPausedDurationMs: result.totalPausedDurationMs,
      meanAttentionReactionTime,
      accuracy: shownTrials ? Math.round((hits.length / shownTrials) * 100) : null,
    };
  }, [result]);

  const exportResult = (format: "csv" | "json") => {
    if (!result || isReservedParticipantId(result.participantId)) return;
    const safeParticipant = safeFilenamePart(result.participantId);
    const baseName = `sleep-light-${safeParticipant}-${result.conditionId}`;
    if (format === "csv") {
      downloadFile(`${baseName}.csv`, sessionToCsv(result), "text/csv;charset=utf-8");
    } else {
      downloadFile(`${baseName}.json`, JSON.stringify(result, null, 2), "application/json;charset=utf-8");
    }
  };

  const submitSessionFeedback = async (payload: SessionFeedbackPayload) => {
    if (!result) throw new Error("No completed session is available.");
    if (resultIsTestMode) {
      setFeedbackSubmitted(true);
      return;
    }
    const profile = participantProfileRef.current;
    if (!profile || profile.profileId !== result.participantProfileId) {
      throw new Error("The participant profile is unavailable.");
    }
    if (remoteSave.sessionId !== result.sessionId || remoteSave.status !== "saved") {
      throw new Error("The session must be saved before feedback can be attached.");
    }
    setFeedbackSaving(true);
    try {
      await submitParticipantFeedback(profile, {
        sessionId: result.sessionId,
        ...payload,
        studyBuildVersion: STUDY_BUILD_VERSION,
      });
      setFeedbackSubmitted(true);
    } finally {
      setFeedbackSaving(false);
    }
  };

  const resetToSetup = () => {
    const activeProfile = participantProfileRef.current;
    setParticipantId(activeProfile?.displayName ?? "");
    setParticipantPassword("");
    setParticipantPasswordConfirmation("");
    setParticipantRecoveryCodeInput("");
    setConditionId(null);
    setResult(null);
    setParticipantProfile(activeProfile);
    if (activeProfile) {
      setParticipantProgressStatus("loading");
      void fetchParticipantProgress(activeProfile).then((progress) => {
        setParticipantProgress(progress);
        setParticipantProgressStatus("loaded");
      }, () => setParticipantProgressStatus("failed"));
    } else {
      setParticipantProgress(null);
      setParticipantProgressStatus("idle");
      participantProfileIdRef.current = null;
    }
    setFeedbackSaving(false);
    setFeedbackSubmitted(false);
    setFeedbackSkipped(false);
    setCurrentOvernightRecord(null);
    setRemoteSave({ sessionId: null, status: "idle" });
    setDraftProtection({ sessionId: null, localSaved: false, remoteStatus: "idle" });
    setFormError("");
    resumeTokenRef.current = "";
    setPhase("setup");
  };

  if (phase === "admin") {
    return <AdminPortal language={language} onExit={resetToSetup} />;
  }

  if (phase === "tutorial" && conditionId) {
    return (
      <StudyTutorial
        language={language}
        displayName={participantId}
        assignedConditionId={conditionId as V4ConditionId}
        completedSequencePositions={participantProgress?.completedSequencePositions ?? []}
        isTestMode={setupIsTestMode}
        onContinue={() => setPhase("practice")}
      />
    );
  }

  if (phase === "pre-survey") {
    return <PreStudySurveyForm language={language} detectedDevice={detectedDevice} onSubmit={submitPreSurvey} />;
  }

  if (phase === "practice") {
    return (
      <AttentionPractice
        language={language}
        useTouchControls={useTouchControls}
        onControlModeChange={(next) => {
          controlModeOverrideRef.current = next ? "touch" : "keyboard";
          setUseTouchControls(next);
        }}
        onComplete={() => setPhase("pre-survey")}
      />
    );
  }

  if (phase === "instructions") {
    return (
      <main className="instructions-screen">
        <section className="instructions-card" aria-labelledby="instructions-title">
          <p className="eyebrow">{useTouchControls ? tr(language, "Touch-device instructions", "触屏设备说明") : tr(language, "Keyboard instructions", "电脑键盘说明")}</p>
          <h1 id="instructions-title">{tr(language, "Stay focused on the screen.", "请持续专注屏幕。")}</h1>
          <p className="instructions-lead">
            {tr(language, "Up to four black crosses will appear about 50–70 seconds apart during the five-minute light exposure.", "五分钟光照期间最多出现四次黑色十字，间隔约为 50–70 秒。")}
          </p>
          <ul className="instruction-list" data-control-mode={useTouchControls ? "touch" : "keyboard"}>
            <li>
              <span>+</span>
              <p>
                {tr(language, "When a black cross appears, immediately ", "黑色十字出现时，请立即")}
                <strong>{useTouchControls ? tr(language, "tap anywhere on the color", "点击彩色画面任意位置") : tr(language, "click anywhere", "点击任意位置")}</strong>
                {useTouchControls ? "。" : <>{tr(language, " or press ", "，或按")}<kbd>Space</kbd>{tr(language, ".", "键。")}</>}
              </p>
            </li>
            {useTouchControls ? (
              <>
                <li><span>Ⅱ</span><p>{tr(language, "Use ", "使用底部的")}<strong>{tr(language, "Pause", "暂停")}</strong>{tr(language, " at the bottom. Tap ", "按钮；点击")}<strong>{tr(language, "Resume", "继续")}</strong>{tr(language, " to continue.", "即可继续。")}</p></li>
                <li><span>END</span><p>{tr(language, "To end the light exposure early, tap End twice within three seconds.", "如需提前结束光照，请在三秒内连续点击两次“结束”。")}</p></li>
              </>
            ) : (
              <>
                <li><span>P</span><p>{tr(language, "Press ", "按")}<kbd>P</kbd>{tr(language, " to pause. Press P again to continue.", "暂停，再按一次 P 继续。")}</p></li>
                <li><span>END</span><p>{tr(language, "To end the light exposure early, type E, then N, then D.", "如需提前结束光照，请依次输入 E、N、D。")}</p></li>
              </>
            )}
          </ul>
          <p className="instruction-reminder">
            {language === "zh"
              ? <><strong>不要切换应用、查看消息、浏览网页或使用另一个屏幕。</strong>没有十字时的点击或多余点击也会被记录。如果画面造成不适，请<strong>立即停止</strong>。</>
              : <><strong>Do not switch apps, read messages, browse, or use another screen during the five-minute display.</strong> Responses made when no cross is visible are recorded. <strong>Stop if the display causes discomfort.</strong></>}
          </p>
          {!setupIsTestMode ? (
            <p
              className={`draft-save-note ${draftProtection.localSaved ? "saved" : "unavailable"}`}
              role={draftProtection.localSaved ? "status" : "alert"}
            >
              {draftProtection.localSaved
                ? tr(language, "This session can be recovered in this browser if the page closes.", "即使网页关闭，也可在此浏览器恢复本次实验。")
                : tr(language, "Browser storage is unavailable. Enable site storage before starting the exposure.", "浏览器存储不可用，请在开始光照前允许网站存储。")}
            </p>
          ) : null}
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          <button
            className="control-mode-switch"
            type="button"
            onClick={() => {
              const nextMode = useTouchControls ? "keyboard" : "touch";
              controlModeOverrideRef.current = nextMode;
              setUseTouchControls(nextMode === "touch");
              clearTouchEndArm();
              clearEndSequence();
            }}
          >
            {tr(language, "Wrong controls? Use ", "控制方式不对？切换为")}{useTouchControls ? tr(language, "computer instructions", "电脑说明") : tr(language, "touch-device instructions", "触屏设备说明")}
          </button>
          <button
            className="primary-button instruction-start"
            onClick={continueToCountdown}
          >
            {tr(language, "I understand — start exposure", "我已了解——开始光照")}
          </button>
          <small>
            {useTouchControls
              ? tr(language, "Tap the button to start. Full screen will open when supported.", "点击按钮开始；设备支持时将进入全屏。")
              : tr(language, "Press Space or Enter to start. Full screen will open next.", "也可按空格或回车开始，随后将进入全屏。")}
          </small>
        </section>
      </main>
    );
  }

  if (phase === "countdown") {
    return (
      <main className="countdown-screen" aria-live="assertive">
        <p>{tr(language, "Light exposure begins in", "光照将在倒计时后开始")}</p>
        <strong key={countdown}>{countdown}</strong>
        <span>{useTouchControls ? tr(language, "Tap the color", "点击彩色画面") : tr(language, "Click or press Space", "点击或按空格")}{tr(language, " when a black cross appears.", "，当黑色十字出现时作出反应。")}</span>
      </main>
    );
  }

  if (phase === "paused") {
    return (
      <main className={`paused-screen ${useTouchControls ? "touch-controls-active" : ""}`} aria-live="assertive">
        <div className="paused-card">
          <p>{tr(language, "Light exposure paused", "光照已暂停")}</p>
          <h1>{tr(language, "Paused", "已暂停")}</h1>
          <span>{tr(language, "The five-minute exposure timer is frozen.", "五分钟光照计时器已停止。")}</span>
          <strong>{useTouchControls ? tr(language, "Use the controls below to continue", "使用下方按钮继续") : tr(language, "Press P to continue", "按 P 继续")}</strong>
          <small>{useTouchControls ? tr(language, "Tap End twice to end the exposure early.", "连续点击两次“结束”可提前结束。") : tr(language, "Type E, N, D to end the exposure early.", "依次输入 E、N、D 可提前结束。")}</small>
        </div>
        <div className="session-countdown paused" role="timer" aria-label={tr(language, `${formatRemainingTime(remainingMs)} remaining`, `剩余 ${formatRemainingTime(remainingMs)}`)}>
          {formatRemainingTime(remainingMs)}
        </div>
        {useTouchControls ? (
          <TouchSessionControls
            language={language}
            paused
            endArmed={touchEndArmed}
            onPauseToggle={() => {
              clearTouchEndArm();
              resumeSession();
            }}
            onEnd={requestTouchEnd}
          />
        ) : null}
      </main>
    );
  }

  if (phase === "running") {
    const stimulus = CONDITION_MAP[conditionId ?? "bright-red"];
    return (
      <>
        <main
          className={`stimulus-screen ${useTouchControls ? "touch-controls-active" : ""}`}
          style={{ backgroundColor: stimulus.color ?? "#000" }}
          onPointerDown={(event) => {
            if (!event.isPrimary) return;
            if (event.pointerType === "mouse" && event.button !== 0) return;
            event.preventDefault();
            registerResponse(
              "pointer",
              Number(((event.clientX / window.innerWidth) * 100).toFixed(2)),
              Number(((event.clientY / window.innerHeight) * 100).toFixed(2)),
            );
          }}
          onContextMenu={(event) => event.preventDefault()}
          aria-label={tr(language, `${stimulus.name} visual attention stimulus. ${useTouchControls ? "Tap" : "Click or press Space"} when the black cross appears.`, `${conditionLabel(stimulus.id, language)}视觉注意刺激。黑色十字出现时${useTouchControls ? "点击屏幕" : "点击或按空格"}。`)}
        >
          <span className="sr-only" aria-live="polite">{target ? tr(language, `Attention cross ${target.trialNumber} is visible`, `第 ${target.trialNumber} 个注意十字已出现`) : tr(language, "Watch the screen", "请注视屏幕")}</span>
          {target ? (
            <span className="attention-cross" style={{ left: `${target.x}%`, top: `${target.y}%` }} aria-hidden="true" />
          ) : null}
          <div className="session-countdown" role="timer" aria-label={tr(language, `${formatRemainingTime(remainingMs)} remaining`, `剩余 ${formatRemainingTime(remainingMs)}`)}>
            {formatRemainingTime(remainingMs)}
          </div>
        </main>
        {useTouchControls ? (
          <TouchSessionControls
            language={language}
            paused={false}
            endArmed={touchEndArmed}
            onPauseToggle={() => {
              clearTouchEndArm();
              pauseSession();
            }}
            onEnd={requestTouchEnd}
          />
        ) : null}
      </>
    );
  }

  if (phase === "post-exposure-survey") {
    return (
      <PostExposureSurveyForm
        language={language}
        saveError={formError}
        onSubmit={submitPostExposureSurvey}
      />
    );
  }

  if (phase === "sleep-ready" && overnightRecord) {
    const isControl = overnightRecord.conditionId === "control";
    const isTestMode = isTestParticipantId(overnightRecord.participantId);
    const protectionClass = draftProtection.localSaved
      ? draftProtection.remoteStatus === "saved"
        ? "saved"
        : draftProtection.remoteStatus === "failed"
          ? "local-only"
          : "saving"
      : "unavailable";
    return (
      <main className="overnight-shell">
        <section className="overnight-card" aria-labelledby="sleep-ready-title">
          <p className="eyebrow">{tr(language, "Screen exposure and immediate scale saved", "屏幕暴露和即时量表已保存")}</p>
          <h1 id="sleep-ready-title">{tr(language, "Go to bed at your normal time.", "请在平常时间上床睡觉。")}</h1>
          <p>
            {isControl
              ? tr(language, "This is the control condition. No color or brightness stimulus was shown.", "这是对照条件，没有播放任何颜色或亮度刺激。")
              : overnightRecord.exposureStatus === "terminated"
                ? tr(language, "The light exposure ended early, and that event has been recorded.", "光照已提前结束，此事件已经记录。")
                : tr(language, "The five-minute light exposure is complete.", "五分钟光照已经完成。")}
          </p>
          <div className="overnight-status-grid">
            <div><span>{tr(language, "Condition", "实验条件")}</span><strong>{conditionLabel(overnightRecord.conditionId, language)}</strong></div>
            <div><span>{tr(language, "Pre-exposure Karolinska Sleepiness Scale", "光照前卡罗林斯卡困倦量表")}</span><strong>{overnightRecord.preSurvey.sleepinessKss} / 9</strong></div>
            <div><span>{tr(language, "Device", "设备")}</span><strong>{deviceCategoryLabel(overnightRecord.deviceInfo.beforeSleep.confirmedCategory, language)}</strong></div>
          </div>
          <p className="overnight-guidance">
            {tr(language, "Do not go to bed earlier or later for the experiment. At your normal bedtime, press the button below and put the device away. After waking, return within 48 hours; sign in again if you use another browser or device.", "不要为了实验提前或推迟上床。在平常睡觉时间点击下方按钮并放下设备。睡醒后请在 48 小时内返回；若使用其他浏览器或设备，请重新登录。")}
          </p>
          <p className={`draft-save-note ${protectionClass}`} role="status">
            {isTestMode
              ? tr(language, "Test mode does not save this overnight record.", "测试模式不会保存整晚实验记录。")
              : draftProtection.localSaved && draftProtection.remoteStatus === "saved"
                ? tr(language, "Overnight progress is protected remotely and in this browser.", "整晚进度已在远程和此浏览器中受到保护。")
                : draftProtection.localSaved && draftProtection.remoteStatus === "failed"
                  ? tr(language, "Overnight progress is saved in this browser; remote backup is temporarily unavailable.", "整晚进度已保存在此浏览器；远程备份暂时不可用。")
                  : draftProtection.localSaved && draftProtection.remoteStatus === "saving"
                    ? tr(language, "Protecting overnight progress…", "正在保护整晚进度…")
                    : tr(language, "Browser storage is unavailable, so the recovery key cannot be retained. Do not close this page.", "浏览器存储不可用，无法保留恢复信息，请不要关闭此页面。")}
          </p>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          <button
            className="primary-button overnight-primary"
            type="button"
            onClick={markSleepStarted}
          >
            {tr(language, "I am going to sleep now", "我要睡觉了")}
          </button>
        </section>
      </main>
    );
  }

  if (phase === "awaiting-morning" && overnightRecord) {
    return (
      <main className="overnight-shell morning-return-shell">
        <section className="overnight-card" aria-labelledby="morning-return-title">
          <p className="eyebrow">{tr(language, "Overnight pause", "整晚等待")}</p>
          <h1 id="morning-return-title">{tr(language, "Sleep normally. Return here after waking.", "请正常睡眠，醒来后返回此页。")}</h1>
          <p>{tr(language, "The browser may be closed or the device may be locked. After your normal sleep, sign in again on any browser if needed; your saved progress can be restored.", "可以关闭浏览器或锁定设备。按照平常方式睡醒后，如有需要，可在任意浏览器重新登录并恢复已保存进度。")}</p>
          <div className="overnight-status-grid">
            <div><span>{tr(language, "Study name", "实验姓名")}</span><strong>{overnightRecord.participantId}</strong></div>
            <div><span>{tr(language, "Sleep marked at", "标记入睡时间")}</span><strong>{formatDateTime(overnightRecord.sleepStartedAtIso, language)}</strong></div>
            <div><span>{tr(language, "Condition", "实验条件")}</span><strong>{conditionLabel(overnightRecord.conditionId, language)}</strong></div>
          </div>
          <p className="overnight-guidance">{tr(language, "There is no required washout day in this website. Follow the researcher's assigned schedule; consecutive-night sessions are allowed.", "网站不强制要求间隔一天。请按照研究者安排的日期和顺序；可以连续两晚进行不同实验。")}</p>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          <button
            className="primary-button overnight-primary"
            type="button"
            onClick={continueAfterWaking}
          >
            {tr(language, "I have woken up — continue", "我已经醒来——继续")}
          </button>
        </section>
      </main>
    );
  }

  if (phase === "morning-survey") {
    return (
      <MorningSurveyForm
        language={language}
        detectedDevice={detectedDevice}
        saveError={formError}
        onSubmit={submitMorningSurvey}
      />
    );
  }

  if (phase === "post-survey") {
    return (
      <PostStudySurveyForm
        language={language}
        detectedDevice={detectedDevice}
        saveError={formError}
        onSubmit={submitPostSurvey}
      />
    );
  }

  if (phase === "reaction-test" && overnightRecord && overnightRecord.schemaVersion === 3) {
    return (
      <ReactionTest
        language={language}
        sessionId={overnightRecord.sessionId}
        useTouchControls={useTouchControls}
        shouldPersistProgress={!isTestParticipantId(overnightRecord.participantId)}
        onComplete={completeReactionTest}
      />
    );
  }

  if (phase === "results" && result && summary) {
    const isCurrentProtocol = result.schemaVersion === 4;
    const reactionMean = isCurrentProtocol
      ? summary.meanAttentionReactionTime
      : result.reactionTest?.averageReactionTimeMs ?? null;
    const alreadyCompletedPositions = new Set(
      participantProgress?.completedSequencePositions ?? [],
    );
    if (
      isCurrentProtocol &&
      result.exposureStatus === "completed"
    ) alreadyCompletedPositions.add(result.sequencePosition);
    const completedCount = alreadyCompletedPositions.size;
    const remainingCount = Math.max(0, 4 - completedCount);
    return (
      <main className="results-shell">
        <section className="results-card">
          <div className="complete-mark" aria-hidden="true">✓</div>
          <p className="eyebrow">{result.exposureStatus === "terminated"
            ? tr(language, "Exposure ended early", "光照提前结束")
            : resultIsTestMode
              ? tr(language, "Test mode", "测试模式")
              : tr(language, "Session complete", "本次实验已完成")}</p>
          <h1>{resultIsTestMode ? tr(language, "Test session complete.", "测试实验完成。") : tr(language, "Thank you. The full record is complete.", "谢谢，完整实验记录已完成。")}</h1>
          <p className="results-lead">
            {tr(language, "Study name ", "实验姓名 ")}<strong>{result.participantId}</strong>{tr(language, " completed the ", " 已完成 ")}<strong>{conditionLabel(result.conditionId, language)}</strong>{tr(language, " session.", " 条件。")}
          </p>

          <div className="result-stats" aria-label={tr(language, "Session summary", "实验汇总")}>
            <div><span>{tr(language, "Pre-exposure Karolinska Sleepiness Scale", "光照前卡罗林斯卡困倦量表")}</span><strong>{result.preSurvey.sleepinessKss}<small> / 9</small></strong></div>
            <div><span>{isCurrentProtocol ? tr(language, "Post-exposure Karolinska Sleepiness Scale", "光照后卡罗林斯卡困倦量表") : tr(language, "Legacy after-waking Karolinska Sleepiness Scale", "旧版睡醒后卡罗林斯卡困倦量表")}</span><strong>{isCurrentProtocol ? result.postExposureSurvey?.sleepinessKss ?? "—" : result.postSurvey?.sleepinessKss ?? "—"}<small> / 9</small></strong></div>
            <div><span>{tr(language, "Exposure reaction mean", "观看期间平均反应时间")}</span><strong>{reactionMean == null ? "—" : Math.round(reactionMean)}<small>{reactionMean == null ? "" : " ms"}</small></strong></div>
            <div><span>{tr(language, "Time watched", "实际观看时长")}</span><strong>{(result.actualDurationMs / 1000).toFixed(1)}<small> s</small></strong></div>
          </div>

          {isCurrentProtocol && !resultIsTestMode ? (
            <p className="session-event-summary" role="status">
              <strong>{completedCount}</strong> {tr(language, "complete", "项已完成")}
              <span>·</span>
              <strong>{remainingCount}</strong> {tr(language, "remaining", "项待完成")}
            </p>
          ) : null}

          {result.conditionId !== "control" ? (
            <p className="session-event-summary">
              <strong>{summary.hits}</strong> {tr(language, summary.hits === 1 ? "attention response" : "attention responses", "次十字反应")}
              <span>·</span>
              <strong>{summary.misses}</strong> {tr(language, "missed", "次错过")}
              <span>·</span>
              <strong>{summary.falseClicks}</strong> {tr(language, summary.falseClicks === 1 ? "no-cross or extra response" : "no-cross or extra responses", "次无十字或多余反应")}
              <span>·</span>
              <strong>{summary.pauses}</strong> {tr(language, summary.pauses === 1 ? "pause" : "pauses", "次暂停")}
            </p>
          ) : (
            <p className="session-event-summary">{tr(language, "Control condition: no color, brightness, cross, or attention-response task was presented.", "对照条件：未显示颜色、亮度、十字或注意反应任务。")}</p>
          )}

          {resultIsTestMode ? (
            <p className="test-mode-result">{tr(language, "This was a reusable test session. No record was saved and no data file is available.", "这是可重复使用的测试实验，没有保存记录，也不会生成数据文件。")}</p>
          ) : (
            <>
              <div className="result-actions">
                <button className="primary-button" onClick={() => exportResult("csv")}>{tr(language, "Download CSV", "下载 CSV")}</button>
                <button className="secondary-button" onClick={() => exportResult("json")}>{tr(language, "Download JSON", "下载 JSON")}</button>
              </div>
              <p className={`storage-note ${storageAvailable ? "" : "storage-error"}`}>
                {storageAvailable
                  ? remoteSave.sessionId === result.sessionId && remoteSave.status === "saved"
                    ? tr(language, "The protected remote copy is confirmed; the temporary local retry copy was cleared.", "受保护的远程记录已确认，临时本地重试副本已清除。")
                    : tr(language, "A local recovery copy is retained until remote storage confirms the final session.", "在远程存储确认最终实验前，本地恢复副本会继续保留。")
                  : tr(language, "Browser storage was unavailable. Download the CSV or JSON before leaving this page.", "浏览器存储不可用，请在离开前下载 CSV 或 JSON。")}
              </p>
              {remoteSave.sessionId === result.sessionId ? (
                <div className={`remote-save-note ${remoteSave.status}`} role="status">
                  {remoteSave.status === "saving" ? tr(language, "Saving a protected remote copy…", "正在保存受保护的远程记录…") : null}
                  {remoteSave.status === "saved" ? tr(language, "Remote copy saved successfully.", "远程记录保存成功。") : null}
                  {remoteSave.status === "failed" ? (
                    <>
                      <span>{tr(language, "Remote save failed. The local retry copy remains available.", "远程保存失败，本地重试副本仍然可用。")}</span>
                      <button type="button" onClick={() => saveRemoteRecord(result, () => {
                        deleteLocalOvernightDraft(result);
                        deleteRemoteOvernightDraft(result);
                      })}>
                        {tr(language, "Retry remote save", "重试远程保存")}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          )}

          {result.conditionId !== "control" && (result.fullscreenRequestFailed || !result.fullscreenAtStart || result.environmentEvents.length || summary.omitted) ? (
            <p className="quality-warning">
              {tr(language, `Quality flag: ${result.environmentEvents.length} display interruption${result.environmentEvents.length === 1 ? "" : "s"} recorded.`, `质量提示：记录到 ${result.environmentEvents.length} 次显示中断。`)}
              {result.fullscreenRequestFailed || !result.fullscreenAtStart ? tr(language, " Full screen was not established reliably.", " 未能可靠进入全屏。") : ""}
              {summary.omitted ? tr(language, ` ${summary.omitted} cross event${summary.omitted === 1 ? " was" : "s were"} omitted.`, ` 省略了 ${summary.omitted} 次十字事件。`) : ""}
            </p>
          ) : null}

          {formError ? (
            <div className="quality-warning" role="alert">
              <strong>{tr(language, "Record finalization warning:", "记录完成警告：")}</strong> {formError}
              <div className="result-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => downloadFile(
                    `sleep-light-recovery-${result.sessionId}.json`,
                    JSON.stringify(result, null, 2),
                    "application/json;charset=utf-8",
                  )}
                >
                  {tr(language, "Download recovery JSON", "下载恢复 JSON")}
                </button>
              </div>
            </div>
          ) : null}

          {result.conditionId !== "control" ? (
            <div className="trial-table-wrap">
              <table>
                <caption>{tr(language, "Recorded attention trials", "已记录的注意任务")}</caption>
                <thead><tr><th>{tr(language, "Trial", "次数")}</th><th>{tr(language, "Planned", "计划时间")}</th><th>{tr(language, "Appeared", "出现时间")}</th><th>{tr(language, "Response", "反应时间点")}</th><th>{tr(language, "Reaction", "反应时长")}</th><th>{tr(language, "Status", "状态")}</th></tr></thead>
                <tbody>
                  {result.trials.map((trial) => (
                    <tr key={trial.trialNumber}>
                      <td>{trial.trialNumber}</td>
                      <td>{(trial.plannedOnsetMs / 1000).toFixed(1)} s</td>
                      <td>{trial.appearedElapsedMs === null ? "—" : `${(trial.appearedElapsedMs / 1000).toFixed(3)} s`}</td>
                      <td>{trial.clickedElapsedMs === null ? "—" : `${(trial.clickedElapsedMs / 1000).toFixed(3)} s`}</td>
                      <td>{trial.reactionTimeMs === null ? "—" : `${trial.reactionTimeMs} ms`}</td>
                      <td><span className={`status-pill ${trial.status}`}>{trial.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!feedbackSkipped ? (
            <>
              {!resultIsTestMode && (
                !participantProfile
                || remoteSave.sessionId !== result.sessionId
                || remoteSave.status !== "saved"
              ) ? (
                <p className="feedback-status">
                  {participantProfile
                    ? tr(language, "Feedback unlocks after the remote session record is confirmed.", "远程实验记录确认后即可提交反馈或问题。")
                    : tr(language, "This restored historical session does not have a feedback profile.", "此恢复的历史实验没有可关联的反馈档案。")}
                </p>
              ) : null}
              <SessionFeedback
                language={language}
                disabled={!resultIsTestMode && (
                  !participantProfile
                  || remoteSave.sessionId !== result.sessionId
                  || remoteSave.status !== "saved"
                )}
                saving={feedbackSaving}
                submitted={feedbackSubmitted}
                testMode={resultIsTestMode}
                onSubmit={submitSessionFeedback}
                onSkip={() => setFeedbackSkipped(true)}
              />
            </>
          ) : (
            <p className="feedback-status">{tr(language, "Feedback skipped. You may continue.", "已跳过反馈，可以继续。")}</p>
          )}

          <button className="text-button" onClick={resetToSetup}>{tr(language, "Start another assigned session", "开始另一个已分配的实验")}</button>
        </section>
      </main>
    );
  }

  return (
    <main className="site-shell">
      <div className="red-glow" aria-hidden="true" />
      <div className="blue-glow" aria-hidden="true" />
      <nav className="topbar" aria-label={tr(language, "Study information", "研究信息")}>
        <a href="#setup" className="brand"><span className="brand-dot" />Sleep Light Study</a>
        <div className="topbar-tools">
          <span className="protocol-tag">Protocol SL-V4 · {tr(language, "Fixed four-session order", "固定四次顺序")}</span>
          <div className="language-toggle" role="group" aria-label={tr(language, "Choose language", "选择语言")}>
            <button type="button" aria-pressed={language === "en"} onClick={() => changeLanguage("en")}>English</button>
            <button type="button" aria-pressed={language === "zh"} onClick={() => changeLanguage("zh")}>中文</button>
          </div>
        </div>
      </nav>

      <div className="setup-grid" id="setup">
        <section className="intro-panel">
          <p className="eyebrow"><span className="live-dot" />{tr(language, "Pre-sleep screen-color research", "睡前屏幕颜色研究")}</p>
          <h1>
            {tr(
              language,
              "A study of how short pre-sleep screen-color exposure relates to immediate and next-morning alertness.",
              "研究短时间睡前屏幕颜色暴露与即时及第二天早晨清醒程度之间的关系。",
            )}
          </h1>
          <p className="intro-copy">
            {tr(
              language,
              "Do not change your normal bedtime for this study. Do not go to bed earlier or later for the experiment.",
              "请不要为了本研究改变平常的睡觉时间；不要因实验而提前或推迟上床。",
            )}
          </p>
          <p className="intro-copy">
            {language === "zh"
              ? <><strong>安全：</strong>如果你有光敏性癫痫病史，或闪烁、快速出现的视觉刺激会让你明显不适，请不要参加。画面造成不适时，请立即停止。</>
              : <><strong>Safety:</strong> Do not participate if you have a history of photosensitive seizures or significant discomfort with flashing or rapidly appearing visual stimuli. Stop the session if the display causes discomfort.</>}
          </p>
          <ol className="study-steps">
            <li><span>01</span><div><strong>{tr(language, "Tutorial", "教程")}</strong><p>{tr(language, "Read safety, device, and attention instructions.", "阅读安全、设备与注意任务说明。")}</p></div></li>
            <li><span>02</span><div><strong>{tr(language, "Questionnaire", "问卷")}</strong><p>{tr(language, "Report your recent sleep and tonight's environment.", "填写最近睡眠和今晚环境情况。")}</p></div></li>
            <li><span>03</span><div><strong>{tr(language, "Exposure", "屏幕暴露")}</strong><p>{tr(language, "Watch the assigned five-minute color display.", "观看指定的五分钟颜色画面。")}</p></div></li>
            <li><span>04</span><div><strong>{tr(language, "Karolinska Sleepiness Scale", "卡罗林斯卡困倦量表")}</strong><p>{tr(language, "Answer immediately after the display.", "画面结束后立即作答。")}</p></div></li>
            <li><span>05</span><div><strong>{tr(language, "Sleep", "睡眠")}</strong><p>{tr(language, "Go to bed at your normal time and sleep normally.", "在平常时间上床并正常睡眠。")}</p></div></li>
            <li><span>06</span><div><strong>{tr(language, "Next-morning questionnaire", "第二天早晨问卷")}</strong><p>{tr(language, "Return after waking; there is no separate reaction test.", "睡醒后返回；没有独立反应时间测试。")}</p></div></li>
          </ol>
        </section>

        <section className="setup-card" aria-labelledby="session-setup-title">
          <div className="card-heading">
            <div><p className="card-kicker">{tr(language, "Session setup", "实验设置")}</p><h2 id="session-setup-title">{tr(language, "Prepare tonight's session", "准备今晚的实验")}</h2></div>
            <span className={`ready-pill ${setupIsTestMode ? "test" : setupIsAdminMode ? "admin" : ""}`}>
              {setupIsTestMode ? tr(language, "Test mode", "测试模式") : setupIsAdminMode ? tr(language, "Administrator", "管理员") : tr(language, "Ready", "准备就绪")}
            </span>
          </div>

          {participantProfile ? (
            <div className="participant-account-card" role="status">
              <div>
                <span>{tr(language, "Signed in", "已登录")}</span>
                <strong>{participantProfile.displayName}</strong>
                <small>
                  {participantProgressStatus === "loaded" && participantProgress
                    ? tr(
                        language,
                        `${participantProgress.completedSequencePositions.length} complete · ${4 - participantProgress.completedSequencePositions.length} remaining`,
                        `${participantProgress.completedSequencePositions.length} 项已完成 · ${4 - participantProgress.completedSequencePositions.length} 项待完成`,
                      )
                    : participantProgressStatus === "failed"
                      ? tr(language, "Progress unavailable — press Begin to retry", "暂时无法读取进度——点击开始可重试")
                      : tr(language, "Loading your saved progress…", "正在读取之前的进度…")}
                </small>
              </div>
              <button
                type="button"
                className="secondary-button account-switch-button"
                onClick={() => {
                  forgetLocalParticipantProfile(participantProfile.profileId);
                  setParticipantProfile(null);
                  participantProfileRef.current = null;
                  setParticipantProgress(null);
                  setParticipantProgressStatus("idle");
                  setParticipantId("");
                  setParticipantPassword("");
                  setParticipantPasswordConfirmation("");
                  setParticipantRecoveryCodeInput("");
                  setFormError("");
                }}
              >
                {tr(language, "Use another account", "使用其他账户")}
              </button>
            </div>
          ) : (
            <>
              <label className="field-label" htmlFor="participant-id">{tr(language, "Study name (real name or nickname)", "实验姓名（真实姓名或网名）")}</label>
              <input
                ref={participantInputRef}
                id="participant-id"
                className="participant-input"
                value={participantId}
                onChange={(event) => {
                  setParticipantId(event.target.value);
                  setFormError("");
                }}
                placeholder={tr(language, "e.g. MoonRiver", "例如：月亮河")}
                autoComplete="username"
                maxLength={80}
                required
                aria-invalid={Boolean(formError && !participantId.trim())}
                aria-describedby={formError ? "setup-error" : undefined}
              />
              {!setupIsAdminMode && !setupIsTestMode ? (
                <>
                  <p className="profile-field-help">
                    {tr(language, "Your name must be unique. A non-identifying nickname is recommended.", "姓名必须独一无二，建议使用不会暴露身份的网名。")}
                  </p>
                  <div className="account-mode-switch" role="group" aria-label={tr(language, "Choose account action", "选择账户操作")}>
                    <button
                      type="button"
                      aria-pressed={participantAccountMode === "create"}
                      onClick={() => {
                        setParticipantAccountMode("create");
                        setParticipantRecoveryCodeInput("");
                        setFormError("");
                      }}
                    >
                      {tr(language, "Create account", "创建账户")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={participantAccountMode === "signin"}
                      onClick={() => {
                        setParticipantAccountMode("signin");
                        setParticipantPasswordConfirmation("");
                        setParticipantRecoveryCodeInput("");
                        setFormError("");
                      }}
                    >
                      {tr(language, "Sign in", "登录")}
                    </button>
                  </div>
                  <label className="field-label" htmlFor="participant-password">
                    {participantAccountMode === "create"
                      ? tr(language, "Choose a password", "设置密码")
                      : tr(language, "Password", "密码")}
                  </label>
                  <input
                    id="participant-password"
                    className="participant-input account-password-input"
                    type="password"
                    value={participantPassword}
                    onChange={(event) => {
                      setParticipantPassword(event.target.value);
                      setFormError("");
                    }}
                    autoComplete={participantAccountMode === "create" ? "new-password" : "current-password"}
                    minLength={8}
                    maxLength={128}
                    required
                  />
                  {participantAccountMode === "create" || participantRecoveryCodeInput ? (
                    <>
                      <label className="field-label" htmlFor="participant-password-confirmation">{tr(language, "Confirm password", "确认密码")}</label>
                      <input
                        id="participant-password-confirmation"
                        className="participant-input account-password-input"
                        type="password"
                        value={participantPasswordConfirmation}
                        onChange={(event) => {
                          setParticipantPasswordConfirmation(event.target.value);
                          setFormError("");
                        }}
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        required
                      />
                    </>
                  ) : null}
                  <p className="password-privacy-note">
                    {tr(
                      language,
                      "Use 8–128 characters. Your password is converted into a slow cryptographic proof in this browser; the password itself is not saved or sent. There is no automatic password reset, so keep it in a password manager.",
                      "请使用 8–128 个字符。密码会在本浏览器中转换成较慢的加密凭证；密码本身不会被保存或发送。目前没有自动重置密码功能，请将密码保存在密码管理器中。",
                    )}
                  </p>
                  <details className="recovery-access-details">
                    <summary>{tr(language, "Used the older recovery-code version? Upgrade this account", "使用过旧版恢复码？升级这个账户")}</summary>
                    <div className="recovery-access-fields">
                      <label className="field-label" htmlFor="participant-recovery-code">{tr(language, "Original 20-character recovery code", "原来的 20 位恢复码")}</label>
                      <input
                        id="participant-recovery-code"
                        value={participantRecoveryCodeInput}
                        onChange={(event) => {
                          setParticipantRecoveryCodeInput(event.target.value.toUpperCase());
                          setParticipantAccountMode("signin");
                          setFormError("");
                        }}
                        placeholder="AAAAA-BBBBB-CCCCC-DDDDD"
                        autoComplete="off"
                        inputMode="text"
                        maxLength={32}
                      />
                      <small>{tr(language, "Enter the old recovery code and choose a new password above. Existing records stay attached to the same profile.", "输入旧恢复码，并在上方设置新密码；以前的记录仍会保留在同一个档案中。")}</small>
                    </div>
                  </details>
                </>
              ) : null}
            </>
          )}

          {setupIsTestMode ? (
            <p className="test-mode-note" role="status">{tr(language, "Test mode is active. It can be repeated and never saves participant data.", "测试模式已启用，可以反复使用且不会保存参与者数据。")}</p>
          ) : null}
          {setupIsAdminMode ? (
            <p className="admin-mode-note" role="status">{tr(language, "Administrator access selected. A password is required to view remote study data.", "已选择管理员入口，需要密码才能查看远程研究数据。")}</p>
          ) : null}

          {setupIsTestMode ? (
            <fieldset>
              <legend>{tr(language, "Test mode only: choose a condition", "仅测试模式：选择一个条件")}</legend>
              <div className="condition-grid">
                {ACTIVE_CONDITIONS.map((condition) => (
                  <label key={condition.id} className={`condition-card ${conditionId === condition.id ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="light-condition"
                      value={condition.id}
                      checked={conditionId === condition.id}
                      onChange={() => setConditionId(condition.id)}
                    />
                    <span className="condition-swatch" style={{ backgroundColor: condition.color as string }} />
                    <span><strong>{conditionLabel(condition.id, language)}</strong><small>{conditionLuminanceLabel(condition, language)}</small></span>
                    <i aria-hidden="true">{conditionId === condition.id ? "✓" : ""}</i>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : !setupIsAdminMode ? (
            <div className="assigned-condition-banner" role="status">
              <span>{tr(language, "Assigned automatically after sign-in", "登录后自动分配")}</span>
              <strong>
                {participantProgress?.nextConditionId
                  ? conditionLabel(participantProgress.nextConditionId, language)
                  : participantProgressStatus === "loaded"
                    ? tr(language, "All four sessions complete", "四次实验均已完成")
                    : tr(language, "Fixed order: dim red → dim blue → bright blue → bright red", "固定顺序：暗红 → 暗蓝 → 亮蓝 → 亮红")}
              </strong>
              <small>{tr(language, "Participants cannot choose or skip the order.", "受试者不能自行选择或跳过顺序。")}</small>
            </div>
          ) : null}

          {formError ? <p className="form-error" id="setup-error" role="alert">{formError}</p> : null}
          <button
            className="primary-button begin-button"
            type="button"
            onClick={startSession}
            disabled={restoringDraft || profileChecking}
            aria-busy={restoringDraft || profileChecking}
          >
            {profileChecking
              ? tr(language, "Opening your record…", "正在打开你的记录…")
              : setupIsAdminMode
                ? tr(language, "Open data dashboard", "打开数据面板")
                : tr(language, "Read tutorial and begin", "阅读教程并开始")} <span aria-hidden="true">→</span>
          </button>

          <div className="session-note">
            <span aria-hidden="true">⌁</span>
            <p><strong>{tr(language, "Study schedule", "实验安排")}</strong> {tr(language, "Fixed order: dim red, dim blue, bright blue, bright red. Consecutive-night sessions are allowed, but do not change your normal bedtime.", "固定顺序为暗红、暗蓝、亮蓝、亮红。可以连续几晚进行，但不要改变平常睡觉时间。")}</p>
          </div>
          <div className="local-data-note">
            <span>
              {setupIsAdminMode
                ? tr(language, "Remote records remain protected until administrator sign-in succeeds.", "管理员登录成功前，远程记录会继续受到保护。")
                : setupIsTestMode
                  ? tr(language, "The hidden test participant never writes session data to this browser or database.", "内置测试用户不会向浏览器或数据库写入实验数据。")
                  : tr(language, "Sign in with the same study name and password to restore an unfinished session on another browser or device. Earlier versions and answers are never overwritten.", "在其他浏览器或设备使用相同实验姓名和密码登录，即可恢复未完成的实验；以前版本和回答不会被覆盖。")}
            </span>
          </div>
        </section>
      </div>

      <footer>
        <span>Sleep Light Study</span>
        <span>{tr(language, "Assigned order: dim red · dim blue · bright blue · bright red", "指定顺序：暗红 · 暗蓝 · 亮蓝 · 亮红")}</span>
      </footer>
    </main>
  );
}
