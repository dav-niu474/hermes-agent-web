import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : [],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

/** Default NVIDIA API key */
const DEFAULT_NVIDIA_API_KEY = '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'

/** Get NVIDIA API key from env or default */
export function getNvidiaApiKey(): string {
  return process.env.NVIDIA_API_KEY || DEFAULT_NVIDIA_API_KEY
}

/** Track whether seeding has been attempted this process */
let seeded = false

/**
 * Ensure the nvidia_api_key entry exists in AgentConfig.
 * Idempotent — safe to call multiple times.
 */
export async function ensureNvidiaApiKey(): Promise<string> {
  if (seeded) {
    try {
      const existing = await db.agentConfig.findUnique({ where: { key: 'nvidia_api_key' } })
      return existing?.value || DEFAULT_NVIDIA_API_KEY
    } catch {
      return DEFAULT_NVIDIA_API_KEY
    }
  }

  try {
    const existing = await db.agentConfig.findUnique({ where: { key: 'nvidia_api_key' } })
    if (!existing) {
      await db.agentConfig.upsert({
        where: { key: 'nvidia_api_key' },
        update: {},
        create: {
          key: 'nvidia_api_key',
          value: getNvidiaApiKey(),
          type: 'string',
          group: 'nvidia',
          label: 'NVIDIA API Key',
          description: 'API key for NVIDIA NIM inference endpoints (integrate.api.nvidia.com)',
        },
      })
      console.log('[DB] Initialized nvidia_api_key in AgentConfig')
    }
    seeded = true
    return existing?.value || getNvidiaApiKey()
  } catch {
    seeded = true
    return getNvidiaApiKey()
  }
}
