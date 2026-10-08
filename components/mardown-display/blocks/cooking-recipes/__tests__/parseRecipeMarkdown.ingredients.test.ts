/**
 * An ingredient line splits into amount + item at a WHOLE unit word, never
 * inside the item's first word: "4 large eggs" was "4 l" + "arge eggs" (the
 * unit alternation had no word boundary, and "l" was tried before "lb").
 */
import { parseRecipeMarkdown } from "../parseRecipeMarkdown";

function ingredients(lines: string[]) {
  const md = ["### Test", "", "**Yields:** 1", "", "#### Ingredients:", ...lines.map((l) => `- ${l}`), "", "#### Instructions:", "1. **Mix:** Mix it."].join("\n");
  return parseRecipeMarkdown(md)?.ingredients ?? [];
}

describe("parseRecipeMarkdown ingredient amounts", () => {
  it.each([
    ["4 large eggs, separated", "4", "large eggs, separated"],
    ["4 cloves garlic, minced", "4", "cloves garlic, minced"],
    ["2 lemons", "2", "lemons"],
    ["1 lb ground beef", "1 lb", "ground beef"],
    ["2 lbs potatoes", "2 lbs", "potatoes"],
    ["2 cups flour", "2 cups", "flour"],
    ["1 cup milk", "1 cup", "milk"],
    ["1 tsp vanilla extract", "1 tsp", "vanilla extract"],
    ["1 tbsp water", "1 tbsp", "water"],
    ["500 ml milk, lukewarm", "500 ml", "milk, lukewarm"],
    ["1 l stock", "1 l", "stock"],
    ["150 g granulated sugar", "150 g", "granulated sugar"],
    ["3 garlic cloves", "3", "garlic cloves"],
    ["8 oz spaghetti", "8 oz", "spaghetti"],
    ["2 ounces dark chocolate", "2 ounces", "dark chocolate"],
    ["1/4 cup grated parmesan", "1/4 cup", "grated parmesan"],
    ["1 kg tomatoes", "1 kg", "tomatoes"],
    ["2 teaspoons salt", "2 teaspoons", "salt"],
  ])("%s", (line, amount, item) => {
    expect(ingredients([line])[0]).toEqual({ amount, item });
  });
});
