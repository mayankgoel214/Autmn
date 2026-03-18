export { auth as middleware } from '@/lib/auth/auth'

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/calendar/:path*',
    '/filings/:path*',
    '/taxes/:path*',
    '/health/:path*',
    '/regulatory/:path*',
    '/settings/:path*',
    '/onboarding/:path*',
    '/login',
    '/signup',
  ],
}
