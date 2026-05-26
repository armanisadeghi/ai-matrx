"use client";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import ScraperResultsComponent from "@/features/scraper/ScraperResultsComponent";

export default function ScraperResultPage() {
    const params = useParams();
    const router = useRouter();
    const taskId = params.id as string;

    return (
        <div className="h-page flex flex-col bg-textured overflow-hidden">
            {/* Compact header bar */}
            <div className="flex-shrink-0 px-3 py-2 border-b border-border bg-white/50 dark:bg-gray-900/50 flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/scraper")}
                    className="h-8 px-2 gap-1.5 text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span className="text-xs">Scraper</span>
                </Button>

                <div className="flex-1" />

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(window.location.href)}
                    className="h-8 px-2 gap-1.5 text-muted-foreground hover:text-foreground"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="text-xs hidden sm:inline">Copy Link</span>
                </Button>
                <Button
                    size="sm"
                    onClick={() => router.push("/scraper")}
                    className="h-8 px-3 gap-1.5"
                >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="text-xs">New Scrape</span>
                </Button>
            </div>

            {/* Results — flex-1 min-h-0 gives a bounded height so the inner scroll chain works */}
            <div className="flex-1 min-h-0 w-full">
                <ScraperResultsComponent taskId={taskId} />
            </div>
        </div>
    );
}
