# AInder RALPLAN Consensus Plan

## Status
- State: pending approval
- Source spec: `.gjc/specs/deep-interview-ainder-workflows.md`
- Supporting context: `.gjc/plans/ggui-track-implementation.md` (this consensus plan is the source of truth where artifacts differ)
- Planning mode: ralplan consensus, direct from deep-interview spec
- Execution boundary: no source mutation, bootstrap command, implementation delegation, commit, push, or PR until separate explicit execution approval

## RALPLAN-DR Summary

### Principles
1. Privacy by construction: raw KakaoTalk text, hidden fields, direct identifiers, and full private persona memory never leave the app MCP server boundary.
2. Server-enforced rules: GGUI renders sanitized state and user choices; app MCP tools enforce privacy, turn caps, match acceptance, consent, and external-provider egress.
3. Projection-first integrations: GGUI, OpenAI, tobl.ai, and Cocoun adapters receive purpose-built projections, never raw domain entities.
4. Mobile-first demo path: prioritize the end-to-end hackathon flow from upload to Cocoun friend-persona report.
5. Conversation guidance over scoring: reports and exploration outputs produce first-message ideas, fit points, watchouts, and friend-like advice, not numeric compatibility scores.

### Decision Drivers
1. Privacy safety: no raw text or hidden persona fields may reach OpenAI/GGUI/tobl.ai/Cocoun.
2. Demo completeness: both exploration modes, 10-turn tobl.ai simulation, match request, accepted handoff, and Cocoun friend-persona council report must be demonstrable.
3. Implementation speed: use a greenfield template, in-memory/demo storage, and seeded data while preserving future production module boundaries.

### Viable Options

#### Option A — Chosen: GGUI + OpenAI Agents SDK template + single app MCP server + in-memory/demo storage
Pros:
- Fastest path for hackathon MVP.
- Clear single policy boundary for upload, redaction, visibility, matching, report reveal, and external-provider egress.
- GGUI story data can be forced through sanitized projections.
- tobl.ai/Cocoun calls stay behind server-side adapter wrappers.

Cons:
- Production auth, persistence, audit logs, and object storage remain follow-ups.
- Single server can become a large module unless internal boundaries are explicit.

#### Option B — Production-first DB/auth/service split
Pros:
- Stronger persistence, auditability, and future compliance posture.
- Better for long-term multi-user real deployment.

Cons:
- Too slow for hackathon MVP.
- Pushes infrastructure ahead of the differentiating GGUI/tobl.ai/Cocoun demo loop.
- Adds auth/provider complexity that the spec explicitly excludes from MVP.

#### Option C — Static React UI without GGUI
Pros:
- More deterministic UI implementation.
- Fewer generated-UI integration risks.

Cons:
- Misses GGUI track value.
- Persona review, council selection, and dynamic state explanation become less differentiated.

#### Option D — Direct client calls to OpenAI/tobl.ai/Cocoun
Pros:
- Fewer server wrappers initially.

Cons:
- Violates server-enforced privacy principles.
- Harder to prevent raw/hidden data leakage.
- Harder to test egress and fallback states.

#### Option E — Only one persona exploration mode
Pros:
- Smaller scope.

Cons:
- Contradicts deep-interview decision that direct target-persona chat and my-persona-to-target-persona simulation both belong in MVP at equal quality.

### Decision
Choose Option A with strict internal module boundaries, projection-first adapter contracts, explicit fallback labels, and privacy fixture verification.

## ADR

### Decision
AInder MVP will be implemented from `npx @ggui-ai/create-agentic-app@alpha` using the OpenAI Agents SDK template. GGUI is the mobile-first generative UI layer. A single app MCP server owns all state transitions and policy enforcement: account/session, upload/sanitization, persona review, discovery, persona exploration, match request/acceptance, Cocoun report generation, and consent gates. Storage starts as in-memory/demo seed storage, with interfaces shaped for later persistence.

### Drivers
- Builder-managed OpenAI key for hackathon MVP; users do not enter their own key in the MVP path.
- Raw text and hidden fields must never cross external integration boundaries.
- Both persona exploration modes are core differentiators.
- Left swipe means private exploration, not match/notification.
- Match request must carry enough context to be natural while minimizing disclosure.
- Cocoun friend-persona council should feel social/playful, not like a clinical score.

