// features/spaces/data/duplicate-property-live-proof.ts — live proof that Duplicate property copies the values
// (Notion N5, door `custom.field_duplicate` through records `client.fieldDuplicate`).
//
// Run: pnpm tsx --env-file=.env --env-file=.env.local features/spaces/data/duplicate-property-live-proof.ts <admin-org-id>
// Signs in as admin@admin.com and test@test.com (SPACES_PROOF_SECOND_PASSWORD, else the admin password); the
// organization must be one the admin owns and test@test.com is NOT a member of. Archives the table it made.

import { createClient } from "@supabase/supabase-js";
import { createRecordsClient, declareTable, supabaseDataSource } from "@ai-matrx/records/core";

import type { Database } from "@/types/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const orgId = process.argv[2];
if (!url || !key || !orgId) throw new Error("Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and an organization id argument.");

async function signedIn(email: string, password: string) {
  const db = createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return createRecordsClient({ dataSource: supabaseDataSource(db as never), actor: { actor: "user", user_id: data.user.id }, organizationId: orgId });
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  const admin = await signedIn(process.env.AI_ADMIN_USERNAME!, process.env.AI_ADMIN_PASSWORD!);
  const outsider = await signedIn("test@test.com", process.env.SPACES_PROOF_SECOND_PASSWORD ?? process.env.AI_ADMIN_PASSWORD!);
  const made = await declareTable(admin, {
    name: "Grooming services",
    slug: `grooming_services_${Date.now().toString(36)}`,
    titleField: "name",
    fields: [
      { key: "name", label: "Service", type: "text", sort: 10, required: false },
      { key: "price", label: "Price", type: "number", sort: 20, required: false },
      { key: "coat", label: "Coat type", type: "list", options: ["Short", "Long", "Double"], sort: 30, required: false },
      { key: "notes", label: "Notes", type: "text", sort: 40, required: false },
    ] as never,
  });
  if (!made.ok) throw new Error(made.error.message);
  const tableId = made.data;
  try {
    const seed = [
      { name: "Full groom, small breed", price: 65, coat: "Short", notes: "Includes nail trim" },
      { name: "De-shedding treatment", price: 48, coat: "Double", notes: "Allow 90 minutes" },
      { name: "Puppy first bath", price: 30, coat: "Long" },
    ];
    for (const row of seed) {
      const w = await admin.recordWrite({ table_id: tableId, data: row as never });
      if (!w.ok) throw new Error(w.error.message);
    }
    const fields = await admin.fields({ table_id: tableId } as never);
    const byKey = (k: string) => (fields.ok ? (fields.data as Array<{ id: string; key: string }>).find((f) => f.key === k) : undefined);

    const price = await admin.fieldDuplicate({ field_id: byKey("price")!.id });
    check("Duplicate property on Price answers the copy and its values", price.ok && price.data.label === "Price (1)" && price.data.values_copied === 3, price.ok ? JSON.stringify(price.data) : price.error.message);
    const coat = await admin.fieldDuplicate({ field_id: byKey("coat")!.id });
    check("Duplicate property on a choice column copies its values", coat.ok && coat.data.values_copied === 3, coat.ok ? JSON.stringify(coat.data) : coat.error.message);
    const notes = await admin.fieldDuplicate({ field_id: byKey("notes")!.id });
    check("only rows with a value are written (2 of 3 have notes)", notes.ok && notes.data.values_copied === 2, notes.ok ? JSON.stringify(notes.data) : notes.error.message);
    const again = await admin.fieldDuplicate({ field_id: byKey("price")!.id });
    check("a second copy of the same column is named (2)", again.ok && again.data.label === "Price (2)", again.ok ? again.data.label : again.error.message);

    if (price.ok && coat.ok) {
      const read = await admin.list({ table_id: tableId });
      const rows = read.ok ? read.data.rows : [];
      const doc = (r: (typeof rows)[number]) => (r as unknown as { document: Record<string, unknown> }).document;
      check(
        "every row reads the same value in the copy as in the original",
        rows.length === 3 && rows.every((r) => doc(r).price === doc(r)[price.data.key] && doc(r).coat === doc(r)[coat.data.key]),
        rows.map((r) => `${doc(r).price}/${doc(r)[price.data.key]} ${doc(r).coat}/${doc(r)[coat.data.key]}`).join(", "),
      );
      const opts = await admin.fieldOptions({ field_id: coat.data.field_id });
      const words = opts.ok ? (opts.data as unknown as Array<{ data?: { title?: string } }>).map((o) => o.data?.title).join(", ") : opts.error.message;
      check("the copied choice column has the original's choices in order", words === "Short, Long, Double", words);
      const after = await admin.fields({ table_id: tableId } as never);
      const order = after.ok ? (after.data as Array<{ label: string }>).map((f) => f.label).join(" · ") : "";
      check("each copy sits right after its original", order.includes("Price · Price (2) · Price (1) · Coat type · Coat type (1) · Notes · Notes (1)"), order);
    }

    const refused = await outsider.fieldDuplicate({ field_id: byKey("price")!.id });
    check("a person outside the organization is refused", !refused.ok, refused.ok ? "duplicated" : refused.error.message);
  } finally {
    await admin.tableArchive({ table_id: tableId } as never).catch(() => undefined);
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}

main().catch((e: unknown) => {
  console.error("FAIL  proof stopped:", e instanceof Error ? e.message : JSON.stringify(e));
  process.exit(1);
});
