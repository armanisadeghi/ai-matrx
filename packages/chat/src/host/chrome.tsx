"use client";

/**
 * host/chrome — the seam package code uses for the host's chrome (P22).
 *
 * Same names and shapes the call sites used when they imported the app shell
 * directly, so switching a call site is an import-path change. Components and
 * hooks read the chrome port from <ChatProvider>'s context (it exists during
 * the server render, where the module global is never written); the plain
 * functions run on the client only (handlers, effects) and read the configured
 * host.
 */

import type {
  ChatChromeStyles,
  ChatHeaderPortalProps,
  ChatHeaderSlotProps,
  ChatIconButtonProps,
  ChatNavItemTooltipProps,
  ChatPhonePageActions,
  ChatRouteHeaderProps,
} from "./contract";
import { getChatHost } from "./configure";
import { useChatHost } from "./react";

export function PageHeaderPortal(props: ChatHeaderPortalProps) {
  const { HeaderCenter } = useChatHost().chrome;
  return <HeaderCenter {...props} />;
}

export function PageHeaderRightPortal(props: { children?: ChatHeaderSlotProps["children"] }) {
  const { HeaderRight } = useChatHost().chrome;
  return <HeaderRight {...props} />;
}

export function HeaderActionsSlot(props: ChatHeaderSlotProps) {
  const { HeaderActionsSlot: Slot } = useChatHost().chrome;
  return <Slot {...props} />;
}

export function RouteHeader(props: ChatRouteHeaderProps) {
  const { RouteHeader: Header } = useChatHost().chrome;
  return <Header {...props} />;
}

export function HeaderControlSet(props: { isAuthenticated: boolean }) {
  const { HeaderControlSet: Controls } = useChatHost().chrome;
  return <Controls {...props} />;
}

export function ShellChromeMode(props: { mode: "canvas" }) {
  const { CanvasChromeMode } = useChatHost().chrome;
  return <CanvasChromeMode {...props} />;
}

export function IconButton(props: ChatIconButtonProps) {
  const { IconButton: Button } = useChatHost().chrome;
  return <Button {...props} />;
}

export function NavTooltipProvider(props: { children?: ChatHeaderSlotProps["children"] }) {
  const { NavTooltipProvider: Provider } = useChatHost().chrome;
  return <Provider {...props} />;
}

export function NavItemTooltip(props: ChatNavItemTooltipProps) {
  const { NavItemTooltip: Tooltip } = useChatHost().chrome;
  return <Tooltip {...props} />;
}

export function usePhonePageActions(): ChatPhonePageActions {
  return useChatHost().chrome.usePhonePageActions();
}

export function useShellCanvasFullScreen(fullScreen: boolean): void {
  useChatHost().chrome.useCanvasFullScreen(fullScreen);
}

/** The shell's visual tokens for header navs and route menus. */
export function useChromeStyles(): ChatChromeStyles {
  return useChatHost().chrome.styles;
}

export function openShellMobileMenu(): void {
  getChatHost().chrome.openMobileMenu();
}

export function closeShellMobileMenu(): void {
  getChatHost().chrome.closeMobileMenu();
}

export function pushFullScreenLayer(exit: () => void): () => void {
  return getChatHost().chrome.pushFullScreenLayer(exit);
}
