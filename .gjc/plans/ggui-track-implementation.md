# GGUI Track Implementation Plan

## Decision
Use GGUI as the primary mobile-first generative UI layer for AInder. Bootstrap with `npx @ggui-ai/create-agentic-app@alpha`, choose the OpenAI Agents SDK template, and use a builder-managed OpenAI key for the hackathon MVP.

Rationale:
- The product depends on OpenAI for persona generation and uses tobl.ai for persona-agent simulation, so OpenAI Agents SDK keeps the agent stack simple while the simulation provider stays behind MCP tools.
- GGUI's scoring favors dynamic context-sensitive UI, multi-turn continuity, and MCP tool usage; AInder's mobile onboarding, profile review, swipe deck, simulation choices, and report reveal are all strong generative UI moments.
- MCP tools map cleanly to the product's domain actions.

## GGUI Surfaces to Build

### 0. ID/Password Login
Mobile-first login screen with:
- User ID.
- Password.
- Create-account path for first-time demo users.
- No Google/Kakao/Apple social-login entry points.

MCP tools:
- `create_user_account(userId, password)`
- `login_with_password(userId, password)`
- `get_current_user()`

### 1. Builder Key Setup
Generative UI/admin setup collects and validates:
- Builder-managed OpenAI API key.
- Raw upload retention preference.
- No user BYOK or social-login/OAuth configuration in the MVP user flow.

MCP tools:
- `configure_builder_openai_key(encryptedKeyRef)`
- `validate_openai_key()`
- `save_retention_preference(retainRawUploads)`

### 2. Conversation Source Gate
Mobile-first screen after login:
- If no conversation data exists, show only `대화 내용 추가하기`.
- If conversation data exists, show `대화 내용 추가하기` and `그냥 시작하기`.
- Explain that raw uploads are deleted by default after sanitization.

MCP tools:
- `get_conversation_source_state(userId)`
- `choose_start_with_existing_conversations(userId)`
- `prepare_conversation_upload(userId)`

### 3. KakaoTalk Upload + Sanitization Review
Generative UI presents:
- `.txt` upload state.
- Sanitization progress.
- Redaction summary by category.
- User confirmation before persona generation.

MCP tools:
- `upload_kakao_txt(fileRef, retainRawUpload)`
- `sanitize_conversation(uploadId)`
- `delete_raw_upload(uploadId)`
- `confirm_sanitized_conversation(sanitizedConversationId)`

### 4. Persona Generation + Profile Review
GGUI should turn persona generation into an explainable, editable mobile workflow instead of a static result page.

UI stages:
1. `생성 중`: section-by-section progress for talk style, interests, relationship style, boundaries/dealbreakers, public profile draft, and privacy re-check.
2. `AI 해석 카드 리뷰`: mobile trait cards with inferred trait, short summary, confidence, sanitized evidence snippets, recommended visibility, current visibility, and edit controls.
3. `확인 필요`: low-confidence or sensitive cards grouped at the top before publishing.
4. `공개 범위 설정`: field-level `public`, `private`, `hidden` controls.
5. `프로필 카드 미리보기`: render the exact mobile swipe-card preview other users will see.
6. `공개하기`: final confirmation before publishing public fields.

Trait card rules:
- Show confidence as an understandable label plus score, e.g. `높음 88%`, `확인 필요 61%`.
- Evidence snippets must be sanitized paraphrases or redacted short quotes only.
- Sensitive categories default to `private` or `hidden`.
- `public` fields may appear in swipe discovery and match request context.
- `private` fields may guide the user's persona agent but are not directly visible to other users.
- `hidden` fields are excluded from both public profile and persona-agent memory.
- Every card must have a clear `수정하기` path.

MCP tools:
- `generate_persona_profile(sanitizedConversationId)`
- `get_persona_generation_status(profileId)`
- `get_persona_review_state(profileId)`
- `explain_persona_trait(profileId, traitId)`
- `update_persona_section(profileId, sectionPatch)`
- `set_persona_field_visibility(profileId, fieldId, visibility)`
- `generate_public_profile_preview(profileId)`
- `confirm_public_profile_fields(profileId, fieldIds)`
- `publish_public_profile(profileId)`

GGUI `story.data` shape:
```ts
{
  profileId: string,
  generationStatus: "generating" | "review_required" | "ready_to_publish",
  progress: Array<{ section: string, status: "pending" | "running" | "done" }>,
  traits: Array<{
    id: string,
    category: "talk_style" | "interests" | "relationship_style" | "boundaries" | "dealbreakers",
    title: string,
    summary: string,
    confidence: number,
    evidenceSnippets: string[],
    recommendedVisibility: "public" | "private" | "hidden",
    visibility: "public" | "private" | "hidden",
    needsReview: boolean
  }>,
  privacySummary: {
    removedCategories: Array<{ category: string, count: number }>
  },
  publicPreview: {
    headline: string,
    chips: string[],
    visibleTraitIds: string[],
    hiddenFieldsCount: number
  }
}
```

