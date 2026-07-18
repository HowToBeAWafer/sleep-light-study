import assert from "node:assert/strict";
import test from "node:test";
import {
  createRecoveryProof,
  generateParticipantRecoveryCode,
  isValidParticipantName,
  isValidRecoveryCode,
  normalizeParticipantName,
  normalizeRecoveryCode,
  participantNameKey,
} from "../app/participant-profile.ts";

test("study names use the same NFKC and whitespace rules as profile uniqueness", () => {
  assert.equal(normalizeParticipantName("  Ｓｌｅｅｐｙ\u00a0\tＦｏｘ  "), "Sleepy Fox");
  assert.equal(participantNameKey(" Sleepy   Fox "), "sleepy fox");
  assert.equal(isValidParticipantName("MoonRiver"), true);
  assert.equal(isValidParticipantName("test"), false);
  assert.equal(isValidParticipantName(" ADMIN "), false);
  assert.equal(isValidParticipantName(""), false);
  assert.equal(isValidParticipantName("x".repeat(81)), false);
});

test("recovery codes are normalized, validated, random, and hashed before storage proof", async () => {
  const generated = generateParticipantRecoveryCode();
  assert.equal(generated.length, 20);
  assert.equal(isValidRecoveryCode(generated), true);
  assert.equal(normalizeRecoveryCode("abcde-fghij klmno-pqrst"), "ABCDEFGHIJKLMNOPQRST");
  assert.equal(isValidRecoveryCode("abcde-fghij klmno-pqrst"), true);
  assert.equal(isValidRecoveryCode("contains-0-or-1"), false);

  const proof = await createRecoveryProof("ABCDEFGHIJKLMNOPQRST");
  assert.match(proof, /^[0-9a-f]{64}$/);
  assert.notEqual(proof, "ABCDEFGHIJKLMNOPQRST");
});
