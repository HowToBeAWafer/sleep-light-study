import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isTouchCapable } from "../app/device-controls.ts";
import { fetchRemoteStudySessions, isStoredSessionRecord } from "../app/remote-storage.ts";
import {
  isStudySessionDraftV3,
  isStudySessionRecordV3,
} from "../app/session-validation.ts";
import { sessionToCsv, sessionsToCsv } from "../app/study-data.ts";

function makeUuid(index) {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function makeStoredSession(index = 1) {
  const trialPlan = Array.from({ length: 20 }, (_, planIndex) => ({
    trialNumber: planIndex + 1,
    plannedOnsetMs: 5000 + planIndex * 14000,
    crossXPercent: 50,
    crossYPercent: 50,
  }));
  return {
    schemaVersion: 2,
    sessionId: makeUuid(index),
    participantId: `SL-${index}`,
    conditionId: "bright-red",
    conditionName: "Bright Red",
    stimulusColorHex: "#ff0000",
    stimulusColorRgb: "255, 0, 0",
    plannedDurationMs: 300000,
    plannedEndAtIso: "2026-07-10T15:05:00.000Z",
    actualDurationMs: 300000,
    wallClockDurationMs: 300000,
    totalPausedDurationMs: 0,
    crossVisibleMs: 1800,
    startedAtIso: "2026-07-10T15:00:00.000Z",
    endedAtIso: "2026-07-10T15:05:00.000Z",
    status: "completed",
    terminationReason: null,
    fullscreenAtStart: true,
    fullscreenRequestFailed: false,
    trialPlan,
    trials: trialPlan.map((trial) => ({
      ...trial,
      status: "omitted",
      appearedElapsedMs: null,
      appearedAtIso: null,
      clickedElapsedMs: null,
      clickedAtIso: null,
      reactionTimeMs: null,
      inputMethod: null,
      clickXPercent: null,
      clickYPercent: null,
    })),
    falseClicks: [],
    pauses: [],
    environmentEvents: [],
  };
}

function makeV3ColorSession() {
  const beforeSleepDevice = {
    detectionVersion: "capabilities-v1",
    detectedCategory: "computer",
    confirmedCategory: "computer",
    confirmationSource: "automatic",
    touchCapable: false,
    coarsePointer: false,
    finePointer: true,
    hoverCapable: true,
  };
  const trialPlan = [60000, 120000, 180000, 240000].map((plannedOnsetMs, index) => ({
    trialNumber: index + 1,
    plannedOnsetMs,
    crossXPercent: 40 + index,
    crossYPercent: 35 + index,
  }));
  const trials = trialPlan.map((trial) => ({
    ...trial,
    status: "omitted",
    appearedElapsedMs: null,
    appearedAtIso: null,
    clickedElapsedMs: null,
    clickedAtIso: null,
    reactionTimeMs: null,
    inputMethod: null,
    clickXPercent: null,
    clickYPercent: null,
  }));
  return {
    schemaVersion: 3,
    protocolVersion: "overnight-v1",
    attentionProtocolVersion: "sparse-4-50-70-v1",
    sessionId: makeUuid(900),
    participantId: "SL-900",
    conditionId: "bright-red",
    conditionName: "Bright Red",
    stimulusColorHex: "#ff0000",
    stimulusColorRgb: "255, 0, 0",
    plannedDurationMs: 300000,
    plannedEndAtIso: "2026-07-17T22:05:10.000Z",
    actualDurationMs: 300000,
    wallClockDurationMs: 300000,
    totalPausedDurationMs: 0,
    crossVisibleMs: 1800,
    startedAtIso: "2026-07-17T22:00:00.000Z",
    stimulusStartedAtIso: "2026-07-17T22:00:10.000Z",
    stimulusEndedAtIso: "2026-07-17T22:05:10.000Z",
    sleepStartedAtIso: "2026-07-17T22:10:00.000Z",
    morningReturnedAtIso: "2026-07-18T06:30:00.000Z",
    assessmentCompletedAtIso: "2026-07-18T06:33:00.000Z",
    endedAtIso: "2026-07-18T06:33:00.000Z",
    status: "completed",
    exposureStatus: "completed",
    terminationReason: null,
    fullscreenAtStart: true,
    fullscreenRequestFailed: false,
    deviceInfo: {
      beforeSleep: beforeSleepDevice,
      afterWaking: { ...beforeSleepDevice },
      deviceChanged: false,
    },
    preSurvey: {
      questionnaireVersion: "pre-study-v1",
      answeredAtIso: "2026-07-17T22:00:00.000Z",
      previousNightSleepTime: "23:15",
      sleepinessKss: 5,
      screenUseBeforeSleep: "yes",
      screenUseMinutes: 45,
      sleepsWithLight: "no",
      sleepLightColor: null,
      sleepTemperature: "comfortable",
      sleepAidMedicationOrSupplement: "no",
      morningRestedness: 4,
      previousNightSleepQuality: 4,
      caffeineInPast8Hours: "no",
      musicBeforeSleep: "yes",
      sleepNoiseLevel: "low",
      vigorousExerciseInPast12Hours: "no",
    },
    postSurvey: {
      questionnaireVersion: "post-study-v1",
      answeredAtIso: "2026-07-18T06:31:00.000Z",
      sleepinessKss: 3,
    },
    reactionTest: {
      protocolVersion: "relaxed-reaction-test-v1",
      startedAtIso: "2026-07-18T06:32:00.000Z",
      completedAtIso: "2026-07-18T06:32:06.000Z",
      trials: [
        {
          trialNumber: 1,
          status: "valid",
          startedAtIso: "2026-07-18T06:32:00.000Z",
          stimulusDelayMs: 1000,
          stimulusShownAtIso: "2026-07-18T06:32:01.000Z",
          respondedAtIso: "2026-07-18T06:32:01.300Z",
          reactionTimeMs: 300,
          inputMethod: "pointer",
        },
        {
          trialNumber: 2,
          status: "valid",
          startedAtIso: "2026-07-18T06:32:02.000Z",
          stimulusDelayMs: 1000,
          stimulusShownAtIso: "2026-07-18T06:32:03.000Z",
          respondedAtIso: "2026-07-18T06:32:03.310Z",
          reactionTimeMs: 310,
          inputMethod: "space",
        },
        {
          trialNumber: 3,
          status: "valid",
          startedAtIso: "2026-07-18T06:32:04.000Z",
          stimulusDelayMs: 1000,
          stimulusShownAtIso: "2026-07-18T06:32:05.000Z",
          respondedAtIso: "2026-07-18T06:32:05.320Z",
          reactionTimeMs: 320,
          inputMethod: "enter",
        },
      ],
      validCount: 3,
      averageReactionTimeMs: 310,
      medianReactionTimeMs: 310,
      falseStartCount: 0,
      missCount: 0,
    },
    trialPlan,
    trials,
    falseClicks: [],
    pauses: [],
    environmentEvents: [],
  };
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Sleep Light Study setup page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Sleep Light Study \| 睡眠光照研究<\/title>/i);
  assert.match(html, /Complete tonight/);
  assert.match(html, /Return after waking/);
  assert.match(html, /Study name \(real name or nickname\)/);
  assert.match(html, /Bright red/);
  assert.match(html, /Dim red/);
  assert.match(html, /Bright blue/);
  assert.match(html, /Dim blue/);
  assert.match(html, /Control — normal sleep/);
  assert.match(html, /Read tutorial and begin/);
  assert.match(html, /English/);
  assert.match(html, /中文/);
  assert.doesNotMatch(html, /or test/i);
});

