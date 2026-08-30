/**
 * AUTO-GENERATED — DO NOT EDIT.
 * Source: aidream/services/mandates/provisions.py (the declare_provision registry)
 *         + matrx_ai.agents.named.OfferedValueMapping (the ONE mapping deserializer's model)
 * Regenerate: uv run python scripts/mandates_generate.py  (aidream repo; --dry-run also writes this file)
 *
 * A Provision is the ENTIRE declared input side of a mandate call site;
 * its whole offered shape is the registered kind `<provision_key>.offer`.
 * `user_input` is never an offered value — human text rides the envelope.
 */

/** JSON — pydantic's JsonValue. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface OfferedValue {
  name: string;
  kind: string;
  guaranteed?: boolean;
  lazy?: boolean;
  description?: string;
}

export interface OfferedValueMapping {
  mapType?: "offered_value";
  target: string;
  required?: boolean;
  deliver?: "variable" | "context";
  when_absent?: "skip" | "use_default" | "fail" | null;
  default?: JsonValue | null;
}

/** agent.mandate_binding.consumption_map — offered value name → how the bound Holder consumes it. */
export type ConsumptionMap = Record<string, OfferedValueMapping>;

/** Offered shape of provision `agent_apps.auto_create_request` (kind `agent_apps.auto_create_request.offer`). */
export interface AgentAppsAutoCreateRequestOffer {
  __kind?: "agent_apps.auto_create_request.offer";
  prompt_object: unknown;
  sample_response: string;
  input_fields_to_include: string;
  page_layout_format: string;
  response_display_component: string;
  response_display_mode: string;
  color_pallet_options: string;
  custom_instructions: string;
}

/** Offered shape of provision `agent_apps.metadata_request` (kind `agent_apps.metadata_request.offer`). */
export interface AgentAppsMetadataRequestOffer {
  __kind?: "agent_apps.metadata_request.offer";
  prompt_config: unknown;
}

/** Offered shape of provision `agent_factory.build_request` (kind `agent_factory.build_request.offer`). */
export interface AgentFactoryBuildRequestOffer {
  __kind?: "agent_factory.build_request.offer";
  prompt_purpose: string;
}

/** Offered shape of provision `ambient.page_guidance` (kind `ambient.page_guidance.offer`). */
export interface AmbientPageGuidanceOffer {
  __kind?: "ambient.page_guidance.offer";
  page_route?: string;
  module_slug?: string;
  section_slug?: string;
  surface_name?: string;
  surface_scope?: unknown;
  selection?: string;
  organization_id?: string;
}

/** Offered shape of provision `chat.mandated_start` (kind `chat.mandated_start.offer`). */
export interface ChatMandatedStartOffer {
  __kind?: "chat.mandated_start.offer";
  organization_id?: string;
  user_id?: string;
  is_minor?: boolean;
  project_id?: string;
  task_id?: string;
  scope_ids?: string[];
  conversation_id?: string;
  is_new_conversation?: boolean;
  store_enabled?: boolean;
  mandate_key?: string;
  source_feature?: string;
  initiation?: string;
  client_surface?: string;
  client_capabilities?: string[];
  client_state?: unknown;
  surface_apply_policy?: string;
  client_mcp_servers?: string[];
  request_context?: unknown;
  skill_config?: unknown;
  turn_attachments?: (string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
})[];
}

/** Offered shape of provision `code_editor.session` (kind `code_editor.session.offer`). */
export interface CodeEditorSessionOffer {
  __kind?: "code_editor.session.offer";
  current_code?: string;
  dynamic_context?: string;
}

/** Offered shape of provision `commerce_intake.asset_capture` (kind `commerce_intake.asset_capture.offer`). */
export interface CommerceIntakeAssetCaptureOffer {
  __kind?: "commerce_intake.asset_capture.offer";
  photos: (string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
})[];
  photo_handles: string[];
  intake_policy: string;
  grading_standard: string;
  quantity: number;
}

/** Offered shape of provision `commerce_intake.batch_capture` (kind `commerce_intake.batch_capture.offer`). */
export interface CommerceIntakeBatchCaptureOffer {
  __kind?: "commerce_intake.batch_capture.offer";
  photos: (string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
})[];
  photo_handles: string[];
  photo_timestamps?: string[];
  capture_mode?: string;
  stream_kind?: string;
  receiver_notes?: string;
}

/** Offered shape of provision `commerce_intake.bench_grading` (kind `commerce_intake.bench_grading.offer`). */
export interface CommerceIntakeBenchGradingOffer {
  __kind?: "commerce_intake.bench_grading.offer";
  asset_id?: string;
  grading_standard?: string;
  intake_policy?: string;
  quantity?: number;
  bench_facts?: unknown;
}

/** Offered shape of provision `commerce_intake.disposal_challenge` (kind `commerce_intake.disposal_challenge.offer`). */
export interface CommerceIntakeDisposalChallengeOffer {
  __kind?: "commerce_intake.disposal_challenge.offer";
  original_valuation: {
  __kind?: "value_assessment";
  bucket: string;
  unknowns?: unknown[];
  reasoning?: string | null;
  confidence: number;
  gem_reasoning?: string | null;
  estimated_value?: unknown | null;
  bucket_reasoning: string;
  is_gem_candidate?: boolean;
};
  original_confidence?: number;
  extraction: {
  __kind?: "item_vision_extraction";
  status: string;
  products?: unknown[];
  status_notes?: string | null;
  image_count_received: number;
};
  research: {
  specs?: unknown[];
  __kind?: "product_research";
  sources?: string[];
  identity?: unknown | null;
  reasoning?: string | null;
  confidence?: number | null;
  channel_refs?: unknown[];
  identity_unresolved?: unknown | null;
  undetermined_by_part_number?: string[];
};
  quantity: number;
  grading_standard: string;
  burden: string;
}

/** Offered shape of provision `commerce_intake.enrichment_bundle` (kind `commerce_intake.enrichment_bundle.offer`). */
export interface CommerceIntakeEnrichmentBundleOffer {
  __kind?: "commerce_intake.enrichment_bundle.offer";
  valuation: {
  __kind?: "value_assessment";
  bucket: string;
  unknowns?: unknown[];
  reasoning?: string | null;
  confidence: number;
  gem_reasoning?: string | null;
  estimated_value?: unknown | null;
  bucket_reasoning: string;
  is_gem_candidate?: boolean;
};
  answered_unknowns: unknown;
  extraction?: {
  __kind?: "item_vision_extraction";
  status: string;
  products?: unknown[];
  status_notes?: string | null;
  image_count_received: number;
};
  research?: {
  specs?: unknown[];
  __kind?: "product_research";
  sources?: string[];
  identity?: unknown | null;
  reasoning?: string | null;
  confidence?: number | null;
  channel_refs?: unknown[];
  identity_unresolved?: unknown | null;
  undetermined_by_part_number?: string[];
};
  lot_context?: {
  notes?: string | null;
  __kind?: "lot_detection";
  is_lot: boolean;
  unit_type?: string;
  folded_from?: string | null;
  quantity_estimate?: unknown | null;
};
  client_notes?: string;
}

/** Offered shape of provision `commerce_intake.extraction_dossier` (kind `commerce_intake.extraction_dossier.offer`). */
export interface CommerceIntakeExtractionDossierOffer {
  __kind?: "commerce_intake.extraction_dossier.offer";
  extraction: {
  __kind?: "item_vision_extraction";
  status: string;
  products?: unknown[];
  status_notes?: string | null;
  image_count_received: number;
};
  lot_context: {
  notes?: string | null;
  __kind?: "lot_detection";
  is_lot: boolean;
  unit_type?: string;
  folded_from?: string | null;
  quantity_estimate?: unknown | null;
};
}

/** Offered shape of provision `commerce_intake.instant_capture` (kind `commerce_intake.instant_capture.offer`). */
export interface CommerceIntakeInstantCaptureOffer {
  __kind?: "commerce_intake.instant_capture.offer";
  photos?: (string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
})[];
  dock_notes?: string;
  asset_id?: string;
  organization_id?: string;
}

/** Offered shape of provision `commerce_intake.valuation_dossier` (kind `commerce_intake.valuation_dossier.offer`). */
export interface CommerceIntakeValuationDossierOffer {
  __kind?: "commerce_intake.valuation_dossier.offer";
  research: {
  specs?: unknown[];
  __kind?: "product_research";
  sources?: string[];
  identity?: unknown | null;
  reasoning?: string | null;
  confidence?: number | null;
  channel_refs?: unknown[];
  identity_unresolved?: unknown | null;
  undetermined_by_part_number?: string[];
};
  extraction: {
  __kind?: "item_vision_extraction";
  status: string;
  products?: unknown[];
  status_notes?: string | null;
  image_count_received: number;
};
  lot_context: {
  notes?: string | null;
  __kind?: "lot_detection";
  is_lot: boolean;
  unit_type?: string;
  folded_from?: string | null;
  quantity_estimate?: unknown | null;
};
  quantity: number;
  grading_standard: string;
}

/** Offered shape of provision `communications.sms_assistant_turn` (kind `communications.sms_assistant_turn.offer`). */
export interface CommunicationsSmsAssistantTurnOffer {
  __kind?: "communications.sms_assistant_turn.offer";
  chat_conversation_is_new?: boolean;
  chat_conversation_id?: string;
  sms_conversation_id?: string;
  user_id?: string;
  organization_id?: string;
}

/** Offered shape of provision `content_ir.component_authoring` (kind `content_ir.component_authoring.offer`). */
export interface ContentIrComponentAuthoringOffer {
  __kind?: "content_ir.component_authoring.offer";
  kind: string;
  component_key?: string;
  design_brief?: string;
}

/** Offered shape of provision `content_ir.component_target` (kind `content_ir.component_target.offer`). */
export interface ContentIrComponentTargetOffer {
  __kind?: "content_ir.component_target.offer";
  kind_slug: string;
  kind_label: string;
  platform: string;
  json_schema: unknown;
  example_data?: unknown;
}

/** Offered shape of provision `content_ir.kind_authoring` (kind `content_ir.kind_authoring.offer`). */
export interface ContentIrKindAuthoringOffer {
  __kind?: "content_ir.kind_authoring.offer";
  task_brief?: string;
  kind_schema?: unknown;
  user_data_sample?: string;
}

/** Offered shape of provision `content_ir.kind_builder` (kind `content_ir.kind_builder.offer`). */
export interface ContentIrKindBuilderOffer {
  __kind?: "content_ir.kind_builder.offer";
  user_data_sample: string;
}

/** Offered shape of provision `content_plan.entity_attachment` (kind `content_plan.entity_attachment.offer`). */
export interface ContentPlanEntityAttachmentOffer {
  __kind?: "content_plan.entity_attachment.offer";
  research_report: string;
  site_domain?: string;
  guidance?: string;
  current_plan: string;
  entity_roster: string;
}

/** Offered shape of provision `content_plan.entity_roster` (kind `content_plan.entity_roster.offer`). */
export interface ContentPlanEntityRosterOffer {
  __kind?: "content_plan.entity_roster.offer";
  research_report: string;
  site_domain?: string;
  guidance?: string;
  existing_entities?: string;
}

/** Offered shape of provision `content_plan.family_naming` (kind `content_plan.family_naming.offer`). */
export interface ContentPlanFamilyNamingOffer {
  __kind?: "content_plan.family_naming.offer";
  research_report: string;
  site_domain?: string;
  guidance?: string;
  family_key: string;
  family_label: string;
  family_route: string;
  target_count: number;
  existing_names: string[];
}

/** Offered shape of provision `content_plan.keyword_strategy` (kind `content_plan.keyword_strategy.offer`). */
export interface ContentPlanKeywordStrategyOffer {
  __kind?: "content_plan.keyword_strategy.offer";
  research_report: string;
  site_domain?: string;
  guidance?: string;
  current_plan: string;
  available_keywords: string;
  target_routes: string[];
}

/** Offered shape of provision `content_plan.page_brief` (kind `content_plan.page_brief.offer`). */
export interface ContentPlanPageBriefOffer {
  __kind?: "content_plan.page_brief.offer";
  research_report: string;
  site_domain?: string;
  guidance?: string;
  page: string;
  keyword_assignment: string;
  neighbours: string;
}

/** Offered shape of provision `content_plan.page_build` (kind `content_plan.page_build.offer`). */
export interface ContentPlanPageBuildOffer {
  __kind?: "content_plan.page_build.offer";
  site_name: string;
  site_domain?: string;
  site_brand?: unknown;
  site_vertical?: string;
  theme_properties: unknown;
  navigation: unknown;
  sibling_pages: unknown;
  cms_page: unknown;
  plan_node: unknown;
  primary_keyword?: unknown;
  keyword_directive: string;
  approved_content?: unknown;
  family_links?: unknown;
  page_scaffold?: string;
  design_guidance?: string;
  section_library?: unknown;
  meta_limits: unknown;
}

/** Offered shape of provision `content_plan.page_family` (kind `content_plan.page_family.offer`). */
export interface ContentPlanPageFamilyOffer {
  __kind?: "content_plan.page_family.offer";
  page_route: string;
  page_label: string;
  page_node_type: string;
  page_type?: string;
  page_brief?: unknown;
  technical_depth?: string;
  planned_meta_title?: string;
  planned_meta_description?: string;
  primary_keyword?: unknown;
  keyword_strategy?: unknown;
  family: unknown;
  plan_index_full?: string;
  plan_neighbours: string;
  plan_branch_context: string;
  plan_groups?: string;
  plan_coverage: string;
  plan_neighbours_json?: unknown;
  guidance?: string;
}

