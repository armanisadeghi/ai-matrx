"use client";

/**
 * /education/kits/[sourceId] — the owner's model for an INVITING page
 * (2026-10-04: "Get my page back but solve a few minor issues"). This sample IS
 * the real page: it renders the real `KitHub` (same hero, same cards, same
 * spacing, same reads, writes and agent surface). Only these differ:
 * 1. Header: the sitewide crumb pattern (back + Education › Kits › kit, each
 *    level with its sibling menu) instead of the tool header.
 * 2. The five kit actions sit BELOW the hero as one uniform outline button.
 * 3. The hero has no "Your study path" pill.
 * 4. The hero drops its evidence sentence.
 * Never re-pack this page: it is inviting, not functional (ui-unification plan §1c).
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CrumbTrailHeader, type CrumbOption } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { EDUCATION_NAV_ITEMS } from "@/features/education/components/EducationHeader";
import { ALL_TARGET_KINDS, type TargetKind } from "@/features/education/convert/types";
import { KitHub } from "@/features/education/kits/components/KitHub";
import { listKits, type StudyKit } from "@/features/education/kits/kitService";

/** The kit the owner named (2026-10-03). */
const DEFAULT_KIT_ID = "db38865c-f89a-47e9-ae02-0ae98565fee3";
const SAMPLE_PATH = "/demos/ui-unification/samples/education-kit";

export function EducationKitSample() {
  const params = useSearchParams();
  const sourceId = params.get("id") ?? DEFAULT_KIT_ID;
  const sourceType = params.get("from") ?? "file";
  const addParam = params.get("add") ?? "";
  const addTarget = (ALL_TARGET_KINDS as string[]).includes(addParam) ? (addParam as TargetKind) : undefined;

  // Sibling kits for the last crumb's menu. Never blocks the page.
  const [kits, setKits] = useState<StudyKit[]>([]);
  useEffect(() => {
    let active = true;
    listKits()
      .then((rows) => active && setKits(rows))
      // read-gate-exempt: dev sample only: the kit list feeds a breadcrumb option list, and the sample page itself reads nothing from it
      .catch((error) => console.error("[kit sample] kit list read failed:", error));
    return () => {
      active = false;
    };
  }, []);

  const kitOptions: CrumbOption[] = kits.map((k) => ({
    label: k.title,
    href: `${SAMPLE_PATH}?id=${k.sourceId}${k.sourceType !== "file" ? `&from=${encodeURIComponent(k.sourceType)}` : ""}`,
    active: k.sourceId === sourceId,
  }));

  return (
    <div className="scroll-page-end-space h-full overflow-y-auto bg-textured">
      <KitHub
        key={`${sourceType}:${sourceId}`}
        sourceId={sourceId}
        sourceType={sourceType}
        addTarget={addTarget}
        proposedLayout
        renderHeader={({ title, loading }) => (
          <CrumbTrailHeader
            backHref="/education"
            trail={[
              { label: "Education", href: "/education" },
              {
                label: "Kits",
                href: "/education/kits",
                optionsLabel: "Education",
                options: EDUCATION_NAV_ITEMS.map((i) => ({ label: i.name, href: i.href, active: i.href === "/education/kits" })),
              },
              { label: title ?? "Study kit", pending: loading, optionsLabel: "Kits", options: kitOptions },
            ]}
          />
        )}
      />
    </div>
  );
}
