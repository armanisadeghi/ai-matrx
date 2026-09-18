// features/marketing/seo/topical-map/views/table/__fixtures__/allGreenMapTree.ts
//
// 🚨 RECORDED, NOT WRITTEN. Every byte below came back from
//
//   select seo.map_tree('e9df6779-8e0e-45e9-a664-375e7d1ecffd', null, null,
//                       array['description','status','counts','facets'],
//                       'd0aff5b6-0710-4848-8304-164db3c80ab7')
//
// on the live database (project brsgrqvjdzwihsvnfqkf) on 2026-09-18, read as
// the test admin (`request.jwt.claims.sub = 87a6e699-…`, role `authenticated`,
// both `set_config(…, true)` so nothing outlived the statement). It is the
// All Green Recycling map exactly as the table view reads it: 50 topics, the
// site's counts, the `offering_kind` facet on every topic, two topics with a
// null description. Nothing was edited by hand; a re-record replaces the whole
// object.

import type { MapTreeResult } from "../../../types";

export const RECORDED_ALL_GREEN_MAP_TREE: MapTreeResult = {
  root: null,
  map_id: "e9df6779-8e0e-45e9-a664-375e7d1ecffd",
  topics: [
    {
      name: "Consumer Electronics Recycling",
      slug: "consumer-electronics-recycling",
      pages: 2140,
      facets: { offering_kind: "service" },
      status: "active",
      planned: 0,
      children: [
        { name: "Audio and Home Entertainment Electronics Recycling", slug: "audio-and-home-entertainment-electronics-recycling", pages: 8, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Recycling and disposal services for speakers, audio equipment, stereo components, remote controls, VCRs, and home entertainment devices." },
        { name: "Battery and Vape Disposal", slug: "battery-and-vape-disposal", pages: 9, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Drop-off, collection, and recycling for household, lithium-ion, and electronic cigarette/vape batteries." },
        { name: "Cable and Wire Recycling", slug: "cable-and-wire-recycling", pages: 1, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Collection, stripping, and recycling services for power cables, computer cords, charging cables, and copper wiring." },
        { name: "CD and Media Recycling", slug: "cd-and-media-recycling", pages: 6, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 8, description: "Recycling, collection, and disposal guidance for compact discs, DVDs, Blu-rays, and optical storage media." },
        { name: "CD Case Recycling", slug: "cd-case-recycling", pages: 4, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 16, description: "Recycling and disposal guidance for jewel cases and plastic optical-media cases." },
        { name: "Computer Recycling", slug: "computer-recycling", pages: 204, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 2, description: "Disposal and recycling of desktop computers, personal laptops, and consumer PC hardware." },
        { name: "CRT and TV Recycling", slug: "crt-and-tv-recycling", pages: 56, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 13, description: "Legacy cathode-ray-tube televisions and monitors. High-volume consumer demand." },
        { name: "E-Waste Recycling Events", slug: "e-waste-recycling-events", pages: 1277, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 3, description: "Community and municipal temporary drop-off collection events for residential electronic waste." },
        { name: "Electronic Waste Pickup Services", slug: "electronic-waste-pickup-services", pages: 16, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Collection and pickup services for residential and business electronics and electronic waste." },
        { name: "Electronics Donation and Reuse", slug: "electronics-donation-and-reuse", pages: 32, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Donation programs, charitable giving, and non-profit reuse channels for working or repairable used electronics." },
        { name: "Ink and Toner Cartridge Recycling", slug: "ink-and-toner-cartridge-recycling", pages: 3, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Collection, drop-off, and recycling programs for empty printer ink cartridges and laser toner cartridges." },
        { name: "Light Bulb and Lamp Recycling", slug: "light-bulb-and-lamp-recycling", pages: 8, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Disposal, drop-off, and universal waste recycling services for fluorescent tubes, CFL bulbs, LEDs, and lighting lamps." },
        { name: "Major Appliance Recycling and Disposal", slug: "major-appliance-recycling-and-disposal", pages: 6, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Recycling, Freon recovery, and disposal services for large household appliances including air conditioners, refrigerators, and washing machines." },
        { name: "Medical Equipment Recycling and Disposal", slug: "medical-equipment-recycling-and-disposal", pages: 4, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Recycling, disposition, asset recovery, and specialized disposal for used medical equipment, clinical devices, and healthcare technology." },
        { name: "Mobile Phone and Tablet Recycling", slug: "mobile-phone-and-tablet-recycling", pages: 41, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Recycling, drop-off, and disposal services for cell phones, smartphones, tablets, and mobile devices." },
        { name: "Printer Recycling", slug: "printer-recycling", pages: 15, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Recycling, drop-off, and disposal services for home and office printers, copiers, scanners, and fax machines." },
        { name: "Sewing Machine Recycling", slug: "sewing-machine-recycling", pages: 2, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Disposal, donation, and recycling options for vintage, electric, and motorized sewing machines." },
        { name: "Small Appliance Recycling", slug: "small-appliance-recycling", pages: 8, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Recycling and disposal options for consumer small household appliances including microwaves, toasters, irons, and toaster ovens." },
        { name: "Used Electronics Resale and Trade-In", slug: "used-electronics-resale-and-trade-in", pages: 14, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Consumer venues for selling or trading in used personal electronics and devices." },
        { name: "VHS Tape and Magnetic Media Recycling", slug: "vhs-tape-and-magnetic-media-recycling", pages: 4, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Disposal, donation, and specialized recycling for VHS tapes, cassette tapes, and magnetic media." },
      ],
      keywords: 35,
      description: "Public drop-off and municipal/consumer recycling of household e-waste and personal electronics.",
    },
    {
      name: "Data Destruction Services",
      slug: "data-destruction-services",
      pages: 497,
      facets: { offering_kind: "service" },
      status: "active",
      planned: 0,
      children: [
        { name: "Data Degaussing Services", slug: "data-degaussing-services", pages: 9, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Magnetic degaussing and sanitization services for hard drives, magnetic tapes, and storage media." },
        { name: "Data Destruction Equipment", slug: "data-destruction-equipment", pages: 1, facets: { offering_kind: "product" }, status: "active", planned: 0, keywords: 0, description: "Commercial and industrial machines, hardware tools, and equipment used for destroying physical data storage media." },
        {
          name: "Data Sanitization and Erasure",
          slug: "data-sanitization-and-erasure",
          pages: 27,
          facets: { offering_kind: "service" },
          status: "active",
          planned: 0,
          children: [
            { name: "Data Wiping Software and Freeware", slug: "data-wiping-software-and-freeware", pages: 0, facets: { offering_kind: "product" }, status: "active", planned: 0, keywords: 1, description: "Free, open-source, and commercial disk erasure software tools and utilities for wiping hard drives." },
          ],
          keywords: 0,
          description: "Software-based media sanitization, data wiping, and certified overwrite/erasure complying with NIST 800-88 and DoD standards without physical destruction.",
        },
        { name: "Hard Drive Crushing", slug: "hard-drive-crushing", pages: 2, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Physical crushing, bending, and mechanical punching of hard drives and SSDs for secure data destruction." },
        { name: "Hard Drive Recycling and Disposal", slug: "hard-drive-recycling-and-disposal", pages: 19, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Collection, recycling, and hardware disposal for hard disk drives and solid state drives." },
        { name: "Hard Drive Shredding", slug: "hard-drive-shredding", pages: 202, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Physical shredding and destruction of computer hard drives and SSDs." },
        { name: "Magnetic Tape Destruction", slug: "magnetic-tape-destruction", pages: 6, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Physical shredding and secure certified destruction of backup tapes, LTO tapes, and magnetic data media cartridges." },
        { name: "Product and Recall Destruction", slug: "product-and-recall-destruction", pages: 18, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Certified physical destruction and disposal of recalled, defective, obsolete, or brand-sensitive consumer products and manufactured goods." },
        { name: "Shredding Franchises", slug: "shredding-franchises", pages: 1, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 1, description: "Franchise business opportunities and franchise ownership in mobile and facility-based shredding and secure destruction." },
      ],
      keywords: 104,
      description: "Commercial and certified destruction of digital data and storage media, including hard drive shredding and degaussing.",
    },
    { name: "Data Recovery Services", slug: "data-recovery-services", pages: 2, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Professional retrieval and recovery of lost, corrupted, or deleted digital files and data from damaged or failed hard drives, SSDs, and storage devices." },
    {
      name: "Document Shredding Services",
      slug: "document-shredding-services",
      pages: 7,
      facets: { offering_kind: "service" },
      status: "active",
      planned: 0,
      children: [
        { name: "Medical Records and PHI Destruction", slug: "medical-records-and-phi-destruction", pages: 9, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Certified destruction and shredding of physical and digital medical records, protected health information (PHI), and HIPAA-regulated healthcare documentation." },
      ],
      keywords: 0,
      description: "Secure on-site and off-site shredding and certified disposal of confidential paper records and physical enterprise documents.",
    },
    { name: "e-Stewards and R2 Recycling Certification", slug: "e-stewards-and-r2-recycling-certification", pages: 10, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Consulting, audits, and compliance services for e-Stewards, R2, and environmental recycling certifications." },
    { name: "Electronic Scrap Trading and Purchasing", slug: "electronic-scrap-trading-and-purchasing", pages: 10, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "B2B and commodity buying, selling, and sourcing of scrap electronics, circuit boards, and precious metal e-scrap." },
    {
      name: "General Recycling and Material Disposal",
      slug: "general-recycling-and-material-disposal",
      pages: 123,
      facets: { offering_kind: "service" },
      status: "active",
      planned: 0,
      children: [
        { name: "Hazardous Waste Disposal", slug: "hazardous-waste-disposal", pages: 16, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Collection, drop-off, and treatment services for municipal and industrial household hazardous waste (HHW) and toxic materials." },
        { name: "Scrap Metal Recycling", slug: "scrap-metal-recycling", pages: 3, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Collection, processing, and recycling services for ferrous and non-ferrous scrap metals." },
      ],
      keywords: 0,
      description: "General municipal, municipal drop-off, cardboard, paper, and non-electronic material recycling services and centers.",
    },
    {
      name: "IT Asset Disposition (ITAD)",
      slug: "it-asset-disposition-itad",
      pages: 480,
      facets: { offering_kind: "service" },
      status: "active",
      planned: 0,
      children: [
        { name: "Data Center Decommissioning and Recycling", slug: "data-center-decommissioning-and-recycling", pages: 5, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Decommissioning, teardown, data sanitization, and hardware recycling services specifically for enterprise data center infrastructure and server facilities." },
        { name: "IT Remarketing and Value Recovery", slug: "it-remarketing-and-value-recovery", pages: 31, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Refurbishing, remarketing, and secondary resale of decommissioned enterprise IT hardware and corporate electronic assets." },
        { name: "Reverse Logistics", slug: "reverse-logistics", pages: 7, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Supply chain and logistics management for product returns, asset recovery, and end-of-life electronics intake." },
      ],
      keywords: 242,
      description: "Enterprise IT asset disposition: corporate decommissioning, chain of custody, certified destruction, and value recovery.",
    },
    { name: "legal", slug: "legal", pages: 1, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: null },
    {
      name: "Marketing Services",
      slug: "marketing-services",
      pages: 2,
      facets: { offering_kind: "service" },
      status: "active",
      planned: 0,
      children: [
        { name: "SEO Services", slug: "seo-services", pages: 0, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "SEO consulting, agency services and campaign management sold to a client." },
      ],
      keywords: 0,
      description: "What a marketing firm actually sells.",
    },
    { name: "Records Storage and Offsite Media Vaulting", slug: "records-storage-and-offsite-media-vaulting", pages: 1, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Secure physical off-site archival, vaulting, and climate-controlled storage for magnetic tape backups, data records, and critical business documents." },
    { name: "Recycling Business Franchises", slug: "recycling-business-franchises", pages: 11, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: "Franchise investment and business opportunities across e-waste, scrap, and general recycling centers." },
    { name: "regulatory compliance", slug: "regulatory-compliance", pages: 194, facets: { offering_kind: "service" }, status: "active", planned: 0, keywords: 0, description: null },
  ],
  total_topics: 50,
};
