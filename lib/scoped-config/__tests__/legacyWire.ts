// Test double adapter: the older tests in this folder describe the register as one `knob_snapshot`
// answer ({ resolved }). The client now asks `knob_snapshot_delta` + `knob_defaults`
// (KNOB-SNAPSHOT, 2026-10-08), so this turns a double that still answers `knob_snapshot` into the new wire:
// no defaults, every resolved key delivered as an override, a fresh etag each time (never "unchanged").
// The delta behaviour itself (defaults once, etag skip) is proven in `snapshot-delta-wire.test.ts`.
type Rpc = (fn: string, args: Record<string, unknown>) => unknown;
let counter = 0;
export function legacyWire(rpc: Rpc): Rpc {
  return (fn, args) => {
    if (fn === "knob_defaults") {
      return Promise.resolve({ data: { version: "legacy", unchanged: false, defaults: {} }, error: null });
    }
    if (fn !== "knob_snapshot_delta") return rpc(fn, args);
    return Promise.resolve(rpc("knob_snapshot", args)).then((answer) => {
      const a = answer as { data: { resolved?: Record<string, unknown> } | null; error: unknown };
      if (a.error || !a.data) return a;
      counter += 1;
      return {
        data: { etag: `legacy-${counter}`, defaults_version: "legacy", unchanged: false, overrides: a.data.resolved ?? {} },
        error: null,
      };
    });
  };
}
