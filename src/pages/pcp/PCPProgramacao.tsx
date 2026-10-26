import { useMemo, useState, type DragEvent } from 'react';
import { toast } from 'react-toastify';
import { IoAddOutline, IoChevronBackOutline, IoChevronForwardOutline, IoTodayOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { hojeISO, numero } from '../../lib/format';
import { TOM_STATUS, diaMes, type OrdemProducao, type Recurso } from '../../lib/pcp';
import { Code, Empty, Loading, PageHeader, Panel } from '../../components/ui';
import { DrawerOP, ModalOP, useCadastrosPCP } from '../../components/pcp/OrdemProducao';
import './pcp.css';

const DIA = 86400000;
const COL = 44; // largura de cada dia em px
const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
function segunda(isoDia: string) { const t = utc(isoDia); const dow = (new Date(t).getUTCDay() + 6) % 7; return t - dow * DIA; }

interface Barra { op: OrdemProducao; ini: number; fim: number; faixa: number }

export default function PCPProgramacao() {
  const cad = useCadastrosPCP();
  const hoje = hojeISO();
  const [inicio, setInicio] = useState(() => segunda(hoje) - 7 * DIA);
  const [semanas, setSemanas] = useState(4);
  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ rec: string; dia: number } | null>(null);
  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [o, r] = await Promise.all([api.get<OrdemProducao[]>('/pcp/ordens?status=abertas'), api.get<{ recursos: Recurso[] }>('/pcp/recursos')]);
    return { ordens: o.data, recursos: r.data.recursos.filter(x => x.ativo) };
  });

  const n = semanas * 7;
  const dias = useMemo(() => Array.from({ length: n }, (_, i) => iso(inicio + i * DIA)), [inicio, n]);
  const hojeIdx = Math.round((utc(hoje) - inicio) / DIA);

  const linhas = useMemo(() => {
    if (!dados) return [];
    const grupos = [...dados.recursos.map(r => ({ id: r.id, rec: r as Recurso | null })), { id: '-', rec: null }];
    return grupos.map(g => {
      const ops = dados.ordens.filter(o => o.inicioPrevisto && (g.id === '-' ? !o.recursoId : o.recursoId === g.id));
      // distribui em faixas para as barras não se sobreporem
      const barras: Barra[] = [];
      const fimFaixa: number[] = [];
      for (const op of [...ops].sort((a, b) => a.inicioPrevisto!.localeCompare(b.inicioPrevisto!))) {
        const ini = Math.round((utc(op.inicioPrevisto!) - inicio) / DIA);
        const fim = Math.round((utc(op.entregaPrevista ?? op.inicioPrevisto!) - inicio) / DIA);
        if (fim < 0 || ini >= n) continue;
        let faixa = fimFaixa.findIndex(f => f < ini);
        if (faixa < 0) { faixa = fimFaixa.length; fimFaixa.push(fim); } else fimFaixa[faixa] = fim;
        barras.push({ op, ini, fim, faixa });
      }
      // carga diária: o que falta produzir dividido pelos dias da ordem, contra a capacidade do dia
      const capDia = g.rec ? g.rec.capacidadeDia * (g.rec.eficiencia / 100) : 0;
      const carga = dias.map((d, i) => {
        const dow = (new Date(utc(d)).getUTCDay() + 6) % 7; // 0 = segunda
        const util = g.rec ? dow < g.rec.diasSemana : true;
        const q = barras.filter(b => b.ini <= i && b.fim >= i).reduce((a, b) => a + b.op.restante / Math.max(1, b.fim - b.ini + 1), 0);
        return { q, cap: util ? capDia : 0, util };
      });
      return { ...g, barras, faixas: Math.max(1, fimFaixa.length), carga };
    }).filter(l => l.rec || l.barras.length);
  }, [dados, inicio, n, dias]);
  const semData = (dados?.ordens ?? []).filter(o => !o.inicioPrevisto);

  async function soltar(e: DragEvent<HTMLDivElement>, recursoId: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || arrastando;
    setArrastando(null); setAlvo(null);
    if (!id || !dados) return;
    const op = dados.ordens.find(o => o.id === id);
    if (!op) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dia = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - rect.left) / COL)));
    const duracao = op.inicioPrevisto && op.entregaPrevista ? Math.round((utc(op.entregaPrevista) - utc(op.inicioPrevisto)) / DIA) : 2;
    const novoIni = iso(inicio + dia * DIA), novaEnt = iso(inicio + (dia + duracao) * DIA);
    try {
      await api.put(`/pcp/ordens/${id}/programar`, { inicioPrevisto: novoIni, entregaPrevista: novaEnt, recursoId: recursoId === '-' ? null : recursoId });
      toast.success(`${op.codigo} programada para ${diaMes(novoIni)} a ${diaMes(novaEnt)}.`);
      recarregar(true);
    } catch (err) { toast.error(msgErro(err)); }
  }
  const sobre = (e: DragEvent<HTMLDivElement>, rec: string) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const dia = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - rect.left) / COL)));
    if (alvo?.rec !== rec || alvo.dia !== dia) setAlvo({ rec, dia });
  };
  const arrastar = (e: DragEvent, id: string) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; setArrastando(id); };

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Programação da produção" descricao="Sequência das ordens abertas por recurso. Arraste uma ordem para mudar o dia de início ou a linha; a duração é mantida."
        acoes={<>
          <div className="segmented">
            <button aria-label="Semana anterior" onClick={() => setInicio(i => i - 7 * DIA)}><IoChevronBackOutline /></button>
            <button onClick={() => setInicio(segunda(hoje) - 7 * DIA)}><IoTodayOutline /> Hoje</button>
            <button aria-label="Próxima semana" onClick={() => setInicio(i => i + 7 * DIA)}><IoChevronForwardOutline /></button>
          </div>
          <select className="select" value={semanas} onChange={e => setSemanas(Number(e.target.value))} aria-label="Período" style={{ width: 'auto' }}>
            <option value={2}>2 semanas</option><option value={4}>4 semanas</option><option value={6}>6 semanas</option><option value={8}>8 semanas</option>
          </select>
          <button className="btn btn--primary" onClick={() => setNova(true)}><IoAddOutline /> Nova ordem</button>
        </>} />

      {semData.length > 0 && (
        <Panel className="mb-16" titulo={`Sem data de início (${semData.length})`} descricao="Arraste para o dia e a linha em que a ordem deve começar">
          <div className="gantt-bandeja">
            {semData.map(o => (
              <button key={o.id} type="button" draggable onDragStart={e => arrastar(e, o.id)} onDragEnd={() => { setArrastando(null); setAlvo(null); }} onClick={() => setAberta(o.id)}
                className={`gantt-chip gantt-tom--${TOM_STATUS[o.status] ?? 'muted'}`}>
                <Code>{o.codigo}</Code> {o.produto.nome} <b>{numero(o.restante)}</b>
              </button>
            ))}
          </div>
        </Panel>
      )}

      <Panel flush>
        {linhas.length === 0 ? <Empty titulo="Nada programado">Cadastre recursos em PCP → Recursos e crie ordens com data de início.</Empty> : (
          <div className="gantt" style={{ ['--col' as string]: `${COL}px`, ['--dias' as string]: n }}>
            <div className="gantt__cab">
              <div className="gantt__rotulo">Recurso</div>
              <div className="gantt__dias">
                {dias.map((d, i) => {
                  const dow = new Date(utc(d)).getUTCDay();
                  return <span key={d} className={`${dow === 0 || dow === 6 ? 'is-fds' : ''} ${i === hojeIdx ? 'is-hoje' : ''} ${dow === 1 ? 'is-seg' : ''}`}><small>{DIAS_SEM[dow]}</small>{d.slice(8, 10)}</span>;
                })}
              </div>
            </div>
            {linhas.map(l => (
              <div key={l.id} className="gantt__linha">
                <div className="gantt__rotulo">
                  <b>{l.rec ? l.rec.codigo : 'Sem recurso'}</b>
                  <span>{l.rec ? l.rec.nome : 'Defina a linha'}</span>
                  {l.rec && <small>{numero(l.rec.capacidadeDia)} un/dia · {l.rec.eficiencia}%</small>}
                </div>
                <div className={`gantt__area ${alvo?.rec === l.id ? 'is-alvo' : ''}`} style={{ height: l.faixas * 34 + 26 }}
                  onDragOver={e => sobre(e, l.id)} onDragLeave={() => setAlvo(null)} onDrop={e => soltar(e, l.id)}>
                  {dias.map((d, i) => { const dow = new Date(utc(d)).getUTCDay(); return <i key={d} className={`gantt__fundo ${dow === 0 || dow === 6 ? 'is-fds' : ''} ${dow === 1 ? 'is-seg' : ''}`} style={{ left: i * COL }} />; })}
                  {hojeIdx >= 0 && hojeIdx < n && <i className="gantt__hoje" style={{ left: hojeIdx * COL + COL / 2 }} />}
                  {alvo?.rec === l.id && arrastando && <i className="gantt__fantasma" style={{ left: alvo.dia * COL }} />}
                  {l.barras.map(b => {
                    const ini = Math.max(0, b.ini), fim = Math.min(n - 1, b.fim);
                    return (
                      <button key={b.op.id} type="button" draggable onDragStart={e => arrastar(e, b.op.id)} onDragEnd={() => { setArrastando(null); setAlvo(null); }} onClick={() => setAberta(b.op.id)}
                        className={`gantt__barra gantt-tom--${TOM_STATUS[b.op.status] ?? 'muted'} ${b.op.atrasada ? 'is-atrasada' : ''} ${arrastando === b.op.id ? 'is-arrastando' : ''}`}
                        style={{ left: ini * COL + 2, width: (fim - ini + 1) * COL - 4, top: b.faixa * 34 + 4 }}
                        title={`${b.op.codigo} · ${b.op.produto.nome}\n${b.op.status}${b.op.atrasada ? ' (atrasada)' : ''} · ${b.op.quantidadeProduzida}/${b.op.quantidadePlanejada} un\n${diaMes(b.op.inicioPrevisto)} a ${diaMes(b.op.entregaPrevista)}`}>
                        <span className="gantt__progresso" style={{ width: `${b.op.progresso}%` }} />
                        <b>{b.op.codigo}</b> <span>{b.op.produto.nome}</span>
                      </button>
                    );
                  })}
                  <div className="gantt__carga" style={{ top: l.faixas * 34 + 6 }}>
                    {l.carga.map((c, i) => {
                      const p = c.cap > 0 ? (c.q / c.cap) * 100 : c.q > 0 ? 999 : 0;
                      const t = !l.rec ? 'nd' : !c.util && c.q > 0 ? 'bad' : p > 100 ? 'bad' : p >= 85 ? 'warn' : c.q > 0 ? 'ok' : 'nd';
                      return <i key={i} className={`gantt__carga-cel is-${t}`} style={{ left: i * COL + 2 }} title={l.rec ? `${diaMes(dias[i])}: ${numero(c.q, 0)} un de ${numero(c.cap, 0)} (${c.cap ? Math.round(p) + '%' : 'dia sem turno'})` : `${numero(c.q, 0)} un`} />;
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <div className="gantt-legenda">
        {(['Planejada', 'Liberada', 'Em produção', 'Pausada'] as const).map(s => <span key={s}><i className={`gantt-tom--${TOM_STATUS[s] ?? 'muted'}`} />{s}</span>)}
        <span><i className="gantt-leg-atraso" />Atrasada</span>
        <span className="gantt-legenda__carga">Faixa fina: carga do dia · <i className="is-ok" />até 85% <i className="is-warn" />85–100% <i className="is-bad" />acima da capacidade</span>
      </div>

      {nova && <ModalOP cad={cad} onFechar={() => setNova(false)} onSalvo={o => { setNova(false); recarregar(true); setAberta(o.id); }} />}
      {aberta && <DrawerOP id={aberta} cad={cad} onFechar={() => setAberta(null)} onAlterado={() => recarregar(true)} />}
    </>
  );
}
