/**
 * EVERY CLIENT KNOB READ ADDRESSES A ROW THAT EXISTS.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R4, V13-2). `platform.knob_resolve` takes a
 * PAIR — `(p_feature, p_key)` — and `platform.feature_knob`'s primary key is
 * that pair. The client addressed a knob with ONE dotted string and split it at
 * the LAST dot, which is a guess: the live register holds 635 rows whose
 * `feature` itself contains a dot and 58 rows whose `key` contains one (read
 * live 2026-09-17), so no rule recovers the pair from the string. The connector
 * prompt card read `connectors.prompt.resurface_days`, the split sent
 * `('connectors.prompt', 'resurface_days')`, and the live row is
 * `('connectors', 'prompt.resurface_days')`:
 *
 *   knob_resolve('connectors.prompt','resurface_days') → P0001 … is not seeded
 *   knob_resolve('connectors','prompt.resurface_days') → 0
 *
 * So every mount fired an RPC that RAISED, `useEffectiveKnob` swallowed it in an
 * empty catch, and the value stayed `undefined` for ever — the knob PLAN §7 rules
 * could never resolve, and nothing said so (law 4, law 6).
 *
 * THE CLASS FIX THIS CENSUSES: the address is the pair. A reader may pass
 * `{ feature, key }` — the only form that cannot be wrong — and the dotted
 * string stays as a convenience whose last-dot convention is now MEASURED here
 * rather than assumed. Every full-key-family read in the repo is resolved to its
 * address and matched against the knob rows DECLARED by the two repos'
 * migrations; a read whose address matches no declared row fails BY NAME.
 *
 * This is the static half. The live half is `pnpm check:settings-unregistered`,
 * which grades the same addresses against the live table and is credential
 * gated; it could not see this call at all until 2026-09-17, because its
 * matcher required the closing paren right after the key and this call site
 * carries a trailing comma (fixed in `scripts/settings-guards/lib.ts`).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { knobAddress, type KnobRef } from "../effectiveKnobs";

const ROOT = join(__dirname, "..", "..", "..");
const AIDREAM = process.env.AIDREAM_DIR ?? join(ROOT, "..", "aidream");

/** Where a knob row is DECLARED — the seeds, in both repos. */
const MIGRATION_DIRS = [
  join(ROOT, "migrations"),
  join(AIDREAM, "db", "migrations"),
];

/**
 * Every `(feature, key)` a `platform.feature_knob` seed writes. The seeds are
 * written both as value tuples and as `insert … select 'feature', 'key', …`, so
 * the reader takes any adjacent quoted pair inside a file that touches the
 * table. Over-reading here can only make the census more permissive, and a
 * fabricated pair matching a real read's address by accident is not a shape any
 * of these files produces.
 */
/** Every `.sql` under `dir`, at any depth. */
function sqlFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sqlFiles(full, out);
      continue;
    }
    if (entry.endsWith(".sql")) out.push(full);
  }
  return out;
}

function declaredPairs(): { pairs: Set<string>; files: number } {
  const pairs = new Set<string>();
  let files = 0;
  const re =
    /'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*)'\s*,\s*'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*)'\s*,/gi;
  for (const dir of MIGRATION_DIRS) {
    // 🚨 RECURSIVE. This used to be a flat `readdirSync`, and BOTH repos keep
    // seeds in subdirectories — `migrations/campaign/`, `migrations/inverse/`,
    // aidream's `db/migrations/campaign/`. So every campaign knob looked
    // undeclared: `custom.code_paths_enabled` IS seeded (the register migration
    // and its inverse both name it) and the census could not see the row, so a
    // call site addressing it would have been reported as a miss. It only never
    // fired because the one client read of it was ALSO invisible — an inline
    // `{ feature: X.FEATURE, key: X.KEY }` the address reader cannot follow.
    // Two blind spots cancelling out is not a green guard.
    for (const file of sqlFiles(dir)) {
      const text = readFileSync(file, "utf8");
      if (!/platform\.feature_knob/i.test(text)) continue;
      files += 1;
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        pairs.add(`${m[1]} ${m[2]}`);
      }
    }
  }
  return { pairs, files };
}

