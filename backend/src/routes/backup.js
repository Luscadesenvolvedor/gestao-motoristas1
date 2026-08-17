const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar } = require('../middleware/auth');
const { enviarBackupEmail, gerarDadosBackup, serializarBigInt } = require('../services/backupEmail');
const router = express.Router();

// Apenas admins podem acessar
router.use(autenticar, (req, res, next) => {
  if (req.usuario.papel !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem gerar backup' });
  }
  next();
});

// GET /api/backup — gera JSON com todas as tabelas para download
router.get('/', async (req, res) => {
  try {
    const dados = await gerarDadosBackup();
    const serializado = serializarBigInt(dados);
    const dataHoje = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${dataHoje}.json"`);
    res.json(serializado);
  } catch (err) {
    console.error('Erro ao gerar backup:', err);
    res.status(500).json({ error: 'Erro ao gerar backup', detail: err.message });
  }
});

// POST /api/backup/enviar-email — dispara o backup por e-mail na hora
router.post('/enviar-email', async (req, res) => {
  try {
    await enviarBackupEmail();
    res.json({ ok: true, mensagem: `Backup enviado para ${process.env.BACKUP_EMAIL_DESTINO}` });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar backup', detail: err.message });
  }
});

module.exports = router;
