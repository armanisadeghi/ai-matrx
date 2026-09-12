// components/submit-button.tsx

"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { type ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type Props = ComponentProps<typeof Button> & {
  pendingText?: string;
};

export function SubmitButton({
  children,
  pendingText = "Submitting...",
  className,
  disabled,
  ...props
}: Props) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className={cn("relative min-h-11", className)}
      disabled={disabled || pending}
      aria-busy={pending}
      {...props}
    >
      <span
        data-slot="submit-button-content"
        className={cn("contents", pending && "invisible")}
        aria-hidden={pending || undefined}
      >
        {children}
      </span>
      {pending && (
        <>
          <span
            data-slot="submit-button-spinner"
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <Loader2 className="size-4 animate-spin" />
          </span>
          <span role="status" className="sr-only">
            {pendingText}
          </span>
        </>
      )}
    </Button>
  );
}
