import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  V4_CONDITION_ORDER,
  conditionForSequencePosition,
  isMorningStudySurvey,
  isPostExposureSurvey,
  isV4ConditionId,
  sequencePositionForCondition,
} from "../app/protocol-v4.ts";
import {
  isStudySessionDraftV4,
  isStudySessionRecordV4,
} from "../app/session-validation-v4.ts";
import { isStudySessionRecordV3 } from "../app/session-validation.ts";
import { isStoredSessionRecord } from "../app/remote-storage.ts";
import { sessionToCsv } from "../app/study-data.ts";

function makeUuid(index) {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

const CONDITION_DETAILS = {
  "dim-red": { name: "Dim Red", hex: "#660000", rgb: "102, 0, 0" },
  "dim-blue": { name: "Dim Blue", hex: "#000066", rgb: "0, 0, 102" },
  "bright-blue": { name: "Bright Blue", hex: "#0000ff", rgb: "0, 0, 255" },
  "bright-red": { name: "Bright Red", hex: "#ff0000", rgb: "255, 0, 0" },
};

function makeDevice(category = "computer") {
  const touch = category !== "computer";
  return {
    detectionVersion: "capabilities-v1",
    detectedCategory: category,
    confirmedCategory: category,
    confirmationSource: "automatic",
    touchCapable: touch,
    coarsePointer: touch,
    finePointer: !touch,
    hoverCapable: !touch,
  };
}

function makePreSurvey(answeredAtIso = "2026-07-31T22:00:00.000Z") {
  return {
    questionnaireVersion: "pre-study-v1",
    answeredAtIso,
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
    musicBeforeSleep: "no",
    sleepNoiseLevel: "low",
    vigorousExerciseInPast12Hours: "no",
  };
}

function makeTrialPlan() {
  return [60000, 120000, 180000, 240000].map((plannedOnsetMs, index) => ({
    trialNumber: index + 1,
    plannedOnsetMs,
    crossXPercent: 40 + index,
    crossYPercent: 35 + index,
  }));
}

function makeCompletedTrials(trialPlan) {
  return [
    {
      ...trialPlan[0],
      status: "hit",
      appearedElapsedMs: 60000,
      appearedAtIso: "2026-07-31T22:01:10.000Z",
      clickedElapsedMs: 60400,
      clickedAtIso: "2026-07-31T22:01:10.400Z",
      reactionTimeMs: 400,
      inputMethod: "pointer",
      clickXPercent: 50,
      clickYPercent: 50,
    },
    {
      ...trialPlan[1],
      status: "missed",
      appearedElapsedMs: 120000,
      appearedAtIso: "2026-07-31T22:02:10.000Z",
      clickedElapsedMs: null,
      clickedAtIso: null,
      reactionTimeMs: null,
      inputMethod: null,
      clickXPercent: null,
      clickYPercent: null,
    },
    {
      ...trialPlan[2],
      status: "hit",
      appearedElapsedMs: 180000,
      appearedAtIso: "2026-07-31T22:03:10.000Z",
      clickedElapsedMs: 180650,
      clickedAtIso: "2026-07-31T22:03:10.650Z",
      reactionTimeMs: 650,
      inputMethod: "space",
      clickXPercent: null,
      clickYPercent: null,
    },
    {
      ...trialPlan[3],
      status: "omitted",
      appearedElapsedMs: null,
      appearedAtIso: null,
      clickedElapsedMs: null,
      clickedAtIso: null,
      reactionTimeMs: null,
      inputMethod: null,
      clickXPercent: null,
      clickYPercent: null,
    },
  ];
}

function makeV4Session(sequencePosition = 1) {
  const conditionId = conditionForSequencePosition(sequencePosition);
  const condition = CONDITION_DETAILS[conditionId];
  const trialPlan = makeTrialPlan();
  const device = makeDevice();
  return {
    schemaVersion: 4,
    protocolVersion: "overnight-v2",
    sequenceVersion: "fixed-four-v1",
    sequencePosition,
    attentionProtocolVersion: "sparse-4-50-70-v1",
    sessionId: makeUuid(1000 + sequencePosition),
    participantId: "Pilot-V4",
    participantProfileId: makeUuid(2000),
    studyBuildVersion: "2026-08-04-professional-zh-blinded-order-v1",
    conditionId,
    conditionName: condition.name,
    stimulusColorHex: condition.hex,
    stimulusColorRgb: condition.rgb,
    plannedDurationMs: 300000,
    plannedEndAtIso: "2026-07-31T22:05:10.000Z",
    actualDurationMs: 300000,
    wallClockDurationMs: 300000,
    totalPausedDurationMs: 0,
    crossVisibleMs: 1800,
    startedAtIso: "2026-07-31T22:00:00.000Z",
    stimulusStartedAtIso: "2026-07-31T22:00:10.000Z",
    stimulusEndedAtIso: "2026-07-31T22:05:10.000Z",
    sleepStartedAtIso: "2026-07-31T22:10:00.000Z",
    morningReturnedAtIso: "2026-08-01T06:30:00.000Z",
    assessmentCompletedAtIso: "2026-08-01T06:32:30.000Z",
    endedAtIso: "2026-08-01T06:32:30.000Z",
    status: "completed",
    exposureStatus: "completed",
    terminationReason: null,
    fullscreenAtStart: true,
    fullscreenRequestFailed: false,
    deviceInfo: {
      beforeSleep: device,
      afterWaking: { ...device },
      deviceChanged: false,
    },
    preSurvey: makePreSurvey(),
    postExposureSurvey: {
      questionnaireVersion: "post-exposure-kss-v1",
      answeredAtIso: "2026-07-31T22:05:20.000Z",
      sleepinessKss: 7,
    },
    morningSurvey: {
      questionnaireVersion: "morning-study-v1",
      answeredAtIso: "2026-08-01T06:32:00.000Z",
      attemptedSleepTime: "22:30",
      wakeTime: "06:25",
      awakenings: 1,
      sleepQuality: 4,
      restedness: 4,
      alertness: 3,
      unusualFactors: "no",
      unusualFactorsNote: null,
    },
    trialPlan,
    trials: makeCompletedTrials(trialPlan),
    falseClicks: [],
    pauses: [],
    environmentEvents: [],
  };
}

function makeV3Session() {
  const device = makeDevice();
  const trialPlan = makeTrialPlan();
  const reactionTrials = [300, 310, 320].map((reactionTimeMs, index) => ({
    trialNumber: index + 1,
    status: "valid",
    startedAtIso: `2026-08-01T06:32:0${index * 2}.000Z`,
    stimulusDelayMs: 1000,
    stimulusShownAtIso: `2026-08-01T06:32:0${index * 2 + 1}.000Z`,
    respondedAtIso: `2026-08-01T06:32:0${index * 2 + 1}.${reactionTimeMs}Z`,
    reactionTimeMs,
    inputMethod: index === 0 ? "pointer" : index === 1 ? "space" : "enter",
  }));
  return {
    schemaVersion: 3,
    protocolVersion: "overnight-v1",
    attentionProtocolVersion: "sparse-4-50-70-v1",
    sessionId: makeUuid(3000),
    participantId: "Pilot-V3",
    participantProfileId: makeUuid(3001),
    studyBuildVersion: "2026-07-26-password-practice-admin-results-v1",
    conditionId: "bright-red",
    conditionName: "Bright Red",
    stimulusColorHex: "#ff0000",
    stimulusColorRgb: "255, 0, 0",
    plannedDurationMs: 300000,
    plannedEndAtIso: "2026-07-31T22:05:10.000Z",
    actualDurationMs: 300000,
    wallClockDurationMs: 300000,
    totalPausedDurationMs: 0,
    crossVisibleMs: 1800,
    startedAtIso: "2026-07-31T22:00:00.000Z",
    stimulusStartedAtIso: "2026-07-31T22:00:10.000Z",
    stimulusEndedAtIso: "2026-07-31T22:05:10.000Z",
    sleepStartedAtIso: "2026-07-31T22:10:00.000Z",
    morningReturnedAtIso: "2026-08-01T06:30:00.000Z",
    assessmentCompletedAtIso: "2026-08-01T06:33:00.000Z",
    endedAtIso: "2026-08-01T06:33:00.000Z",
    status: "completed",
    exposureStatus: "completed",
    terminationReason: null,
    fullscreenAtStart: true,
    fullscreenRequestFailed: false,
    deviceInfo: {
      beforeSleep: device,
      afterWaking: { ...device },
      deviceChanged: false,
    },
    preSurvey: makePreSurvey(),
    postSurvey: {
      questionnaireVersion: "post-study-v1",
      answeredAtIso: "2026-08-01T06:31:00.000Z",
      sleepinessKss: 3,
    },
    reactionTest: {
      protocolVersion: "relaxed-reaction-test-v1",
      startedAtIso: "2026-08-01T06:32:00.000Z",
      completedAtIso: "2026-08-01T06:32:06.000Z",
      trials: reactionTrials,
      validCount: 3,
      averageReactionTimeMs: 310,
      medianReactionTimeMs: 310,
      falseStartCount: 0,
      missCount: 0,
    },
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

function parseCsv(csv) {
  const parseLine = (line) => {
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
  };
  const lines = csv.split("\n");
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    assert.equal(cells.length, headers.length);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
}

test("protocol v4 enforces the fixed four-condition sequence and excludes Control", () => {
  assert.deepEqual(
    [...V4_CONDITION_ORDER],
    ["dim-red", "dim-blue", "bright-blue", "bright-red"],
  );
  assert.equal(isV4ConditionId("control"), false);

  V4_CONDITION_ORDER.forEach((conditionId, index) => {
    const position = index + 1;
    assert.equal(conditionForSequencePosition(position), conditionId);
    assert.equal(sequencePositionForCondition(conditionId), position);
    assert.equal(isStudySessionRecordV4(makeV4Session(position)), true);
  });

  const wrongOrder = makeV4Session(1);
  Object.assign(wrongOrder, {
    conditionId: "dim-blue",
    conditionName: "Dim Blue",
    stimulusColorHex: "#000066",
    stimulusColorRgb: "0, 0, 102",
  });
  assert.equal(isStudySessionRecordV4(wrongOrder), false);

  const control = {
    ...makeV4Session(1),
    conditionId: "control",
    conditionName: "Control — Normal Sleep",
    stimulusColorHex: null,
    stimulusColorRgb: null,
  };
  assert.equal(isStudySessionRecordV4(control), false);
  assert.equal(isStoredSessionRecord(control), false);
});

test("protocol v4 requires immediate post-exposure KSS before sleep is marked", () => {
  const valid = makeV4Session();
  assert.equal(isPostExposureSurvey(valid.postExposureSurvey), true);
  assert.equal(isStudySessionRecordV4(valid), true);

  assert.equal(isStudySessionRecordV4({ ...valid, postExposureSurvey: null }), false);
  assert.equal(isStudySessionRecordV4({
    ...valid,
    postExposureSurvey: {
      ...valid.postExposureSurvey,
      answeredAtIso: "2026-07-31T22:05:09.999Z",
    },
  }), false);
  assert.equal(isStudySessionRecordV4({
    ...valid,
    postExposureSurvey: {
      ...valid.postExposureSurvey,
      sleepinessKss: 10,
    },
  }), false);
  assert.equal(isStudySessionRecordV4({
    ...valid,
    sleepStartedAtIso: "2026-07-31T22:05:19.999Z",
  }), false);
});

test("protocol v4 finalizes from the morning-only questionnaire without KSS", () => {
  const valid = makeV4Session();
  assert.equal(isMorningStudySurvey(valid.morningSurvey), true);
  assert.equal(Object.hasOwn(valid.morningSurvey, "sleepinessKss"), false);
  assert.equal(isStudySessionRecordV4(valid), true);

  assert.equal(isStudySessionRecordV4({ ...valid, morningSurvey: null }), false);
  assert.equal(isStudySessionRecordV4({
    ...valid,
    morningSurvey: {
      ...valid.morningSurvey,
      answeredAtIso: "2026-08-01T06:29:59.999Z",
    },
  }), false);
  assert.equal(isStudySessionRecordV4({
    ...valid,
    assessmentCompletedAtIso: "2026-08-01T06:31:59.999Z",
  }), false);
  assert.equal(isStudySessionRecordV4({
    ...valid,
    morningSurvey: {
      ...valid.morningSurvey,
      sleepinessKss: 3,
    },
  }), false);
  assert.equal(isMorningStudySurvey({
    ...valid.morningSurvey,
    unusualFactors: "yes",
    unusualFactorsNote: null,
  }), false);
});

test("protocol v4 forbids a standalone reaction-test object", () => {
  const valid = makeV4Session();
  assert.equal(Object.hasOwn(valid, "reactionTest"), false);
  assert.equal(isStudySessionRecordV4(valid), true);
  assert.equal(isStudySessionRecordV4({ ...valid, reactionTest: null }), false);
  assert.equal(isStudySessionRecordV4({
    ...valid,
    reactionTest: makeV3Session().reactionTest,
  }), false);
});

test("protocol v4 validates and exports reaction times from exposure attention hits", () => {
  const valid = makeV4Session();
  assert.equal(isStudySessionRecordV4(valid), true);

  const inconsistentElapsed = structuredClone(valid);
  inconsistentElapsed.trials[0].reactionTimeMs = 401;
  assert.equal(isStudySessionRecordV4(inconsistentElapsed), false);

  const beyondVisibleWindow = structuredClone(valid);
  beyondVisibleWindow.trials[0].clickedElapsedMs = 61801;
  beyondVisibleWindow.trials[0].reactionTimeMs = 1801;
  beyondVisibleWindow.trials[0].clickedAtIso = "2026-07-31T22:01:11.801Z";
  assert.equal(isStudySessionRecordV4(beyondVisibleWindow), false);

  const rows = parseCsv(sessionToCsv(valid));
  const summary = rows.find((row) => row.event_type === "session_summary");
  assert.ok(summary);
  assert.equal(summary.schema_version, "4");
  assert.equal(summary.sequence_version, "fixed-four-v1");
  assert.equal(summary.sequence_position, "1");
  assert.equal(summary.post_exposure_sleepiness_kss, "7");
  assert.equal(summary.morning_sleep_quality, "4");
  assert.equal(summary.morning_alertness, "3");
  assert.equal(summary.reaction_source, "exposure_attention_trials");
  assert.equal(summary.exposure_reaction_valid_count, "2");
  assert.equal(summary.exposure_reaction_mean_ms, "525");
  assert.equal(summary.exposure_reaction_median_ms, "525");
  assert.equal(summary.reaction_test_valid_count, "");
  assert.equal(
    rows.filter((row) => row.event_type === "reaction_test_trial").length,
    0,
  );
});

test("protocol v4 active drafts are accepted at each new survey milestone", () => {
  const final = makeV4Session();
  const base = {
    ...final,
    status: "active",
    assessmentCompletedAtIso: null,
    endedAtIso: null,
  };

  const afterExposure = {
    ...base,
    sleepStartedAtIso: null,
    morningReturnedAtIso: null,
    morningSurvey: null,
    deviceInfo: {
      ...base.deviceInfo,
      afterWaking: null,
      deviceChanged: null,
    },
  };
  assert.equal(isStudySessionDraftV4(afterExposure), true);

  const beforePostExposureKss = {
    ...afterExposure,
    postExposureSurvey: null,
  };
  assert.equal(isStudySessionDraftV4(beforePostExposureKss), true);

  const awaitingMorning = {
    ...afterExposure,
    sleepStartedAtIso: final.sleepStartedAtIso,
  };
  assert.equal(isStudySessionDraftV4(awaitingMorning), true);

  const morningCheckpoint = {
    ...base,
    morningSurvey: null,
  };
  assert.equal(isStudySessionDraftV4(morningCheckpoint), true);
});

test("protocol v3 remains valid and retains standalone reaction rows", () => {
  const legacy = makeV3Session();
  assert.equal(isStudySessionRecordV3(legacy), true);
  assert.equal(isStoredSessionRecord(legacy), true);

  const rows = parseCsv(sessionToCsv(legacy));
  const summary = rows.find((row) => row.event_type === "session_summary");
  assert.ok(summary);
  assert.equal(summary.schema_version, "3");
  assert.equal(summary.reaction_source, "standalone_reaction_test");
  assert.equal(summary.reaction_test_valid_count, "3");
  assert.equal(
    rows.filter((row) => row.event_type === "reaction_test_trial").length,
    3,
  );
});

test("participant-facing protocol v4 copy hides the condition order and preserves phase order", async () => {
  const [page, tutorial, surveys, recordTypes] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/study-tutorial.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/study-surveys.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/session-record.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Four-session study/);
  assert.match(page, /The condition for each session is assigned automatically/);
  assert.match(page, /no selection is required/);
  assert.match(page, /Test mode only: choose a condition/);
  assert.match(page, /"post-exposure-survey"/);
  assert.match(page, /setPhase\("post-exposure-survey"\)/);
  assert.match(page, /if \(phase === "morning-survey"\)/);
  assert.match(page, /there is no separate reaction test/);
  assert.match(
    page,
    /phase === "reaction-test" && overnightRecord && overnightRecord\.schemaVersion === 3/,
  );

  assert.match(tutorial, /Post-exposure sleepiness measure/);
  assert.match(tutorial, /Reaction time during this display is the study reaction-time measure/);
  assert.match(tutorial, /Current assignment and progress/);
  assert.match(tutorial, /The condition for each session is assigned automatically/);
  assert.doesNotMatch(tutorial, /condition-progress-grid/);
  assert.match(surveys, /Immediately after the display/);
  assert.match(surveys, /Next-morning questionnaire/);
  assert.match(surveys, /There is no separate reaction-time test/);

  const participantCopy = `${page}\n${tutorial}`;
  for (const disclosedOrder of [
    "Fixed order: dim red → dim blue → bright blue → bright red",
    "Fixed order: dim red, dim blue, bright blue, bright red",
    "Assigned order: dim red · dim blue · bright blue · bright red",
    "固定顺序：暗红 → 暗蓝 → 亮蓝 → 亮红",
    "固定顺序为暗红、暗蓝、亮蓝、亮红",
    "指定顺序：暗红 · 暗蓝 · 亮蓝 · 亮红",
  ]) {
    assert.doesNotMatch(participantCopy, new RegExp(disclosedOrder));
  }

  const v4TypeStart = recordTypes.indexOf("export type StudySessionRecordV4");
  const v4TypeEnd = recordTypes.indexOf("export type StudySessionRecord =", v4TypeStart);
  assert.ok(v4TypeStart >= 0 && v4TypeEnd > v4TypeStart);
  assert.doesNotMatch(recordTypes.slice(v4TypeStart, v4TypeEnd), /reactionTest/);
});
