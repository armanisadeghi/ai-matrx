'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Table error:', error);
  }, [error]);
  
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-8 rounded-lg">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">Something went wrong</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          There was an error loading this table. Please try again or return to the tables list.
        </p>
        <div className="flex space-x-4 justify-center">
          <Button 
            onClick={() => reset()} 
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200"
          >
            Try again
          </Button>
          <Button 
            onClick={() => router.push('/data')} 
            className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
          >
            Return to Tables
          </Button>
        </div>
      </div>
    </div>
  );
} 