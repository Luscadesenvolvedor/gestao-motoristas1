import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const inp = { width:'100%', padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' };
const lbl = { fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 };
const fmt = v => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits:2 })}`;

export default function FornecedoresLavagem() {
  const [tiposServico,   setTiposServico]   = useState([]);
  const [partesCaminhao, setPartesCaminhao] = useState([]);
  const [fornecedores,   setFornecedores]   = useState([]);
  const [loading,        setLoading]        = useState(true);

  // Tipo de serviço
  const [novoServico,       setNovoServico]       = useState('');
  const [novoServicoRequer, setNovoServicoRequer] = useState(false);
  const [salvandoServico,   setSalvandoServico]   = useState(false);

  // Parte do caminhão
  const [novaParte,     setNovaParte]     = useState('');
  const [salvandoParte, setSalvandoParte] = useState(false);

  // Modal fornecedor
  const [showModal, setShowModal] = useState(false);
  const [editando,  setEditando]  = useState(null);
  const [forn,      setForn]      = useState({ razaoSocial:'', cnpj:'', contato:'' });
  const [precos,    setPrecos]    = useState([]);
  const [salvando,  setSalvando]  = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [rs, rc, rf] = await Promise.all([
        api.get('/tipos-servico-lavagem'),
        api.get('/tipos-caminhao-lavagem'),
        api.get('/fornecedores-lavagem'),
      ]);
      setTiposServico(rs.data);
      setPartesCaminhao(rc.data);
      setFornecedores(rf.data);
    } catch { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  }

  // ── Tipos de serviço ──
  async function adicionarServico(e) {
    e.preventDefault();
    if (!novoServico.trim()) return;
    setSalvandoServico(true);
    try {
      const { data } = await api.post('/tipos-servico-lavagem', {
        nome: novoServico.trim(), requerTipoCaminhao: novoServicoRequer,
      });
      setTiposServico(p => [...p, data].sort((a,b) => a.nome.localeCompare(b.nome)));
      setNovoServico(''); setNovoServicoRequer(false);
      toast.success('Tipo de serviço adicionado');
    } catch (err) { toast.error(err?.response?.data?.error || 'Erro ao adicionar'); }
    finally { setSalvandoServico(false); }
  }

  async function removerServico(id) {
    if (!confirm('Remover este tipo de serviço?')) return;
    try {
      await api.delete(`/tipos-servico-lavagem/${id}`);
      setTiposServico(p => p.filter(t => t.id !== id));
      toast.success('Removido');
    } catch { toast.error('Erro ao remover'); }
  }

  // ── Partes do caminhão ──
  async function adicionarParte(e) {
    e.preventDefault();
    if (!novaParte.trim()) return;
    setSalvandoParte(true);
    try {
      const { data } = await api.post('/tipos-caminhao-lavagem', { nome: novaParte.trim() });
      setPartesCaminhao(p => [...p, data].sort((a,b) => a.nome.localeCompare(b.nome)));
      setNovaParte('');
      toast.success('Parte adicionada');
    } catch (err) { toast.error(err?.response?.data?.error || 'Erro ao adicionar'); }
    finally { setSalvandoParte(false); }
  }

  async function removerParte(id) {
    if (!confirm('Remover esta parte?')) return;
    try {
      await api.delete(`/tipos-caminhao-lavagem/${id}`);
      setPartesCaminhao(p => p.filter(t => t.id !== id));
      toast.success('Removido');
    } catch { toast.error('Erro ao remover'); }
  }

  // ── Fornecedores ──
  function construirPrecos(existentes) {
    const linhas = [];
    for (const ts of tiposServico) {
      if (ts.requerTipoCaminhao) {
        for (const pc of partesCaminhao) {
          const ex = existentes.find(p => p.tipoServicoId === ts.id && p.tipoCaminhaoId === pc.id);
          linhas.push({ tipoServicoId: ts.id, tipoCaminhaoId: pc.id, valor: ex ? String(Number(ex.valor)) : '' });
        }
      } else {
        const ex = existentes.find(p => p.tipoServicoId === ts.id && !p.tipoCaminhaoId);
        linhas.push({ tipoServicoId: ts.id, tipoCaminhaoId: null, valor: ex ? String(Number(ex.valor)) : '' });
      }
    }
    return linhas;
  }

  function abrirNovo() {
    setEditando(null);
    setForn({ razaoSocial:'', cnpj:'', contato:'' });
    setPrecos(construirPrecos([]));
    setShowModal(true);
  }

  function abrirEditar(f) {
    setEditando(f.id);
    setForn({ razaoSocial: f.razaoSocial, cnpj: f.cnpj||'', contato: f.contato||'' });
    setPrecos(construirPrecos(f.precos));
    setShowModal(true);
  }

  function setPrecoValor(tipoServicoId, tipoCaminhaoId, valor) {
    setPrecos(p => p.map(r =>
      r.tipoServicoId === tipoServicoId && r.tipoCaminhaoId === tipoCaminhaoId ? { ...r, valor } : r
    ));
  }

  async function salvar(e) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    const payload = {
      ...forn,
      precos: precos
        .filter(p => p.valor !== '' && p.valor != null)
        .map(p => ({
          tipoServicoId:  p.tipoServicoId,
          tipoCaminhaoId: p.tipoCaminhaoId || null,
          valor: parseFloat(String(p.valor).replace(',', '.')),
        })),
    };
    try {
      if (editando) {
        const { data } = await api.put(`/fornecedores-lavagem/${editando}`, payload);
        setFornecedores(p => p.map(f => f.id === editando ? data : f));
        toast.success('Fornecedor atualizado');
      } else {
        const { data } = await api.post('/fornecedores-lavagem', payload);
        setFornecedores(p => [...p, data].sort((a,b) => a.razaoSocial.localeCompare(b.razaoSocial)));
        toast.success('Fornecedor cadastrado');
      }
      setShowModal(false);
    } catch (err) { toast.error(err?.response?.data?.error || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  async function excluir(id) {
    if (!confirm('Excluir este fornecedor?')) return;
    try {
      await api.delete(`/fornecedores-lavagem/${id}`);
      setFornecedores(p => p.filter(f => f.id !== id));
      toast.success('Removido');
    } catch { toast.error('Erro ao excluir'); }
  }

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:20, fontWeight:600, color:'#1a1a2e', margin:0 }}>Fornecedores de Serviços</h2>
        <p style={{ fontSize:13, color:'#6b7280', marginTop:2 }}>Cadastre os tipos de serviço, partes do caminhão e fornecedores com preços</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'270px 1fr', gap:20, alignItems:'start' }}>

        {/* ── Coluna esquerda ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Tipos de serviço */}
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:16 }}>
            <h3 style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', margin:'0 0 12px', display:'flex', alignItems:'center', gap:6 }}>
              <i className="ti ti-tools" style={{ color:'#EB3238' }}></i> Tipos de Serviço
            </h3>
            <form onSubmit={adicionarServico} style={{ marginBottom:10 }}>
              <input value={novoServico} onChange={e => setNovoServico(e.target.value)}
                placeholder="Ex: Lavagem, Lubrificação..." style={{ ...inp, marginBottom:8 }} />
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#374151', marginBottom:8, cursor:'pointer' }}>
                <input type="checkbox" checked={novoServicoRequer} onChange={e => setNovoServicoRequer(e.target.checked)} />
                Preço varia por parte do caminhão
              </label>
              <button type="submit" disabled={salvandoServico}
                style={{ width:'100%', padding:'7px', background:'#EB3238', color:'#fff', border:'none', borderRadius:8, fontSize:12, cursor:'pointer', fontWeight:500 }}>
                + Adicionar
              </button>
            </form>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {tiposServico.length === 0 && <p style={{ fontSize:12, color:'#9ca3af', textAlign:'center' }}>Nenhum serviço</p>}
              {tiposServico.map(t => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px', background:'#f8fafc', borderRadius:7, border:'1px solid #e5e7eb' }}>
                  <div>
                    <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{t.nome}</span>
                    {t.requerTipoCaminhao && <span style={{ fontSize:10, color:'#7c3aed', marginLeft:6 }}>por parte</span>}
                  </div>
                  <button onClick={() => removerServico(t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontSize:13 }}>
                    <i className="ti ti-trash"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Partes do caminhão */}
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:16 }}>
            <h3 style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', margin:'0 0 6px', display:'flex', alignItems:'center', gap:6 }}>
              <i className="ti ti-car" style={{ color:'#EB3238' }}></i> Partes do Caminhão
            </h3>
            <p style={{ fontSize:11, color:'#9ca3af', marginBottom:10 }}>Para serviços com preço por parte (ex: Cabine, Baú, Completo)</p>
            <form onSubmit={adicionarParte} style={{ display:'flex', gap:6, marginBottom:10 }}>
              <input value={novaParte} onChange={e => setNovaParte(e.target.value)}
                placeholder="Ex: Cabine, Baú..." style={{ ...inp, flex:1 }} />
              <button type="submit" disabled={salvandoParte}
                style={{ padding:'9px 12px', background:'#EB3238', color:'#fff', border:'none', borderRadius:8, fontSize:13, cursor:'pointer' }}>
                <i className="ti ti-plus"></i>
              </button>
            </form>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {partesCaminhao.length === 0 && <p style={{ fontSize:12, color:'#9ca3af', textAlign:'center' }}>Nenhuma parte</p>}
              {partesCaminhao.map(t => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px', background:'#f8fafc', borderRadius:7, border:'1px solid #e5e7eb' }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{t.nome}</span>
                  <button onClick={() => removerParte(t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontSize:13 }}>
                    <i className="ti ti-trash"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Coluna direita: fornecedores ── */}
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button onClick={abrirNovo}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 20px', background:'#EB3238', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:500, cursor:'pointer' }}>
              <i className="ti ti-plus"></i> Novo Fornecedor
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>Carregando...</div>
          ) : fornecedores.length === 0 ? (
            <div style={{ textAlign:'center', padding:60, color:'#9ca3af', background:'#fff', borderRadius:12, border:'1px solid #e5e7eb' }}>
              <i className="ti ti-building-store" style={{ fontSize:40, display:'block', marginBottom:8 }}></i>
              Nenhum fornecedor cadastrado.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {fornecedores.map(f => {
                // Agrupa preços por serviço
                const grupos = {};
                for (const p of f.precos) {
                  const k = p.tipoServicoId;
                  if (!grupos[k]) grupos[k] = { nome: p.tipoServico?.nome, itens: [] };
                  grupos[k].itens.push(p);
                }
                return (
                  <div key={f.id} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'16px 18px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:600, color:'#1a1a2e' }}>{f.razaoSocial}</div>
                        {(f.cnpj || f.contato) && (
                          <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>
                            {f.cnpj && <span>CNPJ: {f.cnpj}</span>}
                            {f.cnpj && f.contato && <span> · </span>}
                            {f.contato && <span>{f.contato}</span>}
                          </div>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => abrirEditar(f)}
                          style={{ padding:'5px 10px', border:'1px solid #dbeafe', borderRadius:6, background:'#eff6ff', fontSize:12, cursor:'pointer', color:'#1d4ed8' }}>
                          <i className="ti ti-pencil"></i>
                        </button>
                        <button onClick={() => excluir(f.id)}
                          style={{ padding:'5px 10px', border:'1px solid #fee2e2', borderRadius:6, background:'#fff5f5', fontSize:12, cursor:'pointer', color:'#dc2626' }}>
                          <i className="ti ti-trash"></i>
                        </button>
                      </div>
                    </div>
                    {Object.values(grupos).length === 0 ? (
                      <p style={{ fontSize:12, color:'#9ca3af', margin:0 }}>Sem preços cadastrados</p>
                    ) : (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                        {Object.values(grupos).map((g, gi) => (
                          <div key={gi} style={{ background:'#f8fafc', borderRadius:8, padding:'8px 12px', border:'1px solid #e5e7eb', minWidth:160 }}>
                            <div style={{ fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:6 }}>{g.nome}</div>
                            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                              {g.itens.map((p, pi) => (
                                <div key={pi} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                                  {p.tipoCaminhao && <span style={{ fontSize:11, color:'#6b7280' }}>{p.tipoCaminhao.nome}</span>}
                                  <span style={{ fontSize:13, fontWeight:600, color:'#16a34a', marginLeft:'auto' }}>{fmt(p.valor)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══ Modal Fornecedor ══ */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 12px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'22px 28px 0', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ fontSize:16, fontWeight:700, margin:0, color:'#1a1a2e' }}>
                {editando ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', fontSize:24, cursor:'pointer', color:'#9ca3af' }}>×</button>
            </div>

            <form onSubmit={salvar} style={{ padding:'0 28px 28px' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

                {/* Dados do fornecedor */}
                <div>
                  <label style={lbl}>Razão Social *</label>
                  <input value={forn.razaoSocial} onChange={e => setForn(s=>({...s,razaoSocial:e.target.value}))}
                    style={inp} required placeholder="Nome da empresa" />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div>
                    <label style={lbl}>CNPJ</label>
                    <input value={forn.cnpj} onChange={e => setForn(s=>({...s,cnpj:e.target.value}))}
                      style={inp} placeholder="Opcional" />
                  </div>
                  <div>
                    <label style={lbl}>Contato</label>
                    <input value={forn.contato} onChange={e => setForn(s=>({...s,contato:e.target.value}))}
                      style={inp} placeholder="Tel. ou e-mail" />
                  </div>
                </div>

                {/* Tabela de preços */}
                {tiposServico.length === 0 ? (
                  <div style={{ padding:12, background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, fontSize:12, color:'#92400e' }}>
                    <i className="ti ti-alert-triangle" style={{ marginRight:6 }}></i>
                    Cadastre os tipos de serviço primeiro (coluna esquerda).
                  </div>
                ) : (
                  <div>
                    <label style={{ ...lbl, marginBottom:12 }}>Valores dos Serviços (R$)</label>
                    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                      {tiposServico.map(ts => {
                        const linhas = precos.filter(p => p.tipoServicoId === ts.id);
                        return (
                          <div key={ts.id} style={{ background:'#f8fafc', borderRadius:10, padding:'12px 14px', border:'1px solid #e5e7eb' }}>
                            <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                              <i className="ti ti-tools" style={{ fontSize:13, color:'#EB3238' }}></i>
                              {ts.nome}
                              <span style={{ fontSize:10, color: ts.requerTipoCaminhao ? '#7c3aed' : '#16a34a', fontWeight:400 }}>
                                · {ts.requerTipoCaminhao ? 'preço por parte do caminhão' : 'preço único'}
                              </span>
                            </div>

                            {ts.requerTipoCaminhao ? (
                              partesCaminhao.length === 0 ? (
                                <p style={{ fontSize:11, color:'#9ca3af', margin:0 }}>Cadastre partes do caminhão primeiro.</p>
                              ) : (
                                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px,1fr))', gap:8 }}>
                                  {partesCaminhao.map(pc => {
                                    const linha = linhas.find(l => l.tipoCaminhaoId === pc.id);
                                    return (
                                      <div key={pc.id}>
                                        <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>{pc.nome}</label>
                                        <input type="text" inputMode="decimal"
                                          value={linha?.valor ?? ''}
                                          onChange={e => setPrecoValor(ts.id, pc.id, e.target.value)}
                                          placeholder="0,00" style={inp} />
                                      </div>
                                    );
                                  })}
                                </div>
                              )
                            ) : (
                              <div style={{ maxWidth:200 }}>
                                <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>Valor</label>
                                <input type="text" inputMode="decimal"
                                  value={linhas[0]?.valor ?? ''}
                                  onChange={e => setPrecoValor(ts.id, null, e.target.value)}
                                  placeholder="0,00" style={inp} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p style={{ fontSize:11, color:'#9ca3af', marginTop:8 }}>Deixe em branco os serviços que o fornecedor não realiza.</p>
                  </div>
                )}
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
                <button type="button" onClick={() => setShowModal(false)}
                  style={{ padding:'9px 20px', border:'1px solid #d1d5db', borderRadius:8, background:'#fff', fontSize:13, cursor:'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={salvando}
                  style={{ padding:'9px 24px', border:'none', borderRadius:8, background:'#EB3238', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
