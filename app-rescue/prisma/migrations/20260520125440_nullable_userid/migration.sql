-- DropForeignKey
ALTER TABLE "Deployment" DROP CONSTRAINT "Deployment_userId_fkey";

-- AlterTable
ALTER TABLE "Deployment" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
