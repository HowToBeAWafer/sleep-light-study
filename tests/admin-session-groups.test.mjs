import test from "node:test";
import assert from "node:assert/strict";
import { groupAdminSessionsByParticipant } from "../app/admin-session-groups.ts";

function remoteSession(participantId, sessionId) {
  return { record: { participantId, sessionId }, createdAt: sessionId };
}

test("admin session grouping collapses normalized study-name variants", () => {
  const groups = groupAdminSessionsByParticipant([
    remoteSession("  Night\u3000Owl  ", "newest"),
    remoteSession("Second Person", "second"),
    remoteSession("night owl", "oldest"),
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].normalizedParticipantName, "night owl");
  assert.equal(groups[0].displayName, "Night Owl");
  assert.deepEqual(groups[0].sessions.map(({ record }) => record.sessionId), ["newest", "oldest"]);
});

test("admin session grouping preserves participant and session input order", () => {
  const groups = groupAdminSessionsByParticipant([
    remoteSession("Beta", "beta-new"),
    remoteSession("Alpha", "alpha-new"),
    remoteSession("BETA", "beta-old"),
    remoteSession("Alpha", "alpha-old"),
  ]);

  assert.deepEqual(groups.map((group) => group.displayName), ["Beta", "Alpha"]);
  assert.deepEqual(groups[0].sessions.map(({ record }) => record.sessionId), ["beta-new", "beta-old"]);
  assert.deepEqual(groups[1].sessions.map(({ record }) => record.sessionId), ["alpha-new", "alpha-old"]);
});
