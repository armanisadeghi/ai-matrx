# FEATURE.md — Matrx Local download

**Status:** active
**Route:** `/download`
**Last updated:** 2026-08-17

## Purpose

Give non-technical users one public, first-party place to choose, download, and install Matrx Local without interpreting GitHub asset names or installer formats.

## Entry points

- `app/(public)/download/page.tsx` — public route and metadata.
- `MatrxLocalDownloadLanding.tsx` — server-rendered OS guidance, download cards, Mac chooser, and installation steps.
- `release.ts` — the **one release manifest** for version and installer URLs; other product surfaces link to `/download`, never GitHub’s asset list.
- `components/matrx/PublicHeader.tsx` and `PublicFooter.tsx` — sitewide public doors to the guide.

## Rules

- **Lead with Windows, Mac, and Linux.** File extensions and architecture names never become the primary choice.
- **Put the detected computer first.** The recommendation changes card order as well as styling, especially for narrow screens.
- **Render the recommendation in the original HTML.** `page.tsx` reads the request user agent; no client hydration may add, remove, or reorder content after paint.
- **Recommend only the operating system.** User agents cannot reliably distinguish Apple-chip from Intel Macs; the page asks a plain-language question and shows the exact “About This Mac” check.
- **Windows uses the guided `.exe`; Mac uses `.dmg`; Linux uses the Ubuntu/Debian installer.** Technical formats stay behind human labels.
- **Mobile is a handoff state.** Tell the user to reopen the page on the computer where they want Matrx Local.
- **Release updates are atomic.** Verify every asset exists, then update `MATRX_LOCAL_RELEASE` version, release page, and all four URLs together.
- **No silent compatibility claims.** The Linux card names the supported family and warns that other distributions may not work.

## Doctrine

This surface composes the public header/footer, `Button`, and theme tokens. It adds no client state, post-paint mutation, data store, API route, download proxy, or duplicate release host. `detectDesktopPlatform()` is pure and reusable; request access stays in the route.

## Change log

- `2026-08-17` — Added the public download and install landing page for release 1.4.32, OS recommendation, plain-language Mac selection, and sitewide header/footer doors.
- `2026-08-17` — Removed the duplicate hero logo, compacted the first fold, and moved recommendation detection to server render so loading cannot shift the page.
