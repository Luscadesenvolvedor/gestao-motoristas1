const express = require('express');
const prisma   = require('../lib/prisma');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

// GET /api/trr
router.get('/', async (req, res) => {
  try {
    const lista = await prisma.trr.findMany({ orderBy: { uf: 'asc' } });
    res.json(lista);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/trr
router.post('/', async (req, res) => {
  try {
    const { nome, uf, precoDiesel } = req.body;
    if (!nome || !uf) return res.status(400).json({ error: 'nome e uf obrigatórios' });
    const preco = precoDiesel ? parseFloat(String(precoDiesel).replace(',', '.')) : null;
    const trr = await prisma.trr.create({ data: { nome, uf: uf.toUpperCase(), precoDiesel: preco } });
    res.status(201).json(trr);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/trr/:id
router.put('/:id', async (req, res) => {
  try {
    const { nome, uf, precoDiesel } = req.body;
    const preco = precoDiesel != null ? parseFloat(String(precoDiesel).replace(',', '.')) : null;
    const trr = await prisma.trr.update({
      where: { id: req.params.id },
      data: { nome, uf: uf?.toUpperCase(), precoDiesel: preco },
    });
    res.json(trr);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/trr/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.trr.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
