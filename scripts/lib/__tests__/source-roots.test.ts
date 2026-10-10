/**
 * The shared alias + source-root answer every hand-written resolver and scan routes through.
 * The chat package move (features/ -> ../aidream/apps/shared/chat/src) introduces `@host/` and
 * `@ai-matrx/chat/`; a guard that cannot read them goes blind to the moved code while staying
 * green. These cases pin the three spellings and the root expansion to the tsconfig/jest truth.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALIAS_PREFIX_PATTERN,
  CHAT_PACKAGE_SRC,
  aliasTarget,
  featureRootOf,
  featureRoots,
  isAliasSpecifier,
  isUnderFeature,
} from "../source-roots.cjs";

describe("aliasTarget", () => {
  it("resolves @/ and @host/ from the repo root, identically", () => {
    expect(aliasTarget("@/features/hr/routes")).toBe("features/hr/routes");
    expect(aliasTarget("@host/features/hr/routes")).toBe("features/hr/routes");
  });

  it("resolves @ai-matrx/chat/ into the chat package's src", () => {
    expect(aliasTarget("@ai-matrx/chat/agents/x")).toBe(`${CHAT_PACKAGE_SRC}/agents/x`);
  });

  it("leaves packages and relative specifiers alone", () => {
    for (const spec of ["react", "@ai-matrx/agents/matrx", "@ai-matrx/chatty/x", "./x", "../y", "@hostile/x"]) {
      expect(aliasTarget(spec)).toBeNull();
      expect(isAliasSpecifier(spec)).toBe(false);
    }
  });

  it("matches the same prefixes in an extraction regex", () => {
    const re = new RegExp(`^(?:${ALIAS_PREFIX_PATTERN})`);
    expect(["@/a", "@host/a", "@ai-matrx/chat/a"].every((s) => re.test(s))).toBe(true);
    expect(["@ai-matrx/agents", "./a", "@hostx/a"].some((s) => re.test(s))).toBe(false);
  });
});

describe("feature roots", () => {
  // The package src is a SIBLING of the repo (`../aidream/...`), so the fake repo lives one level
  // inside the scratch dir: the sibling it creates stays inside the scratch dir too and is removed
  // with it. A repo directly in tmpdir() leaked `$TMPDIR/aidream` and failed the next run.
  let scratch: string;
  let dir: string;
  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), "source-roots-"));
    dir = join(scratch, "repo");
    mkdirSync(join(dir, "features"), { recursive: true });
  });
  afterEach(() => rmSync(scratch, { recursive: true, force: true }));

  it("is features/ alone until the package exists, then both", () => {
    expect(featureRoots(dir)).toEqual(["features"]);
    mkdirSync(join(dir, CHAT_PACKAGE_SRC), { recursive: true });
    expect(featureRoots(dir)).toEqual(["features", CHAT_PACKAGE_SRC]);
  });

  it("splits a path under either root", () => {
    expect(featureRootOf("features/hr/routes.ts")).toEqual({ root: "features", rest: "hr/routes.ts" });
    expect(featureRootOf(`${CHAT_PACKAGE_SRC}/agents/x.ts`)).toEqual({ root: CHAT_PACKAGE_SRC, rest: "agents/x.ts" });
    expect(featureRootOf("featuresque/x.ts")).toBeNull();
    expect(featureRootOf("app/page.tsx")).toBeNull();
  });

  it("finds a feature sub-directory under either root, by segment", () => {
    expect(isUnderFeature("/repo/features/agents/deletion/X.tsx", "agents/deletion")).toBe(true);
    expect(isUnderFeature(`/repo/${CHAT_PACKAGE_SRC}/agents/deletion/X.tsx`, "agents/deletion")).toBe(true);
    expect(isUnderFeature("/repo/features/agents/deletion-log/X.tsx", "agents/deletion")).toBe(false);
  });
});
