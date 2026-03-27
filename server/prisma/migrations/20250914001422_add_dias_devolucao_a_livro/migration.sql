-- AlterTable
ALTER TABLE `livro` ADD COLUMN `diasDevolucao` INTEGER NULL,
    ALTER COLUMN `updatedAt` DROP DEFAULT;
