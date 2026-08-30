import { toast } from "@/lib/toast";
import { notifyPrintOutcome } from "./print-outcome-toast";

jest.mock("@/lib/toast", () => ({
    toast: {
        info: jest.fn(),
    },
}));

const BLOCKED_MESSAGE =
    "Print window was blocked — downloaded the print file instead";
const BLOCKED_DESCRIPTION =
    "Your browser blocked the pop-up, so the printable page was saved as an .html download. Open it and print from there, or allow pop-ups for this site.";

describe("notifyPrintOutcome", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("emits the exact fallback toast for a downloaded print file", () => {
        notifyPrintOutcome("downloaded");

        expect(toast.info).toHaveBeenCalledTimes(1);
        expect(toast.info).toHaveBeenCalledWith(BLOCKED_MESSAGE, {
            description: BLOCKED_DESCRIPTION,
        });
    });

    it.each(["opened", undefined] as const)(
        "stays silent for the %s outcome",
        (outcome) => {
            notifyPrintOutcome(outcome);

            expect(toast.info).not.toHaveBeenCalled();
        },
    );
});
