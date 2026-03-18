import { PrismaClient } from '@prisma/client'
import { allObligations } from './seeds/obligations/all-obligations'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding compliance obligations...')

  for (const obligation of allObligations) {
    await prisma.complianceObligation.upsert({
      where: { obligationCode: obligation.obligationCode },
      update: {
        obligationName: obligation.obligationName,
        category: obligation.category,
        frequency: obligation.frequency,
        baseDueDateRule: obligation.baseDueDateRule,
        applicableConditions: obligation.applicableConditions,
        penaltyDescription: obligation.penaltyDescription,
        penaltyCalculationRule: obligation.penaltyCalculationRule,
        filingPortal: obligation.filingPortal,
        requiresDsc: obligation.requiresDsc,
        canFileViaApi: obligation.canFileViaApi,
        legalReference: obligation.legalReference,
      },
      create: {
        obligationCode: obligation.obligationCode,
        obligationName: obligation.obligationName,
        category: obligation.category,
        frequency: obligation.frequency,
        baseDueDateRule: obligation.baseDueDateRule,
        applicableConditions: obligation.applicableConditions,
        penaltyDescription: obligation.penaltyDescription,
        penaltyCalculationRule: obligation.penaltyCalculationRule,
        filingPortal: obligation.filingPortal,
        requiresDsc: obligation.requiresDsc,
        canFileViaApi: obligation.canFileViaApi,
        legalReference: obligation.legalReference,
      },
    })
  }

  console.log(`Seeded ${allObligations.length} compliance obligations`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
