"use client";

interface EnhancedMarkdownCardProps {
  parsed: unknown;
  theme?: unknown;
  fontSize?: number;
  className?: string;
}

/** Legacy playground card — stub for older markdown renderer demos. */
export default function EnhancedMarkdownCard({
  parsed,
  className,
}: EnhancedMarkdownCardProps) {
  return (
    <pre className={className}>
      {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
    </pre>
  );
}
