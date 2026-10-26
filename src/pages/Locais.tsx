import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { IoAddOutline, IoPencilOutline, IoTrashOutline, IoPrintOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { contem } from '../lib/format';
import { imprimirEtiquetas } from '../lib/etiquetas';
import type { Localizacao, Produto } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Field, Kpi, Loading, Loc, Modal, PageHeader, Panel, SearchInput, useDialogo } from '../components/ui';

const vazio = { codigo: '', zona: '', corredor: '', prateleira: '' };

export default function Locais() {
  const { confirmar } = useDialogo();
  const [busca, setBusca] = useState('');
  const [zona, setZona] = useState('');
  const [form, setForm] = useState<typeof vazio | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [l, p] = await Promise.all([api.get<Localizacao[]>('/localizacoes'), api.get<Produto[]>('/produtos')]);
    return { locais: l.data, produtos: p.data };
  });

  const ocupacao = useMemo(() => {
    const m = new Map<string, number>();
    dados?.produtos.forEach(p => { if (p.enderecoLocalizacao) m.set(p.enderecoLocalizacao.toUpperCase(), (m.get(p.enderecoLocalizacao.toUpperCase()) || 0) + 1); });
    return m;
  }, [dados]);
  const zonas = [...new Set((dados?.locais ?? []).map(l => l.zona))].sort();
  const linhas = (dados?.locais ?? []).filter(l => (!zona || l.zona === zona) && contem(busca, l.codigo, l.zona, l.corredor, l.prateleira));
  const ocupados = (dados?.locais ?? []).filter(l => ocupacao.get(l.codigo.toUpperCase())).length;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    try {
      if (editandoId) await api.put(`/localizacoes/${editandoId}`, form); else await api.post('/localizacoes', form);
      toast.success(editandoId ? 'Endereço atualizado.' : 'Endereço criado.');
      setForm(null); setEditandoId(null); recarregar(true);
    } catch (err) { toast.error(msgErro(err)); }
  }

  async function excluir(l: Localizacao) {
    if (!(await confirmar({ titulo: `Excluir ${l.codigo}?`, mensagem: 'O endereço será removido do cadastro.', confirmar: 'Excluir', perigo: true }))) return;
    try { await api.delete(`/localizacoes/${l.id}`); toast.success('Endereço excluído.'); recarregar(true); } catch (err) { toast.error(msgErro(err)); }
  }

  const etiquetas = (lista: Localizacao[]) => imprimirEtiquetas(lista.map(l => ({ codigo: l.codigo, titulo: l.codigo, linha2: `${l.zona} | ${l.corredor} | ${l.prateleira}`, destaque: true })));

  const colunas: Col<Localizacao>[] = [
    { key: 'sel', titulo: <input type="checkbox" aria-label="Selecionar todos" checked={linhas.length > 0 && selecionados.length === linhas.length} onChange={e => setSelecionados(e.target.checked ? linhas.map(l => l.id) : [])} />, ocultarCelular: true,
      render: l => <input type="checkbox" aria-label={`Selecionar ${l.codigo}`} checked={selecionados.includes(l.id)} onChange={e => setSelecionados(s => (e.target.checked ? [...s, l.id] : s.filter(x => x !== l.id)))} /> },
    { key: 'cod', titulo: 'Endereço', principal: true, ordenar: l => l.codigo, render: l => <Loc>{l.codigo}</Loc> },
    { key: 'zona', titulo: 'Zona', ordenar: l => l.zona, render: l => <Badge tom="primary" plain>{l.zona}</Badge> },
    { key: 'mod', titulo: 'Módulo de armazenagem', ordenar: l => l.corredor, render: l => l.corredor },
    { key: 'prat', titulo: 'Prateleira / célula', ordenar: l => l.prateleira, render: l => l.prateleira },
    { key: 'oc', titulo: 'Produtos', align: 'right', ordenar: l => ocupacao.get(l.codigo.toUpperCase()) || 0, render: l => ocupacao.get(l.codigo.toUpperCase()) || <span className="muted">Livre</span> },
  ];

  if (carregando && !dados) return <Loading />;

  return (
    <>
      <PageHeader titulo="Endereços" descricao="Zonas, módulos e prateleiras do armazém. Imprima etiquetas com código de barras para as prateleiras."
        acoes={<>
          <button className="btn" onClick={() => etiquetas(selecionados.length ? linhas.filter(l => selecionados.includes(l.id)) : linhas)}><IoPrintOutline /> Etiquetas {selecionados.length ? `(${selecionados.length})` : '(todos)'}</button>
          <button className="btn btn--primary" onClick={() => { setForm(vazio); setEditandoId(null); }}><IoAddOutline /> Novo endereço</button>
        </>} />

      <div className="kpis">
        <Kpi label="Endereços cadastrados" valor={dados?.locais.length ?? 0} />
        <Kpi label="Ocupados" valor={ocupados} tom="primary" />
        <Kpi label="Livres" valor={(dados?.locais.length ?? 0) - ocupados} />
        <Kpi label="Zonas" valor={zonas.length} />
      </div>

      <Panel flush>
        <div className="toolbar">
          <SearchInput value={busca} onChange={setBusca} placeholder="Código, zona, módulo ou prateleira" />
          <select className="select" value={zona} onChange={e => setZona(e.target.value)} aria-label="Zona">
            <option value="">Todas as zonas</option>
            {zonas.map(z => <option key={z}>{z}</option>)}
          </select>
        </div>
        <DataTable colunas={colunas} linhas={linhas} chave={l => l.id} ordemInicial={{ key: 'cod', dir: 'asc' }}
          acoes={l => (
            <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
              <button className="icon-btn" title="Etiqueta" aria-label="Imprimir etiqueta" onClick={() => etiquetas([l])}><IoPrintOutline /></button>
              <button className="icon-btn" title="Editar" aria-label="Editar" onClick={() => { setForm({ codigo: l.codigo, zona: l.zona, corredor: l.corredor, prateleira: l.prateleira }); setEditandoId(l.id); }}><IoPencilOutline /></button>
              <button className="icon-btn icon-btn--bad" title="Excluir" aria-label="Excluir" onClick={() => excluir(l)}><IoTrashOutline /></button>
            </div>
          )} />
      </Panel>

      {form && (
        <Modal aberto onFechar={() => setForm(null)} titulo={editandoId ? `Editar ${form.codigo}` : 'Novo endereço'} tamanho="md"
          rodape={<><button className="btn" onClick={() => setForm(null)}>Cancelar</button><button className="btn btn--primary" form="form-local">{editandoId ? 'Salvar endereço' : 'Criar endereço'}</button></>}>
          <form id="form-local" onSubmit={salvar} className="form-grid">
            <Field label="Código" className="col-6" dica="Ex.: R01-P01"><input className="input" required value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} /></Field>
            <Field label="Zona" className="col-6" dica="Ex.: Picking, Pulmão, Quarentena">
              <input className="input" required list="zonas" value={form.zona} onChange={e => setForm({ ...form, zona: e.target.value })} />
              <datalist id="zonas">{zonas.map(z => <option key={z} value={z} />)}</datalist>
            </Field>
            <Field label="Módulo de armazenagem" className="col-6"><input className="input" required value={form.corredor} onChange={e => setForm({ ...form, corredor: e.target.value })} placeholder="Módulo 01" /></Field>
            <Field label="Prateleira / célula" className="col-6"><input className="input" required value={form.prateleira} onChange={e => setForm({ ...form, prateleira: e.target.value })} placeholder="A" /></Field>
          </form>
        </Modal>
      )}
    </>
  );
}