/** Offered shape of provision `content_plan.page_review` (kind `content_plan.page_review.offer`). */
export interface ContentPlanPageReviewOffer {
  __kind?: "content_plan.page_review.offer";
  page_route: string;
  page_label: string;
  page_node_type: string;
  page_type?: string;
  page_brief?: unknown;
  technical_depth?: string;
  planned_meta_title?: string;
  planned_meta_description?: string;
  primary_keyword?: unknown;
  keyword_strategy?: unknown;
  draft: unknown;
  family_placement?: unknown;
  research?: string;
  guidance?: string;
}

/** Offered shape of provision `content_plan.page_route` (kind `content_plan.page_route.offer`). */
export interface ContentPlanPageRouteOffer {
  __kind?: "content_plan.page_route.offer";
  page_title: string;
  primary_keyword?: string;
  family_route: string;
  sibling_routes: string[];
}

/** Offered shape of provision `content_plan.page_write` (kind `content_plan.page_write.offer`). */
export interface ContentPlanPageWriteOffer {
  __kind?: "content_plan.page_write.offer";
  page_route: string;
  page_label: string;
  page_node_type: string;
  page_type?: string;
  page_brief?: unknown;
  technical_depth?: string;
  planned_meta_title?: string;
  planned_meta_description?: string;
  primary_keyword?: unknown;
  keyword_strategy?: unknown;
  family_placement?: unknown;
  research?: string;
  keyword_directive: string;
  guidance?: string;
}

/** Offered shape of provision `content_plan.plan_review` (kind `content_plan.plan_review.offer`). */
export interface ContentPlanPlanReviewOffer {
  __kind?: "content_plan.plan_review.offer";
  research_report: string;
  site_domain?: string;
  guidance?: string;
  current_plan: string;
}

/** Offered shape of provision `content_plan.plan_shape` (kind `content_plan.plan_shape.offer`). */
export interface ContentPlanPlanShapeOffer {
  __kind?: "content_plan.plan_shape.offer";
  research_report: string;
  site_domain?: string;
  guidance?: string;
  site_context?: string;
  archetype_options: unknown;
  current_plan_summary?: string;
  target_page_count?: number;
}

/** Offered shape of provision `conversation.analysis` (kind `conversation.analysis.offer`). */
export interface ConversationAnalysisOffer {
  __kind?: "conversation.analysis.offer";
  conversation_id: string;
}

/** Offered shape of provision `crm.chasebox_draft_review` (kind `crm.chasebox_draft_review.offer`). */
export interface CrmChaseboxDraftReviewOffer {
  __kind?: "crm.chasebox_draft_review.offer";
  active_queue?: string;
  queue_counts?: unknown;
  total_items?: number;
  visible_items?: unknown;
  draft_subject?: string;
  draft_body?: string;
  draft_personalization?: unknown;
  draft_reply?: unknown;
  draft_approved?: boolean;
}

/** Offered shape of provision `crm.journalist_beat_analysis` (kind `crm.journalist_beat_analysis.offer`). */
export interface CrmJournalistBeatAnalysisOffer {
  __kind?: "crm.journalist_beat_analysis.offer";
  person_name: string;
  outlet_name?: string;
  articles: string;
  campaign_context?: string;
}

/** Offered shape of provision `crm.media_list_ranker` (kind `crm.media_list_ranker.offer`). */
export interface CrmMediaListRankerOffer {
  __kind?: "crm.media_list_ranker.offer";
  goal_context: string;
  candidates_json: string;
  shortlist_size?: string;
}

/** Offered shape of provision `crm.outreach_lists` (kind `crm.outreach_lists.offer`). */
export interface CrmOutreachListsOffer {
  __kind?: "crm.outreach_lists.offer";
  visible_lists?: unknown;
  visible_list_ids?: string[];
  list_count?: number;
  available_organizations?: unknown;
  is_loading?: boolean;
  load_error?: string;
}

/** Offered shape of provision `crm.outreach_personalization_writer` (kind `crm.outreach_personalization_writer.offer`). */
export interface CrmOutreachPersonalizationWriterOffer {
  __kind?: "crm.outreach_personalization_writer.offer";
  campaign_context: string;
  targets_json: string;
}

/** Offered shape of provision `crm.outreach_recipient_shortlister` (kind `crm.outreach_recipient_shortlister.offer`). */
export interface CrmOutreachRecipientShortlisterOffer {
  __kind?: "crm.outreach_recipient_shortlister.offer";
  pitch_context: string;
  recipients_json: string;
  shortlist_size?: string;
}

/** Offered shape of provision `crm.outreach_reply_drafter` (kind `crm.outreach_reply_drafter.offer`). */
export interface CrmOutreachReplyDrafterOffer {
  __kind?: "crm.outreach_reply_drafter.offer";
  campaign_context: string;
  thread_json: string;
  record_facts?: string;
}

/** Offered shape of provision `crm.party_kind_judgment` (kind `crm.party_kind_judgment.offer`). */
export interface CrmPartyKindJudgmentOffer {
  __kind?: "crm.party_kind_judgment.offer";
  display_name: string;
  platform_label: string;
  profile_url: string;
  evidence: string;
}

/** Offered shape of provision `crm.save_contact_selection` (kind `crm.save_contact_selection.offer`). */
export interface CrmSaveContactSelectionOffer {
  __kind?: "crm.save_contact_selection.offer";
  selection: string;
  hints?: string;
  origin: string;
}

/** Offered shape of provision `dictionary.workspace` (kind `dictionary.workspace.offer`). */
export interface DictionaryWorkspaceOffer {
  __kind?: "dictionary.workspace.offer";
  dictionary_workspace: string;
}

/** Offered shape of provision `education.analytics_narrate` (kind `education.analytics_narrate.offer`). */
export interface EducationAnalyticsNarrateOffer {
  __kind?: "education.analytics_narrate.offer";
  item_label: string;
  accuracy_pct: string;
  mastered_count: number;
  learning_count: number;
  struggling_count: number;
  due_count: number;
  accuracy_trend?: unknown;
  topic_breakdown: unknown;
  total_minutes: number;
  current_streak: number;
}

/** Offered shape of provision `education.card_image` (kind `education.card_image.offer`). */
export interface EducationCardImageOffer {
  __kind?: "education.card_image.offer";
  card_front: string;
  card_back: string;
  topic: string;
  face: string;
  candidates?: unknown;
  candidate_images?: (string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
})[];
  generation_prompt?: string;
  generated_image?: string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
};
  style?: string;
}

/** Offered shape of provision `education.card_image_generation` (kind `education.card_image_generation.offer`). */
export interface EducationCardImageGenerationOffer {
  __kind?: "education.card_image_generation.offer";
  generation_prompt: string;
}

/** Offered shape of provision `education.card_image_prompt` (kind `education.card_image_prompt.offer`). */
export interface EducationCardImagePromptOffer {
  __kind?: "education.card_image_prompt.offer";
  card_front: string;
  card_back: string;
  topic: string;
  face: string;
  style?: string;
}

/** Offered shape of provision `education.convert_source` (kind `education.convert_source.offer`). */
export interface EducationConvertSourceOffer {
  __kind?: "education.convert_source.offer";
  source_content: string;
  title: string;
  focus?: string;
  segment_index?: number;
  segment_total?: number;
  segment_label?: string;
  source_extraction_method?: string;
  source_truncated?: boolean;
  source_chars?: number;
  source_page_count?: number;
  source_file?: string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
};
  source_document_id?: string;
  source_entity_type?: string;
  source_entity_id?: string;
  depth?: string;
  count?: number;
  difficulty?: string;
  grade_level?: string;
  subject_hint?: string;
  organization_id?: string;
}

/** Offered shape of provision `education.grade_handwritten` (kind `education.grade_handwritten.offer`). */
export interface EducationGradeHandwrittenOffer {
  __kind?: "education.grade_handwritten.offer";
  question: string;
  expected_answer: string;
  work_photo: string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
};
  has_reference_answer?: boolean;
  item_id?: string;
  assessment_id?: string;
  assessment_topic?: string;
  item_difficulty?: string;
  source_kind?: string;
  source_id?: string;
}

/** Offered shape of provision `education.memory_hint` (kind `education.memory_hint.offer`). */
export interface EducationMemoryHintOffer {
  __kind?: "education.memory_hint.offer";
  front: string;
  back: string;
  topic?: string;
  card_id?: string;
  set_id?: string;
  existing_details?: unknown;
  struggling?: boolean;
}

/** Offered shape of provision `education.plan_generate` (kind `education.plan_generate.offer`). */
export interface EducationPlanGenerateOffer {
  __kind?: "education.plan_generate.offer";
  goal_title: string;
  start_date: string;
  exam_date: string;
  daily_minutes: number;
  rest_days: string;
  study_snapshot: unknown;
}

/** Offered shape of provision `education.quiz_deepen_item` (kind `education.quiz_deepen_item.offer`). */
export interface EducationQuizDeepenItemOffer {
  __kind?: "education.quiz_deepen_item.offer";
  prompt: string;
  correct_answer: string;
  question_type: string;
  current_depth: string;
  target_depth: string;
  topic?: string;
  exam_type?: string;
  source_content?: string;
}

/** Offered shape of provision `education.quiz_generate` (kind `education.quiz_generate.offer`). */
export interface EducationQuizGenerateOffer {
  __kind?: "education.quiz_generate.offer";
  topic: string;
  grade_level?: string;
  count: number;
  difficulty: string;
  depth: string;
  question_types?: string;
  exam_type?: string;
  user_request?: string;
}

/** Offered shape of provision `education.quiz_generate_from_source` (kind `education.quiz_generate_from_source.offer`). */
export interface EducationQuizGenerateFromSourceOffer {
  __kind?: "education.quiz_generate_from_source.offer";
  source_content: string;
  source_label: string;
  count: number;
  difficulty: string;
  depth: string;
  question_types?: string;
  exam_type?: string;
  user_request?: string;
}

/** Offered shape of provision `education.spoken_practice_design` (kind `education.spoken_practice_design.offer`). */
export interface EducationSpokenPracticeDesignOffer {
  __kind?: "education.spoken_practice_design.offer";
  mode?: string;
  focus: string;
  study_material?: string;
  difficulty: string;
  count: number;
}

/** Offered shape of provision `education.spoken_practice_grade` (kind `education.spoken_practice_grade.offer`). */
export interface EducationSpokenPracticeGradeOffer {
  __kind?: "education.spoken_practice_grade.offer";
  front: string;
  back: string;
  rubric: string;
  seconds_allowed: number;
  answer_audio: string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
};
}

/** Offered shape of provision `education.spoken_practice_review` (kind `education.spoken_practice_review.offer`). */
export interface EducationSpokenPracticeReviewOffer {
  __kind?: "education.spoken_practice_review.offer";
  mode: string;
  transcript: string;
  aggregate: string;
  focus?: string;
  difficulty?: string;
  prompt_count?: number;
  session_id?: string;
  attempts?: unknown;
  total_count?: number;
  graded_count?: number;
  correct_count?: number;
  accuracy?: number;
}

/** Offered shape of provision `education.study_pack` (kind `education.study_pack.offer`). */
export interface EducationStudyPackOffer {
  __kind?: "education.study_pack.offer";
  topic: string;
  audience: string;
  material: string;
  count?: number;
  difficulty_mix?: string;
  mcq_count?: number;
  free_response_count?: number;
  fill_in_blank_count?: number;
  target_section_count?: number;
  target_duration_seconds_per_section?: number;
  tone?: string;
}

/** Offered shape of provision `education.study_pack_v2` (kind `education.study_pack_v2.offer`). */
export interface EducationStudyPackV2Offer {
  __kind?: "education.study_pack_v2.offer";
  topic: string;
  audience: string;
  material: string;
  count?: number;
  difficulty_mix?: string;
  mcq_count?: number;
  free_response_count?: number;
  fill_in_blank_count?: number;
  target_section_count?: number;
  target_duration_seconds_per_section?: number;
  tone?: string;
}

/** Offered shape of provision `education.tutor_message` (kind `education.tutor_message.offer`). */
export interface EducationTutorMessageOffer {
  __kind?: "education.tutor_message.offer";
  learner_memory: string;
  study_material?: string;
  teaching_mode: string;
  personality_style: string;
}

/** Offered shape of provision `education.voice_tutor` (kind `education.voice_tutor.offer`). */
export interface EducationVoiceTutorOffer {
  __kind?: "education.voice_tutor.offer";
  front?: string;
  back?: string;
  topic?: string;
  revealed?: boolean;
  surface_name?: string;
}

/** Offered shape of provision `extend.browser_chat` (kind `extend.browser_chat.offer`). */
export interface ExtendBrowserChatOffer {
  __kind?: "extend.browser_chat.offer";
  page_brief?: unknown;
  page_full_content?: unknown;
  page_seo_audit?: unknown;
  page_meta?: unknown;
  page_links?: unknown;
  page_media?: unknown;
  page_structured_data?: unknown;
  tab_state?: unknown;
  form_elements?: unknown;
  product_data?: unknown;
  article_excerpt?: unknown;
  selection?: string;
  user_name?: string;
  user_email?: string;
  browser_timezone?: string;
  task_variables?: unknown;
}

/** Offered shape of provision `extend.page_capture` (kind `extend.page_capture.offer`). */
export interface ExtendPageCaptureOffer {
  __kind?: "extend.page_capture.offer";
  page_url: string;
  page_text?: string;
  page_metadata?: unknown;
  output_schema?: unknown;
  list_root_hint?: string;
  sample_html?: string;
  extracted_rows?: unknown;
}

/** Offered shape of provision `flashcards.enrich_card` (kind `flashcards.enrich_card.offer`). */
export interface FlashcardsEnrichCardOffer {
  __kind?: "flashcards.enrich_card.offer";
  front: string;
  back: string;
  topic: string;
  difficulty: string;
  kinds: string[];
  existing_details: unknown;
}

