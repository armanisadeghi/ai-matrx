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
const list = readFileSync(join(__dirname, "../../admin-list/listConfig.tsx"), "utf8");

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

describe("the admin list's remove affordance", () => {
  const handler = list.slice(
    list.indexOf("async function removeMandate"),
    list.indexOf("export function mandateAdminRowHref"),
  );

  it("exists, is destructive, and is wired to the soft delete", () => {
    expect(list).toContain('id: "remove"');
    expect(list).toContain('tone: "destructive"');
    expect(list).toContain("onSelect: () => void removeMandate(row)");
    expect(handler).toContain("softDeleteMandate(row.id)");
  });

  it("confirms with the CONSEQUENCE, not a bare 'are you sure?'", () => {
    // What is lost…
    expect(handler).toContain("stops finding it");
    expect(handler).toContain("stop applying with it");
    // …and what survives, which is what makes it safe to offer on a list.
    expect(handler).toContain("soft removal");
    expect(handler).toContain('variant: "destructive"');
    expect(handler).not.toMatch(/are you sure/i);
  });

  it("shows the service's own refusal rather than inventing a reason", () => {
    expect(handler).toContain("error instanceof Error ? error.message");
  });
});

describe("the delete is DISCOVERABLE, not only in a row menu", () => {
  /**
   * 🚨 The first cut shipped the delete ONLY into a context menu, and an
   * independent walk could not find it anywhere on the live surface. A
   * menu-only affordance is invisible, so the mandate's own page carries it
   * too: the status control in the record header, whose menu holds Archive —
   * the same soft delete the list's Remove calls.
   */
  const page = readFileSync(
    join(__dirname, "../../record-next/MandateRecordPage.tsx"),
    "utf8",
  );
  const control = readFileSync(
    join(__dirname, "../../status/MandateStatusControl.tsx"),
    "utf8",
  );
  const archive = control.slice(
    control.indexOf("const archive = async"),
    control.indexOf("return (", control.indexOf("const archive = async")),
  );

  it("puts the status control, with Archive, in the mandate page's header", () => {
    expect(page).toContain("<MandateStatusControl");
    expect(page).toContain("canManage={canRemove}");
    expect(control).toContain("onSelect={() => void archive()}");
    expect(archive).toContain("softDeleteMandate(mandateId)");
    expect(archive).toContain('variant: "destructive"');
  });

  it("says what is lost and that it can be restored", () => {
    expect(archive).toContain("disappears from every list");
    expect(archive).toContain("Nothing is destroyed: it can be restored from Trash.");
  });

  it("leaves the page rather than describing a job that no longer exists", () => {
    // Through the deployment door (lib/deployment/surfaces.ts).
    expect(page).toContain('next === "archived" ? pushAppHref(router, listHref) : refresh()');
  });

  it("shows the service's own refusal rather than inventing one", () => {
    expect(archive).toContain("error instanceof Error ? error.message");
  });

  /**
   * FIX-Q9's walk, 2026-09-12: "Remove mandate" on an ORG-homed mandate looked
   * like it did nothing. On the admin seat, removal is gated on nothing but the
   * seat's own manage rule; a write that matched nothing THROWS a sentence.
   */
  it("the admin seat may always remove, and a blocked write is never silent", () => {
    const rule = readFileSync(
      join(__dirname, "../../status/can-manage.ts"),
      "utf8",
    );
    expect(rule).toContain('if (seat.level === "system") return true;');
    expect(service).toContain(
      "This job was not removed — either it is already removed",
    );
  });
});
