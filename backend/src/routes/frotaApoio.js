const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, exigirSetor } = require('../middleware/auth');
const { randomUUID } = require('crypto');
const router = express.Router();

router.use(autenticar, exigirSetor('abastecimento'));

// GET /api/frota-apoio?mes=MM&ano=YYYY&centroCusto=X
router.get('/', async (req, res) => {
  try {
    const { mes, ano, centroCusto } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    let i = 1;

    if (mes && ano) {
      where += ` AND EXTRACT(MONTH FROM data) = $${i++} AND EXTRACT(YEAR FROM data) = $${i++}`;
      params.push(parseInt(mes), parseInt(ano));
    } else if (ano) {
      where += ` AND EXTRACT(YEAR FROM data) = $${i++}`;
      params.push(parseInt(ano));
    }
    if (centroCusto) {
      where += ` AND "centroCusto" = $${i++}`;
      params.push(centroCusto);
    }

    const registros = await prisma.$queryRawUnsafe(
      `SELECT * FROM "frota_apoio" ${where} ORDER BY data DESC, hora DESC`,
      ...params
    );
    res.json(registros);
  } catch (err) {
    console.error('GET /frota-apoio erro:', err);
    res.status(500).json({ error: 'Erro ao buscar registros', detail: err.message });
  }
});

// POST /api/frota-apoio
router.post('/', async (req, res) => {
  try {
    const {
      data, hora, motorista, placa, modelo,
      kmInicial, kmFinal, distancia,
      documento, posto, cidade, uf,
      precoLitro, litros, produto, valor, centroCusto
    } = req.body;

    if (!data || !motorista || !placa) {
      return res.status(400).json({ error: 'data, motorista e placa são obrigatórios' });
    }

    const id = randomUUID();
    const dist = distancia ?? (parseFloat(kmFinal || 0) - parseFloat(kmInicial || 0));
    const vlr = valor ?? (parseFloat(litros || 0) * parseFloat(precoLitro || 0));

    await prisma.$executeRawUnsafe(`
      INSERT INTO "frota_apoio"
        (id, data, hora, motorista, placa, modelo, "kmInicial", "kmFinal", distancia,
         documento, posto, cidade, uf, "precoLitro", litros, produto, valor, "centroCusto", "criadoEm")
      VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
    `,
      id, data, hora || null, motorista, placa, modelo || null,
      parseFloat(kmInicial) || null, parseFloat(kmFinal) || null, parseFloat(dist) || null,
      documento || null, posto || null, cidade || null, uf || null,
      parseFloat(precoLitro) || null, parseFloat(litros) || null,
      produto || 'GASOLINA', parseFloat(vlr) || null, centroCusto || null
    );

    res.status(201).json({ id });
  } catch (err) {
    console.error('POST /frota-apoio erro:', err);
    res.status(500).json({ error: 'Erro ao salvar registro', detail: err.message });
  }
});

// PUT /api/frota-apoio/:id
router.put('/:id', async (req, res) => {
  try {
    const {
      data, hora, motorista, placa, modelo,
      kmInicial, kmFinal, distancia,
      documento, posto, cidade, uf,
      precoLitro, litros, produto, valor, centroCusto
    } = req.body;

    const dist = distancia ?? (parseFloat(kmFinal || 0) - parseFloat(kmInicial || 0));
    const vlr = valor ?? (parseFloat(litros || 0) * parseFloat(precoLitro || 0));

    await prisma.$executeRawUnsafe(`
      UPDATE "frota_apoio" SET
        data=$1::date, hora=$2, motorista=$3, placa=$4, modelo=$5,
        "kmInicial"=$6, "kmFinal"=$7, distancia=$8,
        documento=$9, posto=$10, cidade=$11, uf=$12,
        "precoLitro"=$13, litros=$14, produto=$15, valor=$16, "centroCusto"=$17
      WHERE id=$18
    `,
      data, hora || null, motorista, placa, modelo || null,
      parseFloat(kmInicial) || null, parseFloat(kmFinal) || null, parseFloat(dist) || null,
      documento || null, posto || null, cidade || null, uf || null,
      parseFloat(precoLitro) || null, parseFloat(litros) || null,
      produto || 'GASOLINA', parseFloat(vlr) || null, centroCusto || null,
      req.params.id
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /frota-apoio erro:', err);
    res.status(500).json({ error: 'Erro ao atualizar registro', detail: err.message });
  }
});

// DELETE /api/frota-apoio/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "frota_apoio" WHERE id=$1`, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /frota-apoio erro:', err);
    res.status(500).json({ error: 'Erro ao excluir', detail: err.message });
  }
});

