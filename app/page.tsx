"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { clearReactionTestProgress, ReactionTest } from "./reaction-test";
import {
  ADMIN_EMAIL,
  claimParticipantProfile,
  deleteStudyDraft,
  fetchAdminParticipantFeedback,
  fetchAdminParticipantProfiles,
  fetchParticipantProgress,
  fetchRemoteStudySessions,
  generateParticipantRecoveryCode,
  isAdminParticipantId,
  isValidParticipantName,
  isValidRecoveryCode,
  isStoredSessionRecord,
  loadLocalParticipantProfile,
  loadLocalParticipantProfiles,
  loadStudyDraft,
  normalizeParticipantName,
  normalizeRecoveryCode,
  rememberLocalParticipantProfile,
  saveStudyDraft,
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
  TrialRecord,
} from "./session-record";
import { isStudySessionDraftV3, isStudySessionRecordV3 } from "./session-validation";
import { sessionToCsv, sessionsToCsv } from "./study-data";
import { PostStudySurveyForm, PreStudySurveyForm } from "./study-surveys";
import { StudyTutorial } from "./study-tutorial";
import { SessionFeedback, type SessionFeedbackPayload } from "./session-feedback";
import {
  groupParticipantHistories,
  normalizeParticipantName as normalizeParticipantHistoryName,
} from "./consistency-review";
import { isLanguage, type Language } from "./i18n";

type Phase =
  | "setup"
  | "admin"
  | "tutorial"
  | "pre-survey"
  | "instructions"
  | "countdown"
  | "running"
  | "paused"
  | "sleep-ready"
  | "awaiting-morning"
  | "post-survey"
  | "reaction-test"
  | "results";

type RemoteSaveStatus = "idle" | "saving" | "saved" | "failed";
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
    id: "bright-red",
    name: "Bright Red",
    luminance: "High digital intensity",
    color: "#ff0000",
    rgb: "255, 0, 0",
  },
  {
    id: "dim-red",
    name: "Dim Red",
    luminance: "Low digital intensity",
    color: "#660000",
    rgb: "102, 0, 0",
  },
  {
    id: "bright-blue",
    name: "Bright Blue",
    luminance: "High digital intensity",
    color: "#0000ff",
    rgb: "0, 0, 255",
  },
  {
    id: "dim-blue",
    name: "Dim Blue",
    luminance: "Low digital intensity",
    color: "#000066",
    rgb: "0, 0, 102",
  },
  {
    id: "control",
    name: "Control — Normal Sleep",
    luminance: "No light exposure",
    color: null,
    rgb: null,
  },
];

const CONDITION_MAP = Object.fromEntries(
  CONDITIONS.map((condition) => [condition.id, condition]),
) as Record<ConditionId, Condition>;

const SESSION_DURATION_MS = 5 * 60 * 1000;
const CROSS_VISIBLE_MS = 1800;
const FINAL_STORAGE_KEY = "sleep-light-study:sessions:v2";
const OVERNIGHT_DRAFT_KEY = "sleep-light-study:overnight-draft:v1";
const LANGUAGE_STORAGE_KEY = "sleep-light-study:language:v1";
const STUDY_BUILD_VERSION = "2026-07-18-bilingual-profiles-v1";
const DRAFT_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const MINIMUM_SLEEP_INTERVAL_MS = 4 * 60 * 60 * 1000;

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

function getDraftAgeAnchor(record: StudySessionRecordV3) {
  return Date.parse(record.sleepStartedAtIso ?? record.stimulusEndedAtIso ?? record.startedAtIso);
}

function isFreshDraft(record: StudySessionRecordV3) {
  const anchor = getDraftAgeAnchor(record);
  return Number.isFinite(anchor) && Date.now() - anchor <= DRAFT_MAX_AGE_MS;
}

