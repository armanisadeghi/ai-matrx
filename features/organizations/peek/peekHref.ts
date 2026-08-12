/**
 * peekHref — the Open door of a peek, resolved from the ENTITY REGISTRY.
 *
 * Every peek used to hand-write its own route string. Six of the nineteen were
 * wrong and shipped a 404 as the peek's primary action (`/quizzes/{id}`,
 * `/flashcards/{id}`, `/skills/{id}`, `/transcripts/{id}`, `/workflows/{id}`,
 * `/canvas/{id}` — none of those routes exist), and two more passed no href at
 * all for kinds that DO have a route. That is nineteen private copies of a fact
 * the registry already owns, drifting independently — the exact defect THE
 * INVENTORY LAW names.
 *
 * A peek now calls `peekHref("<canonical token>", id)`. Returning `undefined`
 * hides the Open button entirely, which is the honest state for a kind with no
 * detail route — a button that 404s is worse than no button.
 *
 * Adding or fixing a route is therefore a REGISTRY edit
 * (`features/scopes/registry/entityRegistry.ts` → `hrefFor`), and every peek,
 * every `EntityRef`, and every association row picks it up at once.
 *
 * NOTE the token, not the peek's catalogue key: six peek keys differ from the
 * canonical token (`flashcard`→`fc_set`, `quiz`→`quiz_session`,
 * `canvas`→`canvas_item`, `sandbox`→`sandbox_instance`, `agent_app`→`app`,
 * `picklist`→`structured_list`).
 */

import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";

export function peekHref(token: string, id: string): string | undefined {
  return tryGetEntityInfo(token)?.hrefFor?.(id) ?? undefined;
}
