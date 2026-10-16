// backend/src/routes/logs.js — consulta do registro de auditoria (aba Logs)
const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, exigirAcessoLogs } = require('../middleware/auth');
const router = express.Router();

// Usuários online: guardado só em memória (uma entrada por usuário, sem gravar no banco).
// O frontend manda um sinal a cada minuto; some da lista após 2 min sem sinal ou ao sair.
const online = new Map();
const ONLINE_MS = 2 * 60 * 1000;
function marcarOnline(usuario, dados = {}) {
  const anterior = online.get(usuario.id) || {};
  online.set(usuario.id, {
    id: usuario.id, nome: usuario.nome, email: usuario.email,
    rota: dados.rota || anterior.rota || '/',
    visivel: dados.visivel !== undefined ? !!dados.visivel : (anterior.visivel ?? true),
    desde: anterior.desde && Date.now() - anterior.ultimoSinal < ONLINE_MS ? anterior.desde : Date.now(),
    ultimoSinal: Date.now(),
  });
}
function rotaValida(r) {
  const rota = String(r || '').split('?')[0].slice(0, 120);
  return rota.startsWith('/') ? rota : null;
}

// POST /api/logs/presenca — sinal periódico do sistema aberto (qualquer usuário logado)
router.post('/presenca', autenticar, (req, res) => {
  marcarOnline(req.usuario, { rota: rotaValida(req.body && req.body.rota), visivel: req.body && req.body.visivel });
  res.status(204).end();
});

// POST /api/logs/acesso — chamado pelo frontend a cada troca de tela e no "Sair".
// Aberto a todo usuário logado (é o que alimenta o log). Nunca retorna erro para não incomodar a tela.
router.post('/acesso', autenticar, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    if (req.body && req.body.evento === 'logout') {
      online.delete(usuarioId);
      await prisma.auditoria.create({ data: { usuarioId, acao: 'logout', tabela: 'usuarios', registroId: usuarioId } });
      return res.status(204).end();
    }
    const rota = rotaValida(req.body && req.body.rota);
    if (!rota) return res.status(204).end();
    marcarOnline(req.usuario, { rota, visivel: true });
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

// GET /api/logs/online — quem está com o sistema aberto agora
router.get('/online', (req, res) => {
  const agora = Date.now();
  const lista = [];
  for (const [id, u] of online) {
    if (agora - u.ultimoSinal > ONLINE_MS) { online.delete(id); continue; }
    lista.push(u);
  }
  lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  res.json(lista);
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
