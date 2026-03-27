/*
  Warnings:

  - You are about to drop the column `familiaId` on the `carrinhoitem` table. All the data in the column will be lost.
  - You are about to drop the `_carrinhotocarrinhoitem` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[carrinhoId,livroId]` on the table `CarrinhoItem` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `carrinhoId` to the `CarrinhoItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `_carrinhotocarrinhoitem` DROP FOREIGN KEY `_CarrinhoToCarrinhoItem_A_fkey`;

-- DropForeignKey
ALTER TABLE `_carrinhotocarrinhoitem` DROP FOREIGN KEY `_CarrinhoToCarrinhoItem_B_fkey`;

-- DropForeignKey
ALTER TABLE `carrinhoitem` DROP FOREIGN KEY `CarrinhoItem_familiaId_fkey`;

-- DropIndex
DROP INDEX `CarrinhoItem_familiaId_idx` ON `carrinhoitem`;

-- DropIndex
DROP INDEX `CarrinhoItem_familiaId_livroId_key` ON `carrinhoitem`;

-- AlterTable
ALTER TABLE `carrinhoitem` DROP COLUMN `familiaId`,
    ADD COLUMN `carrinhoId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- DropTable
DROP TABLE `_carrinhotocarrinhoitem`;

-- CreateIndex
CREATE INDEX `CarrinhoItem_carrinhoId_idx` ON `CarrinhoItem`(`carrinhoId`);

-- CreateIndex
CREATE UNIQUE INDEX `CarrinhoItem_carrinhoId_livroId_key` ON `CarrinhoItem`(`carrinhoId`, `livroId`);

-- AddForeignKey
ALTER TABLE `CarrinhoItem` ADD CONSTRAINT `CarrinhoItem_carrinhoId_fkey` FOREIGN KEY (`carrinhoId`) REFERENCES `Carrinho`(`familiaId`) ON DELETE RESTRICT ON UPDATE CASCADE;
