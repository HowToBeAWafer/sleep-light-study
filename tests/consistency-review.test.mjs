import assert from "node:assert/strict";
import test from "node:test";
import {
  circularTimeSpreadMinutes,
  groupParticipantHistories,
  normalizeParticipantName,
  reviewParticipantConsistency,
  summarizeConditionHistory,
} from "../app/consistency-review.ts";

function makeSession(overrides = {}) {
  const preSurvey = {
    previousNightSleepTime: "23:30",
    screenUseBeforeSleep: "no",
    sleepsWithLight: "no",
    sleepLightColor: null,
    sleepTemperature: "comfortable",
    sleepAidMedicationOrSupplement: "no",
    caffeineInPast8Hours: "no",
    musicBeforeSleep: "no",
    sleepNoiseLevel: "low",
    ...overrides.preSurvey,
  };
  return {
    schemaVersion: 3,
    sessionId: overrides.sessionId ?? crypto.randomUUID(),
    participantId: "SleepyFox",
    conditionId: "bright-red",
    status: "completed",
    exposureStatus: "completed",
    ...overrides,
    preSurvey,
  };
}

test("circular sleep-time spread treats midnight as adjacent", () => {
  assert.equal(circularTimeSpreadMinutes(["23:30", "00:30"]), 60);
  assert.equal(circularTimeSpreadMinutes(["23:30", "01:00"]), 90);
  assert.equal(circularTimeSpreadMinutes(["23:30", "01:01"]), 91);
  assert.equal(circularTimeSpreadMinutes([]), null);
});

test("participant names collapse internal Unicode whitespace after normalization", () => {
  assert.equal(normalizeParticipantName("  Sleepy\u00a0\t\n Fox  "), "sleepy fox");
  assert.equal(normalizeParticipantName("Ｓｌｅｅｐｙ　　Ｆｏｘ"), "sleepy fox");
});

test("assigned experimental condition changes never create an inconsistency flag", () => {
  const first = makeSession({ conditionId: "bright-red" });
  const second = makeSession({ conditionId: "dim-blue" });
  assert.deepEqual(reviewParticipantConsistency([first, second]), {
    needsReview: false,
    completedSessionCount: 2,
    reasons: [],
    metrics: {
      sleepTimeSpreadMinutes: 0,
      temperatureOrdinalSpread: 0,
      noiseOrdinalSpread: 0,
      changedBehaviors: [],
    },
  });
});

test("review uses strict material-spread thresholds", () => {
  const baseline = makeSession();
  const exactlyAtThresholds = makeSession({
    preSurvey: {
      previousNightSleepTime: "01:00",
      sleepTemperature: "slightly-warm",
      sleepNoiseLevel: "moderate",
    },
  });
  assert.equal(reviewParticipantConsistency([baseline, exactlyAtThresholds]).needsReview, false);

  const materialChange = makeSession({
    preSurvey: {
      previousNightSleepTime: "01:01",
      sleepTemperature: "hot",
      sleepNoiseLevel: "high",
    },
  });
  const review = reviewParticipantConsistency([baseline, materialChange]);
  assert.equal(review.needsReview, true);
  assert.deepEqual(review.reasons.map(({ key }) => key), [
    "sleep_time_spread",
    "temperature_spread",
    "noise_spread",
  ]);
  assert.deepEqual(review.metrics, {
    sleepTimeSpreadMinutes: 91,
    temperatureOrdinalSpread: 2,
    noiseOrdinalSpread: 2,
    changedBehaviors: [],
  });
  assert.match(review.reasons[0].label.zh, /90/);
});

test("sleep-light use and color changes have separate stable reasons", () => {
  const noLight = makeSession();
  const redLight = makeSession({
    preSurvey: { sleepsWithLight: "yes", sleepLightColor: "red" },
  });
  const blueLight = makeSession({
    preSurvey: { sleepsWithLight: "yes", sleepLightColor: "blue" },
  });
  assert.deepEqual(
    reviewParticipantConsistency([noLight, redLight, blueLight]).reasons.map(({ key }) => key),
    ["sleep_light_use_changed", "sleep_light_color_changed"],
  );
});

test("two changed behaviors trigger one review reason; one change does not", () => {
  const baseline = makeSession();
  const screenOnly = makeSession({ preSurvey: { screenUseBeforeSleep: "yes" } });
  assert.equal(reviewParticipantConsistency([baseline, screenOnly]).needsReview, false);

  const screenAndMusic = makeSession({
    preSurvey: { screenUseBeforeSleep: "yes", musicBeforeSleep: "yes" },
  });
  const review = reviewParticipantConsistency([baseline, screenAndMusic]);
  assert.deepEqual(review.reasons.map(({ key }) => key), ["multiple_behavior_changes"]);
  assert.deepEqual(review.metrics.changedBehaviors, ["screen_use", "music"]);
});

test("prefer-not-to-answer values do not manufacture environmental changes", () => {
  const baseline = makeSession();
  const withheld = makeSession({
    preSurvey: {
      sleepsWithLight: "prefer-not-to-answer",
      sleepTemperature: "prefer-not-to-answer",
      sleepNoiseLevel: "prefer-not-to-answer",
      screenUseBeforeSleep: "prefer-not-to-answer",
      musicBeforeSleep: "prefer-not-to-answer",
      caffeineInPast8Hours: "prefer-not-to-answer",
      sleepAidMedicationOrSupplement: "prefer-not-to-answer",
    },
  });
  assert.equal(reviewParticipantConsistency([baseline, withheld]).needsReview, false);
});

test("condition history counts repeats but does not treat interrupted exposure as complete", () => {
  const history = summarizeConditionHistory([
    makeSession({ conditionId: "bright-red" }),
    makeSession({ conditionId: "bright-red" }),
    makeSession({ conditionId: "dim-red", exposureStatus: "terminated" }),
    makeSession({ conditionId: "control", exposureStatus: "not-applicable" }),
    { schemaVersion: 2, status: "completed", conditionId: "bright-blue" },
  ]);
  assert.deepEqual(history.completedConditions, ["bright-red", "control"]);
  assert.deepEqual(history.remainingConditions, ["dim-red", "bright-blue", "dim-blue"]);
  assert.deepEqual(history.completedSessionCountByCondition, {
    "bright-red": 2,
    "dim-red": 0,
    "bright-blue": 0,
    "dim-blue": 0,
    control: 1,
  });
  assert.equal("nextCondition" in history, false);
});

test("grouping joins case variants without mutating historical records", () => {
  const first = Object.freeze(makeSession({ participantId: "SleepyFox" }));
  const second = Object.freeze(makeSession({ participantId: "sleepyfox", conditionId: "dim-red" }));
  const records = Object.freeze([first, second, { schemaVersion: 2, participantId: "SleepyFox" }]);
  const groups = groupParticipantHistories(records);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].participantName, "SleepyFox");
  assert.equal(groups[0].normalizedParticipantName, "sleepyfox");
  assert.equal(groups[0].sessions.length, 2);
  assert.deepEqual(records, [first, second, { schemaVersion: 2, participantId: "SleepyFox" }]);
});
