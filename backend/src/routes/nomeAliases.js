const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middleware/auth');
const { randomUUID } = require('crypto');
const router = express.Router();

router.use(autenticar);

// normaliza: UPPER + espaços simples + trim
function norm(s) {
  return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

// GET /api/nome-aliases
router.get('/', async (req, res) => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "nome_aliases" (
        "id"            TEXT NOT NULL,
        "nomeImportado" TEXT NOT NULL,
        "motoristaNome" TEXT NOT NULL,
        "motoristaCpf"  TEXT,
        "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "nome_aliases_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "nome_aliases_nome_key" UNIQUE ("nomeImportado")
      );
    `);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "nome_aliases" ORDER BY "nomeImportado" ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar aliases', detail: err.message });
  }
});

// POST /api/nome-aliases  { nomeImportado, motoristaNome, motoristaCpf? }
router.post('/', autorizar('levantamentos', 'escrita'), async (req, res) => {
  try {
    const { nomeImportado, motoristaNome, motoristaCpf } = req.body;
    if (!nomeImportado || !motoristaNome) {
      return res.status(400).json({ error: 'nomeImportado e motoristaNome são obrigatórios' });
    }
    const chave = norm(nomeImportado);
    // upsert
    await prisma.$executeRawUnsafe(`
      INSERT INTO "nome_aliases" ("id","nomeImportado","motoristaNome","motoristaCpf")
      VALUES ($1,$2,$3,$4)
      ON CONFLICT ("nomeImportado") DO UPDATE
        SET "motoristaNome" = EXCLUDED."motoristaNome",
            "motoristaCpf"  = EXCLUDED."motoristaCpf"
    `, randomUUID(), chave, norm(motoristaNome), motoristaCpf || null);
    const [row] = await prisma.$queryRawUnsafe(
      `SELECT * FROM "nome_aliases" WHERE "nomeImportado" = $1`, chave
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar alias', detail: err.message });
  }
});

// DELETE /api/nome-aliases/:id
router.delete('/:id', autorizar('levantamentos', 'escrita'), async (req, res) => {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "nome_aliases" WHERE id = $1`, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir alias', detail: err.message });
  }
});

module.exports = router;