/** The readers that take a knob REF — the family this module exposes. */
const REF_FNS: Record<string, number> = {
  // (organizationId, userId, ref)
  useEffectiveKnob: 2,
  ensureEffectiveKnob: 2,
  peekEffectiveKnob: 2,
  // (ref)
  useSessionKnob: 0,
  getSessionKnob: 0,
  resolveSessionKnob: 0,
};

const SCAN_DIRS = ["app", "components", "features", "hooks", "lib", "utils"];
const SKIP_DIR = /(node_modules|\.next|__tests__)/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP_DIR.test(full)) continue;
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/** Module-level `NAME = "literal"` constants, so a disciplined call resolves. */
function stringConsts(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const re =
    /^[ \t]*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[\w.<>[\]"'| ]+)?\s*=\s*["']([^"'\n]+)["']/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) out.set(m[1], m[2]);
  return out;
}

/** Module-level `NAME = { feature: "…", key: "…" }` address constants. */
function addressConsts(text: string): Map<string, KnobRef> {
  const out = new Map<string, KnobRef>();
  const re =
    /^[ \t]*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[\w.<>[\]"'| ]+)?\s*=\s*\{\s*feature\s*:\s*["']([^"'\n]+)["']\s*,\s*key\s*:\s*["']([^"'\n]+)["']\s*,?\s*\}/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.set(m[1], { feature: m[2], key: m[3] });
  }
  return out;
}

/**
 * `NAME = `${FEATURE}.${KEY}`` — a call site that declared the PAIR and then
 * templated it into one string. The pair is what it means, so it resolves to the
 * pair rather than being re-split by a guess.
 */
function templatePairConsts(text: string, strings: Map<string, string>): Map<string, KnobRef> {
  const out = new Map<string, KnobRef>();
  const re =
    /^[ \t]*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[\w.<>[\]"'| ]+)?\s*=\s*`\$\{([A-Za-z_$][\w$]*)\}\.\$\{([A-Za-z_$][\w$]*)\}`/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const feature = strings.get(m[2]);
    const key = strings.get(m[3]);
    if (feature && key) out.set(m[1], { feature, key });
  }
  return out;
}

/** Split a call's argument list on TOP-LEVEL commas. */
function args(source: string, open: number): string[] | null {
  let depth = 0;
  let start = open + 1;
  const out: string[] = [];
  for (let at = open; at < source.length; at += 1) {
    const char = source[at];
    if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) {
        out.push(source.slice(start, at));
        return out;
      }
    } else if (char === "," && depth === 1) {
      out.push(source.slice(start, at));
      start = at + 1;
    }
  }
  return null;
}

interface ReadSite {
  file: string;
  line: number;
  fn: string;
  ref: KnobRef | null;
  raw: string;
}

function readSites(): ReadSite[] {
  const sites: ReadSite[] = [];
  const names = Object.keys(REF_FNS).join("|");
  const call = new RegExp(`\\b(${names})\\s*\\(`, "g");
  const files = SCAN_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)));
  /**
   * Every EXPORTED knob constant in the repo, so a call site that imports its
   * address (`useSessionKnob(LISTENING_VOICE_KNOB)`) resolves like one that
   * declares it locally — the most disciplined call sites must not be the
   * invisible ones (the mistake the live guard's matcher made until today).
   */
  const exported = new Map<string, KnobRef>();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (!/export\s+const/.test(text)) continue;
    const local = stringConsts(text);
    for (const [name, value] of local) if (/KNOB/.test(name)) exported.set(name, value);
    for (const [name, value] of addressConsts(text)) if (/KNOB/.test(name)) exported.set(name, value);
    for (const [name, value] of templatePairConsts(text, local)) exported.set(name, value);
  }
  for (const dir of SCAN_DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      // The module that DEFINES the readers is not a call site.
      if (/lib[\\/]scoped-config[\\/]/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      if (!new RegExp(names).test(text)) continue;
      const strings = stringConsts(text);
      const addresses = new Map<string, KnobRef>([
        ...addressConsts(text),
        ...templatePairConsts(text, strings),
      ]);
      call.lastIndex = 0;
      for (let m = call.exec(text); m; m = call.exec(text)) {
        const fn = m[1];
        const open = m.index + m[0].length - 1;
        const parts = args(text, open);
        if (!parts) continue;
        const raw = (parts[REF_FNS[fn]] ?? "").trim().replace(/,$/, "");
        if (!raw) continue;
        const line = text.slice(0, m.index).split("\n").length;
        const literal = /^["'](.+)["']$/.exec(raw);
        const inline =
          /^\{\s*feature\s*:\s*["']([^"']+)["']\s*,\s*key\s*:\s*["']([^"']+)["']\s*,?\s*\}$/.exec(
            raw,
          );
        const ref: KnobRef | null = literal
          ? literal[1]
          : inline
            ? { feature: inline[1], key: inline[2] }
            : (addresses.get(raw) ?? strings.get(raw) ?? exported.get(raw) ?? null);
        sites.push({ file: relative(ROOT, file), line, fn, ref, raw });
      }
    }
  }
  return sites;
}

