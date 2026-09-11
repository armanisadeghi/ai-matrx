"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";
import { runShellCommand } from "../../runtime/agentTools";
import { SidePanelAction, SidePanelHeader } from "../SidePanelChrome";
import { HOVER_ROW, ROW_HEIGHT } from "../../styles/tokens";
import { extractErrorMessage } from "@/utils/errors";
import { selectExplorerRootOverride } from "../../redux/codeWorkspaceSlice";
import { useAppSelector } from "@/lib/redux/hooks";

interface RunPanelProps {
  className?: string;
}

type ScriptSource = "package.json" | "pyproject.toml" | "Makefile";

interface Script {
  source: ScriptSource;
  name: string;
  command: string;
}

export const RunPanel: React.FC<RunPanelProps> = ({ className }) => {
  const { filesystem, workspaceId } = useCodeWorkspace();
  const explorerRootOverride = useAppSelector(selectExplorerRootOverride);
  const root = explorerRootOverride ?? filesystem.rootPath;

  const [scripts, setScripts] = useState<Script[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningName, setRunningName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const found: Script[] = [];

      const tryRead = async (path: string): Promise<string | null> => {
        try {
          return await filesystem.readFile(path);
        } catch {
          return null;
        }
      };

      // package.json scripts
      const pkgJson = await tryRead(
        root === "/" ? "/package.json" : `${root}/package.json`,
      );
      if (pkgJson) {
        try {
          const parsed = JSON.parse(pkgJson) as {
            scripts?: Record<string, string>;
          };
          for (const [name, command] of Object.entries(parsed.scripts ?? {})) {
            found.push({ source: "package.json", name, command });
          }
        } catch {
          /* ignore malformed package.json */
        }
      }

      // Python project scripts via [project.scripts]
      const pyproject = await tryRead(
        root === "/" ? "/pyproject.toml" : `${root}/pyproject.toml`,
      );
      if (pyproject) {
        for (const { name, module } of parsePyprojectScripts(pyproject)) {
          found.push({
            source: "pyproject.toml",
            name,
            command: `python -m ${module}`,
          });
        }
      }

      // Makefile targets
      const makefile = await tryRead(
        root === "/" ? "/Makefile" : `${root}/Makefile`,
      );
      if (makefile) {
        for (const name of parseMakefileTargets(makefile)) {
          found.push({
            source: "Makefile",
            name,
            command: `make ${name}`,
          });
        }
      }

      setScripts(found);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filesystem]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (script: Script) => {
      setRunningName(script.name);
      setError(null);
      try {
        const actualCommand =
          script.source === "package.json"
            ? `npm run ${shellQuote(script.name)}`
            : script.command;
        await runShellCommand({
          command: actualCommand,
          cwd: root,
          workspaceId,
        });
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setRunningName(null);
      }
    },
    [root, workspaceId],
  );

  const grouped = React.useMemo(() => {
    const map = new Map<ScriptSource, Script[]>();
    for (const s of scripts ?? []) {
      if (!map.has(s.source)) map.set(s.source, []);
      map.get(s.source)!.push(s);
    }
    return Array.from(map.entries());
  }, [scripts]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <SidePanelHeader
        title="Run"
        subtitle={filesystem.label}
        actions={
          <SidePanelAction
            icon={loading ? Loader2 : RefreshCw}
            label="Rescan scripts"
            onClick={() => void load()}
          />
        }
      />
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-2 mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
        {scripts !== null && scripts.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center text-neutral-500 dark:text-neutral-400">
            <Play size={28} strokeWidth={1.2} />
            <p className="text-xs">
              No runnable scripts found. Run panel looks for{" "}
              <code className="font-mono">package.json</code>,{" "}
              <code className="font-mono">pyproject.toml</code>, and{" "}
              <code className="font-mono">Makefile</code> at the workspace root.
            </p>
          </div>
        )}
        {grouped.map(([source, items]) => (
          <div key={source} className="pb-2">
            <div className="sticky top-0 z-[1] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
              {source}
            </div>
            {items.map((s) => {
              const running = runningName === s.name;
              return (
                <button
                  key={`${source}:${s.name}`}
                  type="button"
                  onClick={() => void run(s)}
                  disabled={running}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 text-left text-[12px] disabled:opacity-60",
                    ROW_HEIGHT,
                    HOVER_ROW,
                  )}
                >
                  {running ? (
                    <Loader2 size={12} className="animate-spin text-blue-500" />
                  ) : (
                    <Play size={12} className="text-neutral-500" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="shrink-0 truncate font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                    {s.command}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

function parsePyprojectScripts(content: string): Array<{ name: string; module: string }> {
  const result: Array<{ name: string; module: string }> = [];
  const lines = content.split("\n");
  let inScriptsSection = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inScriptsSection =
        line === "[project.scripts]" || line === "[tool.poetry.scripts]";
      continue;
    }
    if (!inScriptsSection) continue;
    const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*["']([^:"']+)/);
    if (match) result.push({ name: match[1], module: match[2] });
  }
  return result;
}

function parseMakefileTargets(content: string): string[] {
  const targets: string[] = [];
  for (const raw of content.split("\n")) {
    if (raw.startsWith("\t")) continue;
    if (raw.startsWith("#") || !raw.trim()) continue;
    const match = raw.match(/^([A-Za-z0-9_.-]+)\s*:(?!=)/);
    if (match && match[1] !== ".PHONY") targets.push(match[1]);
  }
  return Array.from(new Set(targets));
}

function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}
