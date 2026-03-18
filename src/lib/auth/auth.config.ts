import type { NextAuthConfig } from 'next-auth'

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isAppRoute = nextUrl.pathname.startsWith('/dashboard') ||
        nextUrl.pathname.startsWith('/calendar') ||
        nextUrl.pathname.startsWith('/filings') ||
        nextUrl.pathname.startsWith('/taxes') ||
        nextUrl.pathname.startsWith('/health') ||
        nextUrl.pathname.startsWith('/regulatory') ||
        nextUrl.pathname.startsWith('/settings') ||
        nextUrl.pathname.startsWith('/onboarding')

      if (isAppRoute) {
        if (isLoggedIn) return true
        return false // redirect to /login
      }

      // Redirect logged-in users away from auth pages
      if (isLoggedIn && (nextUrl.pathname === '/login' || nextUrl.pathname === '/signup')) {
        return Response.redirect(new URL('/dashboard', nextUrl))
      }

      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role
        token.companyId = (user as { companyId?: string }).companyId
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        ;(session.user as { role?: string }).role = token.role as string
        ;(session.user as { companyId?: string }).companyId = token.companyId as string
      }
      return session
    },
  },
  providers: [], // configured in auth.ts
}
