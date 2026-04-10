# Task: Rewrite hermes-agent Skills System & Memory Manager to TypeScript

**Status**: ✅ Completed
**Date**: 2025-07-10

## Summary

Created two comprehensive TypeScript server-side modules that faithfully port the hermes-agent Python skills system and memory manager to the Next.js backend at `/home/z/my-project/src/lib/hermes/`.

## Files Created

### 1. `src/lib/hermes/skills.ts` — Skills System (~560 lines)

Complete TypeScript port of `agent/skill_utils.py`, `agent/prompt_builder.py`, and `tools/skills_tool.py`.

**Exported Interfaces:**
- `SkillInfo` — name, category, description, tags, isBuiltin, path, status, content?, linkedFiles?, platforms?, relatedSkills?
- `LinkedFile` — name, size
- `ScanOptions` — category?, search?, includeDisabled?
- `SkillManageOptions` — name, category?, description?, content?, instructions?
- `SkillManageResult` — success, error?, path?

**Exported Functions:**
- `parseFrontmatter(content)` — Parses YAML frontmatter from markdown. Includes a custom minimal YAML parser that handles strings, numbers, booleans, lists, nested objects, inline lists, and quoted values. Falls back to simple key:value splitting for malformed YAML.
- `scanSkills(options?)` — Recursively scans 5 skill directories in precedence order (local `~/.hermes/skills/` first, then `~/.hermes/optional-skills/`, then bundled `hermes-agent/skills/`, `hermes-agent/optional-skills/`, then external dirs from `config.yaml`). Filters by platform compatibility, disabled skills, category, and search substring.
- `getSkillContent(name)` — Searches all skill directories for a named skill. Returns full SKILL.md content + linked files from references/, templates/, assets/, scripts/ subdirectories with sizes.
- `manageSkill(action, options)` — CRUD operations: create, patch, edit, delete.
- `buildSkillsSystemPrompt(availableTools?)` — Builds the `<available_skills>` XML block for system prompt injection. Respects conditional activation fields.
- `getHermesHome()` — Returns Hermes home directory.

### 2. `src/lib/hermes/memory.ts` — Memory System (~380 lines)

Complete TypeScript port of `agent/memory_manager.py`, `agent/builtin_memory_provider.py`, and `tools/memory_tool.py`.

**Exported Class: `MemoryManager`**
- `readMemory()` — Loads from `~/.hermes/memories/MEMORY.md` and `USER.md` with fallbacks.
- `updateMemory(data)` — Replaces content, writes atomically.
- `buildMemoryContextBlock(rawContext)` — Wraps in `<memory-context>` XML fence.
- `prefetch(query)` — Returns top 5 relevant entries by substring matching.
- `parseMemoryEntries(content)` — Parses into structured `MemoryEntry[]`.
- `add/replace/remove` — Full CRUD with duplicate detection, char limits, injection scanning.

**Security:** Injection detection (10 patterns), invisible unicode detection, atomic file writes.

## Technical Notes
- ESLint: zero new errors in both files
- No external dependencies — custom YAML parser built-in
- `'use server'` — server-side only
- Handles missing dirs/files gracefully
