/**
 * Minimal loading shell — just an empty div. The real "loading" appearance
 * for the resizable layout comes from each panel surface's own internal
 * skeletons (TasksContextSidebar, TaskListPane, TaskEditor each handle
 * their own `isLoading` state). A heavy skeleton at the route level would
 * mismatch the panel widths and flash on first paint.
 */
export default function TasksLoading() {
  return <div className="h-full w-full" />;
}
