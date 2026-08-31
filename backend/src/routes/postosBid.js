const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');
const { autenticar } = require('../middleware/auth');

const router = Router();
const prisma = new PrismaClient();

// GET /api/postos-bid — lista todos
router.get('/', autenticar, async (req, res) => {
  try {
    const postos = await prisma.postoBid.findMany({
      orderBy: { criadoEm: 'desc' },
    });
    res.json(postos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar postos' });
  }
});

// POST /api/postos-bid — cadastrar
router.post('/', autenticar, async (req, res) => {
  try {
    const { nome, rede, cidade, uf, latitude, longitude, precoDiesel, linkMaps } = req.body;
    if (!nome || !uf || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'nome, uf, latitude e longitude são obrigatórios' });
    }
    const posto = await prisma.postoBid.create({
      data: {
        nome,
        rede: rede || null,
        cidade: cidade || null,
        uf: uf.toUpperCase(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        precoDiesel: precoDiesel ? parseFloat(String(precoDiesel).replace(',', '.')) : null,
        linkMaps: linkMaps || null,
      },
    });
    res.status(201).json(posto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar posto' });
  }
});

// PUT /api/postos-bid/:id — editar
router.put('/:id', autenticar, async (req, res) => {
  try {
    const { nome, rede, cidade, uf, latitude, longitude, precoDiesel, linkMaps } = req.body;

    // busca valor anterior para comparar
    const anterior = await prisma.postoBid.findUnique({ where: { id: req.params.id } });

    const novoPreco = precoDiesel ? parseFloat(String(precoDiesel).replace(',', '.')) : null;

    const posto = await prisma.postoBid.update({
      where: { id: req.params.id },
      data: {
        nome,
        rede: rede || null,
        cidade: cidade || null,
        uf: uf.toUpperCase(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        precoDiesel: novoPreco,
        linkMaps: linkMaps || null,
      },
    });

    // gera notificação global se preço mudou
    if (anterior && novoPreco != null && Math.abs((anterior.precoDiesel || 0) - novoPreco) > 0.001) {
      const fmt = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const precoAnteriorStr = anterior.precoDiesel ? `R$ ${fmt(anterior.precoDiesel)} → ` : '';
      await prisma.notificacao.create({
        data: {
          titulo: '⛽ Atualização de Preço — BID Postos',
          mensagem: `${nome} (${(uf || '').toUpperCase()}): ${precoAnteriorStr}R$ ${fmt(novoPreco)}/L`,
          tipo: 'preco_diesel',
          usuarioId: null, // null = visível para todos
        },
      });
    }

    res.json(posto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao editar posto' });
  }
});

// DELETE /api/postos-bid/:id
router.delete('/:id', autenticar, async (req, res) => {
  try {
    await prisma.postoBid.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar posto' });
  }
});

module.exports = router;
