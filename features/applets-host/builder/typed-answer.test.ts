// Lane F18: whatever she types while the builder's question is open answers it (live v0.4.3084 queued it as "Next").
import { typedAnswerBody } from "./typed-answer";
import { whenOrgReady } from "./org-ready";

const QUESTIONS = {
  form: "questions",
  questions: [{ type: "choice", question: "What kind of workflow?", options: [{ label: "Client & Project Pipeline" }, { label: "Sales & Lead CRM" }], allow_other: true }],
} as never;
const CHOOSE = { form: "choose_one", choices: [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }] } as never;

describe("a typed reply answers the open question", () => {
  it("a questions ask takes free text that matches no option as her own words", () => {
    const body = typedAnswerBody(QUESTIONS, "It is a pet grooming business") as { answers: { freeform: string | null; cancelled: boolean }[]; wrote_instead: boolean; cancelled: boolean };
    expect(body.answers[0].freeform).toBe("It is a pet grooming business");
    expect(body.wrote_instead).toBe(true);
    expect(body.cancelled).toBe(false);
  });
  it("a questions ask takes an option's label as that option", () => {
    const body = typedAnswerBody(QUESTIONS, " sales & lead crm ") as { answers: { selected: string[] | null }[]; wrote_instead: boolean };
    expect(body.answers[0].selected).toEqual(["Sales & Lead CRM"]);
    expect(body.wrote_instead).toBe(false);
  });
  it("a text question takes the words as its answer", () => {
    const body = typedAnswerBody({ form: "questions", questions: [{ type: "text", question: "Name?" }] } as never, "Paws") as { answers: { answer: string | null }[] };
    expect(body.answers[0].answer).toBe("Paws");
  });
  it("choose_one: a label or value picks it, other words are the answer with a note", () => {
    expect(typedAnswerBody(CHOOSE, "beta")).toEqual({ value: "b" });
    expect(typedAnswerBody(CHOOSE, "b")).toEqual({ value: "b" });
    expect(typedAnswerBody(CHOOSE, "something else")).toEqual({ value: "something else", note: "something else" });
  });
  it("a kind a sentence cannot answer stays on its card", () => {
    expect(typedAnswerBody({ form: "credential" } as never, "x")).toBeNull();
  });
});

describe("a send while the organizations are still being checked waits", () => {
  it("retries until the organization is ready, then returns it", async () => {
    const still = Object.assign(new Error("Still checking your organizations. Try again in a moment."), { code: "organization_context_required" });
    const ensure = jest.fn().mockRejectedValueOnce(still).mockRejectedValueOnce(still).mockResolvedValue("org-1");
    await expect(whenOrgReady(ensure, { pauseMs: 0, tries: 5 })).resolves.toBe("org-1");
    expect(ensure).toHaveBeenCalledTimes(3);
  });
  it("any other refusal is thrown at once, and a never-ready page ends loudly", async () => {
    const none = Object.assign(new Error("You don't belong to an organization yet. Create one to continue."), { code: "organization_context_required" });
    const ensure = jest.fn().mockRejectedValue(none);
    await expect(whenOrgReady(ensure, { pauseMs: 0, tries: 5 })).rejects.toThrow("don't belong");
    expect(ensure).toHaveBeenCalledTimes(1);
    const still = new Error("Still checking your organizations. Try again in a moment.");
    const slow = jest.fn().mockRejectedValue(still);
    await expect(whenOrgReady(slow, { pauseMs: 0, tries: 3 })).rejects.toThrow("Still checking");
    expect(slow).toHaveBeenCalledTimes(3);
  });
});

describe("the builder's button while the question is open", () => {
  it("reads Answer, and the typed reply goes through the typed-answer door", () => {
    const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "AppletBuilder.tsx"), "utf8") as string;
    expect(src).toContain('{asking ? "Answer" : busy ? "Send next"');
    expect(src).toContain("typedAnswerBody(ask.render, text)");
    expect(src).toContain("whenOrgReady(() => ensureOrgId(null))");
  });
});
