"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Box, AlertTriangle, ArrowRight, Terminal } from "lucide-react";
import type { SandboxInstance } from "@/types/sandbox";
import { ACTIVE_SANDBOX_STATUSES } from "@/types/sandbox";

interface SandboxSummary {
  activeCount: number;
  expiringSoonCount: number;
  loading: boolean;
  error: string | null;
}

function getTimeRemainingMs(expiresAt: string | null): number {
  if (!expiresAt) return Infinity;
  return new Date(expiresAt).getTime() - Date.now();
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export function useSandboxSummary(): SandboxSummary {
  const [summary, setSummary] = useState<SandboxSummary>({
    activeCount: 0,
    expiringSoonCount: 0,
    loading: true,
    error: null,
  });

  const fetchSummary = useCallback(async () => {
    try {
      const resp = await fetch("/api/sandbox?limit=50");
      if (!resp.ok) {
        setSummary((prev) => ({
          ...prev,
          loading: false,
          error: "unavailable",
        }));
        return;
      }

      const data = await resp.json();
      const instances: SandboxInstance[] = data.instances || [];

      const active = instances.filter((i) =>
        ACTIVE_SANDBOX_STATUSES.includes(i.status),
      );

      const expiringSoon = active.filter(
        (i) => getTimeRemainingMs(i.expires_at) < THIRTY_MINUTES_MS,
      );

      setSummary({
        activeCount: active.length,
        expiringSoonCount: expiringSoon.length,
        loading: false,
        error: null,
      });
    } catch {
      setSummary((prev) => ({ ...prev, loading: false, error: "unavailable" }));
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return summary;
}

interface SandboxWidgetProps {
  summary: SandboxSummary;
}

export function SandboxWidget({ summary }: SandboxWidgetProps) {
  // Don't render if sandbox API isn't available (orchestrator not running)
  if (summary.error) return null;

  // Don't render loading skeleton for a small widget — just wait
  if (summary.loading) return null;

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-md font-semibold">Sandboxes</h2>
        <Link
          href="/sandbox"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1"
        >
          Manage <ArrowRight size={12} />
        </Link>
      </div>
      <div className="rounded-xl bg-white dark:bg-zinc-800 shadow-md dark:shadow-zinc-800/20">
        {/* Active count */}
        <div className="flex items-center p-4 border-b border-gray-100 dark:border-zinc-700">
          <div className="p-2 rounded-lg mr-4 bg-emerald-100 dark:bg-emerald-900/40">
            <Terminal
              size={18}
              className="text-emerald-600 dark:text-emerald-400"
            />
          </div>
          <div className="flex-1">
            <h3 className="text-sm text-gray-500 dark:text-gray-400">Active</h3>
            <span className="text-xl font-semibold">{summary.activeCount}</span>
          </div>
          {summary.activeCount === 0 && (
            <Link
              href="/sandbox"
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-indigo-500 hover:bg-indigo-600 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700 transition-colors"
            >
              Launch
            </Link>
          )}
        </div>

        {/* Expiring soon */}
        {summary.expiringSoonCount > 0 && (
          <div className="flex items-center p-4">
            <div className="p-2 rounded-lg mr-4 bg-amber-100 dark:bg-amber-900/40">
              <AlertTriangle
                size={18}
                className="text-amber-600 dark:text-amber-400"
              />
            </div>
            <div className="flex-1">
              <h3 className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                Expiring Soon
              </h3>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {summary.expiringSoonCount} sandbox
                {summary.expiringSoonCount !== 1 ? "es" : ""} within 30 min
              </span>
            </div>
          </div>
        )}

        {/* All good state */}
        {summary.activeCount > 0 && summary.expiringSoonCount === 0 && (
          <div className="flex items-center p-4">
            <div className="p-2 rounded-lg mr-4 bg-gray-100 dark:bg-zinc-700">
              <Box size={18} className="text-gray-500 dark:text-gray-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm text-gray-500 dark:text-gray-400">
                All sandboxes running normally
              </h3>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
