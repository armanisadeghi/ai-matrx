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
  prompt_config: unknown;
}

/** Offered shape of provision `agent_factory.build_request` (kind `agent_factory.build_request.offer`). */
export interface AgentFactoryBuildRequestOffer {
  prompt_purpose: string;
}

/** Offered shape of provision `code_editor.session` (kind `code_editor.session.offer`). */
export interface CodeEditorSessionOffer {
  current_code?: string;
  dynamic_context?: string;
}

/** Offered shape of provision `content_ir.component_target` (kind `content_ir.component_target.offer`). */
export interface ContentIrComponentTargetOffer {
  kind_slug: string;
  kind_label: string;
  platform: string;
  json_schema: unknown;
  example_data?: unknown;
}

/** Offered shape of provision `content_ir.kind_authoring` (kind `content_ir.kind_authoring.offer`). */
export interface ContentIrKindAuthoringOffer {
  task_brief?: string;
  kind_schema?: unknown;
  user_data_sample?: string;
}

/** Offered shape of provision `content_ir.kind_builder` (kind `content_ir.kind_builder.offer`). */
export interface ContentIrKindBuilderOffer {
  user_data_sample: string;
}

/** Offered shape of provision `content_plan.entity_attachment` (kind `content_plan.entity_attachment.offer`). */
export interface ContentPlanEntityAttachmentOffer {
  research_report: string;
  site_domain?: string;
  guidance?: string;
  current_plan: string;
  entity_roster: string;
}

/** Offered shape of provision `content_plan.entity_roster` (kind `content_plan.entity_roster.offer`). */
export interface ContentPlanEntityRosterOffer {
  research_report: string;
  site_domain?: string;
  guidance?: string;
  existing_entities?: string;
}

/** Offered shape of provision `content_plan.family_naming` (kind `content_plan.family_naming.offer`). */
export interface ContentPlanFamilyNamingOffer {
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
  research_report: string;
  site_domain?: string;
  guidance?: string;
  current_plan: string;
  available_keywords: string;
  target_routes: string[];
}

/** Offered shape of provision `content_plan.page_brief` (kind `content_plan.page_brief.offer`). */
export interface ContentPlanPageBriefOffer {
  research_report: string;
  site_domain?: string;
  guidance?: string;
  page: string;
  keyword_assignment: string;
  neighbours: string;
}

/** Offered shape of provision `content_plan.page_build` (kind `content_plan.page_build.offer`). */
export interface ContentPlanPageBuildOffer {
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
  meta_limits: unknown;
}

/** Offered shape of provision `content_plan.page_family` (kind `content_plan.page_family.offer`). */
export interface ContentPlanPageFamilyOffer {
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
  guidance?: string;
}

/** Offered shape of provision `content_plan.page_review` (kind `content_plan.page_review.offer`). */
export interface ContentPlanPageReviewOffer {
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
  page_title: string;
  primary_keyword?: string;
  family_route: string;
  sibling_routes: string[];
}

/** Offered shape of provision `content_plan.page_write` (kind `content_plan.page_write.offer`). */
export interface ContentPlanPageWriteOffer {
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
  research_report: string;
  site_domain?: string;
  guidance?: string;
  current_plan: string;
}

/** Offered shape of provision `content_plan.plan_shape` (kind `content_plan.plan_shape.offer`). */
export interface ContentPlanPlanShapeOffer {
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
  conversation_id: string;
}

/** Offered shape of provision `crm.journalist_beat_analysis` (kind `crm.journalist_beat_analysis.offer`). */
export interface CrmJournalistBeatAnalysisOffer {
  person_name: string;
  outlet_name?: string;
  articles: string;
  campaign_context?: string;
}

/** Offered shape of provision `crm.media_list_ranker` (kind `crm.media_list_ranker.offer`). */
export interface CrmMediaListRankerOffer {
  goal_context: string;
  candidates_json: string;
  shortlist_size?: string;
}

/** Offered shape of provision `crm.outreach_personalization_writer` (kind `crm.outreach_personalization_writer.offer`). */
export interface CrmOutreachPersonalizationWriterOffer {
  campaign_context: string;
  targets_json: string;
}

/** Offered shape of provision `crm.outreach_recipient_shortlister` (kind `crm.outreach_recipient_shortlister.offer`). */
export interface CrmOutreachRecipientShortlisterOffer {
  pitch_context: string;
  recipients_json: string;
  shortlist_size?: string;
}

/** Offered shape of provision `crm.outreach_reply_drafter` (kind `crm.outreach_reply_drafter.offer`). */
export interface CrmOutreachReplyDrafterOffer {
  campaign_context: string;
  thread_json: string;
  record_facts?: string;
}

/** Offered shape of provision `crm.party_kind_judgment` (kind `crm.party_kind_judgment.offer`). */
export interface CrmPartyKindJudgmentOffer {
  display_name: string;
  platform_label: string;
  profile_url: string;
  evidence: string;
}

/** Offered shape of provision `crm.save_contact_selection` (kind `crm.save_contact_selection.offer`). */
export interface CrmSaveContactSelectionOffer {
  selection: string;
  hints?: string;
  origin: string;
}

/** Offered shape of provision `dictionary.workspace` (kind `dictionary.workspace.offer`). */
export interface DictionaryWorkspaceOffer {
  dictionary_workspace: string;
}

/** Offered shape of provision `education.analytics_narrate` (kind `education.analytics_narrate.offer`). */
export interface EducationAnalyticsNarrateOffer {
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
  card_front: string;
  card_back: string;
  topic: string;
  face: string;
  candidates?: unknown;
  candidate_images?: unknown;
  generation_prompt?: string;
  generated_image?: unknown;
  style?: string;
}

