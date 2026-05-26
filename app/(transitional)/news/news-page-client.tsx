// app/news/news-page-client.tsx
'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Newspaper, RefreshCcw, Loader2 } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Card,
    CardContent,
    CardHeader,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchNews } from '@/actions/ai-actions/news-api';
import NewsCard from './NewsCard';

interface Article {
    title: string;
    description: string;
    url: string;
    urlToImage: string;
    publishedAt: string;
    source: {
        name: string;
    };
}


const NewsPage = () => {
    const [news, setNews] = useState<Article[]>([]);
    const [loading, setLoading] = useState(false);
    const [category, setCategory] = useState('general');
    const [country, setCountry] = useState('us');

    const categories = [
        'general',
        'business',
        'entertainment',
        'health',
        'science',
        'sports',
        'technology',
        'ai',
    ];

    const countries = [
        { code: 'us', name: 'United States' },
        { code: 'gb', name: 'United Kingdom' },
        { code: 'ca', name: 'Canada' },
        { code: 'au', name: 'Australia' },
        { code: 'in', name: 'India' },
    ];

    const handleFetchNews = async () => {
        setLoading(true);
        try {
            const result = await fetchNews(category, country);
            if ('data' in result && result.data.articles) {
                setNews(result.data.articles);
            }
        } catch (error) {
            console.error('Error fetching news:', error);
        }
        setLoading(false);
    };

    React.useEffect(() => {
        handleFetchNews();
    }
    , [category, country]);

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { y: 20, opacity: 0 },
        show: { y: 0, opacity: 1 }
    };

    return (
        <div className="min-h-screen p-4 space-y-6">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
                <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 max-w-7xl mx-auto">
                    <div className="flex items-center space-x-3 mb-4 sm:mb-0">
                        <Newspaper className="h-6 w-6 text-primary" />
                        <h1 className="text-xl font-semibold tracking-tight">Matrix News Hub</h1>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-3">
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className="w-[150px]">
                                <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {categories.map((cat) => (
                                        <SelectItem key={cat} value={cat}>
                                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>

                        <Select value={country} onValueChange={setCountry}>
                            <SelectTrigger className="w-[150px]">
                                <SelectValue placeholder="Country" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {countries.map((c) => (
                                        <SelectItem key={c.code} value={c.code}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>

                        <Button
                            variant="outline"
                            onClick={handleFetchNews}
                            disabled={loading}
                            className="w-[150px]"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Loading...
                                </>
                            ) : (
                                 <>
                                     <RefreshCcw className="h-4 w-4 mr-2" />
                                     Refresh
                                 </>
                             )}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4">
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[...Array(6)].map((_, i) => (
                            <Card key={i} className="overflow-hidden">
                                <div className="h-48 w-full">
                                    <Skeleton className="h-full w-full" />
                                </div>
                                <CardHeader>
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-4 w-1/2" />
                                </CardHeader>
                                <CardContent>
                                    <Skeleton className="h-20 w-full" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : news.length > 0 ? (
                    <motion.div
                        variants={container}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    >
                        {news.map((article, index) => (
                            <motion.div key={index} variants={item}>
                                <NewsCard article={article} index={index} />
                            </motion.div>
                        ))}
                    </motion.div>
                ) : (
                        <div className="text-center p-8">
                            <p className="text-muted-foreground">
                                Click the "Refresh" button above to load news articles
                            </p>
                        </div>
                    )}
            </div>
        </div>
    );
};

export default NewsPage;
