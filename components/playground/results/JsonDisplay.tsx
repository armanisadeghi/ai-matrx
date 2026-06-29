"use client";

interface JsonDisplayProps {
  content: string;
  parseFunction?: (content: string) => unknown;
  data?: unknown;
  className?: string;
}

/** Legacy playground JSON viewer — stub for older markdown renderer demos. */
export default function JsonDisplay({
  content,
  parseFunction,
  data,
  className,
}: JsonDisplayProps) {
  const parsed =
    data ??
    (parseFunction
      ? (() => {
          try {
            return parseFunction(content);
          } catch {
            return content;
          }
        })()
      : content);

  return (
    <pre className={className}>
      {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
    </pre>
  );
}
