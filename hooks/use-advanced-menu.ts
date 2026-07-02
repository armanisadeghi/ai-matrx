"use client";
import { useState, useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import { MenuItem } from "@/components/official/AdvancedMenu";

export interface UseAdvancedMenuOptions {
  onOpen?: () => void;
  onClose?: () => void;
  onActionStart?: (key: string) => void;
  onActionSuccess?: (key: string) => void;
  onActionError?: (key: string, error: unknown) => void;
}

export function useAdvancedMenu(options?: UseAdvancedMenuOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);

  const open = useCallback(
    (element?: HTMLElement) => {
      setIsOpen(true);
      if (element) {
        setAnchorElement(element);
      }
      options?.onOpen?.();
    },
    [options]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setAnchorElement(null);
    options?.onClose?.();
  }, [options]);

  const toggle = useCallback(
    (element?: HTMLElement) => {
      if (isOpen) {
        close();
      } else {
        open(element);
      }
    },
    [isOpen, open, close]
  );

  return {
    isOpen,
    open,
    close,
    toggle,
    anchorElement,
    menuProps: {
      isOpen,
      onClose: close,
      onActionStart: options?.onActionStart,
      onActionSuccess: options?.onActionSuccess,
      onActionError: options?.onActionError,
    },
  };
}

// Helper to create menu items quickly
export function createMenuItem(
  key: string,
  label: string,
  icon: LucideIcon,
  action: () => void | Promise<void>,
  options?: Partial<Omit<MenuItem, "key" | "label" | "icon" | "action">>
): MenuItem {
  return {
    key,
    label,
    icon,
    action,
    ...options,
  };
}

