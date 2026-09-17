// app/(core)/drive/page.tsx
//
// THE SHORT LINK. `<host>/drive` is the address a person texts themselves, and
// it is the whole point: a driving interview has to be reachable from a lock
// screen in a parked car, with one thumb, without remembering a Rulebook id.
//
//   /drive              → your rulebooks, one giant button each (or straight
//                         in when you only have one)
//   /drive?r=<id>       → straight into that rulebook's driving interview
//
// Nothing here is a second implementation of anything: it resolves an id and
// redirects to `/masterwork/<id>/drive`, which is the real lane.

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mic } from "lucide-react";
import { supabase } from "@/utils/supabase/client";

interface DriveTarget {
  id: string;
  name: string;
}

export default function DriveShortLinkRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("r");

  const [targets, setTargets] = useState<DriveTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (requested) {
      router.replace(`/masterwork/${requested}/drive`);
      return;
    }
    let live = true;
    void (async () => {
      // Most-recently-worked first: the rulebook you are driving to talk about
      // is almost always the one you touched last.
      const { data, error: queryError } = await supabase
        .schema("platform")
        .from("rulebook")
        .select("id,name,updated_at")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(12);
      if (!live) return;
      if (queryError) {
        setError(`${queryError.message} (${queryError.code})`);
        return;
      }
      const rows: DriveTarget[] = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
      }));
      if (rows.length === 1) {
        router.replace(`/masterwork/${rows[0].id}/drive`);
        return;
      }
      setTargets(rows);
    })();
    return () => {
      live = false;
    };
  }, [requested, router]);

  return (
    <div className="matrx-touch-targets h-full w-full overflow-y-auto bg-[#050505] px-6 py-10 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div>
          <p className="text-3xl leading-tight font-semibold">Talk while you drive</p>
          <p className="mt-2 text-xl leading-snug text-white/60">
            Pick what you want to be asked about. One tap, then hands on the
            wheel.
          </p>
        </div>

        {error ? (
          <p className="text-lg text-amber-300">
            We couldn&apos;t load your rulebooks: {error}
          </p>
        ) : targets === null ? (
          <p className="text-xl text-white/50">One moment…</p>
        ) : targets.length === 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-xl text-white/70">
              You don&apos;t have a rulebook yet — a driving interview needs
              something to be about.
            </p>
            <Link
              href="/masterwork/new"
              className="flex min-h-[72px] items-center justify-center rounded-3xl bg-emerald-400 text-2xl font-semibold text-black"
            >
              Start one
            </Link>
          </div>
        ) : (
          targets.map((target) => (
            <Link
              key={target.id}
              href={`/masterwork/${target.id}/drive`}
              className="flex min-h-[88px] items-center gap-4 rounded-3xl bg-white/12 px-6 text-2xl leading-tight font-semibold hover:bg-white/20"
            >
              <Mic className="h-8 w-8 shrink-0 text-emerald-400" />
              <span className="min-w-0 break-words">{target.name}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