/**
 * A read whose ref is assembled at run time. Each one is named WITH the reason
 * it is unresolvable here and where its addresses are declared, so the list
 * cannot quietly absorb a new unaddressable read.
 */
const COMPUTED_REFS: Record<string, string> = {
  "features/audio/limits.ts":
    "reads one address per limit out of its own declared AUDIO_LIMITS table; every entry is a pair in that file",
  "features/masterwork/capture-plan/useCapturePlanSettings.ts":
    "one local `read(key)` helper over its own declared KNOB_* constants",
  "features/window-panels/detail/DetailHost.tsx":
    "forwards its own KNOB constants through a local helper",
};

describe("the knob address", () => {
  it("is the pair the resolver sends, whichever form a caller passes", () => {
    expect(knobAddress({ feature: "connectors", key: "prompt.resurface_days" })).toEqual({
      feature: "connectors",
      key: "prompt.resurface_days",
    });
    // The dotted convenience form: last dot, and nothing else.
    expect(knobAddress("media.listening.voice")).toEqual({
      feature: "media.listening",
      key: "voice",
    });
  });

  it("refuses a string that carries no feature segment", () => {
    expect(() => knobAddress("resurface_days")).toThrow(/feature/i);
  });
});

describe("the census of client knob reads", () => {
  const { pairs, files } = declaredPairs();
  const sites = readSites();

  it("read the seeds and the call sites it claims to", () => {
    expect(files).toBeGreaterThan(50);
    expect(pairs.size).toBeGreaterThan(400);
    expect(sites.length).toBeGreaterThan(10);
  });

  it("addresses a declared row at every resolvable call site", () => {
    const misses: string[] = [];
    for (const site of sites) {
      if (!site.ref) continue;
      let address: { feature: string; key: string };
      try {
        address = knobAddress(site.ref);
      } catch (error) {
        misses.push(`${site.file}:${site.line} ${site.fn}(${site.raw}) — ${String(error)}`);
        continue;
      }
      if (!pairs.has(`${address.feature} ${address.key}`)) {
        misses.push(
          `${site.file}:${site.line} ${site.fn}(${site.raw}) resolves to ` +
            `feature='${address.feature}', key='${address.key}' — no seed declares that pair. ` +
            "Pass the register's own { feature, key } pair.",
        );
      }
    }
    expect(misses).toEqual([]);
  });

  it("names every read whose address is assembled at run time", () => {
    const computed = [...new Set(sites.filter((s) => !s.ref).map((s) => s.file))];
    for (const file of computed) {
      expect(COMPUTED_REFS[file] ?? `UNEXPLAINED computed knob ref in ${file}`).not.toContain(
        "UNEXPLAINED",
      );
    }
  });

  it("says out loud when the aidream seeds could not be read", () => {
    if (!existsSync(join(AIDREAM, "db", "migrations"))) {
      console.warn(
        `UNMEASURED: ${AIDREAM}/db/migrations was not found, so only this repo's` +
          " knob seeds were censused. Set AIDREAM_DIR to the sibling checkout.",
      );
    }
    expect(true).toBe(true);
  });
});
