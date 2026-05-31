# AInder User Workflow Spec

## Product Workflow Principle
AInder should not jump from profile browsing to instant matching. The core loop is:

`prepare my persona → browse public personas → privately explore a liked persona → decide whether to send a match request with conversation context → recipient accepts/rejects → real conversation/report flows unlock`

The user's private exploration must feel safe: left swipe starts exploration, not notification or matching.

## Primary Mobile Navigation
Use a 4-tab mobile shell after login and setup:

1. `내 페르소나` — conversation data, persona review, public card preview.
2. `탐색` — swipe deck and persona exploration entry.
3. `요청함` — incoming/outgoing match requests.
4. `매칭` — accepted matches, real conversation handoff, reports.

Before onboarding is complete, route users into required setup screens instead of showing the full shell.

## Workflow 0: Account and BYOK Setup

### Entry
- New or returning user opens the app.

### Screens
1. `로그인`
   - Fields: ID, password.
   - Actions: `로그인`, `계정 만들기`.
   - No social login buttons.
2. `OpenAI 키 설정`
   - BYOK input.
   - Explain key is used for persona generation.
   - Validate key before continuing.
3. `업로드 보관 설정`
   - Default: raw file deleted after processing.
   - Optional: retain raw upload.

### Success State
- User has an authenticated session and usable OpenAI key.

### Failure / Edge States
- Invalid password: stay on login and show retry affordance.
- Missing OpenAI key: allow account shell access only if persona generation is blocked with a clear setup CTA.
- Invalid OpenAI key: do not continue to upload processing.

## Workflow 1: Conversation Source Gate

### Entry
- User finishes login/BYOK or taps `내 페르소나`.

### Branch A: No Conversation Data
Screen: `대화 데이터가 필요해요`
- Primary action only: `대화 내용 추가하기`.
- Explain supported format: KakaoTalk `.txt` export.
- Explain privacy: raw upload deleted by default after sanitization.

### Branch B: Existing Conversation Data
Screen: `기존 대화로 시작할까요?`
- Primary actions:
  - `그냥 시작하기`
  - `대화 내용 추가하기`
- Show freshness/context summary:
  - Last upload date.
  - Number of sanitized conversations.
  - Whether public profile is already published.

### Success State
- User either uploads new data or proceeds to persona review/profile publishing.

## Workflow 2: Upload, Sanitization, and Privacy Review

### Screens
1. `카카오톡 대화 업로드`
   - Accept `.txt` only.
   - Show retention setting before upload.
2. `개인정보 정제 중`
   - Progress states: parsing, detecting identifiers, redacting, validating.
3. `정제 결과 확인`
   - Show category counts only, not raw text:
     - names/nicknames
     - phone/email/account IDs
     - location
     - workplace/school
     - sensitive topics
   - Actions:
     - `페르소나 만들기`
     - `업로드 취소`

### Rules
- OpenAI receives sanitized content only.
- GGUI receives redaction summaries and sanitized snippets only.
- Raw file is deleted after sanitization unless retention is explicitly enabled.

## Workflow 3: GGUI Persona Generation and Review

### Goal
Turn persona generation into a trust-building review flow where the user understands, edits, and controls what becomes public.

### Stage 1: Generation Progress
Screen: `페르소나를 만들고 있어요`

Progress sections:
- 말투 분석
- 관심사 추출
- 관계 성향 정리
- 경계/딜브레이커 정리
- 공개 프로필 초안 생성
- 민감 표현 재검토

GGUI should adapt the progress display to actual generation status.

### Stage 2: AI Interpretation Cards
Screen: `AI가 이렇게 해석했어요`

Each mobile trait card includes:
- Trait category.
- User-friendly summary.
- Confidence label and score.
- Sanitized evidence snippets.
- Recommended visibility.
- Current visibility.
- `수정하기`.

Example card:

```text
대화 스타일
"상대의 감정 맥락을 확인하며 대화하는 편이에요."
신뢰도: 높음 88%
근거: "그때 기분이 어땠어?", "왜 그렇게 느꼈는지 궁금해"
공개 범위: [공개] [비공개] [숨김]
[수정하기]
```

### Stage 3: Review Required Queue
Screen: `확인 필요`

Show first when there are:
- Low-confidence traits.
- Sensitive traits.
- Traits recommended as private/hidden.
- Contradictory model interpretations.

Actions:
- `공개`
- `비공개`
- `숨김`
- `수정하기`

### Stage 4: Visibility Control
Visibility meaning:

- `public`: can appear in swipe cards and match request context.
- `private`: can guide the user's persona agent but is not directly visible to other users.
- `hidden`: excluded from public profile and persona-agent memory.

