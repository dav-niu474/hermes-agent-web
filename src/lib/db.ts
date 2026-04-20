import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : [],
  })

// Cache in global scope for hot-reload in development, and cold-start reuse in serverless
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = db
}
