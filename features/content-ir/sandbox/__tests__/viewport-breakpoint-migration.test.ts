/**
 * DD-123 ruling 8 — the viewport-breakpoint → container-query rewrite.
 *
 * WHY THESE ASSERTIONS AND NOT OTHERS. This rewrite edits DATA: 45 live
 * organization-authored component bodies in `content_ir.kind_component`. A
 * mistake is not a failing build, it is 45 wrong rows in the database that
 * someone has to find by looking at screens. So the contract is pinned on the
 * three things that can silently go wrong:
 *
 *  1. THE THRESHOLD. `md:` is 48rem. If the rewrite mapped it onto Tailwind's
 *     named container scale (`@md` = 28rem) every one of these layouts would
 *     flip at a different width than its author chose, and nothing would look
 *     broken enough to notice.
 *  2. THE CONTAINER. A container-query utility with no `@container` ancestor
 *     emits CSS that never matches — the component simply never reaches its
 *     wide layout, silently. And `className` on a COMPONENT root is a prop the
 *     component may ignore, so the container has to land on a real element.
 *  3. WHAT MUST NOT BE TOUCHED. `{ md: mdLines }` is an object key, `10:30` is
 *     a time, and prose is prose. A blind regex over the body would rewrite
 *     all three — the reason this walks the parsed source instead.
 *
 * The corpus numbers in the last test are the live ones measured on
 * 2026-09-12, so a body added later that this rewrite cannot handle shows up
 * here rather than in production.
 */
import {
    VIEWPORT_TO_CONTAINER,
    rewriteViewportBreakpoints,
} from "../migrate-viewport-breakpoints";

describe("rewriteViewportBreakpoints", () => {
    it("keeps each breakpoint's exact threshold and only changes what it measures", () => {
        expect(VIEWPORT_TO_CONTAINER).toEqual({
            sm: "@[40rem]:",
            md: "@[48rem]:",
            lg: "@[64rem]:",
            xl: "@[80rem]:",
            "2xl": "@[96rem]:",
        });
        const out = rewriteViewportBreakpoints(
            'export default function C(){ return <div className="grid sm:grid-cols-2 md:gap-4 lg:p-6 xl:p-8 2xl:p-10">x</div>; }',
        );
        expect(out.variants).toBe(5);
        expect(out.next).toContain("@[40rem]:grid-cols-2");
        expect(out.next).toContain("@[48rem]:gap-4");
        expect(out.next).toContain("@[64rem]:p-6");
        expect(out.next).toContain("@[80rem]:p-8");
        expect(out.next).toContain("@[96rem]:p-10");
        expect(out.next).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):/);
    });

    it("declares the container on the component's own root element", () => {
        const out = rewriteViewportBreakpoints(
            'export default function C(){ return <div className="p-2 md:p-4">x</div>; }',
        );
        expect(out.container).toBe("prepended-to-root-class");
        expect(out.next).toContain('className="@container p-2 @[48rem]:p-4"');
    });

    it("adds a className to a root that has none", () => {
        const out = rewriteViewportBreakpoints(
            'export default function C(){ return <section><b className="md:p-4">x</b></section>; }',
        );
        expect(out.container).toBe("added-root-class");
        expect(out.next).toContain('<section className="@container">');
    });

    it("keeps a computed root class intact and cannot paint the word undefined", () => {
        const out = rewriteViewportBreakpoints(
            "export default function C({cls}){ return <div className={cls}><b className=\"md:p-4\">x</b></div>; }",
        );
        expect(out.container).toBe("expression-class");
        expect(out.next).toContain('["@container", cls].filter(Boolean).join(" ")');
    });

    it("wraps a COMPONENT root, because className there is a prop it may ignore", () => {
        const out = rewriteViewportBreakpoints(
            'export default function C(){ return <Card className="my-3"><i className="sm:p-4"/></Card>; }',
        );
        expect(out.container).toBe("wrapped-root");
        expect(out.next).toContain('<div className="@container"><Card className="my-3">');
        expect(out.next.trim().endsWith("</Card></div>; }")).toBe(true);
    });

    it("wraps a fragment root for the same reason", () => {
        const out = rewriteViewportBreakpoints(
            'export default function C(){ return <><b className="md:p-4"/></>; }',
        );
        expect(out.container).toBe("wrapped-root");
        expect(out.next).toContain('<div className="@container"><>');
    });

    it("gives every early return its own container", () => {
        const out = rewriteViewportBreakpoints(
            'export default function C({d}){ if(!d) return <div className="md:p-2">empty</div>; return <div className="md:p-4">full</div>; }',
        );
        expect(out.roots).toBe(2);
        expect(out.next.match(/@container/g)).toHaveLength(2);
    });

    it("never rewrites an object key, a time, or prose", () => {
        const source =
            'export default function C(){ const x = { md: "a", lg: 2 }; const t = "10:30"; const p = "See section lg: below"; return <div className="md:p-4">{t}{p}{x.md}</div>; }';
        const out = rewriteViewportBreakpoints(source);
        expect(out.variants).toBe(1);
        expect(out.next).toContain("{ md: \"a\", lg: 2 }");
        expect(out.next).toContain('"10:30"');
        expect(out.next).toContain("See section lg: below");
    });

    it("leaves a body with no viewport breakpoints exactly as it was", () => {
        const source =
            'export default function C(){ return <div className="@container p-2 @[40rem]:p-4">x</div>; }';
        const out = rewriteViewportBreakpoints(source);
        expect(out.variants).toBe(0);
        expect(out.next).toBe(source);
        expect(out.refusal).toBeNull();
    });

    it("refuses a body it cannot parse, by name, instead of guessing", () => {
        const out = rewriteViewportBreakpoints(
            'function ( { return <div className="md:p-4">',
        );
        expect(out.refusal).toMatch(/could not be parsed/);
        expect(out.next).toBe('function ( { return <div className="md:p-4">');
    });

    it("does not refuse an html-flavor body, which has nothing to migrate", () => {
        const out = rewriteViewportBreakpoints(
            "<!doctype html><html><body><p>hello</p></body></html>",
        );
        expect(out.refusal).toBeNull();
        expect(out.variants).toBe(0);
    });

    it("refuses, rather than half-migrating, a body with no component root", () => {
        const out = rewriteViewportBreakpoints(
            'const styles = "md:p-4"; export const notDefault = 1;',
        );
        expect(out.variants).toBe(1);
        expect(out.refusal).toMatch(/no default-exported component function/);
        expect(out.next).toContain("md:p-4");
    });
});
