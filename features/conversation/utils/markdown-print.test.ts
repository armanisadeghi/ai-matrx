import { toast } from "@/lib/toast";
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
        expect(toast.info).toHaveBeenCalledWith(
            "Print window was blocked — downloaded the print file instead",
            {
                description:
                    "Your browser blocked the pop-up, so the printable page was saved as an .html download. Open it and print from there, or allow pop-ups for this site.",
            },
        );

        jest.runAllTimers();
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:chat-print-test");
    });
});
