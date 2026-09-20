/**
 * `lib/knobs/**` IS SERVER-SAFE, AND STAYS THAT WAY.
 *
 * THE DEFECT THIS PINS. dac8fe4b48 ("feat(data-v2): one switch per
 * organization…") added a React hook — `useEffect`/`useState` — directly
 * into `lib/knobs/unifiedDataCampaign.ts`, a module server code was already
 * importing for its constants and its pure `enabled()` reader. That module
 * carried no `"use client"` directive, so it kept being a plain module ANY
 * file could import — including genuine Server Components. On 19 September,
 * c8ded1d430 gave `features/organizations/service/organizationStoreContents.ts`
 * (itself imported by `features/organizations/service.ts`, which
 * `features/hr/settings/activation/HrActivationWizard.tsx` and dozens of
 * `app/(core)/hr/settings/**` server pages import with no client boundary in
 * between) a reason to import `UNIFIED_DATA_CAMPAIGN` from that same module —
 * and the whole app started 500ing with "You're importing a module that
 * depends on `useEffect`/`useState` into a React Server Component module."
 *
 * `lib/knobs/` is exactly the kind of directory a Server Component reaches
 * for — small, pure-looking config and feature-knob readers — so a file here
 * that quietly grows a React import is a defect this repo will keep making
 * unless something is watching the directory itself, not just the one file
 * that broke this time (lane RSC-FIX, 19 September: the hook now lives in
 * its own `"use client"` file, `useUnifiedDataCampaignGate.ts`).
 *
 * THE RULE: any file directly under `lib/knobs/` (its `__tests__/` and any
 * other nested directory are exempt — nothing there is imported by a page or
 * a server module) that does NOT open with `"use client"` may not import
 * from `"react"` at all. A file that needs React hooks/state opts into the
 * client boundary explicitly; everything else stays a plain module a Server
 * Component can safely reach.
 */
import fs from "fs";
import path from "path";

const KNOBS_DIR = path.resolve(__dirname, "..");

function isUseClient(source: string): boolean {
    // Only a leading directive counts — same rule Next.js itself applies.
    return /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["'];?/.test(source);
}

function importsReact(source: string): boolean {
    // Blank comments/strings first so a file that only TALKS about importing
    // react (like this test, or the header comment above) is never a false
    // positive.
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    return /\bfrom\s+["']react["']|require\(\s*["']react["']\s*\)/.test(withoutComments);
}

function knobFiles(): string[] {
    return fs
        .readdirSync(KNOBS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => /\.(ts|tsx)$/.test(name));
}

describe("lib/knobs/ is server-safe: no file here imports react without opting into the client boundary", () => {
    it("never a silent empty census", () => {
        expect(knobFiles().length).toBeGreaterThan(3);
    });

    it("every non-'use client' file under lib/knobs/ is free of react imports", () => {
        const offenders: string[] = [];
        for (const name of knobFiles()) {
            const file = path.join(KNOBS_DIR, name);
            const source = fs.readFileSync(file, "utf8");
            if (isUseClient(source)) continue; // opted in — hooks are fine here.
            if (importsReact(source)) offenders.push(name);
        }
        expect(offenders).toEqual([]);
    });

    it("the client-only gate hook DOES import react, and DOES declare 'use client'", () => {
        const file = path.join(KNOBS_DIR, "useUnifiedDataCampaignGate.ts");
        expect(fs.existsSync(file)).toBe(true);
        const source = fs.readFileSync(file, "utf8");
        expect(isUseClient(source)).toBe(true);
        expect(importsReact(source)).toBe(true);
    });

    it("RED: the guard catches a react import planted in a non-'use client' knob file", () => {
        // Prove the detector itself works by replaying the exact defect this
        // suite exists to catch — the react import that used to sit inside
        // unifiedDataCampaign.ts — against a throwaway source string.
        const planted = [
            "// no directive here",
            'import { useEffect, useState } from "react";',
            "export function x() {}",
        ].join("\n");
        expect(isUseClient(planted)).toBe(false);
        expect(importsReact(planted)).toBe(true);

        // GREEN once it opts in — the same source, "use client" added.
        const fixed = '"use client";\n\n' + planted;
        expect(isUseClient(fixed)).toBe(true);
    });
});
