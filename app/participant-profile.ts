const RECOVERY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_CODE_PATTERN = /^[A-Z2-7]{20}$/;
const PROFILE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_PROFILE_STORAGE_KEY = "sleep-light-study:participant-profiles:v1";
const MAX_LOCAL_PROFILES = 20;

export type ParticipantProfile = {
  profileId: string;
  displayName: string;
  createdAt: string;
  lastAccessedAt: string;
};

export type LocalParticipantProfile = ParticipantProfile & {
  recoveryCode: string;
};

type LocalProfileEnvelope = {
  storageVersion: 1;
  activeProfileId: string;
  profiles: LocalParticipantProfile[];
};

export function normalizeParticipantName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function participantNameKey(value: string) {
  return normalizeParticipantName(value).toLowerCase();
}

export function isValidParticipantName(value: string) {
  const collapsed = normalizeParticipantName(value);
  const key = participantNameKey(collapsed);
  const characterCount = Array.from(collapsed).length;
  return (
    characterCount >= 1 &&
    characterCount <= 80 &&
    !/[\u0000-\u0008\u000e-\u001f\u007f]/u.test(value) &&
    key !== "admin" &&
    key !== "test"
  );
}

export function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[\s-]+/gu, "");
}

export function isValidRecoveryCode(value: string) {
  return RECOVERY_CODE_PATTERN.test(normalizeRecoveryCode(value));
}

export function generateParticipantRecoveryCode() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure random-number generation is unavailable in this browser.");
  }
  const randomBytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, (value) => RECOVERY_ALPHABET[value & 31]).join("");
}

/**
 * The raw recovery code stays in the participant's browser. Only this proof is
 * sent to the API, and the database stores a second SHA-256 hash of the proof.
 */
export async function createRecoveryProof(recoveryCode: string) {
  const normalized = normalizeRecoveryCode(recoveryCode);
  if (!RECOVERY_CODE_PATTERN.test(normalized)) {
    throw new Error("The recovery code must contain 20 base32 characters.");
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure recovery-code hashing is unavailable in this browser.");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function isParticipantProfile(value: unknown): value is ParticipantProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.profileId === "string" &&
    PROFILE_ID_PATTERN.test(profile.profileId) &&
    typeof profile.displayName === "string" &&
    profile.displayName === normalizeParticipantName(profile.displayName) &&
    isValidParticipantName(profile.displayName) &&
    typeof profile.createdAt === "string" &&
    !Number.isNaN(Date.parse(profile.createdAt)) &&
    typeof profile.lastAccessedAt === "string" &&
    !Number.isNaN(Date.parse(profile.lastAccessedAt))
  );
}

function isLocalParticipantProfile(value: unknown): value is LocalParticipantProfile {
  if (!isParticipantProfile(value)) return false;
  const profile = value as LocalParticipantProfile;
  return isValidRecoveryCode(profile.recoveryCode);
}

function readLocalProfileEnvelope(): LocalProfileEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const envelope = value as Record<string, unknown>;
    if (
      envelope.storageVersion !== 1 ||
      typeof envelope.activeProfileId !== "string" ||
      !PROFILE_ID_PATTERN.test(envelope.activeProfileId) ||
      !Array.isArray(envelope.profiles) ||
      envelope.profiles.length > MAX_LOCAL_PROFILES ||
      !envelope.profiles.every(isLocalParticipantProfile)
    ) {
      return null;
    }
    const profiles = envelope.profiles as LocalParticipantProfile[];
    if (
      new Set(profiles.map((profile) => profile.profileId)).size !== profiles.length ||
      new Set(profiles.map((profile) => participantNameKey(profile.displayName))).size !== profiles.length ||
      !profiles.some((profile) => profile.profileId === envelope.activeProfileId)
    ) {
      return null;
    }
    return {
      storageVersion: 1,
      activeProfileId: envelope.activeProfileId,
      profiles,
    };
  } catch {
    return null;
  }
}

export function loadLocalParticipantProfiles() {
  return readLocalProfileEnvelope()?.profiles ?? [];
}

export function loadLocalParticipantProfile(displayName?: string) {
  const envelope = readLocalProfileEnvelope();
  if (!envelope) return null;
  if (displayName !== undefined) {
    const key = participantNameKey(displayName);
    return envelope.profiles.find((profile) => participantNameKey(profile.displayName) === key) ?? null;
  }
  return envelope.profiles.find((profile) => profile.profileId === envelope.activeProfileId) ?? null;
}

export function rememberLocalParticipantProfile(profile: LocalParticipantProfile) {
  if (typeof window === "undefined" || !isLocalParticipantProfile(profile)) return false;
  const canonicalProfile: LocalParticipantProfile = {
    ...profile,
    displayName: normalizeParticipantName(profile.displayName),
    recoveryCode: normalizeRecoveryCode(profile.recoveryCode),
  };
  const current = readLocalProfileEnvelope()?.profiles ?? [];
  const key = participantNameKey(canonicalProfile.displayName);
  const profiles = [
    canonicalProfile,
    ...current.filter(
      (item) => item.profileId !== canonicalProfile.profileId && participantNameKey(item.displayName) !== key,
    ),
  ].slice(0, MAX_LOCAL_PROFILES);
  try {
    window.localStorage.setItem(
      LOCAL_PROFILE_STORAGE_KEY,
      JSON.stringify({ storageVersion: 1, activeProfileId: canonicalProfile.profileId, profiles }),
    );
    return true;
  } catch {
    return false;
  }
}

export function forgetLocalParticipantProfile(profileId?: string) {
  if (typeof window === "undefined") return false;
  try {
    const envelope = readLocalProfileEnvelope();
    if (!envelope || profileId === undefined) {
      window.localStorage.removeItem(LOCAL_PROFILE_STORAGE_KEY);
      return true;
    }
    const profiles = envelope.profiles.filter((profile) => profile.profileId !== profileId);
    if (profiles.length === 0) {
      window.localStorage.removeItem(LOCAL_PROFILE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        LOCAL_PROFILE_STORAGE_KEY,
        JSON.stringify({ storageVersion: 1, activeProfileId: profiles[0].profileId, profiles }),
      );
    }
    return true;
  } catch {
    return false;
  }
}