/** Offered shape of provision `flashcards.expand_card` (kind `flashcards.expand_card.offer`). */
export interface FlashcardsExpandCardOffer {
  __kind?: "flashcards.expand_card.offer";
  topic: string;
  front: string;
  back: string;
  struggle_signal?: string;
}

/** Offered shape of provision `flashcards.generate_cards` (kind `flashcards.generate_cards.offer`). */
export interface FlashcardsGenerateCardsOffer {
  __kind?: "flashcards.generate_cards.offer";
  topic: string;
  count: number;
  difficulty: string;
  grade_level?: string;
  user_request?: string;
}

/** Offered shape of provision `flashcards.generate_from_source` (kind `flashcards.generate_from_source.offer`). */
export interface FlashcardsGenerateFromSourceOffer {
  __kind?: "flashcards.generate_from_source.offer";
  source_content: string;
  document_id?: string;
  count: number;
  difficulty: string;
  focus?: string;
  title?: string;
}

/** Offered shape of provision `flashcards.grade_spoken` (kind `flashcards.grade_spoken.offer`). */
export interface FlashcardsGradeSpokenOffer {
  __kind?: "flashcards.grade_spoken.offer";
  front: string;
  back: string;
  rubric?: string;
  seconds_allowed: number;
  answer_audio: string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
};
}

/** Offered shape of provision `flashcards.grade_typed_answer` (kind `flashcards.grade_typed_answer.offer`). */
export interface FlashcardsGradeTypedAnswerOffer {
  __kind?: "flashcards.grade_typed_answer.offer";
  question: string;
  expected_answer: string;
  learner_answer: string;
}

/** Offered shape of provision `flashcards.help_live` (kind `flashcards.help_live.offer`). */
export interface FlashcardsHelpLiveOffer {
  __kind?: "flashcards.help_live.offer";
  front: string;
  back: string;
  session_score: number;
  recent_correct: string[];
  recent_wrong: string[];
  struggled_topics: string[];
  due_count: number;
  time_on_card_ms: number;
  card_history: unknown;
}

/** Offered shape of provision `flashcards.make_quiz_items` (kind `flashcards.make_quiz_items.offer`). */
export interface FlashcardsMakeQuizItemsOffer {
  __kind?: "flashcards.make_quiz_items.offer";
  front: string;
  back: string;
  topic: string;
  distractor_count: number;
}

/** Offered shape of provision `flashcards.micro_coach` (kind `flashcards.micro_coach.offer`). */
export interface FlashcardsMicroCoachOffer {
  __kind?: "flashcards.micro_coach.offer";
  front: string;
  back: string;
  result: string;
  prior_attempts?: unknown;
}

/** Offered shape of provision `flashcards.review_batch` (kind `flashcards.review_batch.offer`). */
export interface FlashcardsReviewBatchOffer {
  __kind?: "flashcards.review_batch.offer";
  transcript: string;
  attempts: unknown;
  aggregate: unknown;
  remaining_cards?: unknown;
}

/** Offered shape of provision `flashcards.tts_render` (kind `flashcards.tts_render.offer`). */
export interface FlashcardsTtsRenderOffer {
  __kind?: "flashcards.tts_render.offer";
  content: string;
  sample_context: string;
  speaker_profile: string;
  directors_notes: string;
  scene: string;
}

/** Offered shape of provision `flashcards.verify_against_source` (kind `flashcards.verify_against_source.offer`). */
export interface FlashcardsVerifyAgainstSourceOffer {
  __kind?: "flashcards.verify_against_source.offer";
  front: string;
  back: string;
  source_excerpt: string;
}

/** Offered shape of provision `foundry.agent_planning` (kind `foundry.agent_planning.offer`). */
export interface FoundryAgentPlanningOffer {
  __kind?: "foundry.agent_planning.offer";
  task: string;
  input_material: string;
  desired_result: string;
  anything_else?: string;
}

/** Offered shape of provision `growth_loop.stage_dispatch` (kind `growth_loop.stage_dispatch.offer`). */
export interface GrowthLoopStageDispatchOffer {
  __kind?: "growth_loop.stage_dispatch.offer";
  stage: string;
  site_id: string;
  loop_run_id: string;
  stage_context: string;
}

/** Offered shape of provision `growth_loop.stage_quality` (kind `growth_loop.stage_quality.offer`). */
export interface GrowthLoopStageQualityOffer {
  __kind?: "growth_loop.stage_quality.offer";
  stage: string;
  artifact_kind: string;
  artifact: unknown;
  rubric: string;
  loop_run_id: string;
  site_id: string;
  cycle: number;
  attempt: number;
  label?: string;
}

/** Offered shape of provision `hindsight.enrollment_review` (kind `hindsight.enrollment_review.offer`). */
export interface HindsightEnrollmentReviewOffer {
  __kind?: "hindsight.enrollment_review.offer";
  review_bundle: string;
  subject_kind?: string;
  subject_label?: string;
  human_guidance?: string;
}

/** Offered shape of provision `hindsight.orchestra_crystallization` (kind `hindsight.orchestra_crystallization.offer`). */
export interface HindsightOrchestraCrystallizationOffer {
  __kind?: "hindsight.orchestra_crystallization.offer";
  trajectory_bundle: string;
  orchestra_label?: string;
  run_count?: number;
}

/** Offered shape of provision `hindsight.replay_comparison` (kind `hindsight.replay_comparison.offer`). */
export interface HindsightReplayComparisonOffer {
  __kind?: "hindsight.replay_comparison.offer";
  question: string;
  rubric_name?: string;
  rubric?: string;
  verdict_values: string[];
  subject_label: string;
  subject_content: string;
  subject_metrics?: unknown;
  reference_label: string;
  reference_content: string;
  reference_metrics?: unknown;
  context?: unknown;
}

/** Offered shape of provision `human_decisions.absent_human_decision` (kind `human_decisions.absent_human_decision.offer`). */
export interface HumanDecisionsAbsentHumanDecisionOffer {
  __kind?: "human_decisions.absent_human_decision.offer";
  workflow_name: string;
  waited_for: string;
  prompt: string;
  decision_context: unknown;
  answer_schema?: unknown;
  default_answer?: string;
}

/** Offered shape of provision `iteration.rebuild_chain` (kind `iteration.rebuild_chain.offer`). */
export interface IterationRebuildChainOffer {
  __kind?: "iteration.rebuild_chain.offer";
  original_user_request: string;
  current_agent_config: unknown;
  current_agent_response: string;
  user_feedback: string;
  accumulated_feedback: string[];
  diagnosis?: string;
  root_cause?: string;
}

/** Offered shape of provision `iteration.thinking_display_narration` (kind `iteration.thinking_display_narration.offer`). */
export interface IterationThinkingDisplayNarrationOffer {
  __kind?: "iteration.thinking_display_narration.offer";
  user_feedback: string;
  original_user_request?: string;
}

/** Offered shape of provision `kg.chunk_extraction` (kind `kg.chunk_extraction.offer`). */
export interface KgChunkExtractionOffer {
  __kind?: "kg.chunk_extraction.offer";
  chunk: string;
}

/** Offered shape of provision `kg.entity_cluster` (kind `kg.entity_cluster.offer`). */
export interface KgEntityClusterOffer {
  __kind?: "kg.entity_cluster.offer";
  members: string;
}

/** Offered shape of provision `knowledge.document_verification` (kind `knowledge.document_verification.offer`). */
export interface KnowledgeDocumentVerificationOffer {
  __kind?: "knowledge.document_verification.offer";
  verification_instructions: string;
  expected_claims?: unknown;
  page_context: unknown;
}

/** Offered shape of provision `knowledge.section_derivation` (kind `knowledge.section_derivation.offer`). */
export interface KnowledgeSectionDerivationOffer {
  __kind?: "knowledge.section_derivation.offer";
  section_title: string;
  section_text: string;
  section_index?: number;
  document_section_count?: number;
  section_char_count?: number;
  section_first_page?: number;
  section_last_page?: number;
  section_page_count?: number;
  section_text_char_cap?: number;
  document_name?: string;
  processed_document_id?: string;
  document_outline?: string[];
}

/** Offered shape of provision `knowledge.section_qa` (kind `knowledge.section_qa.offer`). */
export interface KnowledgeSectionQaOffer {
  __kind?: "knowledge.section_qa.offer";
  content: string;
  section_title?: string;
  section_index?: number;
  document_section_count?: number;
  section_char_count?: number;
  section_first_page?: number;
  section_last_page?: number;
  section_page_count?: number;
  section_text_char_cap?: number;
  document_name?: string;
  processed_document_id?: string;
  document_outline?: string[];
}

/** Offered shape of provision `marketing.image_prompt` (kind `marketing.image_prompt.offer`). */
export interface MarketingImagePromptOffer {
  __kind?: "marketing.image_prompt.offer";
  intent_or_content: string;
  style: string;
}

/** Offered shape of provision `marketing.local_endowment` (kind `marketing.local_endowment.offer`). */
export interface MarketingLocalEndowmentOffer {
  __kind?: "marketing.local_endowment.offer";
  company_name?: string;
  industry: string;
  location?: string;
  context_notes?: string;
}

/** Offered shape of provision `marketing.page_image` (kind `marketing.page_image.offer`). */
export interface MarketingPageImageOffer {
  __kind?: "marketing.page_image.offer";
  image_description: string;
}

/** Offered shape of provision `marketing.page_image_all_in_one` (kind `marketing.page_image_all_in_one.offer`). */
export interface MarketingPageImageAllInOneOffer {
  __kind?: "marketing.page_image_all_in_one.offer";
  intent_or_content: string;
  style: string;
  count: number;
}

/** Offered shape of provision `marketing.video_metadata` (kind `marketing.video_metadata.offer`). */
export interface MarketingVideoMetadataOffer {
  __kind?: "marketing.video_metadata.offer";
  video_context: unknown;
  site_context: unknown;
}

/** Offered shape of provision `masterwork.approach_select` (kind `masterwork.approach_select.offer`). */
export interface MasterworkApproachSelectOffer {
  __kind?: "masterwork.approach_select.offer";
  rulebook_name: string;
  sections: unknown;
  total_approved: number;
  total_live: number;
  moves_ledger: unknown;
}

/** Offered shape of provision `masterwork.audition_judgment` (kind `masterwork.audition_judgment.offer`). */
export interface MasterworkAuditionJudgmentOffer {
  __kind?: "masterwork.audition_judgment.offer";
  question: string;
  rubric_name: string;
  rubric: string;
  verdict_values: string[];
  subject_label: string;
  subject_content: string;
  subject_metrics?: unknown;
  reference_label?: string;
  reference_content?: string;
  reference_metrics?: unknown;
  context?: unknown;
}

/** Offered shape of provision `masterwork.bad_draft_write` (kind `masterwork.bad_draft_write.offer`). */
export interface MasterworkBadDraftWriteOffer {
  __kind?: "masterwork.bad_draft_write.offer";
  rulebook_name: string;
  section_label: string;
  approved_rules: unknown;
}

/** Offered shape of provision `masterwork.checkup_scan` (kind `masterwork.checkup_scan.offer`). */
export interface MasterworkCheckupScanOffer {
  __kind?: "masterwork.checkup_scan.offer";
  expert_corpus: string;
  current_rules: string;
  rulebook_context: string;
}

/** Offered shape of provision `masterwork.chunk_distill` (kind `masterwork.chunk_distill.offer`). */
export interface MasterworkChunkDistillOffer {
  __kind?: "masterwork.chunk_distill.offer";
  chunk: string;
  chunk_index?: number;
  chunk_count?: number;
  rulebook_id?: string;
  rulebook_name?: string;
  rulebook_description?: string;
  rulebook_section_keys?: string[];
  existing_rule_count?: number;
  approach?: string;
  source_note?: string;
  chunk_start_seconds?: number;
  chunk_end_seconds?: number;
  conversation_title?: string;
  conversation_provider?: string;
  chunk_start_turn?: number;
  chunk_end_turn?: number;
}

/** Offered shape of provision `masterwork.coherence_scan` (kind `masterwork.coherence_scan.offer`). */
export interface MasterworkCoherenceScanOffer {
  __kind?: "masterwork.coherence_scan.offer";
  rulebook_name: string;
  rulebook_description?: string;
  rulebook_sections: unknown;
  rulebook_intake?: unknown;
  current_rules: unknown;
  overlap_pairs: unknown;
  vague_rules: unknown;
  settled_tensions: unknown;
}

/** Offered shape of provision `masterwork.conduct` (kind `masterwork.conduct.offer`). */
export interface MasterworkConductOffer {
  __kind?: "masterwork.conduct.offer";
  rulebook_id: string;
  attachments: unknown;
  rulebook_document: string;
}

/** Offered shape of provision `masterwork.corpus_clean` (kind `masterwork.corpus_clean.offer`). */
export interface MasterworkCorpusCleanOffer {
  __kind?: "masterwork.corpus_clean.offer";
  transcribed_text: string;
}

/** Offered shape of provision `masterwork.corpus_synthesis` (kind `masterwork.corpus_synthesis.offer`). */
export interface MasterworkCorpusSynthesisOffer {
  __kind?: "masterwork.corpus_synthesis.offer";
  corpus_digest: string;
}

/** Offered shape of provision `masterwork.intake_design` (kind `masterwork.intake_design.offer`). */
export interface MasterworkIntakeDesignOffer {
  __kind?: "masterwork.intake_design.offer";
  deliverable: string;
  rulebook_name: string;
  rulebook_source_line?: string;
  section_labels: string;
  masterwork_kind: string;
}

