"use client";

import { useState, type ReactNode } from "react";
import type { ParticipantHistoryGroup } from "./consistency-review";
import { KSS_OPTIONS, type DeviceInfo } from "./protocol-v3";
import type {
  AdminParticipantFeedback,
  AdminParticipantProfile,
  RemoteStudySession,
} from "./remote-storage";
import type { Language } from "./i18n";

type ProfileMatch = "profile-id" | "normalized-name" | "none";

type AdminSessionDetailsProps = {
  language: Language;
  session: RemoteStudySession;
  profile: AdminParticipantProfile | null;
  profileMatch: ProfileMatch;
  feedback: AdminParticipantFeedback[];
  history: ParticipantHistoryGroup | undefined;
  onDownload: (format: "csv" | "json") => void;
};

type DetailItem = {
  label: string;
  value: ReactNode;
};

type TableColumn<T> = {
  key: string;
  label: string;
  render: (item: T, index: number) => ReactNode;
};

const KSS_ZH = [
  "极度清醒",
  "非常清醒",
  "清醒",
  "比较清醒",
  "既不清醒也不困倦",
  "有一些困倦迹象",
  "困倦，但无需努力保持清醒",
  "困倦，需要一些努力保持清醒",
  "非常困倦，努力保持清醒、正在对抗睡意",
] as const;

const VALUE_LABELS: Record<string, [string, string]> = {
  yes: ["Yes", "是"],
  no: ["No", "否"],
  "prefer-not-to-answer": ["Prefer not to answer", "不愿回答"],
  "warm-white-yellow": ["Warm white / yellow", "暖白色／黄色"],
  "cool-white": ["Cool white", "冷白色"],
  red: ["Red", "红色"],
  blue: ["Blue", "蓝色"],
  green: ["Green", "绿色"],
  multicolor: ["Multicolor", "多种颜色"],
  other: ["Other", "其他"],
  unsure: ["Unsure", "不确定"],
  cold: ["Cold", "冷"],
  "slightly-cold": ["Slightly cold", "稍冷"],
  comfortable: ["Comfortable", "舒适"],
  "slightly-warm": ["Slightly warm", "稍热"],
  hot: ["Hot", "热"],
  none: ["None / quiet", "无噪音／安静"],
  low: ["Low", "较低"],
  moderate: ["Moderate", "中等"],
  high: ["High", "较高"],
  phone: ["Phone", "手机"],
  tablet: ["Tablet", "平板"],
  computer: ["Computer", "电脑"],
  automatic: ["Automatic", "自动判断"],
  "participant-correction": ["Participant correction", "参与者修正"],
  pointer: ["Pointer / touch", "点击／触摸"],
  space: ["Space key", "空格键"],
  enter: ["Enter key", "回车键"],
  hit: ["Hit", "已回应"],
  missed: ["Missed", "未回应"],
  omitted: ["Omitted", "未呈现"],
  cancelled: ["Cancelled", "已取消"],
  pending: ["Pending", "待处理"],
  valid: ["Valid", "有效"],
  "false-start": ["False start", "提前反应"],
  completed: ["Completed", "已完成"],
  terminated: ["Terminated", "提前终止"],
  active: ["Active", "进行中"],
  "not-applicable": ["Not applicable", "不适用"],
  "not-started": ["Not started", "未开始"],
  "in-progress": ["In progress", "进行中"],
  end_sequence: ["Keyboard E-N-D", "键盘 E-N-D"],
  touch_end: ["Touch End control", "触屏结束按钮"],
  page_reload: ["Page reload / interruption", "页面刷新／中断"],
  visibility_hidden: ["Page hidden", "页面进入后台"],
  visibility_visible: ["Page visible", "页面恢复显示"],
  fullscreen_entered: ["Fullscreen entered", "进入全屏"],
  fullscreen_exited: ["Fullscreen exited", "退出全屏"],
  screen_use: ["Screen use", "屏幕使用"],
  music: ["Music", "音乐"],
  caffeine: ["Caffeine", "咖啡因"],
  sleep_aid: ["Sleep aid", "睡眠辅助品"],
};

function tr(language: Language, english: string, chinese: string) {
  return language === "zh" ? chinese : english;
}

function localizedCode(value: string | null, language: Language) {
  if (value === null) return tr(language, "— (null)", "—（空值）");
  const label = VALUE_LABELS[value];
  return label ? label[language === "zh" ? 1 : 0] : value;
}

