import { linkPage, me, signOut, spendCode, spendLink, startSignIn, type Deps, type Waiter } from './auth'
import type { Env } from './env'
import { errorResponse } from './http'
import { sync } from './sync'

/** Routes /api/* and /auth/*. Everything else is a static asset, served by the platform. */
export async function handle(req: Request, env: Env, ctx: Waiter, deps: Deps): Promise<Response> {
  const { pathname } = new URL(req.url)
  const route = `${req.method} ${pathname}`
  try {
    switch (route) {
      case 'GET /auth/link':
        return linkPage(req)
      case 'POST /api/auth/start':
        return await startSignIn(req, env, deps, ctx)
      case 'POST /api/auth/link':
        return await spendLink(req, env, deps)
      case 'POST /api/auth/code':
        return await spendCode(req, env, deps)
      case 'POST /api/auth/signout':
        return await signOut(req, env)
      case 'GET /api/me':
        return await me(req, env, deps)
      case 'POST /api/sync':
        return await sync(req, env, deps)
    }
  } catch (e) {
    console.error('request failed', route, e instanceof Error ? e.message : e)
    return errorResponse(500, 'server_error')
  }
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
    return errorResponse(known(pathname) ? 405 : 404, known(pathname) ? 'method_not_allowed' : 'not_found')
  }
  return env.ASSETS.fetch(req)
}

const KNOWN = new Set(['/auth/link', '/api/auth/start', '/api/auth/link', '/api/auth/code', '/api/auth/signout', '/api/me', '/api/sync'])
const known = (pathname: string): boolean => KNOWN.has(pathname)
