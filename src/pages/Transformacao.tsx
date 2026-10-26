import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { IoAddOutline, IoCheckmarkOutline, IoCloseOutline, IoPencilOutline, IoTrashOutline, IoArrowForwardOutline, IoDownloadOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { contem, dataHora, numero } from '../lib/format';
import { exportarExcel } from '../lib/exportar';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Code, Empty, Field, Loading, PageHeader, Panel, SearchInput, Segmented, useDialogo } from '../components/ui';

interface Item { id: string; tipo: 'INSUMO' | 'ACABADO'; sku: string; nome: string; quantidade: number; lote?: string | null }
interface Consumo { idInsumo: string; nomeInsumo: string; totalGasto: number }
interface Log { id: string; acao: string; detalhes: string; usuario: string; dataHora: string; loteInfo?: string | null; quantidadeInfo?: number | null }
interface Lote { id: string; codigoLote: string; produtoNome: string; produtoSku: string; quantidade: number; createdAt: string; receitaUsada: Consumo[] }

export default function Transformacao() {
  const { usuario } = useAuth();
  const { confirmar } = useDialogo();
  const [novo, setNovo] = useState({ nome: '', sku: '', lote: '', qtd: '' });
  const [consumo, setConsumo] = useState<Consumo[]>([]);
  const [insumoId, setInsumoId] = useState('');
  const [qtdInsumo, setQtdInsumo] = useState('1');
  const [final, setFinal] = useState({ nome: '', sku: '', lote: '', qtd: '1' });
  const [editando, setEditando] = useState<Item | null>(null);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [aba, setAba] = useState<'relatorio' | 'lotes'>('relatorio');
  const [buscaLog, setBuscaLog] = useState('');
  const [processando, setProcessando] = useState(false);

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [e, a, l] = await Promise.all([api.get<Item[]>('/transformacao/estoque'), api.get<Log[]>('/transformacao/auditoria'), api.get<Lote[]>('/transformacao/lotes')]);
    return { estoque: e.data, auditoria: a.data, lotes: l.data };
  });
  const estoque = useMemo(() => dados?.estoque ?? [], [dados]);
  const insumos = estoque.filter(i => i.tipo === 'INSUMO');
  const acabados = estoque.filter(i => i.tipo === 'ACABADO');

  const duplicado = (nome: string, sku: string, ignorar?: string) => estoque.some(i => i.id !== ignorar && (i.nome.trim().toLowerCase() === nome.trim().toLowerCase() || i.sku.trim().toLowerCase() === sku.trim().toLowerCase()));

  async function cadastrarInsumo(e: FormEvent) {
    e.preventDefault();
    if (!novo.nome || !novo.sku || Number(novo.qtd) <= 0) return toast.warn('Preencha nome, SKU e quantidade.');
    if (duplicado(novo.nome, novo.sku)) return toast.error('Este nome ou SKU já está cadastrado.');
    try {
      await api.post('/transformacao/estoque', { tipo: 'INSUMO', sku: novo.sku, nome: novo.nome, quantidade: Number(novo.qtd), lote: novo.lote, usuario: usuario?.nome });
      toast.success('Insumo cadastrado.');
      setNovo({ nome: '', sku: '', lote: '', qtd: '' });
      recarregar(true);
    } catch (err) { toast.error(msgErro(err)); }
  }

  function adicionarConsumo() {
    const mp = insumos.find(i => i.id === insumoId);
    const q = Number(qtdInsumo);
    if (!mp || q <= 0) return toast.warn('Selecione o insumo e a quantidade total gasta.');
    setConsumo(c => c.some(x => x.idInsumo === mp.id) ? c.map(x => (x.idInsumo === mp.id ? { ...x, totalGasto: x.totalGasto + q } : x)) : [...c, { idInsumo: mp.id, nomeInsumo: mp.nome, totalGasto: q }]);
    setInsumoId(''); setQtdInsumo('1');
  }

  async function transformar(e: FormEvent) {
    e.preventDefault();
    if (consumo.length === 0) return toast.warn('Adicione os insumos consumidos.');
    if (!final.nome || !final.sku || Number(final.qtd) <= 0) return toast.warn('Preencha nome, SKU e total gerado.');
    if (!final.lote) return toast.warn('O número do lote é obrigatório.');
    const existente = estoque.find(i => i.sku.toLowerCase() === final.sku.trim().toLowerCase());
    if (existente?.tipo === 'INSUMO') return toast.error('Este SKU pertence a um insumo.');
    for (const c of consumo) {
      const mp = insumos.find(m => m.id === c.idInsumo);
      if (!mp || mp.quantidade < c.totalGasto) return toast.error(`Saldo insuficiente de ${c.nomeInsumo}: precisa ${c.totalGasto}, tem ${mp?.quantidade ?? 0}.`);
    }
    setProcessando(true);
    try {
      await api.post('/transformacao/lotes', { produtoNome: final.nome, produtoSku: final.sku, quantidade: Number(final.qtd), codigoLote: final.lote, receitaUsada: consumo, usuario: usuario?.nome });
      toast.success(`Fabricados ${final.qtd} × ${final.nome} (lote ${final.lote}).`);
      setConsumo([]); setFinal({ nome: '', sku: '', lote: '', qtd: '1' });
      recarregar(true);
    } catch (err) { toast.error(msgErro(err, 'Erro ao processar a produção.')); } finally { setProcessando(false); }
  }

  async function salvarEdicao() {
    if (!editando) return;
    if (!editando.nome || !editando.sku || editando.quantidade < 0) return toast.warn('Dados inválidos.');
    if (duplicado(editando.nome, editando.sku, editando.id)) return toast.error('Nome ou SKU já em uso.');
    try {
      await api.put(`/transformacao/estoque/${editando.id}`, { ...editando, usuario: usuario?.nome });
      toast.success('Item atualizado.'); setEditando(null); recarregar(true);
    } catch (err) { toast.error(msgErro(err)); }
  }

  async function remover(i: Item) {
    if (consumo.some(c => c.idInsumo === i.id)) return toast.error('Este insumo está na operação atual.');
    if (!(await confirmar({ titulo: `Excluir ${i.nome}?`, mensagem: 'O item será removido do estoque de transformação. A exclusão fica no relatório.', confirmar: 'Excluir', perigo: true }))) return;
    try { await api.delete(`/transformacao/estoque/${i.id}`, { data: { usuario: usuario?.nome } }); toast.success('Item removido.'); recarregar(true); } catch (err) { toast.error(msgErro(err)); }
  }

  const linhas = estoque.filter(i => (!tipo || i.tipo === tipo) && contem(busca, i.nome, i.sku, i.lote));
  const logs = (dados?.auditoria ?? []).filter(l => contem(buscaLog, l.detalhes, l.usuario, l.loteInfo));
  const lotes = (dados?.lotes ?? []).filter(l => contem(buscaLog, l.codigoLote, l.produtoNome, l.produtoSku));

  const ed = (campo: keyof Item, w?: number) => editando && (
    <input className="input" style={{ height: 32, width: w }} type={campo === 'quantidade' ? 'number' : 'text'} value={String(editando[campo] ?? '')}
      onChange={e => setEditando({ ...editando, [campo]: campo === 'quantidade' ? Number(e.target.value) : e.target.value })} aria-label={campo} />
  );
  const colunas: Col<Item>[] = [
    { key: 'tipo', titulo: 'Tipo', ordenar: i => i.tipo, render: i => <Badge tom={i.tipo === 'INSUMO' ? 'info' : 'ok'} plain>{i.tipo === 'INSUMO' ? 'Matéria-prima' : 'Acabado'}</Badge> },
    { key: 'sku', titulo: 'SKU', ordenar: i => i.sku, render: i => (editando?.id === i.id ? ed('sku', 120) : <Code>{i.sku}</Code>) },
    { key: 'nome', titulo: 'Nome', principal: true, ordenar: i => i.nome, render: i => (editando?.id === i.id ? ed('nome') : <span className="cell-title">{i.nome}</span>) },
    { key: 'lote', titulo: 'Lote', ordenar: i => i.lote || '', render: i => (editando?.id === i.id ? ed('lote', 110) : i.lote || '-') },
    { key: 'q', titulo: 'Saldo', align: 'right', ordenar: i => i.quantidade, render: i => (editando?.id === i.id ? ed('quantidade', 90) : <span className={`qty ${i.quantidade <= 0 ? 'qty--bad' : ''}`}>{numero(i.quantidade, i.quantidade % 1 ? 2 : 0)}</span>) },
  ];

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Transformação" descricao="Conversão de insumos em produtos acabados, com lote obrigatório e relatório de produção." />

      <div className="grid grid-2 mb-16">
        <Panel titulo="1. Insumos (matéria-prima)" descricao={`${insumos.length} insumo(s) cadastrado(s)`}>
          <form onSubmit={cadastrarInsumo} className="form-grid">
            <Field label="Nome" className="col-12"><input className="input" value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Tecido azul" /></Field>
            <Field label="SKU" className="col-4"><input className="input" value={novo.sku} onChange={e => setNovo({ ...novo, sku: e.target.value })} /></Field>
            <Field label="Lote (opcional)" className="col-4"><input className="input" value={novo.lote} onChange={e => setNovo({ ...novo, lote: e.target.value })} /></Field>
            <Field label="Quantidade" className="col-4"><input className="input" type="number" min={0} step="any" value={novo.qtd} onChange={e => setNovo({ ...novo, qtd: e.target.value })} /></Field>
            <div className="col-12"><button className="btn btn--block"><IoAddOutline /> Cadastrar insumo</button></div>
          </form>
          <div className="mt-16" style={{ maxHeight: 260, overflowY: 'auto' }}>
            {insumos.length === 0 ? <Empty titulo="Nenhum insumo cadastrado" /> : (
              <table className="table"><tbody>
                {insumos.map(m => <tr key={m.id}><td><div className="cell-title">{m.nome}</div><div className="cell-sub"><Code>{m.sku}</Code>{m.lote && <> Lote {m.lote}</>}</div></td><td className="num"><b>{numero(m.quantidade, m.quantidade % 1 ? 2 : 0)}</b></td></tr>)}
              </tbody></table>
            )}
          </div>
        </Panel>

        <Panel titulo="2. Motor de transformação" descricao="Informe o total gasto de cada insumo e o total gerado do produto.">
          <div className="form-grid">
            <Field label="Insumo consumido" className="col-8">
              <select className="select" value={insumoId} onChange={e => setInsumoId(e.target.value)}>
                <option value="">Selecione…</option>
                {insumos.map(m => <option key={m.id} value={m.id}>[{m.sku}] {m.nome} (saldo {numero(m.quantidade)})</option>)}
              </select>
            </Field>
            <Field label="Total gasto" className="col-4">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" type="number" min={0.01} step="any" value={qtdInsumo} onChange={e => setQtdInsumo(e.target.value)} />
                <button type="button" className="btn" onClick={adicionarConsumo} aria-label="Adicionar insumo"><IoAddOutline /></button>
              </div>
            </Field>
          </div>
          <div className="mt-8" style={{ border: '1px dashed var(--line-strong)', borderRadius: 8, padding: 8, minHeight: 64 }}>
            {consumo.length === 0 ? <p className="muted" style={{ textAlign: 'center', padding: 12 }}>Nenhum insumo adicionado à operação.</p> : consumo.map(c => (
              <div key={c.idInsumo} className="row" style={{ padding: '4px 6px' }}>
                <span className="cell-title" style={{ flex: 1 }}>{c.nomeInsumo}</span>
                <span className="down">−{numero(c.totalGasto, c.totalGasto % 1 ? 2 : 0)}</span>
                <button type="button" className="icon-btn icon-btn--bad" aria-label="Remover" onClick={() => setConsumo(x => x.filter(y => y.idInsumo !== c.idInsumo))}><IoCloseOutline /></button>
              </div>
            ))}
          </div>
          <form onSubmit={transformar} className="form-grid mt-16">
            <Field label="Repetir produto existente" className="col-12">
              <select className="select" value="" onChange={e => { const p = acabados.find(a => a.id === e.target.value); if (p) setFinal(f => ({ ...f, nome: p.nome, sku: p.sku, lote: p.lote || '' })); }}>
                <option value="">Novo produto…</option>
                {acabados.map(p => <option key={p.id} value={p.id}>{p.nome} (lote {p.lote || 's/l'})</option>)}
              </select>
            </Field>
            <Field label="Produto gerado" className="col-12"><input className="input" value={final.nome} onChange={e => setFinal({ ...final, nome: e.target.value })} placeholder="Ex.: Display 833" /></Field>
            <Field label="SKU" className="col-4"><input className="input" value={final.sku} onChange={e => setFinal({ ...final, sku: e.target.value })} /></Field>
            <Field label="Lote" className="col-4"><input className="input" value={final.lote} onChange={e => setFinal({ ...final, lote: e.target.value })} required placeholder="L-2026" /></Field>
            <Field label="Total gerado" className="col-4"><input className="input" type="number" min={1} step="any" value={final.qtd} onChange={e => setFinal({ ...final, qtd: e.target.value })} /></Field>
            <div className="col-12"><button className="btn btn--primary btn--block btn--lg" disabled={processando}>{processando ? 'Processando…' : <>Confirmar transformação <IoArrowForwardOutline /></>}</button></div>
          </form>
        </Panel>
      </div>

      <Panel flush titulo="Estoque de transformação" className="mb-16">
        <div className="toolbar">
          <SearchInput value={busca} onChange={setBusca} placeholder="Nome, SKU ou lote" />
          <select className="select" value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo"><option value="">Todos os tipos</option><option value="INSUMO">Matéria-prima</option><option value="ACABADO">Produto acabado</option></select>
        </div>
        <DataTable colunas={colunas} linhas={linhas} chave={i => i.id} ordemInicial={{ key: 'nome', dir: 'asc' }}
          acoes={i => editando?.id === i.id ? (
            <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
              <button className="icon-btn" aria-label="Salvar" onClick={salvarEdicao}><IoCheckmarkOutline /></button>
              <button className="icon-btn" aria-label="Cancelar" onClick={() => setEditando(null)}><IoCloseOutline /></button>
            </div>
          ) : (
            <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
              <button className="icon-btn" aria-label="Editar" onClick={() => setEditando(i)}><IoPencilOutline /></button>
              <button className="icon-btn icon-btn--bad" aria-label="Excluir" onClick={() => remover(i)}><IoTrashOutline /></button>
            </div>
          )} />
      </Panel>

      <Panel flush titulo="Relatório de produção" acoes={<button className="btn btn--sm" onClick={() => exportarExcel('Relatorio_Producao', [{ nome: 'Relatório', linhas: logs, colunas: [
        { titulo: 'Data', valor: l => dataHora(l.dataHora) }, { titulo: 'Ação', valor: l => l.acao }, { titulo: 'Lote', valor: l => l.loteInfo || '' },
        { titulo: 'Quantidade', valor: l => l.quantidadeInfo ?? '' }, { titulo: 'Detalhes', valor: l => l.detalhes, largura: 70 }, { titulo: 'Usuário', valor: l => l.usuario },
      ] }])}><IoDownloadOutline /> Excel</button>}>
        <div className="toolbar">
          <Segmented valor={aba} onChange={setAba} opcoes={[{ valor: 'relatorio', label: 'Registros', n: logs.length }, { valor: 'lotes', label: 'Lotes produzidos', n: lotes.length }]} />
          <SearchInput value={buscaLog} onChange={setBuscaLog} placeholder="Lote, produto ou usuário" />
        </div>
        {aba === 'relatorio' ? (
          <DataTable linhas={logs} chave={l => l.id} ordemInicial={{ key: 'd', dir: 'desc' }} colunas={[
            { key: 'd', titulo: 'Data', ordenar: l => l.dataHora, render: l => dataHora(l.dataHora) },
            { key: 'a', titulo: 'Ação', render: l => <Badge tom={l.acao === 'Criação' ? 'ok' : l.acao === 'Exclusão' ? 'bad' : 'warn'}>{l.acao}</Badge> },
            { key: 'det', titulo: 'Detalhes', principal: true, render: l => <>{l.detalhes}{l.loteInfo && <div className="cell-sub">Lote {l.loteInfo}</div>}</> },
            { key: 'q', titulo: 'Qtd.', align: 'right', render: l => (l.quantidadeInfo != null ? numero(l.quantidadeInfo) : '-') },
            { key: 'u', titulo: 'Usuário', render: l => l.usuario },
          ]} />
        ) : (
          <DataTable linhas={lotes} chave={l => l.id} ordemInicial={{ key: 'd', dir: 'desc' }} colunas={[
            { key: 'd', titulo: 'Data', ordenar: l => l.createdAt, render: l => dataHora(l.createdAt) },
            { key: 'lote', titulo: 'Lote', ordenar: l => l.codigoLote, render: l => <Code>{l.codigoLote}</Code> },
            { key: 'p', titulo: 'Produto', principal: true, ordenar: l => l.produtoNome, render: l => <><div className="cell-title">{l.produtoNome}</div><div className="cell-sub">{(l.receitaUsada || []).map(r => `${r.nomeInsumo} −${r.totalGasto}`).join(', ')}</div></> },
            { key: 'q', titulo: 'Quantidade', align: 'right', ordenar: l => l.quantidade, render: l => numero(l.quantidade) },
          ]} />
        )}
      </Panel>
    </>
  );
}
