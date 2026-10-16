// backend/src/middleware/registroAutomatico.js
// Grava na auditoria toda ação de escrita (POST/PUT/PATCH/DELETE) que deu certo e que a
// própria rota não registrou. Guarda só um resumo do que foi enviado, para não pesar na memória
// nem no banco (sem senhas, arquivos ou listas grandes).
const { AsyncLocalStorage } = require('async_hooks');
const prisma = require('../lib/prisma');

const contexto = new AsyncLocalStorage();

// Chamado pelo registrarAuditoria: marca que esta requisição já tem log detalhado
function marcarRegistrado() {
  const store = contexto.getStore();
  if (store) store.registrado = true;
}

// Rotas que não alteram dados ou já têm registro próprio
const IGNORAR = [
  /^\/api\/auth\//,
  /^\/api\/logs\//,
  /^\/api\/notificacoes\b/,
  /^\/api\/fechamentos\/parsear\b/,
  /^\/api\/postos-bid\/parse-coords\b/,
];

const CHAVE_SENSIVEL = /senha|password|token|secret|base64|arquivo/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resumir(valor, nivel = 0) {
  if (valor === null || valor === undefined) return valor;
  if (typeof valor === 'string') return valor.length > 300 ? valor.slice(0, 300) + `… (${valor.length} caracteres)` : valor;
  if (typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) {
    if (valor.length > 20 || nivel >= 2) return `[lista com ${valor.length} itens]`;
    return valor.map(v => resumir(v, nivel + 1));
  }
  if (nivel >= 3) return '[objeto]';
  const out = {};
  for (const k of Object.keys(valor).slice(0, 40)) {
    out[k] = CHAVE_SENSIVEL.test(k) ? '[omitido]' : resumir(valor[k], nivel + 1);
  }
  return out;
}

function acaoPorMetodo(metodo) {
  if (metodo === 'POST') return 'criou';
  if (metodo === 'DELETE') return 'excluiu';
  return 'editou';
}

function registroAutomatico(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const caminho = req.originalUrl.split('?')[0];
  if (IGNORAR.some(r => r.test(caminho))) return next();

  // Captura o id devolvido em criações (res.json({ id, ... }))
  let idResposta = null;
  const jsonOriginal = res.json.bind(res);
  res.json = (corpo) => {
    if (corpo && typeof corpo === 'object' && !Array.isArray(corpo) && typeof corpo.id === 'string') idResposta = corpo.id;
    return jsonOriginal(corpo);
  };

  const store = { registrado: false };
  res.on('finish', () => {
    if (store.registrado || res.statusCode >= 400 || !req.usuario) return;
    const partes = caminho.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    const tabela = partes[0] || 'api';
    const registroId = partes.find(p => UUID.test(p)) || idResposta || '-';
    const dadosNovos = { _requisicao: `${req.method} ${caminho}` };
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) Object.assign(dadosNovos, resumir(req.body));
    if (req.file) dadosNovos._arquivo = req.file.originalname;
    if (Array.isArray(req.files)) dadosNovos._arquivos = req.files.map(f => f.originalname).slice(0, 20);
    prisma.auditoria.create({
      data: { usuarioId: req.usuario.id, acao: acaoPorMetodo(req.method), tabela, registroId: String(registroId).slice(0, 100), dadosNovos },
    }).catch(err => console.error('Erro no registro automático:', err.message));
  });

  contexto.run(store, next);
}

module.exports = { registroAutomatico, marcarRegistrado };
