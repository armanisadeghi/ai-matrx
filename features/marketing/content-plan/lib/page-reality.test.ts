import {
    buildChainToRealize,
    isWritePolicyBlocked,
    judgePageReality,
    planChangedAfterPage,
    type RealityPageFacts,
} from "./page-reality";

const page = (over: Partial<RealityPageFacts> = {}): RealityPageFacts => ({
    isPublished: false,
    hasDraft: false,
    contentKnown: true,
    contentChars: 0,
    draftChars: 0,
    updatedAt: "2026-08-01T00:00:00Z",
    lastPublishedAt: null,
    excludedAt: null,
    ...over,
});

describe("judgePageReality", () => {
    it("asks for a website before anything else", () => {
        const verdict = judgePageReality({
            cmsLinked: false,
            page: null,
            nodeUpdatedAt: "2026-08-01T00:00:00Z",
        });
        expect(verdict.state).toBe("no-cms-site");
        expect(verdict.action).toBe("link-site");
    });

    it("offers to create the page when the site exists but the page does not", () => {
        const verdict = judgePageReality({
            cmsLinked: true,
            page: null,
            nodeUpdatedAt: "2026-08-01T00:00:00Z",
        });
        expect(verdict.state).toBe("not-built");
        expect(verdict.action).toBe("create-page");
    });

    it("calls a contentless page empty and offers to write it", () => {
        const verdict = judgePageReality({
            cmsLinked: true,
            page: page(),
            nodeUpdatedAt: "2026-08-01T00:00:00Z",
        });
        expect(verdict.state).toBe("empty");
        expect(verdict.action).toBe("write-content");
    });

    it("counts DRAFT html as content — a realized-then-authored page is not empty", () => {
        const verdict = judgePageReality({
            cmsLinked: true,
            page: page({ draftChars: 4200 }),
            nodeUpdatedAt: "2026-08-01T00:00:00Z",
        });
        expect(verdict.state).toBe("unpublished");
        expect(verdict.action).toBe("publish");
    });

    it("flags published pages with newer unpublished edits", () => {
        const verdict = judgePageReality({
            cmsLinked: true,
            page: page({ isPublished: true, hasDraft: true, contentChars: 900, draftChars: 950 }),
            nodeUpdatedAt: "2026-08-01T00:00:00Z",
        });
        expect(verdict.state).toBe("draft-pending");
        expect(verdict.action).toBe("publish");
    });

    it("reports a live page as behind when the plan changed after it was written", () => {
        const verdict = judgePageReality({
            cmsLinked: true,
            page: page({
                isPublished: true,
                contentChars: 900,
                updatedAt: "2026-08-01T00:00:00Z",
            }),
            nodeUpdatedAt: "2026-08-09T00:00:00Z",
        });
        expect(verdict.state).toBe("stale");
        // NOT "rewrite" — the server refuses to re-author a published page.
        expect(verdict.action).toBe("edit-in-cms");
    });

    it("settles on live when the page is published and current", () => {
        const verdict = judgePageReality({
            cmsLinked: true,
            page: page({
                isPublished: true,
                contentChars: 900,
                updatedAt: "2026-08-09T00:00:00Z",
            }),
            nodeUpdatedAt: "2026-08-01T00:00:00Z",
        });
        expect(verdict.state).toBe("live");
        expect(verdict.action).toBeNull();
        expect(verdict.settled).toBe(true);
    });
});

