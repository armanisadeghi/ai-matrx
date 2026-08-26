export default function TasksLoading() {
  return (
    <div
      className="grid h-full w-full grid-cols-1 gap-px bg-border pt-[var(--shell-header-h)] md:grid-cols-[16%_16%_1fr]"
      aria-label="Loading tasks workspace"
    >
      {["Filters", "Task list", "Task editor"].map((label, column) => (
        <div key={label} className="bg-background p-3">
          <span className="sr-only">{label}</span>
          <div className="mb-3 h-8 animate-pulse rounded-md bg-muted/60" />
          <div className="space-y-2">
            {Array.from({ length: column === 2 ? 5 : 7 }, (_, index) => (
              <div
                key={index}
                className="h-10 animate-pulse rounded-md bg-muted/40"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
