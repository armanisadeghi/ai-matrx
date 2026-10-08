"use client";

import React, { useEffect, useMemo } from "react";
import { useEnums } from "@/lib/hooks/useEnums";
import {
  DatabaseEnum,
  CreateEnumRequest,
  UpdateEnumRequest,
} from "@/types/enum-types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@ai-matrx/design-system/controls";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { List, Search, RefreshCw, Plus, X } from "lucide-react";
import EnumsList from "../../sql-functions/components/EnumsList";
import EnumDetail, {
  type EnumDetailTab,
} from "../../sql-functions/components/EnumDetail";
import EnumForm from "../../sql-functions/components/EnumForm";
import { DEFAULT_DATABASE_SCHEMA } from "../../config";
import {
  booleanUrlCodec,
  enumUrlCodec,
  jsonUrlCodec,
  stringUrlCodec,
  useUrlState,
} from "@ai-matrx/kit/url-state";
import type { EnumFilter, EnumSort } from "@/types/enum-types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { readOf } from "@ai-matrx/design-system";

interface EnumsContainerProps {
  initialEnums?: DatabaseEnum[];
}

export default function EnumsContainer({
  initialEnums = [],
}: EnumsContainerProps) {
  const [activeTab, setActiveTab] = useUrlState(
    "tab",
    enumUrlCodec(["list", "create", "edit"] as const, "list"),
  );
  const [customSchemaSearch, setCustomSchemaSearch] = useUrlState(
    "customSchema",
    booleanUrlCodec(false),
  );
  const [nameSearch, setNameSearch] = useUrlState("q", stringUrlCodec());
  // Which detail tab the last "open" asked for (a count-door sends 'usage').
  const [detailTab, setDetailTab] = useUrlState(
    "detailTab",
    enumUrlCodec<EnumDetailTab>(["details", "values", "usage"], "details"),
  );
  const [urlFilter, setUrlFilter] = useUrlState(
    "filter",
    jsonUrlCodec<EnumFilter>(
      { schema: DEFAULT_DATABASE_SCHEMA },
      (value): value is EnumFilter =>
        Boolean(value) && typeof value === "object" && !Array.isArray(value),
    ),
  );
  const [urlSort, setUrlSort] = useUrlState(
    "sort",
    jsonUrlCodec<EnumSort>(
      { field: "name", direction: "asc" },
      (value): value is EnumSort => {
        if (!value || typeof value !== "object" || Array.isArray(value))
          return false;
        const candidate = value as Record<string, unknown>;
        return (
          ["name", "schema", "values_count", "usage_count"].includes(
            String(candidate.field),
          ) &&
          (candidate.direction === "asc" || candidate.direction === "desc")
        );
      },
    ),
  );
  const [selectedKey, setSelectedKey] = useUrlState(
    "selected",
    stringUrlCodec(),
  );

  // Use the Enums hook
  const {
    enums,
    allEnums,
    loading,
    error,
    loadError,
    isRefreshing,
    selectedEnum,
    filter,
    sort,
    refreshEnums,
    searchEnums,
    createEnum,
    updateEnum,
    deleteEnum,
    selectEnum: selectEnumInternal,
    replaceFilter,
    replaceSort,
  } = useEnums({
    initialData: initialEnums,
    defaultFilter: urlFilter,
    defaultSort: urlSort,
  });

  const filterSnapshot = JSON.stringify(urlFilter);
  const sortSnapshot = JSON.stringify(urlSort);
  useEffect(() => replaceFilter(urlFilter), [filterSnapshot, replaceFilter]);
  useEffect(() => replaceSort(urlSort), [sortSnapshot, replaceSort]);
  useEffect(() => {
    const selected =
      allEnums.find(
        (enumType) => `${enumType.schema}.${enumType.name}` === selectedKey,
      ) ?? null;
    selectEnumInternal(selected);
  }, [allEnums, selectedKey, selectEnumInternal]);

  const selectEnum = (enumType: DatabaseEnum | null) => {
    selectEnumInternal(enumType);
    setSelectedKey(enumType ? `${enumType.schema}.${enumType.name}` : "");
  };

  const updateUrlFilter = (patch: EnumFilter) => {
    const next = { ...urlFilter, ...patch };
    for (const key of Object.keys(next) as Array<keyof EnumFilter>) {
      if (next[key] === undefined || next[key] === "") delete next[key];
    }
    setUrlFilter(next);
    replaceFilter(next);
  };

  const updateUrlSort = (field: EnumSort["field"]) => {
    const next: EnumSort = {
      field,
      direction:
        urlSort.field === field && urlSort.direction === "asc" ? "desc" : "asc",
    };
    setUrlSort(next);
    replaceSort(next);
  };

  const uniqueSchemas = useMemo(() => {
    const schemas = new Set<string>();
    allEnums.forEach((enumType) => {
      if (enumType.schema) {
        schemas.add(enumType.schema);
      }
    });
    return Array.from(schemas).sort();
  }, [allEnums]);

  // Handle form submission for search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrlFilter({ name: nameSearch });
  };

  // Handle creating a new enum
  const handleCreateEnum = async (request: CreateEnumRequest) => {
    const success = await createEnum(request);
    if (success) {
      setActiveTab("list");
    }
    return success;
  };

  // Handle updating an enum
  const handleUpdateEnum = async (request: UpdateEnumRequest) => {
    const success = await updateEnum(request);
    if (success) {
      setActiveTab("list");
      selectEnum(null);
    }
    return success;
  };

  // Handle deleting an enum
  const handleDeleteEnum = async (schema: string, name: string) => {
    const success = await deleteEnum(schema, name);
    if (success) {
      selectEnum(null);
    }
    return success;
  };

  // Handle viewing enum details.
  // THE DOOR LAW: `tab` carries the question the user clicked — "12 tables"
  // opens the detail already on Usage, where those tables are listed.
  const handleViewDetails = (enumType: DatabaseEnum, tab?: EnumDetailTab) => {
    setDetailTab(tab ?? "details");
    selectEnum(enumType);
  };

  // Handle creating a new enum
  const handleNewEnum = () => {
    selectEnum(null);
    setActiveTab("create");
  };

  // Handle editing an enum
  const handleEditEnum = (enumType: DatabaseEnum) => {
    selectEnum(enumType);
    setActiveTab("edit");
  };

  // Handle going back to the list
  const handleBackToList = () => {
    setActiveTab("list");
    selectEnum(null);
  };

  // Handle schema selection change
  const handleSchemaChange = (value: string) => {
    if (value === "custom") {
      setCustomSchemaSearch(true);
      updateUrlFilter({ schema: "" });
    } else {
      setCustomSchemaSearch(false);
      updateUrlFilter({ schema: value === "all" ? undefined : value });
    }
  };

  return (
    <Card className="w-full bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-700">
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as "list" | "create" | "edit")
        }
      >
        <CardHeader className="pb-4 flex flex-row items-center justify-between">
          <div className="flex items-center space-x-2 text-slate-800 dark:text-slate-200 font-medium">
            <List className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            <span>Database Enums Management</span>
          </div>

          <div className="flex items-center justify-end gap-2">
            <TabsList>
              <TabsTrigger
                value="list"
              >
                Enum List
              </TabsTrigger>
              {activeTab === "create" && (
                <TabsTrigger
                  value="create"
                >
                  Create Enum
                </TabsTrigger>
              )}
              {activeTab === "edit" && selectedEnum && (
                <TabsTrigger
                  value="edit"
                >
                  Edit: {selectedEnum.name}
                </TabsTrigger>
              )}
            </TabsList>

            {activeTab !== "list" && (
              <Button
                type="submit"
                onClick={handleBackToList}
                variant="outline"
              >
                Back to List
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <TabsContent value="list" className="mt-0">
            {/* Compact search and action buttons */}
            <div className="flex flex-wrap items-end gap-3 mb-6 p-1 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex-1 min-w-[200px] max-w-md">
                <form onSubmit={handleSearch} className="flex space-x-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input adornment="start"
                      type="text"
                      placeholder="Search by name..."
                      value={nameSearch}
                      onChange={(e) => setNameSearch(e.target.value)}
                    />
                  </div>
                  <Button
                    icon={<Search />} aria-label="Search"
                    variant="primary"
                    type="submit"
                  />
                  <Button
                    icon={<Plus />} aria-label="New Enum"
                    variant="primary"
                    type="button"
                    onClick={handleNewEnum}
                  />
                  <Button
                    icon={<RefreshCw
                      className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                    />} aria-label="Refresh"
                    variant="primary"
                    type="button"
                    onClick={refreshEnums}
                    disabled={isRefreshing || loading}
                  />
                </form>
              </div>

              <div className="flex flex-wrap gap-3 flex-1 justify-end">
                <div className="flex items-center gap-2 w-auto">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    Schema:
                  </label>
                  <div className="w-[150px]">
                    {customSchemaSearch ? (
                      <div className="relative">
                        <Input adornment="end"
                          type="text"
                          placeholder="Enter schema name..."
                          value={filter.schema || ""}
                          onChange={(e) =>
                            updateUrlFilter({ schema: e.target.value })
                          }
                        />
                        <Button
                          icon={<X />} aria-label="Close"
                          type="button"
                          variant="quiet"
                          className="absolute right-0 top-0"
                          onClick={() => setCustomSchemaSearch(false)}
                        />
                      </div>
                    ) : (
                      <Select
                        value={filter.schema || "all"}
                        onValueChange={handleSchemaChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select schema" />
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
                <div className="flex items-center gap-2 w-auto">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    Has Value:
                  </label>
                  <div className="w-[200px]">
                    <Input
                      type="text"
                      placeholder="Filter by enum value..."
                      value={filter.hasValue || ""}
                      onChange={(e) =>
                        updateUrlFilter({ hasValue: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Enums list */}
            {/* A create/update/delete refusal; the list read's own failure is the table's (RC-B12 r13). */}
            {error && !loadError ? (
              <div className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4 text-red-800 dark:text-red-300">
                {error.message}
                <ErrorAlchemyMenu error={error.message} />
              </div>
            ) : null}
                <EnumsList
                  enums={enums}
                  loading={loading || isRefreshing}
                  read={readOf({ loading, error: loadError }, { what: "enums", onRetry: () => void refreshEnums() })}
                  onViewDetails={handleViewDetails}
                  onEditEnum={handleEditEnum}
                  onDeleteEnum={handleDeleteEnum}
                  onSortChange={updateUrlSort}
                  sortField={sort.field}
                  sortDirection={sort.direction}
                />
          </TabsContent>

          <TabsContent value="create" className="mt-0">
            <EnumForm onSubmit={handleCreateEnum} onCancel={handleBackToList} />
          </TabsContent>

          <TabsContent value="edit" className="mt-0">
            {selectedEnum && (
              <EnumForm
                mode="edit"
                enumData={selectedEnum}
                onSubmit={handleUpdateEnum}
                onCancel={handleBackToList}
              />
            )}
          </TabsContent>
        </CardContent>
      </Tabs>

      {/* Detail view (appears when an enum is selected) */}
      {selectedEnum && activeTab === "list" && (
        <div className="mt-6 px-6 pb-6">
          <EnumDetail
            // Remount when the target enum OR the requested tab changes, so a
            // usage-count click always lands on Usage — even when the panel is
            // already open on another enum.
            key={`${selectedEnum.schema}.${selectedEnum.name}:${detailTab ?? "details"}`}
            enumType={selectedEnum}
            initialTab={detailTab}
            onClose={() => selectEnum(null)}
            onEdit={() => handleEditEnum(selectedEnum)}
            onDelete={() =>
              handleDeleteEnum(selectedEnum.schema, selectedEnum.name)
            }
          />
        </div>
      )}
    </Card>
  );
}
