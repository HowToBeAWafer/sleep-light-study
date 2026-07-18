"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import type { Language } from "./i18n";
import {
  REACTION_TEST_PROTOCOL_VERSION,
  isReactionTestRecord,
  isReactionTrialRecord,
  type ReactionInputMethod,
  type ReactionTestRecord,
  type ReactionTrialRecord,
  type ReactionTrialStatus,
} from "./protocol-v3";

const REQUIRED_VALID_TRIALS = 3;
const MIN_STIMULUS_DELAY_MS = 2000;
const MAX_STIMULUS_DELAY_MS = 5000;
const RESPONSE_WINDOW_MS = 2000;
const BETWEEN_TRIALS_MS = 850;
const PROGRESS_STORAGE_VERSION = 1 as const;
const PROGRESS_KEY_PREFIX = "sleep-light-study:reaction-progress:v1:";

type ReactionStage =
  | "restoring"
  | "instructions"
  | "waiting"
  | "painting-target"
  | "target"
  | "feedback"
  | "practice-complete"
  | "resume-ready"
  | "completed";

type OpportunityKind = "practice" | "formal";

type CurrentFormalAttempt = {
  trialNumber: 1 | 2 | 3;
  startedAtIso: string;
  stimulusDelayMs: number;
  stimulusShownAtIso: string | null;
};

type ReactionTestProgress = {
  storageVersion: typeof PROGRESS_STORAGE_VERSION;
  sessionId: string;
  protocolVersion: typeof REACTION_TEST_PROTOCOL_VERSION;
  startedAtIso: string;
  practiceCompleted: boolean;
  formalStarted: boolean;
  trials: ReactionTrialRecord[];
  falseStartCount: number;
  missCount: number;
  currentAttempt: CurrentFormalAttempt | null;
  completedRecord: ReactionTestRecord | null;
};

type OpportunityResult = {
  status: ReactionTrialStatus;
};

type ProgressSummary = {
  completedValidTrials: number;
  falseStartCount: number;
  missCount: number;
};

export type ReactionTestProps = {
  sessionId: string;
  useTouchControls: boolean;
  language?: Language;
  shouldPersistProgress?: boolean;
  onComplete: (record: ReactionTestRecord) => void;
};

const REACTION_COPY = {
  en: {
    check: "Reaction-time check",
    restoring: "Restoring progress…",
    title: "Relax and respond naturally.",
    touchInstruction: "Tap the screen as soon as the target appears.",
    keyboardInstruction: "Click the screen or press Space or Enter as soon as the target appears.",
    noGuessing: "Do not guess or respond before it appears.",
    overview: "You will have one practice opportunity, followed by three valid recorded responses. An early response or miss will repeat that trial.",
    startPractice: "Start practice",
    practice: "Practice",
    validResponse: (number: number) => `Valid response ${number} of 3`,
    validResponses: (number: number) => `Valid responses ${number} of 3`,
    wait: "Wait for the target…",
    targetAria: "Target visible. Respond now.",
    now: "NOW",
    sameTrial: "The same trial will be repeated shortly.",
    nextTrial: "The next trial will begin shortly.",
    practiceComplete: "Practice complete",
    threeNext: "Three valid responses are next.",
    formalInstructions: "Stay relaxed, wait for each target, and respond naturally. Early responses and misses are recorded, then that response is repeated.",
    beginFormal: "Begin recorded trials",
    progressRestored: "Progress restored",
    continueTitle: "Continue your recorded responses.",
    savedResponses: (number: number) => `${number} of 3 valid responses are saved. Refreshing during an active attempt was recorded as a miss.`,
    attemptCounts: (falseStarts: number, misses: number) => `${falseStarts} early response${falseStarts === 1 ? "" : "s"} and ${misses} miss${misses === 1 ? "" : "es"} recorded so far.`,
    continueFormal: "Continue recorded trials",
    complete: "Reaction-time check complete",
    thankYou: "Thank you.",
    practiceFeedbackPrefix: "Practice: ",
    falseStart: "that was an early response.",
    missed: "no response was recorded.",
    valid: "valid response recorded.",
  },
  zh: {
    check: "反应力测试",
    restoring: "正在恢复进度…",
    title: "请放松并自然作出反应。",
    touchInstruction: "目标出现后，请尽快点击屏幕。",
    keyboardInstruction: "目标出现后，请尽快点击屏幕，或按空格键或回车键。",
    noGuessing: "请不要猜测，也不要在目标出现前作出反应。",
    overview: "你会先进行一次练习，然后完成三次有效的正式反应。过早反应或错过目标时，本次会被记录并重新进行。",
    startPractice: "开始练习",
    practice: "练习",
    validResponse: (number: number) => `第 ${number}/3 次有效反应`,
    validResponses: (number: number) => `已完成 ${number}/3 次有效反应`,
    wait: "请等待目标出现…",
    targetAria: "目标已出现，请立即作出反应。",
    now: "现在",
    sameTrial: "稍后将重新进行同一次测试。",
    nextTrial: "下一次测试即将开始。",
    practiceComplete: "练习完成",
    threeNext: "接下来需要完成三次有效反应。",
    formalInstructions: "保持放松，等待每个目标出现后自然作出反应。过早反应和错过目标都会被记录，然后重新进行该次测试。",
    beginFormal: "开始正式测试",
    progressRestored: "进度已恢复",
    continueTitle: "继续完成正式反应。",
    savedResponses: (number: number) => `已保存 ${number}/3 次有效反应。在一次测试进行中刷新页面会被记录为错过目标。`,
    attemptCounts: (falseStarts: number, misses: number) => `目前已记录 ${falseStarts} 次过早反应和 ${misses} 次错过目标。`,
    continueFormal: "继续正式测试",
    complete: "反应力测试已完成",
    thankYou: "谢谢。",
    practiceFeedbackPrefix: "练习：",
    falseStart: "反应过早。",
    missed: "没有记录到反应。",
    valid: "已记录有效反应。",
  },
} as const;

