const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { autenticar, autorizar } = require('../middleware/auth');
const router = express.Router();
const prisma = new PrismaClient();

router.use(autenticar, autorizar('levantamentos', 'leitura'));

// GET /api/levantamentos-motoristas/importacoes
router.get('/importacoes', async (req, res) => {
  try {
    const lista = await prisma.importacaoLevtMotorista.findMany({
      orderBy: { criadoEm: 'desc' },
      select: { id: true, nomeArquivo: true, criadoEm: true, _count: { select: { registros: true } } },
    });
    res.json(lista);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar importações' });
  }
});

// GET /api/levantamentos-motoristas?importacaoId=X&mes=YYYY-MM&motorista=X
router.get('/', async (req, res) => {
  try {
    const { importacaoId, mes, motorista } = req.query;
    const where = {};
    if (importacaoId) where.importacaoId = importacaoId;
    if (mes)         where.mes = mes;
    if (motorista)   where.motorista = { contains: motorista, mode: 'insensitive' };

    const registros = await prisma.levtMotorista.findMany({
      where,
      orderBy: [{ mes: 'asc' }, { motorista: 'asc' }],
    });
    res.json(registros);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar registros' });
  }
});

// POST /api/levantamentos-motoristas/importar
router.post('/importar', async (req, res) => {
  try {
    const { nomeArquivo, registros } = req.body;
    if (!nomeArquivo || !Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ error: 'nomeArquivo e registros são obrigatórios' });
    }

    const validos = registros.filter(r => r.motorista && r.mes && r.valor != null);
    if (!validos.length) return res.status(400).json({ error: 'Nenhum registro válido encontrado' });

    const importacao = await prisma.importacaoLevtMotorista.create({
      data: {
        nomeArquivo,
        registros: {
          create: validos.map(r => ({
            motorista: String(r.motorista).trim(),
            veiculo:   r.veiculo ? String(r.veiculo).trim() : null,
            valor:     parseFloat(r.valor),
            mes:       String(r.mes).trim(),
          })),
        },
      },
      include: { _count: { select: { registros: true } } },
    });

    res.status(201).json({ importacaoId: importacao.id, total: importacao._count.registros });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao importar' });
  }
});

// DELETE /api/levantamentos-motoristas/importacoes/:id
router.delete('/importacoes/:id', async (req, res) => {
  try {
    await prisma.importacaoLevtMotorista.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir importação' });
  }
});

module.exports = router;
