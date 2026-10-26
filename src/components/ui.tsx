/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { IoCloseOutline, IoSearchOutline, IoFileTrayOutline, IoAlertCircleOutline } from 'react-icons/io5';
import type { Tom } from '../lib/regras';

// ------------------------------------------------------------ Layout
export function PageHeader({ titulo, descricao, acoes }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode }) {
  useEffect(() => { document.title = `${titulo} · ViaPro ERP`; }, [titulo]);
  return (
    <header className="page-head">
      <div>
        <h1>{titulo}</h1>
        {descricao && <p>{descricao}</p>}
      </div>
      {acoes && <div className="page-head__actions">{acoes}</div>}
    </header>
  );
}

export function Panel({ titulo, descricao, acoes, children, flush, className = '' }: {
  titulo?: ReactNode; descricao?: ReactNode; acoes?: ReactNode; children: ReactNode; flush?: boolean; className?: string;
}) {
  return (
    <section className={`panel ${flush ? 'panel--flush' : ''} ${className}`}>
      {(titulo || acoes) && (
        <div className="panel__head">
          <div>
            {titulo && <h2>{titulo}</h2>}
            {descricao && <p>{descricao}</p>}
          </div>
          {acoes && <div className="row">{acoes}</div>}
        </div>
      )}
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function Kpi({ label, valor, dica, tom, icone, onClick }: {
  label: string; valor: ReactNode; dica?: ReactNode; tom?: Tom; icone?: ReactNode; onClick?: () => void;
}) {
  const conteudo = (
    <>
      <div className="kpi__label">{icone}{label}</div>
      <div className="kpi__value">{valor}</div>
      {dica && <div className="kpi__hint">{dica}</div>}
    </>
  );
  return onClick
    ? <button type="button" className="kpi" data-tone={tom} onClick={onClick}>{conteudo}</button>
    : <div className="kpi" data-tone={tom}>{conteudo}</div>;
}

// ------------------------------------------------------------ Marcadores
export function Badge({ tom, children, plain }: { tom?: Tom; children: ReactNode; plain?: boolean }) {
  return <span className={`badge ${tom ? `badge--${tom}` : ''} ${plain ? 'badge--plain' : ''}`}>{children}</span>;
}

export const Code = ({ children }: { children: ReactNode }) => <span className="code">{children}</span>;

/** Endereço do armazém no formato de etiqueta de prateleira. */
export function Loc({ children }: { children?: ReactNode }) {
  if (!children) return <span className="loc loc--empty">Sem endereço</span>;
  return <span className="loc">{children}</span>;
}

// ------------------------------------------------------------ Formulários
export function Field({ label, children, dica, className = '' }: { label: string; children: ReactNode; dica?: ReactNode; className?: string }) {
  return (
    <div className={`field ${className}`}>
      <label>{label}</label>
      {children}
      {dica && <small>{dica}</small>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, autoFocus, onEnter }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; onEnter?: (v: string) => void;
}) {
  return (
    <div className="input-icon">
      <IoSearchOutline />
      <input
        className="input" type="search" value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(value); }}
        aria-label={placeholder}
      />
    </div>
  );
}

