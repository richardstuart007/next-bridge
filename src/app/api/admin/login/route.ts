import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()
    const expected = process.env.ADMIN_PASSWORD

    if (!expected) {
      return NextResponse.json({ error: 'ADMIN_PASSWORD not configured' }, { status: 500 })
    }

    if (password !== expected) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set('admin_auth', expected, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30  // 30 days
    })
    return response
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
