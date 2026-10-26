import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { IoDownloadOutline } from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { useCores } from '../lib/useCores';
import { contem, moeda, numero, pct } from '../lib/format';
import { exportarExcel } from '../lib/exportar';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Code, Kpi, Loading, PageHeader, Panel, SearchInput, Segmented } from '../components/ui';

interface ItemABC {
  produtoId: string; sku: string; nome: string; categoria: string; quantidade: number; valor: number; custoUnitario: number; saldo: number;
  giro: number | null; coberturaDias: number | null; participacao: number; acumulado: number; classe: 'A' | 'B' | 'C';
}
interface Resp { total: number; resumo: { classe: string; itens: number; valor: number; quantidade: number }[]; itens: ItemABC[] }
const tomClasse = (c: string) => (c === 'A' ? 'primary' : c === 'B' ? 'info' : undefined);

export default function CurvaABC() {
  const navigate = useNavigate();
  const cores = useCores();
  const [dias, setDias] = useState('90');
  const [criterio, setCriterio] = useState<'valor' | 'quantidade'>('valor');
  const [classe, setClasse] = useState('');
  const [busca, setBusca] = useState('');
  const { dados, carregando } = useCarregar(async () => (await api.get<Resp>(`/gerencial/curva-abc?dias=${dias}&criterio=${criterio}`)).data, [dias, criterio]);

  const itens = (dados?.itens ?? []).filter(i => (!classe || i.classe === classe) && contem(busca, i.nome, i.sku, i.categoria));
  const grafico = (dados?.itens ?? []).filter(i => (criterio === 'valor' ? i.valor : i.quantidade) > 0).slice(0, 30);
  const fmt = (v: number) => (criterio === 'valor' ? moeda(v) : `${numero(v)} un`);

  const colunas: Col<ItemABC>[] = [
    { key: 'cl', titulo: 'Classe', ordenar: i => i.classe, render: i => <Badge tom={tomClasse(i.classe)} plain>{i.classe}</Badge> },
    { key: 'p', titulo: 'Produto', principal: true, ordenar: i => i.nome, render: i => <><div className="cell-title">{i.nome}</div><div className="cell-sub"><Code>{i.sku}</Code> {i.categoria}</div></> },
    { key: 'q', titulo: 'Consumo (un)', align: 'right', ordenar: i => i.quantidade, render: i => numero(i.quantidade) },
    { key: 'v', titulo: 'Consumo (R$)', align: 'right', ordenar: i => i.valor, render: i => moeda(i.valor) },
    { key: 'part', titulo: 'Participação', align: 'right', ordenar: i => i.participacao, render: i => pct(i.participacao) },
    { key: 'ac', titulo: 'Acumulado', align: 'right', ocultarCelular: true, ordenar: i => i.acumulado, render: i => pct(i.acumulado) },
    { key: 'saldo', titulo: 'Saldo', align: 'right', ocultarCelular: true, ordenar: i => i.saldo, render: i => numero(i.saldo) },
    { key: 'giro', titulo: 'Giro', align: 'right', ordenar: i => i.giro ?? -1, render: i => (i.giro === null ? '-' : `${numero(i.giro, 1)}×`) },
    { key: 'cob', titulo: 'Cobertura', align: 'right', ordenar: i => i.coberturaDias ?? 99999, render: i => (i.coberturaDias === null ? <span className="muted">sem giro</span> : `${numero(i.coberturaDias)} d`) },
  ];

  if (carregando && !dados) return <Loading />;
  const r = (c: string) => dados?.resumo.find(x => x.classe === c);
  return (
    <>
      <PageHeader titulo="Curva ABC" descricao="Classifica os produtos pela importância no consumo: A concentra ~80% do valor, B os próximos 15%, C o restante. Use para priorizar contagem, compra e endereço de picking."
        acoes={<>
          <Segmented valor={criterio} onChange={setCriterio} opcoes={[{ valor: 'valor', label: 'Por valor' }, { valor: 'quantidade', label: 'Por quantidade' }]} />
          <select className="select" style={{ width: 'auto' }} value={dias} onChange={e => setDias(e.target.value)} aria-label="Período">
            <option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="180">Últimos 180 dias</option><option value="365">Últimos 12 meses</option>
          </select>
          <button className="btn" onClick={() => exportarExcel('Curva_ABC', [{ nome: 'Curva ABC', linhas: itens, colunas: [
            { titulo: 'Classe', valor: i => i.classe }, { titulo: 'SKU', valor: i => i.sku }, { titulo: 'Produto', valor: i => i.nome, largura: 40 },
            { titulo: 'Consumo (un)', valor: i => i.quantidade }, { titulo: 'Consumo (R$)', valor: i => Number(i.valor.toFixed(2)) }, { titulo: 'Participação %', valor: i => i.participacao },
            { titulo: 'Acumulado %', valor: i => i.acumulado }, { titulo: 'Saldo', valor: i => i.saldo }, { titulo: 'Giro', valor: i => i.giro ?? '' }, { titulo: 'Cobertura (dias)', valor: i => i.coberturaDias ?? '' },
          ] }])}><IoDownloadOutline /> Excel</button>
        </>} />

      <div className="kpis">
        {['A', 'B', 'C'].map(c => (
          <Kpi key={c} label={`Classe ${c}`} valor={`${r(c)?.itens ?? 0} produtos`} dica={fmt(criterio === 'valor' ? r(c)?.valor ?? 0 : r(c)?.quantidade ?? 0)} tom={c === 'A' ? 'primary' : undefined} onClick={() => setClasse(classe === c ? '' : c)} />
        ))}
        <Kpi label="Consumo total no período" valor={fmt(dados?.total ?? 0)} />
      </div>

      <Panel titulo="Pareto dos 30 principais" descricao="Barras: consumo de cada produto. Linha: percentual acumulado." className="mb-16">
        <div className="chart-box" style={{ height: 300 }}>
          <ResponsiveContainer>
            <ComposedChart data={grafico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={cores.line} vertical={false} />
              <XAxis dataKey="sku" tick={{ fill: cores['text-3'], fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="v" tick={{ fill: cores['text-3'], fontSize: 11 }} axisLine={false} tickLine={false} width={60} tickFormatter={v => (criterio === 'valor' ? `R$${numero(v)}` : numero(v))} />
              <YAxis yAxisId="p" orientation="right" domain={[0, 100]} tick={{ fill: cores['text-3'], fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ background: cores.surface, border: `1px solid ${cores.line}`, borderRadius: 8, fontSize: 13 }}
                formatter={(v, n) => (n === 'Acumulado' ? pct(Number(v)) : fmt(Number(v)))} labelFormatter={(l, p) => `${l} — ${p?.[0]?.payload?.nome ?? ''}`} />
              <Bar yAxisId="v" dataKey={criterio} name="Consumo" fill={cores.primary} radius={[3, 3, 0, 0]} />
              <Line yAxisId="p" dataKey="acumulado" name="Acumulado" stroke={cores.warn} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel flush>
        <div className="toolbar">
          <Segmented valor={classe} onChange={setClasse} opcoes={[{ valor: '', label: 'Todas' }, { valor: 'A', label: 'A' }, { valor: 'B', label: 'B' }, { valor: 'C', label: 'C' }]} />
          <SearchInput value={busca} onChange={setBusca} placeholder="Produto, SKU ou categoria" />
        </div>
        <DataTable colunas={colunas} linhas={itens} chave={i => i.produtoId} onLinha={i => navigate(`/kardex/${i.produtoId}`)} />
      </Panel>
    </>
  );
}
