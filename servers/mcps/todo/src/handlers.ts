import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AinderStore, Visibility } from './store.js';

export interface RegisterAinderToolsOptions {
  readonly store: AinderStore;
}

type ToolHandler = (input: Record<string, unknown>) => unknown;

function jsonResult(result: unknown) {
  return {
    structuredContent: { result },
    content: [{ type: 'text' as const, text: JSON.stringify({ result }) }],
  };
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function visibility(value: unknown): Visibility {
  if (value === 'public' || value === 'private' || value === 'hidden') return value;
  throw new Error('visibility must be public, private, or hidden');
}

function register(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  inputSchema: Record<string, z.ZodTypeAny>,
  handler: ToolHandler,
  after?: (toolName: string) => void,
): void {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema,
      outputSchema: { result: z.unknown() },
    },
    async (input) => {
      const result = handler(input as Record<string, unknown>);
      after?.(name);
      return jsonResult(result);
    },
  );
}

export function registerAinderTools(server: McpServer, opts: RegisterAinderToolsOptions): void {
  const { store } = opts;
  const registerPersistent = (
    server: McpServer,
    name: string,
    title: string,
    description: string,
    inputSchema: Record<string, z.ZodTypeAny>,
    handler: ToolHandler,
  ): void =>
    register(server, name, title, description, inputSchema, handler, (toolName) => {
      store.audit('tool.invoked', toolName);
      store.persist();
    });

  registerPersistent(server, 'ainder_state', 'AInder · State', 'Debug/demo state snapshot. Use to inspect the in-memory MVP state.', {}, () =>
    store.state(),
  );

  registerPersistent(
    server,
    'create_user_account',
    'AInder · Create account',
    'Create an ID/password demo account and set it as current user. No social login.',
    { userId: z.string().min(1), password: z.string().min(1) },
    (input) => store.createUser(asString(input.userId), asString(input.password)),
  );

  registerPersistent(
    server,
    'login_with_password',
    'AInder · Login',
    'Login with ID/password. Returns null if credentials do not match.',
    { userId: z.string().min(1), password: z.string().min(1) },
    (input) => store.login(asString(input.userId), asString(input.password)),
  );

  registerPersistent(server, 'get_current_user', 'AInder · Current user', 'Return the current demo user.', {}, () =>
    store.currentUser(),
  );

  registerPersistent(
    server,
    'configure_builder_openai_key',
    'AInder · Configure builder OpenAI key',
    'Mark the builder-managed OpenAI key as configured. MVP users do not enter their own BYOK key.',
    { encryptedKeyRef: z.string().optional() },
    () => store.configureBuilderOpenAiKey(),
  );

  registerPersistent(
    server,
    'configure_cocoun_mcp_key',
    'AInder · Configure Cocoun MCP key',
    'Mark the Cocoun MCP API key as configured for report council demos.',
    { encryptedKeyRef: z.string().optional() },
    () => store.configureCocounKey(),
  );

  registerPersistent(
    server,
    'save_retention_preference',
    'AInder · Save raw retention preference',
    'Set whether future raw uploads should be retained. Default is deletion after sanitization.',
    { retainRawUploads: z.boolean() },
    (input) => store.saveRetentionPreference(asBoolean(input.retainRawUploads)),
  );

  registerPersistent(
    server,
    'get_conversation_source_state',
    'AInder · Conversation source state',
    'Return whether the user can start as-is or must add KakaoTalk conversation data.',
    { userId: z.string().optional() },
    (input) => store.conversationSourceState(asString(input.userId, undefined as unknown as string)),
  );

  registerPersistent(
    server,
    'prepare_conversation_upload',
    'AInder · Prepare upload',
    'Return upload instructions for KakaoTalk .txt import.',
    { userId: z.string().optional() },
    () => ({ acceptedFileTypes: ['.txt'], primaryAction: '대화 내용 추가하기', rawDeletionDefault: true }),
  );

  registerPersistent(
    server,
    'upload_kakao_txt',
    'AInder · Upload KakaoTalk txt',
    'Upload a KakaoTalk .txt export. The fileText field is optional; omitted text uses a seeded demo fixture.',
    { fileName: z.string().min(1), fileText: z.string().optional(), retainRawUpload: z.boolean().optional() },
    (input) =>
      store.uploadKakaoTxt({
        fileName: asString(input.fileName),
        fileText: typeof input.fileText === 'string' ? input.fileText : undefined,
        retainRawUpload: typeof input.retainRawUpload === 'boolean' ? input.retainRawUpload : undefined,
      }),
  );

  registerPersistent(
    server,
    'sanitize_conversation',
    'AInder · Sanitize conversation',
    'Sanitize an uploaded conversation and delete raw text by default unless retention was explicitly selected.',
    { uploadId: z.string().min(1) },
    (input) => store.sanitizeConversation(asString(input.uploadId)),
  );

  registerPersistent(
    server,
    'delete_raw_upload',
    'AInder · Delete raw upload',
    'Idempotently delete raw uploaded text.',
    { uploadId: z.string().min(1) },
    (input) => store.deleteRawUpload(asString(input.uploadId)),
  );

  registerPersistent(
    server,
    'confirm_sanitized_conversation',
    'AInder · Confirm sanitized conversation',
    'Confirm sanitized conversation data before persona generation.',
    { sanitizedConversationId: z.string().min(1) },
    (input) => store.confirmSanitizedConversation(asString(input.sanitizedConversationId)),
  );

  registerPersistent(
    server,
    'generate_persona_profile',
    'AInder · Generate persona profile',
    'Generate a draft persona profile from sanitized conversation data only.',
    { sanitizedConversationId: z.string().min(1) },
    (input) => store.generatePersonaProfile(asString(input.sanitizedConversationId)),
  );

  registerPersistent(
    server,
    'get_persona_generation_status',
    'AInder · Persona generation status',
    'Return staged GGUI persona generation progress.',
    { profileId: z.string().min(1) },
    (input) => store.getPersonaReviewState(asString(input.profileId)),
  );

  registerPersistent(
    server,
    'get_persona_review_state',
    'AInder · Persona review state',
    'Return explainable trait cards, sanitized evidence snippets, privacy summary, and public preview.',
    { profileId: z.string().min(1) },
    (input) => store.getPersonaReviewState(asString(input.profileId)),
  );

  registerPersistent(
    server,
    'explain_persona_trait',
    'AInder · Explain persona trait',
    'Return one trait card with confidence and sanitized evidence snippets.',
    { profileId: z.string().min(1), traitId: z.string().min(1) },
    (input) => {
      const state = store.getPersonaReviewState(asString(input.profileId)) as { traits?: unknown[] };
      return state.traits?.find((trait) => typeof trait === 'object' && trait !== null && 'id' in trait && trait.id === input.traitId) ?? null;
    },
  );

  registerPersistent(
    server,
    'update_persona_section',
    'AInder · Update persona section',
    'Edit a persona trait summary.',
    { profileId: z.string().min(1), traitId: z.string().min(1), summary: z.string().min(1) },
    (input) => store.updatePersonaSection(asString(input.profileId), asString(input.traitId), asString(input.summary)),
  );

  registerPersistent(
    server,
    'set_persona_field_visibility',
    'AInder · Set trait visibility',
    'Set a trait visibility to public/private/hidden.',
    { profileId: z.string().min(1), fieldId: z.string().min(1), visibility: z.enum(['public', 'private', 'hidden']) },
    (input) => store.setPersonaFieldVisibility(asString(input.profileId), asString(input.fieldId), visibility(input.visibility)),
  );

  registerPersistent(
    server,
    'generate_public_profile_preview',
    'AInder · Public profile preview',
    'Generate exact mobile swipe-card preview from public fields only.',
    { profileId: z.string().min(1) },
    (input) => store.generatePublicProfilePreview(asString(input.profileId)),
  );

  registerPersistent(
    server,
    'confirm_public_profile_fields',
    'AInder · Confirm public fields',
    'Record field-level confirmation before publishing public profile.',
    { profileId: z.string().min(1), fieldIds: z.array(z.string()) },
    (input) => store.confirmPublicProfileFields(asString(input.profileId), asStringArray(input.fieldIds)),
  );

  registerPersistent(
    server,
    'publish_public_profile',
    'AInder · Publish public profile',
    'Publish public profile after explicit public-field confirmation.',
    { profileId: z.string().min(1) },
    (input) => store.publishPublicProfile(asString(input.profileId)),
  );

  registerPersistent(server, 'get_swipe_deck', 'AInder · Swipe deck', 'Return mobile swipe deck from public profiles only.', {}, () =>
    store.getSwipeDeck(),
  );

  registerPersistent(
    server,
    'record_swipe_interest',
    'AInder · Record swipe interest',
    'Record one-sided interest. Does not notify target or create a match.',
    { targetUserId: z.string().min(1), direction: z.string().default('left') },
    (input) => store.recordSwipeInterest(asString(input.targetUserId), asString(input.direction, 'left')),
  );

  registerPersistent(
    server,
    'open_persona_exploration',
    'AInder · Open persona exploration',
    'Open private persona exploration mode chooser after left swipe.',
    { targetUserId: z.string().min(1) },
    (input) => store.openPersonaExploration(asString(input.targetUserId)),
  );

  registerPersistent(
    server,
    'dismiss_profile',
    'AInder · Dismiss profile',
    'Dismiss a profile without opening exploration.',
    { targetUserId: z.string().min(1) },
    (input) => ({ dismissed: true, targetUserId: asString(input.targetUserId), matchCreated: false }),
  );

  registerPersistent(
    server,
    'start_direct_persona_chat',
    'AInder · Start direct persona chat',
    'Start direct chat with the target public/sanitized persona.',
    { targetUserId: z.string().min(1) },
    (input) => store.startDirectPersonaChat(asString(input.targetUserId)),
  );

  registerPersistent(
    server,
    'send_direct_persona_message',
    'AInder · Send direct persona message',
    'Send a message in direct target-persona chat.',
    { conversationId: z.string().min(1), message: z.string().min(1) },
    (input) => store.sendDirectPersonaMessage(asString(input.conversationId), asString(input.message)),
  );

  registerPersistent(
    server,
    'start_tobl_persona_simulation',
    'AInder · Start tobl.ai simulation',
    'Run initial 10-turn my-persona-to-target-persona simulation.',
    { targetUserId: z.string().min(1) },
    (input) => store.startToblPersonaSimulation(asString(input.targetUserId)),
  );

  registerPersistent(
    server,
    'run_tobl_simulation_turns',
    'AInder · Run tobl.ai turns',
    'Run additional tobl.ai simulation turns while respecting the 50-turn/message cap.',
    { simulationId: z.string().min(1), turnCount: z.number().int().positive() },
    (input) => store.runToblSimulationTurns(asString(input.simulationId), asNumber(input.turnCount, 1)),
  );

  registerPersistent(
    server,
    'submit_persona_exploration_choice',
    'AInder · Submit exploration choice',
    'Record post-exploration choice: stop, continue, or request match.',
    { conversationId: z.string().min(1), choice: z.string().min(1) },
    (input) => ({ conversationId: asString(input.conversationId), choice: asString(input.choice) }),
  );

  registerPersistent(
    server,
    'continue_persona_exploration',
    'AInder · Continue exploration',
    'Continue persona exploration with explicit user action.',
    { conversationId: z.string().min(1), additionalTurnCount: z.number().int().positive() },
    (input) => store.continuePersonaExploration(asString(input.conversationId), asNumber(input.additionalTurnCount, 1)),
  );

  registerPersistent(
    server,
    'preview_match_request_context',
    'AInder · Preview match request context',
    'Preview exactly what recipient will see: summary + 2-3 good moments, not full transcript.',
    { conversationId: z.string().min(1) },
    (input) => store.previewMatchRequestContext(asString(input.conversationId)),
  );

  registerPersistent(
    server,
    'create_match_request_from_conversation',
    'AInder · Create match request',
    'Create match request from persona conversation with summary + 2-3 good moments.',
    { conversationId: z.string().min(1), messageToRecipient: z.string().min(1) },
    (input) => store.createMatchRequestFromConversation(asString(input.conversationId), asString(input.messageToRecipient)),
  );

  registerPersistent(server, 'get_incoming_match_requests', 'AInder · Incoming match requests', 'Return incoming/pending demo match requests.', {}, () =>
    store.getIncomingMatchRequests(),
  );

  registerPersistent(
    server,
    'get_match_request',
    'AInder · Get match request',
    'Return one match request by id.',
    { matchRequestId: z.string().min(1) },
    (input) => store.getMatchRequest(asString(input.matchRequestId)),
  );

  registerPersistent(
    server,
    'respond_match_request',
    'AInder · Respond match request',
    'Accept or reject an incoming match request. Accepting creates the Match.',
    { matchRequestId: z.string().min(1), decision: z.enum(['accept', 'reject']) },
    (input) => store.respondMatchRequest(asString(input.matchRequestId), input.decision === 'reject' ? 'reject' : 'accept'),
  );

  registerPersistent(
    server,
    'open_real_conversation_if_matched',
    'AInder · Real conversation handoff',
    'Open real conversation handoff only after accepted match.',
    { matchId: z.string().min(1) },
    (input) => store.openRealConversationIfMatched(asString(input.matchId)),
  );

  registerPersistent(server, 'get_available_friend_personas', 'AInder · Friend personas', 'Return available demo friend personas for Cocoun council.', {}, () =>
    store.getAvailableFriendPersonas(),
  );

  registerPersistent(
    server,
    'generate_match_report',
    'AInder · Generate match report',
    'Generate a locked guide-style match report from sanitized persona conversation evidence.',
    { conversationId: z.string().min(1) },
    (input) => store.generateMatchReport(asString(input.conversationId)),
  );

  registerPersistent(
    server,
    'select_friend_persona_council_members',
    'AInder · Select council members',
    'Select demo/friend personas for Cocoun council. Demo personas are clearly labeled.',
    { reportId: z.string().min(1), memberIds: z.array(z.string()) },
    (input) => store.selectFriendPersonaCouncilMembers(asString(input.reportId), asStringArray(input.memberIds)),
  );

  registerPersistent(
    server,
    'invite_friend_persona_to_council',
    'AInder · Invite friend persona',
    'Model future real friend persona opt-in. MVP uses demo personas.',
    { friendPersonaId: z.string().min(1), scope: z.string().optional() },
    (input) => ({ friendPersonaId: asString(input.friendPersonaId), scope: asString(input.scope, 'report'), consentStatus: 'pending' }),
  );

  registerPersistent(
    server,
    'start_cocoun_report_council',
    'AInder · Start Cocoun council',
    'Start Cocoun-backed report council using sanitized evidence and demo friend personas.',
    { conversationId: z.string().min(1) },
    (input) => store.startCocounReportCouncil(asString(input.conversationId)),
  );

  registerPersistent(
    server,
    'get_cocoun_report_council_status',
    'AInder · Cocoun council status',
    'Return provider status, demo/cached labels, and member count for the report council.',
    { reportId: z.string().min(1) },
    (input) => store.getCocounReportCouncilStatus(asString(input.reportId)),
  );

  registerPersistent(
    server,
    'summarize_cocoun_council_output',
    'AInder · Summarize Cocoun output',
    'Convert council votes/comments into user-facing guide report sections.',
    { reportId: z.string().min(1) },
    (input) => store.summarizeCocounCouncilOutput(asString(input.reportId)),
  );

  registerPersistent(
    server,
    'request_report_reveal',
    'AInder · Request report reveal',
    'Request report reveal consent for current user.',
    { reportId: z.string().min(1) },
    (input) => store.requestReportReveal(asString(input.reportId)),
  );

  registerPersistent(
    server,
    'consent_report_reveal',
    'AInder · Consent report reveal',
    'Set current user reveal consent. Report unlocks only after both consents.',
    { reportId: z.string().min(1), consent: z.boolean() },
    (input) => store.consentReportReveal(asString(input.reportId), asBoolean(input.consent)),
  );

  registerPersistent(
    server,
    'get_match_report',
    'AInder · Get match report',
    'Return match report by id; remains locked until both consents.',
    { reportId: z.string().min(1) },
    (input) => store.getMatchReport(asString(input.reportId)),
  );
}
