"use client";

import React, { useState, useMemo } from "react";
import { useSqlFunctions } from "@/lib/hooks/useSqlFunctions";
import { SqlFunction } from "@/types/sql-functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Search, RefreshCw, Plus, X } from "lucide-react";
import SqlFunctionsList from "./SqlFunctionsList";
import SqlFunctionDetail from "./SqlFunctionDetail";
import SqlFunctionForm from "./SqlFunctionForm";

interface SqlFunctionsContainerProps {
  initialFunctions?: SqlFunction[];
}

export default function SqlFunctionsContainer({
  initialFunctions = [],
}: SqlFunctionsContainerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [activeTab, setActiveTab] = useState<"list" | "create" | "edit">(
    "list",
  );
  const [customSchemaSearch, setCustomSchemaSearch] = useState(false);
  const [nameSearch, setNameSearch] = useState("");

  const {
    functions,
    loading,
    error,
    isRefreshing,
    selectedFunction,
    filter,
    sort,
    refreshFunctions,
    createFunction,
    updateFunction,
    deleteFunction,
    selectFunction,
    updateFilter,
    updateSort,
  } = useSqlFunctions({
    initialData: initialFunctions,
    defaultFilter: { schema: "public" },
  });

  const uniqueSchemas = useMemo(() => {
    const schemas = new Set<string>();
    functions.forEach((func) => {
      if (func.schema) schemas.add(func.schema);
    });
    return Array.from(schemas).sort();
  }, [functions]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter({ name: nameSearch });
  };

  const handleCreateFunction = async (definition: string) => {
    const success = await createFunction(definition);
    if (success) setActiveTab("list");
    return success;
  };

  const handleUpdateFunction = async (definition: string) => {
    const success = await updateFunction(definition);
    if (success) {
      setActiveTab("list");
      selectFunction(null);
    }
    return success;
  };

  const handleDeleteFunction = async (
    schema: string,
    name: string,
    argumentTypes: string,
  ) => {
    const success = await deleteFunction(schema, name, argumentTypes);
    if (success) selectFunction(null);
    return success;
  };

  const handleEditFunction = (func: SqlFunction) => {
    selectFunction(func);
    setActiveTab("edit");
  };

  const handleNewFunction = () => {
    selectFunction(null);
    setActiveTab("create");
  };

  const handleBackToList = () => {
    setActiveTab("list");
    selectFunction(null);
  };

  const handleSchemaChange = (value: string) => {
    if (value === "custom") {
      setCustomSchemaSearch(true);
      updateFilter({ schema: "" });
    } else {
      setCustomSchemaSearch(false);
      updateFilter({ schema: value === "all" ? undefined : value });
    }
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(functions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, functions.length);
  const currentFunctions = functions.slice(startIndex, endIndex);

  const pageNumbers: number[] = [];
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  if (endPage - startPage + 1 < maxVisiblePages)
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  for (let i = startPage; i <= endPage; i++) pageNumbers.push(i);

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as "list" | "create" | "edit")
        }
        className="flex flex-col h-full overflow-hidden"
      >
        {/* Tab bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0">
          <TabsList className="bg-slate-100 dark:bg-slate-700 h-7">
            <TabsTrigger
              value="list"
              className="text-xs h-6 px-3 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
            >
              Function List
            </TabsTrigger>
            {activeTab === "create" && (
              <TabsTrigger
                value="create"
                className="text-xs h-6 px-3 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
              >
                Create Function
              </TabsTrigger>
            )}
            {activeTab === "edit" && selectedFunction && (
              <TabsTrigger
                value="edit"
                className="text-xs h-6 px-3 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
              >
                Edit: {selectedFunction.name}
              </TabsTrigger>
            )}
          </TabsList>
          {activeTab !== "list" && (
            <Button
              onClick={handleBackToList}
              variant="outline"
              size="sm"
              className="h-7 text-xs border-slate-300 dark:border-slate-700"
            >
              Back to List
            </Button>
          )}
        </div>

        {/* Tab contents — each fills remaining height */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* LIST TAB */}
          <TabsContent
            value="list"
            className="h-full mt-0 flex flex-col overflow-hidden"
          >
            {/* Search/filter toolbar */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
              <form
                onSubmit={handleSearch}
                className="flex items-center gap-1.5"
              >
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search by name..."
                    value={nameSearch}
                    onChange={(e) => setNameSearch(e.target.value)}
                    className="pl-8 h-8 w-52 text-sm border-slate-300 dark:border-slate-700"
                  />
                </div>
                <Button
                  type="submit"
                  size="icon"
                  className="h-8 w-8 bg-slate-700 hover:bg-slate-600 text-white shrink-0"
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  onClick={handleNewFunction}
                  size="icon"
                  className="h-8 w-8 bg-slate-700 hover:bg-slate-600 text-white shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  onClick={refreshFunctions}
                  disabled={isRefreshing || loading}
                  size="icon"
                  className="h-8 w-8 bg-slate-700 hover:bg-slate-600 text-white shrink-0"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                  />
                </Button>
              </form>

              <div className="flex items-center gap-4 ml-auto flex-wrap">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    Schema:
                  </label>
                  <div className="w-36">
                    {customSchemaSearch ? (
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="Enter schema..."
                          value={filter.schema || ""}
                          onChange={(e) =>
                            updateFilter({ schema: e.target.value })
                          }
                          className="h-8 pr-7 text-sm border-slate-300 dark:border-slate-700"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-2 text-slate-400 hover:text-slate-700"
                          onClick={() => setCustomSchemaSearch(false)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Select
                        value={filter.schema || "all"}
                        onValueChange={handleSchemaChange}
                      >
                        <SelectTrigger className="h-8 text-sm border-slate-300 dark:border-slate-700">
                          <SelectValue placeholder="Schema" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          <SelectItem value="all">All Schemas</SelectItem>
                          {uniqueSchemas.map((schema) => (
                            <SelectItem key={schema} value={schema}>
                              {schema}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">
                            Custom Search...
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    Return:
                  </label>
                  <Input
                    type="text"
                    placeholder="Filter by return type..."
                    value={filter.returnType || ""}
                    onChange={(e) =>
                      updateFilter({ returnType: e.target.value })
                    }
                    className="h-8 w-44 text-sm border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    Security:
                  </label>
                  <Select
                    value={filter.securityType || "any"}
                    onValueChange={(v) =>
                      updateFilter({
                        securityType:
                          v === "any"
                            ? undefined
                            : (v as "SECURITY DEFINER" | "SECURITY INVOKER"),
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-32 text-sm border-slate-300 dark:border-slate-700">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="SECURITY DEFINER">Definer</SelectItem>
                      <SelectItem value="SECURITY INVOKER">Invoker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Split area: list (top) + detail panel (bottom) */}
            {selectedFunction ? (
              /* When a function is selected: list shrinks to content (capped), detail fills the rest */
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* List — natural content height, capped so detail always has room */}
                <div
                  className="shrink-0 overflow-auto"
                  style={{ maxHeight: "260px" }}
                >
                  {error ? (
                    <div className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 m-2 text-red-800 dark:text-red-300 text-sm">
                      {error.message}
                    </div>
                  ) : (
                    <SqlFunctionsList
                      functions={currentFunctions}
                      loading={loading || isRefreshing}
                      onViewDetails={(func) => selectFunction(func)}
                      onEditFunction={handleEditFunction}
                      onDeleteFunction={handleDeleteFunction}
                      onSortChange={updateSort}
                      sortField={sort.field}
                      sortDirection={sort.direction}
                    />
                  )}
                </div>

                {/* Divider */}
                <div className="shrink-0 border-t-2 border-slate-200 dark:border-slate-700" />

                {/* Detail panel — fills remaining space */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <SqlFunctionDetail
                    func={selectedFunction}
                    onClose={() => selectFunction(null)}
                    onEdit={() => handleEditFunction(selectedFunction)}
                    onDelete={() =>
                      handleDeleteFunction(
                        selectedFunction.schema,
                        selectedFunction.name,
                        selectedFunction.arguments,
                      )
                    }
                  />
                </div>
              </div>
            ) : (
              /* No selection: list fills everything */
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-auto">
                  {error ? (
                    <div className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 m-2 text-red-800 dark:text-red-300 text-sm">
                      {error.message}
                    </div>
                  ) : (
                    <SqlFunctionsList
                      functions={currentFunctions}
                      loading={loading || isRefreshing}
                      onViewDetails={(func) => selectFunction(func)}
                      onEditFunction={handleEditFunction}
                      onDeleteFunction={handleDeleteFunction}
                      onSortChange={updateSort}
                      sortField={sort.field}
                      sortDirection={sort.direction}
                    />
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="shrink-0 px-3 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 grid grid-cols-3 items-center">
                    <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      Showing {startIndex + 1}–{endIndex} of {functions.length}
                    </div>
                    <div className="flex justify-center">
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              onClick={() =>
                                setCurrentPage((p) => Math.max(1, p - 1))
                              }
                              className={`cursor-pointer ${currentPage === 1 ? "pointer-events-none opacity-50" : ""}`}
                            />
                          </PaginationItem>
                          {startPage > 1 && (
                            <>
                              <PaginationItem>
                                <PaginationLink
                                  onClick={() => setCurrentPage(1)}
                                  className="cursor-pointer"
                                >
                                  1
                                </PaginationLink>
                              </PaginationItem>
                              {startPage > 2 && (
                                <PaginationItem>
                                  <span className="px-2 text-slate-400">
                                    ...
                                  </span>
                                </PaginationItem>
                              )}
                            </>
                          )}
                          {pageNumbers.map((page) => (
                            <PaginationItem key={page}>
                              <PaginationLink
                                onClick={() => setCurrentPage(page)}
                                isActive={currentPage === page}
                                className="cursor-pointer"
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          ))}
                          {endPage < totalPages && (
                            <>
                              {endPage < totalPages - 1 && (
                                <PaginationItem>
                                  <span className="px-2 text-slate-400">
                                    ...
                                  </span>
                                </PaginationItem>
                              )}
                              <PaginationItem>
                                <PaginationLink
                                  onClick={() => setCurrentPage(totalPages)}
                                  className="cursor-pointer"
                                >
                                  {totalPages}
                                </PaginationLink>
                              </PaginationItem>
                            </>
                          )}
                          <PaginationItem>
                            <PaginationNext
                              onClick={() =>
                                setCurrentPage((p) =>
                                  Math.min(totalPages, p + 1),
                                )
                              }
                              className={`cursor-pointer ${currentPage === totalPages ? "pointer-events-none opacity-50" : ""}`}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Rows:
                      </span>
                      <Select
                        value={itemsPerPage.toString()}
                        onValueChange={handleItemsPerPageChange}
                      >
                        <SelectTrigger className="h-7 w-16 text-xs border-slate-300 dark:border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* CREATE TAB */}
          <TabsContent value="create" className="h-full mt-0 overflow-hidden">
            <SqlFunctionForm
              onSubmit={handleCreateFunction}
              onCancel={handleBackToList}
            />
          </TabsContent>

          {/* EDIT TAB */}
          <TabsContent value="edit" className="h-full mt-0 overflow-hidden">
            {selectedFunction && (
              <SqlFunctionForm
                functionData={selectedFunction}
                onSubmit={handleUpdateFunction}
                onCancel={handleBackToList}
              />
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
