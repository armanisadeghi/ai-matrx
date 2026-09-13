import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BookletSection } from "./BookletSection";

/**
 * Forcing test for the F5/F6/F8 regression class: a print call site must
 * hand its `PrintOutcome` to `announcePrintOutcome` so a blocked popup that
 * fell back to an `.html` download is never silent. This guards
 * `BookletSection`'s `handlePrint` → `printBooklet` → `announcePrintOutcome`
 * chain specifically — it must fail if that call is ever dropped.
 */

jest.mock("@ai-matrx/print/booklet", () => ({
    bookletSizeWarning: jest.fn(() => null),
    imposeBooklet: jest.fn(() => ({ paddedPageCount: 12, sheets: [], requiresShortEdgeDuplex: false })),
    printBooklet: jest.fn(() => "downloaded"),
}));

const announcePrintOutcome = jest.fn();

jest.mock("@/features/print/components/shared", () => {
    const actual = jest.requireActual("@/features/print/components/shared");
    return {
        ...actual,
        announcePrintOutcome: (...args: unknown[]) => announcePrintOutcome(...args),
    };
});

beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("BookletSection", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        announcePrintOutcome.mockClear();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("announces a downloaded print outcome instead of dropping it", () => {
        act(() => root.render(<BookletSection />));

        const button = Array.from(container.querySelectorAll("button")).find((b) =>
            b.textContent?.includes("Print sample booklet"),
        );
        expect(button).toBeTruthy();

        act(() => {
            button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(announcePrintOutcome).toHaveBeenCalledTimes(1);
        expect(announcePrintOutcome).toHaveBeenCalledWith("downloaded", "Booklet");
    });
});
