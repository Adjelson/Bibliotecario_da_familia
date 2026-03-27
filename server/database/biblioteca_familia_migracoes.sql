-- Biblioteca Familia - SQL consolidado
-- Gerado a partir das migrations Prisma do projeto
-- Atenção: este ficheiro aplica as migrations em sequência.

CREATE DATABASE IF NOT EXISTS `biblioteca_familia` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `biblioteca_familia`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;


-- ==================================================
-- 20250902233249_fix_relations
-- ==================================================

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('PAI', 'BIBLIOTECARIO', 'ADMIN') NOT NULL DEFAULT 'PAI',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `bibliotecaId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Familia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `telefone` VARCHAR(191) NOT NULL,
    `morada` VARCHAR(191) NOT NULL,
    `interesses` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Familia_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Filho` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `familiaId` INTEGER NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `idade` INTEGER NOT NULL,
    `genero` VARCHAR(191) NOT NULL,
    `perfilLeitor` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Biblioteca` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `local` VARCHAR(191) NULL,

    UNIQUE INDEX `Biblioteca_nome_key`(`nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Livro` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `titulo` VARCHAR(191) NOT NULL,
    `autor` VARCHAR(191) NOT NULL,
    `idadeMin` INTEGER NULL,
    `idadeMax` INTEGER NULL,
    `tags` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Consulta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `familiaId` INTEGER NOT NULL,
    `bibliotecarioId` INTEGER NOT NULL,
    `dataHora` DATETIME(3) NOT NULL,
    `status` ENUM('MARCADA', 'CONCLUIDA', 'CANCELADA') NOT NULL DEFAULT 'MARCADA',
    `notas` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Requisicao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `familiaId` INTEGER NOT NULL,
    `livroId` INTEGER NOT NULL,
    `status` ENUM('PENDENTE', 'APROVADA', 'NEGADA', 'DEVOLVIDA') NOT NULL DEFAULT 'PENDENTE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Mensagem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fromUserId` INTEGER NOT NULL,
    `toUserId` INTEGER NOT NULL,
    `body` VARCHAR(191) NOT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Mensagem_fromUserId_toUserId_createdAt_idx`(`fromUserId`, `toUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notificacao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` VARCHAR(191) NOT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notificacao_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Atividade` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `action` VARCHAR(191) NOT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Atividade_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recomendacao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `titulo` VARCHAR(191) NOT NULL,
    `autor` VARCHAR(191) NOT NULL,
    `idadeMin` INTEGER NULL,
    `idadeMax` INTEGER NULL,
    `tags` JSON NOT NULL,
    `motivo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_bibliotecaId_fkey` FOREIGN KEY (`bibliotecaId`) REFERENCES `Biblioteca`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Familia` ADD CONSTRAINT `Familia_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Filho` ADD CONSTRAINT `Filho_familiaId_fkey` FOREIGN KEY (`familiaId`) REFERENCES `Familia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Consulta` ADD CONSTRAINT `Consulta_familiaId_fkey` FOREIGN KEY (`familiaId`) REFERENCES `Familia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Consulta` ADD CONSTRAINT `Consulta_bibliotecarioId_fkey` FOREIGN KEY (`bibliotecarioId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Requisicao` ADD CONSTRAINT `Requisicao_familiaId_fkey` FOREIGN KEY (`familiaId`) REFERENCES `Familia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Requisicao` ADD CONSTRAINT `Requisicao_livroId_fkey` FOREIGN KEY (`livroId`) REFERENCES `Livro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Mensagem` ADD CONSTRAINT `Mensagem_fromUserId_fkey` FOREIGN KEY (`fromUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Mensagem` ADD CONSTRAINT `Mensagem_toUserId_fkey` FOREIGN KEY (`toUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notificacao` ADD CONSTRAINT `Notificacao_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Atividade` ADD CONSTRAINT `Atividade_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- ==================================================
-- 20250913222007_backrelations_eventos
-- ==================================================