### Alternatives Considered
- Production-first infrastructure: deferred due speed and MVP scope.
- Static UI: rejected because it weakens GGUI track differentiation.
- Direct provider calls from UI: rejected due privacy and testability risk.
- One exploration mode: rejected because user explicitly chose both modes at equal MVP weight.

### Consequences
- MVP can demo the full differentiating loop quickly.
- Future persistence/audit/auth hardening remains explicit follow-up.
- Projection contracts and privacy fixtures become critical implementation gates.
- Fallback/cached/demo outputs must be visibly labeled to avoid pretending external providers succeeded.

### Follow-ups
- Persistent DB and encrypted raw object storage if product continues.
- Audit log for all egress and consent actions.
- Real friend persona owner opt-in UX beyond demo personas.
- Provider retry/backoff and observability for OpenAI/tobl.ai/Cocoun.

## Implementation Phases

### Phase 0 — Bootstrap and internal boundaries
- Use `npx @ggui-ai/create-agentic-app@alpha` and choose OpenAI Agents SDK.
- Create module boundaries:
  - `auth`
  - `settings`
  - `uploads`
  - `privacy/projections`
  - `persona`
  - `discovery`
  - `exploration`
  - `matching`
  - `reports`
  - `ggui/stories`
  - `fixtures`
- Seed demo users, demo friend personas, and sample KakaoTalk `.txt` files.

Acceptance:
- Project boots after approved execution.
- Module skeleton separates policy/projection/adapters from UI stories.

### Phase 1 — Account, builder key, and conversation source gate
- Implement ID/password demo login.
- MVP uses builder-managed OpenAI key; no user BYOK wizard in normal flow.
- Optional/admin future path may configure builder keys.
- Implement source gate:
  - no data: `대화 내용 추가하기` only
  - existing data: `대화 내용 추가하기` and `그냥 시작하기`

Acceptance:
- User can log in.
- Builder key presence allows persona flow.
- User key input is not required in MVP happy path.

### Phase 2 — Upload, sanitization, and raw lifecycle
- Accept `.txt` only.
- Parse and sanitize seeded KakaoTalk exports.
- Show redaction category counts, not raw text.
- Implement `RawUploadStore` abstraction.
- `deleteRawUpload(uploadId)` is idempotent.
- External calls are blocked until raw deletion completes or explicit retention decision is recorded.

Acceptance:
- Non-`.txt` files fail.
- Raw file deletion default is observable.
- OpenAI/GGUI/tobl.ai/Cocoun cannot be called before raw lifecycle state is resolved.

### Phase 3 — Persona generation and GGUI review
- OpenAI receives `SanitizedConversationProjection` only.
- Generate persona traits with confidence, sanitized evidence snippets, recommended visibility.
- GGUI review stages:
  - generation progress
  - AI interpretation cards
  - review-required queue
  - public/private/hidden controls
  - public swipe-card preview
  - publish confirmation
- Sensitive/low-confidence traits default to private/hidden or review-required.

Acceptance:
- No raw text in story data.
- User can set each trait/field to `public`, `private`, or `hidden`.
- Publish requires explicit public-field confirmation.

### Phase 4 — Swipe discovery
- Build mobile card deck from `PublicProfileProjection` only.
- Left swipe records `SwipeInterest` and opens exploration mode chooser.
- Left swipe must not notify target user or create `Match`.

Acceptance:
- User with no published profile cannot enter deck.
- Left swipe immediately routes to mode chooser.
- Match count remains unchanged after swipe.

### Phase 5 — Persona exploration
- Implement both modes:
  - `상대 페르소나와 직접 대화하기`
  - `내 페르소나로 대화시키기`
- Shared aggregate: `PersonaConversation`.
- tobl.ai adapter receives `PersonaAgentMemoryProjection` only.
- Initial agent-to-agent simulation produces 10 turns.
- Hard cap: 50 turns/messages.
- Produce exploration summary, fit points, watchouts, first-message candidates, and 2-3 good moments.

Acceptance:
- Both modes work at MVP quality.
- Generic outputs that cannot produce first-message/reason/fit/watchout are marked failed.
- Turn/message cap is enforced server-side.

