// features/marketing/seo/topical-map/views/outline/__fixtures__/pageAssociationsAllGreen.recorded.ts
//
// RECORDED BYTES. Read via the Supabase MCP (project brsgrqvjdzwihsvnfqkf) on
// 2026-09-18 as the authenticated test admin (id 87a6e699-3622-4869-8843-d0867456c0dd):
//
//   select seo.map_topic_associations('e9df6779-8e0e-45e9-a664-375e7d1ecffd',
//     'mobile-phone-and-tablet-recycling', '{pages}'::text[]);
//
// WHY NOT THE MAP'S BIGGEST TOPIC. `consumer-electronics-recycling` (the
// biggest topic in the counts-loaded tree) carries 2140 pages — the brief's
// own >200-row rule. `mobile-phone-and-tablet-recycling` carries 41, matching
// the tree's own `pages: 41` for that slug, and stays small enough to commit
// and read at a glance.
//
// WHAT THIS SET DOES NOT PROVE, honestly: every row here is role `covers`,
// `direction: "in"`, from an admin session with no viewer restriction — there
// is no `intent`-role row, no page that resolves to more than one row, and no
// hidden-count row anywhere in the map's real associations sampled during this
// verification (checked here and against a second topic — see the report).
// The "one row per page" collapse and the hidden-row case are proven against
// the BUILDER's hand-built `pageAssociationsShape.ts` fixture instead
// (`useOutlineRows.test.tsx`, already passing and left in place); this file
// only proves the shape and the plain `in_place` case are recorded correctly.

import type { MapTopicAssociation } from "../../../types";

export const ALL_GREEN_ASSOC_TOPIC_SLUG = "mobile-phone-and-tablet-recycling";

