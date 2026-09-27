import { withArticle } from "../withArticle";

it("says the article a person would say", () => {
  expect(withArticle("insurance plan")).toBe("an insurance plan");
  expect(withArticle("patient")).toBe("a patient");
  expect(withArticle("hour")).toBe("an hour");
  expect(withArticle("user")).toBe("a user");
  expect(withArticle("university")).toBe("a university");
  expect(withArticle("umbrella")).toBe("an umbrella");
  expect(withArticle("engagement")).toBe("an engagement");
});