### Phase 6 — Match request and acceptance
- Default attachment is exactly:
  - summary
  - 2-3 good moments
  - user-editable message
- Full transcript is not a default attachment.
- Redacted short snippets may be attached only if explicitly selected and previewed.
- Recipient sees `MatchRequestRecipientContext` only.
- Accepted request creates `Match` and opens handoff.

Acceptance:
- Request preview shows exactly what recipient will see.
- Hidden/private disallowed fields are absent.
- Match is created only after recipient accepts.

### Phase 7 — Cocoun friend-persona council report
- Use demo friend personas for MVP.
- Keep real friend owner opt-in model in data structures.
- Show council selector: `누구한테 물어볼까요?`
- Council input is `CocounInputProjection` only.
- Cocoun output becomes a guide report:
  - 첫 메시지
  - 맞는 점
  - 조심할 점
  - 친구 같은 조언
- No numeric compatibility score.
- Reveal requires both users' consent.
- Provider status distinguishes:
  - `providerSuccess`
  - `providerFailure`
  - `cachedDemo`
  - `seededFallback`

Acceptance:
- Demo friend personas can be selected.
- Council input excludes raw text, hidden fields, direct identifiers.
- Cached/fallback/demo outputs are labeled in UI and state.
- Report stays locked until both reveal consents exist.

## Projection Contracts
External adapters and GGUI story builders must accept projections only.

### `GguiStoryDataProjection`
Allowed:
- sanitized redaction summary
- persona trait summaries
- sanitized evidence snippets
- visibility states
- public profile preview
- consent states
- provider status labels

Forbidden:
- raw KakaoTalk text
- unredacted messages
- direct identifiers
- hidden fields
- full private persona memory

### `PersonaAgentMemoryProjection`
Allowed:
- public traits
- private-for-agent traits
- safe conversation style guidance

Forbidden:
- hidden traits
- raw snippets
- direct identifiers

### `MatchRequestRecipientContext`
Allowed by default:
- requester public profile
- requester message
- conversation summary
- 2-3 good moments

Allowed only with explicit sender selection and preview:
- redacted short snippets

Forbidden by default:
- full transcript
- hidden/private fields that are not recipient-safe

### `CocounInputProjection`
Allowed:
- sanitized persona summaries
- public traits
- safe private-for-agent traits needed for reasoning
- sanitized exploration summary
- selected redacted evidence snippets

Forbidden:
- raw KakaoTalk text
- unredacted messages
- hidden fields
- direct identifiers
- full private memory unrelated to current exploration

## Core Data Model
- `User`
- `ConversationUpload`
- `SanitizedConversation`
- `PersonaProfile`
- `PersonaTrait`
- `PersonaVisibilityDecision`
- `PublicProfile`
- `SwipeInterest`
- `PersonaConversation`
- `PersonaConversationMessage`
- `MatchRequest`
- `Match`
- `CocounCouncilRun`
- `FriendPersonaCouncilMember`
- `MatchReport`
- `ReportRevealConsent`
- `ConsentRecord`

### `ConsentRecord`
Minimum shape:
- `id`
- `userId`
- `subjectType`: `publicProfilePublish | matchRequestContext | reportReveal | friendPersonaCouncilOptIn | rawRetention`
- `subjectId`
- `decision`
- `visiblePayloadSummary`
- `createdAt`

Use this for consistent audit-like consent tracking even in MVP in-memory storage.

## MCP Tool Groups

### Auth/setup
- `create_user_account(userId, password)`
- `login_with_password(userId, password)`
- `get_current_user()`
- `configure_builder_openai_key(encryptedKeyRef)`
- `configure_cocoun_mcp_key(encryptedKeyRef)`
- `save_retention_preference(retainRawUploads)`

### Upload/sanitization
- `get_conversation_source_state(userId)`
- `prepare_conversation_upload(userId)`
- `upload_kakao_txt(fileRef, retainRawUpload)`
- `sanitize_conversation(uploadId)`
- `delete_raw_upload(uploadId)`
- `confirm_sanitized_conversation(sanitizedConversationId)`

