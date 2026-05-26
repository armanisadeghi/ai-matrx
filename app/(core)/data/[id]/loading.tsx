import { TableLoadingComponent } from '@/components/matrx/LoadingComponents';

export default function Loading() {
  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 p-4 rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
        </div>
        <div className="h-10 w-64 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
      </div>
      
      <TableLoadingComponent />
    </div>
  );
} 