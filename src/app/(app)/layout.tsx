import { auth } from '@/lib/auth/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <Sidebar />
      <TopBar userEmail={session.user.email} userName={session.user.name} />
      <main className="lg:ml-64 mt-16 p-4 lg:p-6">
        {children}
      </main>
    </div>
  )
}
