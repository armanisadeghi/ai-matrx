"use client";

import { useEffect, useRef, useState } from "react";
import {
  Tags,
  FileText,
  LayoutTemplate,
  BarChart3,
  Building2,
  FolderKanban,
  ListTodo,
  User,
  Loader2,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopeTypes,
  selectScopeTypesByOrg,
  selectScopeTypesLoading,
} from "../../redux/scope/scopeTypesSlice";
import { fetchScopes, selectScopesByOrg } from "../../redux/scope/scopesSlice";
import {
  EMPTY_SCOPES_LIST,
  EMPTY_SCOPE_TYPES_LIST,
} from "../../redux/scope/selectors";
import type { ScopeType } from "../../redux/scope/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/utils/cn";

import type { ScopeState } from "../../hooks/useContextScope";
import type { HierarchyNodeType } from "../../service/hierarchyService";

import { ScopeTypeList } from "../scope-admin/ScopeTypeList";
import { ScopeInstancePanel } from "../scope-admin/ScopeInstancePanel";
import { ScopeTemplateStarter } from "../scope-admin/ScopeTemplateStarter";
import { ContextItemList } from "../ContextItemList";
import { ContextTemplateBrowser } from "../ContextTemplateBrowser";

const NODE_ICONS: Record<
  HierarchyNodeType,
  React.ComponentType<{ className?: string }>
> = {
  user: User,
  organization: Building2,
  project: FolderKanban,
  task: ListTodo,
};

const NODE_ACCENT: Record<HierarchyNodeType, string> = {
  user: "bg-blue-500/10 text-blue-500",
  organization: "bg-violet-500/10 text-violet-500",
  project: "bg-amber-500/10 text-amber-500",
  task: "bg-sky-500/10 text-sky-500",
};

function nodeTypeToScopeType(
  nodeType: HierarchyNodeType,
): ScopeState["scopeType"] {
  return nodeType;
}

interface ContextHubDetailProps {
  nodeType: HierarchyNodeType;
  nodeId: string;
  nodeName: string;
  nodeDescription?: string;
}

