"use client";

/**
 * Header center zone for /vault. Identity only — the workspace owns its own
 * search, scope switcher, and create actions, so duplicating them up here
 * would give the route two competing toolbars.
 */
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ShieldCheck, KeyRound, Globe } from "lucide-react";
import { TapTargetButton } from "@ai-matrx/design-system/tap-target";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { VaultFillDevicesDialog } from "./VaultFillDevicesDialog";

/** Mounts itself into the shell header — render it bare, never inside <PageHeader>. */
export function VaultRouteHeader() {
  const [browsersOpen, setBrowsersOpen] = useState(false);
  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center gap-2 px-1">
            <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h1 className="truncate text-sm font-semibold text-foreground">
              Vault
            </h1>
          </div>
        }
        right={
          <div className="flex items-center">
            <div className="lg:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="quiet"
                    icon={<ShieldCheck />}
                    aria-label="Vault tools"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="matrx-touch-targets"
                >
                  <DropdownMenuItem onSelect={() => setBrowsersOpen(true)}>
                    <Globe className="mr-2 h-4 w-4" />
                    Browsers
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/vault/authenticator">
                      <KeyRound className="mr-2 h-4 w-4" />
                      Authenticator
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="hidden items-center lg:flex">
              <TapTargetButton
                onClick={() => setBrowsersOpen(true)}
                icon={<Globe className="h-4 w-4" />}
                label="Browsers"
              />
              <TapTargetButton
                href="/vault/authenticator"
                icon={<KeyRound className="h-4 w-4" />}
                label="Authenticator"
              />
            </div>
          </div>
        }
      />
      <VaultFillDevicesDialog
        open={browsersOpen}
        onOpenChange={setBrowsersOpen}
      />
    </>
  );
}
