import { FileQuestion } from "lucide-react";
import Link from "next/link";

export default function NotesV2NotFound() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md px-6">
        <FileQuestion className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Note Not Found
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          The note you&apos;re looking for doesn&apos;t exist or has been
          deleted.
        </p>
        <Link
          href="/notes"
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Back to Notes
        </Link>
      </div>
    </div>
  );
}
