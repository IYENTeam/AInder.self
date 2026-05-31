# Deep Interview Spec: AInder User Workflows

## Metadata
- Interview ID: 074b0df1-7e1f-4508-bdac-1c1b5a5b43a7
- Rounds: 8
- Final Ambiguity Score: 19.2%
- Type: greenfield
- Generated: 2026-05-31
- Threshold: 0.2
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED
- Approval State: pending approval

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.82 | 0.40 | 0.328 |
| Constraint Clarity | 0.80 | 0.30 | 0.240 |
| Success Criteria | 0.80 | 0.30 | 0.240 |
| **Total Clarity** | | | **0.808** |
| **Ambiguity** | | | **0.192** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| 계정/BYOK 설정 | active | 아이디·비밀번호 로그인, OpenAI 키 설정, 업로드 보관 기본값을 제공한다. | 해커톤 MVP에서는 빌더가 OpenAI 키를 설정하고 사용자는 로그인만 한다. |
| 대화 업로드/개인정보 정제 | active | 카카오톡 `.txt` 업로드, 민감정보 제거, 원본 삭제/보관을 처리한다. | 원본은 기본 삭제, OpenAI/GGUI/Cocoun에는 정제 데이터만 전달한다. |
| 페르소나 생성/리뷰 | active | GGUI 설명형 trait 카드, 근거 snippet, 공개 범위 제어, 공개 프로필 preview를 제공한다. | public/private/hidden을 사용자가 확정해야 publish 가능하다. |
| 스와이프 탐색 | active | 모바일 카드 덱에서 왼쪽 스와이프로 비공개 페르소나 탐색을 시작한다. | MVP 성공 기준은 왼쪽 스와이프 후 즉시 탐색 모드 선택 화면 진입이다. |
| 페르소나 탐색 | active | 직접 상대 페르소나와 대화하거나 내 페르소나와 상대 페르소나를 tobl.ai로 대화시킨다. | 두 모드를 모두 MVP에 동일 비중으로 포함한다. |
| 매칭 요청/수락 | active | 대화 맥락이 붙은 매칭 요청을 보내고 상대가 수락하면 매칭/대화 handoff를 연다. | 기본 첨부는 요약 + 좋은 장면 2~3개다. |
| Cocoun 친구 페르소나 council 리포트 | active | 친구/demo 페르소나와 평가자가 sanitized evidence를 보고 조언형 리포트를 만든다. | 초기 데모는 demo 친구 페르소나만 쓰고, 구조는 실제 친구 owner opt-in까지 열어둔다. |
| 동의/프라이버시 거버넌스 | active | 리포트 공개 동의, 친구 페르소나 opt-in, hidden/raw data 제외를 전역 규칙으로 강제한다. | 페르소나 공개 전, 매칭 요청 전, Cocoun 리포트 전 모두 정보 사용 범위를 확인시킨다. |

## Goal
AInder는 사용자가 자신의 정제된 대화 데이터로 페르소나를 만들고, GGUI로 공개 범위를 통제한 뒤, 모바일 스와이프에서 마음에 드는 상대를 비공개 페르소나 탐색으로 먼저 알아보고, 충분히 납득되면 대화 맥락을 붙여 매칭 요청을 보내는 에이전틱 매칭 앱이다. 매칭 이후에는 Cocoun 친구 페르소나 council이 sanitized evidence만 보고 실제 대화를 돕는 조언형 리포트를 만들며, 리포트는 양쪽 동의 후 공개된다.

## Constraints
- 해커톤 MVP에서는 빌더가 OpenAI 키를 설정하고, 사용자는 ID/password 로그인만 한다.
- 소셜 로그인은 MVP 범위가 아니다.
- 카카오톡 업로드는 `.txt`만 허용한다.
- 원본 업로드 파일은 기본 삭제한다. 보관은 명시적 opt-in일 때만 가능하다.
- OpenAI, GGUI, tobl.ai, Cocoun에는 raw KakaoTalk text를 전달하지 않는다.
- GGUI persona review에는 sanitized evidence snippet만 표시한다.
- Persona trait visibility는 `public`, `private`, `hidden`만 사용한다.
- `hidden` field는 공개 프로필, persona-agent memory, Cocoun council 입력에서 모두 제외한다.
- 왼쪽 스와이프는 일방 관심 및 비공개 탐색 시작이며, 상대에게 알림을 보내거나 매칭을 생성하지 않는다.
- 직접 상대 페르소나와 대화하기와 내 페르소나로 대화시키기는 둘 다 MVP에 포함한다.
- tobl.ai agent-to-agent simulation은 최초 10턴이며, 탐색은 최대 50턴/messages를 넘지 않는다.
- 매칭 요청 기본 첨부는 conversation summary + 좋은 장면 2~3개다.
- 실제 매칭은 target user가 요청을 수락해야 생성된다.
- Cocoun council은 초기 데모에서 demo friend personas를 사용한다.
- 실제 친구 페르소나 council 참여는 owner opt-in 구조를 열어둔다.
- 리포트는 숫자 궁합 점수 없이 대화 가이드로 제공한다.
- 리포트 공개는 매칭 수락과 별개이며 양쪽 동의가 필요하다.

