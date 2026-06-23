"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Heart,
  Loader2,
  CheckCircle2,
  XCircle,
  Server,
  Key,
  Pencil,
  X,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { SERVER_PRESETS, CUSTOM_URL_VALUE } from "./servers";
import type { UseServerConfigReturn, HealthStatus } from "./useServerConfig";

// ─── Health indicator ──────────────────────────────────────────────────────

function HealthIndicator({
  status,
  detail,
}: {
  status: HealthStatus;
  detail: string | null;
}) {
  if (status === "idle") return null;
  if (status === "checking") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking…
      </span>
    );
  }
  if (status === "ok") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 flex-shrink-0">
        <CheckCircle2 className="h-3 w-3" />
        {detail ?? "Healthy"}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1 text-[10px] text-destructive flex-shrink-0 cursor-default">
          <XCircle className="h-3 w-3" />
          Unreachable
        </span>
      </TooltipTrigger>
      {detail && (
        <TooltipContent className="text-xs max-w-xs">{detail}</TooltipContent>
      )}
    </Tooltip>
  );
}

// ─── Auth token sub-widget ─────────────────────────────────────────────────

function AuthTokenWidget({ config }: { config: UseServerConfigReturn }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState("");

  useEffect(() => {
    if (config.authToken) {
      setEditing(false);
      setTemp(config.authToken);
    } else {
      setEditing(true);
      setTemp("");
    }
  }, [config.authToken]);

  const save = () => {
    if (!temp.trim()) return;
    config.setAuthToken(temp.trim());
    setEditing(false);
    toast.success("Token saved", {
      description: "Stored in localStorage for all matrx-ai test pages.",
    });
  };

  const clear = () => {
    config.clearAuthToken();
    setTemp("");
    setEditing(true);
    toast.info("Token cleared");
  };

  if (!editing && config.authToken) {
    return (
      <div className="flex items-center gap-1 flex-shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Key className="h-3.5 w-3.5 text-green-600 dark:text-green-400 cursor-default" />
          </TooltipTrigger>
          <TooltipContent className="font-mono text-xs break-all max-w-xs">
            {config.authToken.length > 40
              ? config.authToken.slice(0, 40) + "…"
              : config.authToken}
          </TooltipContent>
        </Tooltip>
        <span className="text-[10px] text-muted-foreground">Token set</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTemp(config.authToken);
                setEditing(true);
              }}
              className="h-5 w-5 p-0"
            >
              <Pencil className="h-2.5 w-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Edit token</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              onClick={clear}
              className="h-5 w-5 p-0 text-destructive hover:text-destructive"
            >
              <X className="h-2.5 w-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Clear token</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-1 min-w-[160px] max-w-[360px]">
      <Input
        type="text"
        value={temp}
        onChange={(e) => setTemp(e.target.value)}
        placeholder="Bearer token (optional)"
        className="h-7 text-xs font-mono flex-1 min-w-0"
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape" && config.authToken) {
            setTemp(config.authToken);
            setEditing(false);
          }
        }}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="default"
            onClick={save}
            disabled={!temp.trim()}
            className="h-7 w-7 p-0 flex-shrink-0"
          >
            <Check className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Save token</TooltipContent>
      </Tooltip>
      {config.authToken && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTemp(config.authToken);
                setEditing(false);
              }}
              className="h-7 w-7 p-0 flex-shrink-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Cancel</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ─── ServerBar ─────────────────────────────────────────────────────────────

interface ServerBarProps {
  config: UseServerConfigReturn;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  showAuth?: boolean;
}

/**
 * Shared header bar for all matrx-ai test pages.
 *
 * Contains:
 *  • Server preset dropdown (localhost:8000, :8001, three production URLs)
 *  • Custom URL input (shown when "Custom URL…" is selected)
 *  • Health check button → GET {serverUrl}/health
 *  • Auth token widget (stored in localStorage, shared across pages)
 *  • Optional title slot (left) and actions slot (right)
 */
export function ServerBar({
  config,
  title,
  actions,
  showAuth = true,
}: ServerBarProps) {
  const [customUrl, setCustomUrl] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Sync custom input when external serverUrl is not a preset
  useEffect(() => {
    const preset = SERVER_PRESETS.some((p) => p.url === config.serverUrl);
    if (!preset) {
      setCustomUrl(config.serverUrl);
      setShowCustomInput(true);
    } else {
      setShowCustomInput(false);
    }
  }, [config.serverUrl]);

  const selectValue = SERVER_PRESETS.some((p) => p.url === config.serverUrl)
    ? config.serverUrl
    : CUSTOM_URL_VALUE;

  const handleSelectChange = (value: string) => {
    if (value === CUSTOM_URL_VALUE) {
      setShowCustomInput(true);
      // Don't change serverUrl yet — wait for user to type
    } else {
      setShowCustomInput(false);
      config.setServerUrl(value);
    }
  };

  const applyCustomUrl = () => {
    const trimmed = customUrl.trim();
    if (trimmed) config.setServerUrl(trimmed);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 border-b">
        {title && <div className="flex-shrink-0">{title}</div>}

        {/* Server dropdown */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Server className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <Select value={selectValue} onValueChange={handleSelectChange}>
            <SelectTrigger className="h-7 text-xs w-48 font-mono">
              <SelectValue placeholder="Select server…" />
            </SelectTrigger>
            <SelectContent>
              {SERVER_PRESETS.map((p) => (
                <SelectItem
                  key={p.url}
                  value={p.url}
                  className="text-xs font-mono"
                >
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem
                value={CUSTOM_URL_VALUE}
                className="text-xs italic text-muted-foreground"
              >
                Custom URL…
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Custom URL input */}
        {showCustomInput && (
          <Input
            type="url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            onBlur={applyCustomUrl}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyCustomUrl();
            }}
            placeholder="https://…"
            className="h-7 text-xs w-56 font-mono flex-shrink-0"
          />
        )}

        {/* Health check */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={config.checkHealth}
              disabled={config.healthStatus === "checking" || !config.serverUrl}
              className="h-7 text-xs px-2.5 gap-1.5 flex-shrink-0"
            >
              {config.healthStatus === "checking" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Heart className="h-3 w-3" />
              )}
              Health
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            GET {config.serverUrl}/health
          </TooltipContent>
        </Tooltip>

        <HealthIndicator
          status={config.healthStatus}
          detail={config.healthDetail}
        />

        {/* Separator */}
        {showAuth && <div className="h-4 w-px bg-border flex-shrink-0" />}

        {/* Auth token */}
        {showAuth && <AuthTokenWidget config={config} />}

        {/* Right-side actions */}
        {actions && (
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