function progressStorageKey(sessionId: string) {
  return `${PROGRESS_KEY_PREFIX}${sessionId}`;
}

export function clearReactionTestProgress(sessionId: string) {
  if (typeof window === "undefined") return false;
  try {
    localStorage.removeItem(progressStorageKey(sessionId));
    return true;
  } catch {
    return false;
  }
}

function randomStimulusDelay() {
  return MIN_STIMULUS_DELAY_MS
    + Math.floor(Math.random() * (MAX_STIMULUS_DELAY_MS - MIN_STIMULUS_DELAY_MS + 1));
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isCurrentFormalAttempt(value: unknown): value is CurrentFormalAttempt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const attempt = value as Record<string, unknown>;
  return (
    (attempt.trialNumber === 1 || attempt.trialNumber === 2 || attempt.trialNumber === 3)
    && isIsoDate(attempt.startedAtIso)
    && Number.isInteger(attempt.stimulusDelayMs)
    && (attempt.stimulusDelayMs as number) >= MIN_STIMULUS_DELAY_MS
    && (attempt.stimulusDelayMs as number) <= MAX_STIMULUS_DELAY_MS
    && (attempt.stimulusShownAtIso === null || isIsoDate(attempt.stimulusShownAtIso))
  );
}

function validTrialCount(trials: ReactionTrialRecord[]) {
  return trials.filter((trial) => trial.status === "valid").length;
}

function attemptsFollowProtocol(trials: ReactionTrialRecord[]) {
  return (
    trials.length <= REQUIRED_VALID_TRIALS
    && trials.every(
      (trial, index) =>
        isReactionTrialRecord(trial)
        && trial.status === "valid"
        && trial.trialNumber === index + 1,
    )
  );
}

