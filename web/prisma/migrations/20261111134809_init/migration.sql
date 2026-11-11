-- CreateEnum
CREATE TYPE "Tag" AS ENUM ('UNTAGGED', 'MINE', 'FAKE', 'IGNORE');

-- CreateEnum
CREATE TYPE "LivenessStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('FOUND', 'NOT_FOUND', 'UNKNOWN', 'MANUAL');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentedAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivenessSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "LivenessStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "passedAt" TIMESTAMP(3),

    CONSTRAINT "LivenessSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "fileDeletedAt" TIMESTAMP(3),

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRun" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageMatch" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "siteName" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "foundDate" TIMESTAMP(3),
    "tag" "Tag" NOT NULL DEFAULT 'UNTAGGED',

    CONSTRAINT "ImageMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Username" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Username_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileCheck" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "usernameId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "status" "ProfileStatus" NOT NULL,
    "tag" "Tag" NOT NULL DEFAULT 'UNTAGGED',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_tokenHash_key" ON "Account"("tokenHash");

-- CreateIndex
CREATE INDEX "LivenessSession_accountId_idx" ON "LivenessSession"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_storageKey_key" ON "Photo"("storageKey");

-- CreateIndex
CREATE INDEX "Photo_accountId_idx" ON "Photo"("accountId");

-- CreateIndex
CREATE INDEX "Photo_expiresAt_idx" ON "Photo"("expiresAt");

-- CreateIndex
CREATE INDEX "SearchRun_accountId_createdAt_idx" ON "SearchRun"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ImageMatch_accountId_idx" ON "ImageMatch"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Username_accountId_handle_key" ON "Username"("accountId", "handle");

-- CreateIndex
CREATE INDEX "ProfileCheck_accountId_idx" ON "ProfileCheck"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileCheck_usernameId_siteId_key" ON "ProfileCheck"("usernameId", "siteId");

-- AddForeignKey
ALTER TABLE "LivenessSession" ADD CONSTRAINT "LivenessSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRun" ADD CONSTRAINT "SearchRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRun" ADD CONSTRAINT "SearchRun_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageMatch" ADD CONSTRAINT "ImageMatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageMatch" ADD CONSTRAINT "ImageMatch_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Username" ADD CONSTRAINT "Username_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileCheck" ADD CONSTRAINT "ProfileCheck_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileCheck" ADD CONSTRAINT "ProfileCheck_usernameId_fkey" FOREIGN KEY ("usernameId") REFERENCES "Username"("id") ON DELETE CASCADE ON UPDATE CASCADE;
