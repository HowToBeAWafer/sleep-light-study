import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FIXED_FIVE_SEQUENCE_VERSION,
  OVERNIGHT_V3_PROTOCOL_VERSION,
  V5_CONDITION_DETAILS,
  V5_CONDITION_ORDER,
  conditionForV5SequencePosition,
  isV5ConditionId,
  sequencePositionForV5Condition,
} from "../app/protocol-v5.ts";
import {
  isStudySessionDraftV5,
  isStudySessionRecordV5,
} from "../app/session-validation-v5.ts";
import { isStudySessionRecordV4 } from "../app/session-validation-v4.ts";
import { fetchAdminIncompleteOvernightDrafts } from "../app/remote-storage.ts";

function makeUuid(index) {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

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

function makePreSurvey(answeredAtIso = "2026-08-09T22:00:00.000Z") {
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
      appearedAtIso: "2026-08-09T22:01:10.000Z",
      clickedElapsedMs: 60400,
      clickedAtIso: "2026-08-09T22:01:10.400Z",
      reactionTimeMs: 400,
      inputMethod: "pointer",
      clickXPercent: 50,
      clickYPercent: 50,
    },
    {
      ...trialPlan[1],
      status: "missed",
      appearedElapsedMs: 120000,
      appearedAtIso: "2026-08-09T22:02:10.000Z",
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
      appearedAtIso: "2026-08-09T22:03:10.000Z",
      clickedElapsedMs: 180650,
      clickedAtIso: "2026-08-09T22:03:10.650Z",
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

function makeV5Session(sequencePosition = 1) {
  const conditionId = conditionForV5SequencePosition(sequencePosition);
  const condition = V5_CONDITION_DETAILS[conditionId];
  const trialPlan = makeTrialPlan();
  const device = makeDevice();
  return {
    schemaVersion: 5,
    protocolVersion: OVERNIGHT_V3_PROTOCOL_VERSION,
    sequenceVersion: FIXED_FIVE_SEQUENCE_VERSION,
    sequencePosition,
    attentionProtocolVersion: "sparse-4-50-70-v1",
    sessionId: makeUuid(5000 + sequencePosition),
    participantId: "Pilot-V5",
    participantProfileId: makeUuid(6000),
    studyBuildVersion: "2026-08-09-black-control-v1",
    conditionId,
    conditionName: condition.name,
    stimulusColorHex: condition.stimulusColorHex,
    stimulusColorRgb: condition.stimulusColorRgb,
    attentionCrossColorHex: condition.attentionCrossColorHex,
    attentionCrossColorRgb: condition.attentionCrossColorRgb,
    plannedDurationMs: 300000,
    plannedEndAtIso: "2026-08-09T22:05:10.000Z",
    actualDurationMs: 300000,
    wallClockDurationMs: 300000,
    totalPausedDurationMs: 0,
    crossVisibleMs: 1800,
    startedAtIso: "2026-08-09T22:00:00.000Z",
    stimulusStartedAtIso: "2026-08-09T22:00:10.000Z",
    stimulusEndedAtIso: "2026-08-09T22:05:10.000Z",
    sleepStartedAtIso: "2026-08-09T22:10:00.000Z",
    morningReturnedAtIso: "2026-08-10T06:30:00.000Z",
    assessmentCompletedAtIso: "2026-08-10T06:32:30.000Z",
    endedAtIso: "2026-08-10T06:32:30.000Z",
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
      answeredAtIso: "2026-08-09T22:05:20.000Z",
      sleepinessKss: 7,
    },
    morningSurvey: {
      questionnaireVersion: "morning-study-v1",
      answeredAtIso: "2026-08-10T06:32:00.000Z",
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

function makeHistoricalV4Session() {
  const projected = { ...makeV5Session(1) };
  delete projected.attentionCrossColorHex;
  delete projected.attentionCrossColorRgb;
  return {
    ...projected,
    schemaVersion: 4,
    protocolVersion: "overnight-v2",
    sequenceVersion: "fixed-four-v1",
    sequencePosition: 1,
    participantId: "Pilot-V4-Historical",
    studyBuildVersion: "2026-08-04-professional-zh-blinded-order-v1",
  };
}

test("protocol v5 fixes the five-condition sequence with black control third", () => {
  assert.deepEqual(
    [...V5_CONDITION_ORDER],
    ["dim-red", "dim-blue", "black-control", "bright-blue", "bright-red"],
  );
  assert.equal(isV5ConditionId("black-control"), true);
  assert.equal(isV5ConditionId("control"), false);

  V5_CONDITION_ORDER.forEach((conditionId, index) => {
    const position = index + 1;
    assert.equal(conditionForV5SequencePosition(position), conditionId);
    assert.equal(sequencePositionForV5Condition(conditionId), position);
    assert.equal(isStudySessionRecordV5(makeV5Session(position)), true);
  });
});

test("black-control is a five-minute exposure with four trials and a gray cross", () => {
  const record = makeV5Session(3);
  assert.equal(record.conditionId, "black-control");
  assert.equal(record.conditionName, "Black-screen Control");
  assert.equal(record.stimulusColorHex, "#000000");
  assert.equal(record.stimulusColorRgb, "0, 0, 0");
  assert.equal(record.attentionCrossColorHex, "#808080");
  assert.equal(record.attentionCrossColorRgb, "128, 128, 128");
  assert.equal(record.plannedDurationMs, 300000);
  assert.equal(record.trialPlan.length, 4);
  assert.equal(record.trials.length, 4);
  assert.equal(record.attentionProtocolVersion, "sparse-4-50-70-v1");
  assert.equal(isStudySessionRecordV5(record), true);

  assert.equal(isStudySessionRecordV5({
    ...record,
    attentionCrossColorHex: "#000000",
    attentionCrossColorRgb: "0, 0, 0",
  }), false);
  assert.equal(isStudySessionRecordV5({ ...record, trialPlan: [] }), false);
  assert.equal(isStudySessionRecordV5({ ...record, trials: [] }), false);
});

test("protocol v5 rejects wrong positions, legacy control, and invalid cross colors", () => {
  const dimRed = makeV5Session(1);
  const dimBlue = V5_CONDITION_DETAILS["dim-blue"];
  assert.equal(isStudySessionRecordV5({
    ...dimRed,
    conditionId: "dim-blue",
    conditionName: dimBlue.name,
    stimulusColorHex: dimBlue.stimulusColorHex,
    stimulusColorRgb: dimBlue.stimulusColorRgb,
    attentionCrossColorHex: dimBlue.attentionCrossColorHex,
    attentionCrossColorRgb: dimBlue.attentionCrossColorRgb,
  }), false);
  assert.equal(isStudySessionRecordV5({ ...dimRed, sequencePosition: 6 }), false);
  assert.equal(isStudySessionRecordV5({
    ...dimRed,
    conditionId: "control",
    conditionName: "Control — Normal Sleep",
    stimulusColorHex: null,
    stimulusColorRgb: null,
  }), false);
  assert.equal(isStudySessionRecordV5({
    ...dimRed,
    attentionCrossColorHex: "#808080",
    attentionCrossColorRgb: "128, 128, 128",
  }), false);
  assert.equal(isStudySessionRecordV5({
    ...dimRed,
    studyBuildVersion: "invalid build with spaces",
  }), false);
});

test("protocol v5 active drafts retain the v4 timeline invariants", () => {
  const final = makeV5Session(3);
  const afterExposure = {
    ...final,
    status: "active",
    sleepStartedAtIso: null,
    morningReturnedAtIso: null,
    assessmentCompletedAtIso: null,
    endedAtIso: null,
    morningSurvey: null,
    deviceInfo: {
      ...final.deviceInfo,
      afterWaking: null,
      deviceChanged: null,
    },
  };
  assert.equal(isStudySessionDraftV5(afterExposure), true);
  assert.equal(isStudySessionRecordV5(afterExposure), false);
  assert.equal(isStudySessionRecordV5(afterExposure, { allowActive: true }), true);
  assert.equal(isStudySessionDraftV5({ ...afterExposure, postSurvey: null }), false);
});

test("admin incomplete-session RPC returns only a typed evening checkpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const final = makeV5Session(3);
  const record = {
    ...final,
    status: "active",
    assessmentCompletedAtIso: null,
    endedAtIso: null,
    morningSurvey: null,
  };
  assert.equal(isStudySessionDraftV5(record), true);

  const serverItem = {
    profileId: record.participantProfileId,
    displayName: record.participantId,
    sessionId: record.sessionId,
    conditionId: record.conditionId,
    sequencePosition: record.sequencePosition,
    schemaVersion: record.schemaVersion,
    studyBuildVersion: record.studyBuildVersion,
    recordStatus: "active",
    exposureStatus: "completed",
    incompleteStage: "awaiting-morning-questionnaire",
    startedAt: record.startedAtIso,
    stimulusEndedAt: record.stimulusEndedAtIso,
    postExposureAnsweredAt: record.postExposureSurvey.answeredAtIso,
    sleepStartedAt: record.sleepStartedAtIso,
    morningReturnedAt: record.morningReturnedAtIso,
    morningQuestionnaireSubmitted: false,
    actualDurationMs: record.actualDurationMs,
    firstSavedAt: "2026-08-09T22:05:20.000Z",
    latestSavedAt: "2026-08-10T06:30:00.000Z",
    snapshotCount: 3,
    record,
  };
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /\/rpc\/admin_list_incomplete_study_sessions_v5$/);
    assert.equal(init?.headers?.Authorization, "Bearer admin-token");
    assert.deepEqual(JSON.parse(String(init?.body)), { page_size: 500, page_offset: 0 });
    return Response.json({ items: [serverItem], total: 1 });
  };

  const result = await fetchAdminIncompleteOvernightDrafts("admin-token");
  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].persistence, "incomplete-night");
  assert.equal(result.items[0].draftId, record.sessionId);
  assert.equal(result.items[0].createdAt, serverItem.firstSavedAt);
  assert.equal(result.items[0].updatedAt, serverItem.latestSavedAt);
  assert.deepEqual(result.items[0].record, record);
});