Sensitive categories default to `private` or `hidden`.

### Stage 5: Public Profile Preview
Screen: `상대에게 이렇게 보여요`

Show exact mobile swipe-card preview:
- Headline.
- Chips/interests.
- Conversation style.
- Safe public traits only.
- Hidden/private count summary.

Actions:
- `수정하기`
- `공개하기`

### Stage 6: Publish
Publishing requires explicit confirmation of public fields.

Blocked states:
- No public fields selected.
- Required low-confidence traits unresolved.
- Sensitive trait accidentally set public without extra confirmation.

## Workflow 4: Swipe Discovery

### Entry
- User has a published public profile.

### Screen
`탐색`
- Full-screen mobile card stack.
- One public profile per card.
- Left swipe = one-sided interest and opens persona exploration.
- Dismiss action skips without opening exploration.

### Important Rule
Left swipe does not notify the target user and does not create a match.

## Workflow 5: Persona Exploration After Left Swipe

### Entry
- User left-swipes a target profile.

### Screen: `어떻게 알아볼까요?`
Actions:
1. `상대 페르소나와 직접 대화하기`
2. `내 페르소나로 대화시키기`
3. `나중에 볼게요`

### Mode A: Direct Target Persona Chat
The user chats with the target's public/sanitized persona agent.

Rules:
- Use public persona plus safe private-agent behavior where allowed.
- Never reveal hidden/private source fields directly.
- User can stop anytime.

### Mode B: My Persona vs Target Persona
The user's persona agent and target persona agent run a tobl.ai simulation.

Rules:
- Initial run: 10 turns.
- Extension: explicit user action via `더 얘기할래요`.
- Hard cap: 50 turns/messages per exploration.
- Inputs are persona profiles, not raw conversations.

### Post-Exploration Choice
After initial exploration, show:
- `그만 얘기할래요`
  - Ends exploration.
  - Target is not notified.
- `더 얘기할래요`
  - Continues persona exploration.
  - Still private to the initiating user.
- `매칭 요청할래요`
  - Opens match request composer.

## Workflow 6: Match Request With Conversation Context

### Entry
- User chooses `매칭 요청할래요`.

### Screen: `매칭 요청 보내기`
Show:
- Target public profile summary.
- Selected conversation summary.
- Optional transcript preview.
- Editable message to recipient.

Default message should reference the exploration naturally without feeling creepy.

Example:
```text
우리 페르소나끼리 대화해봤는데 대화 결이 잘 맞는 것 같았어요.
실제로도 한 번 이야기해보고 싶어요.
```

Actions:
- `요청 보내기`
- `요약 수정`
- `취소`

### Privacy Rules
- User chooses what conversation summary/transcript is attached.
- Hidden/private persona fields are not exposed in the request.
- Target sees enough context to understand why the request was sent.

## Workflow 7: Incoming Match Request Review

### Entry
- Target user receives a match request.

### Screen: `매칭 요청이 왔어요`
Show:
- Requester public profile.
- Requester message.
- Attached persona conversation summary/transcript preview.
- Consent copy: accepting creates a match and may unlock real conversation handoff.

Actions:
- `수락`
- `거절`
- `나중에`

### Outcomes
- Accept: create `Match`, open real conversation handoff.
- Reject: requester sees rejected/closed status; no match.
- Later: request remains pending.

## Workflow 8: Accepted Match and Real Conversation Handoff

### Entry
- Target accepts request.

### Screen: `매칭됐어요`
Show:
- Both public profiles.
- Why this matched: short summary from persona exploration.
- Handoff options:
  - in-app chat placeholder
  - open-chat/contact exchange placeholder

### Rules
- Real conversation handoff only exists after accepted match request.
- Do not expose raw conversation or hidden persona fields.

## Workflow 9: Cocoun-Backed Match Report Reveal

### Entry
- A persona conversation/simulation exists.
- A match report has been generated or can be generated from sanitized persona evidence.

### Report Generation Layer
Use Cocoun as an optional AI council layer for report formation:
- Invited friend personas and/or built-in evaluator personas review the sanitized persona conversation/simulation summary.
- Council members vote/comment on observed patterns.
- The app converts council output into a user-facing report.
- The report should read like a conversation guide, not a compatibility score.

Best version for the product: let users add `친구 페르소나` to the council.
- Friend personas make the report feel social and playful instead of clinical.
- Example roles: `현실 조언 잘하는 친구`, `조심하라고 말해주는 친구`, `대화 흐름 보는 친구`, `첫 메시지 도와주는 친구`.
- Friend persona participation must be opt-in by the friend persona owner, or limited to pre-approved demo personas.
- Friend personas see only sanitized report evidence, not raw conversations or hidden fields.

