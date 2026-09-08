"use client";

/**
 * HOST DOOR ONLY — `CreatablePicker` lives in `@ai-matrx/design-system`.
 *
 * P23 — EVERY PICKER TAKES NEW INPUT. Arman, 2026-08-23: "We have to
 * annihilate the UIs that offer options but no way to add." The law, the
 * locked-vocabulary door (`lockedNote` + `lockedAction`), the manage door
 * (`manageAction`, new tab), the `createExtra` slot and the `footerActions`
 * doors all live in the package body now — this file only keeps the import
 * path stable for its existing call sites.
 *
 * SoR for the law:
 * common-docs/systems/marketing/seo/seo-keywords/keyword-system-decisions.md
 * (P23, P11) + value-system.md § THE ASSIGNMENT LAYER.
 *
 * One contract note for callers: `footerActions[].icon` is typed `PickerIcon`
 * (a structural `ComponentType<{ className?: string }>`) rather than lucide's
 * `LucideIcon`. Every lucide icon satisfies it — the package ships no icon
 * dependency (C19), so it names the shape instead of the library.
 *
 * Need a new behavior? Add it to the PACKAGE and release. A body re-grown here
 * is the twin `pnpm check:package-twins` exists to catch.
 */

export { CreatablePicker } from "@ai-matrx/design-system";
export type {
  CreatableOption,
  CreatablePickerProps,
  PickerIcon,
} from "@ai-matrx/design-system";
