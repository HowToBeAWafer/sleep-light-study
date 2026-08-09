import { normalizeParticipantName } from "./consistency-review.ts";

type ParticipantSession = {
  record: {
    participantId: string;
  };
};

type OvernightRecordMilestones = {
  schemaVersion: number;
  status: string;
  exposureStatus?: string;
  postExposureSurvey?: unknown;
  morningSurvey?: unknown;
};

/**
 * A protected overnight draft becomes scientifically useful to the
 * administrator after the full exposure and immediate sleepiness measure have
 * been saved. It remains an unfinished record until the next-morning
 * questionnaire is submitted.
 */
export function isAwaitingMorningQuestionnaire(
  record: OvernightRecordMilestones,
) {
  return (
    (record.schemaVersion === 4 || record.schemaVersion === 5) &&
    record.status === "active" &&
    record.exposureStatus === "completed" &&
    record.postExposureSurvey !== null &&
    record.postExposureSurvey !== undefined &&
    record.morningSurvey === null
  );
}

export type AdminParticipantSessionGroup<T extends ParticipantSession> = {
  /** Stable key shared by case, width, and whitespace variants of one study name. */
  normalizedParticipantName: string;
  /** First encountered spelling, cleaned for display without forcing lowercase. */
  displayName: string;
  /** Input order is retained so the dashboard's existing newest-first order survives grouping. */
  sessions: T[];
};

function displayParticipantName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function groupAdminSessionsByParticipant<T extends ParticipantSession>(
  sessions: readonly T[],
): AdminParticipantSessionGroup<T>[] {
  const groups = new Map<string, AdminParticipantSessionGroup<T>>();

  for (const session of sessions) {
    const normalizedParticipantName = normalizeParticipantName(session.record.participantId);
    const existing = groups.get(normalizedParticipantName);
    if (existing) {
      existing.sessions.push(session);
      continue;
    }
    groups.set(normalizedParticipantName, {
      normalizedParticipantName,
      displayName: displayParticipantName(session.record.participantId),
      sessions: [session],
    });
  }

  return [...groups.values()];
}
