// frontend/src/pages/Levantamentos.jsx
import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell
} from 'recharts';

const FORM_VAZIO = { mes: '', motoristasFechados: '', previa: '', saldo: '', salario: '', quinzena: '', inssIrpf: '', observacao: '' };

const CORES = {
  'Prévia':    '#EB3238',
  'Saldo':     '#f59e0b',
  'Salário':   '#3b82f6',
  'Quinzena':  '#10b981',
  'INSS/IRPF': '#8b5cf6',
};

const CustomTooltip = ({ active, payload, label, fmtVal }) => {
  if (!active || !payload?.length) return null;
  const totalVal = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div style={{ background:'#1e293b', borderRadius:10, padding:'12px 16px', boxShadow:'0 8px 32px rgba(0,0,0,0.25)', minWidth:200 }}>
      <div style={{ color:'#94a3b8', fontSize:11, fontWeight:600, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display:'flex', justifyContent:'space-between', gap:24, marginBottom:4 }}>
          <span style={{ color: p.fill, fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:p.fill, display:'inline-block' }}/>
            {p.name}
          </span>
          <span style={{ color:'#f1f5f9', fontSize:12, fontWeight:600 }}>{fmtVal(p.value)}</span>
        </div>
      ))}
      <div style={{ borderTop:'1px solid #334155', marginTop:8, paddingTop:8, display:'flex', justifyContent:'space-between' }}>
        <span style={{ color:'#94a3b8', fontSize:12 }}>Total</span>
        <span style={{ color:'#fff', fontSize:13, fontWeight:700 }}>{fmtVal(totalVal)}</span>
      </div>
    </div>
  );
};

