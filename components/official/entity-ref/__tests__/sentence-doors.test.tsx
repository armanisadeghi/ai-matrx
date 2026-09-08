/**
 * A SERVER SENTENCE IS NOT A DEAD END.
 *
 * 🚨 THE DEFECT (2026-09-07, /administration/mandates/research_client.output_slides):
 * the mandate resolver refused with
 *
 *   "resolved system agent 8f0bbfc2-… breaks the mandate contract: declares no
 *    structured output_schema, but this mandate's consumers require …"
 *
 * and the screen printed it flat. The sentence names an agent that has an
 * identity in our system, so THE DOOR LAW (no-dead-ends.md) says the reader
 * must be able to open it — instead they were handed a uuid to copy by hand.
 *
 * These pin the two halves of the fix: the sentence is split VERBATIM, and an
 * id only becomes a door when we can establish what it points at.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { segmentSentenceIds } from "../doors";
import { TextWithDoors } from "../TextWithDoors";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock("@/features/organizations/peek/ResourcePeekHost", () => ({
  __esModule: true,
  ResourcePeekHost: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const AGENT_ID = "8f0bbfc2-85d9-4913-8cea-b09a50c62be6";
const REFUSAL =
  `Mandate 'research_client.output_slides': resolved system agent ${AGENT_ID} ` +
  `breaks the mandate contract: declares no structured output_schema`;

describe("segmentSentenceIds — the server's words, plus doors", () => {
  it("gives the id the token the sentence itself named", () => {
    const segments = segmentSentenceIds(REFUSAL);
    const refs = segments.filter((s) => s.kind === "ref");
    expect(refs).toEqual([{ kind: "ref", id: AGENT_ID, token: "agent" }]);
  });

  it("keeps every character, in order — nothing is paraphrased or dropped", () => {
    const rejoined = segmentSentenceIds(REFUSAL)
      .map((s) => (s.kind === "ref" ? s.id : s.text))
      .join("");
    expect(rejoined).toBe(REFUSAL);
  });

  it("turns single-backtick field names into inline-code segments", () => {
    expect(segmentSentenceIds("requires `title` and `slides`")).toEqual([
      { kind: "text", text: "requires " },
      { kind: "code", text: "title" },
      { kind: "text", text: " and " },
      { kind: "code", text: "slides" },
    ]);
  });

  it("leaves an id alone when nothing establishes what it points at", () => {
    const text = `request ${AGENT_ID} failed`;
    expect(segmentSentenceIds(text)).toEqual([{ kind: "text", text }]);
  });

  it("uses the call site's declared token only as a fallback", () => {
    const text = `request ${AGENT_ID} failed`;
    expect(segmentSentenceIds(text, "agent")).toEqual([
      { kind: "text", text: "request " },
      { kind: "ref", id: AGENT_ID, token: "agent" },
      { kind: "text", text: " failed" },
    ]);
  });

  it("does not invent a door for a token the platform cannot open", () => {
    const text = `sprocket ${AGENT_ID} exploded`;
    expect(segmentSentenceIds(text)).toEqual([{ kind: "text", text }]);
  });
});

describe("TextWithDoors — the refusal is openable", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("renders the accused agent as a new-tab link with the full id on screen", () => {
    act(() => {
      root.render(<TextWithDoors text={REFUSAL} />);
    });
    // 🚨 NOT `/agents/<id>`. 8f0bbfc2 is a BUILTIN agent — it lives only in
    // the System Agents admin shell, and this assertion used to demand the
    // user-shell link that 404s (Arman, 2026-09-08). A sentence names an id
    // and nothing else, so the door is the always-valid address, which
    // resolves the shell server-side. See features/agents/addressing.
    const link = host.querySelector<HTMLAnchorElement>(
      `a[href="/agents/go/${AGENT_ID}"]`,
    );
    expect(link).not.toBeNull();
    expect(link?.getAttribute("target")).toBe("_blank");
    // Truncating would destroy the very string the reader came to copy.
    expect(host.textContent).toContain(AGENT_ID);
    expect(host.textContent).toContain("breaks the mandate contract");
  });

  /**
   * 🚨 R-O2, read off production twice. The admin mandate page printed
   *
   *   Its structured output is missing `title`, `slides` — whatever reads this
   *   job's result requires them.
   *
   * inside a plain `<span>`, so the BACKTICKS were on a subject matter
   * expert's screen as characters. Every sentence somebody else wrote already
   * comes through this component, so the marks are understood here and nowhere
   * else — there is exactly one inline renderer, and this is it.
   */
  it("renders the author's backticked field names as code, not as backticks", () => {
    const sentence =
      "Its structured output is missing `title`, `slides` — whatever reads this job's result requires them.";
    act(() => {
      root.render(<TextWithDoors text={sentence} />);
    });
    const codes = Array.from(host.querySelectorAll("code")).map(
      (el) => el.textContent,
    );
    expect(codes).toEqual(["title", "slides"]);
    // The marks are markup; the words are the author's and survive intact.
    expect(host.textContent).not.toContain("`");
    expect(host.textContent).toContain("Its structured output is missing");
    expect(host.textContent).toContain("whatever reads this job's result");
  });
});
