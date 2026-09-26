/**
 * Icon KEYS for the Alchemy menu model (Matrx Alchemy ALC-15, CONTRACT §2.5).
 *
 * The package's model holds only string keys; this is the app half of the
 * icon port. An app provider that owns a real icon component (rich-document's
 * Lucide icons, a domain icon) registers it here and puts the returned key on
 * its action; the icon port resolves that key back to the SAME component, and
 * any other key through `@ai-matrx/icons` (Lucide names, `svg:` assets).
 */
import type { ComponentType } from "react";
import { getIconComponent } from "@ai-matrx/icons";

type IconComponent = ComponentType<{ className?: string }>;

const BY_KEY = new Map<string, IconComponent>();
const BY_COMPONENT = new WeakMap<object, string>();

/** Register a component; returns its stable key (`app:<Name>`, suffixed when two differ). */
export function registerAlchemyIcon(component: unknown): string {
  const icon = component as IconComponent & { displayName?: string };
  const known = BY_COMPONENT.get(icon);
  if (known) return known;
  const base = `app:${icon.displayName ?? icon.name ?? "icon"}`;
  let key = base;
  for (let n = 2; BY_KEY.has(key) && BY_KEY.get(key) !== icon; n++) key = `${base}-${n}`;
  BY_KEY.set(key, icon);
  BY_COMPONENT.set(icon, key);
  return key;
}

/** The icon port's resolve: a registered component, else an `@ai-matrx/icons` name. */
export function resolveAlchemyIcon(key: string): IconComponent | null {
  const own = BY_KEY.get(key);
  if (own) return own;
  if (key.startsWith("app:")) return null;
  return getIconComponent(key) as IconComponent;
}
