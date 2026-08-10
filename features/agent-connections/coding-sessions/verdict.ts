export type CodingSessionFidelityVerdict = {
  label: string;
  detail: string;
  tone: "native" | "mirror" | "unknown";
  nativeResumeClaimed: false;
};

/**
 * States only what the persisted fidelity proves. Runtime credentials,
 * workspace state, and writer-lease checks happen later, so this function
 * never claims that native resume is presently available.
 */
export function fidelityVerdict(
  fidelity: string,
): CodingSessionFidelityVerdict {
  if (fidelity === "event_mirror") {
    return {
      label: "Event mirror",
      detail:
        "Prompts, replies, and lifecycle events are stored and shareable. This is not a native provider resume; continuation uses an explicitly labeled seeded handoff.",
      tone: "mirror",
      nativeResumeClaimed: false,
    };
  }

  if (fidelity === "native") {
    return {
      label: "Native ledger",
      detail:
        "Exact provider entries are stored. Resume still requires the provider credential, matching workspace and runtime, complete raw ledger, and a valid writer lease.",
      tone: "native",
      nativeResumeClaimed: false,
    };
  }

  return {
    label: "Uncertified fidelity",
    detail:
      "AI Matrx has not certified this binding for native resume. It can be browsed as a canonical conversation only.",
    tone: "unknown",
    nativeResumeClaimed: false,
  };
}

export type BridgeReadHealth = {
  label: string;
  detail: string;
  tone: "healthy" | "waiting" | "stale" | "error";
};

export function formatSessionTimestamp(value: string): string {
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs)
    ? new Date(timestampMs).toLocaleString()
    : "Invalid timestamp";
}

export function bridgeReadHealth(
  lastSeenAt: string | null,
  readSucceeded: boolean | null,
  nowMs: number,
): BridgeReadHealth {
  if (readSucceeded === null) {
    return {
      label: "Checking storage",
      detail: "AI Matrx is checking your private coding-session store.",
      tone: "waiting",
    };
  }

  if (!readSucceeded) {
    return {
      label: "Status unavailable",
      detail: "AI Matrx could not read your coding-session bindings.",
      tone: "error",
    };
  }

  if (!lastSeenAt) {
    return {
      label: "Storage reachable",
      detail:
        "The private session store is reachable, but no coding platform has delivered a session yet.",
      tone: "waiting",
    };
  }

  const lastSeenMs = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) {
    return {
      label: "Timestamp invalid",
      detail:
        "A session exists, but its last-seen time is invalid. Native resume is not claimed.",
      tone: "error",
    };
  }

  const ageMs = Math.max(0, nowMs - lastSeenMs);
  if (ageMs <= 15 * 60 * 1_000) {
    return {
      label: "Receiving sessions",
      detail:
        "AI Matrx received coding-session activity in the last 15 minutes.",
      tone: "healthy",
    };
  }

  return {
    label: "No recent activity",
    detail:
      "The bridge has stored sessions, but none has reported activity in the last 15 minutes.",
    tone: "stale",
  };
}
