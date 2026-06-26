// CopyForAiIcon — the brand mark for "copy this, formatted for an AI agent".
//
// A copy glyph (two stacked cards) with an AI sparkle inside the front card.
// Drawn in the Lucide idiom (24×24 viewBox, currentColor stroke, round joins)
// so it sizes via className like any Lucide icon and inherits text color. The
// sparkle is filled so it reads as a solid star even at 14px.
//
// Goal: a recognizable, text-free icon users learn to associate with
// "copy for AI" across the whole app.

export function CopyForAiIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* back card (the "copy" hint) */}
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      {/* front card */}
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      {/* AI sparkle, centered in the front card */}
      <path
        d="M15 10.5 L16 14 L19.5 15 L16 16 L15 19.5 L14 16 L10.5 15 L14 14 Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
