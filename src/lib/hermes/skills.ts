/**
 * Hermes Skills System — TypeScript port of hermes-agent's skill utilities.
 *
 * Scans multiple skill directories, parses YAML frontmatter from SKILL.md files,
 * extracts metadata (name, description, tags, platforms, conditions), and provides
 * CRUD operations for skill management.
 *
 * Skill directory search order (local-first precedence):
 *   1. ~/.hermes/skills/           — user-installed and agent-created skills
 *   2. ~/.hermes/optional-skills/  — optional bundled skills
 *   3. hermes-agent/skills/        — built-in bundled skills (repo-relative)
 *   4. hermes-agent/optional-skills/ — built-in optional skills (repo-relative)
 *   5. External dirs from config.yaml skills.external_dirs
 *
 * Based on:
 *   - agent/skill_utils.py (parse_frontmatter, iter_skill_index_files, get_all_skills_dirs)
 *   - agent/prompt_builder.py (build_skills_system_prompt)
 *   - tools/skills_tool.py (skills_list, skill_view, skill_manage)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ─── Constants ──────────────────────────────────────────────────────────────

const EXCLUDED_DIRS = new Set(['.git', '.github', '.hub', 'node_modules']);
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const SKILL_INDEX_FILE = 'SKILL.md';
const DESCRIPTION_FILE = 'DESCRIPTION.md';

// Cache the resolved hermes home to avoid repeated fs checks
let _resolvedHermesHome: string | null = null;

const PLATFORM_MAP: Record<string, string> = {
  macos: 'darwin',
  linux: 'linux',
  windows: 'win32',
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SkillInfo {
  name: string;
  category: string | null;
  description: string;
  tags: string[];
  isBuiltin: boolean;
  path: string;
  status: 'active' | 'disabled';
  content?: string;
  linkedFiles?: LinkedFile[];
  platforms?: string[];
  relatedSkills?: string[];
}

export interface LinkedFile {
  name: string;
  size: number;
}

export interface ScanOptions {
  category?: string;
  search?: string;
  includeDisabled?: boolean;
}

export interface SkillManageOptions {
  name: string;
  category?: string;
  description?: string;
  content?: string;
  instructions?: string;
}

export interface SkillManageResult {
  success: boolean;
  error?: string;
  path?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get the Hermes home directory.
 * Honors HERMES_HOME env var, falls back to ~/.hermes.
 * In sandboxed environments where home is not writable, falls back to <project>/.hermes.
 */
export function getHermesHome(): string {
  if (_resolvedHermesHome) return _resolvedHermesHome;

  const envHome = process.env.HERMES_HOME;
  if (envHome) {
    _resolvedHermesHome = envHome;
    return envHome;
  }

  const homeDir = path.join(os.homedir(), '.hermes');
  // Try the standard home directory first
  try {
    fs.accessSync(path.dirname(homeDir), fs.constants.W_OK);
    _resolvedHermesHome = homeDir;
    return homeDir;
  } catch {
    // Home dir not writable — fall back to project-relative .hermes
    const projectRelative = path.join(getProjectRoot(), '.hermes');
    _resolvedHermesHome = projectRelative;
    return projectRelative;
  }
}

/**
 * Ensure the hermes home directory and its skills subdirectory exist.
 * Called before any write operations (create/edit/patch).
 */
