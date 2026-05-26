'use client'
import TableCards from "@/components/user-generated-table-data/TableCards";
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";
import { useState } from "react";
import CreateTableModal from "@/components/user-generated-table-data/CreateTableModal";
import ImportTableModal from "@/components/user-generated-table-data/ImportTableModal";
import { FcTemplate } from "react-icons/fc";

export default function UserGeneratedDataPage() {
  const router = useRouter();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Handle the create from template button click
  const handleCreateFromTemplate = () => {
    console.log("Create from template clicked");
  };

  // Handle successful table creation
  const handleTableCreated = (tableId: string) => {
    router.push(`/data/${tableId}`);
  };

  return (
    <div className="w-full h-page bg-gray-100 dark:bg-gray-900 p-4 rounded-lg space-y-4 overflow-y-auto scrollbar-none">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Data Tables</h1>
        </div>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            onClick={handleCreateFromTemplate}
            className="flex items-center bg-textured text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 border border-border"
          >
            <FcTemplate className="h-4 w-4 mr-2" />
            Templates
          </Button>
          <Button 
            variant="outline"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center bg-textured text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 border border-border"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import/Paste
          </Button>
          <Button 
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create
          </Button>
        </div>
      </div>
      
      <TableCards />

      {/* Create Table Modal */}
      <CreateTableModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleTableCreated}
      />

      {/* Import Table Modal */}
      <ImportTableModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={handleTableCreated}
      />
    </div>
  );
}