-- CreateTable
CREATE TABLE `Evento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `titulo` VARCHAR(191) NOT NULL,
    `descricao` VARCHAR(191) NOT NULL,
    `data` DATETIME(3) NOT NULL,
    `horario` VARCHAR(191) NOT NULL,
    `local` VARCHAR(191) NOT NULL,
    `vagas` INTEGER NOT NULL,
    `imagem` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'agendada',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Evento_data_status_idx`(`data`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventoParticipante` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventoId` INTEGER NOT NULL,
    `familiaId` INTEGER NULL,
    `utilizadorId` INTEGER NULL,
    `presente` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EventoParticipante_eventoId_presente_idx`(`eventoId`, `presente`),
    UNIQUE INDEX `EventoParticipante_eventoId_familiaId_key`(`eventoId`, `familiaId`),
    UNIQUE INDEX `EventoParticipante_eventoId_utilizadorId_key`(`eventoId`, `utilizadorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventoParticipante` ADD CONSTRAINT `EventoParticipante_eventoId_fkey` FOREIGN KEY (`eventoId`) REFERENCES `Evento`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventoParticipante` ADD CONSTRAINT `EventoParticipante_familiaId_fkey` FOREIGN KEY (`familiaId`) REFERENCES `Familia`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventoParticipante` ADD CONSTRAINT `EventoParticipante_utilizadorId_fkey` FOREIGN KEY (`utilizadorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- ==================================================
-- 20250913233906_livro_rework_defaults
-- ==================================================

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


-- ==================================================
-- 20250914001422_add_dias_devolucao_a_livro
-- ==================================================

-- AlterTable
ALTER TABLE `livro` ADD COLUMN `diasDevolucao` INTEGER NULL,
    ALTER COLUMN `updatedAt` DROP DEFAULT;


-- ==================================================
-- 20250915113428_add_requisicao
-- ==================================================

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


-- ==================================================
-- 20250916205129_add_requisicao_endereco_pagamento
-- ==================================================

-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `requisicao` ADD COLUMN `entregaEndereco` VARCHAR(191) NULL,
    ADD COLUMN `pagamentoStatus` ENUM('PENDENTE', 'PAGO', 'FALHOU') NULL,
    ADD COLUMN `pagamentoUltimos4` VARCHAR(191) NULL,
    ADD COLUMN `pagamentoValor` DOUBLE NULL;


-- ==================================================
-- 20251002112843_nova_base
-- ==================================================

-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateTable
CREATE TABLE `ComentarioLivro` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `livroId` INTEGER NOT NULL,
    `familiaId` INTEGER NOT NULL,
    `rating` INTEGER NOT NULL,
    `texto` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ComentarioLivro_livroId_familiaId_idx`(`livroId`, `familiaId`),
    INDEX `ComentarioLivro_familiaId_createdAt_idx`(`familiaId`, `createdAt`),
    INDEX `ComentarioLivro_livroId_createdAt_idx`(`livroId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ComentarioLivro` ADD CONSTRAINT `ComentarioLivro_livroId_fkey` FOREIGN KEY (`livroId`) REFERENCES `Livro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComentarioLivro` ADD CONSTRAINT `ComentarioLivro_familiaId_fkey` FOREIGN KEY (`familiaId`) REFERENCES `Familia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- ==================================================
-- 20251002231952_add_horario_bloqueios
-- ==================================================

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


-- ==================================================
-- 20251002233326_add_horario_bloqueios
-- ==================================================

-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AddForeignKey
ALTER TABLE `ComentarioLivro` ADD CONSTRAINT `ComentarioLivro_livroId_fkey` FOREIGN KEY (`livroId`) REFERENCES `Livro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- ==================================================
-- 20251027230437_consultas_e_atividades_inscricoes_antigo
-- ==================================================

-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;


-- ==================================================
-- 20251029161939_consultas_e_atividades_inscricoes_antigo3fws
-- ==================================================

-- AlterTable
ALTER TABLE `consulta` ADD COLUMN `recusaMotivo` VARCHAR(191) NULL,
    ADD COLUMN `resultadoEnviadoAt` DATETIME(3) NULL,
    ADD COLUMN `resultadoResumo` VARCHAR(191) NULL,
    ADD COLUMN `retornoMotivo` VARCHAR(191) NULL,
    MODIFY `status` ENUM('MARCADA', 'RECUSADA', 'RETORNADA', 'CONCLUIDA', 'CANCELADA') NOT NULL DEFAULT 'MARCADA';

-- AlterTable
ALTER TABLE `eventoparticipante` ADD COLUMN `modo` VARCHAR(191) NOT NULL DEFAULT 'individual',
    ADD COLUMN `qtdAdultos` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `qtdFilhos` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateIndex
CREATE INDEX `Consulta_bibliotecarioId_status_dataHora_idx` ON `Consulta`(`bibliotecarioId`, `status`, `dataHora`);

-- CreateIndex
CREATE INDEX `Consulta_familiaId_status_dataHora_idx` ON `Consulta`(`familiaId`, `status`, `dataHora`);


-- ==================================================
-- 20251030001624_qweasdq
-- ==================================================

-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateTable
CREATE TABLE `Carrinho` (
    `familiaId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`familiaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CarrinhoItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `familiaId` INTEGER NOT NULL,
    `livroId` INTEGER NOT NULL,
    `quantidade` INTEGER NOT NULL DEFAULT 1,
    `precoUnit` DOUBLE NOT NULL DEFAULT 0,
    `tituloSnapshot` VARCHAR(191) NOT NULL,

    INDEX `CarrinhoItem_familiaId_idx`(`familiaId`),
    UNIQUE INDEX `CarrinhoItem_familiaId_livroId_key`(`familiaId`, `livroId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pedido` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `familiaId` INTEGER NOT NULL,
    `total` DOUBLE NOT NULL DEFAULT 0,
    `status` ENUM('PAGAMENTO_PENDENTE', 'PAGO', 'PAGAMENTO_FALHOU', 'APROVADO', 'ENVIADO', 'CONCLUIDO', 'CANCELADO') NOT NULL DEFAULT 'PAGAMENTO_PENDENTE',
    `entregaTipo` ENUM('domicilio', 'biblioteca') NULL,
    `entregaEndereco` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Pedido_familiaId_status_createdAt_idx`(`familiaId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PedidoItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `livroId` INTEGER NOT NULL,
    `titulo` VARCHAR(191) NOT NULL,
    `precoUnit` DOUBLE NOT NULL DEFAULT 0,
    `quantidade` INTEGER NOT NULL DEFAULT 1,

    INDEX `PedidoItem_pedidoId_idx`(`pedidoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pagamento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `metodo` ENUM('CARTAO', 'MPESA', 'DINHEIRO') NOT NULL,
    `referencia` VARCHAR(191) NOT NULL,
    `valor` DOUBLE NOT NULL DEFAULT 0,
    `status` ENUM('PROCESSANDO', 'PAGO', 'FALHOU') NOT NULL DEFAULT 'PROCESSANDO',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Pagamento_pedidoId_status_idx`(`pedidoId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_CarrinhoToCarrinhoItem` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_CarrinhoToCarrinhoItem_AB_unique`(`A`, `B`),
    INDEX `_CarrinhoToCarrinhoItem_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Carrinho` ADD CONSTRAINT `Carrinho_familiaId_fkey` FOREIGN KEY (`familiaId`) REFERENCES `Familia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CarrinhoItem` ADD CONSTRAINT `CarrinhoItem_familiaId_fkey` FOREIGN KEY (`familiaId`) REFERENCES `Familia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CarrinhoItem` ADD CONSTRAINT `CarrinhoItem_livroId_fkey` FOREIGN KEY (`livroId`) REFERENCES `Livro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pedido` ADD CONSTRAINT `Pedido_familiaId_fkey` FOREIGN KEY (`familiaId`) REFERENCES `Familia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PedidoItem` ADD CONSTRAINT `PedidoItem_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `Pedido`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PedidoItem` ADD CONSTRAINT `PedidoItem_livroId_fkey` FOREIGN KEY (`livroId`) REFERENCES `Livro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pagamento` ADD CONSTRAINT `Pagamento_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `Pedido`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_CarrinhoToCarrinhoItem` ADD CONSTRAINT `_CarrinhoToCarrinhoItem_A_fkey` FOREIGN KEY (`A`) REFERENCES `Carrinho`(`familiaId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_CarrinhoToCarrinhoItem` ADD CONSTRAINT `_CarrinhoToCarrinhoItem_B_fkey` FOREIGN KEY (`B`) REFERENCES `CarrinhoItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- ==================================================
-- 20251030012121_carrinho
-- ==================================================

-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `pedidoitem` ADD COLUMN `canceladoEm` DATETIME(3) NULL,
    ADD COLUMN `entregaStatus` ENUM('em_transito', 'entregue', 'cancelado') NOT NULL DEFAULT 'em_transito',
    ADD COLUMN `entregueEm` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `requisicao` ADD COLUMN `dataDevolucaoPrevista` DATETIME(3) NULL,
    ADD COLUMN `devolvidoEm` DATETIME(3) NULL,
    ADD COLUMN `diasDevolucao` INTEGER NULL,
    ADD COLUMN `entregueEm` DATETIME(3) NULL,
    ADD COLUMN `motivoRecusa` VARCHAR(191) NULL,
    MODIFY `status` ENUM('PENDENTE', 'APROVADA', 'NEGADA', 'ENTREGUE', 'DEVOLVIDA') NOT NULL DEFAULT 'PENDENTE';


-- ==================================================
-- 20251031162119_adjelson
-- ==================================================

/*
  Warnings:

  - Added the required column `bibliotecaId` to the `Livro` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `livro` ADD COLUMN `bibliotecaId` INTEGER NOT NULL,
    ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AddForeignKey
ALTER TABLE `Livro` ADD CONSTRAINT `Livro_bibliotecaId_fkey` FOREIGN KEY (`bibliotecaId`) REFERENCES `Biblioteca`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- ==================================================
-- 20251101231535_rdcikyr
-- ==================================================

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


-- ==================================================
-- 20251101234237_requisicao
-- ==================================================

-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `requisicao` ADD COLUMN `despachadoEm` DATETIME(3) NULL,
    MODIFY `status` ENUM('PENDENTE', 'APROVADA', 'SAIU_PARA_ENTREGA', 'ENTREGUE', 'DEVOLVIDA', 'NEGADA') NOT NULL DEFAULT 'PENDENTE';


-- ==================================================
-- 20251102003527_bisti
-- ==================================================

/*
  Warnings:

  - The values [MPESA] on the enum `Pagamento_metodo` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `pagamento` MODIFY `metodo` ENUM('CARTAO', 'BISTP', 'DINHEIRO') NOT NULL;


-- ==================================================
-- 20251102003630_bisti
-- ==================================================

-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;


SET FOREIGN_KEY_CHECKS = 1;