Never include in GGUI `story.data`:
- Raw KakaoTalk text.
- Unredacted messages.
- Phone numbers, real names, exact addresses, account IDs.
- Full private persona memory.
- Any direct identifier that survived sanitization.

### 5. Tinder-Style Swipe Discovery
Generative UI presents a full-screen mobile card stack:
- One sanitized public profile per card.
- Swipe gesture controls.
- MVP maps left swipe to one-sided interest.
- Left swipe opens persona exploration; it does not require reciprocal interest and does not create a match.

MCP tools:
- `get_swipe_deck(filters)`
- `record_swipe_interest(targetUserId, direction)`
- `open_persona_exploration(targetUserId)`
- `dismiss_profile(targetUserId)`

### 6. Persona Exploration Console
Generative UI shows:
- The selected target profile's sanitized public persona.
- Mode choice: `상대 페르소나와 직접 대화하기` or `내 페르소나로 대화시키기`.
- Direct user-to-target-persona chat transcript.
- Agent-to-agent tobl.ai simulation transcript.
- Current turn/message count.
- Three post-exploration choices: `그만 얘기할래요`, `더 얘기할래요`, `매칭 요청할래요`.
- Hard cap at 50 simulated turns/messages per exploration.

MCP tools:
- `start_direct_persona_chat(targetUserId)`
- `send_direct_persona_message(conversationId, message)`
- `start_tobl_persona_simulation(targetUserId)`
- `run_tobl_simulation_turns(simulationId, turnCount)`
- `submit_persona_exploration_choice(conversationId, choice)`
- `continue_persona_exploration(conversationId, additionalTurnCount)`
- `create_match_request_from_conversation(conversationId, messageToRecipient)`
- `stop_persona_exploration(conversationId)`

### 7. Match Request Review
Generative UI presents to the target user:
- Requester's sanitized public profile.
- The requester's message.
- Attached persona conversation summary + 2-3 good moments preview.
- Accept/reject controls.
- Clear copy that accepting creates the actual match.

MCP tools:
- `get_incoming_match_requests()`
- `get_match_request(matchRequestId)`
- `respond_match_request(matchRequestId, decision)`
- `open_real_conversation_if_matched(matchId)`

### 8. Cocoun-Backed Match Report Reveal
Generative UI presents:
- Locked report state.
- Cocoun council generation state.
- Both-party reveal consent status.
- Report once both users consent.
- Separate state from real-conversation consent.
- Transparent note that multiple evaluator agents reviewed sanitized evidence.

Report formation:
- Use Cocoun MCP as an AI council layer.
- Best demo path: selected `친구 페르소나` join the Cocoun council and comment/vote on the sanitized exploration evidence.
- Friend personas make the report feel like asking trusted friends for read-outs, not receiving a clinical compatibility score.
- Use 3-5 council members by default: friend personas when available, seeded demo friend personas for MVP, and built-in evaluator personas as fallback.
- Feed the council only sanitized persona/conversation summaries and selected redacted transcript snippets.
- Convert Cocoun votes/comments into a user-facing report with no numeric compatibility score.

Friend persona council UI:
- `누구한테 물어볼까요?`
- Options: `내 친구 페르소나 추가`, `기본 평가단 사용`, `친구 + 기본 평가단 섞기`.
- Show each council member's label and viewpoint.
- Require opt-in for real friend personas; demo personas must be clearly labeled.

MCP tools:
- `generate_match_report(conversationId)`
- `start_cocoun_report_council(conversationId)`
- `get_cocoun_report_council_status(reportId)`
- `summarize_cocoun_council_output(reportId)`
- `request_report_reveal(reportId)`
- `consent_report_reveal(reportId, consent)`
- `configure_cocoun_mcp_key(encryptedKeyRef)`
- `select_friend_persona_council_members(reportId, memberIds)`
- `invite_friend_persona_to_council(friendPersonaId, scope)`
- `get_available_friend_personas()`
- `get_match_report(reportId)`

## MCP Server Boundaries

Keep privacy-sensitive business logic in the app MCP server, not in generated UI components:
- Redaction and deletion are server-side only.
- Raw upload file refs are never sent to GGUI as display data.
- GGUI story data receives only sanitized summaries and public profile data.
- Persona exploration uses sanitized persona profiles, not raw conversations; agent-to-agent simulations are executed through tobl.ai after the user swipes left on a profile.
- Persona generation UI may show sanitized evidence snippets and confidence metadata, but never raw conversation excerpts.
- Friend personas can participate in Cocoun councils only with explicit opt-in or as clearly labeled seeded demo personas.

