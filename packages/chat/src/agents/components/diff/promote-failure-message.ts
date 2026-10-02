// The sentence a refused "Promote this version to current" click shows.
//
// `agx_promote_version` answers a caller who may not edit the agent with a
// specific refusal (`agent_access_denied: no access to that agent`, 42501).
// The click handler used to swallow it and say only "Failed to promote
// version", so a person (or an agent testing as admin@admin.com) could not tell
// a refused permission from a broken path. The reason the server gave is the
// reason shown.

const GENERIC = "Failed to promote version";

export function promoteFailureMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message ?? "")
        : typeof err === "string"
          ? err
          : "";
  const reason = raw.trim();
  return reason ? `${GENERIC}: ${reason}` : GENERIC;
}
