import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { IoAddOutline, IoArrowBackOutline, IoBarcodeOutline, IoCheckmarkDoneOutline, IoEyeOutline, IoEyeOffOutline, IoDownloadOutline, IoCloseCircleOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { contem, dataHora, moeda, normalizar, numero } from '../lib/format';
import { exportarExcel } from '../lib/exportar';
import type { Categoria } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Code, Empty, Field, Kpi, Loading, Loc, Modal, Notice, PageHeader, Panel, SearchInput, Segmented, useDialogo } from '../components/ui';

interface InventarioResumo {
  id: string; codigo: string; descricao?: string | null; tipo: string; status: string; cego: boolean; createdAt: string; concluidoEm?: string | null;
  responsavel?: { nome: string } | null; totalItens: number; contados: number; divergentes: number;
}
interface ItemInv {
  id: string; produtoId: string; saldoSistema: number | null; quantidadeContada: number | null; ajustado: boolean; contadoEm?: string | null;
  contadoPor?: { nome: string } | null;
  produto: { id: string; sku: string; nome: string; codigoBarras?: string | null; enderecoLocalizacao?: string | null; precoCusto?: number | null; unidade?: string | null };
}
interface InventarioDet extends Omit<InventarioResumo, 'totalItens' | 'contados' | 'divergentes'> { itens: ItemInv[]; saldoRevelado: boolean }

const tomStatus = (s: string) => (s === 'Concluído' ? 'ok' : s === 'Cancelado' ? undefined : s === 'Em contagem' ? 'info' : 'warn') as 'ok' | 'info' | 'warn' | undefined;

export default function Inventario() {
  const { id } = useParams();
  return id ? <Contagem id={id} /> : <Lista />;
}

function Lista() {
  const navigate = useNavigate();
  const [novo, setNovo] = useState(false);
  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [i, c] = await Promise.all([api.get<InventarioResumo[]>('/inventarios'), api.get<Categoria[]>('/categorias')]);
    return { inventarios: i.data, categorias: c.data };
  });

  const colunas: Col<InventarioResumo>[] = [
    { key: 'cod', titulo: 'Inventário', principal: true, ordenar: i => i.codigo, render: i => <><Code>{i.codigo}</Code> <span className="cell-title">{i.descricao || i.tipo}</span></> },
    { key: 'tipo', titulo: 'Tipo', ordenar: i => i.tipo, render: i => <>{i.tipo}{i.cego && <span className="muted"> (cega)</span>}</> },
    { key: 'st', titulo: 'Situação', ordenar: i => i.status, render: i => <Badge tom={tomStatus(i.status)}>{i.status}</Badge> },
    { key: 'prog', titulo: 'Contagem', ordenar: i => i.contados / Math.max(1, i.totalItens), render: i => (
      <div className="row" style={{ flexWrap: 'nowrap', minWidth: 140 }}><div className="meter" style={{ flex: 1 }}><i style={{ width: `${(i.contados / Math.max(1, i.totalItens)) * 100}%` }} /></div><span className="nowrap">{i.contados}/{i.totalItens}</span></div>
    ) },
    { key: 'div', titulo: 'Divergências', align: 'right', ordenar: i => i.divergentes, render: i => <span className={i.divergentes ? 'qty qty--warn' : 'muted'}>{i.divergentes}</span> },
    { key: 'resp', titulo: 'Responsável', ocultarCelular: true, render: i => i.responsavel?.nome || '-' },
    { key: 'data', titulo: 'Aberto em', ocultarCelular: true, ordenar: i => i.createdAt, render: i => dataHora(i.createdAt) },
  ];

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Inventário" descricao="Contagens gerais ou cíclicas com contagem cega. Ao concluir, as diferenças viram ajustes rastreáveis."
        acoes={<button className="btn btn--primary" onClick={() => setNovo(true)}><IoAddOutline /> Novo inventário</button>} />
      <Panel flush>
        <DataTable colunas={colunas} linhas={dados?.inventarios ?? []} chave={i => i.id} onLinha={i => navigate(`/inventario/${i.id}`)}
          vazio={<Empty titulo="Nenhum inventário ainda">Comece por um inventário cíclico de uma rua ou categoria — é mais rápido e não para o armazém.</Empty>} />
      </Panel>
      {novo && <ModalNovo categorias={dados?.categorias ?? []} onFechar={() => setNovo(false)} onCriado={id => { setNovo(false); recarregar(true); navigate(`/inventario/${id}`); }} />}
    </>
  );
}

