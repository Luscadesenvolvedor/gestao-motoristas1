const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middleware/auth');
const crypto = require('crypto');
const router = express.Router();

router.use(autenticar, autorizar('levantamentos', 'leitura'));

// GET /api/levantamentos-folgas/importacoes
router.get('/importacoes', async (req, res) => {
  try {
    const lista = await prisma.$queryRaw`
      SELECT
        i.id,
        i."nomeArquivo",
        i."criadoEm",
        COUNT(r.id)::int AS "totalRegistros",
        COALESCE(SUM(r.valor), 0)::float AS "totalValor"
      FROM "importacoes_levt_folgas" i
      LEFT JOIN "levt_folgas" r ON r."importacaoId" = i.id
      GROUP BY i.id, i."nomeArquivo", i."criadoEm"
      ORDER BY i."criadoEm" DESC
    `;
    res.json(lista);
  } catch (err) {
    console.error('GET /importacoes folgas erro:', err);
    res.status(500).json({ error: 'Erro ao buscar importações', detail: err.message });
  }
});

// GET /api/levantamentos-folgas?mes=YYYY-MM&motorista=X
router.get('/', async (req, res) => {
  try {
    const { importacaoId, mes, motorista } = req.query;

    let sql = `
      SELECT id, "importacaoId", motorista, veiculo, valor::float, mes, "criadoEm"
      FROM "levt_folgas"
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (importacaoId) { sql += ` AND "importacaoId" = $${idx++}`; params.push(importacaoId); }
    if (mes)          { sql += ` AND mes = $${idx++}`;             params.push(mes); }
    if (motorista)    { sql += ` AND LOWER(motorista) LIKE $${idx++}`; params.push(`%${motorista.toLowerCase()}%`); }

    sql += ` ORDER BY mes ASC, motorista ASC`;

    const registros = await prisma.$queryRawUnsafe(sql, ...params);
    res.json(registros);
  } catch (err) {
    console.error('GET / folgas erro:', err);
    res.status(500).json({ error: 'Erro ao buscar registros', detail: err.message });
  }
});

// POST /api/levantamentos-folgas/importar
router.post('/importar', autorizar('levantamentos', 'escrita'), async (req, res) => {
  try {
    const { nomeArquivo, registros } = req.body;
    if (!nomeArquivo || !Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ error: 'nomeArquivo e registros são obrigatórios' });
    }

    const validos = registros.filter(r => r.motorista && r.valor != null);
    if (!validos.length) return res.status(400).json({ error: 'Nenhum registro válido encontrado' });

    const importId = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "importacoes_levt_folgas" (id, "nomeArquivo", "criadoEm") VALUES ($1, $2, NOW())`,
      importId, nomeArquivo
    );

    for (const r of validos) {
      const regId = crypto.randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "levt_folgas" (id, "importacaoId", motorista, veiculo, valor, mes, "criadoEm")
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        regId,
        importId,
        String(r.motorista).trim(),
        r.veiculo ? String(r.veiculo).trim() : null,
        parseFloat(r.valor),
        r.mes ? String(r.mes).trim() : ''
      );
    }

    res.status(201).json({ importacaoId: importId, total: validos.length });
  } catch (err) {
    console.error('POST /importar folgas erro:', err);
    res.status(500).json({ error: 'Erro ao importar', detail: err.message });
  }
});

// DELETE /api/levantamentos-folgas/importacoes/:id
router.delete('/importacoes/:id', autorizar('levantamentos', 'escrita'), async (req, res) => {
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "importacoes_levt_folgas" WHERE id = $1`,
      req.params.id
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /importacoes folgas erro:', err);
    res.status(500).json({ error: 'Erro ao excluir importação', detail: err.message });
  }
});

module.exports = router;