### Persona review
- `generate_persona_profile(sanitizedConversationId)`
- `get_persona_generation_status(profileId)`
- `get_persona_review_state(profileId)`
- `explain_persona_trait(profileId, traitId)`
- `update_persona_section(profileId, sectionPatch)`
- `set_persona_field_visibility(profileId, fieldId, visibility)`
- `generate_public_profile_preview(profileId)`
- `confirm_public_profile_fields(profileId, fieldIds)`
- `publish_public_profile(profileId)`

### Discovery/exploration/matching/reporting
- `get_swipe_deck(filters)`
- `record_swipe_interest(targetUserId, direction)`
- `open_persona_exploration(targetUserId)`
- `start_direct_persona_chat(targetUserId)`
- `send_direct_persona_message(conversationId, message)`
- `start_tobl_persona_simulation(targetUserId)`
- `run_tobl_simulation_turns(simulationId, turnCount)`
- `continue_persona_exploration(conversationId, additionalTurnCount)`
- `preview_match_request_context(conversationId)`
- `create_match_request_from_conversation(conversationId, messageToRecipient)`
- `respond_match_request(matchRequestId, decision)`
- `open_real_conversation_if_matched(matchId)`
- `select_friend_persona_council_members(reportId, memberIds)`
- `start_cocoun_report_council(conversationId)`
- `get_cocoun_report_council_status(reportId)`
- `summarize_cocoun_council_output(reportId)`
- `request_report_reveal(reportId)`
- `consent_report_reveal(reportId, consent)`
- `get_match_report(reportId)`

## Verification Plan

### Unit tests
- Sanitizer removes seeded identifiers.
- `deleteRawUpload` is idempotent.
- External calls are blocked before raw lifecycle resolution.
- Visibility filtering excludes hidden fields from all projections.
- Left swipe creates `SwipeInterest` and not `Match`.
- tobl.ai simulation starts at 10 turns and caps at 50 turns/messages.
- Match request default context is summary + 2-3 good moments, not full transcript.
- Report reveal unlocks only with both consents.
- Provider status distinguishes success/failure/cached/fallback.

### Integration tests
- Upload → sanitize → persona review → publish → swipe → exploration → request → accept → report locked/revealed.
- Direct persona chat and tobl.ai simulation both produce exploration summaries.
- Cocoun report path with demo friends.
- Cocoun fallback/cached demo path is visibly labeled.

### Snapshot/fixture checks
- GGUI story data contains no raw text, direct identifiers, full private memory, or hidden fields.
- `CocounInputProjection` contains no raw/hidden/direct identifiers.
- `MatchRequestRecipientContext` contains only allowed default context.

### Manual demo QA
- Mobile navigation and CTAs match the intended Korean copy.
- Persona review cards are understandable and editable.
- Left swipe immediately opens mode chooser.
- Friend persona council selector feels playful and clearly demo-labeled.
- Report reads like a conversation guide, not a scorecard.

## Risk Mitigations
- Privacy leakage: projection builders plus snapshot tests.
- External provider instability: wrapper status model with labeled fallback/cached paths.
- Scope creep: both exploration modes are in MVP, but production auth/DB/real friend UX are follow-ups.
- Swipe convention confusion: UI copy says left swipe means `비공개로 먼저 알아보기`.
- Report overreach: no score, advisory copy only, Cocoun cannot decide matches.

## Consensus Review Summary

### Architect
- Initial verdict: WATCH.
- Recheck verdict: WATCH but safe to mark pending approval.
- Main findings incorporated:
  - transcript attachment narrowed to summary + 2-3 good moments.
  - MVP key responsibility fixed to builder-managed OpenAI key.
  - fallback/cached/demo provider status made explicit.
  - projection-first adapter boundary added.
  - raw deletion lifecycle invariant added.
  - consent ledger minimum model added.
  - consensus plan marked as source of truth where planning artifacts differ.

### Critic
- Initial verdict: ITERATE.
- Final recheck verdict: APPROVE.
- Required changes incorporated:
  - BYOK language corrected for MVP.
  - full transcript default attachment forbidden.
  - projection-only contracts added.
  - fallback/cached/demo labeling acceptance added.
  - raw lifecycle gating before external calls added.
  - alternatives rejection rationale expanded.
  - stale supporting-plan conflicts cleaned up.

## Pending Approval
This plan is approved for planning refinement only and remains pending approval for execution. Execution may proceed only after a separate explicit user approval selecting an execution path such as `team`.
