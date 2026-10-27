import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IoDownloadOutline, IoDocumentTextOutline } from 'react-icons/io5';
import { api } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { useCores } from '../../lib/useCores';
import { compacto, contem, moeda, numero, pct } from '../../lib/format';
import { exportarExcel, exportarPDF } from '../../lib/exportar';
import type { Estoque } from '../../lib/tipos';
import { DataTable, type Col } from '../../components/DataTable';
import { Loading, Notice, Panel, SearchInput, Code } from '../../components/ui';

interface Linha {
  produtoId: string; nome: string; sku: string; categoriaId: string; categoriaNome: string;
  quantidade: number; precoCusto: number; precoVenda: number; valorImobilizado: number; receitaPotencial: number;
}

/**
 * Capital e margem (veio do Painel): quanto está imobilizado a custo, quanto vale a preço de venda e a margem
 * que isso representa, por categoria e por produto. Respeita os filtros de armazém e categoria do Painel BI.
 */
export function CapitalMargem({ armazemId, categoriaId }: { armazemId: string; categoriaId: string }) {
  const navigate = useNavigate();
  const cores = useCores();
  const [busca, setBusca] = useState('');
  const [soSemPreco, setSoSemPreco] = useState(false);
  const { dados: estoque } = useCarregar(async () => (await api.get<Estoque[]>('/estoque')).data);

  const linhas = useMemo<Linha[]>(() => {
    const mapa = new Map<string, Linha>();
    for (const e of estoque ?? []) {
      if (e.status !== 'Disponível' && e.status !== 'Em Demonstração') continue;
      if (armazemId && e.armazemId !== armazemId) continue;
      const p = e.produto;
      if (categoriaId && p.categoriaId !== categoriaId) continue;
      const l = mapa.get(p.id) ?? {
        produtoId: p.id, nome: p.nome, sku: p.sku, categoriaId: p.categoriaId, categoriaNome: p.categoria?.nome || 'Sem categoria',
        quantidade: 0, precoCusto: p.precoCusto || 0, precoVenda: p.precoVenda || 0, valorImobilizado: 0, receitaPotencial: 0,
      };
      l.quantidade += e.quantidade;
      l.valorImobilizado += e.quantidade * (p.precoCusto || 0);
      l.receitaPotencial += e.quantidade * (p.precoVenda || 0);
      mapa.set(p.id, l);
    }
    return [...mapa.values()].filter(l => l.quantidade > 0);
  }, [estoque, armazemId, categoriaId]);

  const resumo = useMemo(() => {
    const comPreco = linhas.filter(l => l.precoVenda > 0);
    const custo = linhas.reduce((a, l) => a + l.valorImobilizado, 0);
    const custoComPreco = comPreco.reduce((a, l) => a + l.valorImobilizado, 0);
    const receita = comPreco.reduce((a, l) => a + l.receitaPotencial, 0);
    const porCat = new Map<string, { categoria: string; custo: number; custoComPreco: number; receita: number }>();
    for (const l of linhas) {
      const c = porCat.get(l.categoriaNome) ?? { categoria: l.categoriaNome, custo: 0, custoComPreco: 0, receita: 0 };
      c.custo += l.valorImobilizado;
      if (l.precoVenda > 0) { c.custoComPreco += l.valorImobilizado; c.receita += l.receitaPotencial; }
      porCat.set(l.categoriaNome, c);
    }
    const categorias = [...porCat.values()].filter(c => c.custo > 0).sort((a, b) => b.custo - a.custo)
      .map(c => ({ ...c, margemPct: c.custoComPreco > 0 ? ((c.receita - c.custoComPreco) / c.custoComPreco) * 100 : null }));
    return { custo, custoComPreco, receita, margem: receita - custoComPreco, margemPct: custoComPreco > 0 ? ((receita - custoComPreco) / custoComPreco) * 100 : null, semPreco: custo - custoComPreco, itensSemPreco: linhas.length - comPreco.length, categorias };
  }, [linhas]);

  const filtradas = linhas.filter(l => contem(busca, l.nome, l.sku, l.categoriaNome) && (!soSemPreco || l.precoVenda <= 0));
  const totais = filtradas.reduce((a, c) => ({ q: a.q + c.quantidade, custo: a.custo + c.valorImobilizado, venda: a.venda + c.receitaPotencial }), { q: 0, custo: 0, venda: 0 });
  const margem = (c: Linha) => (c.valorImobilizado > 0 ? ((c.receitaPotencial - c.valorImobilizado) / c.valorImobilizado) * 100 : 0);

  const colunas: Col<Linha>[] = [
    { key: 'nome', titulo: 'Produto', principal: true, ordenar: c => c.nome, render: c => <><div className="cell-title">{c.nome}</div><div className="cell-sub"><Code>{c.sku}</Code></div></> },
    { key: 'cat', titulo: 'Categoria', ocultarCelular: true, ordenar: c => c.categoriaNome, render: c => c.categoriaNome },
    { key: 'q', titulo: 'Qtd.', align: 'right', ordenar: c => c.quantidade, render: c => numero(c.quantidade), rodape: numero(totais.q) },
    { key: 'cu', titulo: 'Custo un.', align: 'right', ocultarCelular: true, ordenar: c => c.precoCusto, render: c => moeda(c.precoCusto) },
    { key: 'ct', titulo: 'Imobilizado', align: 'right', ordenar: c => c.valorImobilizado, render: c => <b>{moeda(c.valorImobilizado)}</b>, rodape: moeda(totais.custo) },
    { key: 'pv', titulo: 'Receita potencial', align: 'right', ocultarCelular: true, ordenar: c => c.receitaPotencial, render: c => moeda(c.receitaPotencial), rodape: moeda(totais.venda) },
    { key: 'm', titulo: 'Margem', align: 'right', ordenar: margem, render: c => (c.precoVenda > 0 ? <span className={margem(c) >= 50 ? 'up' : 'muted'}>{pct(margem(c))}</span> : <span className="muted">sem preço</span>) },
  ];
  const colunasExport = [
    { titulo: 'Produto', valor: (c: Linha) => c.nome, largura: 45 },
    { titulo: 'SKU', valor: (c: Linha) => c.sku },
    { titulo: 'Categoria', valor: (c: Linha) => c.categoriaNome, largura: 20 },
    { titulo: 'Quantidade', valor: (c: Linha) => c.quantidade },
    { titulo: 'Custo unitário', valor: (c: Linha) => moeda(c.precoCusto) },
    { titulo: 'Imobilizado', valor: (c: Linha) => moeda(c.valorImobilizado) },
    { titulo: 'Receita potencial', valor: (c: Linha) => moeda(c.receitaPotencial) },
    { titulo: 'Margem', valor: (c: Linha) => (c.precoVenda > 0 ? pct(margem(c)) : 'sem preço') },
  ];
  const tooltipStyle = { background: cores.surface, border: `1px solid ${cores.line}`, borderRadius: 8, fontSize: 13 };

  if (!estoque) return <Loading linhas={4} />;
  return (
    <>
      <dl className="cm-resumo">
        <div><dt>Capital a custo</dt><dd>{moeda(resumo.custo)}</dd><span>Disponível + em demonstração</span></div>
        <div><dt>Receita potencial</dt><dd>{moeda(resumo.receita)}</dd><span>Só itens com preço de venda</span></div>
        <div><dt>Margem potencial</dt><dd className={resumo.margem >= 0 ? 'up' : 'down'}>{moeda(resumo.margem)}</dd><span>{resumo.margemPct !== null ? `${pct(resumo.margemPct)} sobre o custo` : 'Sem itens com preço'}</span></div>
        <div><dt>Capital sem preço de venda</dt><dd className={resumo.semPreco > 0 ? 'qty--warn' : ''}>{moeda(resumo.semPreco)}</dd><span>{resumo.itensSemPreco ? <Link to="/produtos?pendencia=preco">{numero(resumo.itensSemPreco)} produto(s) com saldo · corrigir</Link> : 'Todos com preço'}</span></div>
      </dl>
      {resumo.custo > 0 && resumo.semPreco / resumo.custo > 0.2 && (
        <div className="mb-16"><Notice tom="warn">{pct((resumo.semPreco / resumo.custo) * 100, 0)} do capital está em produtos sem preço de venda: a margem acima vale só para o restante.</Notice></div>
      )}

      <div className="grid grid-2 mb-16">
        <Panel titulo="Capital por categoria" descricao="Saldo × custo unitário">
          <div className="chart-box" style={{ height: Math.max(160, Math.min(12, resumo.categorias.length) * 38) }}>
            <ResponsiveContainer>
              <BarChart data={resumo.categorias.slice(0, 12)} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="categoria" width={130} tick={{ fill: cores['text-2'], fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => moeda(Number(v))} cursor={{ fill: cores.line, opacity: 0.4 }} />
                <Bar dataKey="custo" name="Capital" fill={cores.primary} radius={[0, 4, 4, 0]} barSize={18} label={{ position: 'right', formatter: (v: unknown) => compacto(Number(v)), fill: cores['text-2'], fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel flush titulo="Margem por categoria" descricao="Receita potencial sobre o custo, só dos itens com preço">
          <table className="table">
            <thead><tr><th>Categoria</th><th className="num">Capital</th><th className="num">Sem preço</th><th className="num">Margem</th></tr></thead>
            <tbody>
              {resumo.categorias.slice(0, 12).map(c => (
                <tr key={c.categoria}>
                  <td>{c.categoria}</td>
                  <td className="num">{moeda(c.custo)}</td>
                  <td className="num">{c.custo - c.custoComPreco > 0.5 ? <span className="qty--warn">{pct(((c.custo - c.custoComPreco) / c.custo) * 100, 0)}</span> : <span className="muted">-</span>}</td>
                  <td className="num">{c.margemPct === null ? <span className="muted">sem preço</span> : <b className={c.margemPct >= 50 ? 'up' : c.margemPct < 15 ? 'down' : ''}>{pct(c.margemPct)}</b>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel flush titulo="Capital imobilizado por produto" descricao={`${filtradas.length} produtos · ${moeda(totais.custo)} em custo`}
        acoes={<>
          <button className="btn btn--sm" onClick={() => exportarExcel('Relatorio_Gerencial_ViaPro', [{ nome: 'Capital imobilizado', colunas: colunasExport, linhas: filtradas }])}><IoDownloadOutline /> Excel</button>
          <button className="btn btn--sm" onClick={() => exportarPDF({ arquivo: 'Relatorio_Financeiro_ViaPro', titulo: 'Capital imobilizado em estoque', paisagem: true, resumo: [`Custo total: ${moeda(totais.custo)}`, `Itens: ${numero(totais.q)} un`], colunas: colunasExport, linhas: filtradas })}><IoDocumentTextOutline /> PDF</button>
        </>}>
        <div className="toolbar">
          <SearchInput value={busca} onChange={setBusca} placeholder="Produto, SKU ou categoria" />
          <label className="check"><input type="checkbox" checked={soSemPreco} onChange={e => setSoSemPreco(e.target.checked)} /> Só sem preço de venda</label>
        </div>
        <DataTable colunas={colunas} linhas={filtradas} chave={c => c.produtoId} ordemInicial={{ key: 'ct', dir: 'desc' }} porPagina={15} onLinha={c => navigate(`/kardex/${c.produtoId}`)} />
      </Panel>
    </>
  );
}
