import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  IoSwapVerticalOutline, IoConstructOutline, IoDownloadOutline, IoDocumentTextOutline, IoArrowDownCircleOutline,
  IoArrowUpCircleOutline, IoRepeatOutline, IoAddCircleOutline, IoRemoveCircleOutline, IoHandRightOutline,
  IoWarningOutline, IoReturnDownBackOutline, IoReceiptOutline,
} from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { contem, moeda, numero } from '../lib/format';
import { estoqueMinimo, tomStatusEstoque } from '../lib/regras';
import { exportarExcel, exportarPDF, VERDE, VERMELHO, LARANJA } from '../lib/exportar';
import type { Categoria, Estoque as EstoqueT, Produto } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Code, Field, Kpi, Loading, Loc, Modal, Notice, PageHeader, Panel, SearchInput, Segmented } from '../components/ui';

type Aba = 'Disponível' | 'Em Demonstração' | 'Ruptura' | 'Todos';
type Filtro = 'todos' | 'critico' | 'zerado';

const OPERACOES: { valor: string; label: string; dica: string; icone: ReactNode; tom: 'in' | 'out' | 'neutral'; status?: string[] }[] = [
  { valor: 'Entrada de mercadoria', label: 'Entrada', dica: 'Recebimento avulso', icone: <IoArrowDownCircleOutline />, tom: 'in' },
  { valor: 'Devolução VIAPRO', label: 'Devolução VIAPRO', dica: 'Retorno da indústria', icone: <IoRepeatOutline />, tom: 'in' },
  { valor: 'Ajuste de Entrada de Inventário', label: 'Ajuste (+)', dica: 'Correção de contagem', icone: <IoAddCircleOutline />, tom: 'neutral' },
  { valor: 'Saída de mercadoria', label: 'Saída', dica: 'Retirada avulsa', icone: <IoArrowUpCircleOutline />, tom: 'out' },
  { valor: 'Saída para demonstração', label: 'Demonstração', dica: 'Fica sob sua responsabilidade', icone: <IoHandRightOutline />, tom: 'out' },
  { valor: 'Ajuste de Saída de Inventário', label: 'Ajuste (−)', dica: 'Correção de contagem', icone: <IoRemoveCircleOutline />, tom: 'neutral' },
  { valor: 'Perdas/Avarias', label: 'Perda / avaria', dica: 'Vai para o painel de perdas', icone: <IoWarningOutline />, tom: 'out' },
  { valor: 'Retorno de demonstração', label: 'Retorno de demonstração', dica: 'Volta ao saldo disponível', icone: <IoReturnDownBackOutline />, tom: 'in', status: ['Em Demonstração'] },
];
const SOMA = ['Entrada de mercadoria', 'Devolução VIAPRO', 'Ajuste de Entrada de Inventário'];