export default function Levantamentos() {
  const [lista, setLista] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showLista, setShowLista] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [anoFiltro, setAnoFiltro] = useState(null);
  const [mesFiltro, setMesFiltro] = useState(null);

  function carregar() {
    api.get('/levantamentos').then(r => setLista(r.data)).catch(() => {});
  }

  useEffect(() => { carregar(); }, []);

  function abrirNovo() { setEditandoId(null); setForm(FORM_VAZIO); setShowForm(true); }

  function abrirEdicao(l) {
    setEditandoId(l.id);
    setForm({ mes: l.mes, motoristasFechados: l.motoristasFechados, previa: l.previa, saldo: l.saldo, salario: l.salario, quinzena: l.quinzena, inssIrpf: l.inssIrpf, observacao: l.observacao || '' });
    setShowForm(true);
  }

  async function salvar(e) {
    e.preventDefault();
    try {
      if (editandoId) { await api.put(`/levantamentos/${editandoId}`, form); toast.success('Atualizado!'); }
      else { await api.post('/levantamentos', form); toast.success('Registrado!'); }
      setShowForm(false); setEditandoId(null); setForm(FORM_VAZIO); carregar();
    } catch (err) { toast.error(err?.response?.data?.error || 'Erro ao salvar'); }
  }

  async function excluir(id) {
    if (!confirm('Excluir este levantamento?')) return;
    try { await api.delete(`/levantamentos/${id}`); carregar(); }
    catch { toast.error('Erro ao excluir'); }
  }

  const lbl = { display:'block', fontSize:11, fontWeight:500, color:'#6b7280', marginBottom:4, textTransform:'uppercase' };
  const inp = { width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8, fontSize:13, boxSizing:'border-box' };
  const fmt  = v => `R$ ${parseFloat(v||0).toLocaleString('pt-BR', { minimumFractionDigits:2 })}`;
  const fmtK = v => v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v.toFixed(0)}`;
  const fmtMes = mes => {
    if (!mes) return '—';
    const [ano, m] = mes.split('-');
    return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m,10)-1]}/${ano.slice(2)}`;
  };
  const total = l => parseFloat(l.previa||0)+parseFloat(l.saldo||0)+parseFloat(l.salario||0)+parseFloat(l.quinzena||0)+parseFloat(l.inssIrpf||0);

  // anos e meses disponíveis
  const anos = [...new Set(lista.map(l => l.mes.split('-')[0]))].sort((a,b) => b-a);
  const listaFiltrada = lista.filter(l => {
    if (mesFiltro) return l.mes === mesFiltro;
    if (anoFiltro) return l.mes.startsWith(anoFiltro);
    return true;
  });

  const chartData = [...listaFiltrada].reverse().map(l => ({
    mes: fmtMes(l.mes),
    'Total': total(l),
  }));

  const soma = key => listaFiltrada.reduce((s,l) => s + parseFloat(l[key]||0), 0);
  const resumo = [
    { label:'Total Geral',      valor: fmt(listaFiltrada.reduce((s,l)=>s+total(l),0)), cor:'#EB3238', icon:'ti-cash' },
    { label:'Motoristas',       valor: listaFiltrada.reduce((s,l)=>s+(parseInt(l.motoristasFechados)||0),0), cor:'#0ea5e9', icon:'ti-users' },
    { label:'Salário',          valor: fmt(soma('salario')),  cor:'#3b82f6', icon:'ti-id-badge' },
    { label:'Quinzena',         valor: fmt(soma('quinzena')), cor:'#10b981', icon:'ti-calendar-due' },
    { label:'INSS/IRPF',        valor: fmt(soma('inssIrpf')), cor:'#8b5cf6', icon:'ti-receipt-tax' },
    { label:'Prévia',           valor: fmt(soma('previa')),   cor:'#f59e0b', icon:'ti-file-invoice' },
    { label:'Saldo',            valor: fmt(soma('saldo')),    cor:'#06b6d4', icon:'ti-wallet' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:'#1a1a2e' }}>Levantamentos</h2>
        <button onClick={abrirNovo}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 18px', background:'#EB3238', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', boxShadow:'0 2px 8px rgba(235,50,56,0.3)' }}>
          <i className="ti ti-plus"></i> Incluir
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ background:'#fff', borderRadius:12, padding:20, marginBottom:20, border:'1px solid #e5e7eb', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <form onSubmit={salvar}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12 }}>
              <div>
                <label style={lbl}>Mês</label>
                <input type="month" value={form.mes} onChange={e=>setForm(f=>({...f,mes:e.target.value}))} required style={inp}/>
                {form.mes && lista.some(l=>l.mes===form.mes) && !editandoId && (
                  <div style={{ marginTop:4, fontSize:11, color:'#f59e0b', display:'flex', alignItems:'center', gap:4 }}>
                    <i className="ti ti-plus"></i> Os valores serão somados ao registro existente
                  </div>
                )}
              </div>
              <div><label style={lbl}>Motoristas Fechados</label><input type="number" min="0" step="1" value={form.motoristasFechados} onChange={e=>setForm(f=>({...f,motoristasFechados:e.target.value}))} style={inp}/></div>
              <div><label style={lbl}>Prévia (R$)</label><input type="number" step="0.01" min="0" value={form.previa} onChange={e=>setForm(f=>({...f,previa:e.target.value}))} style={inp}/></div>
              <div><label style={lbl}>Saldo (R$)</label><input type="number" step="0.01" min="0" value={form.saldo} onChange={e=>setForm(f=>({...f,saldo:e.target.value}))} style={inp}/></div>
              <div><label style={lbl}>Salário (R$)</label><input type="number" step="0.01" min="0" value={form.salario} onChange={e=>setForm(f=>({...f,salario:e.target.value}))} style={inp}/></div>
              <div><label style={lbl}>Quinzena (R$)</label><input type="number" step="0.01" min="0" value={form.quinzena} onChange={e=>setForm(f=>({...f,quinzena:e.target.value}))} style={inp}/></div>
              <div><label style={lbl}>INSS/IRPF (R$)</label><input type="number" step="0.01" min="0" value={form.inssIrpf} onChange={e=>setForm(f=>({...f,inssIrpf:e.target.value}))} style={inp}/></div>
              <div style={{ gridColumn:'span 4' }}><label style={lbl}>Observação</label><input type="text" value={form.observacao} onChange={e=>setForm(f=>({...f,observacao:e.target.value}))} style={inp}/></div>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
              <button type="button" onClick={()=>{setShowForm(false);setEditandoId(null);}} style={{ padding:'8px 16px', border:'1px solid #d1d5db', borderRadius:8, fontSize:13, cursor:'pointer', background:'#fff' }}>Cancelar</button>
              <button type="submit" style={{ padding:'8px 20px', background:'#EB3238', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>Salvar</button>
            </div>
          </form>
        </div>
      )}

      {lista.length > 0 ? (<>
        {/* Filtros por ano e mês */}
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:16 }}>
          <button onClick={()=>{ setAnoFiltro(null); setMesFiltro(null); }}
            style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
              background: !anoFiltro && !mesFiltro ? '#EB3238' : '#f1f5f9', color: !anoFiltro && !mesFiltro ? '#fff' : '#64748b' }}>
            Todos
          </button>
          {anos.map(ano => (
            <button key={ano} onClick={()=>{ setAnoFiltro(anoFiltro===ano ? null : ano); setMesFiltro(null); }}
              style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
                background: anoFiltro===ano && !mesFiltro ? '#1e293b' : '#f1f5f9',
                color: anoFiltro===ano && !mesFiltro ? '#fff' : '#64748b',
                boxShadow: anoFiltro===ano && !mesFiltro ? '0 2px 8px rgba(0,0,0,0.15)' : 'none' }}>
              {ano}
            </button>
          ))}
          <span style={{ width:1, height:20, background:'#e2e8f0', margin:'0 4px' }}/>
          {lista.map(l => (
            <button key={l.mes} onClick={()=>setMesFiltro(mesFiltro===l.mes ? null : l.mes)}
              style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:500, cursor:'pointer',
                border: mesFiltro===l.mes ? '1px solid #EB3238' : '1px solid #e2e8f0',
                background: mesFiltro===l.mes ? '#EB3238' : '#fff',
                color: mesFiltro===l.mes ? '#fff' : '#475569' }}>
              {fmtMes(l.mes)}
            </button>
          ))}
        </div>

        {/* Cards resumo */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:10, marginBottom:16 }}>
          {resumo.map(r => (
            <div key={r.label} style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #e5e7eb', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ width:34, height:34, borderRadius:8, background:r.cor+'18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className={`ti ${r.icon}`} style={{ fontSize:18, color:r.cor }}></i>
                </div>
                <span style={{ fontSize:11, color:'#6b7280', fontWeight:500 }}>{r.label}</span>
              </div>
              <div style={{ fontSize:20, fontWeight:700, color:'#1a1a2e' }}>{r.valor}</div>
            </div>
          ))}
        </div>

        {/* Gráfico */}
        <div style={{ background:'linear-gradient(135deg,#1e293b 0%,#0f172a 100%)', borderRadius:16, padding:'24px 20px 16px', boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div>
              <div style={{ color:'#f1f5f9', fontSize:15, fontWeight:700 }}>Comparativo por mês</div>
              <div style={{ color:'#64748b', fontSize:12, marginTop:2 }}>Distribuição de gastos por categoria</div>
            </div>
            <div style={{ fontSize:11, color:'#64748b' }}>Total gasto por mês</div>
          </div>
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={chartData} margin={{ top:16, right:16, left:0, bottom:4 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize:12, fill:'#94a3b8', fontWeight:500 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize:11, fill:'#64748b' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={60} />
              <Tooltip content={<CustomTooltip fmtVal={fmt} />} cursor={{ fill:'rgba(255,255,255,0.04)' }} />
              {chartData.length > 1 && (() => {
                const avg = chartData.reduce((s,d) => s + d.Total, 0) / chartData.length;
                return (
                  <ReferenceLine y={avg} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value: `Média ${fmtK(avg)}`, position:'insideTopRight', fill:'#f59e0b', fontSize:11, fontWeight:600 }} />
                );
              })()}
              <Bar dataKey="Total" radius={[6,6,0,0]} maxBarSize={60}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={`hsl(${200 + i * 25},70%,${55 - i * 2}%)`} />
                ))}
              </Bar>
              <Line dataKey="Total" type="monotone" stroke="#e2e8f0" strokeWidth={2}
                dot={{ fill:'#fff', stroke:'#e2e8f0', strokeWidth:2, r:4 }}
                activeDot={{ r:6, fill:'#fff' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Gerenciar */}
        <div style={{ marginTop:12 }}>
          <button onClick={()=>setShowLista(v=>!v)}
            style={{ background:'none', border:'none', fontSize:12, color:'#6b7280', cursor:'pointer', padding:'4px 0', display:'flex', alignItems:'center', gap:4 }}>
            <i className={`ti ${showLista?'ti-chevron-up':'ti-chevron-down'}`}></i>
            {showLista ? 'Ocultar registros' : 'Gerenciar registros'}
          </button>
          {showLista && (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', overflow:'hidden', marginTop:8 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'#f9fafb' }}>
                    {['Mês','Motoristas','Prévia','Saldo','Salário','Quinzena','INSS/IRPF','Total',''].map(h=>(
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:600, color:'#6b7280', textTransform:'uppercase', borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listaFiltrada.map(l=>(
                    <tr key={l.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                      <td style={{ padding:'8px 12px', fontWeight:600 }}>{fmtMes(l.mes)}</td>
                      <td style={{ padding:'8px 12px' }}>{l.motoristasFechados}</td>
                      <td style={{ padding:'8px 12px' }}>{fmt(l.previa)}</td>
                      <td style={{ padding:'8px 12px' }}>{fmt(l.saldo)}</td>
                      <td style={{ padding:'8px 12px' }}>{fmt(l.salario)}</td>
                      <td style={{ padding:'8px 12px' }}>{fmt(l.quinzena)}</td>
                      <td style={{ padding:'8px 12px' }}>{fmt(l.inssIrpf)}</td>
                      <td style={{ padding:'8px 12px', color:'#EB3238', fontWeight:700 }}>{fmt(total(l))}</td>
                      <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                        <button onClick={()=>abrirEdicao(l)} style={{ padding:'3px 10px', background:'#fff', border:'1px solid #d1d5db', borderRadius:6, fontSize:12, color:'#374151', cursor:'pointer', marginRight:6 }}>Editar</button>
                        <button onClick={()=>excluir(l.id)} style={{ padding:'3px 10px', background:'#fff', border:'1px solid #EB3238', borderRadius:6, fontSize:12, color:'#EB3238', cursor:'pointer' }}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>) : (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', padding:60, textAlign:'center', color:'#9ca3af' }}>
          Nenhum levantamento registrado
        </div>
      )}
    </div>
  );
}