export function Segmented<T extends string>({ opcoes, valor, onChange }: {
  opcoes: { valor: T; label: ReactNode; n?: number }[]; valor: T; onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {opcoes.map(o => (
        <button key={o.valor} type="button" aria-pressed={o.valor === valor} onClick={() => onChange(o.valor)}>
          {o.label}{o.n !== undefined && <span className="n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ Estados
export function Empty({ titulo = 'Nada por aqui', children, icone }: { titulo?: string; children?: ReactNode; icone?: ReactNode }) {
  return (
    <div className="empty">
      {icone ?? <IoFileTrayOutline />}
      <b>{titulo}</b>
      {children}
    </div>
  );
}

export function Loading({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="loading" aria-busy="true" aria-label="Carregando">
      <div className="kpis">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 86 }} />)}</div>
      {Array.from({ length: linhas }).map((_, i) => <div key={i} className="skeleton" style={{ height: 38 }} />)}
    </div>
  );
}

export function Notice({ tom = 'info', children, acao }: { tom?: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode; acao?: ReactNode }) {
  return (
    <div className={`notice notice--${tom}`} role={tom === 'bad' ? 'alert' : 'status'}>
      <IoAlertCircleOutline />
      <div style={{ flex: 1 }}>{children}</div>
      {acao}
    </div>
  );
}

// ------------------------------------------------------------ Modal / Drawer
export function Modal({ aberto, onFechar, titulo, descricao, children, rodape, tamanho = 'md', drawer }: {
  aberto: boolean; onFechar: () => void; titulo: ReactNode; descricao?: ReactNode; children: ReactNode;
  rodape?: ReactNode; tamanho?: 'sm' | 'md' | 'lg' | 'xl'; drawer?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const alvo = ref.current?.querySelector<HTMLElement>('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button');
      alvo?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
      anterior?.focus?.();
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;
  return (
    <div className={`overlay ${drawer ? 'drawer-overlay' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div ref={ref} className={`modal modal--${tamanho} ${drawer ? 'drawer' : ''}`} role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : undefined}>
        <div className="modal__head">
          <div>
            <h2>{titulo}</h2>
            {descricao && <p>{descricao}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onFechar} aria-label="Fechar"><IoCloseOutline /></button>
        </div>
        <div className="modal__body">{children}</div>
        {rodape && <div className="modal__foot">{rodape}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Confirmação / Motivo (substitui window.confirm e window.prompt)
interface DialogoOpts {
  titulo: string;
  mensagem?: ReactNode;
  confirmar?: string;
  perigo?: boolean;
  pedirTexto?: { label: string; placeholder?: string; obrigatorio?: boolean };
}
type Resolver = (v: string | boolean | null) => void;
const DialogoCtx = createContext<(o: DialogoOpts) => Promise<string | boolean | null>>(() => Promise.resolve(null));

export function DialogoProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<{ opts: DialogoOpts; resolver: Resolver } | null>(null);
  const [texto, setTexto] = useState('');

  const abrir = useCallback((opts: DialogoOpts) => new Promise<string | boolean | null>(resolver => {
    setTexto('');
    setEstado({ opts, resolver });
  }), []);

  const fechar = (v: string | boolean | null) => { estado?.resolver(v); setEstado(null); };
  const o = estado?.opts;
  const bloqueado = Boolean(o?.pedirTexto?.obrigatorio && !texto.trim());

  return (
    <DialogoCtx.Provider value={abrir}>
      {children}
      {o && (
        <Modal
          aberto onFechar={() => fechar(o.pedirTexto ? null : false)} titulo={o.titulo} tamanho="sm"
          rodape={<>
            <button className="btn" onClick={() => fechar(o.pedirTexto ? null : false)}>Cancelar</button>
            <button className={`btn ${o.perigo ? 'btn--danger' : 'btn--primary'}`} disabled={bloqueado} onClick={() => fechar(o.pedirTexto ? texto.trim() : true)}>
              {o.confirmar || 'Confirmar'}
            </button>
          </>}
        >
          {o.mensagem && <div style={{ color: 'var(--text-2)', marginBottom: o.pedirTexto ? 14 : 0 }}>{o.mensagem}</div>}
          {o.pedirTexto && (
            <Field label={o.pedirTexto.label}>
              <textarea className="textarea" autoFocus value={texto} placeholder={o.pedirTexto.placeholder} onChange={e => setTexto(e.target.value)} />
            </Field>
          )}
        </Modal>
      )}
    </DialogoCtx.Provider>
  );
}

export function useDialogo() {
  const abrir = useContext(DialogoCtx);
  return {
    confirmar: (o: Omit<DialogoOpts, 'pedirTexto'>) => abrir(o) as Promise<boolean>,
    pedirTexto: (o: DialogoOpts & { pedirTexto: NonNullable<DialogoOpts['pedirTexto']> }) => abrir(o) as Promise<string | null>,
  };
}
