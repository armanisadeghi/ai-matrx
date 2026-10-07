/**
 * @jest-environment jsdom
 */
/**
 * THE G8A REVIEW (nightly clone, 2026-10-02), the confirm and the record names.
 *
 *  1. Reload a note, click Apply on an update card within ~5 s: the confirm read
 *     "Update note Note ae33f4e0?" "in its organization" with no current value,
 *     and still ran on yes. A confirm never asks before it can say what it will
 *     do: it opens with a loading line and its yes HELD (`ready`), then shows the
 *     record's name, old → new and the organization by name. A failed read says
 *     so and still lets the person choose.
 *  2. "Delete again" on a task already in the trash says it is already there.
 *  3. A record link never shows its raw id while its name loads.
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

const confirmDialog = jest.fn();
const readDirectiveRecord = jest.fn();
const resolveReferenceName = jest.fn();
let labelStatus: "loading" | "ready" = "ready";

jest.mock("@/features/directive-catalog/service", () => ({ confirmDirective: jest.fn() }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: (...args: unknown[]) => confirmDialog(...args),
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: () => ({}), dispatch: jest.fn() }),
}));
jest.mock("@/lib/redux/slices/apiConfigSlice", () => ({
  selectResolvedBaseUrl: () => "https://server.example.test",
}));
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));
jest.mock("@/features/item-presentation/useOpenItemPresentation", () => ({
  useOpenItemPresentation: () => jest.fn(),
}));
jest.mock("@/features/matrx-envelope/referenceResolvers", () => ({
  ...jest.requireActual("@/features/matrx-envelope/referenceResolvers"),
  useResolvedReferenceLabel: () => ({ display: "G8A weekly review", status: labelStatus }),
  resolveReferenceName: (...args: unknown[]) => resolveReferenceName(...args),
}));
jest.mock("@/features/matrx-envelope/components/useReferenceDoor", () => ({
  useReferenceDoor: () => ({ canOpen: false, trashed: false, activate: jest.fn(), peek: null, title: "" }),
}));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationName: () => "Ashford Labs",
}));
jest.mock("@/features/scopes/redux/selectors/tree", () => ({
  selectOrganizations: () => ({ "org-bellweather": { id: "org-bellweather", name: "Bellweather Co" } }),
}));
jest.mock("@/features/matrx-envelope/directiveRecordRow", () => ({
  readDirectiveRecord: (...args: unknown[]) => readDirectiveRecord(...args),
}));

import { decodeDirective } from "@ai-matrx/content-ir";
import type { DirectiveAskRequest } from "@ai-matrx/content-ir-react";
import { matrxDirectiveHost } from "@/features/matrx-envelope/directiveHost";
import { DirectiveRecordLink } from "@/features/matrx-envelope/components/DirectiveConsequence";

const NOTE_ID = "ae33f4e0-0000-4000-8000-000000000001";
const TASK_ID = "9e11b091-0000-4000-8000-000000000002";

function request(slug: string, items: Record<string, unknown>[], nounLabel: string, again = false): DirectiveAskRequest {
  const directive = decodeDirective({ __kind: slug, items });
  if (!directive) throw new Error(`test shell did not decode: ${slug}`);
  return { directive, items, nounLabel, ...(again ? { again: true } : {}) };
}

interface Opts {
  title: ReactNode;
  description: ReactNode;
  ready?: PromiseLike<unknown>;
}

async function openQuestion(req: DirectiveAskRequest) {
  confirmDialog.mockReset();
  confirmDialog.mockResolvedValue(false);
  await matrxDirectiveHost.ask!(req);
  const opts = confirmDialog.mock.calls[0][0] as Opts;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <div>
        <h2 data-testid="title">{opts.title}</h2>
        <div data-testid="description">{opts.description}</div>
      </div>,
    );
  });
  const read = () => ({
    title: host.querySelector('[data-testid="title"]')?.textContent ?? "",
    description: host.querySelector('[data-testid="description"]')?.textContent ?? "",
    loadingName: host.querySelector("[data-record-name-loading]") !== null,
  });
  const settle = async () =>
    act(async () => {
      await opts.ready;
      for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
    });
  return { opts, read, settle, done: () => act(async () => root.unmount()) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  readDirectiveRecord.mockReset();
  resolveReferenceName.mockReset();
  labelStatus = "ready";
});

describe("a confirm never asks before it can say what it will do", () => {
  it("an update opens reading, its yes held; then names the record, old → new and the organization", async () => {
    const row = deferred<Record<string, unknown> | null>();
    readDirectiveRecord.mockReturnValue(row.promise);
    resolveReferenceName.mockResolvedValue("G8A weekly review");
    const q = await openQuestion(
      request("directive_v1_update_note", [{ id: NOTE_ID, label: "G8A weekly review v2" }], "Note"),
    );
    // The yes is held until the question can be answered.
    expect(q.opts.ready).toBeDefined();
    let settled = false;
    void Promise.resolve(q.opts.ready).then(() => {
      settled = true;
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(settled).toBe(false);
    const before = q.read();
    expect(before.description).toContain("Reading this Note");
    // While the name is read the title is a whole sentence — never "Update Note ?" (G11B).
    expect(before.title).toBe("Update this Note?");
    expect(before.title).not.toMatch(/ae33f4e0|its organization/);
    expect(before.description).not.toMatch(/its organization/);

    row.resolve({ id: NOTE_ID, label: "G8A weekly review", organization_id: "org-bellweather" });
    await q.settle();
    expect(settled).toBe(true);
    const after = q.read();
    expect(after.title).toBe("Update Note G8A weekly review?");
    expect(after.description).toContain("Bellweather Co");
    expect(after.description).toContain("TitleG8A weekly review→G8A weekly review v2");
    expect(after.description).not.toMatch(/ae33f4e0|its organization|Reading/);
    await q.done();
  });

  it("the empty update names its organization too", async () => {
    readDirectiveRecord.mockResolvedValue({ id: NOTE_ID, organization_id: "org-bellweather" });
    resolveReferenceName.mockResolvedValue("G8A weekly review");
    const q = await openQuestion(request("directive_v1_update_note", [{ id: NOTE_ID }], "Note"));
    await q.settle();
    const after = q.read();
    expect(after.description).toContain("Bellweather Co");
    expect(after.description).toContain("nothing would change");
    await q.done();
  });

  it("a failed read is said plainly and the yes is still offered", async () => {
    readDirectiveRecord.mockRejectedValue(new Error("network down"));
    resolveReferenceName.mockRejectedValue(new Error("network down"));
    const q = await openQuestion(request("directive_v1_update_note", [{ id: NOTE_ID, label: "x" }], "Note"));
    await q.settle();
    const after = q.read();
    expect(after.description).toContain("Current values couldn't be read.");
    expect(after.title).toBe("Update this Note?");
    expect(after.title).not.toMatch(/ae33f4e0/);
    await expect(Promise.resolve(q.opts.ready)).resolves.toBeDefined();
    await q.done();
  });

  it("Delete again on a task already in the trash says it is already there", async () => {
    readDirectiveRecord.mockResolvedValue({
      id: TASK_ID,
      organization_id: "org-bellweather",
      deleted_at: "2026-10-02T10:00:00Z",
    });
    resolveReferenceName.mockResolvedValue("G8A cleanup");
    const q = await openQuestion(request("directive_v1_delete_task", [{ id: TASK_ID }], "Task", true));
    await q.settle();
    const after = q.read();
    expect(after.title).toBe("Delete Task G8A cleanup again?");
    expect(after.description).toContain("G8A cleanup is already in the trash in Bellweather Co.");
    expect(after.description).not.toContain("Moves");
    await q.done();
  });
});

describe("G11B: no orphan punctuation, and nothing to change is said", () => {
  const ORPHAN = /\s[?!.,:;]/;
  for (const [slug, noun] of [
    ["directive_v1_update_note", "Note"],
    ["directive_v1_delete_task", "Task"],
  ] as const) {
    for (const again of [false, true]) {
      it(`${slug}${again ? " (again)" : ""}: the title has no stray space before punctuation, loading or read`, async () => {
        const row = deferred<Record<string, unknown> | null>();
        readDirectiveRecord.mockReturnValue(row.promise);
        resolveReferenceName.mockResolvedValue("G11B named");
        const q = await openQuestion(request(slug, [{ id: NOTE_ID, label: "G11B v2" }], noun, again));
        expect(q.read().title).not.toMatch(ORPHAN);
        expect(q.read().title.length).toBeGreaterThan(0);
        row.resolve({ id: NOTE_ID, label: "G11B named", organization_id: "org-bellweather" });
        await q.settle();
        expect(q.read().title).not.toMatch(ORPHAN);
        await q.done();
      });
    }
  }

  for (const again of [false, true]) {
    it(`an update whose record already holds every value says Nothing to change${again ? " (Run again)" : ""}`, async () => {
      readDirectiveRecord.mockResolvedValue({ id: NOTE_ID, label: "G11B same", organization_id: "org-bellweather" });
      resolveReferenceName.mockResolvedValue("G11B same");
      const q = await openQuestion(request("directive_v1_update_note", [{ id: NOTE_ID, label: "G11B same" }], "Note", again));
      await q.settle();
      const after = q.read();
      expect(after.description).toContain("Nothing to change");
      expect(after.description).not.toMatch(/Overwrites|Writes these fields again/);
      await q.done();
    });
  }

  it("an update with one field that changes does not say Nothing to change", async () => {
    readDirectiveRecord.mockResolvedValue({ id: NOTE_ID, label: "G11B old", organization_id: "org-bellweather" });
    resolveReferenceName.mockResolvedValue("G11B old");
    const q = await openQuestion(request("directive_v1_update_note", [{ id: NOTE_ID, label: "G11B new" }], "Note", true));
    await q.settle();
    expect(q.read().description).not.toContain("Nothing to change");
    expect(q.read().description).toContain("Writes these fields again");
    await q.done();
  });
});

describe("a record link never shows a raw id", () => {
  it("shows a neutral placeholder while the name loads, then the name", async () => {
    labelStatus = "loading";
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<DirectiveRecordLink noun="task" id={TASK_ID} fallback="Task 9e11b091" context="row" />);
    });
    expect(host.textContent).not.toContain("9e11b091");
    expect(host.querySelector("[data-record-name-loading]")).not.toBeNull();
    labelStatus = "ready";
    await act(async () => {
      root.render(<DirectiveRecordLink noun="task" id={TASK_ID} fallback="Task 9e11b091" context="row" />);
    });
    expect(host.textContent).toContain("G8A weekly review");
    await act(async () => root.unmount());
  });
});