/** Offered shape of provision `masterwork.rule_improve` (kind `masterwork.rule_improve.offer`). */
export interface MasterworkRuleImproveOffer {
  __kind?: "masterwork.rule_improve.offer";
  rule?: unknown;
  expert_input?: string;
  rulebook_context: string;
}

/** Offered shape of provision `masterwork.rulebook_audit` (kind `masterwork.rulebook_audit.offer`). */
export interface MasterworkRulebookAuditOffer {
  __kind?: "masterwork.rulebook_audit.offer";
  rulebook_source: string;
  rules: string;
  content: string;
  content_kind: string;
  ground_truth?: string;
}

/** Offered shape of provision `masterwork.scout_interview` (kind `masterwork.scout_interview.offer`). */
export interface MasterworkScoutInterviewOffer {
  __kind?: "masterwork.scout_interview.offer";
  rulebook_id: string;
  rulebook_document: string;
}

/** Offered shape of provision `masterwork.transcript_shortlist` (kind `masterwork.transcript_shortlist.offer`). */
export interface MasterworkTranscriptShortlistOffer {
  __kind?: "masterwork.transcript_shortlist.offer";
  conversations: unknown;
  topic: string;
  conversations_full?: unknown;
  conversation_count?: number;
  corpus_conversation_count?: number;
  providers?: string[];
  skipped_file_count?: number;
  parse_notes?: string[];
  shortlist_max?: number;
  snippet_char_cap?: number;
  file_id?: string;
}

/** Offered shape of provision `masterwork.understudy_run` (kind `masterwork.understudy_run.offer`). */
export interface MasterworkUnderstudyRunOffer {
  __kind?: "masterwork.understudy_run.offer";
  rulebook_source: string;
  rules: string;
  unconfirmed_rules: string;
  job: string;
  material?: string;
}

/** Offered shape of provision `media.youtube_transcription` (kind `media.youtube_transcription.offer`). */
export interface MediaYoutubeTranscriptionOffer {
  __kind?: "media.youtube_transcription.offer";
  youtube_url: string;
  timestamp_instruction?: string;
}

/** Offered shape of provision `ner.deep_chunk_extraction` (kind `ner.deep_chunk_extraction.offer`). */
export interface NerDeepChunkExtractionOffer {
  __kind?: "ner.deep_chunk_extraction.offer";
  slots_to_extract: unknown;
  relevant_chunks_text: string;
  document_label: string;
}

/** Offered shape of provision `ner.document_orientation` (kind `ner.document_orientation.offer`). */
export interface NerDocumentOrientationOffer {
  __kind?: "ner.document_orientation.offer";
  document_label: string;
  document_size_hint: string;
  document_text_sample: string;
  top_entities: unknown;
  top_cooccurrences: unknown;
  user_scope_tree: unknown;
}

/** Offered shape of provision `ner.entity_canonicalization` (kind `ner.entity_canonicalization.offer`). */
export interface NerEntityCanonicalizationOffer {
  __kind?: "ner.entity_canonicalization.offer";
  entity_pairs: unknown;
}

/** Offered shape of provision `ner.finisher_batch` (kind `ner.finisher_batch.offer`). */
export interface NerFinisherBatchOffer {
  __kind?: "ner.finisher_batch.offer";
  entities: unknown;
}

/** Offered shape of provision `ner.item_proposal` (kind `ner.item_proposal.offer`). */
export interface NerItemProposalOffer {
  __kind?: "ner.item_proposal.offer";
  unmatched_findings: unknown;
  scope_type_context: unknown;
}

/** Offered shape of provision `ner.magic_moment_detection` (kind `ner.magic_moment_detection.offer`). */
export interface NerMagicMomentDetectionOffer {
  __kind?: "ner.magic_moment_detection.offer";
  scope_slots: unknown;
  document_classification?: string;
  document_sample?: string;
  relevant_entities?: unknown;
}

/** Offered shape of provision `ner.scope_proposal` (kind `ner.scope_proposal.offer`). */
export interface NerScopeProposalOffer {
  __kind?: "ner.scope_proposal.offer";
  entity_tree: unknown;
  document_classification?: string;
  existing_scope_types?: unknown;
}

/** Offered shape of provision `ner.scope_slot_filling` (kind `ner.scope_slot_filling.offer`). */
export interface NerScopeSlotFillingOffer {
  __kind?: "ner.scope_slot_filling.offer";
  scope_name: string;
  scope_type: string;
  slot_definitions: unknown;
  top_entities: unknown;
  top_cooccurrences: unknown;
  document_label: string;
  document_classification: string;
}

/** Offered shape of provision `ner.suggestion_review` (kind `ner.suggestion_review.offer`). */
export interface NerSuggestionReviewOffer {
  __kind?: "ner.suggestion_review.offer";
  suggestions: unknown;
  scope_context: unknown;
  document_content?: string;
}

/** Offered shape of provision `ner.sweep_scope_discovery` (kind `ner.sweep_scope_discovery.offer`). */
export interface NerSweepScopeDiscoveryOffer {
  __kind?: "ner.sweep_scope_discovery.offer";
  scope_type: string;
  existing_scope_names: string[];
  entities: unknown;
}

/** Offered shape of provision `ner.sweep_scope_references` (kind `ner.sweep_scope_references.offer`). */
export interface NerSweepScopeReferencesOffer {
  __kind?: "ner.sweep_scope_references.offer";
  scope: unknown;
  entities: unknown;
}

/** Offered shape of provision `ner.sweep_value_mining` (kind `ner.sweep_value_mining.offer`). */
export interface NerSweepValueMiningOffer {
  __kind?: "ner.sweep_value_mining.offer";
  context_item: unknown;
  scopes: unknown;
}

/** Offered shape of provision `observability.tool_trace_pattern_window` (kind `observability.tool_trace_pattern_window.offer`). */
export interface ObservabilityToolTracePatternWindowOffer {
  __kind?: "observability.tool_trace_pattern_window.offer";
  window_days: number;
  tool_name_filter?: string;
}

/** Offered shape of provision `observability.tool_trace_triage_window` (kind `observability.tool_trace_triage_window.offer`). */
export interface ObservabilityToolTraceTriageWindowOffer {
  __kind?: "observability.tool_trace_triage_window.offer";
  since_iso: string;
  environment_label: string;
}

/** Offered shape of provision `orchestras.member_roster` (kind `orchestras.member_roster.offer`). */
export interface OrchestrasMemberRosterOffer {
  __kind?: "orchestras.member_roster.offer";
  members: unknown;
}

/** Offered shape of provision `pdf.content_cleaning` (kind `pdf.content_cleaning.offer`). */
export interface PdfContentCleaningOffer {
  __kind?: "pdf.content_cleaning.offer";
  content: string;
}

/** Offered shape of provision `podcast.audience_adaptation` (kind `podcast.audience_adaptation.offer`). */
export interface PodcastAudienceAdaptationOffer {
  __kind?: "podcast.audience_adaptation.offer";
  prepared_content: string;
  target_audience: string;
  adaptation_guidance?: string;
}

/** Offered shape of provision `podcast.audio_stage` (kind `podcast.audio_stage.offer`). */
export interface PodcastAudioStageOffer {
  __kind?: "podcast.audio_stage.offer";
  content: string;
  audio_style?: string;
  script_full?: string;
  resolved_speaker_cast?: unknown;
  tts_provider?: string;
  dialogue_turn_count?: number;
  truncate_audio_for_testing?: boolean;
  show_id?: string;
  podcast_type?: string;
  input_data_type?: string;
  host_count?: number;
  speaker_cast?: unknown;
  speaker_names_list?: string[];
  first_show_info_text?: string;
  post_prep_option?: string;
  dictionary?: unknown;
  tts_quality?: string;
  run_mode?: string;
  source_file_urls?: (string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
})[];
}

/** Offered shape of provision `podcast.chaptering` (kind `podcast.chaptering.offer`). */
export interface PodcastChapteringOffer {
  __kind?: "podcast.chaptering.offer";
  episode_script: string;
  duration_hint?: string;
  granularity_hint?: string;
}

/** Offered shape of provision `podcast.feature_image_prompt` (kind `podcast.feature_image_prompt.offer`). */
export interface PodcastFeatureImagePromptOffer {
  __kind?: "podcast.feature_image_prompt.offer";
  intent_or_content: string;
  style: string;
}

/** Offered shape of provision `podcast.image_render` (kind `podcast.image_render.offer`). */
export interface PodcastImageRenderOffer {
  __kind?: "podcast.image_render.offer";
  image_description: string;
}

/** Offered shape of provision `podcast.legacy_script_stage` (kind `podcast.legacy_script_stage.offer`). */
export interface PodcastLegacyScriptStageOffer {
  __kind?: "podcast.legacy_script_stage.offer";
  podcast_topic_or_content: string;
  prepared_content?: string;
  audio_style?: string;
  is_legacy_band?: boolean;
  prepared_content_is_script?: boolean;
  prepared_content_char_count?: number;
  show_id?: string;
  podcast_type?: string;
  input_data_type?: string;
  host_count?: number;
  speaker_cast?: unknown;
  speaker_names_list?: string[];
  target_audience?: string;
  audience_guidance?: string;
  first_show_info_text?: string;
  post_prep_option?: string;
  dictionary?: unknown;
  tts_quality?: string;
  run_mode?: string;
  source_file_urls?: (string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
})[];
}

/** Offered shape of provision `podcast.live_session` (kind `podcast.live_session.offer`). */
export interface PodcastLiveSessionOffer {
  __kind?: "podcast.live_session.offer";
  full_script: string;
  playback_position?: string;
  speaker_names?: string;
  current_topic?: string;
  recent_user_speech?: string;
}

/** Offered shape of provision `podcast.metadata_stage` (kind `podcast.metadata_stage.offer`). */
export interface PodcastMetadataStageOffer {
  __kind?: "podcast.metadata_stage.offer";
  podcast_content: string;
}

/** Offered shape of provision `podcast.post_prep` (kind `podcast.post_prep.offer`). */
export interface PodcastPostPrepOffer {
  __kind?: "podcast.post_prep.offer";
  content: string;
  target_language?: string;
  target_length?: string;
  expansion_guidance?: string;
}

/** Offered shape of provision `podcast.prep_extraction` (kind `podcast.prep_extraction.offer`). */
export interface PodcastPrepExtractionOffer {
  __kind?: "podcast.prep_extraction.offer";
  extraction_unit: string;
  source_files?: (string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
})[];
  source_file_count?: number;
  prep_user_message?: string;
  show_id?: string;
  podcast_type?: string;
  input_data_type?: string;
  host_count?: number;
  speaker_cast?: unknown;
  speaker_names_list?: string[];
  first_show_info_text?: string;
  post_prep_option?: string;
  dictionary?: unknown;
  tts_quality?: string;
  run_mode?: string;
}

/** Offered shape of provision `podcast.script_stage` (kind `podcast.script_stage.offer`). */
export interface PodcastScriptStageOffer {
  __kind?: "podcast.script_stage.offer";
  prepared_content: string;
  format?: string;
  theme?: string;
  language?: string;
  num_speakers?: string;
  speaker_names?: string;
  speaker_name?: string;
  speaker_personas?: string;
  podcast_topic_or_content?: string;
  audio_style?: string;
  is_legacy_band?: boolean;
  prepared_content_is_script?: boolean;
  prepared_content_char_count?: number;
  show_id?: string;
  podcast_type?: string;
  input_data_type?: string;
  host_count?: number;
  speaker_cast?: unknown;
  speaker_names_list?: string[];
  target_audience?: string;
  audience_guidance?: string;
  first_show_info_text?: string;
  post_prep_option?: string;
  dictionary?: unknown;
  tts_quality?: string;
  run_mode?: string;
  source_file_urls?: (string | {
  [key: string]: unknown;
  file_id?: string;
  url?: string;
  file_uri?: string;
  mime_type?: string;
})[];
}

/** Offered shape of provision `podcast.title_optimization` (kind `podcast.title_optimization.offer`). */
export interface PodcastTitleOptimizationOffer {
  __kind?: "podcast.title_optimization.offer";
  working_title: string;
  content_summary: string;
  show_metadata_json?: string;
  keywords?: string;
  episode_script_full?: string;
}

/** Offered shape of provision `podcast.video_render` (kind `podcast.video_render.offer`). */
export interface PodcastVideoRenderOffer {
  __kind?: "podcast.video_render.offer";
  video_description: string;
}

/** Offered shape of provision `podcast_client.episode_content` (kind `podcast_client.episode_content.offer`). */
export interface PodcastClientEpisodeContentOffer {
  __kind?: "podcast_client.episode_content.offer";
  episode_transcript: string;
  episode_title: string;
  episode_description?: string;
  episode_guests?: string;
  episode_date?: string;
  episode_links?: string[];
  duration_hint?: string;
  style_guidance?: string;
  episode_metadata?: string;
  episode_metadata_json?: string;
}

/** Offered shape of provision `podcast_client.topic_idea_request` (kind `podcast_client.topic_idea_request.offer`). */
export interface PodcastClientTopicIdeaRequestOffer {
  __kind?: "podcast_client.topic_idea_request.offer";
  concept: string;
  content_format: string;
  idea_count: string;
}

/** Offered shape of provision `podcast_client.web_source` (kind `podcast_client.web_source.offer`). */
export interface PodcastClientWebSourceOffer {
  __kind?: "podcast_client.web_source.offer";
  scraped_content: string;
  focus_area?: string;
}

/** Offered shape of provision `podcast_client.youtube_source` (kind `podcast_client.youtube_source.offer`). */
export interface PodcastClientYoutubeSourceOffer {
  __kind?: "podcast_client.youtube_source.offer";
  youtube_url: string;
  timestamp_instruction?: string;
}

