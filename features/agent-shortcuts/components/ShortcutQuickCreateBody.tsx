"use client";

/**
 * ShortcutQuickCreateBody
 *
 * Renders only the active tab's content for the Create Shortcut window.
 * All state + handlers live in `useShortcutQuickCreate` and are passed in
 * as a single `state` bundle. The surrounding WindowPanel owns the tab
 * navigation (in its resizable sidebar), the footer (Save/Cancel/scope),
 * and any header actions — so the body stays focused on form layout.
 */

import {
  AlertCircle,
  CheckCircle2,
  Info,
  Layers,
  MonitorSmartphone,
  Search,
  Hammer,
  Variable,
} from "lucide-react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation.dynamic";
import { cn } from "@/lib/utils";
import type { ResultDisplayMode } from "@/features/agents/types/instance.types";
import {
  VARIABLE_PANEL_STYLE_OPTIONS,
  type VariablesPanelStyle,
} from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import type { ShortcutContext } from "@/features/agents/utils/shortcut-context-utils";
import { RESULT_DISPLAY_OPTIONS } from "../constants";
import { AgentVersionPicker } from "./AgentVersionPicker";
import { DefaultVariableValuesEditor } from "./DefaultVariableValuesEditor";
import { ScopeMappingEditor } from "./ScopeMappingEditor";
import { ShortcutContextsPicker } from "./ShortcutContextsPicker";
import { CategorySelect } from "./CategorySelect";
import {
  FALLBACK_CATEGORY_LABEL,
  DEFAULT_ICON,
  type ShortcutQuickCreateState,
} from "../hooks/useShortcutQuickCreate";

export interface ShortcutQuickCreateBodyProps {
  state: ShortcutQuickCreateState;
}

