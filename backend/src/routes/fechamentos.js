const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { autenticar, exigirSetor } = require('../middleware/auth');
const router = express.Router();
const prisma = new PrismaClient();

router.use(autenticar, exigirSetor('abastecimento'));

// ── Estados brasileiros para separar fornecedor/produto na linha ──────────
const UF_RE = /\s(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s/;

// ── Parser de texto extraído do PDF ──────────────────────────────────────
function parsearTexto(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result = { empresa: '', periodoInicio: null, periodoFim: null, placas: [], duplicatas: [] };
  let current = null;

  // Placa: formato antigo ABC1234 ou Mercosul ABC1D23
  const plateRe = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$|^[A-Z]{3}[0-9]{4}$/;
  const dateTimeRe = /(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}(?::\d{2})?/;

  const parseBRL = str =>
    parseFloat(str.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0;

  // Mapa para detectar diesel duplicado: chave → array de ocorrências
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
        if (!/^(Empresa|ISO|Gerado|Elaborado|Página|Desempenho|Fechamento)/i.test(prev)) {
          result.empresa = prev;
        }
      }
      current = { placa: line, modelo: '', totalDespesas: 0, estimativaPerda: null };
      continue;
    }

    // Modelo
    if (line.startsWith('Placa/Modelo:') && current && !current.modelo) {
      current.modelo = line.replace('Placa/Modelo:', '').trim();
    }

    // ── Linha de transação: detectar diesel duplicado ──
    // Formato: MOTORISTA DATA HORA FORNECEDOR UF PRODUTO QTDE...
    const dtMatch = line.match(dateTimeRe);
    if (dtMatch && current && /diesel/i.test(line)) {
      const data = dtMatch[1]; // dd/mm/yyyy — só o dia importa
      const dtEnd = line.indexOf(dtMatch[0]) + dtMatch[0].length;
      const afterDt = line.slice(dtEnd).trim();
      const ufMatch = afterDt.match(UF_RE);
      if (ufMatch) {
        const ufPos = afterDt.search(UF_RE);
        const fornecedor = afterDt.slice(0, ufPos).trim().toLowerCase();
        // Quantidade para incluir no alerta
        const qtdeMatch = line.match(/([\d\.,]+)Lt/);
        const qtde = qtdeMatch ? qtdeMatch[1] + ' Lt' : '';
        const valorMatch = line.match(/R\$\s*([\d\.,]+)/);
        const valor = valorMatch ? 'R$ ' + valorMatch[1] : '';

        const chave = `${current.placa}|${data}|${fornecedor}`;
        if (!dieselMap[chave]) dieselMap[chave] = [];
        dieselMap[chave].push({
          placa:      current.placa,
          modelo:     current.modelo,
          data,
          fornecedor: afterDt.slice(0, ufPos).trim(),
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

  // Montar lista de duplicatas (apenas grupos com mais de 1 lançamento)
  result.duplicatas = Object.values(dieselMap)
    .filter(grupo => grupo.length > 1)
    .map(grupo => ({ ...grupo[0], ocorrencias: grupo.length }));

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
    const dados = parsearTexto(text);

    if (!dados.periodoInicio) {
      return res.status(422).json({ error: 'Não foi possível identificar o período no PDF. Verifique se é o relatório correto.' });
    }
    if (dados.placas.length === 0) {
      return res.status(422).json({ error: 'Nenhuma placa encontrada no PDF.' });
    }

    res.json({ ...dados, arquivoNome: arquivoNome || null });
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