/** Offered shape of provision `proof_runs.judge_case` (kind `proof_runs.judge_case.offer`). */
export interface ProofRunsJudgeCaseOffer {
  __kind?: "proof_runs.judge_case.offer";
  rubric: string;
  actual_output: string;
  context?: string;
}

/** Offered shape of provision `purpose.unit_config` (kind `purpose.unit_config.offer`). */
export interface PurposeUnitConfigOffer {
  __kind?: "purpose.unit_config.offer";
  unit_config: string;
}

/** Offered shape of provision `rag.chunk_context` (kind `rag.chunk_context.offer`). */
export interface RagChunkContextOffer {
  __kind?: "rag.chunk_context.offer";
  document: string;
  chunk: string;
  chunk_char_count?: number;
  document_char_count?: number;
  document_char_cap?: number;
  chunk_id?: string;
  parent_chunk_id?: string;
}

/** Offered shape of provision `rag.page_cleaning` (kind `rag.page_cleaning.offer`). */
export interface RagPageCleaningOffer {
  __kind?: "rag.page_cleaning.offer";
  raw_text: string;
  raw_text_char_count?: number;
  page_index?: number;
  page_count?: number;
  processed_document_id?: string;
}

/** Offered shape of provision `rag.retrieval_query` (kind `rag.retrieval_query.offer`). */
export interface RagRetrievalQueryOffer {
  __kind?: "rag.retrieval_query.offer";
  query: string;
  expansion_target_count?: number;
  embedding_model?: string;
  scoped_document_ids?: string[];
  scoped_source_ids?: string[];
}

/** Offered shape of provision `research.capture_coverage` (kind `research.capture_coverage.offer`). */
export interface ResearchCaptureCoverageOffer {
  __kind?: "research.capture_coverage.offer";
  intent: string;
  keywords: string;
  capture_report: unknown;
}

/** Offered shape of provision `research.cross_cutting_discovery` (kind `research.cross_cutting_discovery.offer`). */
export interface ResearchCrossCuttingDiscoveryOffer {
  __kind?: "research.cross_cutting_discovery.offer";
  keywords: string;
  search_results: string;
}

/** Offered shape of provision `research.final_assembly` (kind `research.final_assembly.offer`). */
export interface ResearchFinalAssemblyOffer {
  __kind?: "research.final_assembly.offer";
  topic: string;
  tag_consolidations: string;
  research_report: string;
}

/** Offered shape of provision `research.keyword_findings` (kind `research.keyword_findings.offer`). */
export interface ResearchKeywordFindingsOffer {
  __kind?: "research.keyword_findings.offer";
  topic: string;
  keyword: string;
  search_results: string;
  page_summaries: string;
}

/** Offered shape of provision `research.page_capture` (kind `research.page_capture.offer`). */
export interface ResearchPageCaptureOffer {
  __kind?: "research.page_capture.offer";
  topic: string;
  page_content: string;
  page_url: string;
  page_title: string;
}

/** Offered shape of provision `research.page_tagging` (kind `research.page_tagging.offer`). */
export interface ResearchPageTaggingOffer {
  __kind?: "research.page_tagging.offer";
  topic: string;
  page_content: string;
  available_tags: unknown;
}

/** Offered shape of provision `research.report_synthesis` (kind `research.report_synthesis.offer`). */
export interface ResearchReportSynthesisOffer {
  __kind?: "research.report_synthesis.offer";
  topic: string;
  search_results: string;
  page_summaries: string;
  keyword_syntheses: string;
}

/** Offered shape of provision `research.report_update` (kind `research.report_update.offer`). */
export interface ResearchReportUpdateOffer {
  __kind?: "research.report_update.offer";
  previous_report: string;
  new_information: string;
  removed_sources: string;
}

/** Offered shape of provision `research.scrape_condensation` (kind `research.scrape_condensation.offer`). */
export interface ResearchScrapeCondensationOffer {
  __kind?: "research.scrape_condensation.offer";
  instructions: string;
  scraped_content: string;
  queries: string;
  search_results: string;
}

/** Offered shape of provision `research.source_triage` (kind `research.source_triage.offer`). */
export interface ResearchSourceTriageOffer {
  __kind?: "research.source_triage.offer";
  topic: string;
  sources: unknown;
}

/** Offered shape of provision `research.tagged_pages` (kind `research.tagged_pages.offer`). */
export interface ResearchTaggedPagesOffer {
  __kind?: "research.tagged_pages.offer";
  topic: string;
  tag_name: string;
  tagged_page_contents: string;
  tagged_page_summaries: string;
}

/** Offered shape of provision `research.topic_setup` (kind `research.topic_setup.offer`). */
export interface ResearchTopicSetupOffer {
  __kind?: "research.topic_setup.offer";
  subject_name_or_description: string;
}

/** Offered shape of provision `research_client.context_bundle` (kind `research_client.context_bundle.offer`). */
export interface ResearchClientContextBundleOffer {
  __kind?: "research_client.context_bundle.offer";
  research_brief?: string;
  research_inventory?: string;
  research_report?: string;
  search_results?: string;
  scraped_pages?: string;
  page_analyses?: string;
  page_scoring?: string;
  keyword_syntheses?: string;
  tag_map?: string;
  source_quality?: string;
  media_inventory?: string;
  resource_refs?: unknown;
}

/** Offered shape of provision `research_client.report_output` (kind `research_client.report_output.offer`). */
export interface ResearchClientReportOutputOffer {
  __kind?: "research_client.report_output.offer";
  report_markdown: string;
  voice_lens: string;
}

/** Offered shape of provision `scraper.page_analysis` (kind `scraper.page_analysis.offer`). */
export interface ScraperPageAnalysisOffer {
  __kind?: "scraper.page_analysis.offer";
  page_content: string;
}

/** Offered shape of provision `seo.ai_visibility_analysis` (kind `seo.ai_visibility_analysis.offer`). */
export interface SeoAiVisibilityAnalysisOffer {
  __kind?: "seo.ai_visibility_analysis.offer";
  query: string;
  provider: string;
  model: string;
  answer_text: string;
  answer_citations: unknown;
  target_mentioned: string;
  target_cited: string;
  provider_metadata: unknown;
  cited_sources: unknown;
  site_context: unknown;
}

/** Offered shape of provision `seo.authority_routing` (kind `seo.authority_routing.offer`). */
export interface SeoAuthorityRoutingOffer {
  __kind?: "seo.authority_routing.offer";
  site_id: string;
  router_version: string;
  candidates: unknown;
  scan_flags: unknown;
  guidance?: string;
}

/** Offered shape of provision `seo.backlink_context_assessor` (kind `seo.backlink_context_assessor.offer`). */
export interface SeoBacklinkContextAssessorOffer {
  __kind?: "seo.backlink_context_assessor.offer";
  brand_context: string;
  site_context: string;
  backlinks_json: string;
}

/** Offered shape of provision `seo.business_model_verdict` (kind `seo.business_model_verdict.offer`). */
export interface SeoBusinessModelVerdictOffer {
  __kind?: "seo.business_model_verdict.offer";
  site_domain: string;
  site_pages: string;
}

/** Offered shape of provision `seo.competitor_classification` (kind `seo.competitor_classification.offer`). */
export interface SeoCompetitorClassificationOffer {
  __kind?: "seo.competitor_classification.offer";
  business_id: string;
  business_name: string;
  business_domain: string;
  business_root_url: string;
  business_description?: string;
  candidate_id: string;
  candidate_name?: string;
  candidate_domain: string;
  candidate_provider_evidence: unknown;
  landscape_brief: string;
  classification_version: string;
}

/** Offered shape of provision `seo.competitor_opportunity_autopsy` (kind `seo.competitor_opportunity_autopsy.offer`). */
export interface SeoCompetitorOpportunityAutopsyOffer {
  __kind?: "seo.competitor_opportunity_autopsy.offer";
  strategist_version: string;
  site: unknown;
  provider_competitors: unknown;
  owned_pages: unknown;
  owned_backlinks: unknown;
  provider_backlink_metrics: unknown;
  page_autopsies: unknown;
  owned_page_analyses: unknown;
  page_keyword_maps: unknown;
  limitations: unknown;
}

/** Offered shape of provision `seo.competitor_page_autopsy` (kind `seo.competitor_page_autopsy.offer`). */
export interface SeoCompetitorPageAutopsyOffer {
  __kind?: "seo.competitor_page_autopsy.offer";
  analyst_version: string;
  site: unknown;
  competitor: unknown;
  competitor_page: unknown;
  owned_page?: unknown;
  owned_page_analysis?: unknown;
  page_keyword_map?: unknown;
  owned_site: unknown;
}

/** Offered shape of provision `seo.coverage_analysis` (kind `seo.coverage_analysis.offer`). */
export interface SeoCoverageAnalysisOffer {
  __kind?: "seo.coverage_analysis.offer";
  brand_name: string;
  brand_terms: string;
  page_url: string;
  page_title?: string;
  page_text: string;
}

/** Offered shape of provision `seo.finding_fix` (kind `seo.finding_fix.offer`). */
export interface SeoFindingFixOffer {
  __kind?: "seo.finding_fix.offer";
  fix_context: {
  page: unknown;
  site: unknown;
  __kind: "seo_finding_fix_context";
  limits: unknown;
  finding: unknown;
  finding_id: string;
  fixer_version: string;
};
  fixer_version: string;
  finding_id?: string;
  site_id?: string;
  organization_id?: string;
  finding_item_key?: string;
  finding_severity?: string;
  finding_category?: string;
  analyzer_reasoning?: string;
  first_detected_at?: string;
  page_url?: string;
  page_current_title?: string;
  page_current_meta_description?: string;
  page_headings_outline?: string;
  page_declared_target_keyword?: string;
  page_content_excerpt?: string;
  page_content_truncated?: boolean;
  page_live_search_queries?: unknown;
  site_domain?: string;
  site_name?: string;
  site_business_one_liner?: string;
  site_services?: string[];
  site_audience?: string;
  site_industry?: string;
  site_positioning_notes?: string;
}

/** Offered shape of provision `seo.guidelines_drafter` (kind `seo.guidelines_drafter.offer`). */
export interface SeoGuidelinesDrafterOffer {
  __kind?: "seo.guidelines_drafter.offer";
  site_domain: string;
  site_pages: string;
  business_model: unknown;
  ideal_customer: unknown;
  money_map: unknown;
  current_guidelines: string;
}

/** Offered shape of provision `seo.ideal_customer_profile` (kind `seo.ideal_customer_profile.offer`). */
export interface SeoIdealCustomerProfileOffer {
  __kind?: "seo.ideal_customer_profile.offer";
  site_domain: string;
  site_pages: string;
  business_model: unknown;
}

/** Offered shape of provision `seo.keyword_classification` (kind `seo.keyword_classification.offer`). */
export interface SeoKeywordClassificationOffer {
  __kind?: "seo.keyword_classification.offer";
  keywords: unknown;
  language: string;
  classifier_version: string;
  business_guidelines: string;
  facet_vocabulary: string;
}

/** Offered shape of provision `seo.keyword_expansion` (kind `seo.keyword_expansion.offer`). */
export interface SeoKeywordExpansionOffer {
  __kind?: "seo.keyword_expansion.offer";
  site_id?: string;
  brand_id?: string;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  brand_name?: string;
  brand_context?: string;
  seo_environment?: string;
  backlink_summary?: unknown;
  top_competitors?: unknown;
  link_gap_seed?: unknown;
  serp_prospecting_prospects?: unknown;
}

/** Offered shape of provision `seo.keyword_research` (kind `seo.keyword_research.offer`). */
export interface SeoKeywordResearchOffer {
  __kind?: "seo.keyword_research.offer";
  primary_keyword: string;
  language: string;
  industry_context?: string;
  list_size: number;
}

/** Offered shape of provision `seo.landscape_brief` (kind `seo.landscape_brief.offer`). */
export interface SeoLandscapeBriefOffer {
  __kind?: "seo.landscape_brief.offer";
  site_id: string;
  business_name: string;
  business_domain: string;
  business_root_url: string;
  business_description: string;
  existing_guidance?: string;
}

/** Offered shape of provision `seo.money_map` (kind `seo.money_map.offer`). */
export interface SeoMoneyMapOffer {
  __kind?: "seo.money_map.offer";
  site_domain: string;
  site_pages: string;
  business_model: unknown;
  ideal_customer: unknown;
}

/** Offered shape of provision `seo.offering_extraction` (kind `seo.offering_extraction.offer`). */
export interface SeoOfferingExtractionOffer {
  __kind?: "seo.offering_extraction.offer";
  site_domain: string;
  site_pages: string;
  business_model: unknown;
  ideal_customer: unknown;
  money_map: unknown;
}

/** Offered shape of provision `seo.offering_valuation` (kind `seo.offering_valuation.offer`). */
export interface SeoOfferingValuationOffer {
  __kind?: "seo.offering_valuation.offer";
  site_domain: string;
  site_pages: string;
  business_model: unknown;
  ideal_customer: unknown;
  money_map: unknown;
  offerings: unknown;
}

/** Offered shape of provision `seo.page_analysis` (kind `seo.page_analysis.offer`). */
export interface SeoPageAnalysisOffer {
  __kind?: "seo.page_analysis.offer";
  site_context: unknown;
  page_location: unknown;
  declared_target_keyword?: string;
  page_url: string;
  page_title?: string;
  meta_description?: string;
  headings_outline?: string;
  gsc_queries: unknown;
  analyzer_version: string;
  page_content: string;
}

