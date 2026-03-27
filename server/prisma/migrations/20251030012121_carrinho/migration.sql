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
