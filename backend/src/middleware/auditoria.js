// backend/src/middleware/auditoria.js
const prisma = require('../lib/prisma');
const { marcarRegistrado } = require('./registroAutomatico');

async function registrarAuditoria({ usuarioId, acao, tabela, registroId, dadosAntigos, dadosNovos, extra = {} }) {
  marcarRegistrado(); // evita registro automático duplicado desta mesma requisição
  try {
    await prisma.auditoria.create({
      data: {
        usuarioId,
        acao,
        tabela,
        registroId,
        dadosAntigos: dadosAntigos || undefined,
        dadosNovos: dadosNovos || undefined,
        ...extra,
        criadoEm: new Date()
      }
    });
  } catch (err) {
    console.error('Erro ao registrar auditoria:', err);
  }
}

module.exports = { registrarAuditoria };
