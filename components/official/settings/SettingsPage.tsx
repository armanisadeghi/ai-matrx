import type { ReactNode } from "react";

export type SettingsPageProps = { children: ReactNode };

/**
 * Content canvas for a settings route or overlay. The surrounding shell owns
 * scrolling so this component never creates a nested scroll region.
 */
export function SettingsPage({ children }: SettingsPageProps) {
  return (
    <div className="mx-auto min-h-full w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      {children}
    </div>
  );
}
