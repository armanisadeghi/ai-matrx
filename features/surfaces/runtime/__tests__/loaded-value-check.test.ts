/**
 * A surface may load only values it declared (Matrx Alchemy ALC-14 exit: "a
 * surface with an undeclared loaded value fails"). The check runs where the
 * loaded scope is assembled — `withScopeContributions`, which every reader
 * (Run, the Surface Context window, copy/export) goes through — against the
 * REAL notes surface declaration (no manifest mock):
 *   - under test it throws, so any test that loads a real surface with an
 *     undeclared key fails;
 *   - in development it announces the sentence and remedy once;
 *   - in production it never blocks the person (law 6: validation offers).
 */
import { withScopeContributions } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { getManifest } from "@/features/surfaces/manifests/registry";

const SURFACE = "matrx-user/notes";

function declaredScope(): Record<string, unknown> {
  const manifest = getManifest(SURFACE);
  if (!manifest) throw new Error(`${SURFACE} is not a registered surface`);
  return Object.fromEntries(manifest.values.map((v) => [v.name, ""]));
}

function withNodeEnv<T>(env: string, run: () => T): T {
  const previous = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = env;
  try {
    return run();
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = previous;
  }
}

describe("a loaded surface value must be declared", () => {
  it("passes a scope that carries only declared values", () => {
    const scope = declaredScope();
    expect(withScopeContributions(SURFACE, () => scope)()).toEqual(scope);
  });

  it("fails the test when a real surface loads an undeclared key, naming it and the remedy", () => {
    const scope = { ...declaredScope(), vendor_api_token: "sk-live-123" };
    expect(() => withScopeContributions(SURFACE, () => scope)()).toThrow(
      /loaded a value "vendor_api_token" it never declared.*Declare "vendor_api_token"/s,
    );
  });

  it("announces once in development and still returns the scope", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const scope = { ...declaredScope(), pickup_draft_cache: "x" };
      const read = withScopeContributions(SURFACE, () => scope);
      withNodeEnv("development", () => {
        expect(read()).toEqual(scope);
        expect(read()).toEqual(scope);
      });
      const announced = error.mock.calls.filter((call) => String(call[0]).includes("pickup_draft_cache"));
      expect(announced).toHaveLength(1);
      expect(String(announced[0]![0])).toMatch(/Declare "pickup_draft_cache"/);
    } finally {
      error.mockRestore();
    }
  });

  it("never blocks the person in production", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const scope = { ...declaredScope(), production_only_key: "x" };
      withNodeEnv("production", () => {
        expect(withScopeContributions(SURFACE, () => scope)()).toEqual(scope);
      });
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