/** 41 recorded `covers` rows, byte-identical to the RPC's answer. */
export const ALL_GREEN_PAGE_ASSOCIATIONS = [
  {
    "item": {
      "id": "33b3d35d-dc4e-452f-b8df-fa273bd0d6e8",
      "url": "https://allgreenrecycling.com/telephone-recycling",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/telephone-recycling",
      "clicks": 4,
      "status": "active",
      "impressions": 519,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Focuses on telephone recycling, material recovery, and equipment disposal for phones.",
        "source": "mapper",
        "confidence": 85
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "32c9ec60-fdc9-4929-a775-493f2f54e4f3",
      "url": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless",
      "clicks": 1,
      "status": "active",
      "impressions": 221,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'e waste recycling verizon 4g wireless verizon 4g wireless'.",
        "source": "mapper",
        "confidence": 60
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "41b56fc2-79a1-4cfd-8041-13eb4fae610b",
      "url": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-24",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-24",
      "clicks": 2,
      "status": "active",
      "impressions": 107,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'e waste recycling verizon 4g wireless verizon 4g wireless 24'.",
        "source": "mapper",
        "confidence": 62
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "58a7238d-f789-4ca6-88cf-af294a7230be",
      "url": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-6",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-6",
      "clicks": 5,
      "status": "active",
      "impressions": 142,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'e waste recycling verizon 4g wireless verizon 4g wireless 6'.",
        "source": "mapper",
        "confidence": 60
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "80540e23-0610-40cf-918b-dfa17d8e7856",
      "url": "https://allgreenrecycling.com/smartphone-e-waste-epidemic/amp",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/smartphone-e-waste-epidemic/amp",
      "clicks": 1,
      "status": "active",
      "impressions": 184,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'amp'.",
        "source": "mapper",
        "confidence": 70
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "be5ff916-1828-4b98-b7d8-eccad87b0133",
      "url": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-23",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-23",
      "clicks": 2,
      "status": "active",
      "impressions": 213,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'e waste recycling verizon 4g wireless verizon 4g wireless 23'.",
        "source": "mapper",
        "confidence": 60
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "ea1efb54-9524-4f30-837c-84302171c463",
      "url": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-10",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-10",
      "clicks": 1,
      "status": "active",
      "impressions": 163,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'e waste recycling verizon 4g wireless verizon 4g wireless 10'.",
        "source": "mapper",
        "confidence": 62
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "63264d08-949d-4844-87eb-929ff1b2658c",
      "url": "https://allgreenrecycling.com/certified-tablet-recycling",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/certified-tablet-recycling",
      "clicks": 0,
      "status": "active",
      "impressions": 260,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Title and section headings focus directly on tablet recycling, mobile devices, and how to recycle a tablet.",
        "source": "mapper",
        "confidence": 95
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "6b595a43-14bd-4ee4-982e-77750f02dc49",
      "url": "https://allgreenrecycling.com/secure-data-destruction/on-site-shredding/on-site-cell-phone-shredding",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/secure-data-destruction/on-site-shredding/on-site-cell-phone-shredding",
      "clicks": 0,
      "status": "active",
      "impressions": 156,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'on site cell phone shredding'.",
        "source": "mapper",
        "confidence": 65
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "6433b326-7d61-47bd-a9fe-f23f9a2731c2",
      "url": "https://allgreenrecycling.com/certified-small-electronic-recycling",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/certified-small-electronic-recycling",
      "clicks": 0,
      "status": "active",
      "impressions": 191,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Summary explicitly highlights cell phones alongside other small electronics recycling.",
        "source": "mapper",
        "confidence": 85
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "1e558258-cd0e-4f6d-85da-f389de5b3a65",
      "url": "https://allgreenrecycling.com/5-reasons-recycle-old-phone",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/5-reasons-recycle-old-phone",
      "clicks": 0,
      "status": "active",
      "impressions": 45,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads '5 reasons recycle old phone'.",
        "source": "mapper",
        "confidence": 70
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "bc61ce12-5615-455a-b9f4-5539759876b0",
      "url": "https://allgreenrecycling.com/cellular-phones-are-recycled-differently-from-other-electronics",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/cellular-phones-are-recycled-differently-from-other-electronics",
      "clicks": 0,
      "status": "active",
      "impressions": 31,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'cellular phones are recycled differently from other electronics'.",
        "source": "mapper",
        "confidence": 70
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "ce50b04b-1737-43cb-bf9c-cfa4ab89b0ba",
      "url": "https://allgreenrecycling.com/mobile-recycling",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/mobile-recycling",
      "clicks": 0,
      "status": "active",
      "impressions": 23,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'mobile recycling'.",
        "source": "mapper",
        "confidence": 65
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "1686064e-63b9-4134-bbd1-2c531936a0bd",
      "url": "https://allgreenrecycling.com/the-digital-dump",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/the-digital-dump",
      "clicks": 0,
      "status": "active",
      "impressions": 17,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Summary specifically highlights the discarding of 100 million cell phones.",
        "source": "mapper",
        "confidence": 70
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "8354667a-3cea-4a1e-9e6c-79138938c767",
      "url": "https://allgreenrecycling.com/news/new-nokia-smartphone-most-sustainable-to-date/amp",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/news/new-nokia-smartphone-most-sustainable-to-date/amp",
      "clicks": 0,
      "status": "active",
      "impressions": 14,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'amp'.",
        "source": "mapper",
        "confidence": 60
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "db313149-d039-49ed-ac37-ee750910e375",
      "url": "https://allgreenrecycling.com/certified-e-reader-recycling",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/certified-e-reader-recycling",
      "clicks": 0,
      "status": "active",
      "impressions": 10,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Page covers recycling e-readers, tablets, and handheld mobile devices across multiple detailed sections.",
        "source": "mapper",
        "confidence": 90
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "34456efb-e730-43eb-a04b-0eccbcdb0b81",
      "url": "https://allgreenrecycling.com/news/partner-spotlight-mission-viejo-library",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/news/partner-spotlight-mission-viejo-library",
      "clicks": 0,
      "status": "active",
      "impressions": 7,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Crawled summary specifies that the Mission Viejo Library is a cell phone recycling collection site.",
        "source": "mapper",
        "confidence": 88
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "c07cb14f-f68d-4910-8bff-cafe33ce8b39",
      "url": "https://allgreenrecycling.com/location/erecycle-drop-off-location-4g-verizon-wireless-drop-off-location-2",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/location/erecycle-drop-off-location-4g-verizon-wireless-drop-off-location-2",
      "clicks": 0,
      "status": "active",
      "impressions": 4,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "The URL specifies a Verizon Wireless drop-off location for recycling mobile devices.",
        "source": "mapper",
        "confidence": 75
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "649bdcb5-dd7d-4c88-a76c-c0b5e2fa21d2",
      "url": "https://allgreenrecycling.com/smartphone-e-waste-epidemic",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/smartphone-e-waste-epidemic",
      "clicks": 0,
      "status": "active",
      "impressions": 4,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'smartphone e waste epidemic'.",
        "source": "mapper",
        "confidence": 70
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "afd83284-7d0a-45cf-ba62-0b25909cf30b",
      "url": "https://allgreenrecycling.com/cell-phone-powered-by-walking",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/cell-phone-powered-by-walking",
      "clicks": 0,
      "status": "active",
      "impressions": 5,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'cell phone powered by walking'.",
        "source": "mapper",
        "confidence": 60
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "e2014e6c-df85-4a01-9085-00887b993ca5",
      "url": "https://allgreenrecycling.com/how-often-do-you-buy-a-new-phone",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/how-often-do-you-buy-a-new-phone",
      "clicks": 0,
      "status": "active",
      "impressions": 2,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'how often do you buy a new phone'.",
        "source": "mapper",
        "confidence": 62
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "4c08f7fd-6597-492c-9534-68a0f53f8dbc",
      "url": "https://allgreenrecycling.com/news/new-nokia-smartphone-most-sustainable-to-date",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/news/new-nokia-smartphone-most-sustainable-to-date",
      "clicks": 0,
      "status": "active",
      "impressions": 1,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'new nokia smartphone most sustainable to date'.",
        "source": "mapper",
        "confidence": 65
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "5a23f599-a54a-4148-a722-acd0150edc0d",
      "url": "https://allgreenrecycling.com/smartphone-recycling",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/smartphone-recycling",
      "clicks": 0,
      "status": "active",
      "impressions": 1,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "The page title and headings explicitly focus on how to responsibly recycle smartphones and pick-up services.",
        "source": "mapper",
        "confidence": 95
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "ac59ae36-a8cd-407d-9e85-d97f0580c973",
      "url": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-2",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-2",
      "clicks": 0,
      "status": "active",
      "impressions": 1,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'e waste recycling verizon 4g wireless verizon 4g wireless 2'.",
        "source": "mapper",
        "confidence": 60
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "e4374eba-7c48-4a3f-9a34-096802af5245",
      "url": "https://allgreenrecycling.com/cellular-phones-are-recycled-differently-from-other-electronics/amp",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/cellular-phones-are-recycled-differently-from-other-electronics/amp",
      "clicks": 0,
      "status": "active",
      "impressions": 1,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'amp'.",
        "source": "mapper",
        "confidence": 70
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "0dfe63da-07d0-425d-95ca-6aa61791255b",
      "url": "https://allgreenrecycling.com/tag/cell-phones",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/tag/cell-phones",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'cell phones'.",
        "source": "mapper",
        "confidence": 70
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "0f65d61b-6215-4b20-8dc8-442ba6e383f8",
      "url": "https://allgreenrecycling.com/how-green-is-your-phone",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/how-green-is-your-phone",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'how green is your phone'.",
        "source": "mapper",
        "confidence": 68
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "10340a3f-5422-4567-822f-fe4827d9f351",
      "url": "https://allgreenrecycling.com/how-green-is-your-phone/amp",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/how-green-is-your-phone/amp",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'amp'.",
        "source": "mapper",
        "confidence": 68
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "152a8e28-ec6a-4467-a469-cfc16dec34fd",
      "url": "https://allgreenrecycling.com/location/e-waste-recycling-computer-phone-repair-2090fix-computer-phone-repair",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/location/e-waste-recycling-computer-phone-repair-2090fix-computer-phone-repair",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Title explicitly includes phone recycling and repair drop-off services.",
        "source": "mapper",
        "confidence": 80
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "31b736fd-18c3-4430-8f4b-2aeb18e88a89",
      "url": "https://allgreenrecycling.com/is-your-iphone-green",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/is-your-iphone-green",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "The title 'Is Your IPhone Green' and content discuss environmental impacts and recycling considerations specific to iPhones and mobile phones.",
        "source": "mapper",
        "confidence": 88
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "3e80752c-c4eb-4ccf-aa15-3e3daf512ba8",
      "url": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-30",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-30",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'e waste recycling verizon 4g wireless verizon 4g wireless 30'.",
        "source": "mapper",
        "confidence": 62
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "51a5b349-ae5a-45c1-aa62-d7b9a8721851",
      "url": "https://allgreenrecycling.com/will-it-blend-iphone",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/will-it-blend-iphone",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'will it blend iphone'.",
        "source": "mapper",
        "confidence": 60
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "604a50ca-a41a-4865-8f16-96ae5e75a383",
      "url": "https://allgreenrecycling.com/sprint-offers-5000-prize-to-students-who-find-new-ways-to-recycle-smartphones",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/sprint-offers-5000-prize-to-students-who-find-new-ways-to-recycle-smartphones",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'sprint offers 5000 prize to students who find new ways to recycle smartphones'.",
        "source": "mapper",
        "confidence": 70
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "86df8f37-8ef4-42fb-b406-1a1b90a7834b",
      "url": "https://allgreenrecycling.com/tag/smartphone-e-waste",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/tag/smartphone-e-waste",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'smartphone e waste'.",
        "source": "mapper",
        "confidence": 68
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "880d62c8-3f62-48ee-94e0-8d5d5dc8ea2e",
      "url": "https://allgreenrecycling.com/is-your-iphone-green/amp",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/is-your-iphone-green/amp",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'amp'.",
        "source": "mapper",
        "confidence": 65
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "9980a46d-2bb5-48e0-9884-a68effda6e3b",
      "url": "https://www.allgreenrecycling.com/are-e-readers-eco-friendly-part-2/amp",
      "type": "web_page",
      "label": "https://www.allgreenrecycling.com/are-e-readers-eco-friendly-part-2/amp",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'amp'.",
        "source": "mapper",
        "confidence": 60
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "9ba0e6aa-6bda-4a3d-87a1-02aae45ad887",
      "url": "https://allgreenrecycling.com/portable-electronics-recycling",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/portable-electronics-recycling",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Covers recycling procedures and pickup handling for personal portable electronic devices.",
        "source": "mapper",
        "confidence": 75
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "d23e8c56-0536-4992-be06-a70fcf3145a9",
      "url": "https://allgreenrecycling.com/tag/recycle-your-old-phone",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/tag/recycle-your-old-phone",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'recycle your old phone'.",
        "source": "mapper",
        "confidence": 68
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "d33bbc0a-ff07-46d5-a099-c9bd2631df51",
      "url": "https://allgreenrecycling.com/evolution-of-cell-phone",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/evolution-of-cell-phone",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'evolution of cell phone'.",
        "source": "mapper",
        "confidence": 60
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "e4423047-f674-40d2-b079-c528019ab6d8",
      "url": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-17",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/location/e-waste-recycling-verizon-4g-wireless-verizon-4g-wireless-17",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'e waste recycling verizon 4g wireless verizon 4g wireless 17'.",
        "source": "mapper",
        "confidence": 60
      },
      "direction": "in"
    }
  },
  {
    "item": {
      "id": "e7910728-5c77-48a6-8e34-ffcd20cf88e5",
      "url": "https://allgreenrecycling.com/smartphone-recycling/amp",
      "type": "web_page",
      "label": "https://allgreenrecycling.com/smartphone-recycling/amp",
      "clicks": 0,
      "status": "active",
      "impressions": 0,
      "performance_window_days": 28
    },
    "topic": "mobile-phone-and-tablet-recycling",
    "association": {
      "kind": "web_page",
      "role": "covers",
      "payload": {
        "reason": "Not crawled; placed from the URL slug alone, which reads 'amp'.",
        "source": "mapper",
        "confidence": 70
      },
      "direction": "in"
    }
  }
] as unknown as MapTopicAssociation[];
