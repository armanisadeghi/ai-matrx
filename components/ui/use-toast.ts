"use client"

/**
 * components/ui/use-toast.ts — 🚨 LEGACY OBJECT API. THE CANONICAL TOAST
 * MODULE IS `@/lib/toast`.
 *
 * ONE TOAST STACK (2026-10-08). This file used to own a second, Radix toast
 * stack (`components/ui/toaster.tsx`) mounted beside sonner in the bottom-right
 * corner: two stacks in one corner, each sliding in on its own clearance
 * variable, a limit of one (a second notice silently replaced the first), and
 * the owner seeing "toasts doing strange things, moving the UI around". The
 * Radix stack and its `<Toaster />` are gone; this module is now a thin adapter
 * that renders every `toast({ title, description, variant, action })` call
 * through `@/lib/toast` (sonner) — the same stack, clock, error capture and
 * Alchemy menu as every other toast.
 *
 * NO NEW CALL SITE MAY IMPORT THIS. Move a touched caller to `@/lib/toast`
 * (boy-scout rule) and delete this file when nothing imports it.
 */

import type * as React from "react"

import { toast as sonnerToast } from "@/lib/toast"

/** A button on the toast: `{ label, onClick }`, or a ready-made element. */
export type LegacyToastAction =
  | { label: React.ReactNode; onClick: () => void }
  | React.ReactElement

export interface LegacyToast {
  title?: React.ReactNode
  description?: React.ReactNode
  /** `destructive` → an error toast; `success` → a success toast; anything else → a plain one. */
  variant?: string | null
  action?: LegacyToastAction
  duration?: number
  className?: string
}

type ToastId = string | number

function show(props: LegacyToast, id?: ToastId): ToastId {
  const { title, description, variant, action, duration, className } = props
  // A toast with only a description reads that description as its message.
  const message = title ?? description ?? ""
  const options: Record<string, unknown> = {
    ...(id !== undefined ? { id } : {}),
    ...(title !== undefined && description !== undefined ? { description } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(className ? { className } : {}),
    ...(action ? { action } : {}),
  }
  if (variant === "destructive") return sonnerToast.error(message, options)
  if (variant === "success") return sonnerToast.success(message, options)
  return sonnerToast(message, options)
}

function toast(props: LegacyToast) {
  const id = show(props)
  return {
    id: String(id),
    dismiss: () => {
      sonnerToast.dismiss(id)
    },
    update: (next: LegacyToast) => {
      show({ ...props, ...next }, id)
    },
  }
}

function dismiss(toastId?: string) {
  sonnerToast.dismiss(toastId)
}

function useToast() {
  return { toast, dismiss }
}

export { useToast, toast }
