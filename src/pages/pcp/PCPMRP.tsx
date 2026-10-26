import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { IoCartOutline, IoConstructOutline, IoDownloadOutline, IoRefreshOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { contem, dataUTC, moeda, numero } from '../../lib/format';
import { exportarExcel } from '../../lib/exportar';
import { diaMes } from '../../lib/pcp';
import type { Fornecedor } from '../../lib/tipos';
import { DataTable, type Col } from '../../components/DataTable';
import { Badge, Code, Empty, Kpi, Loading, Modal, PageHeader, Panel, SearchInput, Segmented, useDialogo } from '../../components/ui';
import './pcp.css';

interface SemanaMRP { bruta: number; recebimentos: number; projetado: number; liquida: number; liberar: number | null }
interface ItemMRP {
  produtoId: string; nome: string; sku: string; unidade: string; acao: 'Comprar' | 'Produzir'; nivel: number;
  fornecedor: { id: string; nome: string } | null; custo: number; leadTimeDias: number; saldo: number; seguranca: number; emPedido: number;
  semanas: SemanaMRP[]; totalLiquido: number; valor: number; atrasado: boolean; liberarEm: string | null; precisaEm: string | null;
}
interface Resp { semanas: string[]; itens: ItemMRP[]; resumo: { itens: number; comNecessidade: number; atrasados: number; valorComprar: number; itensComprar: number; itensProduzir: number } }

export default function PCPMRP() {
  const { confirmar } = useDialogo();
  const [n, setN] = useState(8);
  const [filtro, setFiltro] = useState<'necessidade' | 'Comprar' | 'Produzir' | 'todos'>('necessidade');
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [fornEscolhido, setFornEscolhido] = useState<Record<string, string>>({});
  const [detalhe, setDetalhe] = useState<ItemMRP | null>(null);
  const [gerando, setGerando] = useState(false);
  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [m, f] = await Promise.all([api.get<Resp>(`/pcp/mrp?semanas=${n}`), api.get<Fornecedor[]>('/fornecedores')]);
    return { mrp: m.data, fornecedores: f.data };
  }, [n]);

  const itens = useMemo(() => (dados?.mrp.itens ?? []).filter(i =>
    (filtro === 'todos' || (filtro === 'necessidade' ? i.totalLiquido > 0 : i.acao === filtro && i.totalLiquido > 0)) && contem(busca, i.nome, i.sku, i.fornecedor?.nome)), [dados, filtro, busca]);
  const selecionados = (dados?.mrp.itens ?? []).filter(i => sel.has(i.produtoId) && i.totalLiquido > 0);
  const fornDe = (i: ItemMRP) => fornEscolhido[i.produtoId] ?? i.fornecedor?.id ?? '';
  const alternar = (id: string) => setSel(s => { const c = new Set(s); if (c.has(id)) c.delete(id); else c.add(id); return c; });

  /** Data prevista de chegada: a data de uso, ou hoje + lead time quando já não dá tempo. */
  const chegada = (i: ItemMRP) => {
    const minima = new Date(Date.now() + i.leadTimeDias * 86400000).toISOString().slice(0, 10);
    return i.precisaEm && i.precisaEm.slice(0, 10) > minima ? i.precisaEm : minima;
  };
  async function gerar() {
    const comprar = selecionados.filter(i => i.acao === 'Comprar');
    const produzir = selecionados.filter(i => i.acao === 'Produzir');
    const semForn = comprar.filter(i => !fornDe(i));
    if (semForn.length) return toast.warn(`Escolha o fornecedor de: ${semForn.map(i => i.nome).join(', ')}.`);
    if (!(await confirmar({ titulo: 'Gerar documentos do MRP?', mensagem: `${comprar.length ? `${comprar.length} pedido(s) de compra (${moeda(comprar.reduce((a, i) => a + i.valor, 0))})` : ''}${comprar.length && produzir.length ? ' e ' : ''}${produzir.length ? `${produzir.length} ordem(ns) de produção planejada(s)` : ''} com as quantidades líquidas sugeridas.`, confirmar: 'Gerar' }))) return;
    setGerando(true);
    try {
      if (comprar.length) await api.post('/pedidos-compra/lote', { itens: comprar.map(i => ({ fornecedorId: fornDe(i), produtoId: i.produtoId, quantidade: i.totalLiquido, custoTotal: i.valor, dataPrevisao: chegada(i), observacao: `Gerado pelo MRP (necessário em ${dataUTC(i.precisaEm)})` })) });
      if (produzir.length) await api.post('/pcp/ordens/lote', { itens: produzir.map(i => ({ produtoId: i.produtoId, quantidade: i.totalLiquido, inicioPrevisto: i.liberarEm, entregaPrevista: i.precisaEm, origem: 'Sugestão', observacao: 'Gerada pelo MRP' })) });
      toast.success('Documentos gerados. O MRP foi recalculado.');
      setSel(new Set()); recarregar(true);
    } catch (err) { toast.error(msgErro(err)); } finally { setGerando(false); }
  }

  const colunas: Col<ItemMRP>[] = [
    { key: 'sel', titulo: '', render: i => i.totalLiquido > 0 ? <input type="checkbox" aria-label={`Selecionar ${i.nome}`} checked={sel.has(i.produtoId)} onClick={e => e.stopPropagation()} onChange={() => alternar(i.produtoId)} /> : null },
    { key: 'p', titulo: 'Item', principal: true, ordenar: i => i.nome, render: i => <><div className="cell-title">{i.nome}</div><div className="cell-sub"><Code>{i.sku}</Code> nível {i.nivel} · lead {i.leadTimeDias} d</div></> },
    { key: 'a', titulo: 'Ação', ordenar: i => i.acao, render: i => <Badge tom={i.acao === 'Comprar' ? 'info' : 'primary'} plain>{i.acao}</Badge> },
    { key: 's', titulo: 'Saldo', align: 'right', ordenar: i => i.saldo, render: i => numero(i.saldo) },
    { key: 'e', titulo: 'Em pedido / OP', align: 'right', ocultarCelular: true, ordenar: i => i.emPedido, render: i => (i.emPedido ? numero(i.emPedido) : <span className="muted">-</span>) },
    { key: 'b', titulo: 'Necessidade', align: 'right', ocultarCelular: true, ordenar: i => i.semanas.reduce((a, s) => a + s.bruta, 0), render: i => numero(i.semanas.reduce((a, s) => a + s.bruta, 0)) },
    { key: 'l', titulo: 'A pedir', align: 'right', ordenar: i => i.totalLiquido, render: i => (i.totalLiquido ? <b>{numero(i.totalLiquido)} {i.unidade}</b> : <span className="muted">Coberto</span>) },
    { key: 'li', titulo: 'Liberar até', ordenar: i => i.liberarEm, render: i => (i.liberarEm ? (i.atrasado ? <Badge tom="bad">Atrasado</Badge> : dataUTC(i.liberarEm)) : '-') },
    { key: 'pr', titulo: 'Precisa em', ordenar: i => i.precisaEm, render: i => dataUTC(i.precisaEm) },
    { key: 'f', titulo: 'Fornecedor', ocultarCelular: true, render: i => i.acao === 'Comprar' && i.totalLiquido > 0 ? (
      <select className="select select--sm" value={fornDe(i)} onClick={e => e.stopPropagation()} onChange={e => setFornEscolhido(f => ({ ...f, [i.produtoId]: e.target.value }))} aria-label="Fornecedor">
        <option value="">Escolher…</option>
        {dados?.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nomeEmpresa}</option>)}
      </select>
    ) : <span className="muted">{i.fornecedor?.nome ?? '-'}</span> },
    { key: 'v', titulo: 'Valor', align: 'right', ordenar: i => i.valor, render: i => (i.valor ? moeda(i.valor) : '-') },
  ];

  function exportar() {
    exportarExcel('MRP', [{
      nome: 'MRP', linhas: itens, colunas: [
        { titulo: 'SKU', valor: i => i.sku }, { titulo: 'Item', valor: i => i.nome, largura: 36 }, { titulo: 'Ação', valor: i => i.acao }, { titulo: 'Saldo', valor: i => i.saldo },
        { titulo: 'Em pedido/OP', valor: i => i.emPedido }, { titulo: 'Segurança', valor: i => i.seguranca }, { titulo: 'A pedir', valor: i => i.totalLiquido },
        { titulo: 'Liberar até', valor: i => (i.atrasado ? 'ATRASADO' : dataUTC(i.liberarEm)) }, { titulo: 'Precisa em', valor: i => dataUTC(i.precisaEm) },
        { titulo: 'Fornecedor', valor: i => dados?.fornecedores.find(f => f.id === fornDe(i))?.nomeEmpresa ?? '' }, { titulo: 'Valor', valor: i => Number(i.valor.toFixed(2)) },
        ...(dados?.mrp.semanas ?? []).map((s, k) => ({ titulo: `Líq. ${diaMes(s)}`, valor: (i: ItemMRP) => i.semanas[k].liquida })),
      ],
    }]);
  }

  if (carregando && !dados) return <Loading />;
  if (!dados) return null;
  const r = dados.mrp.resumo;
  return (
    <>
      <PageHeader titulo="MRP: necessidade de materiais" descricao="Explode o plano mestre e as ordens abertas pelas fichas técnicas, desconta saldo, pedidos em aberto e estoque de segurança, e diz o que comprar ou produzir e até quando."
        acoes={<>
          <select className="select" style={{ width: 'auto' }} value={n} onChange={e => setN(Number(e.target.value))} aria-label="Horizonte">
            <option value={4}>4 semanas</option><option value={8}>8 semanas</option><option value={12}>12 semanas</option><option value={16}>16 semanas</option>
          </select>
          <button className="btn" onClick={() => recarregar()}><IoRefreshOutline /> Recalcular</button>
          <button className="btn" onClick={exportar}><IoDownloadOutline /> Excel</button>
        </>} />
      <div className="kpis">
        <Kpi label="Itens com necessidade" valor={numero(r.comNecessidade)} dica={`de ${numero(r.itens)} itens das estruturas`} tom={r.comNecessidade ? 'warn' : 'ok'} />
        <Kpi label="Já deveriam ter sido pedidos" valor={numero(r.atrasados)} dica="O lead time não cabe até a data de uso" tom={r.atrasados ? 'bad' : 'ok'} />
        <Kpi label="A comprar" valor={moeda(r.valorComprar)} dica={`${numero(r.itensComprar)} item(ns)`} tom="primary" />
        <Kpi label="A produzir (semiacabados)" valor={numero(r.itensProduzir)} dica="Itens com ficha técnica usados em outras" />
      </div>
      <Panel flush>
        <div className="toolbar">
          <Segmented valor={filtro} onChange={setFiltro} opcoes={[{ valor: 'necessidade', label: 'Com necessidade' }, { valor: 'Comprar', label: 'Comprar' }, { valor: 'Produzir', label: 'Produzir' }, { valor: 'todos', label: 'Todos' }]} />
          <SearchInput value={busca} onChange={setBusca} placeholder="Item, SKU ou fornecedor" />
          <button className="btn btn--primary" disabled={!selecionados.length || gerando} onClick={gerar}>
            {selecionados.some(i => i.acao === 'Produzir') && !selecionados.some(i => i.acao === 'Comprar') ? <IoConstructOutline /> : <IoCartOutline />} Gerar {selecionados.length ? `(${selecionados.length})` : 'pedidos'}
          </button>
          {itens.some(i => i.totalLiquido > 0) && <button className="btn btn--ghost" onClick={() => setSel(new Set(itens.filter(i => i.totalLiquido > 0).map(i => i.produtoId)))}>Selecionar todos</button>}
        </div>
        <DataTable colunas={colunas} linhas={itens} chave={i => i.produtoId} onLinha={setDetalhe} destaque={i => i.atrasado}
          vazio={<Empty titulo="Nenhuma necessidade">{filtro === 'necessidade' ? 'O estoque e os pedidos em aberto cobrem o plano e as ordens do horizonte.' : 'Nenhum item com esse filtro.'}</Empty>} />
      </Panel>
      <p className="muted pcp-nota">Clique em um item para ver a conta semana a semana. Itens sem lead time cadastrado usam 7 dias (compra) ou 0 (produção).</p>

      {detalhe && (
        <Modal aberto onFechar={() => setDetalhe(null)} tamanho="xl" titulo={detalhe.nome} descricao={`${detalhe.sku} · ${detalhe.acao.toLowerCase()} · lead time ${detalhe.leadTimeDias} dias · segurança ${numero(detalhe.seguranca)} · saldo atual ${numero(detalhe.saldo)}`}>
          <div className="mps-scroll">
            <table className="mps mrp-grade">
              <thead><tr><th className="mps__fixa" />{dados.mrp.semanas.map(s => <th key={s}>Semana<b>{diaMes(s)}</b></th>)}</tr></thead>
              <tbody>
                <tr><th className="mps__fixa">Necessidade bruta</th>{detalhe.semanas.map((s, i) => <td key={i} className="num">{s.bruta ? numero(s.bruta) : '-'}</td>)}</tr>
                <tr><th className="mps__fixa">Recebimentos previstos</th>{detalhe.semanas.map((s, i) => <td key={i} className="num">{s.recebimentos ? numero(s.recebimentos) : '-'}</td>)}</tr>
                <tr><th className="mps__fixa">Estoque projetado</th>{detalhe.semanas.map((s, i) => <td key={i} className="num">{numero(s.projetado)}</td>)}</tr>
                <tr><th className="mps__fixa">Necessidade líquida</th>{detalhe.semanas.map((s, i) => <td key={i} className="num">{s.liquida ? <b>{numero(s.liquida)}</b> : '-'}</td>)}</tr>
                <tr><th className="mps__fixa">Liberar pedido</th>{detalhe.semanas.map((_s, i) => { const q = detalhe.semanas.filter(x => x.liberar === i).reduce((a, x) => a + x.liquida, 0); return <td key={i} className="num">{q ? <Badge tom={detalhe.atrasado && i === 0 ? 'bad' : 'info'} plain>{numero(q)}</Badge> : '-'}</td>; })}</tr>
              </tbody>
            </table>
          </div>
          <p className="muted pcp-nota">Estoque projetado = anterior + recebimentos − necessidade. Quando fica abaixo da segurança, a diferença vira necessidade líquida e o pedido é liberado {Math.ceil(detalhe.leadTimeDias / 7)} semana(s) antes (lead time).</p>
        </Modal>
      )}
    </>
  );
}