// GET /api/frota-apoio/periodos — anos e meses com registros
router.get('/periodos', async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT
        EXTRACT(YEAR FROM data)::int AS ano,
        LPAD(EXTRACT(MONTH FROM data)::text, 2, '0') AS mes
      FROM "frota_apoio"
      ORDER BY ano DESC, mes ASC
    `);
    res.json(rows.map(r => ({ ano: String(r.ano), mes: r.mes })));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar períodos', detail: err.message });
  }
});

// ── Veículos cadastrados ──

// GET /api/frota-apoio/veiculos
router.get('/veiculos', async (req, res) => {
  try {
    // Garante que a coluna imagem existe
    await prisma.$executeRawUnsafe(`ALTER TABLE "veiculos_apoio" ADD COLUMN IF NOT EXISTS imagem TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "veiculos_apoio" ADD COLUMN IF NOT EXISTS ano TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "veiculos_apoio" ADD COLUMN IF NOT EXISTS cor TEXT`);
    const lista = await prisma.$queryRawUnsafe(`SELECT * FROM "veiculos_apoio" ORDER BY placa ASC`);
    res.json(lista);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar veículos', detail: err.message });
  }
});

// POST /api/frota-apoio/veiculos
router.post('/veiculos', async (req, res) => {
  try {
    const { placa, modelo, ano, cor } = req.body;
    if (!placa) return res.status(400).json({ error: 'Placa é obrigatória' });
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "veiculos_apoio" (id, placa, modelo, ano, cor, "criadoEm") VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (placa) DO UPDATE SET modelo = EXCLUDED.modelo, ano = EXCLUDED.ano, cor = EXCLUDED.cor`,
      id, placa.toUpperCase().trim(), modelo?.trim() || null, ano?.trim() || null, cor?.trim() || null
    );
    const [row] = await prisma.$queryRawUnsafe(`SELECT * FROM "veiculos_apoio" WHERE placa = $1`, placa.toUpperCase().trim());
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar veículo', detail: err.message });
  }
});

// PUT /api/frota-apoio/veiculos/:id — atualiza dados e/ou imagem
router.put('/veiculos/:id', async (req, res) => {
  try {
    const { placa, modelo, ano, cor, imagem } = req.body;
    await prisma.$executeRawUnsafe(
      `UPDATE "veiculos_apoio" SET
        placa   = COALESCE($2, placa),
        modelo  = COALESCE($3, modelo),
        ano     = COALESCE($4, ano),
        cor     = COALESCE($5, cor),
        imagem  = COALESCE($6, imagem)
       WHERE id = $1`,
      req.params.id,
      placa ? placa.toUpperCase().trim() : null,
      modelo !== undefined ? modelo?.trim() || null : null,
      ano !== undefined ? ano?.trim() || null : null,
      cor !== undefined ? cor?.trim() || null : null,
      imagem !== undefined ? imagem || null : null
    );
    const [row] = await prisma.$queryRawUnsafe(`SELECT * FROM "veiculos_apoio" WHERE id = $1`, req.params.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar veículo', detail: err.message });
  }
});

// DELETE /api/frota-apoio/veiculos/:id
router.delete('/veiculos/:id', async (req, res) => {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "veiculos_apoio" WHERE id=$1`, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir veículo', detail: err.message });
  }
});

module.exports = router;
