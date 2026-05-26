// app/(authenticated)/tests/matrx-table/components/MatrxTableBody.tsx
"use client";

import React, { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TableBody } from "@/components/ui/table";
import AnimatedTabModal from "@/components/matrx/AnimatedForm/AnimatedTabModal";
import { TableData } from "@/types/tableTypes";
import { generateStandardTabData } from "./StandardTabUtil";
import MatrxTableCell from "./MatrxTableCell";
import { FormState, TabData } from "@/types/AnimatedFormTypes";

interface MatrxTableBodyProps {
  page;
  prepareRow;
  actions?: string[];
  onAction?: (actionName: string, rowData: TableData) => void;
  truncateAt?: number;
  customModalContent?: (rowData: TableData) => React.ReactNode;
}

const MatrxTableBody: React.FC<MatrxTableBodyProps> = ({
  page,
  prepareRow,
  actions = ["edit", "delete", "view", "expand"],
  onAction,
  truncateAt = 100,
  customModalContent,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("view");
  const [selectedRow, setSelectedRow] = useState<TableData | null>(null);
  const [formState, setFormState] = useState<FormState>({});

  const handleAction = (actionName: string, rowData: TableData) => {
    setSelectedRow(rowData);
    setFormState(rowData);
    if (actionName === "view" || actionName === "edit") {
      setActiveTab(actionName);
      setIsModalOpen(true);
    } else if (actionName === "delete") {
      setActiveTab("delete");
      setIsModalOpen(true);
    } else if (onAction) {
      onAction(actionName, rowData);
    }
  };

  const handleUpdateField = (name: string, value: any) => {
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const tabs: TabData[] = generateStandardTabData(
    selectedRow,
    setActiveTab,
    setIsModalOpen,
    formState,
    onAction,
  );

  return (
    <>
      <TableBody>
        <AnimatePresence>
          {page.map((row, i) => {
            prepareRow(row);
            const { key: rowKey, ...rowProps } = row.getRowProps();

            return (
              <motion.tr
                key={rowKey || `row-${i}`}
                {...rowProps}
                initial={{ opacity: 0, y: -10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: {
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                    delay: i * 0.05,
                  },
                }}
                exit={{ opacity: 0, y: 10 }}
                whileHover={{
                  y: -10,
                  transition: { duration: 0.2 },
                }}
                className="bg-card hover:bg-accent/50 cursor-pointer scrollbar-hide"
                onClick={() => handleAction("view", row.original)}
              >
                {row.cells.map((cell, cellIndex) => {
                  const { key: cellKey, ...cellProps } = cell.getCellProps();

                  return (
                    <MatrxTableCell
                      key={cellKey || `cell-${i}-${cellIndex}`}
                      {...cellProps}
                      cell={cell}
                      actions={actions}
                      rowData={row.original}
                      onAction={handleAction}
                      truncateAt={truncateAt}
                    />
                  );
                })}
              </motion.tr>
            );
          })}
        </AnimatePresence>
      </TableBody>
      {selectedRow && (
        <AnimatedTabModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={() => {}}
          onUpdateField={handleUpdateField}
          formState={formState}
          title={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Item`}
          description={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} item details`}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isSinglePage={true}
        >
          {customModalContent ? customModalContent(selectedRow) : null}
        </AnimatedTabModal>
      )}
    </>
  );
};

export default MatrxTableBody;
