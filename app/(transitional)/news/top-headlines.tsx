// app/news/top-headlines.tsx
import { DismissibleAlert } from './dismissible-alert';

async function getTopHeadlines() {
    console.log('process.env.NEWS_API_KEY', process.env.NEWS_API_KEY);
    const res = await fetch(
        `https://newsapi.org/v2/top-headlines?country=us&pageSize=5&apiKey=${process.env.NEWS_API_KEY}`,
        { next: { revalidate: 900 } } // Cache for 15 minutes
    );

    if (!res.ok) {
        throw new Error('Failed to fetch top headlines');
    }

    const data = await res.json();
    return data.articles;
}

export async function TopHeadlines() {
    const headlines = await getTopHeadlines();

    return (
        <div className="space-y-4 mb-8">
            <h2 className="text-2xl font-bold tracking-tight">Breaking News</h2>
            <div className="space-y-3">
                {headlines.map((headline: any, index: number) => (
                    <DismissibleAlert
                        key={index}
                        sourceName={headline.source.name}
                        title={headline.title}
                        url={headline.url}
                        index={index}
                    />
                ))}
            </div>
        </div>
    );
}
