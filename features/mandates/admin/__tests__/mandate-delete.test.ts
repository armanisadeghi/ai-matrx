/**
 * THE MISSING HALF OF MANDATE CRUD.
 *
 * 🚨 An independent production walk proved the gap (2026-08-31): the admin
 * mandates UI offered duplicate / export / split and **no way to remove a
 * mandate at all**. A person could create one and never get rid of it from any
 * screen they normally use.
 *
 * These pin the two things that make a delete safe to offer on a list: it is
 * SOFT (so `deleted_at` — the column all nine client reads filter on — hides it
 * everywhere at once while the record survives), and a write that matched
 * NOTHING is reported as a failure rather than as a delete that happened.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const service = readFileSync(join(__dirname, "../service.ts"), "utf8");
const console_ = readFileSync(join(__dirname, "../MandatesConsole.tsx"), "utf8");

describe("softDeleteMandate", () => {
  const fn = service.slice(
    service.indexOf("export async function softDeleteMandate"),
    service.indexOf("export async function deleteMandateExemplar"),
  );

  it("is a SOFT delete — it stamps deleted_at and never removes the row", () => {
    expect(fn).toContain("deleted_at: new Date().toISOString()");
    expect(fn).not.toMatch(/\.delete\(\)/);
  });

  it("only ever affects a row that is still live", () => {
    expect(fn).toContain('.is("deleted_at", null)');
    expect(fn).toContain('.eq("id", mandateId)');
  });

  it("treats a write that matched nothing as a FAILURE, not a success", () => {
    // RLS refusal and already-deleted both land here. Reporting either as a
    // successful delete would be the screen lying about what it did.
    expect(fn).toMatch(/if \(!data\) \{[\s\S]*?throw new Error\(/);
    expect(fn).toContain("Nothing changed.");
  });

  it("invalidates the mandate cache so every reader drops it at once", () => {
    expect(fn).toContain("invalidateMandateCache(data.mandate_key)");
  });
});

describe("the console's remove affordance", () => {
  it("exists, is destructive, and is wired to the soft delete", () => {
    expect(console_).toContain('id: "mandate-delete"');
    expect(console_).toContain("destructive: true");
    expect(console_).toContain("softDeleteMandate(row.id)");
  });

  it("confirms with the CONSEQUENCE, not a bare 'are you sure?'", () => {
    const handler = console_.slice(
      console_.indexOf("const removeMandate = async"),
      console_.indexOf("const mandateMenuSections"),
    );
    // What is lost…
    expect(handler).toContain("stops finding it");
    expect(handler).toContain("stops applying with it");
    // …and what survives, which is what makes it safe to offer on a list.
    expect(handler).toContain("soft removal");
    expect(handler).toContain('variant: "destructive"');
    expect(handler).not.toMatch(/are you sure/i);
  });

  it("shows the service's own refusal rather than inventing a reason", () => {
    const handler = console_.slice(
      console_.indexOf("const removeMandate = async"),
      console_.indexOf("const mandateMenuSections"),
    );
    expect(handler).toContain("error instanceof Error ? error.message");
  });
});
