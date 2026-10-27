import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  IoDownloadOutline, IoDocumentTextOutline, IoRefreshOutline, IoCheckmarkCircleOutline, IoArrowUpOutline, IoArrowDownOutline,
  IoAnalyticsOutline, IoConstructOutline, IoFlaskOutline, IoClipboardOutline, IoWalletOutline, IoCartOutline,
} from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { useCores } from '../lib/useCores';
import { compacto, contem, haQuanto, moeda, numero, pct } from '../lib/format';
import { exportarExcel, exportarPDF } from '../lib/exportar';
import type { Categoria, Estoque } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Code, Empty, Kpi, Loading, PageHeader, Panel, SearchInput, Segmented } from '../components/ui';
import './Dashboard.css';

type Faixa = 'saudavel' | 'risco' | 'excesso' | 'parado' | 'novo';
interface Resumo { entradas: number; saidas: number; valorEntradas: number; valorSaidas: number; consumo: number; valorConsumo: number; perdas: number; valorPerdas: number }
interface Painel {
  dias: number;
  kpis: Record<string, number | null>;
  alertas: { nivel: 'critico' | 'atencao' | 'info'; titulo: string; rota: string }[];
  serie: { data: string; entradas: number; saidas: number; valorEntradas: number; valorSaidas: number }[];
  valorPorCategoria: { categoria: string; valor: number }[];
  topSaidas: { produtoId: string; nome: string; sku: string; quantidade: number; valor: number; saldo: number; coberturaDias: number | null }[];
  periodo: { atual: Resumo; anterior: Resumo };
  hoje: { entradas: number; saidas: number; movimentos: number; usuarios: number; separacoesConcluidas: number; recebimentos: number; porHora: { hora: number; movimentos: number }[] };
  saude: { faixas: { chave: Faixa; rotulo: string; descricao: string; produtos: number; valor: number }[]; coberturaMediaDias: number | null; concentracao: { top10Pct: number; itens80: number; itensComValor: number } };
  faixaProduto: Record<string, Faixa>;
  parados: { produtoId: string; nome: string; sku: string; saldo: number; valor: number; ultimaSaida: string | null }[];
  excessos: { produtoId: string; nome: string; sku: string; saldo: number; valor: number; coberturaDias: number | null }[];
  riscoRuptura: { produtoId: string; nome: string; sku: string; saldo: number; consumoDia: number; coberturaDias: number; leadTimeDias: number; pedidoAberto: number; minimo: number }[];
  riscoRupturaTotal: number;
  validade: { chave: string; rotulo: string; lotes: number; unidades: number; valor: number }[];
  qualidade: { itens: { chave: string; rotulo: string; quantidade: number; impacto: string; rota: string }[]; indice: number; capitalSemPreco: number };
  modulos: {
    pcp: { abertas: number; emProducao: number; atrasadas: number };
    transformacao: { aguardando: number; planejadas: number };
    inventario: { codigo: string; concluidoEm: string; itens: number; acuracia: number | null } | null;
  };
  atividade: { id: string; dataHora: string; tipo: string; quantidade: number; entrada: boolean; produto: { id: string; nome: string; sku: string }; usuario: string; codigo: string | null; lote: string | null }[];
}

interface LinhaCapital {
  produtoId: string; nome: string; sku: string; categoriaId: string; categoriaNome: string;
  quantidade: number; precoCusto: number; precoVenda: number; valorImobilizado: number; receitaPotencial: number; faixa: Faixa | null;
}

const ROTULO_FAIXA: Record<Faixa, string> = { saudavel: 'Saudável', risco: 'Risco de ruptura', excesso: 'Excesso', parado: 'Parado', novo: 'Sem histórico' };
const TOM_FAIXA: Record<Faixa, 'ok' | 'bad' | 'warn' | undefined> = { saudavel: 'ok', risco: 'bad', excesso: 'warn', parado: undefined, novo: undefined };

/** Variação % entre dois períodos; null quando não há base de comparação. */
const variacao = (atual: number, anterior: number) => (anterior > 0 ? ((atual - anterior) / anterior) * 100 : null);

