import Link from "next/link";
import { LinkIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Anonymous-friendly error state for an invalid / expired / revoked link. */
export function ShareLinkError({ message }: { message?: string }) {
  return (
    <div className="min-h-dvh bg-textured flex flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-border/60 bg-card/40 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Matrx
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <LinkIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            This link isn&rsquo;t available
          </h1>
          <p className="text-muted-foreground mb-6">
            {message ?? "This link is invalid, expired, or has been turned off."}
          </p>
          <Button asChild>
            <Link href="/">Go to AI Matrx</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
