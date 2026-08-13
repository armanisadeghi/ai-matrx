import { Loader2 } from "lucide-react";

interface SuspenseLoaderProps {
  /** Size of the spinner */
  size?: "xs" | "sm" | "md" | "lg";
  /** Whether to center in container */
  centered?: boolean;
  /** Context shown beside the spinner and announced as a live status. */
  message?: string;
  /** Custom className */
  className?: string;
}

const sizeClasses = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

/**
 * Minimal loading component for Suspense boundaries
 * Adaptable to any context with simple spinner animation
 */
export default function SuspenseLoader({
  size = "sm",
  centered = true,
  message,
  className = "",
}: SuspenseLoaderProps) {
  const spinner = (
    <Loader2
      className={`${sizeClasses[size]} animate-spin text-muted-foreground opacity-50 ${className}`}
      aria-hidden={message ? true : undefined}
      aria-label={message ? undefined : "Loading"}
    />
  );
  const content = message ? (
    <span
      className="inline-flex items-center gap-2"
      role="status"
      aria-live="polite"
    >
      {spinner}
      <span>{message}</span>
    </span>
  ) : (
    spinner
  );

  if (centered) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-[2rem]">
        {content}
      </div>
    );
  }

  return content;
}