/** Offered shape of provision `education.convert_source` (kind `education.convert_source.offer`). */
export interface EducationConvertSourceOffer {
  source_content: string;
  title: string;
  focus?: string;
}

/** Offered shape of provision `education.grade_handwritten` (kind `education.grade_handwritten.offer`). */
export interface EducationGradeHandwrittenOffer {
  question: string;
  expected_answer: string;
  work_photo?: unknown;
}

/** Offered shape of provision `education.memory_hint` (kind `education.memory_hint.offer`). */
export interface EducationMemoryHintOffer {
  front: string;
  back: string;
  topic?: string;
}

/** Offered shape of provision `education.plan_generate` (kind `education.plan_generate.offer`). */
export interface EducationPlanGenerateOffer {
  goal_title: string;
  start_date: string;
  exam_date: string;
  daily_minutes: number;
  rest_days: string;
  study_snapshot: unknown;
}

/** Offered shape of provision `education.quiz_deepen_item` (kind `education.quiz_deepen_item.offer`). */
export interface EducationQuizDeepenItemOffer {
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
  mode?: string;
  focus: string;
  study_material?: string;
  difficulty: string;
  count: number;
}

/** Offered shape of provision `education.spoken_practice_grade` (kind `education.spoken_practice_grade.offer`). */
export interface EducationSpokenPracticeGradeOffer {
  front: string;
  back: string;
  rubric: string;
  seconds_allowed: number;
  answer_audio?: unknown;
}

/** Offered shape of provision `education.spoken_practice_review` (kind `education.spoken_practice_review.offer`). */
export interface EducationSpokenPracticeReviewOffer {
  mode: string;
  transcript: string;
  aggregate: string;
}

/** Offered shape of provision `education.study_pack` (kind `education.study_pack.offer`). */
export interface EducationStudyPackOffer {
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
  learner_memory: string;
  study_material?: string;
  teaching_mode: string;
  personality_style: string;
}

/** Offered shape of provision `extend.page_capture` (kind `extend.page_capture.offer`). */
export interface ExtendPageCaptureOffer {
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
  front: string;
  back: string;
  topic: string;
  difficulty: string;
  kinds: string[];
  existing_details: unknown;
}

/** Offered shape of provision `flashcards.expand_card` (kind `flashcards.expand_card.offer`). */
export interface FlashcardsExpandCardOffer {
  topic: string;
  front: string;
  back: string;
  struggle_signal?: string;
}

/** Offered shape of provision `flashcards.generate_cards` (kind `flashcards.generate_cards.offer`). */
export interface FlashcardsGenerateCardsOffer {
  topic: string;
  count: number;
  difficulty: string;
  grade_level?: string;
  user_request?: string;
}

/** Offered shape of provision `flashcards.generate_from_source` (kind `flashcards.generate_from_source.offer`). */
export interface FlashcardsGenerateFromSourceOffer {
  source_content: string;
  document_id?: string;
  count: number;
  difficulty: string;
}

/** Offered shape of provision `flashcards.grade_spoken` (kind `flashcards.grade_spoken.offer`). */
export interface FlashcardsGradeSpokenOffer {
  front: string;
  back: string;
  rubric?: string;
  seconds_allowed: number;
  answer_audio?: unknown;
}

/** Offered shape of provision `flashcards.grade_typed_answer` (kind `flashcards.grade_typed_answer.offer`). */
export interface FlashcardsGradeTypedAnswerOffer {
  question: string;
  expected_answer: string;
  learner_answer: string;
}

/** Offered shape of provision `flashcards.help_live` (kind `flashcards.help_live.offer`). */
export interface FlashcardsHelpLiveOffer {
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
  front: string;
  back: string;
  topic: string;
  distractor_count: number;
}

/** Offered shape of provision `flashcards.micro_coach` (kind `flashcards.micro_coach.offer`). */
export interface FlashcardsMicroCoachOffer {
  front: string;
  back: string;
  result: string;
  prior_attempts?: unknown;
}

/** Offered shape of provision `flashcards.review_batch` (kind `flashcards.review_batch.offer`). */
export interface FlashcardsReviewBatchOffer {
  transcript: string;
  attempts: unknown;
  aggregate: unknown;
  remaining_cards?: unknown;
}

/** Offered shape of provision `flashcards.tts_render` (kind `flashcards.tts_render.offer`). */
export interface FlashcardsTtsRenderOffer {
  content: string;
  sample_context: string;
  speaker_profile: string;
  directors_notes: string;
  scene: string;
}

/** Offered shape of provision `flashcards.verify_against_source` (kind `flashcards.verify_against_source.offer`). */
export interface FlashcardsVerifyAgainstSourceOffer {
  front: string;
  back: string;
  source_excerpt: string;
}

/** Offered shape of provision `growth_loop.stage_dispatch` (kind `growth_loop.stage_dispatch.offer`). */
export interface GrowthLoopStageDispatchOffer {
  stage: string;
  site_id: string;
  loop_run_id: string;
  stage_context: string;
}

/** Offered shape of provision `growth_loop.stage_quality` (kind `growth_loop.stage_quality.offer`). */
export interface GrowthLoopStageQualityOffer {
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
  review_bundle: string;
  subject_kind?: string;
  subject_label?: string;
  human_guidance?: string;
}

