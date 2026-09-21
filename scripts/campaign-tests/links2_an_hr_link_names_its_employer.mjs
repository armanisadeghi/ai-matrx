// links2_an_hr_link_names_its_employer.mjs — lane LINKS-2's one walk.
//
// THE USE CASE, and every row in it is already on this database: Oak Street Studio, a
// thirty-person photography and design studio, runs its leave requests through the HR
// workflow; when a request is submitted the manager gets a notice whose deep link is meant
// to open THAT request — and HR is strictly single-employer, so the link has to say which
// employer it belongs to or it opens whichever one the picker happens to hold.
//
// WHAT IS BEING PROVEN. `hr._wf_notify` — the live producer, as of
// migrations/campaign/links2_an_hr_link_names_its_employer.sql — now builds its deep link
// through `hr.link_names_its_employer`, which delegates to the ONE rule
// `platform.link_carries_its_organization` and then holds /hr's own floor. This walk calls
// that producer for a REAL Oak Street Studio leave request, reads the link it actually
// wrote, and follows it COLD.
//
// 🚨 NOTHING IS LEFT BEHIND. The producer is called inside a transaction that is ROLLED
// BACK, so the link is the real one the real function writes and no notice row, no test
// organization and no invented person survives the run.
//
// 🚨 THE CONTROLS GO THE OTHER WAY. Clause 4 follows the SAME link with `org=` stripped off,
// cold, and requires that it does NOT leave the session working in Oak Street Studio — which
// is the 2026-08-28 defect, where one bare `/hr/tasks` link rewrote every subsequent link to a
// different employer. Clause 5 follows the same path naming a DIFFERENT real employer this
// account works for and requires the session to end up THERE. Without both, a green clause 3
// could just mean the browser happened to be in the right employer already.
//
// WHAT IS MEASURED IS THE EMPLOYER THE SESSION ENDS IN (`matrx-active-org`), not a word on the
// page: `/hr/tasks/<id>` renders the request from the id in the path whichever employer you are
// working in, so reading the screen would prove nothing about the link.
//
// Each walk gets its OWN fresh browser context: no cookie, no localStorage, no IndexedDB.
// Cold is the whole point — a warm tab already knows an employer and proves nothing.
//
//   node scripts/campaign-tests/links2_an_hr_link_names_its_employer.mjs
//
// Port 3047 is lane LINKS-2's own, from scripts/campaign-ports.json. Override with
// LINKS2_ORIGIN when driving a server that is already up.

import { chromium } from "playwright";
import { config } from "dotenv";
import pg from "pg";
import { signIn, until, sleep } from "../lib/seat-browser.mjs";

config({ path: new URL("../../.env", import.meta.url).pathname });
config({ path: new URL("../../.env.local", import.meta.url).pathname });
// The five SUPABASE_MATRIX_* variables that name the main database live in aidream/.env —
// the same place scripts/lib/direct-db-env.ts reads them from. Nothing is printed from here.
config({ path: new URL("../../../aidream/.env", import.meta.url).pathname });

const PORT = 3047; // scripts/campaign-ports.json → lanes["LINKS-2"]
const ORIGIN = process.env.LINKS2_ORIGIN ?? `http://localhost:${PORT}`;
const EMAIL = process.env.AI_ADMIN_USERNAME ?? "admin@admin.com";
const PASSWORD = process.env.AI_ADMIN_PASSWORD;

// Read off the live database, never invented.
const ORG = "2643e470-b275-47f3-95f3-ae275ad3ca47"; // Oak Street Studio
const ORG_NAME = "Oak Street Studio";
const INSTANCE = "b9eef51c-3aa8-435f-bd48-8be7e3a56945"; // a real leave_request
const STEP = "ac9b14d0-b2ae-4c9d-9744-fa9fd59ca01c"; // its manager_approval step
const USER = "87a6e699-3622-4869-8843-d0867456c0dd"; // admin@admin.com
const EMPLOYMENT = "9c0b1d0c-a3d2-4ea1-b66b-0c45e5b0027a"; // admin's employment at the studio

// A SECOND REAL EMPLOYER admin@admin.com works for, used as the control that goes the other way.
const OTHER = "7cd12da2-2213-4378-8fba-a9e2dc4ea657";
const OTHER_NAME = "Castellano & Reyes, LLP";

let failures = 0;
const clause = (n, ok, said) => {
  if (!ok) failures += 1;
  console.log(`CLAUSE ${n} ${ok ? "OK" : "RED"}: ${said}`);
};

