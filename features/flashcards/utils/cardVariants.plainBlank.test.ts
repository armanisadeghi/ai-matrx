// A cloze card written with a plain blank and its answer on the back must
// show the ANSWER on its back — never the blanked question again
// (page-pass 2026-09-28, /education/flashcards/[setId]).
import { plainBlankFaces, studyFaces } from "./cardVariants";

const cloze = (front: string, back: string) =>
  studyFaces({ front, back, card_kind: "cloze", dynamic_content: null });

describe("cloze card with a plain blank", () => {
  it("fills an underscore blank with the answer", () => {
    const faces = cloze(
      "Light energy is converted into chemical energy stored in ______, using carbon dioxide and water.",
      "glucose",
    );
    expect(faces.back).toBe(
      "Light energy is converted into chemical energy stored in **glucose**, using carbon dioxide and water.",
    );
    expect(faces.back).not.toContain("___");
  });

  it("fills [blank] and [____] forms", () => {
    expect(cloze("It forms the foundation of the ecosystem's [blank].", "food web").back).toBe(
      "It forms the foundation of the ecosystem's **food web**.",
    );
    expect(cloze("ATP and [____].", "NADPH").back).toBe("ATP and **NADPH**.");
  });

  it("shows a long explanatory back alone, not the question repeated", () => {
    const back =
      "An out-of-band query must return the matching nonce or payload identifier to confirm durable persistence across independent sessions.";
    const faces = cloze("Durable commit is verified when a query returns the matching [_____].", back);
    expect(faces.back).toBe(back);
  });

  it("keeps {{c1::…}} markup cards on the markup path", () => {
    const faces = cloze("Stored in {{c1::glucose}}.", "");
    expect(faces.front).toBe("Stored in **[ … ]**.");
    expect(faces.back).toBe("Stored in **glucose**.");
  });

  it("with no back, still shows the text", () => {
    expect(plainBlankFaces("Stored in ____.", "").back).toBe("Stored in ____.");
  });
});
