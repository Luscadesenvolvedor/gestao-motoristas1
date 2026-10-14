const nodemailer = require('nodemailer');
const prisma = require('../lib/prisma');

// Serializa BigInt (Prisma retorna IDs como BigInt em queries raw)
function serializarBigInt(value) {
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(serializarBigInt);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializarBigInt(v)]));
  }
  return value;
}

async function querySegura(sql, nome) {
  try {
    const rows = await prisma.$queryRawUnsafe(sql);
    return serializarBigInt(rows);
  } catch (err) {
    console.warn(`Backup: falha ao consultar ${nome} — ${err.message}`);
    return [];
  }
}

async function gerarDadosBackup() {
  // Consultas uma por vez (em vez de Promise.all) para não manter todas as tabelas
  // carregadas na memória ao mesmo tempo durante o pico.
  const consultas = [
    ['usuarios', `SELECT id, nome, email, papel, setor, ativo, "criadoEm" FROM "usuarios"`, 'usuarios'],
    ['motoristas', `SELECT * FROM "motoristas"`, 'motoristas'],
    ['solicitacoes', `SELECT * FROM "solicitacoes"`, 'solicitacoes'],
    ['exclusoes', `SELECT * FROM "exclusoes_vale"`, 'exclusoes_vale'],
    ['folgas', `SELECT * FROM "folgas"`, 'folgas'],
    ['ferias', `SELECT * FROM "ferias"`, 'ferias'],
    ['agendamentos', `SELECT * FROM "agendamentos"`, 'agendamentos'],
    ['financeiro', `SELECT * FROM "controle_financeiro"`, 'controle_financeiro'],
    ['valesFixos', `SELECT * FROM "vales_fixos"`, 'vales_fixos'],
    ['lavagens', `SELECT * FROM "lavagens"`, 'lavagens'],
    ['frotaApoio', `SELECT * FROM "frota_apoio"`, 'frota_apoio'],
    ['veiculosApoio', `SELECT * FROM "veiculos_apoio"`, 'veiculos_apoio'],
    ['faturasAbastecimento', `SELECT id, "fornecedorId", numero, valor, status, "dataVencimento", "dataPagamento", "criadoEm" FROM "faturas_abastecimento"`, 'faturas_abastecimento'],
    ['fornecedoresAbastecimento', `SELECT * FROM "fornecedores_abastecimento"`, 'fornecedores_abastecimento'],
    ['fornecedoresLavagem', `SELECT * FROM "fornecedores_lavagem"`, 'fornecedores_lavagem'],
    ['importacoesConsumo', `SELECT id, "nomeArquivo", "totalRegistros", "periodoInicio", "periodoFim", frota, "criadoEm" FROM "importacoes_consumo"`, 'importacoes_consumo'],
    ['importacoesMot', `SELECT * FROM "importacoes_levt_motoristas"`, 'importacoes_levt_motoristas'],
    ['levtMotoristas', `SELECT * FROM "levt_motoristas"`, 'levt_motoristas'],
  ];

  const tabelas = {};
  for (const [chave, sql, nome] of consultas) {
    tabelas[chave] = await querySegura(sql, nome);
  }

  return {
    geradoEm: new Date().toISOString(),
    versao: '1.0',
    tabelas,
  };
}

async function enviarBackupEmail() {
  const {
    BACKUP_EMAIL_DESTINO,
    BACKUP_EMAIL_REMETENTE,
    BACKUP_EMAIL_SENHA,
  } = process.env;

  if (!BACKUP_EMAIL_DESTINO || !BACKUP_EMAIL_REMETENTE || !BACKUP_EMAIL_SENHA) {
    throw new Error('Variáveis de e-mail não configuradas no servidor (BACKUP_EMAIL_REMETENTE, BACKUP_EMAIL_SENHA, BACKUP_EMAIL_DESTINO)');
  }

  console.log('Gerando backup para envio por e-mail...');
  const dados = await gerarDadosBackup();
  const json = JSON.stringify(dados); // sem indentação: arquivo e memória bem menores
  const hoje = new Date().toISOString().slice(0, 10);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: BACKUP_EMAIL_REMETENTE,
      pass: BACKUP_EMAIL_SENHA,
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
}

module.exports = { enviarBackupEmail, gerarDadosBackup, serializarBigInt };
