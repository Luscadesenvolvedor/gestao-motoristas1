const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');
const { autenticar } = require('../middleware/auth');
const https = require('https');
const http  = require('http');

const router = Router();
const prisma = new PrismaClient();

// Extrai lat/lng de uma URL do Google Maps (inclusive short URLs via redirect)
function parseCoordsFromUrl(url) {
  if (!url) return null;
  let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = url.match(/[?&](?:q|ll)=(-?\d+\.\d+)[,%2C]+(-?\d+\.\d+)/i);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

function resolveRedirect(url, maxHops = 5) {
  return new Promise((resolve) => {
    if (maxHops === 0) return resolve(url);
    const lib = url.startsWith('https') ? https : http;
    try {
      const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          resolve(resolveRedirect(next, maxHops - 1));
        } else {
          resolve(url);
        }
        res.resume();
      });
      req.setTimeout(5000, () => { req.destroy(); resolve(url); });
      req.on('error', () => resolve(url));
    } catch { resolve(url); }
  });
}

// POST /api/postos-bid/parse-coords — resolve URL curta e retorna lat/lng
router.post('/parse-coords', autenticar, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url obrigatória' });
  try {
    // tenta parsear direto primeiro
    let coords = parseCoordsFromUrl(url);
    if (!coords) {
      // resolve redirect (URL curta)
      const finalUrl = await resolveRedirect(url);
      coords = parseCoordsFromUrl(finalUrl);
    }
    if (!coords) return res.status(422).json({ error: 'Não foi possível extrair coordenadas' });
    res.json(coords);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    if (!nome) {
      return res.status(400).json({ error: 'nome é obrigatório' });
    }
    const posto = await prisma.postoBid.create({
      data: {
        nome,
        rede: rede || null,
        cidade: cidade || null,
        uf: uf ? uf.toUpperCase() : null,
        latitude: latitude != null ? parseFloat(latitude) : null,
        longitude: longitude != null ? parseFloat(longitude) : null,
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
        uf: uf ? uf.toUpperCase() : null,
        latitude: latitude != null ? parseFloat(latitude) : null,
        longitude: longitude != null ? parseFloat(longitude) : null,
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
