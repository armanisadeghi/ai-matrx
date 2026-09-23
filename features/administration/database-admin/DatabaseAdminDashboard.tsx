// components/database/DatabaseAdminDashboard.jsx
import React, { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Database, Key, SquareFunction } from "lucide-react";
import { useDatabaseAdmin } from "@/features/administration/hooks/use-database-admin";
import { FunctionsList } from "./FunctionsList";

import { SQLEditor } from "./SQLEditor";
import FunctionDetails from "./functionDetails";
import PermissionsList from "./PermissionsList";
import {
  databaseFunctionSignature,
  type DatabaseFunction,
  type DatabasePermission,
} from "./types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  ADMIN_DATABASE_SURFACE_NAME,
  createAdminDatabaseScope,
} from "@/features/surfaces/manifests/admin-database.manifest";
import {
  enumUrlCodec,
  stringUrlCodec,
  useUrlState,
} from "@ai-matrx/kit/url-state";

function toDatabasePermissions(data: unknown): DatabasePermission[] {
  if (!Array.isArray(data))
    throw new Error("Permission source returned a non-list response.");
  const invalidIndex = data.findIndex(
    (row) =>
      !(
        typeof row === "object" &&
        row !== null &&
        "object_name" in row &&
        typeof row.object_name === "string" &&
        "object_type" in row &&
        typeof row.object_type === "string" &&
        "role" in row &&
        typeof row.role === "string" &&
        "privileges" in row &&
        Array.isArray(row.privileges)
      ),
  );
  if (invalidIndex !== -1)
    throw new Error(
      `Permission source returned an invalid row at position ${invalidIndex + 1}.`,
    );
  return data as DatabasePermission[];
}

function toDatabaseFunctions(data: unknown): DatabaseFunction[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is DatabaseFunction =>
      typeof row === "object" &&
      row !== null &&
      "name" in row &&
      typeof row.name === "string" &&
      "schema" in row &&
      typeof row.schema === "string" &&
      "security_type" in row &&
      typeof row.security_type === "string" &&
      "arguments" in row &&
      typeof row.arguments === "string" &&
      "returns" in row &&
      typeof row.returns === "string" &&
      "definition" in row &&
      typeof row.definition === "string",
  );
}

// Started: https://claude.ai/chat/ca16ca5d-adc0-4e6b-b81c-5347948fd86d (Brains)
// Cleanup: https://claude.ai/chat/aec2fe7a-e732-4162-a679-e7d05f303374

const VALID_TABS = ["functions", "permissions", "sql"] as const;
type AdminTab = (typeof VALID_TABS)[number];

function isAdminTab(value: string): value is AdminTab {
  return (VALID_TABS as readonly string[]).includes(value);
}

