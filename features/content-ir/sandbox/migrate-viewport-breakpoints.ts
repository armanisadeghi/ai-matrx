/**
 * migrate-viewport-breakpoints — DD-123 ruling 8, executed.
 *
 * THE RULING. A Tailwind VIEWPORT breakpoint (`sm:` / `md:` / `lg:` / `xl:` /
 * `2xl:`) is a media query, and a media query inside an iframe resolves against
 * the FRAME's viewport, not the page's. So the same organization-authored body
 * renders its wide layout unframed and its narrow layout framed — measured in
 * S3 at 19.6 % of pixels on `newsjacking_expert_article_default`. That is
 * structural to iframes and cannot be fixed inside the frame. The chair ruled
 * (plan §rulings 8): the bodies that use viewport breakpoints are migrated to
 * CONTAINER queries, which already resolve against the element's own box and
 * therefore give the same answer on both sides of the boundary.
 *
 * WHAT THE REWRITE DOES, AND WHAT IT DELIBERATELY DOES NOT DO.
 *   · `md:grid-cols-2` becomes `@[48rem]:grid-cols-2` — the THRESHOLD IS
 *     PRESERVED EXACTLY (Tailwind's `md` is 48rem), only what it is measured
 *     against changes. Remapping onto Tailwind's named container scale
 *     (`@md` = 28rem) would silently retune every one of these layouts, which
 *     is a design decision nobody made.
 *   · the component's own root element gains `@container`, because that is how
 *     all 37 live bodies that already use container queries declare their
 *     container (censused 2026-09-12: 37 of 37). The platform does NOT declare
 *     it at the mount: `container-type: inline-size` also applies layout
 *     containment, which makes the element a containing block for `fixed`
 *     descendants — 36 live bodies position something `fixed`, so a blanket
 *     container at the mount would move them.
 *   · only STRING contents are touched (string literals and template chunks),
 *     located through the parser, never a blind regex over the file.
 *
 * The body is DATA in `content_ir.kind_component.component_source`, so the
 * write goes through the one sanctioned path — `saveKindComponentCode`, signed
 * in, version-guarded, `updated_by` set, the source gate and the authoring
 * trigger both run. Never a raw UPDATE.
 *
 *   pnpm migrate:kind-sandbox-breakpoints            # dry run, prints the diff
 *   pnpm migrate:kind-sandbox-breakpoints --apply    # writes, one row at a time
 */
import { packages } from "@babel/standalone";
import type { Node } from "@babel/types";

/**
 * Tailwind v4's default viewport breakpoints, in the units Tailwind itself
 * uses. The container-query variant keeps the number and changes the yardstick.
 */
export const VIEWPORT_TO_CONTAINER: Record<string, string> = {
    sm: "@[40rem]:",
    md: "@[48rem]:",
    lg: "@[64rem]:",
    xl: "@[80rem]:",
    "2xl": "@[96rem]:",
};

export interface RewriteResult {
    next: string;
    /** how many `sm:`-style variants were rewritten */
    variants: number;
    /** how the component's container was declared */
    container:
        | "already-declared"
        | "prepended-to-root-class"
        | "added-root-class"
        | "expression-class"
        /** the root was a fragment or a component, so a container div wraps it */
        | "wrapped-root";
    /** roots that were given a container (a component can return early) */
    roots: number;
    /** a human sentence when the rewrite could not be completed */
    refusal: string | null;
}

interface Splice {
    start: number;
    end: number;
    text: string;
}

/**
 * A token is a Tailwind class candidate when the breakpoint prefix is at the
 * start of a whitespace-delimited word and is followed by something that can
 * actually start a utility. `10:30` and prose never match; `md:grid-cols-2`,
 * `lg:hover:underline` and `sm:[&>*]:gap-2` all do.
 */
