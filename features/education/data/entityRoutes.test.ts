import { educationEntityHref, educationEntityStudyHref } from "./entityRoutes";

describe("education note routes", () => {
  it("keeps editing in Notes while opening the same note as a study guide", () => {
    const id = "37a70a04-5ab8-46f7-a11c-304356bdbc3e";

    expect(educationEntityHref("note", id)).toBe(`/education/notes/${id}`);
    expect(educationEntityStudyHref("note", id)).toBe(
      `/education/study-guides/${id}`,
    );
  });

  it("does not redirect another content type to study guides", () => {
    expect(educationEntityStudyHref("assessment", "quiz-1")).toBe(
      "/education/quizzes/quiz-1",
    );
  });
});
