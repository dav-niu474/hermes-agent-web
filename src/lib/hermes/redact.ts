/**
 * Redact — TypeScript rewrite of agent/redact.py
 *
 * Regex-based secret redaction for logs and tool output.
 * Applies pattern matching to mask API keys, tokens, and credentials
 * before they reach log files, verbose output, or gateway logs.
 *
 * Short tokens (< 18 chars) are fully masked. Longer tokens preserve
 * the first 6 and last 4 characters for debuggability.
 *
 * Server-side only. Pure regex — no external dependencies.
 */

// ─── Configuration ──────────────────────────────────────────────────────────

/** Read once at module load — runtime env mutations cannot disable redaction */
const REDACT_ENABLED =
  !(
    process.env.HERMES_REDACT_SECRETS?.toLowerCase() === "0" ||
    process.env.HERMES_REDACT_SECRETS?.toLowerCase() === "false" ||
    process.env.HERMES_REDACT_SECRETS?.toLowerCase() === "no" ||
    process.env.HERMES_REDACT_SECRETS?.toLowerCase() === "off"
  );

// ─── Known API Key Prefix Patterns ──────────────────────────────────────────

const PREFIX_PATTERNS: string[] = [
  `sk-[A-Za-z0-9_-]{10,}`, // OpenAI / OpenRouter / Anthropic (sk-ant-*)
  `ghp_[A-Za-z0-9]{10,}`, // GitHub PAT (classic)
  `github_pat_[A-Za-z0-9_]{10,}`, // GitHub PAT (fine-grained)
  `gho_[A-Za-z0-9]{10,}`, // GitHub OAuth access token
  `ghu_[A-Za-z0-9]{10,}`, // GitHub user-to-server token
  `ghs_[A-Za-z0-9]{10,}`, // GitHub server-to-server token
  `ghr_[A-Za-z0-9]{10,}`, // GitHub refresh token
  `xox[baprs]-[A-Za-z0-9-]{10,}`, // Slack tokens
  `AIza[A-Za-z0-9_-]{30,}`, // Google API keys
  `pplx-[A-Za-z0-9]{10,}`, // Perplexity
  `fal_[A-Za-z0-9_-]{10,}`, // Fal.ai
  `fc-[A-Za-z0-9]{10,}`, // Firecrawl
  `bb_live_[A-Za-z0-9_-]{10,}`, // BrowserBase
  `gAAAA[A-Za-z0-9_=-]{20,}`, // Codex encrypted tokens
  `AKIA[A-Z0-9]{16}`, // AWS Access Key ID
  `sk_live_[A-Za-z0-9]{10,}`, // Stripe secret key (live)
  `sk_test_[A-Za-z0-9]{10,}`, // Stripe secret key (test)
  `rk_live_[A-Za-z0-9]{10,}`, // Stripe restricted key
  `SG\\.[A-Za-z0-9_-]{10,}`, // SendGrid API key
  `hf_[A-Za-z0-9]{10,}`, // HuggingFace token
  `r8_[A-Za-z0-9]{10,}`, // Replicate API token
  `npm_[A-Za-z0-9]{10,}`, // npm access token
  `pypi-[A-Za-z0-9_-]{10,}`, // PyPI API token
  `dop_v1_[A-Za-z0-9]{10,}`, // DigitalOcean PAT
  `doo_v1_[A-Za-z0-9]{10,}`, // DigitalOcean OAuth
  `am_[A-Za-z0-9_-]{10,}`, // AgentMail API key
  `sk_[A-Za-z0-9_]{10,}`, // ElevenLabs TTS key (sk_ underscore)
  `tvly-[A-Za-z0-9]{10,}`, // Tavily search API key
  `exa_[A-Za-z0-9]{10,}`, // Exa search API key
  `gsk_[A-Za-z0-9]{10,}`, // Groq Cloud API key
  `syt_[A-Za-z0-9]{10,}`, // Matrix access token
  `retaindb_[A-Za-z0-9]{10,}`, // RetainDB API key
  `hsk-[A-Za-z0-9]{10,}`, // Hindsight API key
  `mem0_[A-Za-z0-9]{10,}`, // Mem0 Platform API key
  `brv_[A-Za-z0-9]{10,}`, // ByteRover API key
];

// ─── Regex Utilities ────────────────────────────────────────────────────────

/**
 * Build a regex from an array of alternation patterns with lookbehind/lookahead guards.
 */
function buildPrefixRegex(patterns: string[]): RegExp {
  const alternation = patterns.join("|");
  return new RegExp(`(?<![A-Za-z0-9_-])(${alternation})(?![A-Za-z0-9_-])`);
}

