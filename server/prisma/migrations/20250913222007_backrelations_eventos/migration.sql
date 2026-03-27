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
