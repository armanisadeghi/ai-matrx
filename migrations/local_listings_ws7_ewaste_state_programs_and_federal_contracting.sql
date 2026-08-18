-- WS7 intake: E-WASTE/ITAD state regulatory-program directories (12 states, largest-population
-- subset of the ~26 states with electronics EPR/recycling laws) + federal government contractor
-- registries (SAM.gov, GSA eLibrary/Schedule — highly relevant since NAID AAA certification is
-- commonly a hard requirement for federal data-destruction contracts). For All Green Electronics
-- Recycling + Data Destruction Inc, both nationwide, R2 + NAID certified (not e-Stewards).
-- California's CalRecycle CEW directory already exists (calrecycle-cew-directory). Remaining
-- ~13 states with e-waste laws (DC, HI, IN, ME, MO, OK, RI, SC, UT, VT, VA, WV, plus 2026
-- additions CO/NV) are tracked as backlog in common-docs/systems/local-listings/RESEARCH.md —
-- see the sub-national research methodology section added there in this same batch.
-- Upsert-by-slug per common-docs/systems/local-listings/PLAN.md WS7. Verified against live
-- table by slug and domain before insert.
insert into web.listing_publisher
  (slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, organization_id, visibility)
values
  -- ===== State e-waste regulatory-program directories (largest-population states first) =====
  ('ny-dec-ewaste-registered-facilities', 'NY DEC — Registered Electronic Waste Recycling Facilities', 'dec.ny.gov', 'vertical', false, 'approval',
   'New York State Electronic Equipment Recycling and Reuse Act registry of registered e-waste recycling facilities, maintained by NYS DEC. Registration (not a public API) required to appear.',
   'https://dec.ny.gov/environmental-protection/recycling-composting/electronic-waste-recycling/registered-facilities', '{e-waste,itad,state-program}', 42, 1001, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('wa-ecology-ecycle-processors', 'WA Dept. of Ecology — E-Cycle Washington Registered Processors', 'ecology.wa.gov', 'vertical', false, 'approval',
   'Washington E-Cycle Washington program; registered-processor list at fortress.wa.gov/ecy/ecyclepublic (per-period). R2 or e-Stewards certification is explicitly recognized by the program operator. Registration required, no public API.',
   'https://ecology.wa.gov/regulations-permits/guidance-technical-assistance/electronics-ecycle-guidance-and-reports/processors', '{e-waste,itad,state-program}', 38, 1002, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('il-epa-electronics-collectors-recyclers', 'Illinois EPA — Collectors, Recyclers, and Refurbishers', 'epa.illinois.gov', 'vertical', false, 'approval',
   'Illinois Consumer Electronics Recycling Act registry of registered collectors/recyclers/refurbishers. Registration via Illinois EPA (EPA.Recycling@illinois.gov), no public API.',
   'https://epa.illinois.gov/topics/waste-management/materials-management/electronics-recycling1/collectors-recyclers-refurbishers.html', '{e-waste,itad,state-program}', 36, 1003, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('pa-dep-electronics-recycling', 'PA DEP — Electronics Recycling (Covered Device Recycling Act)', 'pa.gov', 'vertical', false, 'none',
   'Pennsylvania Covered Device Recycling Act program. PA does not publish a separate recycler-approval list — recyclers instead need R2 certification plus PA residual-waste permit #WMGR081 if the facility is located in-state. No public API; this is the program hub, not a submission form.',
   'https://www.pa.gov/agencies/dep/programs-and-services/waste-programs/recycling-in-pennsylvania/electronics-recycling', '{e-waste,itad,state-program}', 32, 1004, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('nj-dep-ewaste-authorized-recyclers', 'NJ DEP — Authorized E-Waste Recyclers', 'dep.nj.gov', 'vertical', false, 'approval',
   'New Jersey Electronic Waste Management Act registry of DEP-approved ("Class D") demanufacturing/recycling facilities. Registration/approval required, no public API. PDF facility list linked from this page.',
   'https://dep.nj.gov/dshw/rhwm/e-waste/authorized-recyclers/', '{e-waste,itad,state-program}', 36, 1005, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('mn-pca-electronics-recyclers', 'MN PCA — Registered Electronics Recyclers/Collectors', 'pca.state.mn.us', 'vertical', false, 'approval',
   'Minnesota Electronics Recycling Act requires manufacturers, collectors, and recyclers to register annually (program year July 1–June 30) with the MPCA to accept devices from MN households. No public API.',
   'https://www.pca.state.mn.us/business-with-us/registered-stakeholders', '{e-waste,itad,state-program}', 32, 1006, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('or-deq-ecycles-providers', 'OR DEQ — Oregon E-Cycles Service Providers & Collection Sites', 'oregon.gov', 'vertical', false, 'approval',
   'Oregon E-Cycles program (200+ collection sites statewide, expanded 2026 to cover more device categories). Becoming a collection/transport/recycling service provider requires DEQ registration (503-229-5830 / ecycle.info@deq.oregon.gov), not a public API.',
   'https://www.oregon.gov/deq/ecycles/Pages/providers.aspx', '{e-waste,itad,state-program}', 34, 1007, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('tx-tceq-electronics-recycling', 'TCEQ — Texas Recycles Computers/TVs Manufacturer Registration', 'tceq.texas.gov', 'vertical', false, 'approval',
   'Texas regulates electronics recycling at the manufacturer level (Texas Recycles Computers / Texas Recycles TVs, TAC Ch. 328) rather than a public recycler-approval directory — manufacturers file annual recovery plans/registration with TCEQ. Relevant as the compliance hub Texas-based recyclers/ITAD partners reference. No public API.',
   'https://www.tceq.texas.gov/p2/recycle/electronics/manufacturer-list.html', '{e-waste,itad,state-program}', 30, 1008, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('wi-dnr-ecycle-collectors', 'WI DNR — E-Cycle Wisconsin Registered Collection Sites', 'dnr.wisconsin.gov', 'vertical', false, 'approval',
   'Wisconsin E-Cycle Wisconsin program; interactive registered-collection-site tool at wisconsindnr.shinyapps.io/EcycleCollectorSite. Registration required, no public API.',
   'https://dnr.wisconsin.gov/topic/Ecycle/Collectors.html', '{e-waste,itad,state-program}', 30, 1009, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('mi-egle-ewaste-recyclers-transporters', 'MI EGLE — Registered Electronic Waste Recyclers & Transporters', 'michigan.gov', 'vertical', false, 'approval',
   'Michigan Electronic Waste Take Back Program; EGLE publishes an annually updated registered-recycler list (PDF, updated multiple times/year) and an interactive facility map. Registration required, no public API.',
   'https://www.michigan.gov/en/egle/about/Organization/Materials-Management/Ewaste/recyclers-and-transporters', '{e-waste,itad,state-program}', 34, 1010, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('ct-deep-ewaste-recyclers', 'CT DEEP — Covered Electronic Recycler (CER) Program', 'portal.ct.gov', 'vertical', false, 'approval',
   'Connecticut statewide electronics recycling program; DEEP approves "Covered Electronic Recyclers" (CERs) who may bill manufacturers for eligible transport/recycling costs. Approval required (860-424-3023), no public API.',
   'https://portal.ct.gov/DEEP/Reduce-Reuse-Recycle/Electronics/Requirements-for-E-Waste-Recyclers', '{e-waste,itad,state-program}', 28, 1011, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('md-mde-ecycling-registered', 'MD MDE — eCycling Registered Manufacturers/Program', 'mde.maryland.gov', 'vertical', false, 'approval',
   'Maryland Statewide Electronics Recycling Program. MDE publishes a registered-manufacturer list with links to each manufacturer''s approved takeback program; recyclers participate via those manufacturer programs rather than a separate MDE recycler registry. No public API.',
   'https://mde.maryland.gov/programs/land/recyclingandoperationsprogram/pages/registeredmanu.aspx', '{e-waste,itad,state-program}', 28, 1012, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('nc-deq-electronics-recyclers-collectors', 'NC DEQ — Electronics Recyclers and Collectors', 'deq.nc.gov', 'vertical', false, 'approval',
   'North Carolina requires annual registration (by Aug 1) of facilities that recover/recycle covered electronic devices; NC DEQ publishes a public PDF list of registered recycler/collector companies with certifications. No public API.',
   'https://www.deq.nc.gov/about/divisions/waste-management/solid-waste-section/special-wastes-and-alternative-handling/electronics-management/electronics-recyclers-and-collectors', '{e-waste,itad,state-program}', 30, 1013, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Federal government contractor registries (unlocks the gov/institutional sales channel — =====
  -- ===== NAID AAA is commonly a hard requirement for federal data-destruction contracts) =====
  ('sam-gov-federal-contractor', 'SAM.gov — System for Award Management', 'sam.gov', 'high_value', false, 'open',
   'The federal government''s primary vendor registry — free self-serve registration is required to bid on or hold any federal contract (issues the entity''s UEI). Being registered and searchable in SAM.gov is itself a "listing" federal buyers use to find ITAD/data-destruction vendors, independent of any specific contract award. Self-serve, no fee, no public write API for third parties.',
   'https://sam.gov/', '{itad,data-destruction,government,federal-contracting}', 55, 1014, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('gsa-elibrary-mas-schedule', 'GSA eLibrary — Multiple Award Schedule Contractor Directory', 'gsaelibrary.gsa.gov', 'high_value', false, 'approval',
   'Public directory of GSA Multiple Award Schedule (MAS) contract holders — several ITAD/data-destruction firms (AnythingIT, Securis, ATR, etc.) hold MAS contracts explicitly covering on/off-site data destruction and IT asset disposition. Listing requires winning a GSA Schedule contract (a formal proposal/award process via eOffer/eMod), not a self-serve submission. High-value for nationwide government/institutional sales credibility.',
   'https://www.gsaelibrary.gsa.gov/ElibMain/home.do', '{itad,data-destruction,government,federal-contracting}', 50, 1015, '39c38960-d30c-4840-b0c1-c9960de95582', 'public')
;
