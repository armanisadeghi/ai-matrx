/**
 * Decode a Kind Directive — THE one entry point on the client.
 *
 * `decodeDirective()` recognizes the shell (new OR, for stored content only,
 * the retired 4-key one), reads the slug, and derives the class + noun. A
 * caller only ever sees a parsed {@link DecodedDirective}, so nothing
 * downstream ever inspects a raw shell again.
 *
 * This is also the ONLY place the retired 4-key shell is understood. A legacy
 * shell is translated by `legacyShell.translateLegacyShell` and then follows
 * the identical path — same slug parse, same routing, same errors — with
 * `legacyShell: true` recorded for telemetry. There is no second decoder and no
 * fallback branch: the translation happens BEFORE any decision is made, so
 * every decision is made once.
 *
 * ITEM VALIDATION IS THE SERVER'S. The registered item models live in aidream
 * (`services/content_ir_directives/registry.py`) and validate on apply; a
 * second client-side copy of ~120 item models is exactly the drift this merge
 * exists to kill. The client parses identity, routes, and renders.
 *
 * Mirror of aidream `services/content_ir_directives/decode.py`.
 */

import {
  type DirectiveClass,
  type DirectiveSlug,
  KIND_KEY,
  isReservedDirectiveSlug,
  parseDirectiveSlug,
} from "./grammar";
import { isLegacyShell, translateLegacyShell } from "./legacyShell";

/**
 * A well-formed-looking directive that cannot be honored (a malformed slug, or
 * a retired shell that does not map onto the grammar). Never thrown for
 * "this isn't a directive" — that is `null`.
 */
export class DirectiveDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectiveDecodeError";
  }
}

export interface DecodedDirective {
  /** The parsed slug — class, noun, capability and the position law. */
  readonly parsed: DirectiveSlug;
  readonly slug: string;
  readonly directiveClass: DirectiveClass;
  readonly noun: string;
  readonly items: Record<string, unknown>[];
  /** The two-key shell, normalized — what a confirm POST round-trips. */
  readonly shell: Record<string, unknown>;
  /** True when this arrived in the retired 4-key shell and was translated. */
  readonly legacyShell: boolean;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * A typed directive, or `null` when `value` is not a directive at all. Throws
 * {@link DirectiveDecodeError} when it IS one but cannot be honored.
 */
export function decodeDirective(value: unknown): DecodedDirective | null {
  let obj = asObject(value);
  if (obj === null) return null;

  let legacy = false;
  if (isLegacyShell(obj)) {
    const translated = translateLegacyShell(obj);
    if (translated === null) {
      throw new DirectiveDecodeError(
        `a retired 4-key shell with kind=${JSON.stringify(obj.kind)} type=${JSON.stringify(obj.type)} does not map onto the Kind Directives grammar. Emit the current shell: {"${KIND_KEY}": "directive_v1_<class>_<noun>", "items": [...]}.`,
      );
    }
    obj = translated;
    legacy = true;
  }

  const rawSlug = obj[KIND_KEY];
  if (!isReservedDirectiveSlug(rawSlug)) return null;

  const parsed = parseDirectiveSlug(rawSlug);
  if (parsed === null) {
    throw new DirectiveDecodeError(
      `malformed directive slug ${JSON.stringify(rawSlug)} — it claims the reserved "directive_v" namespace but does not parse as directive_v<version>_<class>_<noun>.`,
    );
  }

  const rawItems = obj.items;
  const items = Array.isArray(rawItems)
    ? rawItems.filter((i): i is Record<string, unknown> => asObject(i) !== null)
    : [];

  return {
    parsed,
    slug: parsed.slug,
    directiveClass: parsed.directiveClass,
    noun: parsed.noun,
    items,
    shell: { [KIND_KEY]: parsed.slug, items },
    legacyShell: legacy,
  };
}

/**
 * The forgiving read used at render seams: `decodeDirective`, but a directive
 * that cannot be honored comes back as `null` instead of throwing, after the
 * reason is handed to `onError`. A render seam must never take a whole message
 * block down over one bad fence — but it must never swallow the reason either.
 */
export function tryDecodeDirective(
  value: unknown,
  onError?: (message: string) => void,
): DecodedDirective | null {
  try {
    return decodeDirective(value);
  } catch (error) {
    onError?.(
      error instanceof Error ? error.message : "directive decode failed",
    );
    return null;
  }
}
