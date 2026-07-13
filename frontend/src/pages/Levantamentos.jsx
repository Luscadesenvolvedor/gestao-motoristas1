// frontend/src/pages/Levantamentos.jsx
import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const FORM_VAZIO = { mes: '', motoristasFechados: '', previa: '', saldo: '', salario: '', quinzena: '', inssIrpf: '', observacao: '' };

export default function Levantamentos() {
  const [lista, setLista] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);

  function carregar() {
    api.get('/levantamentos').then(r => setLista(r.data)).catch(() => {});
  }

  useEffect(() => { carregar(); }, []);

  function abrirNovo() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setShowForm(true);
  }

  function abrirEdicao(l) {
    setEditandoId(l.id);
    setForm({
      mes: l.mes,
      motoristasFechados: l.motoristasFechados,
      previa: l.previa,
      saldo: l.saldo,
      salario: l.salario,
      quinzena: l.quinzena,
      inssIrpf: l.inssIrpf,
      observacao: l.observacao || '',
    });
    setShowForm(true);
  }

  async function salvar(e) {
    e.preventDefault();
    try {
      if (editandoId) {
        await api.put(`/levantamentos/${editandoId}`, form);
        toast.success('Levantamento atualizado!');
      } else {
        await api.post('/levantamentos', form);
        toast.success('Levantamento registrado!');
      }
      setShowForm(false);
      setEditandoId(null);
      setForm(FORM_VAZIO);
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Erro ao salvar');
    }
  }

  async function excluir(id) {
    if (!confirm('Excluir este levantamento?')) return;
    try {
      await api.delete(`/levantamentos/${id}`);
      carregar();
    } catch { toast.error('Erro ao excluir'); }
  }

  function exportar() {
    if (!lista.length) return toast.error('Nenhum levantamento para exportar');
    const rows = lista.map(l => ({
      'Mês':                  fmtMes(l.mes),
      'Motoristas Fechados':  l.motoristasFechados,
      'Prévia':               parseFloat(l.previa),
      'Saldo':                parseFloat(l.saldo),
      'Salário':              parseFloat(l.salario),
      'Quinzena':             parseFloat(l.quinzena),
      'INSS/IRPF':            parseFloat(l.inssIrpf),
      'Total Gasto':          total(l),
      'Observação':           l.observacao || '',
      'Registrado por':       l.usuario?.nome || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Levantamentos');
    XLSX.writeFile(wb, `levantamentos-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const lbl = { display:'block', fontSize:11, fontWeight:500, color:'#6b7280', marginBottom:4, textTransform:'uppercase' };
  const inp = { width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8, fontSize:13, boxSizing:'border-box' };
  const fmt = v => `R$ ${parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits:2 })}`;
  const fmtMes = mes => {
    if (!mes) return '—';
    const [ano, m] = mes.split('-');
    const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${nomes[parseInt(m,10)-1] || m}/${ano}`;
  };
  const total = l => parseFloat(l.previa||0) + parseFloat(l.saldo||0) + parseFloat(l.salario||0) + parseFloat(l.quinzena||0) + parseFloat(l.inssIrpf||0);

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:20, fontWeight:600, color:'#1a1a2e' }}>Levantamentos</h2>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={exportar}
            style={{ padding:'9px 16px', background:'#fff', border:'1px solid #d1d5db', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', color:'#374151' }}>
            <i className="ti ti-download" style={{ marginRight:6 }}></i>Exportar
          </button>
          <button onClick={abrirNovo}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 16px', background:'#EB3238', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
            <i className="ti ti-plus"></i> Incluir
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ background:'#fff', borderRadius:12, padding:20, marginBottom:16, border:'1px solid #e5e7eb' }}>
          <form onSubmit={salvar}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12 }}>
              <div>
                <label style={lbl}>Mês</label>
                <input type="month" value={form.mes} onChange={e=>setForm(f=>({...f,mes:e.target.value}))} required style={inp}/>
              </div>
              <div>
                <label style={lbl}>Motoristas Fechados</label>
                <input type="number" min="0" step="1" value={form.motoristasFechados} onChange={e=>setForm(f=>({...f,motoristasFechados:e.target.value}))} required style={inp}/>
              </div>
              <div>
                <label style={lbl}>Prévia (R$)</label>
                <input type="number" step="0.01" min="0" value={form.previa} onChange={e=>setForm(f=>({...f,previa:e.target.value}))} required style={inp}/>
              </div>
              <div>
                <label style={lbl}>Saldo (R$)</label>
                <input type="number" step="0.01" min="0" value={form.saldo} onChange={e=>setForm(f=>({...f,saldo:e.target.value}))} required style={inp}/>
              </div>
              <div>
                <label style={lbl}>Salário (R$)</label>
                <input type="number" step="0.01" min="0" value={form.salario} onChange={e=>setForm(f=>({...f,salario:e.target.value}))} required style={inp}/>
              </div>
              <div>
                <label style={lbl}>Quinzena (R$)</label>
                <input type="number" step="0.01" min="0" value={form.quinzena} onChange={e=>setForm(f=>({...f,quinzena:e.target.value}))} required style={inp}/>
              </div>
              <div>
                <label style={lbl}>INSS/IRPF (R$)</label>
                <input type="number" step="0.01" min="0" value={form.inssIrpf} onChange={e=>setForm(f=>({...f,inssIrpf:e.target.value}))} required style={inp}/>
              </div>
              <div style={{ gridColumn:'span 4' }}>
                <label style={lbl}>Observação</label>
                <input type="text" value={form.observacao} onChange={e=>setForm(f=>({...f,observacao:e.target.value}))} style={inp}/>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
              <button type="button" onClick={()=>{setShowForm(false); setEditandoId(null);}} style={{ padding:'8px 16px', border:'1px solid #d1d5db', borderRadius:8, fontSize:13, cursor:'pointer', background:'#fff' }}>Cancelar</button>
              <button type="submit" style={{ padding:'8px 20px', background:'#EB3238', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>Salvar</button>
            </div>
          </form>
        </div>
      )}

      {lista.length > 0 && (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', padding:'20px 16px', marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:16 }}>Comparativo por mês</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={[...lista].reverse().map(l => ({
              mes: fmtMes(l.mes),
              'Prévia':    parseFloat(l.previa   || 0),
              'Saldo':     parseFloat(l.saldo    || 0),
              'Salário':   parseFloat(l.salario  || 0),
              'Quinzena':  parseFloat(l.quinzena || 0),
              'INSS/IRPF': parseFloat(l.inssIrpf|| 0),
            }))} margin={{ top:4, right:16, left:16, bottom:4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="mes" tick={{ fontSize:11 }} />
              <YAxis tick={{ fontSize:11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits:2 })}`} />
              <Legend wrapperStyle={{ fontSize:12 }} />
              <Bar dataKey="Prévia"    fill="#EB3238" radius={[3,3,0,0]} />
              <Bar dataKey="Saldo"     fill="#f59e0b" radius={[3,3,0,0]} />
              <Bar dataKey="Salário"   fill="#3b82f6" radius={[3,3,0,0]} />
              <Bar dataKey="Quinzena"  fill="#10b981" radius={[3,3,0,0]} />
              <Bar dataKey="INSS/IRPF" fill="#8b5cf6" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'#f9fafb' }}>
              {['Mês','Motoristas','Prévia','Saldo','Salário','Quinzena','INSS/IRPF','Total Gasto','Registrado por',''].map(h=>(
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#6b7280', textTransform:'uppercase', borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map(l=>(
              <tr key={l.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                <td style={{ padding:'10px 14px', fontWeight:500 }}>{fmtMes(l.mes)}</td>
                <td style={{ padding:'10px 14px' }}>{l.motoristasFechados}</td>
                <td style={{ padding:'10px 14px' }}>{fmt(l.previa)}</td>
                <td style={{ padding:'10px 14px' }}>{fmt(l.saldo)}</td>
                <td style={{ padding:'10px 14px' }}>{fmt(l.salario)}</td>
                <td style={{ padding:'10px 14px' }}>{fmt(l.quinzena)}</td>
                <td style={{ padding:'10px 14px' }}>{fmt(l.inssIrpf)}</td>
                <td style={{ padding:'10px 14px', color:'#EB3238', fontWeight:600 }}>{fmt(total(l))}</td>
                <td style={{ padding:'10px 14px', fontSize:11, color:'#9ca3af' }}>{l.usuario?.nome || '—'}</td>
                <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}>
                  <button onClick={()=>abrirEdicao(l)} style={{ padding:'3px 10px', background:'#fff', border:'1px solid #d1d5db', borderRadius:6, fontSize:12, color:'#374151', cursor:'pointer', marginRight:6 }}>Editar</button>
                  <button onClick={()=>excluir(l.id)} style={{ padding:'3px 10px', background:'#fff', border:'1px solid #EB3238', borderRadius:6, fontSize:12, color:'#EB3238', cursor:'pointer' }}>Excluir</button>
                </td>
              </tr>
            ))}
            {lista.length===0 && <tr><td colSpan={10} style={{ padding:40, textAlign:'center', color:'#9ca3af' }}>Nenhum levantamento registrado</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