## Non-Goals
- MVP에서 Google/Kakao/Apple social login 구현.
- MVP에서 전체 transcript를 기본으로 매칭 요청에 첨부.
- raw KakaoTalk 원문을 GGUI/OpenAI/Cocoun/tobl.ai에 전달.
- Cocoun council이 매칭 가능 여부를 결정하도록 만들기.
- 숫자 compatibility score 제공.
- 왼쪽 스와이프만으로 상호 매칭 생성.

## Acceptance Criteria
- [ ] 사용자는 ID/password로 로그인할 수 있다.
- [ ] MVP에서는 빌더 OpenAI 키가 설정되어 있으면 사용자는 별도 키 입력 없이 persona flow에 진입한다.
- [ ] 사용자는 `.txt` KakaoTalk export를 업로드할 수 있다.
- [ ] 업로드 후 raw file은 기본 삭제되고, 명시적 보관 설정이 있을 때만 유지된다.
- [ ] OpenAI 호출에는 sanitized conversation만 전달된다.
- [ ] Persona generation review는 confidence와 sanitized evidence snippets를 보여주며 raw text를 보여주지 않는다.
- [ ] 사용자는 각 persona trait/field를 `public`, `private`, `hidden`으로 설정할 수 있다.
- [ ] Public profile publish 전에 public fields를 명시적으로 확인해야 한다.
- [ ] 사용자는 published public profile이 있어야 swipe deck에 진입할 수 있다.
- [ ] 왼쪽 스와이프는 즉시 persona exploration mode chooser로 연결된다.
- [ ] 왼쪽 스와이프는 target user에게 알림을 보내지 않고 match를 생성하지 않는다.
- [ ] Persona exploration mode chooser는 `상대 페르소나와 직접 대화하기`와 `내 페르소나로 대화시키기`를 모두 제공한다.
- [ ] tobl.ai simulation은 최초 10턴을 생성한다.
- [ ] Persona exploration은 50 turns/messages를 초과할 수 없다.
- [ ] Exploration 결과가 일반적이거나 첫 메시지/요청 이유/맞는 점/조심할 점을 만들지 못하면 실패로 간주한다.
- [ ] `매칭 요청할래요`는 summary + 좋은 장면 2~3개를 기본 첨부한다.
- [ ] 매칭 요청 전 사용자는 상대에게 전달될 맥락을 확인할 수 있다.
- [ ] target user가 요청을 수락해야 Match가 생성된다.
- [ ] 실제 대화 handoff는 accepted match 이후에만 가능하다.
- [ ] Cocoun report council은 demo friend personas를 사용할 수 있다.
- [ ] 실제 friend persona council 참여 구조는 owner opt-in을 지원할 수 있게 설계된다.
- [ ] Cocoun council input은 sanitized persona/conversation evidence만 포함한다.
- [ ] Cocoun report는 첫 메시지, 맞는 점, 조심할 점, 친구 같은 조언을 제공한다.
- [ ] Match report는 양쪽 reveal consent 전까지 locked 상태다.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| BYOK는 사용자가 직접 입력해야 한다 | 해커톤 MVP 진입 마찰이 큰가? | MVP에서는 빌더가 키를 설정하고 사용자는 로그인만 한다. |
| 리포트는 AI 평가자만 만들면 된다 | 친구 페르소나가 더 재밌지 않은가? | demo friend personas를 council에 넣고, 구조는 실제 친구 opt-in까지 열어둔다. |
| Persona exploration은 한 모드만 있어도 된다 | 단순 MVP로 충분한가? | 두 모드 모두 동일 비중으로 MVP에 포함한다. |
| 매칭 요청은 요약만 있으면 된다 | 상대가 납득할 맥락이 충분한가? | 요약 + 좋은 장면 2~3개를 기본 첨부한다. |
| 리포트는 궁합 점수로 표현하면 쉽다 | 점수화가 촌스럽거나 위험하지 않은가? | 숫자 점수 없이 conversation guide로 제공한다. |
| 프라이버시 확인은 persona publish 때만 있으면 된다 | 정보가 전달되는 모든 순간이 안전한가? | persona publish 전, match request 전, Cocoun report 전 모두 확인한다. |

