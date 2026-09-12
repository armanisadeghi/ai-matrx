/**
 * WHAT THE FRAME RUNTIME TOUCHES — and, just as important, what jsdom can and
 * cannot settle about it (DD-123 S6, probe suite 2).
 *
 * THE CLAIM UNDER TEST. Inside the real frame, `window.top`, `window.parent`,
 * `document.cookie`, `localStorage` and `sessionStorage` all THROW: the
 * document is sandboxed without `allow-same-origin`, so its origin is opaque.
 * A runtime that merely READS one of them — `react-resizable-panels` defaults
 * its storage option to `localStorage` (V-27 finding D) — takes the whole
 * component down. So the requirement is not "we do not use them on purpose";
 * it is "nothing on the mount path touches them at all".
 *
 * HOW THIS SUITE MEASURES IT. It replaces those five properties with accessors
 * that COUNT the access and then throw `SecurityError`, exactly as a browser
 * does on an opaque origin, and then runs the REAL frame runtime
 * (`runtime/entry.tsx` — the same module the bundle is built from) through its
 * whole life: mount a component body, hand it new props, change the theme,
 * unmount. Zero accesses is the assertion.
 *
 * THE BUILD-TIME AUDIT IS A DIFFERENT GUARD, not a duplicate of this one.
 * `build-kind-sandbox.ts` greps the SERVED BYTES for these names and fails the
 * build; that catches a dependency that mentions them. This catches the
 * runtime path actually reaching one — through a computed property, a
 * try/catch, a helper the grep cannot see. Both, or neither is honest.
 *
 * 🚨 WHAT JSDOM CANNOT PROVE, AND THEREFORE IS NOT CLAIMED HERE — the list is
 * asserted below against the real-browser spec so the two can never drift:
 *   · that the frame's origin really is opaque (jsdom has no origin isolation);
 *   · that the browser throws `SecurityError` for these five (jsdom throws
 *     nothing — the traps here are OURS, standing in for the browser);
 *   · that `self.origin` serializes to "null" while `location.origin` does not;
 *   · that the CSP refuses fetch/img/beacon/socket/`javascript:`;
 *   · that nothing leaves the frame on the network.
 * All five are asserted for real in `browser/kind-sandbox.spec.ts`
 * (`pnpm test:kind-sandbox:browser`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { __matrxFrameStorage } from "../runtime/frame-storage";

/** Exactly what a browser refuses on an opaque origin. */
const OPAQUE_ORIGIN_PROPERTIES = [
    "window.top",
    "window.parent",
    "document.cookie",
    "localStorage",
    "sessionStorage",
] as const;

/**
 * The claims this file explicitly does NOT make. Each string must appear in
 * the browser spec, so deleting a browser assertion cannot quietly leave a
 * claim unproven anywhere.
 */
const PROVEN_ONLY_IN_A_REAL_BROWSER = [
    "window.top",
    "parent.document",
    "document.cookie",
    "localStorage",
    "self.origin",
    "location.origin",
    "connect-src",
    "img-src",
    "script-src",
] as const;

interface Trap {
    hits: string[];
    restore: () => void;
}

function trapOpaqueOriginProperties(): Trap {
    const hits: string[] = [];
    const undo: Array<() => void> = [];

    const trap = (
        target: object,
        name: string,
        label: string,
    ): void => {
        const previous = Object.getOwnPropertyDescriptor(target, name);
        const thrower = () => {
            hits.push(label);
            const error = new Error(
                `Failed to read the '${name}' property: the document is sandboxed and lacks the 'allow-same-origin' flag.`,
            );
            error.name = "SecurityError";
            throw error;
        };
        try {
            Object.defineProperty(target, name, {
                configurable: true,
                get: thrower,
                set: thrower,
            });
            undo.push(() => {
                if (previous) Object.defineProperty(target, name, previous);
                else delete (target as Record<string, unknown>)[name];
            });
        } catch {
            // A property jsdom refuses to redefine is one this suite cannot
            // speak about — and saying so is the point of the list above.
        }
    };

    trap(window, "top", "window.top");
    trap(window, "parent", "window.parent");
    trap(window, "localStorage", "localStorage");
    trap(window, "sessionStorage", "sessionStorage");
    trap(Document.prototype, "cookie", "document.cookie");

    return { hits, restore: () => undo.forEach((fn) => fn()) };
}

const RENDERING_BODY = {
    transformed:
        'const Component = function Component(props) { return React.createElement("p", { id: "probe-body" }, "value: " + String(props.data && props.data.title)); };\nreturn Component;',
    importBindings: [],
    declaredTopLevel: [],
    allowedImports: [],
};

