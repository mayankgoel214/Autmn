import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { authConfig } from './auth.config'
import { loginSchema } from '@/lib/validators/auth'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt' },
  providers: [
    // Google OAuth
    ...(process.env.AUTH_GOOGLE_ID ? [Google] : []),

    // Email + Password
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        })

        if (!user || !user.passwordHash) return null

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // For Google OAuth: create or link user in our database
      if (account?.provider === 'google' && user.email) {
        const existing = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
        })

        if (!existing) {
          // Create new user from Google
          await prisma.user.create({
            data: {
              email: user.email.toLowerCase(),
              name: user.name || null,
              image: (user as { image?: string }).image || null,
              emailVerified: true, // Google emails are verified
              role: 'FOUNDER',
            },
          })
        }
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (user) {
        // On initial sign-in, get user from our DB
        const dbUser = await prisma.user.findUnique({
          where: { email: (user.email || '').toLowerCase() },
        })
        if (dbUser) {
          token.id = dbUser.id
          token.role = dbUser.role
          token.companyId = dbUser.companyId
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        ;(session.user as { role?: string }).role = token.role as string
        ;(session.user as { companyId?: string }).companyId = token.companyId as string
      }
      return session
    },
  },
})
