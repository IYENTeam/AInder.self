# AInder Core Flow Spec

## Goal
Build a mobile-first, privacy-first matching flow where users log in with an ID/password account, upload KakaoTalk conversation history, generate a sanitized persona profile through OpenAI, swipe through other users' public profiles, explore liked profiles through persona-agent conversations, and send a match request with that conversation context only when they decide they are interested.

## User Flow
1. User logs in with ID and password.
2. User lands on the conversation-source screen.
3. If the user has no prior conversation data, the only primary action is adding a KakaoTalk `.txt` conversation export.
4. If the user already has conversation data, the screen offers `Add more conversations` or `Start as-is`.
5. System removes personal and sensitive information from the raw conversation.
6. System sends only sanitized content to OpenAI to generate a draft persona profile.
7. GGUI renders a mobile-first persona generation/review UI that explains the inferred traits, confidence, evidence snippets from sanitized text, and public/private field separation.
8. User edits, hides, or confirms each persona section before publishing the public profile projection.
9. User enters a mobile-first Tinder-style swipe UI for sanitized public profiles.
10. User swipes left on a profile to mark interest and open a persona-conversation path; this does not require the other user's prior consent and does not create a match.
11. User chooses one of two exploration modes: `상대 페르소나와 직접 대화하기` or `내 페르소나로 대화시키기`.
12. `상대 페르소나와 직접 대화하기` lets the user chat directly with the target user's public/sanitized persona agent.
13. `내 페르소나로 대화시키기` lets the user's persona agent and the target user's persona agent run a tobl.ai conversation simulation.
14. Persona-agent simulation starts with 10 turns by default.
15. After the initial exploration, the user chooses one of: `그만 얘기할래요`, `더 얘기할래요`, or `매칭 요청할래요`.
16. `그만 얘기할래요` ends the exploration path without notifying the target user.
17. `더 얘기할래요` requests more persona conversation; additional simulated turns require the requesting user's explicit action and remain capped at 50 total turns for that exploration.
18. `매칭 요청할래요` sends the target user a match request that includes the selected conversation transcript/summary as context.
19. The target user accepts or rejects the match request.
20. If accepted, the system creates a match and can open a real conversation handoff.
21. Match report is generated from the persona conversation/simulation and hidden until both users consent to reveal it.
22. Raw uploaded file is deleted by default after processing unless the user explicitly opts into retention.

## Core Domain Rules
- Raw upload files must never be publicly visible.
- OpenAI must receive sanitized conversation text, not raw uploaded text.
- Public discovery must expose only curated/sanitized profile fields.
- A left swipe records one-sided interest and opens a persona-conversation exploration path; it does not create a match.
- A match is created only when the interested user sends a match request and the target user accepts it.
- Persona exploration has two modes: direct user-to-target-persona chat, or user's persona agent talking to target persona agent.
- Agent-to-agent persona simulation uses tobl.ai.
- A simulation starts with a 10-turn allowance.
- A simulation must stop at 50 turns regardless of user actions.
- Match reports require bilateral reveal consent.
- Match report generation may use Cocoun as an AI council layer: invited friend personas and/or built-in evaluator personas review sanitized persona conversation evidence, vote/comment, and produce a consensus-style report.
- Cocoun inputs must be sanitized persona/conversation summaries only; raw KakaoTalk text, direct identifiers, and hidden persona fields must never be sent.
- Friend personas can join a report council only with explicit opt-in from the friend persona owner or by using pre-approved demo friend personas.
- Raw uploads are ephemeral by default; retention must be explicit, auditable, and revocable.
- After persona exploration, user choices branch into stop, continue exploration, or send match request with conversation context.
- Mobile-first interaction is the default product surface; desktop layouts are secondary.

## Persona Generation Review UX
- Persona generation must feel like an explainable review workflow, not a static AI result page.
- GGUI should first show generation progress by section: talk style, interests, relationship style, boundaries/dealbreakers, public profile draft, and privacy re-check.
- Generated persona output is split into mobile trait cards.
- Each trait card must include: inferred trait, short user-friendly summary, confidence score, sanitized evidence snippets, recommended visibility, current visibility, and edit controls.
- Visibility states are `public`, `private`, and `hidden`.
- `public` fields can appear in swipe discovery and match request context.
- `private` fields can guide the user's persona agent but are not directly shown to other users.
- `hidden` fields are excluded from both public profile display and persona-agent memory.
- Low-confidence traits should be grouped into a `확인 필요` section before publishing.
- Sensitive or risky traits should default to `private` or `hidden`, never `public`.
- GGUI should render a privacy review summary showing removed categories and counts, not raw messages.
- GGUI should render a public profile preview showing exactly how the profile appears in the swipe deck.
- Publishing requires explicit user confirmation of public fields.
- Raw KakaoTalk text, unredacted messages, phone numbers, real names, exact addresses, account IDs, and other direct identifiers must never be sent to GGUI story data.
- GGUI story data may include sanitized snippets such as short redacted paraphrases used to explain a trait.