function ModalNovo({ categorias, onFechar, onCriado }: { categorias: Categoria[]; onFechar: () => void; onCriado: (id: string) => void }) {
  const { usuario } = useAuth();
  const [tipo, setTipo] = useState('Cíclico');
  const [descricao, setDescricao] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [prefixo, setPrefixo] = useState('');
  const [cego, setCego] = useState(true);
  const [salvando, setSalvando] = useState(false);

  async function criar() {
    setSalvando(true);
    try {
      const { data } = await api.post('/inventarios', {
        tipo, descricao, cego, usuarioId: usuario?.id,
        categoriaId: tipo === 'Cíclico' ? categoriaId || undefined : undefined,
        enderecoPrefixo: tipo === 'Cíclico' ? prefixo || undefined : undefined,
      });
      toast.success(`Inventário ${data.codigo} aberto.`);
      onCriado(data.id);
    } catch (e) { toast.error(msgErro(e)); } finally { setSalvando(false); }
  }

  return (
    <Modal aberto onFechar={onFechar} titulo="Novo inventário" tamanho="md"
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" disabled={salvando} onClick={criar}>{salvando ? 'Abrindo…' : 'Abrir inventário'}</button></>}>
      <div className="form-grid">
        <Field label="Abrangência" className="col-12">
          <Segmented valor={tipo} onChange={setTipo} opcoes={[{ valor: 'Cíclico', label: 'Cíclico (parte do estoque)' }, { valor: 'Geral', label: 'Geral (todo o estoque)' }]} />
        </Field>
        <Field label="Descrição" className="col-12"><input className="input" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: Rua A — outubro" /></Field>
        {tipo === 'Cíclico' && <>
          <Field label="Categoria" className="col-6">
            <select className="select" value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
              <option value="">Todas</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field label="Endereço começa com" className="col-6" dica="Ex.: A01 conta toda a rua A01"><input className="input" value={prefixo} onChange={e => setPrefixo(e.target.value.toUpperCase())} placeholder="A01" /></Field>
        </>}
        <div className="col-12">
          <label className="check"><input type="checkbox" checked={cego} onChange={e => setCego(e.target.checked)} /> Contagem cega (o operador não vê o saldo do sistema)</label>
        </div>
        <div className="col-12"><Notice tom="info">O saldo de cada item é registrado no momento da abertura. Movimente o mínimo possível a área durante a contagem.</Notice></div>
      </div>
    </Modal>
  );
}