function booleanLabel(value: boolean | null, language: Language) {
  if (value === null) return tr(language, "— (null)", "—（空值）");
  return value ? tr(language, "Yes", "是") : tr(language, "No", "否");
}

function exactDate(value: string | null, language: Language) {
  if (value === null) return tr(language, "— (null)", "—（空值）");
  return (
    <span className="admin-exact-value">
      <span>{new Date(value).toLocaleString(language === "zh" ? "zh-CN" : "en")}</span>
      <code>{value}</code>
    </span>
  );
}

function formatDuration(milliseconds: number, language: Language) {
  const seconds = milliseconds / 1000;
  const friendly = seconds >= 60
    ? `${Math.floor(seconds / 60)} ${tr(language, "min", "分")} ${(seconds % 60).toFixed(seconds % 1 ? 1 : 0)} ${tr(language, "s", "秒")}`
    : `${seconds.toFixed(seconds % 1 ? 1 : 0)} ${tr(language, "s", "秒")}`;
  return `${friendly} (${milliseconds.toLocaleString()} ms)`;
}

function formatElapsed(milliseconds: number | null, language: Language) {
  return milliseconds === null
    ? tr(language, "— (null)", "—（空值）")
    : `${(milliseconds / 1000).toFixed(3)} ${tr(language, "s", "秒")} (${milliseconds} ms)`;
}

function formatPosition(value: number | null, language: Language) {
  return value === null ? tr(language, "— (null)", "—（空值）") : `${value.toFixed(2)}%`;
}

function kssLabel(score: number, language: Language) {
  const english = KSS_OPTIONS.find((option) => option.value === score)?.label ?? "Unknown";
  const description = language === "zh" ? KSS_ZH[score - 1] ?? "未知" : english;
  return `${score} — ${description}`;
}

function restednessLabel(score: number, language: Language) {
  const en = ["Not at all rested", "Slightly rested", "Moderately rested", "Well rested", "Very well rested"];
  const zh = ["完全没有休息好", "稍微休息了一些", "休息程度一般", "休息得很好", "休息得非常充分"];
  return `${score} — ${(language === "zh" ? zh : en)[score - 1]}`;
}

function sleepQualityLabel(score: number, language: Language) {
  const en = ["Very poor", "Poor", "Fair", "Good", "Very good"];
  const zh = ["非常差", "差", "一般", "好", "非常好"];
  return `${score} — ${(language === "zh" ? zh : en)[score - 1]}`;
}

function conditionLabel(conditionId: string, language: Language) {
  const labels: Record<string, [string, string]> = {
    "bright-red": ["Bright red", "亮红色"],
    "dim-red": ["Dim red", "暗红色"],
    "bright-blue": ["Bright blue", "亮蓝色"],
    "dim-blue": ["Dim blue", "暗蓝色"],
    control: ["Control — normal sleep", "对照组——正常睡眠"],
  };
  return labels[conditionId]?.[language === "zh" ? 1 : 0] ?? conditionId;
}

