// CopyForAiIcon — the brand mark for "copy this, formatted for an AI agent".
//
// A copy glyph (two stacked cards) with a connected intelligence node inside
// the front card. This is an original product symbol: copy + neural connection,
// deliberately avoiding bots, faces, stars, and sparkles.
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
      {/* Intelligence: one thought node branching into connected outputs. */}
      <path d="M15 14v-2.1M13.8 15.7l-1.5 1.5M16.2 15.7l1.5 1.5" />
      <circle cx="15" cy="15.2" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11.2" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="11.7" cy="17.8" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="18.3" cy="17.8" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}
