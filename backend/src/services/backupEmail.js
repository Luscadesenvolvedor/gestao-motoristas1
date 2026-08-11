const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function gerarDadosBackup() {
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

  return {
    geradoEm: new Date().toISOString(),
    versao: '1.0',
    tabelas: {
      usuarios, motoristas, solicitacoes, exclusoes, folgas, ferias,
      agendamentos, financeiro, valesFixos, lavagens, frotaApoio,
      veiculosApoio, faturasAbastecimento, fornecedoresAbastecimento,
      fornecedoresLavagem, importacoesConsumo,
    },
  };
}

async function enviarBackupEmail() {
  const {
    BACKUP_EMAIL_DESTINO,
    BACKUP_EMAIL_REMETENTE,
    BACKUP_EMAIL_SENHA,
  } = process.env;

  if (!BACKUP_EMAIL_DESTINO || !BACKUP_EMAIL_REMETENTE || !BACKUP_EMAIL_SENHA) {
    console.warn('Backup por e-mail: variáveis não configuradas (BACKUP_EMAIL_*)');
    return;
  }

  try {
    console.log('Gerando backup para envio por e-mail...');
    const dados = await gerarDadosBackup();
    const json = JSON.stringify(dados, null, 2);
    const hoje = new Date().toISOString().slice(0, 10);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: BACKUP_EMAIL_REMETENTE,
        pass: BACKUP_EMAIL_SENHA, // senha de app do Gmail (não a senha normal)
      },
    });

    const totalRegistros = Object.values(dados.tabelas).reduce((s, t) => s + (t?.length || 0), 0);

    await transporter.sendMail({
      from: `"Backup Gestão Motoristas" <${BACKUP_EMAIL_REMETENTE}>`,
      to: BACKUP_EMAIL_DESTINO,
      subject: `📦 Backup do Sistema — ${hoje}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#EB3238;padding:24px;border-radius:12px 12px 0 0;text-align:center">
            <h2 style="color:#fff;margin:0">Backup Diário — Gestão de Motoristas</h2>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0">${hoje}</p>
          </div>
          <div style="background:#f9fafb;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb">
            <p style="color:#374151">O arquivo de backup está anexado a este e-mail.</p>
            <table style="width:100%;border-collapse:collapse;margin-top:16px">
              <tr style="background:#fff;border:1px solid #e5e7eb">
                <td style="padding:10px 14px;font-size:13px;color:#6b7280">Total de registros</td>
                <td style="padding:10px 14px;font-size:13px;font-weight:bold;color:#1a1a2e">${totalRegistros.toLocaleString('pt-BR')}</td>
              </tr>
              <tr style="background:#f3f4f6;border:1px solid #e5e7eb">
                <td style="padding:10px 14px;font-size:13px;color:#6b7280">Solicitações</td>
                <td style="padding:10px 14px;font-size:13px;font-weight:bold;color:#1a1a2e">${dados.tabelas.solicitacoes?.length || 0}</td>
              </tr>
              <tr style="background:#fff;border:1px solid #e5e7eb">
                <td style="padding:10px 14px;font-size:13px;color:#6b7280">Motoristas</td>
                <td style="padding:10px 14px;font-size:13px;font-weight:bold;color:#1a1a2e">${dados.tabelas.motoristas?.length || 0}</td>
              </tr>
              <tr style="background:#f3f4f6;border:1px solid #e5e7eb">
                <td style="padding:10px 14px;font-size:13px;color:#6b7280">Financeiro</td>
                <td style="padding:10px 14px;font-size:13px;font-weight:bold;color:#1a1a2e">${dados.tabelas.financeiro?.length || 0}</td>
              </tr>
            </table>
            <p style="color:#9ca3af;font-size:12px;margin-top:20px">
              Este e-mail é gerado automaticamente todo dia às 3h da manhã.<br>
              Guarde o arquivo .json em local seguro.
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `backup-${hoje}.json`,
          content: json,
          contentType: 'application/json',
        },
      ],
    });

    console.log(`Backup enviado para ${BACKUP_EMAIL_DESTINO}`);
  } catch (err) {
    console.error('Erro ao enviar backup por e-mail:', err.message);
  }
}

module.exports = { enviarBackupEmail };
