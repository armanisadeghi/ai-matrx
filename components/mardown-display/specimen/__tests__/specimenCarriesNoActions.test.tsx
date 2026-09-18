// A DECLARED SPECIMEN RENDERS NO WAY OUT OF THE SCREEN.
//
// The forcing function for feedback 729b59bd: the Bad Example probe prints
// "We wrote this. It is meant to look right and be wrong." over a generated
// document, and the shared table renderer drew a live Workbook / Google Sheet /
// Export / Edit toolbar on it — so an Expert could send our knowingly-false
// certificate of destruction to Google Sheets as a real record.
//
// This test renders the REAL StreamingTableRenderer over REAL markdown, twice:
//
//   1. outside specimen mode — which must FIND the toolbar. Without this half
//      the suppression assertion would pass just as well against a renderer
//      that draws nothing at all, or a selector that matches nothing.
//   2. inside SpecimenProvider — which must find no control that moves the
//      content anywhere: Export, Send to Workbook, Send to Google Sheet, Save
//      as data, Edit, or Window.
//
// Run before the fix, part 2 fails on every one of those buttons.

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StreamingTableRenderer } from "@/components/mardown-display/blocks/table/StreamingTableRenderer";
import { SpecimenProvider } from "@/components/mardown-display/specimen/SpecimenContext";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => undefined,
}));
jest.mock("@/hooks/useToastManager", () => ({
  __esModule: true,
  useToastManager: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    notify: jest.fn(),
  }),
  default: () => ({}),
}));
class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}
(globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
  ResizeObserverMock;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/features/overlays/openers/tableViewerWindow", () => ({
  useOpenTableViewerWindow: () => jest.fn(),
}));

// The deliberately-false document the probe generates: a certificate of
// destruction with a real-looking table in it.
const SPECIMEN_TABLE = [
  "| Serial | Method | Witnessed by |",
  "| --- | --- | --- |",
  "| HD-40192 | Shred to 2mm | R. Alvarez |",
  "| HD-40193 | Degauss | R. Alvarez |",
].join("\n");

/** Every control that would carry this content off the screen. */
const WAYS_OUT = [
  "Export",
  "Workbook",
  "Sheet",
  "Edit",
  "Window",
  "Save",
] as const;

describe("a declared specimen carries no actions", () => {
  let host: HTMLDivElement;
  let root: Root;

  const buttonLabels = () =>
    Array.from(host.querySelectorAll("button")).map(
      (b) => b.textContent?.trim() ?? "",
    );

  // The Export menu only mounts after the renderer's 1s "data is stable"
  // timer, so every render here is stabilized before anything is asserted —
  // otherwise the suppression half would pass on a technicality.
  const render = async (node: ReactNode) => {
    await act(async () => root.render(node));
    act(() => {
      jest.advanceTimersByTime(1500);
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.useRealTimers();
  });

  it("draws the real toolbar on ordinary content (the control half)", async () => {
    await render(
      <StreamingTableRenderer content={SPECIMEN_TABLE} isStreamActive={false} />,
    );
    const labels = buttonLabels().join(" | ");
    // If this half ever fails, the suppression half below proves nothing.
    expect(labels).toContain("Export");
    expect(labels).toContain("Workbook");
    expect(labels).toContain("Google Sheet");
    expect(labels).toContain("Edit");
  });

  it("renders no export, workbook, sheet, edit or window control inside SpecimenProvider", async () => {
    await render(
      <SpecimenProvider
        value={{
          label: "This is the example we made up",
          notice: "It is meant to look right and be wrong.",
        }}
      >
        <StreamingTableRenderer
          content={SPECIMEN_TABLE}
          isStreamActive={false}
        />
      </SpecimenProvider>,
    );

    const labels = buttonLabels();
    for (const wayOut of WAYS_OUT) {
      expect(
        labels.filter((label) => label.includes(wayOut)),
      ).toEqual([]);
    }
    // And the table itself still renders — suppression is of the actions, not
    // of the content the Expert is asked to criticise.
    expect(host.querySelectorAll("table").length).toBeGreaterThan(0);
    expect(host.textContent).toContain("HD-40192");
  });
});
