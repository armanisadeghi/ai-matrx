/**
 * THE ALL-ORGANIZATIONS PAGING DETECTOR (lane ALL-ORGS-PAGING, 2026-10-01).
 *
 * The class (DATA-HOME-3B2 found it in custom.archived_tables_everywhere; this lane in
 * custom.work_list and custom.work_inbox): a door that, with no organization named, asks EVERY
 * organization for `limit + offset` rows in ONE call. Any page past that organization's ceiling is
 * refused (22023 PAGE-1: 400 on production at offset 1000), and every page re-pays every
 * organization (57014 under the signed-in 8 s clock: 500). The fix is to read each organization in
 * pages within its own ceiling until it has given `limit + offset` rows or a short page.
 *
 * What this flags: a function body that reaches the caller's organizations (iam.my_orgs,
 * iam.organization_member, iam.organizations) AND passes `<limit> + <offset>` (either order) as an
 * argument of a call. Pure text over pg_get_functiondef, so the self-test can feed it real bodies.
 */

const ORG_FANOUT = /\b(iam\.my_orgs\s*\(|iam\.organization_members?\b|iam\.organizations\b)/i;
const LIMITISH = String.raw`(?:p_|v_)?(?:limit|lim|cap|page_size|size|need)\w*`;
const OFFSETISH = String.raw`(?:p_|v_)?(?:offset|off)\w*`;
const SUM = new RegExp(
  String.raw`\b(?:${LIMITISH}\s*\+\s*${OFFSETISH}|${OFFSETISH}\s*\+\s*${LIMITISH})\b`,
  "i",
);

/** Every `name(args)` call whose own argument list (no nested parentheses) holds limit + offset. */
export function findAllOrgsPaging(def: string): string[] {
  if (!ORG_FANOUT.test(def)) return [];
  // Strip line comments so prose about the old shape is never a hit.
  const code = def.replace(/--[^\n]*/g, "");
  const hits: string[] = [];
  // Innermost-first: check each `name(args)` whose args hold no parentheses, then collapse it to a
  // placeholder so the call around it is checked next with its own arguments only.
  const call = /\b([a-z_][\w]*(?:\.[a-z_][\w]*)?)?\s*\(([^()]*)\)/gi;
  let text = code;
  for (let guard = 0; guard < 10_000; guard++) {
    let changed = false;
    text = text.replace(call, (_all, name: string | undefined, args: string) => {
      changed = true;
      if (name && !/^(least|greatest|coalesce|nullif)$/i.test(name)) {
        const s = SUM.exec(args);
        if (s) hits.push(`${name}(… ${s[0]} …)`);
      }
      return " _x_ ";
    });
    if (!changed) break;
  }
  return hits;
}
