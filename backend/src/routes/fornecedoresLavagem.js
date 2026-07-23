const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { autenticar, exigirSetor } = require('../middleware/auth');
const router = express.Router();
const prisma = new PrismaClient();

router.use(autenticar, exigirSetor('abastecimento'));

// GET /api/fornecedores-lavagem
router.get('/', async (req, res) => {
  try {
    const fornecedores = await prisma.fornecedorLavagem.findMany({
      where: { ativo: true },
      include: {
        precos: {
          include: { tipoCaminhao: true },
        },
      },
      orderBy: { razaoSocial: 'asc' },
    });
    res.json(fornecedores);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar fornecedores' });
  }
});

// POST /api/fornecedores-lavagem
router.post('/', async (req, res) => {
  try {
    const { razaoSocial, cnpj, contato, precos } = req.body;
    if (!razaoSocial) return res.status(400).json({ error: 'Razão Social obrigatória' });

    const fornecedor = await prisma.fornecedorLavagem.create({
      data: {
        razaoSocial,
        cnpj: cnpj || null,
        contato: contato || null,
        precos: precos && precos.length > 0 ? {
          create: precos
            .filter(p => p.tipoCaminhaoId && p.valor !== '' && p.valor !== null)
            .map(p => ({ tipoCaminhaoId: p.tipoCaminhaoId, valor: parseFloat(p.valor) })),
        } : undefined,
      },
      include: {
        precos: { include: { tipoCaminhao: true } },
      },
    });
    res.status(201).json(fornecedor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar fornecedor' });
  }
});

// PUT /api/fornecedores-lavagem/:id
router.put('/:id', async (req, res) => {
  try {
    const { razaoSocial, cnpj, contato, precos } = req.body;

    await prisma.fornecedorLavagem.update({
      where: { id: req.params.id },
      data: { razaoSocial, cnpj: cnpj || null, contato: contato || null },
    });

    // Recriar precos: deleta os antigos e insere os novos
    if (precos !== undefined) {
      await prisma.precoLavagem.deleteMany({ where: { fornecedorId: req.params.id } });
      const novosPrecos = (precos || [])
        .filter(p => p.tipoCaminhaoId && p.valor !== '' && p.valor !== null);
      if (novosPrecos.length > 0) {
        await prisma.precoLavagem.createMany({
          data: novosPrecos.map(p => ({
            fornecedorId: req.params.id,
            tipoCaminhaoId: p.tipoCaminhaoId,
            valor: parseFloat(p.valor),
          })),
        });
      }
    }

    const fornecedor = await prisma.fornecedorLavagem.findUnique({
      where: { id: req.params.id },
      include: { precos: { include: { tipoCaminhao: true } } },
    });
    res.json(fornecedor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar fornecedor' });
  }
});

// DELETE /api/fornecedores-lavagem/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.fornecedorLavagem.update({
      where: { id: req.params.id },
      data: { ativo: false },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover fornecedor' });
  }
});

module.exports = router;
