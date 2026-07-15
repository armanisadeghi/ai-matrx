export default function CodeLoading() {
  return (
    <div
      className="flex h-full w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <div className="w-[18%] shrink-0 border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-[#181818]">
        <div className="h-9 border-b border-neutral-200 dark:border-neutral-800" />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="h-9 shrink-0 border-b border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900" />
        <div className="flex-1 bg-white dark:bg-neutral-950" />
        <div className="h-8 shrink-0 border-t border-neutral-200 bg-blue-600 dark:bg-blue-700" />
      </div>
      <div className="w-[20%] shrink-0 border-l border-neutral-200 dark:border-neutral-800" />
    </div>
  );
}
