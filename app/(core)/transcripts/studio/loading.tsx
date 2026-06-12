import { Loader2 } from "lucide-react";

export default function TranscriptStudioLoading() {
  return (
    <div className="flex h-page items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
