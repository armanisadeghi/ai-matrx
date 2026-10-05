/**
 * KIND_NEVER_RAW S-attach (round 4): "Attach your version" pre-filled the raw
 * `{"__kind":…}` answer. The person edits what they SAW: the field opens with
 * the kind's readable markdown; the frozen original handed to the capture
 * stays the model's actual output (stored data keeps `__kind`).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({ value, onChange }: { value: string; onChange: (e: unknown) => void }) => (
    <textarea data-testid="draft" value={value} onChange={onChange as never} />
  ),
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

import { AttachVersionDialog } from "../components/AttachVersionDialog";

const SET_JSON = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

function mount(props: Partial<React.ComponentProps<typeof AttachVersionDialog>>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const captureCorrection = jest.fn(async () => {});
  act(() =>
    root!.render(
      <AttachVersionDialog
        open
        onOpenChange={() => {}}
        originalContent={SET_JSON}
        existingCorrection={null}
        captureCorrection={captureCorrection as never}
        isSaving={false}
        {...props}
      />,
    ),
  );
  return { host, captureCorrection };
}

it("opens with the kind's readable text, never its JSON", () => {
  const { host } = mount({});
  const value = (host.querySelector("textarea") as HTMLTextAreaElement).value;
  expect(value).not.toContain("__kind");
  expect(value).toContain("Mitochondria");
});

it("the frozen original handed to the capture stays the model's raw output", async () => {
  const { host, captureCorrection } = mount({});
  const save = [...host.querySelectorAll("button")].find((b) => b.textContent === "Save my version");
  await act(async () => {
    save!.click();
  });
  expect(captureCorrection).toHaveBeenCalledWith(
    expect.objectContaining({ originalContent: SET_JSON }),
  );
});

it("an already-attached version is shown as the person wrote it", () => {
  const { host } = mount({ existingCorrection: "My own wording" });
  expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe("My own wording");
});
