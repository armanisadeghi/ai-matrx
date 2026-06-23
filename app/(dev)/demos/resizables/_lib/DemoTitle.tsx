// SERVER component (no 'use client'). Plain text title for PageHeader content.
// Kept transparent — never sets bg-* at the root, per PageHeader contract.
export function DemoTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <h1 className="text-sm font-medium text-foreground truncate">{title}</h1>
      {subtitle && (
        <span className="text-xs text-muted-foreground truncate hidden sm:inline">
          {subtitle}
        </span>
      )}
    </div>
  );
}