export async function ensureHermesHome(): Promise<string> {
  const hermesHome = getHermesHome();
  const skillsDir = path.join(hermesHome, 'skills');
  try {
    await fs.mkdir(skillsDir, { recursive: true });
  } catch (err) {
    // If even the project-relative path fails, try /tmp as last resort
    const tmpHermes = '/tmp/.hermes';
    try {
      await fs.mkdir(path.join(tmpHermes, 'skills'), { recursive: true });
      _resolvedHermesHome = tmpHermes;
      return tmpHermes;
    } catch {
      throw new Error(
        `Cannot create hermes home directory. Tried: ${hermesHome}, ${tmpHermes}. Original error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return hermesHome;
}

/**
 * Get the project root directory for bundled skills.
 */
function getProjectRoot(): string {
  // When running from the Next.js project, go up to find hermes-agent
  return process.cwd();
}

/**
 * Parse YAML frontmatter from a markdown string.
 *
 * Handles:
 *   - Standard YAML between --- delimiters
 *   - Nested structures (metadata.hermes.tags)
 *   - Lists, strings, numbers, booleans
 *   - Fallback key:value parsing for malformed YAML
 *
 * Returns { frontmatter, body } where frontmatter is a parsed dict and
 * body is the remaining markdown content after the closing ---.
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const frontmatter: Record<string, unknown> = {};
  let body = content;

  if (!content.startsWith('---')) {
    return { frontmatter, body };
  }

  // Find the closing --- on its own line (after the opening ---)
  const afterFirstDelimiter = content.slice(3);
  const endMatch = afterFirstDelimiter.match(/\n---\s*\n/);

  if (!endMatch) {
    return { frontmatter, body };
  }

  const yamlContent = afterFirstDelimiter.slice(0, endMatch.index! + 3);
  body = content.slice(3 + endMatch.index! + endMatch[0].length);

  try {
    const parsed = parseSimpleYaml(yamlContent);
    if (parsed && typeof parsed === 'object') {
      Object.assign(frontmatter, parsed);
    }
  } catch {
    // Fallback: simple key:value parsing
    for (const line of yamlContent.trim().split('\n')) {
      if (!line.includes(':')) continue;
      const colonIdx = line.indexOf(':');
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (key) {
        frontmatter[key] = value;
      }
    }
  }

  return { frontmatter, body };
}

/**
 * Minimal YAML parser that handles the subset used in SKILL.md frontmatter.
 *
 * Supports: strings, numbers, booleans, lists, nested objects via indentation.
 * Does NOT handle anchors, aliases, multi-line strings, or complex types.
 */
function parseSimpleYaml(yamlStr: string): unknown {
  if (!yamlStr.trim()) return null;

  const lines = yamlStr.split('\n');
  let idx = 0;

  function parseValue(line: string, indent: number): unknown {
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) return undefined;

    // List item
    if (trimmed.startsWith('- ')) {
      return parseList(lines, idx, indent);
    }

    // Quoted string
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }

    // Boolean
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;

    // Number
    const num = Number(trimmed);
    if (trimmed !== '' && !isNaN(num)) return num;

    // Null
    if (trimmed === 'null' || trimmed === '~') return null;

    // Nested key (has child lines at deeper indent)
    if (trimmed.includes(':') && !trimmed.startsWith('-')) {
      return parseObject(lines, idx, indent);
    }

    return trimmed;
  }

  function parseObject(
    objLines: string[],
    startIdx: number,
    baseIndent: number,
  ): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    let i = startIdx;

    while (i < objLines.length) {
      const line = objLines[i];
      const trimmed = line.trimStart();
      const currentIndent = line.length - trimmed.length;

      if (trimmed === '' || currentIndent < baseIndent) break;
      if (currentIndent > baseIndent) {
        // Continuation of previous value — skip
        i++;
        continue;
      }

      if (!trimmed.includes(':')) {
        i++;
        continue;
      }

      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();

      // Skip lines that are list items at this indent level
      if (trimmed.startsWith('- ')) {
        i++;
        continue;
      }

      const afterColon = trimmed.slice(colonIdx + 1).trim();

      if (afterColon === '' || afterColon === '|' || afterColon === '>') {
        // Nested object or block scalar follows
        // Check if next non-empty line is a list
        let nextIdx = i + 1;
        while (nextIdx < objLines.length && objLines[nextIdx].trim() === '') nextIdx++;

        if (nextIdx < objLines.length) {
          const nextLine = objLines[nextIdx];
          const nextIndent = nextLine.length - nextLine.trimStart().length;
          const nextTrimmed = nextLine.trim();

          if (nextTrimmed.startsWith('- ') && nextIndent > baseIndent) {
            // List follows this key
            const listResult = parseList(objLines, nextIdx, nextIndent);
            obj[key] = listResult.value;
            i = listResult.nextIdx;
            continue;
          }

          if (nextIndent > baseIndent && nextTrimmed.includes(':')) {
            // Nested object follows this key
            const nestedResult = parseObject(objLines, nextIdx, nextIndent);
            obj[key] = nestedResult;
            i = nextIdx;
            while (
              i < objLines.length &&
              (objLines[i].trim() === '' ||
                (objLines[i].length - objLines[i].trimStart().length) >= nextIndent)
            ) {
              i++;
            }
            continue;
          }
        }

        obj[key] = '';
      } else {
        // Inline value
        const value = parseInlineValue(afterColon);
        obj[key] = value;
      }

      i++;
    }

    return obj;
  }

  function parseList(
    listLines: string[],
    startIdx: number,
    listIndent: number,
  ): { value: unknown[]; nextIdx: number } {
    const items: unknown[] = [];
    let i = startIdx;

    while (i < listLines.length) {
      const line = listLines[i];
      const trimmed = line.trimStart();
      const currentIndent = line.length - trimmed.length;

      if (trimmed === '') {
        i++;
        continue;
      }

      if (currentIndent !== listIndent || !trimmed.startsWith('- ')) {
        break;
      }

      const itemValue = trimmed.slice(2).trim();

      // Quoted string
      if (
        (itemValue.startsWith('"') && itemValue.endsWith('"')) ||
        (itemValue.startsWith("'") && itemValue.endsWith("'"))
      ) {
        items.push(itemValue.slice(1, -1));
        i++;
        continue;
      }

      // Boolean
      if (itemValue === 'true') {
        items.push(true);
        i++;
        continue;
      }
      if (itemValue === 'false') {
        items.push(false);
        i++;
        continue;
      }

      // Number
      const num = Number(itemValue);
      if (itemValue !== '' && !isNaN(num)) {
        items.push(num);
        i++;
        continue;
      }

      // Null
      if (itemValue === 'null' || itemValue === '~') {
        items.push(null);
        i++;
        continue;
      }

      // Inline key:value (compact object notation)
      if (itemValue.includes(':')) {
        // Could be "key: value" inline dict
        // For now, treat as simple object parse
        i++;
        continue;
      }

      items.push(itemValue);
      i++;
    }

    return { value: items, nextIdx: i };
  }

  function parseInlineValue(value: string): unknown {
    // Quoted string
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Number
    const num = Number(value);
    if (value !== '' && !isNaN(num)) return num;

    // Null
    if (value === 'null' || value === '~') return null;

    // Bracket-enclosed list (inline)
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      if (!inner) return [];
      return inner
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }

    return value;
  }

  const result = parseObject(lines, 0, 0);
  return result;
}

/**
 * Check if a skill is compatible with the current OS platform.
 * Skills declare platform requirements via a top-level `platforms` list.
 * If absent or empty, the skill is compatible with all platforms.
 */
function skillMatchesPlatform(frontmatter: Record<string, unknown>): boolean {
  const platforms = frontmatter.platforms;
  if (!platforms) return true;

  const platformList = Array.isArray(platforms)
    ? platforms.map(String)
    : [String(platforms)];

  if (platformList.length === 0) return true;

  const currentPlatform = process.platform; // 'darwin' | 'linux' | 'win32'
  for (const p of platformList) {
    const normalized = p.toLowerCase().trim();
    const mapped = PLATFORM_MAP[normalized] || normalized;
    if (currentPlatform.startsWith(mapped)) return true;
  }

  return false;
}

/**
 * Extract tags from frontmatter.
 * Checks metadata.hermes.tags first (agentskills.io convention), then top-level tags.
 */
function parseTags(frontmatter: Record<string, unknown>): string[] {
  const hermesMeta = getNestedValue(frontmatter, 'metadata.hermes');
  const tagsValue =
    (hermesMeta && typeof hermesMeta === 'object' && hermesMeta.tags) ||
    frontmatter.tags;

  if (!tagsValue) return [];

  if (Array.isArray(tagsValue)) {
    return tagsValue.map(String).map((t) => t.trim()).filter(Boolean);
  }

  const str = String(tagsValue).trim();
  if (str.startsWith('[') && str.endsWith(']')) {
    const inner = str.slice(1, -1);
    return inner
      .split(',')
      .map((t) => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }

  return str
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/**
 * Extract related_skills from frontmatter.
 */
function parseRelatedSkills(frontmatter: Record<string, unknown>): string[] {
  const hermesMeta = getNestedValue(frontmatter, 'metadata.hermes');
  const value =
    (hermesMeta && typeof hermesMeta === 'object' && hermesMeta.related_skills) ||
    frontmatter.related_skills;

  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(String).map((t) => t.trim()).filter(Boolean);
  }

  const str = String(value).trim();
  if (str.startsWith('[') && str.endsWith(']')) {
    return str
      .slice(1, -1)
      .split(',')
      .map((t) => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }

  return str
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/**
 * Get a nested value from an object using a dot-separated path.
 */
function getNestedValue(
  obj: Record<string, unknown>,
  dotPath: string,
): unknown {
  const parts = dotPath.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Extract conditional activation fields from parsed frontmatter.
 */
function extractSkillConditions(frontmatter: Record<string, unknown>): {
  fallback_for_toolsets: string[];
  requires_toolsets: string[];
  fallback_for_tools: string[];
  requires_tools: string[];
} {
  const hermes = (getNestedValue(frontmatter, 'metadata.hermes') ||
    {}) as Record<string, unknown>;
  const toArray = (v: unknown): string[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(String);
    return [String(v)];
  };

  return {
    fallback_for_toolsets: toArray(hermes.fallback_for_toolsets),
    requires_toolsets: toArray(hermes.requires_toolsets),
    fallback_for_tools: toArray(hermes.fallback_for_tools),
    requires_tools: toArray(hermes.requires_tools),
  };
}

/**
 * Extract description from frontmatter, truncating to max length.
 */
function extractDescription(frontmatter: Record<string, unknown>): string {
  const raw = frontmatter.description;
  if (!raw) return '';
  const desc = String(raw).trim().replace(/^['"]|['"]$/g, '');
  if (desc.length > 60) return desc.slice(0, 57) + '...';
  return desc;
}

/**
 * Extract full description (for skill listing, up to 1024 chars).
 */
function extractFullDescription(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  let desc = String(frontmatter.description || '').trim().replace(/^['"]|['"]$/g, '');

  if (!desc) {
    // Fall back to first non-header line of the body
    for (const line of body.trim().split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        desc = trimmed;
        break;
      }
    }
  }

  if (desc.length > MAX_DESCRIPTION_LENGTH) {
    desc = desc.slice(0, MAX_DESCRIPTION_LENGTH - 3) + '...';
  }

  return desc;
}

/**
 * Get the list of all skill directories to scan, in precedence order.
 */
async function getAllSkillsDirs(): Promise<string[]> {
  const hermesHome = getHermesHome();
  const projectRoot = getProjectRoot();

  const dirs: string[] = [];

  // 1. Local user skills (always first, highest precedence)
  dirs.push(path.join(hermesHome, 'skills'));

  // 2. Optional skills in hermes-home
  dirs.push(path.join(hermesHome, 'optional-skills'));

  // 3. Project root skills/ directory (platform skills)
  const projectSkills = path.join(projectRoot, 'skills');
  dirs.push(projectSkills);

  // 4. Bundled skills from the hermes-agent repo
  const bundledSkills = path.join(projectRoot, 'hermes-agent', 'skills');
  dirs.push(bundledSkills);

  // 5. Bundled optional skills from the hermes-agent repo
  const bundledOptional = path.join(
    projectRoot,
    'hermes-agent',
    'optional-skills',
  );
  dirs.push(bundledOptional);

  // 5. External dirs from config.yaml (if readable)
  try {
    const configPath = path.join(hermesHome, 'config.yaml');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = parseSimpleYaml(configContent) as Record<string, unknown> | null;
    if (config && typeof config === 'object') {
      const skillsCfg = config.skills as Record<string, unknown> | undefined;
      if (skillsCfg && typeof skillsCfg === 'object') {
        const externalDirs = skillsCfg.external_dirs;
        if (Array.isArray(externalDirs)) {
          for (const dir of externalDirs) {
            const expanded = String(dir)
              .replace(/^~/, os.homedir())
              .replace(/\$\{?(\w+)\}?/g, (_, varName) =>
                process.env[varName] || '',
              );
            if (expanded && !dirs.includes(expanded)) {
              dirs.push(expanded);
            }
          }
        }
      }
    }
  } catch {
    // Config not readable — skip external dirs
  }

  return dirs;
}

/**
 * Recursively walk a directory yielding SKILL.md file paths.
 * Excludes .git, .github, .hub, node_modules directories.
 */
async function iterSkillIndexFiles(
  skillsDir: string,
  filename: string,
): Promise<string[]> {
  const results: string[] = [];

  try {
    const stat = await fs.stat(skillsDir);
    if (!stat.isDirectory()) return results;
  } catch {
    return results;
  }

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name === filename) {
        results.push(fullPath);
      } else if (entry.isDirectory()) {
        await walk(fullPath);
      }
    }
  }

  await walk(skillsDir);
  return results;
}

/**
 * Extract category from a skill path relative to the skills directory.
 * For: skills/mlops/axolotl/SKILL.md → "mlops"
 */
function getCategoryFromPath(skillPath: string, skillsDir: string): string | null {
  try {
    const rel = path.relative(skillsDir, skillPath);
    const parts = rel.split(path.sep);
    // SKILL.md is the last part, skill dir is second-to-last, category is before that
    if (parts.length >= 3) {
      return parts[0];
    }
  } catch {
    // Not relative to this skills dir
  }
  return null;
}

/**
 * Check if a skill is disabled in config.
 */
async function isSkillDisabled(name: string): Promise<boolean> {
  const hermesHome = getHermesHome();
  const configPath = path.join(hermesHome, 'config.yaml');

  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = parseSimpleYaml(configContent) as Record<string, unknown> | null;
    if (!config || typeof config !== 'object') return false;

    const skillsCfg = config.skills as Record<string, unknown> | undefined;
    if (!skillsCfg || typeof skillsCfg !== 'object') return false;

    const disabled = skillsCfg.disabled;
    if (Array.isArray(disabled)) {
      return disabled.map(String).includes(name);
    }

    // Check platform-specific disabled list
    const platform =
      process.env.HERMES_PLATFORM || process.env.HERMES_SESSION_PLATFORM;
    if (platform) {
      const platformDisabled = (
        skillsCfg.platform_disabled as Record<string, unknown> | undefined
      )?.[platform];
      if (Array.isArray(platformDisabled)) {
        return platformDisabled.map(String).includes(name);
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get disabled skill names from config.
 */
async function getDisabledSkillNames(): Promise<Set<string>> {
  const hermesHome = getHermesHome();
  const configPath = path.join(hermesHome, 'config.yaml');

  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = parseSimpleYaml(configContent) as Record<string, unknown> | null;
    if (!config || typeof config !== 'object') return new Set();

    const skillsCfg = config.skills as Record<string, unknown> | undefined;
    if (!skillsCfg || typeof skillsCfg !== 'object') return new Set();

    const platform =
      process.env.HERMES_PLATFORM || process.env.HERMES_SESSION_PLATFORM;
    if (platform) {
      const pd = (
        skillsCfg.platform_disabled as Record<string, unknown> | undefined
      )?.[platform];
      if (Array.isArray(pd)) {
        return new Set(pd.map(String));
      }
    }

    const disabled = skillsCfg.disabled;
    if (Array.isArray(disabled)) {
      return new Set(disabled.map(String));
    }

    return new Set();
  } catch {
    return new Set();
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Scan all skill directories and return metadata for every discovered skill.
 *
 * @param options.category - Filter by category name
 * @param options.search - Filter by name or description substring
 * @param options.includeDisabled - Include disabled skills (default: false)
 */
export async function scanSkills(
  options?: ScanOptions,
): Promise<SkillInfo[]> {
  const allDirs = await getAllSkillsDirs();
  const disabled = options?.includeDisabled
    ? new Set<string>()
    : await getDisabledSkillNames();

  const skills: SkillInfo[] = [];
  const seenNames = new Set<string>();

  // Mark which dirs are "builtin" (repo-bundled)
  const projectRoot = getProjectRoot();
  const bundledDirPrefix = path.join(projectRoot, 'hermes-agent');

  for (const skillsDir of allDirs) {
    const isBuiltin = skillsDir.startsWith(bundledDirPrefix);
    const skillFiles = await iterSkillIndexFiles(skillsDir, SKILL_INDEX_FILE);

    for (const skillFilePath of skillFiles) {
      try {
        const rawContent = await fs.readFile(skillFilePath, 'utf-8');
        // Only read first 4000 chars for metadata scan (perf optimization)
        const header = rawContent.slice(0, 4000);
        const { frontmatter, body } = parseFrontmatter(header);

        if (!skillMatchesPlatform(frontmatter)) continue;

        const dirName = path.basename(path.dirname(skillFilePath));
        const name = String(frontmatter.name || dirName).slice(
          0,
          MAX_NAME_LENGTH,
        );

        if (seenNames.has(name)) continue;
        if (disabled.has(name)) continue;

        // Search filter
        if (options?.search) {
          const searchLower = options.search.toLowerCase();
          const desc = extractFullDescription(frontmatter, body);
          if (
            !name.toLowerCase().includes(searchLower) &&
            !desc.toLowerCase().includes(searchLower)
          ) {
            continue;
          }
        }

        const category = getCategoryFromPath(skillFilePath, skillsDir);
        if (options?.category && category !== options.category) continue;

        const description = extractFullDescription(frontmatter, body);
        const tags = parseTags(frontmatter);
        const platforms = Array.isArray(frontmatter.platforms)
          ? frontmatter.platforms.map(String)
          : undefined;
        const relatedSkills = parseRelatedSkills(frontmatter);

        seenNames.add(name);
        skills.push({
          name,
          category,
          description,
          tags,
          isBuiltin,
          path: skillFilePath,
          status: 'active',
          platforms,
          relatedSkills,
        });
      } catch {
        // Skip unreadable or unparseable skills gracefully
        continue;
      }
    }
  }

  // Sort by category then name
  skills.sort((a, b) => {
    const catA = a.category || '';
    const catB = b.category || '';
    if (catA !== catB) return catA.localeCompare(catB);
    return a.name.localeCompare(b.name);
  });

  return skills;
}

/**
 * Get the full content of a skill plus its linked files.
 *
 * Searches all skill directories (local first, then external/bundled).
 *
 * @param name - Skill name or path (e.g., "axolotl" or "mlops/axolotl")
 * @returns Skill content and linked files, or null if not found
 */
export async function getSkillContent(
  name: string,
): Promise<{ content: string; linkedFiles: LinkedFile[] } | null> {
  const allDirs = await getAllSkillsDirs();

  let skillDir: string | null = null;
  let skillMdPath: string | null = null;

  // Search all dirs: local first, then external/bundled (first match wins)
  for (const searchDir of allDirs) {
    // Try direct path (e.g., "mlops/axolotl")
    const directPath = path.join(searchDir, name);
    try {
      const stat = await fs.stat(directPath);
      if (stat.isDirectory()) {
        const candidateMd = path.join(directPath, SKILL_INDEX_FILE);
        try {
          await fs.access(candidateMd);
          skillDir = directPath;
          skillMdPath = candidateMd;
          break;
        } catch {
          // No SKILL.md in this directory
        }
      }
    } catch {
      // Direct path doesn't exist
    }

    // Search by directory name
    const skillFiles = await iterSkillIndexFiles(searchDir, SKILL_INDEX_FILE);
    for (const skillFile of skillFiles) {
      if (path.basename(path.dirname(skillFile)) === name) {
        skillDir = path.dirname(skillFile);
        skillMdPath = skillFile;
        break;
      }
    }
    if (skillMdPath) break;
  }

  if (!skillMdPath) return null;

  // Read skill content
  let content: string;
  try {
    content = await fs.readFile(skillMdPath, 'utf-8');
  } catch {
    return null;
  }

  // Check platform compatibility
  const { frontmatter } = parseFrontmatter(content);
  if (!skillMatchesPlatform(frontmatter)) return null;

  // Collect linked files
  const linkedFiles: LinkedFile[] = [];

  if (skillDir) {
    const subDirs = ['references', 'templates', 'assets', 'scripts'];
    const textExtensions = new Set([
      '.md',
      '.py',
      '.yaml',
      '.yml',
      '.json',
      '.tex',
      '.sh',
      '.bash',
      '.js',
      '.ts',
      '.rb',
    ]);

    for (const subDir of subDirs) {
      const fullSubDir = path.join(skillDir, subDir);
      try {
        await fs.access(fullSubDir);
        const files = await iterAllFiles(fullSubDir);
        for (const file of files) {
          try {
            const stat = await fs.stat(file);
            linkedFiles.push({
              name: path.relative(skillDir, file),
              size: stat.size,
            });
          } catch {
            // Skip files we can't stat
          }
        }
      } catch {
        // Subdirectory doesn't exist
      }
    }

    // Also include top-level non-SKILL.md files
    try {
      const entries = await fs.readdir(skillDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name !== SKILL_INDEX_FILE) {
          if (textExtensions.has(path.extname(entry.name))) {
            try {
              const stat = await fs.stat(path.join(skillDir, entry.name));
              linkedFiles.push({
                name: entry.name,
                size: stat.size,
              });
            } catch {
              // Skip
            }
          }
        }
      }
    } catch {
      // Can't read directory
    }
  }

  return { content, linkedFiles };
}

/**
 * Recursively get all file paths in a directory.
 */
async function iterAllFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await iterAllFiles(fullPath)));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory not readable
  }

  return results;
}

/**
 * Manage (create, patch, edit, delete) a skill.
 *
 * New skills are created in ~/.hermes/skills/{category}/{name}/SKILL.md.
 *
 * @param action - 'create' | 'patch' | 'edit' | 'delete'
 * @param options - Skill management options
 */
export async function manageSkill(
  action: 'create' | 'patch' | 'edit' | 'delete',
  options: SkillManageOptions,
): Promise<SkillManageResult> {
  // Ensure hermes home exists for write operations
  const hermesHome = await ensureHermesHome();
  const localSkillsDir = path.join(hermesHome, 'skills');
  const category = options.category || 'general';
  const skillDir = path.join(localSkillsDir, category, options.name);
  const skillMdPath = path.join(skillDir, SKILL_INDEX_FILE);

  switch (action) {
    case 'create': {
      // Check if already exists
      try {
        await fs.access(skillMdPath);
        return {
          success: false,
          error: `Skill '${options.name}' already exists in category '${category}'. Use 'edit' or 'patch' to modify it.`,
        };
      } catch {
        // Doesn't exist — good, create it
      }

      const description = options.description || '';
      const instructions = options.instructions || options.content || '';

      const frontmatter = [
        '---',
        `name: ${options.name}`,
        `description: ${description}`,
        '---',
        '',
        `# ${options.name}`,
        '',
        instructions.trim(),
        '',
      ].join('\n');

      try {
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(skillMdPath, frontmatter, 'utf-8');
        return { success: true, path: skillMdPath };
      } catch (err) {
        return {
          success: false,
          error: `Failed to create skill: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'patch': {
      // Append instructions to existing skill
      try {
        let existing = await fs.readFile(skillMdPath, 'utf-8');
        const patchContent = options.instructions || options.content || '';

        if (!patchContent.trim()) {
          return { success: false, error: 'No patch content provided.' };
        }

        existing = existing.trimEnd() + '\n\n' + patchContent.trim() + '\n';
        await fs.writeFile(skillMdPath, existing, 'utf-8');
        return { success: true, path: skillMdPath };
      } catch (err) {
        return {
          success: false,
          error: `Failed to patch skill: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'edit': {
      // Replace the entire skill content
      try {
        const description = options.description || '';
        const instructions = options.instructions || options.content || '';

        const frontmatter = [
          '---',
          `name: ${options.name}`,
          `description: ${description}`,
          '---',
          '',
          `# ${options.name}`,
          '',
          instructions.trim(),
          '',
        ].join('\n');

        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(skillMdPath, frontmatter, 'utf-8');
        return { success: true, path: skillMdPath };
      } catch (err) {
        return {
          success: false,
          error: `Failed to edit skill: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'delete': {
      try {
        // First find the skill across all dirs
        const allDirs = await getAllSkillsDirs();
        let targetDir: string | null = null;

        for (const dir of allDirs) {
          const directPath = path.join(dir, options.name);
          try {
            const stat = await fs.stat(directPath);
            if (stat.isDirectory()) {
              targetDir = directPath;
              break;
            }
          } catch {
            // Not found here
          }

          // Search by name within category
          if (options.category) {
            const catDir = path.join(dir, options.category, options.name);
            try {
              const stat = await fs.stat(catDir);
              if (stat.isDirectory()) {
                targetDir = catDir;
                break;
              }
            } catch {
              // Not found here
            }
          }
        }

        if (!targetDir) {
          // Try to find by scanning
          for (const dir of allDirs) {
            const files = await iterSkillIndexFiles(dir, SKILL_INDEX_FILE);
            for (const f of files) {
              if (path.basename(path.dirname(f)) === options.name) {
                targetDir = path.dirname(f);
                break;
              }
            }
            if (targetDir) break;
          }
        }

        if (!targetDir) {
          return {
            success: false,
            error: `Skill '${options.name}' not found.`,
          };
        }

        await fs.rm(targetDir, { recursive: true, force: true });
        return { success: true, path: targetDir };
      } catch (err) {
        return {
          success: false,
          error: `Failed to delete skill: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

/**
 * Build the <available_skills> block for the system prompt.
 *
 * Lists all skills grouped by category with descriptions. Filters by
 * available tools/toolsets if provided (respects conditional activation).
 *
 * @param availableTools - Set of tool names the agent has access to
 */
export async function buildSkillsSystemPrompt(
  availableTools?: Set<string>,
): Promise<string> {
  const allDirs = await getAllSkillsDirs();
  const disabled = await getDisabledSkillNames();

  const skillsByCategory = new Map<string, Array<[string, string]>>();
  const categoryDescriptions = new Map<string, string>();
  const seenNames = new Set<string>();

  for (const skillsDir of allDirs) {
    const skillFiles = await iterSkillIndexFiles(skillsDir, SKILL_INDEX_FILE);

    for (const skillFilePath of skillFiles) {
      try {
        const raw = (await fs.readFile(skillFilePath, 'utf-8')).slice(0, 2000);
        const { frontmatter } = parseFrontmatter(raw);

        if (!skillMatchesPlatform(frontmatter)) continue;

        // Determine skill name and category from path
        const relPath = path.relative(skillsDir, skillFilePath);
        const parts = relPath.split(path.sep);
        let skillName: string;
        let category: string;

        if (parts.length >= 2) {
          skillName = parts[parts.length - 2];
          category = parts.slice(0, -2).join('/') || 'general';
        } else {
          category = 'general';
          skillName = path.basename(path.dirname(skillFilePath));
        }

        const fmName = String(frontmatter.name || skillName);
        if (fmName in seenNames || skillName in seenNames) continue;
        if (disabled.has(fmName) || disabled.has(skillName)) continue;

        // Check conditional activation
        const conditions = extractSkillConditions(frontmatter);
        if (!skillShouldShow(conditions, availableTools)) continue;

        const desc = extractDescription(frontmatter);

        seenNames.add(fmName);
        seenNames.add(skillName);

        const catSkills = skillsByCategory.get(category) || [];
        catSkills.push([skillName, desc]);
        skillsByCategory.set(category, catSkills);
      } catch {
        continue;
      }
    }

    // Read category-level DESCRIPTION.md files
    const descFiles = await iterSkillIndexFiles(skillsDir, DESCRIPTION_FILE);
    for (const descFilePath of descFiles) {
      try {
        const content = await fs.readFile(descFilePath, 'utf-8');
        const { frontmatter } = parseFrontmatter(content);
        const catDesc = frontmatter.description;
        if (!catDesc) continue;

        const rel = path.relative(skillsDir, descFilePath);
        const parts = rel.split(path.sep);
        const cat = parts.length > 1 ? parts.slice(0, -1).join('/') : 'general';
        if (!categoryDescriptions.has(cat)) {
          categoryDescriptions.set(
            cat,
            String(catDesc).trim().replace(/^['"]|['"]$/g, ''),
          );
        }
      } catch {
        continue;
      }
    }
  }

  if (skillsByCategory.size === 0) return '';

  const indexLines: string[] = [];

  for (const category of Array.from(skillsByCategory.keys()).sort()) {
    const catDesc = categoryDescriptions.get(category);
    if (catDesc) {
      indexLines.push(`  ${category}: ${catDesc}`);
    } else {
      indexLines.push(`  ${category}:`);
    }

    // Deduplicate and sort skills within each category
    const seen = new Set<string>();
    const catSkills = (skillsByCategory.get(category) || []).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    for (const [skillName, desc] of catSkills) {
      if (seen.has(skillName)) continue;
      seen.add(skillName);
      if (desc) {
        indexLines.push(`    - ${skillName}: ${desc}`);
      } else {
        indexLines.push(`    - ${skillName}`);
      }
    }
  }

  return (
    '## Skills (mandatory)\n' +
    'Before replying, scan the skills below. If one clearly matches your task, ' +
    "load it with skill_view(name) and follow its instructions. " +
    "If a skill has issues, fix it with skill_manage(action='patch').\n" +
    'After difficult/iterative tasks, offer to save as a skill. ' +
    'If a skill you loaded was missing steps, had wrong commands, or needed ' +
    'pitfalls you discovered, update it before finishing.\n' +
    '\n' +
    '<available_skills>\n' +
    indexLines.join('\n') +
    '\n</available_skills>\n' +
    '\n' +
    'If none match, proceed normally without loading a skill.'
  );
}

/**
 * Determine whether a skill should be shown based on its conditional activation
 * rules and the currently available tools/toolsets.
 */
function skillShouldShow(
  conditions: {
    fallback_for_toolsets: string[];
    requires_toolsets: string[];
    fallback_for_tools: string[];
    requires_tools: string[];
  },
  availableTools?: Set<string>,
): boolean {
  if (!availableTools) return true; // No filtering info — show everything

  // fallback_for: hide when the primary tool/toolset IS available
  for (const ts of conditions.fallback_for_toolsets) {
    if (availableTools.has(ts)) return false;
  }
  for (const t of conditions.fallback_for_tools) {
    if (availableTools.has(t)) return false;
  }

  // requires: hide when a required tool/toolset is NOT available
  for (const ts of conditions.requires_toolsets) {
    if (!availableTools.has(ts)) return false;
  }
  for (const t of conditions.requires_tools) {
    if (!availableTools.has(t)) return false;
  }

  return true;
}