## GGUI Story Patterns

Use `ggui_push` with stable, mobile-first intents so generated components can be reused:
- `"AInder mobile ID password login"`
- `"AInder builder key setup"`
- `"Conversation source gate"`
- `"KakaoTalk upload sanitization review"`
- `"Explainable persona generation and profile review"`
- `"Mobile swipe profile deck"`
- `"Persona exploration mode chooser"`
- `"Direct target persona chat"`
- `"tobl.ai persona simulation control room"`
- `"Persona exploration next action"`
- `"Match request with conversation context"`
- `"Incoming match request review"`
- `"Friend persona Cocoun council selector"`
- `"Mutual match report reveal consent"`

For each push:
- `story.data`: sanitized state to render.
- `story.sourceTools`: MCP tools that produced the state.
- `story.wiredTools`: MCP tools available as UI actions.
- `story.context`: user stage, privacy constraints, consent requirements.

## Demo Path for Hackathon
1. Bootstrap: `npx @ggui-ai/create-agentic-app@alpha`.
2. Select OpenAI Agents SDK template.
3. Implement the AInder MCP server tools above, starting with in-memory storage for demo speed.
4. Use ID/password accounts for demo users; do not build social login.
5. Use sample KakaoTalk `.txt` files with seeded sensitive data to demonstrate redaction.
6. Demonstrate both conversation-source states: no data (`대화 내용 추가하기` only) and existing data (`대화 내용 추가하기` / `그냥 시작하기`).
7. Show explainable persona generation: progress stages, confidence/evidence trait cards, `public/private/hidden` controls, low-confidence review, and swipe-card preview before publishing.
8. Seed two users and let one user left-swipe a target profile to open persona exploration.
9. Demonstrate both exploration modes: direct chat with target persona and my-persona-to-target-persona tobl.ai simulation.
10. Run the initial 10-turn tobl.ai persona simulation.
11. Show the three post-exploration choices: `그만 얘기할래요`, `더 얘기할래요`, `매칭 요청할래요`.
12. Demonstrate continuing exploration and the 50-turn cap.
13. Send a match request with the persona conversation summary and 2-3 good moments attached.
14. Accept the request as the target user and open real-conversation handoff.
15. Generate a report and keep it locked until both reveal consents are submitted.

## Verification Checklist
- No Google/Kakao/Apple social-login setup is required for the MVP.
- User can create and log in with ID/password.
- Upload accepts only `.txt` for KakaoTalk import.
- Existing conversation state controls whether `그냥 시작하기` is available.
- OpenAI calls receive sanitized text only.
- Raw upload deletion occurs by default after sanitization.
- Retained raw upload path exists only when explicit retention was selected.
- Public discovery response excludes raw/sanitized conversation text.
- Persona generation review shows confidence/evidence metadata from sanitized snippets only.
- Public profile publication requires explicit field-level confirmation.
- Persona generation `story.data` excludes raw text, unredacted messages, direct identifiers, and full private persona memory.
- Sensitive persona traits default to `private` or `hidden`.
- Swipe discovery is mobile-first.
- Left swipe records one-sided interest and opens persona exploration; it does not create a match.
- User can choose direct chat with target persona or agent-to-agent simulation through tobl.ai.
- Persona exploration uses sanitized persona/profile inputs, not raw conversation text.
- Initial agent-to-agent simulation runs 10 turns.
- Continuing exploration requires an explicit user action.
- Persona exploration cannot exceed 50 turns/messages.
- Match request can be sent with selected conversation summary and 2-3 good moments context; full transcript is not attached by default.
- Match is created only when the target user accepts the match request.
- Real-conversation handoff is available only after accepted match request.
- Match report remains locked until both reveal consents exist.
- Cocoun report councils can include selected friend personas or fallback evaluator personas.
- Real friend personas require opt-in before council participation.
- Friend persona council inputs exclude raw text, hidden fields, and direct identifiers.
- GGUI UI actions call MCP tools rather than bypassing server-side rules.

## Sources Reviewed
- GGUI docs: https://docs.ggui.ai
- OSS quickstart: https://docs.ggui.ai/oss-quickstart/
- MCP protocol: https://docs.ggui.ai/api/mcp-protocol/
- Claude agent example: https://docs.ggui.ai/examples/claude-agent/
- npm package: https://www.npmjs.com/package/@ggui-ai/create-agentic-app/v/alpha
- Cocoun builder page: https://cocoun.org/builder
- Cocoun MCP endpoint: `https://asia-northeast3-cocouns-v.cloudfunctions.net/mcp`
