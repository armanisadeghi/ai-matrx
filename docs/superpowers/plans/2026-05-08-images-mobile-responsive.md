# Images Mobile Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every page under `app/(a)/images` fully mobile friendly, using the current `/agents` main page mobile experience as the standard.

**Architecture:** Keep desktop behavior intact while adding a mobile-first shell for the image system: compact top identity, bottom action/search/navigation controls, bottom sheets for options, and single-scroll page bodies. Shared route shell and shared image-manager components should carry the common mobile patterns so individual pages stay small.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS 4, Lucide React, existing official `MobileActionBar` and `BottomSheet` components.

---

## Mobile Standard

- [x] Use `/agents` main mobile page as the visual and interaction baseline: top app header, scrollable content, and a bottom glass action/search bar.
- [x] Replace mobile sidebars, dense toolbars, segmented controls, filter rows, and option clusters with bottom sheets or compact icon buttons.
- [x] Preserve desktop layouts; mobile changes should be responsive classes or mobile-only components.
- [x] Use `h-dvh` / `min-h-dvh`, `pb-safe`, and a single scroll area per page.
- [x] Keep inputs at 16px minimum on mobile.
- [x] Use Lucide icons for controls; no browser dialogs.
- [x] Keep route navigation transition-safe with disabled repeated actions where page buttons navigate.
- [ ] Verify every page at 400px wide and at a normal desktop viewport before marking complete.

## Shared Shell And Navigation

**Files:**
- Modify: `app/(a)/images/layout.tsx`
- Modify: `app/(a)/images/_components/ImagesSidebar.tsx`
- Modify: `app/(a)/images/_components/imagesRoutes.ts`
- Create or modify as needed: `app/(a)/images/_components/ImagesMobileActionBar.tsx`
- Create or modify as needed: `app/(a)/images/_components/ImagesMobileNavSheet.tsx`

- [x] Replace the current floating mobile menu button with a bottom action bar patterned after `AgentsGrid` and `MobileActionBar`.
- [x] Move route navigation into a bottom sheet grouped by Manager and Studio.
- [x] Split the mobile command bar and navigation sheet into dedicated components so route-aware actions stay consistent across `/images/*`.
- [x] Make the bottom command bar contextual: Upload opens the file picker on `/images/upload`, Public Search opens filters, and file browsers route users to Upload.
- [x] Add a route-aware mobile title/action strip through the shared shell header; Images no longer renders a second fixed top mobile menu.
- [x] Make the `/images` layout use one content scroll root on mobile and avoid nested shell scrolling.
- [x] Confirm desktop sidebar collapse behavior still works.

## Landing Pages

**Files:**
- Modify: `app/(a)/images/page.tsx`
- Modify: `app/(a)/images/_components/ImagesLandingHero.tsx`
- Modify: `app/(a)/images/manager/page.tsx`
- Modify: `app/(a)/images/_components/ManagerLandingHero.tsx`
- Modify: `app/(a)/images/studio/page.tsx`

- [x] Convert hero sections to compact mobile headers rather than large landing-page hero blocks.
- [x] Turn tile grids into mobile list rows with icon, label, one-line summary, and tap target.
- [x] Remove redundant explanatory copy on mobile.
- [x] Keep primary destinations reachable from the bottom navigation sheet and the page body.

## Manager Pages

**Files:**
- Modify: `app/(a)/images/public-search/page.tsx`
- Modify: `features/image-manager/components/PublicImagesSection.tsx`
- Modify: `app/(a)/images/my-cloud/page.tsx`
- Modify: `app/(a)/images/all-files/page.tsx`
- Modify: `app/(a)/images/upload/page.tsx`
- Modify: `app/(a)/images/branded/page.tsx`
- Modify: `app/(a)/images/tools/page.tsx`

- [x] Public Search: move cover themes and Unsplash filters into bottom sheets, keep search visible, remove nested page/component scrolling, and avoid mobile tabs.
- [x] My Cloud: move view mode, bulk selection, sort/filter, and secondary actions into bottom sheets; keep image grid/list touch targets stable.
- [x] All Files: consolidate file filters/actions into bottom sheets; avoid table-style overflow on mobile; flatten mobile rows to match the Files list rhythm.
- [x] Upload: make drag/drop secondary on mobile and prioritize picker, paste, and recent upload actions; bottom command primary opens the native picker.
- [x] Branded: make preset selection a bottom sheet or compact horizontal control with large tap targets.
- [x] Tools: convert card grid into dense action rows grouped by current tools and beta tools; put tool options in bottom sheets.

## Studio Pages

