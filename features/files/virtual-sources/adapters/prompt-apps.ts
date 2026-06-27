/**
 * features/files/virtual-sources/adapters/prompt-apps.ts
 *
 * Prompt Apps virtual source. Mirror of the Agent Apps adapter against the
 * `prompt_apps` table.
 */

"use client";

import { Star } from "lucide-react";
import { registerVirtualSource } from "@/features/files/virtual-sources/registry";
import { makeCodeInlinePreview } from "./CodeInlinePreview";
import type {
  ListArgs,
  RenameArgs,
  WriteArgs,
  VirtualContent,
  VirtualNode,
  VirtualSourceAdapter,
} from "@/features/files/virtual-sources/types";

const TAB_ID_PREFIX = "prompt-app:";

const promptAppsAdapter: VirtualSourceAdapter = {
  sourceId: "prompt_apps",
  label: "Prompt Apps",
  icon: Star,
  capabilities: {
    list: true,
    read: true,
    write: true,
    rename: true,
    delete: true,
    move: false,
    folders: false,
    binary: false,
    versions: false,
    multiField: false,
  },
  dnd: { acceptsOwn: false },
  pathPrefix: "/Prompt Apps",

  makeTabId(id) {
    return `${TAB_ID_PREFIX}${id}`;
  },
  parseTabId(tabId) {
    if (!tabId.startsWith(TAB_ID_PREFIX)) return null;
    const id = tabId.slice(TAB_ID_PREFIX.length);
    return id ? { id } : null;
  },

  // NOTE: The `prompt_apps` table has been moved to the graveyard schema and is no longer
  // reachable via PostgREST. All operations fail-soft with empty results or clear errors.

  async list(_supabase, _userId, _args: ListArgs): Promise<VirtualNode[]> {
    console.warn("[files/virtual-sources/adapters/prompt-apps] list: prompt_apps table is in graveyard schema — returning empty");
    return [];
  },

  async read(_supabase, _userId, id): Promise<VirtualContent> {
    console.warn("[files/virtual-sources/adapters/prompt-apps] read: prompt_apps table is in graveyard schema");
    throw new Error(`Prompt App ${id} is not available — prompt_apps has been decommissioned`);
  },

  async write(_supabase, _userId, args: WriteArgs) {
    console.warn("[files/virtual-sources/adapters/prompt-apps] write: prompt_apps table is in graveyard schema");
    throw new Error(`Cannot save Prompt App ${args.id} — prompt_apps has been decommissioned`);
  },

  async rename(_supabase, _userId, args: RenameArgs) {
    console.warn("[files/virtual-sources/adapters/prompt-apps] rename: prompt_apps table is in graveyard schema");
    throw new Error(`Cannot rename Prompt App ${args.id} — prompt_apps has been decommissioned`);
  },

  async delete(_supabase, _userId, id) {
    console.warn("[files/virtual-sources/adapters/prompt-apps] delete: prompt_apps table is in graveyard schema");
    throw new Error(`Cannot delete Prompt App ${id} — prompt_apps has been decommissioned`);
  },

  inlinePreview: makeCodeInlinePreview("prompt_apps"),

  openInRoute(node) {
    return `/code?tab=${encodeURIComponent(`${TAB_ID_PREFIX}${node.id}`)}`;
  },
};

registerVirtualSource(promptAppsAdapter);
