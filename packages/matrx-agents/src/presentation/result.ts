/**
 * Creator-facing projection of an agent execution result.
 *
 * Provider reasoning blocks and their signatures are replay material, not
 * workflow data. The execution engine must retain them so a later turn can be
 * continued correctly, but no result renderer, JSON tab, clipboard export, or
 * Content IR classifier should receive them as displayable values.
 *
 * This is a pure copy-on-write projection: values without private material
 * keep their original reference, while affected branches are cloned. Never
 * feed the projected value back into execution or persistence.
 */

const PRIVATE_REASONING_TYPES: ReadonlySet<string> = new Set([
  "thinking",
  "redacted_thinking",
  "reasoning",
]);

const PRIVATE_PROVIDER_KEYS: ReadonlySet<string> = new Set([
  "thought_signature",
  "thoughtSignature",
  "google_thought_signature",
  "anthropic_signature",
  "encrypted_content",
  "signature_encoding",
]);

const SIGNATURE_PROVIDERS: ReadonlySet<string> = new Set([
  "anthropic",
  "google",
  "openai",
]);

const OPAQUE_SIGNATURE_MIN_LENGTH = 200;
const OMIT = Symbol("omit-provider-private-value");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrivateReasoningBlock(value: Record<string, unknown>): boolean {
  return (
    typeof value.type === "string" &&
    PRIVATE_REASONING_TYPES.has(value.type.toLowerCase())
  );
}

function isPrivateProviderKey(
  key: string,
  value: unknown,
  parent: Record<string, unknown>,
): boolean {
  if (PRIVATE_PROVIDER_KEYS.has(key)) return true;
  if (key !== "signature") return false;

  const provider =
    typeof parent.provider === "string" ? parent.provider.toLowerCase() : "";
  return (
    "signature_encoding" in parent ||
    SIGNATURE_PROVIDERS.has(provider) ||
    (typeof value === "string" && value.length >= OPAQUE_SIGNATURE_MIN_LENGTH)
  );
}

function project(value: unknown): unknown | typeof OMIT {
  if (Array.isArray(value)) {
    let changed = false;
    const output: unknown[] = [];
    for (const item of value) {
      const projected = project(item);
      if (projected === OMIT) {
        changed = true;
        continue;
      }
      if (projected !== item) changed = true;
      output.push(projected);
    }
    return changed ? output : value;
  }

  if (!isRecord(value)) return value;
  if (isPrivateReasoningBlock(value)) return OMIT;

  let changed = false;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isPrivateProviderKey(key, child, value)) {
      changed = true;
      continue;
    }
    const projected = project(child);
    if (projected === OMIT) {
      changed = true;
      continue;
    }
    if (projected !== child) changed = true;
    output[key] = projected;
  }
  return changed ? output : value;
}

/**
 * Remove provider-private reasoning material from a value crossing a
 * Creator-facing presentation or export boundary.
 */
export function projectAgentResultForDisplay(value: unknown): unknown {
  const projected = project(value);
  return projected === OMIT ? null : projected;
}
