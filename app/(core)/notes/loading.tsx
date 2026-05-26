export default function NotesV2Loading() {
  return (
    <div className="flex h-full w-full min-h-0">
      {/* Sidebar skeleton */}
      <div className="w-[280px] shrink-0 border-r border-border flex flex-col min-h-0 max-lg:hidden">
        {/* Search bar */}
        <div className="shrink-0 px-2 py-1.5 border-b border-border/30">
          <div className="h-7 bg-muted/50 rounded-md animate-pulse" />
        </div>
        {/* Toolbar */}
        <div className="shrink-0 px-2 py-1 border-b border-border/20">
          <div className="h-5 w-24 bg-muted/30 rounded animate-pulse" />
        </div>
        {/* Folder tree skeleton */}
        <div className="flex-1 overflow-hidden p-2 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-5 w-full bg-muted/40 rounded animate-pulse" />
              {i < 3 &&
                Array.from({ length: 2 + i }).map((_, j) => (
                  <div
                    key={j}
                    className="h-4 ml-4 bg-muted/20 rounded animate-pulse"
                    style={{ width: `${60 + Math.random() * 30}%` }}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Tab bar */}
        <div className="h-8 border-b border-border shrink-0 flex items-center gap-1 px-2">
          <div className="h-5 w-24 bg-muted/40 rounded animate-pulse" />
          <div className="h-5 w-20 bg-muted/20 rounded animate-pulse" />
        </div>
        {/* Editor area */}
        <div className="flex-1 p-4 space-y-3">
          <div className="h-4 w-3/4 bg-muted/30 rounded animate-pulse" />
          <div className="h-4 w-full bg-muted/20 rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-muted/20 rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-muted/20 rounded animate-pulse" />
        </div>
        {/* Metadata bar */}
        <div className="h-7 border-t border-border/20 px-4 flex items-center gap-2">
          <div className="h-3 w-16 bg-muted/30 rounded animate-pulse" />
          <div className="h-3 w-12 bg-muted/20 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}
