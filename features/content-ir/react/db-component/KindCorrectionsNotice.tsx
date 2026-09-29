/**
 * THE CORRECTIONS NOTICE (never silent). A kind corrector (`registry/kind-correctors.ts`)
 * may have changed a value before render — e.g. a `draft_critique` score made to agree with
 * its own rubric. Every surface that renders a corrected value shows these lines above it,
 * so no component author has to remember to.
 */
export function KindCorrectionsNotice({ corrections }: { corrections: string[] }) {
  if (corrections.length === 0) return null;
  return (
    <div
      role="note"
      data-kind-corrections=""
      className="mb-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-foreground"
    >
      <p className="font-medium">Corrected by code before display</p>
      <ul className="mt-0.5 list-disc pl-4 text-muted-foreground">
        {corrections.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
