import { NextRequest, NextResponse } from 'next/server'

// ── Admin auth guard ──────────────────────────────────────────────────────────
// Set ADMIN_AUTH_ENABLED=true in .env to activate.
// Until then this proxy does nothing.
// ─────────────────────────────────────────────────────────────────────────────

const ENABLED = process.env.ADMIN_AUTH_ENABLED === 'true'
const COOKIE  = 'admin_auth'

export function proxy(request: NextRequest) {
  if (!ENABLED) return NextResponse.next()

  const { pathname } = request.nextUrl

  // Allow the login page and login API through unconditionally
  if (pathname === '/admin/login' || pathname.startsWith('/api/admin/')) {
    return NextResponse.next()
  }

  // Protect all /admin/* routes
  if (pathname.startsWith('/admin')) {
    const cookie = request.cookies.get(COOKIE)
    const expected = process.env.ADMIN_PASSWORD

    if (!cookie || !expected || cookie.value !== expected) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/admin/login'
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*']
}
