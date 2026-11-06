import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IoSwapVerticalOutline, IoDownloadOutline, IoDocumentTextOutline, IoReceiptOutline, IoGitCompareOutline, IoEnterOutline } from 'react-icons/io5';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { contem, moeda, numero } from '../lib/format';
import { estoqueMinimo, tomStatusEstoque } from '../lib/regras';
import { exportarExcel, exportarPDF, VERDE, VERMELHO, LARANJA } from '../lib/exportar';
import type { Categoria, Estoque as EstoqueT, Produto } from '../lib/tipos';
import { ModalMovimento, ModalTransferencia, useArmazens } from '../components/EstoqueModais';
import { FichaItem, type Saldos } from '../components/FichaItem';
import { dataUTC } from '../lib/format';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Code, Kpi, Loading, Loc, Notice, PageHeader, Panel, SearchInput, Segmented } from '../components/ui';

// ✨ FASE 11: visão "Por produto" (como o sistema antigo) + janela do item ao clicar.
// Entradas, saídas e ajustes foram para a página "Entrada e saída".
type Visao = 'produto' | 'lote';
type Aba = 'Disponível' | 'Em Demonstração' | 'Ruptura' | 'Sobra sem NF' | 'Todos';
type Filtro = 'todos' | 'critico' | 'zerado';
interface ProdutoEstoque {
  id: string; sku: string; nome: string; unidade: string | null; fabricante: string | null; codigoBarras: string | null; origemFiscal: number | null;
  referenciaFabricante: string | null; linha: string | null; enderecoLocalizacao: string | null; estoqueMinimo: number | null; precoCusto: number | null;
  categoria: { id: string; nome: string } | null; classe: 'A' | 'B' | 'C'; saldos: Saldos;
  enderecos?: { codigo: string; quantidade: number }[];
}
const ORIGEM_CURTA: Record<number, string> = { 0: 'Nacional', 1: 'Importado', 2: 'Importado (merc. int.)', 3: 'Nacional (>40% imp.)', 5: 'Nacional (≤40% imp.)' };

