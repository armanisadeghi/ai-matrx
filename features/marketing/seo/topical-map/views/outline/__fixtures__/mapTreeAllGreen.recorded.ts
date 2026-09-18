// features/marketing/seo/topical-map/views/outline/__fixtures__/mapTreeAllGreen.recorded.ts
//
// RECORDED BYTES, not transcribed. Read via the Supabase MCP (project
// brsgrqvjdzwihsvnfqkf) on 2026-09-18 as the authenticated test admin
// (admin@admin.com, id 87a6e699-3622-4869-8843-d0867456c0dd), which the map's
// RLS (`seo._tm_map`) requires — a superuser session with no JWT claim gets
// `42501 topical_map_denied`.
//
//   select seo.map_tree('e9df6779-8e0e-45e9-a664-375e7d1ecffd', NULL, NULL,
//     '{description,status,counts,facets}'::text[], NULL);   -- ALL_GREEN_WITH_COUNTS
//   select seo.map_tree('e9df6779-8e0e-45e9-a664-375e7d1ecffd', NULL, NULL,
//     '{description,status}'::text[], NULL);                 -- ALL_GREEN_WITHOUT_COUNTS
//   select seo.map_tree('ff2010ec-f53d-4d8b-81d9-094c4ca73397', NULL, NULL,
//     '{status,counts}'::text[], NULL);                       -- FACTORY_PLAYGROUND_TREE
//
// All Green Recycling: total_topics = 50, but ROOT topics = 13, not the 14 the
// coordinator's VERIFIER-A brief names — recounted directly against the live
// map (`jsonb_array_length(map_tree(...)->'topics')`) and against this file's
// own `.topics.length`. Report this as a finding; the count below is the live
// map, not the brief's guess.
//
// Factory Playground: total_topics = 52 (matches the brief), 9 live root
// topics, every topic `status: "proposed"`, every count 0 (a proposed map with
// no accepted pages yet).
//
// Bytes are untouched: the JSON below is exactly what the two `execute_sql`
// calls returned, reformatted for TypeScript only (no field added, removed or
// renamed).

import type { MapTreeWholeResult } from "../../../types";

export const ALL_GREEN_MAP_ID = "e9df6779-8e0e-45e9-a664-375e7d1ecffd";
export const FACTORY_PLAYGROUND_MAP_ID = "ff2010ec-f53d-4d8b-81d9-094c4ca73397";

