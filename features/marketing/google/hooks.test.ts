import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/lib/redux/hooks";
import { useGoogleConnectionInventory } from "./hooks";

jest.mock("@tanstack/react-query", () => ({
  useMutation: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: jest.fn(),
}));

jest.mock("./service", () => ({
  listGoogleConnectionInventory: jest.fn(),
}));

describe("useGoogleConnectionInventory", () => {
  const mockedUseQuery = jest.mocked(useQuery);
  const mockedUseAppSelector = jest.mocked(useAppSelector);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQuery.mockReturnValue({} as ReturnType<typeof useQuery>);
  });

  it("does not query the authenticated-only table before auth hydrates", () => {
    mockedUseAppSelector.mockReturnValue(false);

    useGoogleConnectionInventory();

    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("enables the inventory query after authentication", () => {
    mockedUseAppSelector.mockReturnValue(true);

    useGoogleConnectionInventory();

    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });
});