function getRecordProgressTime(record: StudySessionRecordV3) {
  const checkpointAt = record.exposureStatus === "in-progress" && record.stimulusStartedAtIso
    ? Date.parse(record.stimulusStartedAtIso) + record.wallClockDurationMs
    : Number.NaN;
  const candidates = [
    record.reactionTest?.completedAtIso,
    record.postSurvey?.answeredAtIso,
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

function hasMoreStudyProgress(candidate: StudySessionRecordV3, current: StudySessionRecordV3) {
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

function terminateInterruptedExposure(record: StudySessionRecordV3, now = Date.now()) {
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
  };
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
                  <th>{tr(language, "Pre KSS", "睡前 KSS")}</th>
                  <th>{tr(language, "Post KSS", "睡后 KSS")}</th>
                  <th>{tr(language, "Reaction mean", "平均反应")}</th>
                  <th>{tr(language, "Attention", "注意任务")}</th>
                  <th>{tr(language, "Feedback / question", "反馈 / 问题")}</th>
                  <th>{tr(language, "Files", "文件")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => {
                  const record = session.record;
                  const v3 = record.schemaVersion === 3 ? record : null;
                  const hits = record.trials.filter((trial) => trial.status === "hit").length;
                  const normalizedName = normalizeParticipantHistoryName(record.participantId);
                  const history = reviewByName.get(normalizedName);
                  const profile = profileByName.get(normalizedName);
                  const sessionFeedback = feedbackBySession.get(record.sessionId) ?? [];
                  const reviewTitle = history?.consistencyReview.reasons
                    .map((reason) => reason.label[language])
                    .join(" ");
                  return (
                    <tr key={record.sessionId}>
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
                        {profile ? <small>{profile.completedConditionIds.length}/5 {tr(language, "conditions complete", "项条件已完成")}</small> : null}
                      </td>
                      <td>{new Date(record.startedAtIso).toLocaleString(language === "zh" ? "zh-CN" : "en")}</td>
                      <td>v{record.schemaVersion}{v3?.studyBuildVersion ? <small>{v3.studyBuildVersion}</small> : <small>{tr(language, "historical", "历史版本")}</small>}</td>
                      <td><span className={`status-pill ${record.status}`}>{record.status}</span></td>
                      <td>{v3?.preSurvey.sleepinessKss ?? "—"}</td>
                      <td>{v3?.postSurvey?.sleepinessKss ?? "—"}</td>
                      <td>{v3?.reactionTest?.averageReactionTimeMs == null ? "—" : `${Math.round(v3.reactionTest.averageReactionTimeMs)} ms`}</td>
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
                    </tr>
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
  const [participantRecoveryCodeInput, setParticipantRecoveryCodeInput] = useState("");
  const [participantProfile, setParticipantProfile] = useState<LocalParticipantProfile | null>(null);
  const [participantProgress, setParticipantProgress] = useState<ParticipantProgress | null>(null);
  const [profileChecking, setProfileChecking] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackSkipped, setFeedbackSkipped] = useState(false);
  const [conditionId, setConditionId] = useState<ConditionId | null>(null);
  const [formError, setFormError] = useState("");
  const [countdown, setCountdown] = useState(3);
  const [remainingMs, setRemainingMs] = useState(SESSION_DURATION_MS);
  const [target, setTarget] = useState<{ trialNumber: number; x: number; y: number } | null>(null);
  const [result, setResult] = useState<StudySessionRecordV3 | null>(null);
  const [overnightRecord, setOvernightRecord] = useState<StudySessionRecordV3 | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [draftProtection, setDraftProtection] = useState<DraftProtection>({
    sessionId: null,
    localSaved: false,
    remoteStatus: "idle",
  });
  const [restoringDraft, setRestoringDraft] = useState(true);
  const [clockNow, setClockNow] = useState(() => Date.now());
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
  const overnightRecordRef = useRef<StudySessionRecordV3 | null>(null);
  const postSurveyRef = useRef<PostStudySurvey | null>(null);
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
  const paintFrameRef = useRef<number | null>(null);
  const scheduleNextCrossRef = useRef<() => void>(() => undefined);
  const displayActiveTrialRef = useRef<() => void>(() => undefined);
  const checkpointActiveExposureRef = useRef<(includeRemoteBackup?: boolean) => void>(() => undefined);
  const finishExposureRef = useRef<(status?: "completed" | "terminated") => void>(() => undefined);
  const endSequenceRef = useRef("");
  const terminationReasonRef = useRef<"end_sequence" | "touch_end" | "page_reload" | null>(null);
  const participantInputRef = useRef<HTMLInputElement>(null);

  const setupIsTestMode = isTestParticipantId(participantId);
  const setupIsAdminMode = isAdminParticipantId(participantId);
  const resultIsTestMode = result ? isTestParticipantId(result.participantId) : false;

  const setCurrentOvernightRecord = useCallback((record: StudySessionRecordV3 | null) => {
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
              const profile = record.schemaVersion === 3 && record.participantProfileId
                ? loadLocalParticipantProfiles().find((candidate) => candidate.profileId === record.participantProfileId)
                : null;
              if (record.schemaVersion === 3 && record.participantProfileId) {
                if (!profile) continue;
                await uploadProfileStudySession(profile, record);
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
    const applyRestoredRecord = (record: StudySessionRecordV3, resumeToken: string) => {
      if (cancelled) return false;
      const interrupted = record.exposureStatus === "in-progress";
      const restoredRecord = terminateInterruptedExposure(record);
      resumeTokenRef.current = resumeToken;
      participantRef.current = restoredRecord.participantId;
      participantProfileIdRef.current = restoredRecord.participantProfileId ?? null;
      const restoredProfile = loadLocalParticipantProfile(restoredRecord.participantId);
      const matchingProfile = restoredProfile && (
        !restoredRecord.participantProfileId || restoredProfile.profileId === restoredRecord.participantProfileId
      ) ? restoredProfile : null;
      participantProfileRef.current = matchingProfile;
      setParticipantProfile(matchingProfile);
      if (matchingProfile) {
        void fetchParticipantProgress(matchingProfile).then(setParticipantProgress, () => undefined);
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
      postSurveyRef.current = restoredRecord.postSurvey;
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
      setClockNow(Date.now());
      setCurrentOvernightRecord(restoredRecord);
      let localSaved = false;
      try {
        const localDraft: LocalOvernightDraft = {
          storageVersion: 1,
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
      if (restoredRecord.postSurvey) setPhase("reaction-test");
      else if (restoredRecord.morningReturnedAtIso) setPhase("post-survey");
      else if (restoredRecord.sleepStartedAtIso) setPhase("awaiting-morning");
      else if (restoredRecord.exposureStatus === "not-started") setPhase("instructions");
      else setPhase("sleep-ready");

      return interrupted;
    };
    const persistInterruptedRecord = (record: StudySessionRecordV3, resumeToken: string) => {
      const saveOperation = draftSaveChainRef.current
        .catch(() => undefined)
        .then(() => saveStudyDraft(resumeToken, record, { keepalive: true }));
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
          && parsed.storageVersion === 1
          && "resumeToken" in parsed
          && typeof parsed.resumeToken === "string"
          && /^[0-9a-f]{64}$/i.test(parsed.resumeToken)
          && "record" in parsed
          && isStudySessionDraftV3(parsed.record)
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
      let remote: StudySessionRecordV3 | null = null;
      let remoteLookupFailed = false;
      try {
        remote = await loadStudyDraft(savedDraft.resumeToken);
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

  const persistFinalLocally = useCallback((record: StudySessionRecordV3) => {
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

  const saveRemoteRecord = useCallback((record: StudySessionRecordV3, onSuccess?: () => void) => {
    if (isReservedParticipantId(record.participantId)) return;
    setRemoteSave({ sessionId: record.sessionId, status: "saving" });
    const profile = participantProfileRef.current;
    const saveRequest = record.participantProfileId
      ? profile?.profileId === record.participantProfileId
        ? uploadProfileStudySession(profile, record, { keepalive: true })
        : Promise.reject(new Error("The participant profile recovery code is unavailable."))
      : uploadStudySession(record, { keepalive: true });
    void saveRequest.then(
      () => {
        if (!removeStoredSession(record.sessionId)) setStorageAvailable(false);
        onSuccess?.();
        if (profile) {
          void fetchParticipantProgress(profile).then(setParticipantProgress, () => undefined);
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
    record: StudySessionRecordV3,
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
      const localDraft: LocalOvernightDraft = { storageVersion: 1, resumeToken: token, record };
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
    const saveOperation = draftSaveChainRef.current
      .catch(() => undefined)
      .then(() => saveStudyDraft(token, record, { keepalive: true }));
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

  const deleteLocalOvernightDraft = useCallback((record: StudySessionRecordV3) => {
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

  const deleteRemoteOvernightDraft = useCallback((record: StudySessionRecordV3) => {
    if (!isTestParticipantId(record.participantId) && resumeTokenRef.current) {
      const token = resumeTokenRef.current;
      draftSaveChainRef.current = draftSaveChainRef.current
        .catch(() => undefined)
        .then(() => deleteStudyDraft(token));
    }
  }, []);

  useEffect(() => {
    if (phase !== "awaiting-morning") return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [phase]);

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

  const buildExposureRecord = useCallback((conditionIdForRecord: ConditionId): StudySessionRecordV3 => {
    const condition = CONDITION_MAP[conditionIdForRecord];
    const beforeSleep = deviceBeforeRef.current;
    const preSurvey = preSurveyRef.current;
    if (!beforeSleep || !preSurvey) throw new Error("The pre-study questionnaire is incomplete.");
    const isControl = condition.id === "control";
    return {
      schemaVersion: 3,
      protocolVersion: "overnight-v1",
      attentionProtocolVersion: "sparse-4-50-70-v1",
      sessionId: sessionIdRef.current,
      participantId: participantRef.current,
      ...(participantProfileIdRef.current ? { participantProfileId: participantProfileIdRef.current } : {}),
      studyBuildVersion: STUDY_BUILD_VERSION,
      conditionId: condition.id,
      conditionName: condition.name,
      stimulusColorHex: condition.color,
      stimulusColorRgb: condition.rgb,
      plannedDurationMs: isControl ? 0 : SESSION_DURATION_MS,
      plannedEndAtIso: isControl ? null : plannedEndAtIsoRef.current,
      actualDurationMs: isControl ? 0 : exposureActualDurationRef.current,
      wallClockDurationMs: isControl ? 0 : exposureWallClockDurationRef.current,
      totalPausedDurationMs: isControl ? 0 : totalPausedMsRef.current,
      crossVisibleMs: CROSS_VISIBLE_MS,
      startedAtIso: startedAtIsoRef.current,
      stimulusStartedAtIso: isControl ? null : stimulusStartedAtIsoRef.current,
      stimulusEndedAtIso: isControl ? null : stimulusEndedAtIsoRef.current,
      sleepStartedAtIso: null,
      morningReturnedAtIso: null,
      assessmentCompletedAtIso: null,
      endedAtIso: null,
      status: "active",
      exposureStatus: isControl ? "not-applicable" : exposureStatusRef.current,
      terminationReason: isControl ? null : terminationReasonRef.current,
      fullscreenAtStart: isControl ? false : fullscreenAtStartRef.current,
      fullscreenRequestFailed: isControl ? false : fullscreenRequestFailedRef.current,
      deviceInfo: { beforeSleep, afterWaking: null, deviceChanged: null },
      preSurvey,
      postSurvey: null,
      reactionTest: null,
      trialPlan: isControl ? [] : trialPlanRef.current.map((trial) => ({ ...trial })),
      trials: isControl ? [] : trialsRef.current.map((trial) => ({ ...trial })),
      falseClicks: isControl ? [] : falseClicksRef.current.map((click) => ({ ...click })),
      pauses: isControl ? [] : pausesRef.current.map((pause) => ({ ...pause })),
      environmentEvents: isControl ? [] : environmentEventsRef.current.map((event) => ({ ...event })),
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

    let record: StudySessionRecordV3;
    try {
      record = buildExposureRecord(conditionRef.current);
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
      const record = buildExposureRecord(conditionRef.current);
      saveOvernightDraft(record);
      setPhase("sleep-ready");
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
        buildExposureRecord(conditionRef.current),
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
    selectedConditionId: ConditionId,
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
    exposureStatusRef.current = selectedConditionId === "control" ? "not-applicable" : "not-started";
    postSurveyRef.current = null;
    trialPlanRef.current = selectedConditionId === "control" ? [] : makeTrialPlan();
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
    if (!cleanParticipantId || !conditionId) {
      setFormError(tr(language, "Enter your study name and select the assigned condition.", "请输入实验姓名，并选择研究者分配的条件。"));
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
        participantProfileRef.current = null;
        setParticipantProfile(null);
        setParticipantProgress(null);
        initializeSession(cleanParticipantId, conditionId);
        setFormError("");
        setPhase("tutorial");
      } catch (error) {
        setFormError(error instanceof Error ? error.message : tr(language, "This browser cannot begin the overnight protocol.", "此浏览器无法开始整晚实验。"));
      }
      return;
    }

    const suppliedRecoveryCode = participantRecoveryCodeInput.trim();
    if (suppliedRecoveryCode && !isValidRecoveryCode(suppliedRecoveryCode)) {
      setFormError(tr(language, "The recovery code should contain 20 characters using A–Z or 2–7. Check it and try again.", "恢复码应包含 20 个字符，只使用 A–Z 或数字 2–7。请检查后重试。"));
      return;
    }

    setProfileChecking(true);
    setFormError("");
    try {
      const rememberedProfile = loadLocalParticipantProfile(cleanParticipantId);
      const recoveryCode = suppliedRecoveryCode
        ? normalizeRecoveryCode(suppliedRecoveryCode)
        : rememberedProfile?.recoveryCode ?? generateParticipantRecoveryCode();
      const claimedProfile = await claimParticipantProfile(cleanParticipantId, recoveryCode);
      const localProfile: LocalParticipantProfile = {
        profileId: claimedProfile.profileId,
        displayName: claimedProfile.displayName,
        createdAt: claimedProfile.createdAt,
        lastAccessedAt: claimedProfile.lastAccessedAt,
        recoveryCode: claimedProfile.recoveryCode,
      };
      if (!rememberLocalParticipantProfile(localProfile)) setStorageAvailable(false);
      const progress = await fetchParticipantProgress(localProfile);
      participantProfileRef.current = localProfile;
      setParticipantProfile(localProfile);
      setParticipantProgress(progress);
      setParticipantId(localProfile.displayName);
      setParticipantRecoveryCodeInput("");
      initializeSession(localProfile.displayName, conditionId, localProfile.profileId);
      setFormError("");
      setPhase("tutorial");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const nameConflict = /already in use|recovery code|did not match|authentication failed/i.test(message);
      const serviceUnavailable = /failed to fetch|network|could not find|not found|schema cache|unavailable/i.test(message);
      setFormError(nameConflict
        ? tr(
          language,
          "This study name is already in use. If it is yours, use the original browser or enter its recovery code; otherwise choose a different unique nickname.",
          "这个实验姓名已经被使用。如果它属于你，请使用原浏览器或输入恢复码；否则请选择另一个独一无二的网名。",
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
      const record = buildExposureRecord(conditionRef.current);
      saveOvernightDraft(record);
      setFormError("");
      setPhase(conditionRef.current === "control" ? "sleep-ready" : "instructions");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : tr(language, "The overnight record could not be prepared.", "无法准备整晚实验记录。"));
      setPhase("setup");
    }
  };

  const markSleepStarted = () => {
    const record = overnightRecordRef.current;
    if (!record) return;
    const nextRecord: StudySessionRecordV3 = { ...record, sleepStartedAtIso: new Date().toISOString() };
    const savedLocally = saveOvernightDraft(nextRecord, { requireLocal: true });
    if (!savedLocally && !isTestParticipantId(record.participantId)) {
      setFormError(tr(language, "The sleep-start checkpoint could not be saved in this browser. Enable site storage and try again before closing the page.", "无法在此浏览器保存入睡节点。请允许网站存储，然后在关闭页面前重试。"));
      return;
    }
    setFormError("");
    setClockNow(Date.now());
    setPhase("awaiting-morning");
  };

  const continueAfterWaking = () => {
    const record = overnightRecordRef.current;
    if (!record) return;
    const sleepStartedAt = record.sleepStartedAtIso ? Date.parse(record.sleepStartedAtIso) : Number.NaN;
    if (
      !isTestParticipantId(record.participantId)
      && (!Number.isFinite(sleepStartedAt) || Date.now() - sleepStartedAt < MINIMUM_SLEEP_INTERVAL_MS)
    ) return;
    const afterWaking = detectBrowserDeviceInfo();
    const nextRecord: StudySessionRecordV3 = {
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
    setPhase("post-survey");
  };

  const submitPostSurvey = (survey: PostStudySurvey, afterWakingDevice: DeviceInfo) => {
    const record = overnightRecordRef.current;
    if (!record) return;
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
    if (!record || !record.postSurvey || !record.deviceInfo.afterWaking) return;
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
    setParticipantId("");
    setParticipantRecoveryCodeInput("");
    setConditionId(null);
    setResult(null);
    setParticipantProfile(null);
    setParticipantProgress(null);
    participantProfileRef.current = null;
    participantProfileIdRef.current = null;
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
        assignedConditionId={conditionId}
        completedConditionIds={participantProgress?.completedConditionIds ?? []}
        recoveryCode={participantProfile?.recoveryCode ?? null}
        isTestMode={setupIsTestMode}
        onContinue={() => setPhase("pre-survey")}
      />
    );
  }

  if (phase === "pre-survey") {
    return <PreStudySurveyForm language={language} detectedDevice={detectedDevice} onSubmit={submitPreSurvey} />;
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
            {tr(language, "Responses made when no cross is visible, including extra responses, are recorded. After exposure, continue to a normal full night of sleep.", "没有十字时的点击或多余点击也会被记录。光照结束后，请继续正常睡一整晚。")}
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
          <p className="eyebrow">{tr(language, "Tonight's condition is ready", "今晚的条件已完成准备")}</p>
          <h1 id="sleep-ready-title">{tr(language, "Continue with a normal full night of sleep.", "接下来请按照平常方式睡一整晚。")}</h1>
          <p>
            {isControl
              ? tr(language, "This is the control condition. No color or brightness stimulus was shown.", "这是对照条件，没有播放任何颜色或亮度刺激。")
              : overnightRecord.exposureStatus === "terminated"
                ? tr(language, "The light exposure ended early, and that event has been recorded.", "光照已提前结束，此事件已经记录。")
                : tr(language, "The five-minute light exposure is complete.", "五分钟光照已经完成。")}
          </p>
          <div className="overnight-status-grid">
            <div><span>{tr(language, "Condition", "实验条件")}</span><strong>{conditionLabel(overnightRecord.conditionId, language)}</strong></div>
            <div><span>{tr(language, "Pre-sleep KSS", "睡前 KSS")}</span><strong>{overnightRecord.preSurvey.sleepinessKss} / 9</strong></div>
            <div><span>{tr(language, "Device", "设备")}</span><strong>{deviceCategoryLabel(overnightRecord.deviceInfo.beforeSleep.confirmedCategory, language)}</strong></div>
          </div>
          <p className="overnight-guidance">
            {tr(language, "When you are ready to put the device away and sleep, press the button below. You may close or lock the device afterward. Return in this same browser after waking, within 48 hours.", "准备放下设备睡觉时，请点击下方按钮。之后可以关闭网页或锁定设备；醒来后请在 48 小时内用同一浏览器返回。")}
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
    const isTestMode = isTestParticipantId(overnightRecord.participantId);
    const sleepStartedAt = overnightRecord.sleepStartedAtIso
      ? Date.parse(overnightRecord.sleepStartedAtIso)
      : Number.NaN;
    const earliestReturnAt = Number.isFinite(sleepStartedAt)
      ? sleepStartedAt + MINIMUM_SLEEP_INTERVAL_MS
      : Number.POSITIVE_INFINITY;
    const canContinueMorning = isTestMode || clockNow >= earliestReturnAt;
    return (
      <main className="overnight-shell morning-return-shell">
        <section className="overnight-card" aria-labelledby="morning-return-title">
          <p className="eyebrow">{tr(language, "Overnight pause", "整晚等待")}</p>
          <h1 id="morning-return-title">{tr(language, "Sleep normally. Return here after waking.", "请正常睡眠，醒来后返回此页。")}</h1>
          <p>{tr(language, "The browser may be closed or the device may be locked. Reopen this page in the same browser when the full night of sleep is over.", "可以关闭浏览器或锁定设备。完成一整晚睡眠后，请在同一浏览器重新打开此页面。")}</p>
          <div className="overnight-status-grid">
            <div><span>{tr(language, "Study name", "实验姓名")}</span><strong>{overnightRecord.participantId}</strong></div>
            <div><span>{tr(language, "Sleep marked at", "标记入睡时间")}</span><strong>{formatDateTime(overnightRecord.sleepStartedAtIso, language)}</strong></div>
            <div><span>{tr(language, "Condition", "实验条件")}</span><strong>{conditionLabel(overnightRecord.conditionId, language)}</strong></div>
          </div>
          <p className="overnight-guidance">{tr(language, "There is no required washout day in this website. Follow the researcher's assigned schedule; consecutive-night sessions are allowed.", "网站不强制要求间隔一天。请按照研究者安排的日期和顺序；可以连续两晚进行不同实验。")}</p>
          {!canContinueMorning ? (
            <p className="draft-save-note" role="status">
              {tr(language, `To prevent an accidental immediate return, the morning check opens at ${new Date(earliestReturnAt).toLocaleString("en")} (four hours after sleep was marked).`, `为防止误操作，早晨问卷将在 ${new Date(earliestReturnAt).toLocaleString("zh-CN")} 开放（标记入睡四小时后）。`)}
            </p>
          ) : null}
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          <button
            className="primary-button overnight-primary"
            type="button"
            onClick={continueAfterWaking}
            disabled={!canContinueMorning}
          >
            {tr(language, "I have woken up — continue", "我已经醒来——继续")}
          </button>
        </section>
      </main>
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

  if (phase === "reaction-test" && overnightRecord) {
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
    const reactionMean = result.reactionTest?.averageReactionTimeMs;
    return (
      <main className="results-shell">
        <section className="results-card">
          <div className="complete-mark" aria-hidden="true">✓</div>
          <p className="eyebrow">{result.exposureStatus === "terminated"
            ? tr(language, "Exposure ended early", "光照提前结束")
            : resultIsTestMode
              ? tr(language, "Test mode", "测试模式")
              : tr(language, "Overnight session complete", "整晚实验已完成")}</p>
          <h1>{resultIsTestMode ? tr(language, "Test session complete.", "测试实验完成。") : tr(language, "Thank you. The full record is complete.", "谢谢，完整实验记录已完成。")}</h1>
          <p className="results-lead">
            {tr(language, "Study name ", "实验姓名 ")}<strong>{result.participantId}</strong>{tr(language, " completed the ", " 已完成 ")}<strong>{conditionLabel(result.conditionId, language)}</strong>{tr(language, " overnight condition.", " 整晚条件。")}
          </p>

          <div className="result-stats" aria-label={tr(language, "Session summary", "实验汇总")}>
            <div><span>{tr(language, "Pre-sleep KSS", "睡前 KSS")}</span><strong>{result.preSurvey.sleepinessKss}<small> / 9</small></strong></div>
            <div><span>{tr(language, "Post-sleep KSS", "睡后 KSS")}</span><strong>{result.postSurvey?.sleepinessKss}<small> / 9</small></strong></div>
            <div><span>{tr(language, "Reaction mean", "平均反应时间")}</span><strong>{reactionMean == null ? "—" : Math.round(reactionMean)}<small>{reactionMean == null ? "" : " ms"}</small></strong></div>
            <div><span>{tr(language, "Valid reaction trials", "有效反应次数")}</span><strong>{result.reactionTest?.validCount ?? 0}<small> / 3</small></strong></div>
          </div>

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
          <span className="protocol-tag">Protocol SL-OV1 · {tr(language, "Overnight", "整晚")}</span>
          <div className="language-toggle" role="group" aria-label={tr(language, "Choose language", "选择语言")}>
            <button type="button" aria-pressed={language === "en"} onClick={() => changeLanguage("en")}>English</button>
            <button type="button" aria-pressed={language === "zh"} onClick={() => changeLanguage("zh")}>中文</button>
          </div>
        </div>
      </nav>

      <div className="setup-grid" id="setup">
        <section className="intro-panel">
          <p className="eyebrow"><span className="live-dot" />{tr(language, "Overnight sleep protocol", "整晚睡眠研究流程")}</p>
          <h1>{tr(language, "Complete tonight's condition.", "完成今晚的实验条件。")}<br />{tr(language, "Return after waking.", "醒来后请返回。")}</h1>
          <p className="intro-copy">
            {tr(language, "A whole-night study comparing four five-minute pre-sleep light exposures with a no-exposure normal-sleep control.", "本整晚研究比较四种睡前五分钟光照条件，以及不进行光照的正常睡眠对照条件。")}
          </p>
          <ol className="study-steps">
            <li><span>01</span><div><strong>{tr(language, "Before sleep", "睡前")}</strong><p>{tr(language, "Read the tutorial, then complete the questionnaire and assigned condition.", "阅读教程，然后填写问卷并完成分配的条件。")}</p></div></li>
            <li><span>02</span><div><strong>{tr(language, "Sleep normally", "正常睡眠")}</strong><p>{tr(language, "Put the device away and get a normal full night of sleep.", "放下设备，按照平常方式睡一整晚。")}</p></div></li>
            <li><span>03</span><div><strong>{tr(language, "After waking", "醒来后")}</strong><p>{tr(language, "Return for KSS, three relaxed reactions, and optional feedback.", "返回完成 KSS、三次放松反应和可选反馈。")}</p></div></li>
          </ol>
        </section>

        <section className="setup-card" aria-labelledby="session-setup-title">
          <div className="card-heading">
            <div><p className="card-kicker">{tr(language, "Session setup", "实验设置")}</p><h2 id="session-setup-title">{tr(language, "Prepare tonight's session", "准备今晚的实验")}</h2></div>
            <span className={`ready-pill ${setupIsTestMode ? "test" : setupIsAdminMode ? "admin" : ""}`}>
              {setupIsTestMode ? tr(language, "Test mode", "测试模式") : setupIsAdminMode ? tr(language, "Administrator", "管理员") : tr(language, "Ready", "准备就绪")}
            </span>
          </div>

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
            autoComplete="off"
            maxLength={80}
            required
            aria-invalid={Boolean(formError && !participantId.trim())}
            aria-describedby={formError ? "setup-error" : undefined}
          />
          {!setupIsAdminMode && !setupIsTestMode ? (
            <>
              <p className="profile-field-help">
                {tr(language, "Your name must be unique. A non-identifying nickname is recommended; use the exact same spelling every time.", "姓名必须独一无二。建议使用不会暴露身份的网名，并且每次都使用完全相同的写法。")}
              </p>
              <details className="recovery-access-details">
                <summary>{tr(language, "Returning on another device? Enter your recovery code", "换了设备？请输入恢复码")}</summary>
                <div className="recovery-access-fields">
                  <label className="field-label" htmlFor="participant-recovery-code">{tr(language, "20-character recovery code", "20 位恢复码")}</label>
                  <input
                    id="participant-recovery-code"
                    value={participantRecoveryCodeInput}
                    onChange={(event) => setParticipantRecoveryCodeInput(event.target.value.toUpperCase())}
                    placeholder="AAAAA-BBBBB-CCCCC-DDDDD"
                    autoComplete="off"
                    inputMode="text"
                    maxLength={32}
                  />
                  <small>{tr(language, "The same browser remembers your code automatically. Never share it publicly.", "同一浏览器会自动记住恢复码，请不要公开分享。")}</small>
                </div>
              </details>
            </>
          ) : null}

          {setupIsTestMode ? (
            <p className="test-mode-note" role="status">{tr(language, "Test mode is active. It can be repeated and never saves participant data.", "测试模式已启用，可以反复使用且不会保存参与者数据。")}</p>
          ) : null}
          {setupIsAdminMode ? (
            <p className="admin-mode-note" role="status">{tr(language, "Administrator access selected. A password is required to view remote study data.", "已选择管理员入口，需要密码才能查看远程研究数据。")}</p>
          ) : null}

          {!setupIsAdminMode ? (
            <fieldset>
              <legend>{tr(language, "Select the condition assigned by the researcher", "选择研究者分配的实验条件")}</legend>
              <div className="condition-grid">
                {CONDITIONS.map((condition) => (
                  <label key={condition.id} className={`condition-card ${conditionId === condition.id ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="light-condition"
                      value={condition.id}
                      checked={conditionId === condition.id}
                      onChange={() => setConditionId(condition.id)}
                    />
                    <span
                      className={`condition-swatch ${condition.id === "control" ? "control" : ""}`}
                      style={condition.color ? { backgroundColor: condition.color } : undefined}
                    />
                    <span><strong>{conditionLabel(condition.id, language)}</strong><small>{conditionLuminanceLabel(condition, language)}</small></span>
                    <i aria-hidden="true">{conditionId === condition.id ? "✓" : ""}</i>
                  </label>
                ))}
              </div>
            </fieldset>
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
            <p><strong>{tr(language, "Study schedule", "实验安排")}</strong> {tr(language, "The website does not require a washout day. Follow the researcher's assigned order; consecutive-night sessions are allowed.", "网站不强制要求间隔一天。请遵循研究者分配的顺序；允许连续几晚进行不同条件。")}</p>
          </div>
          <div className="local-data-note">
            <span>
              {setupIsAdminMode
                ? tr(language, "Remote records remain protected until administrator sign-in succeeds.", "管理员登录成功前，远程记录会继续受到保护。")
                : setupIsTestMode
                  ? tr(language, "The hidden test participant never writes session data to this browser or database.", "内置测试用户不会向浏览器或数据库写入实验数据。")
                  : tr(language, "This browser remembers your profile. Overnight progress is recoverable for 48 hours; prior versions and answers are never overwritten.", "此浏览器会记住你的档案，整晚进度可在 48 小时内恢复；以前版本和回答不会被覆盖。")}
            </span>
          </div>
        </section>
      </div>

      <footer>
        <span>Sleep Light Study</span>
        <span>{tr(language, "Conditions: bright red · dim red · bright blue · dim blue · no-exposure control", "条件：亮红 · 暗红 · 亮蓝 · 暗蓝 · 无光照对照")}</span>
      </footer>
    </main>
  );
}
