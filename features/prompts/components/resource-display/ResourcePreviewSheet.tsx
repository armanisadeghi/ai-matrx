"use client";

import React, { useState, useEffect } from "react";
import {
  StickyNote,
  CheckSquare,
  Table2,
  Globe,
  File,
  FolderKanban,
  ExternalLink,
  Image,
  FileText,
  Mic,
  Calendar,
  Flag,
  User,
  MessageSquare,
  Circle,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { CiYoutube } from "react-icons/ci";
import FloatingSheet from "@/components/official/FloatingSheet";
import type { Resource } from "../../types/resources";
// Legacy FilePreviewSheet removed in Phase 11. File-type resources now
// open their URL in a new tab via handleOpenFileUrl below. For rich inline
// preview callers can use FilePreview from @/features/files with a fileId.
import { supabase } from "@/utils/supabase/client";
import UserTableViewer from "@/components/user-generated-table-data/UserTableViewer";

interface ResourcePreviewSheetProps {
  isOpen: boolean;
  onClose: () => void;
  resource: Resource | null;
  onRemove?: () => void;
}

const ResourcePreviewSheet: React.FC<ResourcePreviewSheetProps> = ({
  isOpen,
  onClose,
  resource,
  onRemove,
}) => {
  const [tableData, setTableData] = useState<any>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  // Fetch table data when resource is a table
  useEffect(() => {
    const fetchTableData = async () => {
      if (!resource || resource.type !== "table" || !isOpen) return;

      setTableLoading(true);
      setTableError(null);

      try {
        const referenceType = resource.data.type;
        const ref = resource.data; // Pass entire reference object

        if (referenceType === "full_table") {
          // For full table, we'll use the UserTableViewer component directly
          // So we don't need to fetch data here
          setTableData({ type: "full_table" });
          setTableLoading(false);
          return;
        }

        if (referenceType === "table_row") {
          // Fetch specific row using new RPC
          const { data: rowRaw, error } = await supabase.rpc("get_table_row", {
            ref,
          });

          if (error) throw error;
          if (!rowRaw) throw new Error("Row not found");

          const row = rowRaw as unknown as {
            id: string;
            data: Record<string, unknown>;
          };
          setTableData({
            type: "table_row",
            row,
          });
        } else if (referenceType === "table_column") {
          // Fetch column definition and row values
          const [columnResult, rowsResult] = await Promise.all([
            supabase.rpc("get_table_column", { ref }),
            supabase.rpc("list_table_rows", {
              ref: {
                type: "full_table",
                table_id: resource.data.table_id,
              },
              limit_rows: 100,
              offset_rows: 0,
            }),
          ]);

          if (columnResult.error) throw columnResult.error;
          if (rowsResult.error) throw rowsResult.error;

          const colData = columnResult.data as unknown as {
            data_type?: string;
          } | null;
          const rowsPayload = rowsResult.data as unknown as {
            rows?: unknown[];
            total?: number;
          } | null;
          setTableData({
            type: "table_column",
            column: colData,
            rows: rowsPayload?.rows || [],
            total: rowsPayload?.total || 0,
            columnName: resource.data.column_name,
            columnDisplayName: resource.data.column_display_name,
          });
        } else if (referenceType === "table_cell") {
          // Fetch specific cell value using new RPC
          const { data: cellRaw, error } = await supabase.rpc(
            "get_table_cell",
            { ref },
          );

          if (error) throw error;
          if (!cellRaw) throw new Error("Cell not found");

          const cellData = cellRaw as unknown as {
            value: unknown;
            field: unknown;
          };
          setTableData({
            type: "table_cell",
            value: cellData.value,
            field: cellData.field,
            rowId: resource.data.row_id,
            columnName: resource.data.column_name,
            columnDisplayName: resource.data.column_display_name,
          });
        }
      } catch (error) {
        console.error("Error fetching table data:", error);
        setTableError(
          error instanceof Error ? error.message : "Failed to fetch table data",
        );
      } finally {
        setTableLoading(false);
      }
    };

    fetchTableData();
  }, [resource, isOpen, supabase]);

  if (!resource) return null;

  // For file resources, open the URL in a new tab — the legacy
  // FilePreviewSheet was deleted in Phase 11. Callers that need inline
  // rich preview should route through /files/f/[fileId] instead.
  if (resource.type === "file" && resource.data.url && resource.data.type) {
    if (isOpen && typeof window !== "undefined") {
      window.open(resource.data.url as string, "_blank", "noopener,noreferrer");
      // Close immediately so the sheet state returns to idle.
      queueMicrotask(() => onClose());
    }
    return null;
  }

  // For other resource types, use custom Sheet
  const getResourceTitle = () => {
    switch (resource.type) {
      case "note":
        return resource.data.label || "Note";
      case "task":
        return resource.data.title || "Task";
      case "project":
        return resource.data.name || "Project";
      case "table":
        return resource.data.table_name || "Table";
      case "webpage":
        // If title is a URL, show "Webpage Content" instead to avoid duplication
        if (resource.data.title && !resource.data.title.startsWith("http")) {
          return resource.data.title;
        }
        return "Webpage Content";
      case "youtube":
        return resource.data.title || "YouTube Video";
      case "image_url":
        return resource.data.url
          ? new URL(resource.data.url).pathname.split("/").pop() || "Image"
          : "Image";
      case "file_url":
        return resource.data.filename || "File";
      case "audio":
        return resource.data.filename || "Audio";
      default:
        return "Resource";
    }
  };

  const getResourceIcon = () => {
    switch (resource.type) {
      case "note":
        return (
          <StickyNote className="w-5 h-5 text-orange-600 dark:text-orange-500" />
        );
      case "task":
        return (
          <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-500" />
        );
      case "project":
        return (
          <FolderKanban className="w-5 h-5 text-purple-600 dark:text-purple-500" />
        );
      case "table":
        return (
          <Table2 className="w-5 h-5 text-green-600 dark:text-green-500" />
        );
      case "webpage":
        return <Globe className="w-5 h-5 text-teal-600 dark:text-teal-500" />;
      case "youtube":
        return <CiYoutube className="w-5 h-5 text-red-600 dark:text-red-500" />;
      case "image_url":
        return <Image className="w-5 h-5 text-blue-600 dark:text-blue-500" />;
      case "file_url":
        return (
          <FileText className="w-5 h-5 text-purple-600 dark:text-purple-500" />
        );
      case "audio":
        return <Mic className="w-5 h-5 text-pink-600 dark:text-pink-500" />;
      default:
        return <File className="w-5 h-5 text-gray-600 dark:text-gray-400" />;
    }
  };

  return (
    <FloatingSheet
      isOpen={isOpen}
      onClose={onClose}
      position="right"
      width="3xl"
      title={
        <div className="flex items-center gap-2">
          {getResourceIcon()}
          <span>{getResourceTitle()}</span>
        </div>
      }
      showCloseButton={true}
      closeOnBackdropClick={true}
      rounded="lg"
      contentClassName="p-0"
      headerContent={
        onRemove && (
          <button
            onClick={() => {
              onRemove();
              onClose();
            }}
            className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            title="Remove from prompt"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )
      }
    >
      <div className="space-y-6 px-6 py-4">
        {/* Note Preview */}
        {resource.type === "note" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Content
              </h3>
              <div className="p-4 bg-gray-50 dark:bg-zinc-900 rounded-lg border-border">
                <pre className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-sans">
                  {resource.data.content || "No content"}
                </pre>
              </div>
            </div>

            {resource.data.folder_name && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Folder:{" "}
                </span>
                <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                  {resource.data.folder_name}
                </span>
              </div>
            )}

            {resource.data.tags && resource.data.tags.length > 0 && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 block mb-2">
                  Tags:
                </span>
                <div className="flex flex-wrap gap-2">
                  {resource.data.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="px-2 py-1 text-xs rounded-full bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Task Preview */}
        {resource.type === "task" && (
          <div className="space-y-4">
            <div className="space-y-3 text-sm">
              {/* Title */}
              <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
                <span className="text-gray-600 dark:text-gray-400 font-medium">
                  Title:
                </span>
                <span className="text-gray-900 dark:text-gray-100">
                  {resource.data.title}
                </span>
              </div>

              {/* Status */}
              <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
                <span className="text-gray-600 dark:text-gray-400 font-medium">
                  Status:
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 ${
                    resource.data.status === "completed"
                      ? "text-green-600 dark:text-green-400"
                      : "text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {resource.data.status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                  {resource.data.status || "Not set"}
                </span>
              </div>

              {/* Priority */}
              <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
                <span className="text-gray-600 dark:text-gray-400 font-medium">
                  Priority:
                </span>
                <span className="text-gray-900 dark:text-gray-100">
                  {resource.data.priority ? (
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        resource.data.priority === "high"
                          ? "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                          : resource.data.priority === "medium"
                            ? "bg-yellow-100 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400"
                            : "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"
                      }`}
                    >
                      {resource.data.priority}
                    </span>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400 italic">
                      Not set
                    </span>
                  )}
                </span>
              </div>

              {/* Due Date */}
              <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
                <span className="text-gray-600 dark:text-gray-400 font-medium">
                  Due Date:
                </span>
                <span className="text-gray-900 dark:text-gray-100">
                  {resource.data.due_date ? (
                    <>
                      {new Date(resource.data.due_date).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        },
                      )}
                      {new Date(resource.data.due_date) < new Date() &&
                        resource.data.status !== "completed" && (
                          <span className="ml-2 text-xs bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded">
                            Overdue
                          </span>
                        )}
                    </>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400 italic">
                      Not set
                    </span>
                  )}
                </span>
              </div>

              {/* Project */}
              {resource.data.project_name && (
                <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
                  <span className="text-gray-600 dark:text-gray-400 font-medium">
                    Project:
                  </span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {resource.data.project_name}
                  </span>
                </div>
              )}

              {/* Description */}
              <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
                <span className="text-gray-600 dark:text-gray-400 font-medium">
                  Description:
                </span>
                <div className="text-gray-900 dark:text-gray-100">
                  {resource.data.description ? (
                    <div className="whitespace-pre-wrap">
                      {resource.data.description}
                    </div>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400 italic">
                      No description
                    </span>
                  )}
                </div>
              </div>

              {/* Subtasks if available */}
              {resource.data.subtasks && resource.data.subtasks.length > 0 && (
                <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
                  <span className="text-gray-600 dark:text-gray-400 font-medium">
                    Subtasks:
                  </span>
                  <div className="space-y-1.5">
                    {resource.data.subtasks.map((subtask: any) => (
                      <div
                        key={subtask.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        {subtask.completed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-500 flex-shrink-0" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                        )}
                        <span
                          className={
                            subtask.completed
                              ? "text-gray-500 dark:text-gray-400 line-through"
                              : "text-gray-900 dark:text-gray-100"
                          }
                        >
                          {subtask.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Project Preview */}
        {resource.type === "project" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Tasks
              </h3>
              <div className="space-y-2">
                {resource.data.tasks && resource.data.tasks.length > 0 ? (
                  resource.data.tasks.map((task: any) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-zinc-900 rounded border-border"
                    >
                      <CheckSquare
                        className={`w-4 h-4 ${
                          task.status === "completed"
                            ? "text-green-600 dark:text-green-500"
                            : "text-gray-400 dark:text-gray-500"
                        }`}
                      />
                      <span
                        className={`text-sm flex-1 ${
                          task.status === "completed"
                            ? "text-gray-500 dark:text-gray-400 line-through"
                            : "text-gray-900 dark:text-gray-100"
                        }`}
                      >
                        {task.title}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No tasks
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Table Preview */}
        {resource.type === "table" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Reference Type:{" "}
                </span>
                <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                  {resource.data.type
                    .replace("_", " ")
                    .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </span>
              </div>
            </div>

            {tableLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
                  Loading data...
                </span>
              </div>
            ) : tableError ? (
              <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-400">
                  {tableError}
                </p>
              </div>
            ) : tableData ? (
              <>
                {/* Full Table Preview */}
                {tableData.type === "full_table" && (
                  <div className="border-border rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
                    <UserTableViewer
                      tableId={resource.data.table_id}
                      showTableSelector={false}
                    />
                  </div>
                )}

                {/* Single Row Preview */}
                {tableData.type === "table_row" && tableData.row && (
                  <div className="space-y-2">
                    <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 dark:text-blue-400">
                        <strong>Row ID:</strong> {tableData.row.id}
                      </p>
                    </div>
                    <div className="border-border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 dark:bg-zinc-900 px-3 py-2 border-b border-border">
                        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          Row Data
                        </h4>
                      </div>
                      <div className="p-3 space-y-2 max-h-[60dvh] overflow-y-auto">
                        {Object.entries(tableData.row.data).map(
                          ([fieldName, value]: [string, any]) => (
                            <div
                              key={fieldName}
                              className="flex items-start gap-3 p-2 bg-gray-50 dark:bg-zinc-900 rounded"
                            >
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 min-w-[120px]">
                                {fieldName}:
                              </span>
                              <span className="text-xs text-gray-900 dark:text-gray-100 flex-1">
                                {value !== null && value !== undefined
                                  ? typeof value === "object"
                                    ? JSON.stringify(value, null, 2)
                                    : String(value)
                                  : "-"}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Single Column Preview */}
                {tableData.type === "table_column" && tableData.rows && (
                  <div className="space-y-2">
                    <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 dark:text-blue-400">
                        <strong>Column:</strong>{" "}
                        {tableData.columnDisplayName || tableData.columnName}
                        {tableData.column && (
                          <>
                            <br />
                            <strong>Type:</strong>{" "}
                            {tableData.column.data_type || "Unknown"}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="border-border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 dark:bg-zinc-900 px-3 py-2 border-b border-border">
                        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          Column Values ({tableData.rows.length} of{" "}
                          {tableData.total || tableData.rows.length} rows)
                        </h4>
                      </div>
                      <div className="max-h-[60dvh] overflow-y-auto">
                        {tableData.rows.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400">
                            No rows found
                          </div>
                        ) : (
                          tableData.rows.map((row: any) => {
                            const cellValue = row.data[tableData.columnName];
                            return (
                              <div
                                key={row.id}
                                className="p-2 border-b border-border last:border-b-0 hover:bg-gray-50 dark:hover:bg-zinc-900/50"
                              >
                                <div className="text-xs text-gray-900 dark:text-gray-100">
                                  {cellValue !== null && cellValue !== undefined
                                    ? typeof cellValue === "object"
                                      ? JSON.stringify(cellValue)
                                      : String(cellValue)
                                    : "-"}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    {tableData.total > 100 && (
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 text-center">
                        Showing first 100 of {tableData.total} rows
                      </div>
                    )}
                  </div>
                )}

                {/* Single Cell Preview */}
                {tableData.type === "table_cell" && (
                  <div className="space-y-2">
                    <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 dark:text-blue-400">
                        <strong>Column:</strong>{" "}
                        {tableData.columnDisplayName || tableData.columnName}
                        <br />
                        <strong>Row ID:</strong> {tableData.rowId}
                      </p>
                    </div>
                    <div className="border-border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 dark:bg-zinc-900 px-3 py-2 border-b border-border">
                        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          Cell Value
                        </h4>
                      </div>
                      <div className="p-4">
                        <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                          {tableData.value !== null &&
                          tableData.value !== undefined
                            ? typeof tableData.value === "object"
                              ? JSON.stringify(tableData.value, null, 2)
                              : String(tableData.value)
                            : "-"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 bg-gray-50 dark:bg-zinc-900 rounded-lg border-border">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  No data available
                </p>
              </div>
            )}

            <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-xs text-green-700 dark:text-green-400">
                {resource.data.description}
              </p>
            </div>
          </div>
        )}

        {/* Webpage Preview */}
        {resource.type === "webpage" && (
          <div className="space-y-4">
            <div>
              <a
                href={resource.data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                {resource.data.url}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Content
                </h3>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {resource.data.charCount?.toLocaleString() || 0} characters
                </span>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-zinc-900 rounded-lg border-border max-h-[70dvh] overflow-y-auto">
                <pre className="text-xs text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-mono">
                  {resource.data.textContent}
                </pre>
              </div>
            </div>

            {resource.data.scrapedAt && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Scraped:{" "}
                </span>
                <span className="text-xs text-gray-900 dark:text-gray-100">
                  {new Date(resource.data.scrapedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* YouTube Preview */}
        {resource.type === "youtube" && (
          <div className="space-y-4">
            {/* Video Embed */}
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <iframe
                src={`https://www.youtube.com/embed/${resource.data.videoId}`}
                title={resource.data.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>

            {/* Video Info */}
            <div className="space-y-3">
              {resource.data.channelName && (
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Channel:{" "}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {resource.data.channelName}
                  </span>
                </div>
              )}

              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Video ID:{" "}
                </span>
                <code className="text-xs text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-zinc-900 px-2 py-0.5 rounded">
                  {resource.data.videoId}
                </code>
              </div>

              <div>
                <a
                  href={resource.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  Watch on YouTube
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Image URL Preview */}
        {resource.type === "image_url" && (
          <div className="space-y-4">
            {/* Image Display */}
            <div className="border-border rounded-lg overflow-hidden">
              <div className="relative aspect-video bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                <img
                  src={resource.data.url}
                  alt={getResourceTitle()}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            </div>

            {/* Image Info */}
            <div className="space-y-3">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Type:{" "}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {resource.data.type}
                </span>
              </div>

              <div>
                <a
                  href={resource.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 break-all"
                >
                  {resource.data.url}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* File URL Preview */}
        {resource.type === "file_url" && (
          <div className="space-y-4">
            {/* File Icon/Info */}
            <div className="border-border rounded-lg overflow-hidden">
              <div className="p-6 bg-gray-50 dark:bg-zinc-900 flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg bg-purple-100 dark:bg-purple-950/30 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-8 h-8 text-purple-600 dark:text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-medium text-gray-900 dark:text-gray-100 truncate">
                    {resource.data.filename}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <span className="uppercase">{resource.data.extension}</span>
                    <span>•</span>
                    <span>{resource.data.type}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* File URL */}
            <div>
              <a
                href={resource.data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 break-all"
              >
                {resource.data.url}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          </div>
        )}

        {/* Audio Preview (Placeholder) */}
        {resource.type === "audio" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center p-8 text-center bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800 rounded-lg">
              <div className="w-16 h-16 rounded-full bg-pink-100 dark:bg-pink-950/50 flex items-center justify-center mb-4">
                <Mic className="w-8 h-8 text-pink-600 dark:text-pink-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Audio Transcription Coming Soon
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                  This feature will transcribe audio files and display the
                  transcription here.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </FloatingSheet>
  );
};

export default ResourcePreviewSheet;
