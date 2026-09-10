import { loadReviewRegistry } from "./registry";
import { loadAuthenticatedReviewData } from "./review-data";
import { loadReviewQueue } from "./service";

jest.mock("./registry", () => ({ loadReviewRegistry: jest.fn() }));
jest.mock("./service", () => ({ loadReviewQueue: jest.fn() }));

const mockLoadReviewQueue = jest.mocked(loadReviewQueue);
const mockLoadReviewRegistry = jest.mocked(loadReviewRegistry);

describe("loadAuthenticatedReviewData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not issue RLS-protected reads before identity hydration", async () => {
    await expect(loadAuthenticatedReviewData(null)).resolves.toBeNull();
    expect(mockLoadReviewQueue).not.toHaveBeenCalled();
    expect(mockLoadReviewRegistry).not.toHaveBeenCalled();
  });

  it("loads the queue and registry after identity hydration", async () => {
    const registry = {
      domains: [],
      featuresById: new Map(),
      domainsById: new Map(),
      repos: [],
    };
    mockLoadReviewQueue.mockResolvedValue([]);
    mockLoadReviewRegistry.mockResolvedValue(registry);

    await expect(loadAuthenticatedReviewData("viewer-id")).resolves.toEqual({
      queue: [],
      registry,
    });
    expect(mockLoadReviewQueue).toHaveBeenCalledTimes(1);
    expect(mockLoadReviewRegistry).toHaveBeenCalledTimes(1);
  });
});