const DatabaseAdminDashboard = () => {
  const [activeTab, setActiveTab] = useUrlState(
    "tab",
    enumUrlCodec<AdminTab>(VALID_TABS, "functions"),
  );
  const [functions, setFunctions] = useState<DatabaseFunction[]>([]);
  const [permissions, setPermissions] = useState<DatabasePermission[]>([]);
  const [selectedFunction, setSelectedFunction] =
    useState<DatabaseFunction | null>(null);
  const [selectedFunctionKey, setSelectedFunctionKey] = useUrlState(
    "selected",
    stringUrlCodec(),
  );
  const isDetailsOpen = Boolean(selectedFunctionKey);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [functionsLoading, setFunctionsLoading] = useState(true);
  const [functionsError, setFunctionsError] = useState<string | null>(null);

  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);

  const { loading, error, fetchFunctions, fetchPermissions, executeQuery } =
    useDatabaseAdmin();

  useEffect(() => {
    const selected =
      functions.find(
        (func) => databaseFunctionSignature(func) === selectedFunctionKey,
      ) ?? null;
    setSelectedFunction(selected);
  }, [functions, selectedFunctionKey]);

  // Functions is the default tab — load it on mount. Permissions is loaded
  // lazily the first time its tab is opened (below), not eagerly on mount:
  // the old Promise.all fetched the full permissions catalog every visit even
  // for users who only ever look at Functions or the SQL editor.
  useEffect(() => {
    void loadFunctions();
  }, []);

  // Lazy-load permissions on first open of that tab.
  useEffect(() => {
    if (activeTab === "permissions" && !permissionsLoaded) {
      void loadPermissions();
    }
  }, [activeTab, permissionsLoaded]);

  const loadFunctions = async () => {
    setFunctionsLoading(true);
    try {
      const functionsData = await fetchFunctions();
      setFunctions(toDatabaseFunctions(functionsData));
      setFunctionsError(null);
    } catch (err) {
      console.error("Failed to load functions:", err);
      setFunctionsError(
        err instanceof Error
          ? err.message
          : "Failed to load database functions.",
      );
    } finally {
      setFunctionsLoading(false);
    }
  };

  const loadPermissions = async () => {
    try {
      const permissionsData = await fetchPermissions();
      setPermissions(toDatabasePermissions(permissionsData));
      setPermissionsLoaded(true);
      setPermissionsError(null);
    } catch (err) {
      console.error("Failed to load permissions:", err);
      setPermissions([]);
      setPermissionsLoaded(true);
      setPermissionsError(
        err instanceof Error
          ? err.message
          : "Failed to load database permissions.",
      );
    }
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      // Refresh functions always; refresh permissions if they've been loaded
      // OR the user is currently on the Permissions tab. The latter is what
      // lets the in-tab Refresh button RETRY after a failed first load.
      await Promise.all([
        loadFunctions(),
        permissionsLoaded || activeTab === "permissions"
          ? loadPermissions()
          : Promise.resolve(),
      ]);
    } catch (err) {
      console.error("Failed to refresh data:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExecuteQuery = async (query: string) => {
    try {
      const result = await executeQuery(query);
      return result;
    } catch (err) {
      console.error("Failed to execute query:", err);
      throw err;
    }
  };

  const handleTabChange = (value: string) => {
    if (isAdminTab(value)) setActiveTab(value);
  };

  const getSurfaceScope = () =>
    createAdminDatabaseScope({
      console_section: "database_admin",
      default_schema: "public",
      database_functions: functions.map((func) => ({
        signature: databaseFunctionSignature(func),
        name: func.name,
        schema: func.schema,
        security_type: func.security_type,
        arguments: func.arguments,
        returns: func.returns,
      })),
      database_function_count: functions.length,
      database_functions_loading: functionsLoading,
      ...(functionsError ? { database_functions_error: functionsError } : {}),
      ...(selectedFunctionKey
        ? { selected_function_signature: selectedFunctionKey }
        : {}),
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_DATABASE_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
      <NonEditableContextMenu
        sourceFeature="admin"
        surfaceName={ADMIN_DATABASE_SURFACE_NAME}
        getApplicationScope={getSurfaceScope}
        contentSource={{ type: "raw" }}
      >
        <div className="space-y-6 p-6" data-surface-value="database_functions">
          <FunctionDetails
            func={selectedFunction}
            open={isDetailsOpen}
            onOpenChange={(open) => {
              if (!open) setSelectedFunctionKey("");
            }}
          />

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger
                value="functions"
                className="flex items-center gap-2"
              >
                <SquareFunction className="h-4 w-4" />
                Functions
              </TabsTrigger>
              <TabsTrigger
                value="permissions"
                className="flex items-center gap-2"
              >
                <Key className="h-4 w-4" />
                Permissions
              </TabsTrigger>
              <TabsTrigger value="sql" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                SQL Query
              </TabsTrigger>
            </TabsList>

            <div className="mt-4">
              <TabsContent value="functions">
                <FunctionsList
                  functions={functions}
                  loading={functionsLoading}
                  isRefreshing={isRefreshing}
                  error={functionsError}
                  onRefresh={refreshData}
                  onViewDetails={(func: DatabaseFunction) => {
                    setSelectedFunction(func);
                    setSelectedFunctionKey(databaseFunctionSignature(func));
                  }}
                />
              </TabsContent>

              <TabsContent value="permissions">
                <PermissionsList
                  permissions={permissions}
                  loading={loading}
                  isRefreshing={isRefreshing}
                  onRefresh={refreshData}
                  error={permissionsError}
                />
              </TabsContent>

              <TabsContent value="sql">
                <SQLEditor
                  loading={loading}
                  error={error}
                  onExecuteQuery={handleExecuteQuery}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
};

export default DatabaseAdminDashboard;
