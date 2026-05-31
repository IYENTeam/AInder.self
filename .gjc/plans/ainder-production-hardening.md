# AInder Production Hardening Consensus Plan

## Status
- State: pending approval
- Planning mode: ralplan consensus, deliberate/high-risk
- Source of truth: this document supersedes earlier production-hardening notes and planner scratch output
- Scope: convert the current demo-safe AInder repository into a production-safe baseline without expanding product scope
- Execution boundary: no source mutation, deploy config change, migration authoring, secret rotation, or implementation delegation until separate explicit execution approval

## Verified Repo Evidence
- Frontend falls back to localhost backend: `apps/web/src/App.tsx:24-30`
- Browser shell mints and stores guest bearer auth: `apps/web/src/Chat.tsx:80-170`, `apps/web/src/Chat.tsx:549-566`
- Password hashing is demo-only base64: `servers/mcps/todo/src/store.ts:234-236`
- State is seeded in-memory: `servers/mcps/todo/src/store.ts:271-343`
- Debug endpoints are unauthenticated: `servers/mcps/todo/src/index.ts:67-78`
- Agent env registration still assumes localhost/sample defaults: `servers/agent/src/index.ts:84-92`, `.env.example:19-43`
- Railway config still describes sample MCP deployment: `railway.toml:57-76`
- Agent docs still describe dev-wide-open CORS assumptions: `servers/agent/README.md:127-143`
- Current implementation passes `pnpm typecheck`
- Reported web build passes but bundle is large (~1038.96 kB raw / 275.03 kB gzip)

## RALPLAN-DR Summary

### Principles
1. Privacy by construction: raw KakaoTalk text, direct identifiers, hidden fields, and full private persona memory never cross external boundaries.
2. Fail closed in production: missing env, unapproved origin, unresolved raw lifecycle, or unavailable provider state must fail safely rather than degrade silently.
3. Server-enforced policy: auth, rate limits, egress control, consent, and audit rules are enforced server-side, not trusted to browser or GGUI clients.
4. Durable and auditable state: sessions, uploads, consent, provider calls, and report/reveal flows persist across restarts with request-traceable auditability.
5. Safe rollout over big-bang: production hardening is staged, with security/deploy gates preceding sensitive feature rollout.

### Decision Drivers
1. Prevent raw conversation and hidden persona leakage before any public deployment.
2. Replace guest/demo identity and in-memory state before exposing real users.
3. Make production deployment deterministic: no localhost fallback, no sample defaults, no wide-open browser surface.

### Viable Options

#### Option A — Chosen: keep current topology, harden in place with explicit internal boundaries
Pros:
- Reuses the current web/agent/MCP topology and reduces migration risk.
- Allows privacy and provider egress policy to stay centralized.
- Supports phased rollout and rollback.

Cons:
- Requires strong discipline to prevent the current single-service shape from remaining overly coupled.
- Demands careful sequencing to avoid opening sensitive capabilities before security foundations exist.

#### Option B — Replatform immediately into multiple services
Pros:
- Stronger long-term isolation for auth, upload, provider egress, and reporting.
- Easier to reason about blast radius later.

Cons:
- Over-rotates for the current repository maturity.
- Raises operational complexity before the baseline production posture is even established.

#### Option C — Reduce product surface and only ship auth/persistence first
Pros:
- Smaller short-term change set.
- Faster path to a minimally safer deployment.

Cons:
- Leaves raw-upload/provider risk unresolved.
- Weakens the product’s differentiating flow while still not solving the biggest privacy boundary problems.

### Decision
Choose Option A, but only with three early gates locked before deeper rollout:
1. authentication transport ADR fixed,
2. persistence/session substrate in place,
3. browser security + audit baseline enforced.

## ADR

### Decision
AInder production hardening will retain the current web + agent + app-MCP topology, but it will replace the demo trust model with:
- secure cookie + server-side session auth,
- persistent database-backed repositories,
- isolated raw-upload storage and sanitization pipeline,
- projection-only provider adapters,
- strict browser origin/CSP/rate-limit/audit controls,
- deterministic environment/deployment validation.

