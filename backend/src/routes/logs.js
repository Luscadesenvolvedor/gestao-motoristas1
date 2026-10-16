// backend/src/routes/logs.js — consulta do registro de auditoria (aba Logs)
const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, exigirAcessoLogs } = require('../middleware/auth');
const router = express.Router();

router.use(autenticar, exigirAcessoLogs);

function montarFiltro(q) {
  const where = {};
  if (q.usuarioId) where.usuarioId = String(q.usuarioId);
  if (q.acao) where.acao = String(q.acao);
  if (q.tabela) where.tabela = String(q.tabela);
  if (q.de || q.ate) {
    where.criadoEm = {};
    // Datas chegam como AAAA-MM-DD no horário de Brasília
    if (q.de) where.criadoEm.gte = new Date(`${q.de}T00:00:00-03:00`);
    if (q.ate) where.criadoEm.lte = new Date(`${q.ate}T23:59:59.999-03:00`);
  }
  const busca = String(q.busca || '').trim();
  if (busca) {
    where.OR = [
      { registroId: { contains: busca, mode: 'insensitive' } },
      { usuario: { nome: { contains: busca, mode: 'insensitive' } } },
      { motorista: { nome: { contains: busca, mode: 'insensitive' } } },
    ];
  }
  return where;
}

// GET /api/logs?usuarioId=&acao=&tabela=&de=&ate=&busca=&pagina=1&porPagina=50
router.get('/', async (req, res) => {
  try {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const porPagina = Math.min(200, Math.max(10, parseInt(req.query.porPagina, 10) || 50));
    const where = montarFiltro(req.query);
    const [total, itens] = await Promise.all([
      prisma.auditoria.count({ where }),
      prisma.auditoria.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: {
          usuario: { select: { id: true, nome: true, email: true } },
          motorista: { select: { id: true, nome: true } },
        },
      }),
    ]);
    res.json({ total, pagina, porPagina, itens });
  } catch (err) {
    console.error('Erro ao listar logs:', err);
    res.status(500).json({ error: 'Erro ao listar logs' });
  }
});

// GET /api/logs/filtros — opções para os selects da tela
router.get('/filtros', async (req, res) => {
  try {
    const [usuarios, acoes, tabelas] = await Promise.all([
      prisma.usuario.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
      prisma.auditoria.findMany({ distinct: ['acao'], select: { acao: true }, orderBy: { acao: 'asc' } }),
      prisma.auditoria.findMany({ distinct: ['tabela'], select: { tabela: true }, orderBy: { tabela: 'asc' } }),
    ]);
    res.json({ usuarios, acoes: acoes.map(a => a.acao), tabelas: tabelas.map(t => t.tabela) });
  } catch (err) {
    console.error('Erro ao carregar filtros de logs:', err);
    res.status(500).json({ error: 'Erro ao carregar filtros' });
  }
});

module.exports = router;
