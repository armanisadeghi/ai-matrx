import type { ReactNode } from "react";

export default function SeoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {children}
    </div>
  );
}
