/*
  Warnings:

  - Added the required column `bibliotecaId` to the `Livro` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `livro` ADD COLUMN `bibliotecaId` INTEGER NOT NULL,
    ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AddForeignKey
ALTER TABLE `Livro` ADD CONSTRAINT `Livro_bibliotecaId_fkey` FOREIGN KEY (`bibliotecaId`) REFERENCES `Biblioteca`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
