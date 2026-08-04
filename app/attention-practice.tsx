"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Language } from "./i18n";

const CROSS_DELAY_MS = 1300;
const TOUCH_END_WINDOW_MS = 3000;
const KEYBOARD_END_WINDOW_MS = 2500;
const END_SEQUENCE = "end";

type PracticeStage =
  | "intro"
  | "waiting-for-cross"
  | "cross-visible"
  | "prompt-pause"
  | "paused"
  | "prompt-end"
  | "complete";

type FeedbackKey =
  | "early-response"
  | "cross-hit"
  | "tap-end-again"
  | "end-window-expired"
  | "end-sequence-reset";

type PracticeCopy = {
  badge: string;
  introTitle: string;
  introBeforeEmphasis: string;
  introEmphasis: string;
  introAfterEmphasis: string;
  introCross: string;
  introPause: string;
  introEnd: string;
  start: string;
  waitingTitle: string;
  waitingTouch: string;
  waitingKeyboard: string;
  waitingStatus: string;
  crossVisibleTitle: string;
  crossVisibleTouch: string;
  crossVisibleKeyboard: string;
  crossVisibleStatus: string;
  responseAreaWaitingLabel: string;
  responseAreaReadyLabel: string;
  earlyResponse: string;
  crossHit: string;
  pauseTitle: string;
  pauseTouch: string;
  pauseKeyboardBeforeKey: string;
  pauseKeyboardAfterKey: string;
  pausedTitle: string;
  pausedDescription: string;
  resumeTouch: string;
  resumeKeyboardBeforeKey: string;
  resumeKeyboardAfterKey: string;
  endTitle: string;
  endTouch: string;
  endKeyboard: string;
  endOnlyPractice: string;
  tapEndAgain: string;
  endWindowExpired: string;
  endSequenceReset: string;
  sequenceProgress: string;
  completeTitle: string;
  completeBeforeEmphasis: string;
  completeEmphasis: string;
  checklistCross: string;
  checklistPause: string;
  checklistEnd: string;
  tryAgain: string;
  continue: string;
  controlsLabel: string;
  pause: string;
  resume: string;
  end: string;
  endAgain: string;
  switchToKeyboard: string;
  switchToTouch: string;
};

