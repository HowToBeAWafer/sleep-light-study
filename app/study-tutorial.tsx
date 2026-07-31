"use client";

import { useState } from "react";
import type { Language } from "./i18n";
import {
  V4_CONDITION_ORDER,
  sequencePositionForCondition,
  type V4ConditionId,
} from "./protocol-v4";

const CONDITION_LABELS: Record<Language, Record<V4ConditionId, string>> = {
  en: {
    "dim-red": "Dim red",
    "dim-blue": "Dim blue",
    "bright-blue": "Bright blue",
    "bright-red": "Bright red",
  },
  zh: {
    "dim-red": "暗红色",
    "dim-blue": "暗蓝色",
    "bright-blue": "亮蓝色",
    "bright-red": "亮红色",
  },
};

type StudyTutorialProps = {
  language: Language;
  displayName: string;
  assignedConditionId: V4ConditionId;
  completedSequencePositions: number[];
  isTestMode: boolean;
  onContinue: () => void;
};

export function StudyTutorial({
  language,
  displayName,
  assignedConditionId,
  completedSequencePositions,
  isTestMode,
  onContinue,
}: StudyTutorialProps) {
  const zh = language === "zh";
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const completed = new Set(completedSequencePositions);
  const assignedPosition = sequencePositionForCondition(assignedConditionId);
  const completedCount = completed.size;
  const remainingCount = Math.max(0, 4 - completedCount);

  return (
    <main className="tutorial-shell">
      <section className="tutorial-card" aria-labelledby="study-tutorial-title">
        <header className="tutorial-header">
          <p className="eyebrow">{zh ? "每次实验开始前必读" : "Read before every session"}</p>
          <h1 id="study-tutorial-title">
            {zh
              ? `${displayName}，请按平常时间睡觉。`
              : `${displayName}, keep your normal bedtime.`}
          </h1>
          <p>
            {zh
              ? <>请<strong>不要为了实验提前或推迟上床</strong>。尽量让温度、睡眠时间、声音和其他环境保持相近，但如果实际情况不同，请如实填写问卷。</>
              : <><strong>Do not go to bed later or earlier for the experiment.</strong> Keep temperature, sleep timing, sound, and other conditions as similar as practical, but report any real differences honestly.</>}
          </p>
        </header>

        <aside className="quality-warning" role="alert" aria-labelledby="safety-title">
          <strong id="safety-title">{zh ? "安全与参加资格" : "Safety and eligibility"}</strong>
          <p>
            {zh
              ? <>如果你有<strong>光敏性癫痫病史</strong>，或闪烁、快速出现的视觉刺激会让你明显不适，请<strong>不要参加</strong>。如果画面造成不适，请<strong>立即停止本次实验</strong>。</>
              : <>Do not participate if you have a history of <strong>photosensitive seizures</strong> or significant discomfort with flashing or rapidly appearing visual stimuli. <strong>Stop the session if the display causes discomfort.</strong></>}
          </p>
        </aside>

        {!isTestMode ? (
          <aside className="recovery-code-card" aria-label={zh ? "登录与恢复" : "Sign-in and recovery"}>
            <div>
              <strong>{zh ? "进度与账户关联" : "Progress follows your account"}</strong>
              <p>
                {zh
                  ? <>刷新页面或更换浏览器／设备后，可用<strong>相同实验姓名和密码</strong>登录并恢复远程保存的未完成进度。为减少设备差异，仍应尽量使用同一设备与浏览器；不要同时在两个设备上继续同一次实验。</>
                  : <>After a refresh or browser/device change, sign in with the <strong>same study name and password</strong> to restore remotely saved unfinished progress. To reduce device differences, still use the same device and browser whenever possible. Do not continue the same session on two devices at once.</>}
              </p>
            </div>
            <code>{displayName}</code>
          </aside>
        ) : null}

        <section className="tutorial-section" aria-labelledby="schedule-title">
          <div className="tutorial-section-heading">
            <span>01</span>
            <div>
              <h2 id="schedule-title">{zh ? "完整流程" : "Complete schedule"}</h2>
              <p>{zh ? "每次实验都按照以下顺序。" : "Every session follows this order."}</p>
            </div>
          </div>
          <ol className="tutorial-flow-list">
            <li>{zh ? <><strong>教程：</strong>阅读安全、设备和操作说明。</> : <><strong>Tutorial:</strong> read the safety, device, and response instructions.</>}</li>
            <li>{zh ? <><strong>实验前问卷：</strong>填写最近睡眠、环境和实验前的卡罗林斯卡困倦量表。</> : <><strong>Before-exposure questionnaire:</strong> report recent sleep, environment, and the pre-exposure Karolinska Sleepiness Scale.</>}</li>
            <li>{zh ? <><strong>屏幕暴露：</strong>观看指定颜色画面五分钟，并在十字出现时作出反应。</> : <><strong>Screen exposure:</strong> watch the assigned color for five minutes and respond when a cross appears.</>}</li>
            <li>{zh ? <><strong>画面结束后的困倦测量：</strong>立即填写卡罗林斯卡困倦量表。</> : <><strong>Post-exposure sleepiness measure:</strong> immediately complete the Karolinska Sleepiness Scale.</>}</li>
            <li>{zh ? <><strong>睡眠：</strong>在平常时间上床，按照平常方式睡眠。</> : <><strong>Sleep:</strong> go to bed at your normal time and sleep normally.</>}</li>
            <li>{zh ? <><strong>第二天早晨问卷：</strong>睡醒后返回并填写问卷；没有独立反应时间测试。</> : <><strong>Next-morning questionnaire:</strong> return after waking; there is no separate reaction-time test.</>}</li>
          </ol>
        </section>

        <section className="tutorial-section" aria-labelledby="device-title">
          <div className="tutorial-section-heading">
            <span>02</span>
            <div>
              <h2 id="device-title">{zh ? "设备与画面必须尽量一致" : "Keep the device and display consistent"}</h2>
              <p>
                {zh
                  ? <>所有实验都使用<strong>同一设备和浏览器</strong>，并保持相同的手动屏幕亮度和显示设置。</>
                  : <>Use the <strong>same device and browser</strong> for all sessions. Keep the same manual screen brightness and display settings.</>}
              </p>
            </div>
          </div>
          <ul className="environment-checklist">
            <li>
              <strong>{zh ? "自动显示调整" : "Automatic display adjustments"}</strong>
              <span>{zh ? "条件允许时，关闭自动亮度、Night Shift、True Tone、蓝光过滤器或其他自动显示调整。" : "Disable automatic brightness, Night Shift, True Tone, blue-light filters, or other automatic display adjustments when possible."}</span>
            </li>
            <li>
              <strong>{zh ? "指定亮度" : "Assigned brightness"}</strong>
              <span>{zh ? "每个条件都要遵循网页给出的指定亮度说明。" : "Follow the assigned brightness instructions for each condition."}</span>
            </li>
            <li>
              <strong>{zh ? "温度与声音" : "Temperature and sound"}</strong>
              <span>{zh ? "尽量保持房间温度、噪音、音乐、灯光、被褥和睡衣相近。" : "Keep room temperature, noise, music, lighting, bedding, and sleepwear similar."}</span>
            </li>
            <li>
              <strong>{zh ? "正常习惯" : "Normal routine"}</strong>
              <span>{zh ? "不要为了让每晚完全相同而改变真实习惯；问卷中如实报告咖啡因、运动、屏幕和助眠品情况。" : "Do not change real habits just to make nights identical; report caffeine, exercise, screen use, and sleep aids honestly."}</span>
            </li>
          </ul>
        </section>

        <section className="tutorial-section" aria-labelledby="attention-title">
          <div className="tutorial-section-heading">
            <span>03</span>
            <div>
              <h2 id="attention-title">{zh ? "五分钟内保持注视" : "Watch the display for five minutes"}</h2>
              <p>
                {zh
                  ? <>在五分钟画面期间，<strong>不要切换应用、查看消息、浏览网页或使用另一个屏幕。</strong>不要使用分屏。</>
                  : <><strong>Do not switch apps, read messages, browse, or use another screen during the five-minute display.</strong> Do not use split-screen.</>}
              </p>
            </div>
          </div>
          <ol className="tutorial-flow-list">
            <li>{zh ? <><strong>黑色十字</strong>出现时，立即<strong>点击／轻触屏幕</strong>或按 <strong>Space/Enter</strong>。观看期间的反应时间会作为本研究的反应时间数据。</> : <>When a <strong>black cross</strong> appears, immediately <strong>click/tap the screen</strong> or press <strong>Space/Enter</strong>. Reaction time during this display is the study reaction-time measure.</>}</li>
            <li>{zh ? <><strong>暂停/继续：</strong>电脑按 <strong>P</strong>；触屏设备使用底部 <strong>Pause/Resume</strong>。</> : <><strong>Pause/Resume:</strong> press <strong>P</strong> on a computer or use the bottom <strong>Pause/Resume</strong> controls.</>}</li>
            <li>{zh ? <><strong>提前结束：</strong>电脑依次输入 <strong>E → N → D</strong>；触屏设备在三秒内点击两次 <strong>End</strong>。</> : <><strong>End early:</strong> type <strong>E → N → D</strong> or tap <strong>End twice</strong> within three seconds.</>}</li>
            <li>{zh ? <>没有十字时的点击、多余点击、暂停、实际观看时长和显示中断都会被记录。</> : <>No-cross responses, extra responses, pauses, actual watching time, and display interruptions are recorded.</>}</li>
          </ol>
        </section>

        <section className="tutorial-section" aria-labelledby="assignment-title">
          <div className="tutorial-section-heading">
            <span>04</span>
            <div>
              <h2 id="assignment-title">{zh ? "固定顺序与本次分配" : "Fixed order and this assignment"}</h2>
              <p>{zh ? "所有参与者使用相同顺序，不能自行选择或跳过。" : "Every participant follows the same order and cannot choose or skip a condition."}</p>
            </div>
          </div>
          <div className="assigned-condition-banner">
            <span>{zh ? `第 ${assignedPosition} 项` : `Session ${assignedPosition} of 4`}</span>
            <strong>{CONDITION_LABELS[language][assignedConditionId]}</strong>
            <small>{zh ? "固定顺序：暗红 → 暗蓝 → 亮蓝 → 亮红" : "Fixed order: dim red → dim blue → bright blue → bright red"}</small>
          </div>
          <div className="condition-progress-grid">
            {V4_CONDITION_ORDER.map((conditionId, index) => {
              const position = index + 1;
              const isCompleted = completed.has(position);
              return (
                <div key={conditionId} className={isCompleted ? "completed" : "remaining"}>
                  <span aria-hidden="true">{isCompleted ? "✓" : String(position)}</span>
                  <strong>{CONDITION_LABELS[language][conditionId]}</strong>
                  <small>{isCompleted ? (zh ? "已完成" : "Complete") : (zh ? "待完成" : "Remaining")}</small>
                </div>
              );
            })}
          </div>
          <p><strong>{completedCount}</strong> {zh ? "项已完成" : "complete"} · <strong>{remainingCount}</strong> {zh ? "项待完成" : "remaining"}</p>
        </section>

        <section className="tutorial-section" aria-labelledby="practice-title">
          <div className="tutorial-section-heading">
            <span>05</span>
            <div>
              <h2 id="practice-title">{zh ? "先做一个不保存的试验轮" : "Complete one unsaved practice round"}</h2>
              <p>
                {zh
                  ? <>下一页会练习十字反应、暂停和结束。<strong>试验轮不保存，也不计入正式结果。</strong></>
                  : <>The next page practices the cross response, pause, and end controls. <strong>Practice is not saved and does not count toward the results.</strong></>}
              </p>
            </div>
          </div>
        </section>

        <label className="tutorial-safety-confirmation">
          <input
            type="checkbox"
            checked={safetyConfirmed}
            onChange={(event) => setSafetyConfirmed(event.target.checked)}
          />
          <span>
            {zh
              ? "我已阅读安全说明；我没有光敏性癫痫病史或对快速视觉刺激的明显不适，并会在感到不适时停止。"
              : "I have read the safety notice; I do not have a history of photosensitive seizures or significant discomfort with rapidly appearing visual stimuli, and I will stop if uncomfortable."}
          </span>
        </label>

        <button
          className="primary-button tutorial-continue"
          type="button"
          onClick={onContinue}
          disabled={!safetyConfirmed}
        >
          {zh ? "我已阅读——开始简短试验轮" : "I have read this — start the short practice"}
        </button>
      </section>
    </main>
  );
}
