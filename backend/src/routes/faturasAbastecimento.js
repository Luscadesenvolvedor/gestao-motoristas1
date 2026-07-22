const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { autenticar } = require('../middleware/auth');
const router = express.Router();
const prisma = new PrismaClient();

router.use(autenticar);

function calcularStatus(item) {
  if (item.status === 'pago') return 'pago';
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const venc = new Date(item.dataVencimento); venc.setHours(0,0,0,0);
  return venc < hoje ? 'vencido' : 'pendente';
}

// POST /api/faturas-abastecimento/parse-pdf — extrai valores monetários de um PDF
router.post('/parse-pdf', async (req, res) => {
  try {
    const { base64 } = req.body;
    if (!base64) return res.status(400).json({ error: 'base64 ausente' });

    const pdfParse = require('pdf-parse');
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdfParse(buffer);
    const texto = data.text || '';
    const linhas = texto.split('\n');

    // Helper: extrai valor monetário de uma string
    const extrairValor = str => {
      const m = str.match(/R?\$?\s*([\d.]+,\d{2})/);
      return m ? m[1] : null;
    };

    const parsear = v => parseFloat((v || '0').replace(/\./g,'').replace(',','.'));

    // 1. Palavras-chave que indicam "total a pagar"
    const KEYWORDS_TOTAL = [
      /valor\s+a\s+pagar/i, /total\s+a\s+pagar/i, /total\s+geral/i,
      /valor\s+total/i, /total\s+do\s+servi[çc]o/i, /total\s+da\s+fatura/i,
      /total\s+bruto/i, /total\s+l[íi]quido/i, /vl\.?\s*total/i,
      /^total$/i, /valor\s+cobrado/i, /importe\s+total/i,
    ];

    let melhorValor = null;

    // Procura em cada linha se há keyword + valor na mesma linha ou na linha seguinte
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const temKeyword = KEYWORDS_TOTAL.some(re => re.test(linha));
      if (temKeyword) {
        // tenta extrair da mesma linha
        let v = extrairValor(linha);
        // se não achou, tenta próximas 2 linhas
        if (!v && linhas[i+1]) v = extrairValor(linhas[i+1]);
        if (!v && linhas[i+2]) v = extrairValor(linhas[i+2]);
        if (v && (!melhorValor || parsear(v) > parsear(melhorValor))) {
          melhorValor = v;
        }
      }
    }

    // 2. Se não achou via keyword, coleta TODOS os valores e pega o maior
    const todos = new Set();
    const regexRS  = /R\$\s*([\d.]+,\d{2})/gi;
    const regexNum = /(?<![.\d,])([\d]{1,3}(?:\.\d{3})+,\d{2})(?![,\d])/g;
    let m;
    while ((m = regexRS.exec(texto))  !== null) todos.add(m[1]);
    while ((m = regexNum.exec(texto)) !== null) todos.add(m[1]);

    const lista = [...todos].sort((a,b) => parsear(b) - parsear(a)); // maior primeiro

    if (!melhorValor && lista.length > 0) melhorValor = lista[0];

    res.json({
      total: melhorValor,           // melhor candidato a "total"
      valores: lista,               // todos os valores encontrados
      encontradoPorKeyword: !!melhorValor && KEYWORDS_TOTAL.some(re =>
        linhas.some(l => re.test(l))
      ),
    });
  } catch (err) {
    console.error('parse-pdf erro:', err.message);
    res.status(500).json({ error: 'Não foi possível extrair texto do PDF' });
  }
});

// GET /api/faturas-abastecimento — lista sem conteúdo de arquivo (pesado)
router.get('/', async (req, res) => {
  try {
    const { fornecedorId } = req.query;
    const where = fornecedorId ? { fornecedorId } : {};
    const faturas = await prisma.faturaAbastecimento.findMany({
      where,
      select: {
        id: true, numero: true, valor: true, dataVencimento: true,
        dataPagamento: true, status: true, observacao: true,
        arquivoNome: true, arquivoTipo: true, // sem arquivoBase64 para não pesar
        fornecedorId: true, usuarioId: true, criadoEm: true,
        fornecedor: { select: { id: true, razaoSocial: true, tipoServico: true, cnpj: true, chavePix: true } },
        notasFiscais: {
          select: { id: true, numero: true, valor: true, arquivoNome: true, arquivoTipo: true }
        }
      },
      orderBy: { dataVencimento: 'asc' }
    });
    const resultado = faturas.map(f => ({ ...f, status: calcularStatus(f) }));
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar faturas' });
  }
});

