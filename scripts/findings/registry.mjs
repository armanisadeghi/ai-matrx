/**
 * THE FINDINGS REGISTRY — every check converted to the item line (C5), what it watches, how its
 * item gets fixed, and (when it has one) the ACCEPT ADAPTER that writes an accepted key into the
 * check's OWN allowlist/baseline in the format the check already reads (PLAN.md C1: an accept
 * lives with the check, so CI, hand runs and finalize-and-ship all agree).
 *
 * aidream's twin: scripts/findings.py (same interface, same rules).
 * Protocol: common-docs/projects/checks-run-in-the-app/ITEM-PROTOCOL.md · keys: P2-ITEMS.md.
 *
 * An entry:
 *   id       — the runner's row id (scripts/checks/run.mjs --list)
 *   watch    — repo-relative paths the check scans; `findings <paths>` runs it only when one matches
 *   fix      — the exact fix hint printed under each new item
 *   accept   — { files, rule, apply({ key, reason, by, date, root }) } or null   ┐ both from
 *   noAccept — when accept is null: how this check is accepted today            ┘ accept-rules.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { applyAcceptRule, ruleFiles } from "./accept-rules.mjs";
import ACCEPT_RULES from "./accept-rules.json" with { type: "json" };

/**
 * accept / noAccept come from accept-rules.json — the ONE declaration the server's Mark OK button
 * also reads — so the CLI and the app can never disagree about which checks accept or how.
 */
const RULES = ACCEPT_RULES.checks;

function fromRules(id) {
  const entry = RULES[id];
  if (!entry) throw new Error(`scripts/findings/accept-rules.json has no entry for ${id}`);
  if (!entry.accept) return { accept: null, noAccept: entry.no_accept };
  const rule = entry.accept;
  const files = ruleFiles(rule);
  return {
    accept: {
      files,
      rule,
      apply({ key, reason, by, date, root }) {
        const current = Object.fromEntries(
          files.map((rel) => [rel, existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null]),
        );
        for (const [rel, text] of Object.entries(applyAcceptRule(rule, current, { key, reason, by, date }))) {
          writeFileSync(join(root, rel), text);
        }
      },
    },
    noAccept: null,
  };
}

