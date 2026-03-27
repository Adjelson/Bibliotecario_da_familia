// prisma/seed.ts
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Biblioteca default
  const bib = await prisma.biblioteca.upsert({
    where: { nome: 'Biblioteca Nacional' },
    update: {},
    create: { nome: 'Biblioteca Nacional', local: 'Centro' },
  });

  // Admin
  const adminHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@bibliotecario.st' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@bibliotecario.st',
      passwordHash: adminHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  // Bibliotecário
  const bibHash = await bcrypt.hash('bib123456', 10);
  await prisma.user.upsert({
    where: { email: 'bib@bibliotecario.st' },
    update: {},
    create: {
      name: 'Bibliotecário Padrão',
      email: 'bib@bibliotecario.st',
      passwordHash: bibHash,
      role: Role.BIBLIOTECARIO,
      isActive: true,
      bibliotecaId: bib.id,
    },
  });

  // Pai + Família com 1 filho
  const paiHash = await bcrypt.hash('adjels0nnit9', 10);
  const pai = await prisma.user.upsert({
    where: { email: 'edmar@gmail.com' },
    update: {},
    create: {
      name: 'Responsável da Família',
      email: 'edmar@gmail.com',
      passwordHash: paiHash,
      role: Role.PAI,
      isActive: true,
    },
    include: { familia: true },
  });

  // Cria família se não existir (1:1)
  if (!pai.familia) {
    await prisma.familia.create({
      data: {
        userId: pai.id,
        telefone: '+2399000000',
        morada: 'Rua Principal, 123',
        interesses: ['Contos', 'Natureza'],
        filhos: {
          create: [
            { nome: 'João', idade: 6, genero: 'M', perfilLeitor: 'iniciante' },
          ],
        },
      },
    });
  }

  // Livros base

}

main()
  .then(async () => {
    console.log('Seed concluído ✅');
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Erro no seed ❌', e);
    await prisma.$disconnect();
    process.exit(1);
  });
