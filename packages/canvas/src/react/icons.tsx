/**
 * Inlined glyphs (C19): the package carries its own icons and depends on no
 * icon library. Paths follow the Lucide 24×24 grid so they sit beside Lucide
 * icons in a host without looking foreign.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function Glyph({ children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CloseIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Glyph>
);

export const MaximizeIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M15 3h6v6" />
    <path d="m21 3-7 7" />
    <path d="m3 21 7-7" />
    <path d="M9 21H3v-6" />
  </Glyph>
);

export const MinimizeIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="m14 10 7-7" />
    <path d="M20 10h-6V4" />
    <path d="m3 21 7-7" />
    <path d="M4 14h6v6" />
  </Glyph>
);

export const MoreIcon = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </Glyph>
);

export const SplitRightIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M12 3v18" />
  </Glyph>
);

export const SplitDownIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 12h18" />
  </Glyph>
);

export const PanelRightIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M15 3v18" />
  </Glyph>
);

export const PopOutIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Glyph>
);

export const AlertIcon = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </Glyph>
);
