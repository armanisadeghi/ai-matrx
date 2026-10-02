/**
 * @jest-environment jsdom
 */
/**
 * THE G6A REVIEW, item 2 (nightly clone, 2026-10-02): a chip pointing at a
 * trashed task showed its plain name, and opening it said "We couldn't open
 * this task…" with nowhere to go. Row security lets its reader see a trashed
 * row, so the label resolved as if nothing had happened, and the in-place
 * window's read (which hides trashed rows) failed.
 *
 * Now every door that names a record answers whether it is in the trash: the
 * chip says "(in trash)" up front, and its click opens the trash door (the access
 * gate — Restore through Trash's one door) instead of the window.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

let deletedAt: string | null = "2026-10-02T12:00:00Z";

function query() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: async () => ({
      data: { title: "G6A trashed task", description: "", deleted_at: deletedAt },
      error: null,
    }),
  };
  return chain;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: query }), from: query },
}));

const openItem = jest.fn();
jest.mock("@/features/item-presentation/useOpenItemPresentation", () => ({
  useOpenItemPresentation: () => openItem,
}));
jest.mock("@/features/access-gate/components/AccessDenied", () => ({
  AccessDenied: ({ token, id }: { token: string; id: string }) => (
    <div data-testid="trash-door">
      {token}:{id}
    </div>
  ),
}));

import { DirectiveRecordLink } from "@/features/matrx-envelope/components/DirectiveConsequence";
import { useReferenceDoor } from "@/features/matrx-envelope/components/useReferenceDoor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TASK_ID = "4127fbc8-0000-4000-8000-0000000000aa";

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
  });
}

function Chip() {
  const door = useReferenceDoor("task", { id: TASK_ID }, "G6A trashed task");
  return (
    <span>
      <button type="button" onClick={door.activate} data-trashed={String(door.trashed)}>
        G6A trashed task
      </button>
      {door.peek}
    </span>
  );
}

async function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  await flush();
  return { host, root };
}

describe("a reference to a record in the trash", () => {
  beforeEach(() => openItem.mockReset());

  it("the door knows it is trashed, and its click is the trash door, never the window", async () => {
    deletedAt = "2026-10-02T12:00:00Z";
    const { host, root } = await mount(<Chip />);
    const button = host.querySelector("button")!;
    expect(button.getAttribute("data-trashed")).toBe("true");
    await act(async () => button.click());
    expect(openItem).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="trash-door"]')?.textContent).toContain(TASK_ID);
    await act(async () => root.unmount());
    host.remove();
  });

  it("a directive row names it '(in trash)' up front", async () => {
    deletedAt = "2026-10-02T12:00:00Z";
    const { host, root } = await mount(
      <DirectiveRecordLink noun="task" id={TASK_ID} fallback="Task 4127fbc8" context="row" />,
    );
    expect(host.textContent).toContain("(in trash)");
    await act(async () => root.unmount());
    host.remove();
  });

  it("a live record opens in place as before", async () => {
    deletedAt = null;
    const { host, root } = await mount(<Chip />);
    const button = host.querySelector("button")!;
    expect(button.getAttribute("data-trashed")).toBe("false");
    await act(async () => button.click());
    expect(openItem).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    host.remove();
  });
});
