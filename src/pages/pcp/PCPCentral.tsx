import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'react-toastify';
import { IoAddOutline, IoRefreshOutline, IoCheckmarkCircleOutline, IoPlayOutline, IoSendOutline, IoCreateOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { useCores } from '../../lib/useCores';
import { moeda, numero, pct } from '../../lib/format';
import { STATUS_ABERTOS, TOM_PRIORIDADE, diaMes, type OrdemProducao, type StatusOP } from '../../lib/pcp';
import { Badge, Code, Empty, Kpi, Loading, PageHeader, Panel } from '../../components/ui';
import { DrawerOP, MaterialBadge, ModalOP, Progresso, useCadastrosPCP } from '../../components/pcp/OrdemProducao';
import { CargaRecursos } from './Carga';
import './pcp.css';

interface Painel {
  kpis: Record<string, number | null>;
  alertas: { nivel: 'critico' | 'atencao' | 'info'; titulo: string; rota: string }[];
  serie: { dia: string; produzido: number; refugo: number }[];
  carga: { semanas: string[]; recursos: { id: string; codigo: string; nome: string; capacidadeSemana: number; semanas: { carga: number; pct: number | null }[] }[]; semRecurso: number[] };
  refugo: { nome: string; sku: string; produzido: number; refugo: number; valor: number }[];
}

const COLUNAS: { status: StatusOP | 'Concluída'; titulo: string; dica: string }[] = [
  { status: 'Planejada', titulo: 'Planejadas', dica: 'Aguardando liberação' },
  { status: 'Liberada', titulo: 'Liberadas', dica: 'Prontas para começar' },
  { status: 'Em produção', titulo: 'Em produção', dica: 'Na linha agora' },
  { status: 'Pausada', titulo: 'Pausadas', dica: 'Paradas' },
  { status: 'Concluída', titulo: 'Concluídas', dica: 'Últimos 7 dias' },
];
const PESO: Record<string, number> = { Urgente: 0, Alta: 1, Normal: 2, Baixa: 3 };

export default function PCPCentral() {
  const navigate = useNavigate();
  const cores = useCores();
  const cad = useCadastrosPCP();
  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [desde] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString());

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [p, o] = await Promise.all([api.get<Painel>('/pcp/painel'), api.get<OrdemProducao[]>(`/pcp/ordens?desde=${desde}`)]);
    return { painel: p.data, ordens: o.data };
  }, [desde]);

  const colunas = useMemo(() => {
    const m = new Map<string, OrdemProducao[]>();
    for (const o of dados?.ordens ?? []) {
      if (o.status === 'Cancelada') continue;
      if (o.status === 'Concluída' && (!o.concluidaEm || o.concluidaEm < desde)) continue;
      const l = m.get(o.status) ?? [];
      l.push(o);
      m.set(o.status, l);
    }
    for (const l of m.values()) l.sort((a, b) => Number(b.atrasada) - Number(a.atrasada) || (PESO[a.prioridade] ?? 2) - (PESO[b.prioridade] ?? 2) || (a.inicioPrevisto ?? '9').localeCompare(b.inicioPrevisto ?? '9'));
    return m;
  }, [dados, desde]);

  async function acaoRapida(o: OrdemProducao, acao: string) {
    try { await api.post(`/pcp/ordens/${o.id}/acao`, { acao }); toast.success(`${o.codigo} ${acao === 'liberar' ? 'liberada' : 'iniciada'}.`); recarregar(true); } catch (err) { toast.error(msgErro(err)); }
  }

  if (carregando && !dados) return <Loading />;
  if (!dados) return null;
  const k = (n: string) => dados.painel.kpis[n];
  const tooltipStyle = { background: cores.surface, border: `1px solid ${cores.line}`, borderRadius: 8, fontSize: 13 };

  return (
    <>
      <PageHeader titulo="Central do PCP" descricao="Ordens de produção, material, capacidade e resultado da fábrica em uma tela."
        acoes={<>
          <button className="btn" onClick={() => recarregar()}><IoRefreshOutline /> Atualizar</button>
          <button className="btn btn--primary" onClick={() => setNova(true)}><IoAddOutline /> Nova ordem</button>
        </>} />

      <div className="kpis pcp-kpis">
        <Kpi label="Ordens abertas" valor={numero(k('abertas'))} dica={`${numero(k('unidadesEmAberto'))} un a produzir · ${moeda(k('valorEmAberto'))}`} tom="primary" onClick={() => navigate('/pcp/ordens')} />
        <Kpi label="Atrasadas" valor={numero(k('atrasadas'))} dica="Entrega prevista já passou" tom={k('atrasadas') ? 'bad' : 'ok'} onClick={() => navigate('/pcp/ordens?filtro=atrasadas')} />
        <Kpi label="Sem material suficiente" valor={numero(k('semMaterial'))} dica="Ver necessidades no MRP" tom={k('semMaterial') ? 'warn' : 'ok'} onClick={() => navigate('/pcp/mrp')} />
        <Kpi label="Produzido em 30 dias" valor={`${numero(k('produzido30d'))} un`} dica={k('refugoPct') === null ? 'Sem refugo apontado' : `Refugo ${pct(k('refugoPct'))}`} tom={(k('refugoPct') ?? 0) > 3 ? 'warn' : undefined} />
        <Kpi label="Entregas no prazo" valor={k('noPrazoPct') === null ? '-' : pct(k('noPrazoPct'), 0)} dica={`${numero(k('concluidas30d'))} OPs concluídas em 30 dias`} tom={k('noPrazoPct') === null ? undefined : (k('noPrazoPct') ?? 0) >= 90 ? 'ok' : 'warn'} />
        <Kpi label="Aderência ao plano" valor={k('aderenciaPlano') === null ? '-' : pct(k('aderenciaPlano'), 0)} dica="Produzido × planejado na semana passada" onClick={() => navigate('/pcp/plano')} />
        <Kpi label="Produtividade" valor={k('produtividadeHora') === null ? '-' : `${numero(k('produtividadeHora'), 1)} un/h`} dica={k('cicloMedioDias') === null ? 'Aponte o tempo para medir' : `Ciclo médio da OP: ${numero(k('cicloMedioDias'), 1)} dias`} />
      </div>

      <div className="grid grid-main-side mb-16">
        <Panel titulo="Carga dos recursos" descricao="Ordens abertas e plano mestre ainda sem ordem, contra a capacidade efetiva de cada semana"
          acoes={<Link className="btn btn--sm btn--ghost" to="/pcp/programacao">Programação</Link>}>
          <CargaRecursos semanas={dados.painel.carga.semanas} recursos={dados.painel.carga.recursos} semRecurso={dados.painel.carga.semRecurso} />
        </Panel>
        <Panel titulo="O que precisa de atenção" flush>
          {dados.painel.alertas.length === 0
            ? <div className="empty"><IoCheckmarkCircleOutline style={{ color: 'var(--ok)', opacity: 1 }} /><b>Produção em dia</b>Nenhum alerta no momento.</div>
            : <ul className="alert-list">{dados.painel.alertas.map(a => <li key={a.titulo}><Link to={a.rota}><span className={`dot dot--${a.nivel}`} />{a.titulo}</Link></li>)}</ul>}
        </Panel>
      </div>

      <section className="pcp-quadro" aria-label="Quadro de ordens de produção">
        {COLUNAS.map(c => {
          const lista = colunas.get(c.status) ?? [];
          return (
            <div key={c.status} className={`pcp-col pcp-col--${c.status === 'Em produção' ? 'producao' : c.status.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}`}>
              <header><h2>{c.titulo}</h2><span className="pcp-col__n">{lista.length}</span><small>{c.dica}</small></header>
              <div className="pcp-col__lista">
                {lista.length === 0 && <p className="pcp-col__vazio">Nenhuma ordem</p>}
                {lista.map(o => (
                  <article key={o.id} className={`pcp-card ${o.atrasada ? 'pcp-card--atrasada' : ''}`} tabIndex={0} onClick={() => setAberta(o.id)} onKeyDown={e => { if (e.key === 'Enter') setAberta(o.id); }}>
                    <div className="pcp-card__top"><Code>{o.codigo}</Code>{o.prioridade !== 'Normal' && <Badge tom={TOM_PRIORIDADE[o.prioridade]} plain>{o.prioridade}</Badge>}</div>
                    <h3>{o.produto.nome}</h3>
                    <Progresso op={o} />
                    <div className="pcp-card__meta">
                      <span className={o.atrasada ? 'down' : ''}>{diaMes(o.inicioPrevisto)} → {diaMes(o.entregaPrevista)}{o.atrasada && ' · atrasada'}</span>
                      <span>{o.recurso?.codigo ?? 'Sem recurso'}</span>
                    </div>
                    {STATUS_ABERTOS.includes(o.status) && (
                      <div className="pcp-card__rodape">
                        <MaterialBadge op={o} />
                        {o.status === 'Planejada' && <button className="btn btn--sm" onClick={e => { e.stopPropagation(); acaoRapida(o, 'liberar'); }}><IoSendOutline /> Liberar</button>}
                        {(o.status === 'Liberada' || o.status === 'Pausada') && <button className="btn btn--sm" onClick={e => { e.stopPropagation(); acaoRapida(o, 'iniciar'); }}><IoPlayOutline /> {o.status === 'Pausada' ? 'Retomar' : 'Iniciar'}</button>}
                        {o.status === 'Em produção' && <button className="btn btn--sm btn--primary" onClick={e => { e.stopPropagation(); setAberta(o.id); }}><IoCreateOutline /> Apontar</button>}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid grid-main-side mt-16">
        <Panel titulo="Produção diária" descricao="Peças boas e refugo apontados nos últimos 30 dias"
          acoes={<div className="legend"><span><i style={{ background: cores.primary }} />Peças boas</span><span><i style={{ background: cores.bad }} />Refugo</span></div>}>
          <div className="chart-box" style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={dados.painel.serie} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={cores.line} vertical={false} />
                <XAxis dataKey="dia" tickFormatter={d => diaMes(String(d))} tick={{ fill: cores['text-3'], fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={18} />
                <YAxis tick={{ fill: cores['text-3'], fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={d => String(d).split('-').reverse().join('/')} cursor={{ fill: cores.line, opacity: 0.4 }} />
                <Bar dataKey="produzido" name="Peças boas" stackId="p" fill={cores.primary} maxBarSize={22} />
                <Bar dataKey="refugo" name="Refugo" stackId="p" fill={cores.bad} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel titulo="Maior refugo" descricao="Últimos 30 dias, pelo custo perdido" flush>
          {dados.painel.refugo.length === 0 ? <Empty titulo="Sem refugo apontado">Informe o refugo ao apontar a produção para acompanhar aqui.</Empty> : (
            <table className="table">
              <tbody>
                {dados.painel.refugo.map(r => (
                  <tr key={r.sku}>
                    <td><div className="cell-title">{r.nome}</div><div className="cell-sub"><Code>{r.sku}</Code> {numero(r.refugo)} de {numero(r.produzido + r.refugo)} un</div></td>
                    <td className="num"><b>{pct((r.refugo / Math.max(1, r.produzido + r.refugo)) * 100)}</b><div className="cell-sub">{moeda(r.valor)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {nova && <ModalOP cad={cad} onFechar={() => setNova(false)} onSalvo={o => { setNova(false); recarregar(true); setAberta(o.id); }} />}
      {aberta && <DrawerOP id={aberta} cad={cad} onFechar={() => setAberta(null)} onAlterado={() => recarregar(true)} />}
    </>
  );
}