function Contagem({ id }: { id: string }) {
  const navigate = useNavigate();
  const { usuario, isAdmin } = useAuth();
  const { confirmar } = useDialogo();
  const [revelar, setRevelar] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'pendentes' | 'divergentes'>('todos');
  const [leitura, setLeitura] = useState('');
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const { dados: inv, setDados, carregando, recarregar } = useCarregar(async () => (await api.get<InventarioDet>(`/inventarios/${id}${revelar ? '?revelar=1' : ''}`)).data, [id, revelar]);

  const aberto = inv && inv.status !== 'Concluído' && inv.status !== 'Cancelado';
  const contados = inv?.itens.filter(i => i.quantidadeContada !== null).length ?? 0;
  const divergentes = useMemo(() => inv?.itens.filter(i => i.quantidadeContada !== null && i.saldoSistema !== null && i.quantidadeContada !== i.saldoSistema) ?? [], [inv]);
  const impacto = divergentes.reduce((a, i) => a + ((i.quantidadeContada ?? 0) - (i.saldoSistema ?? 0)) * (i.produto.precoCusto || 0), 0);

  const linhas = useMemo(() => (inv?.itens ?? [])
    .filter(i => contem(busca, i.produto.nome, i.produto.sku, i.produto.codigoBarras, i.produto.enderecoLocalizacao))
    .filter(i => filtro === 'todos' || (filtro === 'pendentes' ? i.quantidadeContada === null : divergentes.includes(i))),
  [inv, busca, filtro, divergentes]);

  async function salvarContagem(item: ItemInv, valor: string) {
    const q = valor === '' ? null : Math.max(0, Math.round(Number(valor)));
    if (q === item.quantidadeContada) return;
    try {
      await api.put(`/inventarios/${id}/itens/${item.id}`, { quantidadeContada: q, usuarioId: usuario?.id });
      setDados(d => d && { ...d, status: d.status === 'Aberto' ? 'Em contagem' : d.status, itens: d.itens.map(x => (x.id === item.id ? { ...x, quantidadeContada: q, contadoPor: { nome: usuario?.nome || '' } } : x)) });
    } catch (e) { toast.error(msgErro(e)); }
  }

  function lerCodigo() {
    const t = normalizar(leitura.trim());
    const item = inv?.itens.find(i => normalizar(i.produto.codigoBarras) === t || normalizar(i.produto.sku) === t);
    setLeitura('');
    if (!item) return toast.error('Produto fora deste inventário.');
    setBusca('');
    setFiltro('todos');
    setTimeout(() => { inputs.current[item.id]?.focus(); inputs.current[item.id]?.select(); }, 50);
  }

  async function concluir() {
    const pendentes = (inv?.itens.length ?? 0) - contados;
    const ok = await confirmar({
      titulo: `Concluir ${inv?.codigo}?`, confirmar: 'Concluir e ajustar estoque',
      mensagem: <>As diferenças entre o contado e o sistema serão lançadas como ajuste de inventário.{pendentes > 0 && <><br /><br /><b>{pendentes} item(ns) sem contagem</b> serão mantidos como estão.</>}</>,
    });
    if (!ok) return;
    try {
      const { data } = await api.post(`/inventarios/${id}/concluir`, { usuarioId: usuario?.id });
      toast.success(`Inventário concluído: ${data.ajustes} ajuste(s) lançados.`);
      setRevelar(true);
      recarregar(true);
    } catch (e) { toast.error(msgErro(e)); }
  }

  async function cancelar() {
    if (!(await confirmar({ titulo: 'Cancelar inventário?', mensagem: 'As contagens serão descartadas e nenhum ajuste será feito.', confirmar: 'Cancelar inventário', perigo: true }))) return;
    try { await api.delete(`/inventarios/${id}`); toast.success('Inventário cancelado.'); navigate('/inventario'); } catch (e) { toast.error(msgErro(e)); }
  }

  if (carregando && !inv) return <Loading />;
  if (!inv) return null;
  const mostrarSaldo = inv.saldoRevelado;

  const colunas: Col<ItemInv>[] = [
    { key: 'end', titulo: 'Endereço', ordenar: i => i.produto.enderecoLocalizacao || 'zzz', render: i => <Loc>{i.produto.enderecoLocalizacao}</Loc> },
    { key: 'prod', titulo: 'Produto', principal: true, ordenar: i => i.produto.nome, render: i => <><div className="cell-title">{i.produto.nome}</div><div className="cell-sub"><Code>{i.produto.sku}</Code></div></> },
    ...(mostrarSaldo ? [{ key: 'sis', titulo: 'Sistema', align: 'right' as const, ordenar: (i: ItemInv) => i.saldoSistema, render: (i: ItemInv) => numero(i.saldoSistema) }] : []),
    { key: 'cont', titulo: 'Contado', align: 'right', ordenar: i => i.quantidadeContada, render: i => aberto ? (
      <input ref={el => { inputs.current[i.id] = el; }} className="input" style={{ width: 96, height: 34, textAlign: 'right', marginLeft: 'auto', fontWeight: 700 }}
        type="number" min={0} inputMode="numeric" defaultValue={i.quantidadeContada ?? ''} aria-label={`Contagem de ${i.produto.nome}`}
        onBlur={e => salvarContagem(i, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    ) : <b>{i.quantidadeContada ?? '-'}</b> },
    ...(mostrarSaldo ? [{ key: 'dif', titulo: 'Diferença', align: 'right' as const, ordenar: (i: ItemInv) => (i.quantidadeContada ?? 0) - (i.saldoSistema ?? 0), render: (i: ItemInv) => {
      if (i.quantidadeContada === null || i.saldoSistema === null) return <span className="muted">-</span>;
      const d = i.quantidadeContada - i.saldoSistema;
      return <span className={d > 0 ? 'up' : d < 0 ? 'down' : 'muted'}>{d > 0 ? '+' : ''}{numero(d)}</span>;
    } }] : []),
    { key: 'por', titulo: 'Contado por', ocultarCelular: true, render: i => i.contadoPor?.nome || <span className="muted">Pendente</span> },
  ];

  return (
    <>
      <PageHeader
        titulo={`Inventário ${inv.codigo}`}
        descricao={<>{inv.descricao || inv.tipo} · aberto em {dataHora(inv.createdAt)} {inv.responsavel && <>por {inv.responsavel.nome}</>}</>}
        acoes={<>
          <button className="btn" onClick={() => navigate('/inventario')}><IoArrowBackOutline /> Voltar</button>
          {mostrarSaldo && <button className="btn" onClick={() => exportarExcel(`Inventario_${inv.codigo}`, [{ nome: inv.codigo, linhas: inv.itens, colunas: [
            { titulo: 'Endereço', valor: i => i.produto.enderecoLocalizacao || '-' }, { titulo: 'SKU', valor: i => i.produto.sku }, { titulo: 'Produto', valor: i => i.produto.nome, largura: 40 },
            { titulo: 'Sistema', valor: i => i.saldoSistema ?? '' }, { titulo: 'Contado', valor: i => i.quantidadeContada ?? '' },
            { titulo: 'Diferença', valor: i => (i.quantidadeContada === null || i.saldoSistema === null ? '' : i.quantidadeContada - i.saldoSistema) },
          ] }])}><IoDownloadOutline /> Excel</button>}
          {aberto && inv.cego && isAdmin && <button className="btn" onClick={() => setRevelar(r => !r)}>{revelar ? <IoEyeOffOutline /> : <IoEyeOutline />} {revelar ? 'Ocultar saldo' : 'Ver saldo do sistema'}</button>}
          {aberto && <button className="btn btn--danger" onClick={cancelar}><IoCloseCircleOutline /> Cancelar</button>}
          {aberto && <button className="btn btn--primary" onClick={concluir} disabled={contados === 0}><IoCheckmarkDoneOutline /> Concluir</button>}
        </>}
      />

      <div className="kpis">
        <Kpi label="Situação" valor={<Badge tom={tomStatus(inv.status)}>{inv.status}</Badge>} />
        <Kpi label="Itens contados" valor={`${contados} / ${inv.itens.length}`} tom={contados === inv.itens.length ? 'ok' : undefined} />
        {mostrarSaldo && <Kpi label="Itens divergentes" valor={numero(divergentes.length)} tom={divergentes.length ? 'warn' : 'ok'} />}
        {mostrarSaldo && <Kpi label="Impacto financeiro" valor={moeda(impacto)} tom={impacto < 0 ? 'bad' : impacto > 0 ? 'ok' : undefined} />}
      </div>

      {inv.cego && !mostrarSaldo && <div className="mb-16"><Notice tom="info">Contagem cega: o saldo do sistema fica oculto até a conclusão. Conte e digite a quantidade física de cada item.</Notice></div>}

      <Panel flush>
        <div className="toolbar">
          {aberto && (
            <div className="input-icon" style={{ flex: '1 1 240px' }}>
              <IoBarcodeOutline />
              <input className="input" value={leitura} onChange={e => setLeitura(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') lerCodigo(); }} placeholder="Ler código e ir para o item" aria-label="Ler código de barras" />
            </div>
          )}
          <SearchInput value={busca} onChange={setBusca} placeholder="Filtrar por nome, SKU ou endereço" />
          <Segmented valor={filtro} onChange={setFiltro} opcoes={[
            { valor: 'todos', label: 'Todos', n: inv.itens.length },
            { valor: 'pendentes', label: 'Pendentes', n: inv.itens.length - contados },
            ...(mostrarSaldo ? [{ valor: 'divergentes' as const, label: 'Divergentes', n: divergentes.length }] : []),
          ]} />
        </div>
        <DataTable colunas={colunas} linhas={linhas} chave={i => i.id} porPagina={200} />
      </Panel>
    </>
  );
}
