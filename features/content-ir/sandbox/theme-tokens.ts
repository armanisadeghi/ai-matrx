/**
 * theme-tokens — what the HOST page tells the sandbox frame about how the app
 * currently looks (DD-123 §1.8, S3).
 *
 * THE PROBLEM. The frame is a separate document. It links the same compiled
 * stylesheet as the app (`kind-sandbox.css` is built FROM `app/globals.css`),
 * so it has the same *default* token values — but it can never see:
 *
 *   - which of light / dark the reader is in (that lives in a class on the
 *     HOST's `<html>`, and a second document has its own `<html>`);
 *   - any token the host RESOLVED at runtime — an organization theme applied
 *     as inline custom properties on `:root`, a user accent, a density
 *     setting. None of that is in the compiled sheet.
 *
 * So the host reads the resolved value of every custom property that anything
 * in the page declares on the root element and posts the map to the frame,
 * which writes them onto its own `:root`. After that a framed component and an
 * unframed one resolve `hsl(var(--primary))` to the same string — which is the
 * whole acceptance bar for S3: framed must be visually identical to unframed.
 *
 * WHY NAMES ARE COLLECTED FROM THE STYLESHEETS rather than from a hand-kept
 * list: a hand-kept list is wrong the first time someone adds a token, and
 * wrong silently — the frame would just render the package default and nobody
 * would know which token drifted. `getComputedStyle` cannot be enumerated for
 * custom properties in every browser we support, so the names come from the
 * rules that declare them and the VALUES come from the computed style, which
 * is the resolution the reader is actually seeing.
 */

/** Selectors whose custom properties land on the root element. */
const ROOT_SELECTOR = /(^|[\s,])(:root|html)\b|\.dark\b|\[data-theme/;

/**
 * The custom-property names one declaration block holds.
 *
 * `item(i)` is the spec API and is what every browser we ship to has; some
 * DOM implementations expose only the indexed properties. Reading both means
 * this module states the same truth in a test environment as in a browser,
 * rather than passing in one and silently collecting nothing in the other.
 */
function customPropertyNames(declaration: CSSStyleDeclaration): string[] {
    const names: string[] = [];
    const indexed = declaration as unknown as Record<number, string | undefined>;
    for (let i = 0; i < declaration.length; i += 1) {
        const name =
            typeof declaration.item === "function"
                ? declaration.item(i)
                : indexed[i];
        if (typeof name === "string" && name.startsWith("--")) names.push(name);
    }
    return names;
}

function collectFromRuleList(
    rules: CSSRuleList,
    into: Set<string>,
    depth: number,
): void {
    if (depth > 6) return;
    for (const rule of Array.from(rules)) {
        const grouping = rule as CSSRule & { cssRules?: CSSRuleList };
        if (grouping.cssRules) {
            collectFromRuleList(grouping.cssRules, into, depth + 1);
            continue;
        }
        const styleRule = rule as CSSStyleRule;
        if (typeof styleRule.selectorText !== "string") continue;
        if (!ROOT_SELECTOR.test(styleRule.selectorText)) continue;
        for (const name of customPropertyNames(styleRule.style)) into.add(name);
    }
}

/**
 * Every custom-property NAME the page declares on its root element.
 *
 * A cross-origin stylesheet throws on `.cssRules`; that is expected (a font
 * sheet, an extension) and is skipped rather than reported — it declares no
 * token of ours by definition, because it is not ours.
 */
export function collectThemeTokenNames(doc: Document): string[] {
    const names = new Set<string>();
    for (const sheet of Array.from(doc.styleSheets)) {
        let rules: CSSRuleList | null = null;
        try {
            rules = sheet.cssRules;
        } catch {
            continue;
        }
        if (rules) collectFromRuleList(rules, names, 0);
    }
    for (const name of customPropertyNames(doc.documentElement.style)) {
        names.add(name);
    }
    return Array.from(names).sort();
}

/**
 * Names change only when a stylesheet is added or removed (a lazily-loaded
 * chunk, a theme sheet). Values change on every theme flip, and re-reading the
 * names on each flip would walk every rule of a 1.5 MB sheet.
 */
let cachedNames: string[] | null = null;
let cachedSheetCount = -1;

export function invalidateThemeTokenNames(): void {
    cachedNames = null;
    cachedSheetCount = -1;
}

function namesFor(doc: Document): string[] {
    const count = doc.styleSheets.length;
    if (cachedNames && count === cachedSheetCount) return cachedNames;
    cachedNames = collectThemeTokenNames(doc);
    cachedSheetCount = count;
    return cachedNames;
}

/**
 * The RESOLVED value of every root token, as the reader is seeing it right
 * now. This is what crosses to the frame.
 */
export function readThemeTokens(
    doc: Document = document,
): Record<string, string> {
    const root = doc.documentElement;
    const computed = doc.defaultView?.getComputedStyle(root);
    if (!computed) return {};
    const tokens: Record<string, string> = {};
    for (const name of namesFor(doc)) {
        const value = computed.getPropertyValue(name).trim();
        if (value) tokens[name] = value;
    }
    return tokens;
}

/** Light or dark, as the app's own `@custom-variant dark (.dark)` decides it. */
export function readColorScheme(doc: Document = document): "light" | "dark" {
    return doc.documentElement.classList.contains("dark") ? "dark" : "light";
}
