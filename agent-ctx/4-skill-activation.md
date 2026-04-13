# Task 4: Implement Skill Activation

**Status**: ✅ Completed
**Agent**: Main Agent

## Work Log

### Problem
The agent's system prompt included a skills index but when the agent called `skill_view(name)`, the full SKILL.md instructions were NOT injected into subsequent system prompts. The agent had to manually use the returned content each turn, wasting tokens and context window.

### Analysis
- The `AgentLoop` in `agent-loop.ts` fetched `memoryBlock` ONCE before the main loop and reused it for all iterations
- The `MemoryManagerAdapter` in `route.ts` returned a static memory context that never changed
- The `ToolRegistryAdapter.handleSkillView()` simply returned skill content but didn't store it for future use

### Solution (3 files modified)

#### 1. `src/lib/hermes/agent-loop.ts` — Re-fetch memory each iteration
- Moved `memoryBlock` fetch from before the while loop to INSIDE the loop
- This allows the `MemoryManagerAdapter` to return different content on each iteration
- When a `skill_view` tool call activates a skill, the NEXT iteration will include it

#### 2. `src/app/api/chat/route.ts` — ToolRegistryAdapter changes
- Added `activatedSkills: Map<string, string>` to track activated skills (name → content)
- Added `MAX_ACTIVATED_SKILLS_CHARS = 3000` constant for token budget control
- Modified `handleSkillView()`: after successful skill content fetch, stores content in the map
  - Deduplicates by skill name (won't activate same skill twice)
  - Checks total size limit before adding (prevents token bloat)
  - Logs activation/skip events to console
- Added `getActivatedSkillsPrompt()` method that formats the map as:
  ```xml
  <active-skills>
  ## Skill: web-search
  [Full SKILL.md content here]
  
  ## Skill: memory
  [Full SKILL.md content here]
  </active-skills>
  ```

#### 3. `src/app/api/chat/route.ts` — MemoryManagerAdapter changes
- Now accepts a `ToolRegistryAdapter` reference in constructor
- `getMemoryContext()` appends the `getActivatedSkillsPrompt()` output after standard memory context
- Returns empty string when no skills are active (zero overhead)

### How It Works
1. Agent calls `skill_view("web-search")` 
2. `ToolRegistryAdapter.handleSkillView()` fetches the skill content AND stores it in `activatedSkills`
3. The tool result is returned normally to the LLM
4. On the next loop iteration, `memoryBlock` is re-fetched
5. `MemoryManagerAdapter.getMemoryContext()` includes the `<active-skills>` block
6. The system prompt now has the full skill instructions — the agent doesn't need to call skill_view again

### Safety Features
- **Deduplication**: Same skill can't be activated twice
- **Size limit**: Total activated skills content capped at 3000 chars to prevent token bloat
- **Graceful skip**: If size limit would be exceeded, activation is silently skipped (logged)
- **Zero overhead**: When no skills are active, no extra content is added
- **Non-blocking**: Memory/activation failures are silently caught, never blocking the agent loop

### Verification
- ESLint: zero new errors (all 5 errors are pre-existing in hermes-agent/)
- Dev server compiles and serves successfully
