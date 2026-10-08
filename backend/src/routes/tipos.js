// backend/src/routes/tipos.js — cadastros de tipos (solicitação, desconto, vale, ref)
const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middleware/auth');
const router = express.Router();

router.use(autenticar);

// Cria um tipo; se já existir inativo (excluído), reativa em vez de dar erro
async function criarOuReativar(model, nomeBruto, res) {
  const nome = String(nomeBruto || '').trim();
  if (!nome) return res.status(400).json({ error: 'Informe o nome' });
  try {
    const existente = await model.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' } } });
    if (existente) {
      if (existente.ativo) return res.status(400).json({ error: 'Já existe com esse nome' });
      const reativado = await model.update({ where: { id: existente.id }, data: { ativo: true } });
      return res.status(201).json(reativado);
    }
    const tipo = await model.create({ data: { nome } });
    res.status(201).json(tipo);
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Já existe com esse nome' });
    res.status(500).json({ error: 'Erro ao criar' });
  }
}

// Tipos de solicitação
router.get('/solicitacao', async (req, res) => {
  const tipos = await prisma.tipoSolicitacao.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } });
  res.json(tipos);
});
router.post('/solicitacao', autorizar('tipos', 'escrita'), (req, res) => criarOuReativar(prisma.tipoSolicitacao, req.body.nome, res));
router.delete('/solicitacao/:id', autorizar('tipos', 'escrita'), async (req, res) => {
  try {
    await prisma.tipoSolicitacao.update({ where: { id: req.params.id }, data: { ativo: false } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao excluir tipo' });
  }
});

// Tipos de desconto
router.get('/desconto', async (req, res) => {
  const tipos = await prisma.tipoDesconto.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } });
  res.json(tipos);
});
router.post('/desconto', autorizar('tipos', 'escrita'), (req, res) => criarOuReativar(prisma.tipoDesconto, req.body.nome, res));
router.delete('/desconto/:id', autorizar('tipos', 'escrita'), async (req, res) => {
  try {
    await prisma.tipoDesconto.update({ where: { id: req.params.id }, data: { ativo: false } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao excluir tipo' });
  }
});

// Tipos de vale
router.get('/vale', async (req, res) => {
  const tipos = await prisma.tipoVale.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } });
  res.json(tipos);
});
router.post('/vale', autorizar('tipos', 'escrita'), (req, res) => criarOuReativar(prisma.tipoVale, req.body.nome, res));
router.delete('/vale/:id', autorizar('tipos', 'escrita'), async (req, res) => {
  try {
    await prisma.tipoVale.update({ where: { id: req.params.id }, data: { ativo: false } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao excluir tipo' });
  }
});

// Tipos de ref
router.get('/ref', async (req, res) => {
  const tipos = await prisma.tipoRef.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } });
  res.json(tipos);
});
// Criar REF: liberado para qualquer usuário logado
router.post('/ref', (req, res) => criarOuReativar(prisma.tipoRef, req.body.nome, res));
router.delete('/ref/:id', autorizar('tipos', 'escrita'), async (req, res) => {
  try {
    await prisma.tipoRef.update({ where: { id: req.params.id }, data: { ativo: false } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao excluir tipo' });
  }
});

module.exports = router;