/** Bindings, variables and secrets of the Worker (see wrangler.jsonc). */
export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  SES_REGION: string
  EMAIL_FROM: string
  /** The one origin allowed to call the API, and the base of Magic Links. */
  APP_ORIGIN: string
  /** Extra comma-separated origins allowed to call the API; set only for local development in .dev.vars. */
  EXTRA_ORIGINS?: string
  /** Secrets: `wrangler secret put`. */
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
}