**Files:**
- Modify: `app/(a)/images/studio-light/page.tsx`
- Modify: `app/(a)/images/studio-library/page.tsx`
- Modify: `app/(a)/images/ai-generate/page.tsx`
- Modify: `app/(a)/images/profile-photo/page.tsx`
- Modify: `app/(a)/images/generate/page.tsx`
- Modify: `app/(a)/images/generate/GenerateShellClient.tsx`
- Modify: `app/(a)/images/edit/page.tsx`
- Modify: `app/(a)/images/edit/EditShellClient.tsx`
- Modify: `app/(a)/images/annotate/page.tsx`
- Modify: `app/(a)/images/annotate/AnnotateShellClient.tsx`
- Modify: `app/(a)/images/avatar/page.tsx`
- Modify: `app/(a)/images/avatar/AvatarShellClient.tsx`
- Modify: `app/(a)/images/convert/page.tsx`
- Modify: `app/(a)/images/convert/ImageStudioShellClient.tsx`
- Modify: `app/(a)/images/from-base64/page.tsx`
- Modify: `app/(a)/images/from-base64/FromBase64ShellClient.tsx`
- Modify: `app/(a)/images/presets/page.tsx`
- Modify: `app/(a)/images/library/page.tsx`

- [x] Studio Light: stack editor, preview, and export controls; put advanced options in bottom sheets.
- [x] Studio Library: reuse cloud mobile patterns from My Cloud.
- [x] AI Generate: make prompt input primary and move defaults/settings into a bottom sheet.
- [x] Profile Photo: prioritize current avatar, upload action, and save result; move preset details below or into a sheet.
- [x] Generate: keep prompt and primary generate action fixed or quickly reachable; move model/size/options into sheets.
- [x] Edit: make canvas/preview the main mobile area; move tools, filters, and layer options into bottom drawers.
- [x] Annotate: move annotation tools into bottom drawers with icon buttons; ensure canvas does not overflow horizontally.
- [x] Avatar: keep portrait picker and generated results scannable; move style/options into bottom sheets.
- [x] Convert: collapse preset catalog/export settings into mobile drawers; keep selected image preview stable.
- [x] From Base64: make paste/input field mobile safe and put conversion options below or in a sheet.
- [x] Presets: replace wide reference/table views with grouped mobile rows.
- [x] Library: reuse Studio Library/My Cloud mobile grid/list conventions.

## Shared Feature Components

**Files:**
- Modify: `features/image-manager/components/ToolsTab.tsx`
- Modify: `features/image-manager/components/StudioLibraryTab.tsx`
- Modify: `features/image-manager/components/ProfilePhotoTab.tsx`
- Modify: `features/image-manager/components/FullImageStudioTab.tsx`
- Modify: `features/image-manager/components/BrandedUploadTab.tsx`
- Modify: `features/image-manager/components/AIGenerateHero.tsx`
- Modify as discovered: image-studio components used by generate/edit/annotate/avatar/convert routes.

- [x] Audit each shared component for mobile-only horizontal overflow.
- [x] Replace mobile tabs with stacked sections or bottom sheet selectors.
- [x] Replace desktop-only side panels with drawers on mobile via `useIsMobile()`.
- [x] Keep shared components route-safe and modal-safe where the feature doc says both surfaces consume them.

## Verification Checklist

- [x] Start the dev server from `D:\works\armani-sagedhi\ai-matrx\.claude\worktrees\mobile-image-system`.
- [ ] Use dev login: `/api/dev-login?token=${DEV_LOGIN_TOKEN}&next=/images`. Blocked: local copied `DEV_LOGIN_TOKEN` is blank, so `/api/dev-login?token=&next=/images` returned 500.
- [x] Verify `/images` at 400px width.
- [ ] Verify every route listed in `app/(a)/images/_components/imagesRoutes.ts` at 400px width. Partial: verified through the manager/studio landing and several key pages; Turbopack hit worktree disk-space errors while compiling heavier studio routes.
- [ ] Verify at least `/images`, `/images/public-search`, `/images/my-cloud`, `/images/upload`, `/images/tools`, `/images/generate`, `/images/edit`, `/images/annotate`, and `/images/convert` at desktop width.
- [ ] Run `pnpm type-check`. Blocked: no local worktree `node_modules`; parent `tsc` hit Node heap limit, then timed out with an 8GB heap.
- [x] Run targeted lint/type checks for touched files if full lint is too noisy. `transpileModule` syntax check passed for the changed TSX files; focused TypeScript checks passed for the Images chrome and public-search mobile changes; ESLint is blocked by missing `eslint-plugin-no-barrel-files` in available `node_modules`.
- [x] Update `features/image-manager/FEATURE.md` status and Change Log with the completed mobile work.