export function ContextHubDetail({
  nodeType,
  nodeId,
  nodeName,
  nodeDescription,
}: ContextHubDetailProps) {
  const isMobile = useIsMobile();
  const dispatch = useAppDispatch();
  const hasFetched = useRef(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  const orgId = nodeType === "organization" ? nodeId : "";
  const scopeTypes = useAppSelector((state) =>
    orgId ? selectScopeTypesByOrg(state, orgId) : EMPTY_SCOPE_TYPES_LIST,
  );
  const allScopes = useAppSelector((state) =>
    orgId ? selectScopesByOrg(state, orgId) : EMPTY_SCOPES_LIST,
  );
  const scopeTypesLoading = useAppSelector(selectScopeTypesLoading);

  useEffect(() => {
    if (!orgId || hasFetched.current) return;
    hasFetched.current = true;
    dispatch(fetchScopeTypes(orgId));
    dispatch(fetchScopes({ org_id: orgId }));
  }, [dispatch, orgId]);

  useEffect(() => {
    hasFetched.current = false;
  }, [orgId]);

  useEffect(() => {
    if (!selectedTypeId && scopeTypes.length > 0) {
      setSelectedTypeId(scopeTypes[0].id);
    }
    if (
      selectedTypeId &&
      scopeTypes.length > 0 &&
      !scopeTypes.find((t) => t.id === selectedTypeId)
    ) {
      setSelectedTypeId(scopeTypes[0]?.id ?? null);
    }
  }, [scopeTypes, selectedTypeId]);

  const selectedType = scopeTypes.find((t) => t.id === selectedTypeId) ?? null;

  const scope: ScopeState = {
    scopeType: nodeTypeToScopeType(nodeType),
    scopeId: nodeId,
    scopeName: nodeName,
  };

  const Icon = NODE_ICONS[nodeType];

  const refreshScopes = () => {
    if (!orgId) return;
    hasFetched.current = false;
    dispatch(fetchScopeTypes(orgId));
    dispatch(fetchScopes({ org_id: orgId }));
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    ...(nodeType === "organization"
      ? [{ id: "scopes", label: "Scopes", icon: Tags }]
      : []),
    { id: "items", label: "Context Items", icon: FileText },
    { id: "templates", label: "Templates", icon: LayoutTemplate },
  ];

  if (isMobile) {
    return (
      <div className="p-4 space-y-6">
        <NodeHeader
          icon={Icon}
          nodeType={nodeType}
          nodeName={nodeName}
          nodeDescription={nodeDescription}
        />
        <OverviewSection
          scope={scope}
          scopeTypes={scopeTypes}
          allScopesCount={allScopes.length}
          loading={scopeTypesLoading}
        />
        {nodeType === "organization" && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Tags className="h-4 w-4 text-muted-foreground" /> Scopes
              </h3>
              <ScopesSection
                orgId={orgId}
                scopeTypes={scopeTypes}
                selectedTypeId={selectedTypeId}
                onSelectType={setSelectedTypeId}
                selectedType={selectedType}
                loading={scopeTypesLoading}
                onRefresh={refreshScopes}
              />
            </div>
          </>
        )}
        <Separator />
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" /> Context Items
          </h3>
          <ContextItemList scope={scope} />
        </div>
        <Separator />
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-muted-foreground" />{" "}
            Templates
          </h3>
          <ContextTemplateBrowser scope={scope} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <NodeHeader
        icon={Icon}
        nodeType={nodeType}
        nodeName={nodeName}
        nodeDescription={nodeDescription}
        className="px-6 pt-5 pb-0"
      />
      <Tabs
        defaultValue="overview"
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="mx-6 mt-3 mb-0 h-9 w-fit bg-muted/50">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="gap-1.5 text-xs data-[state=active]:bg-background"
              >
                <TabIcon className="h-3.5 w-3.5" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="overview" className="px-6 py-4 mt-0">
            <OverviewSection
              scope={scope}
              scopeTypes={scopeTypes}
              allScopesCount={allScopes.length}
              loading={scopeTypesLoading}
            />
          </TabsContent>

          {nodeType === "organization" && (
            <TabsContent value="scopes" className="px-6 py-4 mt-0">
              <ScopesSection
                orgId={orgId}
                scopeTypes={scopeTypes}
                selectedTypeId={selectedTypeId}
                onSelectType={setSelectedTypeId}
                selectedType={selectedType}
                loading={scopeTypesLoading}
                onRefresh={refreshScopes}
              />
            </TabsContent>
          )}

          <TabsContent value="items" className="px-6 py-4 mt-0">
            <ContextItemList scope={scope} />
          </TabsContent>

          <TabsContent value="templates" className="px-6 py-4 mt-0">
            <ContextTemplateBrowser scope={scope} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function NodeHeader({
  icon: Icon,
  nodeType,
  nodeName,
  nodeDescription,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  nodeType: HierarchyNodeType;
  nodeName: string;
  nodeDescription?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <div
        className={cn(
          "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
          NODE_ACCENT[nodeType],
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold truncate">{nodeName}</h1>
          <Badge
            variant="outline"
            className="text-[10px] h-5 px-1.5 shrink-0 capitalize"
          >
            {nodeType}
          </Badge>
        </div>
        {nodeDescription && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            {nodeDescription}
          </p>
        )}
      </div>
    </div>
  );
}

function OverviewSection({
  scope,
  scopeTypes,
  allScopesCount,
  loading,
}: {
  scope: ScopeState;
  scopeTypes: ScopeType[];
  allScopesCount: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = [
    {
      label: "Scope Types",
      value: scopeTypes.length,
      icon: Tags,
      show: scope.scopeType === "organization",
    },
    {
      label: "Scope Instances",
      value: allScopesCount,
      icon: Tags,
      show: scope.scopeType === "organization",
    },
  ].filter((s) => s.show);

  return (
    <div className="space-y-4">
      {stats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((stat) => {
            const StatIcon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <StatIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg font-bold leading-none">
                      {stat.value}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {stat.label}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            Use the tabs above to manage context for this{" "}
            <span className="font-medium text-foreground lowercase">
              {scope.scopeType}
            </span>
            . Context items define the structured knowledge agents can access.
            Templates help bootstrap common configurations. Variables store
            key-value pairs injected into agent prompts.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ScopesSection({
  orgId,
  scopeTypes,
  selectedTypeId,
  onSelectType,
  selectedType,
  loading,
  onRefresh,
}: {
  orgId: string;
  scopeTypes: ScopeType[];
  selectedTypeId: string | null;
  onSelectType: (id: string) => void;
  selectedType: ScopeType | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (!orgId) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">
            Scopes are managed at the organization level. Select an organization
            to manage its scope types and instances.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!loading && scopeTypes.length === 0) {
    return (
      <ScopeTemplateStarter organizationId={orgId} onTypesCreated={onRefresh} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 min-h-[300px]">
        <div className="w-full md:w-56 shrink-0 border border-border rounded-lg bg-card overflow-hidden">
          <ScopeTypeList
            organizationId={orgId}
            scopeTypes={scopeTypes}
            selectedTypeId={selectedTypeId}
            onSelectType={onSelectType}
            loading={loading}
          />
        </div>
        <div className="flex-1 border border-border rounded-lg bg-card overflow-hidden">
          {selectedType ? (
            <ScopeInstancePanel
              organizationId={orgId}
              scopeType={selectedType}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
              Select a scope type to manage its instances
            </div>
          )}
        </div>
      </div>
      <ScopeTemplateStarter
        organizationId={orgId}
        compact
        onTypesCreated={onRefresh}
      />
    </div>
  );
}