export const FINDINGS_CHECKS = [
  {
    id: "visibility-vocabulary",
    watch: /(\.tsx?$)|^scripts\/visibility-vocab\//,
    fix: "Use the canonical visibility values (features/files/types.ts#Visibility) and normalize legacy reads with toVisibility(); never claim 'only you' where access is wider.",
    ...fromRules("visibility-vocabulary"),
  },
  {
    id: "access-guard-check",
    watch: /(\.(tsx?|sql)$)|^scripts\/access-guards\//,
    fix: "Declare the list's scope (THE VIEW LAW, docs/official/db-rules.md), never read the active org for an access decision, and use the canonical access ladder — the check's own fix line names the exact rule (scripts/access-guards/FEATURE.md).",
    ...fromRules("access-guard-check"),
  },
  {
    id: "url-state-written-outside-the-canonical-primitive",
    watch: /\.tsx?$/,
    fix: "Write the URL through lib/url-state/useUrlState.ts (one param → useUrlState + a codec; a cluster → useMirroredUrlState; a MatrxDataTable → @ai-matrx/design-system/data-table/url-state), never a raw history.pushState/replaceState.",
    ...fromRules("url-state-written-outside-the-canonical-primitive"),
  },
  {
    id: "complete-list-reads-postgrest-silently-caps-at-1000",
    watch: /^(scripts|lib|features|app|utils)\/.*\.tsx?$/,
    fix: "Read a list you treat as complete with readAllRows from @ai-matrx/data/db (PostgREST caps a bare .select() at 1000 rows), or bound it and say so.",
    ...fromRules("complete-list-reads-postgrest-silently-caps-at-1000"),
  },
  {
    id: "api-contract-ratchet",
    watch: /(^(features|app|lib|components|hooks)\/.*\.tsx?$)|^scripts\/api-contracts-baseline/,
    fix: "Call the server through the typed client (lib/api/typed-client.ts, generated api-types) instead of importing the raw python client.",
    ...fromRules("api-contract-ratchet"),
  },
  {
    id: "cx-source-attribution-is-registered",
    watch: /\.tsx?$/,
    fix: "Register the value once in aidream's source-attribution registry and regenerate types/python-generated/source-attribution.ts (pnpm sync-types) — or stamp an already-registered value.",
    ...fromRules("cx-source-attribution-is-registered"),
  },
  {
    id: "record-naming-toasts-carry-their-record",
    watch: /(^(features|lib|app|components|hooks)\/.*\.tsx?$)|^scripts\/record-toasts\.baseline\.json$/,
    fix: "Route the toast through recordToast (lib/toast.ts) so it carries its record and stays until read.",
    ...fromRules("record-naming-toasts-carry-their-record"),
  },
  {
    id: "access-errors-surfaces-that-guess-why-a-read-failed",
    watch: /^(app|features|components|lib|hooks)\/.*\.tsx?$/,
    fix: "Render the failure through the shared access presenter (<AccessGate>/recordUnavailable) and read the hook's error instead of guessing why a read failed.",
    ...fromRules("access-errors-surfaces-that-guess-why-a-read-failed"),
  },
  // ── Batch 2 (2026-09-26). None has an adapter: each list is a TypeScript module, a code set, a
  // register row, or a ratchet whose own law says it ONLY SHRINKS by a hand edit carrying a reason.
  {
    id: "no-dead-ends-door-law",
    watch: /(^(app|features|components|lib)\/.*\.tsx?$)|^scripts\/dead-ends\//,
    fix: "Make the named record open (EntityRef / peek / window) or ship the fix for the detected problem — invoke the `no-dead-ends` skill.",
    ...fromRules("no-dead-ends-door-law"),
  },
  {
    id: "type-escape-hatch-ratchet",
    watch: /(\.tsx?$)|^scripts\/type-escape-baseline\.json$/,
    fix: "Remove the new escape hatch (as unknown as, any, @ts-ignore …) by fixing the type against the generated types — invoke the `type-safety` skill.",
    ...fromRules("type-escape-hatch-ratchet"),
  },
  {
    id: "ui-primitives-check",
    watch: /^(app|features|components)\/.*\.tsx$/,
    fix: "Use the official primitive the check names (components/official/, @/components/ui/*) instead of the raw element.",
    ...fromRules("ui-primitives-check"),
  },
  {
    id: "settings-new-knob-shaped-constants-ratchet",
    watch: /(\.(tsx?|py)$)|^scripts\/settings-hardcoded-allowlist\.json$/,
    fix: "Register the value in platform.feature_knob and read it through the resolution API (lib/knobs/featureKnobs.ts; aidream services/feature_knobs), or add a `KNOB MIRROR` comment when it mirrors a knob.",
    ...fromRules("settings-new-knob-shaped-constants-ratchet"),
  },
  {
    id: "package-logic-re-grown-outside-its-package",
    watch: /(\.tsx?$)|^scripts\/check-package-twins/,
    fix: "Import the logic from its @ai-matrx package instead of re-growing it here (the check names the package and export).",
    ...fromRules("package-logic-re-grown-outside-its-package"),
  },
  {
    id: "scroll-chain-clipped-tables-lists",
    watch: /^(app|features|components)\/.*\.tsx$/,
    fix: "Make every ancestor of the `flex-1 min-h-0` scroll area `flex flex-col` (the break is usually in another file) and consume useClippedContentGuard (lib/layout/).",
    ...fromRules("scroll-chain-clipped-tables-lists"),
  },
  {
    id: "canonical-agent-model-pickers",
    watch: /\.tsx?$/,
    fix: "Use the ONE agent picker (@ai-matrx/agents/catalog/react) or the canonical model picker instead of a local one.",
    ...fromRules("canonical-agent-model-pickers"),
  },
  {
    id: "surfaces-running-an-agent-without-naming-it",
    watch: /(^(app|features|components)\/.*\.tsx?$)|^features\/surfaces\/manifests\//,
    fix: "Register the surface's fixed job in the top Agents menu (manifest agentRole with mandateKey, or useDeclaredSurfaceMandates) — invoke the `agent-disclosure` skill; never add visible page content.",
    ...fromRules("surfaces-running-an-agent-without-naming-it"),
  },
  {
    id: "route-metadata-and-favicons",
    watch: /^app\/.*(page|layout)\.tsx$/,
    fix: "Export route metadata via createRouteMetadata / createDynamicRouteMetadata with a favicon — invoke the `route-metadata-favicons` skill.",
    ...fromRules("route-metadata-and-favicons"),
  },
];

export const byId = (id) => FINDINGS_CHECKS.find((c) => c.id === id);
