import React, { Suspense } from 'react';
import CockpitRecipeIdPageWrapper from '@/components/playground/CockpitRecipeIdPageWrapper';
import { LoadingSpinner } from '@/components/ui/spinner';

export const metadata = {
    title: 'AI Cockpit',
    description: 'Build powerful AI applications with no code using our unique Data Broker System!',
};

function LoadingFallback() {
  return (
    <div className="h-page flex items-center justify-center bg-textured">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="xl" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Loading AI Cockpit...
        </p>
      </div>
    </div>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
    const recipeId = resolvedParams.id;
  
    return (
      <Suspense fallback={<LoadingFallback />}>
        <CockpitRecipeIdPageWrapper key={recipeId} recipeId={recipeId} />
      </Suspense>
    );
}
  