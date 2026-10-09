/**
 * THE FINDINGS REGISTRY — every check converted to the item line (C5), what it watches, how its
 * item gets fixed, and (when it has one) the ACCEPT ADAPTER that writes an accepted key into the
 * check's OWN allowlist/baseline in the format the check already reads (PLAN.md C1: an accept
 * lives with the check, so CI, hand runs and finalize-and-ship all agree).
 *
 * aidream's twin: scripts/findings.py (same interface, same rules).
 * Protocol: common-docs/systems/architecture/observability/projects/checks-run-in-the-app/PLAN.md · keys: P2-ITEMS.md.
 *
 * An entry:
 *   id       — the runner's row id (scripts/checks/run.mjs --list)
 *   watch    — repo-relative paths the check scans; `findings <paths>` runs it only when one matches
 *   fix      — the exact fix hint printed under each new item (all classes)
 *   fixFor   — optional (key) → the remedy for THAT item's class, when the check has several
 *   accept   — { files, rule, apply({ key, reason, by, date, root }) } or null   ┐ both from
 *   noAccept — when accept is null: how this check is accepted today            ┘ accept-rules.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { applyAcceptRule, readUtf8Strict, ruleFiles } from "./accept-rules.mjs";
import ACCEPT_RULES from "./accept-rules.json" with { type: "json" };
import { SUMMARY as VISIBILITY_SUMMARY, remedyForKey as visibilityRemedyForKey } from "../visibility-vocab/remedies.mjs";
import { featureRegExp } from "../lib/source-roots.cjs";
import { remedyForKey as uiDriftRemedyForKey } from "../ui-drift/check-ui-drift.mjs";
import { remedyForKey as oneControlRemedyForKey } from "../one-control/check-one-control.mjs";
import { remedyForKey as fillSecretRemedyForKey } from "../fill-secret/check-fill-secret.mjs";
import { remedyForKey as pageTopRemedyForKey } from "../page-top/check-page-top.mjs";

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
          files.map((rel) => [rel, existsSync(join(root, rel)) ? readUtf8Strict(join(root, rel)) : null]),
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
    // THE ONE-VERSION LAW (Arman, 2026-10-05): one chat input, one variables
    // form, one Enter-to-send… A box a person types a message into that is not
    // SmartAgentInput is the first thing it names (2026-10-08: /make).
    id: "one-version-of-each-canonical-piece",
    watch: /\.tsx?$|^scripts\/one-version\//,
    fix: "Render the canonical piece the item names (a message box → SmartAgentInput; a headless one-shot run → SmartAgentInput + adoptHeadlessAgentJson). Never add to scripts/one-version/baseline.json.",
    ...fromRules("one-version-of-each-canonical-piece"),
  },
  {
    id: "visibility-vocabulary",
    watch: /(\.tsx?$)|^scripts\/visibility-vocab\//,
    // One remedy per class of finding, each proven importable and accepted by the check
    // (scripts/visibility-vocab/remedies.test.mjs).
    fix: VISIBILITY_SUMMARY,
    fixFor: visibilityRemedyForKey,
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
    watch: featureRegExp(/^(scripts|lib|features|app|utils)\/.*\.tsx?$/),
    fix: "Read a list you treat as complete with readAllRows from @ai-matrx/data/db (PostgREST caps a bare .select() at 1000 rows), or bound it and say so.",
    ...fromRules("complete-list-reads-postgrest-silently-caps-at-1000"),
  },
  {
    id: "api-contract-ratchet",
    watch: featureRegExp(/(^(features|app|lib|components|hooks)\/.*\.tsx?$)|^scripts\/api-contracts-baseline/),
    fix: "Call the server through the typed client (lib/api/typed-client.ts, generated api-types) instead of importing the raw python client.",
    ...fromRules("api-contract-ratchet"),
  },
  {
    id: "cx-source-attribution-is-registered",
    watch: /\.tsx?$/,
    fix: "Register the value once in aidream's source-attribution registry and regenerate @ai-matrx/agents/generated/source-attribution (aidream: uv run python scripts/generate_types.py source-attribution; then pnpm sync-types here) — or stamp an already-registered value.",
    ...fromRules("cx-source-attribution-is-registered"),
  },
  {
    id: "record-naming-toasts-carry-their-record",
    watch: featureRegExp(/(^(features|lib|app|components|hooks)\/.*\.tsx?$)|^scripts\/record-toasts\.baseline\.json$/),
    fix: "Route the toast through recordToast (lib/toast.ts) so it carries its record and stays until read.",
    ...fromRules("record-naming-toasts-carry-their-record"),
  },
  {
    id: "access-errors-surfaces-that-guess-why-a-read-failed",
    watch: featureRegExp(/^(app|features|components|lib|hooks)\/.*\.tsx?$/),
    fix: "Render the failure through the shared access presenter (<AccessGate>/recordUnavailable) and read the hook's error instead of guessing why a read failed.",
    ...fromRules("access-errors-surfaces-that-guess-why-a-read-failed"),
  },
  // ── Batch 2 (2026-09-26). None has an adapter: each list is a TypeScript module, a code set, a
  // register row, or a ratchet whose own law says it ONLY SHRINKS by a hand edit carrying a reason.
  {
    id: "no-dead-ends-door-law",
    watch: featureRegExp(/(^(app|features|components|lib)\/.*\.tsx?$)|^scripts\/dead-ends\//),
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
    watch: featureRegExp(/^(app|features|components)\/.*\.tsx$/),
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
    watch: featureRegExp(/^(app|features|components)\/.*\.tsx$/),
    fix: "Make every ancestor of the `flex-1 min-h-0` scroll area `flex flex-col` (the break is usually in another file) and consume useClippedContentGuard (lib/layout/).",
    ...fromRules("scroll-chain-clipped-tables-lists"),
  },
  {
    id: "binder-errors-duplicate-declarations-missing-exports",
    watch: /\.tsx?$/,
    fix: "Delete or rename the second top-level declaration / duplicate import, or import a name the target module really exports (pnpm check:binder names the file and line).",
    ...fromRules("binder-errors-duplicate-declarations-missing-exports"),
  },
  {
    id: "floating-clearance",
    watch: featureRegExp(/^(app|features|components|lib)\/.*\.tsx$/),
    fix: "Delete the page scroller's hand-written bottom clearance (pb-safe / pb-[…safe-area…] / pb-16+) — the shell's floating-clearance runway owns it (lib/layout/floating-chrome.ts) — or give a data-floating-clearance=\"off\" opt-out its `// ui-exception:` reason.",
    ...fromRules("floating-clearance"),
  },
  {
    id: "ssr-viewport-branch",
    watch: featureRegExp(/^(app|features|components|lib|providers|packages\/[^/]+\/src)\/.*\.tsx$/),
    fix: "Render both trees and let CSS pick (md:hidden / hidden md:block, or @container) — or keep useIsMobile to behaviour (props, handlers, effects). Two stateful trees that must not both mount: `// ssr-viewport-ok: request-hinted …` (ViewportHintProvider answers the server render).",
    ...fromRules("ssr-viewport-branch"),
  },
  {
    id: "canonical-agent-model-pickers",
    watch: /\.tsx?$/,
    fix: "Use the ONE agent picker (@ai-matrx/agents/catalog/react) or the canonical model picker instead of a local one.",
    ...fromRules("canonical-agent-model-pickers"),
  },
  {
    id: "surfaces-running-an-agent-without-naming-it",
    watch: featureRegExp(/(^(app|features|components)\/.*\.tsx?$)|^features\/surfaces\/manifests\//),
    fix: "Register the surface's fixed job in the top Agents menu (manifest agentRole with mandateKey, or useDeclaredSurfaceMandates) — invoke the `agent-disclosure` skill; never add visible page content.",
    ...fromRules("surfaces-running-an-agent-without-naming-it"),
  },
  {
    // docs/ui-unification-plan.md §2.12 — scans only the given files when `findings <paths>` names
    // them (MATRX_FINDINGS_PATHS), so a changed-files run takes about a second.
    id: "ui-drift",
    watch: /\.tsx$/,
    fix: "Use the design system instead of re-styling it: placement-only classes on primitives, semantic colour tokens, the type scale, the shared spinner, overlays and tabs — the item's own fix line names the rule.",
    fixFor: uiDriftRemedyForKey,
    ...fromRules("ui-drift"),
  },
  {
    // THE ONE CONTROL (package FEATURE.md § THE ONE CONTROL): retired uc-* prototype classes and
    // visual className/style on @ai-matrx/design-system/controls. Same rule as ESLint matrx/one-control.
    id: "one-control",
    watch: /\.tsx$/,
    fix: "Render the package control (@ai-matrx/design-system/controls) as it is; className is placement only.",
    fixFor: oneControlRemedyForKey,
    ...fromRules("one-control"),
  },
  {
    // A secret filled with a bare fill call echoes in Playwright's timeout error (2026-10-05, test admin
    // password in a transcript). scripts/lib/seat-browser.mjs fillSecret scrubs it.
    id: "bare-secret-fill",
    watch: /^(scripts|e2e)\/.*\.(m?js|cjs|tsx?)$/,
    fix: "Fill it with fillSecret(page, selector, value) or fillSecret(locator, undefined, value) from scripts/lib/seat-browser.mjs.",
    fixFor: fillSecretRemedyForKey,
    ...fromRules("bare-secret-fill"),
  },
  {
    // PAGE-TOP TEMPLATES (features/shell/FEATURE.md § Page-top templates): a raw <PageHeader> row,
    // or a sentence under a page title. Shrink-only baseline scripts/page-top/baseline.json.
    id: "page-top",
    watch: /\.tsx$/,
    fix: "Use a page-top template (RecordPageHeader / EntityListPage / ModuleLanding / the workspace header); no sentence under a title.",
    fixFor: pageTopRemedyForKey,
    ...fromRules("page-top"),
  },
  {
    // 2026-10-05: components/ui imported design-system 0.66 controls while the lockfile installed
    // 0.64.0. Narrows to the given files (a changed manifest or lockfile scans everything).
    id: "every-ai-matrx-import-exists-in-the-installed-package",
    watch: /(\.(ts|tsx|mts|cts|js|jsx|mjs)$)|^(package\.json|pnpm-lock\.yaml)$/,
    fix: "The app uses a package API the installed version does not ship. Wait for the package's tarball, `pnpm sync:matrx-packages`, commit the lockfile — never pin, never delete the import to go green.",
    ...fromRules("every-ai-matrx-import-exists-in-the-installed-package"),
  },
  {
    id: "every-ai-matrx-version-in-the-lockfile-is-served-by-npm",
    watch: /^(package\.json|pnpm-lock\.yaml)$/,
    fix: "The lockfile names a version npm does not serve yet. Wait for its tarball to answer 200, then `pnpm sync:matrx-packages` (it waits for you).",
    ...fromRules("every-ai-matrx-version-in-the-lockfile-is-served-by-npm"),
  },
  {
    id: "route-metadata-and-favicons",
    watch: /^app\/.*(page|layout)\.tsx$/,
    fix: "Export route metadata via createRouteMetadata / createDynamicRouteMetadata with a favicon — invoke the `route-metadata-favicons` skill.",
    ...fromRules("route-metadata-and-favicons"),
  },
];

export const byId = (id) => FINDINGS_CHECKS.find((c) => c.id === id);
