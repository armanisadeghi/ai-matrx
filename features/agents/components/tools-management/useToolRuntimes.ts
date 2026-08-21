"use client";

import { useEffect, useState } from "react";
import { getAllExecutorBindings } from "@/features/tool-registry/shared/toolRuntimes.service";

/**
 * toolId → active executor names, for the "runs on" badges in the tool and
 * bundle pickers. `null` while loading (render no badge yet — never a wrong
 * one); after load, a lookup miss means "no bindings" = runs server-side by
 * default. The service caches the one small tool.binding read for the session;
 * a failed read leaves this at `null` (no badges) — never a broken picker.
 */
export function useToolRuntimes(): Map<string, string[]> | null {
  const [runtimes, setRuntimes] = useState<Map<string, string[]> | null>(null);

  useEffect(() => {
    let active = true;
    getAllExecutorBindings()
      .then((map) => {
        if (active) setRuntimes(map);
      })
      .catch((err) => {
        // Fail silent to "no badge" — labeling must never break the picker.
        console.warn(
          "Tool runtime badges unavailable (tool.binding read failed)",
          err,
        );
      });
    return () => {
      active = false;
    };
  }, []);

  return runtimes;
}
