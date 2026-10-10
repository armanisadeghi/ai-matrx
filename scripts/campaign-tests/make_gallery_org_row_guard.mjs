#!/usr/bin/env npx tsx
var _a, _b;
/**
 * LANE MAKE-HOME wave 4 — D2 GUARD: an organization's saved template appears ONLY in that
 * organization's row of the /make gallery, on the dev clone, as the person.
 *
 * One transaction, ROLLED BACK at the end (nothing it makes survives). Two organization templates are
 * declared by the runner role from one of lane 8's authored specs (through templateDeclaration):
 *   · "Cedar Ridge front desk" saved by Cedar Ridge Physical Therapy (test@test.com and admin are members)
 *   · "Brennan & Vogel client intake"       saved by Brennan & Vogel Family Law    (admin only)
 * Then the gallery's OWN row code (features/make/gallery/catalogue.ts: orgRowFilter → custom.templates →
 * orgRowCards) runs through role `authenticated` with each person's claims:
 *
 *   R1  test@test.com, Cedar Ridge row  → holds Cedar Ridge's template, never admin's Brennan one
 *   R2  admin,         Cedar Ridge row  → the same, although admin is in BOTH organizations
 *   R3  admin,         Brennan row    → holds the Brennan template, never Cedar Ridge's
 *   R4  test@test.com, Brennan row    → empty (she is not in Brennan & Vogel)
 *
 *   npx tsx scripts/campaign-tests/make_gallery_org_row_guard.mts
 * Plant (never in the tracked tree): copy catalogue.ts to a scratch directory, break orgRowFilter or
 * orgRowCards there, and run with MAKE_GALLERY_CATALOGUE=<scratch copy> — R1/R2 turn red.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { dsnFor, pgClient } from "../lib/pooled-db.mjs";
import { templateDeclaration } from "@ai-matrx/records/templates";
const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd"; // admin@admin.com
const TEST = "4060701e-706a-4c76-b3ca-0bbc69fa5a14"; // test@test.com
const CEDAR = "0a54df90-eab8-4d07-ab29-81a45fb41e04"; // Cedar Ridge Physical Therapy (both are members)
const BRENNAN = "13764fab-7475-4174-8cf8-978e3e93cbb6"; // Brennan & Vogel Family Law (admin reaches it; test@test.com does not)
const catalogueModule = (_a = process.env.MAKE_GALLERY_CATALOGUE) !== null && _a !== void 0 ? _a : resolve(import.meta.dirname, "../../features/make/gallery/catalogue.ts");
const { orgRowFilter, orgRowCards } = (await import(pathToFileURL(catalogueModule).href));
// One real spec from lane 8's catalogue, declared twice under organization-scoped catalogue ids.
const TEMPLATES = resolve(import.meta.dirname, "../../../aidream/apps/shared/records/templates/healthcare");
const specFile = (_b = readdirSync(TEMPLATES).find((f) => f.includes("physical-therapy"))) !== null && _b !== void 0 ? _b : readdirSync(TEMPLATES)[0];
const spec = JSON.parse(readFileSync(join(TEMPLATES, specFile), "utf8"));
const declare = (org, catalogueId, name) => {
    const d = templateDeclaration({ ...spec, catalogueId }, org);
    return { ...d, card: { ...d.card, name } };
};
const c = pgClient(pg, dsnFor("clone", { app: "make-gallery-org-row-guard" }));
await c.connect();
const results = [];
try {
    await c.query("begin");
    await c.query("set local statement_timeout = '120s'");
    for (const [org, cat, name] of [
        [CEDAR, "MGROW-CEDAR", "Cedar Ridge front desk"],
        [BRENNAN, "MGROW-BRENNAN", "Brennan & Vogel client intake"],
    ]) {
        await c.query("select custom.template_declare('org', $1::jsonb)", [JSON.stringify(declare(org, cat, name))]);
    }
    const row = async (person, org) => {
        await c.query("savepoint s");
        await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: person, role: "authenticated" })]);
        const r = await c.query("select custom.templates($1::jsonb) as a, iam.has_org_access($2::uuid) as member", [JSON.stringify(orgRowFilter(org)), org]);
        if (process.env.DEBUG)
            console.log(person.slice(0, 8), org.slice(0, 8), "member:", r.rows[0].member, "total:", r.rows[0].a.total);
        await c.query("rollback to savepoint s");
        await c.query("reset role");
        return orgRowCards(r.rows[0].a.cards, org).map((card) => card.catalogue_id);
    };
    const check = (id, got, want, never) => {
        const ok = want.every((w) => got.includes(w)) && never.every((n) => !got.includes(n));
        results.push({ id, ok, detail: `row = [${got.join(", ")}]` });
    };
    check("R1 test@test.com · Cedar Ridge row", await row(TEST, CEDAR), ["MGROW-CEDAR"], ["MGROW-BRENNAN"]);
    check("R2 admin · Cedar Ridge row", await row(ADMIN, CEDAR), ["MGROW-CEDAR"], ["MGROW-BRENNAN"]);
    check("R3 admin · Brennan row", await row(ADMIN, BRENNAN), ["MGROW-BRENNAN"], ["MGROW-CEDAR"]);
    check("R4 test@test.com · Brennan row", await row(TEST, BRENNAN), [], ["MGROW-BRENNAN", "MGROW-CEDAR"]);
}
finally {
    await c.query("rollback").catch(() => undefined);
    await c.end().catch(() => undefined);
}
for (const r of results)
    console.log(`${r.ok ? "GREEN" : "RED  "} ${r.id} — ${r.detail}`);
const red = results.filter((r) => !r.ok).length;
console.log(red ? `${red} of ${results.length} RED` : `all ${results.length} GREEN (rolled back; nothing survives)`);
process.exit(red || results.length !== 4 ? 1 : 0);