/** Offered shape of provision `seo.page_keyword_mapping` (kind `seo.page_keyword_mapping.offer`). */
export interface SeoPageKeywordMappingOffer {
  __kind?: "seo.page_keyword_mapping.offer";
  topic_slug: string;
  cluster_keywords: unknown;
  existing_pages: unknown;
  site_constraints: unknown;
  mapper_version: string;
}

/** Offered shape of provision `seo.press_source_request` (kind `seo.press_source_request.offer`). */
export interface SeoPressSourceRequestOffer {
  __kind?: "seo.press_source_request.offer";
  source_request: unknown;
  expert_context: unknown;
  request_id?: string;
  organization_id?: string;
  request_platform?: string;
  request_outlet?: string;
  request_journalist?: string;
  request_query_title?: string;
  request_query_body?: string;
  request_requirements?: string;
  request_beat?: string;
  deadline_at?: string;
  deadline_risk?: string;
  min_respond_score?: number;
  tight_deadline_hours?: number;
}

/** Offered shape of provision `seo.press_story_analysis` (kind `seo.press_story_analysis.offer`). */
export interface SeoPressStoryAnalysisOffer {
  __kind?: "seo.press_story_analysis.offer";
  site: unknown;
  brand: unknown;
  business_facts: unknown;
  brand_assets: unknown;
  observed_coverage: unknown;
  site_pages: unknown;
  bundle_stats: unknown;
  quality_policy: unknown;
}

/** Offered shape of provision `seo.reputation_intelligence` (kind `seo.reputation_intelligence.offer`). */
export interface SeoReputationIntelligenceOffer {
  __kind?: "seo.reputation_intelligence.offer";
  site: unknown;
  brand_fact: unknown;
  business_facts: unknown;
  brand_assets: unknown;
  backlinks: unknown;
  referring_domains: unknown;
  competitors: unknown;
  competitor_opportunities: unknown;
  ai_citations: unknown;
  ai_claims: unknown;
  rag_hits: unknown;
  coverage: unknown;
  limitations: unknown;
  quality_policy: unknown;
}

/** Offered shape of provision `seo.serp_intent_analysis` (kind `seo.serp_intent_analysis.offer`). */
export interface SeoSerpIntentAnalysisOffer {
  __kind?: "seo.serp_intent_analysis.offer";
  keyword: unknown;
  google_serp: unknown;
  brave_serp: unknown;
  analysis_context: unknown;
  analyzer_version: string;
}

/** Offered shape of provision `seo.site_evidence` (kind `seo.site_evidence.offer`). */
export interface SeoSiteEvidenceOffer {
  __kind?: "seo.site_evidence.offer";
  site_identity?: string;
  business_guidance?: string;
  pages_summary?: string;
  pages_index?: string;
  gsc_summary?: string;
  gsc_top_queries?: string;
  gsc_top_pages?: string;
  keywords_tracked?: string;
  topic_tree?: string;
  backlinks_summary?: string;
  competitors?: string;
  findings_open?: string;
  analysis_scores?: string;
  evidence_coverage?: string;
  evidence_bundle?: string;
}

/** Offered shape of provision `seo.site_intake` (kind `seo.site_intake.offer`). */
export interface SeoSiteIntakeOffer {
  __kind?: "seo.site_intake.offer";
  intake_bundle: {
  __kind: "gsc_site_intake_bundle";
  domain: string;
  periods?: unknown[];
  site_id: string;
  site_name?: string | null;
  brand_name?: string | null;
  juice_pages: unknown;
  data_max_date?: string | null;
  data_min_date?: string | null;
  cannibalization: unknown;
  current_brand_aliases?: string[];
};
  site_id?: string;
  organization_id?: string;
  domain?: string;
  site_name?: string;
  brand_name?: string;
  current_brand_aliases?: string[];
  data_min_date?: string;
  data_max_date?: string;
  period_keys?: string[];
  period_days?: number;
  juice_pages?: unknown;
  cannibalization?: unknown;
}

/** Offered shape of provision `seo.site_strategy_interview` (kind `seo.site_strategy_interview.offer`). */
export interface SeoSiteStrategyInterviewOffer {
  __kind?: "seo.site_strategy_interview.offer";
  topic_branches: unknown;
  business_context: string;
  site_ref: string;
  valuer_version: string;
}

/** Offered shape of provision `seo.starter_pack_proposal` (kind `seo.starter_pack_proposal.offer`). */
export interface SeoStarterPackProposalOffer {
  __kind?: "seo.starter_pack_proposal.offer";
  corpus_json: unknown;
  topic_tree_json: unknown;
  industry_hint: string;
  expert_rulings: unknown;
  proposer_version: string;
}

/** Offered shape of provision `seo.topic_assignment` (kind `seo.topic_assignment.offer`). */
export interface SeoTopicAssignmentOffer {
  __kind?: "seo.topic_assignment.offer";
  keywords: unknown;
  existing_topic_branches: unknown;
  territory: string;
  business_guidelines: string;
  assigner_version: string;
}

/** Offered shape of provision `surfaces_client.binding_context` (kind `surfaces_client.binding_context.offer`). */
export interface SurfacesClientBindingContextOffer {
  __kind?: "surfaces_client.binding_context.offer";
  surface_name: string;
  surface_label: string;
  surface_values: unknown;
  write_targets: unknown;
  agent_name: string;
  agent_description: string;
  agent_contract: unknown;
}

/** Offered shape of provision `tool_viz.component_generation` (kind `tool_viz.component_generation.offer`). */
export interface ToolVizComponentGenerationOffer {
  __kind?: "tool_viz.component_generation.offer";
  complete_tool_object: unknown;
  output_schema: unknown;
  sample_stream: unknown;
  sample_database_entry: unknown;
}

/** Offered shape of provision `tools.content_summarization` (kind `tools.content_summarization.offer`). */
export interface ToolsContentSummarizationOffer {
  __kind?: "tools.content_summarization.offer";
  instructions: string;
  content: string;
}

/** Offered shape of provision `transcript_studio.session_context` (kind `transcript_studio.session_context.offer`). */
export interface TranscriptStudioSessionContextOffer {
  __kind?: "transcript_studio.session_context.offer";
  recording_transcripts?: string;
  all_raw?: string;
  session_cleaned?: string;
  audio_citations?: string;
  working_document?: string;
}

/** Offered shape of provision `vision_interview.answer_tracking` (kind `vision_interview.answer_tracking.offer`). */
export interface VisionInterviewAnswerTrackingOffer {
  __kind?: "vision_interview.answer_tracking.offer";
  open_questions: string;
  human_turn: string;
}

/** Offered shape of provision `vision_interview.finalize_deliverable` (kind `vision_interview.finalize_deliverable.offer`). */
export interface VisionInterviewFinalizeDeliverableOffer {
  __kind?: "vision_interview.finalize_deliverable.offer";
  title: string;
  transcript: string;
  document?: string;
  question_ledger?: string;
}

/** Offered shape of provision `vision_interview.room_activation` (kind `vision_interview.room_activation.offer`). */
export interface VisionInterviewRoomActivationOffer {
  __kind?: "vision_interview.room_activation.offer";
  transcript_delta: string;
  round_directive: string;
  stage_goal: string;
  held_note: string;
  routed_holes: string;
  open_questions: string;
  current_document: string;
}

/** Offered shape of provision `vision_interview.scribe_pass` (kind `vision_interview.scribe_pass.offer`). */
export interface VisionInterviewScribePassOffer {
  __kind?: "vision_interview.scribe_pass.offer";
  transcript_delta: string;
  round_directive: string;
  current_document: string;
  open_questions: string;
}

/** Offered shape of provision `war_room.room_context` (kind `war_room.room_context.offer`). */
export interface WarRoomRoomContextOffer {
  __kind?: "war_room.room_context.offer";
  war_room: unknown;
}

/** Offered shape of provision `war_room.thread_context` (kind `war_room.thread_context.offer`). */
export interface WarRoomThreadContextOffer {
  __kind?: "war_room.thread_context.offer";
  war_room: unknown;
  session_transcripts?: string;
  thread_message?: string;
  master_directive?: string;
}

/** Offered shape of provision `web.endpoint_family_judgment` (kind `web.endpoint_family_judgment.offer`). */
export interface WebEndpointFamilyJudgmentOffer {
  __kind?: "web.endpoint_family_judgment.offer";
  site_domain: string;
  candidates: unknown;
}

/** Offered shape of provision `workflow.extract_sweep` (kind `workflow.extract_sweep.offer`). */
export interface WorkflowExtractSweepOffer {
  __kind?: "workflow.extract_sweep.offer";
  candidates: unknown;
}

/** Offered shape of provision `workflow.node_steward` (kind `workflow.node_steward.offer`). */
export interface WorkflowNodeStewardOffer {
  __kind?: "workflow.node_steward.offer";
  workflow_id: string;
  node_id: string;
  node_label: string;
  spec_type: string;
  node_context: string;
}

/** Offered shape of provision `workflow.plan_kind_authoring` (kind `workflow.plan_kind_authoring.offer`). */
export interface WorkflowPlanKindAuthoringOffer {
  __kind?: "workflow.plan_kind_authoring.offer";
  plan_name: string;
  plan_intent: string;
  plan_notes: string;
  user_description: string;
}

/** Offered shape of provision `workflow.plan_node_type_recommender` (kind `workflow.plan_node_type_recommender.offer`). */
export interface WorkflowPlanNodeTypeRecommenderOffer {
  __kind?: "workflow.plan_node_type_recommender.offer";
  plan_json: string;
  catalog_json: string;
  graph_context: string;
}

/** Offered shape of provision `workflow.plan_notes_writer` (kind `workflow.plan_notes_writer.offer`). */
export interface WorkflowPlanNotesWriterOffer {
  __kind?: "workflow.plan_notes_writer.offer";
  plan_name: string;
  current_notes: string;
  rough_input: string;
  graph_context: string;
}

/** Offered shape of provision `workflow.plan_room` (kind `workflow.plan_room.offer`). */
export interface WorkflowPlanRoomOffer {
  __kind?: "workflow.plan_room.offer";
  plan_id: string;
  definition_id: string;
}

/** Offered shape of provision `workflow.run_failure` (kind `workflow.run_failure.offer`). */
export interface WorkflowRunFailureOffer {
  __kind?: "workflow.run_failure.offer";
  failure_report: string;
}

/** Offered shape of provision `workflow.run_recovery` (kind `workflow.run_recovery.offer`). */
export interface WorkflowRunRecoveryOffer {
  __kind?: "workflow.run_recovery.offer";
  surface: string;
  envelope_xml: string;
}

