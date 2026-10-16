// backend/src/routes/logs.js — consulta do registro de auditoria (aba Logs)
const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, exigirAcessoLogs } = require('../middleware/auth');
const router = express.Router();

// POST /api/logs/acesso — chamado pelo frontend a cada troca de tela e no "Sair".
// Aberto a todo usuário logado (é o que alimenta o log). Nunca retorna erro para não incomodar a tela.
router.post('/acesso', autenticar, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    if (req.body && req.body.evento === 'logout') {
      await prisma.auditoria.create({ data: { usuarioId, acao: 'logout', tabela: 'usuarios', registroId: usuarioId } });
      return res.status(204).end();
    }
    const rota = String((req.body && req.body.rota) || '').split('?')[0].slice(0, 120);
    if (!rota.startsWith('/')) return res.status(204).end();
    const tela = rota.split('/').filter(Boolean)[0] || 'inicio';
    // Evita repetir o mesmo acesso: ignora se a mesma tela foi registrada há menos de 10 min
    const recente = await prisma.auditoria.findFirst({
      where: { usuarioId, acao: 'acessou', tabela: tela, criadoEm: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
      select: { id: true },
    });
    if (!recente) {
      await prisma.auditoria.create({ data: { usuarioId, acao: 'acessou', tabela: tela, registroId: usuarioId, dadosNovos: { rota } } });
    }
    res.status(204).end();
  } catch (err) {
    console.error('Erro ao registrar acesso:', err.message);
    res.status(204).end();
  }
});

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
