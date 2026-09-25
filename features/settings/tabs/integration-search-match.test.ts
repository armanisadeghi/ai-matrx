import { matchesIntegrationSearch } from "./integration-search-match";

describe("connector search", () => {
  it("finds capabilities with words in any order and mixed case", () => {
    expect(
      matchesIntegrationSearch("calendar OUTLOOK", "Outlook calendar meetings"),
    ).toBe(true);
    expect(
      matchesIntegrationSearch("teams files", "Teams chats and meetings"),
    ).toBe(false);
  });

  it("ignores accents without treating an empty query as a miss", () => {
    expect(matchesIntegrationSearch("cafe", "Café files")).toBe(true);
    expect(matchesIntegrationSearch("  ", "Dropbox")).toBe(true);
  });
});
