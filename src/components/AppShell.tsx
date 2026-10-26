import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  IoGridOutline, IoCubeOutline, IoClipboardOutline, IoListOutline, IoLocationOutline, IoTimerOutline, IoWarningOutline,
  IoCartOutline, IoBulbOutline, IoDocumentAttachOutline, IoBusinessOutline, IoFlaskOutline, IoPricetagsOutline,
  IoPieChartOutline, IoShieldCheckmarkOutline, IoSwapHorizontalOutline, IoPeopleOutline, IoMenuOutline,
  IoSearchOutline, IoLogOutOutline, IoGitCompareOutline, IoWalletOutline, IoTrendingUpOutline, IoReceiptOutline, IoMoonOutline, IoSunnyOutline, IoAnalyticsOutline, IoChevronBackOutline, IoChevronForwardOutline,
} from 'react-icons/io5';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { contem, iniciais } from '../lib/format';

interface Item { to: string; label: string; icone: ReactNode; admin?: boolean; contador?: 'os' }
interface Grupo { titulo: string; itens: Item[] }

const MENU: Grupo[] = [
  { titulo: 'Visão geral', itens: [{ to: '/', label: 'Painel', icone: <IoGridOutline /> }, { to: '/bi', label: 'Painel BI', icone: <IoAnalyticsOutline /> }] },
  {
    titulo: 'Armazém',
    itens: [
      { to: '/estoque', label: 'Estoque', icone: <IoCubeOutline /> },
      { to: '/armazens', label: 'Armazéns e transferências', icone: <IoGitCompareOutline /> },
      { to: '/separacao', label: 'Ordens de separação', icone: <IoClipboardOutline />, contador: 'os' },
      { to: '/inventario', label: 'Inventário', icone: <IoListOutline /> },
      { to: '/locais', label: 'Endereços', icone: <IoLocationOutline /> },
      { to: '/validade', label: 'Validade', icone: <IoTimerOutline /> },
      { to: '/rupturas', label: 'Perdas e avarias', icone: <IoWarningOutline /> },
    ],
  },
  {
    titulo: 'Suprimentos',
    itens: [
      { to: '/compras', label: 'Pedidos de compra', icone: <IoCartOutline /> },
      { to: '/compras/sugestao', label: 'Sugestão de compras', icone: <IoBulbOutline /> },
      { to: '/recebimento-nfe', label: 'Entrada por NF-e', icone: <IoDocumentAttachOutline /> },
      { to: '/fornecedores', label: 'Fornecedores', icone: <IoBusinessOutline /> },
    ],
  },
  {
    titulo: 'Produção e cadastros',
    itens: [
      { to: '/transformacao', label: 'Transformação', icone: <IoFlaskOutline /> },
      { to: '/produtos', label: 'Produtos', icone: <IoPricetagsOutline /> },
    ],
  },
  {
    titulo: 'Gerencial',
    itens: [
      { to: '/curva-abc', label: 'Curva ABC', icone: <IoPieChartOutline /> },
      { to: '/kardex', label: 'Kardex', icone: <IoSwapHorizontalOutline /> },
      { to: '/historico', label: 'Auditoria', icone: <IoShieldCheckmarkOutline /> },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { to: '/financeiro', label: 'Contas a pagar e receber', icone: <IoWalletOutline /> },
      { to: '/financeiro/fluxo', label: 'Fluxo de caixa', icone: <IoTrendingUpOutline /> },
    ],
  },
  {
    titulo: 'Administração',
    itens: [
      { to: '/empresa', label: 'Empresa e fiscal', icone: <IoReceiptOutline />, admin: true },
      { to: '/gestores', label: 'Usuários e acessos', icone: <IoPeopleOutline />, admin: true },
    ],
  },
];

function tituloDaRota(pathname: string) {
  let melhor = { grupo: 'ViaPro ERP', label: '', tam: -1 };
  for (const g of MENU) for (const i of g.itens) {
    const casa = i.to === pathname || (i.to !== '/' && pathname.startsWith(i.to + '/'));
    if (casa && i.to.length > melhor.tam) melhor = { grupo: g.titulo, label: i.label, tam: i.to.length };
  }
  return melhor;
}

