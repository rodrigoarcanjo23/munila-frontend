import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { IoCartOutline, IoDownloadOutline, IoRefreshOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { contem, moeda, numero } from '../lib/format';
import { exportarExcel } from '../lib/exportar';
import type { Fornecedor } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Code, Empty, Field, Kpi, Loading, Notice, PageHeader, Panel, SearchInput, Segmented, useDialogo } from '../components/ui';

interface Linha {
  produtoId: string; sku: string; nome: string; tipo: string; categoria: string; fornecedorId?: string | null; fornecedor?: string | null;
  saldo: number; pendente: number; minimo: number; consumoPeriodo: number; consumoDiario: number; leadTimeDias: number;
  pontoPedido: number; coberturaDias: number | null; sugerido: number; custoUnitario: number; valorSugerido: number; urgencia: string;
}
const tomUrg = (u: string) => (u === 'Ruptura' ? 'bad' : u === 'Crítica' ? 'warn' : u === 'Repor' ? 'info' : 'ok') as 'bad' | 'warn' | 'info' | 'ok';

export default function SugestaoCompras() {
  const navigate = useNavigate();
  const { confirmar } = useDialogo();
  const [param, setParam] = useState({ dias: '90', cobertura: '30', seguranca: '7' });
  const [aplicado, setAplicado] = useState(param);
  const [filtro, setFiltro] = useState<'repor' | 'todos'>('repor');
  const [busca, setBusca] = useState('');
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [forn, setForn] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<string[]>([]);
  const [gerando, setGerando] = useState(false);

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [s, f] = await Promise.all([
      api.get<{ itens: Linha[] }>(`/compras/sugestao?dias=${aplicado.dias}&cobertura=${aplicado.cobertura}&seguranca=${aplicado.seguranca}`),
      api.get<Fornecedor[]>('/fornecedores'),
    ]);
    return { itens: s.data.itens, fornecedores: f.data };
  }, [aplicado]);

  useEffect(() => {
    if (!dados) return;
    setQtd(Object.fromEntries(dados.itens.map(i => [i.produtoId, i.sugerido])));
    setForn(Object.fromEntries(dados.itens.map(i => [i.produtoId, i.fornecedorId || ''])));
    setSel(dados.itens.filter(i => i.sugerido > 0).map(i => i.produtoId));
  }, [dados]);

  const linhas = useMemo(() => (dados?.itens ?? [])
    .filter(i => filtro === 'todos' || i.sugerido > 0 || i.urgencia === 'Ruptura')
    .filter(i => contem(busca, i.nome, i.sku, i.fornecedor, i.categoria)), [dados, filtro, busca]);
  const selecionadas = (dados?.itens ?? []).filter(i => sel.includes(i.produtoId) && (qtd[i.produtoId] || 0) > 0);
  const total = selecionadas.reduce((a, i) => a + (qtd[i.produtoId] || 0) * i.custoUnitario, 0);
  const semFornecedor = selecionadas.filter(i => !forn[i.produtoId]);

  async function gerar() {
    if (selecionadas.length === 0) return toast.warn('Selecione ao menos um item com quantidade.');
    if (semFornecedor.length) return toast.warn(`Escolha o fornecedor de ${semFornecedor.length} item(ns).`);
    if (!(await confirmar({ titulo: `Gerar ${selecionadas.length} pedido(s)?`, mensagem: <>Valor total estimado: <b>{moeda(total)}</b>. Cada item vira um pedido de compra pendente.</>, confirmar: 'Gerar pedidos' }))) return;
    setGerando(true);
    try {
      const itens = selecionadas.map(i => {
        const lead = i.leadTimeDias || 7;
        const prev = new Date(Date.now() + lead * 86400000).toISOString().slice(0, 10);
        return { produtoId: i.produtoId, fornecedorId: forn[i.produtoId], quantidade: qtd[i.produtoId], custoTotal: qtd[i.produtoId] * i.custoUnitario, dataPrevisao: `${prev}T00:00:00.000Z`, observacao: 'Gerado pela sugestão de compras' };
      });
      const { data } = await api.post('/pedidos-compra/lote', { itens });
      toast.success(`${data.length} pedido(s) gerado(s).`);
      navigate('/compras');
    } catch (e) { toast.error(msgErro(e)); } finally { setGerando(false); }
  }

  const colunas: Col<Linha>[] = [
    { key: 'sel', titulo: '', ocultarCelular: false, rotulo: 'Incluir', render: i => <input type="checkbox" aria-label={`Incluir ${i.nome}`} checked={sel.includes(i.produtoId)} onChange={e => setSel(s => (e.target.checked ? [...s, i.produtoId] : s.filter(x => x !== i.produtoId)))} /> },
    { key: 'prod', titulo: 'Produto', principal: true, ordenar: i => i.nome, render: i => <><div className="cell-title">{i.nome}</div><div className="cell-sub"><Code>{i.sku}</Code> {i.categoria}</div></> },
    { key: 'urg', titulo: 'Situação', ordenar: i => ({ Ruptura: 0, Crítica: 1, Repor: 2, OK: 3 }[i.urgencia] ?? 4), render: i => <Badge tom={tomUrg(i.urgencia)}>{i.urgencia}</Badge> },
    { key: 'saldo', titulo: 'Saldo', align: 'right', ordenar: i => i.saldo, render: i => <>{numero(i.saldo)}{i.pendente > 0 && <div className="cell-sub">+{numero(i.pendente)} a caminho</div>}</> },
    { key: 'cons', titulo: 'Consumo/dia', align: 'right', ocultarCelular: true, ordenar: i => i.consumoDiario, render: i => numero(i.consumoDiario, 2) },
    { key: 'cob', titulo: 'Cobertura', align: 'right', ordenar: i => i.coberturaDias ?? 99999, render: i => (i.coberturaDias === null ? <span className="muted">sem giro</span> : `${numero(i.coberturaDias)} dias`) },
    { key: 'pp', titulo: 'Ponto de pedido', align: 'right', ocultarCelular: true, ordenar: i => i.pontoPedido, render: i => numero(i.pontoPedido) },
    { key: 'forn', titulo: 'Fornecedor', render: i => (
      <select className="select" style={{ height: 32, minWidth: 150 }} value={forn[i.produtoId] || ''} onChange={e => setForn(f => ({ ...f, [i.produtoId]: e.target.value }))} aria-label="Fornecedor">
        <option value="">Escolher…</option>
        {dados?.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nomeEmpresa}</option>)}
      </select>
    ) },
    { key: 'qtd', titulo: 'Comprar', align: 'right', ordenar: i => qtd[i.produtoId] || 0, render: i => (
      <input className="input" style={{ width: 90, height: 32, textAlign: 'right', marginLeft: 'auto', fontWeight: 700 }} type="number" min={0} value={qtd[i.produtoId] ?? 0}
        onChange={e => setQtd(q => ({ ...q, [i.produtoId]: Math.max(0, Number(e.target.value) || 0) }))} aria-label="Quantidade a comprar" />
    ) },
    { key: 'val', titulo: 'Valor', align: 'right', ordenar: i => (qtd[i.produtoId] || 0) * i.custoUnitario, render: i => moeda((qtd[i.produtoId] || 0) * i.custoUnitario) },
  ];

  if (carregando && !dados) return <Loading />;
  const itens = dados?.itens ?? [];
  return (
    <>
      <PageHeader titulo="Sugestão de compras" descricao="Calcula o que comprar pelo consumo real, prazo de entrega do fornecedor, estoque mínimo e pedidos já a caminho."
        acoes={<>
          <button className="btn" onClick={() => exportarExcel('Sugestao_Compras', [{ nome: 'Sugestão', linhas, colunas: [
            { titulo: 'SKU', valor: i => i.sku }, { titulo: 'Produto', valor: i => i.nome, largura: 40 }, { titulo: 'Situação', valor: i => i.urgencia },
            { titulo: 'Saldo', valor: i => i.saldo }, { titulo: 'A caminho', valor: i => i.pendente }, { titulo: 'Consumo/dia', valor: i => i.consumoDiario },
            { titulo: 'Cobertura (dias)', valor: i => i.coberturaDias ?? '' }, { titulo: 'Ponto de pedido', valor: i => i.pontoPedido }, { titulo: 'Sugerido', valor: i => qtd[i.produtoId] ?? i.sugerido },
            { titulo: 'Custo unitário', valor: i => moeda(i.custoUnitario) }, { titulo: 'Fornecedor', valor: i => i.fornecedor || '-' },
          ] }])}><IoDownloadOutline /> Excel</button>
          <button className="btn btn--primary" onClick={gerar} disabled={gerando || selecionadas.length === 0}><IoCartOutline /> Gerar {selecionadas.length || ''} pedido(s)</button>
        </>} />

      <div className="kpis">
        <Kpi label="Em ruptura" valor={numero(itens.filter(i => i.urgencia === 'Ruptura').length)} tom="bad" />
        <Kpi label="Cobertura menor que o prazo" valor={numero(itens.filter(i => i.urgencia === 'Crítica').length)} tom="warn" />
        <Kpi label="Itens a repor" valor={numero(itens.filter(i => i.sugerido > 0).length)} />
        <Kpi label="Selecionado para compra" valor={moeda(total)} dica={`${selecionadas.length} item(ns)`} tom="primary" />
      </div>

      <Panel titulo="Parâmetros do cálculo" className="mb-16" descricao="Ponto de pedido = consumo diário × (prazo de entrega + dias de segurança), nunca abaixo do estoque mínimo.">
        <div className="form-grid">
          <Field label="Histórico de consumo (dias)" className="col-3"><input className="input" type="number" min={7} value={param.dias} onChange={e => setParam({ ...param, dias: e.target.value })} /></Field>
          <Field label="Comprar para cobrir (dias)" className="col-3"><input className="input" type="number" min={0} value={param.cobertura} onChange={e => setParam({ ...param, cobertura: e.target.value })} /></Field>
          <Field label="Estoque de segurança (dias)" className="col-3"><input className="input" type="number" min={0} value={param.seguranca} onChange={e => setParam({ ...param, seguranca: e.target.value })} /></Field>
          <div className="col-3" style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn btn--block" onClick={() => { setAplicado(param); if (JSON.stringify(param) === JSON.stringify(aplicado)) recarregar(); }}><IoRefreshOutline /> Recalcular</button></div>
        </div>
      </Panel>

      {semFornecedor.length > 0 && <div className="mb-16"><Notice tom="warn">{semFornecedor.length} item(ns) selecionado(s) sem fornecedor. Escolha na coluna “Fornecedor”.</Notice></div>}

      <Panel flush>
        <div className="toolbar">
          <Segmented valor={filtro} onChange={setFiltro} opcoes={[{ valor: 'repor', label: 'Precisam de compra' }, { valor: 'todos', label: 'Todos os produtos' }]} />
          <SearchInput value={busca} onChange={setBusca} placeholder="Produto, SKU, categoria ou fornecedor" />
        </div>
        <DataTable colunas={colunas} linhas={linhas} chave={i => i.produtoId} ordemInicial={{ key: 'urg', dir: 'asc' }}
          vazio={<Empty titulo="Nenhuma compra necessária">Todos os produtos estão acima do ponto de pedido com os parâmetros atuais.</Empty>} />
      </Panel>
    </>
  );
}