### Drivers
- Current browser flow already calls the agent directly, so auth transport must be fixed before later phases.
- Provider egress and raw-upload handling are the highest privacy-risk paths.
- Production cannot rely on seeded state, localhost defaults, or unauthenticated debug paths.
- The system needs auditability for consent, upload lifecycle, provider calls, and reveal actions.

### Alternatives Considered
- Multi-service replatform first: rejected as too disruptive before baseline hardening.
- Bearer/access-refresh token transport: rejected for the current product because secure server-side session revocation and auditability matter more than preserving the present localStorage/header approach.
- Strip down product scope first: rejected because it leaves the privacy-critical upload/provider path unresolved.

### Why Chosen
Secure cookie + server-side sessions give the strongest baseline for revoke, session audit, and controlled browser behavior. Keeping the current topology avoids a premature replatform while still allowing strong internal boundaries and policy enforcement. Sequencing security gates before sensitive rollouts removes the current architectural blockers.

### Consequences
- `apps/web/src/Chat.tsx` must stop treating browser auth as a localStorage guest bearer concern.
- CORS/CSP/CSRF decisions move earlier and become part of auth rollout, not late-stage hardening.
- DB substrate and session store must precede real auth rollout.
- Demo fallback and sample defaults become dev-only or are removed entirely.

### Follow-ups
- Evaluate later separation of auth/upload/provider services after the production baseline is stable.
- Add secret rotation/runbooks for OpenAI, Cocoun, and tobl.ai.
- Add disaster recovery and backup rehearsal after persistence cutover.

## Pre-mortem
1. **Raw conversation egress incident**
   - Failure: unresolved raw upload or hidden field enters provider/GGUI payloads.
   - Prevention: isolated raw storage, projection-only adapters, egress gate, snapshot privacy tests, audit logs.
2. **Production auth bypass incident**
   - Failure: guest auth or demo users remain accessible in production.
   - Prevention: remove guest path in production, secure-cookie session model, env validation, auth smoke tests, seeded-state boot guard.
3. **Cross-origin/browser abuse incident**
   - Failure: wide-open origin policy or missing CSRF/rate limits allows abuse of authenticated flows.
   - Prevention: origin allowlists, chosen CSRF model, secure headers, auth/upload/exploration/report rate limits, request tracing.

## Scope

### In scope
- Real auth/session/authorization model
- Persistent DB and session store
- Raw upload storage/sanitization/deletion-retention pipeline
- Provider integration hardening for OpenAI/Cocoun/tobl.ai
- CORS/CSP/CSRF/origin controls
- Rate limiting / abuse protection
- Structured observability, audit log, env validation, CI gates, bundle budget
- Production-specific deployment/doc cleanup

### Out of scope
- New user-facing product capabilities
- Full service decomposition into separate deployables
- Multi-region, autoscaling, WAF, or infra-platform work
- Complete productized real-friend persona opt-in UX

## Production Hardening Sequence

### Phase 0 — Remove immediate production footguns
Purpose: eliminate accidental-public behavior before any other rollout.

Work:
- Remove `http://localhost:6790` fallback from `apps/web/src/App.tsx`.
- Require explicit production `VITE_AGENT_ENDPOINT_URL`.
- Remove or environment-gate `/admin/state` and `/admin/reset`.
- Mark sample/demo bootstrap paths as dev-only.
- Replace sample deploy/env wording with product-specific contracts.

Exit criteria:
- Production build fails if required frontend/backend env is unset.
- Debug/admin endpoints are unavailable outside local dev.
- No production path relies on localhost defaults.

Rollback note:
- Dev-only defaults may remain for local development, but never in shared preview/production.

### Phase 1 — Security and deployment baseline gate
Purpose: establish minimum browser/server safety before sensitive state rollout.

Work:
- Define explicit origin allowlists for web, agent, GGUI iframe, and MCP surfaces.
- Choose and document CSRF model aligned to cookie sessions.
- Add minimum request tracing (`request_id`) and auth/upload/reveal audit events.
- Add initial auth/upload/report rate limits.
- Add environment validation script for required production secrets/endpoints.
- Add secure header baseline (CSP, frame rules, referrer policy, content-type policy, permissions policy).

