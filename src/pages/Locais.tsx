import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { IoAddOutline, IoPencilOutline, IoTrashOutline, IoPrintOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { contem, numero } from '../lib/format';
import { etiquetaDoEndereco, imprimirEtiquetasEndereco, partesDoEndereco } from '../lib/etiquetas';
import { codigoBarras, codigoPadrao, depositoRotulo } from '../lib/enderecos';
import type { Armazem, Localizacao } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { EnderecoDetalhe, EtiquetaEndereco } from '../components/Endereco';
import { Badge, Field, Kpi, Loading, Loc, Modal, Notice, PageHeader, Panel, SearchInput, Segmented, useDialogo } from '../components/ui';

// ✨ FASE 12: endereços no padrão RUA · COL · NIV · APT, com etiqueta e código de barras.
// Clicar num endereço mostra o que está guardado nele e onde mais cada item está.
const TIPOS = ['Picking', 'Pulmão', 'Chão', 'Doca'];
type Ocup = Record<string, { produtos: number; unidades: number }>;
type Filtro = 'todos' | 'ocupados' | 'livres';
interface Form { armazemId: string; rua: string; coluna: string; nivel: string; apartamento: string; tipo: string; zona: string; ativo: boolean; manterCodigo: boolean }
const vazio: Form = { armazemId: '', rua: '', coluna: '', nivel: '', apartamento: '', tipo: 'Picking', zona: '', ativo: true, manterCodigo: false };
const pad = (n: number | null | undefined, t: number) => (n == null ? '' : String(n).padStart(t, '0'));

export default function Locais() {
  const { confirmar } = useDialogo();
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState('');
  const [armazemId, setArmazemId] = useState('');
  const [tipo, setTipo] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [form, setForm] = useState<Form | null>(null);
  const [editando, setEditando] = useState<Localizacao | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const aberto = params.get('endereco');
  const abrir = (id: string | null) => { if (id) params.set('endereco', id); else params.delete('endereco'); setParams(params, { replace: !id }); };

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [l, o, a] = await Promise.all([api.get<Localizacao[]>('/localizacoes'), api.get<Ocup>('/localizacoes/ocupacao'), api.get<Armazem[]>('/armazens')]);
    return { locais: l.data, ocup: o.data, armazens: a.data };
  });
  const armazens = dados?.armazens ?? [];
  const padrao = armazens.find(a => a.padrao) ?? armazens[0];
  const ocup = (l: Localizacao) => dados?.ocup[l.id];

  const linhas = useMemo(() => (dados?.locais ?? [])
    .filter(l => !armazemId || l.armazemId === armazemId)
    .filter(l => !tipo || l.tipo === tipo)
    .filter(l => filtro === 'todos' || (filtro === 'ocupados' ? !!dados?.ocup[l.id] : !dados?.ocup[l.id]))
    .filter(l => contem(busca, l.codigo, l.codigoBarras, l.zona, l.tipo, l.rua ? `rua ${l.rua}` : '', l.armazem?.nome)), [dados, armazemId, tipo, filtro, busca]);
  const ocupados = (dados?.locais ?? []).filter(l => dados?.ocup[l.id]).length;
  const noPadrao = (dados?.locais ?? []).filter(l => partesDoEndereco(l)).length;

  function novo() { setEditando(null); setForm({ ...vazio, armazemId: armazemId || padrao?.id || '' }); }
  function editar(l: Localizacao) {
    const p = partesDoEndereco(l);
    setEditando(l);
    setForm({
      armazemId: l.armazemId || '', rua: p?.[0] ?? l.rua ?? '', coluna: p?.[1] ?? pad(l.modulo, 2), nivel: p?.[2] ?? pad(l.nivel, 3), apartamento: p?.[3] ?? pad(l.apartamento ?? (l.modulo != null ? 1 : null), 3),
      tipo: l.tipo || 'Picking', zona: l.zona || '', ativo: l.ativo !== false, manterCodigo: !p,
    });
  }
  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    try {
      const corpo = { ...form, armazemId: form.armazemId || null };
      if (editando) {
        const { data } = await api.put<{ produtosAtualizados?: number; codigo: string }>(`/localizacoes/${editando.id}`, corpo);
        toast.success(data.produtosAtualizados ? `Endereço salvo como ${data.codigo}. ${data.produtosAtualizados} produto(s) passaram a usar o novo código.` : 'Endereço salvo.');
      } else {
        const { data } = await api.post<Localizacao>('/localizacoes', corpo);
        toast.success(`Endereço ${data.codigo} criado.`);
      }
      setForm(null); setEditando(null); recarregar(true);
    } catch (err) { toast.error(msgErro(err), { autoClose: 8000 }); }
  }
  async function excluir(l: Localizacao) {
    if (!(await confirmar({ titulo: `Excluir ${l.codigo}?`, mensagem: 'O endereço sai do cadastro. Só é possível se não houver saldo guardado nele.', confirmar: 'Excluir', perigo: true }))) return;
    try { await api.delete(`/localizacoes/${l.id}`); toast.success('Endereço excluído.'); recarregar(true); } catch (err) { toast.error(msgErro(err)); }
  }
  const imprimir = (lista: Localizacao[]) => imprimirEtiquetasEndereco(lista.map(l => etiquetaDoEndereco(l, padrao)));

  const colunas: Col<Localizacao>[] = [
    { key: 'sel', titulo: <input type="checkbox" aria-label="Selecionar todos" checked={linhas.length > 0 && selecionados.length === linhas.length} onChange={e => setSelecionados(e.target.checked ? linhas.map(l => l.id) : [])} />, ocultarCelular: true,
      render: l => <input type="checkbox" aria-label={`Selecionar ${l.codigo}`} checked={selecionados.includes(l.id)} onClick={e => e.stopPropagation()} onChange={e => setSelecionados(s => (e.target.checked ? [...s, l.id] : s.filter(x => x !== l.id)))} /> },
    { key: 'cod', titulo: 'Endereço', principal: true, ordenar: l => l.codigo, render: l => <><Loc>{l.codigo}</Loc>{l.codigoBarras && <div className="cell-sub mono">{l.codigoBarras}</div>}</> },
    { key: 'rua', titulo: 'Rua', ocultarCelular: true, ordenar: l => l.rua ?? 'zz', render: l => l.rua ?? <span className="muted">-</span> },
    { key: 'col', titulo: 'Col', ocultarCelular: true, align: 'right', ordenar: l => l.modulo ?? 999, render: l => (l.modulo != null ? pad(l.modulo, 2) : <span className="muted">-</span>) },
    { key: 'niv', titulo: 'Niv', ocultarCelular: true, align: 'right', ordenar: l => l.nivel ?? 999, render: l => (l.nivel != null ? pad(l.nivel, 3) : <span className="muted">-</span>) },
    { key: 'apt', titulo: 'Apt', ocultarCelular: true, align: 'right', ordenar: l => l.apartamento ?? 999, render: l => (l.apartamento != null ? pad(l.apartamento, 3) : <span className="muted">-</span>) },
    { key: 'tipo', titulo: 'Tipo / zona', ordenar: l => `${l.tipo}${l.zona}`, render: l => <><Badge tom={l.tipo === 'Pulmão' ? 'info' : 'primary'} plain>{l.tipo ?? '-'}</Badge>{l.zona && l.zona.toLowerCase() !== (l.tipo ?? '').toLowerCase() && <div className="cell-sub">{l.zona}</div>}</> },
    { key: 'arm', titulo: 'Armazém', ocultarCelular: true, ordenar: l => l.armazem?.nome, render: l => l.armazem?.nome || <span className="muted">Não definido</span> },
    { key: 'itens', titulo: 'Itens', align: 'right', ordenar: l => ocup(l)?.produtos ?? 0, render: l => (ocup(l) ? <b>{numero(ocup(l)!.produtos)}</b> : <span className="muted">Livre</span>) },
    { key: 'un', titulo: 'Unidades', align: 'right', ordenar: l => ocup(l)?.unidades ?? 0, render: l => (ocup(l) ? numero(ocup(l)!.unidades) : <span className="muted">-</span>) },
  ];

  if (carregando && !dados) return <Loading />;

  // pré-visualização do formulário
  const armForm = armazens.find(a => a.id === form?.armazemId) ?? padrao;
  const codigoNovo = form ? codigoPadrao(form) : null;
  const codigoFinal = form && editando && (form.manterCodigo || !codigoNovo) ? editando.codigo : codigoNovo;
  const barrasNovo = form ? codigoBarras(armForm?.numero ?? 1, form) : null;
  const vaiRenomear = !!(editando && codigoNovo && !form?.manterCodigo && codigoNovo !== editando.codigo);

  return (
    <>
      <PageHeader titulo="Endereços" descricao="Padrão Rua · Col · Niv · Apt com etiqueta e código de barras. Clique num endereço para ver o que está guardado nele."
        acoes={<>
          <button className="btn" onClick={() => imprimir(selecionados.length ? linhas.filter(l => selecionados.includes(l.id)) : linhas)}><IoPrintOutline /> Etiquetas {selecionados.length ? `(${selecionados.length})` : `(${linhas.length})`}</button>
          <button className="btn btn--primary" onClick={novo}><IoAddOutline /> Novo endereço</button>
        </>} />

      <div className="kpis">
        <Kpi label="Endereços cadastrados" valor={numero(dados?.locais.length ?? 0)} />
        <Kpi label="Ocupados" valor={numero(ocupados)} tom="primary" onClick={() => setFiltro('ocupados')} />
        <Kpi label="Livres" valor={numero((dados?.locais.length ?? 0) - ocupados)} onClick={() => setFiltro('livres')} />
        <Kpi label="No padrão Rua·Col·Niv·Apt" valor={numero(noPadrao)} dica={noPadrao < (dados?.locais.length ?? 0) ? `${numero((dados?.locais.length ?? 0) - noPadrao)} no formato antigo` : undefined} />
      </div>

      <Panel flush>
        <div className="toolbar">
          <Segmented<Filtro> valor={filtro} onChange={setFiltro} opcoes={[{ valor: 'todos', label: 'Todos' }, { valor: 'ocupados', label: 'Ocupados' }, { valor: 'livres', label: 'Livres' }]} />
          <SearchInput value={busca} onChange={setBusca} placeholder="Endereço, código de barras, rua ou zona" />
          {armazens.length > 1 && <select className="select" value={armazemId} onChange={e => setArmazemId(e.target.value)} aria-label="Armazém">
            <option value="">Todos os armazéns</option>{armazens.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>}
          <select className="select" value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo">
            <option value="">Todos os tipos</option>{TIPOS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <DataTable colunas={colunas} linhas={linhas} chave={l => l.id} ordemInicial={{ key: 'cod', dir: 'asc' }} onLinha={l => abrir(l.id)}
          acoes={l => (
            <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
              <button className="icon-btn" title="Imprimir etiqueta" aria-label="Imprimir etiqueta" onClick={() => imprimir([l])}><IoPrintOutline /></button>
              <button className="icon-btn" title="Editar" aria-label="Editar" onClick={() => editar(l)}><IoPencilOutline /></button>
              <button className="icon-btn icon-btn--bad" title="Excluir" aria-label="Excluir" onClick={() => excluir(l)}><IoTrashOutline /></button>
            </div>
          )} />
      </Panel>

      {aberto && !form && <EnderecoDetalhe localId={aberto} padrao={padrao} onFechar={() => abrir(null)} onEditar={editar} onAbrirEndereco={id => abrir(id)} />}

      {form && (
        <Modal aberto onFechar={() => setForm(null)} titulo={editando ? `Editar endereço ${editando.codigo}` : 'Novo endereço'} tamanho="lg"
          rodape={<><button className="btn" onClick={() => setForm(null)}>Cancelar</button><button className="btn btn--primary" form="form-local">{editando ? 'Salvar endereço' : 'Criar endereço'}</button></>}>
          <form id="form-local" onSubmit={salvar} className="endf">
            <div className="endf__campos">
              <Field label="Armazém (depósito)">
                <select className="select" value={form.armazemId} onChange={e => setForm({ ...form, armazemId: e.target.value })}>
                  {armazens.map(a => <option key={a.id} value={a.id}>{depositoRotulo(a)}</option>)}
                </select>
              </Field>
              <div className="endf__partes" role="group" aria-label="Rua, coluna, nível e apartamento">
                {([['rua', 'Rua', 'Ex.: 21', 2], ['coluna', 'Col', '02', 2], ['nivel', 'Niv', '001', 3], ['apartamento', 'Apt', '001', 3]] as const).map(([k, rot, ph, max], i) => (
                  <label key={k} className="endf__parte">
                    <span>{rot}</span>
                    <input className="input" required value={form[k]} placeholder={ph} maxLength={k === 'rua' ? 4 : max} inputMode={k === 'rua' ? 'text' : 'numeric'} autoFocus={i === 0 && !editando}
                      onChange={e => setForm({ ...form, [k]: k === 'rua' ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') : e.target.value.replace(/\D/g, '') })} />
                  </label>
                ))}
              </div>
              <div className="form-grid">
                <Field label="Tipo" className="col-6"><select className="select" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></Field>
                <Field label="Zona" className="col-6" dica="Ex.: PICKING NORMAL, PULMAO NORMAL">
                  <input className="input" list="zonas-end" value={form.zona} placeholder={`${form.tipo} normal`.toUpperCase()} onChange={e => setForm({ ...form, zona: e.target.value.toUpperCase() })} />
                  <datalist id="zonas-end">{[...new Set((dados?.locais ?? []).map(l => l.zona))].map(z => <option key={z} value={z} />)}</datalist>
                </Field>
              </div>
              {editando && (
                <label className="check"><input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} /> Endereço ativo (aparece nas listas de escolha)</label>
              )}
              {editando && codigoNovo && codigoNovo !== editando.codigo && (
                <Notice tom={vaiRenomear ? 'warn' : 'info'}>
                  <label className="check" style={{ marginBottom: 6 }}><input type="checkbox" checked={form.manterCodigo} onChange={e => setForm({ ...form, manterCodigo: e.target.checked })} /> Manter o código atual <b>{editando.codigo}</b></label>
                  {vaiRenomear ? <>O endereço passa a se chamar <b>{codigoNovo}</b>. Os produtos que usam {editando.codigo} no cadastro são atualizados juntos; reimprima a etiqueta.</> : <>Desmarque para padronizar como <b>{codigoNovo}</b>.</>}
                </Notice>
              )}
              {form.rua && !/^\d+$/.test(form.rua) && <Notice tom="info">Rua com letra não gera o código de barras numérico de 13 dígitos; a etiqueta usa o próprio código do endereço.</Notice>}
            </div>
            <div className="endf__previa">
              <span className="endf__rotulo">Etiqueta</span>
              <EtiquetaEndereco deposito={depositoRotulo(armForm)} codigo={codigoFinal ?? ''} partes={codigoFinal ? partesDoEndereco({ codigo: codigoFinal }) : null} barras={(!editando || !form.manterCodigo) ? barrasNovo : editando.codigoBarras ?? null} />
              <small className="muted">100 × 50 mm · {barrasNovo && (!editando || !form.manterCodigo) ? <>código de barras <span className="mono">{barrasNovo}</span> (depósito + rua + col + niv + apt + dígito)</> : 'código de barras = código do endereço'}</small>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
