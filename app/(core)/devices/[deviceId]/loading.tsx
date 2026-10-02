/** The console's frame: segmented control and an empty terminal, at their final sizes. */
export default function DeviceLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)] lg:flex-row">
      <div className="hidden w-[340px] shrink-0 border-r border-border lg:block" />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 py-2 lg:px-3">
          <div className="h-8 w-full animate-pulse rounded-lg bg-muted lg:w-48" />
        </div>
        <div className="h-8" />
        <div className="mt-2 min-h-0 flex-1 bg-card lg:mx-3 lg:mb-3 lg:rounded-lg" />
      </div>
    </div>
  );
}