Exit criteria:
- Unapproved origins are rejected.
- Request tracing exists end to end.
- Missing production env fails CI/deploy validation.
- Sensitive state-changing routes have at least baseline rate limiting and audit logging.

Rollback note:
- No wildcard CORS rollback in preview/production.

### Phase 2 — Persistence substrate and session foundation
Purpose: establish durable storage before real auth rollout.

Work:
- Introduce production DB schema and migrations.
- Create repository layer for users, sessions, uploads, sanitized conversations, persona profiles, match requests, matches, reports, consent records, provider calls.
- Add server-side session store and `AuthAuditEvent` persistence substrate.
- Define migration/cutover strategy and rollback expectations.

Exit criteria:
- DB schema/migrations exist and are reversible.
- Session store is durable.
- Auth and domain repositories are no longer seeded in-memory in production boot.

Rollback note:
- Cutover must define old/new source of truth explicitly; no hidden dual-write ambiguity.

### Phase 3 — Real auth/session rollout
Purpose: replace guest/demo identity with production-safe auth.

Work:
- Replace `demo-hash` with argon2id (preferred) or equivalent strong hashing.
- Implement secure cookie + server-side session auth.
- Remove guest auth from production path.
- Add password policy, login throttling, lockout/backoff, logout/revoke semantics.
- Remove default seeded users from production boot.

Exit criteria:
- Production users authenticate only through real auth.
- Sessions are revocable, durable, and auditable.
- Browser no longer depends on guest bearer bootstrap.

Rollback note:
- Do not re-enable guest auth in production during rollback; use maintenance mode if needed.

### Phase 4 — Raw upload privacy pipeline
Purpose: harden the highest-risk data path.

Work:
- Add isolated raw object storage.
- Replace regex-only sanitization with structured parse → detect → redact → review artifact → deletion/retention execution pipeline.
- Add upload validation (size, type, malformed-export handling).
- Encrypt retained raw uploads at rest.
- Add egress gate: no provider/GGUI payloads before raw lifecycle resolution.
- Add privacy regression fixtures for names, phones, addresses, emails, employers, schools, account IDs, sensitive phrases.

Exit criteria:
- Raw lifecycle is explicit and testable.
- Provider payloads are sanitized projections only.
- Retention decisions are durable and auditable.

Rollback note:
- New upload path should sit behind a controlled flag until validated.

### Phase 5 — Provider integration hardening
Purpose: convert demo/fallback provider posture into explicit production behavior.

Work:
- Add real env/secret configuration for OpenAI, Cocoun, and tobl.ai.
- Add timeout/retry/backoff/circuit-breaker strategy.
- Persist provider call records with correlation IDs.
- Distinguish and label `providerSuccess`, `providerFailure`, `cachedDemo`, `seededFallback`.
- Disable demo fallback by default in production.

Exit criteria:
- Production provider calls use real configured credentials.
- Failures are observable and cannot masquerade as real success.
- Fallback behavior is explicitly labeled and policy-controlled.

Rollback note:
- Silent fallback is forbidden in production.

### Phase 6 — Extended browser/API abuse controls
Purpose: expand the baseline into a hardened public surface.

Work:
- Finalize CORS/CSP/frame/cookie settings based on chosen deploy topology.
- Add route-specific abuse controls for auth, upload, exploration, match request, report reveal, provider-triggering endpoints.
- Add CSRF enforcement on state-changing browser routes.
- Review iframe/connect policies for GGUI surfaces.

Exit criteria:
- Browser and iframe policies are explicit and enforced.
- Core public routes are protected by route-appropriate rate limits.
- CSRF posture matches the chosen auth transport.

### Phase 7 — Observability, CI, and release hygiene
Purpose: make the system operable and repeatably shippable.

Work:
- Add structured logging, metrics, traces, and alertable events for auth/upload/provider/match/report flows.
- Add CI gates for typecheck, web build, privacy regression, env validation, deploy config validation, and bundle budget.
- Update Railway/deploy scripts to product-specific assumptions.
- Add secret-management and runbook guidance.