/** `include = ['description','status','counts','facets']`. 13 live root topics, 50 total. */
export const ALL_GREEN_WITH_COUNTS: MapTreeWholeResult = {
  "root": null,
  "map_id": "e9df6779-8e0e-45e9-a664-375e7d1ecffd",
  "topics": [
    {
      "name": "Consumer Electronics Recycling",
      "slug": "consumer-electronics-recycling",
      "pages": 2140,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "children": [
        {
          "name": "Audio and Home Entertainment Electronics Recycling",
          "slug": "audio-and-home-entertainment-electronics-recycling",
          "pages": 8,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Recycling and disposal services for speakers, audio equipment, stereo components, remote controls, VCRs, and home entertainment devices."
        },
        {
          "name": "Battery and Vape Disposal",
          "slug": "battery-and-vape-disposal",
          "pages": 9,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Drop-off, collection, and recycling for household, lithium-ion, and electronic cigarette/vape batteries."
        },
        {
          "name": "Cable and Wire Recycling",
          "slug": "cable-and-wire-recycling",
          "pages": 1,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Collection, stripping, and recycling services for power cables, computer cords, charging cables, and copper wiring."
        },
        {
          "name": "CD and Media Recycling",
          "slug": "cd-and-media-recycling",
          "pages": 6,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 8,
          "description": "Recycling, collection, and disposal guidance for compact discs, DVDs, Blu-rays, and optical storage media."
        },
        {
          "name": "CD Case Recycling",
          "slug": "cd-case-recycling",
          "pages": 4,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 16,
          "description": "Recycling and disposal guidance for jewel cases and plastic optical-media cases."
        },
        {
          "name": "Computer Recycling",
          "slug": "computer-recycling",
          "pages": 204,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 2,
          "description": "Disposal and recycling of desktop computers, personal laptops, and consumer PC hardware."
        },
        {
          "name": "CRT and TV Recycling",
          "slug": "crt-and-tv-recycling",
          "pages": 56,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 13,
          "description": "Legacy cathode-ray-tube televisions and monitors. High-volume consumer demand."
        },
        {
          "name": "E-Waste Recycling Events",
          "slug": "e-waste-recycling-events",
          "pages": 1277,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 3,
          "description": "Community and municipal temporary drop-off collection events for residential electronic waste."
        },
        {
          "name": "Electronic Waste Pickup Services",
          "slug": "electronic-waste-pickup-services",
          "pages": 16,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Collection and pickup services for residential and business electronics and electronic waste."
        },
        {
          "name": "Electronics Donation and Reuse",
          "slug": "electronics-donation-and-reuse",
          "pages": 32,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Donation programs, charitable giving, and non-profit reuse channels for working or repairable used electronics."
        },
        {
          "name": "Ink and Toner Cartridge Recycling",
          "slug": "ink-and-toner-cartridge-recycling",
          "pages": 3,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Collection, drop-off, and recycling programs for empty printer ink cartridges and laser toner cartridges."
        },
        {
          "name": "Light Bulb and Lamp Recycling",
          "slug": "light-bulb-and-lamp-recycling",
          "pages": 8,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Disposal, drop-off, and universal waste recycling services for fluorescent tubes, CFL bulbs, LEDs, and lighting lamps."
        },
        {
          "name": "Major Appliance Recycling and Disposal",
          "slug": "major-appliance-recycling-and-disposal",
          "pages": 6,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Recycling, Freon recovery, and disposal services for large household appliances including air conditioners, refrigerators, and washing machines."
        },
        {
          "name": "Medical Equipment Recycling and Disposal",
          "slug": "medical-equipment-recycling-and-disposal",
          "pages": 4,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Recycling, disposition, asset recovery, and specialized disposal for used medical equipment, clinical devices, and healthcare technology."
        },
        {
          "name": "Mobile Phone and Tablet Recycling",
          "slug": "mobile-phone-and-tablet-recycling",
          "pages": 41,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Recycling, drop-off, and disposal services for cell phones, smartphones, tablets, and mobile devices."
        },
        {
          "name": "Printer Recycling",
          "slug": "printer-recycling",
          "pages": 15,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Recycling, drop-off, and disposal services for home and office printers, copiers, scanners, and fax machines."
        },
        {
          "name": "Sewing Machine Recycling",
          "slug": "sewing-machine-recycling",
          "pages": 2,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Disposal, donation, and recycling options for vintage, electric, and motorized sewing machines."
        },
        {
          "name": "Small Appliance Recycling",
          "slug": "small-appliance-recycling",
          "pages": 8,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Recycling and disposal options for consumer small household appliances including microwaves, toasters, irons, and toaster ovens."
        },
        {
          "name": "Used Electronics Resale and Trade-In",
          "slug": "used-electronics-resale-and-trade-in",
          "pages": 14,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Consumer venues for selling or trading in used personal electronics and devices."
        },
        {
          "name": "VHS Tape and Magnetic Media Recycling",
          "slug": "vhs-tape-and-magnetic-media-recycling",
          "pages": 4,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Disposal, donation, and specialized recycling for VHS tapes, cassette tapes, and magnetic media."
        }
      ],
      "keywords": 35,
      "description": "Public drop-off and municipal/consumer recycling of household e-waste and personal electronics."
    },
    {
      "name": "Data Destruction Services",
      "slug": "data-destruction-services",
      "pages": 497,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "children": [
        {
          "name": "Data Degaussing Services",
          "slug": "data-degaussing-services",
          "pages": 9,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Magnetic degaussing and sanitization services for hard drives, magnetic tapes, and storage media."
        },
        {
          "name": "Data Destruction Equipment",
          "slug": "data-destruction-equipment",
          "pages": 1,
          "facets": {
            "offering_kind": "product"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Commercial and industrial machines, hardware tools, and equipment used for destroying physical data storage media."
        },
        {
          "name": "Data Sanitization and Erasure",
          "slug": "data-sanitization-and-erasure",
          "pages": 27,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "children": [
            {
              "name": "Data Wiping Software and Freeware",
              "slug": "data-wiping-software-and-freeware",
              "pages": 0,
              "facets": {
                "offering_kind": "product"
              },
              "status": "active",
              "planned": 0,
              "keywords": 1,
              "description": "Free, open-source, and commercial disk erasure software tools and utilities for wiping hard drives."
            }
          ],
          "keywords": 0,
          "description": "Software-based media sanitization, data wiping, and certified overwrite/erasure complying with NIST 800-88 and DoD standards without physical destruction."
        },
        {
          "name": "Hard Drive Crushing",
          "slug": "hard-drive-crushing",
          "pages": 2,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Physical crushing, bending, and mechanical punching of hard drives and SSDs for secure data destruction."
        },
        {
          "name": "Hard Drive Recycling and Disposal",
          "slug": "hard-drive-recycling-and-disposal",
          "pages": 19,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Collection, recycling, and hardware disposal for hard disk drives and solid state drives."
        },
        {
          "name": "Hard Drive Shredding",
          "slug": "hard-drive-shredding",
          "pages": 202,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Physical shredding and destruction of computer hard drives and SSDs."
        },
        {
          "name": "Magnetic Tape Destruction",
          "slug": "magnetic-tape-destruction",
          "pages": 6,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Physical shredding and secure certified destruction of backup tapes, LTO tapes, and magnetic data media cartridges."
        },
        {
          "name": "Product and Recall Destruction",
          "slug": "product-and-recall-destruction",
          "pages": 18,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Certified physical destruction and disposal of recalled, defective, obsolete, or brand-sensitive consumer products and manufactured goods."
        },
        {
          "name": "Shredding Franchises",
          "slug": "shredding-franchises",
          "pages": 1,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 1,
          "description": "Franchise business opportunities and franchise ownership in mobile and facility-based shredding and secure destruction."
        }
      ],
      "keywords": 104,
      "description": "Commercial and certified destruction of digital data and storage media, including hard drive shredding and degaussing."
    },
    {
      "name": "Data Recovery Services",
      "slug": "data-recovery-services",
      "pages": 2,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "keywords": 0,
      "description": "Professional retrieval and recovery of lost, corrupted, or deleted digital files and data from damaged or failed hard drives, SSDs, and storage devices."
    },
    {
      "name": "Document Shredding Services",
      "slug": "document-shredding-services",
      "pages": 7,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "children": [
        {
          "name": "Medical Records and PHI Destruction",
          "slug": "medical-records-and-phi-destruction",
          "pages": 9,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Certified destruction and shredding of physical and digital medical records, protected health information (PHI), and HIPAA-regulated healthcare documentation."
        }
      ],
      "keywords": 0,
      "description": "Secure on-site and off-site shredding and certified disposal of confidential paper records and physical enterprise documents."
    },
    {
      "name": "e-Stewards and R2 Recycling Certification",
      "slug": "e-stewards-and-r2-recycling-certification",
      "pages": 10,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "keywords": 0,
      "description": "Consulting, audits, and compliance services for e-Stewards, R2, and environmental recycling certifications."
    },
    {
      "name": "Electronic Scrap Trading and Purchasing",
      "slug": "electronic-scrap-trading-and-purchasing",
      "pages": 10,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "keywords": 0,
      "description": "B2B and commodity buying, selling, and sourcing of scrap electronics, circuit boards, and precious metal e-scrap."
    },
    {
      "name": "General Recycling and Material Disposal",
      "slug": "general-recycling-and-material-disposal",
      "pages": 123,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "children": [
        {
          "name": "Hazardous Waste Disposal",
          "slug": "hazardous-waste-disposal",
          "pages": 16,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Collection, drop-off, and treatment services for municipal and industrial household hazardous waste (HHW) and toxic materials."
        },
        {
          "name": "Scrap Metal Recycling",
          "slug": "scrap-metal-recycling",
          "pages": 3,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Collection, processing, and recycling services for ferrous and non-ferrous scrap metals."
        }
      ],
      "keywords": 0,
      "description": "General municipal, municipal drop-off, cardboard, paper, and non-electronic material recycling services and centers."
    },
    {
      "name": "IT Asset Disposition (ITAD)",
      "slug": "it-asset-disposition-itad",
      "pages": 480,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "children": [
        {
          "name": "Data Center Decommissioning and Recycling",
          "slug": "data-center-decommissioning-and-recycling",
          "pages": 5,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Decommissioning, teardown, data sanitization, and hardware recycling services specifically for enterprise data center infrastructure and server facilities."
        },
        {
          "name": "IT Remarketing and Value Recovery",
          "slug": "it-remarketing-and-value-recovery",
          "pages": 31,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Refurbishing, remarketing, and secondary resale of decommissioned enterprise IT hardware and corporate electronic assets."
        },
        {
          "name": "Reverse Logistics",
          "slug": "reverse-logistics",
          "pages": 7,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "Supply chain and logistics management for product returns, asset recovery, and end-of-life electronics intake."
        }
      ],
      "keywords": 242,
      "description": "Enterprise IT asset disposition: corporate decommissioning, chain of custody, certified destruction, and value recovery."
    },
    {
      "name": "legal",
      "slug": "legal",
      "pages": 1,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "keywords": 0,
      "description": null
    },
    {
      "name": "Marketing Services",
      "slug": "marketing-services",
      "pages": 2,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "children": [
        {
          "name": "SEO Services",
          "slug": "seo-services",
          "pages": 0,
          "facets": {
            "offering_kind": "service"
          },
          "status": "active",
          "planned": 0,
          "keywords": 0,
          "description": "SEO consulting, agency services and campaign management sold to a client."
        }
      ],
      "keywords": 0,
      "description": "What a marketing firm actually sells."
    },
    {
      "name": "Records Storage and Offsite Media Vaulting",
      "slug": "records-storage-and-offsite-media-vaulting",
      "pages": 1,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "keywords": 0,
      "description": "Secure physical off-site archival, vaulting, and climate-controlled storage for magnetic tape backups, data records, and critical business documents."
    },
    {
      "name": "Recycling Business Franchises",
      "slug": "recycling-business-franchises",
      "pages": 11,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "keywords": 0,
      "description": "Franchise investment and business opportunities across e-waste, scrap, and general recycling centers."
    },
    {
      "name": "regulatory compliance",
      "slug": "regulatory-compliance",
      "pages": 194,
      "facets": {
        "offering_kind": "service"
      },
      "status": "active",
      "planned": 0,
      "keywords": 0,
      "description": null
    }
  ],
  "total_topics": 50
};

/** The SAME map, `include = ['description','status']` — no counts, no facets. */
export const ALL_GREEN_WITHOUT_COUNTS: MapTreeWholeResult = {
  "root": null,
  "map_id": "e9df6779-8e0e-45e9-a664-375e7d1ecffd",
  "topics": [
    {
      "name": "Consumer Electronics Recycling",
      "slug": "consumer-electronics-recycling",
      "status": "active",
      "children": [
        {
          "name": "Audio and Home Entertainment Electronics Recycling",
          "slug": "audio-and-home-entertainment-electronics-recycling",
          "status": "active",
          "description": "Recycling and disposal services for speakers, audio equipment, stereo components, remote controls, VCRs, and home entertainment devices."
        },
        {
          "name": "Battery and Vape Disposal",
          "slug": "battery-and-vape-disposal",
          "status": "active",
          "description": "Drop-off, collection, and recycling for household, lithium-ion, and electronic cigarette/vape batteries."
        },
        {
          "name": "Cable and Wire Recycling",
          "slug": "cable-and-wire-recycling",
          "status": "active",
          "description": "Collection, stripping, and recycling services for power cables, computer cords, charging cables, and copper wiring."
        },
        {
          "name": "CD and Media Recycling",
          "slug": "cd-and-media-recycling",
          "status": "active",
          "description": "Recycling, collection, and disposal guidance for compact discs, DVDs, Blu-rays, and optical storage media."
        },
        {
          "name": "CD Case Recycling",
          "slug": "cd-case-recycling",
          "status": "active",
          "description": "Recycling and disposal guidance for jewel cases and plastic optical-media cases."
        },
        {
          "name": "Computer Recycling",
          "slug": "computer-recycling",
          "status": "active",
          "description": "Disposal and recycling of desktop computers, personal laptops, and consumer PC hardware."
        },
        {
          "name": "CRT and TV Recycling",
          "slug": "crt-and-tv-recycling",
          "status": "active",
          "description": "Legacy cathode-ray-tube televisions and monitors. High-volume consumer demand."
        },
        {
          "name": "E-Waste Recycling Events",
          "slug": "e-waste-recycling-events",
          "status": "active",
          "description": "Community and municipal temporary drop-off collection events for residential electronic waste."
        },
        {
          "name": "Electronic Waste Pickup Services",
          "slug": "electronic-waste-pickup-services",
          "status": "active",
          "description": "Collection and pickup services for residential and business electronics and electronic waste."
        },
        {
          "name": "Electronics Donation and Reuse",
          "slug": "electronics-donation-and-reuse",
          "status": "active",
          "description": "Donation programs, charitable giving, and non-profit reuse channels for working or repairable used electronics."
        },
        {
          "name": "Ink and Toner Cartridge Recycling",
          "slug": "ink-and-toner-cartridge-recycling",
          "status": "active",
          "description": "Collection, drop-off, and recycling programs for empty printer ink cartridges and laser toner cartridges."
        },
        {
          "name": "Light Bulb and Lamp Recycling",
          "slug": "light-bulb-and-lamp-recycling",
          "status": "active",
          "description": "Disposal, drop-off, and universal waste recycling services for fluorescent tubes, CFL bulbs, LEDs, and lighting lamps."
        },
        {
          "name": "Major Appliance Recycling and Disposal",
          "slug": "major-appliance-recycling-and-disposal",
          "status": "active",
          "description": "Recycling, Freon recovery, and disposal services for large household appliances including air conditioners, refrigerators, and washing machines."
        },
        {
          "name": "Medical Equipment Recycling and Disposal",
          "slug": "medical-equipment-recycling-and-disposal",
          "status": "active",
          "description": "Recycling, disposition, asset recovery, and specialized disposal for used medical equipment, clinical devices, and healthcare technology."
        },
        {
          "name": "Mobile Phone and Tablet Recycling",
          "slug": "mobile-phone-and-tablet-recycling",
          "status": "active",
          "description": "Recycling, drop-off, and disposal services for cell phones, smartphones, tablets, and mobile devices."
        },
        {
          "name": "Printer Recycling",
          "slug": "printer-recycling",
          "status": "active",
          "description": "Recycling, drop-off, and disposal services for home and office printers, copiers, scanners, and fax machines."
        },
        {
          "name": "Sewing Machine Recycling",
          "slug": "sewing-machine-recycling",
          "status": "active",
          "description": "Disposal, donation, and recycling options for vintage, electric, and motorized sewing machines."
        },
        {
          "name": "Small Appliance Recycling",
          "slug": "small-appliance-recycling",
          "status": "active",
          "description": "Recycling and disposal options for consumer small household appliances including microwaves, toasters, irons, and toaster ovens."
        },
        {
          "name": "Used Electronics Resale and Trade-In",
          "slug": "used-electronics-resale-and-trade-in",
          "status": "active",
          "description": "Consumer venues for selling or trading in used personal electronics and devices."
        },
        {
          "name": "VHS Tape and Magnetic Media Recycling",
          "slug": "vhs-tape-and-magnetic-media-recycling",
          "status": "active",
          "description": "Disposal, donation, and specialized recycling for VHS tapes, cassette tapes, and magnetic media."
        }
      ],
      "description": "Public drop-off and municipal/consumer recycling of household e-waste and personal electronics."
    },
    {
      "name": "Data Destruction Services",
      "slug": "data-destruction-services",
      "status": "active",
      "children": [
        {
          "name": "Data Degaussing Services",
          "slug": "data-degaussing-services",
          "status": "active",
          "description": "Magnetic degaussing and sanitization services for hard drives, magnetic tapes, and storage media."
        },
        {
          "name": "Data Destruction Equipment",
          "slug": "data-destruction-equipment",
          "status": "active",
          "description": "Commercial and industrial machines, hardware tools, and equipment used for destroying physical data storage media."
        },
        {
          "name": "Data Sanitization and Erasure",
          "slug": "data-sanitization-and-erasure",
          "status": "active",
          "children": [
            {
              "name": "Data Wiping Software and Freeware",
              "slug": "data-wiping-software-and-freeware",
              "status": "active",
              "description": "Free, open-source, and commercial disk erasure software tools and utilities for wiping hard drives."
            }
          ],
          "description": "Software-based media sanitization, data wiping, and certified overwrite/erasure complying with NIST 800-88 and DoD standards without physical destruction."
        },
        {
          "name": "Hard Drive Crushing",
          "slug": "hard-drive-crushing",
          "status": "active",
          "description": "Physical crushing, bending, and mechanical punching of hard drives and SSDs for secure data destruction."
        },
        {
          "name": "Hard Drive Recycling and Disposal",
          "slug": "hard-drive-recycling-and-disposal",
          "status": "active",
          "description": "Collection, recycling, and hardware disposal for hard disk drives and solid state drives."
        },
        {
          "name": "Hard Drive Shredding",
          "slug": "hard-drive-shredding",
          "status": "active",
          "description": "Physical shredding and destruction of computer hard drives and SSDs."
        },
        {
          "name": "Magnetic Tape Destruction",
          "slug": "magnetic-tape-destruction",
          "status": "active",
          "description": "Physical shredding and secure certified destruction of backup tapes, LTO tapes, and magnetic data media cartridges."
        },
        {
          "name": "Product and Recall Destruction",
          "slug": "product-and-recall-destruction",
          "status": "active",
          "description": "Certified physical destruction and disposal of recalled, defective, obsolete, or brand-sensitive consumer products and manufactured goods."
        },
        {
          "name": "Shredding Franchises",
          "slug": "shredding-franchises",
          "status": "active",
          "description": "Franchise business opportunities and franchise ownership in mobile and facility-based shredding and secure destruction."
        }
      ],
      "description": "Commercial and certified destruction of digital data and storage media, including hard drive shredding and degaussing."
    },
    {
      "name": "Data Recovery Services",
      "slug": "data-recovery-services",
      "status": "active",
      "description": "Professional retrieval and recovery of lost, corrupted, or deleted digital files and data from damaged or failed hard drives, SSDs, and storage devices."
    },
    {
      "name": "Document Shredding Services",
      "slug": "document-shredding-services",
      "status": "active",
      "children": [
        {
          "name": "Medical Records and PHI Destruction",
          "slug": "medical-records-and-phi-destruction",
          "status": "active",
          "description": "Certified destruction and shredding of physical and digital medical records, protected health information (PHI), and HIPAA-regulated healthcare documentation."
        }
      ],
      "description": "Secure on-site and off-site shredding and certified disposal of confidential paper records and physical enterprise documents."
    },
    {
      "name": "e-Stewards and R2 Recycling Certification",
      "slug": "e-stewards-and-r2-recycling-certification",
      "status": "active",
      "description": "Consulting, audits, and compliance services for e-Stewards, R2, and environmental recycling certifications."
    },
    {
      "name": "Electronic Scrap Trading and Purchasing",
      "slug": "electronic-scrap-trading-and-purchasing",
      "status": "active",
      "description": "B2B and commodity buying, selling, and sourcing of scrap electronics, circuit boards, and precious metal e-scrap."
    },
    {
      "name": "General Recycling and Material Disposal",
      "slug": "general-recycling-and-material-disposal",
      "status": "active",
      "children": [
        {
          "name": "Hazardous Waste Disposal",
          "slug": "hazardous-waste-disposal",
          "status": "active",
          "description": "Collection, drop-off, and treatment services for municipal and industrial household hazardous waste (HHW) and toxic materials."
        },
        {
          "name": "Scrap Metal Recycling",
          "slug": "scrap-metal-recycling",
          "status": "active",
          "description": "Collection, processing, and recycling services for ferrous and non-ferrous scrap metals."
        }
      ],
      "description": "General municipal, municipal drop-off, cardboard, paper, and non-electronic material recycling services and centers."
    },
    {
      "name": "IT Asset Disposition (ITAD)",
      "slug": "it-asset-disposition-itad",
      "status": "active",
      "children": [
        {
          "name": "Data Center Decommissioning and Recycling",
          "slug": "data-center-decommissioning-and-recycling",
          "status": "active",
          "description": "Decommissioning, teardown, data sanitization, and hardware recycling services specifically for enterprise data center infrastructure and server facilities."
        },
        {
          "name": "IT Remarketing and Value Recovery",
          "slug": "it-remarketing-and-value-recovery",
          "status": "active",
          "description": "Refurbishing, remarketing, and secondary resale of decommissioned enterprise IT hardware and corporate electronic assets."
        },
        {
          "name": "Reverse Logistics",
          "slug": "reverse-logistics",
          "status": "active",
          "description": "Supply chain and logistics management for product returns, asset recovery, and end-of-life electronics intake."
        }
      ],
      "description": "Enterprise IT asset disposition: corporate decommissioning, chain of custody, certified destruction, and value recovery."
    },
    {
      "name": "legal",
      "slug": "legal",
      "status": "active",
      "description": null
    },
    {
      "name": "Marketing Services",
      "slug": "marketing-services",
      "status": "active",
      "children": [
        {
          "name": "SEO Services",
          "slug": "seo-services",
          "status": "active",
          "description": "SEO consulting, agency services and campaign management sold to a client."
        }
      ],
      "description": "What a marketing firm actually sells."
    },
    {
      "name": "Records Storage and Offsite Media Vaulting",
      "slug": "records-storage-and-offsite-media-vaulting",
      "status": "active",
      "description": "Secure physical off-site archival, vaulting, and climate-controlled storage for magnetic tape backups, data records, and critical business documents."
    },
    {
      "name": "Recycling Business Franchises",
      "slug": "recycling-business-franchises",
      "status": "active",
      "description": "Franchise investment and business opportunities across e-waste, scrap, and general recycling centers."
    },
    {
      "name": "regulatory compliance",
      "slug": "regulatory-compliance",
      "status": "active",
      "description": null
    }
  ],
  "total_topics": 50
};

/** `include = ['status','counts']`. 9 live root topics, 52 total, every topic `status: "proposed"`. */
export const FACTORY_PLAYGROUND_TREE: MapTreeWholeResult = {
  "root": null,
  "map_id": "ff2010ec-f53d-4d8b-81d9-094c4ca73397",
  "topics": [
    {
      "name": "IT Asset Disposition",
      "slug": "it-asset-disposition",
      "pages": 0,
      "status": "proposed",
      "planned": 0,
      "children": [
        {
          "name": "Asset Collection & Logistics",
          "slug": "asset-collection-logistics",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "children": [
            {
              "name": "On-Site Asset Pickup",
              "slug": "on-site-asset-pickup",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            },
            {
              "name": "Packaging & Transport",
              "slug": "packaging-and-transport",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            }
          ],
          "keywords": 0
        },
        {
          "name": "Refurbishment & Redeployment",
          "slug": "refurbishment-and-redeployment",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "children": [
            {
              "name": "Equipment Testing & Grading",
              "slug": "equipment-testing-and-grading",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            },
            {
              "name": "IT Equipment Refurbishment",
              "slug": "it-equipment-refurbishment",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            },
            {
              "name": "Redeployment Services",
              "slug": "redeployment-services",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            }
          ],
          "keywords": 0
        },
        {
          "name": "Lease Buyback Programs",
          "slug": "lease-buyback-programs",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        }
      ],
      "keywords": 0
    },
    {
      "name": "Secure Data Destruction",
      "slug": "secure-data-destruction",
      "pages": 0,
      "status": "proposed",
      "planned": 0,
      "children": [
        {
          "name": "Data Wiping Methods",
          "slug": "data-wiping-methods",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "children": [
            {
              "name": "Software Data Wiping",
              "slug": "software-data-wiping",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            },
            {
              "name": "Degaussing Services",
              "slug": "degaussing-services",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            }
          ],
          "keywords": 0
        },
        {
          "name": "Hard Drive Shredding",
          "slug": "hard-drive-shredding",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "children": [
            {
              "name": "On-Site Hard Drive Shredding",
              "slug": "onsite-hard-drive-shredding",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            },
            {
              "name": "Off-Site Hard Drive Shredding",
              "slug": "offsite-hard-drive-shredding",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            },
            {
              "name": "Mobile Shredding Fleet",
              "slug": "mobile-shredding-fleet",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            }
          ],
          "keywords": 0
        },
        {
          "name": "Certificates of Data Destruction",
          "slug": "certificates-of-data-destruction",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        },
        {
          "name": "Security Protocols & Personnel Vetting",
          "slug": "security-protocols-and-personnel-vetting",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        }
      ],
      "keywords": 0
    },
    {
      "name": "Certified Electronics Recycling",
      "slug": "certified-electronics-recycling",
      "pages": 0,
      "status": "proposed",
      "planned": 0,
      "children": [
        {
          "name": "Zero-Landfill Recycling Program",
          "slug": "zero-landfill-recycling-program",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        },
        {
          "name": "Electronics Dismantling & Processing",
          "slug": "electronics-dismantling-and-processing",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        },
        {
          "name": "Certificates of Recycling",
          "slug": "certificates-of-recycling",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        },
        {
          "name": "Consumer Drop-Off Recycling Program",
          "slug": "consumer-drop-off-recycling-program",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        }
      ],
      "keywords": 0
    },
    {
      "name": "Certified Equipment Destruction",
      "slug": "certified-equipment-destruction",
      "pages": 0,
      "status": "proposed",
      "planned": 0,
      "children": [
        {
          "name": "Product Destruction for Brand Protection",
          "slug": "product-destruction-for-brand-protection",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        },
        {
          "name": "Gray Market Diversion Prevention",
          "slug": "gray-market-diversion-prevention",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        }
      ],
      "keywords": 0
    },
    {
      "name": "IT Asset Remarketing & Value Recovery",
      "slug": "it-asset-remarketing-value-recovery",
      "pages": 0,
      "status": "proposed",
      "planned": 0,
      "children": [
        {
          "name": "Refurbished Equipment Resale",
          "slug": "refurbished-equipment-resale",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        },
        {
          "name": "Microsoft Authorized Refurbisher Program",
          "slug": "microsoft-authorized-refurbisher-program",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        },
        {
          "name": "Residual Value Recovery Consulting",
          "slug": "residual-value-recovery-consulting",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        }
      ],
      "keywords": 0
    },
    {
      "name": "Reverse Logistics",
      "slug": "reverse-logistics",
      "pages": 0,
      "status": "proposed",
      "planned": 0,
      "children": [
        {
          "name": "Returns Management",
          "slug": "returns-management",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        },
        {
          "name": "Inventory & Asset Tracking",
          "slug": "inventory-and-asset-tracking",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        },
        {
          "name": "Fulfillment Services",
          "slug": "fulfillment-services",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        }
      ],
      "keywords": 0
    },
    {
      "name": "Compliance & Certifications",
      "slug": "compliance-and-certifications",
      "pages": 0,
      "status": "proposed",
      "planned": 0,
      "children": [
        {
          "name": "Recycling Certifications",
          "slug": "recycling-certifications",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "children": [
            {
              "name": "R2 (Responsible Recycling) Certification",
              "slug": "r2-responsible-recycling-certification",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            },
            {
              "name": "e-Stewards Certification",
              "slug": "e-stewards-certification",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            },
            {
              "name": "ISO 14001 Environmental Management",
              "slug": "iso-14001-environmental-management",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            }
          ],
          "keywords": 0
        },
        {
          "name": "Data Security Compliance Standards",
          "slug": "data-security-compliance-standards",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "children": [
            {
              "name": "HIPAA-Compliant Data Handling",
              "slug": "hipaa-compliant-data-handling",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            },
            {
              "name": "NIST SP 800-88 Compliance",
              "slug": "nist-sp-800-88-compliance",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            },
            {
              "name": "DoD 5220.22-M Compliance",
              "slug": "dod-5220-22-m-compliance",
              "pages": 0,
              "status": "proposed",
              "planned": 0,
              "keywords": 0
            }
          ],
          "keywords": 0
        },
        {
          "name": "SA8000 Ethical Labor Policy",
          "slug": "sa8000-ethical-labor-policy",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        },
        {
          "name": "North America-Only Processing Policy",
          "slug": "north-america-only-processing-policy",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        }
      ],
      "keywords": 0
    },
    {
      "name": "Data Center Decommissioning",
      "slug": "data-center-decommissioning",
      "pages": 0,
      "status": "proposed",
      "planned": 0,
      "children": [
        {
          "name": "Hyperscale Data Center Decommissioning",
          "slug": "hyperscale-data-center-decommissioning",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        },
        {
          "name": "Data Center Hardware Refresh Services",
          "slug": "data-center-hardware-refresh-services",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        }
      ],
      "keywords": 0
    },
    {
      "name": "Chain-of-Custody Technology",
      "slug": "chain-of-custody-technology",
      "pages": 0,
      "status": "proposed",
      "planned": 0,
      "children": [
        {
          "name": "Green Pulse Asset Tracking Portal",
          "slug": "green-pulse-asset-tracking-portal",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        },
        {
          "name": "Green Pulse Data Annihilator",
          "slug": "green-pulse-data-annihilator",
          "pages": 0,
          "status": "proposed",
          "planned": 0,
          "keywords": 0
        }
      ],
      "keywords": 0
    }
  ],
  "total_topics": 52
};

