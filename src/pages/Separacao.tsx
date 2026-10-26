import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
  IoAddOutline, IoPlayOutline, IoPauseOutline, IoPrintOutline, IoBarcodeOutline, IoPencilOutline, IoTrashOutline,
  IoListOutline, IoCheckmarkDoneOutline, IoWarningOutline,
} from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { contem, dataHora, haQuanto, normalizar, numero } from '../lib/format';
import { PESO_PRIORIDADE, TIPO_OS_LABEL, tomPrioridade, tomStatusOS } from '../lib/regras';
import type { Armazem, Estoque, OrdemServico, ParteLote, Produto } from '../lib/tipos';
import { useArmazens } from '../components/EstoqueModais';
import { dataUTC } from '../lib/format';
import { rotuloLote } from '../lib/regras';

/** Sugestão FEFO de lotes por item da ordem (somente ordens de saída). */
type Picking = Record<string, { partes: ParteLote[]; falta: number }>;
async function buscarPicking(ordem: OrdemServico): Promise<Picking> {
  if (ordem.tipo !== 'SAIDA') return {};
  try {
    const { data } = await api.get<{ itemId: string; partes: ParteLote[]; falta: number }[]>(`/wms/ordens/${ordem.id}/picking`);
    return Object.fromEntries(data.map(d => [d.itemId, { partes: d.partes, falta: d.falta }]));
  } catch { return {}; }
}
function usePicking(ordem: OrdemServico | null) {
  const [picking, setPicking] = useState<{ id: string | null; dados: Picking }>({ id: null, dados: {} });
  useEffect(() => { if (ordem) buscarPicking(ordem).then(dados => setPicking({ id: ordem.id, dados })); }, [ordem]);
  return ordem && picking.id === ordem.id ? picking.dados : {};
}
function LotesSugeridos({ p }: { p?: { partes: ParteLote[]; falta: number } }) {
  if (!p || (!p.partes.length && !p.falta)) return null;
  return (
    <div className="row" style={{ gap: 4, marginTop: 4 }}>
      {p.partes.map((x, i) => <Badge key={i} tom={i === 0 ? 'primary' : undefined} plain>{rotuloLote(x.lote)}: {numero(x.quantidade)}{x.validade ? ` · val. ${dataUTC(x.validade)}` : ''}</Badge>)}
      {p.falta > 0 && <Badge tom="bad" plain>Falta {numero(p.falta)}</Badge>}
    </div>
  );
}
import { ProdutoPicker } from '../components/ProdutoPicker';
import { Badge, Code, Empty, Field, Loading, Loc, Modal, Notice, PageHeader, SearchInput, Segmented, useDialogo } from '../components/ui';

type Aba = 'Todos' | 'Pendente' | 'Em Separação' | 'Concluída';
const porEndereco = <T extends { produto: Produto }>(itens: T[]) =>
  [...itens].sort((a, b) => (a.produto.enderecoLocalizacao || 'ZZZ').localeCompare(b.produto.enderecoLocalizacao || 'ZZZ'));

