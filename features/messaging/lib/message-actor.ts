export type MessageActorKind = "agent" | "human" | null;

export interface MessageActorPresentation {
  kind: MessageActorKind;
  label: string;
  usesSenderProfile: boolean;
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Resolves the effective author of an agent-mediated DM. The authenticated
 * sender remains the audit principal, but must never donate their name or
 * avatar to an agent that acted through their session.
 */
export function messageActorPresentation(
  metadata: Record<string, unknown>,
  senderLabel: string,
): MessageActorPresentation {
  const actorKind = metadataString(metadata, "actor_kind");
  const actorLabel = metadataString(metadata, "actor_label");

  if (actorKind === "agent") {
    const codexTask = actorLabel?.match(
      /^agent-review-(?:first-pass|backlog):(.+)$/,
    )?.[1];
    return {
      kind: "agent",
      label: codexTask
        ? `Codex · ${codexTask}`
        : `Agent · ${actorLabel ?? "Unknown"}`,
      usesSenderProfile: false,
    };
  }

  if (actorKind === "human") {
    return {
      kind: "human",
      label: actorLabel ?? senderLabel,
      usesSenderProfile: true,
    };
  }

  return { kind: null, label: senderLabel, usesSenderProfile: true };
}
