import {
  ANON_COLUMN_SURFACE,
} from "./public-exposure";
import { LEARN_DOC_PUBLIC_SELECT } from "@/features/education/publishing/publicColumns";

describe("anonymous column projections", () => {
  it("derives the learn-doc query from the canonical declaration", () => {
    const declaration = ANON_COLUMN_SURFACE.find(
      (entry) => entry.relation === "education.learn_doc",
    );

    expect(declaration).toBeDefined();
    expect(LEARN_DOC_PUBLIC_SELECT.split(",")).toEqual(
      declaration?.columns,
    );
    expect(LEARN_DOC_PUBLIC_SELECT).not.toContain("*");
  });
});
