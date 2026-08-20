const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middleware/auth');
const crypto = require('crypto');
const router = express.Router();

router.use(autenticar, autorizar('levantamentos', 'leitura'));

// GET /api/levantamentos-motoristas/importacoes
router.get('/importacoes', async (req, res) => {
  try {
    let lista;
    try {
      lista = await prisma.$queryRaw`
        SELECT
          i.id,
          i."nomeArquivo",
          i."titulo",
          i."tipoPagamento",
          i."frota",
          i."mesReferencia",
          i."criadoEm",
          COUNT(r.id)::int AS "totalRegistros",
          COALESCE(SUM(r.valor), 0)::float AS "totalValor"
        FROM "importacoes_levt_motoristas" i
        LEFT JOIN "levt_motoristas" r ON r."importacaoId" = i.id
        GROUP BY i.id, i."nomeArquivo", i."titulo", i."tipoPagamento", i."frota", i."mesReferencia", i."criadoEm"
        ORDER BY i."criadoEm" DESC
      `;
    } catch {
      lista = await prisma.$queryRaw`
        SELECT
          i.id,
          i."nomeArquivo",
          NULL::text AS "titulo",
          NULL::text AS "tipoPagamento",
          NULL::text AS "frota",
          i."criadoEm",
          COUNT(r.id)::int AS "totalRegistros",
          COALESCE(SUM(r.valor), 0)::float AS "totalValor"
        FROM "importacoes_levt_motoristas" i
        LEFT JOIN "levt_motoristas" r ON r."importacaoId" = i.id
        GROUP BY i.id, i."nomeArquivo", i."criadoEm"
        ORDER BY i."criadoEm" DESC
      `;
    }
    res.json(lista);
  } catch (err) {
    console.error('GET /importacoes erro:', err);
    res.status(500).json({ error: 'Erro ao buscar importações', detail: err.message });
  }
});

// GET /api/levantamentos-motoristas/verificar-titulo?titulo=X
router.get('/verificar-titulo', async (req, res) => {
  try {
    const { titulo } = req.query;
    if (!titulo || !titulo.trim()) return res.json({ existe: false });
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, "nomeArquivo", "criadoEm" FROM "importacoes_levt_motoristas" WHERE LOWER(TRIM("titulo")) = LOWER(TRIM($1)) LIMIT 1`,
      titulo.trim()
    );
    if (rows.length > 0) {
      const dt = new Date(rows[0].criadoEm).toLocaleDateString('pt-BR');
      res.json({ existe: true, nomeArquivo: rows[0].nomeArquivo, criadoEm: dt });
    } else {
      res.json({ existe: false });
    }
  } catch (err) {
    console.error('GET /verificar-titulo erro:', err);
    res.status(500).json({ error: 'Erro ao verificar título', detail: err.message });
  }
});

// GET /api/levantamentos-motoristas?importacaoId=X&mes=YYYY-MM&motorista=X
router.get('/', async (req, res) => {
  try {
    const { importacaoId, mes, motorista } = req.query;

    let sql = `
      SELECT id, "importacaoId", motorista, veiculo, valor::float, mes, "criadoEm"
      FROM "levt_motoristas"
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
    console.error('GET / erro:', err);
    res.status(500).json({ error: 'Erro ao buscar registros', detail: err.message });
  }
});