export default function Estoque() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { usuario } = useAuth();
  const filtro = (params.get('filtro') || (params.get('critico') ? 'critico' : 'todos')) as Filtro;
  const visao: Visao = params.get('visao') === 'lote' ? 'lote' : 'produto';

  const [aba, setAba] = useState<Aba>('Disponível');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [movimentar, setMovimentar] = useState<EstoqueT | null>(null);
  const [armazemId, setArmazemId] = useState('');
  const [transferir, setTransferir] = useState<EstoqueT | null>(null);
  const [ficha, setFicha] = useState<string | null>(params.get('item'));
  const { armazens } = useArmazens();

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [e, p, c, pe] = await Promise.all([api.get<EstoqueT[]>('/estoque'), api.get<Produto[]>('/produtos'), api.get<Categoria[]>('/categorias'), api.get<ProdutoEstoque[]>('/estoque/produtos')]);
    return { estoque: e.data, produtos: p.data, categorias: c.data, porProduto: pe.data };
  });

  // ---------------- visão por lote e endereço
  const estoque = useMemo(() => (dados?.estoque ?? [])
    .filter(e => !armazemId || e.armazemId === armazemId)
    .filter(e => !(e.status === 'Disponível' && e.quantidade <= 0 && e.lote)), [dados, armazemId]);
  const totalProduto = useMemo(() => {
    const m = new Map<string, number>();
    estoque.filter(e => e.status === 'Disponível').forEach(e => m.set(e.produtoId, (m.get(e.produtoId) || 0) + e.quantidade));
    return m;
  }, [estoque]);
  const contagem = useMemo(() => {
    const c: Record<string, number> = { Todos: 0 };
    for (const e of estoque) { if (e.quantidade <= 0 && e.status !== 'Disponível') continue; c[e.status] = (c[e.status] || 0) + 1; c.Todos++; }
    return c;
  }, [estoque]);
  const nivelOk = (produtoId: string, minimo: number) => {
    const total = totalProduto.get(produtoId) ?? 0;
    return filtro === 'critico' ? total <= minimo : filtro === 'zerado' ? total <= 0 : true;
  };
  const linhas = useMemo(() => estoque
    .filter(e => (aba === 'Todos' ? true : e.status === aba))
    .filter(e => e.status === 'Disponível' || e.quantidade > 0)
    .filter(e => !categoria || e.produto.categoriaId === categoria)
    .filter(e => filtro === 'todos' || (e.status === 'Disponível' && nivelOk(e.produtoId, estoqueMinimo(e.produto))))
    .filter(e => contem(busca, e.produto.nome, e.produto.sku, e.produto.codigoBarras, e.status, e.produto.enderecoLocalizacao, e.localizacao?.codigo, e.lote, e.armazem?.nome, ...(e.produto.eans ?? []).map(x => x.codigo))),
  [estoque, aba, categoria, filtro, busca, totalProduto]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------- visão por produto (saldos de todos os armazéns)
  const produtos = useMemo(() => (dados?.porProduto ?? [])
    .filter(p => !categoria || p.categoria?.id === categoria)
    .filter(p => filtro === 'todos' || nivelOk(p.id, estoqueMinimo(p)))
    .filter(p => contem(busca, p.nome, p.sku, p.codigoBarras, p.fabricante, p.referenciaFabricante, p.linha, p.enderecoLocalizacao, p.categoria?.nome, ...(p.enderecos ?? []).map(x => x.codigo))),
  [dados, categoria, filtro, busca, totalProduto]); // eslint-disable-line react-hooks/exhaustive-deps

  const disponiveis = estoque.filter(e => e.status === 'Disponível');
  const produtosDisp = [...new Map(disponiveis.map(e => [e.produtoId, e.produto])).values()];
  const resumo = {
    skus: produtosDisp.filter(p => (totalProduto.get(p.id) ?? 0) > 0).length,
    unidades: disponiveis.reduce((a, e) => a + e.quantidade, 0),
    criticos: produtosDisp.filter(p => (totalProduto.get(p.id) ?? 0) <= estoqueMinimo(p)).length,
    valor: estoque.filter(e => e.status !== 'Ruptura' && e.status !== 'Sobra sem NF').reduce((a, e) => a + e.quantidade * (e.produto.precoCusto || 0), 0),
  };

  function setParam(k: string, v: string | null) {
    if (v === null) params.delete(k); else params.set(k, v);
    if (k === 'filtro') params.delete('critico');
    setParams(params, { replace: true });
  }
  const mudarFiltro = (f: Filtro) => setParam('filtro', f === 'todos' ? null : f);
  const abrirFicha = (id: string | null) => { setFicha(id); setParam('item', id); };

  const endereco = (e: EstoqueT) => e.localizacao?.codigo || e.produto.enderecoLocalizacao;

  const colProduto: Col<ProdutoEstoque>[] = [
    { key: 'sku', titulo: 'Código', ordenar: p => p.sku, render: p => <Code>{p.sku}</Code> },
    { key: 'nome', titulo: 'Descrição', principal: true, ordenar: p => p.nome, render: p => <><div className="cell-title">{p.nome}</div><div className="cell-sub">{p.categoria?.nome ?? ''}{p.linha ? ` · ${p.linha}` : ''}</div></> },
    { key: 'un', titulo: 'UN', ocultarCelular: true, ordenar: p => p.unidade, render: p => p.unidade ?? 'UN' },
    { key: 'end', titulo: 'Endereços', ordenar: p => p.enderecos?.[0]?.codigo ?? p.enderecoLocalizacao ?? 'zzz', render: p => {
      const e = p.enderecos ?? [];
      if (!e.length) return <Loc>{p.enderecoLocalizacao}</Loc>;
      return <span className="end-cel" title={e.map(x => `${x.codigo}: ${numero(x.quantidade)}`).join('\n')}><Loc>{e[0].codigo}</Loc>{e.length > 1 && <span className="end-cel__mais">+{e.length - 1}</span>}</span>;
    } },
    { key: 'fab', titulo: 'Fabricante', ocultarCelular: true, ordenar: p => p.fabricante ?? 'zzz', render: p => p.fabricante || <span className="muted">-</span> },
    { key: 'ean', titulo: 'Cód. barras', ocultarCelular: true, ordenar: p => p.codigoBarras ?? 'z', render: p => p.codigoBarras ? <span className="mono">{p.codigoBarras}</span> : <span className="muted">-</span> },
    { key: 'abc', titulo: 'ABC', align: 'center', ordenar: p => p.classe, render: p => <Badge tom={p.classe === 'A' ? 'bad' : p.classe === 'B' ? 'warn' : undefined} plain>{p.classe}</Badge> },
    { key: 'venda', titulo: 'Est. venda', align: 'right', ordenar: p => p.saldos.venda, render: p => {
      const min = estoqueMinimo(p);
      const tom = p.saldos.disponivel <= 0 ? 'qty--bad' : p.saldos.disponivel <= min ? 'qty--warn' : 'qty--ok';
      return <span className={`qty ${tom}`}>{numero(p.saldos.venda)}</span>;
    } },
    { key: 'fis', titulo: 'Est. físico', align: 'right', ocultarCelular: true, ordenar: p => p.saldos.fisico, render: p => numero(p.saldos.fisico) },
    { key: 'trans', titulo: 'Est. trânsito', align: 'right', ocultarCelular: true, ordenar: p => p.saldos.transito, render: p => p.saldos.transito ? numero(p.saldos.transito) : <span className="muted">0</span> },
    { key: 'orig', titulo: 'Origem', ocultarCelular: true, ordenar: p => p.origemFiscal ?? 9, render: p => p.origemFiscal != null ? (ORIGEM_CURTA[p.origemFiscal] ?? String(p.origemFiscal)) : <span className="muted">-</span> },
    { key: 'ref', titulo: 'Ref. fabricante', ocultarCelular: true, ordenar: p => p.referenciaFabricante ?? 'zzz', render: p => p.referenciaFabricante || <span className="muted">-</span> },
  ];

  const colLote: Col<EstoqueT>[] = [
    { key: 'produto', titulo: 'Produto', principal: true, ordenar: e => e.produto.nome, render: e => (
      <><div className="cell-title">{e.produto.nome}</div><div className="cell-sub"><Code>{e.produto.sku}</Code></div></>
    ) },
    { key: 'lote', titulo: 'Lote / validade', ordenar: e => e.validade || e.produto.validade || 'z', render: e => (
      <>{e.lote ? <b>{e.lote}</b> : <span className="muted">Sem lote</span>}<div className="cell-sub">{(e.validade || e.produto.validade) ? `Val. ${dataUTC(e.validade || e.produto.validade)}` : ''}</div></>
    ) },
    { key: 'arm', titulo: 'Armazém', ocultarCelular: !!armazemId, ordenar: e => e.armazem?.nome, render: e => e.armazem?.nome || '-' },
    { key: 'end', titulo: 'Endereço', ordenar: e => endereco(e) || 'zzz', render: e => <Loc>{endereco(e)}</Loc> },
    { key: 'cat', titulo: 'Categoria', ocultarCelular: true, ordenar: e => e.produto.categoria?.nome, render: e => e.produto.categoria?.nome || '-' },
    { key: 'qtd', titulo: 'Saldo', align: 'right', ordenar: e => e.quantidade, render: e => {
      const min = estoqueMinimo(e.produto);
      const total = totalProduto.get(e.produtoId) ?? 0;
      const tom = e.status !== 'Disponível' ? '' : total <= 0 ? 'qty--bad' : total <= min ? 'qty--warn' : 'qty--ok';
      return <span className={`qty ${tom}`}>{numero(e.quantidade)} {e.produto.unidade || 'un'}</span>;
    } },
    { key: 'min', titulo: 'Mínimo', align: 'right', ocultarCelular: true, ordenar: e => estoqueMinimo(e.produto), render: e => <span className="muted">{numero(estoqueMinimo(e.produto))}</span> },
    { key: 'status', titulo: 'Situação', ordenar: e => e.status, render: e => (
      <><Badge tom={tomStatusEstoque(e.status)}>{e.status}</Badge>{e.responsavel && <div className="cell-sub">com {e.responsavel.nome}</div>}</>
    ) },
  ];

  function exportar(tipo: 'xlsx' | 'pdf') {
    if (visao === 'produto') {
      const cols = [
        { titulo: 'Código', valor: (p: ProdutoEstoque) => p.sku }, { titulo: 'Descrição', valor: (p: ProdutoEstoque) => p.nome, largura: 45 },
        { titulo: 'UN', valor: (p: ProdutoEstoque) => p.unidade ?? 'UN' }, { titulo: 'Fabricante', valor: (p: ProdutoEstoque) => p.fabricante ?? '', largura: 18 },
        { titulo: 'Cód. barras', valor: (p: ProdutoEstoque) => p.codigoBarras ?? '', largura: 16 }, { titulo: 'ABC', valor: (p: ProdutoEstoque) => p.classe },
        { titulo: 'Est. venda', valor: (p: ProdutoEstoque) => p.saldos.venda }, { titulo: 'Est. físico', valor: (p: ProdutoEstoque) => p.saldos.fisico },
        { titulo: 'Est. trânsito', valor: (p: ProdutoEstoque) => p.saldos.transito }, { titulo: 'Origem', valor: (p: ProdutoEstoque) => (p.origemFiscal != null ? ORIGEM_CURTA[p.origemFiscal] ?? p.origemFiscal : ''), largura: 14 },
        { titulo: 'Ref. fabricante', valor: (p: ProdutoEstoque) => p.referenciaFabricante ?? '', largura: 16 },
      ];
      if (tipo === 'xlsx') return exportarExcel('Estoque_por_produto_ViaPro', [{ nome: 'Estoque', colunas: cols, linhas: produtos }]);
      return exportarPDF({ arquivo: 'Estoque_por_produto_ViaPro', titulo: 'Estoque por produto', colunas: cols, linhas: produtos, resumo: [`${produtos.length} produtos`] });
    }
    const cols = [
      { titulo: 'Produto', valor: (e: EstoqueT) => e.produto.nome, largura: 45 },
      { titulo: 'SKU', valor: (e: EstoqueT) => e.produto.sku },
      { titulo: 'Qtd. atual', valor: (e: EstoqueT) => e.quantidade },
      { titulo: 'Qtd. mínima', valor: (e: EstoqueT) => estoqueMinimo(e.produto) },
      { titulo: 'Alerta', valor: (e: EstoqueT) => (e.status === 'Disponível' && e.quantidade <= estoqueMinimo(e.produto) ? 'ESTOQUE CRÍTICO' : 'OK'), largura: 18 },
      { titulo: 'Status', valor: (e: EstoqueT) => e.status, largura: 16 },
      { titulo: 'Endereço', valor: (e: EstoqueT) => endereco(e) || '-', largura: 14 },
      { titulo: 'Lote', valor: (e: EstoqueT) => e.lote || '-', largura: 14 },
    ];
    if (tipo === 'xlsx') return exportarExcel('Inventario_ViaPro', [{ nome: 'Armazém', colunas: cols, linhas }]);
    return exportarPDF({
      arquivo: 'Inventario_ViaPro', titulo: 'Armazém e inventário', colunas: cols, linhas,
      resumo: [`${resumo.skus} SKUs`, `${numero(resumo.unidades)} unidades`, `${resumo.criticos} abaixo do mínimo`],
      destacar: (e, col) => (col === 2 && e.status === 'Disponível' ? (e.quantidade <= estoqueMinimo(e.produto) ? VERMELHO : VERDE) : col === 5 && e.status !== 'Disponível' ? LARANJA : undefined),
    });
  }

  if (carregando && !dados) return <Loading />;

  return (
    <>
      <PageHeader
        titulo="Estoque"
        descricao="Clique num item para abrir a ficha: saldos, lotes por endereço, picking, EANs e dimensões."
        acoes={<>
          <button className="btn" onClick={() => exportar('xlsx')}><IoDownloadOutline /> Excel</button>
          <button className="btn" onClick={() => exportar('pdf')}><IoDocumentTextOutline /> PDF</button>
          <button className="btn btn--primary" onClick={() => navigate('/movimentacoes')}><IoEnterOutline /> Entrada e saída</button>
        </>}
      />

      <div className="kpis">
        <Kpi label="Produtos com saldo" valor={numero(resumo.skus)} />
        <Kpi label="Unidades disponíveis" valor={numero(resumo.unidades)} />
        <Kpi label="Abaixo do mínimo" valor={numero(resumo.criticos)} tom={resumo.criticos ? 'warn' : 'ok'} onClick={() => mudarFiltro('critico')} />
        <Kpi label="Valor em estoque" valor={moeda(resumo.valor)} tom="primary" />
      </div>

      {filtro !== 'todos' && (
        <div className="mb-16">
          <Notice tom="warn" acao={<button className="btn btn--sm" onClick={() => mudarFiltro('todos')}>Limpar filtro</button>}>
            {filtro === 'critico' ? 'Exibindo apenas itens no estoque mínimo ou abaixo dele.' : 'Exibindo apenas itens com saldo zerado.'}
          </Notice>
        </div>
      )}

      <Panel flush>
        <div className="toolbar">
          <Segmented<Visao> valor={visao} onChange={v => setParam('visao', v === 'produto' ? null : v)} opcoes={[{ valor: 'produto', label: 'Por produto', n: produtos.length }, { valor: 'lote', label: 'Por lote e endereço' }]} />
          <SearchInput value={busca} onChange={setBusca} placeholder={visao === 'produto' ? 'Código, descrição, fabricante, EAN ou referência' : 'Nome, SKU, código de barras, endereço ou lote'} />
          {visao === 'lote' && <select className="select" value={armazemId} onChange={e => setArmazemId(e.target.value)} aria-label="Armazém">
            <option value="">Todos os armazéns</option>
            {armazens.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>}
          <select className="select" value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {dados?.categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select className="select" value={filtro} onChange={e => mudarFiltro(e.target.value as Filtro)} aria-label="Nível de estoque">
            <option value="todos">Qualquer saldo</option>
            <option value="critico">No mínimo ou abaixo</option>
            <option value="zerado">Saldo zerado</option>
          </select>
        </div>
        {visao === 'lote' && (
          <div className="toolbar toolbar--sub">
            <Segmented<Aba> valor={aba} onChange={setAba} opcoes={(['Disponível', 'Em Demonstração', 'Ruptura', ...(contagem['Sobra sem NF'] || aba === 'Sobra sem NF' ? ['Sobra sem NF'] : []), 'Todos'] as Aba[]).map(a => ({ valor: a, label: a === 'Ruptura' ? 'Avarias' : a === 'Em Demonstração' ? 'Demonstração' : a, n: contagem[a] || 0 }))} />
          </div>
        )}
        {visao === 'produto' ? (
          <DataTable colunas={colProduto} linhas={produtos} chave={p => p.id} ordemInicial={{ key: 'nome', dir: 'asc' }} onLinha={p => abrirFicha(p.id)} />
        ) : (
          <DataTable
            colunas={colLote} linhas={linhas} chave={e => e.id} ordemInicial={{ key: 'produto', dir: 'asc' }} onLinha={e => abrirFicha(e.produtoId)}
            acoes={e => (
              <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }} onClick={ev => ev.stopPropagation()}>
                {e.status === 'Sobra sem NF'
                  ? <button className="btn btn--sm" onClick={() => navigate('/divergencias')} title="Sobra sem nota: regularize por nova NF, devolução ou ajuste aprovado">Regularizar</button>
                  : <button className="btn btn--sm" onClick={() => setMovimentar(e)}><IoSwapVerticalOutline /> Movimentar</button>}
                {e.status === 'Disponível' && e.quantidade > 0 && armazens.length > 1 && <button className="icon-btn" title="Transferir para outro armazém" aria-label="Transferir" onClick={() => setTransferir(e)}><IoGitCompareOutline /></button>}
                <button className="icon-btn" title="Kardex do produto" aria-label="Kardex do produto" onClick={() => navigate(`/kardex/${e.produtoId}`)}><IoReceiptOutline /></button>
              </div>
            )}
          />
        )}
      </Panel>

      {ficha && <FichaItem produtoId={ficha} onFechar={() => abrirFicha(null)} onMudou={() => recarregar(true)} onKardex={() => navigate(`/kardex/${ficha}`)} />}
      {movimentar && usuario && (
        <ModalMovimento item={movimentar} usuarioId={usuario.id} onFechar={() => setMovimentar(null)} onSalvo={() => { setMovimentar(null); recarregar(true); }} />
      )}
      {transferir && dados && armazens.length > 0 && (
        <ModalTransferencia produtos={dados.produtos} armazens={armazens}
          inicial={{ produto: transferir.produto, origemId: transferir.armazemId ?? undefined, lote: transferir.lote }}
          onFechar={() => setTransferir(null)} onSalvo={() => { setTransferir(null); recarregar(true); }} />
      )}
    </>
  );
}
