import { ListPlus, MousePointerClick } from "lucide-react";

export default function ListsIndexPage() {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-3 text-center px-6">
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
        <MousePointerClick className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Select a list</p>
        <p className="text-xs text-muted-foreground mt-1">
          Choose a list from the panel to view and manage its items
        </p>
      </div>
    </div>
  );
}
