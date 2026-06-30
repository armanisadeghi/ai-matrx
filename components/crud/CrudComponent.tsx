import React, { useEffect, useState } from "react";
import { z } from "zod";
import { CrudTable } from "./CrudTable";
import { CrudForm } from "./CrudForm";
import { CrudSidebar } from "./CrudSidebar";
import { MatrixDeleteDialog } from "@/components/matrx/delete-dialog";
import { Button } from "@/components/ui/button";
import { PlusCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CrudComponentProps<T extends z.ZodType<any, any>> {
  schema: T;
  allIdAndNames: { id: string; name: string }[];
  items: z.infer<T>[];
  fields: Record<
    string,
    {
      type: "text" | "textarea" | "select";
      label: string;
      options?: { value: string; label: string }[];
    }
  >;
  getItemId: (item: z.infer<T>) => string;
  getItemName: (item: z.infer<T>) => string;
  selectedItemId: string | null;
  isEditing: boolean;
  isDeleteDialogOpen: boolean;
  setIsEditing: (isEditing: boolean) => void;
  setSelectedItemId: (id: string | null) => void;
  setIsDeleteDialogOpen: (isOpen: boolean) => void;
  onItemSelect: (id: string) => void;
  onSearch: (query: string, searchAll: boolean) => void;
  onSubmit: (data: z.infer<T>) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  loading: boolean;
  error: string | null;
  totalCount: number;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
}

export function CrudComponent<T extends z.ZodType<any, any>>({
  schema,
  allIdAndNames,
  items,
  fields,
  getItemId,
  getItemName,
  selectedItemId,
  isEditing,
  isDeleteDialogOpen,
  setIsEditing,
  setSelectedItemId,
  setIsDeleteDialogOpen,
  onItemSelect,
  onSearch,
  onSubmit,
  onDelete,
  onDeleteMany,
  loading,
  error,
  totalCount,
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: CrudComponentProps<T>) {
  const selectedItem = items.find((item) => getItemId(item) === selectedItemId);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize(); // Set initial value
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex overflow-hidden">
      <CrudSidebar
        allIdAndNames={allIdAndNames}
        onItemSelect={onItemSelect}
        onSearch={onSearch}
        isMobile={isMobile}
      />
      <div className="flex-grow flex flex-col overflow-hidden">
        <div className="flex-grow overflow-auto p-4">
          <div className="mb-4 flex space-x-2">
            <Button
              onClick={() => {
                setSelectedItemId(null);
                setIsEditing(true);
              }}
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add New
            </Button>
            <Button
              onClick={() => {
                if (selectedItemId) {
                  onDeleteMany([selectedItemId]);
                }
              }}
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Delete Selected
            </Button>
          </div>
          <div>
            <CrudTable
              items={items}
              fields={fields}
              getItemId={getItemId}
              onItemSelect={onItemSelect}
              totalCount={totalCount}
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              onPageChange={onPageChange}
              onItemsPerPageChange={onItemsPerPageChange}
            />
          </div>
          <div className="flex-shrink-0 p-4 border-t">
            <CrudForm
              schema={schema}
              initialData={selectedItem}
              onSubmit={onSubmit}
              isEditing={isEditing}
              onEdit={setIsEditing}
              onDelete={() => setIsDeleteDialogOpen(true)}
              onCancel={() => {
                setIsEditing(false);
                setSelectedItemId(null);
              }}
              fields={fields}
            />
          </div>
        </div>
      </div>

      <MatrixDeleteDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => {
          if (selectedItemId) {
            onDelete(selectedItemId);
          }
        }}
        item={selectedItem ?? null}
        fields={fields}
      />
    </div>
  );
}
