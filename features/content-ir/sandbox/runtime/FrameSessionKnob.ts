/**
 * Frame stand-in for `@/lib/scoped-config/sessionKnob`.
 *
 * A session knob is resolved from the host's Redux store and a Supabase RPC —
 * neither exists in the frame (`connect-src 'none'`, no app store). Every knob
 * here answers `undefined`, which the knob contract already defines as
 * "no answer yet — use your own default" (e.g. a single Copy click writes
 * markdown, the copy knob's default). The host page keeps the real knobs.
 */
type KnobRef = string | { readonly feature: string; readonly key: string };

export function sessionKnobPrincipals(): { organizationId: string | null; userId: string | null } {
  return { organizationId: null, userId: null };
}

export function getSessionKnob(_fullKey: KnobRef): unknown {
  void _fullKey;
  return undefined;
}

export async function resolveSessionKnob(_fullKey: KnobRef): Promise<unknown> {
  void _fullKey;
  return undefined;
}

export function useSessionKnob(_fullKey: KnobRef): unknown {
  void _fullKey;
  return undefined;
}
