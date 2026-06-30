// components/database/DatabaseAdminDashboard.jsx
import React, { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Database, Key, SquareFunction } from "lucide-react";
import { useDatabaseAdmin } from "@/features/administration/hooks/use-database-admin";
import { FunctionsList } from "./FunctionsList";

import { SQLEditor } from "./SQLEditor";
import FunctionDetails from "./functionDetails";
import PermissionsList from "./PermissionsList";

// Started: https://claude.ai/chat/ca16ca5d-adc0-4e6b-b81c-5347948fd86d (Brains)
// Cleanup: https://claude.ai/chat/aec2fe7a-e732-4162-a679-e7d05f303374

const DatabaseAdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("functions");
  const [functions, setFunctions] = useState<unknown[]>([]);
  const [permissions, setPermissions] = useState<unknown[]>([]);
  const [selectedFunction, setSelectedFunction] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  const { loading, error, fetchFunctions, fetchPermissions, executeQuery } =
    useDatabaseAdmin();

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
    try {
      const functionsData = await fetchFunctions();
      setFunctions(functionsData || []);
    } catch (err) {
      console.error("Failed to load functions:", err);
    }
  };

  const loadPermissions = async () => {
    try {
      const permissionsData = await fetchPermissions();
      setPermissions(permissionsData || []);
      setPermissionsLoaded(true);
    } catch (err) {
      console.error("Failed to load permissions:", err);
    }
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      // Refresh functions always; refresh permissions if they've been loaded
      // OR the user is currently on the Permissions tab. The latter is what
      // lets the in-tab Refresh button RETRY after a failed first load (a
      // failure leaves permissionsLoaded false, so a `permissionsLoaded`-only
      // gate would make Refresh a no-op on exactly the screen that needs it).
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

  const handleExecuteQuery = async (query) => {
    try {
      const result = await executeQuery(query);
      return result;
    } catch (err) {
      console.error("Failed to execute query:", err);
      throw err;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <FunctionDetails
        func={selectedFunction}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="functions" className="flex items-center gap-2">
            <SquareFunction className="h-4 w-4" />
            Functions
          </TabsTrigger>
          <TabsTrigger value="permissions" className="flex items-center gap-2">
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
              loading={loading}
              isRefreshing={isRefreshing}
              onRefresh={refreshData}
              onViewDetails={(func) => {
                setSelectedFunction(func);
                setIsDetailsOpen(true);
              }}
            />
          </TabsContent>

          <TabsContent value="permissions">
            <PermissionsList
              permissions={permissions}
              loading={loading}
              isRefreshing={isRefreshing}
              onRefresh={refreshData}
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
  );
};

export default DatabaseAdminDashboard;
