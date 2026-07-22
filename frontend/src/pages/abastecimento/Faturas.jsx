import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const fmt = v => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtData = d => d ? new Date(d.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const hoje = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const emDias = d => d ? Math.ceil((new Date(d.slice(0,10) + 'T12:00:00') - hoje()) / 86400000) : null;
const dataHoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

const STATUS = {
  pendente: { bg:'#fef9c3', cor:'#854d0e', label:'Pendente' },
  vencido:  { bg:'#fee2e2', cor:'#991b1b', label:'Vencido'  },
  pago:     { bg:'#dcfce7', cor:'#166534', label:'Pago'     },
};

function fileParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function BotaoArquivo({ nome, onSelect, onBaixar, label = 'Anexar arquivo' }) {
  const ref = useRef();
  return (
    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
      <input ref={ref} type="file" accept=".pdf,.png,.jpg,.jpeg,.xml" style={{ display:'none' }} onChange={onSelect} />
      {nome ? (
        <>
          <button type="button" onClick={onBaixar}
            style={{ padding:'5px 10px', border:'1px solid #d1d5db', borderRadius:6, background:'#f9fafb', fontSize:12, cursor:'pointer', color:'#374151', display:'flex', alignItems:'center', gap:4 }}>
            <i className="ti ti-download" style={{ fontSize:13 }}></i>
            <span style={{ maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{nome}</span>
          </button>
          <button type="button" onClick={() => ref.current.click()}
            style={{ padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:12, cursor:'pointer', color:'#6b7280' }}>
            <i className="ti ti-refresh"></i>
          </button>
        </>
      ) : (
        <button type="button" onClick={() => ref.current.click()}
          style={{ padding:'5px 12px', border:'1px dashed #d1d5db', borderRadius:6, background:'#f9fafb', fontSize:12, cursor:'pointer', color:'#6b7280', display:'flex', alignItems:'center', gap:4 }}>
          <i className="ti ti-paperclip" style={{ fontSize:13 }}></i> {label}
        </button>
      )}
    </div>
  );
}

const vazioFatura = { fornecedorId:'', numero:'', valor:'', dataVencimento:'', observacao:'', arquivoNome:null, arquivoBase64:null, arquivoTipo:null };
const vazioNF     = { numero:'', valor:'', arquivoNome:null, arquivoBase64:null, arquivoTipo:null };

export default function Faturas() {
  const [faturas, setFaturas]         = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [expandidos, setExpandidos]   = useState({});
  const [form, setForm]               = useState(vazioFatura);
  const [editId, setEditId]           = useState(null);
  const [showForm, setShowForm]       = useState(false);
  const [salvando, setSalvando]       = useState(false);
  const [filtroForn, setFiltroForn]   = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [showPagarId, setShowPagarId] = useState(null);
  const [dataPagamento, setDataPagamento] = useState(dataHoje());
  // NF modal
  const [nfFaturaId, setNfFaturaId]   = useState(null);
  const [nfForm, setNfForm]           = useState(vazioNF);
  const [salvandoNF, setSalvandoNF]   = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [f, fo] = await Promise.all([
        api.get('/faturas-abastecimento'),
        api.get('/fornecedores-abastecimento'),
      ]);
      setFaturas(f.data);
      setFornecedores(fo.data);
    } catch { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  }

  const listaFiltrada = useMemo(() => faturas.filter(f => {
    if (filtroForn && f.fornecedorId !== filtroForn) return false;
    if (filtroStatus !== 'todos' && f.status !== filtroStatus) return false;
    return true;
  }), [faturas, filtroForn, filtroStatus]);

  // Totais
  const totalFaturas  = listaFiltrada.reduce((s,f) => s + Number(f.valor), 0);
  const totalNFs      = listaFiltrada.reduce((s,f) => s + (f.notasFiscais||[]).reduce((ss,nf) => ss + Number(nf.valor), 0), 0);
  const totalPendente = listaFiltrada.filter(f => f.status !== 'pago').reduce((s,f) => s + Number(f.valor), 0);
  const totalPago     = listaFiltrada.filter(f => f.status === 'pago').reduce((s,f) => s + Number(f.valor), 0);

  async function salvar(e) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    try {
      const payload = { ...form, valor: parseFloat(form.valor) };
      if (editId) { await api.put(`/faturas-abastecimento/${editId}`, payload); toast.success('Fatura atualizada'); }
      else        { await api.post('/faturas-abastecimento', payload);          toast.success('Fatura criada'); }
      setForm(vazioFatura); setEditId(null); setShowForm(false); carregar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Erro ao salvar fatura');
    } finally { setSalvando(false); }
  }

  async function excluirFatura(id) {
    if (!confirm('Excluir esta fatura e todas as suas NFs?')) return;
    try { await api.delete(`/faturas-abastecimento/${id}`); toast.success('Fatura excluída'); carregar(); }
    catch { toast.error('Erro ao excluir'); }
  }

  async function pagar() {
    try {
      await api.patch(`/faturas-abastecimento/${showPagarId}/pagar`, { dataPagamento });
      toast.success('Marcada como paga'); setShowPagarId(null); carregar();
    } catch { toast.error('Erro ao marcar como pago'); }
  }

  async function reabrir(id) {
    try { await api.patch(`/faturas-abastecimento/${id}/reabrir`); toast.success('Reaberta'); carregar(); }
    catch { toast.error('Erro ao reabrir'); }
  }

  // Arquivo da fatura
  async function selecionarArquivoFatura(e) {
    const file = e.target.files[0]; if (!file) return;
    const b64 = await fileParaBase64(file);
    setForm(f => ({ ...f, arquivoNome: file.name, arquivoBase64: b64, arquivoTipo: file.type }));
  }

  function baixarArquivoFatura(faturaId, nome) {
    window.open(`${api.defaults.baseURL}/faturas-abastecimento/${faturaId}/arquivo`, '_blank');
  }

  // NFs
  async function adicionarNF(e) {
    e.preventDefault();
    if (salvandoNF) return;
    setSalvandoNF(true);
    try {
      await api.post(`/faturas-abastecimento/${nfFaturaId}/nfs`, { ...nfForm, valor: parseFloat(nfForm.valor) });
      toast.success('NF adicionada');
      setNfForm(vazioNF); setNfFaturaId(null); carregar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Erro ao adicionar NF');
    } finally { setSalvandoNF(false); }
  }

  async function excluirNF(faturaId, nfId) {
    if (!confirm('Excluir esta NF?')) return;
    try { await api.delete(`/faturas-abastecimento/${faturaId}/nfs/${nfId}`); toast.success('NF excluída'); carregar(); }
    catch { toast.error('Erro ao excluir NF'); }
  }

  async function selecionarArquivoNF(e) {
    const file = e.target.files[0]; if (!file) return;
    const b64 = await fileParaBase64(file);
    setNfForm(f => ({ ...f, arquivoNome: file.name, arquivoBase64: b64, arquivoTipo: file.type }));
  }

  function abrirEditar(f) {
    setForm({
      fornecedorId: f.fornecedorId, numero: f.numero, valor: String(f.valor),
      dataVencimento: f.dataVencimento?.slice(0,10) || '',
      observacao: f.observacao || '',
      arquivoNome: f.arquivoNome, arquivoBase64: null, arquivoTipo: f.arquivoTipo,
    });
    setEditId(f.id); setShowForm(true);
  }

  const inp = { width:'100%', padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' };
  const lbl = { fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 };

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:600, color:'#1a1a2e', margin:0 }}>Faturas</h2>
          <p style={{ fontSize:13, color:'#6b7280', marginTop:2 }}>Controle de faturas e notas fiscais</p>
        </div>
        <button onClick={() => { setForm(vazioFatura); setEditId(null); setShowForm(true); }}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 18px', background:'#EB3238', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:500, cursor:'pointer' }}>
          <i className="ti ti-plus" style={{ fontSize:16 }}></i> Nova Fatura
        </button>
      </div>

      {/* Cards totais */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
        {[
          { label:'Soma Faturas',    valor: totalFaturas,  cor:'#1a1a2e', icone:'ti-file-invoice',  bg:'#f8fafc' },
          { label:'Soma NFs',        valor: totalNFs,      cor:'#0891b2', icone:'ti-receipt',        bg:'#f0f9ff' },
          { label:'Total Pendente',  valor: totalPendente, cor:'#d97706', icone:'ti-clock',          bg:'#fffbeb' },
          { label:'Total Pago',      valor: totalPago,     cor:'#16a34a', icone:'ti-circle-check',   bg:'#f0fdf4' },
        ].map(c => (
          <div key={c.label} style={{ background:c.bg, border:`1px solid ${c.cor}22`, borderRadius:12, padding:'16px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <i className={`ti ${c.icone}`} style={{ fontSize:17, color:c.cor }}></i>
              <span style={{ fontSize:11, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px' }}>{c.label}</span>
            </div>
            <div style={{ fontSize:20, fontWeight:700, color:c.cor }}>{fmt(c.valor)}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'10px 14px', marginBottom:14, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <select value={filtroForn} onChange={e => setFiltroForn(e.target.value)}
          style={{ padding:'6px 10px', border:'1px solid #d1d5db', borderRadius:7, fontSize:13, outline:'none', minWidth:200 }}>
          <option value="">Todos os fornecedores</option>
          {fornecedores.map(f => <option key={f.id} value={f.id}>{f.razaoSocial}</option>)}
        </select>
        <div style={{ display:'flex', gap:6 }}>
          {['todos','pendente','vencido','pago'].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              style={{ padding:'5px 14px', borderRadius:20, border:`1px solid ${filtroStatus===s ? (STATUS[s]?.cor||'#374151') : '#d1d5db'}`,
                background: filtroStatus===s ? (STATUS[s]?.cor||'#374151') : '#fff', color: filtroStatus===s ? '#fff' : '#374151', fontSize:12, cursor:'pointer' }}>
              {s==='todos' ? 'Todos' : STATUS[s]?.label}
            </button>
          ))}
        </div>
        <span style={{ marginLeft:'auto', fontSize:12, color:'#9ca3af' }}>{listaFiltrada.length} fatura(s)</span>
      </div>

      {/* Lista de faturas */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>Carregando...</div>
      ) : listaFiltrada.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#9ca3af', background:'#fff', borderRadius:12, border:'1px solid #e5e7eb' }}>
          <i className="ti ti-file-off" style={{ fontSize:40, display:'block', marginBottom:8 }}></i>Nenhuma fatura encontrada
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {listaFiltrada.map(fatura => {
            const sc       = STATUS[fatura.status] || STATUS.pendente;
            const dias     = emDias(fatura.dataVencimento);
            const nfs      = fatura.notasFiscais || [];
            const somaANFs = nfs.reduce((s,nf) => s + Number(nf.valor), 0);
            const expanded = expandidos[fatura.id];
            const forn     = fatura.fornecedor;

            return (
              <div key={fatura.id} style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', overflow:'hidden' }}>
                {/* Linha principal da fatura */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto auto auto', gap:12, padding:'14px 18px', alignItems:'center' }}>
                  {/* Fornecedor + número */}
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#1a1a2e' }}>{forn?.razaoSocial}</div>
                    <div style={{ fontSize:12, color:'#6b7280', marginTop:1 }}>Fatura #{fatura.numero}</div>
                  </div>
                  {/* Valor fatura */}
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:11, color:'#9ca3af' }}>Fatura</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>{fmt(fatura.valor)}</div>
                  </div>
                  {/* Soma NFs */}
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:11, color:'#9ca3af' }}>NFs ({nfs.length})</div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#0891b2' }}>{fmt(somaANFs)}</div>
                  </div>
                  {/* Vencimento */}
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:11, color:'#9ca3af' }}>Vencimento</div>
                    <div style={{ fontSize:12, fontWeight:500, color: fatura.status==='vencido' ? '#dc2626' : '#374151' }}>{fmtData(fatura.dataVencimento)}</div>
                    {fatura.status !== 'pago' && dias !== null && (
                      <div style={{ fontSize:11, color: dias < 0 ? '#dc2626' : dias <= 7 ? '#d97706' : '#9ca3af' }}>
                        {dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias}d`}
                      </div>
                    )}
                  </div>
                  {/* Status */}
                  <span style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:600, background:sc.bg, color:sc.cor, whiteSpace:'nowrap' }}>{sc.label}</span>
                  {/* Ações */}
                  <div style={{ display:'flex', gap:5 }}>
                    <button onClick={() => setExpandidos(e => ({ ...e, [fatura.id]: !e[fatura.id] }))} title="Ver NFs"
                      style={{ padding:'5px 9px', border:'1px solid #d1d5db', borderRadius:6, background:'#f9fafb', fontSize:12, cursor:'pointer', color: expanded ? '#EB3238' : '#374151' }}>
                      <i className={`ti ${expanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
                    </button>
                    {fatura.arquivoNome && (
                      <button onClick={() => baixarArquivoFatura(fatura.id, fatura.arquivoNome)} title="Baixar fatura"
                        style={{ padding:'5px 9px', border:'1px solid #dbeafe', borderRadius:6, background:'#eff6ff', fontSize:12, cursor:'pointer', color:'#1d4ed8' }}>
                        <i className="ti ti-download"></i>
                      </button>
                    )}
                    {fatura.status !== 'pago' ? (
                      <button onClick={() => { setShowPagarId(fatura.id); setDataPagamento(dataHoje()); }} title="Marcar como pago"
                        style={{ padding:'5px 9px', border:'1px solid #bbf7d0', borderRadius:6, background:'#f0fdf4', fontSize:12, cursor:'pointer', color:'#16a34a' }}>
                        <i className="ti ti-check"></i>
                      </button>
                    ) : (
                      <button onClick={() => reabrir(fatura.id)} title="Reabrir"
                        style={{ padding:'5px 9px', border:'1px solid #d1d5db', borderRadius:6, background:'#f9fafb', fontSize:12, cursor:'pointer', color:'#6b7280' }}>
                        <i className="ti ti-rotate-clockwise"></i>
                      </button>
                    )}
                    <button onClick={() => abrirEditar(fatura)} title="Editar"
                      style={{ padding:'5px 9px', border:'1px solid #d1d5db', borderRadius:6, background:'#f9fafb', fontSize:12, cursor:'pointer', color:'#374151' }}>
                      <i className="ti ti-pencil"></i>
                    </button>
                    <button onClick={() => excluirFatura(fatura.id)} title="Excluir"
                      style={{ padding:'5px 9px', border:'1px solid #fee2e2', borderRadius:6, background:'#fff5f5', fontSize:12, cursor:'pointer', color:'#dc2626' }}>
                      <i className="ti ti-trash"></i>
                    </button>
                  </div>
                </div>

                {/* Painel de NFs (expandível) */}
                {expanded && (
                  <div style={{ borderTop:'1px solid #f3f4f6', background:'#fafafa', padding:'12px 18px' }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'#6b7280', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.4px' }}>
                      Notas Fiscais — Soma: {fmt(somaANFs)}
                    </div>
                    {nfs.length === 0 ? (
                      <div style={{ fontSize:12, color:'#9ca3af', marginBottom:10 }}>Nenhuma NF vinculada ainda.</div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:12 }}>
                        {nfs.map(nf => (
                          <div key={nf.id} style={{ display:'flex', alignItems:'center', gap:12, background:'#fff', borderRadius:8, border:'1px solid #e5e7eb', padding:'8px 12px' }}>
                            <i className="ti ti-receipt" style={{ fontSize:16, color:'#0891b2' }}></i>
                            <div style={{ flex:1 }}>
                              <span style={{ fontWeight:500, fontSize:13 }}>NF #{nf.numero}</span>
                              <span style={{ color:'#0891b2', fontWeight:600, marginLeft:12, fontSize:13 }}>{fmt(nf.valor)}</span>
                            </div>
                            {nf.arquivoNome && (
                              <button onClick={() => window.open(`${api.defaults.baseURL}/faturas-abastecimento/${fatura.id}/nfs/${nf.id}/arquivo`, '_blank')}
                                style={{ padding:'4px 10px', border:'1px solid #dbeafe', borderRadius:6, background:'#eff6ff', fontSize:12, cursor:'pointer', color:'#1d4ed8', display:'flex', alignItems:'center', gap:4 }}>
                                <i className="ti ti-download" style={{ fontSize:12 }}></i>
                                <span style={{ maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{nf.arquivoNome}</span>
                              </button>
                            )}
                            <button onClick={() => excluirNF(fatura.id, nf.id)}
                              style={{ padding:'4px 8px', border:'1px solid #fee2e2', borderRadius:6, background:'#fff5f5', fontSize:12, cursor:'pointer', color:'#dc2626' }}>
                              <i className="ti ti-trash"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button onClick={() => { setNfFaturaId(fatura.id); setNfForm(vazioNF); }}
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', border:'1px dashed #d1d5db', borderRadius:8, background:'#fff', fontSize:12, cursor:'pointer', color:'#374151' }}>
                      <i className="ti ti-plus" style={{ fontSize:14 }}></i> Adicionar NF
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nova/Editar Fatura */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:28, width:'100%', maxWidth:520, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ fontSize:16, fontWeight:600, margin:0 }}>{editId ? 'Editar' : 'Nova'} Fatura</h3>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#9ca3af' }}>×</button>
            </div>
            <form onSubmit={salvar}>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <label style={lbl}>Fornecedor *</label>
                  <select value={form.fornecedorId} onChange={e => setForm(f=>({...f,fornecedorId:e.target.value}))} style={inp} required>
                    <option value="">Selecione...</option>
                    {fornecedores.map(f => <option key={f.id} value={f.id}>{f.razaoSocial}</option>)}
                  </select>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div>
                    <label style={lbl}>Número da Fatura *</label>
                    <input value={form.numero} onChange={e => setForm(f=>({...f,numero:e.target.value}))} style={inp} required />
                  </div>
                  <div>
                    <label style={lbl}>Valor (R$) *</label>
                    <input type="number" step="0.01" min="0" value={form.valor} onChange={e => setForm(f=>({...f,valor:e.target.value}))} style={inp} required />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Data de Vencimento *</label>
                  <input type="date" value={form.dataVencimento} onChange={e => setForm(f=>({...f,dataVencimento:e.target.value}))} style={inp} required />
                </div>
                <div>
                  <label style={lbl}>Documento da Fatura</label>
                  <BotaoArquivo
                    nome={form.arquivoNome}
                    onSelect={selecionarArquivoFatura}
                    onBaixar={() => editId && baixarArquivoFatura(editId, form.arquivoNome)}
                    label="Anexar fatura (PDF, imagem)"
                  />
                </div>
                <div>
                  <label style={lbl}>Observação</label>
                  <textarea value={form.observacao} onChange={e => setForm(f=>({...f,observacao:e.target.value}))}
                    style={{ ...inp, height:70, resize:'vertical' }} />
                </div>
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ padding:'8px 20px', border:'1px solid #d1d5db', borderRadius:8, background:'#fff', fontSize:13, cursor:'pointer' }}>Cancelar</button>
                <button type="submit" disabled={salvando}
                  style={{ padding:'8px 20px', border:'none', borderRadius:8, background:'#EB3238', color:'#fff', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                  {salvando ? 'Salvando...' : editId ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Pagamento */}
      {showPagarId && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:28, width:'100%', maxWidth:340, boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ fontSize:15, fontWeight:600, margin:'0 0 16px' }}>Confirmar Pagamento</h3>
            <label style={lbl}>Data do pagamento</label>
            <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)}
              style={{ ...inp, marginBottom:20 }} />
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={() => setShowPagarId(null)}
                style={{ padding:'8px 20px', border:'1px solid #d1d5db', borderRadius:8, background:'#fff', fontSize:13, cursor:'pointer' }}>Cancelar</button>
              <button onClick={pagar}
                style={{ padding:'8px 20px', border:'none', borderRadius:8, background:'#16a34a', color:'#fff', fontSize:13, fontWeight:500, cursor:'pointer' }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Adicionar NF */}
      {nfFaturaId && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:28, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ fontSize:15, fontWeight:600, margin:0 }}>Adicionar Nota Fiscal</h3>
              <button onClick={() => setNfFaturaId(null)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#9ca3af' }}>×</button>
            </div>
            <form onSubmit={adicionarNF}>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div>
                    <label style={lbl}>Número da NF *</label>
                    <input value={nfForm.numero} onChange={e => setNfForm(f=>({...f,numero:e.target.value}))} style={inp} required />
                  </div>
                  <div>
                    <label style={lbl}>Valor (R$) *</label>
                    <input type="number" step="0.01" min="0" value={nfForm.valor} onChange={e => setNfForm(f=>({...f,valor:e.target.value}))} style={inp} required />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Documento da NF</label>
                  <BotaoArquivo nome={nfForm.arquivoNome} onSelect={selecionarArquivoNF} label="Anexar NF (PDF, imagem)" />
                </div>
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
                <button type="button" onClick={() => setNfFaturaId(null)}
                  style={{ padding:'8px 20px', border:'1px solid #d1d5db', borderRadius:8, background:'#fff', fontSize:13, cursor:'pointer' }}>Cancelar</button>
                <button type="submit" disabled={salvandoNF}
                  style={{ padding:'8px 20px', border:'none', borderRadius:8, background:'#0891b2', color:'#fff', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                  {salvandoNF ? 'Adicionando...' : 'Adicionar NF'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
