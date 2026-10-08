/**
 * One vocabulary for the join gate's reason codes (CORE-DESIGN §2.5): the PACKAGE owns the list,
 * aidream's `services/meet/errors.py` emits exactly it (guarded server-side), and every refusal
 * screen here is decided by one of its codes. This is the frontend half of the three-way guard.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { JOIN_REFUSAL_REASONS } from "@ai-matrx/meet";

const MEET_DIR = path.resolve(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** Every literal `refused:<code>` this feature names. */
export function namedReasons(text: string): string[] {
  return [...text.matchAll(/refused:([a-z_]+)\b/g)].map((m) => m[1]);
}

describe("join-gate reason vocabulary (frontend)", () => {
  it("every refused:<code> the meet feature names is a code the package speaks", () => {
    const used = new Set(sources(MEET_DIR).flatMap((f) => namedReasons(readFileSync(f, "utf8"))));
    const unknown = [...used].filter((c) => !(JOIN_REFUSAL_REASONS as readonly string[]).includes(c));
    expect(unknown).toEqual([]);
  });

  it("a code outside the package's list is caught (red proof on a scratch string, not the real file)", () => {
    const unknown = namedReasons('phase="refused:no_such_meeting"').filter(
      (c) => !(JOIN_REFUSAL_REASONS as readonly string[]).includes(c),
    );
    expect(unknown).toEqual(["no_such_meeting"]);
  });

  it("no screen decides a refusal by matching message text", () => {
    const offenders = sources(MEET_DIR).filter((f) => /no meeting for that link/i.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(MEET_DIR, f))).toEqual([]);
  });
});
