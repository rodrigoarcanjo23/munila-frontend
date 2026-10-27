import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  IoAlertCircle, IoWarning, IoTrendingUp, IoInformationCircle, IoCheckmarkCircle, IoArrowForward, IoDownloadOutline, IoRefreshOutline, IoCloseOutline,
} from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { useCores } from '../lib/useCores';
import { compacto, contem, data, dataUTC, moeda, numero, pct } from '../lib/format';
import { exportarExcel, aba } from '../lib/exportar';
import type { Categoria } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Code, Empty, Loading, Panel, SearchInput, Segmented } from '../components/ui';
import './PainelBI.css';
import { CapitalMargem } from './bi/CapitalMargem';

// ------------------------------------------------------------------ tipos da resposta de /bi/painel
type Nivel = 'critico' | 'atencao' | 'oportunidade' | 'info';
type Risco = 'Rompido' | 'Crítico' | 'Atenção' | 'OK' | 'Sem demanda';
type Saude = 'Saudável' | 'Excesso' | 'Lento' | 'Obsoleto' | 'Sem saldo';
interface Item {
  produtoId: string; sku: string; nome: string; categoria: string; fornecedor: string | null; unidade: string;
  custo: number; saldo: number; valorEstoque: number; consumo: number; consumoValor: number; consumoDiario: number;
  semanal?: number[]; cv: number | null; xyz: 'X' | 'Y' | 'Z' | null; abc: 'A' | 'B' | 'C';
  leadTimeDias: number; estoqueSeguranca: number; pontoPedido: number; estoqueMinimo: number;
  coberturaDias: number | null; coberturaComPedidosDias: number | null; emTransito: number; dataRuptura: string | null;
  risco: Risco; giro: number | null; diasSemSaida: number; ultimaSaida: string | null; saude: Saude; excessoUn: number; excessoValor: number; perdasValor: number;
}
interface Insight { nivel: Nivel; titulo: string; texto: string; acao: string; rota: string; impacto: number }
interface SemanaDemanda { semana: string; unidades: number; valor: number; previsto: boolean; faixaUn?: [number, number]; faixaValor?: [number, number] }
interface Fornecedor { id: string; nome: string; pedidos: number; valor: number; pendentes: number; atrasados: number; noPrazoPct: number | null; completoPct: number | null; otifPct: number | null; leadMedianoDias: number | null; leadVariacaoDias: number | null }
interface Receita {
  produtoId: string; nome: string; sku: string; saldoAcabado: number; consumoDiario: number; podeProduzir: number; diasAtendidos: number | null;
  gargalo: { nome: string; sku: string; saldo: number; porUnidade: number }; faltaGargalo30d: number; custoReceita: number;
  componentes: { produtoId: string; nome: string; sku: string; porUnidade: number; saldo: number; rende: number | null }[];
}
interface Rebalanceamento { produtoId: string; sku: string; nome: string; de: string; para: string; quantidade: number; coberturaDestino: number | null }
interface BI {
  parametros: { dias: number; semanas: number; semanasPedidas: number; geradoEm: string };
  kpis: {
    valorEstoque: number; giroAnual: number | null; coberturaDias: number | null; disponibilidade: number | null; otif: number | null; acuracia: number | null;
    cicloSeparacaoH: number | null; capitalParado: number; excessoValor: number; perdasValor: number; consumoValor: number; produzidoUn: number; riscoValidade: number;
    tendenciaPct: number | null; itensCriticos: number; itensAtencao: number; itensAtivos: number; itensSemDemanda: number; previsao4SemValor: number;
  };
  insights: Insight[];
  demanda: SemanaDemanda[];
  matriz: { abc: string; xyz: string; itens: number; valorEstoque: number; consumoValor: number }[];
  saude: { saude: Saude; itens: number; valor: number }[];
  validade: Record<'vencido' | 'ate30' | 'ate60' | 'ate90' | 'acima90' | 'semValidade', number>;
  calor: number[][];
  pico: { dia: number; hora: number; movimentos: number };
  fornecedores: Fornecedor[];
  producao: Receita[];
  separacao: { ordens: number; linhas: number; esperaMediaH: number | null; execucaoMediaH: number | null; cicloMedioH: number | null; slaPct: number | null; porSeparador: { nome: string; ordens: number; linhas: number; horas: number; linhasHora: number | null }[] };
  acuracia: { inventarios: number; itens: number; porItem: number | null; porValor: number | null; divergenciaValor: number; historico: { codigo: string; data: string; itens: number; acuracia: number | null; divergenciaValor: number }[] };
  rebalanceamento: Rebalanceamento[];
  armazens: { id: string; nome: string; codigo: string }[];
  itens: Item[];
}

// ------------------------------------------------------------------ referências de mercado usadas nas metas
type Tom = 'ok' | 'warn' | 'bad';
const metaMaior = (v: number | null, bom: number, regular: number): Tom | null => (v === null ? null : v >= bom ? 'ok' : v >= regular ? 'warn' : 'bad');
const metaMenor = (v: number | null, bom: number, regular: number): Tom | null => (v === null ? null : v <= bom ? 'ok' : v <= regular ? 'warn' : 'bad');
const ROTULO_TOM: Record<Tom, string> = { ok: 'Na meta', warn: 'Atenção', bad: 'Fora da meta' };
const ICONE_TOM: Record<Tom, ReactNode> = { ok: <IoCheckmarkCircle />, warn: <IoWarning />, bad: <IoAlertCircle /> };

const NIVEL: Record<Nivel, { rotulo: string; icone: ReactNode }> = {
  critico: { rotulo: 'Crítico', icone: <IoAlertCircle /> },
  atencao: { rotulo: 'Atenção', icone: <IoWarning /> },
  oportunidade: { rotulo: 'Oportunidade', icone: <IoTrendingUp /> },
  info: { rotulo: 'Para saber', icone: <IoInformationCircle /> },
};

const POLITICA: Record<string, string> = {
  AX: 'Reposição automática e estoque enxuto',
  AY: 'Ponto de pedido com segurança reforçada',
  AZ: 'Comprar sob pedido ou com previsão do comercial',
  BX: 'Reposição periódica programada',
  BY: 'Revisão quinzenal dos parâmetros',
  BZ: 'Segurança alta ou compra sob pedido',
  CX: 'Lotes maiores e menos pedidos',
  CY: 'Revisão mensal',
  CZ: 'Avaliar descontinuar',
};
const XYZ_DESC: Record<string, string> = { X: 'Demanda regular', Y: 'Variação moderada', Z: 'Demanda irregular' };

