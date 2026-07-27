import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ChevronRight, Globe, Search, Zap } from "lucide-react";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/scraper", {
  title: "Scraper",
  description: "Interactive demo: Scraper. AI Matrx demo route.",
});

const scraperDemos = [
    {
        id: "quick-scrape",
        name: "Quick Scrape",
        description: "Scrape a single URL and view extracted content, text, links, and metadata",
        icon: Globe,
        color: "text-teal-600 dark:text-teal-400",
        bgColor: "bg-teal-50 dark:bg-teal-950/30",
    },
    {
        id: "search",
        name: "Search Keywords",
        description: "Search for keywords across the web without scraping the results",
        icon: Search,
        color: "text-blue-600 dark:text-blue-400",
        bgColor: "bg-blue-50 dark:bg-blue-950/30",
    },
    {
        id: "search-and-scrape",
        name: "Search & Scrape",
        description: "Search for keywords and automatically scrape the resulting pages",
        icon: Zap,
        color: "text-purple-600 dark:text-purple-400",
        bgColor: "bg-purple-50 dark:bg-purple-950/30",
    },
];

export default function ScraperDemosPage() {
    return (
        <div className="h-full overflow-y-auto">
            <div className="container mx-auto p-6 max-w-4xl">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Scraper Demos</h1>
                    <p className="text-muted-foreground">
                        Test and explore the scraper API endpoints
                    </p>
                </div>

                <div className="grid gap-4">
                    {scraperDemos.map((demo) => (
                        <Link key={demo.id} href={`/demos/scraper/${demo.id}`}>
                            <Card className="p-4 hover:bg-accent transition-colors cursor-pointer group">
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-lg ${demo.bgColor}`}>
                                        <demo.icon className={`w-6 h-6 ${demo.color}`} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold group-hover:text-primary transition-colors">
                                            {demo.name}
                                        </h3>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            {demo.description}
                                        </p>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                </div>
                            </Card>
                        </Link>
                    ))}
                </div>

                <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">API Endpoints</h3>
                    <div className="space-y-1 text-sm text-blue-700 dark:text-blue-300 font-mono">
                        <p>POST /api/scraper/quick-scrape</p>
                        <p>POST /api/scraper/search</p>
                        <p>POST /api/scraper/search-and-scrape</p>
                        <p>POST /api/scraper/search-and-scrape-limited</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
