import { z } from 'zod'

const envSchema = z.object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Supabase Postgres connection string)'),
    DATABASE_SSL: z.enum(['require', 'strict', 'disable']).default('require'),
    BETTER_AUTH_SECRET: z.string().min(16, 'BETTER_AUTH_SECRET must be at least 16 characters'),
    BETTER_AUTH_URL: z.url().default('http://localhost:3001'),
    // Comma-separated list of allowed browser origins, e.g.
    // "https://app.prognotic.com,http://localhost:5173". Empty = none.
    CORS_ORIGINS: z.string().default(''),
    AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(100),
    TRUST_PROXY: z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
})

export type Env = z.infer<typeof envSchema> & { corsOrigins: string[] }

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
    const parsed = envSchema.safeParse(source)
    if (!parsed.success) {
        const details = parsed.error.issues
            .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
            .join('\n')
        throw new Error(`Invalid environment configuration:\n${details}`)
    }
    const corsOrigins = parsed.data.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
    return { ...parsed.data, corsOrigins }
}