function isReactionTestProgress(value: unknown, sessionId: string): value is ReactionTestProgress {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const progress = value as Record<string, unknown>;
  if (
    progress.storageVersion !== PROGRESS_STORAGE_VERSION
    || progress.sessionId !== sessionId
    || progress.protocolVersion !== REACTION_TEST_PROTOCOL_VERSION
    || !isIsoDate(progress.startedAtIso)
    || typeof progress.practiceCompleted !== "boolean"
    || typeof progress.formalStarted !== "boolean"
    || !Array.isArray(progress.trials)
    || !attemptsFollowProtocol(progress.trials)
    || !Number.isInteger(progress.falseStartCount)
    || (progress.falseStartCount as number) < 0
    || (progress.falseStartCount as number) > 1000
    || !Number.isInteger(progress.missCount)
    || (progress.missCount as number) < 0
    || (progress.missCount as number) > 1000
    || !(progress.currentAttempt === null || isCurrentFormalAttempt(progress.currentAttempt))
    || !(progress.completedRecord === null || isReactionTestRecord(progress.completedRecord))
  ) return false;

  const trials = progress.trials as ReactionTrialRecord[];
  const completedRecord = progress.completedRecord as ReactionTestRecord | null;
  const currentAttempt = progress.currentAttempt as CurrentFormalAttempt | null;
  const nextTrialNumber = validTrialCount(trials) + 1;
  if (!progress.practiceCompleted && (progress.formalStarted || trials.length > 0 || currentAttempt)) return false;
  if (!progress.formalStarted && (trials.length > 0 || currentAttempt)) return false;
  if (currentAttempt && (nextTrialNumber > 3 || currentAttempt.trialNumber !== nextTrialNumber)) return false;

  if (completedRecord) {
    return (
      progress.practiceCompleted
      && progress.formalStarted
      && currentAttempt === null
      && progress.startedAtIso === completedRecord.startedAtIso
      && JSON.stringify(trials) === JSON.stringify(completedRecord.trials)
      && progress.falseStartCount === completedRecord.falseStartCount
      && progress.missCount === completedRecord.missCount
    );
  }
  return validTrialCount(trials) <= REQUIRED_VALID_TRIALS;
}

function loadReactionTestProgress(sessionId: string) {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(progressStorageKey(sessionId)) || "null");
    return isReactionTestProgress(parsed, sessionId) ? parsed : null;
  } catch {
    return null;
  }
}