/** Offered shape of provision `hindsight.orchestra_crystallization` (kind `hindsight.orchestra_crystallization.offer`). */
export interface HindsightOrchestraCrystallizationOffer {
  trajectory_bundle: string;
  orchestra_label?: string;
  run_count?: number;
}

/** Offered shape of provision `hindsight.replay_comparison` (kind `hindsight.replay_comparison.offer`). */
export interface HindsightReplayComparisonOffer {
  task: string;
  original_answer: string;
  replay_answer: string;
  original_metrics?: unknown;
  replay_metrics?: unknown;
}

/** Offered shape of provision `human_decisions.absent_human_decision` (kind `human_decisions.absent_human_decision.offer`). */
export interface HumanDecisionsAbsentHumanDecisionOffer {
  workflow_name: string;
  waited_for: string;
  prompt: string;
  decision_context: unknown;
  answer_schema?: unknown;
  default_answer?: string;
}

/** Offered shape of provision `iteration.rebuild_chain` (kind `iteration.rebuild_chain.offer`). */
export interface IterationRebuildChainOffer {
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
  user_feedback: string;
  original_user_request?: string;
}

/** Offered shape of provision `kg.chunk_extraction` (kind `kg.chunk_extraction.offer`). */
export interface KgChunkExtractionOffer {
  chunk: string;
}

/** Offered shape of provision `kg.entity_cluster` (kind `kg.entity_cluster.offer`). */
export interface KgEntityClusterOffer {
  members: string;
}

/** Offered shape of provision `knowledge.document_verification` (kind `knowledge.document_verification.offer`). */
export interface KnowledgeDocumentVerificationOffer {
  verification_instructions: string;
  expected_claims?: unknown;
  page_context: unknown;
}

/** Offered shape of provision `knowledge.section_derivation` (kind `knowledge.section_derivation.offer`). */
export interface KnowledgeSectionDerivationOffer {
  section_title: string;
  section_text: string;
}

/** Offered shape of provision `knowledge.section_qa` (kind `knowledge.section_qa.offer`). */
export interface KnowledgeSectionQaOffer {
  content: string;
}

/** Offered shape of provision `marketing.image_prompt` (kind `marketing.image_prompt.offer`). */
export interface MarketingImagePromptOffer {
  intent_or_content: string;
  style: string;
}

/** Offered shape of provision `marketing.local_endowment` (kind `marketing.local_endowment.offer`). */
export interface MarketingLocalEndowmentOffer {
  company_name?: string;
  industry: string;
  location?: string;
  context_notes?: string;
}

/** Offered shape of provision `marketing.page_image` (kind `marketing.page_image.offer`). */
export interface MarketingPageImageOffer {
  image_description: string;
}

/** Offered shape of provision `marketing.page_image_all_in_one` (kind `marketing.page_image_all_in_one.offer`). */
export interface MarketingPageImageAllInOneOffer {
  intent_or_content: string;
  style: string;
  count: number;
}

/** Offered shape of provision `marketing.video_metadata` (kind `marketing.video_metadata.offer`). */
export interface MarketingVideoMetadataOffer {
  video_context: unknown;
  site_context: unknown;
}

/** Offered shape of provision `masterwork.approach_select` (kind `masterwork.approach_select.offer`). */
export interface MasterworkApproachSelectOffer {
  rulebook_name: string;
  sections: unknown;
  total_approved: number;
  total_live: number;
  moves_ledger: unknown;
  move_menu: string[];
}

/** Offered shape of provision `masterwork.audition_judgment` (kind `masterwork.audition_judgment.offer`). */
export interface MasterworkAuditionJudgmentOffer {
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
  rulebook_name: string;
  section_label: string;
  approved_rules: unknown;
}

/** Offered shape of provision `masterwork.checkup_scan` (kind `masterwork.checkup_scan.offer`). */
export interface MasterworkCheckupScanOffer {
  expert_corpus: string;
  current_rules: string;
  rulebook_context: string;
}

/** Offered shape of provision `masterwork.chunk_distill` (kind `masterwork.chunk_distill.offer`). */
export interface MasterworkChunkDistillOffer {
  chunk: string;
}

/** Offered shape of provision `masterwork.coherence_scan` (kind `masterwork.coherence_scan.offer`). */
export interface MasterworkCoherenceScanOffer {
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
  rulebook_id: string;
  attachments: unknown;
  rulebook_document: string;
}

/** Offered shape of provision `masterwork.corpus_clean` (kind `masterwork.corpus_clean.offer`). */
export interface MasterworkCorpusCleanOffer {
  transcribed_text: string;
}

/** Offered shape of provision `masterwork.corpus_synthesis` (kind `masterwork.corpus_synthesis.offer`). */
export interface MasterworkCorpusSynthesisOffer {
  corpus_digest: string;
}

/** Offered shape of provision `masterwork.rule_improve` (kind `masterwork.rule_improve.offer`). */
export interface MasterworkRuleImproveOffer {
  rule?: unknown;
  expert_input?: string;
  rulebook_context: string;
}

/** Offered shape of provision `masterwork.rulebook_audit` (kind `masterwork.rulebook_audit.offer`). */
export interface MasterworkRulebookAuditOffer {
  rulebook_source: string;
  rules: string;
  content: string;
  content_kind: string;
  ground_truth?: string;
}

/** Offered shape of provision `masterwork.scout_interview` (kind `masterwork.scout_interview.offer`). */
export interface MasterworkScoutInterviewOffer {
  rulebook_id: string;
  rulebook_document: string;
}

/** Offered shape of provision `masterwork.transcript_shortlist` (kind `masterwork.transcript_shortlist.offer`). */
export interface MasterworkTranscriptShortlistOffer {
  conversations: unknown;
  topic: string;
}

