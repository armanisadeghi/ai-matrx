import { notFound } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Boxes,
  Images,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { ComingSoonBadge } from "@/components/coming-soon/ComingSoonBadge";
import { marketingSeg } from "@/features/marketing/lib/keys";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * Brand Home — who this client IS, as opposed to what it owns or what the
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
  if (!brand) notFound();
  const seg = marketingSeg(brand);
  const identity = marketingRoutes.brandIdentity(seg);

  const rooms: Array<{
    name: string;
    description: string;
    href: string;
    icon: LucideIcon;
    comingSoon?: boolean;
  }> = [
    {
      name: "Media",
      description:
        "Everything this brand owns or can draw on — its library, research captures, stock sources, and generated imagery.",
      href: marketingRoutes.brandAssets(seg),
      icon: Images,
    },
    {
      name: "Knowledge",
      description:
        "What the business actually is: AI reads the website cold and proposes the model, the customers, and the money map — you rule every rung.",
      href: `${identity}/knowledge`,
      icon: BookOpen,
    },
    {
      name: "Offerings",
      description:
        "The tree of what this client sells, and what each offering is worth — the spine every keyword and page is valued against.",
      href: `${identity}/offerings`,
      icon: Boxes,
    },
    {
      name: "Guidelines",
      description:
        "How this brand must be written about and what it must never claim — the rules every agent inherits.",
      href: `${identity}/guidelines`,
      icon: ScrollText,
    },
    {
      name: "Audience",
      description:
        "Segments, ICPs, and personas defined once, so every brief and agent writes for a named audience instead of a guess.",
      href: `${identity}/audience`,
      icon: Users,
      comingSoon: true,
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-5xl px-3 pb-10 pt-[calc(var(--shell-header-h)+1rem)] sm:px-4">
        <header className="mb-4">
          <h1 className="text-base font-semibold text-foreground">
            {brand.name} · Brand Home
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The truth about this client that every website, campaign, and agent
            draws on.
          </p>
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
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {room.name}
                      </span>
                      {room.comingSoon ? <ComingSoonBadge /> : null}
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
