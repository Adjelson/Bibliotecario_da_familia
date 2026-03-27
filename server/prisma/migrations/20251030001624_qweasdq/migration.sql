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
