"use client"

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToast } from "@/components/ui/use-toast"
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            {props.variant === "destructive" && (
              <ErrorAlchemyMenu
                label={typeof title === "string" ? title : "Error"}
                input={{
                  title: typeof title === "string" && typeof description === "string" ? title : undefined,
                  message:
                    typeof description === "string" && description.trim()
                      ? description
                      : typeof title === "string" && title.trim()
                        ? title
                        : "An error notification is shown.",
                  source: "toast",
                }}
              />
            )}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
