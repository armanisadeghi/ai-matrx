import { toast } from "@/lib/toast";
import { PRINT_BLOCKED_TOAST } from "@/lib/print/print-outcome-toast";
import { printMarkdownContent } from "./markdown-print";

jest.mock("@/lib/toast", () => ({
    toast: {
        info: jest.fn(),
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
