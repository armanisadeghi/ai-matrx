// scripts/forms/typeform-store-proof.mts — THE STORE HALF OF LANE TYPEFORM-DUP, PROVEN ON THE ONE DATABASE.
//
//   npx tsx scripts/forms/typeform-store-proof.mts            run the proofs against live (read-only)
//   npx tsx scripts/forms/typeform-store-proof.mts --rehearse applies the migration inside a transaction,
//                                                             runs the proofs, and ROLLS BACK
//
// Every proof calls the store's own route walk (`custom._form_route`) with Rules that need no Field
// (`{"const": true}` / `{"const": null}`), so it reads no tenant's data. Before the migration the
// functions do not exist and every proof is RED; after it they are GREEN.
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
const envFile = ["/Users/armanisadeghi/code/matrx-frontend/.env", "/Users/armanisadeghi/code/aidream/.env"].find((f) => fs.existsSync(f) && /SUPABASE_MATRIX_HOST/.test(fs.readFileSync(f, "utf8")));
if (!envFile)
    throw new Error("No SUPABASE_MATRIX_* credentials found.");
const env = Object.fromEntries(fs.readFileSync(envFile, "utf8").split("\n").filter((l) => /^SUPABASE_MATRIX_/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
}));
const client = new pg.Client({
    user: env.SUPABASE_MATRIX_USER, password: env.SUPABASE_MATRIX_PASSWORD, host: env.SUPABASE_MATRIX_HOST,
    port: Number(env.SUPABASE_MATRIX_PORT), database: env.SUPABASE_MATRIX_DATABASE_NAME, ssl: { rejectUnauthorized: false },
});
const ORG = "00000000-0000-0000-0000-000000000000";
const T = { const: true };
const U = { const: null };
async function route(questions, endings, values) {
    const r = await client.query("select custom._form_route($1::uuid, $2::jsonb, $3::jsonb, $4::jsonb) as r", [
        ORG, JSON.stringify(questions), JSON.stringify(endings), JSON.stringify(values),
    ]);
    return r.rows[0].r;
}
const asked = (r) => r.asks.filter((a) => a.asked).map((a) => a.field_key).join(",");
const proofs = [
    ["a true jump skips the questions between", async () => {
            const r = await route([{ field: "a", jumps: [{ when: T, to: { question: "d" } }] }, { field: "b" }, { field: "c" }, { field: "d" }], [], { a: "x" });
            if (asked(r) !== "a,d")
                throw new Error(`asked ${asked(r)}`);
        }],
    ["undecided falls through to the next question", async () => {
            const r = await route([{ field: "a", jumps: [{ when: U, to: { question: "d" } }] }, { field: "b" }, { field: "c" }, { field: "d" }], [], {});
            if (asked(r) !== "a,b,c,d")
                throw new Error(`asked ${asked(r)}`);
        }],
    ["a jump to an ending ends the path and names the ending", async () => {
            const r = await route([{ field: "a", jumps: [{ to: { ending: "not-a-fit" } }] }, { field: "b" }], [{ id: "booked" }, { id: "not-a-fit" }], { a: "x" });
            if (asked(r) !== "a" || r.ending !== "not-a-fit")
                throw new Error(`asked ${asked(r)} ending ${r.ending}`);
        }],
    ["no jump: the first plain ending is the default", async () => {
            const r = await route([{ field: "a" }], [{ id: "high", score_min: 10 }, { id: "booked" }], { a: "x" });
            if (r.ending !== "booked")
                throw new Error(`ending ${r.ending}`);
        }],
    ["points add up and the score picks the ending", async () => {
            const qs = [{ field: "a", points: { yes: 5, no: 0 } }, { field: "b", points: { red: 3, blue: 7 } }];
            const ends = [{ id: "low", score_max: 9 }, { id: "high", score_min: 10 }, { id: "plain" }];
            const hi = await route(qs, ends, { a: "yes", b: ["blue"] });
            const lo = await route(qs, ends, { a: "no", b: "red" });
            if (hi.score !== 12 || hi.ending !== "high")
                throw new Error(`hi ${hi.score} ${hi.ending}`);
            if (lo.score !== 3 || lo.ending !== "low")
                throw new Error(`lo ${lo.score} ${lo.ending}`);
        }],
    ["a form with no points has no score", async () => {
            const r = await route([{ field: "a" }], [], { a: "x" });
            if (r.score !== null)
                throw new Error(`score ${r.score}`);
        }],
    ["showIf false still hides, through the old asks shape", async () => {
            const r = await client.query("select string_agg(field_key || ':' || asked, ',') s from custom._form_questions_asked($1::uuid, $2::jsonb, '{}'::jsonb)", [
                ORG, JSON.stringify([{ field: "a", jumps: [{ when: T, to: { question: "c" } }] }, { field: "b" }, { field: "c", showIf: { const: false } }]),
            ]);
            if (r.rows[0].s !== "a:true,b:false,c:false")
                throw new Error(r.rows[0].s);
        }],
    ["a required question a jump can skip is not in the always-asked set", async () => {
            const r = await client.query("select array_to_string(custom._form_always_asked($1::jsonb), ',') s", [
                JSON.stringify([{ field: "a", jumps: [{ when: T, to: { question: "c" } }] }, { field: "b" }, { field: "c" }, { field: "d", showIf: T }]),
            ]);
            if (r.rows[0].s !== "a,c")
                throw new Error(r.rows[0].s);
        }],
    ["the theme's options are the design system's named words", async () => {
            const r = await client.query("select custom.form_theme_options() o");
            const o = r.rows[0].o;
            if (o.font.join() !== "system,serif,rounded,mono" || o.button.join() !== "solid,outline,pill,square" || o.background.join() !== "plain,tinted,muted,picture")
                throw new Error(JSON.stringify(o));
        }],
    ["a backward jump is refused by name", async () => {
            try {
                await client.query("savepoint p");
                await client.query("select custom._form_flow_judge($1::uuid, $2::jsonb)", [ORG, JSON.stringify({ questions: [{ field: "a" }, { field: "b", jumps: [{ to: { question: "a" } }] }] })]);
            }
            catch (e) {
                await client.query("rollback to savepoint p");
                if (/Jumps only go forward/.test(e.message))
                    return;
                throw e;
            }
            throw new Error("a backward jump was accepted");
        }],
];
await client.connect();
const rehearse = process.argv.includes("--rehearse");
await client.query("begin");
if (rehearse) {
    for (const f of ["typeform_a_form_visit_is_counted_by_the_store.sql", "typeform_a_form_routes_scores_and_counts_itself.sql"]) {
        await client.query(fs.readFileSync(path.resolve("migrations/campaign", f), "utf8"));
    }
    console.log("rehearsal: migration applied inside the transaction");
}
let failed = 0;
for (const [name, run] of proofs) {
    try {
        await client.query("savepoint each");
        await run();
        await client.query("release savepoint each");
        console.log(`GREEN  ${name}`);
    }
    catch (e) {
        failed++;
        await client.query("rollback to savepoint each").catch(() => undefined);
        console.log(`RED    ${name} — ${e.message.split("\n")[0]}`);
    }
}
await client.query("rollback");
await client.end();
console.log(failed ? `${failed} of ${proofs.length} RED` : `all ${proofs.length} GREEN`);
process.exit(failed ? 1 : 0);