/** The link the LIVE producer writes, for a real request — then rolled back. */
async function linkTheProducerWrites() {
  const env = (k) => {
    const line = process.env[k];
    if (!line) throw new Error(`${k} is not in the environment`);
    return line;
  };
  const client = new pg.Client({
    host: env("SUPABASE_MATRIX_HOST"),
    port: Number(env("SUPABASE_MATRIX_PORT")),
    user: env("SUPABASE_MATRIX_USER"),
    password: env("SUPABASE_MATRIX_PASSWORD"),
    database: env("SUPABASE_MATRIX_DATABASE_NAME"),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(
      "select hr._wf_notify($1::uuid, $2::uuid, 'hr.workflow.request_submitted', 'receipt', $3::uuid, $4::uuid)",
      [INSTANCE, STEP, USER, EMPLOYMENT],
    );
    const { rows } = await client.query(
      `select deep_link, payload ->> 'deep_link' as payload_link, organization_id
         from communication.notification
        where recipient_user_id = $1::uuid
          and dedupe_key like 'hrwf:' || $2::text || ':%'
        order by created_at desc limit 1`,
      [USER, STEP],
    );
    return rows[0] ?? null;
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end().catch(() => {});
  }
}

async function cold(browser, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, ORIGIN, EMAIL, PASSWORD);
  // Cold means cold: whatever the sign-in remembered about an employer goes.
  await context.clearCookies({ name: "matrx-active-org" });
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const read = () =>
    page.evaluate(() => (document.querySelector("main") ?? document.body)?.innerText ?? "");
  // A clause read while the page still says it is checking is a flake, not a finding.
  await until(
    "the page settles",
    async () => {
      const t = await read();
      if (t.trim().length < 40) return null;
      if (/Checking whether|Loading|Resolving/i.test(t) && t.trim().length < 400) return null;
      return t;
    },
    60000,
  );
  await sleep(5000);
  const text = await read();
  // 🚨 THE THING TO MEASURE IS THE EMPLOYER THE SESSION ENDS IN, NOT A WORD ON THE PAGE.
  // `/hr/tasks/<id>` renders the request from the id in the path whichever employer you are
  // working in, so reading the screen for a name proves nothing about the link. The active
  // employer — `matrx-active-org`, `<userId>:<organizationId>`, the cookie the platform's own
  // org-selection primitive writes on every real change — is what the link either sets or
  // leaves to chance, and it is what every SUBSEQUENT link in the session resolves against.
  const cookies = await context.cookies();
  const raw = cookies.find((c) => c.name === "matrx-active-org")?.value;
  const activeOrg = raw ? decodeURIComponent(raw).split(":").pop() : null;
  await context.close();
  return { text, activeOrg };
}

const main = async () => {
  if (!PASSWORD) throw new Error("AI_ADMIN_PASSWORD is not in the environment.");

  const written = await linkTheProducerWrites();
  if (!written) throw new Error("hr._wf_notify wrote no notice for this request — nothing to follow");
  const link = written.deep_link;
  console.log(`the live producer wrote: ${link}`);

  // 1. THE PRODUCER'S OWN LINK NAMES THE EMPLOYER — and so does the copy in the payload,
  //    which the BEFORE trigger on communication.notification never touched.
  clause(
    1,
    link.includes(`org=${ORG}`),
    `hr._wf_notify's own deep link names Oak Street Studio (${link})`,
  );
  clause(
    2,
    (written.payload_link ?? "").includes(`org=${ORG}`),
    `the payload copy of the same link names it too (${written.payload_link}) — the trigger ` +
      `only ever stamped the column, so this is the half that was still employer-free`,
  );

  const browser = await chromium.launch({ headless: true });
  try {
    // 3. FOLLOWED COLD, the link puts the session in Oak Street Studio.
    {
      const { activeOrg } = await cold(browser, link);
      clause(
        3,
        activeOrg === ORG,
        activeOrg === ORG
          ? `followed cold, the notice's link left the session working in ${ORG_NAME} (${activeOrg})`
          : `followed cold, the session's employer came out as ${activeOrg ?? "NOTHING AT ALL"}, ` +
            `not ${ORG_NAME}`,
      );
    }

    // 4. THE CONTROL, the other way. Same link, employer stripped off. It must NOT leave the
    //    session working in Oak Street Studio — that is the 2026-08-28 defect, where a bare
    //    `/hr/tasks` link rewrote every subsequent link to a different employer. A clause 3
    //    that passes without this one passing is a coincidence, not a fix.
    {
      const bare = link.replace(new RegExp(`[?&]org=${ORG}`), (m) => (m[0] === "?" ? "?" : "")).replace("?&", "?");
      const { activeOrg } = await cold(browser, bare);
      clause(
        4,
        activeOrg !== ORG,
        activeOrg === ORG
          ? `the employer-free link ALSO landed in ${ORG_NAME}, so clause 3 proves nothing`
          : `the same link with no employer (${bare}) left the session working in ` +
            `${activeOrg ?? "NO employer at all"} — which is exactly the defect, and what makes ` +
            `clause 3 a fix rather than a coincidence`,
      );
    }

    // 5. AND THE LINK IS WHAT DECIDES, not the browser: the same path naming a DIFFERENT real
    //    employer this account works for lands in THAT one.
    {
      const other = link.replace(`org=${ORG}`, `org=${OTHER}`);
      const { activeOrg } = await cold(browser, other);
      clause(
        5,
        activeOrg === OTHER,
        activeOrg === OTHER
          ? `the same path naming ${OTHER_NAME} left the session working in ${OTHER_NAME} — the ` +
            `link decides the employer, not whatever the browser happened to hold`
          : `naming ${OTHER_NAME} left the session in ${activeOrg ?? "no employer"}`,
      );
    }
  } finally {
    await browser.close();
  }

  console.log(failures === 0 ? "ALL CLAUSES OK" : `${failures} CLAUSE(S) RED`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
