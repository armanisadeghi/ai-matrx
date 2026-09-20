/**
 * AN ACTION THE SERVER DECLARED AS NOT-YET MUST NOT LOOK LIKE ONE THAT WORKS.
 *
 * `GET /media/actions` has always sent `available` and `unavailable_reason` —
 * the registry's own HONESTY RULE: "An Action appears with `available: false`
 * and a sentence when its runner is not wired yet. It is never hidden … and it
 * is never offered as though it worked."
 *
 * The client kept only half of that bargain. `ActionDeclaration` in `types.ts`
 * did not HAVE those fields, so `useActionRunner` mapped every declaration into
 * an identical live button: `summarize` and `organize` sat on the selection bar,
 * opened the confirm, priced nothing, and answered **501** on Start. Law 4 —
 * a screen is absent or honest, never dead and never wearing a false sentence —
 * broke on a control the server had written the true sentence for.
 *
 * Found while adding a seventh Action ("Use as test cases for an agent…"), which
 * is exactly when it matters: the next unavailable declaration would have shipped
 * the same lie.
 *
 * RED PROOFS (make any of these edits and the named block fails):
 *
 *   A1 — in `components/ActionRunDialog.tsx`, set `const notYet = false;`
 *        → "a not-yet Action shows the server's sentence" fails: the reason is
 *          nowhere on screen.
 *        → "a not-yet Action has NO start button" fails: the button is back,
 *          and pressing it is the 501.
 *
 *   A2 — delete the `key === "agent_id"` branch in the same file.
 *        → "picking the agent is a picker, never a box for a uuid" fails: the
 *          param falls through to the generic text `Input`, which asks a person
 *          to type a uuid they have no way to know.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ActionRunDialog } from "../components/ActionRunDialog";
import type { ActionDeclaration } from "../types";

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The canonical agent picker reaches for redux and the agent catalog; neither is
// what this file is about. It is stood in for by a marker so the assertion is
// "the agent param routed to THE picker", not "the picker renders".
jest.mock("../components/AgentParamPicker", () => ({
    __esModule: true,
    AgentParamPicker: ({ label }: { label: string }) => (
        <div data-testid="agent-picker">{label}</div>
    ),
}));

const UNAVAILABLE_REASON =
    "Summarizing a whole selection is not wired yet. AGENT NEEDED: one that reads " +
    "many transcripts at once and returns a single grounded summary.";

function declaration(overrides: Partial<ActionDeclaration> = {}): ActionDeclaration {
    return {
        key: "summarize",
        label: "Summarize",
        description: "One summary of the whole selection.",
        scope: "whole_selection",
        cost_class: "paid",
        requires_estimate: true,
        requires_transcripts: true,
        params_schema: null,
        produces: ["document"],
        ...overrides,
    };
}

function render(action: ActionDeclaration): { root: Root; host: HTMLDivElement } {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(
            <ActionRunDialog
                open
                action={action}
                selectionCount={10}
                selectionMode="ids"
                estimate={null}
                estimateLoading={false}
                estimateError={null}
                estimateRemedy={null}
                params={{}}
                onParamsChange={() => {}}
                submitting={false}
                submitError={null}
                onCancel={() => {}}
                onConfirm={() => {}}
            />,
        );
    });
    return { root, host };
}

/** The dialog portals, so the assertion is over the whole document. */
function screenText(): string {
    return document.body.textContent ?? "";
}

function buttonLabels(): string[] {
    return Array.from(document.querySelectorAll("button")).map((b) =>
        (b.textContent ?? "").trim(),
    );
}

describe("an Action declared as not-yet", () => {
    let root: Root | null = null;

    afterEach(() => {
        act(() => root?.unmount());
        root = null;
        document.body.innerHTML = "";
    });

    it("shows the server's sentence, in the server's own words", () => {
        ({ root } = render(
            declaration({ available: false, unavailable_reason: UNAVAILABLE_REASON }),
        ));
        expect(screenText()).toContain("AGENT NEEDED");
        expect(screenText()).toContain(UNAVAILABLE_REASON);
    });

    it("has NO start button — absent, never present-and-dead", () => {
        ({ root } = render(
            declaration({ available: false, unavailable_reason: UNAVAILABLE_REASON }),
        ));
        const labels = buttonLabels();
        expect(labels.some((l) => /^Start /i.test(l))).toBe(false);
        expect(labels.some((l) => /^Spend up to/i.test(l))).toBe(false);
        // …and the way out says what it is.
        expect(labels).toContain("Close");
    });

    it("never prices what it cannot run", () => {
        ({ root } = render(
            declaration({ available: false, unavailable_reason: UNAVAILABLE_REASON }),
        ));
        expect(screenText()).not.toContain("What this will cost");
    });

    it("says something even when the server sent no sentence", () => {
        // `unavailable_reason` is documented as "a sentence … never a code, never
        // blank" — but a screen that renders nothing when the server slips is the
        // silent failure, so the fallback is a sentence too.
        ({ root } = render(declaration({ available: false })));
        expect(screenText()).toContain("not wired up yet");
    });
});

describe("an Action that IS available", () => {
    let root: Root | null = null;

    afterEach(() => {
        act(() => root?.unmount());
        root = null;
        document.body.innerHTML = "";
    });

    it("keeps its start button — the not-yet path must not eat the working one", () => {
        ({ root } = render(
            declaration({
                key: "use_as_agent_test_cases",
                label: "Use as test cases for an agent…",
                cost_class: "free",
                requires_estimate: false,
                available: true,
            }),
        ));
        expect(buttonLabels().some((l) => /^Start /i.test(l))).toBe(true);
    });

    it("treats a declaration with no `available` field as available", () => {
        // A client and a server deploy minutes apart. During that window the older
        // build's payload has no `available` key, and reading that as "not
        // available" would black out every button on the bar.
        ({ root } = render(declaration({ requires_estimate: false, cost_class: "free" })));
        expect(buttonLabels().some((l) => /^Start /i.test(l))).toBe(true);
    });

    it("picking the agent is a picker, never a box for a uuid", () => {
        ({ root } = render(
            declaration({
                key: "use_as_agent_test_cases",
                label: "Use as test cases for an agent…",
                cost_class: "free",
                requires_estimate: false,
                params_schema: {
                    type: "object",
                    required: ["agent_id"],
                    properties: { agent_id: { type: "string", format: "uuid" } },
                },
            }),
        ));
        expect(document.querySelector('[data-testid="agent-picker"]')).not.toBeNull();
        // The generic text input is what a uuid param falls through to. Its
        // presence here would BE the defect.
        expect(document.querySelector("input#param-agent_id")).toBeNull();
    });
});

describe("THERE IS ONE AGENT PICKER", () => {
    it("the Library's agent param binds the canonical catalog picker", () => {
        // A source assertion on purpose: the failure this guards against is a
        // LOCAL picker that renders perfectly and lists a different set of agents
        // than everywhere else in the product. Rendering cannot tell those apart.
        const source = readFileSync(
            join(__dirname, "..", "components", "AgentParamPicker.tsx"),
            "utf8",
        );
        expect(source).toContain('from "@ai-matrx/agents/catalog/react"');
        expect(source).toContain("AgentListDropdown");
    });
});
