/**
 * GUARD: the Documents editor mounts its document unit through Univer's
 * CURRENT facade, or says it failed — never "Editing" over an empty skeleton.
 *
 * THE FINDING (2026-09-28): Univer 1.0 renamed `createUniverDoc` to
 * `createDocument`. The editor called `createUniverDoc?.(…)`: the optional call
 * silently did nothing, boot still set "ready", and every new document (and
 * every reload) sat on Univer's loading skeleton for good.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FUniver } from "@univerjs/presets";
import { mountUniverDocument } from "@/features/documents/univer-mount-document";

function facade(opts: { mounts: boolean }) {
  const created: unknown[] = [];
  const api = {
    createDocument: (data: unknown) => {
      created.push(data);
      return opts.mounts ? { getId: () => "doc-kiln-log" } : null;
    },
    getActiveDocument: () => (opts.mounts ? { getId: () => "doc-kiln-log" } : null),
  };
  return { api: api as unknown as FUniver, created };
}

it("mounts through createDocument and returns the unit Univer holds", () => {
  const { api, created } = facade({ mounts: true });
  expect(mountUniverDocument(api, { id: "doc-kiln-log" })).toBe("doc-kiln-log");
  expect(created).toHaveLength(1);
});

it("throws when no unit was created — the page must say Load failed", () => {
  const { api } = facade({ mounts: false });
  expect(() => mountUniverDocument(api, { id: "doc-kiln-log" })).toThrow(/could not open this document/);
});

it("the installed Univer facade still has the method this uses", () => {
  const src = readFileSync(
    require.resolve("@univerjs/docs/lib/es/facade.js", { paths: [process.cwd()] }),
    "utf8",
  );
  expect(src).toMatch(/\bcreateDocument\(data, options\)/);
});

it("no code calls the removed createUniverDoc, and the editor mounts only through the helper", () => {
  const editor = readFileSync(join(__dirname, "..", "components", "DocumentEditor.tsx"), "utf8");
  expect(editor).not.toMatch(/createUniverDoc\s*\?\.\s*\(|\.createUniverDoc\(/);
  // Three doors, all the helper: the first boot, a collaborator's snapshot in
  // a live view, and one arriving while the editor is kept between views.
  expect(editor.match(/mountUniverDocument\(/g)?.length).toBe(3);
});