describe("judgePageReality — the three false verdicts found by adversarial review", () => {
    it("never calls a page empty while its body is unknown", () => {
        // The full row has not landed (in flight, or the fetch failed). The old
        // code reported a live 900-word page as empty and offered to author
        // over it.
        const verdict = judgePageReality({
            cmsLinked: true,
            page: page({
                contentKnown: false,
                isPublished: true,
                updatedAt: "2026-08-09T00:00:00Z",
            }),
            nodeUpdatedAt: "2026-08-01T00:00:00Z",
        });
        expect(verdict.state).not.toBe("empty");
        expect(verdict.state).toBe("live");
    });

    it("does not report a page as behind plan because publishing it bumped the node", () => {
        // Publish writes the page, THEN advances the plan node's status — so
        // the node is always a moment newer than the page it just published.
        const verdict = judgePageReality({
            cmsLinked: true,
            page: page({
                isPublished: true,
                contentChars: 900,
                updatedAt: "2026-08-11T10:00:00Z",
                lastPublishedAt: "2026-08-11T10:00:02Z",
            }),
            nodeUpdatedAt: "2026-08-11T10:00:03Z",
        });
        expect(verdict.state).toBe("live");
    });

    it("still reports real drift once it is well past the publish", () => {
        const verdict = judgePageReality({
            cmsLinked: true,
            page: page({
                isPublished: true,
                contentChars: 900,
                updatedAt: "2026-08-11T10:00:00Z",
                lastPublishedAt: "2026-08-11T10:00:02Z",
            }),
            nodeUpdatedAt: "2026-08-11T14:00:00Z",
        });
        expect(verdict.state).toBe("stale");
    });

    it("names a retired page instead of pretending it is part of the plan", () => {
        const verdict = judgePageReality({
            cmsLinked: true,
            page: page({
                isPublished: true,
                contentChars: 900,
                excludedAt: "2026-08-05T00:00:00Z",
            }),
            nodeUpdatedAt: "2026-08-09T00:00:00Z",
        });
        expect(verdict.state).toBe("retired");
        expect(verdict.action).toBe("edit-in-cms");
    });

});

describe("planChangedAfterPage", () => {
    it("never invents drift from a missing timestamp", () => {
        expect(planChangedAfterPage(null, "2026-08-01T00:00:00Z")).toBe(false);
        expect(planChangedAfterPage("2026-08-01T00:00:00Z", null)).toBe(false);
        expect(planChangedAfterPage("not a date", "2026-08-01T00:00:00Z")).toBe(false);
    });

    it("is false when the page is newer or identical", () => {
        expect(planChangedAfterPage("2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z")).toBe(false);
        expect(planChangedAfterPage("2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z")).toBe(false);
    });

    it("measures from the LATER of the page's write and publish", () => {
        // Written long ago, published moments ago: a node edit between the two
        // is not drift.
        expect(
            planChangedAfterPage(
                "2026-08-11T09:00:00Z",
                "2026-08-01T00:00:00Z",
                "2026-08-11T10:00:00Z",
            ),
        ).toBe(false);
    });
});

describe("buildChainToRealize", () => {
    const tree = new Map(
        [
            { id: "home", parent_id: null },
            { id: "industry", parent_id: "home" },
            { id: "telecom", parent_id: "industry" },
        ].map((n) => [n.id, n]),
    );

    it("returns ancestors root-first so a deep page has something to hang from", () => {
        expect(buildChainToRealize("telecom", tree, () => false)).toEqual([
            "home",
            "industry",
            "telecom",
        ]);
    });

    it("skips ancestors that already exist on the site", () => {
        const built = new Set(["home", "industry"]);
        expect(
            buildChainToRealize("telecom", tree, (id) => built.has(id)),
        ).toEqual(["telecom"]);
    });

    it("keeps an unbuilt ancestor even when a higher one exists", () => {
        const built = new Set(["home"]);
        expect(
            buildChainToRealize("telecom", tree, (id) => built.has(id)),
        ).toEqual(["industry", "telecom"]);
    });

    it("stops at an unknown parent instead of guessing", () => {
        const orphan = new Map([["lost", { id: "lost", parent_id: "missing" }]]);
        expect(buildChainToRealize("lost", orphan, () => false)).toEqual(["lost"]);
    });

    it("terminates on a cyclic parent chain", () => {
        const cyclic = new Map(
            [
                { id: "a", parent_id: "b" },
                { id: "b", parent_id: "a" },
            ].map((n) => [n.id, n]),
        );
        expect(buildChainToRealize("a", cyclic, () => false)).toEqual(["b", "a"]);
    });

    it("is empty when the node itself is already built", () => {
        expect(buildChainToRealize("telecom", tree, () => true)).toEqual([]);
    });
});

describe("isWritePolicyBlocked", () => {
    it("recognises the server's refusal", () => {
        expect(
            isWritePolicyBlocked("Write blocked: site policy 'blocked' forbids 'update'."),
        ).toBe(true);
        expect(isWritePolicyBlocked("cms_write_policy_denied")).toBe(true);
    });

    it("does not claim every failure is a policy problem", () => {
        expect(isWritePolicyBlocked(null)).toBe(false);
        expect(isWritePolicyBlocked("A page already serves /about.")).toBe(false);
        expect(isWritePolicyBlocked("HTTP 500")).toBe(false);
    });
});
