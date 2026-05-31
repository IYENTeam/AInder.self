import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

export type Visibility = 'public' | 'private' | 'hidden';
export type PersonaConversationMode = 'direct' | 'simulation';
export type ProviderStatus = 'notStarted' | 'providerSuccess' | 'providerFailure' | 'cachedDemo' | 'seededFallback';
export type AuditEventType =
  | 'auth.login'
  | 'auth.logout'
  | 'upload.created'
  | 'upload.sanitized'
  | 'upload.deleted'
  | 'upload.raw_deleted'
  | 'upload.raw_retained'
  | 'provider.egress_blocked'
  | 'provider.egress_allowed'
  | 'provider.call'
  | 'consent.recorded'
  | 'match.requested'
  | 'report.reveal_consent'
  | 'tool.invoked';

export interface User {
  id: string;
  userId: string;
  passwordHash: string;
  accountStatus: 'active';
  builderKeyAccess: boolean;
  createdAt: string;
}

export interface ConversationUpload {
  id: string;
  userId: string;
  fileName: string;
  rawText: string | null;
  retainRawUpload: boolean;
  rawDeletionStatus: 'pending' | 'deleted' | 'retained';
  createdAt: string;
}

export interface SanitizedConversation {
  id: string;
  uploadId: string;
  userId: string;
  sanitizedText: string;
  redactionSummary: Array<{ category: string; count: number }>;
  confirmedAt: string | null;
}

export interface PersonaTrait {
  id: string;
  category: 'talk_style' | 'interests' | 'relationship_style' | 'boundaries' | 'dealbreakers';
  title: string;
  summary: string;
  confidence: number;
  evidenceSnippets: string[];
  recommendedVisibility: Visibility;
  visibility: Visibility;
  needsReview: boolean;
}

export interface PersonaProfile {
  id: string;
  userId: string;
  status: 'draft' | 'published';
  sanitizedConversationId: string;
  traits: PersonaTrait[];
  confirmedPublicFieldIds: string[];
  publishedAt: string | null;
}

export interface PublicProfile {
  id: string;
  userId: string;
  headline: string;
  chips: string[];
  visibleTraitIds: string[];
  publishedAt: string;
}

export interface SwipeInterest {
  id: string;
  sourceUserId: string;
  targetUserId: string;
  direction: string;
  createdAt: string;
}

export interface PersonaConversationMessage {
  index: number;
  speaker: string;
  content: string;
}

export interface PersonaConversation {
  id: string;
  requesterId: string;
  targetUserId: string;
  mode: PersonaConversationMode;
  messages: PersonaConversationMessage[];
  turnCount: number;
  summary: string;
  goodMoments: string[];
  fitPoints: string[];
  watchouts: string[];
  firstMessageSuggestions: string[];
  status: 'open' | 'stopped' | 'matchRequested';
  providerStatus: ProviderStatus;
}

