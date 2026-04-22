---
Task ID: 1
Agent: Main Agent
Task: Fix all agent tool-calling chain bugs and prepare for Vercel deployment

Work Log:
- Re-cloned hermes-agent-web from GitHub (previous sandbox state was lost)
- Read and analyzed all critical files: agent-loop.ts, config.ts, tools-registry.ts, prisma/schema.prisma, modal-sandbox.ts, route.ts
- Applied 7 bug fixes across 4 files
- All fixes pass ESLint (bun run lint)
- Dev server compiles and starts successfully
- Verified database connection with SQLite (local testing)
- API routes respond correctly (GET /api/config 200)
- Restored PostgreSQL schema for Vercel deployment

Stage Summary:
- 7 bugs fixed, 1 commit (b3ea01f)
- Key fixes:
  1. P0: existsSync() return value not checked in config.ts line 440
  2. P1: glm-4.5-flash → glm-4-flash in config.ts line 743
  3. P1: glm-5-plus → glm-4-flash in prisma/schema.prisma line 23
  4. P2: SURROGATE_RE regex lastIndex skip in agent-loop.ts
  5. P3: Streaming usage now extracted from provider chunks
  6. P1: validateToolCallArguments dead branch cleaned up
  7. coerceNumber redundant ternary simplified
- Cannot push to GitHub or deploy to Vercel from sandbox (no credentials)
- User needs to push from local machine to trigger Vercel auto-deploy
