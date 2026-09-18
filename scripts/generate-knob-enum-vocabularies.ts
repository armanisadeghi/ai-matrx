#!/usr/bin/env tsx
/**
 * generate-knob-enum-vocabularies — every `platform.feature_knob` row whose
 * `value_type = 'enum'`, with the EXACT `allowed_values` and `default_value`
 * the live database holds, written to
 * `features/settings/universal/knobEnumVocabularies.generated.ts`.
 *
 * 🚨 WHY THIS EXISTS. A feature module that RETYPES an enum knob's vocabulary
 * has made a copy of the database, and a copy drifts. Measured live on
 * 2026-09-17, `features/marketing/seo/topical-map/knobs.ts` disagreed with the
 * live rows on three of its nine enum knobs:
 *
 *   proposal_mode                 file: auto_apply_initial|propose|apply
 *                                 live: auto_apply|approval|auto_apply_initial
 *   description_regeneration_mode  file: queued|immediate|off
 *                                 live: automatic|queued|manual
 *   bulk_action_confirm            file: always|above_n   (live also has `never`)
 *
 * Every DEFAULT was inside both lists, so nothing was broken that day — and
 * that is precisely the shape of this defect class. The settings picker offers
 * what the DATABASE allows; the moment an admin chose `never`, or `manual`, or
 * `approval`, the reader raised and every topical-map screen went blank. A
 * settings screen that accepts a value the app then refuses to read is law 4
 * from the other side: the person made a legal choice and the product broke.
 *
 * So the vocabulary has ONE home — the row — and a feature derives its union
 * from this generated file instead of retyping it. The union then cannot
 * disagree by construction, and this guard catches the day a migration changes
 * a row.
 *
 *   pnpm generate:knob-enum-vocabularies          # rewrite the file
 *   pnpm check:knob-enum-vocabularies             # FAIL if the file is stale
 *   pnpm check:knob-enum-vocabularies:self-test   # prove the check can FAIL
 *
 * CREDENTIAL GATED, like every guard in this family: with no live database it
 * measured NOTHING and exits 2 (UNMEASURED) rather than printing green over an
 * unread source. Exit: 0 clean · 1 stale · 2 UNMEASURED.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import { DB_VARS, ROOT, client as dbClient, loadDbEnv } from "./knob-resolve-callers/db";

const OUT = join(
  ROOT,
  "features",
  "settings",
  "universal",
  "knobEnumVocabularies.generated.ts",
);

const ENUM_SQL = `
  select feature, key, allowed_values, default_value
    from platform.feature_knob
   where value_type = 'enum'
     and allowed_values is not null
   order by feature, key`;

interface EnumKnob {
  address: string;
  allowed: string[];
  defaultValue: string;
}

function render(rows: EnumKnob[]): string {
  const body = rows
    .map(
      (row) =>
        `  ${JSON.stringify(row.address)}: { allowed: [${row.allowed
          .map((v) => JSON.stringify(v))
          .join(", ")}], default: ${JSON.stringify(row.defaultValue)} },`,
    )
    .join("\n");
  return `// GENERATED — do not edit by hand.
//
// Every \`platform.feature_knob\` row with \`value_type = 'enum'\`: the exact
// \`allowed_values\` the settings picker offers, and the \`default_value\` a
// reader falls back to. Regenerate with
// \`pnpm generate:knob-enum-vocabularies\`; \`pnpm check:knob-enum-vocabularies\`
// FAILS when this file no longer matches the live database.
//
// 🚨 A FEATURE NEVER RETYPES ONE OF THESE LISTS. Derive the union from here
// (\`KnobEnumValue<"seo.topical_map.default_view">\`) so the types cannot
// disagree with the rows the admin is actually choosing between. On
// 2026-09-17 three topical-map vocabularies had drifted this way, and the
// reader RAISED on a legal value instead of degrading — an admin choosing
// \`bulk_action_confirm = never\` would have blanked every map screen.

export interface KnobEnumVocabulary {
  readonly allowed: readonly string[];
  readonly default: string;
}

export const KNOB_ENUM_VOCABULARIES = {
${body}
} as const satisfies Readonly<Record<string, KnobEnumVocabulary>>;

export type KnobEnumAddress = keyof typeof KNOB_ENUM_VOCABULARIES;

/** The union of legal values for one enum knob, straight from its row. */
export type KnobEnumValue<A extends KnobEnumAddress> =
  (typeof KNOB_ENUM_VOCABULARIES)[A]["allowed"][number];

/**
 * Narrow a live knob value onto its row's vocabulary. Returns null — never
 * throws — when the value is outside it: an unknown value is a real problem to
 * REPORT, and a screen that dies on one punishes the admin for a choice the
 * picker offered. Callers report it and fall back to
 * \`KNOB_ENUM_VOCABULARIES[address].default\`.
 */
