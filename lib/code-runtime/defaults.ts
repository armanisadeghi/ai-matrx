/**
 * The app's starting scopes for NEW stored rows. A row stores its own scope
 * (`allowed_imports`); these are only what a new row starts with. The
 * registry itself — what CAN be imported — is `@ai-matrx/code-runtime`'s.
 */

/** A new Applet: the primary UI set first, plus the legacy aliases the starter templates use. */
export function defaultNewAppScopeEntries(): string[] {
  return [
    "react",
    "lucide-react",
    "@ai-matrx/design-system/controls",
    "@ai-matrx/design-system",
    "@/components/MarkdownStream",
    "@/components/ui/button",
    "@/components/ui/input",
    "@/components/ui/textarea",
    "@/components/ui/card",
    "@/components/ui/label",
    "@/components/ui/select",
    "@/components/ui/slider",
    "@/components/ui/switch",
    "@/components/ui/tabs",
  ];
}

/** A new DB tool renderer. */
export function defaultToolRendererScopeEntries(): string[] {
  return [
    "react",
    "lucide-react",
    "@ai-matrx/design-system/controls",
    "@/lib/utils",
    "@/components/ui/badge",
    "@/components/ui/button",
    "@/components/ui/card",
    "@/components/ui/tabs",
  ];
}
