/**
 * 🚨 A MANDATE KEY IS A TYPE, NOT A STRING.
 *
 * `@ai-matrx/agents/mandates` ships the generated union (`MandateKey`) and the
 * branded DB-authored one (`DynamicMandateKey`, produced only by
 * `mandateKeyOfApp` / `mandateKeyOfShortcut`). Every carrier in this repo —
 * `useMandate`, `useMandateSet`, `useMandateChain`, `resolveMandate`,
 * `launchMandate`, the ambient ladder — types its key parameter with one of
 * them, so a wrong or stale key fails `pnpm type-check` instead of failing at
 * run time as a 404 nobody sees.
 *
 * V-L6a (2026-09-17) found the whole carrier chain typed plain `string`: the
 * import adoption was real but nothing in the compiler stopped a bad key. A
 * carrier that declares `mandateKey: string` is therefore itself a finding —
 * `pnpm check:mandate-keys` reports it (rule: string-typed carrier parameter).
 * Never widen one back to `string` to make an error go away; type the SOURCE
 * of the key instead, or narrow a genuinely-unknown string at the boundary
 * with `isMandateKey` / `assertMandateKey`.
 */
import type { DynamicMandateKey, MandateKey } from "@ai-matrx/agents/mandates";

export type { DynamicMandateKey, MandateKey };

/**
 * What a carrier accepts when a DB-authored key (`app.*` / `shortcut.*`) is
 * legitimate there as well as a declared one. Carriers that only ever run a
 * declared job stay `MandateKey`.
 */
export type AnyMandateKey = MandateKey | DynamicMandateKey;

/**
 * A DB-AUTHORED KEY THE GENERATED UNION CANNOT CARRY — the ONE typed door for
 * a literal that `scripts/mandate-keys-allowlist.json` already governs.
 *
 * Two honest cases, both already written down with a reason in that allowlist:
 * an `origin='user'` mandate somebody created in the console (no generator
 * built from code declarations can ever contain it), and a key aidream has
 * declared but the installed `@ai-matrx/agents` predates. The allowlist is the
 * audit; this is how the same literal reaches a typed carrier without widening
 * the carrier back to `string` — and because the parameter is a literal type,
 * the key still appears verbatim at the call site for `check:mandate-keys` and
 * for a human reading the diff.
 *
 * 🚨 NOT an escape hatch for a declared key. A key in `MANDATE_KEYS` goes
 * through `MANDATE_KEYS.<id>`; using this for one hides a real rename from the
 * compiler. When the package publishes a key listed here, delete the call.
 */
export function dbAuthoredMandateKey<K extends string>(
  key: K,
): DynamicMandateKey {
  return key as unknown as DynamicMandateKey;
}

/**
 * A KEY THAT CAME OUT OF THE DATABASE — the typed boundary for a `mandate_key`
 * column the platform itself wrote (an agent app's own mandate, a shortcut's,
 * a stored binding row).
 *
 * The distinction that matters: the code did not CHOOSE this key, so there is
 * nothing for the compiler to check it against — the authority is the row. Use
 * this at that one boundary so the value enters the typed world named for what
 * it is, and everything downstream of it stays typed. Never use it on a key
 * this repo picked: that key belongs to `MANDATE_KEYS` and a cast would hide a
 * rename the compiler would otherwise have caught.
 *
 * For a key that crossed a wire and must be PROVEN declared (a URL segment, a
 * saved preference the user could have edited), use the package's `isMandateKey`
 * / `assertMandateKey` instead — they answer, this one only types.
 */
export function storedMandateKey(value: string): AnyMandateKey {
  return value as AnyMandateKey;
}

export interface MandateKeyParts {
  /** The feature/domain namespace before the first dot. */
  feature: string;
  /** The complete step name after the first dot; later dots are preserved. */
  mandate: string;
}

/** Split canonical `<feature>.<mandate>` identity without losing information. */
export function splitMandateKey(mandateKey: string): MandateKeyParts {
  const separator = mandateKey.indexOf(".");
  if (separator <= 0 || separator === mandateKey.length - 1) {
    return { feature: "(unscoped)", mandate: mandateKey };
  }
  return {
    feature: mandateKey.slice(0, separator),
    mandate: mandateKey.slice(separator + 1),
  };
}