export function asKnobEnumValue<A extends KnobEnumAddress>(
  address: A,
  value: string,
): KnobEnumValue<A> | null {
  const vocabulary = KNOB_ENUM_VOCABULARIES[address];
  return (vocabulary.allowed as readonly string[]).includes(value)
    ? (value as KnobEnumValue<A>)
    : null;
}
`;
}

/** Address-level differences between a committed file and a freshly rendered one. */
function diff(committed: string, fresh: string): string[] {
  const parse = (text: string) => {
    const out = new Map<string, string>();
    for (const match of text.matchAll(/^ {2}"([^"]+)": (\{ allowed: .*\}),$/gm)) {
      out.set(match[1], match[2]);
    }
    return out;
  };
  const before = parse(committed);
  const after = parse(fresh);
  const findings: string[] = [];
  for (const [address, vocabulary] of after) {
    if (!before.has(address)) {
      findings.push(`NEW enum knob, missing from the file: ${address} ${vocabulary}`);
    } else if (before.get(address) !== vocabulary) {
      findings.push(
        `VOCABULARY CHANGED: ${address} — file ${before.get(address)} · live ${vocabulary}`,
      );
    }
  }
  for (const address of before.keys()) {
    if (!after.has(address)) {
      findings.push(`NO LONGER an enum knob, still in the file: ${address}`);
    }
  }
  return findings;
}

async function liveRows(): Promise<EnumKnob[]> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `\n[LOUD] check:knob-enum-vocabularies: UNMEASURED — no database credentials ` +
        `(${DB_VARS.join(", ")}).`,
    );
    console.error(
      `  Looked in: ${env.looked.join(", ") || "the environment only"}.\n` +
        "  This guard refuses to print green over an unread source.",
    );
    process.exit(2);
  }
  const client = dbClient(env, "check-knob-enum-vocabularies");
  await client.connect();
  try {
    const result = await client.query(ENUM_SQL);
    return result.rows.map(
      (row: { feature: string; key: string; allowed_values: unknown; default_value: unknown }) => ({
        address: `${row.feature}.${row.key}`,
        allowed: (Array.isArray(row.allowed_values) ? row.allowed_values : []).map(String),
        defaultValue: String(
          typeof row.default_value === "string"
            ? row.default_value
            : JSON.parse(JSON.stringify(row.default_value)),
        ),
      }),
    );
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const selfTest = process.argv.includes("--self-test");
  const rows = await liveRows();
  if (rows.length === 0) {
    console.error(
      "\n[LOUD] check:knob-enum-vocabularies: UNMEASURED — the live database returned NO enum knobs at all.",
    );
    console.error("  That cannot be right, and an empty census is never a clean one.");
    process.exit(2);
  }
  const rendered = render(rows);

  if (!check && !selfTest) {
    writeFileSync(OUT, rendered, "utf8");
    console.log(`Wrote ${rows.length} enum knob vocabulary row(s) to ${OUT}`);
    return;
  }

  let committed = "";
  try {
    committed = readFileSync(OUT, "utf8");
  } catch {
    console.error(`[LOUD] check:knob-enum-vocabularies: ${OUT} does not exist.`);
    console.error("  Fix: pnpm generate:knob-enum-vocabularies");
    process.exit(1);
  }

  if (selfTest) {
    // A guard that cannot be demonstrated failing is not a guard. Plant the
    // EXACT drift measured on 2026-09-17 — a vocabulary missing one of its
    // live values — in memory, and assert it is reported by name.
    const planted = rendered.replace(
      /^ {2}"([^"]+)": \{ allowed: \[([^\]]*), ([^,\]]*)\], (default: [^}]*)\},$/m,
      '  "$1": { allowed: [$2], $4},',
    );
    if (planted === rendered) {
      console.error(
        "[LOUD] check:knob-enum-vocabularies SELF-TEST FAILED: could not plant a stale vocabulary.",
      );
      process.exit(1);
    }
    const plantedFindings = diff(planted, rendered);
    if (plantedFindings.length === 0) {
      console.error(
        "[LOUD] check:knob-enum-vocabularies SELF-TEST FAILED: a vocabulary with a live value " +
          "removed was reported as fresh. The guard cannot say no.",
      );
      process.exit(1);
    }
    console.log(`Self-test: a planted stale vocabulary is reported — ${plantedFindings[0]}`);
  }

  const findings = diff(committed, rendered);
  if (findings.length > 0) {
    console.error(
      "\n[LOUD] check:knob-enum-vocabularies: the committed vocabularies no longer match the live database.",
    );
    for (const finding of findings.slice(0, 20)) console.error(`  ${finding}`);
    if (findings.length > 20) console.error(`  …and ${findings.length - 20} more`);
    console.error("  Fix: pnpm generate:knob-enum-vocabularies, then commit the file.");
    console.error(
      "  Why it matters: a feature whose typed union disagrees with its row refuses a value the",
    );
    console.error("  settings picker offers — the admin makes a legal choice and the screen breaks.");
    process.exit(1);
  }
  console.log(
    `check:knob-enum-vocabularies: ${rows.length} enum knob(s) — the committed vocabularies match the live database.`,
  );
}

main().catch((err) => {
  console.error(
    `[LOUD] check:knob-enum-vocabularies errored, so it measured NOTHING:\n  ${String(
      (err as Error)?.message ?? err,
    )}`,
  );
  process.exit(2);
});