## Privacy Requirements
- Separate raw uploads from sanitized conversation records.
- Delete raw upload storage object after successful sanitization unless retention is enabled.
- Store sanitization metadata: processor version, timestamp, detected categories, and deletion status.
- Do not introduce OAuth provider access-token storage in the MVP.
- Store passwords only as salted password hashes; never store plaintext passwords.
- Keep public profile and private persona/profile-generation inputs as separate records.
- Log access to raw retained files and match reports.

## Suggested Main Entities
- `User`: ID/password identity, account status, BYOK configuration reference.
- `AuthCredential`: user ID, password hash, password policy metadata.
- `ConversationUpload`: upload metadata, retention choice, deletion status.
- `SanitizedConversation`: redacted text, redaction summary, source upload reference.
- `PersonaProfile`: private model output, confidence/evidence metadata, user-confirmed public projection.
- `PublicProfile`: discoverable profile snapshot.
- `PersonaProfileRevision`: persona profile, edited fields, hidden fields, user confirmation state.
- `PersonaTrait`: persona profile, trait category, summary, confidence, sanitized evidence snippets, recommended visibility, current visibility.
- `PersonaVisibilityDecision`: persona trait/field, user-selected visibility, timestamp.
- `SwipeInterest`: actor, target public profile, direction/decision, timestamp.
- `PersonaConversation`: initiating user, target user, mode, status, turn/message count.
- `PersonaConversationMessage`: conversation ID, speaker type, message content, turn/message index.
- `MatchRequest`: requester, recipient, attached persona conversation summary/transcript reference, status.
- `Match`: users, accepted match request, status.
- `PersonaSimulation`: participants, turn count, status, provider metadata.
- `PersonaConversationContinuation`: conversation/simulation, requested additional turn/message count, requester, timestamp.
- `RealConversationConsent`: match, user, consent status, handoff channel state.
- `MatchReport`: report content, visibility status.
- `ReportRevealConsent`: match report, user, consent status.
- `CocounCouncilRun`: match report, provider run ID, evaluator personas, poll/vote summary, status.
- `FriendPersonaCouncilMember`: owner user, persona profile reference, consent status, display label, council participation scope.

## MVP Acceptance Criteria
- User can create/log in to an ID/password account without social login.
- User can upload KakaoTalk `.txt` and receive a GGUI-assisted generated persona profile review.
- Persona review shows trait confidence and sanitized evidence snippets without exposing raw conversation text.
- User can set each persona trait/field to `public`, `private`, or `hidden`.
- Existing conversation data lets the user choose between adding more data or starting as-is.
- Raw file is deleted after processing by default.
- User can opt into retaining raw file before upload processing completes.
- Sanitized public profile is browsable in a mobile-first swipe UI.
- Left swipe records one-sided interest and opens persona exploration, not an immediate match.
- User can choose direct chat with the target persona or agent-to-agent persona simulation.
- Persona profile publication requires user confirmation of public fields.
- Agent-to-agent persona simulation runs through tobl.ai and starts with 10 turns.
- User can stop, continue exploration up to 50 turns, or send a match request with conversation context.
- Match is created only when the target user accepts the match request.
- Real-conversation handoff is available only after the target user accepts the match request.
- Match report remains hidden until both users consent.
- Cocoun-backed report generation uses only sanitized persona conversation summaries and safe public/private-for-agent traits, never raw uploads or hidden fields.

## GGUI Track Implementation Direction
- Use GGUI as the mobile-first generative UI layer for login, BYOK setup, upload review, persona generation/review, swipe discovery, persona exploration choices, match request review, and report reveal consent.
- Bootstrap with `npx @ggui-ai/create-agentic-app@alpha`.
- Use the OpenAI Agents SDK template; OpenAI handles persona generation, while tobl.ai simulation is accessed through MCP tools.
- Use BYOK: users/builders provide their own OpenAI key.
- Implement AInder business actions as MCP tools; generated UI must call MCP tools rather than bypassing server-side rules.
- Never pass raw KakaoTalk upload content to GGUI UI state. GGUI receives sanitized summaries, profile projections, consent state, and simulation/report state only.
- Keep raw upload deletion, redaction, simulation turn limits, match-request acceptance, and mutual report-reveal consent enforcement in server-side MCP tools.

## Open Questions
1. Should profile generation require explicit user review before publishing, or auto-publish a conservative subset?
2. What exact sensitive data categories must be removed: names, phone numbers, addresses, workplaces, schools, account IDs, health, politics, religion, finances, sexuality, minors?
3. Should retained raw files have a maximum retention period?
4. Should users be able to delete generated persona profiles, persona conversations, and simulations?
5. Should match report reveal consent be revocable before both users consent?
6. What monetization or quota rules apply to persona exploration continuations?
