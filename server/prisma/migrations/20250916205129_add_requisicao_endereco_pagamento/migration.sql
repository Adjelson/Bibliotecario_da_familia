-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `requisicao` ADD COLUMN `entregaEndereco` VARCHAR(191) NULL,
    ADD COLUMN `pagamentoStatus` ENUM('PENDENTE', 'PAGO', 'FALHOU') NULL,
    ADD COLUMN `pagamentoUltimos4` VARCHAR(191) NULL,
    ADD COLUMN `pagamentoValor` DOUBLE NULL;
