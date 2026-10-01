import Image from "next/image";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * OrganizationMark — an organization's compact identity: its own icon when it
 * has one, otherwise its abbreviation (database-validated 2–3 uppercase
 * letters) set to fit the tile, otherwise a building glyph. One drawing for
 * every place that shows "which organization" at icon size.
 */
export function OrganizationMark({
  name,
  abbreviation,
  logoUrl,
  size = 24,
  className,
}: {
  name: string | null;
  abbreviation?: string | null;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };
  if (logoUrl) {
    return (
      <span style={box} className={cn("relative shrink-0 overflow-hidden rounded-md", className)}>
        <Image src={logoUrl} alt={name ?? "Organization"} fill sizes={`${size}px`} unoptimized className="object-cover" />
      </span>
    );
  }
  const letters = (abbreviation || initialsOf(name)).slice(0, 3).toUpperCase();
  if (!letters) {
    return (
      <span
        style={box}
        className={cn("flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground", className)}
        aria-hidden="true"
      >
        <Building2 style={{ width: size * 0.6, height: size * 0.6 }} strokeWidth={1.75} />
      </span>
    );
  }
  // Three letters need a smaller face than two to stay inside the tile.
  const fontSize = Math.round(size * (letters.length >= 3 ? 0.36 : 0.44));
  return (
    <span
      style={{ ...box, fontSize }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-foreground font-bold leading-none tracking-tight text-background",
        className,
      )}
      aria-hidden="true"
    >
      {letters}
    </span>
  );
}

function initialsOf(name: string | null): string {
  if (!name) return "";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0])
    .join("");
}