const PRACTICE_COPY: Record<Language, PracticeCopy> = {
  en: {
    badge: "Practice — not recorded",
    introTitle: "Try the controls before the real exposure",
    introBeforeEmphasis: "This short practice uses a dim neutral screen and ",
    introEmphasis: "does not create or update a study record",
    introAfterEmphasis: ". Complete one guided round, then continue to the pre-sleep questionnaire.",
    introCross: "Respond once when the black cross appears.",
    introPause: "Pause, then resume the practice.",
    introEnd: "Use the protected End action to finish the practice.",
    start: "Start practice",
    waitingTitle: "Wait for the black cross",
    waitingTouch: "When it appears, tap anywhere inside the neutral practice area.",
    waitingKeyboard: "When it appears, click the practice area or press Space or Enter.",
    waitingStatus: "The cross has not appeared yet.",
    crossVisibleTitle: "Respond to the black cross",
    crossVisibleTouch: "Tap anywhere inside the neutral practice area now.",
    crossVisibleKeyboard: "Click the practice area or press Space or Enter now.",
    crossVisibleStatus: "The black cross is visible.",
    responseAreaWaitingLabel: "Neutral practice response area. Wait for the black cross.",
    responseAreaReadyLabel: "Neutral practice response area. The black cross is visible; respond now.",
    earlyResponse: "No cross was visible. During the real exposure, that would be recorded as an extra response. This practice response was not saved.",
    crossHit: "Black-cross response received.",
    pauseTitle: "Now practice pausing",
    pauseTouch: "Tap Pause in the controls below.",
    pauseKeyboardBeforeKey: "Press ",
    pauseKeyboardAfterKey: " to pause.",
    pausedTitle: "Paused",
    pausedDescription: "The practice is frozen. No practice timing or action is being saved.",
    resumeTouch: "Tap Resume in the controls below.",
    resumeKeyboardBeforeKey: "Press ",
    resumeKeyboardAfterKey: " again to resume.",
    endTitle: "Now practice the End action",
    endTouch: "Tap End twice within three seconds.",
    endKeyboard: "Type E, then N, then D within the sequence window.",
    endOnlyPractice: "This will end only the practice, not the real exposure.",
    tapEndAgain: "Tap End again within three seconds to finish the practice.",
    endWindowExpired: "The confirmation window expired. Start the End action again.",
    endSequenceReset: "The sequence reset. Start again with E.",
    sequenceProgress: "END sequence progress",
    completeTitle: "Practice complete",
    completeBeforeEmphasis: "You tried every control. ",
    completeEmphasis: "Nothing from this practice was saved.",
    checklistCross: "Black-cross response",
    checklistPause: "Pause and resume",
    checklistEnd: "Protected End action",
    tryAgain: "Try again",
    continue: "Continue to the pre-sleep questionnaire",
    controlsLabel: "Practice controls",
    pause: "Pause",
    resume: "Resume",
    end: "End",
    endAgain: "Tap again to finish",
    switchToKeyboard: "Use computer controls instead",
    switchToTouch: "Use touch-device controls instead",
  },
  zh: {
    badge: "操作练习（不记录数据）",
    introTitle: "正式实验前的操作练习",
    introBeforeEmphasis: "本练习使用较暗的中性画面，",
    introEmphasis: "不会创建或更新任何正式实验记录",
    introAfterEmphasis: "。完成操作练习后，将进入实验前问卷。",
    introCross: "黑色十字出现时，请作出一次反应。",
    introPause: "练习暂停和继续操作。",
    introEnd: "练习提前结束操作（需二次确认）。",
    start: "开始操作练习",
    waitingTitle: "等待黑色十字出现",
    waitingTouch: "十字出现后，请轻触中性练习区域内的任意位置。",
    waitingKeyboard: "十字出现后，请点击练习区域，或按空格键或回车键。",
    waitingStatus: "黑色十字尚未出现。",
    crossVisibleTitle: "请对黑色十字作出反应",
    crossVisibleTouch: "请立即轻触中性练习区域内的任意位置。",
    crossVisibleKeyboard: "请立即点击练习区域，或按空格键或回车键。",
    crossVisibleStatus: "黑色十字已出现。",
    responseAreaWaitingLabel: "中性练习反应区域。请等待黑色十字出现。",
    responseAreaReadyLabel: "中性练习反应区域。黑色十字已出现，请立即作出反应。",
    earlyResponse: "黑色十字尚未出现。在正式实验中，此类操作会被记录为额外响应；本次练习中的操作不会保存。",
    crossHit: "已记录本次响应。",
    pauseTitle: "练习暂停操作",
    pauseTouch: "请点击下方控制区中的“暂停”按钮。",
    pauseKeyboardBeforeKey: "按 ",
    pauseKeyboardAfterKey: " 键暂停。",
    pausedTitle: "已暂停",
    pausedDescription: "练习已暂停；暂停期间不计时，也不会记录任何操作。",
    resumeTouch: "请点击下方控制区中的“继续”按钮。",
    resumeKeyboardBeforeKey: "再次按 ",
    resumeKeyboardAfterKey: " 键继续。",
    endTitle: "练习提前结束操作",
    endTouch: "请在三秒内连续点击两次“结束”。",
    endKeyboard: "请在序列时限内依次输入 E、N、D。",
    endOnlyPractice: "此操作仅结束本次练习，不会结束正式实验。",
    tapEndAgain: "请在三秒内再次点击“结束”以完成练习。",
    endWindowExpired: "确认时限已过，请重新执行结束操作。",
    endSequenceReset: "输入序列已重置，请从 E 重新开始。",
    sequenceProgress: "END 输入进度",
    completeTitle: "操作练习完成",
    completeBeforeEmphasis: "你已完成全部操作练习。",
    completeEmphasis: "本次练习的任何内容均未保存。",
    checklistCross: "黑色十字反应",
    checklistPause: "暂停和继续",
    checklistEnd: "提前结束操作（二次确认）",
    tryAgain: "重新练习",
    continue: "进入实验前问卷",
    controlsLabel: "练习操作区",
    pause: "暂停",
    resume: "继续",
    end: "结束",
    endAgain: "再次点击以完成",
    switchToKeyboard: "切换至键盘操作",
    switchToTouch: "切换至触屏操作",
  },
};

export type AttentionPracticeProps = {
  language: Language;
  useTouchControls: boolean;
  onControlModeChange: (next: boolean) => void;
  onComplete: () => void;
};

