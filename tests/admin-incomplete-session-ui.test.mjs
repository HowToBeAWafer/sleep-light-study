import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAwaitingMorningQuestionnaire } from "../app/admin-session-groups.ts";

const savedEveningDraft = {
  schemaVersion: 5,
  status: "active",
  exposureStatus: "completed",
  postExposureSurvey: { sleepinessKss: 7 },
  morningSurvey: null,
};

test("recognizes a saved evening-only v4/v5 record as awaiting the morning questionnaire", () => {
  assert.equal(isAwaitingMorningQuestionnaire(savedEveningDraft), true);
  assert.equal(
    isAwaitingMorningQuestionnaire({ ...savedEveningDraft, schemaVersion: 4 }),
    true,
  );
});

test("never labels final or earlier active records as awaiting the morning questionnaire", () => {
  assert.equal(
    isAwaitingMorningQuestionnaire({ ...savedEveningDraft, status: "completed" }),
    false,
  );
  assert.equal(
    isAwaitingMorningQuestionnaire({ ...savedEveningDraft, exposureStatus: "in-progress" }),
    false,
  );
  assert.equal(
    isAwaitingMorningQuestionnaire({ ...savedEveningDraft, postExposureSurvey: null }),
    false,
  );
  assert.equal(
    isAwaitingMorningQuestionnaire({ ...savedEveningDraft, morningSurvey: { alertness: 4 } }),
    false,
  );
});

test("admin UI lists incomplete nights separately without calling them completed", async () => {
  const [page, details] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-session-details.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /fetchAdminIncompleteOvernightDrafts/);
  assert.match(page, /session\.persistence === "incomplete-night"/);
  assert.match(page, /record\.status === "completed"/);
  assert.match(page, /Awaiting morning questionnaire/);
  assert.match(details, /it is not a completed session and does not advance/);
  assert.match(details, /待完成晨间问卷/);
});
