import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { shouldRetireDraftForAssignedProgress } from "../app/draft-transition.ts";

function progress(nextSequencePosition, nextConditionId) {
  return {
    nextSequencePosition,
    nextConditionId,
  };
}

test("a v4 bright-blue draft is retired when carried dim sessions make black control next", () => {
  const draft = {
    schemaVersion: 4,
    sequencePosition: 3,
    conditionId: "bright-blue",
  };

  assert.equal(
    shouldRetireDraftForAssignedProgress(draft, progress(3, "black-control")),
    true,
  );
  assert.equal(
    shouldRetireDraftForAssignedProgress(draft, progress(4, "bright-blue")),
    true,
    "a pre-black v4 bright-blue draft cannot be reused after the v5 black session",
  );
});

test("unfinished v4 dim-prefix sessions remain recoverable when they are still next", () => {
  assert.equal(
    shouldRetireDraftForAssignedProgress(
      { schemaVersion: 4, sequencePosition: 1, conditionId: "dim-red" },
      progress(1, "dim-red"),
    ),
    false,
  );
  assert.equal(
    shouldRetireDraftForAssignedProgress(
      { schemaVersion: 4, sequencePosition: 2, conditionId: "dim-blue" },
      progress(2, "dim-blue"),
    ),
    false,
  );
});

test("only the currently assigned v5 draft is resumed", () => {
  const blackControlDraft = {
    schemaVersion: 5,
    sequencePosition: 3,
    conditionId: "black-control",
  };
  assert.equal(
    shouldRetireDraftForAssignedProgress(blackControlDraft, progress(3, "black-control")),
    false,
  );
  assert.equal(
    shouldRetireDraftForAssignedProgress(blackControlDraft, progress(4, "bright-blue")),
    true,
  );
  assert.equal(
    shouldRetireDraftForAssignedProgress(blackControlDraft, progress(null, null)),
    true,
  );
});

test("v3 recovery drafts are outside the v4-to-v5 assignment transition", () => {
  assert.equal(
    shouldRetireDraftForAssignedProgress(
      { schemaVersion: 3, conditionId: "control" },
      progress(3, "black-control"),
    ),
    false,
  );
});

test("both account and automatic local restoration enforce the assignment check", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(
    page,
    /shouldRetireDraftForAssignedProgress\(remoteDraft, progress\)/,
  );
  assert.match(
    page,
    /participantProgressStatus !== "loaded"[\s\S]*shouldRetireDraftForAssignedProgress\(record, progress\)/,
  );
  assert.match(page, /retiredDraftSessionIdsRef\.current\.has\(record\.sessionId\)/);
  assert.match(
    page,
    /const remainingDraft = await loadParticipantStudyDraft\(profile\);[\s\S]*if \(remainingDraft\) \{[\s\S]*draft changed while it was being retired/,
    "a false deletion response is verified before a new session starts",
  );
  assert.match(
    page,
    /localStorage\.setItem\(OVERNIGHT_DRAFT_KEY, JSON\.stringify\(compatibleLocalFallback\)\)/,
    "a compatible browser draft remains recoverable when remote retirement fails",
  );
  assert.match(
    page,
    /await retireParticipantDraftSafely\(profile, remoteDraft\.sessionId\);[\s\S]*deleteLocalOvernightDraft\(remoteDraft\)/,
  );
});
