import { Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function TopicNotFound() {
  return (
    <div className="h-full flex items-center justify-center bg-textured p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
          <Search className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Topic not found</h2>
        <p className="text-sm text-muted-foreground">
          This research topic doesn&apos;t exist or may have been deleted.
        </p>
        <div className="pt-2">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href="/research/topics">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Topics
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