export function AttentionPractice({
  language,
  useTouchControls,
  onControlModeChange,
  onComplete,
}: AttentionPracticeProps) {
  const copy = PRACTICE_COPY[language];
  const [stage, setStage] = useState<PracticeStage>("intro");
  const [feedback, setFeedback] = useState<FeedbackKey | null>(null);
  const [touchEndArmed, setTouchEndArmed] = useState(false);
  const [endSequence, setEndSequence] = useState("");
  const responseSurfaceRef = useRef<HTMLButtonElement>(null);
  const touchEndTimerRef = useRef<number | null>(null);
  const keyboardEndTimerRef = useRef<number | null>(null);
  const endSequenceRef = useRef("");

  const clearTouchEndWindow = useCallback(() => {
    if (touchEndTimerRef.current !== null) window.clearTimeout(touchEndTimerRef.current);
    touchEndTimerRef.current = null;
    setTouchEndArmed(false);
  }, []);

  const clearKeyboardEndWindow = useCallback(() => {
    if (keyboardEndTimerRef.current !== null) window.clearTimeout(keyboardEndTimerRef.current);
    keyboardEndTimerRef.current = null;
  }, []);

  const updateEndSequence = useCallback((next: string) => {
    endSequenceRef.current = next;
    setEndSequence(next);
  }, []);

  const resetEndControls = useCallback(() => {
    clearTouchEndWindow();
    clearKeyboardEndWindow();
    updateEndSequence("");
  }, [clearKeyboardEndWindow, clearTouchEndWindow, updateEndSequence]);

  const beginPractice = useCallback(() => {
    resetEndControls();
    setFeedback(null);
    setStage("waiting-for-cross");
  }, [resetEndControls]);

  const finishPractice = useCallback(() => {
    resetEndControls();
    setFeedback(null);
    setStage("complete");
  }, [resetEndControls]);

  useEffect(() => {
    if (stage !== "waiting-for-cross") return;
    const timer = window.setTimeout(() => {
      setFeedback(null);
      setStage("cross-visible");
    }, CROSS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "waiting-for-cross" && stage !== "cross-visible") return;
    responseSurfaceRef.current?.focus({ preventScroll: true });
  }, [stage]);

  useEffect(() => () => {
    if (touchEndTimerRef.current !== null) window.clearTimeout(touchEndTimerRef.current);
    if (keyboardEndTimerRef.current !== null) window.clearTimeout(keyboardEndTimerRef.current);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key.toLowerCase();

      if (stage === "prompt-pause" && key === "p") {
        event.preventDefault();
        setFeedback(null);
        setStage("paused");
        return;
      }

      if (stage === "paused" && key === "p") {
        event.preventDefault();
        setFeedback(null);
        setStage("prompt-end");
        return;
      }

      if (stage !== "prompt-end" || useTouchControls) return;

      if (key === "e" || key === "n" || key === "d") {
        event.preventDefault();
        const current = endSequenceRef.current;
        const expected = END_SEQUENCE[current.length];
        const next = key === expected ? `${current}${key}` : key === "e" ? "e" : "";
        clearKeyboardEndWindow();
        if (next === END_SEQUENCE) {
          finishPractice();
          return;
        }
        updateEndSequence(next);
        setFeedback(next ? null : "end-sequence-reset");
        keyboardEndTimerRef.current = window.setTimeout(() => {
          keyboardEndTimerRef.current = null;
          updateEndSequence("");
          setFeedback("end-window-expired");
        }, KEYBOARD_END_WINDOW_MS);
        return;
      }

      if (endSequenceRef.current && key.length === 1) {
        clearKeyboardEndWindow();
        updateEndSequence("");
        setFeedback("end-sequence-reset");
      }
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearKeyboardEndWindow, finishPractice, stage, updateEndSequence, useTouchControls]);

  const handlePracticeResponse = () => {
    if (stage === "waiting-for-cross") {
      setFeedback("early-response");
      return;
    }
    if (stage !== "cross-visible") return;
    setFeedback("cross-hit");
    setStage("prompt-pause");
  };

  const handleTouchPauseToggle = () => {
    clearTouchEndWindow();
    if (stage === "prompt-pause") {
      setFeedback(null);
      setStage("paused");
    } else if (stage === "paused") {
      setFeedback(null);
      setStage("prompt-end");
    }
  };

  const handleTouchEnd = () => {
    if (stage !== "prompt-end") return;
    if (touchEndArmed) {
      finishPractice();
      return;
    }
    setTouchEndArmed(true);
    setFeedback("tap-end-again");
    touchEndTimerRef.current = window.setTimeout(() => {
      touchEndTimerRef.current = null;
      setTouchEndArmed(false);
      setFeedback("end-window-expired");
    }, TOUCH_END_WINDOW_MS);
  };

  const handleControlModeChange = () => {
    resetEndControls();
    setFeedback(null);
    onControlModeChange(!useTouchControls);
    if (stage === "waiting-for-cross" || stage === "cross-visible") {
      window.requestAnimationFrame(() => responseSurfaceRef.current?.focus({ preventScroll: true }));
    }
  };

  const feedbackText = feedback === "early-response"
    ? copy.earlyResponse
    : feedback === "cross-hit"
      ? copy.crossHit
      : feedback === "tap-end-again"
        ? copy.tapEndAgain
        : feedback === "end-window-expired"
          ? copy.endWindowExpired
          : feedback === "end-sequence-reset"
            ? copy.endSequenceReset
            : "";

  const showTouchControls = useTouchControls && stage !== "intro" && stage !== "complete";
  const pauseEnabled = stage === "prompt-pause" || stage === "paused";
  const endEnabled = stage === "prompt-end";

  return (
    <main
      className={`practice-shell practice-stage-${stage}`}
      style={{ minHeight: "100dvh", background: "#171a1f", color: "#f5f7fa" }}
      aria-labelledby="attention-practice-title"
    >
      <header className="practice-header">
        <p className="practice-badge">{copy.badge}</p>
      </header>

      {stage === "intro" ? (
        <section className="practice-card practice-intro-card">
          <h1 id="attention-practice-title">{copy.introTitle}</h1>
          <p className="practice-intro-copy">
            {copy.introBeforeEmphasis}<strong>{copy.introEmphasis}</strong>{copy.introAfterEmphasis}
          </p>
          <ol className="practice-checklist practice-intro-checklist">
            <li><strong>{copy.introCross}</strong></li>
            <li><strong>{copy.introPause}</strong></li>
            <li><strong>{copy.introEnd}</strong></li>
          </ol>
          <button className="practice-button practice-button-primary practice-start-button" type="button" onClick={beginPractice}>
            {copy.start}
          </button>
        </section>
      ) : null}

      {stage === "waiting-for-cross" || stage === "cross-visible" ? (
        <section className="practice-card practice-cross-card">
          <h1 id="attention-practice-title">
            {stage === "cross-visible" ? copy.crossVisibleTitle : copy.waitingTitle}
          </h1>
          <p className="practice-instruction-copy">
            <strong>
              {stage === "cross-visible"
                ? useTouchControls ? copy.crossVisibleTouch : copy.crossVisibleKeyboard
                : useTouchControls ? copy.waitingTouch : copy.waitingKeyboard}
            </strong>
          </p>
          <button
            ref={responseSurfaceRef}
            className="practice-response-surface"
            type="button"
            onClick={handlePracticeResponse}
            onContextMenu={(event) => event.preventDefault()}
            aria-label={stage === "cross-visible" ? copy.responseAreaReadyLabel : copy.responseAreaWaitingLabel}
            style={{
              position: "relative",
              display: "block",
              width: "100%",
              minHeight: "min(56dvh, 520px)",
              overflow: "hidden",
              border: "1px solid #c7c9cc",
              borderRadius: "18px",
              background: "#202329",
              color: "#c8ced7",
              touchAction: "manipulation",
              userSelect: "none",
              cursor: "crosshair",
            }}
          >
            {stage === "cross-visible" ? (
              <span
                className="practice-cross"
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "58%",
                  top: "44%",
                  width: "84px",
                  height: "84px",
                  transform: "translate(-50%, -50%)",
                  filter: "drop-shadow(0 0 2px rgba(255, 255, 255, 0.92))",
                }}
              >
                <span
                  className="practice-cross-horizontal"
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: "84px",
                    height: "8px",
                    borderRadius: "2px",
                    background: "#000",
                    transform: "translate(-50%, -50%)",
                  }}
                />
                <span
                  className="practice-cross-vertical"
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: "8px",
                    height: "84px",
                    borderRadius: "2px",
                    background: "#000",
                    transform: "translate(-50%, -50%)",
                  }}
                />
              </span>
            ) : (
              <span className="practice-wait-marker" aria-hidden="true">…</span>
            )}
          </button>
          <p className={`practice-live-status ${feedback ? "practice-live-status-feedback" : ""}`} role="status" aria-live="polite">
            {feedbackText || (stage === "cross-visible" ? copy.crossVisibleStatus : copy.waitingStatus)}
          </p>
        </section>
      ) : null}

      {stage === "prompt-pause" ? (
        <section className="practice-card practice-pause-card">
          <p className="practice-success-message" role="status">{copy.crossHit}</p>
          <h1 id="attention-practice-title">{copy.pauseTitle}</h1>
          <p className="practice-instruction-copy">
            {useTouchControls ? (
              <strong>{copy.pauseTouch}</strong>
            ) : (
              <>{copy.pauseKeyboardBeforeKey}<kbd>P</kbd><strong>{copy.pauseKeyboardAfterKey}</strong></>
            )}
          </p>
        </section>
      ) : null}

      {stage === "paused" ? (
        <section className="practice-card practice-paused-card" aria-live="polite">
          <h1 id="attention-practice-title">{copy.pausedTitle}</h1>
          <p className="practice-paused-description">{copy.pausedDescription}</p>
          <p className="practice-instruction-copy">
            {useTouchControls ? (
              <strong>{copy.resumeTouch}</strong>
            ) : (
              <>{copy.resumeKeyboardBeforeKey}<kbd>P</kbd><strong>{copy.resumeKeyboardAfterKey}</strong></>
            )}
          </p>
        </section>
      ) : null}

      {stage === "prompt-end" ? (
        <section className="practice-card practice-end-card">
          <h1 id="attention-practice-title">{copy.endTitle}</h1>
          <p className="practice-instruction-copy"><strong>{useTouchControls ? copy.endTouch : copy.endKeyboard}</strong></p>
          <p className="practice-end-safety-note">{copy.endOnlyPractice}</p>
          {!useTouchControls ? (
            <div
              className="practice-end-sequence"
              aria-label={`${copy.sequenceProgress}: ${endSequence.length} / ${END_SEQUENCE.length}`}
            >
              {["E", "N", "D"].map((letter, index) => (
                <span className="practice-end-sequence-step" key={letter}>
                  <kbd className={index < endSequence.length ? "practice-end-key-complete" : "practice-end-key-pending"}>{letter}</kbd>
                  {index < END_SEQUENCE.length - 1 ? <span aria-hidden="true">→</span> : null}
                </span>
              ))}
            </div>
          ) : null}
          <p className="practice-live-status" role="status" aria-live="polite">{feedbackText}</p>
        </section>
      ) : null}

      {stage === "complete" ? (
        <section className="practice-card practice-complete-card">
          <h1 id="attention-practice-title">{copy.completeTitle}</h1>
          <p className="practice-complete-copy">
            {copy.completeBeforeEmphasis}<strong>{copy.completeEmphasis}</strong>
          </p>
          <ul className="practice-checklist practice-complete-checklist">
            <li><span aria-hidden="true">✓</span><strong>{copy.checklistCross}</strong></li>
            <li><span aria-hidden="true">✓</span><strong>{copy.checklistPause}</strong></li>
            <li><span aria-hidden="true">✓</span><strong>{copy.checklistEnd}</strong></li>
          </ul>
          <div className="practice-complete-actions">
            <button className="practice-button practice-button-secondary practice-retry-button" type="button" onClick={beginPractice}>
              {copy.tryAgain}
            </button>
            <button className="practice-button practice-button-primary practice-continue-button" type="button" onClick={onComplete}>
              {copy.continue}
            </button>
          </div>
        </section>
      ) : null}

      {showTouchControls ? (
        <div
          className="practice-touch-controls"
          role="group"
          aria-label={copy.controlsLabel}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            className="practice-control-button practice-pause-button"
            type="button"
            disabled={!pauseEnabled}
            onClick={handleTouchPauseToggle}
          >
            {stage === "paused" ? copy.resume : copy.pause}
          </button>
          <button
            className={`practice-control-button practice-end-button ${touchEndArmed ? "practice-end-button-armed" : ""}`}
            type="button"
            disabled={!endEnabled}
            aria-pressed={touchEndArmed}
            onClick={handleTouchEnd}
          >
            {touchEndArmed ? copy.endAgain : copy.end}
          </button>
        </div>
      ) : null}

      {stage !== "complete" ? (
        <button
          className="practice-control-mode-switch"
          type="button"
          onClick={handleControlModeChange}
        >
          {useTouchControls ? copy.switchToKeyboard : copy.switchToTouch}
        </button>
      ) : null}
    </main>
  );
}
