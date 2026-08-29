// app/(public)/l/[code]/page.tsx
//
// THE LABEL RESOLVER — the printed QR payload is `https://aimatrx.com/l/<code>`
// (PRINT-PACKAGE-DESIGN Decision 3), so any phone camera lands here.
// Deliberately THIN: look the code up under the viewer's own session (RLS is
// the authority) and redirect to the owning intake asset when it resolves.
// Richer resolution (public product pages, chain-of-custody views) is a
// documented follow-up — features/commerce-intake/FEATURE.md § The label pool.

import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

function Panel({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-textured px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 text-center">
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        {cta && (
          <Link
            href={cta.href}
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </main>
  );
}

export default async function LabelResolverPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const value = decodeURIComponent(code).trim();

  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    // The scanned label is the destination — it survives the auth bounce.
    redirect(await currentRequestLoginHref(`/l/${encodeURIComponent(value)}`));
  }

  const supabase = await createClient();
  const commerce = supabase.schema("commerce");

  // A live identifier row wins — the code is in use.
  const { data: identifier } = await commerce
    .from("asset_identifier")
    .select("intake_asset_id")
    .eq("value", value)
    .is("replaced_at", null)
    .limit(1)
    .maybeSingle();
  const assetId = identifier?.intake_asset_id;
  if (assetId) redirect(`/commerce/intake/assets/${assetId}`);

  // Then the pool. `label_code` postdates the generated types (regeneration
  // needs a CLI token this environment lacks — see labels/types.ts); the
  // narrow cast goes away on the next `pnpm db-types`.
  const { data: pooled } = await (
    commerce as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (
            col: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{ data: unknown }>;
          };
        };
      };
    }
  )
    .from("label_code")
    .select("state, intake_asset_id")
    .eq("value", value)
    .maybeSingle();
  const codeRow = pooled as {
    state?: string;
    intake_asset_id?: string | null;
  } | null;

  if (codeRow?.state === "assigned" && codeRow.intake_asset_id) {
    redirect(`/commerce/intake/assets/${codeRow.intake_asset_id}`);
  }
  if (codeRow?.state === "available") {
    return (
      <Panel
        title="Unassigned label"
        body="This QR label is printed but not on an item yet. Scan it inside Intake Capture to claim it for the item in front of you."
        cta={{ href: "/commerce/intake", label: "Open Intake Capture" }}
      />
    );
  }
  if (codeRow?.state === "void") {
    return (
      <Panel
        title="Voided label"
        body="This label was voided and can no longer be used. Print a replacement from the label batches page."
        cta={{ href: "/commerce/labels", label: "Label batches" }}
      />
    );
  }
  return (
    <Panel
      title="Code not recognized"
      body="This code doesn't resolve for your account. It may belong to another organization, or the label may not have been minted here."
      cta={{ href: "/commerce/labels", label: "Label batches" }}
    />
  );
}
