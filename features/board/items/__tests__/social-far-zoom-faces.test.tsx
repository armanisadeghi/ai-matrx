/**
 * Every social tile kind that holds a picture draws it at far zoom (`BoardItemType.Face`): a feed, ad or swipe
 * tile never falls back to a bare coloured card while its post, ad or collection has pictures.
 */
import { SOCIAL_ITEMS } from "../social-items";

describe("social tiles at far zoom", () => {
  it.each(["social-post", "social-profile", "social-outlier-feed", "social-ad", "social-swipe-collection"])("%s has a far-zoom face", (key) => {
    const type = SOCIAL_ITEMS.find((t) => t.key === key);
    expect(type).toBeDefined();
    expect(typeof type?.Face).toBe("function");
  });
});
