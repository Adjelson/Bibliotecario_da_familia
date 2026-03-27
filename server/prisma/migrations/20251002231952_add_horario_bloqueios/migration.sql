/*
  Warnings:

  - You are about to drop the column `familiaId` on the `comentariolivro` table. All the data in the column will be lost.
  - Added the required column `userId` to the `ComentarioLivro` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `comentariolivro` DROP FOREIGN KEY `ComentarioLivro_familiaId_fkey`;

-- DropForeignKey
ALTER TABLE `comentariolivro` DROP FOREIGN KEY `ComentarioLivro_livroId_fkey`;

-- DropIndex
DROP INDEX `ComentarioLivro_familiaId_createdAt_idx` ON `comentariolivro`;

-- DropIndex
DROP INDEX `ComentarioLivro_livroId_familiaId_idx` ON `comentariolivro`;

-- AlterTable
ALTER TABLE `comentariolivro` DROP COLUMN `familiaId`,
    ADD COLUMN `userId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateTable
CREATE TABLE `HorarioSemanal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `weekday` INTEGER NOT NULL,
    `startMin` INTEGER NOT NULL,
    `endMin` INTEGER NOT NULL,
    `slotMin` INTEGER NOT NULL DEFAULT 30,
    `active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `HorarioSemanal_userId_weekday_idx`(`userId`, `weekday`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BloqueioAgenda` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `inicio` DATETIME(3) NOT NULL,
    `fim` DATETIME(3) NOT NULL,
    `motivo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BloqueioAgenda_userId_inicio_fim_idx`(`userId`, `inicio`, `fim`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- AddForeignKey
ALTER TABLE `ComentarioLivro` ADD CONSTRAINT `ComentarioLivro_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HorarioSemanal` ADD CONSTRAINT `HorarioSemanal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BloqueioAgenda` ADD CONSTRAINT `BloqueioAgenda_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
