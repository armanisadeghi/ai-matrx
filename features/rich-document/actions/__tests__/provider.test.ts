/**
 * ALC-15 S2 — rich-document's actions are ONE provider of the Alchemy action
 * registry; eligibility is the package's one pass (LIST A1).
 *
 * Breaks each test names:
 * - the provider silently overwrites a duplicate id (the old registry did) → "refused" goes red.
 * - a disabled action is drawn greyed instead of absent (R1) → "disabled is absent" goes red.
 * - a source-writing action shows on a read-only copy → "read-only" goes red.
 * - the package registry and the app's synchronous list disagree → "one answer" goes red.
 */
import "../handlers";
import { DuplicateActionError, createActionRegistry } from "@ai-matrx/alchemy/actions";
import {
  getAction,
  registerAction,
  resolveActions,
  richDocumentActionProvider,
  richDocumentClickTarget,
} from "../provider";
import { chatContext } from "../../test-utils/chatContext";
import type { RichDocumentAction, RichDocumentActionContext } from "../../types";
import { Copy } from "lucide-react";

const ids = (ctx: RichDocumentActionContext) => resolveActions(ctx).map((a) => a.id);

describe("rich-document provider", () => {
  it("refuses a duplicate id instead of overwriting the first registration", () => {
    const first = getAction("copy-markdown");
    expect(first).toBeDefined();
    const impostor: RichDocumentAction = {
      id: "copy-markdown",
      label: "Copy (second copy)",
      icon: Copy,
      category: "copy",
      supportedSources: "*",
      run: () => undefined,
    };
    expect(() => registerAction(impostor)).toThrow(DuplicateActionError);
    expect(getAction("copy-markdown")).toBe(first);
  });

  it("R1: a disabled action is absent, never a greyed row", () => {
    const ctx = chatContext("assistant");
    const extra: RichDocumentAction = {
      id: "test:needs-a-table",
      label: "Chart this table",
      icon: Copy,
      category: "export",
      supportedSources: "*",
      disabled: () => ({ reason: "No table in this answer" }),
      run: () => undefined,
    };
    const enabled: RichDocumentAction = { ...extra, id: "test:always", disabled: () => false };
    const listed = resolveActions(ctx, { extra: [extra, enabled] }).map((a) => a.id);
    expect(listed).toContain("test:always");
    expect(listed).not.toContain("test:needs-a-table");
  });

  it("a read-only copy offers nothing that would change the record", () => {
    const ctx = chatContext("assistant");
    const writers = resolveActions(ctx).filter((a) => a.writesSource).map((a) => a.id);
    expect(writers.length).toBeGreaterThan(0);
    const readOnly = { ...ctx, source: { ...ctx.source, readOnly: true } };
    const left = ids(readOnly);
    for (const id of writers) expect(left).not.toContain(id);
    expect(left).toContain("copy-markdown");
  });

  it("one answer: the package registry resolves exactly the app's synchronous list", async () => {
    const ctx = chatContext("assistant");
    const registry = createActionRegistry({ ports: { diagnostics: { capture: jest.fn() } } });
    registry.register(richDocumentActionProvider);
    const target = richDocumentClickTarget(ctx, { exclude: ["share-webpage"] });
    const viaPackage = (await registry.resolve(target)).map((r) => r.action.id).sort();
    const viaApp = resolveActions(ctx, { exclude: ["share-webpage"] }).map((a) => a.id).sort();
    expect(viaPackage).toEqual(viaApp);
    expect(viaPackage).not.toContain("share-webpage");
    expect(viaPackage.length).toBeGreaterThan(20);
  });

  it("maps the existing menu groupings to named sections and icons to keys", async () => {
    const ctx = chatContext("assistant");
    const registry = createActionRegistry({ ports: { diagnostics: { capture: jest.fn() } } });
    registry.register(richDocumentActionProvider);
    const resolved = await registry.resolve(richDocumentClickTarget(ctx));
    const markdown = resolved.find((r) => r.action.id === "copy-markdown")?.action;
    expect(markdown?.section?.label).toBe("Copy as");
    expect(markdown?.icon).toMatch(/^app:/);
    const saveNotes = resolved.find((r) => r.action.id === "save-to-notes")?.action;
    expect(saveNotes?.section).toBeUndefined();
  });
});

describe("one formatted copy (ALC-15 finding 5)", () => {
  it("offers ONE 'Copy formatted' row, never two byte-identical Docs/Word rows", () => {
    const listed = resolveActions(chatContext("assistant")).map((a) => a.id);
    expect(listed).toContain("copy-formatted");
    expect(listed.filter((id) => /google-docs|copy-word/.test(id))).toEqual([]);
    expect(getAction("copy-formatted")?.label).toBe("Copy formatted");
  });
});
