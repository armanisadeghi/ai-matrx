/**
 * migration-rule-dates.ts — WHEN each of db:apply's refusing rules came into force.
 *
 * 🚨 CHAIR RULING 2026-09-26 (lane CLONE-LEDGER-VERDICTS), rule 2: a file production RAN is judged
 * by the rules in force at ITS production applied_at, not by today's (grandfathering).
 *
 * The nightly catch-up replays production's ledger onto the dev clone through this runner at
 * `--target clone`. Every rule the runner has gained since a file ran is a rule production never
 * held that file to, so the clone refused history production accepted:
 *   · agx_wfx_duplicate_names_its_organization.sql and league_set_opt_in_names_its_organization.sql
 *     ran on production at 00:33Z / 00:48Z on 2026-09-24; the DROP-then-recreate `-- based-on:`
 *     rule landed at 05:56Z that day;
 *   · rcb11_comments_realtime_publication.sql ran at 12:31Z on 2026-09-25; the lock-timeout
 *     ceiling landed at 22:55Z that day.
 * So the catch-up passes `--judged-as-of <production applied_at>` and, for a rule introduced AFTER
 * that moment, the runner prints "ran under older rules" instead of refusing. The flag is refused
 * at every target but `clone` (index: `judgedAsOfRefusal`), so production — where a file has no
 * earlier apply to be judged by — can never be handed a grandfathered file.
 *
 * A rule is added here when it is born: its id, the moment its commit landed (UTC), the commit and
 * what it refuses. Rules that predate every ledgered file need no row (they were always in force).
 */
export interface DatedRule {
  /** ISO-8601 UTC, the commit time of the change that introduced the refusal. */
  readonly at: string;
  readonly commit: string;
  readonly what: string;
}

export const RULE_INTRODUCED = {
  "dd220-drop-recreate": {
    at: "2026-09-24T05:56:50Z",
    commit: "08af876e8a RUNNER-DROP-BASEDON",
    what: "a DROP FUNCTION/TRIGGER/VIEW the same file recreates must declare, by hash, the body it destroys",
  },
  "lock-timeout-ceiling": {
    at: "2026-09-25T22:55:15Z",
    commit: "1c4023b3c0 LOCK-QUEUE",
    what: "a file may not raise its own lock wait or statement ceiling past the runner's",
  },
} as const satisfies Record<string, DatedRule>;

export type RuleId = keyof typeof RULE_INTRODUCED;

/** Parse a production `applied_at` (`2026-09-24 00:33:51.698824+00` or ISO) — null when unreadable. */
export function parseAppliedAt(text: string): Date | null {
  const t = text.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The sentence the runner prints INSTEAD of refusing, when `rule` was introduced after the moment
 * production ran the file; null when the rule was already in force then (the refusal stands).
 */
export function ranUnderOlderRules(rule: RuleId, judgedAsOf: Date | null): string | null {
  if (!judgedAsOf) return null;
  const r = RULE_INTRODUCED[rule];
  if (new Date(r.at).getTime() <= judgedAsOf.getTime()) return null;
  return (
    `ran under older rules: production ran this file at ${judgedAsOf.toISOString()}, before rule ` +
    `\`${rule}\` (${r.what}) came into force at ${r.at} (${r.commit}). Judged by the rules of its ` +
    `own apply, as the chair ruled 2026-09-26; not refused.`
  );
}

/** `--judged-as-of` is a clone-only fact: production has no earlier apply of a file to be judged by. */
export function judgedAsOfRefusal(target: string, raw: string | null): string | null {
  if (raw === null) return null;
  if (target !== "clone")
    return (
      `--judged-as-of is accepted only at --target clone (got --target ${target}). It exists so the ` +
      `nightly catch-up can judge history production already ran by the rules of that apply; a file ` +
      `reaching ${target} is judged by today's rules, always.`
    );
  if (!parseAppliedAt(raw)) return `--judged-as-of ${raw} is not a timestamp (want production's applied_at).`;
  return null;
}

/** No database: the dates, the comparison and the refusal, RED cases first. */
export function ruleDatesSelfTest(log: (s: string) => void = console.log): number {
  let fails = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    log(`${ok ? "  ok   " : "  FAIL "}${label}`);
    if (!ok) {
      fails++;
      if (detail) log(`        ${detail}`);
    }
  };
  const agx = parseAppliedAt("2026-09-24 00:33:51.698824+00");
  const rcb11 = parseAppliedAt("2026-09-25 12:31:06.259093+00");
  const later = parseAppliedAt("2026-09-26 04:13:17+00");
  check("production's applied_at text parses", agx?.toISOString() === "2026-09-24T00:33:51.698Z", String(agx));
  check("RED-1 a file run AFTER a rule was born is still refused by it",
    ranUnderOlderRules("dd220-drop-recreate", later) === null && ranUnderOlderRules("lock-timeout-ceiling", later) === null);
  check("RED-2 no --judged-as-of means today's rules", ranUnderOlderRules("dd220-drop-recreate", null) === null);
  check("RED-3 --judged-as-of at production is refused by name", judgedAsOfRefusal("production", "2026-09-24 00:33:51+00") !== null);
  check("RED-4 an unreadable --judged-as-of is refused", judgedAsOfRefusal("clone", "yesterday-ish") !== null);
  const s = ranUnderOlderRules("dd220-drop-recreate", agx);
  check("GREEN-1 agx_wfx (00:33Z) predates the DROP-then-recreate rule (05:56Z) -> ran under older rules",
    s !== null && s.startsWith("ran under older rules") && s.includes("08af876e8a"), String(s));
  check("GREEN-2 rcb11 realtime (12:31Z) predates the lock ceiling (22:55Z) -> ran under older rules",
    ranUnderOlderRules("lock-timeout-ceiling", rcb11) !== null);
  check("GREEN-3 --judged-as-of at the clone is accepted", judgedAsOfRefusal("clone", "2026-09-24 00:33:51+00") === null);
  log(`migration rule dates self-test: ${fails ? `${fails} FAILED` : "PASS"}`);
  return fails ? 1 : 0;
}
