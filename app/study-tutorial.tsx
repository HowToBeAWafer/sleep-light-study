"use client";

import type { Language } from "./i18n";
import type { ConditionId } from "./protocol-v3";

const CONDITION_LABELS: Record<Language, Record<ConditionId, string>> = {
  en: {
    "bright-red": "Bright red",
    "dim-red": "Dim red",
    "bright-blue": "Bright blue",
    "dim-blue": "Dim blue",
    control: "Control — normal sleep",
  },
  zh: {
    "bright-red": "亮红色",
    "dim-red": "暗红色",
    "bright-blue": "亮蓝色",
    "dim-blue": "暗蓝色",
    control: "对照组——正常睡眠",
  },
};

const ALL_CONDITIONS: ConditionId[] = [
  "bright-red",
  "dim-red",
  "bright-blue",
  "dim-blue",
  "control",
];

type StudyTutorialProps = {
  language: Language;
  displayName: string;
  assignedConditionId: ConditionId;
  completedConditionIds: ConditionId[];
  isTestMode: boolean;
  onContinue: () => void;
};

export function StudyTutorial({
  language,
  displayName,
  assignedConditionId,
  completedConditionIds,
  isTestMode,
  onContinue,
}: StudyTutorialProps) {
  const zh = language === "zh";
  const completed = new Set(completedConditionIds);
  const remaining = ALL_CONDITIONS.filter((conditionId) => !completed.has(conditionId));
  const assignedWasCompleted = completed.has(assignedConditionId);

  return (
    <main className="tutorial-shell">
      <section className="tutorial-card" aria-labelledby="study-tutorial-title">
        <header className="tutorial-header">
          <p className="eyebrow">{zh ? "开始前必读" : "Read before every session"}</p>
          <h1 id="study-tutorial-title">
            {zh ? `${displayName}，请尽量保持每晚环境一致。` : `${displayName}, keep each night as comparable as possible.`}
          </h1>
          <p>
            {zh
              ? "环境不需要完美，但请不要为了某一次实验刻意改变平常习惯。若无法保持一致，请如实回答问卷；不要为了实验牺牲安全或身体舒适。"
              : "The environment does not need to be perfect. Do not deliberately change your normal routine for one session. If something differs, answer honestly; never sacrifice safety or comfort for the study."}
          </p>
        </header>

        {!isTestMode ? (
          <aside className="recovery-code-card" aria-label={zh ? "登录状态" : "Sign-in status"}>
            <div>
              <strong>{zh ? "你的档案已登录" : "Your profile is signed in"}</strong>
              <p>
                {zh
                  ? "本浏览器会记住派生登录凭证而不是你的密码。下次刷新或返回时，可以继续查看以前的进度。"
                  : "This browser remembers a derived sign-in credential, not your password, so your prior progress can load after refreshing or returning."}
              </p>
            </div>
            <code>{displayName}</code>
          </aside>
        ) : null}

        <section className="tutorial-section" aria-labelledby="environment-checklist-title">
          <div className="tutorial-section-heading">
            <span>01</span>
            <div>
              <h2 id="environment-checklist-title">{zh ? "每次尽量保持相同" : "Keep these as similar as practical"}</h2>
              <p>{zh ? "管理员会看到明显差异的黄色复核提示。" : "Large differences may create a yellow review flag for the researcher."}</p>
            </div>
          </div>
          <ul className="environment-checklist">
            <li><strong>{zh ? "时间" : "Timing"}</strong><span>{zh ? "大致相同的上床、尝试入睡和起床时间" : "Similar bedtime, attempt-to-sleep time, and wake time"}</span></li>
            <li><strong>{zh ? "温度" : "Temperature"}</strong><span>{zh ? "相近的房间温度、被褥和睡衣" : "Similar room temperature, bedding, and sleepwear"}</span></li>
            <li><strong>{zh ? "声音" : "Sound"}</strong><span>{zh ? "相近的噪音、音乐、耳塞或白噪音设置" : "Similar noise, music, earplug, or white-noise setup"}</span></li>
            <li><strong>{zh ? "光线" : "Light"}</strong><span>{zh ? "相近的房间灯、窗帘和睡眠环境光线" : "Similar room lights, curtains, and sleep-environment lighting"}</span></li>
            <li><strong>{zh ? "设备" : "Device"}</strong><span>{zh ? "尽量使用同一设备、浏览器、亮度及显示设置" : "Use the same device, browser, brightness, and display settings when possible"}</span></li>
            <li><strong>{zh ? "日常习惯" : "Routine"}</strong><span>{zh ? "尽量保持咖啡因、运动、睡前屏幕和助眠用品习惯相近" : "Keep caffeine, exercise, pre-sleep screen use, and sleep-aid routines comparable"}</span></li>
          </ul>
        </section>

        <section className="tutorial-section" aria-labelledby="session-flow-title">
          <div className="tutorial-section-heading">
            <span>02</span>
            <div>
              <h2 id="session-flow-title">{zh ? "今晚怎么做" : "What to do tonight"}</h2>
              <p>
                {zh
                  ? "先完成睡前问卷，再完成研究者分配的条件。睡醒后回到同一网页完成困倦量表和三次有效反应。"
                  : "Complete the pre-sleep questionnaire, then the assigned condition. After waking, return to this page for the sleepiness scale and three valid reactions."}
              </p>
            </div>
          </div>
          <div className="assigned-condition-banner">
            <span>{zh ? "本次分配" : "Assigned this session"}</span>
            <strong>{CONDITION_LABELS[language][assignedConditionId]}</strong>
            {assignedWasCompleted ? (
              <small>{zh ? "这个条件以前做过；只有研究者要求重复时才继续。" : "This condition was completed before. Continue only if the researcher assigned a repeat."}</small>
            ) : null}
          </div>
          <ol className="tutorial-flow-list">
            <li>
              {zh ? <><strong>颜色条件：</strong>专注观看<strong>五分钟</strong>画面；出现<strong>黑色十字</strong>时，立即<strong>点击屏幕或按 Space/Enter</strong>。</> : <><strong>Color conditions:</strong> watch the <strong>five-minute</strong> display and <strong>click, tap, or press Space/Enter</strong> when a <strong>black cross</strong> appears.</>}
            </li>
            <li>
              {zh ? <><strong>暂停/继续：</strong>电脑按 <strong>P</strong>；触屏设备使用底部的 <strong>Pause/Resume</strong> 按钮。</> : <><strong>Pause/Resume:</strong> press <strong>P</strong> on a computer or use the bottom <strong>Pause/Resume</strong> buttons on a touch device.</>}
            </li>
            <li>
              {zh ? <><strong>提前结束：</strong>电脑依次输入 <strong>E → N → D</strong>；触屏设备在三秒内点击两次 <strong>End</strong>。</> : <><strong>End early:</strong> type <strong>E → N → D</strong> on a computer or tap <strong>End twice</strong> within three seconds on a touch device.</>}
            </li>
            <li>
              {zh ? <><strong>对照条件：</strong>不播放颜色或亮度画面，直接按照平常方式<strong>正常睡一整晚</strong>。</> : <><strong>Control:</strong> no color or brightness display; get a <strong>normal full night of sleep</strong>.</>}
            </li>
            <li>
              {zh ? <>准备放下设备时点击<strong>“我要睡觉了”</strong>；睡醒后使用<strong>同一浏览器</strong>返回。</> : <>Select <strong>“I am going to sleep now”</strong> when putting the device away, then return in the <strong>same browser</strong> after waking.</>}
            </li>
            <li>
              {zh ? <>网站不强制隔一天；请严格遵循<strong>研究者安排的日期和顺序</strong>。</> : <>The website does not force a washout day; follow the researcher’s <strong>assigned dates and order</strong>.</>}
            </li>
          </ol>
        </section>

        {assignedConditionId !== "control" ? (
          <section className="tutorial-section" aria-labelledby="practice-preview-title">
            <div className="tutorial-section-heading">
              <span>03</span>
              <div>
                <h2 id="practice-preview-title">{zh ? "先完成一个简短试验轮" : "Complete one short practice round"}</h2>
                <p>
                  {zh
                    ? <>教程之后会用暗色中性画面练习十字反应、暂停/继续和结束操作。<strong>试验轮不会保存，也不会计入正式结果。</strong></>
                    : <>After this tutorial, a dim neutral screen will guide you through the cross response, pause/resume, and end controls. <strong>The practice is not saved and does not count toward the study results.</strong></>}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="tutorial-section" aria-labelledby="progress-title">
          <div className="tutorial-section-heading">
            <span>{assignedConditionId === "control" ? "03" : "04"}</span>
            <div>
              <h2 id="progress-title">{zh ? "你的完成记录" : "Your condition record"}</h2>
              <p>
                {remaining.length
                  ? (zh ? `已完成 ${completed.size} 项；尚有 ${remaining.length} 项未完成。具体下一项以研究者分配为准。` : `${completed.size} completed; ${remaining.length} remain. The researcher’s assignment determines what comes next.`)
                  : (zh ? "五种条件都已有完成记录。仅在研究者要求时重复。" : "All five conditions have a completed record. Repeat only when assigned.")}
              </p>
            </div>
          </div>
          <div className="condition-progress-grid">
            {ALL_CONDITIONS.map((conditionId) => (
              <div key={conditionId} className={completed.has(conditionId) ? "completed" : "remaining"}>
                <span aria-hidden="true">{completed.has(conditionId) ? "✓" : "○"}</span>
                <strong>{CONDITION_LABELS[language][conditionId]}</strong>
                <small>{completed.has(conditionId) ? (zh ? "已完成" : "Completed") : (zh ? "待完成" : "Remaining")}</small>
              </div>
            ))}
          </div>
        </section>

        <p className="tutorial-privacy-note">
          {isTestMode
            ? (zh ? <>测试模式<strong>不会保存</strong>档案、实验记录或反馈。</> : <>Test mode <strong>does not save</strong> profiles, sessions, or feedback.</>)
            : (zh ? "姓名或网名必须唯一。为减少可识别信息，建议使用一个不会暴露身份的网名。" : "Study names must be unique. A non-identifying nickname is recommended to reduce personal information.")}
        </p>
        <button className="primary-button tutorial-continue" type="button" onClick={onContinue}>
          {assignedConditionId === "control"
            ? (zh ? "我已阅读——继续填写睡前问卷" : "I have read this — continue to the pre-sleep questionnaire")
            : (zh ? "我已阅读——开始简短试验轮" : "I have read this — start the short practice")}
        </button>
      </section>
    </main>
  );
}
