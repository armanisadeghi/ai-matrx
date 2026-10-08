import "@/__tests__/helpers/register-chat-host";
import { toast } from "@/lib/toast";
import { PRINT_BLOCKED_TOAST } from "@/lib/print/print-outcome-toast";
import { printMarkdownContent } from "@ai-matrx/chat/conversation/utils/markdown-print";

// The blocked-popup toast is raised by notifyPrintOutcome (an app helper, still a host tie)
// through the app toast; the diagram warnings go through the notify seam.
jest.mock("@/lib/toast", () => ({
    toast: {
        info: jest.fn(),
    },
}));
jest.mock("@ai-matrx/chat/host/notify", () => ({
    toast: {
        warning: jest.fn(),
    },
}));

describe("printMarkdownContent — blocked Chat popup", () => {
    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    it("downloads message.html and emits the exact fallback toast", () => {
        jest.useFakeTimers();
        jest.spyOn(window, "open").mockReturnValue(null);

        const createObjectURL = jest.fn(() => "blob:chat-print-test");
        const revokeObjectURL = jest.fn();
        Object.defineProperty(URL, "createObjectURL", {
            value: createObjectURL,
            configurable: true,
            writable: true,
        });
        Object.defineProperty(URL, "revokeObjectURL", {
            value: revokeObjectURL,
            configurable: true,
            writable: true,
        });

        let downloadName = "";
        const clickSpy = jest
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(function (this: HTMLAnchorElement) {
                downloadName = this.download;
            });

        const outcome = printMarkdownContent("# Verified response", "Message");

        expect(outcome).toBe("downloaded");
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(downloadName).toBe("message.html");
        expect(toast.info).toHaveBeenCalledTimes(1);
        // The words themselves are pinned once, in
        // `lib/print/print-outcome-toast.test.ts`; what this whole-path test
        // proves is that the Chat print path really raises THAT toast.
        expect(toast.info).toHaveBeenCalledWith(PRINT_BLOCKED_TOAST.title, {
            description: PRINT_BLOCKED_TOAST.description,
        });

        jest.runAllTimers();
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:chat-print-test");
    });
});

describe("printMarkdownContent — diagrams print as pictures (verifier round 2)", () => {
    it("draws each mermaid fence and writes it into the print window as an image", async () => {
        jest.resetModules();
        jest.doMock("@ai-matrx/rich-content/mermaid/print-render", () => ({
            drawMermaidForPrint: async () => ({
                pictures: new Map([["flowchart LR\n  A --> B", '<svg xmlns="http://www.w3.org/2000/svg"></svg>']]),
                failed: 0,
            }),
        }));
        const writes: string[] = [];
        const fakeWin = {
            closed: false,
            document: { open: () => {}, write: (h: string) => writes.push(h), close: () => {} },
        };
        jest.spyOn(window, "open").mockReturnValue(fakeWin as unknown as Window);
        const { printMarkdownContent: print } = await import("@ai-matrx/chat/conversation/utils/markdown-print");
        const outcome = await print("# Runbook\n\n```mermaid\nflowchart LR\n  A --> B\n```\n", "Runbook");
        expect(outcome).toBe("opened");
        const doc = writes[writes.length - 1] as string;
        expect(doc).toContain("matrx-fence-picture");
        expect(doc).toContain("data:image/svg+xml;base64,");
        expect(doc).not.toContain("flowchart LR");
        // The window opened first, inside the click, with "Preparing…".
        expect(writes[0]).toContain("Preparing");
    });
});
