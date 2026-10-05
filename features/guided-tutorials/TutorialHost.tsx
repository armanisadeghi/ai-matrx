"use client";

/**
 * Render-free until asked. Reads `?tutorial=<id>` — the door every "Show me
 * how" card and tutorial email lands on — and runs that tutorial's spotlight.
 * Mounted GLOBALLY (app/DeferredSingletonCore.tsx) so the link works on any
 * route; a link that lands on the wrong route is moved to the tutorial's own.
 *
 * Finishing records the id in `userPreferences.system.completedTutorials`
 * (synced per person); skipping records nothing. Either way the query key is
 * removed so a reload does not replay it.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import { TutorialSpotlight } from "./TutorialSpotlight";
import { TUTORIAL_QUERY_KEY, findTutorial, tutorialHref } from "./registry";

export function TutorialHost() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const completed = useAppSelector(
    (state) => state.userPreferences.system?.completedTutorials ?? [],
  );

  const requestedId = params.get(TUTORIAL_QUERY_KEY);
  const tutorial = findTutorial(requestedId);
  const onRoute = tutorial !== null && pathname === tutorial.route;

  useEffect(() => {
    if (!requestedId) return;
    if (!tutorial) {
      console.error(`[guided-tutorials] No tutorial "${requestedId}" in the registry.`);
      return;
    }
    if (!onRoute) router.replace(tutorialHref(tutorial));
  }, [requestedId, tutorial, onRoute, router]);

  if (!tutorial || !onRoute) return null;

  const close = (done: boolean) => {
    if (done && !completed.includes(tutorial.id)) {
      dispatch(
        setModulePreferences({
          module: "system",
          preferences: { completedTutorials: [...completed, tutorial.id] },
        }),
      );
    }
    const rest = new URLSearchParams(params.toString());
    rest.delete(TUTORIAL_QUERY_KEY);
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return <TutorialSpotlight key={tutorial.id} tutorial={tutorial} onClose={close} />;
}

/** Has this person finished the tutorial? (Read by the DM card.) */
export function useTutorialCompleted(id: string): boolean {
  return useAppSelector(
    (state) => (state.userPreferences.system?.completedTutorials ?? []).includes(id),
  );
}
