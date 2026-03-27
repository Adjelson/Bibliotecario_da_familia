-- AlterTable
ALTER TABLE `livro` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AddForeignKey
ALTER TABLE `ComentarioLivro` ADD CONSTRAINT `ComentarioLivro_livroId_fkey` FOREIGN KEY (`livroId`) REFERENCES `Livro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
