import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createRouteMetadata } from "@/utils/route-metadata";
import {
  INDUSTRIES,
  INDUSTRY_ORDER,
  type IndustryId,
} from "@/features/pricing/components/industry/industries";
import { IndustryPageClient } from "./IndustryPageClient";

export function generateStaticParams() {
  return INDUSTRY_ORDER.map((id) => ({ id }));
}

const isIndustry = (id: string): id is IndustryId =>
  (INDUSTRY_ORDER as readonly string[]).includes(id);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isIndustry(id)) return {};
  const cfg = INDUSTRIES[id];
  return createRouteMetadata(`/demos/upgrade/industry/${id}`, {
    titlePrefix: cfg.label,
    title: "Demos",
    description: `Industry-specific upgrade page for ${cfg.label.toLowerCase()} teams.`,
    letter: cfg.label.slice(0, 2),
  });
}

export default async function IndustryDemoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isIndustry(id)) {
    notFound();
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link
          href="/demos/upgrade"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to all demos
        </Link>
        <div className="flex items-center gap-1 overflow-x-auto">
          {INDUSTRY_ORDER.map((other) => {
            const active = other === id;
            return (
              <Link
                key={other}
                href={`/demos/upgrade/industry/${other}`}
                className={
                  active
                    ? "rounded-full bg-foreground px-3 py-1 text-[11px] font-medium text-background"
                    : "rounded-full border border-border/70 bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                }
              >
                {INDUSTRIES[other].label}
              </Link>
            );
          })}
        </div>
      </div>
      <IndustryPageClient industry={id} />
    </div>
  );
}
