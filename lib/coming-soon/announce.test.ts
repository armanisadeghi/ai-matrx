import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { announceComingSoon } from "./announce";
import { getComingSoon } from "./registry";

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn().mockResolvedValue(true),
}));

const mockedConfirm = jest.mocked(confirm);

describe("announceComingSoon", () => {
  beforeEach(() => mockedConfirm.mockClear());

  it("renders the registered promise through the canonical acknowledge dialog", async () => {
    const entry = getComingSoon("agents.create-app");
    expect(entry).toBeDefined();

    await announceComingSoon("agents.create-app");

    expect(mockedConfirm).toHaveBeenCalledWith({
      title: `${entry?.label} — coming soon`,
      description: `${entry?.promise}\n\nOn the roadmap — not started yet.`,
      confirmLabel: "Got it",
      cancelLabel: null,
    });
  });

  it("fails closed for an unregistered promise id in development", async () => {
    await expect(announceComingSoon("test.unregistered")).rejects.toThrow(
      "is not in lib/coming-soon/registry.ts",
    );
    expect(mockedConfirm).not.toHaveBeenCalled();
  });
});