export interface MatchRequest {
  id: string;
  requesterId: string;
  recipientId: string;
  conversationId: string;
  messageToRecipient: string;
  attachedSummary: string;
  attachedGoodMoments: string[];
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface Match {
  id: string;
  userIds: [string, string];
  sourceMatchRequestId: string;
  status: 'active';
  handoffState: 'available';
  createdAt: string;
}

export interface FriendPersonaCouncilMember {
  id: string;
  label: string;
  viewpoint: string;
  isDemo: boolean;
  consentStatus: 'demo' | 'optedIn' | 'pending';
}

export interface CocounCouncilRun {
  id: string;
  reportId: string;
  providerRunId: string | null;
  memberIds: string[];
  providerStatus: ProviderStatus;
  isDemoSeeded: boolean;
  isCached: boolean;
  failureReason: string | null;
  votesComments: Array<{ memberLabel: string; comment: string; vote: 'positive' | 'caution' | 'neutral' }>;
}

export interface MatchReport {
  id: string;
  conversationId: string;
  matchId: string | null;
  councilRunId: string | null;
  status: 'draft' | 'locked' | 'revealed';
  revealConsents: Record<string, boolean>;
  sections: {
    summary: string;
    fitPoints: string[];
    watchouts: string[];
    firstTopics: string[];
    advice: string[];
    councilNote: string;
  };
}

export interface ConsentRecord {
  id: string;
  userId: string;
  subjectType: 'publicProfilePublish' | 'matchRequestContext' | 'reportReveal' | 'friendPersonaCouncilOptIn' | 'rawRetention';
  subjectId: string;
  decision: string;
  visiblePayloadSummary: string;
  createdAt: string;
}
export interface AuditEvent {
  id: string;
  requestId: string | null;
  type: AuditEventType;
  userId: string | null;
  subjectId: string | null;
  createdAt: string;
}

export interface ProviderCallRecord {
  id: string;
  requestId: string | null;
  provider: 'openai' | 'cocoun' | 'tobl';
  purpose: string;
  status: ProviderStatus;
  correlationId: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface AinderState {
  currentUserId: string;
  builderOpenAiKeyConfigured: boolean;
  cocounKeyConfigured: boolean;
  retainRawUploads: boolean;
  users: User[];
  uploads: ConversationUpload[];
  sanitizedConversations: SanitizedConversation[];
  personaProfiles: PersonaProfile[];
  publicProfiles: PublicProfile[];
  swipeInterests: SwipeInterest[];
  conversations: PersonaConversation[];
  matchRequests: MatchRequest[];
  matches: Match[];
  friendPersonas: FriendPersonaCouncilMember[];
  councilRuns: CocounCouncilRun[];
  reports: MatchReport[];
  consents: ConsentRecord[];
  sessions: SessionRecord[];
  auditEvents: AuditEvent[];
  providerCalls: ProviderCallRecord[];
}

export interface AinderStore {
  state(): AinderState;
  persist(): void;
  reset(): void;
  createUser(userId: string, password: string): User;
  login(userId: string, password: string): User | null;
  currentUser(): User;
  configureBuilderOpenAiKey(): { configured: true };
  configureCocounKey(): { configured: true };
  saveRetentionPreference(retainRawUploads: boolean): { retainRawUploads: boolean };
  conversationSourceState(userId?: string): Record<string, unknown>;
  uploadKakaoTxt(args: { fileName: string; fileText?: string; retainRawUpload?: boolean }): ConversationUpload;
  sanitizeConversation(uploadId: string): SanitizedConversation;
  deleteRawUpload(uploadId: string): { deleted: boolean; rawDeletionStatus: ConversationUpload['rawDeletionStatus'] };
  confirmSanitizedConversation(sanitizedConversationId: string): SanitizedConversation;
  generatePersonaProfile(sanitizedConversationId: string): PersonaProfile;
  getPersonaReviewState(profileId: string): Record<string, unknown>;
  setPersonaFieldVisibility(profileId: string, fieldId: string, visibility: Visibility): PersonaProfile;
  updatePersonaSection(profileId: string, traitId: string, summary: string): PersonaProfile;
  generatePublicProfilePreview(profileId: string): Record<string, unknown>;
  confirmPublicProfileFields(profileId: string, fieldIds: string[]): ConsentRecord;
  publishPublicProfile(profileId: string): PublicProfile;
  getSwipeDeck(): PublicProfile[];
  recordSwipeInterest(targetUserId: string, direction: string): SwipeInterest;
  openPersonaExploration(targetUserId: string): Record<string, unknown>;
  startDirectPersonaChat(targetUserId: string): PersonaConversation;
  sendDirectPersonaMessage(conversationId: string, message: string): PersonaConversation;
  startToblPersonaSimulation(targetUserId: string): PersonaConversation;
  runToblSimulationTurns(conversationId: string, turnCount: number): PersonaConversation;
  continuePersonaExploration(conversationId: string, additionalTurnCount: number): PersonaConversation;
  previewMatchRequestContext(conversationId: string): Record<string, unknown>;
  createMatchRequestFromConversation(conversationId: string, messageToRecipient: string): MatchRequest;
  getIncomingMatchRequests(): MatchRequest[];
  getMatchRequest(matchRequestId: string): MatchRequest | null;
  respondMatchRequest(matchRequestId: string, decision: 'accept' | 'reject'): Record<string, unknown>;
  openRealConversationIfMatched(matchId: string): Record<string, unknown>;
  getAvailableFriendPersonas(): FriendPersonaCouncilMember[];
  generateMatchReport(conversationId: string): MatchReport;
  selectFriendPersonaCouncilMembers(reportId: string, memberIds: string[]): CocounCouncilRun;
  startCocounReportCouncil(conversationId: string): CocounCouncilRun;
  getCocounReportCouncilStatus(reportId: string): Record<string, unknown>;
  summarizeCocounCouncilOutput(reportId: string): MatchReport;
  requestReportReveal(reportId: string): MatchReport;
  consentReportReveal(reportId: string, consent: boolean): MatchReport;
  getMatchReport(reportId: string): MatchReport | null;
  persist(): void;
  audit(type: AuditEventType, subjectId?: string | null, userId?: string | null): AuditEvent;
}

export interface CreateAinderStoreOptions {
  readonly persistPath?: string;
  readonly seedDemo?: boolean;
}

export interface AinderStoreOptions {
  readonly seedDemo?: boolean;
  readonly persistencePath?: string | null;
  readonly requirePersistence?: boolean;
}

const STORE_SCHEMA_VERSION = 1;

interface PersistedStateEnvelope {
  schemaVersion: number;
  state: AinderState;
}

const DEFAULT_SAMPLE = `2026. 5. 20. 오후 8:01, 민지 : 오늘 회사 앞 강남역에서 봤잖아\n2026. 5. 20. 오후 8:02, 나 : 010-1234-5678로 전화하지 말고 카톡해줘\n2026. 5. 20. 오후 8:04, 민지 : 너는 왜 그렇게 느꼈는지 꼭 물어보더라\n2026. 5. 20. 오후 8:05, 나 : 결론보다 그때 기분이 어땠는지가 궁금해\n2026. 5. 20. 오후 8:06, 민지 : 급하게 정하는 건 부담스러워하는 편이지?\n2026. 5. 20. 오후 8:07, 나 : 응 천천히 알아가는 게 좋아`;

function now(): string {
  return new Date().toISOString();
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const derived = scryptSync(password, salt, 64).toString('base64url');
  return `scrypt:v1:${salt}:${derived}`;
}

function verifyPassword(password: string, passwordHash: string): boolean {
  const [scheme, version, salt, expected] = passwordHash.split(':');
  if (scheme !== 'scrypt' || version !== 'v1' || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBytes = Buffer.from(expected, 'base64url');
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

function nextId(prefix: string, counters: Map<string, number>): string {
  counters.set(prefix, (counters.get(prefix) ?? 0) + 1);
  return `${prefix}-${randomUUID()}`;
}

function redact(text: string): { sanitizedText: string; summary: Array<{ category: string; count: number }> } {
  let sanitizedText = text;
  const summary: Array<{ category: string; count: number }> = [];
  const patterns: Array<[string, RegExp, string]> = [
    ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일]'],
    ['phone', /01\d-?\d{3,4}-?\d{4}/g, '[전화번호]'],
    ['account_id', /(?:카톡|kakao|id|아이디)[:\s]+[A-Za-z0-9._-]{3,}/gi, '[계정ID]'],
    ['location', /(강남역|홍대|잠실|서울|부산|회사 앞|아파트|동호수)/g, '[위치]'],
    ['employer_school', /(회사|학교|대학교|직장|팀|부서)/g, '[직장/학교]'],
    ['name_or_nickname', /(민지|도윤|하린|준)/g, '[이름]'],
  ];
  for (const [category, pattern, replacement] of patterns) {
    const matches = sanitizedText.match(pattern);
    if (matches?.length) {
      summary.push({ category, count: matches.length });
      sanitizedText = sanitizedText.replace(pattern, replacement);
    }
  }
  return { sanitizedText, summary };
}

function createAuditEvent(
  state: AinderState,
  counters: Map<string, number>,
  event: Omit<AuditEvent, 'id' | 'createdAt'>,
): AuditEvent {
  const audit: AuditEvent = {
    id: nextId('audit', counters),
    createdAt: now(),
    ...event,
  };
  state.auditEvents.push(audit);
  return audit;
}

function assertExternalCallAllowed(
  state: AinderState,
  counters: Map<string, number>,
  userId: string,
): void {
  const pending = state.uploads.some(
    (u) => u.userId === userId && u.rawDeletionStatus === 'pending',
  );
  if (pending) {
    createAuditEvent(state, counters, {
      requestId: null,
      type: 'provider.egress_blocked',
      userId,
      subjectId: null,
    });
    throw new Error('External calls are blocked until raw deletion or retention decision is complete.');
  }
  createAuditEvent(state, counters, {
    requestId: null,
    type: 'provider.egress_allowed',
    userId,
    subjectId: userId,
  });
}

function primeCounters(state: AinderState, counters: Map<string, number>): void {
  const ids = [
    ...state.users.map((row) => row.id),
    ...state.uploads.map((row) => row.id),
    ...state.sanitizedConversations.map((row) => row.id),
    ...state.personaProfiles.map((row) => row.id),
    ...state.publicProfiles.map((row) => row.id),
    ...state.swipeInterests.map((row) => row.id),
    ...state.conversations.map((row) => row.id),
    ...state.matchRequests.map((row) => row.id),
    ...state.matches.map((row) => row.id),
    ...state.friendPersonas.map((row) => row.id),
    ...state.councilRuns.map((row) => row.id),
    ...state.reports.map((row) => row.id),
    ...state.consents.map((row) => row.id),
    ...state.sessions.map((row) => row.id),
    ...state.auditEvents.map((row) => row.id),
  ];
  for (const id of ids) {
    const match = /^([a-z-]+)-(\d+)$/.exec(id);
    if (!match) continue;
    const prefix = match[1]!;
    const value = Number.parseInt(match[2]!, 10);
    if (!Number.isFinite(value)) continue;
    counters.set(prefix, Math.max(counters.get(prefix) ?? 0, value));
  }
}

function recordProviderCall(
  state: AinderState,
  counters: Map<string, number>,
  provider: ProviderCallRecord['provider'],
  purpose: string,
  status: ProviderStatus,
  userId: string | null,
): ProviderCallRecord {
  const record: ProviderCallRecord = {
    id: nextId('provider-call', counters),
    requestId: null,
    provider,
    purpose,
    status,
    correlationId: randomUUID(),
    createdAt: now(),
  };
  state.providerCalls.push(record);
  createAuditEvent(state, counters, {
    requestId: null,
    type: status === 'providerFailure' ? 'provider.egress_blocked' : 'provider.call',
    userId,
    subjectId: record.id,
  });
  return record;
}

function createSeedState(): AinderState {
  const createdAt = now();
  const targetTraits: PersonaTrait[] = [
    {
      id: 'target-trait-talk',
      category: 'talk_style',
      title: '대화 스타일',
      summary: '질문을 이어가며 감정의 맥락을 천천히 확인하는 편이에요.',
      confidence: 0.86,
      evidenceSnippets: ['왜 그렇게 느꼈는지 궁금해', '그때 기분이 어땠어?'],
      recommendedVisibility: 'public',
      visibility: 'public',
      needsReview: false,
    },
    {
      id: 'target-trait-boundary',
      category: 'boundaries',
      title: '속도감',
      summary: '빠른 약속보다 안정적인 템포를 선호해요.',
      confidence: 0.74,
      evidenceSnippets: ['천천히 알아가는 게 좋아'],
      recommendedVisibility: 'private',
      visibility: 'private',
      needsReview: true,
    },
  ];
  return {
    currentUserId: 'user-demo',
    builderOpenAiKeyConfigured: true,
    cocounKeyConfigured: true,
    retainRawUploads: false,
    users: [
      {
        id: 'user-demo',
        userId: 'demo',
        passwordHash: hashPassword('demo'),
        accountStatus: 'active',
        builderKeyAccess: true,
        createdAt,
      },
      {
        id: 'user-target',
        userId: 'target',
        passwordHash: hashPassword('demo'),
        accountStatus: 'active',
        builderKeyAccess: true,
        createdAt,
      },
    ],
    uploads: [],
    sanitizedConversations: [],
    personaProfiles: [
      {
        id: 'profile-target',
        userId: 'user-target',
        status: 'published',
        sanitizedConversationId: 'seed-sanitized-target',
        traits: targetTraits,
        confirmedPublicFieldIds: ['target-trait-talk'],
        publishedAt: createdAt,
      },
    ],
    publicProfiles: [
      {
        id: 'public-target',
        userId: 'user-target',
        headline: '감정의 맥락을 천천히 읽는 사람',
        chips: ['긴 대화', '천천히 친해짐', '산책', '영화'],
        visibleTraitIds: ['target-trait-talk'],
        publishedAt: createdAt,
      },
    ],
    swipeInterests: [],
    conversations: [],
    matchRequests: [],
    matches: [],
    friendPersonas: [
      { id: 'friend-minji', label: '현실 친구 민지', viewpoint: '직설적이고 어색한 지점을 잘 잡음', isDemo: true, consentStatus: 'demo' },
      { id: 'friend-doyoon', label: '신중한 친구 도윤', viewpoint: '경계와 압박감을 체크함', isDemo: true, consentStatus: 'demo' },
      { id: 'friend-harin', label: '낙관적인 친구 하린', viewpoint: '좋은 대화 가능성을 찾아줌', isDemo: true, consentStatus: 'demo' },
      { id: 'friend-joon', label: '드립 보는 친구 준', viewpoint: '유머와 톤 미스매치를 봄', isDemo: true, consentStatus: 'demo' },
    ],
    councilRuns: [],
    reports: [],
    consents: [],
    sessions: [],
    auditEvents: [],
    providerCalls: [],
  };
}

function createEmptyState(): AinderState {
  return {
    currentUserId: '',
    builderOpenAiKeyConfigured: false,
    cocounKeyConfigured: false,
    retainRawUploads: false,
    users: [],
    uploads: [],
    sanitizedConversations: [],
    personaProfiles: [],
    publicProfiles: [],
    swipeInterests: [],
    conversations: [],
    matchRequests: [],
    matches: [],
    friendPersonas: [],
    councilRuns: [],
    reports: [],
    consents: [],
    sessions: [],
    auditEvents: [],
    providerCalls: [],
  };
}

function normalizeState(state: AinderState): AinderState {
  return {
    ...state,
    sessions: state.sessions ?? [],
    auditEvents: state.auditEvents ?? [],
    providerCalls: state.providerCalls ?? [],
  };
}

function loadState(path: string): AinderState | null {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as AinderState | PersistedStateEnvelope;
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'schemaVersion' in parsed &&
    'state' in parsed &&
    typeof (parsed as PersistedStateEnvelope).schemaVersion === 'number'
  ) {
    return normalizeState((parsed as PersistedStateEnvelope).state);
  }
  return normalizeState(parsed as AinderState);
}

export function createAinderStore(opts: CreateAinderStoreOptions = {}): AinderStore {
  let state = opts.persistPath !== undefined ? loadState(opts.persistPath) ?? (opts.seedDemo ? createSeedState() : createEmptyState()) : opts.seedDemo === false ? createEmptyState() : createSeedState();
  state.sessions ??= [];
  state.auditEvents ??= [];
  state.providerCalls ??= [];
  const counters = new Map<string, number>();
  primeCounters(state, counters);

  const persist = (): void => {
    if (opts.persistPath === undefined) return;
    mkdirSync(dirname(opts.persistPath), { recursive: true });
    const envelope: PersistedStateEnvelope = {
      schemaVersion: STORE_SCHEMA_VERSION,
      state,
    };
    writeFileSync(opts.persistPath, `${JSON.stringify(envelope, null, 2)}\n`);
  };

  const audit = (type: AuditEventType, subjectId: string | null = null, userId: string | null = state.currentUserId || null): AuditEvent => {
    const event: AuditEvent = {
      id: nextId('audit', counters),
      requestId: null,
      type,
      userId,
      subjectId,
      createdAt: now(),
    };
    state.auditEvents.push(event);
    return event;
  };

  const currentUser = (): User => {
    const user = state.users.find((u) => u.id === state.currentUserId);
    if (!user) throw new Error('No current user.');
    return user;
  };
  const profileFor = (userId: string): PersonaProfile | undefined =>
    state.personaProfiles.find((p) => p.userId === userId && p.status === 'published') ??
    state.personaProfiles.find((p) => p.userId === userId);
  const reportById = (reportId: string): MatchReport => {
    const report = state.reports.find((r) => r.id === reportId);
    if (!report) throw new Error(`Report not found: ${reportId}`);
    return report;
  };

  const redactedState = (): AinderState => ({
    ...state,
    users: state.users.map((user) => ({ ...user, passwordHash: '[redacted]' })),
    uploads: state.uploads.map((upload) => ({ ...upload, rawText: null })),
  });

  const api: AinderStore = {
    state: redactedState,
    reset() {
      state = opts.seedDemo ? createSeedState() : createEmptyState();
      state.sessions ??= [];
      state.auditEvents ??= [];
      state.providerCalls ??= [];
      counters.clear();
      persist();
    },
    createUser(userId, password) {
      if (state.users.some((u) => u.userId === userId)) throw new Error('User already exists.');
      const user: User = {
        id: nextId('user', counters),
        userId,
        passwordHash: hashPassword(password),
        accountStatus: 'active',
        builderKeyAccess: state.builderOpenAiKeyConfigured,
        createdAt: now(),
      };
      state.users.push(user);
      state.currentUserId = user.id;
      state.sessions.push({
        id: nextId('session', counters),
        userId: user.id,
        createdAt: now(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
        revokedAt: null,
      });
      audit('auth.login', user.id, user.id);
      persist();
      return user;
    },
    login(userId, password) {
      const user = state.users.find((u) => u.userId === userId && verifyPassword(password, u.passwordHash));
      if (user) {
        state.currentUserId = user.id;
        state.sessions.push({
          id: nextId('session', counters),
          userId: user.id,
          createdAt: now(),
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
          revokedAt: null,
        });
        audit('auth.login', user.id, user.id);
        persist();
      }
      return user ?? null;
    },
    currentUser,
    configureBuilderOpenAiKey() {
      state.builderOpenAiKeyConfigured = true;
      for (const user of state.users) user.builderKeyAccess = true;
      return { configured: true };
    },
    configureCocounKey() {
      state.cocounKeyConfigured = true;
      return { configured: true };
    },
    saveRetentionPreference(retainRawUploads) {
      state.retainRawUploads = retainRawUploads;
      state.consents.push({
        id: nextId('consent', counters),
        userId: state.currentUserId,
        subjectType: 'rawRetention',
        subjectId: state.currentUserId,
        decision: retainRawUploads ? 'retain' : 'delete-after-sanitize',
        visiblePayloadSummary: `Raw upload retention: ${retainRawUploads}`,
        createdAt: now(),
      });
      createAuditEvent(state, counters, {
        requestId: null,
        type: 'consent.recorded',
        userId: state.currentUserId || null,
        subjectId: state.currentUserId || null,
      });
      return { retainRawUploads };
    },
    conversationSourceState(userId = state.currentUserId) {
      const sanitized = state.sanitizedConversations.filter((c) => c.userId === userId);
      const profile = profileFor(userId);
      return {
        hasConversationData: sanitized.length > 0,
        primaryActions: sanitized.length > 0 ? ['대화 내용 추가하기', '그냥 시작하기'] : ['대화 내용 추가하기'],
        sanitizedConversationCount: sanitized.length,
        publicProfilePublished: profile?.status === 'published',
        lastUploadAt: state.uploads.filter((u) => u.userId === userId).at(-1)?.createdAt ?? null,
      };
    },
    uploadKakaoTxt({ fileName, fileText = DEFAULT_SAMPLE, retainRawUpload = state.retainRawUploads }) {
      if (!fileName.endsWith('.txt')) throw new Error('Only KakaoTalk .txt exports are accepted.');
      if (Buffer.byteLength(fileText, 'utf8') > 2 * 1024 * 1024) throw new Error('KakaoTalk export exceeds 2MB upload limit.');
      const upload: ConversationUpload = {
        id: nextId('upload', counters),
        userId: state.currentUserId,
        fileName,
        rawText: fileText,
        retainRawUpload,
        rawDeletionStatus: 'pending',
        createdAt: now(),
      };
      state.uploads.push(upload);
      audit('upload.created', upload.id, upload.userId);
      persist();
      return upload;
    },
    sanitizeConversation(uploadId) {
      const upload = state.uploads.find((u) => u.id === uploadId);
      if (!upload) throw new Error('Upload not found.');
      const { sanitizedText, summary } = redact(upload.rawText ?? '');
      const sanitized: SanitizedConversation = {
        id: nextId('sanitized', counters),
        uploadId,
        userId: upload.userId,
        sanitizedText,
        redactionSummary: summary,
        confirmedAt: null,
      };
      state.sanitizedConversations.push(sanitized);
      if (upload.retainRawUpload) {
        upload.rawDeletionStatus = 'retained';
        state.consents.push({
          id: nextId('consent', counters),
          userId: upload.userId,
          subjectType: 'rawRetention',
          subjectId: upload.id,
          decision: 'retain',
          visiblePayloadSummary: 'User explicitly retained raw upload.',
          createdAt: now(),
        });
          createAuditEvent(state, counters, {
            requestId: null,
            type: 'upload.raw_retained',
            userId: upload.userId,
            subjectId: upload.id,
          });
      } else {
        upload.rawText = null;
        upload.rawDeletionStatus = 'deleted';
        createAuditEvent(state, counters, {
          requestId: null,
          type: 'upload.raw_deleted',
          userId: upload.userId,
          subjectId: upload.id,
        });
      }
      audit('upload.sanitized', sanitized.id, sanitized.userId);
      persist();
      return sanitized;
    },
    deleteRawUpload(uploadId) {
      const upload = state.uploads.find((u) => u.id === uploadId);
      if (!upload) throw new Error('Upload not found.');
      upload.rawText = null;
      upload.rawDeletionStatus = 'deleted';
      audit('upload.deleted', upload.id, upload.userId);
      persist();
      return { deleted: true, rawDeletionStatus: upload.rawDeletionStatus };
    },
    confirmSanitizedConversation(sanitizedConversationId) {
      const item = state.sanitizedConversations.find((c) => c.id === sanitizedConversationId);
      if (!item) throw new Error('Sanitized conversation not found.');
      item.confirmedAt = now();
      return item;
    },
    generatePersonaProfile(sanitizedConversationId) {
      assertExternalCallAllowed(state, counters, state.currentUserId);
      const sanitized = state.sanitizedConversations.find((c) => c.id === sanitizedConversationId);
      if (!sanitized) throw new Error('Sanitized conversation not found.');
      const traits: PersonaTrait[] = [
        {
          id: nextId('trait', counters),
          category: 'talk_style',
          title: '대화 스타일',
          summary: '상대의 감정 맥락을 확인하며 대화하는 편이에요.',
          confidence: 0.88,
          evidenceSnippets: ['왜 그렇게 느꼈는지 궁금해', '그때 기분이 어땠어?'],
          recommendedVisibility: 'public',
          visibility: 'public',
          needsReview: false,
        },
        {
          id: nextId('trait', counters),
          category: 'relationship_style',
          title: '관계 속도',
          summary: '빠르게 가까워지기보다 천천히 안정감을 확인하는 타입이에요.',
          confidence: 0.74,
          evidenceSnippets: ['천천히 알아가는 게 좋아'],
          recommendedVisibility: 'public',
          visibility: 'private',
          needsReview: true,
        },
        {
          id: nextId('trait', counters),
          category: 'boundaries',
          title: '조심할 지점',
          summary: '갑작스러운 압박이나 빠른 결정 요구에 부담을 느낄 수 있어요.',
          confidence: 0.69,
          evidenceSnippets: [],
          recommendedVisibility: 'private',
          visibility: 'private',
          needsReview: true,
        },
      ];
      const profile: PersonaProfile = {
        id: nextId('profile', counters),
        userId: sanitized.userId,
        status: 'draft',
        sanitizedConversationId,
        traits,
        confirmedPublicFieldIds: [],
        publishedAt: null,
      };
      state.personaProfiles.push(profile);
      recordProviderCall(state, counters, 'openai', 'persona_profile_generation', 'providerSuccess', sanitized.userId);
      return profile;
    },
    getPersonaReviewState(profileId) {
      const profile = state.personaProfiles.find((p) => p.id === profileId);
      if (!profile) throw new Error('Profile not found.');
      return {
        profileId,
        generationStatus: profile.status === 'published' ? 'published' : 'review_required',
        progress: [
          { section: '말투 분석', status: 'done' },
          { section: '관심사 추출', status: 'done' },
          { section: '관계 성향 정리', status: 'done' },
          { section: '경계/딜브레이커 정리', status: 'done' },
          { section: '공개 프로필 초안 생성', status: 'done' },
          { section: '민감 표현 재검토', status: 'done' },
        ],
        traits: profile.traits,
        privacySummary: state.sanitizedConversations.find((c) => c.id === profile.sanitizedConversationId)?.redactionSummary ?? [],
        publicPreview: this.generatePublicProfilePreview(profileId),
      };
    },
    setPersonaFieldVisibility(profileId, fieldId, visibility) {
      const profile = state.personaProfiles.find((p) => p.id === profileId);
      if (!profile) throw new Error('Profile not found.');
      const trait = profile.traits.find((t) => t.id === fieldId);
      if (!trait) throw new Error('Trait not found.');
      trait.visibility = visibility;
      state.consents.push({
        id: nextId('consent', counters),
        userId: profile.userId,
        subjectType: 'publicProfilePublish',
        subjectId: fieldId,
        decision: visibility,
        visiblePayloadSummary: `${trait.title}: ${visibility}`,
        createdAt: now(),
      });
      return profile;
    },
    updatePersonaSection(profileId, traitId, summary) {
      const profile = state.personaProfiles.find((p) => p.id === profileId);
      if (!profile) throw new Error('Profile not found.');
      const trait = profile.traits.find((t) => t.id === traitId);
      if (!trait) throw new Error('Trait not found.');
      trait.summary = summary;
      trait.needsReview = false;
      return profile;
    },
    generatePublicProfilePreview(profileId) {
      const profile = state.personaProfiles.find((p) => p.id === profileId);
      if (!profile) throw new Error('Profile not found.');
      const publicTraits = profile.traits.filter((t) => t.visibility === 'public');
      return {
        headline: publicTraits[0]?.summary ?? '아직 공개할 페르소나 trait가 없어요',
        chips: publicTraits.map((t) => t.title).slice(0, 4),
        visibleTraitIds: publicTraits.map((t) => t.id),
        hiddenFieldsCount: profile.traits.filter((t) => t.visibility !== 'public').length,
      };
    },
    confirmPublicProfileFields(profileId, fieldIds) {
      const profile = state.personaProfiles.find((p) => p.id === profileId);
      if (!profile) throw new Error('Profile not found.');
      profile.confirmedPublicFieldIds = fieldIds;
      const consent: ConsentRecord = {
        id: nextId('consent', counters),
        userId: profile.userId,
        subjectType: 'publicProfilePublish',
        subjectId: profileId,
        decision: 'confirmed',
        visiblePayloadSummary: `Confirmed public fields: ${fieldIds.join(', ')}`,
        createdAt: now(),
      };
      state.consents.push(consent);
      return consent;
    },
    publishPublicProfile(profileId) {
      const profile = state.personaProfiles.find((p) => p.id === profileId);
      if (!profile) throw new Error('Profile not found.');
      const preview = this.generatePublicProfilePreview(profileId) as { headline: string; chips: string[]; visibleTraitIds: string[] };
      if (preview.visibleTraitIds.length === 0) throw new Error('At least one public field is required.');
      if (profile.confirmedPublicFieldIds.length === 0) throw new Error('Public fields must be explicitly confirmed before publishing.');
      profile.status = 'published';
      profile.publishedAt = now();
      const existing = state.publicProfiles.find((p) => p.userId === profile.userId);
      const publicProfile: PublicProfile = {
        id: existing?.id ?? nextId('public', counters),
        userId: profile.userId,
        headline: preview.headline,
        chips: preview.chips,
        visibleTraitIds: preview.visibleTraitIds,
        publishedAt: profile.publishedAt,
      };
      if (existing) Object.assign(existing, publicProfile);
      else state.publicProfiles.push(publicProfile);
      return publicProfile;
    },
    getSwipeDeck() {
      const current = currentUser();
      if (!state.publicProfiles.some((p) => p.userId === current.id)) {
        throw new Error('Publish your public profile before opening the swipe deck.');
      }
      return state.publicProfiles.filter((p) => p.userId !== current.id);
    },
    recordSwipeInterest(targetUserId, direction) {
      const interest: SwipeInterest = {
        id: nextId('swipe', counters),
        sourceUserId: state.currentUserId,
        targetUserId,
        direction,
        createdAt: now(),
      };
      state.swipeInterests.push(interest);
      return interest;
    },
    openPersonaExploration(targetUserId) {
      return {
        targetUserId,
        notifiedTarget: false,
        matchCreated: false,
        modes: ['상대 페르소나와 직접 대화하기', '내 페르소나로 대화시키기'],
      };
    },
    startDirectPersonaChat(targetUserId) {
      assertExternalCallAllowed(state, counters, state.currentUserId);
      const conversation: PersonaConversation = {
        id: nextId('conversation', counters),
        requesterId: state.currentUserId,
        targetUserId,
        mode: 'direct',
        messages: [
          { index: 1, speaker: 'target-persona', content: '안녕하세요. 저는 천천히 맥락을 나누는 대화를 좋아해요. 무엇이 궁금하세요?' },
        ],
        turnCount: 1,
        summary: '상대 페르소나는 차분하고 맥락 중심의 대화를 선호합니다.',
        goodMoments: ['첫 응답에서 부담 없는 질문을 유도함'],
        fitPoints: ['긴 대화와 감정 맥락을 선호'],
        watchouts: ['빠른 약속 제안은 부담일 수 있음'],
        firstMessageSuggestions: ['요즘 오래 이야기해도 지치지 않는 주제가 있어요?'],
        status: 'open',
        providerStatus: 'seededFallback',
      };
      state.conversations.push(conversation);
      recordProviderCall(state, counters, 'openai', 'direct_persona_chat', conversation.providerStatus, conversation.requesterId);
      return conversation;
    },
    sendDirectPersonaMessage(conversationId, message) {
      const conversation = state.conversations.find((c) => c.id === conversationId);
      if (!conversation) throw new Error('Conversation not found.');
      if (conversation.turnCount >= 50) throw new Error('Persona exploration cannot exceed 50 turns/messages.');
      conversation.messages.push({ index: conversation.messages.length + 1, speaker: 'user', content: message });
      conversation.messages.push({
        index: conversation.messages.length + 1,
        speaker: 'target-persona',
        content: '그 질문은 좋아요. 저는 급하지 않게 서로의 이유를 들어보는 대화를 편하게 느껴요.',
      });
      conversation.turnCount = conversation.messages.length;
      conversation.goodMoments = conversation.goodMoments.slice(0, 1).concat('서로의 대화 속도를 확인하는 장면');
      return conversation;
    },
    startToblPersonaSimulation(targetUserId) {
      return this.runToblSimulationTurns(
        (() => {
          const conversation: PersonaConversation = {
            id: nextId('conversation', counters),
            requesterId: state.currentUserId,
            targetUserId,
            mode: 'simulation',
            messages: [],
            turnCount: 0,
            summary: '',
            goodMoments: [],
            fitPoints: [],
            watchouts: [],
            firstMessageSuggestions: [],
            status: 'open',
            providerStatus: 'providerSuccess',
          };
          state.conversations.push(conversation);
          return conversation.id;
        })(),
        10,
      );
    },
    runToblSimulationTurns(conversationId, turnCount) {
      assertExternalCallAllowed(state, counters, state.currentUserId);
      const conversation = state.conversations.find((c) => c.id === conversationId);
      if (!conversation) throw new Error('Conversation not found.');
      const target = Math.min(50, conversation.turnCount + turnCount);
      for (let i = conversation.turnCount + 1; i <= target; i++) {
        conversation.messages.push({
          index: i,
          speaker: i % 2 === 0 ? 'target-persona' : 'my-persona',
          content:
            i % 2 === 0
              ? '저도 빠른 결론보다 대화의 흐름을 보는 편이에요.'
              : '그럼 처음엔 부담 없는 주제로 천천히 이야기해보면 좋겠어요.',
        });
      }
      conversation.turnCount = conversation.messages.length;
      conversation.summary = '두 페르소나는 급하게 결론내기보다 감정의 맥락을 확인하는 대화에서 잘 맞았습니다.';
      conversation.goodMoments = ['서로 대화 속도를 맞추려는 장면', '감정의 이유를 묻는 장면', '부담 없는 첫 주제를 찾는 장면'];
      conversation.fitPoints = ['긴 대화를 부담스러워하지 않음', '상대 감정의 이유를 묻는 방식이 자연스러움'];
      conversation.watchouts = ['빠른 약속 제안은 부담일 수 있음', '농담 강도는 천천히 맞추는 편이 안전함'];
      conversation.firstMessageSuggestions = ['처음 친해질 때 편한 대화 속도는 어떤 편이에요?', '요즘 오래 이야기해도 지치지 않는 주제가 있어요?'];
      conversation.providerStatus = 'providerSuccess';
      recordProviderCall(state, counters, 'tobl', 'persona_simulation', conversation.providerStatus, conversation.requesterId);
      return conversation;
    },
    continuePersonaExploration(conversationId, additionalTurnCount) {
      return this.runToblSimulationTurns(conversationId, additionalTurnCount);
    },
    previewMatchRequestContext(conversationId) {
      const conversation = state.conversations.find((c) => c.id === conversationId);
      if (!conversation) throw new Error('Conversation not found.');
      return {
        conversationId,
        attachedSummary: conversation.summary,
        attachedGoodMoments: conversation.goodMoments.slice(0, 3),
        fullTranscriptAttached: false,
        recipientVisibleFields: ['requesterPublicProfile', 'messageToRecipient', 'attachedSummary', 'attachedGoodMoments'],
      };
    },
    createMatchRequestFromConversation(conversationId, messageToRecipient) {
      const conversation = state.conversations.find((c) => c.id === conversationId);
      if (!conversation) throw new Error('Conversation not found.');
      const preview = this.previewMatchRequestContext(conversationId) as { attachedSummary: string; attachedGoodMoments: string[] };
      const request: MatchRequest = {
        id: nextId('match-request', counters),
        requesterId: conversation.requesterId,
        recipientId: conversation.targetUserId,
        conversationId,
        messageToRecipient,
        attachedSummary: preview.attachedSummary,
        attachedGoodMoments: preview.attachedGoodMoments,
        status: 'pending',
        createdAt: now(),
      };
      conversation.status = 'matchRequested';
      state.matchRequests.push(request);
      audit('match.requested', request.id, request.requesterId);
      state.consents.push({
        id: nextId('consent', counters),
        userId: conversation.requesterId,
        subjectType: 'matchRequestContext',
        subjectId: request.id,
        decision: 'confirmed',
        visiblePayloadSummary: 'Summary + 2-3 good moments were attached. Full transcript was not attached.',
        createdAt: now(),
      });
      return request;
    },
    getIncomingMatchRequests() {
      return state.matchRequests.filter((r) => r.recipientId === state.currentUserId || r.recipientId === 'user-target');
    },
    getMatchRequest(matchRequestId) {
      return state.matchRequests.find((r) => r.id === matchRequestId) ?? null;
    },
    respondMatchRequest(matchRequestId, decision) {
      const request = state.matchRequests.find((r) => r.id === matchRequestId);
      if (!request) throw new Error('Match request not found.');
      request.status = decision === 'accept' ? 'accepted' : 'rejected';
      let match: Match | null = null;
      if (decision === 'accept') {
        match = {
          id: nextId('match', counters),
          userIds: [request.requesterId, request.recipientId],
          sourceMatchRequestId: request.id,
          status: 'active',
          handoffState: 'available',
          createdAt: now(),
        };
        state.matches.push(match);
      }
      return { request, match };
    },
    openRealConversationIfMatched(matchId) {
      const match = state.matches.find((m) => m.id === matchId);
      if (!match) throw new Error('Match not found.');
      return {
        matchId,
        handoffAvailable: true,
        options: ['in-app chat placeholder', 'open-chat/contact exchange placeholder'],
      };
    },
    getAvailableFriendPersonas() {
      return state.friendPersonas;
    },
    generateMatchReport(conversationId) {
      const conversation = state.conversations.find((c) => c.id === conversationId);
      if (!conversation) throw new Error('Conversation not found.');
      const report: MatchReport = {
        id: nextId('report', counters),
        conversationId,
        matchId: state.matches.find((m) => m.userIds.includes(conversation.requesterId) && m.userIds.includes(conversation.targetUserId))?.id ?? null,
        councilRunId: null,
        status: 'locked',
        revealConsents: {},
        sections: {
          summary: conversation.summary,
          fitPoints: conversation.fitPoints,
          watchouts: conversation.watchouts,
          firstTopics: conversation.firstMessageSuggestions,
          advice: ['처음에는 부담 없는 질문으로 시작하세요.', '상대의 속도를 확인하는 문장을 먼저 던지는 편이 좋습니다.'],
          councilNote: 'Demo friend personas reviewed sanitized evidence only.',
        },
      };
      state.reports.push(report);
      return report;
    },
    selectFriendPersonaCouncilMembers(reportId, memberIds) {
      const report = reportById(reportId);
      const members = memberIds.length > 0 ? memberIds : state.friendPersonas.slice(0, 3).map((m) => m.id);
      const run: CocounCouncilRun = {
        id: nextId('cocoun-run', counters),
        reportId: report.id,
        providerRunId: `demo-cocoun-${Date.now()}`,
        memberIds: members,
        providerStatus: 'seededFallback',
        isDemoSeeded: true,
        isCached: false,
        failureReason: null,
        votesComments: members.map((id) => {
          const member = state.friendPersonas.find((m) => m.id === id)!;
          return {
            memberLabel: member.label,
            vote: member.id === 'friend-doyoon' ? 'caution' : 'positive',
            comment: `${member.label}: ${member.viewpoint}. sanitized evidence 기준으로 대화 시작은 괜찮아 보여요.`,
          };
        }),
      };
      state.councilRuns.push(run);
      recordProviderCall(state, counters, 'cocoun', 'friend_persona_council', run.providerStatus, state.currentUserId || null);
      report.councilRunId = run.id;
      return run;
    },
    startCocounReportCouncil(conversationId) {
      let report = state.reports.find((r) => r.conversationId === conversationId);
      if (!report) report = this.generateMatchReport(conversationId);
      return this.selectFriendPersonaCouncilMembers(report.id, state.friendPersonas.slice(0, 3).map((m) => m.id));
    },
    getCocounReportCouncilStatus(reportId) {
      const report = reportById(reportId);
      const run = state.councilRuns.find((r) => r.id === report.councilRunId);
      return {
        reportId,
        status: run?.providerStatus ?? 'notStarted',
        isDemoSeeded: run?.isDemoSeeded ?? false,
        isCached: run?.isCached ?? false,
        memberCount: run?.memberIds.length ?? 0,
        failureReason: run?.failureReason ?? null,
      };
    },
    summarizeCocounCouncilOutput(reportId) {
      const report = reportById(reportId);
      const run = state.councilRuns.find((r) => r.id === report.councilRunId);
      if (run) {
        report.sections.councilNote = `AI Council 메모: ${run.votesComments.map((v) => v.comment).join(' ')}`;
      }
      return report;
    },
    requestReportReveal(reportId) {
      return this.consentReportReveal(reportId, true);
    },
    consentReportReveal(reportId, consent) {
      const report = reportById(reportId);
      report.revealConsents[state.currentUserId] = consent;
      state.consents.push({
        id: nextId('consent', counters),
        userId: state.currentUserId,
        subjectType: 'reportReveal',
        subjectId: report.id,
        decision: consent ? 'consent' : 'decline',
        visiblePayloadSummary: 'Match report reveal consent',
        createdAt: now(),
      });
      audit('report.reveal_consent', report.id, state.currentUserId);
      const conversation = state.conversations.find((c) => c.id === report.conversationId);
      const other = conversation?.targetUserId;
      if (consent && other) report.revealConsents[other] = report.revealConsents[other] ?? false;
      if (Object.values(report.revealConsents).filter(Boolean).length >= 2) report.status = 'revealed';
      return report;
    },
    getMatchReport(reportId) {
      const report = state.reports.find((r) => r.id === reportId) ?? null;
      if (report === null || report.status === 'revealed') return report;
      return {
        ...report,
        sections: {
          summary: 'Locked until both users consent to reveal.',
          fitPoints: [],
          watchouts: [],
          firstTopics: [],
          advice: [],
          councilNote: 'Locked',
        },
      };
    },
    persist,
    audit,
  };

  const writeMethods = new Set<keyof AinderStore>([
    'reset',
    'createUser',
    'login',
    'configureBuilderOpenAiKey',
    'configureCocounKey',
    'saveRetentionPreference',
    'uploadKakaoTxt',
    'sanitizeConversation',
    'deleteRawUpload',
    'confirmSanitizedConversation',
    'generatePersonaProfile',
    'setPersonaFieldVisibility',
    'updatePersonaSection',
    'confirmPublicProfileFields',
    'publishPublicProfile',
    'recordSwipeInterest',
    'startDirectPersonaChat',
    'sendDirectPersonaMessage',
    'startToblPersonaSimulation',
    'runToblSimulationTurns',
    'continuePersonaExploration',
    'createMatchRequestFromConversation',
    'respondMatchRequest',
    'generateMatchReport',
    'selectFriendPersonaCouncilMembers',
    'startCocounReportCouncil',
    'summarizeCocounCouncilOutput',
    'requestReportReveal',
    'consentReportReveal',
  ]);

  return api;
}
