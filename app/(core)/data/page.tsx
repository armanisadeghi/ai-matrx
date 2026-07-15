'use client'
import TableCards from "@/components/user-generated-table-data/TableCards";
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from "react";
import CreateTableModal from "@/components/user-generated-table-data/CreateTableModal";
import ImportTableModal from "@/components/user-generated-table-data/ImportTableModal";
import { consumeSmartImportFile } from "@/features/data-tables/smart-import-pickup";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";

export default function UserGeneratedDataPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [prefilledFile, setPrefilledFile] = useState<File | null>(null);

  // Smart Import handoff from /workbooks: if the query says smartImport=1,
  // claim the file from the module slot and open the import modal pre-loaded.
  // The slot is single-shot; re-navigating to /data without a fresh handoff
  // gets nothing.
  useEffect(() => {
    if (searchParams.get("smartImport") === "1") {
      const f = consumeSmartImportFile();
      if (f) {
        setPrefilledFile(f);
        setIsImportModalOpen(true);
      }
      // Strip the query so refresh doesn't re-attempt.
      router.replace("/data");
    }
  }, [searchParams, router]);

  // Handle the create from template button click
  const handleCreateFromTemplate = () => {
    console.log("Create from template clicked");
  };

  // Handle successful table creation
  const handleTableCreated = (tableId: string) => {
    router.push(`/data/${tableId}`);
  };

  return (
    <>
      <PageHeader>
        <HeaderStructured
          title="Data Tables"
          actions={[
            { icon: "LayoutTemplate", label: "Templates", onPress: handleCreateFromTemplate },
            { icon: "Upload", label: "Import/Paste", onPress: () => setIsImportModalOpen(true) },
            { icon: "Plus", label: "Create", onPress: () => setIsCreateModalOpen(true) },
          ]}
        />
      </PageHeader>

      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto scrollbar-none pt-[var(--shell-header-h)] p-4">
          <TableCards />
        </div>
      </div>

      {/* Create Table Modal */}
      <CreateTableModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleTableCreated}
      />

      {/* Import Table Modal */}
      <ImportTableModal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setPrefilledFile(null);
        }}
        onSuccess={handleTableCreated}
        prefilledFile={prefilledFile}
      />
    </>
  );
}
