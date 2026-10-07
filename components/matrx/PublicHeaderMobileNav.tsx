"use client";

import Link from "next/link";
import { Compass, Download, LayoutTemplate, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MATRX_LOCAL_DOWNLOAD_PATH } from "@/features/matrx-local-download/release";
import { PUBLIC_HEADER_ICON_BUTTON } from "./publicHeaderChrome";

/** Below `md` the header's Discover / Templates / Download links live in one menu. */
export function PublicHeaderMobileNav() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={<Menu />}
          variant="quiet"
          className={`${PUBLIC_HEADER_ICON_BUTTON} md:hidden`}
          aria-label="Menu"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/canvas/discover">
            <Compass className="mr-2 h-4 w-4" aria-hidden="true" />
            Discover
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/templates">
            <LayoutTemplate className="mr-2 h-4 w-4" aria-hidden="true" />
            Templates
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="sm:hidden">
          <Link href={MATRX_LOCAL_DOWNLOAD_PATH}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Download
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
