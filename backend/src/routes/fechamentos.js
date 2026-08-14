const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { autenticar, exigirSetor } = require('../middleware/auth');
const router = express.Router();
const prisma = new PrismaClient();

router.use(autenticar, exigirSetor('abastecimento'));

// ── Estados brasileiros ──────────────────────────────────────────────────
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
             'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

// Regex para linha de transação: MOTORISTA QTDELtFORNECEDOR+UF (UF colado ao fim)
// Ex: "CLEBER DE OLIVEIRA E SILVA 600,000LtAuto Posto Reforco Ii LtdaSE"
const TX_LINHA_RE = new RegExp(
  `^.+?\\s+([\\d\\.,]+)Lt(.+?)(${UFS.join('|')})$`
);

// ── Parser de texto extraído do PDF ──────────────────────────────────────
function parsearTexto(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result = { empresa: '', periodoInicio: null, periodoFim: null, placas: [], duplicatas: [] };
  let current = null;

  const plateRe    = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$|^[A-Z]{3}[0-9]{4}$/;
  const dateTimeRe = /(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}(?::\d{2})?/;
  const parseBRL   = str =>
    parseFloat(str.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0;

  const dieselMap = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Período do fechamento
    if (!result.periodoInicio) {
      const m = line.match(
        /Fechamento do per[ií]odo\s+(\d{2}\/\d{2}\/\d{4})\s+at[eé]\s+(\d{2}\/\d{2}\/\d{4})/i
      );
      if (m) {
        const [d1, m1, y1] = m[1].split('/');
        const [d2, m2, y2] = m[2].split('/');
        result.periodoInicio = `${y1}-${m1}-${d1}`;
        result.periodoFim    = `${y2}-${m2}-${d2}`;
      }
    }

    // Placa (linha isolada)
    if (plateRe.test(line)) {
      if (current && current.placa === line) continue;
      if (current && current.totalDespesas > 0) result.placas.push({ ...current });
      if (!result.empresa && i > 0) {
        const prev = lines[i - 1];
        if (!/^(Empresa|ISO|Gerado|Elaborado|P[áa]gina|Desempenho|Fechamento)/i.test(prev))
          result.empresa = prev;
      }
      current = { placa: line, modelo: '', totalDespesas: 0, estimativaPerda: null };
      continue;
    }

    // Modelo
    if (/^Placa\/Modelo:/i.test(line) && current && !current.modelo)
      current.modelo = line.replace(/^Placa\/Modelo:\s*/i, '').trim();

    // ── Detectar diesel ──────────────────────────────────────────────────
    // Neste relatório, "Oleo Diesel B S10" aparece ANTES da data da transação.
    // Ao encontrar a linha do produto, varremos as linhas seguintes para obter:
    //   • Data/hora exata  → usada como chave (mesmo timestamp = mesma transação)
    //   • Linha de dados   → MOTORISTA QTDELtFORNECEDOR+UF
    //   • R$ Valor
    if (/Oleo Diesel/i.test(line) && current) {
      let dtStr = null, dtDate = null, qtde = '', valor = '', forn = null;

      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        const nxt = lines[j];

        // Para ao encontrar nova placa, total ou próximo produto diesel
        if (plateRe.test(nxt) || /Total despesas/i.test(nxt)) break;
        if (/Oleo Diesel/i.test(nxt)) break;

        // Data da transação (chave única)
        if (!dtStr) {
          const m = nxt.match(dateTimeRe);
          if (m) { dtStr = m[0]; dtDate = m[1]; }
        }

        // Valor total (linha que começa com "R$ ")
        if (!valor) {
          const m = nxt.match(/^R\$\s*([\d\.,]+)/);
          if (m) valor = 'R$ ' + m[1];
        }

        // Linha de transação: MOTORISTA QTDELtFORNECEDOR+UF_colado
        if (!qtde) {
          const m = nxt.match(TX_LINHA_RE);
          if (m) {
            qtde = m[1] + ' Lt';
            forn = m[2].trim().replace(/\b\w/g, c => c.toUpperCase());
          }
        }
      }

      // Só registra se encontrou a data (confirma que é uma transação real)
      if (dtStr) {
        const chave = `${current.placa}|${dtStr}`;
        if (!dieselMap[chave]) dieselMap[chave] = [];
        dieselMap[chave].push({
          placa:      current.placa,
          modelo:     current.modelo || '',
          data:       dtDate,
          fornecedor: forn || 'Verificar no PDF',
          qtde,
          valor,
        });
      }
    }

    // Total despesas da placa
    const totalM = line.match(/Total despesas da placa:\s*R\$\s*([\d\.,\s]+)/i);
    if (totalM && current) current.totalDespesas = parseBRL(totalM[1]);

    // Estimativa perda → fecha o bloco da placa
    const perdaM = line.match(/Estimativa perda na m[eé]dia diesel:\s*R\$\s*([-\d\.,\s]+)/i);
    if (perdaM && current) {
      current.estimativaPerda = parseBRL(perdaM[1]);
      result.placas.push({ ...current });
      current = null;
    }
  }

  if (current && current.totalDespesas > 0) result.placas.push({ ...current });

  // Montar lista de duplicatas (grupos com mais de 1 lançamento no mesmo timestamp)
  result.duplicatas = Object.values(dieselMap)
    .filter(g => g.length > 1)
    .map(g => ({ ...g[0], ocorrencias: g.length }));

  return result;
}