/** provision_key → its whole offered shape. */
export interface ProvisionOffers {
  "agent_apps.auto_create_request": AgentAppsAutoCreateRequestOffer;
  "agent_apps.metadata_request": AgentAppsMetadataRequestOffer;
  "agent_factory.build_request": AgentFactoryBuildRequestOffer;
  "ambient.page_guidance": AmbientPageGuidanceOffer;
  "chat.mandated_start": ChatMandatedStartOffer;
  "code_editor.session": CodeEditorSessionOffer;
  "commerce_intake.asset_capture": CommerceIntakeAssetCaptureOffer;
  "commerce_intake.batch_capture": CommerceIntakeBatchCaptureOffer;
  "commerce_intake.bench_grading": CommerceIntakeBenchGradingOffer;
  "commerce_intake.disposal_challenge": CommerceIntakeDisposalChallengeOffer;
  "commerce_intake.enrichment_bundle": CommerceIntakeEnrichmentBundleOffer;
  "commerce_intake.extraction_dossier": CommerceIntakeExtractionDossierOffer;
  "commerce_intake.instant_capture": CommerceIntakeInstantCaptureOffer;
  "commerce_intake.valuation_dossier": CommerceIntakeValuationDossierOffer;
  "communications.sms_assistant_turn": CommunicationsSmsAssistantTurnOffer;
  "content_ir.component_authoring": ContentIrComponentAuthoringOffer;
  "content_ir.component_target": ContentIrComponentTargetOffer;
  "content_ir.kind_authoring": ContentIrKindAuthoringOffer;
  "content_ir.kind_builder": ContentIrKindBuilderOffer;
  "content_plan.entity_attachment": ContentPlanEntityAttachmentOffer;
  "content_plan.entity_roster": ContentPlanEntityRosterOffer;
  "content_plan.family_naming": ContentPlanFamilyNamingOffer;
  "content_plan.keyword_strategy": ContentPlanKeywordStrategyOffer;
  "content_plan.page_brief": ContentPlanPageBriefOffer;
  "content_plan.page_build": ContentPlanPageBuildOffer;
  "content_plan.page_family": ContentPlanPageFamilyOffer;
  "content_plan.page_review": ContentPlanPageReviewOffer;
  "content_plan.page_route": ContentPlanPageRouteOffer;
  "content_plan.page_write": ContentPlanPageWriteOffer;
  "content_plan.plan_review": ContentPlanPlanReviewOffer;
  "content_plan.plan_shape": ContentPlanPlanShapeOffer;
  "conversation.analysis": ConversationAnalysisOffer;
  "crm.chasebox_draft_review": CrmChaseboxDraftReviewOffer;
  "crm.journalist_beat_analysis": CrmJournalistBeatAnalysisOffer;
  "crm.media_list_ranker": CrmMediaListRankerOffer;
  "crm.outreach_lists": CrmOutreachListsOffer;
  "crm.outreach_personalization_writer": CrmOutreachPersonalizationWriterOffer;
  "crm.outreach_recipient_shortlister": CrmOutreachRecipientShortlisterOffer;
  "crm.outreach_reply_drafter": CrmOutreachReplyDrafterOffer;
  "crm.party_kind_judgment": CrmPartyKindJudgmentOffer;
  "crm.save_contact_selection": CrmSaveContactSelectionOffer;
  "dictionary.workspace": DictionaryWorkspaceOffer;
  "education.analytics_narrate": EducationAnalyticsNarrateOffer;
  "education.card_image": EducationCardImageOffer;
  "education.card_image_generation": EducationCardImageGenerationOffer;
  "education.card_image_prompt": EducationCardImagePromptOffer;
  "education.convert_source": EducationConvertSourceOffer;
  "education.grade_handwritten": EducationGradeHandwrittenOffer;
  "education.memory_hint": EducationMemoryHintOffer;
  "education.plan_generate": EducationPlanGenerateOffer;
  "education.quiz_deepen_item": EducationQuizDeepenItemOffer;
  "education.quiz_generate": EducationQuizGenerateOffer;
  "education.quiz_generate_from_source": EducationQuizGenerateFromSourceOffer;
  "education.spoken_practice_design": EducationSpokenPracticeDesignOffer;
  "education.spoken_practice_grade": EducationSpokenPracticeGradeOffer;
  "education.spoken_practice_review": EducationSpokenPracticeReviewOffer;
  "education.study_pack": EducationStudyPackOffer;
  "education.study_pack_v2": EducationStudyPackV2Offer;
  "education.tutor_message": EducationTutorMessageOffer;
  "education.voice_tutor": EducationVoiceTutorOffer;
  "extend.browser_chat": ExtendBrowserChatOffer;
  "extend.page_capture": ExtendPageCaptureOffer;
  "flashcards.enrich_card": FlashcardsEnrichCardOffer;
  "flashcards.expand_card": FlashcardsExpandCardOffer;
  "flashcards.generate_cards": FlashcardsGenerateCardsOffer;
  "flashcards.generate_from_source": FlashcardsGenerateFromSourceOffer;
  "flashcards.grade_spoken": FlashcardsGradeSpokenOffer;
  "flashcards.grade_typed_answer": FlashcardsGradeTypedAnswerOffer;
  "flashcards.help_live": FlashcardsHelpLiveOffer;
  "flashcards.make_quiz_items": FlashcardsMakeQuizItemsOffer;
  "flashcards.micro_coach": FlashcardsMicroCoachOffer;
  "flashcards.review_batch": FlashcardsReviewBatchOffer;
  "flashcards.tts_render": FlashcardsTtsRenderOffer;
  "flashcards.verify_against_source": FlashcardsVerifyAgainstSourceOffer;
  "foundry.agent_planning": FoundryAgentPlanningOffer;
  "growth_loop.stage_dispatch": GrowthLoopStageDispatchOffer;
  "growth_loop.stage_quality": GrowthLoopStageQualityOffer;
  "hindsight.enrollment_review": HindsightEnrollmentReviewOffer;
  "hindsight.orchestra_crystallization": HindsightOrchestraCrystallizationOffer;
  "hindsight.replay_comparison": HindsightReplayComparisonOffer;
  "human_decisions.absent_human_decision": HumanDecisionsAbsentHumanDecisionOffer;
  "iteration.rebuild_chain": IterationRebuildChainOffer;
  "iteration.thinking_display_narration": IterationThinkingDisplayNarrationOffer;
  "kg.chunk_extraction": KgChunkExtractionOffer;
  "kg.entity_cluster": KgEntityClusterOffer;
  "knowledge.document_verification": KnowledgeDocumentVerificationOffer;
  "knowledge.section_derivation": KnowledgeSectionDerivationOffer;
  "knowledge.section_qa": KnowledgeSectionQaOffer;
  "marketing.image_prompt": MarketingImagePromptOffer;
  "marketing.local_endowment": MarketingLocalEndowmentOffer;
  "marketing.page_image": MarketingPageImageOffer;
  "marketing.page_image_all_in_one": MarketingPageImageAllInOneOffer;
  "marketing.video_metadata": MarketingVideoMetadataOffer;
  "masterwork.approach_select": MasterworkApproachSelectOffer;
  "masterwork.audition_judgment": MasterworkAuditionJudgmentOffer;
  "masterwork.bad_draft_write": MasterworkBadDraftWriteOffer;
  "masterwork.checkup_scan": MasterworkCheckupScanOffer;
  "masterwork.chunk_distill": MasterworkChunkDistillOffer;
  "masterwork.coherence_scan": MasterworkCoherenceScanOffer;
  "masterwork.conduct": MasterworkConductOffer;
  "masterwork.corpus_clean": MasterworkCorpusCleanOffer;
  "masterwork.corpus_synthesis": MasterworkCorpusSynthesisOffer;
  "masterwork.intake_design": MasterworkIntakeDesignOffer;
  "masterwork.rule_improve": MasterworkRuleImproveOffer;
  "masterwork.rulebook_audit": MasterworkRulebookAuditOffer;
  "masterwork.scout_interview": MasterworkScoutInterviewOffer;
  "masterwork.transcript_shortlist": MasterworkTranscriptShortlistOffer;
  "masterwork.understudy_run": MasterworkUnderstudyRunOffer;
  "media.youtube_transcription": MediaYoutubeTranscriptionOffer;
  "ner.deep_chunk_extraction": NerDeepChunkExtractionOffer;
  "ner.document_orientation": NerDocumentOrientationOffer;
  "ner.entity_canonicalization": NerEntityCanonicalizationOffer;
  "ner.finisher_batch": NerFinisherBatchOffer;
  "ner.item_proposal": NerItemProposalOffer;
  "ner.magic_moment_detection": NerMagicMomentDetectionOffer;
  "ner.scope_proposal": NerScopeProposalOffer;
  "ner.scope_slot_filling": NerScopeSlotFillingOffer;
  "ner.suggestion_review": NerSuggestionReviewOffer;
  "ner.sweep_scope_discovery": NerSweepScopeDiscoveryOffer;
  "ner.sweep_scope_references": NerSweepScopeReferencesOffer;
  "ner.sweep_value_mining": NerSweepValueMiningOffer;
  "observability.tool_trace_pattern_window": ObservabilityToolTracePatternWindowOffer;
  "observability.tool_trace_triage_window": ObservabilityToolTraceTriageWindowOffer;
  "orchestras.member_roster": OrchestrasMemberRosterOffer;
  "pdf.content_cleaning": PdfContentCleaningOffer;
  "podcast.audience_adaptation": PodcastAudienceAdaptationOffer;
  "podcast.audio_stage": PodcastAudioStageOffer;
  "podcast.chaptering": PodcastChapteringOffer;
  "podcast.feature_image_prompt": PodcastFeatureImagePromptOffer;
  "podcast.image_render": PodcastImageRenderOffer;
  "podcast.legacy_script_stage": PodcastLegacyScriptStageOffer;
  "podcast.live_session": PodcastLiveSessionOffer;
  "podcast.metadata_stage": PodcastMetadataStageOffer;
  "podcast.post_prep": PodcastPostPrepOffer;
  "podcast.prep_extraction": PodcastPrepExtractionOffer;
  "podcast.script_stage": PodcastScriptStageOffer;
  "podcast.title_optimization": PodcastTitleOptimizationOffer;
  "podcast.video_render": PodcastVideoRenderOffer;
  "podcast_client.episode_content": PodcastClientEpisodeContentOffer;
  "podcast_client.topic_idea_request": PodcastClientTopicIdeaRequestOffer;
  "podcast_client.web_source": PodcastClientWebSourceOffer;
  "podcast_client.youtube_source": PodcastClientYoutubeSourceOffer;
  "proof_runs.judge_case": ProofRunsJudgeCaseOffer;
  "purpose.unit_config": PurposeUnitConfigOffer;
  "rag.chunk_context": RagChunkContextOffer;
  "rag.page_cleaning": RagPageCleaningOffer;
  "rag.retrieval_query": RagRetrievalQueryOffer;
  "research.capture_coverage": ResearchCaptureCoverageOffer;
  "research.cross_cutting_discovery": ResearchCrossCuttingDiscoveryOffer;
  "research.final_assembly": ResearchFinalAssemblyOffer;
  "research.keyword_findings": ResearchKeywordFindingsOffer;
  "research.page_capture": ResearchPageCaptureOffer;
  "research.page_tagging": ResearchPageTaggingOffer;
  "research.report_synthesis": ResearchReportSynthesisOffer;
  "research.report_update": ResearchReportUpdateOffer;
  "research.scrape_condensation": ResearchScrapeCondensationOffer;
  "research.source_triage": ResearchSourceTriageOffer;
  "research.tagged_pages": ResearchTaggedPagesOffer;
  "research.topic_setup": ResearchTopicSetupOffer;
  "research_client.context_bundle": ResearchClientContextBundleOffer;
  "research_client.report_output": ResearchClientReportOutputOffer;
  "scraper.page_analysis": ScraperPageAnalysisOffer;
  "seo.ai_visibility_analysis": SeoAiVisibilityAnalysisOffer;
  "seo.authority_routing": SeoAuthorityRoutingOffer;
  "seo.backlink_context_assessor": SeoBacklinkContextAssessorOffer;
  "seo.business_model_verdict": SeoBusinessModelVerdictOffer;
  "seo.competitor_classification": SeoCompetitorClassificationOffer;
  "seo.competitor_opportunity_autopsy": SeoCompetitorOpportunityAutopsyOffer;
  "seo.competitor_page_autopsy": SeoCompetitorPageAutopsyOffer;
  "seo.coverage_analysis": SeoCoverageAnalysisOffer;
  "seo.finding_fix": SeoFindingFixOffer;
  "seo.guidelines_drafter": SeoGuidelinesDrafterOffer;
  "seo.ideal_customer_profile": SeoIdealCustomerProfileOffer;
  "seo.keyword_classification": SeoKeywordClassificationOffer;
  "seo.keyword_expansion": SeoKeywordExpansionOffer;
  "seo.keyword_research": SeoKeywordResearchOffer;
  "seo.landscape_brief": SeoLandscapeBriefOffer;
  "seo.money_map": SeoMoneyMapOffer;
  "seo.offering_extraction": SeoOfferingExtractionOffer;
  "seo.offering_valuation": SeoOfferingValuationOffer;
  "seo.page_analysis": SeoPageAnalysisOffer;
  "seo.page_keyword_mapping": SeoPageKeywordMappingOffer;
  "seo.press_source_request": SeoPressSourceRequestOffer;
  "seo.press_story_analysis": SeoPressStoryAnalysisOffer;
  "seo.reputation_intelligence": SeoReputationIntelligenceOffer;
  "seo.serp_intent_analysis": SeoSerpIntentAnalysisOffer;
  "seo.site_evidence": SeoSiteEvidenceOffer;
  "seo.site_intake": SeoSiteIntakeOffer;
  "seo.site_strategy_interview": SeoSiteStrategyInterviewOffer;
  "seo.starter_pack_proposal": SeoStarterPackProposalOffer;
  "seo.topic_assignment": SeoTopicAssignmentOffer;
  "surfaces_client.binding_context": SurfacesClientBindingContextOffer;
  "tool_viz.component_generation": ToolVizComponentGenerationOffer;
  "tools.content_summarization": ToolsContentSummarizationOffer;
  "transcript_studio.session_context": TranscriptStudioSessionContextOffer;
  "vision_interview.answer_tracking": VisionInterviewAnswerTrackingOffer;
  "vision_interview.finalize_deliverable": VisionInterviewFinalizeDeliverableOffer;
  "vision_interview.room_activation": VisionInterviewRoomActivationOffer;
  "vision_interview.scribe_pass": VisionInterviewScribePassOffer;
  "war_room.room_context": WarRoomRoomContextOffer;
  "war_room.thread_context": WarRoomThreadContextOffer;
  "web.endpoint_family_judgment": WebEndpointFamilyJudgmentOffer;
  "workflow.extract_sweep": WorkflowExtractSweepOffer;
  "workflow.node_steward": WorkflowNodeStewardOffer;
  "workflow.plan_kind_authoring": WorkflowPlanKindAuthoringOffer;
  "workflow.plan_node_type_recommender": WorkflowPlanNodeTypeRecommenderOffer;
  "workflow.plan_notes_writer": WorkflowPlanNotesWriterOffer;
  "workflow.plan_room": WorkflowPlanRoomOffer;
  "workflow.run_failure": WorkflowRunFailureOffer;
  "workflow.run_recovery": WorkflowRunRecoveryOffer;
}

export type ProvisionKey = keyof ProvisionOffers;

