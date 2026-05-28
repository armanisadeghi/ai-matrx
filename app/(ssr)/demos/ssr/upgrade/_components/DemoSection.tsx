import { cn } from "@/lib/utils";

interface DemoSectionProps {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function DemoSection({
  id,
  eyebrow,
  title,
  description,
  children,
  className,
}: DemoSectionProps) {
  return (
    <section
      id={id}
      className={cn("flex flex-col gap-6 scroll-mt-20", className)}
    >
      <div className="flex flex-col gap-1.5 border-b border-border/60 pb-3">
        {eyebrow && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {eyebrow}
          </span>
        )}
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
            {title}
          </h2>
        </div>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}
