# @ainder/mcp-ainder

AInder hackathon MVP MCP server exposing privacy-first matching tools.

It provides in-memory demo state for:

- ID/password demo login
- KakaoTalk `.txt` upload and sanitization
- raw upload deletion/retention lifecycle
- explainable persona generation review
- public/private/hidden trait visibility
- mobile swipe discovery
- direct target-persona chat
- tobl.ai-style persona simulation
- match request with summary + 2-3 good moments
- Cocoun-style demo friend persona council reports
- report reveal consent

## Run

```bash
pnpm --filter @ainder/mcp-ainder start
```

Listens on `http://localhost:6782/mcp` by default. Override with `PORT` env or `--port`.

## Agent wiring

Set the agent env var:

```bash
GGUI_AINDER_MCP_URL=http://localhost:6782/mcp
```

## Debug endpoints

- `GET /admin/state` returns the in-memory demo state.
- `POST /admin/reset` resets seeded users, target profile, and demo friend personas.

## Privacy contract

External-facing tools return sanitized projections only. Raw KakaoTalk text, hidden persona fields, direct identifiers, and full private persona memory must not be sent to GGUI, OpenAI, tobl.ai, or Cocoun.
