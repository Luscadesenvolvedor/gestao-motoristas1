const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { autenticar, exigirSetor } = require('../middleware/auth');
const { randomUUID } = require('crypto');
const router = express.Router();
const prisma = new PrismaClient();

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
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
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
        data=$1, hora=$2, motorista=$3, placa=$4, modelo=$5,
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

module.exports = router;
