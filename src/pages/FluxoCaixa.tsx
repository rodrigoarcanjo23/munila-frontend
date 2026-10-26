import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IoDownloadOutline } from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { useCores } from '../lib/useCores';
import { compacto, moeda } from '../lib/format';
import { exportarExcel } from '../lib/exportar';
import { DataTable, type Col } from '../components/DataTable';
import { Empty, Kpi, Loading, Notice, PageHeader, Panel, Segmented } from '../components/ui';

interface Dia { data: string; entradas: number; saidas: number; saldo: number; realizado: boolean }
interface Fluxo {
  dias: number; saldoContas: number; vencidosPagar: number; vencidosReceber: number; entradasPrevistas: number; saidasPrevistas: number;
  saldoFinal: number; menorSaldo: number; serie: Dia[];
}
const br = (d: string) => d.split('-').reverse().join('/');

export default function FluxoCaixa() {
  const cores = useCores();
  const [dias, setDias] = useState<'30' | '60' | '90'>('60');
  const { dados, carregando } = useCarregar(async () => (await api.get<Fluxo>(`/financeiro/fluxo?dias=${dias}`)).data, [dias]);

  if (carregando && !dados) return <Loading />;
  if (!dados) return null;
  const previsto = dados.serie.filter(d => !d.realizado);
  const comMovimento = previsto.filter(d => d.entradas || d.saidas);
  const grafico = dados.serie.map(d => ({ ...d, saidasNeg: -d.saidas, saldoPrev: d.realizado ? null : d.saldo }));

  const colunas: Col<Dia>[] = [
    { key: 'd', titulo: 'Data', principal: true, render: d => br(d.data) },
    { key: 'e', titulo: 'Entradas', align: 'right', render: d => (d.entradas ? <span className="up">{moeda(d.entradas)}</span> : '-'), rodape: moeda(dados.entradasPrevistas) },
    { key: 's', titulo: 'Saídas', align: 'right', render: d => (d.saidas ? <span className="down">{moeda(d.saidas)}</span> : '-'), rodape: moeda(dados.saidasPrevistas) },
    { key: 'sl', titulo: 'Saldo previsto', align: 'right', render: d => <b className={d.saldo < 0 ? 'down' : ''}>{moeda(d.saldo)}</b> },
  ];

  return (
    <>
      <PageHeader titulo="Fluxo de caixa" descricao="Saldo das contas somado aos títulos em aberto, dia a dia. Títulos vencidos entram como previstos para hoje."
        acoes={<>
          <Segmented valor={dias} onChange={setDias} opcoes={[{ valor: '30', label: '30 dias' }, { valor: '60', label: '60 dias' }, { valor: '90', label: '90 dias' }]} />
          <button className="btn" onClick={() => exportarExcel('Fluxo_de_caixa', [{ nome: 'Fluxo', linhas: dados.serie, colunas: [
            { titulo: 'Data', valor: d => br(d.data) }, { titulo: 'Tipo', valor: d => (d.realizado ? 'Realizado' : 'Previsto') },
            { titulo: 'Entradas', valor: d => d.entradas }, { titulo: 'Saídas', valor: d => d.saidas }, { titulo: 'Saldo previsto', valor: d => (d.realizado ? '' : d.saldo) },
          ] }])}><IoDownloadOutline /> Excel</button>
        </>} />

      <div className="kpis">
        <Kpi label="Saldo atual das contas" valor={moeda(dados.saldoContas)} tom="primary" />
        <Kpi label="Entradas previstas" valor={moeda(dados.entradasPrevistas)} tom="ok" dica={dados.vencidosReceber ? `inclui ${moeda(dados.vencidosReceber)} em atraso` : undefined} />
        <Kpi label="Saídas previstas" valor={moeda(dados.saidasPrevistas)} tom="bad" dica={dados.vencidosPagar ? `inclui ${moeda(dados.vencidosPagar)} vencidos` : undefined} />
        <Kpi label={`Saldo em ${dados.dias} dias`} valor={moeda(dados.saldoFinal)} tom={dados.saldoFinal < 0 ? 'bad' : undefined} dica={`Menor saldo no período: ${moeda(dados.menorSaldo)}`} />
      </div>

      {dados.menorSaldo < 0 && <div className="mb-16"><Notice tom="bad">O saldo previsto fica negativo no período. Antecipe recebimentos ou renegocie pagamentos.</Notice></div>}
      {dados.saldoContas === 0 && <div className="mb-16"><Notice tom="info" acao={<Link className="btn btn--sm" to="/financeiro">Cadastrar contas</Link>}>Nenhum saldo de conta informado. O fluxo considera saldo inicial zero.</Notice></div>}

      <Panel titulo="Entradas, saídas e saldo" descricao="Últimos 30 dias realizados e o período previsto" className="mb-16"
        acoes={<div className="legend"><span><i style={{ background: cores.ok }} />Entradas</span><span><i style={{ background: cores.bad }} />Saídas</span><span><i style={{ background: cores.primary }} />Saldo previsto</span></div>}>
        <div className="chart-box" style={{ height: 300 }}>
          <ResponsiveContainer>
            <ComposedChart data={grafico} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} stackOffset="sign">
              <CartesianGrid stroke={cores.line} vertical={false} />
              <XAxis dataKey="data" tickFormatter={d => br(d).slice(0, 5)} tick={{ fill: cores['text-3'], fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
              <YAxis tickFormatter={v => compacto(v)} tick={{ fill: cores['text-3'], fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip contentStyle={{ background: cores.surface, border: `1px solid ${cores.line}`, borderRadius: 8, fontSize: 13 }} labelFormatter={d => br(String(d))}
                formatter={(v, n) => [moeda(Math.abs(Number(v))), n]} />
              <ReferenceLine y={0} stroke={cores['text-3']} />
              <Bar dataKey="entradas" name="Entradas" fill={cores.ok} stackId="m" />
              <Bar dataKey="saidasNeg" name="Saídas" fill={cores.bad} stackId="m" />
              <Line dataKey="saldoPrev" name="Saldo previsto" stroke={cores.primary} strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel flush titulo="Dias com movimento previsto">
        <DataTable colunas={colunas} linhas={comMovimento} chave={d => d.data} porPagina={100}
          vazio={<Empty titulo="Nenhum título em aberto no período">Lance contas a pagar e a receber em “Contas a pagar e receber”.</Empty>} />
      </Panel>
    </>
  );
}
