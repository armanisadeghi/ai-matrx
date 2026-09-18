// lib/detail/core/icons.ts
//
// 🚨 THE ONE DELIBERATE DIFFERENCE between this repo's copy of the Detail
// primitive and `@ai-matrx/detail`'s `src/react/icons.tsx`, and it is a rule on
// each side rather than drift:
//
//   * the PACKAGE inlines its seventeen glyphs, because a Matrx package takes no
//     icon-library dependency ever (C19) and a consumer must not inherit a
//     `lucide-react` version from us;
//   * THIS REPO is Lucide-only (CLAUDE.md § UI / UX standards), so the host's
//     copy is Lucide under the same names — the `*Icon` aliases `lucide-react`
//     already exports, so every `<AlertCircleIcon />` in the copied modules is
//     the Lucide glyph a reader expects to find in a Matrx screen.
//
// Same names, same props, one line each: the fifteen copied modules are then
// byte-identical to the package's, which is what
// `__tests__/the-in-repo-copy-matches-the-package.test.ts` holds them to. That
// guard EXCLUDES this file by name, and this comment is why.
//
// A record type's OWN icon (`DetailRecordType.icon`) is host data and arrives
// through the registration; nothing here decides it.

import type { SVGProps } from "react";

export type DetailIconProps = SVGProps<SVGSVGElement>;

export {
  AlertCircleIcon,
  AppWindowIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  ExpandIcon,
  ExternalLinkIcon,
  HistoryIcon,
  Link2Icon,
  LoaderIcon,
  MoreHorizontalIcon,
  PanelRightIcon,
  RefreshCwIcon,
  Settings2Icon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "lucide-react";
