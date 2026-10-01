/**
 * Sandbox defaults — what an explicit "New sandbox" starts with.
 *
 * ONE home for the knob addresses and the translation from resolved knob
 * values to an orchestrator create payload. The values are scoped knobs
 * (`infrastructure.sandbox.defaults.*`, organization + user rungs; seeded by
 * `migrations/sandbox_defaults_01_new_sandbox_knobs.sql`) edited in
 * Settings › Devices & storage › Sandbox defaults. aidream's
 * `services/sandboxes/ensure_default_sandbox.py` reads the same keys.
 *
 * Until 2026-10-01 these lived in the userPreferences `sandbox` blob. Its `env`
 * map is deliberately NOT carried: a sandbox's environment comes only from the
 * person's Vault (aidream vault Phase 5), and sending a caller `config.env`
 * persists values at rest in `sandbox_instances.config`.
 */

import { ensureEffectiveKnob, type KnobAddress } from "@/lib/scoped-config/effectiveKnobs";

export const SANDBOX_DEFAULTS_FEATURE = "infrastructure.sandbox.defaults";

export const SANDBOX_DEFAULT_KEYS = [
  "template",
  "tier",
  "auto_stop",
  "git_repo",
  "git_branch",
  "auto_clone",
] as const;

export type SandboxDefaultKey = (typeof SANDBOX_DEFAULT_KEYS)[number];

export function sandboxDefaultKnob(key: SandboxDefaultKey): KnobAddress {
  return { feature: SANDBOX_DEFAULTS_FEATURE, key };
}

export function sandboxDefaultKnobKey(key: SandboxDefaultKey): string {
  return `${SANDBOX_DEFAULTS_FEATURE}.${key}`;
}

/** The orchestrator clones only http(s) URLs; SSH needs per-user keys it lacks. */
export function isCloneableGitUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export interface SandboxCreateDefaults {
  template?: string;
  tier?: "ec2" | "hosted";
  ttl_seconds?: number;
  labels: Record<string, string>;
}

/**
 * Resolved knob values → the create payload. A value the register does not
 * admit is left out (the service applies its own default) rather than sent.
 */
export function toSandboxCreateDefaults(
  values: Partial<Record<SandboxDefaultKey, unknown>>,
): SandboxCreateDefaults {
  const out: SandboxCreateDefaults = { labels: {} };
  if (typeof values.template === "string" && values.template) out.template = values.template;
  if (values.tier === "ec2" || values.tier === "hosted") out.tier = values.tier;
  if (typeof values.auto_stop === "string" && /^\d+$/.test(values.auto_stop)) {
    out.ttl_seconds = Number(values.auto_stop);
  }
  const repo = typeof values.git_repo === "string" ? values.git_repo.trim() : "";
  const branch = typeof values.git_branch === "string" ? values.git_branch.trim() : "";
  if (repo && isCloneableGitUrl(repo)) {
    out.labels.default_git_repo = repo;
    if (branch) out.labels.default_git_branch = branch;
    if (values.auto_clone === true) out.labels.auto_clone = "true";
  }
  return out;
}

/**
 * Resolve every sandbox default for this person in this organization from the
 * ONE knob snapshot (no per-key round trips). Rejects, naming the key, when a
 * key cannot be resolved — the caller decides whether to proceed without it.
 */
export async function resolveSandboxCreateDefaults(
  organizationId: string,
  userId: string | null,
): Promise<SandboxCreateDefaults> {
  const entries = await Promise.all(
    SANDBOX_DEFAULT_KEYS.map(
      async (key) =>
        [key, await ensureEffectiveKnob(organizationId, userId, sandboxDefaultKnob(key))] as const,
    ),
  );
  return toSandboxCreateDefaults(Object.fromEntries(entries));
}