// POST /api/fechamentos/parsear — recebe base64 do PDF, devolve dados parseados
router.post('/parsear', async (req, res) => {
  try {
    const { arquivoBase64, arquivoNome } = req.body;
    if (!arquivoBase64) return res.status(400).json({ error: 'PDF ausente' });

    let pdfParse;
    try { pdfParse = require('pdf-parse'); }
    catch { return res.status(500).json({ error: 'pdf-parse não instalado. Execute: npm install pdf-parse' }); }

    const buffer = Buffer.from(arquivoBase64, 'base64');
    const { text } = await pdfParse(buffer);

    const _linhasDebug = text.split('\n').map(l => l.trim()).filter(Boolean);
    const dados = parsearTexto(text);

    if (!dados.periodoInicio) {
      return res.status(422).json({ error: 'Não foi possível identificar o período no PDF. Verifique se é o relatório correto.' });
    }
    if (dados.placas.length === 0) {
      return res.status(422).json({ error: 'Nenhuma placa encontrada no PDF.' });
    }

    res.json({ ...dados, arquivoNome: arquivoNome || null, _linhasDebug: _linhasDebug.slice(0, 120) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar PDF: ' + err.message });
  }
});

// POST /api/fechamentos — salvar fechamento parseado
router.post('/', async (req, res) => {
  try {
    const { empresa, periodoInicio, periodoFim, arquivoNome, placas } = req.body;
    if (!empresa || !periodoInicio || !periodoFim || !Array.isArray(placas) || placas.length === 0) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const fechamento = await prisma.fechamento.create({
      data: {
        empresa,
        periodoInicio: new Date(periodoInicio),
        periodoFim:    new Date(periodoFim),
        arquivoNome:   arquivoNome || null,
        usuarioId:     req.usuario.id,
        placas: {
          create: placas.map(p => ({
            placa:           p.placa,
            modelo:          p.modelo || null,
            totalDespesas:   parseFloat(p.totalDespesas)   || 0,
            estimativaPerda: p.estimativaPerda != null ? parseFloat(p.estimativaPerda) : null,
          }))
        }
      },
      include: { placas: true, usuario: { select: { nome: true } } }
    });

    res.status(201).json(fechamento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar fechamento' });
  }
});

// GET /api/fechamentos — listar todos
router.get('/', async (req, res) => {
  try {
    const fechamentos = await prisma.fechamento.findMany({
      include: {
        placas:  { orderBy: { totalDespesas: 'desc' } },
        usuario: { select: { nome: true } }
      },
      orderBy: { periodoInicio: 'desc' }
    });
    res.json(fechamentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar fechamentos' });
  }
});

// DELETE /api/fechamentos/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.fechamento.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir fechamento' });
  }
});

module.exports = router;