export function ShortcutQuickCreateBody({
  state,
}: ShortcutQuickCreateBodyProps) {
  const { activeTab, agent, isSaving } = state;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Agent overview row — no UUID, that lives on the route itself ── */}
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 shrink-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">
          Shortcut for agent
        </div>
        <div className="text-sm font-semibold text-foreground truncate mt-0.5 flex items-center gap-1.5">
          <Hammer className="h-3.5 w-3.5 text-primary shrink-0" />
          {agent?.name ?? (
            <SuspenseLoader
              size="xs"
              centered={false}
              message="Loading agent…"
            />
          )}
        </div>
        {agent?.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {agent.description}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {activeTab === "essentials" && <EssentialsTab state={state} />}
        {activeTab === "variables" && <VariablesTab state={state} />}
        {activeTab === "details" && <DetailsTab state={state} />}
        {activeTab === "advanced" && <AdvancedTab state={state} />}
        {activeTab === "link" && <LinkExistingTab state={state} />}
        {activeTab === "json" && <JsonTab state={state} />}
      </div>

      {isSaving && null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab: Essentials
// ───────────────────────────────────────────────────────────────────────────

function EssentialsTab({ state }: { state: ShortcutQuickCreateState }) {
  const {
    categories,
    categoryId,
    setCategoryId,
    iconName,
    setIconName,
    displayMode,
    setDisplayMode,
    showVariablePanel,
    setShowVariablePanel,
    variablesPanelStyle,
    setVariablesPanelStyle,
    isSaving,
  } = state;

  return (
    <ScrollArea className="h-full">
      <div className="px-4 py-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="qc-category" className="text-sm">
            Category
          </Label>
          <CategorySelect
            id="qc-category"
            categories={categories}
            value={categoryId ?? ""}
            onValueChange={setCategoryId}
            placeholder={
              categories.length === 0
                ? `Will create "${FALLBACK_CATEGORY_LABEL}"`
                : "Choose a category"
            }
            className="h-9"
            disabled={isSaving}
          />
          {categories.length === 0 && (
            <p className="text-[11px] text-muted-foreground leading-tight">
              First shortcut? We&apos;ll create a{" "}
              <span className="font-medium">{FALLBACK_CATEGORY_LABEL}</span>{" "}
              category for you automatically.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="qc-icon" className="text-sm">
            Icon
          </Label>
          <IconInputWithValidation
            id="qc-icon"
            value={iconName}
            onChange={(value) => setIconName(value || DEFAULT_ICON)}
            placeholder="e.g. Hammer"
            className="h-9 text-[16px]"
            disabled={isSaving}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="qc-display-mode" className="text-sm">
            Widget
          </Label>
          <Select
            value={displayMode}
            onValueChange={(v) => setDisplayMode(v as ResultDisplayMode)}
            disabled={isSaving}
          >
            <SelectTrigger id="qc-display-mode" className="h-9">
              <div className="flex items-center gap-2 min-w-0">
                <MonitorSmartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="How the result is shown" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {RESULT_DISPLAY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Where and how the agent&apos;s result appears when the shortcut
            runs.
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Label
                htmlFor="qc-show-vars"
                className="text-sm font-medium cursor-pointer inline-flex items-center gap-1.5"
              >
                <Variable className="h-3.5 w-3.5 text-muted-foreground" />
                Show variables panel
              </Label>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Let the user review or edit the agent&apos;s variables before
                the run kicks off.
              </p>
            </div>
            <Switch
              id="qc-show-vars"
              checked={showVariablePanel}
              onCheckedChange={setShowVariablePanel}
              disabled={isSaving}
            />
          </div>

          <div
            className={cn(
              "space-y-1.5 transition-opacity",
              showVariablePanel ? "opacity-100" : "opacity-50",
            )}
          >
            <Label htmlFor="qc-vars-style" className="text-sm">
              Variables style
            </Label>
            <Select
              value={variablesPanelStyle}
              onValueChange={(v) =>
                setVariablesPanelStyle(v as VariablesPanelStyle)
              }
              disabled={isSaving || !showVariablePanel}
            >
              <SelectTrigger id="qc-vars-style" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VARIABLE_PANEL_STYLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {opt.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground/90">
              Defaults applied:
            </span>{" "}
            name pulled from the agent, pinned to the agent&apos;s current
            version, auto-run, chat allowed, shown everywhere (
            <code className="text-[10px] bg-muted px-1 rounded">general</code>{" "}
            surface). Tweak anything in the remaining tabs.
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab: Variables
// ───────────────────────────────────────────────────────────────────────────

function VariablesTab({ state }: { state: ShortcutQuickCreateState }) {
  const {
    agentVariableDefs,
    variableDefsForScopeMapping,
    defaultVariables,
    setDefaultVariables,
    scopeMappings,
    setScopeMappings,
    isSaving,
  } = state;

  return (
    <ScrollArea className="h-full">
      <div className="px-4 py-3 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <Label className="text-sm font-semibold">Default values</Label>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Pre-fill what the agent&apos;s variables should start as when this
            shortcut runs. Leave blank to inherit the agent&apos;s own defaults.
          </p>
          <DefaultVariableValuesEditor
            variableDefinitions={agentVariableDefs}
            values={defaultVariables}
            onChange={setDefaultVariables}
            disabled={isSaving}
            compact
          />
        </div>

        {variableDefsForScopeMapping.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Scope mappings</Label>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Optionally route values from the surrounding app (like the
                user&apos;s selection or the current document) into specific
                agent variables.
              </p>
              <ScopeMappingEditor
                scopeMappings={scopeMappings}
                variableDefinitions={variableDefsForScopeMapping}
                onChange={(mappings) => setScopeMappings(mappings ?? {})}
                compact
              />
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab: Details
// ───────────────────────────────────────────────────────────────────────────

function DetailsTab({ state }: { state: ShortcutQuickCreateState }) {
  const {
    agent,
    agentId,
    label,
    setLabel,
    description,
    setDescription,
    agentVersionId,
    setAgentVersionId,
    useLatest,
    setUseLatest,
    isSaving,
  } = state;

  return (
    <ScrollArea className="h-full">
      <div className="px-4 py-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="qc-label" className="text-sm">
            Name override
          </Label>
          <Input
            id="qc-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={agent?.name ?? "What users will see"}
            className="h-9 text-[16px]"
            disabled={isSaving}
          />
          <p className="text-[11px] text-muted-foreground leading-tight">
            Defaults to the agent&apos;s name
            {agent?.name ? (
              <>
                {" "}
                (<span className="font-medium">{agent.name}</span>)
              </>
            ) : null}
            .
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="qc-description" className="text-sm">
            Description
          </Label>
          <Input
            id="qc-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={agent?.description ?? "Short subtitle under the label"}
            className="h-9 text-[16px]"
            disabled={isSaving}
          />
        </div>

        <Separator />

        <AgentVersionPicker
          agentId={agentId}
          agentVersionId={agentVersionId}
          useLatest={useLatest}
          onAgentVersionIdChange={setAgentVersionId}
          onUseLatestChange={setUseLatest}
          disabled={isSaving}
        />
      </div>
    </ScrollArea>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab: Advanced
// ───────────────────────────────────────────────────────────────────────────

function AdvancedTab({ state }: { state: ShortcutQuickCreateState }) {
  const {
    keyboardShortcut,
    setKeyboardShortcut,
    enabledFeatures,
    setEnabledFeatures,
    autoRun,
    setAutoRun,
    allowChat,
    setAllowChat,
    hideReasoning,
    setHideReasoning,
    hideToolResults,
    setHideToolResults,
    isSaving,
  } = state;

  return (
    <ScrollArea className="h-full">
      <div className="px-4 py-3 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="qc-keyboard" className="text-sm">
            Keyboard shortcut
          </Label>
          <Input
            id="qc-keyboard"
            value={keyboardShortcut}
            onChange={(e) => setKeyboardShortcut(e.target.value)}
            placeholder="e.g. cmd+shift+e"
            className="h-9 text-[16px] font-mono"
            disabled={isSaving}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Enabled surfaces</Label>
          <ShortcutContextsPicker
            value={enabledFeatures}
            onChange={(v) => setEnabledFeatures(v as ShortcutContext[])}
            disabled={isSaving}
          />
          <p className="text-[11px] text-muted-foreground leading-tight">
            At least one surface is required; we default to{" "}
            <code className="text-[10px] bg-muted px-1 rounded">general</code>.
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Execution behavior</Label>
          <div className="divide-y divide-border rounded-md border border-border overflow-hidden">
            <ToggleRow
              id="qc-auto-run"
              label="Auto-run"
              description="Execute immediately when the shortcut is launched."
              checked={autoRun}
              onCheckedChange={setAutoRun}
              disabled={isSaving}
            />
            <ToggleRow
              id="qc-allow-chat"
              label="Allow chat"
              description="Let the user keep talking to the agent after the first response."
              checked={allowChat}
              onCheckedChange={setAllowChat}
              disabled={isSaving}
            />
            <ToggleRow
              id="qc-hide-reasoning"
              label="Hide reasoning"
              description="Suppress the agent's internal thinking/reasoning blocks."
              checked={hideReasoning}
              onCheckedChange={setHideReasoning}
              disabled={isSaving}
            />
            <ToggleRow
              id="qc-hide-tool-results"
              label="Hide tool results"
              description="Suppress tool-call results from the output view."
              checked={hideToolResults}
              onCheckedChange={setHideToolResults}
              disabled={isSaving}
            />
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab: Link existing
// ───────────────────────────────────────────────────────────────────────────

function LinkExistingTab({ state }: { state: ShortcutQuickCreateState }) {
  const {
    filteredExisting,
    searchQuery,
    setSearchQuery,
    showOnlyUnlinked,
    setShowOnlyUnlinked,
    selectedExistingId,
    setSelectedExistingId,
    categories,
  } = state;

  return (
    <div className="px-4 py-3 flex flex-col h-full min-h-0 gap-2.5">
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search your shortcuts…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-[16px]"
        />
      </div>
      <div className="flex items-center justify-between shrink-0">
        <div className="text-xs text-muted-foreground">
          {filteredExisting.length} shortcut
          {filteredExisting.length !== 1 ? "s" : ""}
        </div>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="qc-unlinked"
            className="text-xs font-normal cursor-pointer"
          >
            Unlinked only
          </Label>
          <Switch
            id="qc-unlinked"
            checked={showOnlyUnlinked}
            onCheckedChange={setShowOnlyUnlinked}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {filteredExisting.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {showOnlyUnlinked
                ? "No unlinked shortcuts. Try disabling the filter, or create one from the Essentials tab."
                : "No shortcuts match your search."}
            </AlertDescription>
          </Alert>
        ) : (
          <ScrollArea className="h-full pr-2">
            <div className="space-y-2 pb-1">
              {filteredExisting.map((shortcut) => {
                const isSelected = selectedExistingId === shortcut.id;
                const cat = categories.find(
                  (c) => c.id === shortcut.categoryId,
                );
                return (
                  <button
                    key={shortcut.id}
                    type="button"
                    onClick={() => setSelectedExistingId(shortcut.id)}
                    className={cn(
                      "w-full text-left p-2.5 border rounded-md cursor-pointer transition-colors",
                      isSelected
                        ? "bg-primary/10 border-primary"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {shortcut.label}
                        </div>
                        {shortcut.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {shortcut.description}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {cat && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {cat.label}
                            </Badge>
                          )}
                          {shortcut.agentId && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              already linked
                            </Badge>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab: JSON
// ───────────────────────────────────────────────────────────────────────────

function JsonTab({ state }: { state: ShortcutQuickCreateState }) {
  const { jsonDraft, setJsonDraft, jsonError } = state;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-3 pb-2 shrink-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-sm font-semibold">Raw shortcut JSON</Label>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 pb-2">
        <Textarea
          value={jsonDraft}
          onChange={(e) => setJsonDraft(e.target.value)}
          spellCheck={false}
          className="h-full min-h-0 w-full resize-none font-mono text-[12px] leading-snug"
          placeholder='{ "label": "My shortcut", "categoryId": "…", "enabledFeatures": ["general"], … }'
        />
      </div>

      {jsonError && (
        <div className="px-4 pb-3 shrink-0">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{jsonError}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2 bg-background">
      <div className="min-w-0 flex-1">
        <Label
          htmlFor={id}
          className="text-xs font-medium cursor-pointer block truncate"
        >
          {label}
        </Label>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}
