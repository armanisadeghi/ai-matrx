// components/NewsGrid.tsx
'use client';

import React from 'react';
import { motion } from 'motion/react';
import NewsCard from './NewsCard';
import { LoadingSkeleton } from './ProgressiveNewsImage';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Article } from './types';

interface NewsGridProps {
    news: Article[];
    loading: boolean;
    onImageError: (article: Article) => void;
    failedImages: Set<string>;
}

const LoadingCard = () => (
    <Card className="overflow-hidden">
        <LoadingSkeleton />
        <CardHeader>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent>
            <Skeleton className="h-20 w-full" />
        </CardContent>
    </Card>
);

export const NewsGrid = ({ news, loading, onImageError, failedImages }: NewsGridProps) => {
    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                    <LoadingCard key={i} />
                ))}
            </div>
        );
    }

    if (!news.length) {
        return (
            <div className="text-center p-8">
                <p className="text-muted-foreground">
                    Click the "Refresh" button above to load news articles
                </p>
            </div>
        );
    }

    return (
        <motion.div
            variants={{
                hidden: { opacity: 0 },
                show: {
                    opacity: 1,
                    transition: { staggerChildren: 0.1 }
                }
            }}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
            {news.map((article, index) => (
                <NewsCard
                    key={`${article.url}-${index}`}
                    article={article}
                    index={index}
                />
            ))}
        </motion.div>
    );
};
