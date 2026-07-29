const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { autenticar, exigirSetor } = require('../middleware/auth');
const { randomUUID } = require('crypto');
const router = express.Router();
const prisma = new PrismaClient();

router.use(autenticar, exigirSetor('abastecimento'));

// GET /api/medias-consumo/importacoes
router.get('/importacoes', async (req, res) => {
  try {
    const lista = await prisma.$queryRawUnsafe(`
      SELECT id, "nomeArquivo", "totalRegistros", "periodoInicio", "periodoFim", "criadoEm", "frota"
      FROM "importacoes_consumo"
      ORDER BY "criadoEm" DESC
    `);
    res.json(lista);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar importações' });
  }
});

// GET /api/medias-consumo?motorista=X&mes=7&ano=2026
router.get('/', async (req, res) => {
  try {
    const { motorista, mes, ano, importacaoId } = req.query;

    let where = `WHERE 1=1`;
    const params = [];
    let i = 1;

    if (importacaoId) {
      where += ` AND r."importacaoId" = $${i++}`;
      params.push(importacaoId);
    }
    if (motorista) {
      where += ` AND r."motorista" ILIKE $${i++}`;
      params.push(motorista);
    }
    if (mes && ano) {
      where += ` AND EXTRACT(MONTH FROM r."data") = $${i++} AND EXTRACT(YEAR FROM r."data") = $${i++}`;
      params.push(parseInt(mes), parseInt(ano));
    } else if (ano) {
      where += ` AND EXTRACT(YEAR FROM r."data") = $${i++}`;
      params.push(parseInt(ano));
    }

    const registros = await prisma.$queryRawUnsafe(`
      SELECT r.*
      FROM "registros_consumo" r
      ${where}
      ORDER BY r."data" ASC, r."motorista" ASC
    `, ...params);

    res.json(registros);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar registros' });
  }
});

// GET /api/medias-consumo/resumo-mensal?importacaoId=X&motorista=Y(opcional)
router.get('/resumo-mensal', async (req, res) => {
  try {
    const { importacaoId, motorista } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    let i = 1;
    if (importacaoId) { where += ` AND "importacaoId" = $${i++}`; params.push(importacaoId); }
    if (motorista)    { where += ` AND "motorista" ILIKE $${i++}`; params.push(motorista); }

    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        TO_CHAR("data", 'YYYY-MM') AS mes,
        SUM("vlrTotal")           AS "totalGasto",
        SUM(CASE WHEN LOWER("produto") LIKE '%diesel%' THEN "distancia" ELSE 0 END) AS "totalKm",
        SUM(CASE WHEN LOWER("produto") LIKE '%diesel%' THEN "litros"    ELSE 0 END) AS "totalLitros"
      FROM "registros_consumo"
      ${where}
      GROUP BY mes
      ORDER BY mes ASC
    `, ...params);

    const result = rows.map(r => ({
      mes:        r.mes,
      totalGasto: Number(r.totalGasto  || 0),
      totalKm:    Number(r.totalKm     || 0),
      totalLitros:Number(r.totalLitros || 0),
      mediaReal:  Number(r.totalLitros) > 0 ? Number(r.totalKm) / Number(r.totalLitros) : 0,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar resumo mensal' });
  }
});

// GET /api/medias-consumo/meses?importacaoId=X
router.get('/meses', async (req, res) => {
  try {
    const { importacaoId } = req.query;
    let where = importacaoId ? `WHERE "importacaoId" = $1` : '';
    const params = importacaoId ? [importacaoId] : [];

    const lista = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT TO_CHAR("data", 'YYYY-MM') AS mes
      FROM "registros_consumo"
      ${where}
      ORDER BY mes ASC
    `, ...params);

    res.json(lista.map(r => r.mes));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar meses' });
  }
});

// GET /api/medias-consumo/motoristas?importacaoId=X
router.get('/motoristas', async (req, res) => {
  try {
    const { importacaoId } = req.query;
    let where = importacaoId ? `WHERE "importacaoId" = $1` : '';
    const params = importacaoId ? [importacaoId] : [];

    const lista = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT "motorista"
      FROM "registros_consumo"
      ${where}
      ORDER BY "motorista" ASC
    `, ...params);

    res.json(lista.map(r => r.motorista));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar motoristas' });
  }
});

// POST /api/medias-consumo/importar
router.post('/importar', async (req, res) => {
  try {
    const { nomeArquivo, registros, frota } = req.body;
    if (!nomeArquivo || !Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ error: 'nomeArquivo e registros são obrigatórios' });
    }

    // Filtrar apenas registros com data e motorista válidos
    const validos = registros.filter(r => r.data && r.motorista);

    const importacaoId = randomUUID();
    const datas = validos.map(r => r.data).sort();
    const periodoInicio = datas[0] || null;
    const periodoFim = datas[datas.length - 1] || null;

    // Inserir cabeçalho da importação
    await prisma.$executeRawUnsafe(`
      INSERT INTO "importacoes_consumo" ("id","nomeArquivo","totalRegistros","periodoInicio","periodoFim","usuarioId","criadoEm","frota")
      VALUES ($1,$2,$3,$4::date,$5::date,$6,NOW(),$7)
    `, importacaoId, nomeArquivo, validos.length, periodoInicio, periodoFim, req.usuario.id, frota || 'BAÚ');

    // Inserir registros em lotes de 100 com multi-row INSERT (muito mais rápido)
    const LOTE = 100;
    for (let i = 0; i < validos.length; i += LOTE) {
      const lote = validos.slice(i, i + LOTE);
      const params = [];
      const placeholders = lote.map((r, idx) => {
        const base = idx * 21;
        params.push(
          randomUUID(), importacaoId, r.data, r.motorista,
          r.placa || null, r.modelo || null, r.conjunto || null,
          r.kmInicial || null, r.kmFinal || null, r.distancia || null,
          r.posto || null, r.cidade || null, r.uf || null,
          r.precoLitro || null, r.litros || null, r.produto || null, r.vlrTotal || null,
          r.mediaRealizada || null, r.mediaSugerida || null, r.percAtingido || null, r.gap || null
        );
        const n = (k) => `$${base + k}`;
        return `(${n(1)},${n(2)},${n(3)}::date,${n(4)},${n(5)},${n(6)},${n(7)},${n(8)},${n(9)},${n(10)},${n(11)},${n(12)},${n(13)},${n(14)},${n(15)},${n(16)},${n(17)},${n(18)},${n(19)},${n(20)},${n(21)})`;
      }).join(',');

      await prisma.$executeRawUnsafe(`
        INSERT INTO "registros_consumo" (
          "id","importacaoId","data","motorista","placa","modelo","conjunto",
          "kmInicial","kmFinal","distancia","posto","cidade","uf",
          "precoLitro","litros","produto","vlrTotal",
          "mediaRealizada","mediaSugerida","percAtingido","gap"
        ) VALUES ${placeholders}
      `, ...params);
    }

    res.status(201).json({ ok: true, importacaoId, total: validos.length });
  } catch (err) {
    console.error('Erro ao importar:', err);
    res.status(500).json({ error: 'Erro ao importar registros: ' + err.message });
  }
});

// DELETE /api/medias-consumo/importacoes/:id
router.delete('/importacoes/:id', async (req, res) => {
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "importacoes_consumo" WHERE "id" = $1`, req.params.id
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir importação' });
  }
});

module.exports = router;
