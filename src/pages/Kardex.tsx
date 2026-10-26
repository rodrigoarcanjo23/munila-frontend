import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { IoDownloadOutline, IoDocumentTextOutline } from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { useCores } from '../lib/useCores';
import { contem, data, dataHora, moeda, numero } from '../lib/format';
import { estoqueMinimo } from '../lib/regras';
import { exportarExcel, exportarPDF } from '../lib/exportar';
import type { Produto } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { ProdutoPicker } from '../components/ProdutoPicker';
import { Code, Empty, Kpi, Loading, Loc, PageHeader, Panel, SearchInput } from '../components/ui';

interface LinhaK { id: string; dataHora: string; tipoAcao: string; codigo?: string | null; observacao?: string | null; usuario?: string; entrada: number; saida: number; saldo: number }
interface Resp { produto: Produto; saldoAtual: number; saldoInicial: number; saldosPorStatus: Record<string, number>; linhas: LinhaK[] }

/** Kardex: extrato de entradas e saídas do produto com saldo após cada lançamento. */
export default function Kardex() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dados: produtos } = useCarregar(async () => (await api.get<Produto[]>('/produtos')).data);
  return (
    <>
      <PageHeader titulo="Kardex" descricao="Extrato de movimentação por produto, com o saldo após cada lançamento." />
      <div className="panel mb-16" style={{ padding: 12 }}>
        <ProdutoPicker produtos={produtos ?? []} onSelecionar={p => navigate(`/kardex/${p.id}`)} placeholder="Buscar produto por nome, SKU ou código de barras" autoFocus={!id} />
      </div>
      {id ? <Extrato id={id} /> : <div className="panel"><Empty titulo="Escolha um produto">O Kardex mostra cada entrada e saída e como o saldo evoluiu.</Empty></div>}
    </>
  );
}

