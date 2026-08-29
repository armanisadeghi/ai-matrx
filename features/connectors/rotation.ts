export interface ConnectorRotationState {
  eligibleSignature: string;
  remainingIds: string[];
  lastSelectedIds: string[];
}

export interface ConnectorRotationResult {
  selectedIds: string[];
  state: ConnectorRotationState;
}

function uniqueIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids));
}

function shuffle(ids: readonly string[], random: () => number): string[] {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [
      result[swapIndex] as string,
      result[index] as string,
    ];
  }
  return result;
}

/**
 * Draw from a randomized bag without replacement. Every eligible connector is
 * shown once before a new bag starts, and cycle boundaries defer the previous
 * visit's items so consecutive visits do not overlap when the pool permits.
 */
export function drawConnectorRotation(
  eligibleIds: readonly string[],
  previous: ConnectorRotationState | null,
  count = 3,
  random: () => number = Math.random,
): ConnectorRotationResult {
  const eligible = uniqueIds(eligibleIds);
  const eligibleSet = new Set(eligible);
  const eligibleSignature = [...eligible].sort().join("|");

  if (eligible.length <= count) {
    return {
      selectedIds: shuffle(eligible, random),
      state: {
        eligibleSignature,
        remainingIds: [],
        lastSelectedIds: [...eligible],
      },
    };
  }

  const stateMatches = previous?.eligibleSignature === eligibleSignature;
  const priorSelection = stateMatches
    ? previous.lastSelectedIds.filter((id) => eligibleSet.has(id))
    : [];
  const remaining = stateMatches
    ? previous.remainingIds.filter((id) => eligibleSet.has(id))
    : [];

  const selectedIds = remaining.slice(0, count);
  let nextRemaining = remaining.slice(count);

  if (selectedIds.length < count) {
    const deferred = new Set([...priorSelection, ...selectedIds]);
    const freshBag = shuffle(eligible, random);
    const preferred = freshBag.filter((id) => !deferred.has(id));
    const deferredIds = freshBag.filter((id) => deferred.has(id));
    const nextBag = [...preferred, ...deferredIds];
    const needed = count - selectedIds.length;
    selectedIds.push(...nextBag.slice(0, needed));
    nextRemaining = nextBag.slice(needed);
  }

  return {
    selectedIds,
    state: {
      eligibleSignature,
      remainingIds: nextRemaining,
      lastSelectedIds: selectedIds,
    },
  };
}

export function parseConnectorRotationState(
  value: string | null,
): ConnectorRotationState | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("eligibleSignature" in parsed) ||
      !("remainingIds" in parsed) ||
      !("lastSelectedIds" in parsed) ||
      typeof parsed.eligibleSignature !== "string" ||
      !Array.isArray(parsed.remainingIds) ||
      !parsed.remainingIds.every((id) => typeof id === "string") ||
      !Array.isArray(parsed.lastSelectedIds) ||
      !parsed.lastSelectedIds.every((id) => typeof id === "string")
    ) {
      return null;
    }
    return {
      eligibleSignature: parsed.eligibleSignature,
      remainingIds: parsed.remainingIds,
      lastSelectedIds: parsed.lastSelectedIds,
    };
  } catch {
    return null;
  }
}