/** Offered shape of provision `masterwork.understudy_run` (kind `masterwork.understudy_run.offer`). */
export interface MasterworkUnderstudyRunOffer {
  rulebook_source: string;
  rules: string;
  unconfirmed_rules: string;
  job: string;
  material?: string;
}

/** Offered shape of provision `media.youtube_transcription` (kind `media.youtube_transcription.offer`). */
export interface MediaYoutubeTranscriptionOffer {
  youtube_url: string;
  timestamp_instruction?: string;
}

/** Offered shape of provision `ner.deep_chunk_extraction` (kind `ner.deep_chunk_extraction.offer`). */
export interface NerDeepChunkExtractionOffer {
  slots_to_extract: unknown;
  relevant_chunks_text: string;
  document_label: string;
}

/** Offered shape of provision `ner.document_orientation` (kind `ner.document_orientation.offer`). */
export interface NerDocumentOrientationOffer {
  document_label: string;
  document_size_hint: string;
  document_text_sample: string;
  top_entities: unknown;
  top_cooccurrences: unknown;
  user_scope_tree: unknown;
}

/** Offered shape of provision `ner.entity_canonicalization` (kind `ner.entity_canonicalization.offer`). */
export interface NerEntityCanonicalizationOffer {
  entity_pairs: unknown;
}

/** Offered shape of provision `ner.finisher_batch` (kind `ner.finisher_batch.offer`). */
export interface NerFinisherBatchOffer {
  entities: unknown;
}

/** Offered shape of provision `ner.item_proposal` (kind `ner.item_proposal.offer`). */
export interface NerItemProposalOffer {
  unmatched_findings: unknown;
  scope_type_context: unknown;
}

/** Offered shape of provision `ner.magic_moment_detection` (kind `ner.magic_moment_detection.offer`). */
export interface NerMagicMomentDetectionOffer {
  scope_slots: unknown;
  document_classification?: string;
  document_sample?: string;
  relevant_entities?: unknown;
}

/** Offered shape of provision `ner.scope_proposal` (kind `ner.scope_proposal.offer`). */
export interface NerScopeProposalOffer {
  entity_tree: unknown;
  document_classification?: string;
  existing_scope_types?: unknown;
}

/** Offered shape of provision `ner.scope_slot_filling` (kind `ner.scope_slot_filling.offer`). */
export interface NerScopeSlotFillingOffer {
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
  suggestions: unknown;
  scope_context: unknown;
  document_content?: string;
}

/** Offered shape of provision `ner.sweep_scope_discovery` (kind `ner.sweep_scope_discovery.offer`). */
export interface NerSweepScopeDiscoveryOffer {
  scope_type: string;
  existing_scope_names: string[];
  entities: unknown;
}

/** Offered shape of provision `ner.sweep_scope_references` (kind `ner.sweep_scope_references.offer`). */
export interface NerSweepScopeReferencesOffer {
  scope: unknown;
  entities: unknown;
}

/** Offered shape of provision `ner.sweep_value_mining` (kind `ner.sweep_value_mining.offer`). */
export interface NerSweepValueMiningOffer {
  context_item: unknown;
  scopes: unknown;
}

/** Offered shape of provision `observability.tool_trace_pattern_window` (kind `observability.tool_trace_pattern_window.offer`). */
export interface ObservabilityToolTracePatternWindowOffer {
  window_days: number;
  tool_name_filter?: string;
}

/** Offered shape of provision `observability.tool_trace_triage_window` (kind `observability.tool_trace_triage_window.offer`). */
export interface ObservabilityToolTraceTriageWindowOffer {
  since_iso: string;
  environment_label: string;
}

/** Offered shape of provision `orchestras.member_roster` (kind `orchestras.member_roster.offer`). */
export interface OrchestrasMemberRosterOffer {
  members: unknown;
}

/** Offered shape of provision `pdf.content_cleaning` (kind `pdf.content_cleaning.offer`). */
export interface PdfContentCleaningOffer {
  content: string;
}

/** Offered shape of provision `podcast.audience_adaptation` (kind `podcast.audience_adaptation.offer`). */
export interface PodcastAudienceAdaptationOffer {
  prepared_content: string;
  target_audience: string;
  adaptation_guidance?: string;
}

/** Offered shape of provision `podcast.audio_stage` (kind `podcast.audio_stage.offer`). */
export interface PodcastAudioStageOffer {
  content: string;
  audio_style?: string;
}

/** Offered shape of provision `podcast.chaptering` (kind `podcast.chaptering.offer`). */
export interface PodcastChapteringOffer {
  episode_script: string;
  duration_hint?: string;
  granularity_hint?: string;
}

/** Offered shape of provision `podcast.feature_image_prompt` (kind `podcast.feature_image_prompt.offer`). */
export interface PodcastFeatureImagePromptOffer {
  intent_or_content: string;
  style: string;
}

/** Offered shape of provision `podcast.image_render` (kind `podcast.image_render.offer`). */
export interface PodcastImageRenderOffer {
  image_description: string;
}

/** Offered shape of provision `podcast.live_session` (kind `podcast.live_session.offer`). */
export interface PodcastLiveSessionOffer {
  full_script: string;
  current_topic?: string;
  recent_user_speech?: string;
}

/** Offered shape of provision `podcast.metadata_stage` (kind `podcast.metadata_stage.offer`). */
export interface PodcastMetadataStageOffer {
  podcast_content: string;
}