/** provision_key → its registered derived input kind slug. */
export const PROVISION_OFFER_KINDS = {
  "agent_apps.auto_create_request": "agent_apps.auto_create_request.offer",
  "agent_apps.metadata_request": "agent_apps.metadata_request.offer",
  "agent_factory.build_request": "agent_factory.build_request.offer",
  "ambient.page_guidance": "ambient.page_guidance.offer",
  "chat.mandated_start": "chat.mandated_start.offer",
  "code_editor.session": "code_editor.session.offer",
  "commerce_intake.asset_capture": "commerce_intake.asset_capture.offer",
  "commerce_intake.batch_capture": "commerce_intake.batch_capture.offer",
  "commerce_intake.bench_grading": "commerce_intake.bench_grading.offer",
  "commerce_intake.disposal_challenge": "commerce_intake.disposal_challenge.offer",
  "commerce_intake.enrichment_bundle": "commerce_intake.enrichment_bundle.offer",
  "commerce_intake.extraction_dossier": "commerce_intake.extraction_dossier.offer",
  "commerce_intake.instant_capture": "commerce_intake.instant_capture.offer",
  "commerce_intake.valuation_dossier": "commerce_intake.valuation_dossier.offer",
  "communications.sms_assistant_turn": "communications.sms_assistant_turn.offer",
  "content_ir.component_authoring": "content_ir.component_authoring.offer",
  "content_ir.component_target": "content_ir.component_target.offer",
  "content_ir.kind_authoring": "content_ir.kind_authoring.offer",
  "content_ir.kind_builder": "content_ir.kind_builder.offer",
  "content_plan.entity_attachment": "content_plan.entity_attachment.offer",
  "content_plan.entity_roster": "content_plan.entity_roster.offer",
  "content_plan.family_naming": "content_plan.family_naming.offer",
  "content_plan.keyword_strategy": "content_plan.keyword_strategy.offer",
  "content_plan.page_brief": "content_plan.page_brief.offer",
  "content_plan.page_build": "content_plan.page_build.offer",
  "content_plan.page_family": "content_plan.page_family.offer",
  "content_plan.page_review": "content_plan.page_review.offer",
  "content_plan.page_route": "content_plan.page_route.offer",
  "content_plan.page_write": "content_plan.page_write.offer",
  "content_plan.plan_review": "content_plan.plan_review.offer",
  "content_plan.plan_shape": "content_plan.plan_shape.offer",
  "conversation.analysis": "conversation.analysis.offer",
  "crm.chasebox_draft_review": "crm.chasebox_draft_review.offer",
  "crm.journalist_beat_analysis": "crm.journalist_beat_analysis.offer",
  "crm.media_list_ranker": "crm.media_list_ranker.offer",
  "crm.outreach_lists": "crm.outreach_lists.offer",
  "crm.outreach_personalization_writer": "crm.outreach_personalization_writer.offer",
  "crm.outreach_recipient_shortlister": "crm.outreach_recipient_shortlister.offer",
  "crm.outreach_reply_drafter": "crm.outreach_reply_drafter.offer",
  "crm.party_kind_judgment": "crm.party_kind_judgment.offer",
  "crm.save_contact_selection": "crm.save_contact_selection.offer",
  "dictionary.workspace": "dictionary.workspace.offer",
  "education.analytics_narrate": "education.analytics_narrate.offer",
  "education.card_image": "education.card_image.offer",
  "education.card_image_generation": "education.card_image_generation.offer",
  "education.card_image_prompt": "education.card_image_prompt.offer",
  "education.convert_source": "education.convert_source.offer",
  "education.grade_handwritten": "education.grade_handwritten.offer",
  "education.memory_hint": "education.memory_hint.offer",
  "education.plan_generate": "education.plan_generate.offer",
  "education.quiz_deepen_item": "education.quiz_deepen_item.offer",
  "education.quiz_generate": "education.quiz_generate.offer",
  "education.quiz_generate_from_source": "education.quiz_generate_from_source.offer",
  "education.spoken_practice_design": "education.spoken_practice_design.offer",
  "education.spoken_practice_grade": "education.spoken_practice_grade.offer",
  "education.spoken_practice_review": "education.spoken_practice_review.offer",
  "education.study_pack": "education.study_pack.offer",
  "education.study_pack_v2": "education.study_pack_v2.offer",
  "education.tutor_message": "education.tutor_message.offer",
  "education.voice_tutor": "education.voice_tutor.offer",
  "extend.browser_chat": "extend.browser_chat.offer",
  "extend.page_capture": "extend.page_capture.offer",
  "flashcards.enrich_card": "flashcards.enrich_card.offer",
  "flashcards.expand_card": "flashcards.expand_card.offer",
  "flashcards.generate_cards": "flashcards.generate_cards.offer",
  "flashcards.generate_from_source": "flashcards.generate_from_source.offer",
  "flashcards.grade_spoken": "flashcards.grade_spoken.offer",
  "flashcards.grade_typed_answer": "flashcards.grade_typed_answer.offer",
  "flashcards.help_live": "flashcards.help_live.offer",
  "flashcards.make_quiz_items": "flashcards.make_quiz_items.offer",
  "flashcards.micro_coach": "flashcards.micro_coach.offer",
  "flashcards.review_batch": "flashcards.review_batch.offer",
  "flashcards.tts_render": "flashcards.tts_render.offer",
  "flashcards.verify_against_source": "flashcards.verify_against_source.offer",
  "foundry.agent_planning": "foundry.agent_planning.offer",
  "growth_loop.stage_dispatch": "growth_loop.stage_dispatch.offer",
  "growth_loop.stage_quality": "growth_loop.stage_quality.offer",
  "hindsight.enrollment_review": "hindsight.enrollment_review.offer",
  "hindsight.orchestra_crystallization": "hindsight.orchestra_crystallization.offer",
  "hindsight.replay_comparison": "hindsight.replay_comparison.offer",
  "human_decisions.absent_human_decision": "human_decisions.absent_human_decision.offer",
  "iteration.rebuild_chain": "iteration.rebuild_chain.offer",
  "iteration.thinking_display_narration": "iteration.thinking_display_narration.offer",
  "kg.chunk_extraction": "kg.chunk_extraction.offer",
  "kg.entity_cluster": "kg.entity_cluster.offer",
  "knowledge.document_verification": "knowledge.document_verification.offer",
  "knowledge.section_derivation": "knowledge.section_derivation.offer",
  "knowledge.section_qa": "knowledge.section_qa.offer",
  "marketing.image_prompt": "marketing.image_prompt.offer",
  "marketing.local_endowment": "marketing.local_endowment.offer",
  "marketing.page_image": "marketing.page_image.offer",
  "marketing.page_image_all_in_one": "marketing.page_image_all_in_one.offer",
  "marketing.video_metadata": "marketing.video_metadata.offer",
  "masterwork.approach_select": "masterwork.approach_select.offer",
  "masterwork.audition_judgment": "masterwork.audition_judgment.offer",
  "masterwork.bad_draft_write": "masterwork.bad_draft_write.offer",
  "masterwork.checkup_scan": "masterwork.checkup_scan.offer",
  "masterwork.chunk_distill": "masterwork.chunk_distill.offer",
  "masterwork.coherence_scan": "masterwork.coherence_scan.offer",
  "masterwork.conduct": "masterwork.conduct.offer",
  "masterwork.corpus_clean": "masterwork.corpus_clean.offer",
  "masterwork.corpus_synthesis": "masterwork.corpus_synthesis.offer",
  "masterwork.intake_design": "masterwork.intake_design.offer",
  "masterwork.rule_improve": "masterwork.rule_improve.offer",
  "masterwork.rulebook_audit": "masterwork.rulebook_audit.offer",
  "masterwork.scout_interview": "masterwork.scout_interview.offer",
  "masterwork.transcript_shortlist": "masterwork.transcript_shortlist.offer",
  "masterwork.understudy_run": "masterwork.understudy_run.offer",
  "media.youtube_transcription": "media.youtube_transcription.offer",
  "ner.deep_chunk_extraction": "ner.deep_chunk_extraction.offer",
  "ner.document_orientation": "ner.document_orientation.offer",
  "ner.entity_canonicalization": "ner.entity_canonicalization.offer",
  "ner.finisher_batch": "ner.finisher_batch.offer",
  "ner.item_proposal": "ner.item_proposal.offer",
  "ner.magic_moment_detection": "ner.magic_moment_detection.offer",
  "ner.scope_proposal": "ner.scope_proposal.offer",
  "ner.scope_slot_filling": "ner.scope_slot_filling.offer",
  "ner.suggestion_review": "ner.suggestion_review.offer",
  "ner.sweep_scope_discovery": "ner.sweep_scope_discovery.offer",
  "ner.sweep_scope_references": "ner.sweep_scope_references.offer",
  "ner.sweep_value_mining": "ner.sweep_value_mining.offer",
  "observability.tool_trace_pattern_window": "observability.tool_trace_pattern_window.offer",
  "observability.tool_trace_triage_window": "observability.tool_trace_triage_window.offer",
  "orchestras.member_roster": "orchestras.member_roster.offer",
  "pdf.content_cleaning": "pdf.content_cleaning.offer",
  "podcast.audience_adaptation": "podcast.audience_adaptation.offer",
  "podcast.audio_stage": "podcast.audio_stage.offer",
  "podcast.chaptering": "podcast.chaptering.offer",
  "podcast.feature_image_prompt": "podcast.feature_image_prompt.offer",
  "podcast.image_render": "podcast.image_render.offer",
  "podcast.legacy_script_stage": "podcast.legacy_script_stage.offer",
  "podcast.live_session": "podcast.live_session.offer",
  "podcast.metadata_stage": "podcast.metadata_stage.offer",
  "podcast.post_prep": "podcast.post_prep.offer",
  "podcast.prep_extraction": "podcast.prep_extraction.offer",
  "podcast.script_stage": "podcast.script_stage.offer",
  "podcast.title_optimization": "podcast.title_optimization.offer",
  "podcast.video_render": "podcast.video_render.offer",
  "podcast_client.episode_content": "podcast_client.episode_content.offer",
  "podcast_client.topic_idea_request": "podcast_client.topic_idea_request.offer",
  "podcast_client.web_source": "podcast_client.web_source.offer",
  "podcast_client.youtube_source": "podcast_client.youtube_source.offer",
  "proof_runs.judge_case": "proof_runs.judge_case.offer",
  "purpose.unit_config": "purpose.unit_config.offer",
  "rag.chunk_context": "rag.chunk_context.offer",
  "rag.page_cleaning": "rag.page_cleaning.offer",
  "rag.retrieval_query": "rag.retrieval_query.offer",
  "research.capture_coverage": "research.capture_coverage.offer",
  "research.cross_cutting_discovery": "research.cross_cutting_discovery.offer",
  "research.final_assembly": "research.final_assembly.offer",
  "research.keyword_findings": "research.keyword_findings.offer",
  "research.page_capture": "research.page_capture.offer",
  "research.page_tagging": "research.page_tagging.offer",
  "research.report_synthesis": "research.report_synthesis.offer",
  "research.report_update": "research.report_update.offer",
  "research.scrape_condensation": "research.scrape_condensation.offer",
  "research.source_triage": "research.source_triage.offer",
  "research.tagged_pages": "research.tagged_pages.offer",
  "research.topic_setup": "research.topic_setup.offer",
  "research_client.context_bundle": "research_client.context_bundle.offer",
  "research_client.report_output": "research_client.report_output.offer",
  "scraper.page_analysis": "scraper.page_analysis.offer",
  "seo.ai_visibility_analysis": "seo.ai_visibility_analysis.offer",
  "seo.authority_routing": "seo.authority_routing.offer",
  "seo.backlink_context_assessor": "seo.backlink_context_assessor.offer",
  "seo.business_model_verdict": "seo.business_model_verdict.offer",
  "seo.competitor_classification": "seo.competitor_classification.offer",
  "seo.competitor_opportunity_autopsy": "seo.competitor_opportunity_autopsy.offer",
  "seo.competitor_page_autopsy": "seo.competitor_page_autopsy.offer",
  "seo.coverage_analysis": "seo.coverage_analysis.offer",
  "seo.finding_fix": "seo.finding_fix.offer",
  "seo.guidelines_drafter": "seo.guidelines_drafter.offer",
  "seo.ideal_customer_profile": "seo.ideal_customer_profile.offer",
  "seo.keyword_classification": "seo.keyword_classification.offer",
  "seo.keyword_expansion": "seo.keyword_expansion.offer",
  "seo.keyword_research": "seo.keyword_research.offer",
  "seo.landscape_brief": "seo.landscape_brief.offer",
  "seo.money_map": "seo.money_map.offer",
  "seo.offering_extraction": "seo.offering_extraction.offer",
  "seo.offering_valuation": "seo.offering_valuation.offer",
  "seo.page_analysis": "seo.page_analysis.offer",
  "seo.page_keyword_mapping": "seo.page_keyword_mapping.offer",
  "seo.press_source_request": "seo.press_source_request.offer",
  "seo.press_story_analysis": "seo.press_story_analysis.offer",
  "seo.reputation_intelligence": "seo.reputation_intelligence.offer",
  "seo.serp_intent_analysis": "seo.serp_intent_analysis.offer",
  "seo.site_evidence": "seo.site_evidence.offer",
  "seo.site_intake": "seo.site_intake.offer",
  "seo.site_strategy_interview": "seo.site_strategy_interview.offer",
  "seo.starter_pack_proposal": "seo.starter_pack_proposal.offer",
  "seo.topic_assignment": "seo.topic_assignment.offer",
  "surfaces_client.binding_context": "surfaces_client.binding_context.offer",
  "tool_viz.component_generation": "tool_viz.component_generation.offer",
  "tools.content_summarization": "tools.content_summarization.offer",
  "transcript_studio.session_context": "transcript_studio.session_context.offer",
  "vision_interview.answer_tracking": "vision_interview.answer_tracking.offer",
  "vision_interview.finalize_deliverable": "vision_interview.finalize_deliverable.offer",
  "vision_interview.room_activation": "vision_interview.room_activation.offer",
  "vision_interview.scribe_pass": "vision_interview.scribe_pass.offer",
  "war_room.room_context": "war_room.room_context.offer",
  "war_room.thread_context": "war_room.thread_context.offer",
  "web.endpoint_family_judgment": "web.endpoint_family_judgment.offer",
  "workflow.extract_sweep": "workflow.extract_sweep.offer",
  "workflow.node_steward": "workflow.node_steward.offer",
  "workflow.plan_kind_authoring": "workflow.plan_kind_authoring.offer",
  "workflow.plan_node_type_recommender": "workflow.plan_node_type_recommender.offer",
  "workflow.plan_notes_writer": "workflow.plan_notes_writer.offer",
  "workflow.plan_room": "workflow.plan_room.offer",
  "workflow.run_failure": "workflow.run_failure.offer",
  "workflow.run_recovery": "workflow.run_recovery.offer",
} as const;
