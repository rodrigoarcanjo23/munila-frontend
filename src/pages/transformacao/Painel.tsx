import { IoAlertCircleOutline, IoCheckmarkCircle, IoWarning, IoAlertCircle } from 'react-icons/io5';
import { dataHora, moeda, numero } from '../../lib/format';
import { Badge, Code, Empty, Kpi, Panel } from '../../components/ui';
import { TOM_FAIXA, qtd, type Ordem } from './tf';

export interface PainelTf {
  kpis: { materiais: number; lotesComSaldo: number; valor: number; ordens30: number; rendimentoMedio: number | null; foraDaTolerancia: number; aguardando: number; quarentena: number; bloqueados: number; vencidos: number; vencendo: number };
  rendimentos: { codigo: string; data: string; produto: string; rendimento: number; faixa: string }[];
  perdasPorMotivo: { motivo: string; vezes: number }[];
  abaixoMinimo: { id: string; codigo: string; nome: string; unidade: string; saldo: number; minimo: number }[];
  integridade: { integro: boolean; movimentos: number; eventos: number };
}

const ICONE_FAIXA: Record<string, React.ReactNode> = { OK: <IoCheckmarkCircle />, Justificar: <IoWarning />, Aprovar: <IoAlertCircle /> };

export function Painel({ painel, ordens, onAba, onAbrirOrdem }: { painel: PainelTf; ordens: Ordem[]; onAba: (aba: string) => void; onAbrirOrdem: () => void }) {
  const k = painel.kpis;
  const aguardando = ordens.filter(o => o.status === 'Aguardando aprovação');
  const planejadas = ordens.filter(o => o.status === 'Planejada');
  const maxPerda = Math.max(1, ...painel.perdasPorMotivo.map(p => p.vezes));
  const escala = (r: number) => Math.max(0, Math.min(100, ((r - 70) / 60) * 100)); // 70%..130%

  return (
    <>
      <div className="kpis mb-16">
        <Kpi label="Transformações (30 dias)" valor={numero(k.ordens30)} dica={k.rendimentoMedio !== null ? `Rendimento médio ${numero(k.rendimentoMedio, 1)}%` : 'Sem ordens com receita'} tom="primary" onClick={() => onAba('ordens')} />
        <Kpi label="Aguardando aprovação" valor={numero(k.aguardando)} dica="Fora da tolerância: outro usuário aprova" tom={k.aguardando ? 'warn' : 'ok'} onClick={() => onAba('ordens')} />
        <Kpi label="Fora da tolerância" valor={numero(k.foraDaTolerancia)} dica="Com justificativa registrada" tom={k.foraDaTolerancia ? 'warn' : undefined} />
        <Kpi label="Estoque segregado" valor={moeda(k.valor)} dica={`${numero(k.materiais)} materiais · ${numero(k.lotesComSaldo)} lotes`} onClick={() => onAba('estoque')} />
        <Kpi label="Lotes retidos" valor={numero(k.quarentena + k.bloqueados)} dica={`${k.quarentena} em quarentena · ${k.bloqueados} bloqueados`} tom={k.bloqueados ? 'bad' : k.quarentena ? 'warn' : undefined} onClick={() => onAba('estoque')} />
        <Kpi label="Validade" valor={numero(k.vencidos)} dica={`vencidos · ${k.vencendo} vencem em 30 dias`} tom={k.vencidos ? 'bad' : k.vencendo ? 'warn' : 'ok'} onClick={() => onAba('estoque')} />
      </div>

      {(aguardando.length > 0 || planejadas.length > 0) && (
        <Panel titulo="Pendências" className="mb-16">
          <ul className="tf-pendencias">
            {aguardando.map(o => (
              <li key={o.id}><Badge tom="warn">Aprovar</Badge> <Code>{o.codigo}</Code> {o.produto.nome} · rendimento {numero(o.rendimento, 1)}% · por {o.executadoPor}<span className="muted"> · {o.justificativa}</span></li>
            ))}
            {planejadas.map(o => (
              <li key={o.id}><Badge tom="info">Executar</Badge> <Code>{o.codigo}</Code> {qtd(o.quantidadePlanejada, o.produto.unidade)} de {o.produto.nome}<span className="muted"> · criada {dataHora(o.createdAt)}</span></li>
            ))}
          </ul>
          <button className="btn btn--sm mt-8" onClick={() => onAba('ordens')}>Abrir ordens</button>
        </Panel>
      )}

      <div className="grid grid-main-side">
        <Panel titulo="Rendimento das últimas transformações" descricao="Cada linha é uma ordem concluída. A faixa central é 100%: o que a receita prevê.">
          {painel.rendimentos.length === 0 ? (
            <Empty titulo="Nenhuma transformação nos últimos 30 dias">
              <button className="btn btn--primary btn--sm mt-8" onClick={onAbrirOrdem}>Registrar a primeira</button>
            </Empty>
          ) : (
            <ul className="tf-rend-lista">
              {[...painel.rendimentos].reverse().map(r => (
                <li key={r.codigo}>
                  <span className="tf-rend-lista__id"><Code>{r.codigo}</Code><span className="cell-sub">{r.produto}</span></span>
                  <span className="tf-rend-lista__trilho" aria-hidden>
                    <i className="tf-rend-lista__cem" style={{ left: `${escala(100)}%` }} />
                    <b className={`tf-fundo--${TOM_FAIXA[r.faixa] ?? 'ok'}`} style={{ left: `${escala(r.rendimento)}%` }} />
                  </span>
                  <span className={`tf-rend-lista__valor tf-tom--${TOM_FAIXA[r.faixa] ?? 'ok'}`}>{ICONE_FAIXA[r.faixa]} {numero(r.rendimento, 1)}%</span>
                </li>
              ))}
              <li className="tf-rend-lista__escala" aria-hidden><span /><span><span>70%</span><span>100%</span><span>130%</span></span><span /></li>
            </ul>
          )}
        </Panel>

        <div className="stack">
          <Panel titulo="Perdas registradas (30 dias)" descricao="Quantas vezes cada motivo apareceu.">
            {painel.perdasPorMotivo.length === 0 ? <p className="muted">Nenhuma perda registrada.</p> : (
              <ul className="tf-barras">
                {painel.perdasPorMotivo.map(p => (
                  <li key={p.motivo}><span>{p.motivo}</span><i style={{ width: `${(p.vezes / maxPerda) * 100}%` }} /><b>{p.vezes}</b></li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel titulo="Abaixo do mínimo" descricao="Saldo liberado menor que o estoque mínimo.">
            {painel.abaixoMinimo.length === 0 ? <p className="muted">Todos os materiais acima do mínimo.</p> : (
              <ul className="tf-pendencias">
                {painel.abaixoMinimo.map(m => (
                  <li key={m.id}><IoAlertCircleOutline className="down" /> <b>{m.nome}</b> <span className="muted">· {qtd(m.saldo, m.unidade)} de {qtd(m.minimo, m.unidade)}</span></li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