export default function Estoque() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { usuario } = useAuth();
  const filtroUrl = params.get('filtro') || (params.get('critico') ? 'critico' : 'todos');

  const [aba, setAba] = useState<Aba>('Disponível');
  const filtro = filtroUrl as Filtro;
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [movimentar, setMovimentar] = useState<EstoqueT | null>(null);
  const [produzir, setProduzir] = useState(false);

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [e, p, c] = await Promise.all([api.get<EstoqueT[]>('/estoque'), api.get<Produto[]>('/produtos'), api.get<Categoria[]>('/categorias')]);
    return { estoque: e.data, produtos: p.data, categorias: c.data };
  });

  const estoque = useMemo(() => dados?.estoque ?? [], [dados]);
  const contagem = useMemo(() => {
    const c: Record<string, number> = { Todos: 0 };
    for (const e of estoque) { if (e.quantidade <= 0 && e.status !== 'Disponível') continue; c[e.status] = (c[e.status] || 0) + 1; c.Todos++; }
    return c;
  }, [estoque]);

  const linhas = useMemo(() => estoque
    .filter(e => (aba === 'Todos' ? true : e.status === aba))
    .filter(e => e.status === 'Disponível' || e.quantidade > 0)
    .filter(e => !categoria || e.produto.categoriaId === categoria)
    .filter(e => {
      if (filtro === 'critico') return e.status === 'Disponível' && e.quantidade <= estoqueMinimo(e.produto);
      if (filtro === 'zerado') return e.status === 'Disponível' && e.quantidade <= 0;
      return true;
    })
    .filter(e => contem(busca, e.produto.nome, e.produto.sku, e.produto.codigoBarras, e.status, e.produto.enderecoLocalizacao, e.localizacao?.codigo, e.produto.lote)),
  [estoque, aba, categoria, filtro, busca]);

  const disponiveis = estoque.filter(e => e.status === 'Disponível');
  const resumo = {
    skus: disponiveis.length,
    unidades: disponiveis.reduce((a, e) => a + e.quantidade, 0),
    criticos: disponiveis.filter(e => e.quantidade <= estoqueMinimo(e.produto)).length,
    valor: estoque.filter(e => e.status !== 'Ruptura').reduce((a, e) => a + e.quantidade * (e.produto.precoCusto || 0), 0),
  };

  function mudarFiltro(f: Filtro) {
    if (f === 'todos') params.delete('filtro'); else params.set('filtro', f);
    params.delete('critico');
    setParams(params, { replace: true });
  }

  const endereco = (e: EstoqueT) => e.localizacao?.codigo || e.produto.enderecoLocalizacao;

  const colunas: Col<EstoqueT>[] = [
    { key: 'produto', titulo: 'Produto', principal: true, ordenar: e => e.produto.nome, render: e => (
      <><div className="cell-title">{e.produto.nome}</div><div className="cell-sub"><Code>{e.produto.sku}</Code>{e.produto.lote && <> &nbsp;Lote {e.produto.lote}</>}</div></>
    ) },
    { key: 'end', titulo: 'Endereço', ordenar: e => endereco(e) || 'zzz', render: e => <Loc>{endereco(e)}</Loc> },
    { key: 'cat', titulo: 'Categoria', ocultarCelular: true, ordenar: e => e.produto.categoria?.nome, render: e => e.produto.categoria?.nome || '-' },
    { key: 'qtd', titulo: 'Saldo', align: 'right', ordenar: e => e.quantidade, render: e => {
      const min = estoqueMinimo(e.produto);
      const tom = e.status !== 'Disponível' ? '' : e.quantidade <= 0 ? 'qty--bad' : e.quantidade <= min ? 'qty--warn' : 'qty--ok';
      return <span className={`qty ${tom}`}>{numero(e.quantidade)} {e.produto.unidade || 'un'}</span>;
    } },
    { key: 'min', titulo: 'Mínimo', align: 'right', ocultarCelular: true, ordenar: e => estoqueMinimo(e.produto), render: e => <span className="muted">{numero(estoqueMinimo(e.produto))}</span> },
    { key: 'status', titulo: 'Situação', ordenar: e => e.status, render: e => (
      <><Badge tom={tomStatusEstoque(e.status)}>{e.status}</Badge>{e.responsavel && <div className="cell-sub">com {e.responsavel.nome}</div>}</>
    ) },
  ];

  const exportCols = [
    { titulo: 'Produto', valor: (e: EstoqueT) => e.produto.nome, largura: 45 },
    { titulo: 'SKU', valor: (e: EstoqueT) => e.produto.sku },
    { titulo: 'Qtd. atual', valor: (e: EstoqueT) => e.quantidade },
    { titulo: 'Qtd. mínima', valor: (e: EstoqueT) => estoqueMinimo(e.produto) },
    { titulo: 'Alerta', valor: (e: EstoqueT) => (e.status === 'Disponível' && e.quantidade <= estoqueMinimo(e.produto) ? 'ESTOQUE CRÍTICO' : 'OK'), largura: 18 },
    { titulo: 'Status', valor: (e: EstoqueT) => e.status, largura: 16 },
    { titulo: 'Endereço', valor: (e: EstoqueT) => endereco(e) || '-', largura: 14 },
  ];

  if (carregando && !dados) return <Loading />;

  return (
    <>
      <PageHeader
        titulo="Estoque"
        descricao="Saldos por produto e situação. Use “Movimentar” para entradas, saídas, ajustes, demonstrações e avarias."
        acoes={<>
          <button className="btn" onClick={() => exportarExcel('Inventario_ViaPro', [{ nome: 'Armazém', colunas: exportCols, linhas }])}><IoDownloadOutline /> Excel</button>
          <button className="btn" onClick={() => exportarPDF({
            arquivo: 'Inventario_ViaPro', titulo: 'Armazém e inventário', colunas: exportCols, linhas,
            resumo: [`${resumo.skus} SKUs`, `${numero(resumo.unidades)} unidades`, `${resumo.criticos} abaixo do mínimo`],
            destacar: (e, col) => (col === 2 && e.status === 'Disponível' ? (e.quantidade <= estoqueMinimo(e.produto) ? VERMELHO : VERDE) : col === 5 && e.status !== 'Disponível' ? LARANJA : undefined),
          })}><IoDocumentTextOutline /> PDF</button>
          <button className="btn btn--primary" onClick={() => setProduzir(true)}><IoConstructOutline /> Produzir lote</button>
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
          <Segmented<Aba> valor={aba} onChange={setAba} opcoes={(['Disponível', 'Em Demonstração', 'Ruptura', 'Todos'] as Aba[]).map(a => ({ valor: a, label: a === 'Ruptura' ? 'Avarias' : a === 'Em Demonstração' ? 'Demonstração' : a, n: contagem[a] || 0 }))} />
          <SearchInput value={busca} onChange={setBusca} placeholder="Nome, SKU, código de barras, endereço ou lote" />
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
        <DataTable
          colunas={colunas} linhas={linhas} chave={e => e.id} ordemInicial={{ key: 'produto', dir: 'asc' }}
          acoes={e => (
            <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
              <button className="btn btn--sm" onClick={() => setMovimentar(e)}><IoSwapVerticalOutline /> Movimentar</button>
              <button className="icon-btn" title="Kardex do produto" aria-label="Kardex do produto" onClick={() => navigate(`/kardex/${e.produtoId}`)}><IoReceiptOutline /></button>
            </div>
          )}
        />
      </Panel>

      {movimentar && usuario && (
        <ModalMovimento item={movimentar} usuarioId={usuario.id} onFechar={() => setMovimentar(null)} onSalvo={() => { setMovimentar(null); recarregar(true); }} />
      )}
      {produzir && usuario && dados && (
        <ModalProducao produtos={dados.produtos} estoque={estoque} usuarioId={usuario.id} onFechar={() => setProduzir(false)} onSalvo={() => { setProduzir(false); recarregar(true); }} />
      )}
    </>
  );
}