function storeReactionTestProgress(progress: ReactionTestProgress) {
  try {
    localStorage.setItem(progressStorageKey(progress.sessionId), JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[1];
}

function buildCompletedRecord(
  startedAtIso: string,
  trials: ReactionTrialRecord[],
  falseStartCount: number,
  missCount: number,
): ReactionTestRecord {
  const validReactionTimes = trials.flatMap((trial) => (
    trial.status === "valid" && trial.reactionTimeMs !== null ? [trial.reactionTimeMs] : []
  ));
  if (validReactionTimes.length !== REQUIRED_VALID_TRIALS) {
    throw new Error("Three valid reaction responses are required before completion.");
  }
  const trialTuple: ReactionTestRecord["trials"] = [trials[0], trials[1], trials[2]];
  return {
    protocolVersion: REACTION_TEST_PROTOCOL_VERSION,
    startedAtIso,
    completedAtIso: new Date().toISOString(),
    trials: trialTuple.map((trial) => ({ ...trial })) as ReactionTestRecord["trials"],
    validCount: 3,
    averageReactionTimeMs:
      validReactionTimes.reduce((total, value) => total + value, 0) / REQUIRED_VALID_TRIALS,
    medianReactionTimeMs: median(validReactionTimes),
    falseStartCount,
    missCount,
  };
}

function feedbackMessage(result: OpportunityResult, practice: boolean, language: Language) {
  const copy = REACTION_COPY[language];
  const prefix = practice ? copy.practiceFeedbackPrefix : "";
  if (result.status === "false-start") return `${prefix}${copy.falseStart}`;
  if (result.status === "missed") return `${prefix}${copy.missed}`;
  return `${prefix}${copy.valid}`;
}

export function ReactionTest({
  sessionId,
  useTouchControls,
  language = "en",
  shouldPersistProgress = true,
  onComplete,
}: ReactionTestProps) {
  const [stage, setStage] = useState<ReactionStage>("restoring");
  const [opportunityKind, setOpportunityKind] = useState<OpportunityKind>("practice");
  const [formalTrialNumber, setFormalTrialNumber] = useState<1 | 2 | 3>(1);
  const [feedback, setFeedback] = useState("");
  const [progressSummary, setProgressSummary] = useState<ProgressSummary>({
    completedValidTrials: 0,
    falseStartCount: 0,
    missCount: 0,
  });

  const mountedRef = useRef(true);
  const stageRef = useRef<ReactionStage>("restoring");
  const opportunityKindRef = useRef<OpportunityKind>("practice");
  const formalTrialNumberRef = useRef<1 | 2 | 3>(1);
  const currentFormalAttemptRef = useRef<CurrentFormalAttempt | null>(null);
  const stimulusShownAtPerformanceRef = useRef<number | null>(null);
  const testStartedAtIsoRef = useRef("");
  const practiceCompletedRef = useRef(false);
  const formalStartedRef = useRef(false);
  const formalTrialsRef = useRef<ReactionTrialRecord[]>([]);
  const falseStartCountRef = useRef(0);
  const missCountRef = useRef(0);
  const responseLockedRef = useRef(true);
  const completionSentRef = useRef(false);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paintFrameRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  const finishOpportunityRef = useRef<(
    status: ReactionTrialStatus,
    inputMethod: ReactionInputMethod | null,
    respondedAtIso: string | null,
    reactionTimeMs: number | null,
  ) => void>(() => undefined);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const setCurrentStage = useCallback((nextStage: ReactionStage) => {
    stageRef.current = nextStage;
    setStage(nextStage);
  }, []);

  const clearOpportunityTimers = useCallback(() => {
    if (waitTimerRef.current !== null) clearTimeout(waitTimerRef.current);
    if (missTimerRef.current !== null) clearTimeout(missTimerRef.current);
    if (transitionTimerRef.current !== null) clearTimeout(transitionTimerRef.current);
    if (progressTimerRef.current !== null) clearTimeout(progressTimerRef.current);
    if (paintFrameRef.current !== null) cancelAnimationFrame(paintFrameRef.current);
    waitTimerRef.current = null;
    missTimerRef.current = null;
    transitionTimerRef.current = null;
    progressTimerRef.current = null;
    paintFrameRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearOpportunityTimers();
    };
  }, [clearOpportunityTimers]);

  const persistProgress = useCallback((completedRecord: ReactionTestRecord | null = null) => {
    if (!testStartedAtIsoRef.current) return false;
    if (!shouldPersistProgress) return true;
    return storeReactionTestProgress({
      storageVersion: PROGRESS_STORAGE_VERSION,
      sessionId,
      protocolVersion: REACTION_TEST_PROTOCOL_VERSION,
      startedAtIso: testStartedAtIsoRef.current,
      practiceCompleted: practiceCompletedRef.current,
      formalStarted: formalStartedRef.current,
      trials: formalTrialsRef.current.map((trial) => ({ ...trial })),
      falseStartCount: falseStartCountRef.current,
      missCount: missCountRef.current,
      currentAttempt: currentFormalAttemptRef.current
        ? { ...currentFormalAttemptRef.current }
        : null,
      completedRecord,
    });
  }, [sessionId, shouldPersistProgress]);

  const completeFormalTest = useCallback((trials: ReactionTrialRecord[]) => {
    if (completionSentRef.current || validTrialCount(trials) !== REQUIRED_VALID_TRIALS) return;
    completionSentRef.current = true;
    clearOpportunityTimers();
    responseLockedRef.current = true;
    currentFormalAttemptRef.current = null;
    const record = buildCompletedRecord(
      testStartedAtIsoRef.current,
      trials,
      falseStartCountRef.current,
      missCountRef.current,
    );
    persistProgress(record);
    setCurrentStage("completed");
    onCompleteRef.current(record);
  }, [clearOpportunityTimers, persistProgress, setCurrentStage]);

  const beginOpportunity = useCallback((kind: OpportunityKind, trialNumber: 1 | 2 | 3 = 1) => {
    clearOpportunityTimers();
    opportunityKindRef.current = kind;
    formalTrialNumberRef.current = trialNumber;
    stimulusShownAtPerformanceRef.current = null;
    responseLockedRef.current = false;
    setOpportunityKind(kind);
    setFormalTrialNumber(trialNumber);
    setFeedback("");
    setCurrentStage("waiting");

    const startedAtIso = new Date().toISOString();
    const stimulusDelayMs = randomStimulusDelay();
    if (kind === "formal") {
      currentFormalAttemptRef.current = {
        trialNumber,
        startedAtIso,
        stimulusDelayMs,
        stimulusShownAtIso: null,
      };
      persistProgress();
    }

    waitTimerRef.current = setTimeout(() => {
      waitTimerRef.current = null;
      if (!mountedRef.current || responseLockedRef.current || stageRef.current !== "waiting") return;

      flushSync(() => setCurrentStage("painting-target"));
      paintFrameRef.current = requestAnimationFrame(() => {
        paintFrameRef.current = null;
        if (
          !mountedRef.current
          || responseLockedRef.current
          || stageRef.current !== "painting-target"
        ) return;

        stimulusShownAtPerformanceRef.current = performance.now();
        const stimulusShownAtIso = new Date().toISOString();
        if (kind === "formal" && currentFormalAttemptRef.current) {
          currentFormalAttemptRef.current.stimulusShownAtIso = stimulusShownAtIso;
        }
        setCurrentStage("target");
        missTimerRef.current = setTimeout(() => {
          missTimerRef.current = null;
          if (
            !mountedRef.current
            || responseLockedRef.current
            || stageRef.current !== "target"
          ) return;
          finishOpportunityRef.current("missed", null, null, null);
        }, RESPONSE_WINDOW_MS);
        progressTimerRef.current = setTimeout(() => {
          progressTimerRef.current = null;
          if (mountedRef.current && kind === "formal") persistProgress();
        }, 0);
      });
    }, stimulusDelayMs);
  }, [clearOpportunityTimers, persistProgress, setCurrentStage]);

  const finishOpportunity = useCallback((
    status: ReactionTrialStatus,
    inputMethod: ReactionInputMethod | null,
    respondedAtIso: string | null,
    reactionTimeMs: number | null,
  ) => {
    if (responseLockedRef.current) return;
    responseLockedRef.current = true;
    clearOpportunityTimers();

    const kind = opportunityKindRef.current;
    setFeedback(feedbackMessage({ status }, kind === "practice", language));
    setCurrentStage("feedback");

    if (kind === "practice") {
      practiceCompletedRef.current = true;
      persistProgress();
      transitionTimerRef.current = setTimeout(() => {
        transitionTimerRef.current = null;
        if (!mountedRef.current) return;
        setCurrentStage("practice-complete");
      }, BETWEEN_TRIALS_MS);
      return;
    }

    const currentAttempt = currentFormalAttemptRef.current;
    if (!currentAttempt) return;
    const trial: ReactionTrialRecord = {
      ...currentAttempt,
      status,
      stimulusShownAtIso: status === "false-start" ? null : currentAttempt.stimulusShownAtIso,
      respondedAtIso,
      reactionTimeMs,
      inputMethod,
    };
    currentFormalAttemptRef.current = null;
    if (status === "valid") formalTrialsRef.current.push(trial);
    else if (status === "false-start") falseStartCountRef.current += 1;
    else missCountRef.current += 1;
    const completedValidTrials = validTrialCount(formalTrialsRef.current);
    setProgressSummary({
      completedValidTrials,
      falseStartCount: falseStartCountRef.current,
      missCount: missCountRef.current,
    });
    persistProgress();

    if (completedValidTrials === REQUIRED_VALID_TRIALS) {
      transitionTimerRef.current = setTimeout(() => {
        transitionTimerRef.current = null;
        if (!mountedRef.current) return;
        completeFormalTest(formalTrialsRef.current);
      }, BETWEEN_TRIALS_MS);
      return;
    }

    const nextTrialNumber = (completedValidTrials + 1) as 1 | 2 | 3;
    transitionTimerRef.current = setTimeout(() => {
      transitionTimerRef.current = null;
      if (!mountedRef.current) return;
      beginOpportunity("formal", nextTrialNumber);
    }, BETWEEN_TRIALS_MS);
  }, [beginOpportunity, clearOpportunityTimers, completeFormalTest, language, persistProgress, setCurrentStage]);

  useEffect(() => {
    finishOpportunityRef.current = finishOpportunity;
  }, [finishOpportunity]);

  useEffect(() => {
    let cancelled = false;
    clearOpportunityTimers();
    responseLockedRef.current = true;
    completionSentRef.current = false;
    currentFormalAttemptRef.current = null;
    formalTrialsRef.current = [];
    falseStartCountRef.current = 0;
    missCountRef.current = 0;
    practiceCompletedRef.current = false;
    formalStartedRef.current = false;
    testStartedAtIsoRef.current = "";

    const restoreTimer = setTimeout(() => {
      if (cancelled || !mountedRef.current) return;
      const progress = shouldPersistProgress ? loadReactionTestProgress(sessionId) : null;
      if (!progress) {
        setProgressSummary({ completedValidTrials: 0, falseStartCount: 0, missCount: 0 });
        setCurrentStage("instructions");
        return;
      }

      testStartedAtIsoRef.current = progress.startedAtIso;
      practiceCompletedRef.current = progress.practiceCompleted;
      formalStartedRef.current = progress.formalStarted;
      formalTrialsRef.current = progress.trials.map((trial) => ({ ...trial }));
      falseStartCountRef.current = progress.falseStartCount;
      missCountRef.current = progress.missCount;
      currentFormalAttemptRef.current = progress.currentAttempt
        ? { ...progress.currentAttempt }
        : null;

      if (progress.completedRecord) {
        completionSentRef.current = true;
        setProgressSummary({
          completedValidTrials: REQUIRED_VALID_TRIALS,
          falseStartCount: progress.falseStartCount,
          missCount: progress.missCount,
        });
        setCurrentStage("completed");
        onCompleteRef.current(progress.completedRecord);
        return;
      }

      if (!practiceCompletedRef.current) {
        practiceCompletedRef.current = true;
        persistProgress();
        setProgressSummary({
          completedValidTrials: 0,
          falseStartCount: progress.falseStartCount,
          missCount: progress.missCount,
        });
        setCurrentStage("practice-complete");
        return;
      }
      if (!formalStartedRef.current) {
        setProgressSummary({
          completedValidTrials: 0,
          falseStartCount: progress.falseStartCount,
          missCount: progress.missCount,
        });
        setCurrentStage("practice-complete");
        return;
      }

      if (currentFormalAttemptRef.current) {
        missCountRef.current += 1;
        currentFormalAttemptRef.current = null;
        persistProgress();
      }

      const completedValidTrials = validTrialCount(formalTrialsRef.current);
      setProgressSummary({
        completedValidTrials,
        falseStartCount: falseStartCountRef.current,
        missCount: missCountRef.current,
      });
      if (completedValidTrials === REQUIRED_VALID_TRIALS) {
        completeFormalTest(formalTrialsRef.current);
        return;
      }
      const nextTrialNumber = (completedValidTrials + 1) as 1 | 2 | 3;
      formalTrialNumberRef.current = nextTrialNumber;
      setFormalTrialNumber(nextTrialNumber);
      setOpportunityKind("formal");
      setCurrentStage("resume-ready");
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(restoreTimer);
    };
  }, [clearOpportunityTimers, completeFormalTest, persistProgress, sessionId, setCurrentStage, shouldPersistProgress]);

  const registerResponse = useCallback((inputMethod: ReactionInputMethod) => {
    if (responseLockedRef.current) return;
    const currentStage = stageRef.current;

    if (currentStage === "waiting" || currentStage === "painting-target") {
      finishOpportunity("false-start", inputMethod, new Date().toISOString(), null);
      return;
    }
    if (currentStage !== "target") return;

    const shownAtPerformance = stimulusShownAtPerformanceRef.current;
    if (shownAtPerformance === null) return;
    const reactionTimeMs = Math.max(0, Math.round(performance.now() - shownAtPerformance));
    if (reactionTimeMs > RESPONSE_WINDOW_MS) {
      finishOpportunity("missed", null, null, null);
      return;
    }
    finishOpportunity("valid", inputMethod, new Date().toISOString(), reactionTimeMs);
  }, [finishOpportunity]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.code !== "Space" && event.key !== "Enter")) return;
      if (
        stageRef.current !== "waiting"
        && stageRef.current !== "painting-target"
        && stageRef.current !== "target"
      ) return;
      event.preventDefault();
      registerResponse(event.code === "Space" ? "space" : "enter");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [registerResponse]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (
      stageRef.current !== "waiting"
      && stageRef.current !== "painting-target"
      && stageRef.current !== "target"
    ) return;
    event.preventDefault();
    registerResponse("pointer");
  };

  const startPractice = () => {
    if (stageRef.current !== "instructions") return;
    testStartedAtIsoRef.current = new Date().toISOString();
    practiceCompletedRef.current = false;
    formalStartedRef.current = false;
    formalTrialsRef.current = [];
    falseStartCountRef.current = 0;
    missCountRef.current = 0;
    currentFormalAttemptRef.current = null;
    completionSentRef.current = false;
    setProgressSummary({ completedValidTrials: 0, falseStartCount: 0, missCount: 0 });
    persistProgress();
    beginOpportunity("practice");
  };

  const startFormalTrials = () => {
    if (stageRef.current !== "practice-complete" && stageRef.current !== "resume-ready") return;
    practiceCompletedRef.current = true;
    formalStartedRef.current = true;
    persistProgress();
    const nextTrialNumber = (validTrialCount(formalTrialsRef.current) + 1) as 1 | 2 | 3;
    beginOpportunity("formal", nextTrialNumber);
  };

  const copy = REACTION_COPY[language];
  const responseInstruction = useTouchControls
    ? copy.touchInstruction
    : copy.keyboardInstruction;
  const { falseStartCount, missCount, completedValidTrials } = progressSummary;

  return (
    <main
      className={`reaction-test reaction-test-${stage}`}
      onPointerDown={handlePointerDown}
    >
      {stage === "restoring" ? (
        <section className="reaction-test-feedback" aria-live="polite">
          <p>{copy.check}</p>
          <h1>{copy.restoring}</h1>
        </section>
      ) : null}

      {stage === "instructions" ? (
        <section className="reaction-test-card" aria-labelledby="reaction-test-title">
          <p className="eyebrow">{copy.check}</p>
          <h1 id="reaction-test-title">{copy.title}</h1>
          <p>{responseInstruction} {copy.noGuessing}</p>
          <p>{copy.overview}</p>
          <button className="primary-button" type="button" onClick={startPractice}>
            {copy.startPractice}
          </button>
        </section>
      ) : null}

      {stage === "waiting" ? (
        <section className="reaction-test-waiting" aria-live="polite">
          <p>{opportunityKind === "practice" ? copy.practice : copy.validResponse(formalTrialNumber)}</p>
          <h1>{copy.wait}</h1>
        </section>
      ) : null}

      {stage === "painting-target" || stage === "target" ? (
        <section className="reaction-test-target-screen" aria-live="assertive">
          <p className="reaction-test-progress">
            {opportunityKind === "practice" ? copy.practice : copy.validResponse(formalTrialNumber)}
          </p>
          <div className="reaction-test-target" role="img" aria-label={copy.targetAria}>
            <span>{copy.now}</span>
          </div>
        </section>
      ) : null}

      {stage === "feedback" ? (
        <section className="reaction-test-feedback" aria-live="polite">
          <p>{opportunityKind === "practice" ? copy.practice : copy.validResponses(completedValidTrials)}</p>
          <h1>{feedback}</h1>
          <span>
            {opportunityKind === "formal" && completedValidTrials < 3
              ? formalTrialNumber > completedValidTrials
                ? copy.sameTrial
                : copy.nextTrial
              : ""}
          </span>
        </section>
      ) : null}

      {stage === "practice-complete" ? (
        <section className="reaction-test-card" aria-labelledby="formal-trials-title">
          <p className="eyebrow">{copy.practiceComplete}</p>
          <h1 id="formal-trials-title">{copy.threeNext}</h1>
          <p>{copy.formalInstructions}</p>
          <button className="primary-button" type="button" onClick={startFormalTrials}>
            {copy.beginFormal}
          </button>
        </section>
      ) : null}

      {stage === "resume-ready" ? (
        <section className="reaction-test-card" aria-labelledby="resume-reaction-title">
          <p className="eyebrow">{copy.progressRestored}</p>
          <h1 id="resume-reaction-title">{copy.continueTitle}</h1>
          <p>{copy.savedResponses(completedValidTrials)}</p>
          <p>{copy.attemptCounts(falseStartCount, missCount)}</p>
          <button className="primary-button" type="button" onClick={startFormalTrials}>
            {copy.continueFormal}
          </button>
        </section>
      ) : null}

      {stage === "completed" ? (
        <section className="reaction-test-feedback" aria-live="polite">
          <p>{copy.complete}</p>
          <h1>{copy.thankYou}</h1>
        </section>
      ) : null}
    </main>
  );
}