Fallback built-in evaluator roles:
- `대화 흐름 분석가`: evaluates rhythm, turn-taking, question quality.
- `관계 안전성 리뷰어`: flags pressure, boundary mismatch, sensitive risks.
- `공통 관심사 큐레이터`: finds shared topics and first-message ideas.
- `오해 가능성 리뷰어`: identifies tone gaps and possible misreads.
- `현실 대화 코치`: converts findings into practical next-step advice.

### Friend Persona Council Setup
Before generation, show `누구한테 물어볼까요?`
- Recommended default: 3-5 council members.
- Options:
  - `내 친구 페르소나 추가`
  - `기본 평가단 사용`
  - `친구 + 기본 평가단 섞기`
- Each selected friend persona shows a short label and viewpoint, e.g. `현실적인 조언`, `안전 체크`, `첫 메시지 감각`.
- If real friend personas are unavailable in MVP, seed demo friend personas with clear labels.

MVP friend persona examples:
- `현실 친구 민지`: direct, practical, flags awkwardness.
- `신중한 친구 도윤`: checks boundaries and pressure.
- `낙관적인 친구 하린`: finds encouraging conversation openings.
- `드립 보는 친구 준`: checks humor/tone mismatch.

Cocoun input may include:
- Sanitized persona summaries.
- Public traits.
- Private-for-agent traits that are safe for report reasoning.
- Sanitized conversation summary.
- Redacted transcript excerpts selected for report generation.

Cocoun input must not include:
- Raw KakaoTalk text.
- Unredacted messages.
- Direct identifiers.
- Hidden persona fields.
- Full private persona memory unrelated to the current exploration.

### Screen: `매칭 리포트`
States:
1. Locked: user has not requested reveal.
2. Generating: Cocoun council/poll is running.
3. Waiting: one user consented, waiting for the other.
4. Revealed: both consented.

### User-Facing Report Sections
- `대화 궁합 요약`
- `잘 맞는 지점`
- `조심할 지점`
- `추천 첫 대화 주제`
- `실제 대화 전 팁`
- `AI Council 메모`: short transparent note that multiple evaluator agents reviewed sanitized evidence.

### Rules
- Report reveal is separate from match acceptance.
- Both users must consent before report content is shown.
- Report content must use sanitized persona/simulation data only.
- Avoid numeric compatibility scores.
- Cocoun council output is advisory; it must not decide whether users can match.

## Recovery and Re-Entry Flows

### Incomplete Persona
If user leaves during persona review:
- Resume at last unresolved review stage.
- Do not publish partial public profile unless explicitly confirmed.

### No Public Profile
If user opens `탐색` without a published profile:
- Route to public profile preview/publish screen.

### Stale Persona
If user uploads more conversation data after publishing:
- Generate a new draft revision.
- Keep existing public profile live until the new revision is confirmed.

### Deleted/Hidden Trait After Publishing
If a user hides a previously public trait:
- Remove it from future swipe cards.
- Do not retroactively mutate already-sent match request summaries unless requested.

## MVP Screen List
1. Login / Create Account
2. BYOK OpenAI Key Setup
3. Conversation Source Gate
4. KakaoTalk Upload
5. Sanitization Progress
6. Sanitization Review
7. Persona Generation Progress
8. Persona Trait Review
9. Review Required Queue
10. Visibility Control
11. Public Swipe Card Preview
12. Swipe Deck
13. Persona Exploration Mode Chooser
14. Direct Persona Chat
15. tobl.ai Persona Simulation Transcript
16. Persona Exploration Next Action
17. Match Request Composer
18. Incoming Match Request Review
19. Match Accepted Handoff
20. Cocoun Match Report Generation/Reveal

## Key Verification Scenarios
- New user cannot reach swipe deck before publishing a public profile.
- Existing user can choose `그냥 시작하기` without uploading a new file.
- Persona review never displays raw KakaoTalk text.
- `public/private/hidden` visibility changes affect the public preview immediately.
- Left swipe opens persona exploration without notifying the target user.
- Match is not created until recipient accepts a match request.
- Match request includes only user-selected conversation context.
- tobl.ai simulation starts at 10 turns and cannot exceed 50 turns/messages.
- Real conversation handoff is unavailable before accepted match.
- Match report remains locked until both users consent.
- Cocoun report generation receives sanitized persona/conversation evidence only.
- Match report avoids numeric compatibility scores and presents practical conversation guidance.