test("includes attention, pause, termination, and logging controls", async () => {
  const [page, studyData] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/study-data.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Stay focused on the screen/);
  assert.match(page, /Press /);
  assert.match(page, /To end the light exposure early, type E, then N, then D/);
  assert.match(page, /PauseRecord,/);
  assert.match(page, /totalPausedDurationMs/);
  assert.match(studyData, /"false_click"/);
  assert.match(studyData, /"session_summary"/);
  assert.match(page, /finishExposureRef\.current\("terminated"\)/);
  assert.match(page, /className="session-countdown"/);
  assert.match(page, /schemaVersion: 3/);
  assert.match(page, /export function makeTrialPlan\(count = 4\)/);
  assert.match(page, /plannedOnsetMs \+= randomBetween\(50000, 70000\)/);
  assert.match(page, /id: "control"/);
  assert.match(page, /sleepStartedAtIso/);
  assert.match(page, /ReactionTest/);
  assert.match(page, /now - startedAtPerformanceRef\.current - totalPausedMsRef\.current/);
  assert.match(page, /typeof document\.documentElement\.requestFullscreen !== "function"/);
});

test("detects touch capability and preserves separate touch and keyboard controls", async () => {
  assert.equal(isTouchCapable(0, false), false);
  assert.equal(isTouchCapable(1, false), true);
  assert.equal(isTouchCapable(0, true), true);
  assert.equal(isTouchCapable(5, true), true);

  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /navigator\.maxTouchPoints/);
  assert.match(page, /matchMedia\("\(pointer: coarse\)"\)/);
  assert.match(page, /event\.pointerType === "touch"/);
  assert.match(page, /controlModeOverrideRef/);
  assert.doesNotMatch(page, /navigator\.userAgent|iPhone|iPad|Android/i);
  assert.match(page, /data-control-mode=\{useTouchControls \? "touch" : "keyboard"\}/);
  assert.match(page, /Touch-device instructions/);
  assert.match(page, /tap End twice within three seconds/i);
  assert.match(page, /Press /);
  assert.match(page, /type E, then N, then D/i);
  assert.match(page, /className="touch-session-controls"/);
  assert.match(page, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(page, /touchEndArmedRef\.current/);
  assert.match(page, /terminationReasonRef\.current = "touch_end"/);
  assert.match(page, /Wrong controls\? Use /);
  assert.match(page, /crossYPercent: randomBetween\(15, 60\)/);
  assert.match(styles, /\.touch-session-controls\s*\{[\s\S]*position:\s*fixed;/);
  assert.match(styles, /env\(safe-area-inset-bottom/);
  assert.match(styles, /\.touch-session-controls button\s*\{[\s\S]*min-height:\s*48px/);

  const keyboardStart = page.indexOf("const onKeyDown");
  const keyboardEnd = page.indexOf('window.addEventListener("keydown"', keyboardStart);
  assert.ok(keyboardStart >= 0 && keyboardEnd > keyboardStart);
  const keyboardBlock = page.slice(keyboardStart, keyboardEnd);
  assert.match(keyboardBlock, /key === "p"/);
  assert.match(keyboardBlock, /pauseSession\(\)/);
  assert.match(keyboardBlock, /resumeSession\(\)/);
  assert.match(keyboardBlock, /const expected = "end"\[endSequenceRef\.current\.length\]/);
  assert.match(keyboardBlock, /finishExposureRef\.current\("terminated"\)/);
  assert.match(keyboardBlock, /registerResponse/);
  assert.match(page, /const clearEndSequence = useCallback/);
  assert.match(page, /clearEndSequence\(\);[\s\S]*setPhase\("paused"\)/);
});

test("supports bilingual tutorials, unique study-name profiles, append-only feedback, and versioned history", async () => {
  const [page, tutorial, feedback, remoteStorage, recordTypes, studyData, profileMigration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/study-tutorial.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/session-feedback.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/remote-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/session-record.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/study-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260718_participant_profiles.sql", import.meta.url), "utf8"),
  ]);

  assert.match(page, /LANGUAGE_STORAGE_KEY/);
  assert.match(page, /changeLanguage\("zh"\)/);
  assert.match(page, /StudyTutorial/);
  assert.match(page, /claimParticipantProfile/);
  assert.match(page, /fetchParticipantProgress/);
  assert.match(page, /participantRecoveryCodeInput/);
  assert.match(page, /STUDY_BUILD_VERSION/);
  assert.match(page, /SessionFeedback/);
  assert.match(page, /admin-review-flag/);
  assert.match(tutorial, /Keep these as similar as practical/);
  assert.match(tutorial, /温度/);
  assert.match(tutorial, /condition-progress-grid/);
  assert.match(feedback, /Questions or feedback/);
  assert.match(feedback, /有问题或反馈吗/);
  assert.match(remoteStorage, /submit_participant_feedback/);
  assert.match(remoteStorage, /submit_profile_study_session/);
  assert.match(recordTypes, /participantProfileId\?: string/);
  assert.match(recordTypes, /studyBuildVersion\?: string/);
  assert.match(studyData, /"participant_profile_id"/);
  assert.match(studyData, /"study_build_version"/);
  assert.equal(profileMigration.match(/session_payload ->> 'conditionId' not in \(/g)?.length, 1);
  assert.match(profileMigration, /study_sessions_append_only/);
  assert.match(profileMigration, /participant_feedback_append_only/);
  assert.match(profileMigration, /saved\.condition_id = 'control'[\s\S]*saved\.payload ->> 'exposureStatus' = 'not-applicable'/);
  assert.match(profileMigration, /saved\.condition_id in \('bright-red', 'dim-red', 'bright-blue', 'dim-blue'\)[\s\S]*saved\.payload ->> 'exposureStatus' = 'completed'/);
});

test("immediate END still exports a complete terminated session row", () => {
  const session = {
    sessionId: "session-immediate-end",
    participantId: "SL-001",
    conditionId: "bright-red",
    conditionName: "Bright Red",
    stimulusColorHex: "#ff0000",
    stimulusColorRgb: "255, 0, 0",
    startedAtIso: "2026-07-10T15:00:00.000Z",
    plannedEndAtIso: "2026-07-10T15:05:00.000Z",
    endedAtIso: "2026-07-10T15:00:00.500Z",
    plannedDurationMs: 300000,
    actualDurationMs: 500,
    wallClockDurationMs: 500,
    totalPausedDurationMs: 0,
    crossVisibleMs: 1800,
    status: "terminated",
    terminationReason: "end_sequence",
    fullscreenAtStart: true,
    fullscreenRequestFailed: false,
    trials: [],
    falseClicks: [],
    environmentEvents: [],
    pauses: [],
  };
  const csv = sessionToCsv(session);

  const [headerLine, summaryLine, ...extraLines] = csv.split("\n");
  const headers = parseCsvLine(headerLine);
  const summary = parseCsvLine(summaryLine);
  const record = Object.fromEntries(headers.map((header, index) => [header, summary[index]]));

  assert.equal(extraLines.length, 0);
  assert.equal(summary.length, headers.length);
  assert.equal(record.participant_id, "SL-001");
  assert.equal(record.condition_id, "bright-red");
  assert.equal(record.session_status, "terminated");
  assert.equal(record.termination_reason, "end_sequence");
  assert.equal(record.event_type, "session_summary");
  assert.equal(record.event_elapsed_ms, "0");

  const combined = sessionsToCsv([
    session,
    { ...session, sessionId: "session-immediate-end-2", participantId: "SL-002" },
  ]);
  assert.equal(combined.match(/^session_id,participant_id/gm)?.length, 1);
  assert.equal(combined.match(/session_summary/g)?.length, 2);
});

test("schema v3 CSV includes surveys, device history, overnight timing, and reaction trials", () => {
  const beforeSleepDevice = {
    detectionVersion: "capabilities-v1",
    detectedCategory: "phone",
    confirmedCategory: "phone",
    confirmationSource: "automatic",
    touchCapable: true,
    coarsePointer: true,
    finePointer: false,
    hoverCapable: false,
  };
  const afterWakingDevice = {
    ...beforeSleepDevice,
    detectedCategory: "computer",
    confirmedCategory: "computer",
    touchCapable: false,
    coarsePointer: false,
    finePointer: true,
    hoverCapable: true,
  };
  const reactionTrials = [
    {
      trialNumber: 1,
      status: "valid",
      startedAtIso: "2026-07-18T06:32:00.000Z",
      stimulusDelayMs: 2500,
      stimulusShownAtIso: "2026-07-18T06:32:02.500Z",
      respondedAtIso: "2026-07-18T06:32:02.800Z",
      reactionTimeMs: 300,
      inputMethod: "pointer",
    },
    {
      trialNumber: 2,
      status: "valid",
      startedAtIso: "2026-07-18T06:32:04.000Z",
      stimulusDelayMs: 3000,
      stimulusShownAtIso: "2026-07-18T06:32:07.000Z",
      respondedAtIso: "2026-07-18T06:32:07.310Z",
      reactionTimeMs: 310,
      inputMethod: "space",
    },
    {
      trialNumber: 3,
      status: "valid",
      startedAtIso: "2026-07-18T06:32:09.000Z",
      stimulusDelayMs: 2000,
      stimulusShownAtIso: "2026-07-18T06:32:11.000Z",
      respondedAtIso: "2026-07-18T06:32:11.320Z",
      reactionTimeMs: 320,
      inputMethod: "enter",
    },
  ];
  const session = {
    schemaVersion: 3,
    protocolVersion: "overnight-v1",
    attentionProtocolVersion: "sparse-4-50-70-v1",
    sessionId: makeUuid(800),
    participantId: "SL-800",
    participantProfileId: makeUuid(801),
    studyBuildVersion: "2026-07-18-bilingual-profiles-v1",
    conditionId: "control",
    conditionName: "Control — Normal Sleep",
    stimulusColorHex: null,
    stimulusColorRgb: null,
    startedAtIso: "2026-07-17T22:00:00.000Z",
    stimulusStartedAtIso: null,
    stimulusEndedAtIso: null,
    sleepStartedAtIso: "2026-07-17T22:05:00.000Z",
    morningReturnedAtIso: "2026-07-18T06:30:00.000Z",
    assessmentCompletedAtIso: "2026-07-18T06:33:00.000Z",
    plannedEndAtIso: null,
    endedAtIso: "2026-07-18T06:33:00.000Z",
    plannedDurationMs: 0,
    actualDurationMs: 0,
    wallClockDurationMs: 0,
    totalPausedDurationMs: 0,
    crossVisibleMs: 1800,
    status: "completed",
    exposureStatus: "not-applicable",
    terminationReason: null,
    fullscreenAtStart: false,
    fullscreenRequestFailed: false,
    deviceInfo: {
      beforeSleep: beforeSleepDevice,
      afterWaking: afterWakingDevice,
      deviceChanged: true,
    },
    preSurvey: {
      questionnaireVersion: "pre-study-v1",
      answeredAtIso: "2026-07-17T22:00:00.000Z",
      previousNightSleepTime: "23:15",
      sleepinessKss: 5,
      screenUseBeforeSleep: "yes",
      screenUseMinutes: 45,
      sleepsWithLight: "no",
      sleepLightColor: null,
      sleepTemperature: "comfortable",
      sleepAidMedicationOrSupplement: "no",
      morningRestedness: 4,
      previousNightSleepQuality: 4,
      caffeineInPast8Hours: "no",
      musicBeforeSleep: "yes",
      sleepNoiseLevel: "low",
      vigorousExerciseInPast12Hours: "no",
    },
    postSurvey: {
      questionnaireVersion: "post-study-v1",
      answeredAtIso: "2026-07-18T06:31:00.000Z",
      sleepinessKss: 3,
    },
    reactionTest: {
      protocolVersion: "relaxed-reaction-test-v1",
      startedAtIso: "2026-07-18T06:32:00.000Z",
      completedAtIso: "2026-07-18T06:32:11.320Z",
      trials: reactionTrials,
      validCount: 3,
      averageReactionTimeMs: 310,
      medianReactionTimeMs: 310,
      falseStartCount: 0,
      missCount: 0,
    },
    trialPlan: [],
    trials: [],
    falseClicks: [],
    environmentEvents: [],
    pauses: [],
  };

  assert.equal(isStoredSessionRecord(session), true);
  assert.equal(isStudySessionDraftV3({
    ...session,
    status: "active",
    morningReturnedAtIso: null,
    assessmentCompletedAtIso: null,
    endedAtIso: null,
    deviceInfo: {
      beforeSleep: beforeSleepDevice,
      afterWaking: null,
      deviceChanged: null,
    },
    postSurvey: null,
    reactionTest: null,
  }), true);
  const colorPlan = [50000, 110000, 170000, 230000].map((plannedOnsetMs, index) => ({
    trialNumber: index + 1,
    plannedOnsetMs,
    crossXPercent: 50,
    crossYPercent: 40,
  }));
  assert.equal(isStoredSessionRecord({
    ...session,
    conditionId: "bright-red",
    conditionName: "Bright Red",
    stimulusColorHex: "#ff0000",
    stimulusColorRgb: "255, 0, 0",
    stimulusStartedAtIso: "2026-07-17T22:00:10.000Z",
    stimulusEndedAtIso: "2026-07-17T22:05:10.000Z",
    sleepStartedAtIso: "2026-07-17T22:05:10.000Z",
    plannedEndAtIso: "2026-07-17T22:05:10.000Z",
    plannedDurationMs: 300000,
    actualDurationMs: 300000,
    wallClockDurationMs: 300000,
    exposureStatus: "completed",
    fullscreenAtStart: true,
    trialPlan: colorPlan,
    trials: colorPlan.map((trial) => ({
      ...trial,
      status: "omitted",
      appearedElapsedMs: null,
      appearedAtIso: null,
      clickedElapsedMs: null,
      clickedAtIso: null,
      reactionTimeMs: null,
      inputMethod: null,
      clickXPercent: null,
      clickYPercent: null,
    })),
  }), true);
  const lines = sessionToCsv(session).split("\n");
  const headers = parseCsvLine(lines[0]);
  const records = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    assert.equal(cells.length, headers.length);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
  const summary = records.find((record) => record.event_type === "session_summary");
  const reactionRows = records.filter((record) => record.event_type === "reaction_test_trial");

  assert.ok(summary);
  assert.equal(summary.schema_version, "3");
  assert.equal(summary.participant_profile_id, makeUuid(801));
  assert.equal(summary.study_build_version, "2026-07-18-bilingual-profiles-v1");
  assert.equal(summary.condition_id, "control");
  assert.equal(summary.stimulus_color_hex, "");
  assert.equal(summary.exposure_status, "not-applicable");
  assert.equal(summary.sleep_started_at_iso, "2026-07-17T22:05:00.000Z");
  assert.equal(summary.morning_returned_at_iso, "2026-07-18T06:30:00.000Z");
  assert.equal(summary.device_confirmed_before_sleep, "phone");
  assert.equal(summary.device_confirmed_after_waking, "computer");
  assert.equal(summary.device_changed, "true");
  assert.equal(summary.pre_sleepiness_kss, "5");
  assert.equal(summary.post_sleepiness_kss, "3");
  assert.equal(summary.screen_use_minutes, "45");
  assert.equal(summary.reaction_test_valid_count, "3");
  assert.equal(summary.reaction_test_average_ms, "310");
  assert.equal(reactionRows.length, 3);
  assert.deepEqual(
    reactionRows.map((record) => record.reaction_trial_number),
    ["1", "2", "3"],
  );
  assert.deepEqual(
    reactionRows.map((record) => record.reaction_trial_reaction_time_ms),
    ["300", "310", "320"],
  );
  assert.deepEqual(
    reactionRows.map((record) => record.reaction_trial_input_method),
    ["pointer", "space", "enter"],
  );
});

test("schema v3 validation enforces the sparse attention schedule and reserved IDs", () => {
  const valid = makeV3ColorSession();
  assert.equal(isStudySessionRecordV3(valid), true);

  const profiled = {
    ...valid,
    participantProfileId: makeUuid(901),
    studyBuildVersion: "2026-07-18-bilingual-profiles-v1",
  };
  assert.equal(isStudySessionRecordV3(profiled), true);
  assert.equal(isStudySessionRecordV3({ ...profiled, participantProfileId: "not-a-uuid" }), false);
  assert.equal(isStudySessionRecordV3({ ...profiled, studyBuildVersion: "" }), false);

  const reserved = { ...valid, participantId: "test" };
  assert.equal(isStudySessionRecordV3(reserved), false);
  assert.equal(
    isStudySessionRecordV3(reserved, { allowReservedParticipantId: true }),
    true,
  );

  const boundarySchedule = structuredClone(valid);
  [70000, 140000, 210000, 280000].forEach((plannedOnsetMs, index) => {
    boundarySchedule.trialPlan[index].plannedOnsetMs = plannedOnsetMs;
    boundarySchedule.trials[index].plannedOnsetMs = plannedOnsetMs;
  });
  assert.equal(isStudySessionRecordV3(boundarySchedule), true);

  const lateFirstTrial = structuredClone(valid);
  [70001, 130001, 190001, 250001].forEach((plannedOnsetMs, index) => {
    lateFirstTrial.trialPlan[index].plannedOnsetMs = plannedOnsetMs;
    lateFirstTrial.trials[index].plannedOnsetMs = plannedOnsetMs;
  });
  assert.equal(isStudySessionRecordV3(lateFirstTrial), false);

  const excessiveInterval = structuredClone(valid);
  [60000, 130001, 190001, 250001].forEach((plannedOnsetMs, index) => {
    excessiveInterval.trialPlan[index].plannedOnsetMs = plannedOnsetMs;
    excessiveInterval.trials[index].plannedOnsetMs = plannedOnsetMs;
  });
  assert.equal(isStudySessionRecordV3(excessiveInterval), false);

  const threeTrialPlan = structuredClone(valid);
  threeTrialPlan.trialPlan.pop();
  threeTrialPlan.trials.pop();
  assert.equal(isStudySessionRecordV3(threeTrialPlan), false);
});

test("schema v3 validation enforces final exposure and device integrity", () => {
  const valid = makeV3ColorSession();

  const pendingFinal = structuredClone(valid);
  pendingFinal.trials[0].status = "pending";
  assert.equal(isStudySessionRecordV3(pendingFinal), false);

  for (const requiredField of [
    "plannedEndAtIso",
    "stimulusStartedAtIso",
    "stimulusEndedAtIso",
  ]) {
    const missingTiming = structuredClone(valid);
    missingTiming[requiredField] = null;
    assert.equal(isStudySessionRecordV3(missingTiming), false);
  }

  const reversedStimulus = {
    ...valid,
    stimulusEndedAtIso: "2026-07-17T22:00:09.000Z",
  };
  assert.equal(isStudySessionRecordV3(reversedStimulus), false);

  const reversedPlan = {
    ...valid,
    plannedEndAtIso: "2026-07-17T22:00:09.000Z",
  };
  assert.equal(isStudySessionRecordV3(reversedPlan), false);

  const wrongDeviceChange = structuredClone(valid);
  wrongDeviceChange.deviceInfo.deviceChanged = true;
  assert.equal(isStudySessionRecordV3(wrongDeviceChange), false);

  const noMorningDevice = structuredClone(valid);
  noMorningDevice.deviceInfo.afterWaking = null;
  noMorningDevice.deviceInfo.deviceChanged = false;
  assert.equal(isStudySessionRecordV3(noMorningDevice), false);

  const endedExposure = {
    ...valid,
    status: "completed",
    exposureStatus: "terminated",
    terminationReason: "page_reload",
    actualDurationMs: 120000,
    wallClockDurationMs: 120000,
    stimulusEndedAtIso: "2026-07-17T22:02:10.000Z",
    trials: valid.trials.slice(0, 2),
  };
  assert.equal(isStudySessionRecordV3(endedExposure), true);

  assert.equal(isStudySessionRecordV3({
    ...valid,
    status: "terminated",
    exposureStatus: "completed",
  }), false);
});

test("schema v3 validation supports active exposure drafts but not unfinished finals", () => {
  const valid = makeV3ColorSession();
  const unfinished = {
    ...valid,
    status: "active",
    sleepStartedAtIso: null,
    morningReturnedAtIso: null,
    assessmentCompletedAtIso: null,
    endedAtIso: null,
    deviceInfo: {
      ...valid.deviceInfo,
      afterWaking: null,
      deviceChanged: null,
    },
    postSurvey: null,
    reactionTest: null,
  };
  const notStarted = {
    ...unfinished,
    plannedEndAtIso: null,
    actualDurationMs: 0,
    wallClockDurationMs: 0,
    totalPausedDurationMs: 0,
    stimulusStartedAtIso: null,
    stimulusEndedAtIso: null,
    exposureStatus: "not-started",
    terminationReason: null,
    fullscreenAtStart: false,
    fullscreenRequestFailed: false,
    trials: [],
    falseClicks: [],
    pauses: [],
    environmentEvents: [],
  };
  assert.equal(isStudySessionRecordV3(notStarted), false);
  assert.equal(isStudySessionDraftV3(notStarted), true);
  assert.equal(isStudySessionDraftV3({ ...notStarted, participantId: "test" }), false);
  assert.equal(isStudySessionDraftV3(
    { ...notStarted, participantId: "test" },
    { allowReservedParticipantId: true },
  ), true);

  const inProgress = {
    ...notStarted,
    plannedEndAtIso: "2026-07-17T22:05:10.000Z",
    actualDurationMs: 1000,
    wallClockDurationMs: 1000,
    stimulusStartedAtIso: "2026-07-17T22:00:10.000Z",
    exposureStatus: "in-progress",
    fullscreenAtStart: true,
  };
  assert.equal(isStudySessionDraftV3(inProgress), true);

  assert.equal(isStudySessionRecordV3({
    ...valid,
    exposureStatus: "not-started",
  }), false);
  assert.equal(isStudySessionRecordV3({
    ...valid,
    exposureStatus: "in-progress",
  }), false);
});

test("schema v3 control sessions keep all stimulus fields empty", () => {
  const color = makeV3ColorSession();
  const control = {
    ...color,
    conditionId: "control",
    conditionName: "Control — Normal Sleep",
    stimulusColorHex: null,
    stimulusColorRgb: null,
    plannedDurationMs: 0,
    plannedEndAtIso: null,
    actualDurationMs: 0,
    wallClockDurationMs: 0,
    totalPausedDurationMs: 0,
    stimulusStartedAtIso: null,
    stimulusEndedAtIso: null,
    exposureStatus: "not-applicable",
    terminationReason: null,
    fullscreenAtStart: false,
    fullscreenRequestFailed: false,
    trialPlan: [],
    trials: [],
    falseClicks: [],
    pauses: [],
    environmentEvents: [],
  };
  assert.equal(isStudySessionRecordV3(control), true);
  assert.equal(isStudySessionRecordV3({ ...control, actualDurationMs: 1 }), false);
  assert.equal(isStudySessionRecordV3({
    ...control,
    status: "terminated",
  }), false);
  assert.equal(isStudySessionRecordV3({
    ...control,
    trialPlan: color.trialPlan,
  }), false);
});

test("remote storage keeps admin reads behind authentication and RLS", async () => {
  const [page, remoteStorage, schema] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/remote-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/setup.sql", import.meta.url), "utf8"),
  ]);

  const adminBranch = page.indexOf("if (isAdminParticipantId(cleanParticipantId))");
  const participantValidation = page.indexOf("if (!cleanParticipantId || !conditionId)");
  assert.ok(adminBranch >= 0 && participantValidation > adminBranch);
  assert.doesNotMatch(page, /exportSavedSessions|savedSessionCount/);
  assert.match(page, /uploadStudySession\(record/);
  assert.match(page, /maxLength=\{80\}/);
  assert.match(page, /sleep-light-study:sessions:v2/);
  assert.match(remoteStorage, /sb_publishable_/);
  assert.doesNotMatch(remoteStorage, /sb_secret_|service_role/i);
  assert.doesNotMatch(remoteStorage, /limit: "1000"/);
  assert.match(remoteStorage, /offset: String\(offset\)/);
  assert.match(remoteStorage, /isStoredSessionRecord\(row\.payload\)/);
  assert.match(schema, /enable row level security/i);
  assert.match(schema, /force row level security/i);
  assert.match(schema, /to anon[\s\S]*with check/i);
  assert.match(schema, /private\.study_admins/);
  assert.match(schema, /administrator\.user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(schema, /grant select on table public\.study_sessions to anon/i);
});

test("database migrations keep array bounds inside the check constraint", async () => {
  const [setup, protocolMigration] = await Promise.all([
    readFile(new URL("../supabase/setup.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260718_protocol_v3.sql", import.meta.url), "utf8"),
  ]);

  for (const sql of [setup, protocolMigration]) {
    const start = sql.indexOf("add constraint study_payload_array_lengths_ck");
    const end = sql.indexOf("add constraint study_payload_matches_columns_ck", start);
    assert.ok(start >= 0 && end > start);
    const constraint = sql.slice(start, end);
    assert.doesNotMatch(constraint, /\n {4}\)\n {4}and jsonb_array_length\(payload -> 'falseClicks'\)/);
    assert.match(constraint, /and jsonb_array_length\(payload -> 'environmentEvents'\) <= 1000\n\s*\),/);
  }
});

test("GitHub Pages release builds a portable static artifact", async () => {
  const [workflow, exporter] = await Promise.all([
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
    readFile(new URL("../scripts/export-github-pages.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run build/);
  assert.match(workflow, /run: npm run export:github-pages/);
  assert.match(workflow, /path: work\/github-pages-release/);
  assert.doesNotMatch(exporter, /sips/);
  assert.match(exporter, /sleep-light-study\/og\.jpg/);
});

test("remote session validation rejects malformed nested records", () => {
  const valid = makeStoredSession();
  assert.equal(isStoredSessionRecord(valid), true);
  assert.equal(isStoredSessionRecord({
    ...valid,
    status: "terminated",
    terminationReason: "touch_end",
  }), true);

  assert.equal(isStoredSessionRecord({ ...valid, trials: [null] }), false);
  assert.equal(isStoredSessionRecord({ ...valid, trialPlan: undefined }), false);
  assert.equal(isStoredSessionRecord({ ...valid, actualDurationMs: Number.NaN }), false);
  assert.equal(isStoredSessionRecord({ ...valid, endedAtIso: "not-a-date" }), false);
  assert.equal(isStoredSessionRecord({ ...valid, status: "active" }), false);
  assert.equal(isStoredSessionRecord({
    ...valid,
    pauses: [{
      pauseNumber: 1,
      startedElapsedMs: 1000,
      startedAtIso: "2026-07-10T15:00:01.000Z",
      endedAtIso: "2026-07-10T15:00:02.000Z",
      durationMs: "1000",
    }],
  }), false);
  assert.equal(isStoredSessionRecord({
    ...valid,
    falseClicks: [{
      clickedElapsedMs: 1000,
      clickedAtIso: "2026-07-10T15:00:01.000Z",
      inputMethod: "voice",
      clickXPercent: null,
      clickYPercent: null,
    }],
  }), false);
  assert.equal(isStoredSessionRecord({
    ...valid,
    trialPlan: valid.trialPlan.map((trial, index) => (
      index === 19 ? { ...trial, trialNumber: 1 } : trial
    )),
  }), false);
});

test("admin loading paginates by raw rows and hides malformed records", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const firstPage = Array.from({ length: 499 }, (_, index) => {
    const payload = makeStoredSession(index + 1);
    return {
      session_id: payload.sessionId,
      payload,
      received_at: "2026-07-10T15:05:01.123456+00:00",
    };
  });
  firstPage.push({
    session_id: makeUuid(9999),
    payload: { schemaVersion: 2, trials: [null] },
    received_at: "2026-07-10T15:05:02+00:00",
  });
  const finalPayload = makeStoredSession(500);
  const secondPage = [{
    session_id: finalPayload.sessionId,
    payload: finalPayload,
    received_at: "2026-07-10T15:05:03+00:00",
  }];
  const offsets = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get("offset"));
    offsets.push(offset);
    assert.equal(init?.headers?.Authorization, "Bearer admin-token");
    return Response.json(offset === 0 ? firstPage : secondPage);
  };

  const result = await fetchRemoteStudySessions("admin-token");
  assert.deepEqual(offsets, [0, 500]);
  assert.equal(result.sessions.length, 500);
  assert.equal(result.invalidCount, 1);
  assert.equal(result.sessions[0].record.sessionId, finalPayload.sessionId);
  assert.equal(result.sessions.some(({ record }) => record.sessionId === makeUuid(9999)), false);
});

test("admin loading never presents a partial or non-array response as complete", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const fullPage = Array.from({ length: 500 }, (_, index) => {
    const payload = makeStoredSession(index + 1);
    return {
      session_id: payload.sessionId,
      payload,
      received_at: "2026-07-10T15:05:01+00:00",
    };
  });
  let requestNumber = 0;
  globalThis.fetch = async () => {
    requestNumber += 1;
    return requestNumber === 1
      ? Response.json(fullPage)
      : Response.json({ message: "Later page failed" }, { status: 500 });
  };
  await assert.rejects(fetchRemoteStudySessions("admin-token"), /Later page failed/);

  globalThis.fetch = async () => Response.json({ payload: [] });
  await assert.rejects(fetchRemoteStudySessions("admin-token"), /response was not valid/);
});