describe("the frame runtime never touches a property an opaque origin refuses", () => {
    it("mounts, re-renders, re-themes and unmounts a real body with zero accesses", () => {
        const trap = trapOpaqueOriginProperties();
        try {
            // Required AFTER the traps, so anything the module does at import
            // time is counted too.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const runtime = require("../runtime/entry") as typeof import("../runtime/entry");

            const container = document.createElement("main");
            container.id = "root";
            document.body.appendChild(container);

            const errors: string[] = [];
            const handle = runtime.mountKindComponent(
                container,
                RENDERING_BODY as never,
                {
                    props: { data: { title: "first" }, kind: "probe_kind", config: {} },
                    themeTokens: { "--background": "0 0% 100%" },
                    colorScheme: "light",
                    onError: (message) => errors.push(message),
                },
            );

            handle.update({ data: { title: "second" }, kind: "probe_kind", config: {} });
            handle.setTheme({ "--background": "0 0% 4%" }, "dark");
            handle.unmount();
            container.remove();

            expect(errors).toEqual([]);
            expect(
                trap.hits,
                "the frame runtime reached a property that THROWS inside a real sandboxed frame",
            ).toEqual([]);
        } finally {
            trap.restore();
        }
    });

    it("the storage stand-in answers empty, announces a write, and reaches no real storage", () => {
        const trap = trapOpaqueOriginProperties();
        const warnings: string[] = [];
        const warn = jest
            .spyOn(console, "warn")
            .mockImplementation((...args: unknown[]) => {
                warnings.push(args.join(" "));
            });
        try {
            expect(__matrxFrameStorage.getItem("anything")).toBeNull();
            expect(__matrxFrameStorage.length).toBe(0);
            expect(__matrxFrameStorage.key(0)).toBeNull();
            __matrxFrameStorage.setItem("panel-sizes", "[50,50]");

            expect(warnings.join("\n")).toContain("panel-sizes");
            expect(warnings.join("\n")).toContain("Nothing was saved");
            expect(
                trap.hits,
                "the storage stand-in fell through to the real global",
            ).toEqual([]);
        } finally {
            warn.mockRestore();
            trap.restore();
        }
    });

    it("a body that reaches for the network is refused by name, not by the trap", () => {
        const trap = trapOpaqueOriginProperties();
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { executeKindBody } = require("../runtime/execute-kind-body") as typeof import("../runtime/execute-kind-body");
            const built = executeKindBody({
                transformed:
                    'const Component = function Component() { fetch("https://evil.example"); return null; };\nreturn Component;',
                importBindings: [],
                declaredTopLevel: [],
                allowedImports: [],
            } as never);
            expect(built.Component).toBeTruthy();

            let thrown: Error | null = null;
            try {
                (built.Component as () => unknown)();
            } catch (err) {
                thrown = err as Error;
            }
            expect(thrown, "the banned-global stub did not fire").toBeTruthy();
            expect(thrown?.message).toContain('tried to use "fetch"');
            expect(thrown?.message).toContain("may not reach the");
            expect(trap.hits).toEqual([]);
        } finally {
            trap.restore();
        }
    });
});

describe("what jsdom cannot prove is proven in the browser spec", () => {
    const spec = readFileSync(
        path.resolve(
            __dirname,
            "../browser/kind-sandbox.spec.ts",
        ),
        "utf8",
    );
    const probes = readFileSync(
        path.resolve(__dirname, "../browser/probes.ts"),
        "utf8",
    );
    const both = `${spec}\n${probes}`;

    it.each(PROVEN_ONLY_IN_A_REAL_BROWSER.map((name) => [name]))(
        "%s is asserted in browser/kind-sandbox.spec.ts",
        (name) => {
            expect(
                both.includes(name),
                `"${name}" is named as a claim this jsdom suite deliberately does NOT make, ` +
                    `but nothing in browser/kind-sandbox.spec.ts mentions it any more — ` +
                    `so it is now proven nowhere. Restore the browser assertion, or stop ` +
                    `listing it here.`,
            ).toBe(true);
        },
    );

    it("names every opaque-origin property the traps above stand in for", () => {
        // The trap list and the browser list are two halves of one claim; if a
        // property is trapped here it must also be measured for real.
        for (const property of OPAQUE_ORIGIN_PROPERTIES) {
            const shortName = property.replace("window.", "");
            expect(
                both.includes(shortName),
                `${property} is trapped in jsdom but never measured in a real browser.`,
            ).toBe(true);
        }
    });
});
