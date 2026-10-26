import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IoDownloadOutline, IoDocumentTextOutline, IoRefreshOutline, IoCheckmarkCircleOutline } from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { useCores } from '../lib/useCores';
import { compacto, contem, moeda, numero, pct } from '../lib/format';
import { exportarExcel, exportarPDF } from '../lib/exportar';
import type { Categoria, Estoque } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { Code, Kpi, Loading, PageHeader, Panel, SearchInput, Segmented } from '../components/ui';

interface Painel {
  dias: number;
  kpis: Record<string, number | null>;
  alertas: { nivel: 'critico' | 'atencao' | 'info'; titulo: string; rota: string }[];
  serie: { data: string; entradas: number; saidas: number }[];
  valorPorCategoria: { categoria: string; valor: number }[];
  topSaidas: { produtoId: string; nome: string; sku: string; quantidade: number }[];
}

interface LinhaCapital {
  produtoId: string; nome: string; sku: string; categoriaId: string; categoriaNome: string;
  quantidade: number; precoCusto: number; precoVenda: number; valorImobilizado: number; receitaPotencial: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const cores = useCores();
  const [dias, setDias] = useState<'7' | '30' | '90'>('30');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [painel, estoque, categorias] = await Promise.all([
      api.get<Painel>(`/dashboard/painel?dias=${dias}`),
      api.get<Estoque[]>('/estoque'),
      api.get<Categoria[]>('/categorias'),
    ]);
    return { painel: painel.data, estoque: estoque.data, categorias: categorias.data };
  }, [dias]);

  // Capital imobilizado por produto (Disponível + Em Demonstração), como no painel financeiro antigo.
  const capital = useMemo<LinhaCapital[]>(() => {
    if (!dados) return [];
    const mapa = new Map<string, LinhaCapital>();
    for (const e of dados.estoque) {
      if (e.status !== 'Disponível' && e.status !== 'Em Demonstração') continue;
      const p = e.produto;
      const l = mapa.get(p.id) ?? {
        produtoId: p.id, nome: p.nome, sku: p.sku, categoriaId: p.categoriaId, categoriaNome: p.categoria?.nome || '-',
        quantidade: 0, precoCusto: p.precoCusto || 0, precoVenda: p.precoVenda || 0, valorImobilizado: 0, receitaPotencial: 0,
      };
      l.quantidade += e.quantidade;
      l.valorImobilizado += e.quantidade * (p.precoCusto || 0);
      l.receitaPotencial += e.quantidade * (p.precoVenda || 0);
      mapa.set(p.id, l);
    }
    return [...mapa.values()];
  }, [dados]);

  const capitalFiltrado = useMemo(
    () => capital.filter(c => contem(busca, c.nome, c.sku) && (!categoria || c.categoriaId === categoria)),
    [capital, busca, categoria],
  );
  const totais = capitalFiltrado.reduce((a, c) => ({ q: a.q + c.quantidade, custo: a.custo + c.valorImobilizado, venda: a.venda + c.receitaPotencial }), { q: 0, custo: 0, venda: 0 });
  const margem = (c: LinhaCapital) => (c.valorImobilizado > 0 ? ((c.receitaPotencial - c.valorImobilizado) / c.valorImobilizado) * 100 : 0);

  if (carregando && !dados) return <Loading />;
  if (!dados) return null;
  const { kpis, alertas, serie, valorPorCategoria, topSaidas } = dados.painel;
  const k = (n: string) => Number(kpis[n] || 0);

  const colunas: Col<LinhaCapital>[] = [
    { key: 'nome', titulo: 'Produto', principal: true, ordenar: c => c.nome, render: c => <><div className="cell-title">{c.nome}</div><div className="cell-sub"><Code>{c.sku}</Code></div></> },
    { key: 'cat', titulo: 'Categoria', ocultarCelular: true, ordenar: c => c.categoriaNome, render: c => c.categoriaNome },
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
    { titulo: 'Quantidade', valor: (c: LinhaCapital) => c.quantidade },
    { titulo: 'Custo unitário', valor: (c: LinhaCapital) => moeda(c.precoCusto) },
    { titulo: 'Imobilizado', valor: (c: LinhaCapital) => moeda(c.valorImobilizado) },
    { titulo: 'Margem', valor: (c: LinhaCapital) => pct(margem(c)) },
  ];

  const tooltipStyle = { background: cores.surface, border: `1px solid ${cores.line}`, borderRadius: 8, fontSize: 13 };

  return (
    <>
      <PageHeader
        titulo="Painel"
        descricao="Situação do armazém, das compras e da operação em tempo real."
        acoes={<>
          <Segmented valor={dias} onChange={setDias} opcoes={[{ valor: '7', label: '7 dias' }, { valor: '30', label: '30 dias' }, { valor: '90', label: '90 dias' }]} />
          <button className="btn" onClick={() => recarregar()}><IoRefreshOutline /> Atualizar</button>
        </>}
      />

      <div className="kpis">
        <Kpi label="Capital em estoque (custo)" valor={moeda(k('valorCusto'))} dica={`Receita potencial ${moeda(k('valorVenda'))}`} tom="primary" />
        <Kpi label="Lucro projetado" valor={moeda(k('margemPotencial'))} dica={`${numero(k('unidades'))} unidades disponíveis`} />
        <Kpi label="Abaixo do mínimo" valor={numero(k('criticos'))} dica={`${numero(k('zerados'))} com saldo zerado`} tom={k('criticos') ? 'warn' : 'ok'} onClick={() => navigate('/estoque?filtro=critico')} />
        <Kpi label="Perdas no mês" valor={moeda(k('perdasMes'))} dica={`${numero(k('rupturaQtd'))} un em avaria`} tom={k('perdasMes') ? 'bad' : undefined} onClick={() => navigate('/rupturas')} />
        <Kpi label="Compras em aberto" valor={moeda(k('caixaComprometido'))} dica={`${k('pedidosPendentes')} pedidos · ${k('pedidosAtrasados')} atrasados`} tom={k('pedidosAtrasados') ? 'warn' : undefined} onClick={() => navigate('/compras')} />
        <Kpi label="Ordens na fila" valor={numero(k('osPendentes') + k('osEmSeparacao'))} dica={kpis.tempoMedioSeparacaoMin !== null ? `Separação média: ${k('tempoMedioSeparacaoMin')} min` : `${k('osEmSeparacao')} em separação`} tom={k('osUrgentes') ? 'bad' : undefined} onClick={() => navigate('/separacao')} />
      </div>

      <div className="grid grid-main-side mb-16">
        <Panel titulo="Movimentação diária" descricao={`Unidades que entraram e saíram nos últimos ${dados.painel.dias} dias`}
          acoes={<div className="legend"><span><i style={{ background: cores.primary }} />Entradas</span><span><i style={{ background: cores.warn }} />Saídas</span></div>}>
          <div className="chart-box">
            <ResponsiveContainer>
              <AreaChart data={serie} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={cores.line} vertical={false} />
                <XAxis dataKey="data" tickFormatter={d => d.slice(8, 10) + '/' + d.slice(5, 7)} tick={{ fill: cores['text-3'], fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={18} />
                <YAxis tick={{ fill: cores['text-3'], fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={d => String(d).split('-').reverse().join('/')} />
                <Area type="monotone" dataKey="entradas" name="Entradas" stroke={cores.primary} fill={cores.primary} fillOpacity={0.12} strokeWidth={2} />
                <Area type="monotone" dataKey="saidas" name="Saídas" stroke={cores.warn} fill={cores.warn} fillOpacity={0.12} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel titulo="O que precisa de atenção" flush>
          {alertas.length === 0
            ? <div className="empty"><IoCheckmarkCircleOutline style={{ color: 'var(--ok)', opacity: 1 }} /><b>Tudo em ordem</b>Nenhum alerta no momento.</div>
            : <ul className="alert-list">{alertas.map(a => <li key={a.titulo}><Link to={a.rota}><span className={`dot dot--${a.nivel}`} />{a.titulo}</Link></li>)}</ul>}
        </Panel>
      </div>

      <div className="grid grid-2 mb-16">
        <Panel titulo="Capital por categoria" descricao="Saldo disponível × custo unitário">
          {valorPorCategoria.length === 0 ? <p className="muted">Sem saldo valorizado.</p> : (
            <div className="chart-box" style={{ height: Math.max(160, valorPorCategoria.length * 46) }}>
              <ResponsiveContainer>
                <BarChart data={valorPorCategoria} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="categoria" width={130} tick={{ fill: cores['text-2'], fontSize: 12.5 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => moeda(Number(v))} cursor={{ fill: cores.line, opacity: 0.4 }} />
                  <Bar dataKey="valor" name="Valor" fill={cores.primary} radius={[0, 4, 4, 0]} barSize={22} label={{ position: 'right', formatter: (v: unknown) => compacto(Number(v)), fill: cores['text-2'], fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel titulo="Mais consumidos" descricao={`Saídas no período (${dados.painel.dias} dias)`} flush>
          {topSaidas.length === 0 ? <div className="empty">Sem saídas no período.</div> : (
            <table className="table">
              <tbody>
                {topSaidas.map(t => (
                  <tr key={t.produtoId} onClick={() => navigate(`/kardex/${t.produtoId}`)} style={{ cursor: 'pointer' }}>
                    <td><div className="cell-title">{t.nome}</div><div className="cell-sub"><Code>{t.sku}</Code></div></td>
                    <td style={{ width: '35%' }}><div className="meter"><i style={{ width: `${(t.quantidade / topSaidas[0].quantidade) * 100}%` }} /></div></td>
                    <td className="num"><b>{numero(t.quantidade)}</b> un</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

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
        </div>
        <DataTable colunas={colunas} linhas={capitalFiltrado} chave={c => c.produtoId} ordemInicial={{ key: 'ct', dir: 'desc' }} porPagina={15} onLinha={c => navigate(`/kardex/${c.produtoId}`)} />
      </Panel>
    </>
  );
}
