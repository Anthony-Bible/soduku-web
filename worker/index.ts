import { handle } from './app'
import type { Env } from './env'
import { SesMailer } from './mailer'

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx, { mailer: new SesMailer(env), now: Date.now })
  },
} satisfies ExportedHandler<Env>
