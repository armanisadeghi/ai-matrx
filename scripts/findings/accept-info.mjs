/**
 * What the app's check-findings page needs from the accept rules — and nothing else.
 *
 * PURE: imports only accept-rules.json. The page used to import registry.mjs (the CLI registry),
 * which imports a dozen filesystem-scanning check scripts; Turbopack then traced ~22,000 repo
 * files (migrations, docs, scripts, all feature source, typescript, eslint) into the page's
 * server function (2026-10-09). Never import a CLI script module from app code — read the data.
 */
import ACCEPT_RULES from "./accept-rules.json" with { type: "json" };

/** Every check id → the files a Mark OK writes (null when it cannot accept) and why not. */
export function frontendAcceptInfo() {
  const info = {};
  for (const [id, entry] of Object.entries(ACCEPT_RULES.checks)) {
    const rule = entry.accept;
    info[id] = rule
      ? { files: rule.reasons_file ? [rule.file, rule.reasons_file] : [rule.file], noAccept: null }
      : { files: null, noAccept: entry.no_accept ?? null };
  }
  return info;
}
