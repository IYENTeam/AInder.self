# AInder

AInder is a mobile-first agentic matching app prototype built with **GGUI**, **OpenAI Agents SDK**, **tobl.ai-style persona simulation flow**, and **Cocoun friend-persona council reports**.

핵심 아이디어는 단순 스와이프 매칭이 아니라:

`대화 업로드 → 페르소나 생성/리뷰 → 비공개 페르소나 탐색 → 매칭 요청 → 수락 후 실제 대화 → 친구 페르소나 council 리포트`

입니다.

## 핵심 경험

- **ID/비밀번호 로그인**
- **카카오톡 `.txt` 업로드**
- **개인정보 정제 후 페르소나 생성**
- **GGUI 설명형 trait 카드 리뷰**
  - confidence
  - sanitized evidence snippets
  - `public / private / hidden`
- **모바일 스와이프 탐색**
  - 왼쪽 스와이프 = 비공개 탐색 시작
  - 상대에게 알림 안 감
  - 매칭 즉시 생성 안 됨
- **페르소나 탐색 2모드**
  - 상대 페르소나와 직접 대화하기
  - 내 페르소나로 대화시키기
- **매칭 요청**
  - 기본 첨부: 요약 + 좋은 장면 2~3개
  - full transcript 기본 첨부 금지
- **Cocoun 친구 페르소나 council 리포트**
  - demo friend personas 기반
  - 숫자 궁합 점수 없음
  - 양쪽 동의 후 공개

## 현재 MVP 원칙

- **builder-managed OpenAI key** 사용
  - MVP normal flow에서는 사용자 BYOK 입력을 요구하지 않음
- raw KakaoTalk text는 **OpenAI / GGUI / tobl.ai / Cocoun**으로 전달하지 않음
- `hidden` field는 공개 프로필, persona-agent memory, council 입력에서 제외
- 리포트는 평가 점수표가 아니라 **대화 가이드**

## 저장소 구조

| 경로 | 역할 |
|---|---|
| `servers/agent` | OpenAI Agents SDK 기반 agent backend |
| `servers/ggui` | GGUI MCP/render server |
| `servers/mcps/todo` | 현재 AInder 도메인 MCP 서버 구현 위치 |
| `apps/web` | 웹 클라이언트 |
| `.gjc/specs` | Deep Interview 스펙 |
| `.gjc/plans` | RALPLAN consensus 계획 |

## 실행 방법

### 1) 의존성 설치

```bash
pnpm install
```

### 2) 환경 변수 설정

`.env.local`에 **로컬 개발 최소값**은 이것입니다.

```bash
OPENAI_API_KEY=your_key_here
```

로컬 개발 보조값:
- `GGUI_AINDER_MCP_URL`은 `.env.example` 기본값을 그대로 써도 됩니다.
- `AINDER_BOOTSTRAP_USER`, `AINDER_BOOTSTRAP_PASSWORD`는 현재 secure-session auth bridge의 로컬 기본 계정입니다.
- 현재 Cocoun / tobl.ai 흐름은 demo / seeded fallback 중심이라 local happy path에서는 별도 provider key가 없어도 됩니다.

프로덕션/프리뷰 기준으로는 추가 계약이 있습니다.
- `VITE_AGENT_ENDPOINT_URL`
- `AINDER_ALLOWED_ORIGINS`
- `AINDER_SESSION_SECRET`
- `AINDER_ADMIN_TOKEN`
- `AINDER_STORE_PATH`
- `AINDER_BOOTSTRAP_USER`
- `AINDER_BOOTSTRAP_PASSWORD_HASH`
- 필요 시 `COCOUN_API_KEY`, `TOBL_API_KEY`

검증 명령:
```bash
pnpm env:validate:production
```

### 3) 개발 서버 실행

```bash
pnpm dev
```

기본 포트:

- Web: `http://localhost:6890`
- Agent: `http://localhost:6790`
- GGUI MCP: `http://localhost:6781/mcp`
- AInder MCP: `http://localhost:6782/mcp`

개별 실행도 가능합니다.

```bash
pnpm dev:ggui
pnpm dev:mcps
pnpm dev:ainder
pnpm dev:agent
pnpm dev:web
```

## 데모 시나리오

현재 in-memory seed 기반으로 아래 happy path를 검증할 수 있습니다.

1. 로그인
2. 카카오톡 `.txt` 업로드
3. 정제 및 raw 기본 삭제
4. 페르소나 생성/리뷰
5. public profile publish
6. swipe deck 진입
7. 왼쪽 스와이프 → 탐색 모드 선택
8. 직접 대화 또는 tobl.ai-style 10턴 시뮬레이션
9. 매칭 요청 생성
10. 상대 수락
11. Cocoun demo friend persona council report 생성
12. 양쪽 동의 전까지 report locked

### 데모 실행 팁

로컬 데모 기본 계정:
```text
user id: demo
password: demo
```

데모 시연 추천 순서:
1. 로그인
2. `.txt` 업로드
3. redaction summary 확인
4. persona trait 공개 범위 조정
5. public profile publish
6. swipe deck 진입
7. 왼쪽 스와이프
8. direct chat 또는 simulation
9. match request 생성
10. accepted match 확인
11. Cocoun demo friend report 생성
12. report reveal consent가 양쪽 전에는 locked인 것 확인

### 데모 범위 주의

현재 저장소는 **해커톤 데모 기준으로는 충분**하지만, production ready는 아닙니다.
실서비스 전환은 `.gjc/plans/ainder-production-hardening.md` 기준으로 별도 하드닝이 더 필요합니다.

## 구현 상태

현재 구현된 핵심 영역:

- AInder in-memory domain store
- MCP tool surface
- builder-managed key 흐름
- upload / sanitize / raw deletion flow
- persona generation review state
- public/private/hidden visibility model
- swipe interest / persona exploration flow
- match request context preview
- accepted match handoff
- Cocoun demo friend council state
- report reveal consent gate

## 주요 문서

- Deep Interview spec: `.gjc/specs/deep-interview-ainder-workflows.md`
- User workflow spec: `.gjc/specs/ainder-user-workflows.md`
- Core flow spec: `.gjc/specs/ainder-core-flow.md`
- RALPLAN consensus plan: `.gjc/plans/ainder-ralplan-consensus.md`
- GGUI implementation plan: `.gjc/plans/ggui-track-implementation.md`

## 검증

실행한 검증:

```bash
pnpm typecheck
```

또한 핵심 happy path를 store 레벨에서 검증했습니다:

- raw deletion = `deleted`
- swipe가 match를 바로 만들지 않음
- simulation = 10 turns
- full transcript 기본 첨부 안 됨
- match request 수락 후 match 생성
- council report 상태 = `locked`

## 한계 / 후속 작업

현재는 해커톤 MVP 기준입니다.

후속 작업 후보:

- persistent DB
- password/session hardening
- 실제 friend persona owner opt-in UX
- OpenAI / tobl.ai / Cocoun provider retry/observability
- GGUI story polish
- frontend shell을 AInder 전용 UI로 더 강하게 커스터마이즈

## 라이선스

Apache-2.0
