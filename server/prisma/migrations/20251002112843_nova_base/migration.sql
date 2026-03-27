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