export default function Separacao() {
  const { usuario } = useAuth();
  const { confirmar } = useDialogo();
  const [aba, setAba] = useState<Aba>('Pendente');
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState('Todos');
  const [editar, setEditar] = useState<OrdemServico | 'nova' | null>(null);
  const [ver, setVer] = useState<OrdemServico | null>(null);
  const [conferir, setConferir] = useState<OrdemServico | null>(null);
  const { armazens, padraoId } = useArmazens();
  const pickingVer = usePicking(ver);
  const [agora] = useState(() => Date.now());

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [o, p, e] = await Promise.all([api.get<OrdemServico[]>('/wms/ordens'), api.get<Produto[]>('/produtos'), api.get<Estoque[]>('/estoque')]);
    const saldos = new Map<string, number>();
    // saldo por produto em cada armazém (chave armazém|produto)
    e.data.filter(x => x.status === 'Disponível').forEach(x => {
      const k = `${x.armazemId}|${x.produtoId}`;
      saldos.set(k, (saldos.get(k) || 0) + x.quantidade);
    });
    return { ordens: o.data, produtos: p.data, saldos };
  });

  const ordens = useMemo(() => dados?.ordens ?? [], [dados]);
  const contagem = useMemo(() => ({
    Todos: ordens.length,
    Pendente: ordens.filter(o => o.status === 'Pendente').length,
    'Em Separação': ordens.filter(o => o.status === 'Em Separação').length,
    Concluída: ordens.filter(o => o.status === 'Concluída').length,
  }), [ordens]);

  const filtradas = useMemo(() => ordens
    .filter(o => aba === 'Todos' || o.status === aba)
    .filter(o => contem(busca, o.codigo, o.solicitante?.nome, o.separador?.nome, ...o.itens.map(i => i.produto.nome)))
    .filter(o => {
      if (periodo === 'Todos') return true;
      const d = new Date(o.createdAt);
      if (periodo === 'Hoje') return d.toDateString() === new Date().toDateString();
      return d.getTime() >= agora - 7 * 86400000;
    })
    .sort((a, b) => {
      if (a.status !== 'Concluída' && b.status !== 'Concluída') {
        const p = (PESO_PRIORIDADE[b.prioridade] || 1) - (PESO_PRIORIDADE[a.prioridade] || 1);
        if (p) return p;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }), [ordens, aba, busca, periodo, agora]);

  async function acao(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast.success(ok); recarregar(true); } catch (e) { toast.error(msgErro(e)); }
  }

  const iniciar = (o: OrdemServico) => acao(() => api.put(`/wms/ordens/${o.id}/status`, { status: 'Em Separação', separadorId: usuario?.id }), `${o.codigo} em separação.`);
  async function pausar(o: OrdemServico) {
    if (await confirmar({ titulo: `Pausar ${o.codigo}?`, mensagem: 'A ordem volta para a fila de pendentes e pode ser assumida por outro operador.', confirmar: 'Pausar' }))
      acao(() => api.put(`/wms/ordens/${o.id}/pausar`), 'Ordem devolvida para a fila.');
  }
  async function excluir(o: OrdemServico) {
    if (await confirmar({ titulo: `Cancelar ${o.codigo}?`, mensagem: 'A ordem será excluída. Esta ação não pode ser desfeita.', confirmar: 'Excluir ordem', perigo: true }))
      acao(() => api.delete(`/wms/ordens/${o.id}`), 'Ordem excluída.');
  }

  if (carregando && !dados) return <Loading />;

  return (
    <>
      <PageHeader
        titulo="Ordens de separação"
        descricao="Retiradas, entradas e devoluções do armazém, com roteiro por endereço e conferência item a item."
        acoes={<button className="btn btn--primary" onClick={() => setEditar('nova')}><IoAddOutline /> Nova ordem</button>}
      />

      <div className="panel mb-16">
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <Segmented<Aba> valor={aba} onChange={setAba} opcoes={[
            { valor: 'Pendente', label: 'Pendentes', n: contagem.Pendente },
            { valor: 'Em Separação', label: 'Em execução', n: contagem['Em Separação'] },
            { valor: 'Concluída', label: 'Concluídas', n: contagem.Concluída },
            { valor: 'Todos', label: 'Todas', n: contagem.Todos },
          ]} />
          <SearchInput value={busca} onChange={setBusca} placeholder="Código, solicitante ou produto" />
          <select className="select" value={periodo} onChange={e => setPeriodo(e.target.value)} aria-label="Período">
            <option value="Todos">Todas as datas</option>
            <option value="Hoje">Criadas hoje</option>
            <option value="7">Últimos 7 dias</option>
          </select>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <div className="panel"><Empty titulo="Nenhuma ordem aqui">Crie uma nova ordem ou ajuste os filtros.</Empty></div>
      ) : (
        <div className="os-grid">
          {filtradas.map(o => {
            const unidades = o.itens.reduce((a, i) => a + i.quantidade, 0);
            const semSaldo = o.tipo === 'SAIDA' && o.status !== 'Concluída' && o.itens.some(i => (dados?.saldos.get(`${o.armazemId}|${i.produtoId}`) || 0) < i.quantidade);
            const duracao = o.iniciadaEm && o.concluidaEm ? Math.round((new Date(o.concluidaEm).getTime() - new Date(o.iniciadaEm).getTime()) / 60000) : null;
            return (
              <article key={o.id} className="os-card" data-status={o.status}>
                <div className="os-card__head">
                  <Code>{o.codigo}</Code>
                  <Badge tom={tomStatusOS(o.status)}>{o.status}</Badge>
                  {o.prioridade !== 'Normal' && <Badge tom={tomPrioridade(o.prioridade)} plain>{o.prioridade}</Badge>}
                  <span className="spacer" />
                  <Badge tom={o.tipo === 'SAIDA' ? 'bad' : o.tipo === 'ENTRADA' ? 'ok' : 'info'} plain>{TIPO_OS_LABEL[o.tipo] || o.tipo}</Badge>
                </div>
                <dl>
                  <dt>Solicitante</dt><dd>{o.solicitante?.nome}</dd>
                  <dt>Criada</dt><dd>{dataHora(o.createdAt)} <span className="muted">({haQuanto(o.createdAt)})</span></dd>
                  <dt>Itens</dt><dd>{o.itens.length} produto(s), {numero(unidades)} un</dd>
                  {o.armazem && <><dt>Armazém</dt><dd>{o.armazem.nome}</dd></>}
                  {o.separador && <><dt>{o.status === 'Concluída' ? 'Concluída por' : 'Operador'}</dt><dd>{o.separador.nome}</dd></>}
                  {o.status === 'Concluída' && <><dt>Concluída</dt><dd>{dataHora(o.concluidaEm || o.updatedAt)}{duracao !== null && <span className="muted"> em {duracao} min</span>}</dd></>}
                  {o.observacao && <><dt>Obs.</dt><dd>{o.observacao}</dd></>}
                </dl>
                {semSaldo && <Notice tom="warn">Há itens com saldo insuficiente no estoque.</Notice>}
                <div className="os-card__actions">
                  <button className="btn btn--sm" onClick={() => setVer(o)}><IoListOutline /> Roteiro</button>
                  {o.status === 'Pendente' && <>
                    <button className="btn btn--sm btn--primary" onClick={() => iniciar(o)}><IoPlayOutline /> Iniciar</button>
                    <button className="icon-btn" title="Editar" aria-label="Editar" onClick={() => setEditar(o)}><IoPencilOutline /></button>
                    <button className="icon-btn icon-btn--bad" title="Excluir" aria-label="Excluir" onClick={() => excluir(o)}><IoTrashOutline /></button>
                  </>}
                  {o.status === 'Em Separação' && <>
                    <button className="btn btn--sm btn--ok" onClick={() => setConferir(o)}><IoBarcodeOutline /> Conferir</button>
                    <button className="icon-btn" title="Imprimir lista (Zebra)" aria-label="Imprimir lista" onClick={() => imprimirZebra(o)}><IoPrintOutline /></button>
                    <button className="icon-btn" title="Pausar" aria-label="Pausar" onClick={() => pausar(o)}><IoPauseOutline /></button>
                  </>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {ver && (
        <Modal aberto onFechar={() => setVer(null)} titulo={`Roteiro ${ver.codigo}`} descricao="Itens ordenados pelo endereço para o menor percurso no armazém." tamanho="md"
          rodape={<><button className="btn" onClick={() => imprimirZebra(ver)}><IoPrintOutline /> Imprimir</button><button className="btn btn--primary" onClick={() => setVer(null)}>Fechar</button></>}>
          <table className="table">
            <thead><tr><th>Endereço</th><th>Produto e lotes (FEFO)</th><th className="num">Qtd.</th></tr></thead>
            <tbody>
              {porEndereco(ver.itens).map(i => (
                <tr key={i.id}>
                  <td><Loc>{i.produto.enderecoLocalizacao}</Loc></td>
                  <td><div className="cell-title">{i.produto.nome}</div><div className="cell-sub"><Code>{i.produto.sku}</Code></div><LotesSugeridos p={pickingVer[i.id]} /></td>
                  <td className="num"><b>{numero(i.quantidade)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      {editar && dados && usuario && (
        <ModalOrdem ordem={editar === 'nova' ? null : editar} produtos={dados.produtos} saldos={dados.saldos} solicitanteId={usuario.id} armazens={armazens} padraoId={padraoId}
          onFechar={() => setEditar(null)} onSalvo={() => { setEditar(null); recarregar(true); }} />
      )}
      {conferir && usuario && (
        <ModalConferencia ordem={conferir} usuarioId={usuario.id} onFechar={() => setConferir(null)} onConcluida={() => { setConferir(null); recarregar(true); }} />
      )}
    </>
  );
}

interface ItemCarrinho { produtoId: string; nome: string; sku: string; endereco?: string | null; quantidade: number }

function ModalOrdem({ ordem, produtos, saldos, solicitanteId, armazens, padraoId, onFechar, onSalvo }: {
  ordem: OrdemServico | null; produtos: Produto[]; saldos: Map<string, number>; solicitanteId: string; armazens: Armazem[]; padraoId: string; onFechar: () => void; onSalvo: () => void;
}) {
  const [armazemId, setArmazemId] = useState(ordem?.armazemId ?? padraoId);
  const [tipo, setTipo] = useState(ordem?.tipo ?? 'SAIDA');
  const [prioridade, setPrioridade] = useState(ordem?.prioridade ?? 'Normal');
  const [observacao, setObservacao] = useState(ordem?.observacao ?? '');
  const [qtd, setQtd] = useState('1');
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>(
    (ordem?.itens ?? []).map(i => ({ produtoId: i.produtoId, nome: i.produto.nome, sku: i.produto.sku, endereco: i.produto.enderecoLocalizacao, quantidade: i.quantidade })),
  );
  const [salvando, setSalvando] = useState(false);

  function adicionar(p: Produto) {
    const n = Math.max(1, Number(qtd) || 1);
    setCarrinho(c => {
      const ex = c.find(x => x.produtoId === p.id);
      if (ex) return c.map(x => (x.produtoId === p.id ? { ...x, quantidade: x.quantidade + n } : x));
      return [...c, { produtoId: p.id, nome: p.nome, sku: p.sku, endereco: p.enderecoLocalizacao, quantidade: n }];
    });
    setQtd('1');
  }

  async function salvar() {
    if (carrinho.length === 0) return toast.warn('Adicione ao menos um produto.');
    setSalvando(true);
    const payload = { solicitanteId, tipo, prioridade, observacao, armazemId: armazemId || undefined, itens: carrinho.map(c => ({ produtoId: c.produtoId, quantidade: c.quantidade })) };
    try {
      if (ordem) await api.put(`/wms/ordens/${ordem.id}`, payload); else await api.post('/wms/ordens', payload);
      toast.success(ordem ? 'Ordem atualizada.' : 'Ordem criada. Os operadores foram notificados.');
      onSalvo();
    } catch (e) { toast.error(msgErro(e)); } finally { setSalvando(false); }
  }

  return (
    <Modal aberto onFechar={onFechar} tamanho="lg" titulo={ordem ? `Editar ${ordem.codigo}` : 'Nova ordem de serviço'}
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : ordem ? 'Salvar alterações' : 'Criar ordem'}</button></>}>
      <div className="form-grid">
        {armazens.length > 1 && (
          <Field label="Armazém" className="col-12">
            <select className="select" value={armazemId} onChange={e => setArmazemId(e.target.value)}>
              {armazens.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </Field>
        )}
        <Field label="Finalidade" className="col-4">
          <select className="select" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="SAIDA">Saída (retirada)</option>
            <option value="ENTRADA">Entrada (recebimento)</option>
            <option value="DEVOLUCAO">Devolução (retorno)</option>
          </select>
        </Field>
        <Field label="Prioridade" className="col-4">
          <select className="select" value={prioridade} onChange={e => setPrioridade(e.target.value)}>
            <option value="Normal">Normal</option>
            <option value="Alta">Alta</option>
            <option value="Urgente">Urgente (imediato)</option>
          </select>
        </Field>
        <Field label="Observação" className="col-4"><input className="input" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex.: pedido do cliente X" /></Field>
        <div className="col-9"><ProdutoPicker produtos={produtos} onSelecionar={adicionar} autoFocus /></div>
        <div className="col-3"><input className="input" type="number" min={1} value={qtd} onChange={e => setQtd(e.target.value)} aria-label="Quantidade" /></div>
        {prioridade === 'Urgente' && <div className="col-12"><Notice tom="bad">Ordens urgentes aparecem no topo da fila e disparam notificação no app.</Notice></div>}
      </div>

      <div className="mt-16">
        {carrinho.length === 0 ? <Empty titulo="Nenhum item adicionado">Busque pelo nome, SKU ou leia o código de barras.</Empty> : (
          <table className="table">
            <thead><tr><th>Produto</th><th>Endereço</th><th className="num">Saldo</th><th className="num">Quantidade</th><th className="actions" /></tr></thead>
            <tbody>
              {carrinho.map(c => {
                const saldo = saldos.get(`${armazemId}|${c.produtoId}`) || 0;
                const falta = tipo === 'SAIDA' && saldo < c.quantidade;
                return (
                  <tr key={c.produtoId}>
                    <td><div className="cell-title">{c.nome}</div><div className="cell-sub"><Code>{c.sku}</Code></div></td>
                    <td><Loc>{c.endereco}</Loc></td>
                    <td className={`num qty ${falta ? 'qty--bad' : ''}`}>{numero(saldo)}{falta && <IoWarningOutline title="Saldo insuficiente" style={{ marginLeft: 4, verticalAlign: -2 }} />}</td>
                    <td className="num"><input className="input" style={{ width: 90, height: 32, textAlign: 'right', marginLeft: 'auto' }} type="number" min={1} value={c.quantidade}
                      onChange={e => setCarrinho(x => x.map(y => (y.produtoId === c.produtoId ? { ...y, quantidade: Math.max(1, Number(e.target.value) || 1) } : y)))} /></td>
                    <td className="actions"><button className="icon-btn icon-btn--bad" aria-label="Remover" onClick={() => setCarrinho(x => x.filter(y => y.produtoId !== c.produtoId))}><IoTrashOutline /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

/** Conferência (poka-yoke): todos os itens precisam ser marcados — por toque ou leitura do código de barras. */
function ModalConferencia({ ordem, usuarioId, onFechar, onConcluida }: { ordem: OrdemServico; usuarioId: string; onFechar: () => void; onConcluida: () => void }) {
  const itens = useMemo(() => porEndereco(ordem.itens), [ordem]);
  const picking = usePicking(ordem);
  const [marcados, setMarcados] = useState<string[]>(ordem.itens.filter(i => i.marcado).map(i => i.id));
  const [leitura, setLeitura] = useState('');
  const [concluindo, setConcluindo] = useState(false);
  const completo = marcados.length === itens.length;

  function alternar(id: string, valor?: boolean) {
    const novo = valor ?? !marcados.includes(id);
    setMarcados(m => (novo ? [...new Set([...m, id])] : m.filter(x => x !== id)));
    api.put(`/wms/ordens/${ordem.id}/itens/${id}`, { marcado: novo }).catch(() => {});
  }

  function ler() {
    const t = normalizar(leitura.trim());
    if (!t) return;
    const item = itens.find(i => normalizar(i.produto.codigoBarras) === t || normalizar(i.produto.sku) === t);
    if (!item) toast.error('Este código não pertence à ordem.');
    else if (marcados.includes(item.id)) toast.info('Item já conferido.');
    else { alternar(item.id, true); toast.success(`${item.produto.nome} conferido.`, { autoClose: 1200 }); }
    setLeitura('');
  }

  async function concluir() {
    setConcluindo(true);
    try {
      await api.post(`/wms/ordens/${ordem.id}/concluir`, { usuarioId });
      toast.success('Ordem concluída e estoque atualizado.');
      onConcluida();
    } catch (e) { toast.error(msgErro(e, 'Erro ao concluir a ordem.')); } finally { setConcluindo(false); }
  }

  return (
    <Modal aberto onFechar={onFechar} tamanho="md" titulo={`Conferência ${ordem.codigo}`} descricao="Marque cada item recolhido. A conclusão só libera com todos conferidos."
      rodape={<>
        <button className="btn" onClick={onFechar}>Voltar</button>
        <button className="btn btn--ok" disabled={!completo || concluindo} onClick={concluir}><IoCheckmarkDoneOutline /> {concluindo ? 'Concluindo…' : 'Concluir e baixar estoque'}</button>
      </>}>
      <div className="stack">
        <div className="row">
          <div className="progress" style={{ flex: 1 }}><i style={{ width: `${(marcados.length / itens.length) * 100}%` }} /></div>
          <b>{marcados.length} / {itens.length}</b>
        </div>
        <div className="input-icon">
          <IoBarcodeOutline />
          <input className="input" value={leitura} onChange={e => setLeitura(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ler(); } }}
            placeholder="Leia o código de barras ou digite o SKU e Enter" autoFocus aria-label="Leitura de código" />
        </div>
        <div className="checklist">
          {itens.map(i => (
            <button key={i.id} type="button" className="check-item" aria-pressed={marcados.includes(i.id)} onClick={() => alternar(i.id)}>
              <input type="checkbox" readOnly checked={marcados.includes(i.id)} tabIndex={-1} style={{ width: 20, height: 20, accentColor: 'var(--ok)' }} />
              <div>
                <div className="cell-title">{i.produto.nome}</div>
                <div className="cell-sub row" style={{ gap: 6 }}><Code>{i.produto.sku}</Code><Loc>{i.produto.enderecoLocalizacao}</Loc></div>
                <LotesSugeridos p={picking[i.id]} />
              </div>
              <span className="big">{numero(i.quantidade)}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

async function imprimirZebra(ordem: OrdemServico) {
  const janela = window.open('', '', 'width=400,height=600');
  if (!janela) return toast.error('Pop-up bloqueado pelo navegador.');
  const picking = await buscarPicking(ordem);
  const lotesTxt = (id: string) => (picking[id]?.partes || []).filter(p => p.lote).map(p => `LOTE ${p.lote}: ${p.quantidade}${p.validade ? ` (val ${dataUTC(p.validade)})` : ''}`).join('<br>');
  const titulo = ordem.tipo === 'ENTRADA' ? 'LISTA DE ENTRADA' : ordem.tipo === 'DEVOLUCAO' ? 'LISTA DE DEVOLUÇÃO' : 'LISTA DE PICKING';
  const d = new Date(ordem.createdAt);
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  janela.document.write(`<html><head><title>Zebra ${ordem.codigo}</title><style>
    @page { margin: 0; } body { font-family: 'Courier New', monospace; font-size: 12px; width: 75mm; margin: 0 auto; padding: 5mm 2mm; color: #000; }
    .h { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 10px; } .t { font-size: 16px; font-weight: bold; margin: 0; }
    .s { font-size: 11px; margin: 4px 0 0; } .p { font-weight: bold; font-size: 14px; margin-top: 5px; border: 1px solid #000; }
    .i { margin-bottom: 10px; border-bottom: 1px dashed #999; padding-bottom: 8px; page-break-inside: avoid; }
    .l1 { display: flex; justify-content: space-between; gap: 6px; } .b { width: 14px; height: 14px; border: 2px solid #000; flex-shrink: 0; }
    .n { font-weight: bold; flex: 1; } .q { font-weight: bold; font-size: 15px; white-space: nowrap; } .m { padding-left: 20px; font-size: 10px; }
    .loc { font-weight: bold; font-size: 13px; border: 1px solid #000; padding: 1px 4px; background: #eee; display: inline-block; margin-top: 2px; }
    .c { text-align: center; margin-top: 14px; font-size: 16px; letter-spacing: 2px; border: 1px solid #000; padding: 5px; } .f { text-align: center; font-size: 10px; margin-top: 10px; }
  </style></head><body>
    <div class="h"><p class="t">${titulo}</p><p class="s">ORDEM ${ordem.codigo} (${ordem.tipo})</p>${ordem.armazem ? `<p class="s">${esc(ordem.armazem.nome)}</p>` : ''}
    ${ordem.prioridade !== 'Normal' ? `<div class="p">PRIORIDADE: ${ordem.prioridade.toUpperCase()}</div>` : ''}
    <p class="s">Solicitante: ${esc(ordem.solicitante?.nome || '-')}</p><p class="s">${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
    ${ordem.observacao ? `<p class="s">Obs.: ${esc(ordem.observacao)}</p>` : ''}</div>
    ${porEndereco(ordem.itens).map(i => `<div class="i"><div class="l1"><span class="b"></span><span class="n">${esc(i.produto.nome)}</span><span class="q">${i.quantidade} un</span></div>
      <div class="m">SKU: ${esc(i.produto.sku)}<br><span class="loc">LOCAL: ${esc(i.produto.enderecoLocalizacao || 'Estoque geral')}</span>${lotesTxt(i.id) ? `<br><b>${lotesTxt(i.id)}</b>` : ''}</div></div>`).join('')}
    <div class="c">*${ordem.codigo}*</div><div class="f">ViaPro WMS</div>
    <script>window.onload=function(){window.print();window.close();}</script></body></html>`);
  janela.document.close();
}
