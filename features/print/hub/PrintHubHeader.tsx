"use client";

// PrintHubHeader — the shell header for `/print` itself. The hub is a single
// view, so the header carries its identity on the left and the one action a
// visitor most often wants (order printed copies) on the right.

import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";

export function PrintHubHeader() {
    return (
        <RouteHeader
            left={
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Printer className="h-4 w-4 text-muted-foreground" />
                    Print
                </span>
            }
            right={
                <Button asChild size="sm" variant="outline">
                    <Link href="/print/order">Order printed copies</Link>
                </Button>
            }
        />
    );
}
