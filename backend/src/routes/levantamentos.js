// backend/src/routes/levantamentos.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { autenticar, autorizar } = require('../middleware/auth');
const router = express.Router();
const prisma = new PrismaClient();
router.use(autenticar, autorizar('levantamentos', 'leitura'));

router.get('/', async (req, res) => {
  try {
    const levantamentos = await prisma.levantamento.findMany({
      include: { usuario: { select: { id: true, nome: true } } },
      orderBy: { mes: 'desc' },
    });
    res.json(levantamentos);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao buscar levantamentos' }); }
});

router.post('/', autorizar('levantamentos', 'escrita'), async (req, res) => {
  try {
    const { mes, motoristasFechados, previa, saldo, salario, quinzena, inssIrpf, observacao } = req.body;
    if (!mes) return res.status(400).json({ error: 'Mês é obrigatório' });
    const existente = await prisma.levantamento.findUnique({ where: { mes } });
    const n = v => parseFloat(v) || 0;
    const i = v => parseInt(v) || 0;
    if (existente) {
      const levantamento = await prisma.levantamento.update({
        where: { mes },
        data: {
          motoristasFechados: existente.motoristasFechados + i(motoristasFechados),
          previa:   { increment: n(previa) },
          saldo:    { increment: n(saldo) },
          salario:  { increment: n(salario) },
          quinzena: { increment: n(quinzena) },
          inssIrpf: { increment: n(inssIrpf) },
          observacao: observacao || existente.observacao,
        },
        include: { usuario: { select: { id: true, nome: true } } },
      });
      return res.json(levantamento);
    }
    const levantamento = await prisma.levantamento.create({
      data: {
        mes,
        motoristasFechados: i(motoristasFechados),
        previa:   n(previa),
        saldo:    n(saldo),
        salario:  n(salario),
        quinzena: n(quinzena),
        inssIrpf: n(inssIrpf),
        observacao: observacao || null,
        usuarioId: req.usuario.id,
      },
      include: { usuario: { select: { id: true, nome: true } } },
    });
    res.status(201).json(levantamento);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao criar levantamento' }); }
});

router.put('/:id', autorizar('levantamentos', 'escrita'), async (req, res) => {
  try {
    const { mes, motoristasFechados, previa, saldo, salario, quinzena, inssIrpf, observacao } = req.body;
    const levantamento = await prisma.levantamento.update({
      where: { id: req.params.id },
      data: {
        mes,
        motoristasFechados: parseInt(motoristasFechados),
        previa: parseFloat(previa),
        saldo: parseFloat(saldo),
        salario: parseFloat(salario),
        quinzena: parseFloat(quinzena),
        inssIrpf: parseFloat(inssIrpf),
        observacao: observacao || null,
      },
      include: { usuario: { select: { id: true, nome: true } } },
    });
    res.json(levantamento);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao atualizar levantamento' }); }
});

router.delete('/:id', autorizar('levantamentos', 'escrita'), async (req, res) => {
  try {
    await prisma.levantamento.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao excluir levantamento' }); }
});

module.exports = router;