const SAUDE_TOM: Record<Saude, string> = { 'Saudável': 'ok', Excesso: 'info', Lento: 'warn', Obsoleto: 'bad', 'Sem saldo': 'muted' };
const SAUDE_DESC: Record<Saude, string> = {
  'Saudável': 'Saída nos últimos 60 dias e até 90 dias de cobertura',
  Excesso: 'Mais de 90 dias de cobertura',
  Lento: 'Sem saída entre 61 e 180 dias',
  Obsoleto: 'Sem saída há mais de 180 dias',
  'Sem saldo': 'Saldo zerado',
};
const RISCO_TOM: Record<Risco, 'bad' | 'warn' | 'ok' | undefined> = { Rompido: 'bad', 'Crítico': 'bad', 'Atenção': 'warn', OK: 'ok', 'Sem demanda': undefined };

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HORAS = Array.from({ length: 16 }, (_, i) => i + 6); // 6h às 21h

const SECOES = [
  ['recomendacoes', 'Recomendações'], ['demanda', 'Demanda'], ['ruptura', 'Ruptura'], ['matriz', 'ABC × XYZ'], ['saude', 'Saúde do estoque'], ['capital', 'Capital e margem'],
  ['pcp', 'PCP'], ['fornecedores', 'Fornecedores'], ['operacao', 'Operação'], ['base', 'Base analítica'],
] as const;

const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const horas = (h: number | null) => (h === null ? '-' : h < 1 ? `${Math.round(h * 60)} min` : `${numero(h, 1)} h`);

