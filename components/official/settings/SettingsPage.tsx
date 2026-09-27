import type { ReactNode } from "react";

export type SettingsPageProps = { children: ReactNode };

/**
 * Content canvas for a settings route or overlay. The surrounding shell owns
 * scrolling so this component never creates a nested scroll region.
 * `matrx-touch-targets` gives every control inside a 44px floor on touch and
 * below `lg`; desktop density is untouched.
 */
export function SettingsPage({ children }: SettingsPageProps) {
  return (
    <div className="matrx-touch-targets mx-auto min-h-full w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      {children}
    </div>
  );
}
