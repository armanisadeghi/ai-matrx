-- WS7 intake: AUTOMOTIVE REPAIR & AUTO SERVICES + VETERINARY CARE.
-- Fan-out from home-services/dental research chip (2026-08-18): two related-but-distinct
-- niches mirroring the same two structural patterns (trade/certified-dealer directories;
-- medical-specialty membership directories). Upsert-by-slug per PLAN.md WS7 contract.
insert into web.listing_publisher
  (slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, organization_id, visibility)
values
  -- ===== AUTOMOTIVE REPAIR & AUTO SERVICES (30 rows) =====
  ('ase-blue-seal-locator', 'ASE Blue Seal of Excellence Recognized Shops', 'ase.com', 'vertical', false, 'none',
   'Consumer shop locator for facilities where at least 75% of technicians are ASE-certified. Recognition/marketing program through ASE, no public API.',
   'https://ase.com/blue-seal-program/', '{automotive}', 55, 450, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('aaa-approved-auto-repair', 'AAA Approved Auto Repair', 'aaa.com', 'vertical', false, 'approval',
   '~7,000-facility network; shops undergo a AAA inspection/quality audit before approval. Submission form only, no public API.',
   'https://www.aaa.com/autorepair/aarsubmit', '{automotive}', 58, 451, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('napa-autocare-center-locator', 'NAPA AutoCare Center Locator', 'napaautocare.com', 'vertical', false, 'approval',
   '17,000+ center membership program requiring at least one ASE-certified tech and NAPA parts use. Enrolled via a local NAPA store, no self-serve API.',
   'https://www.napaautocare.com/', '{automotive}', 52, 452, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('carstar-collision-network', 'CARSTAR Collision Network', 'carstar.com', 'vertical', false, 'partnership',
   'Driven Brands franchise network (750+ locations); independent body shops convert via a franchise agreement, not a self-serve listing.',
   'https://www.carstar.com/own-a-carstar/', '{automotive,auto-body}', 45, 453, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('goodyear-tire-dealer-network', 'Goodyear Authorized Dealer Network', 'goodyear.com', 'vertical', false, 'approval',
   'Authorized-dealer program; tire/service shops apply to become a recognized Goodyear dealer. No public API.',
   'https://www.goodyear.com/en-us/resources/company/dealer-locator', '{automotive,tires}', 48, 454, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('michelin-dealer-locator', 'Michelin Authorized Dealer Locator', 'michelinman.com', 'vertical', false, 'approval',
   'Authorized-dealer network for tire/service shops; application through the Michelin sales channel, no open API.',
   'https://www.michelinman.com/auto/dealer-locator', '{automotive,tires}', 46, 455, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('firestone-bridgestone-dealer-network', 'Bridgestone/Firestone Dealer Network', 'firestonecompleteautocare.com', 'vertical', false, 'none',
   'Company-owned Firestone Complete Auto Care chain (1,700+ stores) plus a separate authorized Bridgestone commercial-dealer program. No third-party listing API.',
   'https://commercial.bridgestone.com/en-us/find-dealer', '{automotive,tires}', 42, 456, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('icar-gold-class-locator', 'I-CAR Gold Class Shop Locator', 'i-car.com', 'vertical', false, 'approval',
   'Collision shops earn Gold Class by meeting I-CAR training requirements, then are auto-published to the consumer locator (goldclass.i-car.com). No API.',
   'https://info.i-car.com/gold-class', '{automotive,auto-body}', 54, 457, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('state-farm-select-service', 'State Farm Select Service Network', 'statefarm.com', 'vertical', false, 'approval',
   'Direct-repair-program (DRP) network; body shops submit capability/pricing info via the B2B portal. Approval-gated, no API.',
   'https://b2b.statefarm.com/b2b-content/select-service', '{automotive,auto-body}', 50, 458, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('midas-franchise-locator', 'Midas', 'midas.com', 'vertical', false, 'partnership',
   '~1,300 US/Canada franchised/company shops. Franchise purchase required to join, not a self-serve directory.',
   'https://www.midasfranchise.com/available-markets/', '{automotive}', 40, 459, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('meineke-franchise-locator', 'Meineke Car Care Centers', 'meineke.com', 'vertical', false, 'partnership',
   'Driven Brands franchise network; territory/franchise application required, no open API.',
   'https://meinekefranchise.com/available-territories/', '{automotive}', 40, 460, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('jiffy-lube-locator', 'Jiffy Lube', 'jiffylube.com', 'vertical', false, 'partnership',
   'Franchise-operated quick-lube network; individual franchise groups list separately via jiffylube.com/franchise. No API.',
   'https://www.jiffylube.com/franchise', '{automotive,oil-change}', 40, 461, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('valvoline-instant-oil-change-locator', 'Valvoline Instant Oil Change', 'vioc.com', 'vertical', false, 'partnership',
   '~2,100 franchised/company centers; franchise application via viocfranchise.com, no self-serve API.',
   'https://viocfranchise.com/', '{automotive,oil-change}', 40, 462, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('aamco-transmission-locator', 'AAMCO Transmissions & Total Car Care', 'aamco.com', 'vertical', false, 'partnership',
   '527-location transmission/car-care franchise; franchise application process, no API.',
   'https://franchises.aamco.com/', '{automotive,transmission}', 36, 463, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('assured-performance-certified-network', 'Assured Performance Certified Network', 'assuredperformance.net', 'vertical', false, 'approval',
   '3,000+ collision shops certified/recognized by Ford, Nissan, Hyundai, Kia and others via one application plus an on-site audit. No API.',
   'https://assuredperformance.net/aboutUs', '{automotive,auto-body}', 52, 464, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('ppg-certifiedfirst-network', 'PPG CertifiedFirst Network', 'certifiedfirst.com', 'vertical', false, 'approval',
   'Paint-manufacturer-sponsored collision certification/marketing network; shops apply through PPG, no open API.',
   'https://www.certifiedfirst.com/', '{automotive,auto-body}', 44, 465, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('allstate-good-hands-repair-network', 'Allstate Good Hands Repair Network', 'allstate.com', 'vertical', false, 'approval',
   '4,500+ shop DRP network; body shops apply via the PRO shop intake portal. Approval-gated, no API.',
   'https://pangea.geninfo.com/AllstatePIR/Apply/Default.aspx', '{automotive,auto-body}', 50, 466, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('yourmechanic-mobile-marketplace', 'YourMechanic', 'yourmechanic.com', 'vertical', false, 'none',
   'Mobile-mechanic marketplace; individual certified mechanics (5+ years experience) apply directly online. No API, no shop-level listing.',
   'https://www.yourmechanic.com/mechanic_applications', '{automotive,mobile-mechanic}', 35, 467, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('openbay-marketplace', 'Openbay', 'openbay.com', 'vertical', false, 'none',
   'Vetted-shop marketplace/lead-gen app (OpenbayASP); shops apply to join, pay-on-performance, no monthly fee, no public API.',
   'https://www.openbay.com/asp', '{automotive}', 36, 468, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('technet-professional-auto-service', 'TechNet Professional Automotive Service', 'technetprofessional.com', 'vertical', false, 'approval',
   'NAPA/Advance-affiliated network of 15,000+ independent member shops offering a 24-month/24,000-mile nationwide warranty. Membership via a participating parts distributor, no API.',
   'https://www.technetprofessional.com/members', '{automotive}', 44, 469, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('gm-certified-collision-repair-network', 'GM Certified Collision Repair Network', 'gm.collisionrepairnetwork.org', 'vertical', false, 'approval',
   'OEM certification network; independent collision centers apply online and pass GM''s Basic plus optional specialty certifications (Corvette, CT6, BEV, Fleet). No API.',
   'https://gm.collisionrepairnetwork.org/application/apply/', '{automotive,auto-body}', 48, 470, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('honda-profirst-collision-network', 'Honda ProFirst Certified Collision Network', 'honda.com', 'vertical', false, 'approval',
   'American Honda''s OEM-certified collision network; requires I-CAR Gold Class plus annual inspection, application through profirstinfo.honda.com. No API.',
   'https://profirstinfo.honda.com/', '{automotive,auto-body}', 46, 471, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('toyota-certified-collision-center', 'Toyota Certified Collision Center Network', 'toyota.com', 'vertical', false, 'approval',
   'Annual re-qualification OEM certification (business ethics, training, equipment, environmental compliance); application via the dedicated network portal. No API.',
   'https://tccc.collisionrepairnetwork.org/', '{automotive,auto-body}', 46, 472, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('ford-certified-collision-network', 'Ford Certified Collision Network', 'ford.com', 'vertical', false, 'approval',
   'OEM-certified network, also cross-published via State Farm Select Service''s locator. Application through Ford''s collision-repair-network portal, no API.',
   'https://ford.collisionrepairnetwork.org/application/', '{automotive,auto-body}', 46, 473, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('nissan-certified-collision-repair-network', 'Nissan Certified Collision Repair Network', 'nissanusa.com', 'vertical', false, 'approval',
   'OEM certification requiring Nissan-specific training/equipment; shops apply via getnissancertified.com or direct email to the network team. No API.',
   'https://getnissancertified.com/nissan', '{automotive,auto-body}', 44, 474, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('subaru-certified-collision-network', 'Subaru Certified Collision Network', 'subaru.com', 'vertical', false, 'approval',
   'Open-enrollment OEM network requiring I-CAR Gold Class, genuine Subaru parts use, and an annual nonprofit volunteer commitment. No API.',
   'https://www.subaru.com/owners/subaru-certified-collision-centers.html', '{automotive,auto-body}', 42, 475, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('agsc-registered-member-locator', 'Auto Glass Safety Council Registered Member Locator', 'agsc.org', 'vertical', false, 'approval',
   'Sets the AGRSS auto-glass-replacement safety standard. Companies apply/register, technicians must hold AGSC certification; also published at safewindshields.org. No API.',
   'https://beta.agsc.org/become-a-member/', '{automotive,auto-glass}', 36, 476, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('asa-member-shop-directory', 'Automotive Service Association Member Directory', 'asashop.org', 'vertical', false, 'approval',
   'National trade association for independent collision/mechanical/transmission shops. Paid membership required to be listed in the find-a-shop directory, no API.',
   'https://www.asashop.org/members/', '{automotive}', 34, 477, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('certified-collision-group-network', 'Certified Collision Group', 'certifiedcg.com', 'vertical', false, 'approval',
   'Member network (1,000+ independent collision locations, 47 states + Canada); shops vetted on performance metrics, OE certifications, and I-CAR Gold status before admission. No API.',
   'https://certifiedcg.com/', '{automotive,auto-body}', 38, 478, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('motorist-assurance-program', 'Motorist Assurance Program', 'motorist.org', 'vertical', false, 'approval',
   'Consumer-trust program with 22,000+ participating shops agreeing to the MAP Pledge and Standards of Service. Qualification via a MAP-affiliated trade association, no API.',
   'https://motorist.org/', '{automotive}', 36, 479, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== VETERINARY CARE (28 rows) =====
  ('acvs-find-a-surgeon', 'ACVS Find a Veterinary Surgeon', 'acvs.org', 'vertical', false, 'approval',
   'Specialty-board diplomate directory; no public API. Listing requires ACVS board certification (residency + exam), not a form signup.',
   'https://online.acvs.org/acvsssa/rflssareferral.query_page?P_VENDOR_TY=VETS', '{healthcare,veterinary,veterinary-specialty}', 45, 480, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('aafp-cat-friendly-practice', 'AAFP Cat Friendly Practice Locator', 'catvets.com', 'vertical', false, 'approval',
   'Practice-accreditation locator (Silver/Gold Cat Friendly Practice). No API — practices apply and are certified against AAFP standards, then appear in the searchable database.',
   'https://catvets.com/cfp/find-a-cfp', '{healthcare,veterinary}', 40, 481, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('vetlocator-com', 'VetLocator.com', 'vetlocator.com', 'vertical', false, 'none',
   'Free/paid self-serve consumer vet directory (60,000+ listings) covering general, holistic, emergency, and equine vets. Manual claim/add-listing form, no public API.',
   'https://www.vetlocator.com/vetregform.php', '{healthcare,veterinary}', 32, 482, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('avdc-find-a-vet-dentist', 'AVDC Find a Veterinary Dental Specialist', 'avdc.org', 'vertical', false, 'approval',
   'Board-certification (diplomate) directory for veterinary dentistry. No API. Listing requires passing AVDC''s dental specialty exam.',
   'https://avdc.org/find-a-veterinary-specialist/', '{healthcare,veterinary,veterinary-specialty}', 36, 483, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('acvim-find-a-diplomate', 'ACVIM Find a Diplomate', 'acvim.org', 'vertical', false, 'approval',
   'Internal-medicine specialty board (cardiology, oncology, neurology, LAIM, SAIM) diplomate search. No API, certification-gated.',
   'https://www.acvim.org/resources-tools/diplomates', '{healthcare,veterinary,veterinary-specialty}', 42, 484, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('veccs-facility-certification', 'VECCS Facility Certification Directory', 'veccs.org', 'vertical', false, 'approval',
   'Emergency/critical-care hospital accreditation program (Level I-III). No API. Hospitals apply and are audited against VECCS standards before appearing in the certified-facility directory.',
   'https://veccs.org/facility-certification/', '{healthcare,veterinary,emergency-vet}', 40, 485, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('zoetis-vet-finder', 'Zoetis Vet Finder', 'zoetispetcare.com', 'vertical', false, 'none',
   'Manufacturer (animal-health pharma) consumer-facing ZIP-code vet finder. No public API or documented claim process; inclusion appears pulled from a broader clinic database, not self-serve.',
   'https://www.zoetispetcare.com/vet-finder', '{healthcare,veterinary}', 30, 486, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('fear-free-certified-directory', 'Fear Free Certified Directory', 'fearfree.com', 'vertical', false, 'none',
   'Certification-based directory (online courses for vet professionals/practices/trainers). Free to complete certification, then opt-in listing in the public directory; no API.',
   'https://directory.fearfree.com/', '{healthcare,veterinary}', 34, 487, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('acvo-ophthalmologist-search', 'ACVO Ophthalmologist Search', 'acvo.org', 'vertical', false, 'approval',
   'Board-certified veterinary ophthalmology diplomate directory; also runs the free National Service Animal Eye Exam program. No API.',
   'https://www.dacvo.org/ophthalmologist-search', '{healthcare,veterinary,veterinary-specialty}', 36, 488, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('acvd-find-a-dermatologist', 'ACVD Find a Veterinary Dermatologist', 'acvd.org', 'vertical', false, 'approval',
   '400+ board-certified veterinary dermatology diplomates. No API, certification-gated directory.',
   'https://acvd.org/find-a-veterinary-dermatologist/', '{healthcare,veterinary,veterinary-specialty}', 36, 489, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('aaep-find-a-veterinarian', 'AAEP Find an Equine Veterinarian', 'aaep.org', 'vertical', false, 'approval',
   '9,000+ member equine-practitioner directory; membership (not open API) required to appear, searchable by name/specialty/location.',
   'https://aaep.org/membership/my-membership/member-directory/', '{healthcare,veterinary,veterinary-specialty}', 34, 490, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('acvb-find-a-behaviorist', 'ACVB Find a Veterinary Behaviorist', 'dacvb.org', 'vertical', false, 'approval',
   'AVMA-recognized veterinary-behavior specialty board diplomate directory. No API, certification-gated.',
   'https://www.dacvb.org/', '{healthcare,veterinary,veterinary-specialty}', 32, 491, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('avca-find-a-doctor', 'AVCA Find a Doctor (Animal Chiropractic)', 'animalchiropractic.org', 'vertical', false, 'approval',
   'Certification directory for DVMs/DCs completing AVCA''s 210-hour animal-chiropractic program and passing the ACCC exam. No API.',
   'https://www.animalchiropractic.org/find-a-doctor/', '{healthcare,veterinary}', 28, 492, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('ahvma-vetfinder', 'AHVMA VetFinder (Holistic Vets)', 'ahvma.org', 'vertical', false, 'none',
   'Free searchable directory of member veterinarians offering holistic modalities (acupuncture, homeopathy, etc). Membership-based listing, no public API.',
   'https://www.ahvma.org/find-a-holistic-veterinarian/', '{healthcare,veterinary}', 30, 493, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('acvr-find-a-specialist', 'ACVR Find a Specialist (Radiology)', 'acvr.org', 'vertical', false, 'approval',
   'Board-certified veterinary radiology/radiation-oncology diplomate directory; listing is optional even for diplomates. No API.',
   'https://acvr.org/find-a-specialist/', '{healthcare,veterinary,veterinary-specialty}', 30, 494, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('abvp-find-a-specialist', 'ABVP Find a Specialist', 'abvp.com', 'vertical', false, 'approval',
   'Practitioner-certification board covering 12 specialties (canine/feline, avian, dairy, equine, exotic companion mammal, feline, reptile/amphibian, etc). No API, exam-gated.',
   'https://abvp.com/find-a-specialist/', '{healthcare,veterinary,veterinary-specialty}', 34, 495, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('aav-find-a-vet', 'AAV Find-A-Vet (Avian)', 'aav.org', 'vertical', false, 'none',
   'Membership-based directory of avian-focused veterinarians. Free to browse, no public API, listing tied to AAV membership.',
   'https://www.aav.org/page/FindAVet2', '{healthcare,veterinary}', 26, 496, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('arav-find-a-vet', 'ARAV Find a Vet (Reptile/Amphibian)', 'arav.org', 'vertical', false, 'none',
   'Membership directory of reptile/amphibian veterinarians, international coverage. No API, listing tied to ARAV membership.',
   'https://arav.org/find-a-vet/', '{healthcare,veterinary}', 24, 497, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('act-find-a-theriogenologist', 'ACT Find a Theriogenologist', 'theriogenology.org', 'vertical', false, 'approval',
   'Board-certified veterinary reproduction (theriogenology) specialist directory. No API, exam/certification-gated.',
   'https://www.theriogenology.org/search/', '{healthcare,veterinary,veterinary-specialty}', 24, 498, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('aczm-diplomate-directory', 'ACZM Diplomate Directory (Zoo Medicine)', 'aczm.org', 'vertical', false, 'approval',
   'Zoological-medicine board-certification body; diplomate listing/search is member-facing rather than a polished consumer tool. No API.',
   'https://aczm.org/', '{healthcare,veterinary,veterinary-specialty}', 20, 499, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('aemv-find-a-vet', 'AEMV Find a Vet (Exotic Mammal)', 'aemv.org', 'vertical', false, 'none',
   'Public location-radius search (10-500 mi) for vets treating ferrets, rabbits, guinea pigs, rodents, hedgehogs, etc. Membership-based, no API.',
   'https://aemv.org/find-a-vet/', '{healthcare,veterinary}', 22, 500, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('carecredit-vet-locator', 'CareCredit Veterinary Provider Locator', 'carecredit.com', 'vertical', false, 'none',
   'Financing-network provider locator (260,000+ enrolled healthcare/vet locations incl. independent practices); practices enroll as CareCredit merchants to appear. No public API.',
   'https://www.carecredit.com/doctor-locator/results/animal-pet-care/any-specialty/', '{healthcare,veterinary}', 34, 501, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('trupanion-vet-hospital-map', 'Trupanion Veterinary Hospital Map', 'trupanion.com', 'vertical', false, 'approval',
   'Pet-insurer''s direct-pay-partner vet map; hospitals enroll as Trupanion "Direct Pay" partners (a software/vet-portal integration, not open signup) to be highlighted.',
   'https://www.trupanion.com/pet-insurance/veterinarians-map', '{healthcare,veterinary}', 32, 502, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('aspca-pet-insurance-vet-locator', 'ASPCA Pet Health Insurance Vet Locator', 'aspcapetinsurance.com', 'vertical', false, 'none',
   'Pet-insurer''s consumer vet-clinic finder/directory. No API; listing appears to be a general clinic database rather than a merchant enrollment.',
   'https://www.aspcapetinsurance.com/vet-locator/', '{healthcare,veterinary}', 28, 503, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('merck-animal-health-find-a-vet', 'Merck Animal Health Find a Veterinarian', 'merck-animal-health-usa.com', 'vertical', false, 'none',
   'Manufacturer (animal-health pharma) consumer-facing vet finder tool. No public API or documented self-serve claim process found.',
   'https://www.merck-animal-health-usa.com/pet-owners/find-a-veterinarian/', '{healthcare,veterinary}', 26, 504, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('great-pet-care-vet-finder', 'Great Pet Care Find a Vet', 'greatpetcare.com', 'vertical', false, 'none',
   'Consumer pet-health media site''s vet-finder platform (vets.greatpetcare.com), browsable by ZIP/clinic name/state. No public API, claim mechanism not clearly self-serve in current form.',
   'https://vets.greatpetcare.com/', '{healthcare,veterinary}', 26, 505, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('findalocalvet-com', 'FindALocalVet.com', 'findalocalvet.com', 'vertical', false, 'none',
   'Nationwide free consumer vet directory organized by state/specialty (incl. farm-animal vets); has a "My Account" profile-management area suggesting self-serve claim. No public API.',
   'https://www.findalocalvet.com/Find-a-Veterinarian.aspx', '{healthcare,veterinary}', 24, 506, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('holistic-vet-directory', 'Holistic Vet Directory', 'holisticvetdirectory.com', 'vertical', false, 'none',
   'Free consumer directory of 3,226+ holistic/integrative vets across all 50 states; has a "Submit Your Practice" self-serve form. No public API.',
   'https://holisticvetdirectory.com/', '{healthcare,veterinary}', 22, 507, '39c38960-d30c-4840-b0c1-c9960de95582', 'public')

on conflict (slug) do update set
  name = excluded.name,
  domain = excluded.domain,
  tier = excluded.tier,
  is_aggregator = excluded.is_aggregator,
  api_access = excluded.api_access,
  api_notes = excluded.api_notes,
  manage_url = excluded.manage_url,
  categories = excluded.categories,
  citation_weight = excluded.citation_weight,
  sort_rank = excluded.sort_rank,
  updated_at = now();
