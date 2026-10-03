// G1 LIVE PART — every declared record view really SHOWS its custom-fields section (lane 7 W5, item CF01).
//
// The static guard (features/unified-data/every-record-view-has-custom-fields.test.ts) proves each view
// DECLARES its token and that the mount is reachable. It cannot see a dead branch, a wrapper that hides
// the section, or a section that renders nothing (I1). This walk reads the generated page→token map
// (lib/record-pages/record-pages.generated.json) and, for each declared token, opens one row that
// admin@admin.com can read and waits for [data-section="custom-fields"] to be visible. The section is
// visible in every state that is honest — fields, "Add field", or the store's one-line sentence why it
// cannot show (data-state names which). A token with no row to open is listed UNMEASURED (a SKIP),
// never passed.
//
// Units:
//   route  with ONE dynamic segment → that URL with the row's id
//   host   (the Detail window/page/peek port) → /detail/<token>/<id> for each token in HOST_TOKENS
//   others (multi-segment routes, query-addressed pages) → unmeasured, named
//
// Rows come from the clone (cloneRead, read-only) and only from organizations admin@admin.com is a member
// of, never Arman's. On live there is no database read: SN_CF_ROWS='{"party":"<id>",…}' supplies them,
// and every token without one is unmeasured.
//
// Plant (custom-fields-section-hidden): CSS hides the section on every page → every measured step FAILS.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openWalk, cloneRead, REPO, TARGET } from "../lib/harness.mjs";

const MAP = JSON.parse(readFileSync(join(REPO, "lib/record-pages/record-pages.generated.json"), "utf8"));
const HOST_TOKENS = ["project", "task", "note", "file", "agent", "meeting", "party", "crm_deal"];
const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const NEVER_ORG = "3e790542-fdaf-40b2-8bf3-658bf94fe67f";

function rowFor(token) {
  const supplied = JSON.parse(process.env.SN_CF_ROWS ?? "{}");
  if (supplied[token]) return supplied[token];
  if (TARGET !== "clone") return null;
  const where = cloneRead(
    `select format('%I.%I', schema_name, table_name) from platform.entity_types where token = '${token.replace(/'/g, "")}'`,
  );
  if (!where) return null;
  const id = cloneRead(
    `select x.id from ${where} x where x.organization_id in (select organization_id from iam.organization_member where user_id = '${ADMIN}') and x.organization_id <> '${NEVER_ORG}' ${
      /deleted_at/.test(cloneRead(`select string_agg(column_name, ',') from information_schema.columns where format('%I.%I', table_schema, table_name) = '${where}'`) ?? "")
        ? "and x.deleted_at is null"
        : ""
    } order by x.organization_id = '0a54df90-eab8-4d07-ab29-81a45fb41e04' desc limit 1`,
  );
  return id || null;
}

const targets = [];
for (const [key, rec] of Object.entries(MAP.records)) {
  if (!key.startsWith("route:") || !rec.tokens) continue;
  const pattern = key.slice("route:".length);
  const segs = pattern.match(/\[[^\]]+\]/g) ?? [];
  for (const token of rec.tokens) targets.push({ key, token, pattern: segs.length === 1 ? pattern : null });
}
if (Object.values(MAP.records).some((r) => r.host)) for (const token of HOST_TOKENS) targets.push({ key: "host:/detail", token, pattern: "/detail/" + token + "/[id]" });
for (const [key, rec] of Object.entries(MAP.records))
  if (!key.startsWith("route:") && rec.tokens) for (const token of rec.tokens) targets.push({ key, token, pattern: null });

const ctx = await openWalk("custom-fields-everywhere");
try {
  const page = await ctx.page("admin", { org: null });
  for (const t of targets) {
    const label = `${t.key} (${t.token})`;
    if (!t.pattern) {
      await ctx.step(["CF01"], label, page, async () => ({ skip: "unmeasured: no single-id URL for this view" }));
      continue;
    }
    const id = rowFor(t.token);
    if (!id) {
      await ctx.step(["CF01"], label, page, async () => ({ skip: `unmeasured: no ${t.token} row admin@admin.com can read` }));
      continue;
    }
    const url = t.pattern.replace(/\[[^\]]+\]/, id);
    await ctx.goto(page, url);
    await ctx.step(["CF01"], label, page, async () => {
      const el = page.locator('[data-section="custom-fields"]').first();
      const visible = await el.waitFor({ state: "visible", timeout: 45000 }).then(() => true, () => false);
      const state = visible ? await el.getAttribute("data-state") : null;
      const text = visible ? (await el.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 140) : "";
      return { ok: visible, detail: visible ? `${url} → ${state}: ${text}` : `${url} → no visible custom-fields section` };
    });
  }
} finally {
  await ctx.finish();
}
