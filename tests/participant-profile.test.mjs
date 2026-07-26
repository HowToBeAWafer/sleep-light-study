import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import test from "node:test";
import {
  createParticipantPasswordProof,
  createRecoveryProof,
  generateParticipantRecoveryCode,
  getParticipantCredentialProof,
  isValidParticipantPassword,
  isValidParticipantName,
  isValidRecoveryCode,
  loadLocalParticipantProfile,
  loadLocalParticipantProfiles,
  normalizeParticipantName,
  normalizeRecoveryCode,
  participantNameKey,
  rememberLocalParticipantProfile,
} from "../app/participant-profile.ts";

const LEGACY_STORAGE_KEY = "sleep-light-study:participant-profiles:v1";
const STORAGE_KEY = "sleep-light-study:participant-profiles:v2";

function makeProfile(overrides = {}) {
  return {
    profileId: "123e4567-e89b-42d3-a456-426614174000",
    displayName: "Sleepy Fox",
    createdAt: "2026-07-18T00:00:00.000Z",
    lastAccessedAt: "2026-07-18T00:01:00.000Z",
    ...overrides,
  };
}

async function withLocalStorage(run) {
  const values = new Map();
  const localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage };
  try {
    return await run({ localStorage, values });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}

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

test("participant passwords accept 8 through 128 Unicode characters", () => {
  assert.equal(isValidParticipantPassword("1234567"), false);
  assert.equal(isValidParticipantPassword("12345678"), true);
  assert.equal(isValidParticipantPassword("x".repeat(128)), true);
  assert.equal(isValidParticipantPassword("x".repeat(129)), false);
  assert.equal(isValidParticipantPassword("🌙".repeat(8)), true);
});

test("password proofs use the canonical name as a domain-separated PBKDF2-SHA256 salt", async () => {
  const password = "night light password";
  const proof = await createParticipantPasswordProof("  Ｓｌｅｅｐｙ   Ｆｏｘ ", password);
  const canonicalProof = await createParticipantPasswordProof("sleepy fox", password);
  const expected = pbkdf2Sync(
    password,
    "sleep-light-study:participant-password:v1\0sleepy fox",
    600_000,
    32,
    "sha256",
  ).toString("hex");

  assert.match(proof, /^[0-9a-f]{64}$/);
  assert.equal(proof, canonicalProof);
  assert.equal(proof, expected);
  assert.notEqual(
    proof,
    await createParticipantPasswordProof("another participant", password),
  );
  assert.notEqual(
    proof,
    await createParticipantPasswordProof("sleepy fox", `${password}!`),
  );
  await assert.rejects(
    createParticipantPasswordProof("sleepy fox", "short"),
    /between 8 and 128 characters/,
  );
});

test("credential proof helper supports password proofs and legacy recovery codes", async () => {
  const passwordProof = await createParticipantPasswordProof("Sleepy Fox", "a secure password");
  assert.equal(
    await getParticipantCredentialProof({ credentialProof: passwordProof.toUpperCase() }),
    passwordProof,
  );
  assert.equal(
    await getParticipantCredentialProof({ recoveryCode: "ABCDEFGHIJKLMNOPQRST" }),
    await createRecoveryProof("ABCDEFGHIJKLMNOPQRST"),
  );
  await assert.rejects(
    getParticipantCredentialProof({ credentialProof: "not-a-proof" }),
    /credential proof is not valid/,
  );
});

test("local storage v2 retains password proofs and reads legacy v1 recovery profiles", async () => {
  await withLocalStorage(async ({ localStorage, values }) => {
    const legacyProfile = makeProfile({ recoveryCode: "ABCDEFGHIJKLMNOPQRST" });
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({
      storageVersion: 1,
      activeProfileId: legacyProfile.profileId,
      profiles: [legacyProfile],
    }));

    assert.deepEqual(loadLocalParticipantProfile(), legacyProfile);

    const password = "this must never be stored";
    const credentialProof = await createParticipantPasswordProof("Moon River", password);
    const passwordProfile = makeProfile({
      profileId: "123e4567-e89b-42d3-a456-426614174001",
      displayName: "Moon River",
      credentialProof,
      password,
    });
    assert.equal(rememberLocalParticipantProfile(passwordProfile), true);

    const serialized = values.get(STORAGE_KEY);
    assert.equal(typeof serialized, "string");
    assert.equal(serialized.includes(password), false);
    assert.equal(values.has(LEGACY_STORAGE_KEY), false);
    const envelope = JSON.parse(serialized);
    assert.equal(envelope.storageVersion, 2);
    assert.equal(envelope.activeProfileId, passwordProfile.profileId);
    assert.equal(envelope.profiles[0].credentialProof, credentialProof);
    assert.equal("password" in envelope.profiles[0], false);
    assert.equal(envelope.profiles[1].recoveryCode, legacyProfile.recoveryCode);

    assert.equal(loadLocalParticipantProfile().profileId, passwordProfile.profileId);
    assert.equal(loadLocalParticipantProfile("sleepy fox").profileId, legacyProfile.profileId);
    assert.deepEqual(
      loadLocalParticipantProfiles().map((profile) => profile.profileId),
      [passwordProfile.profileId, legacyProfile.profileId],
    );
  });
});
