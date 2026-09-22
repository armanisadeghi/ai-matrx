import { toast } from "@/lib/toast";
import { notifyPrintOutcome, PRINT_BLOCKED_TOAST } from "./print-outcome-toast";

jest.mock("@/lib/toast", () => ({
    toast: {
        info: jest.fn(),
    },
}));

const BLOCKED_MESSAGE =
    "Print window was blocked — downloaded the print file instead";
const BLOCKED_DESCRIPTION =
    "Open the downloaded file to print it, or allow pop-ups for this site.";

describe("notifyPrintOutcome", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // The two literals above are the ONE place these words are written down in
    // a test. `PRINT_BLOCKED_TOAST` is what every surface emits and what the
    // whole-path Chat print test asserts against, so pinning it here keeps the
    // copy from drifting in the module while both suites stay green.
    it("publishes the fallback words other surfaces assert against", () => {
        expect(PRINT_BLOCKED_TOAST).toEqual({
            title: BLOCKED_MESSAGE,
            description: BLOCKED_DESCRIPTION,
        });
        // A fallback that does not name the remedy is the silent-fallback
        // defect this toast exists to prevent.
        expect(PRINT_BLOCKED_TOAST.description).toMatch(/allow pop-ups/i);
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