function ModalMovimento({ item, usuarioId, onFechar, onSalvo }: { item: EstoqueT; usuarioId: string; onFechar: () => void; onSalvo: () => void }) {
  const opcoes = OPERACOES.filter(o => !o.status || o.status.includes(item.status));
  const [tipo, setTipo] = useState(item.status === 'Em Demonstração' ? 'Retorno de demonstração' : 'Entrada de mercadoria');
  const [qtd, setQtd] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const n = Number(qtd) || 0;
  const saldoDepois = SOMA.includes(tipo) ? item.quantidade + n : item.quantidade - n;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (n <= 0) return toast.warn('Informe uma quantidade válida.');
    setSalvando(true);
    try {
      await api.post('/movimentacoes/operacao', { produtoId: item.produtoId, usuarioId, estoqueId: item.id, quantidade: n, tipoAcao: tipo, observacao: obs });
      toast.success('Movimentação registrada.');
      onSalvo();
    } catch (err) {
      toast.error(msgErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto onFechar={onFechar} tamanho="md" titulo="Movimentar estoque"
      descricao={<>{item.produto.nome} · saldo {item.status.toLowerCase()}: <b>{numero(item.quantidade)}</b></>}
      rodape={<>
        <button className="btn" onClick={onFechar}>Cancelar</button>
        <button className="btn btn--primary" form="form-mov" disabled={salvando}>{salvando ? 'Registrando…' : 'Registrar movimentação'}</button>
      </>}
    >
      <form id="form-mov" onSubmit={salvar} className="stack">
        <div className="tiles" role="group" aria-label="Tipo de movimentação">
          {opcoes.map(o => (
            <button type="button" key={o.valor} className="tile" data-tone={o.tom} aria-pressed={tipo === o.valor} onClick={() => setTipo(o.valor)}>
              {o.icone}{o.label}<small>{o.dica}</small>
            </button>
          ))}
        </div>
        <div className="form-grid">
          <Field label="Quantidade" className="col-4">
            <input className="input input--lg" type="number" min={1} inputMode="numeric" value={qtd} onChange={e => setQtd(e.target.value)} required autoFocus />
          </Field>
          <Field label="Motivo ou observação" className="col-8">
            <input className="input input--lg" style={{ fontSize: 15, fontWeight: 400 }} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: devolução de cliente, erro de contagem" />
          </Field>
        </div>
        {n > 0 && (
          <Notice tom={saldoDepois < 0 ? 'bad' : 'info'}>
            {saldoDepois < 0 ? 'Quantidade maior que o saldo desta linha.' : <>Saldo desta linha após a operação: <b>{numero(saldoDepois)}</b></>}
          </Notice>
        )}
      </form>
    </Modal>
  );
}

function ModalProducao({ produtos, estoque, usuarioId, onFechar, onSalvo }: {
  produtos: Produto[]; estoque: EstoqueT[]; usuarioId: string; onFechar: () => void; onSalvo: () => void;
}) {
  const [produtoId, setProdutoId] = useState('');
  const [qtd, setQtd] = useState('1');
  const [salvando, setSalvando] = useState(false);
  const comReceita = produtos.filter(p => p.tipo === 'ACABADO').sort((a, b) => a.nome.localeCompare(b.nome));
  const produto = produtos.find(p => p.id === produtoId);
  const n = Number(qtd) || 0;
  const saldo = (id: string) => estoque.filter(e => e.produtoId === id && e.status === 'Disponível').reduce((a, e) => a + e.quantidade, 0);
  const necessidades = (produto?.ingredientes || []).map(i => ({
    nome: i.produtoFilho?.nome || '-', sku: i.produtoFilho?.sku || '-', necessario: i.quantidade * n, disponivel: saldo(i.produtoFilhoId),
  }));
  const falta = necessidades.some(x => x.disponivel < x.necessario);

  async function executar(e: FormEvent) {
    e.preventDefault();
    if (!produtoId) return toast.warn('Selecione o produto que deseja fabricar.');
    if (n <= 0) return toast.warn('A quantidade deve ser maior que zero.');
    setSalvando(true);
    try {
      const r = await api.post('/producao/executar', { produtoFinalId: produtoId, quantidadeProduzir: n, usuarioId });
      toast.success(r.data.mensagem || 'Lote produzido. Matéria-prima baixada.');
      onSalvo();
    } catch (err) {
      toast.error(msgErro(err, 'Erro ao executar produção.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto onFechar={onFechar} tamanho="md" titulo="Ordem de produção interna"
      descricao="O sistema baixa as matérias-primas conforme a receita cadastrada no produto e dá entrada no produto acabado."
      rodape={<>
        <button className="btn" onClick={onFechar}>Cancelar</button>
        <button className="btn btn--primary" form="form-prod" disabled={salvando || falta || !produto?.ingredientes?.length}>{salvando ? 'Produzindo…' : 'Executar produção'}</button>
      </>}
    >
      <form id="form-prod" onSubmit={executar} className="stack">
        <div className="form-grid">
          <Field label="Produto final" className="col-8">
            <select className="select" value={produtoId} onChange={e => setProdutoId(e.target.value)} required>
              <option value="">Selecione…</option>
              {comReceita.map(p => <option key={p.id} value={p.id}>[{p.sku}] {p.nome}{p.ingredientes?.length ? '' : ' (sem receita)'}</option>)}
            </select>
          </Field>
          <Field label="Quantidade a produzir" className="col-4">
            <input className="input" type="number" min={1} value={qtd} onChange={e => setQtd(e.target.value)} required />
          </Field>
        </div>
        {produto && !produto.ingredientes?.length && <Notice tom="warn">Este produto não tem receita. Cadastre a receita em Produtos → Editar.</Notice>}
        {necessidades.length > 0 && (
          <table className="table">
            <thead><tr><th>Matéria-prima</th><th className="num">Necessário</th><th className="num">Disponível</th></tr></thead>
            <tbody>
              {necessidades.map(x => (
                <tr key={x.sku}>
                  <td><div className="cell-title">{x.nome}</div><div className="cell-sub"><Code>{x.sku}</Code></div></td>
                  <td className="num">{numero(x.necessario)}</td>
                  <td className={`num qty ${x.disponivel < x.necessario ? 'qty--bad' : 'qty--ok'}`}>{numero(x.disponivel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {falta && <Notice tom="bad">Saldo insuficiente de matéria-prima para esta quantidade.</Notice>}
      </form>
    </Modal>
  );
}
