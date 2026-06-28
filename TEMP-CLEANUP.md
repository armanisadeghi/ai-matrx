armanisadeghi@Armanis-Mac-Studio matrx-frontend % pnpm sync-types:local

> app-matrx@0.3.612 sync-types:local /Users/armanisadeghi/code/matrx-frontend
> node scripts/sync-types.mjs --local


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sync-types
  Backend: http://localhost:8000
  Mode:    local (all 3 steps)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Step 1: Updating Supabase database types (pnpm db-types)...


> app-matrx@0.3.612 db-types /Users/armanisadeghi/code/matrx-frontend
> npx supabase gen types typescript --project-id txzxabzwovsujtloxrus --schema public --schema iam --schema platform --schema admin --schema context --schema files --schema workflow --schema workspace --schema workbench --schema extend --schema app --schema skill --schema tool --schema agent --schema chat --schema ai --schema research --schema scraper --schema podcast --schema graveyard --schema docproc --schema pdf --schema users --schema communication --schema rag --schema education --schema transcripts --schema canvas --schema legal --schema scheduler --schema ui --schema code > types/database.types.ts && perl -i -0pe 's/\s*<claude-code-hint[^>]*\/?>\s*$/\n/' types/database.types.ts && bash scripts/fix-encoding.sh && bash scripts/patch-db-types.sh

A new version of Supabase CLI is available: v2.108.0 (currently installed v2.98.2)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
Encoding is already correct.
✅ Patched Json type in types/database.types.ts
Skipping types/matrixDb.types.ts — not found

  ✓ Supabase types updated.

  Step 2: Fetching API types from Python backend...


── sync-types ──────────────────────────────────────────
  Backend : http://localhost:8000
  Output  : /Users/armanisadeghi/code/matrx-frontend/types/python-generated

  Available bundles: openapi, stream-events-ts, stream-events-schema, llm-params, llm-params-enums-ts, llm-enums-ts
  ✓ openapi.json (659 routes, 851 schemas)
  ✓ stream-events.ts
  ✓ stream-events.schema.json
  ✓ llm-params.schema.json
  ✓ llm-params-enums.generated.ts
  ✓ llm-enums.ts

  Running openapi-typescript...
  ✓ api-types.ts

── sync-types complete ─────────────────────────────────


  Step 3: Running TypeScript type-check...

app/(dev)/demos/tests/applet-tests/AppletTestsLayoutClient.tsx:4:36 - error TS2307: Cannot find module '@/components/admin/redux/EnhancedEntityAnalyzer' or its corresponding type declarations.

4 import EnhancedEntityAnalyzer from "@/components/admin/redux/EnhancedEntityAnalyzer";
                                     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app/(dev)/demos/tests/matrx-table/components/StandardTabUtil.ts:3:27 - error TS2307: Cannot find module '@/types/entityTableTypes' or its corresponding type declarations.

3 import { TableData } from "@/types/entityTableTypes";
                            ~~~~~~~~~~~~~~~~~~~~~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/BrokerForm.tsx:68:45 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

68                                             idArgs: field.broker,
                                               ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/BrokerForm.tsx:85:49 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: number; }'.

85                                                 idArgs: field.broker,
                                                   ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/BrokerForm.tsx:92:49 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

92                                                 idArgs: field.broker,
                                                   ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/BrokerSlackClient.tsx:48:5 - error TS2353: Object literal may only specify known properties, and 'syncInterval' does not exist in type '{ brokers: BrokerIdentifier[]; syncOnChange?: boolean; }'.

48     syncInterval: 0 // Only sync on changes
       ~~~~~~~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/BrokerSlackClient.tsx:93:9 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

93         idArgs: SLACK_BROKER_IDS.channels,
           ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/BrokerSlackClient.tsx:109:7 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

109       idArgs: SLACK_BROKER_IDS.selectedChannel,
          ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/BrokerSlackClient.tsx:117:7 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

117       idArgs: SLACK_BROKER_IDS.token,
          ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/ChannelSelector.tsx:36:7 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

36       idArgs: SLACK_BROKER_IDS.selectedChannel,
         ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/ChannelSelector.tsx:73:9 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

73         idArgs: SLACK_BROKER_IDS.channels,
           ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/ChannelSelector.tsx:80:11 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

80           idArgs: SLACK_BROKER_IDS.selectedChannel,
             ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/SlackAuthentication.tsx:54:11 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

54           idArgs: SLACK_BROKER_IDS.token,
             ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/SlackAuthentication.tsx:67:9 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

67         idArgs: SLACK_BROKER_IDS.token,
           ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/SlackAuthentication.tsx:87:9 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

87         idArgs: SLACK_BROKER_IDS.token,
           ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/SlackAuthentication.tsx:100:7 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

100       idArgs: SLACK_BROKER_IDS.token,
          ~~~~~~

app/(dev)/demos/tests/slack/with-brokers/components/TokenManager.tsx:34:7 - error TS2353: Object literal may only specify known properties, and 'idArgs' does not exist in type '{ brokerId: string; value: string; }'.

34       idArgs: SLACK_BROKER_IDS.token,
         ~~~~~~

app/(dev)/demos/tests/windows/page.dev.tsx:6:37 - error TS2307: Cannot find module '@/features/registered-function/components/RegisteredFunctionList' or its corresponding type declarations.

6 import RegisteredFunctionsList from "@/features/registered-function/components/RegisteredFunctionList";
                                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app/(dev)/demos/tests/windows/page.dev.tsx:7:27 - error TS2307: Cannot find module '@/components/playground/AiCockpitPage' or its corresponding type declarations.

7 import AiCockpitPage from '@/components/playground/AiCockpitPage';
                            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app/(dev)/demos/tests/windows/page.dev.tsx:10:32 - error TS2307: Cannot find module '@/features/registered-function/components/FunctionManagement' or its corresponding type declarations.

10 import FunctionManagement from "@/features/registered-function/components/FunctionManagement";
                                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app/(dev)/demos/tests/workflow-source-config/page.dev.tsx:3:33 - error TS2307: Cannot find module '@/features/workflows-xyflow/concepts/source-config/SourceConfigBuilder' or its corresponding type declarations.

3 import SourceConfigBuilder from "@/features/workflows-xyflow/concepts/source-config/SourceConfigBuilder";
                                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app/(transitional)/applets/page.tsx:6:32 - error TS2307: Cannot find module '@/types/applets/types' or its corresponding type declarations.

6 import { AppletCategory } from "@/types/applets/types";
                                 ~~~~~~~~~~~~~~~~~~~~~~~

app/(transitional)/apps/custom/[slug]/CustomAppSlugLayoutClient.tsx:118:9 - error TS2322: Type 'unknown' is not assignable to type 'boolean'.

118         isCreator={userIsCreator}
            ~~~~~~~~~

  components/layout/new-layout/PageSpecificHeader.tsx:145:3
    145   isCreator?: boolean;
          ~~~~~~~~~
    The expected type comes from property 'isCreator' which is declared here on type 'IntrinsicAttributes & AppletHeaderProps'

app/(transitional)/apps/custom/[slug]/CustomAppSlugLayoutClient.tsx:119:9 - error TS2322: Type 'unknown' is not assignable to type 'boolean'.

119         isAdmin={isAdmin}
            ~~~~~~~

  components/layout/new-layout/PageSpecificHeader.tsx:146:3
    146   isAdmin?: boolean;
          ~~~~~~~
    The expected type comes from property 'isAdmin' which is declared here on type 'IntrinsicAttributes & AppletHeaderProps'

app/(transitional)/apps/page.tsx:147:24 - error TS2304: Cannot find name 'Link'.

147                       <Link
                           ~~~~

app/(transitional)/apps/page.tsx:160:25 - error TS2304: Cannot find name 'Link'.

160                       </Link>
                            ~~~~

app/(transitional)/flash-cards/components/FlashcardComponent.tsx:46:40 - error TS2345: Argument of type 'FlashcardState[]' is not assignable to parameter of type 'DataWithOptionalId | DataWithOptionalId[]'.
  Type 'FlashcardState[]' is not assignable to type 'DataWithOptionalId[]'.
    Type 'FlashcardState' is not assignable to type 'DataWithOptionalId'.
      Index signature for type 'string' is missing in type 'FlashcardState'.

46   const flashcardsWithUUIDs = ensureId(allFlashcards);
                                          ~~~~~~~~~~~~~

app/(transitional)/flash-cards/components/FlashcardComponent.tsx:80:11 - error TS2322: Type 'DataWithId | DataWithId[]' is not assignable to type 'TableData[]'.
  Type 'DataWithId' is missing the following properties from type 'TableData[]': length, pop, push, concat, and 35 more.

80           data={flashcardsWithUUIDs}
             ~~~~

  types/tableTypes.ts:25:5
    25     data: TableData[];
           ~~~~
    The expected type comes from property 'data' which is declared here on type 'IntrinsicAttributes & MatrxTableProps'

app/(transitional)/flash-cards/components/FlashcardComponentMobile.tsx:54:42 - error TS2345: Argument of type 'FlashcardState[]' is not assignable to parameter of type 'DataWithOptionalId | DataWithOptionalId[]'.
  Type 'FlashcardState[]' is not assignable to type 'DataWithOptionalId[]'.
    Type 'FlashcardState' is not assignable to type 'DataWithOptionalId'.
      Index signature for type 'string' is missing in type 'FlashcardState'.

54     const flashcardsWithUUIDs = ensureId(allFlashcards);
                                            ~~~~~~~~~~~~~

app/(transitional)/flash-cards/components/FlashcardComponentMobile.tsx:80:21 - error TS2322: Type 'DataWithId | DataWithId[]' is not assignable to type 'TableData[]'.
  Type 'DataWithId' is missing the following properties from type 'TableData[]': length, pop, push, concat, and 35 more.

80                     data={flashcardsWithUUIDs}
                       ~~~~

  types/tableTypes.ts:25:5
    25     data: TableData[];
           ~~~~
    The expected type comes from property 'data' which is declared here on type 'IntrinsicAttributes & MatrxTableProps'

app/(transitional)/registered-results/events-viewer/page.tsx:7:26 - error TS2307: Cannot find module '@/features/workflows/results/registered-components/EventsViewer' or its corresponding type declarations.

7 import EventsViewer from '@/features/workflows/results/registered-components/EventsViewer';
                           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app/(transitional)/registered-results/sitemap-viewer/page.tsx:7:27 - error TS2307: Cannot find module '@/features/workflows/results/registered-components/SitemapViewer' or its corresponding type declarations.

7 import SitemapViewer from '@/features/workflows/results/registered-components/SitemapViewer';
                            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app/api/admin/feedback/categories/route.ts:36:47 - error TS2589: Type instantiation is excessively deep and possibly infinite.

36     const { data: categories, error } = await supabase
                                                 ~~~~~~~~
37       .schema("platform")
   ~~~~~~~~~~~~~~~~~~~~~~~~~
38       .from("categories")
   ~~~~~~~~~~~~~~~~~~~~~~~~~
39       .select("id, name, slug, description:metadata->>description, color, sort_order:position, is_active:metadata->>is_active, created_at, updated_at")
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:99:21 - error TS2339: Property 'label' does not exist on type 'GenericStringError'.

99         : `${source.label} (Copy)`;
                       ~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:105:18 - error TS2339: Property 'placement_type' does not exist on type 'GenericStringError'.

105         : source.placement_type;
                     ~~~~~~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:110:38 - error TS2339: Property 'placement_type' does not exist on type 'GenericStringError'.

