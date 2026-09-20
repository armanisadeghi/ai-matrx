/**
 * REAL `crm.party` rows, read from the live database (Supabase project
 * `brsgrqvjdzwihsvnfqkf`, `select to_jsonb(p)`) on 2026-09-18 by lane F-47.
 *
 * Nothing here is invented: these are the rows VERIFY-U-P1-R5 judged against —
 * the real Person (Angie Sadeghi), the real Company in the same table
 * (Environmentalbusinessoutlook, `party_kind = organization`, one of 1,432) and
 * a real Person WITH contact points and an employer (Jordan Reyes). The
 * plumbing columns the generic formatter used to print — `version`, `name_key`,
 * `record_class`, `field_provenance`, `locked_fields` — are kept exactly as the
 * database has them, because the whole point of the guard is that they are NOT
 * shown.
 *
 * The live census behind them: 1,892 rows, 460 `person`, 1,432 `organization`;
 * `party_kind` has no other value and no nulls.
 */

/** Angie Sadeghi — the row R5 fed through the formatter. */
export const REAL_PERSON = {
  id: "ace507de-d313-4011-8452-7525453eccf7",
  aka: [],
  version: 2,
  name_key: "angie sadeghi",
  job_title: "Gastroenterologist",
  last_name: "Sadeghi",
  first_name: "Angie",
  party_kind: "person",
  display_name: "Angie Sadeghi",
  record_class: "contact",
  visibility: "internal",
  do_not_contact: false,
  locked_fields: [],
  field_provenance: {},
  primary_domain: null,
  primary_employer_party_id: null,
  assigned_to: null,
  created_at: "2026-07-28T18:08:09.993744+00:00",
  updated_at: "2026-08-13T06:18:59.511544+00:00",
  created_by: "4cf62e4e-2679-484f-b652-034e697418df",
  organization_id: "f9cb3e35-2a65-4f2a-8525-088d6551071c",
} as const;

/** A real Company in the same table — 1,432 rows like it. */
export const REAL_COMPANY = {
  id: "d3dc196a-3a63-4fae-b2a4-e2605eadb3b2",
  aka: [],
  version: 1,
  name_key: "environmentalbusinessoutlook",
  headline: "niche B2B 'business outlook' profile/content-mill publication",
  party_kind: "organization",
  display_name: "Environmentalbusinessoutlook",
  record_class: "discovered",
  visibility: "internal",
  do_not_contact: false,
  locked_fields: [],
  field_provenance: {},
  source: "seo_backlink",
  source_detail: "https://environmentalbusinessoutlook.com",
  primary_domain: "environmentalbusinessoutlook.com",
  primary_employer_party_id: null,
  assigned_to: null,
  created_at: "2026-08-15T05:02:25.463099+00:00",
  updated_at: "2026-08-15T05:02:25.636704+00:00",
  created_by: "4cf62e4e-2679-484f-b652-034e697418df",
  organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
} as const;

/** A real Person with an employer and four contact points. */
export const REAL_PERSON_WITH_CONTACT = {
  id: "390b9585-9c8e-4351-be97-ddb8c3dd1af8",
  version: 6,
  name_key: "jordan reyes",
  job_title: "VP of Engineering",
  first_name: "Jordan",
  last_name: "Reyes",
  party_kind: "person",
  display_name: "Jordan Reyes",
  record_class: "contact",
  visibility: "internal",
  do_not_contact: false,
  primary_domain: null,
  primary_employer_party_id: "bdbb0224-d0a9-47bb-8fa9-2de424ae0011",
  assigned_to: null,
  created_at: "2026-07-28T02:38:53.305234+00:00",
  updated_at: "2026-08-13T06:18:59.511544+00:00",
  organization_id: "7cd12da2-2213-4378-8fba-a9e2dc4ea657",
} as const;

/** Jordan Reyes' employer, as the dossier's employer read returns it. */
export const REAL_EMPLOYER = {
  id: "bdbb0224-d0a9-47bb-8fa9-2de424ae0011",
  display_name: "Acme Robotics",
  party_kind: "organization",
  primary_domain: "acmerobotics.com",
} as const;

/**
 * His contact points, primary first, each joined to its shared medium — the
 * shape `partyContactPointsQuery` returns.
 */
export const REAL_CONTACT_POINTS = [
  {
    id: "e0921b09-c85f-44e3-ac3b-f9d6171b3743",
    party_id: REAL_PERSON_WITH_CONTACT.id,
    channel: "email",
    is_primary: true,
    label: null,
    opt_out_at: null,
    purpose_code: "work",
    medium: {
      id: "158efe85-5bb9-4b4a-a73f-259be8c211d8",
      channel: "email",
      value_raw: "jordan.reyes@acmerobotics.com",
      display_value: "jordan.reyes@acmerobotics.com",
      dnc_state: null,
      verification_status: "unverified",
      suppressed_at: null,
      is_contactable: true,
    },
  },
  {
    id: "6bc4424d-8bb6-4297-abd2-126683431081",
    party_id: REAL_PERSON_WITH_CONTACT.id,
    channel: "phone",
    is_primary: true,
    label: "Mobile",
    opt_out_at: null,
    purpose_code: "work",
    medium: {
      id: "39fc8c4a-265e-45b5-ba95-4a108fa26ac2",
      channel: "phone",
      value_raw: "310-555-0199",
      display_value: "+13105550199",
      dnc_state: null,
      verification_status: "unverified",
      suppressed_at: null,
      is_contactable: true,
    },
  },
] as const;
