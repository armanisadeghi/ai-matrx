// components/NewsCard.tsx
'use client';

import React, {useState} from 'react';
import {ExternalLink, ImageIcon} from 'lucide-react';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Article } from './types';
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";

interface NewsCardProps {
    article: Article;
    index: number;
    onImageError: (article: Article) => void;
    failedImages: Set<string>;
}

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

const NewsCard = ({ article, index }: { article: Article; index: number }) => {
    const [imageError, setImageError] = useState(false);
    const [imageLoading, setImageLoading] = useState(true);

    const renderImagePlaceholder = () => (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground opacity-50" />
        </div>
    );

    return (
        <Card
            className="overflow-hidden h-full flex flex-col group cursor-pointer transform transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
            onClick={() => window.open(article.url, '_blank')}
        >
            <div className="relative w-full h-48 overflow-hidden bg-muted">
                {imageLoading && (
                    <div className="absolute inset-0">
                        <Skeleton className="h-full w-full" />
                    </div>
                )}
                {article.urlToImage && !imageError ? (
                    <Image
                        src={article.urlToImage}
                        alt={article.title}
                        fill
                        priority={index < 6}
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={() => setImageError(true)}
                        onLoad={() => setImageLoading(false)}
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                ) : renderImagePlaceholder()}
                <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity" />
            </div>
            <CardHeader>
                <CardTitle className="line-clamp-2 group-hover:text-primary transition-colors">
                    {article.title}
                </CardTitle>
                <CardDescription className="flex items-center justify-between">
                    <span>{article.source?.name}</span>
                    <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                <p className="line-clamp-3 text-muted-foreground">
                    {article.description}
                </p>
            </CardContent>
            <CardFooter className="pt-4">
                <Button
                    variant="outline"
                    className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                >
                    Read More
                    <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
            </CardFooter>
        </Card>
    );
};

export default NewsCard;
