// components/submit-button.tsx

"use client";

import { Button } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { type ComponentProps, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";

const subscribeNever = () => () => undefined;
/** False in server HTML and until React has hydrated the page; true after. */
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

type Props = ComponentProps<typeof Button> & {
  pendingText?: string;
  /**
   * The form's action runs in the browser (a client function), so a press before the page's script has
   * loaded would do nothing. The button says it is getting ready and stays disabled until then — never a
   * silent no-op (lane F12).
   */
  needsScript?: boolean;
};

export function SubmitButton({
  children,
  pendingText = "Submitting...",
  className,
  disabled,
  needsScript = false,
  ...props
}: Props) {
  const { pending } = useFormStatus();
  const hydrated = useHydrated();
  const preparing = needsScript && !hydrated;

  return (
    <Button
      type="submit"
      className={cn("relative min-h-11", className)}
      disabled={disabled || pending || preparing}
      aria-busy={pending || preparing}
      data-preparing={preparing || undefined}
      {...props}
    >
      <span
        data-slot="submit-button-content"
        className={cn("contents", pending && "invisible")}
        aria-hidden={pending || undefined}
      >
        {preparing ? "Getting ready…" : children}
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