const VARIANT = /(^|\s)(sm|md|lg|xl|2xl):(?=[a-zA-Z@[!_-])/g;

function rewriteClassText(text: string): { text: string; count: number } {
    let count = 0;
    const out = text.replace(VARIANT, (_m, lead: string, bp: string) => {
        count += 1;
        return `${lead}${VIEWPORT_TO_CONTAINER[bp]}`;
    });
    return { text: out, count };
}

/** Every JSX root the component function can return. */
function collectReturnedRoots(fn: Node, t: typeof import("@babel/types")): Node[] {
    const roots: Node[] = [];
    const body = (fn as any).body;
    if (!body) return roots;
    if (t.isJSXElement(body) || t.isJSXFragment(body)) {
        roots.push(body);
        return roots;
    }
    const walk = (node: any): void => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        // Do not descend into a nested component/render function: its return is
        // not this component's root.
        if (
            node !== body &&
            (t.isFunctionDeclaration(node) ||
                t.isFunctionExpression(node) ||
                t.isArrowFunctionExpression(node))
        ) {
            return;
        }
        if (t.isReturnStatement(node) && node.argument) {
            const arg = node.argument;
            if (t.isJSXElement(arg) || t.isJSXFragment(arg)) {
                roots.push(arg);
                return;
            }
            if (t.isParenthesizedExpression?.(arg)) {
                /* handled by the generic walk below */
            }
        }
        for (const key of Object.keys(node)) {
            if (key === "loc" || key === "leadingComments" || key === "trailingComments")
                continue;
            walk((node as any)[key]);
        }
    };
    walk(body);
    return roots;
}

/** The default-exported component function, however the author spelled it. */
function findComponentFunction(
    ast: any,
    t: typeof import("@babel/types"),
): Node | null {
    const program = ast.program;
    let fn: Node | null = null;
    for (const stmt of program.body) {
        if (!t.isExportDefaultDeclaration(stmt)) continue;
        const decl: any = stmt.declaration;
        if (
            t.isFunctionDeclaration(decl) ||
            t.isArrowFunctionExpression(decl) ||
            t.isFunctionExpression(decl)
        ) {
            fn = decl;
        } else if (t.isIdentifier(decl)) {
            for (const other of program.body) {
                const target = t.isExportNamedDeclaration(other)
                    ? (other as any).declaration
                    : other;
                if (t.isVariableDeclaration(target)) {
                    for (const d of target.declarations) {
                        if (t.isIdentifier(d.id) && d.id.name === decl.name && d.init) {
                            fn = d.init as Node;
                        }
                    }
                } else if (
                    t.isFunctionDeclaration(target) &&
                    target.id?.name === decl.name
                ) {
                    fn = target;
                }
            }
        }
        break;
    }
    return fn;
}

/** Add `@container` to one JSX root, returning the splice and how it was done. */
function containerSplice(
    root: any,
    source: string,
    t: typeof import("@babel/types"),
): { splices: Splice[]; how: RewriteResult["container"] } {
    if (t.isJSXFragment(root)) {
        return {
            splices: [
                { start: root.start, end: root.start, text: '<div className="@container">' },
                { start: root.end, end: root.end, text: "</div>" },
            ],
            how: "wrapped-root",
        };
    }
    // A COMPONENT root is not a container. `className` on `<Skeleton />` is a
    // prop the component may ignore (several live bodies define local
    // sub-components with a hard-coded class list), so the container would be
    // silently dropped and the rewritten utilities would never fire. Wrap it
    // in a real element instead.
    const nameNode = root.openingElement.name;
    const intrinsic =
        t.isJSXIdentifier(nameNode) && /^[a-z]/.test(nameNode.name);
    if (!intrinsic) {
        return {
            splices: [
                { start: root.start, end: root.start, text: '<div className="@container">' },
                { start: root.end, end: root.end, text: "</div>" },
            ],
            how: "wrapped-root",
        };
    }
    const attrs = root.openingElement.attributes ?? [];
    const classAttr = attrs.find(
        (a: any) => t.isJSXAttribute(a) && a.name?.name === "className",
    );
    if (!classAttr) {
        const nameEnd = root.openingElement.name.end;
        return {
            splices: [{ start: nameEnd, end: nameEnd, text: ' className="@container"' }],
            how: "added-root-class",
        };
    }
    const value = classAttr.value;
    if (t.isStringLiteral(value)) {
        if (/(^|\s)@container(\s|$)/.test(value.value)) {
            return { splices: [], how: "already-declared" };
        }
        return {
            splices: [
                { start: value.start + 1, end: value.start + 1, text: "@container " },
            ],
            how: "prepended-to-root-class",
        };
    }
    if (t.isJSXExpressionContainer(value)) {
        const inner = source.slice(value.expression.start, value.expression.end);
        if (/@container/.test(inner)) {
            return { splices: [], how: "already-declared" };
        }
        return {
            splices: [
                {
                    start: value.expression.start,
                    end: value.expression.end,
                    // `filter(Boolean)` so an undefined class expression cannot
                    // paint the literal word "undefined" into the class list.
                    text: `["@container", ${inner}].filter(Boolean).join(" ")`,
                },
            ],
            how: "expression-class",
        };
    }
    return { splices: [], how: "already-declared" };
}

