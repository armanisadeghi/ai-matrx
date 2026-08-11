import {
    isWritePolicyBlocked,
    judgePageReality,
    planChangedAfterPage,
    rollupReality,
    type RealityPageFacts,
    type RealityState,
} from "./page-reality";

const page = (over: Partial<RealityPageFacts> = {}): RealityPageFacts => ({
    isPublished: false,
    hasDraft: false,
    contentChars: 0,
    draftChars: 0,
    updatedAt: "2026-08-01T00:00:00Z",
    lastPublishedAt: null,
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
        expect(verdict.action).toBe("rewrite");
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

describe("rollupReality", () => {
    it("counts every planned page in the denominator, built or not", () => {
        const states: RealityState[] = [
            "not-built",
            "not-built",
            "empty",
            "unpublished",
            "live",
            "stale",
            "draft-pending",
        ];
        expect(rollupReality(states)).toEqual({
            planned: 7,
            built: 5,
            written: 4,
            published: 3,
            behind: 2,
        });
    });

    it("treats an unlinked site as nothing built", () => {
        expect(rollupReality(["no-cms-site", "no-cms-site"])).toEqual({
            planned: 2,
            built: 0,
            written: 0,
            published: 0,
            behind: 0,
        });
    });
});
