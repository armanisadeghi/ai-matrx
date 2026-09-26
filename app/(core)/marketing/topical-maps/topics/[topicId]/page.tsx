// One TOPIC by its id alone: /marketing/topical-maps/topics/[topicId].
//
// A topic is addressed by SLUG inside a map everywhere else — slugs are the
// agent-facing key (doctrine) — but the platform's entity registry, peeks and
// association rows all carry UUIDs. This door is the translation: resolve the
// topic to its map, then open the workspace focused on it.
//
// It exists so `entityRegistry.hrefFor("seo_map_topic")` can point somewhere
// real. Without it a topic named anywhere in the app would be a dead end.

import { notFound, redirect } from "next/navigation";

import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TopicalMapTopicDoor({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  if (!UUID_RE.test(topicId)) notFound();

  const supabase = await createClient();
  const { user, authUnavailable } = await getServerAuth();
  if (!user && authUnavailable) {
    console.warn(
      "[marketing/topical-maps/topics/[topicId]] identity could not be verified — showing the retry notice, NOT redirecting to /login.",
    );
    return (
      <div className="p-4 text-sm text-muted-foreground">
        We could not verify who you are on this request, so this page is not
        loading. You have not been signed out — reload in a moment.
        <ErrorAlchemyMenu />
      </div>
    );
  }
  if (!user) {
    redirect(`/login?redirectTo=/marketing/topical-maps/topics/${topicId}`);
  }

  const topic = await supabase
    .schema("seo")
    .from("map_topic")
    .select("id, map_id, slug")
    .eq("id", topicId)
    .is("deleted_at", null)
    .maybeSingle();

  if (topic.error || !topic.data) {
    // Denied, deleted, missing, or a stale session — the gate resolves which.
    return (
      <AccessGate
        token="seo_map_topic"
        id={topicId}
        error={topic.error}
        fallbackHref="/marketing"
        fallbackLabel="Marketing"
      />
    );
  }

  // The map door decides the brand-vs-record-only lane; this one only has to
  // get the caller to the right map, carrying the topic it was asked for.
  redirect(
    `${marketingRoutes.topicalMapDoor(topic.data.map_id)}?topic=${encodeURIComponent(
      topic.data.slug,
    )}`,
  );
}
