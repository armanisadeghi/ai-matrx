"use client";

import { useRouter } from "next/navigation";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { activateToolsGridTile } from "@/features/window-panels/tools-grid/activateToolsGridTile";
import {
  NAV_WINDOW_PANEL_ACTIONS,
  type ShellNavPanelActionId,
} from "../constants/nav-window-panels";

export type ShellNavPanelActionHandlers = Record<
  ShellNavPanelActionId,
  () => void
>;

export function useNavPanelActions(): ShellNavPanelActionHandlers {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();

  const ctx = {
    dispatch,
    getState: store.getState,
    router,
  };

  const handlers = {} as ShellNavPanelActionHandlers;
  for (const [id, def] of Object.entries(NAV_WINDOW_PANEL_ACTIONS)) {
    handlers[id as ShellNavPanelActionId] = () => {
      activateToolsGridTile(def.tileId, ctx);
    };
  }
  return handlers;
}
