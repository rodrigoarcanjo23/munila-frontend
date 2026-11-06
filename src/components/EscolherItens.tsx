import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { IoBarcodeOutline, IoCheckboxOutline, IoCloseOutline } from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { contem, dataUTC, haQuanto, normalizar, numero } from '../lib/format';
import { Badge, Code, Loading, Loc, Segmented } from './ui';

/** Item que pode entrar num inventário (GET /inventarios/candidatos). */
export interface Candidato {
  produtoId: string; sku: string; nome: string; codigoBarras: string | null; endereco: string | null; unidade: string | null;
  categoria: { id: string; nome: string } | null; saldo: number; valor: number; classe: 'A' | 'B' | 'C';
  abaixoMinimo: boolean; ultimaContagem: string | null; emInventario: string | null;
}
type Filtro = 'todos' | 'comSaldo' | 'A' | 'nunca' | 'antigos' | 'minimo';
const DIAS_ANTIGO = 30;

/**
 * ✨ Escolha dos itens de um inventário: busca, leitura de código, filtros rápidos (curva A, nunca contados,
 * sem contagem há 30 dias, abaixo do mínimo) e "marcar todos do filtro". Itens já em outro inventário aberto
 * aparecem marcados com o código dele.
 */
export function EscolherItens({ armazemId, selecionados, onChange, ocultar, mostrarSaldo }: {
  armazemId?: string; selecionados: Set<string>; onChange: (s: Set<string>) => void;
  /** produtos que já estão no inventário (ao acrescentar itens) */
  ocultar?: Set<string>; mostrarSaldo: boolean;
}) {
  const { dados } = useCarregar(async () => (await api.get<Candidato[]>('/inventarios/candidatos', { params: { armazemId } })).data, [armazemId]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [categoria, setCategoria] = useState('');
  const [soEscolhidos, setSoEscolhidos] = useState(false);

  const todos = useMemo(() => (dados ?? []).filter(c => !ocultar?.has(c.produtoId)), [dados, ocultar]);
  const categorias = useMemo(() => [...new Map(todos.filter(c => c.categoria).map(c => [c.categoria!.id, c.categoria!.nome])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [todos]);
  const limite = Date.now() - DIAS_ANTIGO * 86400000;
  const passa = (c: Candidato, f: Filtro) => f === 'todos' ? true : f === 'comSaldo' ? c.saldo > 0 : f === 'A' ? c.classe === 'A'
    : f === 'nunca' ? !c.ultimaContagem : f === 'antigos' ? !c.ultimaContagem || new Date(c.ultimaContagem).getTime() < limite : c.abaixoMinimo;
  const visiveis = useMemo(() => todos
    .filter(c => !soEscolhidos || selecionados.has(c.produtoId))
    .filter(c => passa(c, filtro) && (!categoria || c.categoria?.id === categoria))
    .filter(c => contem(busca, c.nome, c.sku, c.codigoBarras, c.endereco)), [todos, filtro, categoria, busca, soEscolhidos, selecionados]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = (id: string) => { const n = new Set(selecionados); if (n.has(id)) n.delete(id); else n.add(id); onChange(n); };
  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every(c => selecionados.has(c.produtoId));
  function marcarVisiveis() {
    const n = new Set(selecionados);
    if (todosVisiveisMarcados) visiveis.forEach(c => n.delete(c.produtoId)); else visiveis.forEach(c => n.add(c.produtoId));
    onChange(n);
  }
  // leitor de código: bipar o EAN/SKU e Enter marca o item
  function ler() {
    const t = normalizar(busca.trim());
    const c = todos.find(x => normalizar(x.codigoBarras) === t || normalizar(x.sku) === t);
    if (!c) return;
    if (!selecionados.has(c.produtoId)) { alternar(c.produtoId); toast.success(`${c.nome} incluído.`, { autoClose: 1500 }); }
    setBusca('');
  }

  if (!dados) return <Loading linhas={5} />;
  const n = (f: Filtro) => todos.filter(c => passa(c, f)).length;
  return (
    <div className="esc">
      <div className="esc__barra">
        <div className="input-icon esc__busca">
          <IoBarcodeOutline />
          <input className="input" value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ler(); } }}
            placeholder="Buscar por nome, SKU, endereço ou bipar o código" aria-label="Buscar item" autoFocus />
        </div>
        <select className="select esc__cat" value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categorias.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
      </div>
      <Segmented valor={filtro} onChange={setFiltro} opcoes={[
        { valor: 'todos', label: 'Todos', n: n('todos') },
        { valor: 'comSaldo', label: 'Com saldo', n: n('comSaldo') },
        { valor: 'A', label: 'Curva A', n: n('A') },
        { valor: 'antigos', label: `Sem contagem há ${DIAS_ANTIGO}+ dias`, n: n('antigos') },
        { valor: 'nunca', label: 'Nunca contados', n: n('nunca') },
        { valor: 'minimo', label: 'Abaixo do mínimo', n: n('minimo') },
      ]} />

      <div className="esc__resumo">
        <button type="button" className="btn btn--sm" onClick={marcarVisiveis} disabled={!visiveis.length}>
          <IoCheckboxOutline /> {todosVisiveisMarcados ? `Desmarcar os ${numero(visiveis.length)} da lista` : `Marcar os ${numero(visiveis.length)} da lista`}
        </button>
        <span className="esc__conta"><b>{numero(selecionados.size)}</b> item(ns) escolhido(s)</span>
        {selecionados.size > 0 && <>
          <label className="check"><input type="checkbox" checked={soEscolhidos} onChange={e => setSoEscolhidos(e.target.checked)} /> Ver só os escolhidos</label>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => { onChange(new Set()); setSoEscolhidos(false); }}><IoCloseOutline /> Limpar</button>
        </>}
      </div>

      <div className="esc__lista" role="listbox" aria-multiselectable aria-label="Itens do inventário">
        {visiveis.length === 0 && <div className="esc__vazio">Nenhum item com esses filtros.</div>}
        {visiveis.slice(0, 400).map(c => {
          const marcado = selecionados.has(c.produtoId);
          return (
            <label key={c.produtoId} className={`esc__item ${marcado ? 'is-on' : ''}`} role="option" aria-selected={marcado}>
              <input type="checkbox" checked={marcado} onChange={() => alternar(c.produtoId)} />
              <span className="esc__nome"><b>{c.nome}</b><small><Code>{c.sku}</Code>{c.categoria ? ` · ${c.categoria.nome}` : ''}</small></span>
              <Loc>{c.endereco}</Loc>
              <span className="esc__abc"><Badge tom={c.classe === 'A' ? 'bad' : c.classe === 'B' ? 'warn' : undefined} plain>{c.classe}</Badge></span>
              <span className="esc__saldo">{mostrarSaldo ? <>{numero(c.saldo)} <small>{c.unidade ?? 'UN'}</small></> : c.saldo > 0 ? '' : <small>sem saldo</small>}</span>
              <span className="esc__ult" title={c.ultimaContagem ? `Última contagem em ${dataUTC(c.ultimaContagem)}` : 'Nunca contado'}>
                {c.emInventario ? <Badge tom="info" plain>em {c.emInventario}</Badge> : c.ultimaContagem ? `contado ${haQuanto(c.ultimaContagem)}` : <span className="muted">nunca contado</span>}
              </span>
            </label>
          );
        })}
        {visiveis.length > 400 && <div className="esc__vazio">Mostrando 400 de {numero(visiveis.length)}. Use a busca ou os filtros; "Marcar os {numero(visiveis.length)} da lista" marca todos.</div>}
      </div>
    </div>
  );
}