Exit criteria:
- CI blocks on missing env, privacy regressions, and bundle budget failures.
- Deploy config is product-specific, not sample-specific.
- Incidents can be traced without logging raw conversation text.

## File-Level Change Map
- `apps/web/src/App.tsx`: remove localhost fallback; fail closed in production.
- `apps/web/src/Chat.tsx`: replace guest bearer bootstrap with real session bootstrap.
- `apps/web/src/vite-env.d.ts` and `apps/web/.env.example`: stricter production env contract.
- `servers/agent/src/index.ts`: strict env validation and MCP allowlist handling.
- `servers/agent/src/server.ts`: auth/session-aware security wrapper.
- `servers/agent/README.md`: separate dev convenience from production policy.
- `servers/mcps/todo/src/store.ts`: repository split, durable backing stores, remove demo hash assumptions.
- `servers/mcps/todo/src/handlers.ts`: auth-aware application services + audit-aware endpoints.
- `servers/mcps/todo/src/index.ts`: remove or strongly gate admin/debug endpoints.
- `.env.example`: product env contract, no production-localhost assumptions.
- `railway.toml`: product-specific deploy contract.
- `scripts/deploy-railway.mjs`: env/origin/deploy validation.
- `README.md`: split MVP/demo docs from production operations guidance.

## Expanded Verification Plan

### Unit
- Password hashing and rehash policy
- Session creation/expiry/revoke
- CSRF validation helpers (if cookie sessions)
- Projection filters excluding raw/hidden/direct identifiers
- Provider state machine transitions
- Raw upload lifecycle gate
- Env validator behavior

### Integration
- Authenticated session flow against DB-backed repositories
- Upload parse/redaction/deletion/retention transitions
- Provider adapter timeout/retry/fallback/correlation logging
- Debug/admin endpoint environment gating
- Origin/CORS policy enforcement

### E2E
- Signup/login/upload/review/publish/swipe/explore/request/accept/report reveal flow under real auth
- Production guest-auth denial
- Missing env deploy/build failure
- Raw unresolved → provider egress blocked
- Unapproved origin → blocked authenticated request
- Full transcript absent from default match request context

### Observability
- Request ID continuity from browser request through provider call
- Audit coverage for login/logout/upload/retention/match/reveal/provider egress
- No raw conversation text in logs/traces
- Alert conditions for 429, 5xx, provider failure, redaction failure

### Deploy validation
- Preview/prod env completeness lint
- Railway URL/origin consistency
- CSP/CORS smoke checks
- Migration dry-run/backout verification
- Bundle budget gate

## Acceptance Criteria
- [ ] Production web build has no localhost backend fallback.
- [ ] Guest auth is unavailable outside explicit dev mode.
- [ ] Secure cookie + server-side session auth is the production transport of record.
- [ ] Passwords use strong one-way hashing.
- [ ] Durable DB/session substrate exists before real auth rollout.
- [ ] Production boot does not use seeded in-memory user/domain state.
- [ ] Admin/debug endpoints are removed or authenticated and environment-gated.
- [ ] Raw uploads cannot egress to providers/GGUI before lifecycle resolution.
- [ ] Provider and GGUI payloads exclude raw text, hidden fields, and direct identifiers.
- [ ] Match request default context excludes full transcript.
- [ ] Report reveal stays locked until both consents are present.
- [ ] Origin/CORS/CSP/CSRF policies are explicit and enforced.
- [ ] Auth/upload/exploration/match/report/provider-trigger routes are rate-limited.
- [ ] Request tracing and audit logs exist for sensitive flows.
- [ ] CI enforces typecheck, build, privacy regression, env validation, deploy config validation, and bundle budget.

## Tradeoffs and Synthesis
- Cookie sessions increase browser/security integration work now, but they reduce revoke/audit ambiguity later.
- Keeping the current topology avoids premature replatforming, but only works if early security and persistence gates are not delayed.
- Hardening in place is acceptable because the product is early, but it requires stronger internal boundaries than the current MVP has.

## Pending Approval
This consensus plan is approved for planning refinement only and remains pending approval for execution. No code changes, deploy changes, secret changes, or implementation delegation should occur until you explicitly approve execution against this plan.
