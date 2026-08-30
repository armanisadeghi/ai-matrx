import { getTopicOverviewServer, getResearchIntentsServer, getTopicServer } from "@/features/research/service/server";
import ResearchTopicLayout from "./layout";

jest.mock("next/navigation", () => ({ notFound: jest.fn() }));
jest.mock("@/features/research/service/server", () => ({
  getTopicServer: jest.fn(),
  getTopicOverviewServer: jest.fn(),
  getResearchIntentsServer: jest.fn(),
}));

const mockGetTopicServer = jest.mocked(getTopicServer);
const mockGetTopicOverviewServer = jest.mocked(getTopicOverviewServer);
const mockGetResearchIntentsServer = jest.mocked(getResearchIntentsServer);

describe("ResearchTopicLayout access ordering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the access gate without launching topic-dependent reads when access is absent", async () => {
    mockGetTopicServer.mockResolvedValue(null);
    mockGetTopicOverviewServer.mockRejectedValue(
      new Error("overview must not run for an inaccessible topic"),
    );
    mockGetResearchIntentsServer.mockRejectedValue(
      new Error("intent catalog must not run before access is known"),
    );

    const result = await ResearchTopicLayout({
      children: <div>topic content</div>,
      params: Promise.resolve({
        topicId: "0d59c395-8c19-43df-90df-8ca384f3edc3",
      }),
    });

    expect(result).toBeTruthy();
    expect(mockGetTopicServer).toHaveBeenCalledTimes(1);
    expect(mockGetTopicOverviewServer).not.toHaveBeenCalled();
    expect(mockGetResearchIntentsServer).not.toHaveBeenCalled();
  });
});
