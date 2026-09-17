// features/marketing/seo/topical-map/redux/__fixtures__/listPageIntentsRound22.ts
//
// 🚨 RECORDED, NOT WRITTEN. Every byte below came back from
// `seo.list_page_intents` on the live database (project brsgrqvjdzwihsvnfqkf)
// on 2026-09-17, after the round-22 migration
// `seo_topical_map_22_a_page_never_vanishes` (ledger checksum 7d5d82ea834f…)
// was applied. The world it describes was planted and read inside ONE
// transaction that was rolled back, exactly the way the shipped door contract
// `test_a_hidden_topic_never_hides_its_page` plants its own — so nothing here
// survives in the database, and nothing here was typed by hand.
//
// A fixture an agent writes proves only that the agent and its own selector
// agree. This one carries the server's actual answers to the five states the
// selector has to tell apart:
//
//   arriver     covers []                   intent → live-there   arriving
//   mover       covers [live-here]          intent → live-there   leaving
//   orphan-one  covers [] (topic REJECTED)  intent, NO topic key  intent_topic_hidden
//   orphan-two  covers [] (topic RETIRED)   intent, NO topic key  intent_topic_hidden
//   p1          covers [alpha]              no intent             in_place
//   p2          covers [alpha, sect-b]      no intent             in_place
//
// The two orphans are the whole point of round 22: before it, rejecting or
// retiring their topic removed them from this list entirely. `seo.map_diagnostics`
// on the same world answered `pages_on_no_topic: 3` (the two orphans and the
// arriver), which is the number `selectPagesOnNoTopic` reproduces client-side.

import type { PageIntentsResult } from "../../types";

export const RECORDED_PAGE_INTENTS_ROUND22 = {
  "duplicate_intents": 0,
  "items": [
    {
      "current_topics": [],
      "intent": {
        "disposition": "move",
        "source": "human",
        "state": "accepted",
        "topic": {
          "name": "Live there",
          "slug": "live-there"
        },
        "updated_at": "2026-09-17T16:03:36.403533+00:00"
      },
      "page": {
        "clicks": 0,
        "id": "c95d9faf-f1f1-4fa5-9850-9f4a3ee6838d",
        "impressions": 0,
        "label": "https://tmdc-a-7a6b5311.invalid/arriver",
        "performance_window_days": 28,
        "site_id": "46690e56-6b25-45b9-ac91-611c92b3cf61",
        "type": "web_page",
        "url": "https://tmdc-a-7a6b5311.invalid/arriver"
      }
    },
    {
      "current_topics": [
        {
          "confidence": 80,
          "name": "Live here",
          "slug": "live-here",
          "source": "agent"
        }
      ],
      "intent": {
        "disposition": "move",
        "source": "human",
        "state": "proposed",
        "topic": {
          "name": "Live there",
          "slug": "live-there"
        },
        "updated_at": "2026-09-17T16:03:36.403533+00:00"
      },
      "page": {
        "clicks": 0,
        "id": "61388277-224f-42b8-9414-015f9d3e4af7",
        "impressions": 0,
        "label": "https://tmdc-a-7a6b5311.invalid/mover",
        "performance_window_days": 28,
        "site_id": "46690e56-6b25-45b9-ac91-611c92b3cf61",
        "type": "web_page",
        "url": "https://tmdc-a-7a6b5311.invalid/mover"
      }
    },
    {
      "current_topics": [],
      "intent": {
        "disposition": "keep",
        "source": "agent",
        "state": "proposed",
        "updated_at": "2026-09-17T16:03:36.403533+00:00"
      },
      "page": {
        "clicks": 0,
        "id": "2c03ce6d-e399-41cb-9c75-21f02f080c28",
        "impressions": 0,
        "label": "https://tmdc-a-7a6b5311.invalid/orphan-one",
        "performance_window_days": 28,
        "site_id": "46690e56-6b25-45b9-ac91-611c92b3cf61",
        "type": "web_page",
        "url": "https://tmdc-a-7a6b5311.invalid/orphan-one"
      }
    },
    {
      "current_topics": [],
      "intent": {
        "disposition": "keep",
        "source": "agent",
        "state": "proposed",
        "updated_at": "2026-09-17T16:03:36.403533+00:00"
      },
      "page": {
        "clicks": 0,
        "id": "16eedfd2-ca75-4de2-ac3c-ea7233fc1c40",
        "impressions": 0,
        "label": "https://tmdc-a-7a6b5311.invalid/orphan-two",
        "performance_window_days": 28,
        "site_id": "46690e56-6b25-45b9-ac91-611c92b3cf61",
        "type": "web_page",
        "url": "https://tmdc-a-7a6b5311.invalid/orphan-two"
      }
    },
    {
      "current_topics": [
        {
          "confidence": 70,
          "name": "Alpha",
          "slug": "alpha",
          "source": "agent"
        }
      ],
      "intent": null,
      "page": {
        "clicks": 0,
        "id": "d80a9033-4cb4-443b-8e8d-8bdaf1e4c98f",
        "impressions": 0,
        "label": "https://tmdc-a-7a6b5311.invalid/p1",
        "performance_window_days": 28,
        "site_id": "46690e56-6b25-45b9-ac91-611c92b3cf61",
        "type": "web_page",
        "url": "https://tmdc-a-7a6b5311.invalid/p1"
      }
    },
    {
      "current_topics": [
        {
          "confidence": 70,
          "name": "Alpha",
          "slug": "alpha",
          "source": "agent"
        },
        {
          "confidence": 70,
          "name": "Sect-B",
          "slug": "sect-b",
          "source": "agent"
        }
      ],
      "intent": null,
      "page": {
        "clicks": 0,
        "id": "f58350af-7b13-451f-a757-501c3f8d6ed5",
        "impressions": 0,
        "label": "https://tmdc-a-7a6b5311.invalid/p2",
        "performance_window_days": 28,
        "site_id": "46690e56-6b25-45b9-ac91-611c92b3cf61",
        "type": "web_page",
        "url": "https://tmdc-a-7a6b5311.invalid/p2"
      }
    }
  ],
  "limit": 200,
  "offset": 0,
  "performance_window_days": 28,
  "total": 6
} as unknown as PageIntentsResult;
