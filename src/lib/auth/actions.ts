'use server'

import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { signupSchema } from '@/lib/validators/auth'
import { signIn } from './auth'
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email/resend'

export async function googleSignIn() {
  await signIn('google', { redirectTo: '/dashboard' })
}

export async function signup(formData: FormData) {
  const raw = {
    name: formData.get('name') as string,
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const parsed = signupSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { name, email, password } = parsed.data
  const normalizedEmail = email.toLowerCase()

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  })

  if (existing) {
    return { error: 'An account with this email already exists' }
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const verifyToken = crypto.randomBytes(32).toString('hex')

  await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      role: 'FOUNDER',
      verifyToken,
      verifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  })

  // Send verification email (don't block signup on failure)
  try {
    await sendVerificationEmail(normalizedEmail, verifyToken)
  } catch (e) {
    console.error('Failed to send verification email:', e)
  }

  // Auto sign in after signup
  await signIn('credentials', {
    email: normalizedEmail,
    password,
    redirectTo: '/dashboard',
  })
}

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: '/dashboard',
    })
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    return { error: 'Invalid email or password' }
  }
}

export async function forgotPassword(formData: FormData) {
  const email = (formData.get('email') as string)?.toLowerCase()

  if (!email) return { error: 'Email is required' }

  const user = await prisma.user.findUnique({ where: { email } })

  // Always return success to prevent email enumeration
  if (!user) return { success: true }

  const resetToken = crypto.randomBytes(32).toString('hex')

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken,
      resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    },
  })

  try {
    await sendPasswordResetEmail(email, resetToken)
  } catch (e) {
    console.error('Failed to send reset email:', e)
    return { error: 'Failed to send reset email. Please try again.' }
  }

  return { success: true }
}

export async function resetPassword(formData: FormData) {
  const token = formData.get('token') as string
  const password = formData.get('password') as string

  if (!token || !password) return { error: 'Token and password are required' }

  if (password.length < 8) return { error: 'Password must be at least 8 characters' }

  const user = await prisma.user.findUnique({ where: { resetToken: token } })

  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    return { error: 'Invalid or expired reset link. Please request a new one.' }
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null,
    },
  })

  return { success: true }
}

export async function verifyEmail(token: string) {
  const user = await prisma.user.findUnique({ where: { verifyToken: token } })

  if (!user || !user.verifyTokenExpiry || user.verifyTokenExpiry < new Date()) {
    return { error: 'Invalid or expired verification link.' }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verifyToken: null,
      verifyTokenExpiry: null,
    },
  })

  return { success: true }
}