// ==================================================================
export default function PainelBI() {
  const [semanas, setSemanas] = useState<'4' | '8' | '13' | '26' | '52'>('13');
  const [armazemId, setArmazemId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [filtroMatriz, setFiltroMatriz] = useState<string | null>(null);

  const { dados: categorias } = useCarregar(async () => (await api.get<Categoria[]>('/categorias')).data);
  const { dados, carregando, erro, recarregar } = useCarregar(async () => {
    const qs = new URLSearchParams({ dias: String(Number(semanas) * 7) });
    if (armazemId) qs.set('armazemId', armazemId);
    if (categoriaId) qs.set('categoriaId', categoriaId);
    return (await api.get<BI>(`/bi/painel?${qs}`)).data;
  }, [semanas, armazemId, categoriaId]);

  if (carregando && !dados) return <Loading linhas={8} />;
  if (!dados) return (
    <Panel><Empty titulo="Não foi possível montar o Painel BI">{erro}<div className="mt-16"><button className="btn btn--primary" onClick={() => recarregar()}><IoRefreshOutline /> Tentar de novo</button></div></Empty></Panel>
  );

  const k = dados.kpis;
  const filtrarMatriz = (chave: string) => { setFiltroMatriz(chave); setTimeout(() => irPara('base'), 30); };

  return (
    <div className={`bi ${carregando ? 'bi--atualizando' : ''}`}>
      {/* ---------------- Torre de controle */}
      <section className="bi-torre" aria-label="Indicadores principais">
        <div className="bi-torre__topo">
          <div>
            <h1>Painel BI</h1>
            <p>Logística e PCP nas últimas {dados.parametros.semanas} semanas{dados.parametros.semanas < dados.parametros.semanasPedidas ? ' (todo o histórico disponível)' : ''}. Atualizado {data(dados.parametros.geradoEm)} às {new Date(dados.parametros.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</p>
          </div>
          <div className="bi-torre__filtros">
            <Segmented valor={semanas} onChange={setSemanas} opcoes={[{ valor: '4', label: '4 sem' }, { valor: '8', label: '8 sem' }, { valor: '13', label: '13 sem' }, { valor: '26', label: '26 sem' }, { valor: '52', label: '52 sem' }]} />
            <select className="select" value={armazemId} onChange={e => setArmazemId(e.target.value)} aria-label="Armazém">
              <option value="">Todos os armazéns</option>
              {dados.armazens.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            <select className="select" value={categoriaId} onChange={e => setCategoriaId(e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {(categorias ?? []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        </div>

        <div className="bi-indicadores">
          <Indicador rotulo="Giro anual" valor={k.giroAnual === null ? '-' : `${numero(k.giroAnual, 1)}×`} meta="Meta: 6× ou mais" tom={metaMaior(k.giroAnual, 6, 3)} />
          <Indicador rotulo="Cobertura média" valor={k.coberturaDias === null ? '-' : `${numero(k.coberturaDias)} d`} meta="Meta: 30 a 60 dias"
            tom={k.coberturaDias === null ? null : k.coberturaDias >= 30 && k.coberturaDias <= 60 ? 'ok' : k.coberturaDias >= 15 && k.coberturaDias <= 90 ? 'warn' : 'bad'} />
          <Indicador rotulo="Nível de serviço" valor={k.disponibilidade === null ? '-' : pct(k.disponibilidade)} meta="Itens com demanda e saldo · meta 97%" tom={metaMaior(k.disponibilidade, 97, 90)} />
          <Indicador rotulo="OTIF fornecedores" valor={k.otif === null ? '-' : pct(k.otif)} meta="No prazo e completo · meta 90%" tom={metaMaior(k.otif, 90, 80)} onClick={() => irPara('fornecedores')} />
          <Indicador rotulo="Acurácia de inventário" valor={k.acuracia === null ? '-' : pct(k.acuracia)} meta="Itens sem divergência · meta 95%" tom={metaMaior(k.acuracia, 95, 90)} onClick={() => irPara('operacao')} />
          <Indicador rotulo="Ciclo da separação" valor={horas(k.cicloSeparacaoH)} meta="Da criação à conclusão · meta 24 h" tom={metaMenor(k.cicloSeparacaoH, 24, 48)} onClick={() => irPara('operacao')} />
        </div>

        <dl className="bi-torre__rodape">
          <div><dt>Estoque a custo</dt><dd>{moeda(k.valorEstoque)}</dd></div>
          <div><dt>Consumo no período</dt><dd>{moeda(k.consumoValor)}</dd></div>
          <div><dt>Previsão 4 semanas</dt><dd>{moeda(k.previsao4SemValor)}</dd></div>
          <div><dt>Capital parado</dt><dd>{moeda(k.capitalParado)}</dd></div>
          <div><dt>Validade em risco</dt><dd>{moeda(k.riscoValidade)}</dd></div>
          <div><dt>Perdas</dt><dd>{moeda(k.perdasValor)}</dd></div>
        </dl>
      </section>

      <nav className="bi-nav" aria-label="Seções do painel">
        {SECOES.map(([id, rotulo]) => <button key={id} type="button" onClick={() => irPara(id)}>{rotulo}</button>)}
      </nav>

      <Recomendacoes insights={dados.insights} />
      <Demanda dados={dados} />
      <Ruptura itens={dados.itens} />
      <Matriz dados={dados} onFiltrar={filtrarMatriz} />
      <SaudeEstoque dados={dados} />
      <Secao id="capital" titulo="Capital e margem" descricao="Quanto está imobilizado a custo, quanto vale a preço de venda e a margem que isso representa. Respeita os filtros de armazém e categoria.">
        <CapitalMargem armazemId={armazemId} categoriaId={categoriaId} />
      </Secao>
      <PCP dados={dados} />
      <Fornecedores fornecedores={dados.fornecedores} />
      <Operacao dados={dados} filtrado={!!armazemId} />
      <Base dados={dados} filtroMatriz={filtroMatriz} limparMatriz={() => setFiltroMatriz(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ peças

function Indicador({ rotulo, valor, meta, tom, onClick }: { rotulo: string; valor: string; meta: string; tom: Tom | null; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className="bi-ind" onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="bi-ind__rotulo">{rotulo}</span>
      <strong className="bi-ind__valor">{valor}</strong>
      <span className="bi-ind__meta">{meta}</span>
      {tom ? <span className={`bi-ind__status bi-ind__status--${tom}`}>{ICONE_TOM[tom]} {ROTULO_TOM[tom]}</span> : <span className="bi-ind__status">Sem dados no período</span>}
    </Tag>
  );
}

function Secao({ id, titulo, descricao, acoes, children }: { id: string; titulo: string; descricao?: ReactNode; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="bi-secao">
      <header className="bi-secao__cab">
        <div><h2>{titulo}</h2>{descricao && <p>{descricao}</p>}</div>
        {acoes && <div className="bi-secao__acoes">{acoes}</div>}
      </header>
      {children}
    </section>
  );
}

function Recomendacoes({ insights }: { insights: Insight[] }) {
  const navigate = useNavigate();
  const abrir = (rota: string) => (rota.startsWith('#') ? irPara(rota.slice(1)) : navigate(rota));
  return (
    <Secao id="recomendacoes" titulo="Recomendações" descricao="Geradas a partir dos números abaixo e ordenadas pelo impacto financeiro.">
      {insights.length === 0 ? <div className="panel"><Empty titulo="Nada fora do esperado">Nenhuma recomendação para o período e filtros escolhidos.</Empty></div> : (
        <ol className="bi-recs">
          {insights.map(i => (
            <li key={i.titulo} className={`bi-rec bi-rec--${i.nivel}`}>
              <span className="bi-rec__nivel">{NIVEL[i.nivel].icone} {NIVEL[i.nivel].rotulo}</span>
              <h3>{i.titulo}</h3>
              <p>{i.texto}</p>
              <button className="btn btn--sm btn--ghost bi-rec__acao" onClick={() => abrir(i.rota)}>{i.acao} <IoArrowForward /></button>
            </li>
          ))}
        </ol>
      )}
    </Secao>
  );
}

function Demanda({ dados }: { dados: BI }) {
  const cores = useCores();
  const [medida, setMedida] = useState<'valor' | 'unidades'>('valor');
  const fmt = (v: number) => (medida === 'valor' ? moeda(v) : `${numero(v)} un`);
  const serie = useMemo(() => {
    const hist = dados.demanda.filter(d => !d.previsto);
    const ultimo = hist[hist.length - 1];
    return dados.demanda.map(d => {
      const v = medida === 'valor' ? d.valor : d.unidades;
      if (!d.previsto) return { semana: d.semana, real: v, previsto: d === ultimo ? v : undefined, faixa: d === ultimo ? [v, v] : undefined };
      return { semana: d.semana, previsto: v, faixa: medida === 'valor' ? d.faixaValor : d.faixaUn };
    });
  }, [dados.demanda, medida]);
  const k = dados.kpis;
  const rotulo = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const tooltipStyle = { background: cores.surface, border: `1px solid ${cores.line}`, borderRadius: 8, fontSize: 13 };

  return (
    <Secao id="demanda" titulo="Demanda e previsão" descricao="Consumo semanal (vendas, produção e demonstração) e projeção das próximas 4 semanas pelo método de Holt, com faixa de 80% de confiança."
      acoes={<Segmented valor={medida} onChange={setMedida} opcoes={[{ valor: 'valor', label: 'R$ a custo' }, { valor: 'unidades', label: 'Unidades' }]} />}>
      <div className="bi-demanda panel">
        <div className="bi-demanda__grafico">
          <div className="legend" style={{ marginBottom: 8 }}>
            <span><i style={{ background: cores.primary }} />Realizado</span>
            <span><i className="bi-leg-tracejado" style={{ borderColor: cores.primary }} />Previsão</span>
            <span><i style={{ background: cores.primary, opacity: 0.18 }} />Faixa provável</span>
          </div>
          <div className="chart-box" style={{ height: 'auto' }}>
            <ResponsiveContainer>
              <ComposedChart data={serie} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid stroke={cores.line} vertical={false} />
                <XAxis dataKey="semana" tickFormatter={rotulo} tick={{ fill: cores['text-3'], fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis tickFormatter={v => compacto(Number(v))} tick={{ fill: cores['text-3'], fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={s => `Semana de ${rotulo(String(s))}`}
                  formatter={(v, nome) => (Array.isArray(v) ? [`${fmt(Number(v[0]))} a ${fmt(Number(v[1]))}`, nome] : [fmt(Number(v)), nome])} />
                <Area dataKey="faixa" name="Faixa provável" stroke="none" fill={cores.primary} fillOpacity={0.14} isAnimationActive={false} />
                <Line dataKey="real" name="Realizado" stroke={cores.primary} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: cores.primary }} activeDot={{ r: 5 }} isAnimationActive={false} />
                <Line dataKey="previsto" name="Previsão" stroke={cores.primary} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: cores.surface, stroke: cores.primary, strokeWidth: 2, strokeDasharray: '0' }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <dl className="bi-demanda__lado">
          <div><dt>Tendência</dt><dd>{k.tendenciaPct === null ? '-' : <span className={k.tendenciaPct >= 0 ? 'up' : 'down'}>{k.tendenciaPct > 0 ? '+' : ''}{pct(k.tendenciaPct)}</span>}</dd><small>Últimas 4 semanas contra as 4 anteriores</small></div>
          <div><dt>Previsão 4 semanas</dt><dd>{moeda(k.previsao4SemValor)}</dd><small>Consumo esperado a custo</small></div>
          <div><dt>Itens com demanda</dt><dd>{numero(k.itensAtivos)}</dd><small>{numero(k.itensSemDemanda)} com saldo e sem saída no período</small></div>
          <div><dt>Produzido</dt><dd>{numero(k.produzidoUn)} un</dd><small>Entradas por produção no período</small></div>
        </dl>
      </div>
    </Secao>
  );
}

/** Barra de cobertura: comprimento = dias de estoque, marcador = lead time do fornecedor. */
function BarraCobertura({ i, escala }: { i: Item; escala: number }) {
  const cob = Math.min(i.coberturaDias ?? 0, escala), comPed = Math.min(i.coberturaComPedidosDias ?? 0, escala);
  const tom = RISCO_TOM[i.risco] ?? 'ok';
  return (
    <div className="bi-cob" title={`Cobertura ${i.coberturaDias ?? 0} dias · com pedidos ${i.coberturaComPedidosDias ?? 0} dias · lead time ${i.leadTimeDias} dias`}>
      <div className="bi-cob__trilho">
        {comPed > cob && <i className="bi-cob__pedido" style={{ width: `${(comPed / escala) * 100}%` }} />}
        <i className={`bi-cob__saldo bi-cob__saldo--${tom}`} style={{ width: `${Math.max(1.5, (cob / escala) * 100)}%` }} />
        <b className="bi-cob__lead" style={{ left: `${Math.min(100, (i.leadTimeDias / escala) * 100)}%` }} />
      </div>
      <span className="bi-cob__txt">{i.coberturaDias ?? 0} d <span className="muted">/ lead {numero(i.leadTimeDias)} d</span></span>
    </div>
  );
}

function Ruptura({ itens }: { itens: Item[] }) {
  const navigate = useNavigate();
  const lista = useMemo(() => itens.filter(i => ['Rompido', 'Crítico', 'Atenção'].includes(i.risco)).sort((a, b) => (a.coberturaDias ?? 0) - (b.coberturaDias ?? 0)), [itens]);
  const escala = Math.max(30, ...lista.map(i => i.leadTimeDias * 1.6));
  const colunas: Col<Item>[] = [
    { key: 'p', titulo: 'Produto', principal: true, ordenar: i => i.nome, render: i => <><div className="cell-title">{i.nome}</div><div className="cell-sub"><Code>{i.sku}</Code> {i.fornecedor ?? ''}</div></> },
    { key: 'r', titulo: 'Risco', ordenar: i => i.coberturaDias ?? 0, render: i => <Badge tom={RISCO_TOM[i.risco]}>{i.risco}</Badge> },
    { key: 'c', titulo: 'Cobertura × lead time', rotulo: 'Cobertura', render: i => <BarraCobertura i={i} escala={escala} /> },
    { key: 'd', titulo: 'Acaba em', ordenar: i => i.dataRuptura, render: i => (i.saldo <= 0 ? <b className="down">Sem saldo</b> : dataUTC(i.dataRuptura)) },
    { key: 's', titulo: 'Saldo', align: 'right', ordenar: i => i.saldo, render: i => numero(i.saldo) },
    { key: 'cd', titulo: 'Consumo/dia', align: 'right', ocultarCelular: true, ordenar: i => i.consumoDiario, render: i => numero(i.consumoDiario, 1) },
    { key: 'pp', titulo: 'Ponto de pedido', align: 'right', ocultarCelular: true, ordenar: i => i.pontoPedido, render: i => <span title={`Estoque de segurança: ${i.estoqueSeguranca}`}>{numero(i.pontoPedido)}</span> },
    { key: 't', titulo: 'Em trânsito', align: 'right', ordenar: i => i.emTransito, render: i => (i.emTransito ? numero(i.emTransito) : <span className="muted">Sem pedido</span>) },
  ];
  return (
    <Secao id="ruptura" titulo="Risco de ruptura" descricao="Itens que acabam antes ou perto de a reposição chegar. A barra é a cobertura em dias; o traço vertical é o lead time; o trecho claro é o que já está pedido."
      acoes={<button className="btn btn--sm btn--primary" onClick={() => navigate('/compras/sugestao')}>Abrir sugestão de compras</button>}>
      <div className="panel panel--flush">
        <DataTable colunas={colunas} linhas={lista} chave={i => i.produtoId} porPagina={12} onLinha={i => navigate(`/kardex/${i.produtoId}`)}
          vazio={<Empty titulo="Nenhum item em risco">Todos os itens com demanda têm cobertura maior que o lead time.</Empty>} />
      </div>
    </Secao>
  );
}

function Matriz({ dados, onFiltrar }: { dados: BI; onFiltrar: (chave: string) => void }) {
  const max = Math.max(1, ...dados.matriz.map(c => c.consumoValor));
  const total = dados.matriz.reduce((a, c) => a + c.consumoValor, 0) || 1;
  const cel = (abc: string, xyz: string) => dados.matriz.find(c => c.abc === abc && c.xyz === xyz)!;
  const semDemanda = dados.itens.filter(i => i.xyz === null && i.saldo > 0);
  return (
    <Secao id="matriz" titulo="Matriz ABC × XYZ" descricao="ABC pelo valor consumido (80% / 15% / 5%); XYZ pela regularidade da demanda semanal (coeficiente de variação até 0,5 / até 1 / acima de 1). Cada quadrante pede uma política de reposição diferente.">
      <div className="panel bi-matriz-wrap">
        <div className="bi-matriz" role="table" aria-label="Matriz ABC por XYZ">
          <div role="row" className="bi-matriz__linha">
            <span role="columnheader" />
            {['X', 'Y', 'Z'].map(x => <span role="columnheader" key={x} className="bi-matriz__cab"><b>{x}</b>{XYZ_DESC[x]}</span>)}
          </div>
          {['A', 'B', 'C'].map(a => (
            <div role="row" key={a} className="bi-matriz__linha">
              <span role="rowheader" className="bi-matriz__cab bi-matriz__cab--lin"><b>{a}</b>{a === 'A' ? '80% do valor' : a === 'B' ? '15% do valor' : '5% do valor'}</span>
              {['X', 'Y', 'Z'].map(x => {
                const c = cel(a, x);
                const intensidade = c.consumoValor > 0 ? 12 + (c.consumoValor / max) * 78 : 0;
                return (
                  <button role="cell" key={x} type="button" className={`bi-matriz__cel ${intensidade > 50 ? 'bi-matriz__cel--forte' : ''}`} disabled={!c.itens}
                    style={{ ['--i' as string]: `${intensidade}%` }} onClick={() => onFiltrar(a + x)}
                    title={`${a}${x}: ${c.itens} itens · consumo ${moeda(c.consumoValor)} · estoque ${moeda(c.valorEstoque)}`}>
                    <span className="bi-matriz__quad">{a}{x}</span>
                    <strong>{c.itens} {c.itens === 1 ? 'item' : 'itens'}</strong>
                    <span>{pct((c.consumoValor / total) * 100, 0)} do consumo · estoque {compacto(c.valorEstoque)}</span>
                    <em>{POLITICA[a + x]}</em>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="muted bi-nota">Clique em um quadrante para ver os itens na base analítica. {semDemanda.length > 0 && `${semDemanda.length} item(ns) com saldo e sem nenhuma saída no período ficam fora da matriz.`}</p>
      </div>
    </Secao>
  );
}

function BarraEmpilhada({ partes, total }: { partes: { rotulo: string; valor: number; tom: string; dica?: string; itens?: number }[]; total: number }) {
  return (
    <>
      <div className="bi-pilha" role="img" aria-label={partes.map(p => `${p.rotulo}: ${moeda(p.valor)}`).join(', ')}>
        {partes.filter(p => p.valor > 0).map(p => <i key={p.rotulo} className={`bi-tom--${p.tom}`} style={{ flexGrow: p.valor }} title={`${p.rotulo}: ${moeda(p.valor)} (${pct((p.valor / (total || 1)) * 100)})`} />)}
      </div>
      <ul className="bi-pilha__leg">
        {partes.map(p => (
          <li key={p.rotulo} title={p.dica}>
            <i className={`bi-tom--${p.tom}`} />
            <span>{p.rotulo}{p.itens !== undefined && <small> · {p.itens} {p.itens === 1 ? 'item' : 'itens'}</small>}</span>
            <b>{moeda(p.valor)}</b>
            <small className="muted">{pct((p.valor / (total || 1)) * 100, 0)}</small>
          </li>
        ))}
      </ul>
    </>
  );
}

function SaudeEstoque({ dados }: { dados: BI }) {
  const navigate = useNavigate();
  const totalSaude = dados.saude.reduce((a, s) => a + s.valor, 0);
  const v = dados.validade;
  const totalVal = Object.values(v).reduce((a, b) => a + b, 0);
  const problemas = dados.itens.filter(i => ['Obsoleto', 'Lento', 'Excesso'].includes(i.saude)).sort((a, b) => b.valorEstoque - a.valorEstoque);
  const colunas: Col<Item>[] = [
    { key: 'p', titulo: 'Produto', principal: true, ordenar: i => i.nome, render: i => <><div className="cell-title">{i.nome}</div><div className="cell-sub"><Code>{i.sku}</Code> {i.categoria}</div></> },
    { key: 's', titulo: 'Situação', ordenar: i => i.saude, render: i => <Badge tom={SAUDE_TOM[i.saude] as 'ok'}>{i.saude}</Badge> },
    { key: 'u', titulo: 'Última saída', ordenar: i => i.diasSemSaida, render: i => (i.ultimaSaida ? <>{data(i.ultimaSaida)}<div className="cell-sub">{i.diasSemSaida <= 1 ? 'ontem ou hoje' : `há ${numero(i.diasSemSaida)} dias`}</div></> : <span className="muted">Nunca saiu</span>) },
    { key: 'c', titulo: 'Cobertura', align: 'right', ordenar: i => i.coberturaDias ?? 99999, render: i => (i.coberturaDias === null ? '∞' : `${numero(i.coberturaDias)} d`) },
    { key: 'q', titulo: 'Saldo', align: 'right', ocultarCelular: true, ordenar: i => i.saldo, render: i => numero(i.saldo) },
    { key: 'v', titulo: 'Valor parado', align: 'right', ordenar: i => i.valorEstoque, render: i => <b>{moeda(i.saude === 'Excesso' ? i.excessoValor : i.valorEstoque)}</b> },
  ];
  return (
    <Secao id="saude" titulo="Saúde do estoque" descricao="Onde está o capital: o que gira, o que está sobrando e o que está parado.">
      <div className="grid grid-2 mb-16">
        <Panel titulo="Capital por situação" descricao={`${moeda(totalSaude)} em estoque disponível`}>
          <BarraEmpilhada total={totalSaude} partes={dados.saude.filter(s => s.saude !== 'Sem saldo').map(s => ({ rotulo: s.saude, valor: s.valor, tom: SAUDE_TOM[s.saude], dica: SAUDE_DESC[s.saude], itens: s.itens }))} />
        </Panel>
        <Panel titulo="Capital por prazo de validade" descricao="Por lote; usa a validade do cadastro quando o lote não tem" acoes={<button className="btn btn--sm btn--ghost" onClick={() => navigate('/validade')}>Abrir validade <IoArrowForward /></button>}>
          <BarraEmpilhada total={totalVal} partes={[
            { rotulo: 'Vencido', valor: v.vencido, tom: 'bad' }, { rotulo: 'Até 30 dias', valor: v.ate30, tom: 'warn' },
            { rotulo: '31 a 60 dias', valor: v.ate60, tom: 'seq2' }, { rotulo: '61 a 90 dias', valor: v.ate90, tom: 'seq3' },
            { rotulo: 'Acima de 90 dias', valor: v.acima90, tom: 'seq4' }, { rotulo: 'Sem validade', valor: v.semValidade, tom: 'muted' },
          ]} />
        </Panel>
      </div>
      <Panel flush titulo="Capital parado e excesso" descricao="Itens lentos, obsoletos ou com mais de 90 dias de cobertura (no excesso, só o que passa de 90 dias)">
        <DataTable colunas={colunas} linhas={problemas} chave={i => i.produtoId} porPagina={10} ordemInicial={{ key: 'v', dir: 'desc' }} onLinha={i => navigate(`/kardex/${i.produtoId}`)}
          vazio={<Empty titulo="Nenhum item parado">Todo o estoque teve saída recente e cobertura até 90 dias.</Empty>} />
      </Panel>
    </Secao>
  );
}

function PCP({ dados }: { dados: BI }) {
  const navigate = useNavigate();
  if (!dados.producao.length) return (
    <Secao id="pcp" titulo="PCP: capacidade de produção"><div className="panel"><Empty titulo="Nenhuma receita cadastrada">Cadastre a composição dos kits em Produtos para ver quanto dá para produzir e qual componente limita a produção.</Empty></div></Secao>
  );
  return (
    <Secao id="pcp" titulo="PCP: capacidade de produção" descricao="Quanto dá para produzir de cada receita com o saldo atual dos componentes, por quantos dias isso atende a demanda e qual componente é o gargalo.">
      <div className="bi-pcp">
        {dados.producao.map(r => {
          const maxRende = Math.max(1, ...r.componentes.map(c => c.rende ?? 0));
          const tom = r.podeProduzir === 0 ? 'bad' : r.diasAtendidos !== null && r.diasAtendidos < 15 ? 'warn' : 'ok';
          return (
            <article key={r.produtoId} className="panel bi-receita">
              <header>
                <div><h3>{r.nome}</h3><Code>{r.sku}</Code></div>
                <div className="bi-receita__num"><strong>{numero(r.podeProduzir)}</strong><span>un produzíveis</span></div>
              </header>
              <div className="bi-receita__resumo">
                <Badge tom={tom}>{r.diasAtendidos === null ? 'Sem demanda no período' : `Atende ${numero(r.diasAtendidos)} dias`}</Badge>
                <span className="muted">Acabado em estoque: {numero(r.saldoAcabado)} · consumo {numero(r.consumoDiario, 1)}/dia · custo da receita {moeda(r.custoReceita)}</span>
              </div>
              <ul className="bi-receita__comp">
                {r.componentes.map(c => (
                  <li key={c.produtoId} className={c.nome === r.gargalo.nome ? 'is-gargalo' : ''}>
                    <span className="bi-receita__nome">{c.nome}{c.nome === r.gargalo.nome && <Badge tom="warn" plain>Gargalo</Badge>}<small>{c.porUnidade} por unidade · saldo {numero(c.saldo)}</small></span>
                    <div className="meter"><i style={{ width: `${((c.rende ?? 0) / maxRende) * 100}%` }} /></div>
                    <b>{numero(c.rende ?? 0)}</b>
                  </li>
                ))}
              </ul>
              {r.faltaGargalo30d > 0 && <p className="bi-receita__falta">Para cobrir 30 dias faltam <b>{numero(r.faltaGargalo30d)}</b> de {r.gargalo.nome}.</p>}
            </article>
          );
        })}
      </div>
      <div className="mt-16"><button className="btn btn--sm" onClick={() => navigate('/estoque')}>Registrar produção no estoque <IoArrowForward /></button></div>
    </Secao>
  );
}

function Medidor({ v, meta }: { v: number | null; meta: number }) {
  if (v === null) return <span className="muted">-</span>;
  const tom: Tom = v >= meta ? 'ok' : v >= meta - 10 ? 'warn' : 'bad';
  return (
    <span className="bi-medidor">
      <span className="meter"><i className={`bi-tom--${tom}`} style={{ width: `${v}%` }} /><b style={{ left: `${meta}%` }} /></span>
      <span className="nowrap">{pct(v, 0)}</span>
    </span>
  );
}

function Fornecedores({ fornecedores }: { fornecedores: Fornecedor[] }) {
  const colunas: Col<Fornecedor>[] = [
    { key: 'n', titulo: 'Fornecedor', principal: true, ordenar: f => f.nome, render: f => <><div className="cell-title">{f.nome}</div><div className="cell-sub">{f.pedidos} recebimentos · {moeda(f.valor)}</div></> },
    { key: 'o', titulo: 'OTIF', ordenar: f => f.otifPct ?? -1, render: f => <Medidor v={f.otifPct} meta={90} /> },
    { key: 'p', titulo: 'No prazo', ocultarCelular: true, ordenar: f => f.noPrazoPct ?? -1, render: f => (f.noPrazoPct === null ? '-' : pct(f.noPrazoPct, 0)) },
    { key: 'c', titulo: 'Completo', ocultarCelular: true, ordenar: f => f.completoPct ?? -1, render: f => (f.completoPct === null ? '-' : pct(f.completoPct, 0)) },
    { key: 'l', titulo: 'Lead time real', align: 'right', ordenar: f => f.leadMedianoDias ?? -1, render: f => (f.leadMedianoDias === null ? '-' : <>{numero(f.leadMedianoDias, 0)} d{f.leadVariacaoDias !== null && <span className="muted"> ± {numero(f.leadVariacaoDias, 0)}</span>}</>) },
    { key: 'a', titulo: 'Em aberto', align: 'right', ordenar: f => f.pendentes, render: f => <>{f.pendentes}{f.atrasados > 0 && <div className="cell-sub down">{f.atrasados} atrasado(s)</div>}</> },
  ];
  return (
    <Secao id="fornecedores" titulo="Desempenho de fornecedores" descricao="OTIF: pedidos entregues no prazo e completos. Lead time real: mediana entre emissão e recebimento, com a variação (quanto maior, mais estoque de segurança o item precisa).">
      <div className="panel panel--flush">
        <DataTable colunas={colunas} linhas={fornecedores} chave={f => f.id} ordemInicial={{ key: 'o', dir: 'asc' }}
          vazio={<Empty titulo="Sem recebimentos no período">Receba pedidos de compra pelo sistema para medir prazo e completude.</Empty>} />
      </div>
    </Secao>
  );
}

function MapaCalor({ calor, pico }: { calor: number[][]; pico: BI['pico'] }) {
  const [foco, setFoco] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(1, ...calor.flatMap(l => HORAS.map(h => l[h])));
  const total = calor.reduce((a, l) => a + l.reduce((x, y) => x + y, 0), 0);
  const leitura = foco
    ? `${DIAS_SEMANA[foco.d]}, ${foco.h}h às ${foco.h + 1}h: ${numero(calor[foco.d][foco.h])} movimentos`
    : pico.movimentos ? `Pico: ${DIAS_SEMANA[pico.dia]} às ${pico.hora}h, com ${numero(pico.movimentos)} movimentos` : 'Sem movimentos no período';
  return (
    <div className="bi-calor-wrap">
      <div className="bi-calor" role="grid" aria-label="Movimentos por dia da semana e hora" onMouseLeave={() => setFoco(null)}>
        <span />
        {HORAS.map(h => <span key={h} className="bi-calor__h">{h % 3 === 0 ? `${h}h` : ''}</span>)}
        {[1, 2, 3, 4, 5, 6, 0].map(d => (
          <div key={d} role="row" className="bi-calor__linha">
            <span className="bi-calor__d">{DIAS_SEMANA[d]}</span>
            {HORAS.map(h => {
              const v = calor[d][h];
              return <i key={h} role="gridcell" tabIndex={-1} aria-label={`${DIAS_SEMANA[d]} ${h}h: ${v}`} className={foco?.d === d && foco.h === h ? 'is-foco' : ''}
                style={{ ['--i' as string]: v ? `${10 + (v / max) * 90}%` : '0%' }} onMouseEnter={() => setFoco({ d, h })} />;
            })}
          </div>
        ))}
      </div>
      <div className="bi-calor__rodape">
        <span className="bi-calor__leitura">{leitura}</span>
        <span className="bi-calor__escala">Menos <i style={{ ['--i' as string]: '10%' }} /><i style={{ ['--i' as string]: '40%' }} /><i style={{ ['--i' as string]: '70%' }} /><i style={{ ['--i' as string]: '100%' }} /> Mais · {numero(total)} no total</span>
      </div>
    </div>
  );
}

function Operacao({ dados, filtrado }: { dados: BI; filtrado: boolean }) {
  const navigate = useNavigate();
  const s = dados.separacao, a = dados.acuracia;
  const colRebal: Col<Rebalanceamento>[] = [
    { key: 'p', titulo: 'Produto', principal: true, render: r => <><div className="cell-title">{r.nome}</div><div className="cell-sub"><Code>{r.sku}</Code></div></> },
    { key: 'r', titulo: 'Rota', render: r => <span className="nowrap">{r.de} → {r.para}</span> },
    { key: 'q', titulo: 'Transferir', align: 'right', render: r => <b>{numero(r.quantidade)}</b> },
    { key: 'c', titulo: 'Destino hoje', align: 'right', render: r => `${r.coberturaDestino ?? 0} d` },
  ];
  return (
    <Secao id="operacao" titulo="Operação do armazém" descricao="Quando o armazém trabalha, quanto tempo a separação leva e quão confiável é o saldo.">
      <div className="grid grid-main-side mb-16">
        <Panel titulo="Carga por dia e hora" descricao="Entradas e saídas registradas (sem transferências), no horário de Brasília">
          <MapaCalor calor={dados.calor} pico={dados.pico} />
        </Panel>
        <Panel titulo="Separação" descricao={`${numero(s.ordens)} ordens e ${numero(s.linhas)} linhas concluídas`}>
          <dl className="bi-mini">
            <div><dt>Espera na fila</dt><dd>{horas(s.esperaMediaH)}</dd></div>
            <div><dt>Execução</dt><dd>{horas(s.execucaoMediaH)}</dd></div>
            <div><dt>Ciclo total</dt><dd>{horas(s.cicloMedioH)}</dd></div>
            <div><dt>Dentro do SLA</dt><dd>{s.slaPct === null ? '-' : pct(s.slaPct, 0)}</dd></div>
          </dl>
          <p className="muted bi-nota">SLA: 24 h para ordens normais e 4 h para urgentes.</p>
          {s.porSeparador.length > 0 && (
            <table className="table bi-tabela-mini">
              <thead><tr><th>Separador</th><th className="num">Linhas</th><th className="num">Linhas/h</th></tr></thead>
              <tbody>{s.porSeparador.map(p => <tr key={p.nome}><td>{p.nome}<div className="cell-sub">{p.ordens} ordens</div></td><td className="num">{numero(p.linhas)}</td><td className="num"><b>{p.linhasHora === null ? '-' : numero(p.linhasHora, 1)}</b></td></tr>)}</tbody>
            </table>
          )}
        </Panel>
      </div>
      <div className="grid grid-2">
        <Panel titulo="Acurácia de inventário" descricao={`${a.inventarios} inventário(s) concluído(s), ${numero(a.itens)} itens contados`}
          acoes={<button className="btn btn--sm btn--ghost" onClick={() => navigate('/inventario')}>Inventários <IoArrowForward /></button>}>
          <dl className="bi-mini">
            <div><dt>Por item</dt><dd>{a.porItem === null ? '-' : pct(a.porItem)}</dd></div>
            <div><dt>Por valor</dt><dd>{a.porValor === null ? '-' : pct(a.porValor)}</dd></div>
            <div><dt>Divergência</dt><dd>{moeda(a.divergenciaValor)}</dd></div>
          </dl>
          {a.historico.length > 0 && (
            <ul className="bi-hist">
              {a.historico.map(h => (
                <li key={h.codigo}><Code>{h.codigo}</Code><span className="muted">{data(h.data)} · {h.itens} itens</span><Medidor v={h.acuracia} meta={95} /></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel flush titulo="Rebalanceamento entre armazéns" descricao="Saldo que sobra em um armazém e falta no outro (mantém 45 dias na origem e leva 30 dias ao destino)">
          <DataTable colunas={colRebal} linhas={dados.rebalanceamento} chave={r => r.produtoId + r.de + r.para} porPagina={8}
            vazio={<Empty titulo="Armazéns equilibrados">{filtrado ? 'Escolha “Todos os armazéns” no filtro para comparar os saldos entre eles.' : dados.armazens.length < 2 ? 'É preciso ter pelo menos dois armazéns ativos.' : 'Nenhuma transferência sugerida.'}</Empty>} />
        </Panel>
      </div>
    </Secao>
  );
}

function Spark({ valores }: { valores?: number[] }) {
  if (!valores || valores.length < 2) return <span className="muted">-</span>;
  const max = Math.max(1, ...valores), w = 84, h = 22;
  const pts = valores.map((v, i) => `${(i / (valores.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(' ');
  return (
    <svg className="bi-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Demanda semanal: ${valores.join(', ')}`}>
      <title>{`Semanas: ${valores.join(' · ')}`}</title>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function Base({ dados, filtroMatriz, limparMatriz }: { dados: BI; filtroMatriz: string | null; limparMatriz: () => void }) {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [risco, setRisco] = useState('');
  const [saude, setSaude] = useState('');
  const linhas = useMemo(() => dados.itens.filter(i =>
    contem(busca, i.nome, i.sku, i.categoria, i.fornecedor) && (!risco || i.risco === risco) && (!saude || i.saude === saude)
    && (!filtroMatriz || `${i.abc}${i.xyz}` === filtroMatriz)), [dados.itens, busca, risco, saude, filtroMatriz]);

  const colunas: Col<Item>[] = [
    { key: 'p', titulo: 'Produto', principal: true, ordenar: i => i.nome, render: i => <><div className="cell-title">{i.nome}</div><div className="cell-sub"><Code>{i.sku}</Code> {i.categoria}</div></> },
    { key: 'cl', titulo: 'Classe', ordenar: i => `${i.abc}${i.xyz ?? 'W'}`, render: i => <span className="bi-classe">{i.abc}{i.xyz ?? '–'}</span> },
    { key: 'sp', titulo: 'Demanda semanal', ocultarCelular: true, render: i => <Spark valores={i.semanal} /> },
    { key: 'cv', titulo: 'Consumo', align: 'right', ordenar: i => i.consumoValor, render: i => <>{moeda(i.consumoValor)}<div className="cell-sub">{numero(i.consumo)} {i.unidade}</div></> },
    { key: 's', titulo: 'Saldo', align: 'right', ordenar: i => i.saldo, render: i => numero(i.saldo) },
    { key: 'cob', titulo: 'Cobertura', align: 'right', ordenar: i => i.coberturaDias ?? 99999, render: i => (i.coberturaDias === null ? <span className="muted">∞</span> : `${numero(i.coberturaDias)} d`) },
    { key: 'g', titulo: 'Giro', align: 'right', ocultarCelular: true, ordenar: i => i.giro ?? -1, render: i => (i.giro === null ? '-' : `${numero(i.giro, 1)}×`) },
    { key: 'pp', titulo: 'PP / ES', align: 'right', ocultarCelular: true, ordenar: i => i.pontoPedido, render: i => <span title="Ponto de pedido / estoque de segurança">{numero(i.pontoPedido)} <span className="muted">/ {numero(i.estoqueSeguranca)}</span></span> },
    { key: 'r', titulo: 'Risco', ordenar: i => i.risco, render: i => <Badge tom={RISCO_TOM[i.risco]}>{i.risco}</Badge> },
    { key: 'sd', titulo: 'Situação', ocultarCelular: true, ordenar: i => i.saude, render: i => <Badge tom={SAUDE_TOM[i.saude] as 'ok'} plain>{i.saude}</Badge> },
  ];

  function exportar() {
    exportarExcel(`BI_ViaPro_${new Date().toLocaleDateString('sv-SE')}`, [{
      nome: 'Base analítica', linhas, colunas: [
        { titulo: 'SKU', valor: i => i.sku }, { titulo: 'Produto', valor: i => i.nome, largura: 40 }, { titulo: 'Categoria', valor: i => i.categoria },
        { titulo: 'Fornecedor', valor: i => i.fornecedor || '' }, { titulo: 'ABC', valor: i => i.abc }, { titulo: 'XYZ', valor: i => i.xyz || '' },
        { titulo: 'Coef. variação', valor: i => i.cv ?? '' }, { titulo: 'Consumo (un)', valor: i => i.consumo }, { titulo: 'Consumo (R$)', valor: i => Number(i.consumoValor.toFixed(2)) },
        { titulo: 'Consumo/dia', valor: i => i.consumoDiario }, { titulo: 'Saldo', valor: i => i.saldo }, { titulo: 'Valor em estoque', valor: i => Number(i.valorEstoque.toFixed(2)) },
        { titulo: 'Cobertura (dias)', valor: i => i.coberturaDias ?? '' }, { titulo: 'Giro anual', valor: i => i.giro ?? '' }, { titulo: 'Lead time (dias)', valor: i => i.leadTimeDias },
        { titulo: 'Estoque de segurança', valor: i => i.estoqueSeguranca }, { titulo: 'Ponto de pedido', valor: i => i.pontoPedido }, { titulo: 'Em trânsito', valor: i => i.emTransito },
        { titulo: 'Ruptura prevista', valor: i => (i.dataRuptura ? dataUTC(i.dataRuptura) : '') }, { titulo: 'Risco', valor: i => i.risco }, { titulo: 'Situação', valor: i => i.saude },
        { titulo: 'Dias sem saída', valor: i => i.diasSemSaida }, { titulo: 'Excesso (R$)', valor: i => Number(i.excessoValor.toFixed(2)) },
      ],
    }], [
      aba('Recomendações', [{ titulo: 'Nível', valor: (r: Insight) => NIVEL[r.nivel].rotulo }, { titulo: 'Recomendação', valor: (r: Insight) => r.titulo, largura: 50 }, { titulo: 'Detalhe', valor: (r: Insight) => r.texto, largura: 90 }], dados.insights),
      aba('Fornecedores', [{ titulo: 'Fornecedor', valor: (f: Fornecedor) => f.nome, largura: 34 }, { titulo: 'Recebimentos', valor: (f: Fornecedor) => f.pedidos }, { titulo: 'OTIF %', valor: (f: Fornecedor) => f.otifPct ?? '' }, { titulo: 'No prazo %', valor: (f: Fornecedor) => f.noPrazoPct ?? '' }, { titulo: 'Completo %', valor: (f: Fornecedor) => f.completoPct ?? '' }, { titulo: 'Lead time mediano', valor: (f: Fornecedor) => f.leadMedianoDias ?? '' }, { titulo: 'Variação lead', valor: (f: Fornecedor) => f.leadVariacaoDias ?? '' }], dados.fornecedores),
      aba('PCP', [{ titulo: 'Receita', valor: (r: Receita) => r.nome, largura: 36 }, { titulo: 'Pode produzir', valor: (r: Receita) => r.podeProduzir }, { titulo: 'Dias atendidos', valor: (r: Receita) => r.diasAtendidos ?? '' }, { titulo: 'Gargalo', valor: (r: Receita) => r.gargalo.nome, largura: 34 }, { titulo: 'Falta p/ 30 dias', valor: (r: Receita) => r.faltaGargalo30d }], dados.producao),
      aba('Demanda semanal', [{ titulo: 'Semana', valor: (d: SemanaDemanda) => d.semana.split('-').reverse().join('/') }, { titulo: 'Tipo', valor: (d: SemanaDemanda) => (d.previsto ? 'Previsão' : 'Realizado') }, { titulo: 'Unidades', valor: (d: SemanaDemanda) => d.unidades }, { titulo: 'Valor (R$)', valor: (d: SemanaDemanda) => d.valor }], dados.demanda),
    ]);
  }

  return (
    <Secao id="base" titulo="Base analítica" descricao="Todos os indicadores por produto. Use os filtros para montar sua própria análise e exporte para Excel."
      acoes={<button className="btn btn--sm" onClick={exportar}><IoDownloadOutline /> Exportar Excel</button>}>
      <div className="panel panel--flush">
        <div className="toolbar">
          <SearchInput value={busca} onChange={setBusca} placeholder="Produto, SKU, categoria ou fornecedor" />
          <select className="select" value={risco} onChange={e => setRisco(e.target.value)} aria-label="Risco">
            <option value="">Todos os riscos</option>
            {['Rompido', 'Crítico', 'Atenção', 'OK', 'Sem demanda'].map(r => <option key={r}>{r}</option>)}
          </select>
          <select className="select" value={saude} onChange={e => setSaude(e.target.value)} aria-label="Situação">
            <option value="">Todas as situações</option>
            {Object.keys(SAUDE_TOM).map(s => <option key={s}>{s}</option>)}
          </select>
          {filtroMatriz && <button className="btn btn--sm" onClick={limparMatriz}>Quadrante {filtroMatriz} <IoCloseOutline /></button>}
        </div>
        <DataTable colunas={colunas} linhas={linhas} chave={i => i.produtoId} porPagina={25} ordemInicial={{ key: 'cv', dir: 'desc' }} onLinha={i => navigate(`/kardex/${i.produtoId}`)}
          vazio={<Empty titulo="Nenhum item com esses filtros" />} />
      </div>
    </Secao>
  );
}
