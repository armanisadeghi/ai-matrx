#!/usr/bin/env tsx
/**
 * check:settings-ladder-ui — every customer-tunable knob is reachable in the
 * universal settings UI at EVERY rung its `overridable_by` names.
 *
 * 🚨 THE DEFECT CLASS (Unified Settings Platform, LANE C; register § "THE
 * DEFECT CLASS THIS CAMPAIGN EXISTS TO KILL"). `overridable_by` is the one
 * field that decides whether a person is shown a control: `[]` means platform
 * engineering only, anything else means "an organization / pay group / location
 * / person may set this". A row that says `[organization, pay_group]` and a UI
 * that can only ever write at `organization` is a promise the screen cannot
 * keep — the pay-group rung exists in the registry, resolves in
 * `platform.knob_index`, and no human can reach it. The theme stored seven
 * ways, `force_ocr` wired through an API contract that no UI call site ever
 * passes — same class: the system honours a rung the surface never offers.
 *
 * WHAT "REACHABLE" MEANS — four checks, each measured, none guessed:
 *
 *   FILED       `taxonomy_node_id` is non-null. The universal UI's left nav is
 *               `platform.taxonomy_node`; an unfiled key lands in a "not filed
 *               under a domain yet" bucket nobody navigates to on purpose.
 *               Remedy: add the feature to the `m(feature, dom, feat)` mapping
 *               table in aidream migration 0631_feature_knob_taxonomy_mapping
 *               and apply it (the DB is the mechanism; the .sql is the record).
 *   REGISTERED  every rung named is a `platform.knob_scope_kind` row. knob_index
 *               builds `scope_chain` with `where sk.kind = any(k.overridable_by)`
 *               — a kind with no row silently vanishes from the chain.
 *   NAMED       every rung is in the UI's own vocabulary: the
 *               `KnobScopeKindName` union in lib/scoped-config/types.ts (the
 *               type `resolveKnobLadder` accepts) and `RUNG_NAMES` in
 *               lib/scoped-config/ladder.ts (the words a person reads).
 *   ADDRESSED   the universal UI (features/settings/universal/) actually passes
 *               that rung to `knob_index`: organization + user through
 *               `organizationId`/`userId`, sub-org rungs through
 *               `scopes: [{kind: "…"}]`, the device rung through `deviceId`.
 *               A rung the UI never addresses shows in the ladder with
 *               `scope_id: null` and can never be written from that screen.
 *
 * DELIBERATELY UNFILED — the ten `commerce.*` namespaces have no domain in the
 * registry because naming one is Arman's call (migration 0631's header). They
 * sit in `scripts/settings-ladder-ui-allowlist.json` with that reason, and the
 * list only shrinks. Anything else unfiled is NEW and fails.
 *
 * CREDENTIAL GATED. No live registry, no `knob_scope_kind`, or no universal
 * UI on disk yet = exit 2 UNMEASURED, never a pass.
 *
 *   pnpm check:settings-ladder-ui
 *   pnpm check:settings-ladder-ui --json
 *   pnpm check:settings-ladder-ui --self-test   # prove it can still fail
 *
 * Exit: 0 clean · 1 unreachable key(s) · 2 UNMEASURED.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import {
  C,
  ROOT,
  addr,
  adminQuery,
  loadRegistry,
  unmeasured,
  type KnobRow,
} from "./settings-guards/lib";

const GUARD = "check:settings-ladder-ui";
const UNIVERSAL_DIR = join(ROOT, "features", "settings", "universal");
const TYPES_FILE = join(ROOT, "lib", "scoped-config", "types.ts");
const LADDER_FILE = join(ROOT, "lib", "scoped-config", "ladder.ts");
const ALLOWLIST_FILE = join(ROOT, "scripts", "settings-ladder-ui-allowlist.json");
const MAPPING_REMEDY =
  "add the feature to the m(feature, dom, feat) mapping table in aidream/db/migrations/0631_feature_knob_taxonomy_mapping.sql and apply it live";

interface Finding {
  feature: string;
  key: string;
  overridable_by: string[];
  problem: "UNFILED" | "UNREGISTERED_RUNG" | "UNNAMED_RUNG" | "UNADDRESSED_RUNG";
  rung?: string;
}
interface AllowEntry {
  feature: string;
  reason: string;
}

function readDirText(dir: string): { files: number; text: string } {
  if (!existsSync(dir)) return { files: 0, text: "" };
  let text = "";
  let files = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = readDirText(full);
      files += sub.files;
      text += sub.text;
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      files += 1;
      text += `\n// ${full}\n${readFileSync(full, "utf8")}`;
    }
  }
  return { files, text };
}

/** The literals of `export type KnobScopeKindName = "a" | "b" | …;` */
function typeUnion(text: string): Set<string> {
  const m = /export type KnobScopeKindName\s*=([\s\S]*?);/.exec(text);
  return new Set(m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : []);
}

