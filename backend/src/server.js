require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');

const _prisma = new PrismaClient();
async function runMigrations() {
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
}
runMigrations();

const app = express();

app.use(helmet());

app.use(cors({ origin: true, credentials: true }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
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
app.use('/api/vales-fixos',  require('./routes/valesFixos'));
app.use('/api/levantamentos', require('./routes/levantamentos'));

app.get('/health', function(req, res) { res.json({ ok: true }); });

app.use(function(req, res) { res.status(404).json({ error: 'Rota nao encontrada' }); });

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Servidor rodando na porta ' + PORT); });
