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
