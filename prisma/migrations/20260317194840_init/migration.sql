-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FOUNDER', 'CA_ADVISOR', 'TEAM_MEMBER', 'ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'FOUNDER',
    "company_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "cin" VARCHAR(21),
    "company_name" VARCHAR(255) NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "date_of_incorporation" DATE,
    "registered_state" VARCHAR(50),
    "registered_address" TEXT,
    "authorized_capital" BIGINT,
    "paid_up_capital" BIGINT,
    "industry_sector" VARCHAR(100),
    "gst_number" VARCHAR(15),
    "pan_number" VARCHAR(10),
    "tan_number" VARCHAR(10),
    "employee_count" INTEGER NOT NULL DEFAULT 0,
    "operating_states" JSONB NOT NULL DEFAULT '[]',
    "annual_turnover" BIGINT,
    "has_foreign_investment" BOOLEAN NOT NULL DEFAULT false,
    "dpiit_recognized" BOOLEAN NOT NULL DEFAULT false,
    "mca_status" VARCHAR(50),
    "gst_registered" BOOLEAN NOT NULL DEFAULT false,
    "gst_scheme" VARCHAR(20),
    "pf_registered" BOOLEAN NOT NULL DEFAULT false,
    "esi_registered" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directors" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "din" VARCHAR(8),
    "name" VARCHAR(255) NOT NULL,
    "designation" VARCHAR(100),
    "date_of_appointment" DATE,
    "dir3_kyc_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "dir3_kyc_due_date" DATE,
    "din_status" VARCHAR(20) NOT NULL DEFAULT 'active',

    CONSTRAINT "directors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_obligations" (
    "id" UUID NOT NULL,
    "obligation_code" VARCHAR(50) NOT NULL,
    "obligation_name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "frequency" VARCHAR(20) NOT NULL,
    "base_due_date_rule" JSONB NOT NULL,
    "applicable_conditions" JSONB NOT NULL,
    "penalty_description" TEXT,
    "penalty_calculation_rule" JSONB,
    "filing_portal" VARCHAR(100),
    "requires_dsc" BOOLEAN NOT NULL DEFAULT false,
    "can_file_via_api" BOOLEAN NOT NULL DEFAULT false,
    "data_sources" JSONB,
    "legal_reference" VARCHAR(255),
    "effective_from" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "compliance_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_obligations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "obligation_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "activated_date" DATE,
    "deactivated_date" DATE,
    "notes" TEXT,

    CONSTRAINT "company_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filing_instances" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "obligation_id" UUID NOT NULL,
    "period" VARCHAR(20) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'upcoming',
    "prepared_data" JSONB,
    "filed_date" DATE,
    "acknowledgment_number" VARCHAR(50),
    "penalty_accrued" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "filed_by" VARCHAR(20),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "filing_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "companies_cin_key" ON "companies"("cin");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_obligations_obligation_code_key" ON "compliance_obligations"("obligation_code");

-- CreateIndex
CREATE UNIQUE INDEX "company_obligations_company_id_obligation_id_key" ON "company_obligations"("company_id", "obligation_id");

-- CreateIndex
CREATE INDEX "filing_instances_company_id_due_date_idx" ON "filing_instances"("company_id", "due_date");

-- CreateIndex
CREATE INDEX "filing_instances_company_id_status_idx" ON "filing_instances"("company_id", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directors" ADD CONSTRAINT "directors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_obligations" ADD CONSTRAINT "company_obligations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_obligations" ADD CONSTRAINT "company_obligations_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "compliance_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filing_instances" ADD CONSTRAINT "filing_instances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filing_instances" ADD CONSTRAINT "filing_instances_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "compliance_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