## Technical Context
- Greenfield planning artifact set exists under `.gjc/specs/` and `.gjc/plans/`.
- GGUI is the mobile-first generative UI layer.
- Template choice: OpenAI Agents SDK.
- Persona generation: OpenAI with sanitized conversation only.
- Agent-to-agent persona simulation: tobl.ai.
- Council-style report generation: Cocoun MCP (`https://asia-northeast3-cocouns-v.cloudfunctions.net/mcp`) with `X-API-Key` configured by builder.
- Runtime MCP/business rules must enforce raw-data exclusion, visibility rules, turn caps, match acceptance, and report reveal consent.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| User | core domain | id, password hash, BYOK configuration, account status | User owns PersonaProfile; User uploads ConversationUpload |
| ConversationUpload | core domain | fileRef, retention choice, deletion status | ConversationUpload produces SanitizedConversation |
| SanitizedConversation | core domain | redacted text, redaction summary, source upload reference | SanitizedConversation generates PersonaProfile |
| PersonaProfile | core domain | traits, visibility decisions, public projection | PersonaProfile powers PublicProfile and PersonaConversation |
| PublicProfile | core domain | headline, chips, visible traits | PublicProfile appears in SwipeDeck |
| PersonaConversation | core domain | mode, messages, turn count, summary | PersonaConversation can create MatchRequest and MatchReport |
| MatchRequest | core domain | requester, recipient, message, conversation summary, status | Accepted MatchRequest creates Match |
| Match | core domain | users, status, handoff state | Match can have MatchReport |
| CocounCouncilRun | external integration | provider run ID, council members, votes/comments, status | CocounCouncilRun contributes to MatchReport |
| FriendPersonaCouncilMember | supporting | owner, persona reference, consent status, viewpoint label | FriendPersonaCouncilMember participates in CocounCouncilRun |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|-----------------|
| 1 | 10 | 10 | - | - | - |
| 2 | 10 | 0 | 0 | 10 | 100% |
| 3 | 10 | 0 | 0 | 10 | 100% |
| 4 | 10 | 0 | 0 | 10 | 100% |
| 5 | 10 | 0 | 0 | 10 | 100% |
| 6 | 10 | 0 | 0 | 10 | 100% |
| 7 | 10 | 0 | 0 | 10 | 100% |
| 8 | 10 | 0 | 0 | 10 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (8 rounds)</summary>

### Round 0 — Topology Confirmation
**Q:** 8개 top-level components가 맞는가?
**A:** 맞음 — 이 8개로 진행.

### Round 1
**Q:** 계정/BYOK 설정에서 사용자가 성공적으로 준비 완료됐다고 판단되는 정확한 순간은 언제인가?
**A:** 해커톤 MVP에서는 키를 빌더가 넣고 사용자는 로그인만 한다.
**Ambiguity:** 32.8% (Goal: 0.78, Constraints: 0.65, Criteria: 0.55)

### Round 2
**Q:** Cocoun 친구 페르소나 council 리포트가 성공했다고 판단하려면, 사용자가 리포트를 보고 무엇을 할 수 있어야 하나?
**A:** 첫 메시지를 바로 보낼 수 있고, 상대와 맞는 점/조심할 점을 이해하며, 친구들이 조언해준 것처럼 재미와 확신을 줘야 한다.
**Ambiguity:** 28.9% (Goal: 0.78, Constraints: 0.65, Criteria: 0.68)

### Round 3
**Q:** MVP에서 council에 들어가는 친구 페르소나는 어떤 범위로 제한할까?
**A:** 초기 데모는 demo 친구 페르소나만 사용하고, 구조는 실제 친구 owner opt-in까지 열어둔다.
**Ambiguity:** 23.4% (Goal: 0.82, Constraints: 0.78, Criteria: 0.68)

### Round 4 — Contrarian Mode
**Q:** 만약 `내 페르소나로 대화시키기`가 신기하긴 한데 실제 매칭 요청으로 이어지지 않는다면, 그 기능은 어떤 기준에서 실패한 걸까?
**A:** 10턴 결과가 일반적이고, 실제로 보낼 첫 메시지/요청 이유를 못 만들고, 맞는 점/조심할 점이 드러나지 않으면 실패다.
**Ambiguity:** 22.8% (Goal: 0.82, Constraints: 0.78, Criteria: 0.70)

### Round 5
**Q:** 사용자가 AInder를 안전하다고 느끼려면, 어떤 순간에 “내 정보가 어디까지 쓰였는지”를 명확히 확인할 수 있어야 하나?
**A:** 페르소나 공개 전, 매칭 요청 전, Cocoun 리포트 전 모두 확인 가능해야 한다.
**Ambiguity:** 21.3% (Goal: 0.82, Constraints: 0.78, Criteria: 0.75)

### Round 6 — Simplifier Mode
**Q:** 가장 단순하지만 여전히 AInder의 가치를 보여주는 MVP라면, 페르소나 탐색 모드는 어디까지 포함해야 하나?
**A:** 상대 페르소나와 직접 대화하기와 내 페르소나로 대화시키기 둘 다 완성도 있게 동일 비중으로 포함한다.
**Ambiguity:** 21.3% (Goal: 0.82, Constraints: 0.78, Criteria: 0.75)

### Round 7
**Q:** `매칭 요청할래요`를 눌렀을 때 상대에게 기본으로 보여줄 대화 맥락은 어느 정도가 적절한가?
**A:** 요약 + 좋은 장면 2~3개를 기본 첨부한다.
**Ambiguity:** 20.7% (Goal: 0.82, Constraints: 0.80, Criteria: 0.75)

### Round 8
**Q:** 스와이프 탐색 MVP가 성공했다고 보려면, 사용자가 카드에서 어떤 행동을 문제없이 할 수 있어야 하나?
**A:** 왼쪽 스와이프해서 바로 탐색 모드 선택 화면으로 진입할 수 있어야 한다.
**Ambiguity:** 19.2% (Goal: 0.82, Constraints: 0.80, Criteria: 0.80)

</details>
