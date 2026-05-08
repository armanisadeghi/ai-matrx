import Link from "next/link";
import { ImageIcon, Sparkles } from "lucide-react";
import { PlusTapButton } from "@/components/icons/tap-buttons";
import { Button } from "@/components/ui/button";

export function ImagesListHeader() {
  return (
    <div className="flex w-full items-center justify-between gap-2 px-1">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
        <span className="truncate text-sm font-semibold text-foreground">
          Images
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
          <Link href="/images/studio" aria-label="Open Image Studio">
            <Sparkles className="mr-1.5 h-4 w-4" />
            <span className="hidden text-xs font-medium sm:inline">
              Studio
            </span>
          </Link>
        </Button>
        <Link href="/images/upload">
          <PlusTapButton ariaLabel="Upload image" />
        </Link>
      </div>
    </div>
  );
}