test("admin incomplete-session RPC rejects snapshots outside the evening-only contract", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const record = {
    ...makeV5Session(1),
    status: "active",
    assessmentCompletedAtIso: null,
    endedAtIso: null,
  };
  assert.equal(isStudySessionDraftV5(record), true);
  globalThis.fetch = async () => Response.json({
    total: 1,
    items: [{ record }],
  });

  await assert.rejects(
    fetchAdminIncompleteOvernightDrafts("admin-token"),
    /incomplete overnight session list was not valid/i,
  );
});

test("historical v4 validation remains independent and unchanged", () => {
  const historical = makeHistoricalV4Session();
  assert.equal(isStudySessionRecordV4(historical), true);
  assert.equal(isStudySessionRecordV5(historical), false);

  const current = makeV5Session(1);
  assert.equal(isStudySessionRecordV5(current), true);
  assert.equal(isStudySessionRecordV4(current), false);
});

test("the session union reserves storageVersion 3 for v5 drafts", async () => {
  const recordTypes = await readFile(
    new URL("../app/session-record.ts", import.meta.url),
    "utf8",
  );
  assert.match(recordTypes, /export type StudySessionRecordV5 = \{/);
  assert.match(recordTypes, /schemaVersion: 5;/);
  assert.match(recordTypes, /attentionCrossColorHex: string;/);
  assert.match(recordTypes, /attentionCrossColorRgb: string;/);
  assert.match(recordTypes, /storageVersion: 1 \| 2 \| 3;/);
});

test("v5 progress carries only the completed contiguous v4 dark prefix", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260809_protocol_v5.sql", import.meta.url),
    "utf8",
  );
  const helperStart = migration.indexOf(
    "create or replace function private.is_v5_sequence_position_completed",
  );
  const helperEnd = migration.indexOf(
    "create or replace function private.next_v5_sequence_position",
    helperStart,
  );
  assert.ok(helperStart >= 0, "the v5 completion helper must exist");
  assert.ok(helperEnd > helperStart, "the v5 completion helper must be bounded");
  const completionHelper = migration.slice(helperStart, helperEnd);

  assert.match(completionHelper, /saved\.status = 'completed'/);
  assert.match(completionHelper, /saved\.payload ->> 'exposureStatus' = 'completed'/);
  assert.match(completionHelper, /candidate_position = 1/);
  assert.match(completionHelper, /candidate_position = 2/);
  assert.equal(
    (completionHelper.match(/saved\.condition_id = 'dim-red'/g) ?? []).length,
    2,
    "dim red must count once directly and once as the position-2 prerequisite",
  );
  assert.equal(
    (completionHelper.match(/saved\.condition_id = 'dim-blue'/g) ?? []).length,
    1,
  );
  assert.equal(
    (completionHelper.match(/saved\.payload ->> 'schemaVersion' = '4'/g) ?? [])
      .length,
    3,
  );
  assert.equal(
    (completionHelper.match(/saved\.payload ->> 'protocolVersion' = 'overnight-v2'/g)
      ?? []).length,
    3,
  );
  assert.equal(
    (completionHelper.match(/saved\.payload ->> 'sequenceVersion' = 'fixed-four-v1'/g)
      ?? []).length,
    3,
  );

  const positionTwoBranch = completionHelper.slice(
    completionHelper.indexOf("candidate_position = 2"),
  );
  assert.match(
    positionTwoBranch,
    /saved\.condition_id = 'dim-red'[\s\S]*and exists \([\s\S]*saved\.condition_id = 'dim-blue'/,
    "v4 dim blue may carry only when the completed v4 dim-red prerequisite exists",
  );
  assert.doesNotMatch(completionHelper, /saved\.condition_id = 'bright-blue'/);
  assert.doesNotMatch(completionHelper, /saved\.condition_id = 'bright-red'/);

  const nextPositionBlock = migration.slice(
    helperEnd,
    migration.indexOf(
      "create or replace function private.v5_condition_for_position",
      helperEnd,
    ),
  );
  const participantProgressBlock = migration.slice(
    migration.indexOf("create or replace function public.get_participant_progress_v5"),
    migration.indexOf(
      "create or replace function public.save_participant_study_draft_v5",
    ),
  );
  const administratorProgressBlock = migration.slice(
    migration.indexOf(
      "create or replace function public.admin_list_participant_profiles_v5",
    ),
    migration.indexOf(
      "revoke all on function public.get_participant_progress_v5",
    ),
  );
  assert.match(nextPositionBlock, /private\.is_v5_sequence_position_completed\(/);
  assert.match(
    participantProgressBlock,
    /private\.is_v5_sequence_position_completed\(/,
  );
  assert.match(
    administratorProgressBlock,
    /private\.is_v5_sequence_position_completed\(/,
  );
  assert.doesNotMatch(migration, /\bupdate\s+public\.study_sessions\b/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\s+public\.study_sessions\b/i);
});

test("the SQL v5 validator uses an editor-safe explicit position mapping", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260809_protocol_v5.sql", import.meta.url),
    "utf8",
  );
  const validator = migration.slice(
    migration.indexOf("create or replace function private.is_valid_study_session_v5"),
    migration.indexOf(
      "revoke all on function private.is_valid_study_session_v5",
    ),
  );

  for (const [position, condition] of [
    [1, "dim-red"],
    [2, "dim-blue"],
    [3, "black-control"],
    [4, "bright-blue"],
    [5, "bright-red"],
  ]) {
    assert.match(
      validator,
      new RegExp(`sequence_position = ${position} and candidate_condition = '${condition}'`),
    );
  }
  assert.doesNotMatch(
    validator,
    /candidate_condition\s*<>\s*\(?\s*case\b/i,
    "avoid a nested CASE/WHEN/THEN inside the PL/pgSQL IF copied through the SQL editor",
  );
});

test("completed evening checkpoints remain admin-visible without a morning questionnaire", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260809_protocol_v5.sql", import.meta.url),
    "utf8",
  );
  const snapshotStart = migration.indexOf(
    "create table if not exists private.incomplete_study_session_snapshots",
  );
  const finalSessionConstraints = migration.indexOf(
    "alter table public.study_sessions",
    snapshotStart,
  );
  const rpcStart = migration.indexOf(
    "create or replace function public.admin_list_incomplete_study_sessions_v5",
  );
  const rpcEnd = migration.indexOf(
    "revoke all on function public.get_participant_progress_v5",
    rpcStart,
  );
  assert.ok(snapshotStart >= 0, "the durable incomplete-session table must exist");
  assert.ok(finalSessionConstraints > snapshotStart, "the snapshot block must be bounded");
  assert.ok(rpcStart >= 0 && rpcEnd > rpcStart, "the admin-only incomplete-session RPC must exist");

  const snapshotBlock = migration.slice(snapshotStart, finalSessionConstraints);
  const rpcBlock = migration.slice(rpcStart, rpcEnd);
  assert.match(snapshotBlock, /payload ->> 'schemaVersion' in \('4', '5'\)/);
  assert.match(snapshotBlock, /payload ->> 'status' = 'active'/);
  assert.match(snapshotBlock, /payload ->> 'exposureStatus' = 'completed'/);
  assert.match(snapshotBlock, /payload -> 'postExposureSurvey' <> 'null'::jsonb/);
  assert.match(snapshotBlock, /payload -> 'morningSurvey' = 'null'::jsonb/);
  assert.match(snapshotBlock, /after insert or update of payload, participant_profile_id/);
  assert.match(snapshotBlock, /on private\.study_drafts/);
  assert.match(snapshotBlock, /on conflict \(session_id, payload_hash\) do nothing/);
  assert.match(snapshotBlock, /from private\.study_drafts as stored/);
  assert.match(snapshotBlock, /payload_hash = pg_catalog\.sha256/);
  assert.match(snapshotBlock, /incomplete_study_session_snapshots_append_only/);
  assert.match(snapshotBlock, /private\.reject_study_history_mutation\(\)/);
  assert.doesNotMatch(snapshotBlock, /\bif\s+case\b/i);
  assert.doesNotMatch(snapshotBlock, /\bdelete\s+from\s+private\.study_drafts\b/i);
  assert.doesNotMatch(snapshotBlock, /\bupdate\s+private\.study_drafts\b/i);

  assert.match(rpcBlock, /security definer/);
  assert.match(rpcBlock, /private\.is_study_admin\(\) is not true/);
  assert.match(rpcBlock, /not exists \([\s\S]*from public\.study_sessions as final_session/);
  assert.match(rpcBlock, /'incompleteStage', case/);
  assert.match(rpcBlock, /'awaiting-sleep-start'/);
  assert.match(rpcBlock, /'awaiting-morning-return'/);
  assert.match(rpcBlock, /'awaiting-morning-questionnaire'/);
  assert.match(rpcBlock, /'record', latest\.payload/);
  assert.match(rpcBlock, /'firstSavedAt', latest\.first_saved_at/);
  assert.match(rpcBlock, /'latestSavedAt', latest\.latest_saved_at/);
  assert.match(rpcBlock, /'snapshotCount', latest\.snapshot_count/);
  assert.match(
    migration,
    /grant execute on function public\.admin_list_incomplete_study_sessions_v5\(integer, integer\)\s+to authenticated;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.admin_list_incomplete_study_sessions_v5\(integer, integer\)\s+to anon;/,
  );
});

test("v5 documentation preserves historical rows while describing dark-prefix carryover", async () => {
  const [readme, buildLog, setup] = await Promise.all([
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../BUILD_LOG.md", import.meta.url), "utf8"),
    readFile(new URL("../SUPABASE_SETUP.md", import.meta.url), "utf8"),
  ]);
  const documentation = `${readme}\n${buildLog}\n${setup}`;

  assert.match(readme, /历史 v4 中从位置 1 开始、连续完成的暗色前缀/);
  assert.match(buildLog, /只读的连续前缀承接规则/);
  assert.match(setup, /completed contiguous v4 dim-red\/dim-blue prefix/);
  assert.match(readme, /v4 的亮蓝和亮红永远不会映射/);
  assert.match(buildLog, /旧 v4 的第三次亮蓝和第四次亮红绝不映射/);
  assert.match(setup, /v4 bright blue\/red never carry/);
  assert.match(readme, /不会修改、复制、重新标注或重新保存任何 v4 payload/);
  assert.match(buildLog, /承接只在查询当前进度时计算/);
  assert.match(setup, /This is a read-time progress calculation/);
  assert.doesNotMatch(documentation, /v5 进度独立从 0\/5 开始/);
  assert.doesNotMatch(documentation, /Only completed schema-v5 sessions advance/);
  assert.doesNotMatch(
    documentation,
    /Existing v4 sessions remain visible history but intentionally do not count/,
  );
});
