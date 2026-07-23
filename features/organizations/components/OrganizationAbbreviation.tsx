import { cn } from "@/lib/utils";

interface OrganizationAbbreviationProps {
  abbreviation: string;
  className?: string;
}

/**
 * The canonical compact organization identity mark.
 * The value is database-validated as 2-3 uppercase letters.
 */
export function OrganizationAbbreviation({
  abbreviation,
  className,
}: OrganizationAbbreviationProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-bold uppercase tracking-wide",
        className,
      )}
      aria-label={`Organization abbreviation ${abbreviation}`}
      title={abbreviation}
    >
      {abbreviation}
    </span>
  );
}
