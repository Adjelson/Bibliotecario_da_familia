/*
  Warnings:

  - The values [MPESA] on the enum `Pagamento_metodo` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `pagamento` MODIFY `metodo` ENUM('CARTAO', 'BISTP', 'DINHEIRO') NOT NULL;
