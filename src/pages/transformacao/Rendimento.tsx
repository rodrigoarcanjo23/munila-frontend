import { IoAlertCircle, IoCheckmarkCircle, IoWarning } from 'react-icons/io5';
import { numero } from '../../lib/format';

/**
 * Régua de rendimento: 100% no centro, faixas de tolerância em volta.
 * Verde = dentro da tolerância; amarelo = exige justificativa; vermelho = exige aprovação de outro usuário.
 */
export function ReguaRendimento({ rendimento, aviso, bloqueio, compacta }: { rendimento: number | null; aviso: number; bloqueio: number; compacta?: boolean }) {
  if (rendimento === null) return <span className="muted">Sem receita: rendimento não calculado</span>;
  const alcance = Math.max(bloqueio * 2, 20, Math.abs(rendimento - 100) * 1.25);
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - (100 - alcance)) / (2 * alcance)) * 100));
  const desvio = rendimento - 100;
  const ab = Math.abs(desvio);
  const faixa = ab <= aviso ? 'ok' : ab <= bloqueio ? 'warn' : 'bad';
  return (
    <div className={`tf-regua ${compacta ? 'tf-regua--compacta' : ''}`}>
      {!compacta && (
        <div className="tf-regua__topo">
          <strong className={`tf-regua__valor tf-tom--${faixa}`}>{numero(rendimento, 1)}%</strong>
          <span className={`tf-regua__status tf-tom--${faixa}`}>
            {faixa === 'ok' ? <IoCheckmarkCircle /> : faixa === 'warn' ? <IoWarning /> : <IoAlertCircle />}
            {faixa === 'ok' ? 'Dentro da tolerância' : faixa === 'warn' ? 'Exige justificativa' : 'Exige aprovação de outro usuário'}
          </span>
        </div>
      )}
      <div className="tf-regua__trilho" role="img" aria-label={`Rendimento ${numero(rendimento, 1)}%, desvio ${numero(desvio, 1)} pontos`}>
        <i className="tf-regua__faixa tf-regua__faixa--bad" style={{ left: 0, width: '100%' }} />
        <i className="tf-regua__faixa tf-regua__faixa--warn" style={{ left: `${pos(100 - bloqueio)}%`, width: `${pos(100 + bloqueio) - pos(100 - bloqueio)}%` }} />
        <i className="tf-regua__faixa tf-regua__faixa--ok" style={{ left: `${pos(100 - aviso)}%`, width: `${pos(100 + aviso) - pos(100 - aviso)}%` }} />
        <b className="tf-regua__centro" style={{ left: `${pos(100)}%` }} />
        <b className={`tf-regua__marca tf-fundo--${faixa}`} style={{ left: `${pos(rendimento)}%` }} />
      </div>
      {!compacta && (
        <div className="tf-regua__escala">
          <span>{numero(100 - alcance, 0)}%</span>
          <span>±{numero(aviso, 0)}% ok · ±{numero(bloqueio, 0)}% justificar · além disso aprovar</span>
          <span>{numero(100 + alcance, 0)}%</span>
        </div>
      )}
    </div>
  );
}
