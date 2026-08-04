"use client";

import { useState } from "react";
import type { Language } from "./i18n";
import {
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
          <p className="eyebrow">{zh ? "每次实验前请阅读" : "Read before every session"}</p>
          <h1 id="study-tutorial-title">
            {zh
              ? `${displayName}，请保持平常作息。`
              : `${displayName}, keep your normal bedtime.`}
          </h1>
          <p>
            {zh
              ? <>请<strong>勿因参加实验而提前或推迟上床时间</strong>。请尽量保持室温、睡眠时间、环境声音等条件一致；如有差异，请在问卷中如实填写。</>
              : <><strong>Do not go to bed later or earlier for the experiment.</strong> Keep temperature, sleep timing, sound, and other conditions as similar as practical, but report any real differences honestly.</>}
          </p>
        </header>

        <aside className="quality-warning" role="alert" aria-labelledby="safety-title">
          <strong id="safety-title">{zh ? "安全与参加资格" : "Safety and eligibility"}</strong>
          <p>
            {zh
              ? <>如有<strong>光敏性癫痫病史</strong>，或对闪烁及快速出现的视觉刺激存在明显不适，请<strong>勿参加本研究</strong>。若实验画面引起任何不适，请<strong>立即终止本次实验</strong>。</>
              : <>Do not participate if you have a history of <strong>photosensitive seizures</strong> or significant discomfort with flashing or rapidly appearing visual stimuli. <strong>Stop the session if the display causes discomfort.</strong></>}
          </p>
        </aside>

        {!isTestMode ? (
          <aside className="recovery-code-card" aria-label={zh ? "登录与恢复" : "Sign-in and recovery"}>
            <div>
              <strong>{zh ? "账户与实验进度" : "Progress follows your account"}</strong>
              <p>
                {zh
                  ? <>刷新页面或更换浏览器／设备后，可使用<strong>相同研究用名和密码</strong>登录并恢复未完成的实验进度。为减少设备差异，请尽量使用同一设备和浏览器，且不要同时在两台设备上继续同一次实验。</>
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
              <h2 id="schedule-title">{zh ? "每次实验流程" : "Complete schedule"}</h2>
              <p>{zh ? "每次实验均包括以下环节。" : "Every session includes the following steps."}</p>
            </div>
          </div>
          <ol className="tutorial-flow-list">
            <li>{zh ? <><strong>实验说明：</strong>阅读安全事项、设备设置和操作要求。</> : <><strong>Tutorial:</strong> read the safety, device, and response instructions.</>}</li>
            <li>{zh ? <><strong>实验前问卷：</strong>填写近期睡眠状况、睡眠环境及实验前的卡罗林斯卡困倦量表。</> : <><strong>Before-exposure questionnaire:</strong> report recent sleep, environment, and the pre-exposure Karolinska Sleepiness Scale.</>}</li>
            <li>{zh ? <><strong>观看阶段：</strong>连续观看系统分配的画面五分钟，并在黑色十字出现时作出反应。</> : <><strong>Screen exposure:</strong> watch the assigned display for five minutes and respond when a cross appears.</>}</li>
            <li>{zh ? <><strong>观看后困倦评估：</strong>画面结束后立即填写卡罗林斯卡困倦量表。</> : <><strong>Post-exposure sleepiness measure:</strong> immediately complete the Karolinska Sleepiness Scale.</>}</li>
            <li>{zh ? <><strong>正常睡眠：</strong>按平常作息上床并正常睡眠。</> : <><strong>Sleep:</strong> go to bed at your normal time and sleep normally.</>}</li>
            <li>{zh ? <><strong>次晨问卷：</strong>醒来后返回网站完成问卷；无需另做反应时间测试。</> : <><strong>Next-morning questionnaire:</strong> return after waking; there is no separate reaction-time test.</>}</li>
          </ol>
        </section>

        <section className="tutorial-section" aria-labelledby="device-title">
          <div className="tutorial-section-heading">
            <span>02</span>
            <div>
              <h2 id="device-title">{zh ? "保持设备与显示设置一致" : "Keep the device and display consistent"}</h2>
              <p>
                {zh
                  ? <>四次实验请尽量使用<strong>同一设备和浏览器</strong>，并保持相同的手动屏幕亮度及显示设置。</>
                  : <>Use the <strong>same device and browser</strong> for all sessions. Keep the same manual screen brightness and display settings.</>}
              </p>
            </div>
          </div>
          <ul className="environment-checklist">
            <li>
              <strong>{zh ? "自动显示调整" : "Automatic display adjustments"}</strong>
              <span>{zh ? "在设备允许的情况下，请关闭自动亮度、Night Shift、True Tone、蓝光过滤及其他自动显示调节功能。" : "Disable automatic brightness, Night Shift, True Tone, blue-light filters, or other automatic display adjustments when possible."}</span>
            </li>
            <li>
              <strong>{zh ? "屏幕亮度" : "Screen brightness"}</strong>
              <span>{zh ? "四次实验均请保持相同的手动屏幕亮度。画面明暗由系统按条件分配；请遵循本次页面说明，不要自行调整设备亮度。" : "Keep the same manual screen-brightness level for all four sessions. Follow the assigned display-intensity instructions for each condition; do not adjust device brightness yourself."}</span>
            </li>
            <li>
              <strong>{zh ? "温度与声音" : "Temperature and sound"}</strong>
              <span>{zh ? "请尽量保持室温、环境噪声、音乐、照明、寝具及睡衣等条件一致。" : "Keep room temperature, noise, music, lighting, bedding, and sleepwear similar."}</span>
            </li>
            <li>
              <strong>{zh ? "正常习惯" : "Normal routine"}</strong>
              <span>{zh ? "无需为追求完全一致而刻意改变日常习惯；请在问卷中如实报告咖啡因、运动、屏幕使用及助眠药物或补充剂情况。" : "Do not change real habits just to make nights identical; report caffeine, exercise, screen use, and sleep aids honestly."}</span>
            </li>
          </ul>
        </section>

        <section className="tutorial-section" aria-labelledby="attention-title">
          <div className="tutorial-section-heading">
            <span>03</span>
            <div>
              <h2 id="attention-title">{zh ? "连续观看画面五分钟" : "Watch the display for five minutes"}</h2>
              <p>
                {zh
                  ? <>在五分钟屏幕暴露期间，<strong>请勿切换应用、查看消息、浏览网页、使用其他屏幕或开启分屏。</strong></>
                  : <><strong>Do not switch apps, read messages, browse, or use another screen during the five-minute display.</strong> Do not use split-screen.</>}
              </p>
            </div>
          </div>
          <ol className="tutorial-flow-list">
            <li>{zh ? <>当<strong>黑色十字</strong>出现时，请立即<strong>点击／轻触屏幕</strong>，或按 <strong>Space/Enter</strong>。系统将以本环节的作答时间计算反应时间。</> : <>When a <strong>black cross</strong> appears, immediately <strong>click/tap the screen</strong> or press <strong>Space/Enter</strong>. Reaction time during this display is the study reaction-time measure.</>}</li>
            <li>{zh ? <><strong>暂停/继续：</strong>电脑按 <strong>P</strong>；触屏设备使用底部 <strong>Pause/Resume</strong>。</> : <><strong>Pause/Resume:</strong> press <strong>P</strong> on a computer or use the bottom <strong>Pause/Resume</strong> controls.</>}</li>
            <li>{zh ? <><strong>提前结束：</strong>电脑依次输入 <strong>E → N → D</strong>；触屏设备在三秒内点击两次 <strong>End</strong>。</> : <><strong>End early:</strong> type <strong>E → N → D</strong> or tap <strong>End twice</strong> within three seconds.</>}</li>
            <li>{zh ? <>系统会记录十字未出现时的点击、重复点击、暂停、实际观看时长及显示中断。</> : <>No-cross responses, extra responses, pauses, actual watching time, and display interruptions are recorded.</>}</li>
          </ol>
        </section>

        <section className="tutorial-section" aria-labelledby="assignment-title">
          <div className="tutorial-section-heading">
            <span>04</span>
            <div>
              <h2 id="assignment-title">{zh ? "本次实验与完成进度" : "Current assignment and progress"}</h2>
              <p>{zh ? "每次实验条件均由系统自动安排，请按照页面提示完成本次实验。" : "The condition for each session is assigned automatically. Follow the on-screen instructions."}</p>
            </div>
          </div>
          <div className="assigned-condition-banner">
            <span>{zh ? `第 ${assignedPosition}/4 次实验` : `Session ${assignedPosition} of 4`}</span>
            <strong>{CONDITION_LABELS[language][assignedConditionId]}</strong>
            <small>{zh ? "完成本次实验后，系统将更新总体进度。" : "Your overall progress will update after this session."}</small>
          </div>
          <p><strong>{completedCount}</strong> {zh ? "次已完成" : "complete"} · <strong>{remainingCount}</strong> {zh ? "次待完成" : "remaining"}</p>
        </section>

        <section className="tutorial-section" aria-labelledby="practice-title">
          <div className="tutorial-section-heading">
            <span>05</span>
            <div>
              <h2 id="practice-title">{zh ? "先完成一次不保存的操作练习" : "Complete one unsaved practice round"}</h2>
              <p>
                {zh
                  ? <>下一页将练习黑色十字作答、暂停及提前结束操作。<strong>练习数据不会保存，也不会计入正式结果。</strong></>
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
              ? "我已阅读安全说明；本人无光敏性癫痫病史，也不会因闪烁或快速出现的视觉刺激产生明显不适。如出现不适，我将立即停止实验。"
              : "I have read the safety notice; I do not have a history of photosensitive seizures or significant discomfort with rapidly appearing visual stimuli, and I will stop if uncomfortable."}
          </span>
        </label>

        <button
          className="primary-button tutorial-continue"
          type="button"
          onClick={onContinue}
          disabled={!safetyConfirmed}
        >
          {zh ? "我已阅读——开始操作练习" : "I have read this — start the short practice"}
        </button>
      </section>
    </main>
  );
}