/** The keys of `const RUNG_NAMES: Record<string, string> = { a: "…", … };` */
function rungNameKeys(text: string): Set<string> {
  const m = /const RUNG_NAMES[^=]*=\s*\{([\s\S]*?)\};/.exec(text);
  return new Set(m ? [...m[1].matchAll(/^\s*([a-z_]+)\s*:/gm)].map((x) => x[1]) : []);
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const selfTest = process.argv.includes("--self-test");

  const rows = await loadRegistry(GUARD);

  // The rung registry — what knob_index can put in a scope_chain at all.
  const kinds = await adminQuery<{ kind: string; precedence: number }>(
    "select kind, precedence from platform.knob_scope_kind order by precedence",
  );
  if (!kinds.rows || kinds.rows.length === 0) {
    unmeasured(
      GUARD,
      `platform.knob_scope_kind was not read (${kinds.rows ? "zero rows" : kinds.why}) — without it no rung can be called reachable.`,
      "set SUPABASE_SECRET_KEY (execute_admin_query) in .env.local / .env",
    );
  }
  const registeredKinds = new Set(kinds.rows.map((k) => k.kind));

  // The UI — read from disk, never assumed.
  const ui = readDirText(UNIVERSAL_DIR);
  if (ui.files === 0 || !/fetchKnobIndexResponse|fetchKnobIndex|useScopedKnobs/.test(ui.text)) {
    unmeasured(
      GUARD,
      "No universal settings UI on disk (features/settings/universal/ absent or not reading knob_index) — there is no surface to grade reachability against.",
      "LANE B lands features/settings/universal/; re-run once it reads platform.knob_index",
    );
  }
  if (!existsSync(TYPES_FILE) || !existsSync(LADDER_FILE)) {
    unmeasured(GUARD, "lib/scoped-config/types.ts or ladder.ts is missing.", "restore lib/scoped-config");
  }
  const named = new Set([
    ...typeUnion(readFileSync(TYPES_FILE, "utf8")),
    ...rungNameKeys(readFileSync(LADDER_FILE, "utf8")),
  ]);
  named.delete("platform");
  if (named.size === 0) {
    unmeasured(GUARD, "Could not parse KnobScopeKindName / RUNG_NAMES — the UI vocabulary is unreadable.", "keep the union and RUNG_NAMES literal");
  }
  const addressed = new Set<string>();
  if (/organizationId/.test(ui.text)) addressed.add("organization");
  if (/userId/.test(ui.text)) addressed.add("user");
  if (/deviceId/.test(ui.text)) addressed.add("device");
  for (const m of ui.text.matchAll(/kind\s*:\s*["']([a-z_]+)["']/g)) addressed.add(m[1]);

  const allow: AllowEntry[] = existsSync(ALLOWLIST_FILE)
    ? (JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8")).entries as AllowEntry[])
    : [];
  const allowedUnfiled = new Map(allow.map((a) => [a.feature, a.reason]));

  const graded: KnobRow[] = rows.filter((r) => (r.overridable_by ?? []).length > 0);
  if (selfTest) {
    graded.push({
      feature: "self_test",
      key: "a_knob_the_ui_cannot_reach",
      value_type: "boolean",
      overridable_by: ["organization", "brand", "a_rung_that_does_not_exist"],
      ui: null,
      label: "SELF-TEST — not a real registry row",
      taxonomy_node_id: null,
    });
  }

  const findings: Finding[] = [];
  const tolerated: KnobRow[] = [];
  for (const r of graded) {
    const ob = r.overridable_by ?? [];
    if (r.taxonomy_node_id === null) {
      if (allowedUnfiled.has(r.feature)) tolerated.push(r);
      else findings.push({ feature: r.feature, key: r.key, overridable_by: ob, problem: "UNFILED" });
    }
    for (const rung of ob) {
      if (!registeredKinds.has(rung)) {
        findings.push({ feature: r.feature, key: r.key, overridable_by: ob, problem: "UNREGISTERED_RUNG", rung });
      } else if (!named.has(rung)) {
        findings.push({ feature: r.feature, key: r.key, overridable_by: ob, problem: "UNNAMED_RUNG", rung });
      } else if (!addressed.has(rung)) {
        findings.push({ feature: r.feature, key: r.key, overridable_by: ob, problem: "UNADDRESSED_RUNG", rung });
      }
    }
  }
  const unreachableKeys = new Set(findings.map((f) => addr(f.feature, f.key)));
  const staleAllow = allow.filter((a) => !graded.some((r) => r.feature === a.feature && r.taxonomy_node_id === null));

  if (json) {
    console.log(
      JSON.stringify(
        {
          graded: graded.length,
          registered_kinds: [...registeredKinds],
          named_kinds: [...named],
          addressed_kinds: [...addressed],
          unreachable_keys: unreachableKeys.size,
          tolerated_unfiled: tolerated.map((r) => addr(r.feature, r.key)),
          stale_allowlist: staleAllow,
          findings,
        },
        null,
        2,
      ),
    );
    process.exit(findings.length > 0 ? 1 : 0);
  }

  console.log(`\n${C.bold}${C.white}SETTINGS LADDER UI REACHABILITY${C.reset} ${C.dim}(${GUARD})${C.reset}`);
  console.log(
    `${C.dim}${graded.length} customer-tunable knobs (overridable_by non-empty) of ${rows.length} · rungs registered: ${[...registeredKinds].join(", ")} · named by the UI: ${[...named].join(", ")} · addressed by features/settings/universal: ${[...addressed].join(", ") || "none"}${C.reset}\n`,
  );

  if (findings.length === 0) {
    console.log(`${C.green}✓ Every customer-tunable knob is filed and reachable at every rung it names.${C.reset}`);
  } else {
    console.log(
      `${C.red}${C.bold}[LOUD] ${unreachableKeys.size} knob(s) the universal settings UI cannot honour — ${findings.length} finding(s)${C.reset}`,
    );
    console.log(`${C.dim}A registry that promises a rung the screen never offers is a control that lies by omission.${C.reset}\n`);

    const unfiled = findings.filter((f) => f.problem === "UNFILED");
    if (unfiled.length > 0) {
      console.log(`  ${C.bold}UNFILED${C.reset} ${C.dim}(${unfiled.length}) — taxonomy_node_id is null, so the left nav has nowhere to put it${C.reset}`);
      for (const f of unfiled) console.log(`    ${C.cyan}${f.feature}${C.reset} ${f.key}`);
      console.log(`    ${C.yellow}Fix:${C.reset} ${MAPPING_REMEDY}`);
    }
    for (const problem of ["UNREGISTERED_RUNG", "UNNAMED_RUNG", "UNADDRESSED_RUNG"] as const) {
      const group = findings.filter((f) => f.problem === problem);
      if (group.length === 0) continue;
      const byRung = new Map<string, Finding[]>();
      for (const f of group) byRung.set(f.rung!, [...(byRung.get(f.rung!) ?? []), f]);
      const why =
        problem === "UNREGISTERED_RUNG"
          ? "not a platform.knob_scope_kind row — knob_index drops it from scope_chain silently"
          : problem === "UNNAMED_RUNG"
            ? "not in KnobScopeKindName / RUNG_NAMES — the UI has no word for it"
            : "the universal UI never passes this rung to knob_index — nobody can edit at it";
      console.log(`\n  ${C.bold}${problem}${C.reset} ${C.dim}(${group.length}) — ${why}${C.reset}`);
      for (const [rung, list] of byRung) {
        const byFeature = new Map<string, number>();
        for (const f of list) byFeature.set(f.feature, (byFeature.get(f.feature) ?? 0) + 1);
        console.log(`    ${C.cyan}${rung}${C.reset} ${C.dim}(${list.length} key(s))${C.reset}`);
        for (const [feature, n] of [...byFeature].sort((a, b) => b[1] - a[1])) {
          const keys = list.filter((f) => f.feature === feature).map((f) => f.key);
          console.log(`      ${feature} ${C.dim}(${n}): ${keys.slice(0, 6).join(", ")}${keys.length > 6 ? ", …" : ""}${C.reset}`);
        }
      }
      const fix =
        problem === "UNREGISTERED_RUNG"
          ? "register the rung in platform.knob_scope_kind with a precedence — or take it out of overridable_by"
          : problem === "UNNAMED_RUNG"
            ? "add the rung to KnobScopeKindName (lib/scoped-config/types.ts) and RUNG_NAMES (ladder.ts)"
            : "let the universal UI address the rung: pass it in `scopes` (or `deviceId`) to fetchKnobIndexResponse and offer the rung picker";
      console.log(`    ${C.yellow}Fix:${C.reset} ${fix}`);
    }
  }

  if (tolerated.length > 0) {
    console.log(
      `\n${C.yellow}${C.bold}[BASELINED] ${tolerated.length} unfiled key(s) tolerated by scripts/settings-ladder-ui-allowlist.json${C.reset} ${C.dim}— they render under "not filed under a domain yet"; the list only shrinks${C.reset}`,
    );
    const byFeature = new Map<string, number>();
    for (const r of tolerated) byFeature.set(r.feature, (byFeature.get(r.feature) ?? 0) + 1);
    for (const [feature, n] of byFeature) console.log(`  ${C.dim}${feature} (${n}) — ${allowedUnfiled.get(feature)}${C.reset}`);
  }
  if (staleAllow.length > 0) {
    console.log(`\n${C.green}${staleAllow.length} allowlist entr${staleAllow.length === 1 ? "y" : "ies"} no longer unfiled${C.reset} ${C.dim}— remove: ${staleAllow.map((a) => a.feature).join(", ")}${C.reset}`);
  }

  console.log("");
  process.exit(findings.length > 0 ? 1 : 0);
}

main();
