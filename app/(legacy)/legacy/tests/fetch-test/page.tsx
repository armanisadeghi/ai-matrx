"use client";

import { useState } from "react";
import { useConversationMessages } from "./useConversationMessages";
import EnhancedEntityAnalyzer from "@/components/admin/redux/EnhancedEntityAnalyzer";
import MatrxDynamicPanel from "@/components/matrx/resizable/MatrxDynamicPanel";

export default function FetchRecordsTest() {
    const [conversationId, setConversationId] = useState("");
    const [inputConversationId, setInputConversationId] = useState("");

    // Use our custom hook
    const {
        page,
        pageSize,
        records,
        loadingState,
        paginationInfo,
        isLoading,
        hasError,
        error,
        fetchMessages,
        nextPage,
        previousPage,
        changePageSize,
    } = useConversationMessages(conversationId);

    // Handler to start the fetch with the entered conversation ID
    const handleFetch = () => {
        setConversationId(inputConversationId);
        setTimeout(fetchMessages, 0); // Fetch after state has updated
    };

    const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        changePageSize(Number(e.target.value));
        setTimeout(fetchMessages, 0);
    };

    const handleNextPage = () => {
        nextPage();
        setTimeout(fetchMessages, 0);
    };

    const handlePreviousPage = () => {
        previousPage();
        setTimeout(fetchMessages, 0);
    };

    return (
        <div className="min-h-dvh bg-gray-100 dark:bg-gray-900 p-8">
            <div className="max-w-6xl mx-auto bg-textured rounded-lg shadow-md p-6">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Message Fetch Records Test</h1>

                <div className="mb-6">
                    <label htmlFor="conversationId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Conversation ID
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="conversationId"
                            type="text"
                            value={inputConversationId}
                            onChange={(e) => setInputConversationId(e.target.value)}
                            className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            placeholder="Enter conversation ID"
                        />
                        <button
                            onClick={handleFetch}
                            disabled={!inputConversationId}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white font-medium rounded-md shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Fetch
                        </button>
                    </div>
                </div>

                {conversationId && (
                    <div className="mb-6 flex items-center gap-4">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Page Size:</div>
                        <select
                            value={pageSize}
                            onChange={handlePageSizeChange}
                            className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                            <option value="5">5</option>
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                        </select>
                    </div>
                )}

                {/* Display loading state */}
                {isLoading && <div className="mt-4 text-center text-gray-700 dark:text-gray-300">Loading...</div>}

                {/* Display error if any */}
                {hasError && error && (
                    <div className="mt-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100 rounded-md">
                        Error: {error.message}
                    </div>
                )}

                {/* Results section */}
                {!isLoading && records && Object.keys(records).length > 0 && (
                    <div className="mt-6">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">Results</h2>

                        <div className="overflow-x-auto">
                            <table className="min-w-full bg-textured border border-border">
                                <thead>
                                    <tr className="bg-gray-100 dark:bg-gray-700">
                                        <th className="py-2 px-4 border-b border-gray-300 dark:border-gray-600 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            ID
                                        </th>
                                        <th className="py-2 px-4 border-b border-gray-300 dark:border-gray-600 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Display Order
                                        </th>
                                        <th className="py-2 px-4 border-b border-gray-300 dark:border-gray-600 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Role
                                        </th>
                                        <th className="py-2 px-4 border-b border-gray-300 dark:border-gray-600 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Type
                                        </th>
                                        <th className="py-2 px-4 border-b border-gray-300 dark:border-gray-600 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Content
                                        </th>
                                        <th className="py-2 px-4 border-b border-gray-300 dark:border-gray-600 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Metadata
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(records).map(([recordKey, record]: [string, any]) => (
                                        <tr
                                            key={recordKey}
                                            className="border-b border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                                        >
                                            <td className="py-2 px-4 text-sm text-gray-800 dark:text-gray-200">{record.id}</td>
                                            <td className="py-2 px-4 text-sm text-gray-800 dark:text-gray-200">{record.displayOrder}</td>
                                            <td className="py-2 px-4 text-sm text-gray-800 dark:text-gray-200">{record.role || "-"}</td>
                                            <td className="py-2 px-4 text-sm text-gray-800 dark:text-gray-200">{record.type || "-"}</td>
                                            <td className="py-2 px-4 text-sm text-gray-800 dark:text-gray-200">
                                                <div className="max-w-xs overflow-hidden">
                                                    {typeof record.content === "string"
                                                        ? record.content.substring(0, 50) + (record.content.length > 50 ? "..." : "")
                                                        : JSON.stringify(record.content).substring(0, 50) + "..."}
                                                </div>
                                            </td>
                                            <td className="py-2 px-4 text-sm text-gray-800 dark:text-gray-200">
                                                <div className="max-w-xs overflow-hidden">
                                                    {record.metadata ? (
                                                        <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded text-gray-800 dark:text-gray-200">
                                                            {JSON.stringify(record.metadata, null, 2).substring(0, 150)}
                                                        </pre>
                                                    ) : (
                                                        "-"
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination info */}
                        <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                            Page {paginationInfo?.page} of {paginationInfo?.totalPages} • Total Records: {paginationInfo?.totalCount}
                        </div>

                        {/* Pagination controls */}
                        <div className="mt-4 flex justify-between">
                            <button
                                onClick={handlePreviousPage}
                                disabled={!paginationInfo?.hasPreviousPage}
                                className="py-1 px-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                            >
                                Previous
                            </button>

                            <button
                                onClick={handleNextPage}
                                disabled={!paginationInfo?.hasNextPage}
                                className="py-1 px-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}

                {!isLoading && records && Object.keys(records).length === 0 && conversationId && (
                    <div className="mt-6 p-4 text-center bg-gray-50 dark:bg-gray-700 rounded-md text-gray-700 dark:text-gray-300">
                        No records found for this conversation ID.
                    </div>
                )}
            </div>

            {/* Payload preview */}
            {conversationId && (
                <div className="max-w-6xl mx-auto mt-6 bg-textured rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">Action Payload Preview</h2>
                    <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-md overflow-x-auto text-sm text-gray-800 dark:text-gray-200">
                        {JSON.stringify(
                            {
                                type: "message/fetchRecords",
                                payload: {
                                    page,
                                    pageSize,
                                    options: {
                                        filters: {
                                            conditions: [
                                                {
                                                    field: "displayOrder",
                                                    operator: "neq",
                                                    value: null,
                                                },
                                                {
                                                    field: "displayOrder",
                                                    operator: "neq",
                                                    value: 0,
                                                },
                                                {
                                                    field: "conversationId",
                                                    operator: "eq",
                                                    value: conversationId,
                                                },
                                            ],
                                            replace: true,
                                        },
                                        sort: {
                                            field: "displayOrder",
                                            direction: "asc",
                                        },
                                    },
                                },
                            },
                            null,
                            2
                        )}
                    </pre>
                </div>
            )}
            <MatrxDynamicPanel
                initialPosition="left"
                defaultExpanded={false}
                expandButtonProps={{
                    label: "",
                }}
            >
                <EnhancedEntityAnalyzer defaultExpanded={false} selectedEntityKey="message" />
            </MatrxDynamicPanel>
        </div>
    );
}