// ─── Compiled Patterns ─────────────────────────────────────────────────────

const PREFIX_RE = buildPrefixRegex(PREFIX_PATTERNS);

/** ENV assignment patterns: KEY=value where KEY contains a secret-like name */
const SECRET_ENV_NAMES =
  "(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH)";
const ENV_ASSIGN_RE = new RegExp(
  `([A-Z0-9_]{0,50}${SECRET_ENV_NAMES}[A-Z0-9_]{0,50})\\s*=\\s*(['\"]?)(\\S+)\\2`,
);

/** JSON field patterns: "apiKey": "value", "token": "value", etc. */
const JSON_KEY_NAMES =
  "(?:api_?[Kk]ey|token|secret|password|access_token|refresh_token|auth_token|bearer|secret_value|raw_secret|secret_input|key_material)";
const JSON_FIELD_RE = new RegExp(
  `("${JSON_KEY_NAMES}")\\s*:\\s*"([^"]+)"`,
  "i",
);

/** Authorization headers */
const AUTH_HEADER_RE = new RegExp(
  "(Authorization:\\s*Bearer\\s+)(\\S+)",
  "i",
);

/** Telegram bot tokens: bot<digits>:<token> or <digits>:<token> */
const TELEGRAM_RE = new RegExp(
  "(bot)?(\\d{8,}):([-A-Za-z0-9_]{30,})",
);

/** Private key blocks */
const PRIVATE_KEY_RE = new RegExp(
  "-----BEGIN[A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END[A-Z ]*PRIVATE KEY-----",
);

/** Database connection strings: protocol://user:PASSWORD@host */
const DB_CONNSTR_RE = new RegExp(
  "((?:postgres(?:ql)?|mysql|mongodb(?:\\+srv)?|redis|amqp)://[^:]+:)([^@]+)(@)",
  "i",
);

/** E.164 phone numbers: +<country><number>, 7-15 digits */
const SIGNAL_PHONE_RE = new RegExp("(\\+[1-9]\\d{6,14})(?![A-Za-z0-9])");

// ─── Masking Functions ─────────────────────────────────────────────────────

/**
 * Mask a token for display.
 * Short tokens (< 18 chars) are fully masked.
 * Longer tokens preserve first 6 and last 4 chars.
 */
function maskToken(token: string): string {
  if (token.length < 18) return "***";
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Apply all redaction patterns to a block of text.
 *
 * Safe to call on any string — non-matching text passes through unchanged.
 * Disabled when HERMES_REDACT_SECRETS is "0", "false", "no", or "off".
 *
 * @param text - The text to redact
 * @returns The redacted text with sensitive patterns masked
 */
export function redactSensitiveText(text: unknown): string {
  if (text == null) return "";
  let str: string;
  if (typeof text !== "string") {
    str = String(text);
  } else {
    str = text;
  }
  if (!str) return str;
  if (!REDACT_ENABLED) return str;

  // Known prefixes (sk-, ghp_, etc.)
  str = str.replace(PREFIX_RE, (match: string) => maskToken(match));

  // ENV assignments: OPENAI_API_KEY=sk-abc...
  str = str.replace(ENV_ASSIGN_RE, (_match: string, name: string, quote: string, value: string) => {
    return `${name}=${quote}${maskToken(value)}${quote}`;
  });

  // JSON fields: "apiKey": "value"
  str = str.replace(JSON_FIELD_RE, (_match: string, key: string, value: string) => {
    return `${key}: "${maskToken(value)}"`;
  });

  // Authorization headers
  str = str.replace(AUTH_HEADER_RE, (_match: string, prefix: string, token: string) => prefix + maskToken(token));

  // Telegram bot tokens
  str = str.replace(TELEGRAM_RE, (_match: string, prefix: string | undefined, digits: string, _token: string) => {
    return `${prefix || ""}${digits}:***`;
  });

  // Private key blocks
  str = str.replace(PRIVATE_KEY_RE, "[REDACTED PRIVATE KEY]");

  // Database connection string passwords
  str = str.replace(DB_CONNSTR_RE, (_match: string, protocol: string, _password: string, at: string) => {
    return `${protocol}***${at}`;
  });

  // E.164 phone numbers (Signal, WhatsApp)
  str = str.replace(SIGNAL_PHONE_RE, (_match: string, phone: string) => {
    if (phone.length <= 8) {
      return phone.slice(0, 2) + "****" + phone.slice(-2);
    }
    return phone.slice(0, 4) + "****" + phone.slice(-4);
  });

  return str;
}
