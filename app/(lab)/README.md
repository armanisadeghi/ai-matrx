# The Lab — the fast demo site (lab.aimatrx.com)

The demos site (demos.aimatrx.com) builds in about 8 minutes because every demo renders inside the full AppShell. The lab builds in about 1.5 minutes from push to live, with a ~10 s compile, because a lab build contains only lab pages.

- **Add a page:** `app/(lab)/lab/<name>/page.lab.tsx`, plus a row in `lab/lab-pages.ts`.
- **Preview locally:** `/lab/<name>` on the shared preview server. Locally it renders inside the normal root layout.
- **Ship:** `pnpm ship:lab "note" --watch -- "app/(lab)/lab/<name>/page.lab.tsx"`. Only ai-matrx-lab builds.
- **How it works:** `MATRX_PROFILE=lab` sets `pageExtensions` to `lab.tsx`/`lab.ts`/`labroot.tsx` in `next.config.js`, so no other route, layout, proxy or API file is in the graph. `layout.labroot.tsx` is the lab's thin root layout: CSS and theme only, with no AppShell, Providers or Redux. A page that needs a provider renders it itself and pays the compile cost for it.
- **Graduate:** when a page stops changing, move it to `app/(dev)/demos/<name>/page.dev.tsx`.
- **Vercel:** project `ai-matrx-lab`, build command `next build`, env `MATRX_PROFILE=lab` and `MATRX_BUILD_TARGET=lab` plus the public Supabase and backend URLs. It builds on `release-lab:` and `release-all:` commits (`scripts/vercel-ignore-build.sh`).