/** Offered shape of provision `podcast.post_prep` (kind `podcast.post_prep.offer`). */
export interface PodcastPostPrepOffer {
  content: string;
  target_language?: string;
  target_length?: string;
  expansion_guidance?: string;
}

/** Offered shape of provision `podcast.prep_extraction` (kind `podcast.prep_extraction.offer`). */
export interface PodcastPrepExtractionOffer {
  extraction_unit: string;
}

/** Offered shape of provision `podcast.script_stage` (kind `podcast.script_stage.offer`). */
export interface PodcastScriptStageOffer {
  prepared_content: string;
  format?: string;
  theme?: string;
  language?: string;
  num_speakers?: string;
  speaker_names?: string;
  speaker_name?: string;
  speaker_personas?: string;
}

/** Offered shape of provision `podcast.title_optimization` (kind `podcast.title_optimization.offer`). */
export interface PodcastTitleOptimizationOffer {
  working_title: string;
  content_summary: string;
}

/** Offered shape of provision `podcast.video_render` (kind `podcast.video_render.offer`). */
export interface PodcastVideoRenderOffer {
  video_description: string;
}

/** Offered shape of provision `podcast_client.episode_content` (kind `podcast_client.episode_content.offer`). */
export interface PodcastClientEpisodeContentOffer {
  episode_transcript: string;
  episode_title: string;
  episode_description?: string;
  episode_guests?: string;
  episode_date?: string;
  episode_links?: string[];
  duration_hint?: string;
  style_guidance?: string;
}

/** Offered shape of provision `podcast_client.topic_idea_request` (kind `podcast_client.topic_idea_request.offer`). */
export interface PodcastClientTopicIdeaRequestOffer {
  concept: string;
  content_format: string;
  idea_count: string;
}

/** Offered shape of provision `podcast_client.web_source` (kind `podcast_client.web_source.offer`). */
export interface PodcastClientWebSourceOffer {
  scraped_content: string;
  focus_area?: string;
}

/** Offered shape of provision `podcast_client.youtube_source` (kind `podcast_client.youtube_source.offer`). */
export interface PodcastClientYoutubeSourceOffer {
  youtube_url: string;
  timestamp_instruction?: string;
}

/** Offered shape of provision `purpose.unit_config` (kind `purpose.unit_config.offer`). */
export interface PurposeUnitConfigOffer {
  unit_config: string;
}

/** Offered shape of provision `rag.chunk_context` (kind `rag.chunk_context.offer`). */
export interface RagChunkContextOffer {
  document: string;
  chunk: string;
}

/** Offered shape of provision `rag.page_cleaning` (kind `rag.page_cleaning.offer`). */
export interface RagPageCleaningOffer {
  raw_text: string;
}

/** Offered shape of provision `rag.retrieval_query` (kind `rag.retrieval_query.offer`). */
export interface RagRetrievalQueryOffer {
  query: string;
}

/** Offered shape of provision `research.capture_coverage` (kind `research.capture_coverage.offer`). */
export interface ResearchCaptureCoverageOffer {
  intent: string;
  keywords: string;
  capture_report: unknown;
}

/** Offered shape of provision `research.cross_cutting_discovery` (kind `research.cross_cutting_discovery.offer`). */
export interface ResearchCrossCuttingDiscoveryOffer {
  keywords: string;
  search_results: string;
}

/** Offered shape of provision `research.final_assembly` (kind `research.final_assembly.offer`). */
export interface ResearchFinalAssemblyOffer {
  topic: string;
  tag_consolidations: string;
  research_report: string;
}

/** Offered shape of provision `research.keyword_findings` (kind `research.keyword_findings.offer`). */
export interface ResearchKeywordFindingsOffer {
  topic: string;
  keyword: string;
  search_results: string;
  page_summaries: string;
}

/** Offered shape of provision `research.page_capture` (kind `research.page_capture.offer`). */
export interface ResearchPageCaptureOffer {
  topic: string;
  page_content: string;
  page_url: string;
  page_title: string;
}

/** Offered shape of provision `research.page_tagging` (kind `research.page_tagging.offer`). */
export interface ResearchPageTaggingOffer {
  topic: string;
  page_content: string;
  available_tags: unknown;
}

/** Offered shape of provision `research.report_synthesis` (kind `research.report_synthesis.offer`). */
export interface ResearchReportSynthesisOffer {
  topic: string;
  search_results: string;
  page_summaries: string;
  keyword_syntheses: string;
}

/** Offered shape of provision `research.report_update` (kind `research.report_update.offer`). */
export interface ResearchReportUpdateOffer {
  previous_report: string;
  new_information: string;
  removed_sources: string;
}

/** Offered shape of provision `research.scrape_condensation` (kind `research.scrape_condensation.offer`). */
export interface ResearchScrapeCondensationOffer {
  instructions: string;
  scraped_content: string;
  queries: string;
  search_results: string;
}

/** Offered shape of provision `research.source_triage` (kind `research.source_triage.offer`). */
export interface ResearchSourceTriageOffer {
  topic: string;
  sources: unknown;
}

/** Offered shape of provision `research.tagged_pages` (kind `research.tagged_pages.offer`). */
export interface ResearchTaggedPagesOffer {
  topic: string;
  tag_name: string;
  tagged_page_contents: string;
  tagged_page_summaries: string;
}

/** Offered shape of provision `research.topic_setup` (kind `research.topic_setup.offer`). */
export interface ResearchTopicSetupOffer {
  subject_name_or_description: string;
}

/** Offered shape of provision `research_client.context_bundle` (kind `research_client.context_bundle.offer`). */
export interface ResearchClientContextBundleOffer {
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
  report_markdown: string;
  voice_lens: string;
}

