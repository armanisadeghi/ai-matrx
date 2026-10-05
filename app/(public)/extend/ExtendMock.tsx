import { PanelRight, Globe } from "lucide-react";

/** A drawn stand-in for Chrome with the side panel open. Not a screenshot. */
export function ExtendMock() {
  return (
    <div
      role="img"
      aria-label="Illustration of Chrome with the Matrx Extend side panel open beside a web page, where the assistant answers a question about that page."
      className="relative mx-auto w-full max-w-xl"
    >
      <div
        aria-hidden="true"
        className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-tr from-violet-500/25 via-primary/10 to-cyan-400/20 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-destructive/80" />
            <span className="h-3 w-3 rounded-full bg-warning/80" />
            <span className="h-3 w-3 rounded-full bg-success/80" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-background px-3 py-1 type-meta text-muted-foreground">
            <Globe className="h-3 w-3 shrink-0" />
            <span className="truncate">any-website.com/the-page-you-are-on</span>
          </div>
        </div>
        <div className="flex min-h-[19rem] sm:min-h-[22rem]">
          <div className="min-w-0 flex-1 space-y-3 p-4 sm:p-5">
            <div className="h-24 rounded-xl bg-muted sm:h-28" />
            <div className="h-3 w-3/4 rounded bg-foreground/15" />
            <div className="h-2.5 w-full rounded bg-foreground/10" />
            <div className="h-2.5 w-11/12 rounded bg-foreground/10" />
            <div className="h-2.5 w-2/3 rounded bg-foreground/10" />
            <div className="h-2.5 w-4/5 rounded bg-foreground/10" />
          </div>
          <div className="flex w-[46%] shrink-0 flex-col gap-2.5 border-l border-border bg-background/70 p-3 sm:p-4">
            <div className="flex items-center gap-1.5 type-secondary font-bold text-primary">
              <PanelRight className="h-3.5 w-3.5" />
              Matrx Extend
            </div>
            <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-primary px-3 py-2 type-meta leading-4 text-primary-foreground">
              What are the key points on this page?
            </div>
            <div className="max-w-[95%] space-y-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-3 py-2.5">
              <div className="h-2 w-full rounded bg-foreground/15" />
              <div className="h-2 w-5/6 rounded bg-foreground/15" />
              <div className="h-2 w-2/3 rounded bg-foreground/15" />
            </div>
            <div className="mt-auto rounded-xl border border-border bg-card px-3 py-2 type-meta text-muted-foreground">
              Ask about this page
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
