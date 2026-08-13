"use client";

/**
 * The recipient landing SHELL for share links: conversion chrome (fork CTA,
 * "Create your own") around whatever lens the share-lens registry resolves for
 * the resource type. Per-type rendering lives in
 * `features/sharing/lenses/` — never add a type `switch` here.
 */

import React, { useRef } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicHeaderActionsPortal } from "@/components/matrx/PublicHeaderActionsPortal";
import {
  isForkable,
  type ResolvedShareToken,
} from "@/utils/permissions/shareLinks";
import { DuplicateToEditButton } from "@/features/sharing/components/DuplicateToEditButton";
import {
  resolveShareLens,
  shareLensIsFullBleed,
} from "@/features/sharing/lenses/registry";
import { resolveShareSourceSurface } from "@/features/sharing/lenses/source-surface";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";

export function SharedResourceView({
  result,
  token,
}: {
  result: ResolvedShareToken;
  token: string;
}) {
  const forkable = isForkable(result.resourceType) && !!result.resourceId;
  const contentRef = useRef<HTMLDivElement>(null);
  useClippedContentGuard(contentRef, { label: "Shared resource content" });
  const lens = resolveShareLens(result.resourceType);
  const source = resolveShareSourceSurface(result);
  const fullBleed = shareLensIsFullBleed(result.resourceType);

  return (
    <>
      <PublicHeaderActionsPortal>
        {forkable && result.resourceType && result.resourceId && (
          <DuplicateToEditButton
            resourceType={result.resourceType}
            resourceId={result.resourceId}
            returnPath={`/s/${token}`}
            shareToken={token}
          />
        )}
        {/* NEVER /sign-up: the recipient goes to the REAL feature that made
            this — the workspace when signed in, that feature's marketing
            landing when not. Everything basic here is free up front, so a
            login wall at this exact moment throws away the referral. The
            destination is per share type: features/sharing/lenses/source-surface.ts */}
        <Button
          asChild
          size="sm"
          variant="outline"
          className="h-7 px-2 sm:px-3"
        >
          <Link href={source.href} aria-label={source.label}>
            <span className="hidden sm:inline">{source.label}</span>
            <ArrowUpRight className="h-4 w-4 sm:ml-1" />
          </Link>
        </Button>
      </PublicHeaderActionsPortal>

      {fullBleed ? (
        // Full-bleed lens (e.g. a shared file's viewer): the lens owns the
        // whole body — definite height, its own scroll, no padded column.
        <div ref={contentRef} className="h-full bg-textured">
          {lens({ result, token })}
        </div>
      ) : (
        <div className="h-full overflow-y-auto bg-textured scrollbar-thin">
          <div ref={contentRef} className="px-4 py-4 sm:px-6 sm:py-6">
            {lens({ result, token })}
          </div>
        </div>
      )}
    </>
  );
}
