const mockConfigured: { cfg: Record<string, unknown> | null } = { cfg: null };
const mockReportBrowserProviderUsage = jest.fn();

jest.mock("@ai-matrx/media/speech", () => ({
  configureSpeech: (cfg: Record<string, unknown>) => {
    mockConfigured.cfg = cfg;
  },
}));
jest.mock("@/lib/api/provider-session-failure", () => ({
  reportBrowserProviderUsage: (u: unknown) => mockReportBrowserProviderUsage(u),
  reportBrowserProviderFailureFromStore: jest.fn(),
}));

describe("speech host reports Cartesia usage", () => {
  it("forwards the engine's usage report to the browser usage reporter", async () => {
    const { installSpeechHost } = await import("@/features/audio/service/speechHost");
    installSpeechHost();
    const report = mockConfigured.cfg?.reportProviderUsage as ((u: unknown) => void) | undefined;
    expect(typeof report).toBe("function");
    const usage = { provider: "cartesia", usageId: "u-1", characters: 42 };
    report!(usage);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockReportBrowserProviderUsage).toHaveBeenCalledWith(usage);
  });
});
