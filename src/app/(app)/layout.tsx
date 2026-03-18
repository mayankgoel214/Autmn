import { auth } from '@/lib/auth/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Get user role from database (always fresh)
  const user = session.user.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null

  const role = user?.role || 'FOUNDER'

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <Sidebar userRole={role} />
      <TopBar userEmail={session.user.email} userName={session.user.name} />
      <main className="lg:ml-64 mt-16 p-4 lg:p-6">
        {children}
      </main>
    </div>
  )
}
