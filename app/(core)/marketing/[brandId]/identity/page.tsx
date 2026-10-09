import { MarketingAddressUnavailable } from "@/features/marketing/components/shared/MarketingAddressUnavailable";
import Link from "next/link";
import {
  BookOpen,
  Boxes,
  Images,
  ScrollText,
  Users,
  Megaphone,
  ShieldCheck,
  type LucideIcon,
  Compass,
  PenLine,
  Telescope,
  Swords,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { marketingSeg } from "@/features/marketing/lib/keys";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { createClient } from "@/utils/supabase/server";
import { researchThisHref } from "@/features/research/utils/init-route";
import { subjectFromBrandProperties } from "@/features/research/utils/subject";
import { brandKindCopy, type BrandRoom } from "@/features/marketing/lib/brand-kind";

/**
 * Brand Identity — who this client IS, as opposed to what it owns or what the
 * agency does for it. One room per kind of brand truth; each is a real route,
 * so a room can be linked, shared, and opened by an agent.
 */
export default async function BrandIdentityPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) return <MarketingAddressUnavailable token="web_brand" address={brandId} />;
  const seg = marketingSeg(brand);
  const identity = marketingRoutes.brandIdentity(seg);
  // "Research this brand": the intake opens with the brand's own website and
  // social handles (web.property) as the typed research subject.
  const supabase = await createClient();
  const { data: properties } = await supabase
    .schema("web")
    .from("property")
    .select("kind, url, handle")
    .eq("brand_id", brand.id)
    .is("deleted_at", null);
  const researchHref = researchThisHref({
    name: brand.name,
    subject: subjectFromBrandProperties(brand.id, properties ?? []),
    returnTo: identity,
  });

  // Names and lines per brand kind (company | person) come from the one config.
  const roomCopy = brandKindCopy(brand).rooms;
  const roomDefs: Array<{
    room: BrandRoom;
    href: string;
    icon: LucideIcon;
  }> = [
    {
      room: "media",
      href: marketingRoutes.brandAssets(seg),
      icon: Images,
    },
    {
      room: "strategy",
      href: `${identity}/strategy`,
      icon: Compass,
    },
    {
      room: "knowledge",
      href: `${identity}/knowledge`,
      icon: BookOpen,
    },
    {
      room: "offerings",
      href: `${identity}/offerings`,
      icon: Boxes,
    },
    {
      room: "guidelines",
      href: `${identity}/guidelines`,
      icon: ScrollText,
    },
    {
      room: "messaging",
      href: `${identity}/messaging`,
      icon: Megaphone,
    },
    {
      room: "claims",
      href: `${identity}/claims`,
      icon: ShieldCheck,
    },
    {
      room: "voice",
      href: `${identity}/voice`,
      icon: PenLine,
    },
    {
      room: "research",
      href: researchHref,
      icon: Telescope,
    },
    {
      room: "competitors",
      href: marketingRoutes.brandCompetitors(seg),
      icon: Swords,
    },
    {
      room: "audience",
      href: `${identity}/audience`,
      icon: Users,
    },
  ];
  const rooms = roomDefs.map((def) => ({ ...def, ...roomCopy[def.room] }));

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-5xl px-3 pb-10 pt-[calc(var(--shell-header-h)+1rem)] sm:px-4">
        <header className="mb-4">
          <h1
            className="text-base font-semibold text-foreground"
            title="What every website, campaign and agent draws on"
          >
            {brand.name} · Identity
          </h1>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          {rooms.map((room) => {
            const Icon = room.icon;
            return (
              <Card key={room.name} className="p-0">
                <Link
                  href={room.href}
                  className="flex h-full gap-3 rounded-xl p-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {room.name}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {room.description}
                    </span>
                  </span>
                </Link>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
