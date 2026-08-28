require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { enviarBackupEmail } = require('./services/backupEmail');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');

const _prisma = new PrismaClient();
async function runMigrations() {
  // Setor do usuário (acerto ou abastecimento)
  try {
    await _prisma.$executeRawUnsafe(`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "setor" TEXT NOT NULL DEFAULT 'acerto';`);
    console.log('Migration setor usuario: OK');
  } catch (e) { console.error('Migration setor usuario erro:', e.message); }

  // Fornecedores de abastecimento
  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "fornecedores_abastecimento" (
        "id" TEXT NOT NULL,
        "razaoSocial" TEXT NOT NULL,
        "cnpj" TEXT NOT NULL,
        "responsavel" TEXT NOT NULL,
        "contato" TEXT NOT NULL,
        "tipoServico" TEXT NOT NULL,
        "chavePix" TEXT,
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fornecedores_abastecimento_pkey" PRIMARY KEY ("id")
      );
    `);
    console.log('Migration fornecedores_abastecimento: OK');
  } catch (e) { console.error('Migration fornecedores_abastecimento erro:', e.message); }

  // Forma de pagamento em fornecedores_abastecimento
  try {
    await _prisma.$executeRawUnsafe(`ALTER TABLE "fornecedores_abastecimento" ADD COLUMN IF NOT EXISTS "formaPagamento" TEXT NOT NULL DEFAULT 'pix';`);
    console.log('Migration formaPagamento: OK');
  } catch (e) { console.error('Migration formaPagamento erro:', e.message); }

  // Número da OC em fornecedores_abastecimento
  try {
    await _prisma.$executeRawUnsafe(`ALTER TABLE "fornecedores_abastecimento" ADD COLUMN IF NOT EXISTS "numeroOC" TEXT;`);
    console.log('Migration numeroOC: OK');
  } catch (e) { console.error('Migration numeroOC erro:', e.message); }

  // Frota em fornecedores_abastecimento
  try {
    await _prisma.$executeRawUnsafe(`ALTER TABLE "fornecedores_abastecimento" ADD COLUMN IF NOT EXISTS "frota" TEXT NOT NULL DEFAULT 'buzin';`);
    console.log('Migration frota: OK');
  } catch (e) { console.error('Migration frota erro:', e.message); }

  // Tornar responsavel e contato opcionais
  try {
    await _prisma.$executeRawUnsafe(`ALTER TABLE "fornecedores_abastecimento" ALTER COLUMN "responsavel" DROP NOT NULL;`);
    await _prisma.$executeRawUnsafe(`ALTER TABLE "fornecedores_abastecimento" ALTER COLUMN "contato" DROP NOT NULL;`);
    console.log('Migration responsavel/contato nullable: OK');
  } catch (e) { console.error('Migration nullable erro:', e.message); }

  // Faturas de abastecimento
  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "faturas_abastecimento" (
        "id" TEXT NOT NULL,
        "fornecedorId" TEXT NOT NULL,
        "numero" TEXT NOT NULL,
        "valor" DECIMAL(10,2) NOT NULL,
        "dataVencimento" DATE NOT NULL,
        "dataPagamento" DATE,
        "status" TEXT NOT NULL DEFAULT 'pendente',
        "arquivoNome" TEXT,
        "arquivoBase64" TEXT,
        "arquivoTipo" TEXT,
        "observacao" TEXT,
        "usuarioId" TEXT NOT NULL,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "faturas_abastecimento_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "faturas_abastecimento_fornecedorId_fkey"
          FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores_abastecimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "faturas_abastecimento_usuarioId_fkey"
          FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `);
    console.log('Migration faturas_abastecimento: OK');
  } catch (e) { console.error('Migration faturas_abastecimento erro:', e.message); }

  // Notas fiscais de abastecimento
  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "notas_fiscais_abastecimento" (
        "id" TEXT NOT NULL,
        "faturaId" TEXT NOT NULL,
        "numero" TEXT NOT NULL,
        "valor" DECIMAL(10,2) NOT NULL,
        "arquivoNome" TEXT,
        "arquivoBase64" TEXT,
        "arquivoTipo" TEXT,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "notas_fiscais_abastecimento_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "notas_fiscais_abastecimento_faturaId_fkey"
          FOREIGN KEY ("faturaId") REFERENCES "faturas_abastecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    console.log('Migration notas_fiscais_abastecimento: OK');
  } catch (e) { console.error('Migration notas_fiscais_abastecimento erro:', e.message); }

  // Tabela de notas e remessas de abastecimento (legado)
  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "notas_abastecimento" (
        "id" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "numero" TEXT NOT NULL,
        "fornecedor" TEXT NOT NULL,
        "descricao" TEXT,
        "valor" DECIMAL(10,2) NOT NULL,
        "dataEmissao" DATE NOT NULL,
        "dataVencimento" DATE NOT NULL,
        "dataPagamento" DATE,
        "status" TEXT NOT NULL DEFAULT 'pendente',
        "observacao" TEXT,
        "usuarioId" TEXT NOT NULL,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "notas_abastecimento_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "notas_abastecimento_usuarioId_fkey"
          FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `);
    console.log('Migration notas_abastecimento: OK');
  } catch (e) { console.error('Migration notas_abastecimento erro:', e.message); }
  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "parcelas_desconto" (
        "id" TEXT NOT NULL,
        "controleFinanceiroId" TEXT NOT NULL,
        "mes" TEXT NOT NULL,
        "valor" DECIMAL(10,2) NOT NULL,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "parcelas_desconto_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "parcelas_desconto_controleFinanceiroId_fkey"
          FOREIGN KEY ("controleFinanceiroId")
          REFERENCES "controle_financeiro"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    console.log('Migration parcelas_desconto: OK');
  } catch (e) {
    console.error('Migration parcelas_desconto erro:', e.message);
  }
  try {
    await _prisma.$executeRawUnsafe(`ALTER TABLE "controle_financeiro" ADD COLUMN IF NOT EXISTS "abonado" BOOLEAN NOT NULL DEFAULT false;`);
    await _prisma.$executeRawUnsafe(`ALTER TABLE "controle_financeiro" ADD COLUMN IF NOT EXISTS "abonadoPor" TEXT;`);
    console.log('Migration abonado: OK');
  } catch (e) {
    console.error('Migration abonado erro:', e.message);
  }

  // ── Módulo de Lavagens/Serviços ──
  // Garante colunas Phase 2 na tabela lavagens (migração incremental)
  try {
    await _prisma.$executeRawUnsafe(`ALTER TABLE "lavagens" ADD COLUMN IF NOT EXISTS "tipoServicoId" TEXT;`);
    await _prisma.$executeRawUnsafe(`ALTER TABLE "lavagens" ALTER COLUMN "tipoCaminhaoId" DROP NOT NULL;`);
    console.log('Migration lavagens ALTER colunas: OK');
  } catch (e) { /* tabela pode não existir ainda — será criada abaixo */ }

  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "tipos_servico_lavagem" (
        "id" TEXT NOT NULL,
        "nome" TEXT NOT NULL,
        "requerTipoCaminhao" BOOLEAN NOT NULL DEFAULT false,
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "tipos_servico_lavagem_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "tipos_servico_lavagem_nome_key" UNIQUE ("nome")
      );
    `);
    console.log('Migration tipos_servico_lavagem: OK');
  } catch (e) { console.error('tipos_servico_lavagem erro:', e.message); }

  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "tipos_caminhao_lavagem" (
        "id" TEXT NOT NULL,
        "nome" TEXT NOT NULL,
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "tipos_caminhao_lavagem_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "tipos_caminhao_lavagem_nome_key" UNIQUE ("nome")
      );
    `);
    console.log('Migration tipos_caminhao_lavagem: OK');
  } catch (e) { console.error('tipos_caminhao_lavagem erro:', e.message); }

  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "fornecedores_lavagem" (
        "id" TEXT NOT NULL,
        "razaoSocial" TEXT NOT NULL,
        "cnpj" TEXT,
        "contato" TEXT,
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fornecedores_lavagem_pkey" PRIMARY KEY ("id")
      );
    `);
    console.log('Migration fornecedores_lavagem: OK');
  } catch (e) { console.error('fornecedores_lavagem erro:', e.message); }

  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "precos_fornecedor_servico" (
        "id" TEXT NOT NULL,
        "fornecedorId" TEXT NOT NULL,
        "tipoServicoId" TEXT NOT NULL,
        "tipoCaminhaoId" TEXT,
        "valor" DECIMAL(10,2) NOT NULL,
        CONSTRAINT "precos_fornecedor_servico_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "precos_forn_fk" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores_lavagem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "precos_servico_fk" FOREIGN KEY ("tipoServicoId") REFERENCES "tipos_servico_lavagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "precos_caminhao_fk" FOREIGN KEY ("tipoCaminhaoId") REFERENCES "tipos_caminhao_lavagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `);
    console.log('Migration precos_fornecedor_servico: OK');
  } catch (e) { console.error('precos_fornecedor_servico erro:', e.message); }

  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "lavagens" (
        "id" TEXT NOT NULL,
        "placa" TEXT NOT NULL,
        "frota" TEXT NOT NULL,
        "tipoServicoId" TEXT NOT NULL,
        "tipoCaminhaoId" TEXT,
        "fornecedorId" TEXT NOT NULL,
        "valor" DECIMAL(10,2) NOT NULL,
        "data" DATE NOT NULL,
        "observacao" TEXT,
        "usuarioId" TEXT NOT NULL,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "lavagens_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "lavagens_servico_fk" FOREIGN KEY ("tipoServicoId") REFERENCES "tipos_servico_lavagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "lavagens_caminhao_fk" FOREIGN KEY ("tipoCaminhaoId") REFERENCES "tipos_caminhao_lavagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "lavagens_fornecedor_fk" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores_lavagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "lavagens_usuario_fk" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `);
    console.log('Migration lavagens: OK');
  } catch (e) { console.error('lavagens erro:', e.message); }

  // ── Módulo de Médias de Consumo ──
  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "importacoes_consumo" (
        "id" TEXT NOT NULL,
        "nomeArquivo" TEXT NOT NULL,
        "totalRegistros" INTEGER NOT NULL,
        "periodoInicio" DATE,
        "periodoFim" DATE,
        "usuarioId" TEXT NOT NULL,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "importacoes_consumo_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "importacoes_consumo_usuario_fk" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT
      );
    `);
    console.log('Migration importacoes_consumo: OK');
  } catch (e) { console.error('importacoes_consumo erro:', e.message); }

  try {
    await _prisma.$executeRawUnsafe(`ALTER TABLE "importacoes_consumo" ADD COLUMN IF NOT EXISTS "frota" TEXT DEFAULT 'BAU';`);
    console.log('Migration importacoes_consumo frota: OK');
  } catch (e) { console.error('Migration importacoes_consumo frota erro:', e.message); }

  // Renomear frota 'Geral' para 'BAÚ' em registros existentes
  try {
    await _prisma.$executeRawUnsafe(`UPDATE "importacoes_consumo" SET "frota" = 'BAÚ' WHERE "frota" = 'Geral';`);
    console.log('Migration renomear frota Geral->BAÚ: OK');
  } catch (e) { console.error('Migration renomear frota erro:', e.message); }

  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "registros_consumo" (
        "id" TEXT NOT NULL,
        "importacaoId" TEXT NOT NULL,
        "data" DATE NOT NULL,
        "motorista" TEXT NOT NULL,
        "placa" TEXT,
        "modelo" TEXT,
        "conjunto" TEXT,
        "kmInicial" DECIMAL(12,2),
        "kmFinal" DECIMAL(12,2),
        "distancia" DECIMAL(12,2),
        "posto" TEXT,
        "cidade" TEXT,
        "uf" TEXT,
        "precoLitro" DECIMAL(10,4),
        "litros" DECIMAL(10,4),
        "produto" TEXT,
        "vlrTotal" DECIMAL(10,2),
        "mediaRealizada" DECIMAL(10,4),
        "mediaSugerida" DECIMAL(10,4),
        "percAtingido" TEXT,
        "gap" DECIMAL(10,4),
        CONSTRAINT "registros_consumo_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "registros_consumo_importacao_fk" FOREIGN KEY ("importacaoId") REFERENCES "importacoes_consumo"("id") ON DELETE CASCADE
      );
    `);
    console.log('Migration registros_consumo: OK');
  } catch (e) { console.error('registros_consumo erro:', e.message); }

  // ── Módulo de Levantamentos Por Motorista ──
  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "importacoes_levt_motoristas" (
        "id"          TEXT NOT NULL,
        "nomeArquivo" TEXT NOT NULL,
        "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "importacoes_levt_motoristas_pkey" PRIMARY KEY ("id")
      );
    `);
    console.log('Migration importacoes_levt_motoristas: OK');
  } catch (e) { console.error('importacoes_levt_motoristas erro:', e.message); }

  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "levt_motoristas" (
        "id"           TEXT NOT NULL,
        "importacaoId" TEXT NOT NULL,
        "motorista"    TEXT NOT NULL,
        "veiculo"      TEXT,
        "valor"        DECIMAL(10,2) NOT NULL,
        "mes"          TEXT NOT NULL,
        "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "levt_motoristas_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "levt_motoristas_importacaoId_fkey"
          FOREIGN KEY ("importacaoId")
          REFERENCES "importacoes_levt_motoristas"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    console.log('Migration levt_motoristas: OK');
  } catch (e) { console.error('levt_motoristas erro:', e.message); }

  try {
    await _prisma.$executeRawUnsafe(`ALTER TABLE "importacoes_levt_motoristas" ADD COLUMN IF NOT EXISTS "tipoPagamento" TEXT;`);
    console.log('Migration importacoes_levt_motoristas tipoPagamento: OK');
  } catch (e) { console.error('tipoPagamento levt erro:', e.message); }

  try {
    await _prisma.$executeRawUnsafe(`ALTER TABLE "importacoes_levt_motoristas" ADD COLUMN IF NOT EXISTS "frota" TEXT;`);
    console.log('Migration importacoes_levt_motoristas frota: OK');
  } catch (e) { console.error('frota levt erro:', e.message); }

  try {
    await _prisma.$executeRawUnsafe(`ALTER TABLE "importacoes_levt_motoristas" ADD COLUMN IF NOT EXISTS "titulo" TEXT;`);
    console.log('Migration importacoes_levt_motoristas titulo: OK');
  } catch (e) { console.error('titulo levt erro:', e.message); }

  try {
    await _prisma.$executeRawUnsafe(`ALTER TABLE "importacoes_levt_motoristas" ADD COLUMN IF NOT EXISTS "mesReferencia" TEXT;`);
    console.log('Migration importacoes_levt_motoristas mesReferencia: OK');
  } catch (e) { console.error('mesReferencia levt erro:', e.message); }

  // ── Frota Apoio ──
  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "frota_apoio" (
        "id"          TEXT NOT NULL,
        "data"        DATE NOT NULL,
        "hora"        TEXT,
        "motorista"   TEXT NOT NULL,
        "placa"       TEXT NOT NULL,
        "modelo"      TEXT,
        "kmInicial"   DECIMAL(12,2),
        "kmFinal"     DECIMAL(12,2),
        "distancia"   DECIMAL(12,2),
        "documento"   TEXT,
        "posto"       TEXT,
        "cidade"      TEXT,
        "uf"          TEXT,
        "precoLitro"  DECIMAL(10,4),
        "litros"      DECIMAL(10,4),
        "produto"     TEXT DEFAULT 'GASOLINA',
        "valor"       DECIMAL(10,2),
        "centroCusto" TEXT,
        "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "frota_apoio_pkey" PRIMARY KEY ("id")
      );
    `);
    console.log('Migration frota_apoio: OK');
  } catch (e) { console.error('frota_apoio erro:', e.message); }

  try {
    await _prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "veiculos_apoio" (
        "id"       TEXT NOT NULL,
        "placa"    TEXT NOT NULL,
        "modelo"   TEXT,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "veiculos_apoio_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "veiculos_apoio_placa_key" UNIQUE ("placa")
      );
    `);
    console.log('Migration veiculos_apoio: OK');
  } catch (e) { console.error('veiculos_apoio erro:', e.message); }
}
runMigrations();

const app = express();

app.use(helmet());

const ORIGENS_PERMITIDAS = [
  'https://gestao-motoristas-frontend.vercel.app',
  'https://gestao-motoristas-frontend-lemon.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];
app.use(cors({
  origin: function(origin, callback) {
    // permite requests sem origin (mobile apps, curl, Postman em dev)
    // e qualquer preview deploy da Vercel do mesmo projeto
    if (!origin) return callback(null, true);
    if (ORIGENS_PERMITIDAS.includes(origin)) return callback(null, true);
    if (/^https:\/\/gestao-motoristas.*\.vercel\.app$/.test(origin)) return callback(null, true);
    callback(new Error('CORS: origem não permitida'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisicoes. Aguarde alguns minutos.' },
});
app.use(limiter);

app.use('/api/auth',         require('./routes/auth'));
app.use('/api/usuarios',     require('./routes/usuarios'));
app.use('/api/motoristas',   require('./routes/motoristas'));
app.use('/api/solicitacoes', require('./routes/solicitacoes'));
app.use('/api/exclusoes',    require('./routes/exclusoes'));
app.use('/api/folgas',       require('./routes/folgas'));
app.use('/api/ferias',       require('./routes/ferias'));
app.use('/api/agendamentos', require('./routes/agendamentos'));
app.use('/api/financeiro',   require('./routes/financeiro'));
app.use('/api/tipos',        require('./routes/tipos'));
app.use('/api/notificacoes', require('./routes/notificacoes'));
app.use('/api/notas-abastecimento',        require('./routes/notasAbastecimento'));
app.use('/api/fornecedores-abastecimento', require('./routes/fornecedoresAbastecimento'));
app.use('/api/faturas-abastecimento',      require('./routes/faturasAbastecimento'));
app.use('/api/vales-fixos',  require('./routes/valesFixos'));
app.use('/api/levantamentos', require('./routes/levantamentos'));
app.use('/api/levantamentos-motoristas', require('./routes/levantamentosMotoristas'));
app.use('/api/levantamentos-folgas',    require('./routes/levantamentosFolgas'));
app.use('/api/tipos-servico-lavagem',  require('./routes/tiposServicoLavagem'));
app.use('/api/tipos-caminhao-lavagem', require('./routes/tiposCaminhaoLavagem'));
app.use('/api/fornecedores-lavagem',   require('./routes/fornecedoresLavagem'));
app.use('/api/lavagens',               require('./routes/lavagens'));
app.use('/api/medias-consumo',         require('./routes/mediasConsumo'));
app.use('/api/frota-apoio',            require('./routes/frotaApoio'));
app.use('/api/nome-aliases',           require('./routes/nomeAliases'));
app.use('/api/fechamentos',            require('./routes/fechamentos'));
app.use('/api/backup',                 require('./routes/backup'));
app.use('/api/postos-bid',             require('./routes/postosBid'));
app.use('/api/trr',                    require('./routes/trr'));

app.get('/health', function(req, res) { res.json({ ok: true }); });

app.use(function(req, res) { res.status(404).json({ error: 'Rota nao encontrada' }); });

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Servidor rodando na porta ' + PORT);

  // Backup automático todo dia às 03:00 (horário do servidor)
  cron.schedule('0 3 * * *', () => {
    console.log('Iniciando backup automático diário...');
    enviarBackupEmail().catch(e => console.error('Backup automático falhou:', e.message));
  });
});
