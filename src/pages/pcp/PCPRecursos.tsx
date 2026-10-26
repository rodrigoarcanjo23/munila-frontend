import { useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { IoAddOutline, IoPencilOutline, IoTrashOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { numero } from '../../lib/format';
import { diaMes, type Recurso } from '../../lib/pcp';
import { Badge, Code, Empty, Field, Loading, Modal, PageHeader, useDialogo } from '../../components/ui';
import './pcp.css';

const TIPOS = ['Linha', 'Célula', 'Bancada', 'Máquina', 'Terceiro'];
type Form = { id?: string; codigo: string; nome: string; tipo: string; capacidadeDia: string; diasSemana: string; eficiencia: string; ativo: boolean; observacao: string };
const VAZIO: Form = { codigo: '', nome: '', tipo: 'Linha', capacidadeDia: '', diasSemana: '5', eficiencia: '85', ativo: true, observacao: '' };

export default function PCPRecursos() {
  const { confirmar } = useDialogo();
  const [form, setForm] = useState<Form | null>(null);
  const { dados, carregando, recarregar } = useCarregar(async () => (await api.get<{ semanas: string[]; recursos: Recurso[] }>('/pcp/recursos')).data);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    try {
      if (form.id) await api.put(`/pcp/recursos/${form.id}`, form); else await api.post('/pcp/recursos', form);
      toast.success(form.id ? 'Recurso atualizado.' : 'Recurso criado.');
      setForm(null); recarregar(true);
    } catch (err) { toast.error(msgErro(err)); }
  }
  async function excluir(r: Recurso) {
    if (!(await confirmar({ titulo: `Excluir ${r.nome}?`, mensagem: 'Se o recurso já foi usado em ordens, ele é apenas inativado para manter o histórico.', confirmar: 'Excluir', perigo: true }))) return;
    try {
      const resp = await api.delete<{ mensagem?: string }>(`/pcp/recursos/${r.id}`);
      toast.success(resp.data?.mensagem || 'Recurso excluído.'); recarregar(true);
    } catch (err) { toast.error(msgErro(err)); }
  }
  const cap = form ? Number(form.capacidadeDia || 0) * Number(form.diasSemana || 0) * (Number(form.eficiencia || 0) / 100) : 0;

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Recursos e capacidade" descricao="Linhas, células e bancadas onde a produção acontece. A capacidade efetiva (unidades por dia × dias × eficiência) é a base da carga na programação e no plano mestre."
        acoes={<button className="btn btn--primary" onClick={() => setForm({ ...VAZIO })}><IoAddOutline /> Novo recurso</button>} />
      {!dados?.recursos.length ? (
        <div className="panel"><Empty titulo="Nenhum recurso cadastrado">Cadastre cada linha ou bancada com quantas unidades ela produz por dia. <button className="btn btn--primary btn--sm mt-8" onClick={() => setForm({ ...VAZIO })}><IoAddOutline /> Novo recurso</button></Empty></div>
      ) : (
        <div className="rec-grid">
          {dados.recursos.map(r => (
            <article key={r.id} className={`panel rec-card ${r.ativo ? '' : 'is-inativo'}`}>
              <header>
                <div><Code>{r.codigo}</Code> <Badge plain>{r.tipo}</Badge>{!r.ativo && <Badge tom="bad" plain>Inativo</Badge>}<h3>{r.nome}</h3></div>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="icon-btn" aria-label="Editar" onClick={() => setForm({ id: r.id, codigo: r.codigo, nome: r.nome, tipo: r.tipo, capacidadeDia: String(r.capacidadeDia), diasSemana: String(r.diasSemana), eficiencia: String(r.eficiencia), ativo: r.ativo, observacao: r.observacao ?? '' })}><IoPencilOutline /></button>
                  <button className="icon-btn icon-btn--bad" aria-label="Excluir" onClick={() => excluir(r)}><IoTrashOutline /></button>
                </div>
              </header>
              <dl className="rec-nums">
                <div><dt>Por dia</dt><dd>{numero(r.capacidadeDia)}</dd></div>
                <div><dt>Dias úteis</dt><dd>{r.diasSemana}</dd></div>
                <div><dt>Eficiência</dt><dd>{numero(r.eficiencia)}%</dd></div>
                <div><dt title="Capacidade efetiva por semana">Semana</dt><dd>{numero(r.capacidadeSemana)}</dd></div>
              </dl>
              {r.ativo && (
                <div className="rec-carga">
                  <span className="muted">Carga das próximas semanas · {r.ordensAbertas} OP(s) abertas</span>
                  <div className="rec-carga__barras">
                    {(r.carga ?? []).map((c, i) => {
                      const t = c.pct === null ? 'nd' : c.pct > 100 ? 'bad' : c.pct >= 85 ? 'warn' : 'ok';
                      return (
                        <div key={i} className={`rec-carga__sem is-${t}`} title={`${numero(c.carga)} un`}>
                          <span className="rec-carga__col"><i style={{ height: `${Math.min(100, c.pct ?? 0)}%` }} /></span>
                          <b>{c.pct === null ? '-' : `${c.pct}%`}</b>
                          <small>{diaMes(dados.semanas[i])}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {r.observacao && <p className="muted rec-obs">{r.observacao}</p>}
            </article>
          ))}
        </div>
      )}

      {form && (
        <Modal aberto onFechar={() => setForm(null)} titulo={form.id ? 'Editar recurso' : 'Novo recurso'} tamanho="md"
          rodape={<><button className="btn" onClick={() => setForm(null)}>Cancelar</button><button className="btn btn--primary" form="form-rec">Salvar recurso</button></>}>
          <form id="form-rec" className="form-grid" onSubmit={salvar}>
            <Field label="Código" className="col-3"><input className="input" required value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} placeholder="L1" /></Field>
            <Field label="Nome" className="col-6"><input className="input" required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Linha de kits" /></Field>
            <Field label="Tipo" className="col-3"><select className="select" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Unidades por dia" className="col-4" dica="Capacidade nominal de um dia de trabalho"><input className="input" type="number" min={0} required value={form.capacidadeDia} onChange={e => setForm({ ...form, capacidadeDia: e.target.value })} /></Field>
            <Field label="Dias por semana" className="col-4"><input className="input" type="number" min={1} max={7} value={form.diasSemana} onChange={e => setForm({ ...form, diasSemana: e.target.value })} /></Field>
            <Field label="Eficiência (%)" className="col-4" dica="Desconta setup, paradas e pausas"><input className="input" type="number" min={1} max={100} value={form.eficiencia} onChange={e => setForm({ ...form, eficiencia: e.target.value })} /></Field>
            <Field label="Observação" className="col-12"><input className="input" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} placeholder="Turno, operadores, restrições" /></Field>
            <div className="col-12 row" style={{ justifyContent: 'space-between' }}>
              <label className="check"><input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} /> Ativo</label>
              <span className="muted">Capacidade efetiva: <b>{numero(cap)}</b> un/semana</span>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
