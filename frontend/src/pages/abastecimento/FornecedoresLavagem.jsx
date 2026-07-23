import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const inp = { width:'100%', padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' };
const lbl = { fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 };

const vazioForn = { razaoSocial:'', cnpj:'', contato:'' };

export default function FornecedoresLavagem() {
  const [tipos,        setTipos]        = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [loading,      setLoading]      = useState(true);

  // Modal tipos
  const [novoTipo,    setNovoTipo]    = useState('');
  const [salvandoTipo, setSalvandoTipo] = useState(false);

  // Modal fornecedor
  const [showModal,  setShowModal]  = useState(false);
  const [editando,   setEditando]   = useState(null); // null = novo
  const [forn,       setForn]       = useState(vazioForn);
  const [precos,     setPrecos]     = useState({}); // { tipoCaminhaoId: valor }
  const [salvando,   setSalvando]   = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [rt, rf] = await Promise.all([
        api.get('/tipos-caminhao-lavagem'),
        api.get('/fornecedores-lavagem'),
      ]);
      setTipos(rt.data);
      setFornecedores(rf.data);
    } catch { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  }

  // ── Tipos de caminhão ──
  async function adicionarTipo(e) {
    e.preventDefault();
    if (!novoTipo.trim()) return;
    setSalvandoTipo(true);
    try {
      const { data } = await api.post('/tipos-caminhao-lavagem', { nome: novoTipo.trim() });
      setTipos(prev => [...prev, data].sort((a,b) => a.nome.localeCompare(b.nome)));
      setNovoTipo('');
      toast.success('Tipo adicionado');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Erro ao adicionar tipo');
    } finally { setSalvandoTipo(false); }
  }

  async function removerTipo(id) {
    if (!confirm('Remover este tipo?')) return;
    try {
      await api.delete(`/tipos-caminhao-lavagem/${id}`);
      setTipos(prev => prev.filter(t => t.id !== id));
      toast.success('Tipo removido');
    } catch { toast.error('Erro ao remover tipo'); }
  }

  // ── Fornecedores ──
  function abrirNovo() {
    setEditando(null);
    setForn(vazioForn);
    // Inicializa precos vazios para todos os tipos
    const pc = {};
    tipos.forEach(t => { pc[t.id] = ''; });
    setPrecos(pc);
    setShowModal(true);
  }

  function abrirEditar(f) {
    setEditando(f.id);
    setForn({ razaoSocial: f.razaoSocial, cnpj: f.cnpj || '', contato: f.contato || '' });
    const pc = {};
    tipos.forEach(t => { pc[t.id] = ''; });
    f.precos.forEach(p => { pc[p.tipoCaminhaoId] = String(Number(p.valor)); });
    setPrecos(pc);
    setShowModal(true);
  }

  async function salvar(e) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    const payload = {
      ...forn,
      precos: tipos
        .filter(t => precos[t.id] !== '' && precos[t.id] !== null && precos[t.id] !== undefined)
        .map(t => ({ tipoCaminhaoId: t.id, valor: parseFloat(String(precos[t.id]).replace(',', '.')) })),
    };
    try {
      if (editando) {
        const { data } = await api.put(`/fornecedores-lavagem/${editando}`, payload);
        setFornecedores(prev => prev.map(f => f.id === editando ? data : f));
        toast.success('Fornecedor atualizado');
      } else {
        const { data } = await api.post('/fornecedores-lavagem', payload);
        setFornecedores(prev => [...prev, data].sort((a,b) => a.razaoSocial.localeCompare(b.razaoSocial)));
        toast.success('Fornecedor cadastrado');
      }
      setShowModal(false);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Erro ao salvar fornecedor');
    } finally { setSalvando(false); }
  }

  async function excluir(id) {
    if (!confirm('Excluir este fornecedor?')) return;
    try {
      await api.delete(`/fornecedores-lavagem/${id}`);
      setFornecedores(prev => prev.filter(f => f.id !== id));
      toast.success('Fornecedor removido');
    } catch { toast.error('Erro ao excluir'); }
  }

  const fmt = v => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits:2 })}`;

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:20, fontWeight:600, color:'#1a1a2e', margin:0 }}>Fornecedores de Lavagem</h2>
        <p style={{ fontSize:13, color:'#6b7280', marginTop:2 }}>Cadastre tipos de caminhão e fornecedores com tabela de preços</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:20, alignItems:'start' }}>

        {/* ── Coluna esquerda: Tipos de caminhão ── */}
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:20 }}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#1a1a2e', margin:'0 0 14px' }}>
            <i className="ti ti-truck" style={{ marginRight:6, color:'#EB3238' }}></i>
            Tipos de Caminhão
          </h3>

          <form onSubmit={adicionarTipo} style={{ display:'flex', gap:8, marginBottom:14 }}>
            <input
              value={novoTipo}
              onChange={e => setNovoTipo(e.target.value)}
              placeholder="Ex: Truck, Toco, Van..."
              style={{ ...inp, flex:1 }}
            />
            <button type="submit" disabled={salvandoTipo}
              style={{ padding:'9px 14px', background:'#EB3238', color:'#fff', border:'none', borderRadius:8, fontSize:13, cursor:'pointer', flexShrink:0 }}>
              <i className="ti ti-plus"></i>
            </button>
          </form>

          {loading ? (
            <p style={{ fontSize:12, color:'#9ca3af' }}>Carregando...</p>
          ) : tipos.length === 0 ? (
            <p style={{ fontSize:12, color:'#9ca3af', textAlign:'center', padding:'16px 0' }}>Nenhum tipo cadastrado</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {tipos.map(t => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'#f8fafc', borderRadius:8, border:'1px solid #e5e7eb' }}>
                  <span style={{ fontSize:13, fontWeight:500, color:'#374151' }}>{t.nome}</span>
                  <button onClick={() => removerTipo(t.id)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontSize:14, padding:'2px 4px' }}>
                    <i className="ti ti-trash"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Coluna direita: Fornecedores ── */}
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button onClick={abrirNovo}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 20px', background:'#EB3238', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:500, cursor:'pointer' }}>
              <i className="ti ti-plus" style={{ fontSize:16 }}></i> Novo Fornecedor
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>Carregando...</div>
          ) : fornecedores.length === 0 ? (
            <div style={{ textAlign:'center', padding:60, color:'#9ca3af', background:'#fff', borderRadius:12, border:'1px solid #e5e7eb' }}>
              <i className="ti ti-building-store" style={{ fontSize:40, display:'block', marginBottom:8 }}></i>
              Nenhum fornecedor. Clique em "Novo Fornecedor".
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {fornecedores.map(f => (
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

                  {/* Tabela de preços */}
                  {f.precos.length === 0 ? (
                    <p style={{ fontSize:12, color:'#9ca3af', margin:0 }}>Nenhum preço cadastrado</p>
                  ) : (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                      {f.precos.map(p => (
                        <span key={p.id} style={{ padding:'4px 12px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:20, fontSize:12, color:'#166534', fontWeight:500 }}>
                          {p.tipoCaminhao.nome}: {fmt(p.valor)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ Modal Fornecedor ══ */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 12px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'22px 28px 0', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ fontSize:16, fontWeight:700, margin:0, color:'#1a1a2e' }}>
                {editando ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', fontSize:24, cursor:'pointer', color:'#9ca3af' }}>×</button>
            </div>

            <form onSubmit={salvar} style={{ padding:'0 28px 28px' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <label style={lbl}>Razão Social *</label>
                  <input value={forn.razaoSocial} onChange={e => setForn(s=>({...s,razaoSocial:e.target.value}))} style={inp} required placeholder="Nome da empresa" />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div>
                    <label style={lbl}>CNPJ</label>
                    <input value={forn.cnpj} onChange={e => setForn(s=>({...s,cnpj:e.target.value}))} style={inp} placeholder="00.000.000/0000-00" />
                  </div>
                  <div>
                    <label style={lbl}>Contato</label>
                    <input value={forn.contato} onChange={e => setForn(s=>({...s,contato:e.target.value}))} style={inp} placeholder="Telefone ou e-mail" />
                  </div>
                </div>

                {/* Tabela de preços por tipo */}
                {tipos.length > 0 && (
                  <div>
                    <label style={{ ...lbl, marginBottom:10 }}>Preços por Tipo de Caminhão (R$)</label>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {tipos.map(t => (
                        <div key={t.id} style={{ display:'flex', alignItems:'center', gap:12 }}>
                          <span style={{ flex:1, fontSize:13, color:'#374151', fontWeight:500 }}>{t.nome}</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={precos[t.id] ?? ''}
                            onChange={e => setPrecos(p => ({...p, [t.id]: e.target.value}))}
                            placeholder="0,00"
                            style={{ ...inp, width:120 }}
                          />
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize:11, color:'#9ca3af', marginTop:6 }}>Deixe em branco os tipos que este fornecedor não atende.</p>
                  </div>
                )}

                {tipos.length === 0 && (
                  <div style={{ padding:'12px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, fontSize:12, color:'#92400e' }}>
                    <i className="ti ti-alert-triangle" style={{ marginRight:6 }}></i>
                    Cadastre tipos de caminhão primeiro para definir os preços.
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