function Delta({ atual, anterior, ruimSubir }: { atual: number; anterior: number; ruimSubir?: boolean }) {
  const v = variacao(atual, anterior);
  if (v === null) return <span className="muted">sem base de comparação</span>;
  if (Math.abs(v) < 0.5) return <span className="delta">estável vs. período anterior</span>;
  const tom = ruimSubir === undefined ? '' : (v > 0) === ruimSubir ? 'delta--ruim' : 'delta--bom';
  return <span className={`delta ${tom}`}>{v > 0 ? <IoArrowUpOutline /> : <IoArrowDownOutline />}{pct(Math.abs(v), 0)} vs. período anterior</span>;
}

function Modulo({ icone, titulo, valor, detalhe, tom, para }: { icone: ReactNode; titulo: string; valor: ReactNode; detalhe: ReactNode; tom?: 'bad' | 'warn' | 'ok'; para: string }) {
  return (
    <Link to={para} className={`painel-modulo ${tom ? `painel-modulo--${tom}` : ''}`}>
      <span className="painel-modulo__icone">{icone}</span>
      <span className="painel-modulo__texto"><span>{titulo}</span><small>{detalhe}</small></span>
      <b>{valor}</b>
    </Link>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const cores = useCores();
  const [dias, setDias] = useState<'7' | '30' | '90'>('30');
  const [medida, setMedida] = useState<'un' | 'rs'>('rs');
  const [faixaAberta, setFaixaAberta] = useState<Faixa>('parado');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [filtroFaixa, setFiltroFaixa] = useState<'todas' | Faixa | 'sempreco'>('todas');

  const { dados, carregando, erro, recarregar } = useCarregar(async () => {
    const [painel, estoque, categorias] = await Promise.all([
      api.get<Painel>(`/dashboard/painel?dias=${dias}`),
      api.get<Estoque[]>('/estoque'),
      api.get<Categoria[]>('/categorias'),
    ]);
    return { painel: painel.data, estoque: estoque.data, categorias: categorias.data, em: new Date() };
  }, [dias]);

  // Capital imobilizado por produto (Disponível + Em Demonstração).
  const capital = useMemo<LinhaCapital[]>(() => {
    if (!dados) return [];
    const mapa = new Map<string, LinhaCapital>();
    for (const e of dados.estoque) {
      if (e.status !== 'Disponível' && e.status !== 'Em Demonstração') continue;
      const p = e.produto;
      const l = mapa.get(p.id) ?? {
        produtoId: p.id, nome: p.nome, sku: p.sku, categoriaId: p.categoriaId, categoriaNome: p.categoria?.nome || '-',
        quantidade: 0, precoCusto: p.precoCusto || 0, precoVenda: p.precoVenda || 0, valorImobilizado: 0, receitaPotencial: 0, faixa: dados.painel.faixaProduto?.[p.id] ?? null,
      };
      l.quantidade += e.quantidade;
      l.valorImobilizado += e.quantidade * (p.precoCusto || 0);
      l.receitaPotencial += e.quantidade * (p.precoVenda || 0);
      mapa.set(p.id, l);
    }
    return [...mapa.values()];
  }, [dados]);

  const capitalFiltrado = useMemo(
    () => capital.filter(c => contem(busca, c.nome, c.sku) && (!categoria || c.categoriaId === categoria)
      && (filtroFaixa === 'todas' || (filtroFaixa === 'sempreco' ? c.precoVenda <= 0 : c.faixa === filtroFaixa))),
    [capital, busca, categoria, filtroFaixa],
  );
  const totais = capitalFiltrado.reduce((a, c) => ({ q: a.q + c.quantidade, custo: a.custo + c.valorImobilizado, venda: a.venda + c.receitaPotencial }), { q: 0, custo: 0, venda: 0 });
  const margem = (c: LinhaCapital) => (c.valorImobilizado > 0 ? ((c.receitaPotencial - c.valorImobilizado) / c.valorImobilizado) * 100 : 0);

  if (carregando && !dados) return <Loading />;
  if (!dados) return (
    <>
      <PageHeader titulo="Painel" />
      <Panel><Empty titulo="Não foi possível montar o painel">{erro}<div className="mt-16"><button className="btn btn--primary" onClick={() => recarregar()}><IoRefreshOutline /> Tentar de novo</button></div></Empty></Panel>
    </>
  );
  const p = dados.painel;
  const { kpis, alertas, serie, valorPorCategoria, topSaidas } = p;
  const k = (n: string) => Number(kpis[n] || 0);
  const at = p.periodo.atual, ant = p.periodo.anterior;
  const capitalTotal = p.saude.faixas.reduce((a, f) => a + f.valor, 0);
  const corFaixa: Record<Faixa, string> = { saudavel: cores.ok, risco: cores.bad, excesso: cores.warn, parado: cores['text-3'], novo: cores.line };
  const maxValidade = Math.max(1, ...p.validade.map(v => v.valor));
  const maxHora = Math.max(1, ...p.hoje.porHora.map(h => h.movimentos));
  const listaFaixa = faixaAberta === 'parado' ? p.parados : faixaAberta === 'excesso' ? p.excessos : [];
  const semPreco = p.qualidade.itens.find(q => q.chave === 'preco')?.quantidade ?? 0;

  const colunas: Col<LinhaCapital>[] = [
    { key: 'nome', titulo: 'Produto', principal: true, ordenar: c => c.nome, render: c => <><div className="cell-title">{c.nome}</div><div className="cell-sub"><Code>{c.sku}</Code></div></> },
    { key: 'cat', titulo: 'Categoria', ocultarCelular: true, ordenar: c => c.categoriaNome, render: c => c.categoriaNome },
    { key: 'f', titulo: 'Situação', ocultarCelular: true, ordenar: c => c.faixa ?? '', render: c => (c.faixa ? <Badge tom={TOM_FAIXA[c.faixa]} plain>{ROTULO_FAIXA[c.faixa]}</Badge> : <span className="muted">-</span>) },
    { key: 'q', titulo: 'Qtd.', align: 'right', ordenar: c => c.quantidade, render: c => numero(c.quantidade), rodape: numero(totais.q) },
    { key: 'cu', titulo: 'Custo un.', align: 'right', ocultarCelular: true, ordenar: c => c.precoCusto, render: c => moeda(c.precoCusto) },
    { key: 'ct', titulo: 'Imobilizado', align: 'right', ordenar: c => c.valorImobilizado, render: c => <b>{moeda(c.valorImobilizado)}</b>, rodape: moeda(totais.custo) },
    { key: 'pv', titulo: 'Receita potencial', align: 'right', ocultarCelular: true, ordenar: c => c.receitaPotencial, render: c => moeda(c.receitaPotencial), rodape: moeda(totais.venda) },
    { key: 'm', titulo: 'Margem', align: 'right', ordenar: margem, render: c => (c.precoVenda > 0 ? <span className={margem(c) >= 50 ? 'up' : 'muted'}>{pct(margem(c))}</span> : <span className="muted">sem preço</span>) },
  ];

  const colunasExport = [
    { titulo: 'Produto', valor: (c: LinhaCapital) => c.nome, largura: 45 },
    { titulo: 'SKU', valor: (c: LinhaCapital) => c.sku },
    { titulo: 'Categoria', valor: (c: LinhaCapital) => c.categoriaNome, largura: 20 },
    { titulo: 'Situação', valor: (c: LinhaCapital) => (c.faixa ? ROTULO_FAIXA[c.faixa] : '') },
    { titulo: 'Quantidade', valor: (c: LinhaCapital) => c.quantidade },
    { titulo: 'Custo unitário', valor: (c: LinhaCapital) => moeda(c.precoCusto) },
    { titulo: 'Imobilizado', valor: (c: LinhaCapital) => moeda(c.valorImobilizado) },
    { titulo: 'Margem', valor: (c: LinhaCapital) => (c.precoVenda > 0 ? pct(margem(c)) : 'sem preço') },
  ];

  const tooltipStyle = { background: cores.surface, border: `1px solid ${cores.line}`, borderRadius: 8, fontSize: 13 };
  const chaveE = medida === 'rs' ? 'valorEntradas' : 'entradas';
  const chaveS = medida === 'rs' ? 'valorSaidas' : 'saidas';
  const fmt = (v: number) => (medida === 'rs' ? moeda(v) : `${numero(v)} un`);

  return (
    <>
      <PageHeader
        titulo="Painel"
        descricao={<>Situação do armazém, das compras e da operação. Atualizado às {dados.em.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</>}
        acoes={<>
          <Segmented valor={dias} onChange={setDias} opcoes={[{ valor: '7', label: '7 dias' }, { valor: '30', label: '30 dias' }, { valor: '90', label: '90 dias' }]} />
          <button className="btn" onClick={() => recarregar()}><IoRefreshOutline /> Atualizar</button>
          <button className="btn hide-sm" onClick={() => navigate('/bi')}><IoAnalyticsOutline /> Painel BI</button>
        </>}
      />

      {/* -------- Indicadores principais -------- */}
      <div className="kpis kpis--painel">
        <Kpi label="Capital em estoque (custo)" valor={moeda(k('valorCusto'))} tom="primary"
          dica={p.saude.coberturaMediaDias !== null ? `Cobre ~${numero(p.saude.coberturaMediaDias)} dias de consumo` : `${numero(k('unidades'))} unidades disponíveis`} />
        <Kpi label="Margem potencial" valor={moeda(k('margemPrecificada'))}
          dica={k('capitalSemPreco') > 0.5 ? `${moeda(k('capitalSemPreco'))} em produtos sem preço de venda` : `Receita potencial ${moeda(k('valorVenda'))}`}
          tom={k('capitalSemPreco') > k('valorCusto') * 0.2 ? 'warn' : undefined} onClick={semPreco ? () => setFiltroFaixa('sempreco') : undefined} />
        <Kpi label={`Consumo em ${p.dias} dias`} valor={moeda(at.valorConsumo)} dica={<Delta atual={at.valorConsumo} anterior={ant.valorConsumo} />} onClick={() => navigate('/curva-abc')} />
        <Kpi label="Abaixo do mínimo" valor={numero(k('criticos'))} dica={`${numero(k('zerados'))} com saldo zerado`} tom={k('criticos') ? 'warn' : 'ok'} onClick={() => navigate('/estoque?filtro=critico')} />
        <Kpi label={`Perdas em ${p.dias} dias`} valor={moeda(at.valorPerdas)} dica={<Delta atual={at.valorPerdas} anterior={ant.valorPerdas} ruimSubir />} tom={at.valorPerdas ? 'bad' : undefined} onClick={() => navigate('/rupturas')} />
        <Kpi label="Compras em aberto" valor={moeda(k('caixaComprometido'))} dica={`${k('pedidosPendentes')} pedidos · ${k('pedidosAtrasados')} atrasados`} tom={k('pedidosAtrasados') ? 'warn' : undefined} onClick={() => navigate('/compras')} />
        <Kpi label="Fila de separação" valor={numero(k('osPendentes') + k('osEmSeparacao'))} dica={kpis.tempoMedioSeparacaoMin !== null ? `Média de ${k('tempoMedioSeparacaoMin')} min por ordem` : `${k('osEmSeparacao')} em separação`} tom={k('osUrgentes') ? 'bad' : undefined} onClick={() => navigate('/separacao')} />
      </div>

      {/* -------- Pulso de hoje -------- */}
      <section className="painel-hoje" aria-label="Operação de hoje">
        <h2>Hoje</h2>
        <dl>
          <div><dt>Movimentos</dt><dd>{numero(p.hoje.movimentos)}</dd></div>
          <div><dt>Entradas</dt><dd>{numero(p.hoje.entradas)} <small>un</small></dd></div>
          <div><dt>Saídas</dt><dd>{numero(p.hoje.saidas)} <small>un</small></dd></div>
          <div><dt>Separações concluídas</dt><dd>{numero(p.hoje.separacoesConcluidas)}</dd></div>
          <div><dt>Recebimentos</dt><dd>{numero(p.hoje.recebimentos)}</dd></div>
          <div><dt>Pessoas operando</dt><dd>{numero(p.hoje.usuarios)}</dd></div>
        </dl>
        <div className="painel-hoje__horas" role="img" aria-label="Movimentos por hora hoje">
          {p.hoje.porHora.slice(6, 23).map(h => (
            <span key={h.hora} title={`${h.hora}h: ${h.movimentos} movimento(s)`}>
              <i style={{ height: `${h.movimentos ? Math.max(8, (h.movimentos / maxHora) * 100) : 0}%` }} />
              {h.hora % 3 === 0 && <small>{h.hora}h</small>}
            </span>
          ))}
        </div>
      </section>

      {/* -------- Movimentação + alertas -------- */}
      <div className="grid grid-main-side mb-16">
        <Panel titulo="Entradas e saídas" descricao={`${fmt(medida === 'rs' ? at.valorEntradas : at.entradas)} entraram e ${fmt(medida === 'rs' ? at.valorSaidas : at.saidas)} saíram em ${p.dias} dias`}
          acoes={<Segmented valor={medida} onChange={setMedida} opcoes={[{ valor: 'rs', label: 'R$' }, { valor: 'un', label: 'Unidades' }]} />}>
          <div className="legend mb-8"><span><i style={{ background: cores.primary }} />Entradas</span><span><i style={{ background: cores.warn }} />Saídas</span></div>
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={serie} margin={{ top: 8, right: 8, left: medida === 'rs' ? 4 : -12, bottom: 0 }} barGap={2} barCategoryGap={p.dias > 30 ? '15%' : '25%'}>
                <CartesianGrid stroke={cores.line} vertical={false} />
                <XAxis dataKey="data" tickFormatter={d => d.slice(8, 10) + '/' + d.slice(5, 7)} tick={{ fill: cores['text-3'], fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={18} />
                <YAxis tick={{ fill: cores['text-3'], fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={v => (medida === 'rs' ? compacto(Number(v)) : numero(Number(v)))} width={medida === 'rs' ? 52 : 48} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: cores.line, opacity: 0.35 }} labelFormatter={d => String(d).split('-').reverse().join('/')} formatter={v => fmt(Number(v))} />
                <Bar dataKey={chaveE} name="Entradas" fill={cores.primary} radius={[3, 3, 0, 0]} maxBarSize={14} />
                <Bar dataKey={chaveS} name="Saídas" fill={cores.warn} radius={[3, 3, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel titulo="O que precisa de atenção" descricao={alertas.length ? `${alertas.length} ponto(s), do mais grave ao informativo` : undefined} flush>
          {alertas.length === 0
            ? <div className="empty"><IoCheckmarkCircleOutline style={{ color: 'var(--ok)', opacity: 1 }} /><b>Tudo em ordem</b>Nenhum alerta no momento.</div>
            : <ul className="alert-list painel-alertas">{alertas.map(a => <li key={a.titulo}><Link to={a.rota}><span className={`dot dot--${a.nivel}`} /><span className="sr-only">{a.nivel === 'critico' ? 'Crítico: ' : a.nivel === 'atencao' ? 'Atenção: ' : ''}</span>{a.titulo}</Link></li>)}</ul>}
        </Panel>
      </div>

      {/* -------- Saúde do estoque + risco de ruptura -------- */}
      <div className="grid grid-2 mb-16">
        <Panel titulo="Saúde do estoque" descricao={`Onde está o capital de ${moeda(capitalTotal)}. ${p.saude.concentracao.itens80} de ${p.saude.concentracao.itensComValor} produtos concentram 80% do valor.`}>
          {capitalTotal <= 0 ? <p className="muted">Sem saldo valorizado.</p> : (
            <>
              <div className="saude-barra" role="img" aria-label={p.saude.faixas.filter(f => f.valor > 0).map(f => `${f.rotulo} ${pct((f.valor / capitalTotal) * 100, 0)}`).join(', ')}>
                {p.saude.faixas.filter(f => f.valor > 0).map(f => (
                  <i key={f.chave} style={{ width: `${(f.valor / capitalTotal) * 100}%`, background: corFaixa[f.chave] }} title={`${f.rotulo}: ${moeda(f.valor)}`} />
                ))}
              </div>
              <ul className="saude-lista">
                {p.saude.faixas.map(f => (
                  <li key={f.chave}>
                    <button type="button" className={faixaAberta === f.chave ? 'is-ativo' : ''} onClick={() => (f.chave === 'parado' || f.chave === 'excesso' ? setFaixaAberta(f.chave) : f.chave === 'risco' ? document.getElementById('risco')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) : setFiltroFaixa(f.chave))} disabled={!f.produtos}>
                      <i style={{ background: corFaixa[f.chave] }} />
                      <span><b>{f.rotulo}</b><small>{f.descricao}</small></span>
                      <span className="num"><b>{moeda(f.valor)}</b><small>{numero(f.produtos)} produto(s) · {pct(capitalTotal ? (f.valor / capitalTotal) * 100 : 0, 0)}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
              {(faixaAberta === 'parado' || faixaAberta === 'excesso') && (
                <div className="saude-detalhe">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <b>{faixaAberta === 'parado' ? 'Maiores valores parados' : 'Maiores excessos'}</b>
                    <button className="btn btn--sm btn--ghost" onClick={() => { setFiltroFaixa(faixaAberta); document.getElementById('capital')?.scrollIntoView({ behavior: 'smooth' }); }}>Ver todos</button>
                  </div>
                  {listaFaixa.length === 0 ? <p className="muted">Nenhum produto nesta situação.</p> : (
                    <table className="table table--compacta">
                      <tbody>
                        {listaFaixa.map(l => (
                          <tr key={l.produtoId} onClick={() => navigate(`/kardex/${l.produtoId}`)} style={{ cursor: 'pointer' }}>
                            <td><div className="cell-title">{l.nome}</div><div className="cell-sub"><Code>{l.sku}</Code> · {numero(l.saldo)} un</div></td>
                            <td className="num muted">{'ultimaSaida' in l ? (l.ultimaSaida ? `última saída ${haQuanto(l.ultimaSaida)}` : 'nunca saiu') : l.coberturaDias !== null ? `${numero(l.coberturaDias)} dias de estoque` : ''}</td>
                            <td className="num"><b>{moeda(l.valor)}</b></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </Panel>

        <div id="risco">
          <Panel titulo="Risco de ruptura" flush
            descricao={p.riscoRupturaTotal ? `${p.riscoRupturaTotal} produto(s) acabam antes de o reabastecimento chegar (prazo de reposição + 7 dias de segurança)` : 'Nenhum produto acaba antes do próximo reabastecimento'}
            acoes={<button className="btn btn--sm" onClick={() => navigate('/compras/sugestao')}><IoCartOutline /> Sugestão de compras</button>}>
            {p.riscoRuptura.length === 0 ? <div className="empty"><IoCheckmarkCircleOutline style={{ color: 'var(--ok)', opacity: 1 }} /><b>Cobertura em dia</b>Todos os itens com consumo têm saldo para o prazo de reposição.</div> : (
              <table className="table risco-tabela">
                <thead><tr><th>Produto</th><th>Dura</th><th className="num hide-sm">Consumo/dia</th><th className="num">Pedido aberto</th></tr></thead>
                <tbody>
                  {p.riscoRuptura.map(r => {
                    const fracao = Math.min(1, r.coberturaDias / (r.leadTimeDias + 7));
                    return (
                      <tr key={r.produtoId} onClick={() => navigate(`/kardex/${r.produtoId}`)} style={{ cursor: 'pointer' }}>
                        <td><div className="cell-title">{r.nome}</div><div className="cell-sub"><Code>{r.sku}</Code> · saldo {numero(r.saldo)}</div></td>
                        <td>
                          <div className="cobertura" title={`Dura ${r.coberturaDias} dias; reposição leva ${r.leadTimeDias} dias`}>
                            <div className="cobertura__trilho"><i className={r.coberturaDias < r.leadTimeDias ? 'is-bad' : 'is-warn'} style={{ width: `${Math.max(4, fracao * 100)}%` }} /><b style={{ left: `${(r.leadTimeDias / (r.leadTimeDias + 7)) * 100}%` }} /></div>
                            <span className={r.coberturaDias < r.leadTimeDias ? 'down' : ''}>{r.coberturaDias === 0 ? 'acabou' : `${r.coberturaDias} d`}<small className="muted"> / {r.leadTimeDias} d</small></span>
                          </div>
                        </td>
                        <td className="num hide-sm">{numero(r.consumoDia, 1)}</td>
                        <td className="num">{r.pedidoAberto ? <Badge tom="info" plain>{numero(r.pedidoAberto)} un</Badge> : <Badge tom="bad" plain>Sem pedido</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>

      {/* -------- Validade, módulos, cadastro -------- */}
      <div className="grid grid-3 mb-16">
        <Panel titulo="Validade em risco" descricao="Valor de custo dos lotes com saldo"
          acoes={<button className="btn btn--sm btn--ghost" onClick={() => navigate('/validade')}>Abrir</button>}>
          <ul className="validade-lista">
            {p.validade.map((v, i) => (
              <li key={v.chave}>
                <span>{v.rotulo}<small>{numero(v.lotes)} lote(s) · {numero(v.unidades)} un</small></span>
                <span className="validade-lista__barra"><i className={`validade--${i}`} style={{ width: `${(v.valor / maxValidade) * 100}%` }} /></span>
                <b className={i === 0 && v.valor > 0 ? 'down' : ''}>{moeda(v.valor)}</b>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel titulo="Outras áreas" descricao="Resumo dos módulos de produção, inventário e financeiro" flush>
          <div className="painel-modulos">
            <Modulo icone={<IoConstructOutline />} titulo="Produção (PCP)" para="/pcp" valor={numero(p.modulos.pcp.abertas)}
              detalhe={`${p.modulos.pcp.emProducao} em produção · ${p.modulos.pcp.atrasadas} atrasada(s)`} tom={p.modulos.pcp.atrasadas ? 'warn' : undefined} />
            <Modulo icone={<IoFlaskOutline />} titulo="Transformação" para="/transformacao?aba=ordens" valor={numero(p.modulos.transformacao.aguardando + p.modulos.transformacao.planejadas)}
              detalhe={`${p.modulos.transformacao.aguardando} aguardando aprovação · ${p.modulos.transformacao.planejadas} planejada(s)`} tom={p.modulos.transformacao.aguardando ? 'warn' : undefined} />
            <Modulo icone={<IoClipboardOutline />} titulo="Acurácia do inventário" para="/inventario"
              valor={p.modulos.inventario?.acuracia != null ? pct(p.modulos.inventario.acuracia, 0) : '-'}
              detalhe={p.modulos.inventario ? `${p.modulos.inventario.codigo}: ${p.modulos.inventario.itens} item(ns) contado(s) ${haQuanto(p.modulos.inventario.concluidoEm)}` : `Nenhum inventário concluído · ${k('inventariosAbertos')} em andamento`}
              tom={p.modulos.inventario?.acuracia != null ? (p.modulos.inventario.acuracia >= 95 ? 'ok' : p.modulos.inventario.acuracia >= 85 ? 'warn' : 'bad') : undefined} />
            <Modulo icone={<IoWalletOutline />} titulo="A pagar em 7 dias" para="/financeiro" valor={compacto(k('pagar7dias'))}
              detalhe={k('pagarVencido') ? `${moeda(k('pagarVencido'))} vencido` : `A receber em 7 dias: ${moeda(k('receber7dias'))}`} tom={k('pagarVencido') ? 'bad' : undefined} />
          </div>
        </Panel>

        <Panel titulo="Qualidade do cadastro" descricao="Dados que faltam e o que isso afeta">
          <div className="qualidade-indice">
            <b className={p.qualidade.indice >= 90 ? 'up' : p.qualidade.indice >= 70 ? 'qty--warn' : 'down'}>{pct(p.qualidade.indice, 0)}</b>
            <span>dos campos importantes preenchidos</span>
          </div>
          <ul className="qualidade-lista">
            {p.qualidade.itens.filter(q => q.quantidade > 0).map(q => (
              <li key={q.chave}><Link to={q.rota}><span><span><b>{numero(q.quantidade)}</b> · {q.rotulo}</span><small>{q.impacto}</small></span></Link></li>
            ))}
            {p.qualidade.itens.every(q => q.quantidade === 0) && <li className="muted">Cadastro completo.</li>}
          </ul>
        </Panel>
      </div>

      {/* -------- Categoria, consumo, atividade -------- */}
      <div className="grid grid-3 mb-16">
        <Panel titulo="Capital por categoria" descricao="Saldo disponível × custo unitário">
          {valorPorCategoria.length === 0 ? <p className="muted">Sem saldo valorizado.</p> : (
            <div className="chart-box" style={{ height: Math.max(160, valorPorCategoria.length * 40) }}>
              <ResponsiveContainer>
                <BarChart data={valorPorCategoria} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="categoria" width={110} tick={{ fill: cores['text-2'], fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => moeda(Number(v))} cursor={{ fill: cores.line, opacity: 0.4 }} />
                  <Bar dataKey="valor" name="Valor" fill={cores.primary} radius={[0, 4, 4, 0]} barSize={18} label={{ position: 'right', formatter: (v: unknown) => compacto(Number(v)), fill: cores['text-2'], fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel titulo="Mais consumidos" descricao={`Saídas em ${p.dias} dias e quanto o saldo ainda dura`} flush>
          {topSaidas.length === 0 ? <div className="empty">Sem saídas no período.</div> : (
            <table className="table table--compacta">
              <tbody>
                {topSaidas.map(t => (
                  <tr key={t.produtoId} onClick={() => navigate(`/kardex/${t.produtoId}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="cell-title">{t.nome}</div>
                      <div className="meter mt-8"><i style={{ width: `${(t.quantidade / topSaidas[0].quantidade) * 100}%` }} /></div>
                    </td>
                    <td className="num"><b>{numero(t.quantidade)}</b> un<div className="cell-sub">{t.coberturaDias !== null ? <span className={t.coberturaDias < 15 ? 'down' : ''}>dura {numero(t.coberturaDias)} d</span> : ''}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel titulo="Atividade recente" descricao="Últimos lançamentos no estoque" flush acoes={<button className="btn btn--sm btn--ghost" onClick={() => navigate('/historico')}>Histórico</button>}>
          {p.atividade.length === 0 ? <div className="empty">Nenhum lançamento ainda.</div> : (
            <ol className="atividade">
              {p.atividade.map(a => (
                <li key={a.id}>
                  <span className={`atividade__sinal ${a.entrada ? 'is-entrada' : 'is-saida'}`} aria-label={a.entrada ? 'Entrada' : 'Saída'}>{a.entrada ? '+' : '−'}</span>
                  <span className="atividade__texto">
                    <b>{numero(a.quantidade)} un</b> {a.produto.nome}
                    <small>{a.tipo} · {a.usuario} · {haQuanto(a.dataHora)}</small>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {/* -------- Capital por produto -------- */}
      <div id="capital">
        <Panel
          flush
          titulo="Capital imobilizado por produto"
          descricao={`${capitalFiltrado.length} produtos · ${moeda(totais.custo)} em custo`}
          acoes={<>
            <button className="btn btn--sm" onClick={() => exportarExcel('Relatorio_Gerencial_ViaPro', [{ nome: 'Capital imobilizado', colunas: colunasExport, linhas: capitalFiltrado }])}><IoDownloadOutline /> Excel</button>
            <button className="btn btn--sm" onClick={() => exportarPDF({ arquivo: 'Relatorio_Financeiro_ViaPro', titulo: 'Capital imobilizado em estoque', paisagem: true, resumo: [`Custo total: ${moeda(totais.custo)}`, `Itens: ${numero(totais.q)} un`], colunas: colunasExport, linhas: capitalFiltrado })}><IoDocumentTextOutline /> PDF</button>
          </>}
        >
          <div className="toolbar">
            <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por nome ou SKU" />
            <select className="select" value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {dados.categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select className="select" value={filtroFaixa} onChange={e => setFiltroFaixa(e.target.value as typeof filtroFaixa)} aria-label="Situação">
              <option value="todas">Todas as situações</option>
              {(Object.keys(ROTULO_FAIXA) as Faixa[]).map(f => <option key={f} value={f}>{ROTULO_FAIXA[f]}</option>)}
              <option value="sempreco">Sem preço de venda</option>
            </select>
          </div>
          <DataTable colunas={colunas} linhas={capitalFiltrado} chave={c => c.produtoId} ordemInicial={{ key: 'ct', dir: 'desc' }} porPagina={15} onLinha={c => navigate(`/kardex/${c.produtoId}`)} />
        </Panel>
      </div>
      <p className="muted painel-rodape">Cobertura = saldo ÷ maior ritmo de consumo entre os últimos 30 e 90 dias.</p>
    </>
  );
}
