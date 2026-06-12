"use client";

import Link from "next/link";
import { SearchX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ScopeNotFoundProps {
  title: string;
  message: string;
  backHref: string;
  backLabel: string;
}

/**
 * Shown when a slug/id route segment resolves to nothing AFTER the relevant
 * data has loaded — replaces an endless spinner for mistyped scope URLs.
 */
export function ScopeNotFound({
  title,
  message,
  backHref,
  backLabel,
}: ScopeNotFoundProps) {
  return (
    <div className="flex items-center justify-center py-16">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center mx-auto mb-3">
          <SearchX className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground mb-5">{message}</p>
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </Card>
    </div>
  );
}