/**
 * Rewrite one organization-authored body from viewport breakpoints to
 * container queries. Pure: same input, same output, no I/O.
 */
export function rewriteViewportBreakpoints(source: string): RewriteResult {
    const t = packages.types as typeof import("@babel/types");
    let ast: any;
    try {
        ast = packages.parser.parse(source, {
            sourceType: "module",
            plugins: ["jsx", "typescript"],
            errorRecovery: false,
        });
    } catch (error) {
        // An html-flavor row is a whole HTML document, not TSX — it has no
        // viewport-breakpoint utilities and nothing to migrate, so refusing it
        // by name would be noise. Refuse only a body that actually has
        // something this migration was supposed to change.
        const hasCandidate = /(^|[\s"'`])(sm|md|lg|xl|2xl):[a-zA-Z@[!_-]/.test(source);
        if (!hasCandidate) {
            return {
                next: source,
                variants: 0,
                container: "already-declared",
                roots: 0,
                refusal: null,
            };
        }
        return {
            next: source,
            variants: 0,
            container: "already-declared",
            roots: 0,
            refusal: `This body could not be parsed, so it cannot be migrated automatically: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }

    const splices: Splice[] = [];
    let variants = 0;

    // 1. The variants — string contents only, located by the parser.
    const seen = new Set<number>();
    const walkStrings = (node: any): void => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
            node.forEach(walkStrings);
            return;
        }
        if (t.isStringLiteral(node) && !seen.has(node.start)) {
            seen.add(node.start);
            const { text, count } = rewriteClassText(node.value);
            if (count) {
                variants += count;
                splices.push({ start: node.start + 1, end: node.end - 1, text });
            }
        } else if (t.isTemplateElement(node) && !seen.has(node.start)) {
            seen.add(node.start);
            const raw = source.slice(node.start, node.end);
            const { text, count } = rewriteClassText(raw);
            if (count) {
                variants += count;
                splices.push({ start: node.start, end: node.end, text });
            }
        }
        for (const key of Object.keys(node)) {
            if (key === "loc" || key === "leadingComments" || key === "trailingComments")
                continue;
            walkStrings(node[key]);
        }
    };
    walkStrings(ast.program.body);

    if (!variants) {
        return {
            next: source,
            variants: 0,
            container: "already-declared",
            roots: 0,
            refusal: null,
        };
    }

    // 2. The container, on the component's own root(s).
    const fn = findComponentFunction(ast, t);
    if (!fn) {
        return {
            next: source,
            variants,
            container: "already-declared",
            roots: 0,
            refusal:
                "This body has no default-exported component function, so the migration could not find the root element to declare `@container` on. Migrate it by hand.",
        };
    }
    const roots = collectReturnedRoots(fn, t);
    if (!roots.length) {
        return {
            next: source,
            variants,
            container: "already-declared",
            roots: 0,
            refusal:
                "This body's component returns no JSX element directly, so the migration could not find a root to declare `@container` on. Migrate it by hand.",
        };
    }
    const strategies = new Set<RewriteResult["container"]>();
    for (const root of roots) {
        const r = containerSplice(root, source, t);
        if (r.splices.length) {
            splices.push(...r.splices);
        }
        strategies.add(r.how);
    }
    const order: RewriteResult["container"][] = [
        "wrapped-root",
        "expression-class",
        "added-root-class",
        "prepended-to-root-class",
        "already-declared",
    ];
    const how = order.find((s) => strategies.has(s)) ?? "already-declared";

    // 3. Apply right to left so earlier offsets stay valid.
    splices.sort((a, b) => b.start - a.start);
    let next = source;
    for (const s of splices) {
        next = next.slice(0, s.start) + s.text + next.slice(s.end);
    }
    return { next, variants, container: how, roots: roots.length, refusal: null };
}
