// Instância única de PrismaClient compartilhada por toda a aplicação.
// Criar múltiplas instâncias esgota o pool de conexões do banco de dados.
const { PrismaClient } = require('@prisma/client');

const prisma = global._prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') global._prisma = prisma;

module.exports = prisma;
