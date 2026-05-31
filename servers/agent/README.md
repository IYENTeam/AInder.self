# AInder Agent Backend

OpenAI Agents SDK 기반 AInder agent backend입니다.

역할:
- 웹 클라이언트가 붙는 HTTP agent endpoint 제공
- GGUI MCP와 AInder MCP를 agent runtime에 연결
- secure cookie + server-side session 기반 인증 브리지 제공
- production에서 localhost/sample fallback 없이 fail-closed 동작

## 현재 포지션

이 패키지는 더 이상 generic sample backend가 아니라 **AInder 전용 backend**입니다.

핵심 원칙:
- production에서는 `VITE_AGENT_ENDPOINT_URL`, `GGUI_MCP_URL`, `AINDER_ALLOWED_ORIGINS`, `AINDER_SESSION_SECRET` 같은 env가 명시돼야 함
- browser auth는 guest token/localStorage가 아니라 **cookie session**
- origin allowlist를 벗어난 요청은 차단
- production에서는 localhost MCP/agent default를 허용하지 않음

## 주요 파일

```text
src/
  agent.ts                 OpenAI Agents SDK adapter
  ainder-system-prompt.ts  AInder 도메인 시스템 프롬프트
  server.ts                cookie session auth + backend bootstrap wrapper
  index.ts                 env validation + MCP wiring + server start
```

## 로컬 실행

```bash
# 1) ggui server
pnpm --filter ./servers/ggui start

# 2) AInder MCP server
pnpm --filter ./servers/mcps/todo start

# 3) agent backend
OPENAI_API_KEY=sk-... pnpm --filter ./servers/agent start
```

기본 로컬 포트:
- agent: `http://localhost:6790`
- sandbox proxy: `http://localhost:7791`

## 주요 환경변수

| 변수 | 로컬 기본 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | 없음 | 필수 |
| `PORT` | `6790` | agent backend 포트 |
| `SANDBOX_PROXY_PORT` | `7791` | sandbox proxy 포트 |
| `GGUI_MCP_URL` | `http://localhost:6781/mcp` | ggui MCP |
| `GGUI_AINDER_MCP_URL` | `http://localhost:6782/mcp` | AInder domain MCP |
| `AINDER_ALLOWED_ORIGINS` | 비어있음 | production browser origin allowlist |
| `AINDER_SESSION_SECRET` | dev에서는 자동 생성 가능 | production 필수 |
| `AINDER_BOOTSTRAP_USER` | `demo` | 현재 auth bridge user |
| `AINDER_BOOTSTRAP_PASSWORD_HASH` | 선택 | production에서는 명시 권장 |
| `AINDER_SESSION_STORE_PATH` | 선택 | agent session persistence 파일 |

## production contract

production에서는 아래가 보장돼야 합니다.

- `VITE_AGENT_ENDPOINT_URL` 없이 web build 금지
- `GGUI_MCP_URL`, `GGUI_AINDER_MCP_URL`가 localhost를 가리키면 안 됨
- guest auth 경로로 운영하지 않음
- `auth/login`, `auth/me`, `auth/logout`와 `/login`, `/me`, `/logout`가 cookie session 기준으로 동작
- origin allowlist 밖 요청 차단

## 주의

현재 auth는 **production hardening bridge 단계**입니다.
즉, 완전한 사용자/세션/DB 모델로 이미 끝난 게 아니라:
- browser guest auth 제거
- cookie session 도입
- env/origin fail-closed
을 먼저 확보한 상태입니다.

후속으로는 실제 persistent user/session store와 full auth domain이 이어져야 합니다.
