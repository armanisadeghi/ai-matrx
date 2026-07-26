// app/(authenticated)/tests/ssr-test/[category]/[id]/page.tsx

import React from 'react';
import { notFound } from 'next/navigation';
import FlashcardComponent from "@/components/flashcard-app/components/FlashcardComponent";

interface PageProps {
    params: Promise<{
        category: string;
        id: string;
    }>;
    searchParams: Promise<{
        optionName?: string;
        [key: string]: string | string[] | undefined;
    }>;
}

export default async function DataSetPage({ params, searchParams }: PageProps) {
    const [resolvedParams, resolvedSearchParams] = await Promise.all([
        params,
        searchParams
    ]);

    try {
        return (
            <FlashcardComponent dataSetId={resolvedParams.id}/>
        );
    } catch (error) {
        console.error('Error fetching data set:', error);
        notFound();
    }
}
