/**
 * Configuration — variables d'environnement typées
 */
export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  database: {
    url: process.env.DATABASE_URL ?? "",
  },
  cors: {
    origins: process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()) ?? [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://*.vercel.app",
    ],
  },
} as const;