function DetailGrid({ items }: { items: DetailItem[] }) {
  return (
    <dl className="admin-detail-grid">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSection({ title, description, children }: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="admin-detail-section">
      <header>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function PagedTable<T>({ items, columns, emptyText, caption, language, pageSize = 50 }: {
  items: readonly T[];
  columns: TableColumn<T>[];
  emptyText: string;
  caption: string;
  language: Language;
  pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  if (!items.length) return <p className="admin-detail-empty">{emptyText}</p>;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const visible = items.slice(start, start + pageSize);
  return (
    <>
      <div className="admin-detail-table-wrap">
        <table>
          <caption>{caption}</caption>
          <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>
            {visible.map((item, index) => (
              <tr key={start + index}>
                {columns.map((column) => <td key={column.key}>{column.render(item, start + index)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 ? (
        <div className="admin-table-pagination" aria-label={caption}>
          <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}>
            {"←"} {tr(language, "Previous", "上一页")}
          </button>
          <span>{safePage + 1} / {totalPages} · {items.length} {tr(language, "rows", "行")}</span>
          <button type="button" onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))} disabled={safePage === totalPages - 1}>
            {tr(language, "Next", "下一页")} {"→"}
          </button>
        </div>
      ) : null}
    </>
  );
}

function DeviceDetails({ device, language }: { device: DeviceInfo | null; language: Language }) {
  if (!device) return <p className="admin-detail-empty">{tr(language, "Not collected.", "未收集。")}</p>;
  return <DetailGrid items={[
    { label: tr(language, "Detection version", "检测版本"), value: device.detectionVersion },
    { label: tr(language, "Detected category", "自动识别设备"), value: localizedCode(device.detectedCategory, language) },
    { label: tr(language, "Confirmed category", "确认设备"), value: localizedCode(device.confirmedCategory, language) },
    { label: tr(language, "Confirmation source", "确认方式"), value: localizedCode(device.confirmationSource, language) },
    { label: tr(language, "Touch capable", "支持触摸"), value: booleanLabel(device.touchCapable, language) },
    { label: tr(language, "Coarse pointer", "粗指针"), value: booleanLabel(device.coarsePointer, language) },
    { label: tr(language, "Fine pointer", "精细指针"), value: booleanLabel(device.finePointer, language) },
    { label: tr(language, "Hover capable", "支持悬停"), value: booleanLabel(device.hoverCapable, language) },
  ]} />;
}

export function AdminSessionDetails({
  language,
  session,
  profile,
  profileMatch,
  feedback,
  history,
  onDownload,
}: AdminSessionDetailsProps) {
  const [showRaw, setShowRaw] = useState(false);
  const record = session.record;
  const v3 = record.schemaVersion === 3 ? record : null;
  const hits = record.trials.filter((trial) => trial.status === "hit").length;
  const misses = record.trials.filter((trial) => trial.status === "missed").length;
  const omitted = record.trials.filter((trial) => trial.status === "omitted").length;

  const attentionColumns: TableColumn<(typeof record.trials)[number]>[] = [
    { key: "number", label: "#", render: (trial) => trial.trialNumber },
    { key: "status", label: tr(language, "Status", "状态"), render: (trial) => localizedCode(trial.status, language) },
    { key: "planned", label: tr(language, "Planned onset", "计划出现"), render: (trial) => formatElapsed(trial.plannedOnsetMs, language) },
    { key: "cross-position", label: tr(language, "Cross X / Y", "十字 X / Y"), render: (trial) => `${formatPosition(trial.crossXPercent, language)} / ${formatPosition(trial.crossYPercent, language)}` },
    { key: "appeared", label: tr(language, "Appeared", "实际出现"), render: (trial) => <span className="admin-exact-value"><span>{formatElapsed(trial.appearedElapsedMs, language)}</span>{trial.appearedAtIso ? <code>{trial.appearedAtIso}</code> : null}</span> },
    { key: "clicked", label: tr(language, "Response", "回应"), render: (trial) => <span className="admin-exact-value"><span>{formatElapsed(trial.clickedElapsedMs, language)}</span>{trial.clickedAtIso ? <code>{trial.clickedAtIso}</code> : null}</span> },
    { key: "reaction", label: tr(language, "Reaction time", "反应时"), render: (trial) => trial.reactionTimeMs === null ? tr(language, "— (null)", "—（空值）") : `${trial.reactionTimeMs} ms` },
    { key: "input", label: tr(language, "Input", "输入方式"), render: (trial) => localizedCode(trial.inputMethod, language) },
    { key: "click-position", label: tr(language, "Click X / Y", "点击 X / Y"), render: (trial) => `${formatPosition(trial.clickXPercent, language)} / ${formatPosition(trial.clickYPercent, language)}` },
  ];

  return (
    <div className="admin-session-details">
      <div className="admin-detail-heading">
        <div>
          <span>{tr(language, "Detailed session results", "单次实验详细结果")}</span>
          <h2>{record.participantId} · {conditionLabel(record.conditionId, language)}</h2>
          <code>{record.sessionId}</code>
        </div>
        <div className="admin-detail-actions">
          <button type="button" onClick={() => onDownload("csv")}>CSV</button>
          <button type="button" onClick={() => onDownload("json")}>JSON</button>
        </div>
      </div>

      <DetailSection title={tr(language, "1. Record and profile", "1. 记录与姓名档案")}>
        <DetailGrid items={[
          { label: tr(language, "Study name", "实验姓名"), value: record.participantId },
          { label: tr(language, "Session ID", "实验编号"), value: <code>{record.sessionId}</code> },
          { label: tr(language, "Database received", "数据库接收时间"), value: exactDate(session.createdAt, language) },
          { label: tr(language, "Schema version", "数据结构版本"), value: `v${record.schemaVersion}` },
          { label: tr(language, "Profile link", "档案关联方式"), value: profileMatch === "profile-id" ? tr(language, "Exact profile ID", "精确档案 ID") : profileMatch === "normalized-name" ? tr(language, "Historical normalized-name match", "历史姓名规范化匹配") : tr(language, "No linked profile", "没有关联档案") },
          { label: tr(language, "Participant profile ID", "参与者档案 ID"), value: v3?.participantProfileId ? <code>{v3.participantProfileId}</code> : tr(language, "Not collected in schema v2 / older record", "Schema v2／旧记录未收集") },
          { label: tr(language, "Website build", "网页构建版本"), value: v3?.studyBuildVersion ?? tr(language, "Not collected in schema v2 / older record", "Schema v2／旧记录未收集") },
          { label: tr(language, "Profile created", "档案创建时间"), value: profile ? exactDate(profile.createdAt, language) : "—" },
          { label: tr(language, "Profile last accessed", "档案最近访问"), value: profile ? exactDate(profile.lastAccessedAt, language) : "—" },
          { label: tr(language, "Completed sessions", "已完成实验次数"), value: profile?.completedSessionCount ?? "—" },
          { label: tr(language, "Completed conditions", "已完成条件"), value: profile ? (profile.completedConditionIds.length ? profile.completedConditionIds.map((id) => conditionLabel(id, language)).join(" · ") : tr(language, "None", "无")) : "—" },
          { label: tr(language, "Profile feedback count", "档案反馈数量"), value: profile?.feedbackCount ?? "—" },
        ]} />
      </DetailSection>

      <DetailSection title={tr(language, "2. Condition and exposure", "2. 条件与光照")}>
        <DetailGrid items={[
          { label: tr(language, "Condition", "实验条件"), value: `${conditionLabel(record.conditionId, language)} (${record.conditionId})` },
          { label: tr(language, "Stored condition name", "保存的条件名称"), value: record.conditionName },
          { label: tr(language, "Color hex", "颜色 Hex"), value: record.stimulusColorHex ?? tr(language, "— (null)", "—（空值）") },
          { label: tr(language, "Color RGB", "颜色 RGB"), value: record.stimulusColorRgb ?? tr(language, "— (null)", "—（空值）") },
          { label: tr(language, "Session status", "实验状态"), value: localizedCode(record.status, language) },
          { label: tr(language, "Exposure status", "光照状态"), value: v3 ? localizedCode(v3.exposureStatus, language) : tr(language, "Not collected in schema v2", "Schema v2 未收集") },
          { label: tr(language, "Termination reason", "终止原因"), value: localizedCode(record.terminationReason, language) },
          { label: tr(language, "Fullscreen at start", "开始时全屏"), value: booleanLabel(record.fullscreenAtStart, language) },
          { label: tr(language, "Fullscreen request failed", "全屏请求失败"), value: booleanLabel(record.fullscreenRequestFailed, language) },
          { label: tr(language, "Protocol version", "实验协议版本"), value: v3?.protocolVersion ?? tr(language, "Not collected in schema v2", "Schema v2 未收集") },
          { label: tr(language, "Attention protocol", "注意任务版本"), value: v3?.attentionProtocolVersion ?? tr(language, "Not collected in schema v2", "Schema v2 未收集") },
        ]} />
      </DetailSection>

      <DetailSection title={tr(language, "3. Timeline and durations", "3. 时间线与时长")}>
        <DetailGrid items={[
          { label: tr(language, "Session started", "实验开始"), value: exactDate(record.startedAtIso, language) },
          { label: tr(language, "Stimulus started", "光照开始"), value: v3 ? exactDate(v3.stimulusStartedAtIso, language) : tr(language, "Not collected in schema v2", "Schema v2 未收集") },
          { label: tr(language, "Planned end", "计划结束"), value: exactDate(record.plannedEndAtIso, language) },
          { label: tr(language, "Stimulus ended", "光照结束"), value: v3 ? exactDate(v3.stimulusEndedAtIso, language) : tr(language, "Not collected in schema v2", "Schema v2 未收集") },
          { label: tr(language, "Sleep marked", "标记入睡"), value: v3 ? exactDate(v3.sleepStartedAtIso, language) : tr(language, "Not collected in schema v2", "Schema v2 未收集") },
          { label: tr(language, "Morning return", "早晨返回"), value: v3 ? exactDate(v3.morningReturnedAtIso, language) : tr(language, "Not collected in schema v2", "Schema v2 未收集") },
          { label: tr(language, "Assessment completed", "评估完成"), value: v3 ? exactDate(v3.assessmentCompletedAtIso, language) : tr(language, "Not collected in schema v2", "Schema v2 未收集") },
          { label: tr(language, "Session ended", "实验结束"), value: exactDate(record.endedAtIso, language) },
          { label: tr(language, "Planned duration", "计划时长"), value: formatDuration(record.plannedDurationMs, language) },
          { label: tr(language, "Active exposure duration", "有效光照时长"), value: formatDuration(record.actualDurationMs, language) },
          { label: tr(language, "Wall-clock duration", "墙钟时长"), value: formatDuration(record.wallClockDurationMs, language) },
          { label: tr(language, "Total paused", "暂停总时长"), value: formatDuration(record.totalPausedDurationMs, language) },
          { label: tr(language, "Cross visible duration", "十字显示时长"), value: formatDuration(record.crossVisibleMs, language) },
        ]} />
      </DetailSection>

      {v3 ? (
        <>
          <DetailSection title={tr(language, "4. Pre-sleep questionnaire", "4. 睡前问卷")}>
            <DetailGrid items={[
              { label: tr(language, "Questionnaire version", "问卷版本"), value: v3.preSurvey.questionnaireVersion },
              { label: tr(language, "Answered", "回答时间"), value: exactDate(v3.preSurvey.answeredAtIso, language) },
              { label: tr(language, "Previous-night sleep time", "昨天入睡时间"), value: <code>{v3.preSurvey.previousNightSleepTime}</code> },
              { label: tr(language, "Sleepiness before sleep (KSS)", "睡前困倦（KSS）"), value: kssLabel(v3.preSurvey.sleepinessKss, language) },
              { label: tr(language, "Screen use before sleep", "睡前使用电子产品"), value: localizedCode(v3.preSurvey.screenUseBeforeSleep, language) },
              { label: tr(language, "Screen-use duration", "电子产品使用时长"), value: v3.preSurvey.screenUseMinutes === null ? tr(language, "— (null)", "—（空值）") : `${v3.preSurvey.screenUseMinutes} ${tr(language, "minutes", "分钟")}` },
              { label: tr(language, "Sleeps with a light", "睡觉时开灯"), value: localizedCode(v3.preSurvey.sleepsWithLight, language) },
              { label: tr(language, "Sleep-light color", "睡眠灯颜色"), value: localizedCode(v3.preSurvey.sleepLightColor, language) },
              { label: tr(language, "Sleep temperature", "睡眠环境温度"), value: localizedCode(v3.preSurvey.sleepTemperature, language) },
              { label: tr(language, "Sleep aid / supplement", "睡眠辅助药品／保健品"), value: localizedCode(v3.preSurvey.sleepAidMedicationOrSupplement, language) },
              { label: tr(language, "Morning restedness", "早晨精力充沛程度"), value: restednessLabel(v3.preSurvey.morningRestedness, language) },
              { label: tr(language, "Previous sleep quality", "之前睡眠质量"), value: sleepQualityLabel(v3.preSurvey.previousNightSleepQuality, language) },
              { label: tr(language, "Caffeine in past 8 hours", "过去 8 小时摄入咖啡因"), value: localizedCode(v3.preSurvey.caffeineInPast8Hours, language) },
              { label: tr(language, "Music before sleep", "睡前播放音乐"), value: localizedCode(v3.preSurvey.musicBeforeSleep, language) },
              { label: tr(language, "Sleep-environment noise", "睡眠环境噪音"), value: localizedCode(v3.preSurvey.sleepNoiseLevel, language) },
              { label: tr(language, "Vigorous exercise in past 12 hours", "过去 12 小时剧烈运动"), value: localizedCode(v3.preSurvey.vigorousExerciseInPast12Hours, language) },
            ]} />
          </DetailSection>

          <DetailSection title={tr(language, "5. After waking and reaction test", "5. 睡醒问卷与反应测试")}>
            {v3.postSurvey ? <DetailGrid items={[
              { label: tr(language, "Questionnaire version", "问卷版本"), value: v3.postSurvey.questionnaireVersion },
              { label: tr(language, "Answered", "回答时间"), value: exactDate(v3.postSurvey.answeredAtIso, language) },
              { label: tr(language, "Sleepiness after waking (KSS)", "睡醒后困倦（KSS）"), value: kssLabel(v3.postSurvey.sleepinessKss, language) },
            ]} /> : <p className="admin-detail-empty">{tr(language, "The post-waking questionnaire was not completed.", "睡醒后问卷未完成。")}</p>}
            {v3.reactionTest ? (
              <>
                <DetailGrid items={[
                  { label: tr(language, "Reaction protocol", "反应测试版本"), value: v3.reactionTest.protocolVersion },
                  { label: tr(language, "Started", "开始时间"), value: exactDate(v3.reactionTest.startedAtIso, language) },
                  { label: tr(language, "Completed", "完成时间"), value: exactDate(v3.reactionTest.completedAtIso, language) },
                  { label: tr(language, "Valid trials", "有效次数"), value: v3.reactionTest.validCount },
                  { label: tr(language, "Exact average", "精确平均反应时"), value: `${v3.reactionTest.averageReactionTimeMs} ms` },
                  { label: tr(language, "Median", "中位反应时"), value: `${v3.reactionTest.medianReactionTimeMs} ms` },
                  { label: tr(language, "False starts", "提前反应次数"), value: v3.reactionTest.falseStartCount },
                  { label: tr(language, "Misses", "漏答次数"), value: v3.reactionTest.missCount },
                ]} />
                <PagedTable
                  language={language}
                  items={v3.reactionTest.trials}
                  caption={tr(language, "Three formal reaction trials", "三次正式反应试次")}
                  emptyText={tr(language, "No reaction trials.", "没有反应试次。")}
                  columns={[
                    { key: "number", label: "#", render: (trial) => trial.trialNumber },
                    { key: "status", label: tr(language, "Status", "状态"), render: (trial) => localizedCode(trial.status, language) },
                    { key: "started", label: tr(language, "Trial started", "试次开始"), render: (trial) => exactDate(trial.startedAtIso, language) },
                    { key: "delay", label: tr(language, "Stimulus delay", "刺激等待"), render: (trial) => `${trial.stimulusDelayMs} ms` },
                    { key: "shown", label: tr(language, "Stimulus shown", "刺激出现"), render: (trial) => exactDate(trial.stimulusShownAtIso, language) },
                    { key: "responded", label: tr(language, "Responded", "回应时间"), render: (trial) => exactDate(trial.respondedAtIso, language) },
                    { key: "reaction", label: tr(language, "Reaction time", "反应时"), render: (trial) => trial.reactionTimeMs === null ? tr(language, "— (null)", "—（空值）") : `${trial.reactionTimeMs} ms` },
                    { key: "input", label: tr(language, "Input", "输入方式"), render: (trial) => localizedCode(trial.inputMethod, language) },
                  ]}
                />
              </>
            ) : <p className="admin-detail-empty">{tr(language, "The reaction test was not completed.", "反应测试未完成。")}</p>}
          </DetailSection>

          <DetailSection title={tr(language, "6. Device records", "6. 设备记录")}>
            <h4>{tr(language, "Before sleep", "睡前设备")}</h4>
            <DeviceDetails device={v3.deviceInfo.beforeSleep} language={language} />
            <h4>{tr(language, "After waking", "睡醒后设备")}</h4>
            <DeviceDetails device={v3.deviceInfo.afterWaking} language={language} />
            <DetailGrid items={[{ label: tr(language, "Device changed", "是否更换设备"), value: booleanLabel(v3.deviceInfo.deviceChanged, language) }]} />
          </DetailSection>
        </>
      ) : (
        <DetailSection title={tr(language, "Schema v2 historical limits", "Schema v2 历史数据限制") }>
          <p className="admin-detail-history-note">
            {tr(
              language,
              "This historical schema v2 record did not collect the pre/post questionnaires, overnight milestones, device history, reaction test, exposure status, participant profile ID, or website build version. Those values are not inferred or reconstructed here.",
              "这条历史 Schema v2 记录当时没有收集前后问卷、整夜时间点、设备历史、反应测试、光照状态、参与者档案 ID 或网页构建版本。本页面不会推断或补造这些内容。",
            )}
          </p>
        </DetailSection>
      )}

      <DetailSection
        title={tr(language, "7. Attention-task results", "7. 注意任务结果")}
        description={record.conditionId === "control" ? tr(language, "The Control condition has no attention task.", "Control 条件没有注意任务。") : undefined}
      >
        <DetailGrid items={[
          { label: tr(language, "Planned / recorded trials", "计划／记录试次"), value: `${record.trialPlan.length} / ${record.trials.length}` },
          { label: tr(language, "Hits", "已回应"), value: hits },
          { label: tr(language, "Missed", "未回应"), value: misses },
          { label: tr(language, "Omitted", "未呈现"), value: omitted },
          { label: tr(language, "False / extra clicks", "无十字／多余点击"), value: record.falseClicks.length },
        ]} />
        <PagedTable
          language={language}
          items={record.trials}
          columns={attentionColumns}
          caption={tr(language, "Attention trials", "注意任务试次")}
          emptyText={record.conditionId === "control" ? tr(language, "Not applicable for Control.", "Control 不适用。") : tr(language, "No trials were recorded.", "没有记录试次。")}
        />
      </DetailSection>

      <DetailSection title={tr(language, "8. Extra clicks, pauses, and display events", "8. 多余点击、暂停与显示事件")}>
        <h4>{tr(language, "False / extra clicks", "无十字／多余点击")}</h4>
        <PagedTable
          language={language}
          items={record.falseClicks}
          caption={tr(language, "False and extra clicks", "无十字与多余点击")}
          emptyText={tr(language, "No false or extra clicks.", "没有无十字或多余点击。")}
          columns={[
            { key: "number", label: "#", render: (_item, index) => index + 1 },
            { key: "elapsed", label: tr(language, "Elapsed", "实验内时间"), render: (click) => formatElapsed(click.clickedElapsedMs, language) },
            { key: "time", label: tr(language, "Timestamp", "时间戳"), render: (click) => exactDate(click.clickedAtIso, language) },
            { key: "input", label: tr(language, "Input", "输入方式"), render: (click) => localizedCode(click.inputMethod, language) },
            { key: "position", label: tr(language, "Click X / Y", "点击 X / Y"), render: (click) => `${formatPosition(click.clickXPercent, language)} / ${formatPosition(click.clickYPercent, language)}` },
          ]}
        />

        <h4>{tr(language, "Pauses", "暂停记录")}</h4>
        <PagedTable
          language={language}
          items={record.pauses}
          caption={tr(language, "Pause records", "暂停记录")}
          emptyText={tr(language, "No pauses.", "没有暂停。")}
          columns={[
            { key: "number", label: "#", render: (pause) => pause.pauseNumber },
            { key: "elapsed", label: tr(language, "Started elapsed", "开始时实验内时间"), render: (pause) => formatElapsed(pause.startedElapsedMs, language) },
            { key: "started", label: tr(language, "Started", "开始"), render: (pause) => exactDate(pause.startedAtIso, language) },
            { key: "ended", label: tr(language, "Ended", "结束"), render: (pause) => exactDate(pause.endedAtIso, language) },
            { key: "duration", label: tr(language, "Duration", "时长"), render: (pause) => formatDuration(pause.durationMs, language) },
          ]}
        />

        <h4>{tr(language, "Visibility and fullscreen events", "页面可见性与全屏事件")}</h4>
        <PagedTable
          language={language}
          items={record.environmentEvents}
          caption={tr(language, "Display events", "显示事件")}
          emptyText={tr(language, "No display events.", "没有显示事件。")}
          columns={[
            { key: "number", label: "#", render: (_event, index) => index + 1 },
            { key: "type", label: tr(language, "Event", "事件"), render: (event) => localizedCode(event.type, language) },
            { key: "elapsed", label: tr(language, "Elapsed", "实验内时间"), render: (event) => formatElapsed(event.elapsedMs, language) },
            { key: "time", label: tr(language, "Timestamp", "时间戳"), render: (event) => exactDate(event.atIso, language) },
          ]}
        />
      </DetailSection>

      <DetailSection title={tr(language, "9. Automated consistency review", "9. 自动环境一致性复核")}>
        {history ? (
          <>
            <DetailGrid items={[
              { label: tr(language, "Eligible completed v3 sessions", "符合条件的已完成 v3 实验"), value: history.consistencyReview.completedSessionCount },
              { label: tr(language, "Needs careful review", "需要认真复核"), value: booleanLabel(history.consistencyReview.needsReview, language) },
              { label: tr(language, "Sleep-time spread", "入睡时间跨度"), value: history.consistencyReview.metrics.sleepTimeSpreadMinutes === null ? tr(language, "Not enough data", "数据不足") : `${history.consistencyReview.metrics.sleepTimeSpreadMinutes} ${tr(language, "minutes", "分钟")}` },
              { label: tr(language, "Temperature-category spread", "温度等级跨度"), value: history.consistencyReview.metrics.temperatureOrdinalSpread ?? tr(language, "Not enough data", "数据不足") },
              { label: tr(language, "Noise-category spread", "噪音等级跨度"), value: history.consistencyReview.metrics.noiseOrdinalSpread ?? tr(language, "Not enough data", "数据不足") },
              { label: tr(language, "Changed behaviors", "发生变化的行为"), value: history.consistencyReview.metrics.changedBehaviors.length ? history.consistencyReview.metrics.changedBehaviors.map((value) => localizedCode(value, language)).join(" · ") : tr(language, "None detected", "未检测到") },
              { label: tr(language, "Completed conditions", "已完成条件"), value: history.conditionHistory.completedConditions.length ? history.conditionHistory.completedConditions.map((id) => conditionLabel(id, language)).join(" · ") : tr(language, "None", "无") },
              { label: tr(language, "Remaining conditions", "剩余条件"), value: history.conditionHistory.remainingConditions.length ? history.conditionHistory.remainingConditions.map((id) => conditionLabel(id, language)).join(" · ") : tr(language, "None", "无") },
            ]} />
            {history.consistencyReview.reasons.length ? (
              <ul className="admin-detail-review-reasons">
                {history.consistencyReview.reasons.map((reason) => <li key={reason.key}>{reason.label[language]}</li>)}
              </ul>
            ) : <p className="admin-detail-empty">{tr(language, "No automatic warning. This is not proof that the sessions were identical or valid.", "没有自动警告；这不代表各次环境完全相同，也不代表数据必然有效。")}</p>}
          </>
        ) : <p className="admin-detail-empty">{tr(language, "Not enough eligible completed v3 sessions for a consistency review.", "没有足够的合格已完成 v3 实验用于一致性复核。")}</p>}
      </DetailSection>

      <DetailSection title={tr(language, "10. Feedback and questions", "10. 反馈与问题")}>
        {feedback.length ? feedback.map((item) => (
          <article className="admin-detail-feedback" key={item.feedbackId}>
            <header>
              <strong>{item.messageType === "question" ? tr(language, "Question", "问题") : tr(language, "Feedback", "反馈")}</strong>
              <span>{new Date(item.createdAt).toLocaleString(language === "zh" ? "zh-CN" : "en")}</span>
            </header>
            <p>{item.message}</p>
            <DetailGrid items={[
              { label: tr(language, "Feedback ID", "反馈 ID"), value: <code>{item.feedbackId}</code> },
              { label: tr(language, "Profile ID", "档案 ID"), value: <code>{item.profileId}</code> },
              { label: tr(language, "Session ID", "实验编号"), value: <code>{item.sessionId}</code> },
              { label: tr(language, "Stored display name", "保存的显示姓名"), value: item.displayName },
              { label: tr(language, "Condition", "条件"), value: conditionLabel(item.conditionId, language) },
              { label: tr(language, "Response language", "回应语言"), value: item.language },
              { label: tr(language, "Prompt version", "提示版本"), value: item.promptVersion },
              { label: tr(language, "Website build", "网页构建版本"), value: item.studyBuildVersion ?? tr(language, "— (null)", "—（空值）") },
              { label: tr(language, "Created", "创建时间"), value: exactDate(item.createdAt, language) },
            ]} />
          </article>
        )) : <p className="admin-detail-empty">{tr(language, "No feedback or questions for this session.", "这次实验没有反馈或问题。")}</p>}
      </DetailSection>

      <DetailSection
        title={tr(language, "11. Raw validated session payload", "11. 原始已校验实验数据")}
        description={tr(language, "Unknown extra fields are shown only in this literal JSON and are not interpreted by the structured view.", "未知附加字段只会出现在原始 JSON 中，结构化页面不会解释它们。")}
      >
        <button className="admin-raw-toggle" type="button" onClick={() => setShowRaw((current) => !current)} aria-expanded={showRaw}>
          {showRaw ? tr(language, "Hide raw JSON", "收起原始 JSON") : tr(language, "Show raw JSON", "查看原始 JSON")}
        </button>
        {showRaw ? <pre className="admin-raw-json">{JSON.stringify(record, null, 2)}</pre> : null}
      </DetailSection>
    </div>
  );
}
