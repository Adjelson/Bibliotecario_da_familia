/*
  Warnings:

  - Added the required column `updatedAt` to the `Requisicao` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `requisicao` ADD COLUMN `entregaData` DATETIME(3) NULL,
    ADD COLUMN `entregaTipo` ENUM('domicilio', 'biblioteca') NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- CreateIndex
CREATE INDEX `Requisicao_status_createdAt_idx` ON `Requisicao`(`status`, `createdAt`);

-- CreateIndex
CREATE INDEX `Requisicao_familiaId_createdAt_idx` ON `Requisicao`(`familiaId`, `createdAt`);

-- CreateIndex
CREATE INDEX `Requisicao_livroId_createdAt_idx` ON `Requisicao`(`livroId`, `createdAt`);
