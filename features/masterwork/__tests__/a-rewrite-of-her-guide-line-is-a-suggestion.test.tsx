/**
 * A REWRITE OF HER GUIDE LINE IS A SUGGESTION, NEVER A SILENT OVERWRITE —
 * cold walk 22 (friction).
 *
 * She typed "An assistant that decides, the way I do as a residential tile
 * and grout restoration contractor, …"; after the interview's first turn the
 * interviewer's `update_meta` replaced it with "How this shop decides,
 * on-site, …" and the Rulebook page printed the rewrite as hers. (The server
 * behaviour belongs to another lane; this pins the SCREEN.)
 *
 *   1. her wording is recorded at creation (`metadata.expert_description`);
 *   2. a live description that differs from it is reported as a suggestion,
 *      and one that matches (or has nothing to compare to) is not;
 *   3. the suggestion line offers "Use it" / "Keep mine" and each calls its
 *      own save.
 *
 * RED before: `expert_description` was never written, `suggestedDescription`
 * and `SuggestedWording` did not exist.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    schema: () => ({ from: () => ({}) }),
  },
}));
jest.mock("../understudy/refresh", () => ({ pokeUnderstudy: jest.fn() }));

import { createDraftRulebook } from "../service";
import { suggestedDescription, type Rulebook } from "../types";
import { SuggestedWording } from "../components/detail/SuggestedWording";

const HERS =
  "An assistant that decides, the way I do as a residential tile and grout restoration contractor, whether a shower gets a clean regrout, a corner recaulk, or a tear-out and retile";
const REWRITE =
  "How this shop decides, on-site, whether a shower/tile job gets a clean regrout, a corner recaulk, or a full tear-out and retile — and the three physical checks that must happen before any number is quoted.";

function rulebook(description: string, metadata: Record<string, unknown>): Rulebook {
  return { description, metadata } as unknown as Rulebook;
}

describe("her Guide line", () => {
  it("is recorded as hers when the Rulebook is created", async () => {
    rpc.mockResolvedValue({
      data: {
        id: "f3fefbaf-15e6-4493-ae86-f9870e7e1f4d",
        name: "walk22-Regrout or Retile Verdict",
        slug: "walk22-regrout-or-retile-verdict",
        description: HERS,
        source: {},
        sections: {},
        rules: [],
        status: "draft",
        metadata: {},
        version: 1,
        created: true,
      },
      error: null,
    });
    await createDraftRulebook({
      name: "walk22-Regrout or Retile Verdict",
      description: HERS,
      source: {},
      organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    } as never);
    const [fn, args] = rpc.mock.calls[0] as [string, { p_metadata: Record<string, unknown> }];
    expect(fn).toBe("rulebook_create");
    expect(args.p_metadata.expert_description).toBe(HERS);
  });

  it("a rewrite is a suggestion, shown beside her own words", () => {
    expect(
      suggestedDescription(rulebook(REWRITE, { expert_description: HERS })),
    ).toEqual({ suggested: REWRITE, hers: HERS });
  });

  it("a Rulebook made before the key existed compares against the goal she typed", () => {
    expect(
      suggestedDescription(rulebook(REWRITE, { intake: { goal: HERS } })),
    ).toEqual({ suggested: REWRITE, hers: HERS });
  });

  it("her own words — or nothing to compare to — is never called a suggestion", () => {
    expect(
      suggestedDescription(rulebook(`  ${HERS} `, { expert_description: HERS })),
    ).toBeNull();
    expect(suggestedDescription(rulebook(REWRITE, {}))).toBeNull();
  });

  it("offers Use it and Keep mine, each saving its own choice", async () => {
    const onUse = jest.fn(async () => {});
    const onKeepMine = jest.fn(async () => {});
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() =>
      root.render(
        <SuggestedWording hers={HERS} onUse={onUse} onKeepMine={onKeepMine} />,
      ),
    );
    expect(host.textContent).toContain("Suggested wording");
    expect(host.textContent).toContain(HERS);
    const buttons = Array.from(host.querySelectorAll("button"));
    const use = buttons.find((b) => b.textContent === "Use it")!;
    const keep = buttons.find((b) => b.textContent === "Keep mine")!;
    await act(async () => use.click());
    await act(async () => keep.click());
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onKeepMine).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
