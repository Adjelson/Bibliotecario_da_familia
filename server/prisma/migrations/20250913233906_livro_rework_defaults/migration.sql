/*
  Warnings:

  - You are about to drop the column `idadeMax` on the `livro` table. All the data in the column will be lost.
  - You are about to drop the column `idadeMin` on the `livro` table. All the data in the column will be lost.
  - You are about to drop the column `tags` on the `livro` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `livro` DROP COLUMN `idadeMax`,
    DROP COLUMN `idadeMin`,
    DROP COLUMN `tags`,
    ADD COLUMN `categoria` VARCHAR(191) NOT NULL DEFAULT 'Geral',
    ADD COLUMN `descricao` VARCHAR(191) NULL,
    ADD COLUMN `faixaEtaria` VARCHAR(191) NOT NULL DEFAULT 'Indefinida',
    ADD COLUMN `imagem` VARCHAR(191) NULL,
    ADD COLUMN `preco` DOUBLE NULL,
    ADD COLUMN `quantidade` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `tipoAquisicao` ENUM('compra', 'emprestimo') NOT NULL DEFAULT 'emprestimo',
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