110     if (nextPlacementType === source.placement_type) {
                                         ~~~~~~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:111:37 - error TS2339: Property 'parent_category_id' does not exist on type 'GenericStringError'.

111       nextParentCategoryId = source.parent_category_id;
                                        ~~~~~~~~~~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:122:18 - error TS2339: Property 'sort_order' does not exist on type 'GenericStringError'.

122         : source.sort_order;
                     ~~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:126:14 - error TS2339: Property 'is_active' does not exist on type 'GenericStringError'.

126       source.is_active === undefined
                 ~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:128:25 - error TS2339: Property 'is_active' does not exist on type 'GenericStringError'.

128         : typeof source.is_active === "string"
                            ~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:129:20 - error TS2339: Property 'is_active' does not exist on type 'GenericStringError'.

129           ? source.is_active === "true"
                       ~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:130:28 - error TS2339: Property 'is_active' does not exist on type 'GenericStringError'.

130           : Boolean(source.is_active);
                               ~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:137:20 - error TS2339: Property 'icon_name' does not exist on type 'GenericStringError'.

137       icon: source.icon_name ?? null,
                       ~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:138:21 - error TS2339: Property 'color' does not exist on type 'GenericStringError'.

138       color: source.color ?? null,
                        ~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:143:31 - error TS2339: Property 'organization_id' does not exist on type 'GenericStringError'.

143       organization_id: source.organization_id ?? null,
                                  ~~~~~~~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:146:20 - error TS2339: Property 'metadata' does not exist on type 'GenericStringError'.

146         ...(source.metadata as Record<string, unknown> | null ?? {}),
                       ~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:147:29 - error TS2339: Property 'description' does not exist on type 'GenericStringError'.

147         description: source.description ?? null,
                                ~~~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:149:34 - error TS2339: Property 'enabled_features' does not exist on type 'GenericStringError'.

149         enabled_features: source.enabled_features ?? null,
                                     ~~~~~~~~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:152:25 - error TS2339: Property 'user_id' does not exist on type 'GenericStringError'.

152         user_id: source.user_id ?? null,
                            ~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:153:28 - error TS2339: Property 'project_id' does not exist on type 'GenericStringError'.

153         project_id: source.project_id ?? null,
                               ~~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:154:25 - error TS2339: Property 'task_id' does not exist on type 'GenericStringError'.

154         task_id: source.task_id ?? null,
                            ~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:200:23 - error TS2698: Spread types may only be created from object types.

200     const coerced = { ...data, is_active: data.is_active === "true" || data.is_active === true };
                          ~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:200:48 - error TS2339: Property 'is_active' does not exist on type 'GenericStringError'.

200     const coerced = { ...data, is_active: data.is_active === "true" || data.is_active === true };
                                                   ~~~~~~~~~

app/api/agent-shortcut-categories/[id]/duplicate/route.ts:200:77 - error TS2339: Property 'is_active' does not exist on type 'GenericStringError'.

200     const coerced = { ...data, is_active: data.is_active === "true" || data.is_active === true };
                                                                                ~~~~~~~~~

app/api/agent-shortcut-categories/[id]/route.ts:81:56 - error TS2559: Type 'GenericStringError' has no properties in common with type '{ is_active?: unknown; }'.

81     return NextResponse.json({ data: coerceCategoryRow(data) });
                                                          ~~~~

app/api/agent-shortcut-categories/[id]/route.ts:194:56 - error TS2559: Type 'GenericStringError' has no properties in common with type '{ is_active?: unknown; }'.

194     return NextResponse.json({ data: coerceCategoryRow(data) });
                                                           ~~~~

app/api/agent-shortcut-categories/route.ts:122:55 - error TS2345: Argument of type '<T extends { is_active?: unknown; }>(row: T) => T' is not assignable to parameter of type '(value: GenericStringError, index: number, array: GenericStringError[]) => { is_active?: unknown; }'.
  Types of parameters 'row' and 'value' are incompatible.
    Type 'GenericStringError' has no properties in common with type '{ is_active?: unknown; }'.

122     return NextResponse.json({ data: (data ?? []).map(coerceCategoryRow) });
                                                          ~~~~~~~~~~~~~~~~~

app/api/agent-shortcut-categories/route.ts:214:56 - error TS2559: Type 'GenericStringError' has no properties in common with type '{ is_active?: unknown; }'.

214     return NextResponse.json({ data: coerceCategoryRow(data) }, { status: 201 });
                                                           ~~~~

app/api/organizations/invitations/resend/route.ts:120:13 - error TS2698: Spread types may only be created from object types.

120             ...(invitation.metadata ?? {}),
                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app/api/organizations/invite/route.ts:143:13 - error TS2698: Spread types may only be created from object types.

143             ...(invitation.metadata ?? {}),
                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app/api/schema/route.ts:7:40 - error TS2307: Cannot find module '@/utils/schema/schema-processing/processSchema' or its corresponding type declarations.

7 import { initializeSchemaSystem } from '@/utils/schema/schema-processing/processSchema';
                                         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/admin/ClientDebugWrapper.tsx:12:53 - error TS2307: Cannot find module './EnhancedDebugInterface' or its corresponding type declarations.

12 const EnhancedDebugInterface = dynamic(() => import('./EnhancedDebugInterface'), {
                                                       ~~~~~~~~~~~~~~~~~~~~~~~~~~

components/admin/GeneratePromptForSystemModal.tsx:81:20 - error TS2304: Cannot find name 'useAppDispatch'.

81   const dispatch = useAppDispatch();
                      ~~~~~~~~~~~~~~

components/admin/GeneratePromptForSystemModal.tsx:96:25 - error TS2304: Cannot find name 'useAppSelector'.

96   const streamingText = useAppSelector((state) =>
                           ~~~~~~~~~~~~~~

components/admin/GeneratePromptForSystemModal.tsx:102:27 - error TS2304: Cannot find name 'useAppSelector'.

102   const isResponseEnded = useAppSelector((state) =>
                              ~~~~~~~~~~~~~~

components/admin/GeneratePromptForSystemModal.tsx:269:9 - error TS2304: Cannot find name 'createAndSubmitTask'.

269         createAndSubmitTask({
            ~~~~~~~~~~~~~~~~~~~

components/admin/state-analyzer/stateViewerTabs.tsx:634:32 - error TS2339: Property 'messageActions' does not exist on type '{ layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }'.

634           state={completeState.messageActions}
                                   ~~~~~~~~~~~~~~

components/admin/state-analyzer/stateViewerTabs.tsx:644:32 - error TS2339: Property 'socketResponse' does not exist on type '{ layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }'.

644           state={completeState.socketResponse}
                                   ~~~~~~~~~~~~~~

components/admin/state-analyzer/stateViewerTabs.tsx:654:32 - error TS2339: Property 'socketTasks' does not exist on type '{ layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }'.

654           state={completeState.socketTasks}
                                   ~~~~~~~~~~~

components/admin/state-analyzer/stateViewerTabs.tsx:722:68 - error TS2339: Property 'broker' does not exist on type '{ layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }'.

722         <GenericSliceViewer sliceKey="broker" state={completeState.broker} />
                                                                       ~~~~~~

components/admin/state-analyzer/stateViewerTabs.tsx:751:32 - error TS2339: Property 'promptExecution' does not exist on type '{ layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }'.

751           state={completeState.promptExecution}
                                   ~~~~~~~~~~~~~~~

components/admin/state-analyzer/stateViewerTabs.tsx:761:32 - error TS2339: Property 'actionCache' does not exist on type '{ layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }'.

761           state={completeState.actionCache}
                                   ~~~~~~~~~~~

components/admin/state-analyzer/stateViewerTabs.tsx:771:32 - error TS2339: Property 'dbFunctionNode' does not exist on type '{ layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }'.

771           state={completeState.dbFunctionNode}
                                   ~~~~~~~~~~~~~~

components/admin/state-analyzer/stateViewerTabs.tsx:781:32 - error TS2339: Property 'workflows' does not exist on type '{ layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }'.

781           state={completeState.workflows}
                                   ~~~~~~~~~

components/admin/state-analyzer/stateViewerTabs.tsx:791:32 - error TS2339: Property 'workflowNodes' does not exist on type '{ layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }'.

791           state={completeState.workflowNodes}
                                   ~~~~~~~~~~~~~

components/applet/AppletGrid.tsx:7:30 - error TS2307: Cannot find module '@/types/applets/types' or its corresponding type declarations.

7 import {AppletCategory} from "@/types/applets/types";
                               ~~~~~~~~~~~~~~~~~~~~~~~

components/applet/applets/layouts/ConversationalLayout.tsx:7:30 - error TS2307: Cannot find module '@/types/applets/types' or its corresponding type declarations.

7 import { AppletConfig } from '@/types/applets/types';
                               ~~~~~~~~~~~~~~~~~~~~~~~

components/applet/applets/layouts/DashboardLayout.tsx:2:28 - error TS2307: Cannot find module '@/types/applets/types' or its corresponding type declarations.

2 import {AppletConfig} from "@/types/applets/types";
                             ~~~~~~~~~~~~~~~~~~~~~~~

components/applet/applets/layouts/GridLayout.tsx:1:30 - error TS2307: Cannot find module '@/types/applets/types' or its corresponding type declarations.

1 import { AppletConfig } from "@/types/applets/types";
                               ~~~~~~~~~~~~~~~~~~~~~~~

components/applet/applets/layouts/ListLayout.tsx:1:30 - error TS2307: Cannot find module '@/types/applets/types' or its corresponding type declarations.

1 import { AppletConfig } from "@/types/applets/types";
                               ~~~~~~~~~~~~~~~~~~~~~~~

components/applet/applets/layouts/ToolsLayout.tsx:5:48 - error TS2307: Cannot find module '@/types/applets/types' or its corresponding type declarations.

5 import { AppletConfig, ToolEntityConfig } from "@/types/applets/types";
                                                 ~~~~~~~~~~~~~~~~~~~~~~~

components/applet/applets/layouts/ToolsLayout.tsx:43:39 - error TS2339: Property 'map' does not exist on type 'unknown'.

43                             {entities.map(entityConfig => (
                                         ~~~

components/applet/CategorySection.tsx:5:30 - error TS2307: Cannot find module '@/types/applets/types' or its corresponding type declarations.

5 import {AppletCategory} from "@/types/applets/types";
                               ~~~~~~~~~~~~~~~~~~~~~~~

components/debug/schema-metrics.tsx:11:30 - error TS2307: Cannot find module '@/utils/schema/schema-processing/processSchema' or its corresponding type declarations.

11 import {getGlobalCache} from "@/utils/schema/schema-processing/processSchema";
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/flashcard-app/components/FlashcardComponentDesktop.tsx:51:40 - error TS2345: Argument of type 'FlashcardState[]' is not assignable to parameter of type 'DataWithOptionalId | DataWithOptionalId[]'.
  Type 'FlashcardState[]' is not assignable to type 'DataWithOptionalId[]'.
    Type 'FlashcardState' is not assignable to type 'DataWithOptionalId'.
      Index signature for type 'string' is missing in type 'FlashcardState'.

51   const flashcardsWithUUIDs = ensureId(allFlashcards);
                                          ~~~~~~~~~~~~~

components/flashcard-app/components/FlashcardComponentDesktop.tsx:81:11 - error TS2322: Type 'DataWithId | DataWithId[]' is not assignable to type 'TableData[]'.
  Type 'DataWithId' is missing the following properties from type 'TableData[]': length, pop, push, concat, and 35 more.

81           data={flashcardsWithUUIDs}
             ~~~~

  types/tableTypes.ts:25:5
    25     data: TableData[];
           ~~~~
    The expected type comes from property 'data' which is declared here on type 'IntrinsicAttributes & MatrxTableProps'

components/flashcard-app/components/FlashcardComponentMobile.tsx:53:40 - error TS2345: Argument of type 'FlashcardState[]' is not assignable to parameter of type 'DataWithOptionalId | DataWithOptionalId[]'.
  Type 'FlashcardState[]' is not assignable to type 'DataWithOptionalId[]'.
    Type 'FlashcardState' is not assignable to type 'DataWithOptionalId'.
      Index signature for type 'string' is missing in type 'FlashcardState'.

53   const flashcardsWithUUIDs = ensureId(allFlashcards);
                                          ~~~~~~~~~~~~~

components/flashcard-app/components/FlashcardComponentMobile.tsx:82:11 - error TS2322: Type 'DataWithId | DataWithId[]' is not assignable to type 'TableData[]'.
  Type 'DataWithId' is missing the following properties from type 'TableData[]': length, pop, push, concat, and 35 more.

82           data={flashcardsWithUUIDs}
             ~~~~

  types/tableTypes.ts:25:5
    25     data: TableData[];
           ~~~~
    The expected type comes from property 'data' which is declared here on type 'IntrinsicAttributes & MatrxTableProps'

components/mardown-display/chat-markdown/tui/tui-utils.ts:2:51 - error TS2307: Cannot find module '@/features/rich-text-editor/utils/patternUtils' or its corresponding type declarations.

2 import { parseMatrxMetadata, MATRX_PATTERN } from '@/features/rich-text-editor/utils/patternUtils'; // adjust import path
                                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/mardown-display/enhanced-rederer-older/EnhancedMarkdownRenderer.tsx:15:34 - error TS2307: Cannot find module '../../playground/results/EnhancedMarkdownCard' or its corresponding type declarations.

15 import EnhancedMarkdownCard from "../../playground/results/EnhancedMarkdownCard";
                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/mardown-display/enhanced-rederer-older/EnhancedMarkdownRenderer.tsx:26:38 - error TS2307: Cannot find module '../../playground/results/MultiSectionMarkdownCard' or its corresponding type declarations.

26 import MultiSectionMarkdownCard from "../../playground/results/MultiSectionMarkdownCard";
                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/mardown-display/enhanced-rederer-older/EnhancedMarkdownRenderer.tsx:27:25 - error TS2307: Cannot find module '../../playground/results/JsonDisplay' or its corresponding type declarations.

27 import JsonDisplay from "../../playground/results/JsonDisplay";
                           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/components/MatrxBaseInput.tsx:6:37 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

6 import { MatrxBaseInputProps } from "@/types/componentConfigTypes";
                                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/components/MatrxButton.tsx:7:32 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

7 import {MatrxButtonProps} from "@/types/componentConfigTypes";
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/components/MatrxButtonGroup.tsx:5:37 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

5 import {MatrxButtonGroupProps} from "@/types/componentConfigTypes";
                                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/components/MatrxCheckbox.tsx:8:39 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

8 import { AnimatedCheckboxProps } from "@/types/componentConfigTypes";
                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/components/MatrxInput.tsx:8:31 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

8 import {MatrxInputProps} from "@/types/componentConfigTypes";
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/components/MatrxInputGroup.tsx:7:36 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

7 import {MatrxInputGroupProps} from "@/types/componentConfigTypes";
                                     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/components/MatrxJsonViewer.tsx:19:82 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

19 import {MatrxFullJsonViewerProps, MatrxJsonItemProps, MatrxJsonViewerProps} from '@/types/componentConfigTypes';
                                                                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/components/MatrxRadio.tsx:8:31 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

8 import {MatrxRadioProps} from "@/types/componentConfigTypes";
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/components/MatrxRadioGroup.tsx:7:36 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

7 import {MatrxRadioGroupProps} from "@/types/componentConfigTypes";
                                     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/components/MatrxSelect.tsx:9:46 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

9 import {MatrxSelectProps, SelectOption} from "@/types/componentConfigTypes";
                                               ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/components/MatrxTextarea.tsx:12:34 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

12 import {MatrxTextareaProps} from "@/types/componentConfigTypes";
                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/FlexField.tsx:19:40 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

19 import {FlexFormField, FormState} from "@/types/componentConfigTypes";
                                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/FlexForm.tsx:6:40 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

6 import {FlexFormField, FormState} from '@/types/componentConfigTypes';
                                         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/AnimatedForm/separated/FlexManager.tsx:7:40 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

7 import {FlexFormField, FormState} from '@/types/componentConfigTypes';
                                         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/compact-controls-with-lables.tsx:13:30 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

13 import { SelectOption } from "@/types/componentConfigTypes";
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/matrx-record-list/basic-auto-table.tsx:5:49 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

5 import { ComponentDensity, ComponentSize } from '@/types/componentConfigTypes';
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/matrx-record-list/basic-form-components.tsx:5:31 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

5 import { ComponentSize } from '@/types/componentConfigTypes';
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/matrx-record-list/basic-record-edit-list.tsx:5:47 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

5 import {ComponentDensity, ComponentSize} from '@/types/componentConfigTypes';
                                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/matrx-record-list/basic-record-list.tsx:5:47 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

5 import {ComponentDensity, ComponentSize} from '@/types/componentConfigTypes';
                                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/matrx-record-list/unified-record-list.tsx:5:47 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

5 import {ComponentDensity, ComponentSize} from '@/types/componentConfigTypes';
                                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/MatrxColorSelectFloatingLabel.tsx:6:37 - error TS2307: Cannot find module '@/app/entities/fields/field-components/add-ons/FloatingFieldLabel' or its corresponding type declarations.

6 import { FloatingSelectLabel } from "@/app/entities/fields/field-components/add-ons/FloatingFieldLabel";
                                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/matrx/MatrxSelectFloatingLabel.tsx:7:37 - error TS2307: Cannot find module '@/app/entities/fields/field-components/add-ons/FloatingFieldLabel' or its corresponding type declarations.

7 import { FloatingSelectLabel } from "@/app/entities/fields/field-components/add-ons/FloatingFieldLabel";
                                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/ui/broker-display.tsx:6:42 - error TS2307: Cannot find module '@/features/workflows/utils/node-utils' or its corresponding type declarations.

6 import { Input, Output, parseEdge } from "@/features/workflows/utils/node-utils";
                                           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/ui/broker-display.tsx:14:36 - error TS2339: Property 'workflowEnrichedBrokers' does not exist on type 'Window & typeof globalThis'.

14     const enrichedBrokers = window.workflowEnrichedBrokers || [];
                                      ~~~~~~~~~~~~~~~~~~~~~~~

components/ui/broker-display.tsx:49:36 - error TS2339: Property 'workflowEnrichedBrokers' does not exist on type 'Window & typeof globalThis'.

49     const enrichedBrokers = window.workflowEnrichedBrokers || [];
                                      ~~~~~~~~~~~~~~~~~~~~~~~

components/ui/broker-select.tsx:11:28 - error TS2307: Cannot find module '@/features/workflows/utils/brokerCollector' or its corresponding type declarations.

11 import { BrokerInfo } from "@/features/workflows/utils/brokerCollector";
                              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/ui/broker-selector.tsx:11:32 - error TS2307: Cannot find module '@/features/workflows/utils/data-flow-manager' or its corresponding type declarations.

11 import { EnrichedBroker } from "@/features/workflows/utils/data-flow-manager";
                                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/ui/broker-selector.tsx:12:33 - error TS2307: Cannot find module '@/features/workflows/utils/data-flow-manager' or its corresponding type declarations.

12 import { DataFlowManager } from "@/features/workflows/utils/data-flow-manager";
                                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/ui/JsonComponents/index.ts:5:35 - error TS2307: Cannot find module './SchemaBasedJsonEditor' or its corresponding type declarations.

5 import SchemaBasedJsonEditor from "./SchemaBasedJsonEditor";
                                    ~~~~~~~~~~~~~~~~~~~~~~~~~

components/ui/loaders/MagicButton.tsx:3:29 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

3 import {ComponentSize} from '@/types/componentConfigTypes';
                              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/ui/loaders/Spinner.tsx:4:31 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

4 import { ComponentSize } from "@/types/componentConfigTypes";
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/ui/matrx/matrix-switch.tsx:7:31 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

7 import { ComponentSize } from "@/types/componentConfigTypes";
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/ui/menu-system/MenuCore.tsx:11:43 - error TS2307: Cannot find module '@/lib/redux/stream-tasks/thunks/createTaskFromPreset' or its corresponding type declarations.

11 import { createTaskFromPresetQuick } from "@/lib/redux/stream-tasks/thunks/createTaskFromPreset";
                                             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

components/ui/react-live-scope.ts:215:8 - error TS2307: Cannot find module './matrx-date-picker' or its corresponding type declarations.

215 } from "./matrx-date-picker";
           ~~~~~~~~~~~~~~~~~~~~~

config/applets/ai-chat.tsx:2:30 - error TS2307: Cannot find module '@/types/applets/types' or its corresponding type declarations.

2 import { AppletConfig } from "@/types/applets/types";
                               ~~~~~~~~~~~~~~~~~~~~~~~

config/applets/tools.tsx:2:48 - error TS2307: Cannot find module '@/types/applets/types' or its corresponding type declarations.

2 import { AppletConfig, ToolEntityConfig } from "@/types/applets/types";
                                                 ~~~~~~~~~~~~~~~~~~~~~~~

config/ui/entity-layout-config.ts:3:33 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

3 import { AnimationPreset } from "@/types/componentConfigTypes";
                                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

config/ui/FlexConfig.ts:8:8 - error TS2307: Cannot find module '@/types/componentConfigTypes' or its corresponding type declarations.

8 } from "@/types/componentConfigTypes";
         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:43:40 - error TS2304: Cannot find name 'FormatType'.

43   const [format, setFormat] = useState<FormatType | null>("form");
                                          ~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:44:50 - error TS2304: Cannot find name 'DisplayMode'.

44   const [displayMode, setDisplayMode] = useState<DisplayMode | null>(
                                                    ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:47:52 - error TS2304: Cannot find name 'ResponseMode'.

47   const [responseMode, setResponseMode] = useState<ResponseMode | null>(
                                                      ~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:70:23 - error TS2304: Cannot find name 'useAppSelector'.

70   const isDebugMode = useAppSelector(selectIsDebugMode);
                         ~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:70:38 - error TS2304: Cannot find name 'selectIsDebugMode'.

70   const isDebugMode = useAppSelector(selectIsDebugMode);
                                        ~~~~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:76:10 - error TS2304: Cannot find name 'Card'.

76         <Card className="w-full max-w-md">
            ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:77:12 - error TS2304: Cannot find name 'CardContent'.

77           <CardContent className="p-8 text-center space-y-3">
              ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:82:13 - error TS2304: Cannot find name 'CardContent'.

82           </CardContent>
               ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:83:11 - error TS2304: Cannot find name 'Card'.

83         </Card>
             ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:100:7 - error TS2304: Cannot find name 'useAutoCreateApp'.

100   } = useAutoCreateApp({
          ~~~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:126:24 - error TS2304: Cannot find name 'useAppSelector'.

126   const liveCodeText = useAppSelector((state) =>
                           ~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:129:28 - error TS2304: Cannot find name 'useAppSelector'.

129   const liveMetadataText = useAppSelector((state) =>
                               ~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:134:29 - error TS2304: Cannot find name 'useAppSelector'.

134   const isCodeStreamEnded = useAppSelector((state) =>
                                ~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:212:30 - error TS2304: Cannot find name 'generateBuiltinVariables'.

212     const builtinVariables = generateBuiltinVariables({
                                 ~~~~~~~~~~~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:268:30 - error TS2304: Cannot find name 'generateBuiltinVariables'.

268     const builtinVariables = generateBuiltinVariables({
                                 ~~~~~~~~~~~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:299:12 - error TS2304: Cannot find name 'Loader2'.

299           <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
               ~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:306:26 - error TS2304: Cannot find name 'cn'.

306               className={cn(
                             ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:316:18 - error TS2304: Cannot find name 'Check'.

316                 <Check className="w-3 h-3" />
                     ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:318:18 - error TS2304: Cannot find name 'Loader2'.

318                 <Loader2 className="w-3 h-3 animate-spin" />
                     ~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:324:14 - error TS2304: Cannot find name 'ChevronRight'.

324             <ChevronRight className="w-3 h-3 text-muted-foreground" />
                 ~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:326:26 - error TS2304: Cannot find name 'cn'.

326               className={cn(
                             ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:336:18 - error TS2304: Cannot find name 'Check'.

336                 <Check className="w-3 h-3" />
                     ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:338:18 - error TS2304: Cannot find name 'Loader2'.

338                 <Loader2 className="w-3 h-3 animate-spin" />
                     ~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:355:14 - error TS2304: Cannot find name 'AlertTriangle'.

355             <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                 ~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:377:14 - error TS2304: Cannot find name 'Loader2'.

377             <Loader2 className="w-4 h-4 animate-spin" />
                 ~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:396:14 - error TS2304: Cannot find name 'Loader2'.

396             <Loader2 className="w-4 h-4 animate-spin" />
                 ~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:423:12 - error TS2304: Cannot find name 'Card'.

423           <Card
               ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:427:14 - error TS2304: Cannot find name 'CardContent'.

427             <CardContent className="p-6 space-y-4">
                 ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:429:18 - error TS2304: Cannot find name 'Rocket'.

429                 <Rocket className="w-8 h-8 text-white" />
                     ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:439:18 - error TS2304: Cannot find name 'Zap'.

439                 <Zap className="w-3.5 h-3.5" />
                     ~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:442:15 - error TS2304: Cannot find name 'CardContent'.

442             </CardContent>
                  ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:443:13 - error TS2304: Cannot find name 'Card'.

443           </Card>
                ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:446:12 - error TS2304: Cannot find name 'Card'.

446           <Card
               ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:450:14 - error TS2304: Cannot find name 'CardContent'.

450             <CardContent className="p-6 space-y-4">
                 ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:452:18 - error TS2304: Cannot find name 'Layers'.

452                 <Layers className="w-8 h-8 text-white" />
                     ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:461:18 - error TS2304: Cannot find name 'Check'.

461                 <Check className="w-3.5 h-3.5" />
                     ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:464:15 - error TS2304: Cannot find name 'CardContent'.

464             </CardContent>
                  ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:465:13 - error TS2304: Cannot find name 'Card'.

465           </Card>
                ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:468:12 - error TS2304: Cannot find name 'Card'.

468           <Card
               ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:472:14 - error TS2304: Cannot find name 'CardContent'.

472             <CardContent className="p-6 space-y-4">
                 ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:474:18 - error TS2304: Cannot find name 'MessageSquare'.

474                 <MessageSquare className="w-8 h-8 text-white" />
                     ~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:484:18 - error TS2304: Cannot find name 'Rocket'.

484                 <Rocket className="w-3.5 h-3.5" />
                     ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:487:15 - error TS2304: Cannot find name 'CardContent'.

487             </CardContent>
                  ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:488:13 - error TS2304: Cannot find name 'Card'.

488           </Card>
                ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:500:12 - error TS2304: Cannot find name 'Button'.

500           <Button
               ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:506:14 - error TS2304: Cannot find name 'ChevronRight'.

506             <ChevronRight className="w-4 h-4 rotate-180" />
                 ~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:508:13 - error TS2304: Cannot find name 'Button'.

508           </Button>
                ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:530:10 - error TS2304: Cannot find name 'Card'.

530         <Card>
             ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:531:12 - error TS2304: Cannot find name 'CardContent'.

531           <CardContent className="p-6 space-y-4">
               ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:532:14 - error TS2304: Cannot find name 'Label'.

532             <Label className="text-base font-semibold">
                 ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:534:15 - error TS2304: Cannot find name 'Label'.

534             </Label>
                  ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:546:13 - error TS2304: Cannot find name 'CardContent'.

546           </CardContent>
                ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:547:11 - error TS2304: Cannot find name 'Card'.

547         </Card>
              ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:553:16 - error TS2304: Cannot find name 'Zap'.

553               <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                   ~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:555:18 - error TS2304: Cannot find name 'Label'.

555                 <Label
                     ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:560:19 - error TS2304: Cannot find name 'Label'.

560                 </Label>
                      ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:566:14 - error TS2304: Cannot find name 'Switch'.

566             <Switch
                 ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:577:12 - error TS2304: Cannot find name 'Button'.

577           <Button
               ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:588:18 - error TS2304: Cannot find name 'ChevronRight'.

588                 <ChevronRight className="w-5 h-5" />
                     ~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:591:13 - error TS2304: Cannot find name 'Button'.

591           </Button>
                ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:601:8 - error TS2304: Cannot find name 'Button'.

601       <Button
           ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:607:10 - error TS2304: Cannot find name 'ChevronRight'.

607         <ChevronRight className="w-4 h-4 rotate-180" />
             ~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:609:9 - error TS2304: Cannot find name 'Button'.

609       </Button>
            ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:636:12 - error TS2304: Cannot find name 'Label'.

636           <Label className="text-lg font-semibold">
               ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:638:13 - error TS2304: Cannot find name 'Label'.

638           </Label>
                ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:641:10 - error TS2304: Cannot find name 'Card'.

641         <Card>
             ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:642:12 - error TS2304: Cannot find name 'CardContent'.

642           <CardContent className="p-6">
               ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:655:22 - error TS2304: Cannot find name 'Card'.

655                     <Card
                         ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:657:34 - error TS2304: Cannot find name 'cn'.

657                       className={cn(
                                     ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:664:24 - error TS2304: Cannot find name 'CardContent'.

664                       <CardContent className="p-4 space-y-3">
                           ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:669:42 - error TS2304: Cannot find name 'cn'.

669                               className={cn(
                                             ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:675:34 - error TS2304: Cannot find name 'ListOrdered'.

675                                 <ListOrdered
                                     ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:676:46 - error TS2304: Cannot find name 'cn'.

676                                   className={cn(
                                                 ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:684:34 - error TS2304: Cannot find name 'Type'.

684                                 <Type
                                     ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:685:46 - error TS2304: Cannot find name 'cn'.

685                                   className={cn(
                                                 ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:696:34 - error TS2304: Cannot find name 'formatTitleCase'.

696                                 {formatTitleCase(variable.name)}
                                     ~~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:705:28 - error TS2304: Cannot find name 'Switch'.

705                           <Switch
                               ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:757:25 - error TS2304: Cannot find name 'CardContent'.

757                       </CardContent>
                            ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:758:23 - error TS2304: Cannot find name 'Card'.

758                     </Card>
                          ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:763:18 - error TS2304: Cannot find name 'Card'.

763                 <Card
                     ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:764:30 - error TS2304: Cannot find name 'cn'.

764                   className={cn(
                                 ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:773:20 - error TS2304: Cannot find name 'CardContent'.

773                   <CardContent className="p-4 space-y-3">
                       ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:778:38 - error TS2304: Cannot find name 'cn'.

778                           className={cn(
                                         ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:785:28 - error TS2304: Cannot find name 'MessageCircle'.

785                           <MessageCircle
                               ~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:786:40 - error TS2304: Cannot find name 'cn'.

786                             className={cn(
                                           ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:805:24 - error TS2304: Cannot find name 'Switch'.

805                       <Switch
                           ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:819:21 - error TS2304: Cannot find name 'CardContent'.

819                   </CardContent>
                        ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:820:19 - error TS2304: Cannot find name 'Card'.

820                 </Card>
                      ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:825:18 - error TS2304: Cannot find name 'Rocket'.

825                 <Rocket className="w-3.5 h-3.5 text-primary" />
                     ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:832:13 - error TS2304: Cannot find name 'CardContent'.

832           </CardContent>
                ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:833:11 - error TS2304: Cannot find name 'Card'.

833         </Card>
              ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:842:12 - error TS2304: Cannot find name 'Label'.

842           <Label className="text-lg font-semibold">
               ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:844:13 - error TS2304: Cannot find name 'Label'.

844           </Label>
                ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:849:12 - error TS2304: Cannot find name 'Card'.

849           <Card
               ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:850:24 - error TS2304: Cannot find name 'cn'.

850             className={cn(
                           ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:856:14 - error TS2304: Cannot find name 'CardContent'.

856             <CardContent className="p-6 space-y-4">
                 ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:859:20 - error TS2304: Cannot find name 'FileText'.

859                   <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
                       ~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:863:22 - error TS2304: Cannot find name 'Check'.

863                     <Check className="w-4 h-4 text-primary-foreground" />
                         ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:874:15 - error TS2304: Cannot find name 'CardContent'.

874             </CardContent>
                  ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:875:13 - error TS2304: Cannot find name 'Card'.

875           </Card>
                ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:878:12 - error TS2304: Cannot find name 'Card'.

878           <Card
               ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:879:24 - error TS2304: Cannot find name 'cn'.

879             className={cn(
                           ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:885:14 - error TS2304: Cannot find name 'CardContent'.

885             <CardContent className="p-6 space-y-4">
                 ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:888:20 - error TS2304: Cannot find name 'MessageSquare'.

888                   <MessageSquare className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                       ~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:892:22 - error TS2304: Cannot find name 'Check'.

892                     <Check className="w-4 h-4 text-primary-foreground" />
                         ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:903:15 - error TS2304: Cannot find name 'CardContent'.

903             </CardContent>
                  ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:904:13 - error TS2304: Cannot find name 'Card'.

904           </Card>
                ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:907:12 - error TS2304: Cannot find name 'Card'.

907           <Card
               ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:908:24 - error TS2304: Cannot find name 'cn'.

908             className={cn(
                           ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:915:14 - error TS2304: Cannot find name 'CardContent'.

915             <CardContent className="p-6 space-y-4">
                 ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:918:20 - error TS2304: Cannot find name 'Box'.

918                   <Box className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                       ~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:922:22 - error TS2304: Cannot find name 'Check'.

922                     <Check className="w-4 h-4 text-primary-foreground" />
                         ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:933:15 - error TS2304: Cannot find name 'CardContent'.

933             </CardContent>
                  ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:934:13 - error TS2304: Cannot find name 'Card'.

934           </Card>
                ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:944:12 - error TS2304: Cannot find name 'Label'.

944           <Label className="text-lg font-semibold">
               ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:946:13 - error TS2304: Cannot find name 'Label'.

946           </Label>
                ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:951:12 - error TS2304: Cannot find name 'Card'.

951           <Card
               ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:952:24 - error TS2304: Cannot find name 'cn'.

952             className={cn(
                           ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:959:14 - error TS2304: Cannot find name 'CardContent'.

959             <CardContent className="p-6 space-y-4">
                 ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:962:20 - error TS2304: Cannot find name 'Rocket'.

962                   <Rocket className="w-8 h-8 text-white" />
                       ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:966:22 - error TS2304: Cannot find name 'Check'.

966                     <Check className="w-4 h-4 text-primary-foreground" />
                         ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:979:15 - error TS2304: Cannot find name 'CardContent'.

979             </CardContent>
                  ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:980:13 - error TS2304: Cannot find name 'Card'.

980           </Card>
                ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:983:12 - error TS2304: Cannot find name 'Card'.

983           <Card
               ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:984:24 - error TS2304: Cannot find name 'cn'.

984             className={cn(
                           ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:991:14 - error TS2304: Cannot find name 'CardContent'.

991             <CardContent className="p-6 space-y-4">
                 ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:994:20 - error TS2304: Cannot find name 'Code2'.

994                   <Code2 className="w-8 h-8 text-orange-600 dark:text-orange-400" />
                       ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:998:22 - error TS2304: Cannot find name 'Check'.

998                     <Check className="w-4 h-4 text-primary-foreground" />
                         ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1010:15 - error TS2304: Cannot find name 'CardContent'.

1010             </CardContent>
                   ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1011:13 - error TS2304: Cannot find name 'Card'.

1011           </Card>
                 ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1021:12 - error TS2304: Cannot find name 'Label'.

1021           <Label className="text-lg font-semibold">
                ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1023:13 - error TS2304: Cannot find name 'Label'.

1023           </Label>
                 ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1028:12 - error TS2304: Cannot find name 'Card'.

1028           <Card
                ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1029:24 - error TS2304: Cannot find name 'cn'.

1029             className={cn(
                            ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1036:14 - error TS2304: Cannot find name 'CardContent'.

1036             <CardContent className="p-6 space-y-4">
                  ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1039:20 - error TS2304: Cannot find name 'Zap'.

1039                   <Zap className="w-8 h-8 text-green-600 dark:text-green-400" />
                        ~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1043:22 - error TS2304: Cannot find name 'Check'.

1043                     <Check className="w-4 h-4 text-primary-foreground" />
                          ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1056:15 - error TS2304: Cannot find name 'CardContent'.

1056             </CardContent>
                   ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1057:13 - error TS2304: Cannot find name 'Card'.

1057           </Card>
                 ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1060:12 - error TS2304: Cannot find name 'Card'.

1060           <Card
                ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1061:24 - error TS2304: Cannot find name 'cn'.

1061             className={cn(
                            ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1068:14 - error TS2304: Cannot find name 'CardContent'.

1068             <CardContent className="p-6 space-y-4">
                  ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1071:20 - error TS2304: Cannot find name 'Clock'.

1071                   <Clock className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                        ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1075:22 - error TS2304: Cannot find name 'Check'.

1075                     <Check className="w-4 h-4 text-primary-foreground" />
                          ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1086:15 - error TS2304: Cannot find name 'CardContent'.

1086             </CardContent>
                   ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1087:13 - error TS2304: Cannot find name 'Card'.

1087           </Card>
                 ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1097:12 - error TS2304: Cannot find name 'Label'.

1097           <Label className="text-lg font-semibold">
                ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1099:13 - error TS2304: Cannot find name 'Label'.

1099           </Label>
                 ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1104:12 - error TS2304: Cannot find name 'Card'.

1104           <Card
                ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1105:24 - error TS2304: Cannot find name 'cn'.

1105             className={cn(
                            ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1112:14 - error TS2304: Cannot find name 'CardContent'.

1112             <CardContent className="p-6 space-y-4">
                  ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1115:20 - error TS2304: Cannot find name 'Rocket'.

1115                   <Rocket className="w-8 h-8 text-white" />
                        ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1119:22 - error TS2304: Cannot find name 'Check'.

1119                     <Check className="w-4 h-4 text-primary-foreground" />
                          ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1132:15 - error TS2304: Cannot find name 'CardContent'.

1132             </CardContent>
                   ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1133:13 - error TS2304: Cannot find name 'Card'.

1133           </Card>
                 ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1136:12 - error TS2304: Cannot find name 'Card'.

1136           <Card
                ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1137:24 - error TS2304: Cannot find name 'cn'.

1137             className={cn(
                            ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1144:14 - error TS2304: Cannot find name 'CardContent'.

1144             <CardContent className="p-6 space-y-4">
                  ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1147:20 - error TS2304: Cannot find name 'Palette'.

1147                   <Palette className="w-8 h-8 text-orange-600 dark:text-orange-400" />
                        ~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1151:22 - error TS2304: Cannot find name 'Check'.

1151                     <Check className="w-4 h-4 text-primary-foreground" />
                          ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1162:15 - error TS2304: Cannot find name 'CardContent'.

1162             </CardContent>
                   ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1163:13 - error TS2304: Cannot find name 'Card'.

1163           </Card>
                 ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1168:12 - error TS2304: Cannot find name 'Card'.

1168           <Card>
                ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1169:14 - error TS2304: Cannot find name 'CardContent'.

1169             <CardContent className="p-6">
                  ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1174:22 - error TS2304: Cannot find name 'Label'.

1174                     <Label className="text-sm font-medium flex items-center gap-2">
                          ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1175:24 - error TS2304: Cannot find name 'Palette'.

1175                       <Palette className="w-4 h-4 text-primary" />
                            ~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1177:23 - error TS2304: Cannot find name 'Label'.

1177                     </Label>
                           ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1179:24 - error TS2304: Cannot find name 'TailwindColorPicker'.

1179                       <TailwindColorPicker
                            ~~~~~~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1199:22 - error TS2304: Cannot find name 'Label'.

1199                     <Label className="text-sm font-medium flex items-center gap-2">
                          ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1200:24 - error TS2304: Cannot find name 'Palette'.

1200                       <Palette className="w-4 h-4 text-secondary" />
                            ~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1202:23 - error TS2304: Cannot find name 'Label'.

1202                     </Label>
                           ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1204:24 - error TS2304: Cannot find name 'TailwindColorPicker'.

1204                       <TailwindColorPicker
                            ~~~~~~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1224:22 - error TS2304: Cannot find name 'Label'.

1224                     <Label className="text-sm font-medium flex items-center gap-2">
                          ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1225:24 - error TS2304: Cannot find name 'Rocket'.

1225                       <Rocket className="w-4 h-4 text-accent" />
                            ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1227:23 - error TS2304: Cannot find name 'Label'.

1227                     </Label>
                           ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1229:24 - error TS2304: Cannot find name 'TailwindColorPicker'.

1229                       <TailwindColorPicker
                            ~~~~~~~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1248:15 - error TS2304: Cannot find name 'CardContent'.

1248             </CardContent>
                   ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1249:13 - error TS2304: Cannot find name 'Card'.

1249           </Card>
                 ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1259:12 - error TS2304: Cannot find name 'Label'.

1259           <Label className="text-lg font-semibold">
                ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1264:13 - error TS2304: Cannot find name 'Label'.

1264           </Label>
                 ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1280:14 - error TS2304: Cannot find name 'Zap'.

1280             <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  ~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1282:16 - error TS2304: Cannot find name 'Label'.

1282               <Label
                    ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1287:17 - error TS2304: Cannot find name 'Label'.

1287               </Label>
                     ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1293:12 - error TS2304: Cannot find name 'Switch'.

1293           <Switch
                ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1304:10 - error TS2304: Cannot find name 'Button'.

1304         <Button
              ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1315:16 - error TS2304: Cannot find name 'ChevronRight'.

1315               <ChevronRight className="w-5 h-5" />
                    ~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1318:11 - error TS2304: Cannot find name 'Button'.

1318         </Button>
               ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1356:6 - error TS2304: Cannot find name 'Card'.

1356     <Card
          ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1357:18 - error TS2304: Cannot find name 'cn'.

1357       className={cn(
                      ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1363:20 - error TS2304: Cannot find name 'cn'.

1363         className={cn(
                        ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1370:14 - error TS2304: Cannot find name 'Loader2'.

1370             <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                  ~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1372:14 - error TS2304: Cannot find name 'Check'.

1372             <Check className="w-3.5 h-3.5 text-success" />
                  ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1374:14 - error TS2304: Cannot find name 'Code2'.

1374             <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
                  ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1377:24 - error TS2304: Cannot find name 'cn'.

1377             className={cn(
                            ~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1389:14 - error TS2304: Cannot find name 'Badge'.

1389             <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1391:15 - error TS2304: Cannot find name 'Badge'.

1391             </Badge>
                   ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1400:8 - error TS2304: Cannot find name 'CardContent'.

1400       <CardContent className="p-0">
            ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1411:14 - error TS2304: Cannot find name 'Loader2'.

1411             <Loader2 className="w-4 h-4 animate-spin" />
                  ~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1415:9 - error TS2304: Cannot find name 'CardContent'.

1415       </CardContent>
             ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1416:7 - error TS2304: Cannot find name 'Card'.

1416     </Card>
           ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1444:6 - error TS2304: Cannot find name 'Card'.

1444     <Card className="border-destructive bg-destructive/5">
          ~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1445:8 - error TS2304: Cannot find name 'CardContent'.

1445       <CardContent className="p-4 space-y-3">
            ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1449:14 - error TS2304: Cannot find name 'AlertTriangle'.

1449             <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                  ~~~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1455:14 - error TS2304: Cannot find name 'Button'.

1455             <Button
                  ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1461:16 - error TS2304: Cannot find name 'RefreshCw'.

1461               <RefreshCw className="w-4 h-4" />
                    ~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1463:15 - error TS2304: Cannot find name 'Button'.

1463             </Button>
                   ~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1475:18 - error TS2304: Cannot find name 'ChevronUp'.

1475                 <ChevronUp className="w-3.5 h-3.5" />
                      ~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1477:18 - error TS2304: Cannot find name 'ChevronDown'.

1477                 <ChevronDown className="w-3.5 h-3.5" />
                      ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1480:16 - error TS2304: Cannot find name 'Badge'.

1480               <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-1">
                    ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1482:17 - error TS2304: Cannot find name 'Badge'.

1482               </Badge>
                     ~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1493:9 - error TS2304: Cannot find name 'CardContent'.

1493       </CardContent>
             ~~~~~~~~~~~

features/agent-apps/components/AutoCreateAgentAppForm.tsx:1494:7 - error TS2304: Cannot find name 'Card'.

1494     </Card>
           ~~~~

features/agent-apps/hooks/useAutoCreateApp.ts:193:15 - error TS2740: Type '{}' is missing the following properties from type 'AppMetadata': name, tagline, description, slug_options, and 2 more.

193         const metadata: AppMetadata = metadataResult.data;
                  ~~~~~~~~

features/agents/components/builder/message-builders/system-instructions/FullPromptOptimizer.tsx:99:25 - error TS2304: Cannot find name 'useAppSelector'.

99   const streamingText = useAppSelector((state) =>
                           ~~~~~~~~~~~~~~

features/agents/components/builder/message-builders/system-instructions/FullPromptOptimizer.tsx:105:27 - error TS2304: Cannot find name 'useAppSelector'.

105   const isResponseEnded = useAppSelector((state) =>
                              ~~~~~~~~~~~~~~

features/agents/components/inputs/variable-input-variations/AgentVariablesGuided.tsx:141:20 - error TS2304: Cannot find name 'Check'.

141                   <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                       ~~~~~

features/agents/components/inputs/variable-input-variations/AgentVariablesGuided.tsx:885:16 - error TS2304: Cannot find name 'Check'.

885               <Check className="w-3.5 h-3.5" />
                   ~~~~~

features/applet/builder/modules/field-builder/previews/FieldPreview.tsx:71:48 - error TS2339: Property 'sourceId' does not exist on type '{ getIdentifier: (componentType: string) => BrokerIdentifier; }'.

71                         appletId={brokerResult.sourceId}
                                                  ~~~~~~~~

features/applet/builder/modules/field-builder/previews/FieldPreviewAs.tsx:119:48 - error TS2339: Property 'sourceId' does not exist on type '{ getIdentifier: (componentType: string) => BrokerIdentifier; }'.

119                         appletId={brokerResult.sourceId}
                                                   ~~~~~~~~

features/applet/builder/modules/smart-parts/containers/ContainerFormComponent.tsx:16:28 - error TS2307: Cannot find module '@/app/entities/quick-reference/QuickRefSelectFloatingLabel' or its corresponding type declarations.

16 import QuickRefSelect from "@/app/entities/quick-reference/QuickRefSelectFloatingLabel";
                              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/applet/builder/steps/dev/BackupSourceConfigStep.tsx:30:34 - error TS2307: Cannot find module '@/app/entities/hooks/useFetchQuickRef' or its corresponding type declarations.

30 import { useFetchQuickRef } from "@/app/entities/hooks/useFetchQuickRef";
                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/applet/builder/steps/SourceConfigStep.tsx:22:34 - error TS2307: Cannot find module '@/app/entities/hooks/useFetchQuickRef' or its corresponding type declarations.

22 import { useFetchQuickRef } from "@/app/entities/hooks/useFetchQuickRef";
                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/applet/contepts/BrokerDebugger.tsx:16:66 - error TS2339: Property 'broker' does not exist on type '{ layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }'.

16   const brokerState = useAppSelector((state: RootState) => state.broker);
                                                                    ~~~~~~

features/applet/hooks/useAppletRecipe.ts:7:8 - error TS2307: Cannot find module '@/lib/redux/stream-tasks/slices/socketTasksSlice' or its corresponding type declarations.

7 } from "@/lib/redux/stream-tasks/slices/socketTasksSlice";
         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/applet/hooks/useAppletRecipe.ts:8:28 - error TS2307: Cannot find module '@/lib/redux/stream-tasks/thunks/createTaskThunk' or its corresponding type declarations.

8 import { createTask } from "@/lib/redux/stream-tasks/thunks/createTaskThunk";
                             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/applet/hooks/useAppletRecipe.ts:9:28 - error TS2307: Cannot find module '@/lib/redux/stream-tasks/thunks/submitTask' or its corresponding type declarations.

9 import { submitTask } from "@/lib/redux/stream-tasks/thunks/submitTask";
                             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/applet/hooks/useAppletRecipeFastAPI.ts:160:7 - error TS2304: Cannot find name 'submitAppletAgentThunk'.

160       submitAppletAgentThunk({
          ~~~~~~~~~~~~~~~~~~~~~~

features/applet/runner/fields/AddressBlockField.tsx:94:17 - error TS2698: Spread types may only be created from object types.

94                 ...stateValue,
                   ~~~~~~~~~~~~~

features/applet/runner/fields/ButtonGroupField.tsx:82:43 - error TS2339: Property 'filter' does not exist on type 'unknown'.

82         const selectedCount = stateValue?.filter((o: SelectedOptionValue) => o.selected).length || 0;
                                             ~~~~~~

features/applet/runner/fields/ButtonGroupField.tsx:86:55 - error TS2339: Property 'map' does not exist on type 'unknown'.

86             const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => ({
                                                         ~~~

features/applet/runner/fields/ButtonGroupField.tsx:108:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

108         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
                                                      ~~~

features/applet/runner/fields/ButtonGroupField.tsx:126:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

126         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
                                                      ~~~

features/applet/runner/fields/ButtonGroupField.tsx:148:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

148         const clearedOptions = (stateValue || []).map((option: SelectedOptionValue) => ({
                                                      ~~~

features/applet/runner/fields/CheckboxGroupField.tsx:94:43 - error TS2339: Property 'filter' does not exist on type 'unknown'.

94         const selectedCount = stateValue?.filter((o: SelectedOptionValue) => o.selected).length || 0;
                                             ~~~~~~

features/applet/runner/fields/CheckboxGroupField.tsx:107:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

107         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
                                                      ~~~

features/applet/runner/fields/CheckboxGroupField.tsx:128:45 - error TS2339: Property 'find' does not exist on type 'unknown'.

128             const stateOption = stateValue?.find((o: SelectedOptionValue) => o.id === option.id);
                                                ~~~~

features/applet/runner/fields/CheckboxGroupField.tsx:133:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

133         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => ({
                                                      ~~~

features/applet/runner/fields/CheckboxGroupField.tsx:158:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

158         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
                                                      ~~~

features/applet/runner/fields/CheckboxGroupField.tsx:199:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

199         const clearedOptions = (stateValue || []).map((option: SelectedOptionValue) => ({
                                                      ~~~

features/applet/runner/fields/CheckboxGroupField.tsx:289:69 - error TS2339: Property 'find' does not exist on type 'unknown'.

289                                     const stateOption = stateValue?.find((o: SelectedOptionValue) => o.id === option.id);
                                                                        ~~~~

features/applet/runner/fields/CheckboxGroupField.tsx:300:65 - error TS2339: Property 'find' does not exist on type 'unknown'.

300                                 const stateOption = stateValue?.find((o: SelectedOptionValue) => o.id === option.id);
                                                                    ~~~~

features/applet/runner/fields/CheckboxGroupField.tsx:312:65 - error TS2339: Property 'find' does not exist on type 'unknown'.

312                                 const stateOption = stateValue?.find((o: SelectedOptionValue) => o.id === option.id);
                                                                    ~~~~

features/applet/runner/fields/concept-broker-options/DragEditModifyTableField.tsx:152:22 - error TS2339: Property 'isFixed' does not exist on type 'BrokerTableColumn'.

152         if (!column?.isFixed) {
                         ~~~~~~~

features/applet/runner/fields/concept-broker-options/DragEditModifyTableField.tsx:159:35 - error TS2339: Property 'isFixed' does not exist on type 'BrokerTableColumn'.

159         if (!disabled && !column?.isFixed) {
                                      ~~~~~~~

features/applet/runner/fields/concept-broker-options/DragEditModifyTableField.tsx:161:39 - error TS2339: Property 'name' does not exist on type 'BrokerTableColumn'.

161             setColumnEditValue(column.name);
                                          ~~~~

features/applet/runner/fields/concept-broker-options/DragEditModifyTableField.tsx:218:37 - error TS2322: Type 'unknown' is not assignable to type 'ReactNode'.

218                                     {row.cells[col.id] ?? "-"}
                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~

  node_modules/.pnpm/@types+react@19.2.14/node_modules/@types/react/index.d.ts:2267:9
    2267         children?: ReactNode | undefined;
                 ~~~~~~~~
    The expected type comes from property 'children' which is declared here on type 'DetailedHTMLProps<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>'

features/applet/runner/fields/concept-broker-options/DragEditModifyTableField.tsx:256:85 - error TS2339: Property 'isFixed' does not exist on type 'BrokerTableColumn'.

256                                                     isDragDisabled={disabled || col.isFixed || isEditing}
                                                                                        ~~~~~~~

features/applet/runner/fields/concept-broker-options/DragEditModifyTableField.tsx:269:69 - error TS2339: Property 'minWidthClass' does not exist on type 'BrokerTableColumn'.

269                                                                 col.minWidthClass,
                                                                        ~~~~~~~~~~~~~

features/applet/runner/fields/concept-broker-options/DragEditModifyTableField.tsx:271:70 - error TS2339: Property 'isFixed' does not exist on type 'BrokerTableColumn'.

271                                                                 !col.isFixed &&
                                                                         ~~~~~~~

features/applet/runner/fields/concept-broker-options/DragEditModifyTableField.tsx:299:79 - error TS2339: Property 'isFixed' does not exist on type 'BrokerTableColumn'.

299                                                                         {!col.isFixed && !disabled && (
                                                                                  ~~~~~~~

features/applet/runner/fields/concept-broker-options/DragEditModifyTableField.tsx:303:82 - error TS2339: Property 'name' does not exist on type 'BrokerTableColumn'.

303                                                                             {col.name}
                                                                                     ~~~~

features/applet/runner/fields/concept-broker-options/DragEditModifyTableField.tsx:307:71 - error TS2339: Property 'isFixed' does not exist on type 'BrokerTableColumn'.

307                                                                 {!col.isFixed && !disabled && !isEditing && (
                                                                          ~~~~~~~

features/applet/runner/fields/concept-broker-options/DragEditModifyTableField.tsx:418:73 - error TS2322: Type 'unknown' is not assignable to type 'ReactNode'.

418                                                                         {row.cells[col.id] ?? "-"}
                                                                            ~~~~~~~~~~~~~~~~~~~~~~~~~~

  node_modules/.pnpm/@types+react@19.2.14/node_modules/@types/react/index.d.ts:2267:9
    2267         children?: ReactNode | undefined;
                 ~~~~~~~~
    The expected type comes from property 'children' which is declared here on type 'DetailedHTMLProps<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>'

features/applet/runner/fields/concept-broker-options/SearchableSelectField.tsx:181:41 - error TS2339: Property 'otherText' does not exist on type 'BrokerOption'.

181                     value={otherOption?.otherText || ""}
                                            ~~~~~~~~~

features/applet/runner/fields/DateField.tsx:57:48 - error TS2769: No overload matches this call.
  Overload 1 of 4, '(value: string | number | Date): Date', gave the following error.
    Argument of type 'unknown' is not assignable to parameter of type 'string | number | Date'.
  Overload 2 of 4, '(value: string | number): Date', gave the following error.
    Argument of type 'unknown' is not assignable to parameter of type 'string | number'.

57     const selectedDate = stateValue ? new Date(stateValue) : undefined;
                                                  ~~~~~~~~~~


features/applet/runner/fields/DependentDropdownField.tsx:152:36 - error TS2488: Type 'unknown' must have a '[Symbol.iterator]()' method that returns an iterator.

152         const updatedOptions = [...(stateValue || [])];
                                       ~~~~~~~~~~~~~~~~~~

features/applet/runner/fields/DependentDropdownField.tsx:263:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

263         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
                                                      ~~~

features/applet/runner/fields/DirectMultiSelectField.tsx:92:47 - error TS2339: Property 'map' does not exist on type 'unknown'.

92     const updatedOptions = (stateValue || []).map(
                                                 ~~~

features/applet/runner/fields/DirectMultiSelectField.tsx:97:46 - error TS2339: Property 'filter' does not exist on type 'unknown'.

97             const selectedCount = stateValue.filter(
                                                ~~~~~~

features/applet/runner/fields/DirectMultiSelectField.tsx:107:46 - error TS2339: Property 'filter' does not exist on type 'unknown'.

107             const selectedCount = stateValue.filter(
                                                 ~~~~~~

features/applet/runner/fields/DirectMultiSelectField.tsx:133:39 - error TS2339: Property 'find' does not exist on type 'unknown'.

133       const stateOption = stateValue?.find(
                                          ~~~~

features/applet/runner/fields/DirectMultiSelectField.tsx:140:47 - error TS2339: Property 'map' does not exist on type 'unknown'.

140     const updatedOptions = (stateValue || []).map(
                                                  ~~~

features/applet/runner/fields/DirectMultiSelectField.tsx:167:47 - error TS2339: Property 'map' does not exist on type 'unknown'.

167     const updatedOptions = (stateValue || []).map(
                                                  ~~~

features/applet/runner/fields/DirectMultiSelectField.tsx:237:47 - error TS2339: Property 'map' does not exist on type 'unknown'.

237     const clearedOptions = (stateValue || []).map(
                                                  ~~~

features/applet/runner/fields/DirectMultiSelectField.tsx:274:49 - error TS2339: Property 'find' does not exist on type 'unknown'.

274                 const stateOption = stateValue?.find(
                                                    ~~~~

features/applet/runner/fields/InputField.tsx:55:17 - error TS2322: Type 'unknown' is not assignable to type 'string | number | readonly string[]'.

55                 value={stateValue ?? ""}
                   ~~~~~

  node_modules/.pnpm/@types+react@19.2.14/node_modules/@types/react/index.d.ts:3312:9
    3312         value?: string | readonly string[] | number | undefined;
                 ~~~~~
    The expected type comes from property 'value' which is declared here on type 'DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>'

features/applet/runner/fields/MultiSearchableSelectField.tsx:84:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

84         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
                                                     ~~~

features/applet/runner/fields/MultiSearchableSelectField.tsx:109:45 - error TS2339: Property 'find' does not exist on type 'unknown'.

109             const stateOption = stateValue?.find((o: SelectedOptionValue) => o.id === option.id);
                                                ~~~~

features/applet/runner/fields/MultiSearchableSelectField.tsx:114:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

114         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => ({
                                                      ~~~

features/applet/runner/fields/MultiSearchableSelectField.tsx:127:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

127         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
                                                      ~~~

features/applet/runner/fields/MultiSearchableSelectField.tsx:261:85 - error TS2339: Property 'find' does not exist on type 'unknown'.

261                                                     const stateOption = stateValue?.find((o: SelectedOptionValue) => o.id === option.id);
                                                                                        ~~~~

features/applet/runner/fields/RadioGroupField.tsx:86:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

86         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => ({
                                                     ~~~

features/applet/runner/fields/RadioGroupField.tsx:99:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

99         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
                                                     ~~~

features/applet/runner/fields/SearchableSelectField.tsx:82:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

82         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => ({
                                                     ~~~

features/applet/runner/fields/SearchableSelectField.tsx:97:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

97         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
                                                     ~~~

features/applet/runner/fields/SelectField.tsx:69:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

69         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => ({
                                                     ~~~

features/applet/runner/fields/SelectField.tsx:81:51 - error TS2339: Property 'map' does not exist on type 'unknown'.

81         const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
                                                     ~~~

features/applet/runner/fields/SimpleNumberField.tsx:137:55 - error TS2365: Operator '<' cannot be applied to types 'unknown' and 'number'.

137     (min !== undefined && stateValue !== undefined && stateValue < min) ||
                                                          ~~~~~~~~~~~~~~~~

features/applet/runner/fields/SimpleNumberField.tsx:138:55 - error TS2365: Operator '>' cannot be applied to types 'unknown' and 'number'.

138     (max !== undefined && stateValue !== undefined && stateValue > max);
                                                          ~~~~~~~~~~~~~~~~

features/applet/runner/fields/SliderField.tsx:89:28 - error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'SetStateAction<number | number[]>'.

89             setSliderValue(stateValue);
                              ~~~~~~~~~~

features/applet/runner/fields/SortableField.tsx:44:22 - error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'SetStateAction<SortableItem[]>'.

44             setItems(stateValue);
                        ~~~~~~~~~~

features/applet/runner/fields/TextareaField.tsx:49:17 - error TS2322: Type 'unknown' is not assignable to type 'string | number | readonly string[]'.

49                 value={stateValue ?? ""}
                   ~~~~~

  node_modules/.pnpm/@types+react@19.2.14/node_modules/@types/react/index.d.ts:3533:9
    3533         value?: string | readonly string[] | number | undefined;
                 ~~~~~
    The expected type comes from property 'value' which is declared here on type 'DetailedHTMLProps<TextareaHTMLAttributes<HTMLTextAreaElement>, HTMLTextAreaElement>'

features/applet/runner/header/CustomAppHeader.tsx:66:9 - error TS2322: Type 'unknown' is not assignable to type 'boolean'.

66         isCreator={userIsCreator}
           ~~~~~~~~~

  features/applet/runner/header/mobile/MobileAppHeader.tsx:28:3
    28   isCreator?: boolean;
         ~~~~~~~~~
    The expected type comes from property 'isCreator' which is declared here on type 'IntrinsicAttributes & MobileAppHeaderProps'

features/applet/runner/header/CustomAppHeader.tsx:67:9 - error TS2322: Type 'unknown' is not assignable to type 'boolean'.

67         isAdmin={isAdmin}
           ~~~~~~~

  features/applet/runner/header/mobile/MobileAppHeader.tsx:29:3
    29   isAdmin?: boolean;
         ~~~~~~~
    The expected type comes from property 'isAdmin' which is declared here on type 'IntrinsicAttributes & MobileAppHeaderProps'

features/applet/runner/header/CustomAppHeader.tsx:77:9 - error TS2322: Type 'unknown' is not assignable to type 'boolean'.

77         isCreator={userIsCreator}
           ~~~~~~~~~

  features/applet/runner/header/desktop/DesktopAppHeader.tsx:18:3
    18   isCreator?: boolean;
         ~~~~~~~~~
    The expected type comes from property 'isCreator' which is declared here on type 'IntrinsicAttributes & DesktopAppHeaderProps'

features/applet/runner/header/CustomAppHeader.tsx:78:9 - error TS2322: Type 'unknown' is not assignable to type 'boolean'.

78         isAdmin={isAdmin}
           ~~~~~~~

  features/applet/runner/header/desktop/DesktopAppHeader.tsx:19:3
    19   isAdmin?: boolean;
         ~~~~~~~
    The expected type comes from property 'isAdmin' which is declared here on type 'IntrinsicAttributes & DesktopAppHeaderProps'

features/applet/runner/response/AppletFollowUpInput.tsx:36:8 - error TS2307: Cannot find module '@/lib/redux/stream-tasks/slices/socketResponseSlice' or its corresponding type declarations.

36 } from "@/lib/redux/stream-tasks/slices/socketResponseSlice";
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/applet/runner/response/AppletFollowUpInput.tsx:42:8 - error TS2307: Cannot find module '@/lib/redux/stream-tasks/slices/socketTasksSlice' or its corresponding type declarations.

42 } from "@/lib/redux/stream-tasks/slices/socketTasksSlice";
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/chat/components/input/AIToolsSheet.tsx:44:26 - error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type 'SetStateAction<string[]>'.
  Type 'unknown[]' is not assignable to type 'string[]'.
    Type 'unknown' is not assignable to type 'string'.

44         setSelectedTools(availableTools || []);
                            ~~~~~~~~~~~~~~~~~~~~

features/chat/components/input/BrokerSheet.tsx:37:28 - error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type 'SetStateAction<string[]>'.
  Type 'unknown[]' is not assignable to type 'string[]'.
    Type 'unknown' is not assignable to type 'string'.

37         setSelectedBrokers(availableBrokers || []);
                              ~~~~~~~~~~~~~~~~~~~~~~

features/chat/components/input/InputBottomControls.tsx:196:15 - error TS2322: Type 'unknown[]' is not assignable to type 'Record<string, Model>'.
  Index signature for type 'string' is missing in type 'unknown[]'.

196               models={models}
                  ~~~~~~

  features/chat/components/input/ModelSelection.tsx:32:5
    32     models: Record<MatrxRecordId, Model>;
           ~~~~~~
    The expected type comes from property 'models' which is declared here on type 'IntrinsicAttributes & ModelSelectionProps'

features/chat/components/input/mobile/MobileAudioPlan.tsx:90:40 - error TS2339: Property 'details' does not exist on type 'unknown'.

90                             {files[0]?.details?.filename || "Audio file uploaded"}
                                          ~~~~~~~

features/chat/components/input/mobile/MobileInputBottomControls.tsx:93:29 - error TS2322: Type 'unknown[]' is not assignable to type 'Record<string, Model>'.
  Index signature for type 'string' is missing in type 'unknown[]'.

93                             models={models}
                               ~~~~~~

  features/chat/components/input/ModelSelection.tsx:32:5
    32     models: Record<MatrxRecordId, Model>;
           ~~~~~~
    The expected type comes from property 'models' which is declared here on type 'IntrinsicAttributes & ModelSelectionProps'

features/chat/components/input/RecipeSelectionButton.tsx:7:34 - error TS2307: Cannot find module '@/app/entities/hooks/useFetchQuickRef' or its corresponding type declarations.

7 import { useFetchQuickRef } from "@/app/entities/hooks/useFetchQuickRef";
                                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/chat/components/response/assistant-message/stream/ChatStreamDisplay.tsx:153:43 - error TS2740: Type '{}' is missing the following properties from type 'InputControlsSettings': searchEnabled, toolsEnabled, thinkEnabled, researchEnabled, and 8 more.

153               <ControlledLoadingIndicator settings={settings} />
                                              ~~~~~~~~

  features/chat/components/response/chat-loading/ControlledLoadingIndicator.tsx:122:5
    122     settings?: InputControlsSettings | null;
            ~~~~~~~~
    The expected type comes from property 'settings' which is declared here on type 'IntrinsicAttributes & LoadingIndicatorProps'

features/chat/components/response/ResponseColumn.tsx:57:22 - error TS2339: Property 'user_message' does not exist on type 'unknown'.

57     (streamError[0]?.user_message || streamError[0]?.user_visible_message) !=
                        ~~~~~~~~~~~~

features/chat/components/response/ResponseColumn.tsx:57:54 - error TS2339: Property 'user_visible_message' does not exist on type 'unknown'.

57     (streamError[0]?.user_message || streamError[0]?.user_visible_message) !=
                                                        ~~~~~~~~~~~~~~~~~~~~

features/chat/components/response/ResponseColumn.tsx:59:22 - error TS2339: Property 'user_message' does not exist on type 'unknown'.

59     (streamError[0]?.user_message || streamError[0]?.user_visible_message)
                        ~~~~~~~~~~~~

features/chat/components/response/ResponseColumn.tsx:59:54 - error TS2339: Property 'user_visible_message' does not exist on type 'unknown'.

59     (streamError[0]?.user_message || streamError[0]?.user_visible_message)
                                                        ~~~~~~~~~~~~~~~~~~~~

features/chat/components/response/ResponseColumn.tsx:74:30 - error TS2339: Property 'role' does not exist on type 'unknown'.

74         (message) => message.role === "assistant",
                                ~~~~

features/chat/components/response/ResponseColumn.tsx:77:55 - error TS2339: Property 'displayOrder' does not exist on type 'unknown'.

77         ...assistantMessages.map((message) => message.displayOrder),
                                                         ~~~~~~~~~~~~

features/chat/components/response/ResponseColumn.tsx:189:26 - error TS2339: Property 'id' does not exist on type 'unknown'.

189             key={message.id}
                             ~~

features/chat/components/response/ResponseColumn.tsx:191:13 - error TS2740: Type '{}' is missing the following properties from type 'localMessage': id, conversationId, role, content, and 3 more.

191             message={message}
                ~~~~~~~

  features/chat/components/response/MessageItem.tsx:36:5
    36     message: localMessage;
           ~~~~~~~
    The expected type comes from property 'message' which is declared here on type 'IntrinsicAttributes & { taskId: string; message: localMessage; onScrollToBottom: () => void; isOverlay?: boolean; }'

features/chat/components/response/ResponseColumn.tsx:203:13 - error TS2322: Type 'unknown[]' is not assignable to type 'SocketErrorObject[]'.
  Type 'unknown' is not assignable to type 'SocketErrorObject'.
    Index signature for type 'string' is missing in type '{}'.

203             streamError={streamError}
                ~~~~~~~~~~~

  features/chat/components/response/DebugInfo.tsx:15:3
    15   streamError: SocketErrorObject[] | null;
         ~~~~~~~~~~~
    The expected type comes from property 'streamError' which is declared here on type 'IntrinsicAttributes & { activeMessageStatus: string; shouldShowLoader: boolean; isStreaming: string | boolean; isStreamEnded: string | boolean; isStreamError: string | boolean; streamError: SocketErrorObject[]; streamKey: string; taskId: string; settings: unknown; }'

features/chat/components/response/ResponseColumn.tsx:219:30 - error TS2339: Property 'user_message' does not exist on type 'unknown'.

219               streamError[0].user_message || streamError[0].user_visible_message
                                 ~~~~~~~~~~~~

features/chat/components/response/ResponseColumn.tsx:219:61 - error TS2339: Property 'user_visible_message' does not exist on type 'unknown'.

219               streamError[0].user_message || streamError[0].user_visible_message
                                                                ~~~~~~~~~~~~~~~~~~~~

features/chat/hooks/useConversationPanel.ts:64:33 - error TS2339: Property 'label' does not exist on type 'unknown'.

64                 { get: (c) => c.label, weight: "title" },
                                   ~~~~~

features/chat/hooks/useConversationPanel.ts:71:33 - error TS2339: Property 'label' does not exist on type 'unknown'.

71                 { get: (c) => c.label, weight: "title" },
                                   ~~~~~

features/chat/hooks/useConversationPanel.ts:72:33 - error TS2339: Property 'description' does not exist on type 'unknown'.

72                 { get: (c) => c.description, weight: "body" },
                                   ~~~~~~~~~~~

features/chat/hooks/useConversationPanel.ts:75:41 - error TS2339: Property 'keywords' does not exist on type 'unknown'.

75                         Array.isArray(c.keywords) ? c.keywords : undefined,
                                           ~~~~~~~~

features/chat/hooks/useConversationPanel.ts:75:55 - error TS2339: Property 'keywords' does not exist on type 'unknown'.

75                         Array.isArray(c.keywords) ? c.keywords : undefined,
                                                         ~~~~~~~~

features/chat/hooks/useConversationPanel.ts:101:20 - error TS2339: Property 'updatedAt' does not exist on type 'unknown'.

101         if (!convo.updatedAt) return acc;
                       ~~~~~~~~~

features/chat/hooks/useConversationPanel.ts:104:37 - error TS2339: Property 'updatedAt' does not exist on type 'unknown'.

104         const date = new Date(convo.updatedAt);
                                        ~~~~~~~~~

features/chat/hooks/useConversationPanel.ts:130:13 - error TS2698: Spread types may only be created from object types.

130             ...convo,
                ~~~~~~~~

features/chat/hooks/useConversationPanel.ts:132:23 - error TS2339: Property 'keywords' does not exist on type 'unknown'.

132                 convo.keywords && typeof convo.keywords === "object" && !Array.isArray(convo.keywords)
                          ~~~~~~~~

features/chat/hooks/useConversationPanel.ts:132:48 - error TS2339: Property 'keywords' does not exist on type 'unknown'.

132                 convo.keywords && typeof convo.keywords === "object" && !Array.isArray(convo.keywords)
                                                   ~~~~~~~~

features/chat/hooks/useConversationPanel.ts:132:94 - error TS2339: Property 'keywords' does not exist on type 'unknown'.

132                 convo.keywords && typeof convo.keywords === "object" && !Array.isArray(convo.keywords)
                                                                                                 ~~~~~~~~

features/chat/hooks/useConversationPanel.ts:133:41 - error TS2339: Property 'keywords' does not exist on type 'unknown'.

133                     ? Object.keys(convo.keywords)
                                            ~~~~~~~~

features/chat/hooks/useConversationPanel.ts:134:43 - error TS2339: Property 'keywords' does not exist on type 'unknown'.

134                     : Array.isArray(convo.keywords)
                                              ~~~~~~~~

features/chat/hooks/useConversationPanel.ts:135:29 - error TS2339: Property 'keywords' does not exist on type 'unknown'.

135                     ? convo.keywords
                                ~~~~~~~~

features/chat/hooks/useConversationPanel.ts:258:79 - error TS2554: Expected 0-1 arguments, but got 2.

258             await dispatch(chatActions.fetchAdditionalConversations(nextPage, pageSize));
                                                                                  ~~~~~~~~

features/chat/hooks/useExistingChat.ts:8:34 - error TS2307: Cannot find module '@/lib/redux/features/aiChats/thunks/entity/createMessageThunk' or its corresponding type declarations.

8 import { saveMessageThunk } from "@/lib/redux/features/aiChats/thunks/entity/createMessageThunk";
                                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/chat/hooks/useExistingChat.ts:9:58 - error TS2307: Cannot find module '@/lib/redux/stream-tasks/thunks/submitChatFastAPI' or its corresponding type declarations.

9 import { submitChatFastAPI as createAndSubmitTask } from "@/lib/redux/stream-tasks/thunks/submitChatFastAPI";
                                                           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/chat/hooks/useInputControls.ts:122:30 - error TS2339: Property 'availableTools' does not exist on type '{}'.

122         if (messageMetadata?.availableTools?.length > 0) {
                                 ~~~~~~~~~~~~~~

features/chat/hooks/useInputControls.ts:127:44 - error TS2339: Property 'availableTools' does not exist on type '{}'.

127     }, [isToolsSheetOpen, messageMetadata?.availableTools]);
                                               ~~~~~~~~~~~~~~

features/chat/hooks/useInputControls.ts:132:46 - error TS2339: Property 'files' does not exist on type '{}'.

132         setHasUploadedFiles(messageMetadata?.files?.length > 0);
                                                 ~~~~~

features/chat/hooks/useInputControls.ts:133:26 - error TS2339: Property 'files' does not exist on type '{}'.

133     }, [messageMetadata?.files, messageKey]);
                             ~~~~~

features/chat/hooks/useInputControls.ts:218:38 - error TS2339: Property 'currentModel' does not exist on type '{}'.

218     const modelId = messageMetadata?.currentModel || conversationMetadata?.currentModel || "";
                                         ~~~~~~~~~~~~

features/chat/hooks/useInputControls.ts:218:76 - error TS2339: Property 'currentModel' does not exist on type '{}'.

218     const modelId = messageMetadata?.currentModel || conversationMetadata?.currentModel || "";
                                                                               ~~~~~~~~~~~~

features/chat/hooks/useNewChat.ts:7:28 - error TS2307: Cannot find module '@/lib/redux/stream-tasks/thunks/createTaskThunk' or its corresponding type declarations.

7 import { createTask } from "@/lib/redux/stream-tasks/thunks/createTaskThunk";
                             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/chat/hooks/useNewChat.ts:78:34 - error TS2339: Property 'success' does not exist on type '{}'.

78             if (result && result.success) {
                                    ~~~~~~~

features/chat/hooks/useNewChat.ts:79:45 - error TS2339: Property 'conversationData' does not exist on type '{}'.

79                 const conversation = result.conversationData.data;
                                               ~~~~~~~~~~~~~~~~

features/chat/hooks/useNewChat.ts:81:40 - error TS2339: Property 'messageData' does not exist on type '{}'.

81                 const message = result.messageData.data;
                                          ~~~~~~~~~~~

features/code-editor/components/ContextAwareCodeEditorCompact.tsx:166:9 - error TS2322: Type '{ language: string; context?: string; selection?: string; dynamic_context: string; current_code: string; content: string; }' is not assignable to type 'ApplicationScope'.
  Types of property 'context' are incompatible.
    Type 'string' is not assignable to type 'Record<string, unknown>'.

166         applicationScope: {
            ~~~~~~~~~~~~~~~~

  features/agents/hooks/useShortcutTrigger.ts:66:9
    66   > & { applicationScope?: ApplicationScope };
               ~~~~~~~~~~~~~~~~
    The expected type comes from property 'applicationScope' which is declared here on type 'Omit<AgentExecutionRuntime, "applicationScope"> & { applicationScope?: ApplicationScope; }'

features/code-editor/components/ContextAwareCodeEditorModal.tsx:177:9 - error TS2322: Type '{ language: string; context?: string; selection?: string; dynamic_context: string; current_code: string; content: string; }' is not assignable to type 'ApplicationScope'.
  Types of property 'context' are incompatible.
    Type 'string' is not assignable to type 'Record<string, unknown>'.

177         applicationScope: {
            ~~~~~~~~~~~~~~~~

  features/agents/hooks/useShortcutTrigger.ts:66:9
    66   > & { applicationScope?: ApplicationScope };
               ~~~~~~~~~~~~~~~~
    The expected type comes from property 'applicationScope' which is declared here on type 'Omit<AgentExecutionRuntime, "applicationScope"> & { applicationScope?: ApplicationScope; }'

features/code-editor/hooks/useAICodeEditor.ts:157:17 - error TS2352: Conversion of type 'undefined[]' to type '(state: { layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }) => MessageRecord[]' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type 'undefined[]' provides no match for the signature '(state: { layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; ... 127 more ...; theme: ThemeState; }): MessageRecord[]'.

157         : () => [] as ReturnType<typeof selectConversationMessages>,
                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/code-editor/hooks/useAICodeEditor.ts:160:35 - error TS2345: Argument of type '((state: { layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }) => MessageRecord[]) | (() => ReturnType<typeof selectConversationMessages>)' is not assignable to parameter of type '(state: { layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }) => MessageRecord[]'.
  Type '() => ReturnType<typeof selectConversationMessages>' is not assignable to type '(state: { layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }) => MessageRecord[]'.
    Type '(state: { layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }) => MessageRecord[]' is not assignable to type 'MessageRecord[]'.

160   const messages = useAppSelector(messagesSelector);
                                      ~~~~~~~~~~~~~~~~

features/code-editor/hooks/useAICodeEditor.ts:228:9 - error TS2322: Type '{ language: string; context?: string; selection?: string; current_code: string; content: string; }' is not assignable to type 'ApplicationScope'.
  Types of property 'context' are incompatible.
    Type 'string' is not assignable to type 'Record<string, unknown>'.

228         applicationScope: {
            ~~~~~~~~~~~~~~~~

  features/agents/hooks/useShortcutTrigger.ts:66:9
    66   > & { applicationScope?: ApplicationScope };
               ~~~~~~~~~~~~~~~~
    The expected type comes from property 'applicationScope' which is declared here on type 'Omit<AgentExecutionRuntime, "applicationScope"> & { applicationScope?: ApplicationScope; }'

features/cx-chat/components/messages/MessageOptionsMenu.tsx:40:33 - error TS2345: Argument of type '{ layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }' is not assignable to parameter of type 'StateWithMessageActions'.
  Property 'messageActions' is missing in type '{ layout: LayoutState; flashcardChat: FlashcardChatState; ui: UIState; componentDefinitions: ComponentDefinitionsState; appBuilder: AppsState; appletBuilder: AppletsState; containerBuilder: ContainersState; fieldBuilder: FieldsState; customAppRuntime: CustomAppRuntimeState; customAppletRuntime: CustomAppletRuntimeState; contextMenuCache: ContextMenuCacheState; agentContextMenuCache: AgentContextMenuCacheState; agentCache: AgentCacheState; messaging: MessagingState; adminPreferences: AdminPreferencesState; agentSettings: AgentSettingsState; modelRegistry: ModelRegistryState; apiConfig: ApiConfigState; agentDefinition: AgentDefinitionSliceState; conversationList: ConversationListState; conversationHistory: ConversationHistoryState; agentShortcut: AgentShortcutSliceState; agentShortcutCategory: AgentShortcutCategorySliceState; agentUsages: AgentUsagesState; agentContentBlock: AgentContentBlockSliceState; skl: SklSliceState; skills: SkillsState; dictionary: DictionaryState; surfaceUserState: SurfaceUserStateSlice; agentConnectionsUi: AgentConnectionsUiState; agentApp: AgentAppSliceState; agentAppConsumers: AgentAppConsumersState; agentConsumers: AgentConsumersState; tools: ToolsSliceState; appContext: AppContextState; scopesTree: ScopesState; contextValues: ContextValuesState; scopeTemplates: TemplatesState; hierarchy: HierarchyState; organizations: EntityState<OrgRecord, string> & OrgsExtraState; projects: EntityState<ProjectRecord, string> & ProjectsExtraState; tasks: EntityState<TaskRecord, string> & TasksExtraState; scopeTypes: EntityState<ScopeType, string> & ScopeTypesExtraState; scopes: EntityState<Scope, string> & ScopesExtraState; scopeAssignments: EntityState<ScopeAssignment, string> & ScopeAssignmentsExtraState; contextItems: EntityState<ContextItem, string> & ExtraState; scopeValues: ScopeValuesState; templates: State; tasksUi: TaskUiState; quickTasksWindow: QuickTasksWindowState; taskAssociations: TaskAssociationsState; conversations: ConversationsState; chatIncognito: ChatIncognitoState; instanceModelOverrides: InstanceModelOverridesState; instanceVariableValues: InstanceVariableValuesState; instanceResources: InstanceResourcesState; instanceContext: InstanceContextState; instanceWorkingDocument: InstanceWorkingDocumentSliceState; instanceUserInput: InstanceUserInputSliceState; instanceClientTools: InstanceClientToolsState; pendingAsks: PendingAsksState; proposedDirectives: ProposedDirectivesState; agentLists: AgentListsState; instanceUIState: InstanceUIStateSlice; editorState: EditorStateSliceState; activeTools: ActiveToolsState; activeRequests: ActiveRequestsState; netRequests: NetRequestsState; netHealth: NetHealthState; messages: MessagesState; observability: ObservabilityState; contextState: ContextStateSliceState; observationalMemory: ObservationalMemoryState; cacheBypass: CacheBypassState; conversationFocus: ConversationFocusState; surfaces: SurfacesState; surfacesCatalog: SurfacesCatalogSliceState; agentSurfaceBindings: AgentSurfaceBindingsSliceState; surfaceConfig: SurfaceConfigSliceState; agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState; mcp: McpSliceState; schedulingTasks: SchedulingTasksState; schedulingRuns: SchedulingRunsState; pageExtraction: PageExtractionState; pdfStudio: PdfStudioState; kgSuggestions: KgSuggestionsState; agentComparison: BattleState; agentComparisonSettings: SettingsBattleState; agentComparisonSystemPrompt: SystemPromptBattleState; agentComparisonTools: ToolsBattleState; agentComparisonRequestMod: RequestModBattleState; agentComparisonModel: ModelBattleState; agentComparisonTuning: TuningBattleState; agentComparisonVariations: VariationsBattleState; markdownSamples: MarkdownSamplesState; userMarkdownSamples: UserMarkdownSamplesState; richDocumentActionSurfaces: ActionSurfacesState; diffCompare: DiffCompareState; userAuth: UserAuthState; userProfile: UserProfileState; userPreferences: UserPreferencesState; adminDebug: AdminDebugState; creatorDebug: CreatorDebugState; overlays: OverlayState; overlayData: OverlayDataState; voicePad: VoicePadState; voiceAgent: VoiceAgentState; windowManager: WindowManagerState; urlSync: UrlSyncState; canvas: CanvasState; artifacts: ArtifactsState; htmlPages: HtmlPagesState; textDiff: DiffState; noteVersions: VersionHistoryState; notes: NotesSliceState & { activeNoteId: string; openTabs: string[]; _savingNoteIds: string[]; }; transcriptStudio: TranscriptStudioState; warRoom: WarRoomState; warRoomWatch: WarRoomWatchState; recordings: RecordingsState; audioPlayback: AudioPlaybackState; codeFiles: CodeFilesSliceState; codeWorkspace: CodeWorkspaceState; codeTabs: CodeTabsState; codeTerminal: CodeTerminalState; terminalSessions: TerminalSessionsState; codeDiagnostics: CodeDiagnosticsState; codePatches: CodePatchesState; codeEditHistory: CodeEditHistoryState; fsChanges: FsChangesState; cloudFiles: CloudFilesState; sms: SmsState; theme: ThemeState; }' but required in type 'StateWithMessageActions'.

40     selectMessageActionInstance(state, instanceId),
                                   ~~~~~

  features/agents/redux/execution-system/message-actions/message-actions.slice.ts:74:34
    74 type StateWithMessageActions = { messageActions: MessageActionsState };
                                        ~~~~~~~~~~~~~~
    'messageActions' is declared here.

features/kg-suggestions/service/kgSuggestionAckService.ts:21:13 - error TS2345: Argument of type '"reg"' is not assignable to parameter of type '"code" | "public" | "platform" | "agent" | "files" | "workflow" | "admin" | "tool" | "legal" | "users" | "graveyard" | "canvas" | "communication" | "ai" | "iam" | "ui" | "transcripts" | "app" | "chat" | "context" | "docproc" | "education" | "extend" | "pdf" | "podcast" | "rag" | "research" | "scheduler" | "scraper" | "skill" | "workbench" | "workspace"'.

21     .schema("reg").from("kg_suggestion_ack")
               ~~~~~

features/kg-suggestions/service/kgSuggestionAckService.ts:21:25 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"kg_suggestion_ack"' is not assignable to parameter of type 'never'.
  Overload 2 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"kg_suggestion_ack"' is not assignable to parameter of type 'never'.

21     .schema("reg").from("kg_suggestion_ack")
                           ~~~~~~~~~~~~~~~~~~~


features/kg-suggestions/service/kgSuggestionAckService.ts:25:44 - error TS2339: Property 'suggestion_id' does not exist on type 'never'.

25   return new Set((data ?? []).map((r) => r.suggestion_id));
                                              ~~~~~~~~~~~~~

features/kg-suggestions/service/kgSuggestionAckService.ts:40:13 - error TS2345: Argument of type '"reg"' is not assignable to parameter of type '"code" | "public" | "platform" | "agent" | "files" | "workflow" | "admin" | "tool" | "legal" | "users" | "graveyard" | "canvas" | "communication" | "ai" | "iam" | "ui" | "transcripts" | "app" | "chat" | "context" | "docproc" | "education" | "extend" | "pdf" | "podcast" | "rag" | "research" | "scheduler" | "scraper" | "skill" | "workbench" | "workspace"'.

40     .schema("reg").from("kg_suggestion_ack")
               ~~~~~

features/kg-suggestions/service/kgSuggestionAckService.ts:40:25 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"kg_suggestion_ack"' is not assignable to parameter of type 'never'.
  Overload 2 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"kg_suggestion_ack"' is not assignable to parameter of type 'never'.

40     .schema("reg").from("kg_suggestion_ack")
                           ~~~~~~~~~~~~~~~~~~~


features/kg-suggestions/service/kgSuggestionAckService.ts:41:13 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(values: never, options?: { onConflict?: string; ignoreDuplicates?: boolean; count?: "exact" | "planned" | "estimated"; }): PostgrestFilterBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { ...; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, ... 4 more ..., "POST">', gave the following error.
    Argument of type '{ user_id: string; suggestion_id: string; }[]' is not assignable to parameter of type 'never'.
  Overload 2 of 2, '(values: never[], options?: { onConflict?: string; ignoreDuplicates?: boolean; count?: "exact" | "planned" | "estimated"; defaultToNull?: boolean; }): PostgrestFilterBuilder<{ PostgrestVersion: "14.5"; }, { ...; } | ... 30 more ... | { ...; }, ... 4 more ..., "POST">', gave the following error.
    Argument of type '{ user_id: string; suggestion_id: string; }[]' is not assignable to parameter of type 'never[]'.
      Type '{ user_id: string; suggestion_id: string; }' is not assignable to type 'never'.

41     .upsert(rows, {
               ~~~~


features/kg-suggestions/service/kgSuggestionsService.ts:149:15 - error TS2345: Argument of type '"reg"' is not assignable to parameter of type '"code" | "public" | "platform" | "agent" | "files" | "workflow" | "admin" | "tool" | "legal" | "users" | "graveyard" | "canvas" | "communication" | "ai" | "iam" | "ui" | "transcripts" | "app" | "chat" | "context" | "docproc" | "education" | "extend" | "pdf" | "podcast" | "rag" | "research" | "scheduler" | "scraper" | "skill" | "workbench" | "workspace"'.

149       .schema("reg").from("scope_item_value_suggestions")
                  ~~~~~

features/kg-suggestions/service/kgSuggestionsService.ts:149:27 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"scope_item_value_suggestions"' is not assignable to parameter of type 'never'.
  Overload 2 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"scope_item_value_suggestions"' is not assignable to parameter of type 'never'.

149       .schema("reg").from("scope_item_value_suggestions")
                              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


features/kg-suggestions/service/kgSuggestionsService.ts:166:13 - error TS2345: Argument of type '"reg"' is not assignable to parameter of type '"code" | "public" | "platform" | "agent" | "files" | "workflow" | "admin" | "tool" | "legal" | "users" | "graveyard" | "canvas" | "communication" | "ai" | "iam" | "ui" | "transcripts" | "app" | "chat" | "context" | "docproc" | "education" | "extend" | "pdf" | "podcast" | "rag" | "research" | "scheduler" | "scraper" | "skill" | "workbench" | "workspace"'.

166     .schema("reg").from("scope_association_suggestions")
                ~~~~~

features/kg-suggestions/service/kgSuggestionsService.ts:166:25 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"scope_association_suggestions"' is not assignable to parameter of type 'never'.
  Overload 2 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"scope_association_suggestions"' is not assignable to parameter of type 'never'.

166     .schema("reg").from("scope_association_suggestions")
                            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


features/kg-suggestions/service/kgSuggestionsService.ts:170:13 - error TS2345: Argument of type '"reg"' is not assignable to parameter of type '"code" | "public" | "platform" | "agent" | "files" | "workflow" | "admin" | "tool" | "legal" | "users" | "graveyard" | "canvas" | "communication" | "ai" | "iam" | "ui" | "transcripts" | "app" | "chat" | "context" | "docproc" | "education" | "extend" | "pdf" | "podcast" | "rag" | "research" | "scheduler" | "scraper" | "skill" | "workbench" | "workspace"'.

170     .schema("reg").from("scope_item_value_suggestions")
                ~~~~~

features/kg-suggestions/service/kgSuggestionsService.ts:170:25 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"scope_item_value_suggestions"' is not assignable to parameter of type 'never'.
  Overload 2 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"scope_item_value_suggestions"' is not assignable to parameter of type 'never'.

170     .schema("reg").from("scope_item_value_suggestions")
                            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


features/kg-suggestions/service/kgSuggestionsService.ts:331:17 - error TS2345: Argument of type '"reg"' is not assignable to parameter of type '"code" | "public" | "platform" | "agent" | "files" | "workflow" | "admin" | "tool" | "legal" | "users" | "graveyard" | "canvas" | "communication" | "ai" | "iam" | "ui" | "transcripts" | "app" | "chat" | "context" | "docproc" | "education" | "extend" | "pdf" | "podcast" | "rag" | "research" | "scheduler" | "scraper" | "skill" | "workbench" | "workspace"'.

331         .schema("reg").from("scope_item_value_suggestions")
                    ~~~~~

features/kg-suggestions/service/kgSuggestionsService.ts:331:29 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"scope_item_value_suggestions"' is not assignable to parameter of type 'never'.
  Overload 2 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"scope_item_value_suggestions"' is not assignable to parameter of type 'never'.

331         .schema("reg").from("scope_item_value_suggestions")
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


features/kg-suggestions/service/kgSuggestionsService.ts:332:17 - error TS2345: Argument of type '{ viewed_at: string; }' is not assignable to parameter of type 'never'.

332         .update({ viewed_at: now })
                    ~~~~~~~~~~~~~~~~~~

features/kg-suggestions/service/kgSuggestionsService.ts:341:17 - error TS2345: Argument of type '"reg"' is not assignable to parameter of type '"code" | "public" | "platform" | "agent" | "files" | "workflow" | "admin" | "tool" | "legal" | "users" | "graveyard" | "canvas" | "communication" | "ai" | "iam" | "ui" | "transcripts" | "app" | "chat" | "context" | "docproc" | "education" | "extend" | "pdf" | "podcast" | "rag" | "research" | "scheduler" | "scraper" | "skill" | "workbench" | "workspace"'.

341         .schema("reg").from("scope_association_suggestions")
                    ~~~~~

features/kg-suggestions/service/kgSuggestionsService.ts:341:29 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"scope_association_suggestions"' is not assignable to parameter of type 'never'.
  Overload 2 of 2, '(relation: never): PostgrestQueryBuilder<{ PostgrestVersion: "14.5"; }, { Tables: { _schema_migrations: { Row: { applied_at: string; checksum: string; duration_ms: number; filename: string; source: string; }; Insert: { ...; }; Update: { ...; }; Relationships: []; }; ... 43 more ...; window_sessions: { ...; }; }; Views: { ...; }; Functions: { ...; }; Enums: { ...; }; CompositeTypes: { ...; }; } | ... 30 more ... | { ...; }, never, never, never>', gave the following error.
    Argument of type '"scope_association_suggestions"' is not assignable to parameter of type 'never'.

341         .schema("reg").from("scope_association_suggestions")
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


features/kg-suggestions/service/kgSuggestionsService.ts:342:17 - error TS2345: Argument of type '{ viewed_at: string; }' is not assignable to parameter of type 'never'.

342         .update({ viewed_at: now })
                    ~~~~~~~~~~~~~~~~~~

features/public-chat/components/ChatContainer.tsx:133:11 - error TS2322: Type 'unknown' is not assignable to type 'string'.

133           initialValues[variable.name] = variable.defaultValue;
              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/public-chat/components/GuidedVariableInputs.tsx:575:16 - error TS2339: Property 'trim' does not exist on type 'unknown'.

575     return val.trim() !== "";
                   ~~~~

features/public-chat/components/GuidedVariableInputs.tsx:643:65 - error TS2339: Property 'trim' does not exist on type 'unknown'.

643         const filled = (values[v.name] ?? v.defaultValue ?? "").trim() !== "";
                                                                    ~~~~

features/public-chat/components/GuidedVariableInputs.tsx:744:13 - error TS2322: Type 'unknown' is not assignable to type 'string'.

744             value={value}
                ~~~~~

  features/public-chat/components/GuidedVariableInputs.tsx:451:3
    451   value: string;
          ~~~~~
    The expected type comes from property 'value' which is declared here on type 'IntrinsicAttributes & { variable: VariableDefinition; value: string; onChange: (v: string) => void; onAutoAdvance: () => void; }'

features/public-chat/components/PublicVariableInputs.tsx:139:34 - error TS2339: Property 'replace' does not exist on type 'unknown'.

139                           {value.replace(/\n/g, " ↵ ")}
                                     ~~~~~~~

features/public-chat/components/PublicVariableInputs.tsx:180:27 - error TS2339: Property 'includes' does not exist on type 'unknown'.

180                     value.includes("\n") ? value.replace(/\n/g, " ↵ ") : value
                              ~~~~~~~~

features/public-chat/components/PublicVariableInputs.tsx:180:50 - error TS2339: Property 'replace' does not exist on type 'unknown'.

180                     value.includes("\n") ? value.replace(/\n/g, " ↵ ") : value
                                                     ~~~~~~~

features/recipes/components/RecipeCard.tsx:8:39 - error TS2307: Cannot find module '@/components/playground/recipes/RecipeVersionSelector' or its corresponding type declarations.

8 import { RecipeVersionSelector } from "@/components/playground/recipes/RecipeVersionSelector";
                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/recipes/components/RecipeCardUnified.tsx:7:39 - error TS2307: Cannot find module '@/components/playground/recipes/RecipeVersionSelector' or its corresponding type declarations.

7 import { RecipeVersionSelector } from "@/components/playground/recipes/RecipeVersionSelector";
                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

features/skills/redux/skillsThunks.ts:183:33 - error TS2589: Type instantiation is excessively deep and possibly infinite.

183   const { data, error } = await supabase
                                    ~~~~~~~~
184     .schema("platform")
    ~~~~~~~~~~~~~~~~~~~~~~~
... 
187       "id, category_key:slug, label:name, description:metadata->>description, icon_name:icon, color, parent_category_id:parent_id, sort_order:position, is_active:metadata->>is_active, user_id:metadata->>user_id, metadata",
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
188     )
    ~~~~~

hooks/ai/chat/unused/useConversationCreateUpdate.ts:1:36 - error TS2307: Cannot find module '@/app/entities/hooks/crud/useCreateUpdateRecord' or its corresponding type declarations.

1 import useCreateUpdateRecord  from "@/app/entities/hooks/crud/useCreateUpdateRecord";
                                     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/ai/chat/unused/useConversationCreateUpdate.ts:2:32 - error TS2307: Cannot find module '@/lib/redux/entity/utils/stateHelpUtils' or its corresponding type declarations.

2 import { getPermanentId } from "@/lib/redux/entity/utils/stateHelpUtils";
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/ai/chat/unused/useCreateMessage.ts:2:32 - error TS2307: Cannot find module '@/lib/redux/entity/hooks/coreHooks' or its corresponding type declarations.

2 import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/ai/chat/unused/useMessageCreateUpdate.ts:2:35 - error TS2307: Cannot find module '@/app/entities/hooks/crud/useCreateUpdateRecord' or its corresponding type declarations.

2 import useCreateUpdateRecord from "@/app/entities/hooks/crud/useCreateUpdateRecord";
                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/ai/chat/unused/useMessageCreateUpdate.ts:3:32 - error TS2307: Cannot find module '@/lib/redux/entity/utils/stateHelpUtils' or its corresponding type declarations.

3 import { getPermanentId } from "@/lib/redux/entity/utils/stateHelpUtils";
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/ai/chat/unused/useMessageCreateUpdate.ts:4:32 - error TS2307: Cannot find module '@/lib/redux/entity/hooks/coreHooks' or its corresponding type declarations.

4 import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/ai/chat/useChatBasics.ts:1:37 - error TS2307: Cannot find module '@/lib/redux/entity/hooks/useAllData' or its corresponding type declarations.

1 import { useAiModelWithFetch } from "@/lib/redux/entity/hooks/useAllData";
                                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/ai/chat/useChatBasics.ts:4:3 - error TS2305: Module '"@/lib/redux/entity/custom-actions/chatActions"' has no exported member 'getChatActions'.

4   getChatActions,
    ~~~~~~~~~~~~~~

hooks/ai/chat/useChatBasics.ts:10:8 - error TS2307: Cannot find module '@/lib/redux/entity/selectors' or its corresponding type declarations.

10 } from "@/lib/redux/entity/selectors";
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/ai/chat/useChatBasics.ts:15:8 - error TS2307: Cannot find module '@/types/AutomationSchemaTypes' or its corresponding type declarations.

15 } from "@/types/AutomationSchemaTypes";
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/ai/chat/useChatBasics.ts:18:47 - error TS2307: Cannot find module '@/lib/redux/entity/slices/entityUpdateActionFactories' or its corresponding type declarations.

18 import { entityUpdateActionsWithThunks } from "@/lib/redux/entity/slices/entityUpdateActionFactories";
                                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/applets/useBrokersAssociations.ts:1:100 - error TS2307: Cannot find module '@/lib/redux/entity/hooks/useAllData' or its corresponding type declarations.

1 import { useDataBrokersWithFetch, useBrokerValuesWithFetch, useDataInputComponentsWithFetch } from "@/lib/redux/entity/hooks/useAllData";
                                                                                                     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/applets/useValueBroker.ts:6:32 - error TS2307: Cannot find module '@/lib/redux/entity/hooks/coreHooks' or its corresponding type declarations.

6 import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/applets/useValueBroker.ts:7:41 - error TS2307: Cannot find module '@/types/AutomationSchemaTypes' or its corresponding type declarations.

7 import { DataBrokerRecordWithKey } from "@/types/AutomationSchemaTypes";
                                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/applets/useValueBroker.ts:10:37 - error TS2307: Cannot find module '@/app/entities/hooks/records/useGetOrFetch' or its corresponding type declarations.

10 import { useGetOrFetchRecord } from "@/app/entities/hooks/records/useGetOrFetch";
                                       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/applets/useValueBrokers.ts:8:79 - error TS2307: Cannot find module '@/lib/redux/entity/hooks/useAllData' or its corresponding type declarations.

8 import { UseDataBrokersWithFetchReturn, UseBrokerValuesWithFetchReturn } from "@/lib/redux/entity/hooks/useAllData";
                                                                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/applets/useValueBrokerValue.ts:5:32 - error TS2307: Cannot find module '@/lib/redux/entity/hooks/coreHooks' or its corresponding type declarations.

5 import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/run-recipe/types.ts:12:8 - error TS2307: Cannot find module '@/types/AutomationSchemaTypes' or its corresponding type declarations.

12 } from "@/types/AutomationSchemaTypes";
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/run-recipe/useCompiledRecipe.ts:4:38 - error TS2307: Cannot find module '@/lib/redux/entity/types/stateTypes' or its corresponding type declarations.

4 import { QuickReferenceRecord } from "@/lib/redux/entity/types/stateTypes";
                                       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/run-recipe/useCompiledRecipe.ts:14:8 - error TS2307: Cannot find module '@/types/AutomationSchemaTypes' or its corresponding type declarations.

14 } from "@/types/AutomationSchemaTypes";
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/run-recipe/useCompiledRecipe.ts:15:38 - error TS2307: Cannot find module '@/app/entities/hooks/records/useGetOrFetch' or its corresponding type declarations.

15 import { useGetorFetchRecords } from "@/app/entities/hooks/records/useGetOrFetch";
                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/run-recipe/useCompiledRecipe.ts:16:39 - error TS2307: Cannot find module '@/lib/redux/entity/selectors' or its corresponding type declarations.

16 import { createEntitySelectors } from "@/lib/redux/entity/selectors";
                                         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/run-recipe/usePrepareRecipeToRun.ts:4:59 - error TS2307: Cannot find module '@/app/entities/hooks/records/useGetOrFetch' or its corresponding type declarations.

4 import { useGetorFetchRecords, useGetOrFetchRecord } from "@/app/entities/hooks/records/useGetOrFetch";
                                                            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/run-recipe/usePrepareRecipeToRun.ts:5:39 - error TS2307: Cannot find module '@/lib/redux/entity/selectors' or its corresponding type declarations.

5 import { createEntitySelectors } from "@/lib/redux/entity/selectors";
                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/run-recipe/usePrepareRecipeToRun.ts:9:91 - error TS2307: Cannot find module '@/types/AutomationSchemaTypes' or its corresponding type declarations.

9 import { DataInputComponentRecordWithKey, RecipeRecordWithKey, AppletRecordWithKey } from "@/types/AutomationSchemaTypes";
                                                                                            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/run-recipe/useRunRecipeVersionSelection.ts:3:39 - error TS2307: Cannot find module '@/lib/redux/entity/selectors' or its corresponding type declarations.

3 import { createEntitySelectors } from "@/lib/redux/entity/selectors";
                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/run-recipe/useRunRecipeVersionSelection.ts:5:38 - error TS2307: Cannot find module '@/lib/redux/entity/types/stateTypes' or its corresponding type declarations.

5 import { QuickReferenceRecord } from '@/lib/redux/entity/types/stateTypes';
                                       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

hooks/run-recipe/useRunRecipeVersionSelection.ts:7:66 - error TS2307: Cannot find module '@/types/AutomationSchemaTypes' or its corresponding type declarations.

7 import { RecipeRecordWithKey, CompiledRecipeRecordWithKey } from '@/types/AutomationSchemaTypes';
                                                                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

lib/redux/app-builder/utils/auto-applet-creator.ts:5:61 - error TS2307: Cannot find module '@/features/workflows/service/recipe-service' or its corresponding type declarations.

5 import { getCompiledRecipeByVersionWithNeededBrokers } from "@/features/workflows/service/recipe-service";
                                                              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

lib/redux/entity/custom-actions/chatActions.ts:13:35 - error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'undefined'.

13     const action = legacyResolved(...args);
                                     ~~~~~~~

types/editor.types.ts:2:60 - error TS2307: Cannot find module '@/types/AutomationSchemaTypes' or its corresponding type declarations.

2 import { BrokerDataOptional, DataBrokerDataOptional } from '@/types/AutomationSchemaTypes';
                                                             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

utils/dataSchemaNormalizer.ts:1:32 - error TS2307: Cannot find module '@/types/AutomationSchemaTypes' or its corresponding type declarations.

1 import { AiSettingsData } from "@/types/AutomationSchemaTypes";
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

utils/schema/lite.ts:18:12 - error TS2352: Conversion of type 'T & Record<"id", unknown>' to type 'T extends DataWithOptionalId[] ? DataWithId[] : DataWithId' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.

18     return input as T extends DataWithOptionalId[] ? DataWithId[] : DataWithId;
              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

utils/schema/lite.ts:21:10 - error TS2352: Conversion of type 'T & { id: string; }' to type 'T extends DataWithOptionalId[] ? DataWithId[] : DataWithId' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.

21   return { ...input, id: uuidv4() } as T extends DataWithOptionalId[]
            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
22     ? DataWithId[]
   ~~~~~~~~~~~~~~~~~~
23     : DataWithId;
   ~~~~~~~~~~~~~~~~


Found 531 errors in 145 files.

Errors  Files
     1  app/(dev)/demos/tests/applet-tests/AppletTestsLayoutClient.tsx:4
     1  app/(dev)/demos/tests/matrx-table/components/StandardTabUtil.ts:3
     3  app/(dev)/demos/tests/slack/with-brokers/components/BrokerForm.tsx:68
     4  app/(dev)/demos/tests/slack/with-brokers/components/BrokerSlackClient.tsx:48
     3  app/(dev)/demos/tests/slack/with-brokers/components/ChannelSelector.tsx:36
     4  app/(dev)/demos/tests/slack/with-brokers/components/SlackAuthentication.tsx:54
     1  app/(dev)/demos/tests/slack/with-brokers/components/TokenManager.tsx:34
     3  app/(dev)/demos/tests/windows/page.dev.tsx:6
     1  app/(dev)/demos/tests/workflow-source-config/page.dev.tsx:3
     1  app/(transitional)/applets/page.tsx:6
     2  app/(transitional)/apps/custom/[slug]/CustomAppSlugLayoutClient.tsx:118
     2  app/(transitional)/apps/page.tsx:147
     2  app/(transitional)/flash-cards/components/FlashcardComponent.tsx:46
     2  app/(transitional)/flash-cards/components/FlashcardComponentMobile.tsx:54
     1  app/(transitional)/registered-results/events-viewer/page.tsx:7
     1  app/(transitional)/registered-results/sitemap-viewer/page.tsx:7
     1  app/api/admin/feedback/categories/route.ts:36
    21  app/api/agent-shortcut-categories/[id]/duplicate/route.ts:99
     2  app/api/agent-shortcut-categories/[id]/route.ts:81
     2  app/api/agent-shortcut-categories/route.ts:122
     1  app/api/organizations/invitations/resend/route.ts:120
     1  app/api/organizations/invite/route.ts:143
     1  app/api/schema/route.ts:7
     1  components/admin/ClientDebugWrapper.tsx:12
     4  components/admin/GeneratePromptForSystemModal.tsx:81
     9  components/admin/state-analyzer/stateViewerTabs.tsx:634
     1  components/applet/AppletGrid.tsx:7
     1  components/applet/applets/layouts/ConversationalLayout.tsx:7
     1  components/applet/applets/layouts/DashboardLayout.tsx:2
     1  components/applet/applets/layouts/GridLayout.tsx:1
     1  components/applet/applets/layouts/ListLayout.tsx:1
     2  components/applet/applets/layouts/ToolsLayout.tsx:5
     1  components/applet/CategorySection.tsx:5
     1  components/debug/schema-metrics.tsx:11
     2  components/flashcard-app/components/FlashcardComponentDesktop.tsx:51
     2  components/flashcard-app/components/FlashcardComponentMobile.tsx:53
     1  components/mardown-display/chat-markdown/tui/tui-utils.ts:2
     3  components/mardown-display/enhanced-rederer-older/EnhancedMarkdownRenderer.tsx:15
     1  components/matrx/AnimatedForm/separated/components/MatrxBaseInput.tsx:6
     1  components/matrx/AnimatedForm/separated/components/MatrxButton.tsx:7
     1  components/matrx/AnimatedForm/separated/components/MatrxButtonGroup.tsx:5
     1  components/matrx/AnimatedForm/separated/components/MatrxCheckbox.tsx:8
     1  components/matrx/AnimatedForm/separated/components/MatrxInput.tsx:8
     1  components/matrx/AnimatedForm/separated/components/MatrxInputGroup.tsx:7
     1  components/matrx/AnimatedForm/separated/components/MatrxJsonViewer.tsx:19
     1  components/matrx/AnimatedForm/separated/components/MatrxRadio.tsx:8
     1  components/matrx/AnimatedForm/separated/components/MatrxRadioGroup.tsx:7
     1  components/matrx/AnimatedForm/separated/components/MatrxSelect.tsx:9
     1  components/matrx/AnimatedForm/separated/components/MatrxTextarea.tsx:12
     1  components/matrx/AnimatedForm/separated/FlexField.tsx:19
     1  components/matrx/AnimatedForm/separated/FlexForm.tsx:6
     1  components/matrx/AnimatedForm/separated/FlexManager.tsx:7
     1  components/matrx/compact-controls-with-lables.tsx:13
     1  components/matrx/matrx-record-list/basic-auto-table.tsx:5
     1  components/matrx/matrx-record-list/basic-form-components.tsx:5
     1  components/matrx/matrx-record-list/basic-record-edit-list.tsx:5
     1  components/matrx/matrx-record-list/basic-record-list.tsx:5
     1  components/matrx/matrx-record-list/unified-record-list.tsx:5
     1  components/matrx/MatrxColorSelectFloatingLabel.tsx:6
     1  components/matrx/MatrxSelectFloatingLabel.tsx:7
     3  components/ui/broker-display.tsx:6
     1  components/ui/broker-select.tsx:11
     2  components/ui/broker-selector.tsx:11
     1  components/ui/JsonComponents/index.ts:5
     1  components/ui/loaders/MagicButton.tsx:3
     1  components/ui/loaders/Spinner.tsx:4
     1  components/ui/matrx/matrix-switch.tsx:7
     1  components/ui/menu-system/MenuCore.tsx:11
     1  components/ui/react-live-scope.ts:215
     1  config/applets/ai-chat.tsx:2
     1  config/applets/tools.tsx:2
     1  config/ui/entity-layout-config.ts:3
     1  config/ui/FlexConfig.ts:8
   212  features/agent-apps/components/AutoCreateAgentAppForm.tsx:43
     1  features/agent-apps/hooks/useAutoCreateApp.ts:193
     2  features/agents/components/builder/message-builders/system-instructions/FullPromptOptimizer.tsx:99
     2  features/agents/components/inputs/variable-input-variations/AgentVariablesGuided.tsx:141
     1  features/applet/builder/modules/field-builder/previews/FieldPreview.tsx:71
     1  features/applet/builder/modules/field-builder/previews/FieldPreviewAs.tsx:119
     1  features/applet/builder/modules/smart-parts/containers/ContainerFormComponent.tsx:16
     1  features/applet/builder/steps/dev/BackupSourceConfigStep.tsx:30
     1  features/applet/builder/steps/SourceConfigStep.tsx:22
     1  features/applet/contepts/BrokerDebugger.tsx:16
     3  features/applet/hooks/useAppletRecipe.ts:7
     1  features/applet/hooks/useAppletRecipeFastAPI.ts:160
     1  features/applet/runner/fields/AddressBlockField.tsx:94
     5  features/applet/runner/fields/ButtonGroupField.tsx:82
     9  features/applet/runner/fields/CheckboxGroupField.tsx:94
    11  features/applet/runner/fields/concept-broker-options/DragEditModifyTableField.tsx:152
     1  features/applet/runner/fields/concept-broker-options/SearchableSelectField.tsx:181
     1  features/applet/runner/fields/DateField.tsx:57
     2  features/applet/runner/fields/DependentDropdownField.tsx:152
     8  features/applet/runner/fields/DirectMultiSelectField.tsx:92
     1  features/applet/runner/fields/InputField.tsx:55
     5  features/applet/runner/fields/MultiSearchableSelectField.tsx:84
     2  features/applet/runner/fields/RadioGroupField.tsx:86
     2  features/applet/runner/fields/SearchableSelectField.tsx:82
     2  features/applet/runner/fields/SelectField.tsx:69
     2  features/applet/runner/fields/SimpleNumberField.tsx:137
     1  features/applet/runner/fields/SliderField.tsx:89
     1  features/applet/runner/fields/SortableField.tsx:44
     1  features/applet/runner/fields/TextareaField.tsx:49
     4  features/applet/runner/header/CustomAppHeader.tsx:66
     2  features/applet/runner/response/AppletFollowUpInput.tsx:36
     1  features/chat/components/input/AIToolsSheet.tsx:44
     1  features/chat/components/input/BrokerSheet.tsx:37
     1  features/chat/components/input/InputBottomControls.tsx:196
     1  features/chat/components/input/mobile/MobileAudioPlan.tsx:90
     1  features/chat/components/input/mobile/MobileInputBottomControls.tsx:93
     1  features/chat/components/input/RecipeSelectionButton.tsx:7
     1  features/chat/components/response/assistant-message/stream/ChatStreamDisplay.tsx:153
    11  features/chat/components/response/ResponseColumn.tsx:57
    15  features/chat/hooks/useConversationPanel.ts:64
     2  features/chat/hooks/useExistingChat.ts:8
     6  features/chat/hooks/useInputControls.ts:122
     4  features/chat/hooks/useNewChat.ts:7
     1  features/code-editor/components/ContextAwareCodeEditorCompact.tsx:166
     1  features/code-editor/components/ContextAwareCodeEditorModal.tsx:177
     3  features/code-editor/hooks/useAICodeEditor.ts:157
     1  features/cx-chat/components/messages/MessageOptionsMenu.tsx:40
     6  features/kg-suggestions/service/kgSuggestionAckService.ts:21
    12  features/kg-suggestions/service/kgSuggestionsService.ts:149
     1  features/public-chat/components/ChatContainer.tsx:133
     3  features/public-chat/components/GuidedVariableInputs.tsx:575
     3  features/public-chat/components/PublicVariableInputs.tsx:139
     1  features/recipes/components/RecipeCard.tsx:8
     1  features/recipes/components/RecipeCardUnified.tsx:7
     1  features/skills/redux/skillsThunks.ts:183
     2  hooks/ai/chat/unused/useConversationCreateUpdate.ts:1
     1  hooks/ai/chat/unused/useCreateMessage.ts:2
     3  hooks/ai/chat/unused/useMessageCreateUpdate.ts:2
     5  hooks/ai/chat/useChatBasics.ts:1
     1  hooks/applets/useBrokersAssociations.ts:1
     3  hooks/applets/useValueBroker.ts:6
     1  hooks/applets/useValueBrokers.ts:8
     1  hooks/applets/useValueBrokerValue.ts:5
     1  hooks/run-recipe/types.ts:12
     4  hooks/run-recipe/useCompiledRecipe.ts:4
     3  hooks/run-recipe/usePrepareRecipeToRun.ts:4
     3  hooks/run-recipe/useRunRecipeVersionSelection.ts:3
     1  lib/redux/app-builder/utils/auto-applet-creator.ts:5
     1  lib/redux/entity/custom-actions/chatActions.ts:13
     1  types/editor.types.ts:2
     1  utils/dataSchemaNormalizer.ts:1
     2  utils/schema/lite.ts:18

  ✗ TYPE ERRORS DETECTED
    The codebase has types that are out of sync with the backend.
    Fix the errors above, then re-run: pnpm sync-types

 ELIFECYCLE  Command failed with exit code 1.
armanisadeghi@Armanis-Mac-Studio matrx-frontend % 