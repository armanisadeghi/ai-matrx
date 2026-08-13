import type { ReactNode } from "react";

export default function MetadataToolLayout({
  children,
}: {
  children: ReactNode;
}) {
  // The public layout gives us a bounded, scroll-safe main. This wrapper passes
  // that height through while retaining the same safe vertical fallback for
  // every metadata tool page.
  return (
    <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden">
      {children}
    </div>
  );
}