// POST /api/faturas-abastecimento
// Aceita fornecedorData inline — encontra ou cria o fornecedor pelo CNPJ
router.post('/', async (req, res) => {
  try {
    const { fornecedorData, numero, valor, dataVencimento, observacao, arquivoNome, arquivoBase64, arquivoTipo } = req.body;
    console.log('[POST /faturas-abastecimento] body keys:', Object.keys(req.body));
    console.log('[POST /faturas-abastecimento] valor:', valor, '| dataVencimento:', dataVencimento, '| fornecedorData:', !!fornecedorData);

    if (!fornecedorData) {
      return res.status(400).json({ error: 'Dados do fornecedor ausentes (fornecedorData)' });
    }
    if (valor === undefined || valor === null || valor === '') {
      return res.status(400).json({ error: `Valor ausente ou inválido: "${valor}"` });
    }
    if (!dataVencimento) {
      return res.status(400).json({ error: 'Data de vencimento ausente' });
    }
    const cnpjLimpo = (fornecedorData.cnpj || '').replace(/\D/g, '');

    // Encontra ou cria o fornecedor pelo CNPJ
    let fornecedor = await prisma.fornecedorAbastecimento.findFirst({ where: { cnpj: cnpjLimpo } });
    if (!fornecedor) {
      fornecedor = await prisma.fornecedorAbastecimento.create({
        data: { ...fornecedorData, cnpj: cnpjLimpo, chavePix: fornecedorData.chavePix || null }
      });
    } else {
      fornecedor = await prisma.fornecedorAbastecimento.update({
        where: { id: fornecedor.id },
        data: { ...fornecedorData, cnpj: cnpjLimpo, chavePix: fornecedorData.chavePix || null }
      });
    }

    const fatura = await prisma.faturaAbastecimento.create({
      data: {
        fornecedorId: fornecedor.id,
        numero: numero || `FAT-${Date.now()}`,
        valor: parseFloat(valor),
        dataVencimento: new Date(dataVencimento),
        observacao: observacao || null,
        arquivoNome: arquivoNome || null,
        arquivoBase64: arquivoBase64 || null,
        arquivoTipo: arquivoTipo || null,
        usuarioId: req.usuario.id,
        status: 'pendente'
      },
      include: {
        fornecedor: { select: { id: true, razaoSocial: true, tipoServico: true, cnpj: true, chavePix: true, responsavel: true, contato: true } },
        notasFiscais: { select: { id: true, numero: true, valor: true, arquivoNome: true, arquivoTipo: true } }
      }
    });
    res.status(201).json({ ...fatura, status: calcularStatus(fatura) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar fatura' });
  }
});

// PUT /api/faturas-abastecimento/:id
router.put('/:id', async (req, res) => {
  try {
    const { numero, valor, dataVencimento, observacao, arquivoNome, arquivoBase64, arquivoTipo } = req.body;
    const data = {
      numero, valor: parseFloat(valor),
      dataVencimento: new Date(dataVencimento),
      observacao: observacao || null,
    };
    if (arquivoBase64 !== undefined) {
      data.arquivoNome  = arquivoNome  || null;
      data.arquivoBase64 = arquivoBase64 || null;
      data.arquivoTipo  = arquivoTipo  || null;
    }
    const fatura = await prisma.faturaAbastecimento.update({ where: { id: req.params.id }, data });
    res.json({ ...fatura, status: calcularStatus(fatura) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar fatura' });
  }
});

// PATCH /api/faturas-abastecimento/:id/pagar
router.patch('/:id/pagar', async (req, res) => {
  try {
    const { dataPagamento } = req.body;
    const fatura = await prisma.faturaAbastecimento.update({
      where: { id: req.params.id },
      data: { status: 'pago', dataPagamento: dataPagamento ? new Date(dataPagamento) : new Date() }
    });
    res.json(fatura);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao marcar como pago' });
  }
});

// PATCH /api/faturas-abastecimento/:id/reabrir
router.patch('/:id/reabrir', async (req, res) => {
  try {
    const fatura = await prisma.faturaAbastecimento.update({
      where: { id: req.params.id },
      data: { status: 'pendente', dataPagamento: null }
    });
    res.json({ ...fatura, status: calcularStatus(fatura) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao reabrir fatura' });
  }
});

// GET /api/faturas-abastecimento/:id/arquivo — download do arquivo da fatura
router.get('/:id/arquivo', async (req, res) => {
  try {
    const fatura = await prisma.faturaAbastecimento.findUnique({
      where: { id: req.params.id },
      select: { arquivoNome: true, arquivoBase64: true, arquivoTipo: true }
    });
    if (!fatura || !fatura.arquivoBase64) return res.status(404).json({ error: 'Arquivo não encontrado' });
    const buffer = Buffer.from(fatura.arquivoBase64, 'base64');
    res.set('Content-Type', fatura.arquivoTipo || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${fatura.arquivoNome || 'fatura'}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao baixar arquivo' });
  }
});

// DELETE /api/faturas-abastecimento/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.faturaAbastecimento.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir fatura' });
  }
});

// ─── NFs ──────────────────────────────────────────────────

// POST /api/faturas-abastecimento/:id/nfs
router.post('/:id/nfs', async (req, res) => {
  try {
    const { numero, valor, arquivoNome, arquivoBase64, arquivoTipo } = req.body;
    if (!numero || !valor) return res.status(400).json({ error: 'Número e valor são obrigatórios' });
    const nf = await prisma.notaFiscalAbastecimento.create({
      data: {
        faturaId: req.params.id,
        numero,
        valor: parseFloat(valor),
        arquivoNome: arquivoNome || null,
        arquivoBase64: arquivoBase64 || null,
        arquivoTipo: arquivoTipo || null,
      }
    });
    res.status(201).json(nf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar NF' });
  }
});

// GET /api/faturas-abastecimento/:id/nfs/:nfId/arquivo — download do arquivo da NF
router.get('/:id/nfs/:nfId/arquivo', async (req, res) => {
  try {
    const nf = await prisma.notaFiscalAbastecimento.findUnique({
      where: { id: req.params.nfId },
      select: { arquivoNome: true, arquivoBase64: true, arquivoTipo: true }
    });
    if (!nf || !nf.arquivoBase64) return res.status(404).json({ error: 'Arquivo não encontrado' });
    const buffer = Buffer.from(nf.arquivoBase64, 'base64');
    res.set('Content-Type', nf.arquivoTipo || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${nf.arquivoNome || 'nf'}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao baixar arquivo da NF' });
  }
});

// DELETE /api/faturas-abastecimento/:id/nfs/:nfId
router.delete('/:id/nfs/:nfId', async (req, res) => {
  try {
    await prisma.notaFiscalAbastecimento.delete({ where: { id: req.params.nfId } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover NF' });
  }
});

module.exports = router;
