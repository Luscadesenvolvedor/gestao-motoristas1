// backend/src/routes/agendamentos.js
const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');
const router = express.Router();

router.use(autenticar, autorizar('agendamentos', 'leitura'));

// GET /api/agendamentos
router.get('/', async (req, res) => {
  try {
    const { perfil, mes } = req.query;
    const where = {};

    if (req.usuario.papel === 'guiche') {
      where.perfil = req.usuario.perfilAgendamento;
    } else if (perfil) {
      where.perfil = parseInt(perfil);
    }

    if (mes) {
      const [ano, m] = mes.split('-');
      where.dataHora = { gte: new Date(ano, m - 1, 1), lt: new Date(ano, m, 1) };
    }

    const agendamentos = await prisma.agendamento.findMany({
      where,
      include: { motorista: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' }
    });
    res.json(agendamentos);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  }
});

// POST /api/agendamentos
router.post('/', autorizar('agendamentos', 'escrita'), async (req, res) => {
  try {
    const perfil = req.usuario.papel === 'guiche'
      ? req.usuario.perfilAgendamento
      : req.body.perfil;

    const { motoristaId, dataHora, meses } = req.body;

    const ag = await prisma.agendamento.create({
      data: {
        motoristaId,
        perfil: parseInt(perfil),
        dataHora: new Date(dataHora),
        mesesAcerto: meses ? meses.length : 1,
        mesesSelecionados: meses ?? []
      }
    });

    await registrarAuditoria({ usuarioId: req.usuario.id, acao: 'criou', tabela: 'agendamentos', registroId: ag.id, dadosNovos: req.body, extra: { agendamentoId: ag.id } });
    res.status(201).json(ag);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// DELETE /api/agendamentos/:id
router.delete('/:id', autorizar('agendamentos', 'escrita'), async (req, res) => {
  try {
    const antes = await prisma.agendamento.findUnique({ where: { id: req.params.id } });
    // Preserva o histórico: desvincula os logs em vez de apagá-los
    await prisma.auditoria.updateMany({ where: { agendamentoId: req.params.id }, data: { agendamentoId: null } });
    await prisma.agendamento.delete({ where: { id: req.params.id } });
    if (antes) await registrarAuditoria({ usuarioId: req.usuario.id, acao: 'excluiu', tabela: 'agendamentos', registroId: req.params.id, dadosAntigos: JSON.parse(JSON.stringify(antes)), extra: antes.motoristaId ? { motoristaId: antes.motoristaId } : {} });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao remover agendamento' });
  }
});

module.exports = router;