/** Offered shape of provision `scraper.page_analysis` (kind `scraper.page_analysis.offer`). */
export interface ScraperPageAnalysisOffer {
  page_content: string;
}

/** Offered shape of provision `seo.ai_visibility_analysis` (kind `seo.ai_visibility_analysis.offer`). */
export interface SeoAiVisibilityAnalysisOffer {
  query: string;
  provider: string;
  model?: string;
  answer_text: string;
  answer_citations: unknown;
  target_mentioned: boolean;
  target_cited: boolean;
  provider_metadata?: unknown;
  cited_sources: unknown;
  site_context: unknown;
}

/** Offered shape of provision `seo.authority_routing` (kind `seo.authority_routing.offer`). */
export interface SeoAuthorityRoutingOffer {
  site_id: string;
  router_version: string;
  candidates: unknown;
  scan_flags: unknown;
  guidance?: string;
}

/** Offered shape of provision `seo.backlink_context_assessor` (kind `seo.backlink_context_assessor.offer`). */
export interface SeoBacklinkContextAssessorOffer {
  brand_context: string;
  site_context: string;
  backlinks_json: string;
}

/** Offered shape of provision `seo.competitor_classification` (kind `seo.competitor_classification.offer`). */
export interface SeoCompetitorClassificationOffer {
  site_id: string;
  business_name?: string;
  business_domain?: string;
  business_root_url?: string;
  business_description?: string;
  candidate_id: string;
  candidate_name?: string;
  candidate_domain: string;
  candidate_provider_evidence?: unknown;
  landscape_brief: string;
  classification_version: string;
}

/** Offered shape of provision `seo.competitor_opportunity_autopsy` (kind `seo.competitor_opportunity_autopsy.offer`). */
export interface SeoCompetitorOpportunityAutopsyOffer {
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
  analyst_version: string;
  competitor_page: unknown;
  owned_page?: unknown;
  owned_page_analysis?: unknown;
  page_keyword_map?: unknown;
  owned_site: unknown;
}

/** Offered shape of provision `seo.coverage_analysis` (kind `seo.coverage_analysis.offer`). */
export interface SeoCoverageAnalysisOffer {
  brand_name: string;
  brand_terms: string;
  page_url: string;
  page_title?: string;
  page_text: string;
}

/** Offered shape of provision `seo.finding_fix` (kind `seo.finding_fix.offer`). */
export interface SeoFindingFixOffer {
  fix_context: {
  page: unknown;
  site: unknown;
  limits: unknown;
  finding: unknown;
  finding_id: string;
  fixer_version: string;
};
  fixer_version: string;
}

/** Offered shape of provision `seo.keyword_classification` (kind `seo.keyword_classification.offer`). */
export interface SeoKeywordClassificationOffer {
  keywords: unknown;
  language: string;
  classifier_version: string;
  business_guidelines: string;
  facet_vocabulary: string;
}

/** Offered shape of provision `seo.keyword_research` (kind `seo.keyword_research.offer`). */
export interface SeoKeywordResearchOffer {
  primary_keyword: string;
  language: string;
  industry_context?: string;
  list_size: number;
}

/** Offered shape of provision `seo.landscape_brief` (kind `seo.landscape_brief.offer`). */
export interface SeoLandscapeBriefOffer {
  site_id: string;
  business_name?: string;
  business_domain?: string;
  business_root_url?: string;
  business_description?: string;
  existing_guidance?: string;
}

/** Offered shape of provision `seo.page_analysis` (kind `seo.page_analysis.offer`). */
export interface SeoPageAnalysisOffer {
  site_context: unknown;
  page_location: unknown;
  declared_target_keyword?: string;
  page_url: string;
  page_title?: string;
  meta_description?: string;
  headings_outline?: string;
  gsc_queries?: unknown;
  analyzer_version: string;
  page_content: string;
}

/** Offered shape of provision `seo.page_keyword_mapping` (kind `seo.page_keyword_mapping.offer`). */
export interface SeoPageKeywordMappingOffer {
  topic_slug: string;
  cluster_keywords: unknown;
  existing_pages: unknown;
  site_constraints: unknown;
  mapper_version: string;
}

/** Offered shape of provision `seo.press_source_request` (kind `seo.press_source_request.offer`). */
export interface SeoPressSourceRequestOffer {
  request_id: string;
  source_request: unknown;
  expert_context: unknown;
  deadline_at?: string;
}

/** Offered shape of provision `seo.press_story_analysis` (kind `seo.press_story_analysis.offer`). */
export interface SeoPressStoryAnalysisOffer {
  site_id: string;
  site_domain?: string;
  brand?: unknown;
  business_facts: unknown;
  brand_assets: unknown;
  observed_coverage: unknown;
  site_pages: unknown;
  bundle_stats: unknown;
  quality_policy: unknown;
}

/** Offered shape of provision `seo.reputation_intelligence` (kind `seo.reputation_intelligence.offer`). */
export interface SeoReputationIntelligenceOffer {
  site_id: string;
  site_domain?: string;
  site_root_url?: string;
  site_name?: string;
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
  limitations: string[];
  quality_policy: unknown;
}

/** Offered shape of provision `seo.serp_intent_analysis` (kind `seo.serp_intent_analysis.offer`). */
export interface SeoSerpIntentAnalysisOffer {
  keyword_baseline: unknown;
  google_serp: unknown;
  brave_serp: unknown;
  google_snapshot_id: string;
  brave_snapshot_id: string;
  google_observed_at: string;
  brave_observed_at: string;
  location: string;
  device: string;
  analyzer_version: string;
}

