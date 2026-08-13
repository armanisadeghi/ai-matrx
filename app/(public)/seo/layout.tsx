import type { ReactNode } from "react";

export default function SeoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden">
      {children}
    </div>
  );
}
