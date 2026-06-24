import { ScopeIcon } from "@/features/scopes/components/ScopeIcon";

interface ScopeGlyphProps {
  /** Stored scope-type icon name (kebab/snake/Pascal — resolved dynamically). */
  icon: string | null | undefined;
  className?: string;
}

/**
 * Stable, module-scope wrapper that renders a scope-type's icon by name.
 *
 * Delegates to {@link ScopeIcon}, which loads the heavy icon payload through the
 * DB-only dynamic front door (`next/dynamic({ ssr: false })`) and paints an
 * animated, payload-free placeholder first. This keeps every `ScopeGlyph`
 * callsite off the old `import * as Icons from "lucide-react"` path that dragged
 * the entire icon library into the build.
 */
export function ScopeGlyph({ icon, className }: ScopeGlyphProps) {
  return <ScopeIcon name={icon} className={className} />;
}
