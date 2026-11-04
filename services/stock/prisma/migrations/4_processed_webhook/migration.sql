-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "eventSeq" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("eventSeq")
);
