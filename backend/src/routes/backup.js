const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { autenticar } = require('../middleware/auth');
const { enviarBackupEmail } = require('../services/backupEmail');
const router = express.Router();
const prisma = new PrismaClient();

// Apenas admins podem acessar
router.use(autenticar, (req, res, next) => {
  if (req.usuario.papel !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem gerar backup' });
  }
  next();
});

// GET /api/backup — gera JSON com todas as tabelas
router.get('/', async (req, res) => {
  try {
    const [
      usuarios,
      motoristas,
      solicitacoes,
      exclusoes,
      folgas,
      ferias,
      agendamentos,
      financeiro,
      valesFixos,
      lavagens,
      frotaApoio,
      veiculosApoio,
      faturasAbastecimento,
      fornecedoresAbastecimento,
      fornecedoresLavagem,
      importacoesConsumo,
    ] = await Promise.all([
      prisma.$queryRawUnsafe(`SELECT id, nome, email, papel, setor, ativo, "criadoEm" FROM "usuarios"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "motoristas"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "solicitacoes"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "exclusoes"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "folgas"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "ferias"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "agendamentos"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "controle_financeiro"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "vales_fixos"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "lavagens"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "frota_apoio"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "veiculos_apoio"`),
      prisma.$queryRawUnsafe(`SELECT id, "fornecedorId", numero, valor, status, "dataVencimento", "dataPagamento", "criadoEm" FROM "faturas_abastecimento"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "fornecedores_abastecimento"`),
      prisma.$queryRawUnsafe(`SELECT * FROM "fornecedores_lavagem"`),
      prisma.$queryRawUnsafe(`SELECT id, "nomeArquivo", "totalRegistros", "periodoInicio", "periodoFim", frota, "criadoEm" FROM "importacoes_consumo"`),
    ]);

    const backup = {
      geradoEm: new Date().toISOString(),
      versao: '1.0',
      tabelas: {
        usuarios,
        motoristas,
        solicitacoes,
        exclusoes,
        folgas,
        ferias,
        agendamentos,
        financeiro,
        valesFixos,
        lavagens,
        frotaApoio,
        veiculosApoio,
        faturasAbastecimento,
        fornecedoresAbastecimento,
        fornecedoresLavagem,
        importacoesConsumo,
      },
    };

    const dataHoje = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${dataHoje}.json"`);
    res.json(backup);
  } catch (err) {
    console.error('Erro ao gerar backup:', err);
    res.status(500).json({ error: 'Erro ao gerar backup', detail: err.message });
  }
});

// POST /api/backup/enviar-email — dispara o backup por e-mail na hora (teste)
router.post('/enviar-email', async (req, res) => {
  try {
    await enviarBackupEmail();
    res.json({ ok: true, mensagem: `Backup enviado para ${process.env.BACKUP_EMAIL_DESTINO}` });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar backup', detail: err.message });
  }
});

module.exports = router;
