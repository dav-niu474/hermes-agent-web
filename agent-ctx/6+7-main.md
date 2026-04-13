# Task 6+7: Improve todo tool with persistent state and unify TTS handler

**Status**: ✅ Completed
**Agent**: Main Agent

## Work Log

### Fix 1: TTS Tool Handler in registered-tools.ts
- Replaced placeholder `text_to_speech` handler (which returned `note: 'Text-to-speech is not available...'`) with a real implementation using `z-ai-web-dev-sdk`
- New handler uses `getZAI()` lazy singleton already defined in the file
- Uses `zai.audio.tts.create()` with `tongtong` voice, mp3 format, max 1024 chars
- Returns base64-encoded audio data URL (`data:audio/mp3;base64,...`)
- Proper error handling with toolError for missing text or TTS failures

### Fix 2: Todo Tool with Persistent State in chat/route.ts
- Added `todoStore` Map property to `ToolRegistryAdapter` class: `Map<string, Array<{id, content, status}>>`
- Key is session ID from `ToolContext` (falls back to `'default'`)
- Added `handleTodo` method with three behaviors:
  1. **Read mode** (no `todos` array): returns current list for the session
  2. **Replace mode** (`merge=false`): replaces entire todo list
  3. **Merge mode** (`merge=true`): updates existing items by ID, adds new ones, keeps unmentioned
- Added `todo` case to the dispatch switch statement in `ToolRegistryAdapter`
- Returns JSON with todos array, total/inProgress/completed/pending counts, and descriptive message
- Validates status field against allowed values: pending, in_progress, completed, cancelled

### Verification
- ESLint: zero new errors (5 pre-existing errors in hermes-agent/ only)
- Dev server compiles successfully

## Files Modified
1. `src/lib/hermes/registered-tools.ts` — TTS handler: lines 456-486
2. `src/app/api/chat/route.ts` — todoStore property (line 150), dispatch case (line 211-212), handleTodo method (lines 605-667)
