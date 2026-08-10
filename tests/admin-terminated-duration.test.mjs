import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatTerminatedExposureSummary } from "../app/admin-session-summary.ts";

test("terminated admin summaries show active exposure, planned time, percentage, and pause exclusion", () => {
  assert.equal(
    formatTerminatedExposureSummary(123_400, 300_000, "en"),
    "Active exposure 2:03.4 / 5:00.0 (41.1%; pauses excluded)",
  );
  assert.equal(
    formatTerminatedExposureSummary(123_400, 300_000, "zh"),
    "有效暴露 2:03.4 / 5:00.0（41.1%；不含暂停）",
  );
  assert.equal(
    formatTerminatedExposureSummary(0, 300_000, "zh"),
    "有效暴露 0:00.0 / 5:00.0（0.0%；不含暂停）",
  );
});

test("legacy normal-sleep controls are not described as zero-second screen exposure", () => {
  assert.equal(
    formatTerminatedExposureSummary(0, 0, "en"),
    "No screen exposure (legacy normal-sleep control)",
  );
  assert.equal(
    formatTerminatedExposureSummary(0, 0, "zh"),
    "无屏幕暴露（旧版正常睡眠对照）",
  );
});

test("the compact admin status binds terminated rows to the stored active duration", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const details = await readFile(new URL("../app/admin-session-details.tsx", import.meta.url), "utf8");

  assert.match(page, /record\.status === "terminated"[\s\S]*formatTerminatedExposureSummary\([\s\S]*record\.actualDurationMs,[\s\S]*record\.plannedDurationMs,[\s\S]*language/);
  assert.match(details, /Active exposure duration \(pauses excluded\)/);
  assert.match(details, /有效暴露时长（不含暂停）/);
});
