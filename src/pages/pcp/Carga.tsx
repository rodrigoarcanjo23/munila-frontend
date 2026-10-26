import { IoAlertCircle, IoWarning } from 'react-icons/io5';
import { numero } from '../../lib/format';
import { diaMes } from '../../lib/pcp';

interface RecursoCarga { id: string; codigo: string; nome: string; capacidadeSemana: number; semanas: { carga: number; pct: number | null }[] }

const tomCarga = (p: number | null) => (p === null ? 'nd' : p > 100 ? 'bad' : p >= 85 ? 'warn' : 'ok');

/** Tabela de carga × capacidade por recurso e semana. A barra satura em 100% e o excesso aparece em vermelho com ícone. */
export function CargaRecursos({ semanas, recursos, semRecurso }: { semanas: string[]; recursos: RecursoCarga[]; semRecurso?: number[] }) {
  if (!recursos.length) return <p className="muted">Cadastre os recursos (linhas, células, bancadas) em PCP → Recursos para medir a carga.</p>;
  const temSem = (semRecurso ?? []).some(x => x > 0);
  return (
    <div className="pcp-carga" style={{ ['--n' as string]: semanas.length }}>
      <div className="pcp-carga__linha pcp-carga__cab">
        <span>Recurso</span>
        {semanas.map(s => <span key={s}>Sem. {diaMes(s)}</span>)}
      </div>
      {recursos.map(r => (
        <div key={r.id} className="pcp-carga__linha">
          <span className="pcp-carga__rec"><b>{r.codigo}</b> {r.nome}<small>{numero(r.capacidadeSemana)} un/semana</small></span>
          {r.semanas.map((s, i) => {
            const t = tomCarga(s.pct);
            return (
              <span key={i} className={`pcp-carga__cel pcp-carga__cel--${t}`} title={`${numero(s.carga)} un de ${numero(r.capacidadeSemana)}`}>
                <span className="pcp-carga__barra"><i style={{ width: `${Math.min(100, s.pct ?? 0)}%` }} /></span>
                <span className="pcp-carga__pct">{t === 'bad' && <IoAlertCircle aria-hidden />}{t === 'warn' && <IoWarning aria-hidden />}{s.pct === null ? '-' : `${s.pct}%`}</span>
              </span>
            );
          })}
        </div>
      ))}
      {temSem && (
        <div className="pcp-carga__linha pcp-carga__sem">
          <span className="pcp-carga__rec">Sem recurso<small>unidades sem linha definida</small></span>
          {semRecurso!.map((c, i) => <span key={i} className="pcp-carga__cel">{c ? `${numero(c)} un` : '-'}</span>)}
        </div>
      )}
    </div>
  );
}