function Extrato({ id }: { id: string }) {
  const cores = useCores();
  const [busca, setBusca] = useState('');
  const { dados, carregando } = useCarregar(async () => (await api.get<Resp>(`/produtos/${id}/kardex`)).data, [id]);

  const linhas = useMemo(() => (dados?.linhas ?? []).filter(l => contem(busca, l.tipoAcao, l.codigo, l.observacao, l.usuario)), [dados, busca]);
  if (carregando && !dados) return <Loading linhas={4} />;
  if (!dados) return null;
  const { produto: p } = dados;
  const entradas = dados.linhas.reduce((a, l) => a + l.entrada, 0);
  const saidas = dados.linhas.reduce((a, l) => a + l.saida, 0);
  const serie = [{ dataHora: p.dataCadastro || dados.linhas[0]?.dataHora, saldo: dados.saldoInicial }, ...dados.linhas.map(l => ({ dataHora: l.dataHora, saldo: l.saldo }))];

  const colunas: Col<LinhaK>[] = [
    { key: 'd', titulo: 'Data', ordenar: l => l.dataHora, render: l => dataHora(l.dataHora) },
    { key: 't', titulo: 'Movimento', principal: true, render: l => <><div className="cell-title">{l.tipoAcao}</div>{l.observacao && <div className="cell-sub">{l.observacao}</div>}</> },
    { key: 'doc', titulo: 'Documento', render: l => (l.codigo ? <Code>{l.codigo}</Code> : '-') },
    { key: 'e', titulo: 'Entrada', align: 'right', render: l => (l.entrada ? <span className="up">+{numero(l.entrada)}</span> : '') },
    { key: 's', titulo: 'Saída', align: 'right', render: l => (l.saida ? <span className="down">−{numero(l.saida)}</span> : '') },
    { key: 'saldo', titulo: 'Saldo', align: 'right', render: l => <b>{numero(l.saldo)}</b> },
    { key: 'u', titulo: 'Usuário', ocultarCelular: true, render: l => l.usuario },
  ];
  const exportCols = [
    { titulo: 'Data', valor: (l: LinhaK) => dataHora(l.dataHora) }, { titulo: 'Movimento', valor: (l: LinhaK) => l.tipoAcao, largura: 28 },
    { titulo: 'Documento', valor: (l: LinhaK) => l.codigo || '' }, { titulo: 'Entrada', valor: (l: LinhaK) => l.entrada || '' },
    { titulo: 'Saída', valor: (l: LinhaK) => l.saida || '' }, { titulo: 'Saldo', valor: (l: LinhaK) => l.saldo }, { titulo: 'Usuário', valor: (l: LinhaK) => l.usuario || '' },
    { titulo: 'Observação', valor: (l: LinhaK) => l.observacao || '', largura: 40 },
  ];

  return (
    <>
      <Panel className="mb-16" titulo={p.nome} descricao={<><Code>{p.sku}</Code> {p.categoria?.nome} · cadastrado em {data(p.dataCadastro)}</>}
        acoes={<>
          <Loc>{p.enderecoLocalizacao}</Loc>
          <button className="btn btn--sm" onClick={() => exportarExcel(`Kardex_${p.sku}`, [{ nome: 'Kardex', colunas: exportCols, linhas: dados.linhas }])}><IoDownloadOutline /> Excel</button>
          <button className="btn btn--sm" onClick={() => exportarPDF({ arquivo: `Kardex_${p.sku}`, titulo: `Kardex ${p.sku}`, subtitulo: p.nome, paisagem: true, resumo: [`Saldo inicial ${dados.saldoInicial}`, `Entradas ${entradas}`, `Saídas ${saidas}`, `Saldo atual ${dados.saldoAtual}`], colunas: exportCols, linhas: dados.linhas })}><IoDocumentTextOutline /> PDF</button>
        </>}>
        <div className="kpis" style={{ marginBottom: 0 }}>
          <Kpi label="Saldo disponível" valor={numero(dados.saldoAtual)} dica={`Mínimo ${estoqueMinimo(p)}`} tom={dados.saldoAtual <= estoqueMinimo(p) ? 'warn' : 'ok'} />
          <Kpi label="Entradas" valor={`+${numero(entradas)}`} />
          <Kpi label="Saídas" valor={`−${numero(saidas)}`} />
          <Kpi label="Valor do saldo" valor={moeda(dados.saldoAtual * (p.precoCusto || 0))} dica={`Custo ${moeda(p.precoCusto)}`} />
          {Object.entries(dados.saldosPorStatus).filter(([s, q]) => s !== 'Disponível' && q > 0).map(([s, q]) => <Kpi key={s} label={s} valor={numero(q)} tom={s === 'Ruptura' ? 'bad' : 'warn'} />)}
        </div>
      </Panel>

      {dados.linhas.length > 1 && (
        <Panel titulo="Evolução do saldo" className="mb-16">
          <div className="chart-box" style={{ height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={serie} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={cores.line} vertical={false} />
                <XAxis dataKey="dataHora" tickFormatter={d => data(d).slice(0, 5)} tick={{ fill: cores['text-3'], fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fill: cores['text-3'], fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: cores.surface, border: `1px solid ${cores.line}`, borderRadius: 8, fontSize: 13 }} labelFormatter={d => dataHora(String(d))} />
                <Line type="stepAfter" dataKey="saldo" name="Saldo" stroke={cores.primary} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      <Panel flush titulo="Lançamentos" descricao={`Saldo de implantação: ${numero(dados.saldoInicial)} (antes do primeiro lançamento registrado)`}>
        <div className="toolbar"><SearchInput value={busca} onChange={setBusca} placeholder="Filtrar por tipo, documento, usuário ou observação" /></div>
        <DataTable colunas={colunas} linhas={[...linhas].reverse()} chave={l => l.id} porPagina={100}
          vazio={<Empty titulo="Sem movimentações">Este produto ainda não teve entradas ou saídas registradas.</Empty>} />
      </Panel>
    </>
  );
}
