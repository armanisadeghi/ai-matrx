"use client";

interface MultiSectionMarkdownCardProps {
  parsed: unknown;
  theme?: unknown;
  fontSize?: number;
  className?: string;
}

/** Legacy playground card — stub for older markdown renderer demos. */
export default function MultiSectionMarkdownCard({
  parsed,
  className,
}: MultiSectionMarkdownCardProps) {
  return (
    <pre className={className}>
      {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
    </pre>
  );
}
