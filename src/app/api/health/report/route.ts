import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { computeHealthScore } from '@/lib/services/health/health-score'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { company: true },
  })

  if (!user?.company) {
    return new Response('No company linked', { status: 400 })
  }

  const healthScore = await computeHealthScore(user.company.id)

  try {
    // Dynamic import to avoid bundling issues
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { ComplianceReport } = await import('@/components/pdf/ComplianceReport')
    const React = await import('react')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(ComplianceReport, {
      companyName: user.company.companyName,
      cin: user.company.cin || '',
      healthScore,
      generatedAt: new Date().toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric',
      }),
    }) as any

    const buffer = await renderToBuffer(element)

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="AUTMN-Compliance-Report-${user.company.cin || 'report'}.pdf"`,
      },
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    // Fallback — return JSON report
    return Response.json({
      companyName: user.company.companyName,
      cin: user.company.cin,
      ...healthScore,
      generatedAt: new Date().toISOString(),
    })
  }
}