function useTema() {
  const [tema, setTema] = useState<'light' | 'dark'>(() => {
    try {
      const salvo = localStorage.getItem('viapro:tema');
      if (salvo === 'light' || salvo === 'dark') return salvo;
    } catch { /* ignore */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    try { localStorage.setItem('viapro:tema', tema); } catch { /* ignore */ }
  }, [tema]);
  return [tema, () => setTema(t => (t === 'dark' ? 'light' : 'dark'))] as const;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { usuario, isAdmin, sair } = useAuth();
  const location = useLocation();
  const [aberto, setAberto] = useState(false);
  const [recolhido, setRecolhido] = useState(() => {
    try { return localStorage.getItem('viapro:menu') === 'recolhido'; } catch { return false; }
  });
  const [paleta, setPaleta] = useState(false);
  const [osPendentes, setOsPendentes] = useState(0);
  const [tema, alternarTema] = useTema();

  useEffect(() => { try { localStorage.setItem('viapro:menu', recolhido ? 'recolhido' : 'aberto'); } catch { /* ignore */ } }, [recolhido]);

  // Atalho Ctrl+K / Cmd+K para a busca global
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaleta(true); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  // Contador de OS pendentes no menu (atualiza a cada 90s)
  useEffect(() => {
    let ativo = true;
    const buscar = () => api.get('/wms/ordens').then(r => {
      if (ativo) setOsPendentes(r.data.filter((o: { status: string }) => o.status === 'Pendente').length);
    }).catch(() => {});
    buscar();
    const t = setInterval(buscar, 90000);
    return () => { ativo = false; clearInterval(t); };
  }, [location.pathname]);

  const { grupo, label } = tituloDaRota(location.pathname);

  return (
    <div className={`shell ${aberto ? 'is-open' : ''} ${recolhido ? 'is-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="Menu principal">
        <div className="sidebar__brand">
          <img src="/favicon.png" alt="" />
          <div><strong>ViaPro ERP</strong><span>Gestão de armazém</span></div>
        </div>
        <nav className="sidebar__nav">
          {MENU.map(g => {
            const itens = g.itens.filter(i => !i.admin || isAdmin);
            if (!itens.length) return null;
            return (
              <div key={g.titulo} className="sidebar__group">
                <div className="sidebar__group-title">{g.titulo}</div>
                {itens.map(i => (
                  <NavLink key={i.to} to={i.to} end className="sidebar__link" title={i.label} onClick={() => setAberto(false)}>
                    {i.icone}<span>{i.label}</span>
                    {i.contador === 'os' && osPendentes > 0 && <b className="count">{osPendentes}</b>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar__foot">
          <button className="sidebar__link collapse-toggle" style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer' }} onClick={() => setRecolhido(r => !r)} title={recolhido ? 'Expandir menu' : 'Recolher menu'}>
            {recolhido ? <IoChevronForwardOutline /> : <IoChevronBackOutline />}<span>Recolher menu</span>
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setAberto(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setAberto(true)} aria-label="Abrir menu"><IoMenuOutline /></button>
          <div className="topbar__crumb">
            <small>{grupo}</small>
            <b>{label || 'ViaPro ERP'}</b>
          </div>
          <button className="topbar__search" onClick={() => setPaleta(true)} aria-label="Buscar telas e produtos">
            <IoSearchOutline /><span>Buscar telas e produtos</span><kbd>Ctrl K</kbd>
          </button>
          <button className="icon-btn" onClick={alternarTema} aria-label={tema === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} title="Alternar tema">
            {tema === 'dark' ? <IoSunnyOutline /> : <IoMoonOutline />}
          </button>
          <div className="topbar__user">
            <div className="avatar" aria-hidden>{iniciais(usuario?.nome)}</div>
            <div className="who hide-sm" style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{usuario?.nome}</div>
              <div className="muted" style={{ fontSize: 12 }}>{usuario?.cargo}</div>
            </div>
            <button className="icon-btn icon-btn--bad" onClick={sair} aria-label="Sair do sistema" title="Sair"><IoLogOutOutline /></button>
          </div>
        </header>
        <main className="content" id="conteudo">{children}</main>
      </div>

      {paleta && <PaletaComandos onFechar={() => setPaleta(false)} isAdmin={isAdmin} />}
    </div>
  );
}

/** Busca global: telas do sistema + produtos (abre o Kardex do produto). */
function PaletaComandos({ onFechar, isAdmin }: { onFechar: () => void; isAdmin: boolean }) {
  const navigate = useNavigate();
  const [termo, setTermo] = useState('');
  const [produtos, setProdutos] = useState<{ id: string; nome: string; sku: string; codigoBarras?: string }[]>([]);
  const [ativo, setAtivo] = useState(0);

  useEffect(() => {
    api.get('/produtos').then(r => setProdutos(r.data)).catch(() => {});
  }, []);

  const resultados = useMemo(() => {
    const telas = MENU.flatMap(g => g.itens.filter(i => !i.admin || isAdmin).map(i => ({ tipo: 'Telas', label: i.label, sub: g.titulo, icone: i.icone, ir: i.to })));
    const t = telas.filter(i => contem(termo, i.label, i.sub));
    const p = termo.trim()
      ? produtos.filter(x => contem(termo, x.nome, x.sku, x.codigoBarras)).slice(0, 8)
          .map(x => ({ tipo: 'Produtos', label: x.nome, sub: x.sku, icone: <IoCubeOutline />, ir: `/kardex/${x.id}` }))
      : [];
    return [...t, ...p];
  }, [termo, produtos, isAdmin]);

  function ir(i: number) {
    const r = resultados[i];
    if (!r) return;
    navigate(r.ir);
    onFechar();
  }

  let grupoAtual = '';
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal palette" role="dialog" aria-modal="true" aria-label="Busca global">
        <input
          className="palette__input" autoFocus placeholder="Ir para uma tela ou buscar um produto…" value={termo}
          onChange={e => { setTermo(e.target.value); setAtivo(0); }}
          onKeyDown={e => {
            if (e.key === 'Escape') onFechar();
            if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo(a => Math.min(a + 1, resultados.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(a => Math.max(a - 1, 0)); }
            if (e.key === 'Enter') ir(ativo);
          }}
        />
        <div className="palette__list" role="listbox">
          {resultados.length === 0 && <div className="empty">Nada encontrado para “{termo}”.</div>}
          {resultados.map((r, i) => {
            const cab = r.tipo !== grupoAtual ? (grupoAtual = r.tipo) : null;
            return (
              <div key={r.tipo + r.ir}>
                {cab && <div className="palette__group">{cab}</div>}
                <div className="palette__item" role="option" aria-selected={i === ativo} onMouseEnter={() => setAtivo(i)} onClick={() => ir(i)}>
                  {r.icone}<span style={{ flex: 1 }}>{r.label}</span><span className="muted" style={{ fontSize: 12 }}>{r.sub}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