// POST /api/levantamentos-motoristas/importar
router.post('/importar', async (req, res) => {
  try {
    const { nomeArquivo, registros, tipoPagamento, frota, titulo, mesReferencia } = req.body;
    if (!nomeArquivo || !Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ error: 'nomeArquivo e registros são obrigatórios' });
    }

    // mes é opcional (ex: Custo Folha não tem coluna de mês)
    const validos = registros.filter(r => r.motorista && r.valor != null);
    if (!validos.length) return res.status(400).json({ error: 'Nenhum registro válido encontrado' });

    // Cria a importação
    const importId = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "importacoes_levt_motoristas" (id, "nomeArquivo", "titulo", "tipoPagamento", "frota", "mesReferencia", "criadoEm") VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      importId, nomeArquivo, titulo?.trim() || null, tipoPagamento || null, frota || null, mesReferencia || null
    );

    // Insere cada registro
    for (const r of validos) {
      const regId = crypto.randomUUID();
      const motoristaNome = String(r.motorista).trim();
      const veiculo = r.veiculo ? String(r.veiculo).trim() : null;
      const valor = parseFloat(r.valor);
      const mes = r.mes ? String(r.mes).trim() : '';

      await prisma.$executeRawUnsafe(
        `INSERT INTO "levt_motoristas" (id, "importacaoId", motorista, veiculo, valor, mes, "criadoEm")
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        regId, importId, motoristaNome, veiculo, valor, mes
      );
    }

    res.status(201).json({ importacaoId: importId, total: validos.length });
  } catch (err) {
    console.error('POST /importar erro:', err);
    res.status(500).json({ error: 'Erro ao importar', detail: err.message });
  }
});

// PUT /api/levantamentos-motoristas/importacoes/:id  (atualiza titulo, tipoPagamento e frota)
router.put('/importacoes/:id', async (req, res) => {
  try {
    const { tipoPagamento, frota, titulo, mesReferencia } = req.body;
    await prisma.$executeRawUnsafe(
      `UPDATE "importacoes_levt_motoristas" SET "titulo" = $1, "tipoPagamento" = $2, "frota" = $3, "mesReferencia" = $4 WHERE id = $5`,
      titulo?.trim() || null, tipoPagamento || null, frota || null, mesReferencia || null, req.params.id
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /importacoes erro:', err);
    res.status(500).json({ error: 'Erro ao atualizar importação', detail: err.message });
  }
});

// GET /api/levantamentos-motoristas/nomes-unicos — lista nomes únicos com contagem
router.get('/nomes-unicos', async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT TRIM(motorista) AS nome, COUNT(*)::int AS total
      FROM "levt_motoristas"
      GROUP BY TRIM(motorista)
      ORDER BY TRIM(motorista) ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /nomes-unicos erro:', err);
    res.status(500).json({ error: 'Erro ao buscar nomes', detail: err.message });
  }
});

// PUT /api/levantamentos-motoristas/renomear — renomeia todos os registros de um motorista
router.put('/renomear', async (req, res) => {
  try {
    const { de, para } = req.body;
    if (!de || !para) return res.status(400).json({ error: '"de" e "para" são obrigatórios' });
    const { count } = await prisma.$executeRawUnsafe(
      `UPDATE "levt_motoristas" SET motorista = $1 WHERE LOWER(TRIM(motorista)) = LOWER(TRIM($2))`,
      para.trim(), de.trim()
    );
    res.json({ ok: true, atualizados: count ?? 0 });
  } catch (err) {
    console.error('PUT /renomear erro:', err);
    res.status(500).json({ error: 'Erro ao renomear', detail: err.message });
  }
});

// PUT /api/levantamentos-motoristas/veiculo  (atualiza placa de todos os registros de um motorista)
router.put('/veiculo', async (req, res) => {
  try {
    const { motorista, veiculo } = req.body;
    if (!motorista) return res.status(400).json({ error: 'motorista é obrigatório' });
    await prisma.$executeRawUnsafe(
      `UPDATE "levt_motoristas" SET veiculo = $1 WHERE LOWER(TRIM(motorista)) = LOWER(TRIM($2))`,
      veiculo || null, motorista
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /veiculo erro:', err);
    res.status(500).json({ error: 'Erro ao atualizar veículo', detail: err.message });
  }
});

// DELETE /api/levantamentos-motoristas/importacoes/:id
router.delete('/importacoes/:id', async (req, res) => {
  try {
    // CASCADE apaga os registros filhos automaticamente
    await prisma.$executeRawUnsafe(
      `DELETE FROM "importacoes_levt_motoristas" WHERE id = $1`,
      req.params.id
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /importacoes erro:', err);
    res.status(500).json({ error: 'Erro ao excluir importação', detail: err.message });
  }
});

module.exports = router;
