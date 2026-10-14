// Instância única de PrismaClient compartilhada por toda a aplicação.
// Criar múltiplas instâncias esgota o pool de conexões do banco de dados.
const { PrismaClient } = require('@prisma/client');

// Limita o pool de conexões (padrão do Prisma = nº de CPUs * 2 + 1, que no Railway vira ~17)
function urlComLimite(url) {
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  const limite = process.env.DB_CONNECTION_LIMIT || '5';
  return url + (url.includes('?') ? '&' : '?') + 'connection_limit=' + limite;
}

const prisma = global._prisma ?? new PrismaClient({
  datasources: { db: { url: urlComLimite(process.env.DATABASE_URL) } },
});
global._prisma = prisma;

module.exports = prisma;
