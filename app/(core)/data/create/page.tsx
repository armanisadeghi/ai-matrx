'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
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
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href="/data" ariaLabel="Back to tables" />
            <span className="ml-1.5 text-sm font-medium text-foreground">
              Create Table
            </span>
          </>
        }
      />
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto scrollbar-none pt-[var(--shell-header-h)] p-4">
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
        </div>
      </div>

      {/* Create Table Modal */}
      <CreateTableModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleTableCreated}
      />
    </>
  );
}
