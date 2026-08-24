/** Matches `MasterworkBuildRequest.deliverable` in aidream's build API. */
export const MASTERWORK_DELIVERABLE_MAX_LENGTH = 500;

export function buildDeliverableValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function isBuildDeliverableValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= MASTERWORK_DELIVERABLE_MAX_LENGTH;
}
