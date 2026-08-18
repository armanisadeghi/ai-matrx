"use client";

/**
 * The workspace. Inputs on the left, the answer and its reasoning on the right,
 * every knob one tab away, and the whole thing recomputing on keystroke.
 *
 * The engine is pure, so there is no loading state and nothing to wait for —
 * which is the point of keeping the algorithm free of IO.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { Download, RotateCcw, Save, Upload } from "lucide-react";

import { evaluateLink } from "../engine";
import {
  BUILT_IN_CONFIGS,
  hasLocalEdits,
  isBuiltIn,
  listConfigs,
  parseConfig,
  readActiveConfigId,
  resetConfig,
  saveConfig,
  writeActiveConfigId,
} from "../storage";
import { seedFor } from "../configs/seeds";
import type {
  EvaluationInput,
  EvaluationResult,
  LinkValuationConfig,
} from "../types";
import { CandidateForm } from "./CandidateForm";
import { ConfigRecovery } from "./ConfigRecovery";
import { ResultPanel } from "./ResultPanel";
import { TuningPanel } from "./TuningPanel";

export function LinkValuationWorkspace() {
  const [configs, setConfigs] = useState<LinkValuationConfig[]>([
    ...BUILT_IN_CONFIGS,
  ]);
  const [activeId, setActiveId] = useState<string>(
    BUILT_IN_CONFIGS[0]?.id ?? "matrx-v1",
  );
  const [input, setInput] = useState<EvaluationInput>(() =>
    seedFor(BUILT_IN_CONFIGS[0]?.id ?? ""),
  );
  const [importText, setImportText] = useState("");
  const [dirty, setDirty] = useState(false);

  // Hydrate from storage after mount — server and client must agree on the
  // first paint, so the stored config is applied in an effect, not during render.
  useEffect(() => {
    const storedId = readActiveConfigId();
    setConfigs(listConfigs());
    setActiveId(storedId);
    setInput(seedFor(storedId));
  }, []);

  const config =
    configs.find((entry) => entry.id === activeId) ?? BUILT_IN_CONFIGS[0];
  if (!config) return null;

  // LOUD RECOVERY. Validation runs at import, but a config can still reach the
  // engine broken — hand-edited storage, a blob written by an older schema, a
  // field a future version adds. Without this, one bad object saved to
  // localStorage throws on every render and the page stays dead until someone
  // clears storage by hand. Recovering silently would be just as bad: a scoring
  // engine quietly running a config you did not choose is worse than an error.
  let result: EvaluationResult;
  try {
    result = evaluateLink(config, input);
  } catch (error) {
    return (
      <ConfigRecovery
        configName={config.name}
        reason={(error as Error).message}
        onRecover={() => {
          // Inlined deliberately: this render returns here, so the helpers
          // declared further down are still in their temporal dead zone and
          // calling one would throw the moment the button is pressed.
          resetConfig(config.id);
          const fallback = BUILT_IN_CONFIGS[0];
          if (!fallback) return;
          // Re-read storage rather than resetting to the shipped set: discarding
          // ONE unrunnable config must never take somebody's other tunings with
          // it. They would still be in localStorage but gone from the picker,
          // and the next Save would overwrite them for good.
          setConfigs(listConfigs());
          setActiveId(fallback.id);
          writeActiveConfigId(fallback.id);
          setInput(seedFor(fallback.id));
          setDirty(false);
        }}
      />
    );
  }

  const updateConfig = (next: LinkValuationConfig) => {
    setConfigs(configs.map((entry) => (entry.id === next.id ? next : entry)));
    setDirty(true);
  };

  const selectConfig = (id: string) => {
    setActiveId(id);
    writeActiveConfigId(id);
    setDirty(false);
    // Each config has its own signals, so its own worked example travels with it.
    // Carrying the previous config's inputs across would half-feed the new model
    // and show a score nobody could check.
    setInput(seedFor(id));
  };

  const persist = () => {
    saveConfig(config);
    setDirty(false);
    toast.success(`Saved "${config.name}"`, {
      description:
        "Kept in this browser. Export the JSON to share or commit it.",
    });
  };

  const restore = () => {
    const restored = resetConfig(config.id);
    if (!restored) return;
    setConfigs(
      configs.map((entry) => (entry.id === restored.id ? restored : entry)),
    );
    setDirty(false);
    toast.success(`Reset "${restored.name}" to the shipped version`);
  };

  const exportJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    toast.success("Config JSON copied to the clipboard");
  };

  const importJson = () => {
    const parsed = parseConfig(importText);
    if ("error" in parsed) {
      toast.error("Could not import that config", {
        description: parsed.error,
      });
      return;
    }
    const next = parsed.config;
    setConfigs([...configs.filter((entry) => entry.id !== next.id), next]);
    saveConfig(next);
    selectConfig(next.id);
    setImportText("");
    toast.success(`Imported "${next.name}"`);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Select value={activeId} onValueChange={selectConfig}>
          <SelectTrigger className="h-8 w-64 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {configs.map((entry) => (
              <SelectItem key={entry.id} value={entry.id} className="text-xs">
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {dirty ? (
          <Badge variant="outline" className="text-[11px] font-normal">
            Unsaved changes
          </Badge>
        ) : hasLocalEdits(config.id) ? (
          <Badge variant="secondary" className="text-[11px] font-normal">
            Locally tuned
          </Badge>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={persist}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={exportJson}
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            Export
          </Button>
          {isBuiltIn(config.id) ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={restore}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      <p className="border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        {config.description}
      </p>

      <Tabs defaultValue="evaluate" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 w-fit">
          <TabsTrigger value="evaluate" className="text-xs">
            Evaluate
          </TabsTrigger>
          <TabsTrigger value="tune" className="text-xs">
            Tune the algorithm
          </TabsTrigger>
          <TabsTrigger value="json" className="text-xs">
            Config JSON
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="evaluate"
          className="min-h-0 flex-1 overflow-auto p-3"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <CandidateForm config={config} input={input} onChange={setInput} />
            <ResultPanel config={config} result={result} />
          </div>
        </TabsContent>

        <TabsContent value="tune" className="min-h-0 flex-1 overflow-auto p-3">
          <div className="grid gap-4 lg:grid-cols-2">
            <TuningPanel config={config} onChange={updateConfig} />
            <div className="lg:sticky lg:top-0 lg:h-fit">
              <ResultPanel config={config} result={result} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="json" className="min-h-0 flex-1 overflow-auto p-3">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-foreground">
                Current config
              </p>
              <Textarea
                readOnly
                value={JSON.stringify(config, null, 2)}
                className="h-[60vh] font-mono text-[11px]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-foreground">
                Import a config
              </p>
              <Textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="Paste a config JSON here"
                className="h-[60vh] font-mono text-[11px]"
              />
              <Button
                size="sm"
                className="h-8 w-fit text-xs"
                onClick={importJson}
              >
                <Upload className="mr-1 h-3.5 w-3.5" />
                Import
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
