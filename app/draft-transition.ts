import type { ParticipantProgress } from "./remote-storage.ts";
import type { StudySessionRecord } from "./session-record.ts";

/**
 * Decides whether an authenticated account draft belongs to an assignment that
 * the current protocol still permits. Historical completed rows are not part
 * of this decision and are never modified.
 *
 * Protocol-v4 positions 1 and 2 remain recoverable only while the corresponding
 * dim-red or dim-blue position is still the account's next assignment. Later
 * v4 drafts cannot cross the newly inserted v5 black-control position.
 */
export function shouldRetireDraftForAssignedProgress(
  draft: StudySessionRecord,
  progress: ParticipantProgress,
) {
  if (draft.schemaVersion === 3) return false;
  if (progress.nextSequencePosition === null || progress.nextConditionId === null) return true;

  if (draft.schemaVersion === 5) {
    return (
      draft.sequencePosition !== progress.nextSequencePosition ||
      draft.conditionId !== progress.nextConditionId
    );
  }

  return !(
    (draft.sequencePosition === 1 &&
      draft.conditionId === "dim-red" &&
      progress.nextSequencePosition === 1 &&
      progress.nextConditionId === "dim-red") ||
    (draft.sequencePosition === 2 &&
      draft.conditionId === "dim-blue" &&
      progress.nextSequencePosition === 2 &&
      progress.nextConditionId === "dim-blue")
  );
}
