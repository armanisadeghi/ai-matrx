// app/news/page.tsx
import { Suspense } from 'react';

import { Loader2 } from 'lucide-react';
import { TopHeadlines } from './top-headlines';
import NewsPageClient from './news-page-client';

export const dynamic = 'force-dynamic';
export const revalidate = 300; //

export default function NewsPage() {
    return (
        <main className="container mx-auto">
            <Suspense
                fallback={
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                }
            >
                <TopHeadlines />
            </Suspense>
            <Suspense
                fallback={
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                }
            >
                <NewsPageClient />
            </Suspense>

        </main>
    );
}
