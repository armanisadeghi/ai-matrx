/**
 * "A __kind is never shown to a person as raw JSON" — the public message menu
 * is a human destination (clipboard, file, notes, email). Every row must hand
 * the kind's markdown, never the raw `{"__kind":…}` answer text.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const copyToClipboard = jest.fn(async () => {});
jest.mock("@host/components/matrx/buttons/markdown-copy-utils", () => ({
  copyToClipboard: (...a: unknown[]) => copyToClipboard(...(a as [])),
}));
jest.mock("@ai-matrx/print/markdown", () => ({ getMarkdownStylesheet: () => "" }));
jest.mock("@host/components/official/AdvancedMenu", () => ({
  __esModule: true,
  default: ({ items }: { items: { key: string; label: string; action: () => void }[] }) => (
    <div>
      {items.map((i) => (
        <button key={i.key} onClick={() => void i.action()}>
          {i.label}
        </button>
      ))}
    </div>
  ),
}));
jest.mock("@host/components/dialogs/EmailInputDialog", () => ({ EmailInputDialog: () => null }));
jest.mock("@host/components/dialogs/AuthGateDialog", () => ({ AuthGateDialog: () => null }));
const notesCreate = jest.fn(async () => {});
jest.mock("@host/features/notes/service/notesApi", () => ({
  NotesAPI: { create: (...a: unknown[]) => notesCreate(...(a as [])) },
}));
jest.mock("../../../host/notify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock("react-redux", () => ({ useSelector: (sel: (s: unknown) => unknown) => sel({}) }));
jest.mock("@host/lib/redux/slices/userSlice", () => ({ selectUser: () => ({ email: "a@b.c" }) }));
const dispatch = jest.fn();
jest.mock("../../../store/hooks", () => ({ useAppDispatch: () => dispatch }));
jest.mock("../../../host/windows", () => ({
  openOverlay: (x: unknown) => x,
  CHAT_WINDOWS: { saveToNotes: "saveToNotes" },
}));
jest.mock("../../../host/org", () => ({
  selectOrganizationId: () => "org",
  ensureOrganizationContext: async () => "org",
  isOrganizationSelectionCancelled: () => false,
}));

// eslint-disable-next-line import/first
import PublicMessageOptionsMenu from "../PublicMessageOptionsMenu";

const KIND = JSON.stringify({ __kind: "checklist", title: "Packing", items: [{ text: "Passport" }] });
const ANSWER = `Here you go:\n\n\`\`\`json\n${KIND}\n\`\`\``;

async function mount(onShowHtmlPreview?: jest.Mock) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <PublicMessageOptionsMenu
        content={ANSWER}
        onClose={() => {}}
        isOpen
        onShowHtmlPreview={onShowHtmlPreview}
      />,
    );
  });
  return container;
}

const click = async (c: HTMLElement, label: string) => {
  const btn = Array.from(c.querySelectorAll("button")).find((b) => b.textContent === label);
  if (!btn) throw new Error(`no row ${label}`);
  await act(async () => {
    btn.click();
  });
};

describe("PublicMessageOptionsMenu never hands a person raw kind JSON", () => {
  beforeEach(() => {
    copyToClipboard.mockClear();
    notesCreate.mockClear();
  });

  it.each(["Copy text", "Copy for Google Docs", "Copy with reasoning", "HTML preview", "Copy HTML page"])(
    "%s copies the kind's markdown",
    async (label) => {
      const r = await mount(jest.fn());
      await click(r, label);
      const sent = copyToClipboard.mock.calls[0][0] as string;
      expect(sent).not.toContain("__kind");
      expect(sent).toContain("Passport");
    },
  );

  it("Save to Scratch writes the kind's markdown", async () => {
    const r = await mount();
    await click(r, "Save to Scratch");
    const body = (notesCreate.mock.calls[0][0] as { content: string }).content;
    expect(body).not.toContain("__kind");
    expect(body).toContain("Passport");
  });

  it("Save as file writes the kind's markdown", async () => {
    let blobText = "";
    const OrigBlob = global.Blob;
    global.Blob = class extends OrigBlob {
      constructor(parts: BlobPart[], o?: BlobPropertyBag) {
        super(parts, o);
        blobText = String(parts[0]);
      }
    } as typeof Blob;
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:x";
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    const r = await mount();
    await click(r, "Save as file");
    global.Blob = OrigBlob;
    expect(blobText).not.toContain("__kind");
    expect(blobText).toContain("Passport");
  });
});
