-- Face search: a search run may now be for the live selfie instead of a photo.
ALTER TABLE "SearchRun" ALTER COLUMN "photoId" DROP NOT NULL;
ALTER TABLE "SearchRun" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE "Account" ADD COLUMN "faceSearchConsentedAt" TIMESTAMP(3);
