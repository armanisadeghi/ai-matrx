"use client";

/** A plain text label placed on the board (the Text tool) — board-only, no record. */
export function TextTileBody({
  text,
  onChange,
}: {
  text: string;
  onChange: (text: string) => void;
}) {
  return (
    <textarea
      value={text}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Text"
      aria-label="Board text"
      className="h-full w-full resize-none bg-transparent p-3 text-2xl font-semibold leading-tight text-foreground outline-none placeholder:text-muted-foreground/60"
    />
  );
}