/** Offered shape of provision `seo.site_intake` (kind `seo.site_intake.offer`). */
export interface SeoSiteIntakeOffer {
  intake_bundle: {
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
}

/** Offered shape of provision `seo.site_strategy_interview` (kind `seo.site_strategy_interview.offer`). */
export interface SeoSiteStrategyInterviewOffer {
  topic_branches: unknown;
  business_context: string;
  site_ref: string;
  valuer_version: string;
}

/** Offered shape of provision `seo.topic_assignment` (kind `seo.topic_assignment.offer`). */
export interface SeoTopicAssignmentOffer {
  keywords: unknown;
  existing_topic_branches: unknown;
  territory: string;
  business_guidelines: string;
  assigner_version: string;
}

/** Offered shape of provision `surfaces_client.binding_context` (kind `surfaces_client.binding_context.offer`). */
export interface SurfacesClientBindingContextOffer {
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
  complete_tool_object: unknown;
  output_schema: unknown;
  sample_stream: unknown;
  sample_database_entry: unknown;
}

/** Offered shape of provision `tools.content_summarization` (kind `tools.content_summarization.offer`). */
export interface ToolsContentSummarizationOffer {
  instructions: string;
  content: string;
}

/** Offered shape of provision `transcript_studio.session_context` (kind `transcript_studio.session_context.offer`). */
export interface TranscriptStudioSessionContextOffer {
  recording_transcripts?: string;
  all_raw?: string;
  session_cleaned?: string;
  audio_citations?: string;
  working_document?: string;
}

/** Offered shape of provision `vision_interview.answer_tracking` (kind `vision_interview.answer_tracking.offer`). */
export interface VisionInterviewAnswerTrackingOffer {
  open_questions: string;
  human_turn: string;
}

/** Offered shape of provision `vision_interview.finalize_deliverable` (kind `vision_interview.finalize_deliverable.offer`). */
export interface VisionInterviewFinalizeDeliverableOffer {
  title: string;
  transcript: string;
  document?: string;
  question_ledger?: string;
}

/** Offered shape of provision `vision_interview.room_activation` (kind `vision_interview.room_activation.offer`). */
export interface VisionInterviewRoomActivationOffer {
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
  transcript_delta: string;
  round_directive: string;
  current_document: string;
  open_questions: string;
}

/** Offered shape of provision `war_room.room_context` (kind `war_room.room_context.offer`). */
export interface WarRoomRoomContextOffer {
  war_room: unknown;
}

/** Offered shape of provision `war_room.thread_context` (kind `war_room.thread_context.offer`). */
export interface WarRoomThreadContextOffer {
  war_room: unknown;
  session_transcripts?: string;
  thread_message?: string;
  master_directive?: string;
}

/** Offered shape of provision `web.endpoint_family_judgment` (kind `web.endpoint_family_judgment.offer`). */
export interface WebEndpointFamilyJudgmentOffer {
  site_domain: string;
  candidates: unknown;
}

/** Offered shape of provision `workflow.extract_sweep` (kind `workflow.extract_sweep.offer`). */
export interface WorkflowExtractSweepOffer {
  candidates: unknown;
}

/** Offered shape of provision `workflow.node_steward` (kind `workflow.node_steward.offer`). */
export interface WorkflowNodeStewardOffer {
  workflow_id: string;
  node_id: string;
  node_label: string;
  spec_type: string;
  node_context: string;
}

/** Offered shape of provision `workflow.plan_node_type_recommender` (kind `workflow.plan_node_type_recommender.offer`). */
export interface WorkflowPlanNodeTypeRecommenderOffer {
  plan_json: string;
  catalog_json: string;
  graph_context: string;
}

/** Offered shape of provision `workflow.plan_notes_writer` (kind `workflow.plan_notes_writer.offer`). */
export interface WorkflowPlanNotesWriterOffer {
  plan_name: string;
  current_notes: string;
  rough_input: string;
  graph_context: string;
}

/** Offered shape of provision `workflow.plan_room` (kind `workflow.plan_room.offer`). */
export interface WorkflowPlanRoomOffer {
  plan_id: string;
  definition_id: string;
  plan_name: string;
  intent?: string;
  notes?: string;
  phase?: string;
  input_shape?: unknown;
  output_shape?: unknown;
}

/** Offered shape of provision `workflow.plan_shape_designer` (kind `workflow.plan_shape_designer.offer`). */
export interface WorkflowPlanShapeDesignerOffer {
  plan_name: string;
  plan_notes: string;
  direction?: string;
  description: string;
  graph_context: string;
}

/** Offered shape of provision `workflow.run_failure` (kind `workflow.run_failure.offer`). */
export interface WorkflowRunFailureOffer {
  run_id: string;
  workflow_id: string;
  workflow_name: string;
  run_status: string;
  node_id: string;
  spec_type: string;
  node_label: string;
  step: number;
  attempt: number;
  error_type: string;
  error_message: string;
  node_inputs: unknown;
  node_config: unknown;
  upstream_outputs: unknown;
  connections: unknown;
  workflow_steps: unknown;
  failure_report: string;
}

/** Offered shape of provision `workflow.run_recovery` (kind `workflow.run_recovery.offer`). */
export interface WorkflowRunRecoveryOffer {
  surface: string;
  envelope_xml: string;
}

/** provision_key → its whole offered shape. */
export interface ProvisionOffers {
  "agent_apps.auto_create_request": AgentAppsAutoCreateRequestOffer;
  "agent_apps.metadata_request": AgentAppsMetadataRequestOffer;
  "agent_factory.build_request": AgentFactoryBuildRequestOffer;
  "code_editor.session": CodeEditorSessionOffer;
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
  "crm.journalist_beat_analysis": CrmJournalistBeatAnalysisOffer;
  "crm.media_list_ranker": CrmMediaListRankerOffer;
  "crm.outreach_personalization_writer": CrmOutreachPersonalizationWriterOffer;
  "crm.outreach_recipient_shortlister": CrmOutreachRecipientShortlisterOffer;
  "crm.outreach_reply_drafter": CrmOutreachReplyDrafterOffer;
  "crm.party_kind_judgment": CrmPartyKindJudgmentOffer;
  "crm.save_contact_selection": CrmSaveContactSelectionOffer;
  "dictionary.workspace": DictionaryWorkspaceOffer;
  "education.analytics_narrate": EducationAnalyticsNarrateOffer;
  "education.card_image": EducationCardImageOffer;
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
  "seo.competitor_classification": SeoCompetitorClassificationOffer;
  "seo.competitor_opportunity_autopsy": SeoCompetitorOpportunityAutopsyOffer;
  "seo.competitor_page_autopsy": SeoCompetitorPageAutopsyOffer;
  "seo.coverage_analysis": SeoCoverageAnalysisOffer;
  "seo.finding_fix": SeoFindingFixOffer;
  "seo.keyword_classification": SeoKeywordClassificationOffer;
  "seo.keyword_research": SeoKeywordResearchOffer;
  "seo.landscape_brief": SeoLandscapeBriefOffer;
  "seo.page_analysis": SeoPageAnalysisOffer;
  "seo.page_keyword_mapping": SeoPageKeywordMappingOffer;
  "seo.press_source_request": SeoPressSourceRequestOffer;
  "seo.press_story_analysis": SeoPressStoryAnalysisOffer;
  "seo.reputation_intelligence": SeoReputationIntelligenceOffer;
  "seo.serp_intent_analysis": SeoSerpIntentAnalysisOffer;
  "seo.site_intake": SeoSiteIntakeOffer;
  "seo.site_strategy_interview": SeoSiteStrategyInterviewOffer;
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
  "workflow.plan_node_type_recommender": WorkflowPlanNodeTypeRecommenderOffer;
  "workflow.plan_notes_writer": WorkflowPlanNotesWriterOffer;
  "workflow.plan_room": WorkflowPlanRoomOffer;
  "workflow.plan_shape_designer": WorkflowPlanShapeDesignerOffer;
  "workflow.run_failure": WorkflowRunFailureOffer;
  "workflow.run_recovery": WorkflowRunRecoveryOffer;
}

export type ProvisionKey = keyof ProvisionOffers;

/** provision_key → its registered derived input kind slug. */
export const PROVISION_OFFER_KINDS = {
  "agent_apps.auto_create_request": "agent_apps.auto_create_request.offer",
  "agent_apps.metadata_request": "agent_apps.metadata_request.offer",
  "agent_factory.build_request": "agent_factory.build_request.offer",
  "code_editor.session": "code_editor.session.offer",
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
  "crm.journalist_beat_analysis": "crm.journalist_beat_analysis.offer",
  "crm.media_list_ranker": "crm.media_list_ranker.offer",
  "crm.outreach_personalization_writer": "crm.outreach_personalization_writer.offer",
  "crm.outreach_recipient_shortlister": "crm.outreach_recipient_shortlister.offer",
  "crm.outreach_reply_drafter": "crm.outreach_reply_drafter.offer",
  "crm.party_kind_judgment": "crm.party_kind_judgment.offer",
  "crm.save_contact_selection": "crm.save_contact_selection.offer",
  "dictionary.workspace": "dictionary.workspace.offer",
  "education.analytics_narrate": "education.analytics_narrate.offer",
  "education.card_image": "education.card_image.offer",
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
  "seo.competitor_classification": "seo.competitor_classification.offer",
  "seo.competitor_opportunity_autopsy": "seo.competitor_opportunity_autopsy.offer",
  "seo.competitor_page_autopsy": "seo.competitor_page_autopsy.offer",
  "seo.coverage_analysis": "seo.coverage_analysis.offer",
  "seo.finding_fix": "seo.finding_fix.offer",
  "seo.keyword_classification": "seo.keyword_classification.offer",
  "seo.keyword_research": "seo.keyword_research.offer",
  "seo.landscape_brief": "seo.landscape_brief.offer",
  "seo.page_analysis": "seo.page_analysis.offer",
  "seo.page_keyword_mapping": "seo.page_keyword_mapping.offer",
  "seo.press_source_request": "seo.press_source_request.offer",
  "seo.press_story_analysis": "seo.press_story_analysis.offer",
  "seo.reputation_intelligence": "seo.reputation_intelligence.offer",
  "seo.serp_intent_analysis": "seo.serp_intent_analysis.offer",
  "seo.site_intake": "seo.site_intake.offer",
  "seo.site_strategy_interview": "seo.site_strategy_interview.offer",
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
  "workflow.plan_node_type_recommender": "workflow.plan_node_type_recommender.offer",
  "workflow.plan_notes_writer": "workflow.plan_notes_writer.offer",
  "workflow.plan_room": "workflow.plan_room.offer",
  "workflow.plan_shape_designer": "workflow.plan_shape_designer.offer",
  "workflow.run_failure": "workflow.run_failure.offer",
  "workflow.run_recovery": "workflow.run_recovery.offer",
} as const;
