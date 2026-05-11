'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();
  
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-8 rounded-lg">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">Table Not Found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          The table you're looking for doesn't exist or you don't have permission to view it.
        </p>
        <Button 
          onClick={() => router.push('/data')} 
          className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
        >
          Return to Tables
        </Button>
      </div>
    </div>
  );
} 