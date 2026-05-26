'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import CreateTableModal from '@/components/user-generated-table-data/CreateTableModal';

export default function CreateTablePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Open the modal automatically when the page loads
    setIsModalOpen(true);
  }, []);

  // Handle successful table creation
  const handleTableCreated = (tableId: string) => {
    // Navigate to the new table
    router.push(`/data/${tableId}`);
  };

  // Handle modal close (go back to tables list)
  const handleModalClose = () => {
    router.push('/data');
  };

  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 p-4 rounded-lg space-y-4 scrollbar-none">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => router.push('/data')}
            className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-bold">Create Table</h1>
        </div>
      </div>

      <div className="py-8 text-center bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
        <p className="font-medium">Create a new data table</p>
        <p className="text-muted-foreground mt-2">
          Fill in the details to create your new data table
        </p>
        <div className="mt-4">
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
            onClick={() => setIsModalOpen(true)}
          >
            Open Table Creator
          </Button>
        </div>
      </div>

      {/* Create Table Modal */}
      <CreateTableModal 
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleTableCreated}
      />
    </div>
  );
} 