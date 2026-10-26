import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { IoAddOutline, IoDownloadOutline, IoDocumentTextOutline, IoPencilOutline, IoTrashOutline, IoArchiveOutline, IoBulbOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { contem, data, dataUTC, isoParaInput, moeda, numero, paraNumero } from '../lib/format';
import { exportarExcel, exportarPDF } from '../lib/exportar';
import { procedencia } from '../lib/regras';
import type { Fornecedor, PedidoCompra, Produto } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { SelectArmazem, useArmazens } from '../components/EstoqueModais';
import { Badge, Code, Field, Kpi, Loading, Modal, Notice, PageHeader, Panel, SearchInput, Segmented, useDialogo } from '../components/ui';

const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const atrasado = (p: PedidoCompra) => p.status === 'Pendente' && !!p.dataPrevisao && new Date(String(p.dataPrevisao).slice(0, 10) + 'T00:00:00') < hoje0();
function situacao(p: PedidoCompra): { texto: string; tom: 'ok' | 'warn' | 'bad' | 'info' } {
  if (p.status === 'Recebido') return { texto: 'Recebido', tom: 'ok' };
  if (p.status.startsWith('Recebido')) return { texto: 'Recebido c/ divergência', tom: 'info' };
  if (atrasado(p)) return { texto: 'Atrasado', tom: 'bad' };
  return { texto: 'Pendente', tom: 'warn' };
}

export default function Compras() {
  const { confirmar } = useDialogo();
  const [aba, setAba] = useState<'abertos' | 'recebidos' | 'todos'>('abertos');
  const [busca, setBusca] = useState('');
  const [editar, setEditar] = useState<PedidoCompra | 'novo' | null>(null);
  const [receber, setReceber] = useState<PedidoCompra | null>(null);

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [f, p, ped] = await Promise.all([api.get<Fornecedor[]>('/fornecedores'), api.get<Produto[]>('/produtos'), api.get<PedidoCompra[]>('/pedidos-compra')]);
    return { fornecedores: f.data, produtos: p.data, pedidos: ped.data };
  });

  const pedidos = useMemo(() => dados?.pedidos ?? [], [dados]);
  const filtrados = useMemo(() => pedidos
    .filter(p => aba === 'todos' || (aba === 'abertos' ? p.status === 'Pendente' : p.status !== 'Pendente'))
    .filter(p => contem(busca, p.codigo, p.fornecedor?.nomeEmpresa, p.produto?.nome, p.produto?.sku)), [pedidos, aba, busca]);

  const agora = new Date();
  const emTransito = pedidos.filter(p => p.status === 'Pendente').reduce((a, p) => a + p.custoTotal, 0);
  const atrasados = pedidos.filter(atrasado);
  const doMes = pedidos.filter(p => { const d = new Date(p.createdAt); return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear(); });
  const divergentes = pedidos.filter(p => p.divergencia);

  async function excluir(p: PedidoCompra) {
    if (!(await confirmar({ titulo: `Excluir ${p.codigo}?`, mensagem: 'O pedido será removido. Esta ação não pode ser desfeita.', confirmar: 'Excluir pedido', perigo: true }))) return;
    try { await api.delete(`/pedidos-compra/${p.id}`); toast.success('Pedido excluído.'); recarregar(true); } catch (e) { toast.error(msgErro(e)); }
  }

  const colunas: Col<PedidoCompra>[] = [
    { key: 'cod', titulo: 'Pedido', ordenar: p => p.codigo, render: p => <><Code>{p.codigo || '-'}</Code><div className="cell-sub">{data(p.createdAt)}</div></> },
    { key: 'prod', titulo: 'Produto', principal: true, ordenar: p => p.produto?.nome, render: p => <><div className="cell-title">{p.produto?.nome}</div><div className="cell-sub">{p.fornecedor?.nomeEmpresa}</div></> },
    { key: 'q', titulo: 'Qtd.', align: 'right', ordenar: p => p.quantidade, render: p => <>{numero(p.quantidade)}{p.quantidadeRecebida != null && p.quantidadeRecebida !== p.quantidade && <div className="cell-sub">recebido {numero(p.quantidadeRecebida)}</div>}</> },
    { key: 'v', titulo: 'Valor', align: 'right', ordenar: p => p.custoTotal, render: p => <b>{moeda(p.custoTotal)}</b>, rodape: moeda(filtrados.reduce((a, p) => a + p.custoTotal, 0)) },
    { key: 'prev', titulo: 'Previsão', ocultarCelular: true, ordenar: p => p.dataPrevisao || 'z', render: p => p.status === 'Pendente' ? dataUTC(p.dataPrevisao) : <span className="muted">Recebido {data(p.dataRecebimento)}</span> },
    { key: 'st', titulo: 'Situação', ordenar: p => situacao(p).texto, render: p => <><Badge tom={situacao(p).tom}>{situacao(p).texto}</Badge>{p.divergencia && <div className="cell-sub">{p.divergencia}</div>}</> },
  ];
  const exportCols = [
    { titulo: 'Código', valor: (p: PedidoCompra) => p.codigo || '-' }, { titulo: 'Data do pedido', valor: (p: PedidoCompra) => data(p.createdAt) },
    { titulo: 'Fornecedor', valor: (p: PedidoCompra) => p.fornecedor?.nomeEmpresa || '-', largura: 30 }, { titulo: 'Produto', valor: (p: PedidoCompra) => p.produto?.nome || '-', largura: 35 },
    { titulo: 'Quantidade', valor: (p: PedidoCompra) => p.quantidade }, { titulo: 'Recebido', valor: (p: PedidoCompra) => p.quantidadeRecebida ?? '' },
    { titulo: 'Custo total', valor: (p: PedidoCompra) => moeda(p.custoTotal) }, { titulo: 'Previsão', valor: (p: PedidoCompra) => dataUTC(p.dataPrevisao) },
    { titulo: 'Situação', valor: (p: PedidoCompra) => situacao(p).texto },
  ];

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Pedidos de compra" descricao="Emissão, acompanhamento de entrega e recebimento com conferência cega."
        acoes={<>
          <button className="btn" onClick={() => exportarExcel('Relatorio_Compras_ViaPro', [{ nome: 'Pedidos de compra', colunas: exportCols, linhas: filtrados }])}><IoDownloadOutline /> Excel</button>
          <button className="btn" onClick={() => exportarPDF({ arquivo: 'Relatorio_Compras_ViaPro', titulo: 'Pedidos de compra', paisagem: true, colunas: exportCols, linhas: filtrados })}><IoDocumentTextOutline /> PDF</button>
          <Link className="btn" to="/compras/sugestao"><IoBulbOutline /> Sugestão de compras</Link>
          <button className="btn btn--primary" onClick={() => setEditar('novo')}><IoAddOutline /> Emitir pedido</button>
        </>} />

      <div className="kpis">
        <Kpi label="Em trânsito" valor={moeda(emTransito)} dica={`${pedidos.filter(p => p.status === 'Pendente').length} pedidos em aberto`} tom="primary" />
        <Kpi label="Entregas atrasadas" valor={numero(atrasados.length)} dica={moeda(atrasados.reduce((a, p) => a + p.custoTotal, 0))} tom={atrasados.length ? 'bad' : 'ok'} />
        <Kpi label="Compras neste mês" valor={moeda(doMes.reduce((a, p) => a + p.custoTotal, 0))} dica={`${doMes.length} pedidos`} />
        <Kpi label="Recebimentos com divergência" valor={numero(divergentes.length)} tom={divergentes.length ? 'warn' : undefined} />
      </div>

      <Panel flush>
        <div className="toolbar">
          <Segmented valor={aba} onChange={setAba} opcoes={[
            { valor: 'abertos', label: 'Em aberto', n: pedidos.filter(p => p.status === 'Pendente').length },
            { valor: 'recebidos', label: 'Recebidos', n: pedidos.filter(p => p.status !== 'Pendente').length },
            { valor: 'todos', label: 'Todos', n: pedidos.length },
          ]} />
          <SearchInput value={busca} onChange={setBusca} placeholder="Código, fornecedor ou produto" />
        </div>
        <DataTable colunas={colunas} linhas={filtrados} chave={p => p.id} ordemInicial={{ key: 'cod', dir: 'desc' }}
          acoes={p => p.status === 'Pendente' ? (
            <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
              <button className="btn btn--sm btn--ok" onClick={() => setReceber(p)}><IoArchiveOutline /> Receber</button>
              <button className="icon-btn" aria-label="Editar" title="Editar" onClick={() => setEditar(p)}><IoPencilOutline /></button>
              <button className="icon-btn icon-btn--bad" aria-label="Excluir" title="Excluir" onClick={() => excluir(p)}><IoTrashOutline /></button>
            </div>
          ) : null} />
      </Panel>

      {editar && dados && <ModalPedido pedido={editar === 'novo' ? null : editar} fornecedores={dados.fornecedores} produtos={dados.produtos} onFechar={() => setEditar(null)} onSalvo={() => { setEditar(null); recarregar(true); }} />}
      {receber && <ModalReceber pedido={receber} onFechar={() => setReceber(null)} onSalvo={() => { setReceber(null); recarregar(true); }} />}
    </>
  );
}

function ModalPedido({ pedido, fornecedores, produtos, onFechar, onSalvo }: { pedido: PedidoCompra | null; fornecedores: Fornecedor[]; produtos: Produto[]; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({
    fornecedorId: pedido?.fornecedorId ?? '', produtoId: pedido?.produtoId ?? '', quantidade: pedido ? String(pedido.quantidade) : '',
    custoUnitario: pedido ? String((pedido.custoTotal / pedido.quantidade).toFixed(2)).replace('.', ',') : '', dataPrevisao: isoParaInput(pedido?.dataPrevisao), observacao: pedido?.observacao ?? '',
  });
  const [salvando, setSalvando] = useState(false);
  const total = (Number(f.quantidade) || 0) * paraNumero(f.custoUnitario);
  const ordenados = [...produtos].sort((a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome) : a.tipo === 'MATERIA_PRIMA' ? -1 : 1));

  function escolherProduto(id: string) {
    const p = produtos.find(x => x.id === id);
    setF(s => ({ ...s, produtoId: id, fornecedorId: s.fornecedorId || p?.fornecedorId || '', custoUnitario: s.custoUnitario || (p?.precoCusto ? String(p.precoCusto).replace('.', ',') : '') }));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f.fornecedorId || !f.produtoId || !Number(f.quantidade)) return toast.warn('Selecione fornecedor, produto e quantidade.');
    setSalvando(true);
    const payload = { fornecedorId: f.fornecedorId, produtoId: f.produtoId, quantidade: Number(f.quantidade), custoTotal: total, dataPrevisao: f.dataPrevisao ? `${f.dataPrevisao}T00:00:00.000Z` : null, observacao: f.observacao };
    try {
      if (pedido) await api.put(`/pedidos-compra/${pedido.id}`, payload); else await api.post('/pedidos-compra', payload);
      toast.success(pedido ? 'Pedido atualizado.' : 'Pedido emitido. O fornecedor recebe o e-mail quando o envio estiver configurado.');
      onSalvo();
    } catch (err) { toast.error(msgErro(err)); } finally { setSalvando(false); }
  }

  return (
    <Modal aberto onFechar={onFechar} titulo={pedido ? `Editar ${pedido.codigo}` : 'Emitir pedido de compra'} tamanho="md"
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" form="form-pedido" disabled={salvando}>{salvando ? 'Salvando…' : pedido ? 'Salvar pedido' : 'Emitir pedido'}</button></>}>
      <form id="form-pedido" onSubmit={salvar} className="form-grid">
        <Field label="Produto" className="col-12">
          <select className="select" value={f.produtoId} onChange={e => escolherProduto(e.target.value)} required>
            <option value="">Selecione…</option>
            {ordenados.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.sku}, {procedencia(p.tipo).toLowerCase()})</option>)}
          </select>
        </Field>
        <Field label="Fornecedor" className="col-12">
          <select className="select" value={f.fornecedorId} onChange={e => setF({ ...f, fornecedorId: e.target.value })} required>
            <option value="">Selecione…</option>
            {fornecedores.map(x => <option key={x.id} value={x.id}>{x.nomeEmpresa}</option>)}
          </select>
        </Field>
        <Field label="Quantidade" className="col-4"><input className="input" type="number" min={1} value={f.quantidade} onChange={e => setF({ ...f, quantidade: e.target.value })} required /></Field>
        <Field label="Custo unitário (R$)" className="col-4"><input className="input" inputMode="decimal" value={f.custoUnitario} onChange={e => setF({ ...f, custoUnitario: e.target.value })} placeholder="0,00" /></Field>
        <Field label="Previsão de entrega" className="col-4"><input className="input" type="date" value={f.dataPrevisao} onChange={e => setF({ ...f, dataPrevisao: e.target.value })} /></Field>
        <Field label="Observação" className="col-12"><input className="input" value={f.observacao} onChange={e => setF({ ...f, observacao: e.target.value })} placeholder="Condição de pagamento, frete…" /></Field>
        <div className="col-12"><Notice tom="info">Total do pedido: <b>{moeda(total)}</b></Notice></div>
      </form>
    </Modal>
  );
}

function ModalReceber({ pedido, onFechar, onSalvo }: { pedido: PedidoCompra; onFechar: () => void; onSalvo: () => void }) {
  const { usuario } = useAuth();
  const { armazens, padraoId } = useArmazens();
  const [armazemId, setArmazemId] = useState('');
  const [lote, setLote] = useState('');
  const [validade, setValidade] = useState('');
  const [nf, setNf] = useState('');
  const [gerarTitulo, setGerarTitulo] = useState(true);
  const prazo = pedido.fornecedor?.prazoPagamentoDias ?? 30;
  const [vencimento, setVencimento] = useState(new Date(Date.now() + prazo * 86400000).toLocaleDateString('sv-SE'));
  const [parcelas, setParcelas] = useState('1');
  const [cega, setCega] = useState(true);
  const [qtd, setQtd] = useState('');
  const [obs, setObs] = useState('');
  const [atualizarCusto, setAtualizarCusto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const n = qtd === '' ? null : Number(qtd);
  const diverge = n !== null && n !== pedido.quantidade;

  async function receber(e: FormEvent) {
    e.preventDefault();
    if (n === null || n < 0) return toast.warn('Informe a quantidade contada no recebimento.');
    setSalvando(true);
    try {
      const { data } = await api.put(`/pedidos-compra/${pedido.id}/receber`, {
        usuarioId: usuario?.id, quantidadeRecebida: n, observacao: obs, atualizarCusto, armazemId: armazemId || padraoId || undefined,
        lote: lote || undefined, validade: validade || undefined, notaFiscal: nf || undefined,
        gerarTitulo, vencimento: `${vencimento}T12:00:00`, parcelas: Number(parcelas) || 1,
      });
      toast[data.divergencia ? 'warn' : 'success'](data.divergencia ? `Recebido com divergência: ${data.divergencia}.` : 'Mercadoria recebida e estoque atualizado.');
      onSalvo();
    } catch (err) { toast.error(msgErro(err)); } finally { setSalvando(false); }
  }

  return (
    <Modal aberto onFechar={onFechar} titulo={`Receber ${pedido.codigo}`} descricao={`${pedido.produto?.nome} de ${pedido.fornecedor?.nomeEmpresa}`} tamanho="md"
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--ok" form="form-receber" disabled={salvando}>{salvando ? 'Registrando…' : 'Confirmar recebimento'}</button></>}>
      <form id="form-receber" onSubmit={receber} className="form-grid">
        <div className="col-12"><label className="check"><input type="checkbox" checked={cega} onChange={e => setCega(e.target.checked)} /> Conferência cega (esconder a quantidade do pedido)</label></div>
        {!cega && <div className="col-12"><Notice tom="info">Quantidade pedida: <b>{numero(pedido.quantidade)}</b></Notice></div>}
        <Field label="Quantidade contada na doca" className="col-6"><input className="input input--lg" type="number" min={0} value={qtd} onChange={e => setQtd(e.target.value)} required autoFocus /></Field>
        <Field label="Observação" className="col-6"><input className="input input--lg" style={{ fontSize: 15, fontWeight: 400 }} value={obs} onChange={e => setObs(e.target.value)} placeholder="NF, transportadora…" /></Field>
        <SelectArmazem armazens={armazens} value={armazemId || padraoId} onChange={setArmazemId} label="Armazém de destino" className="col-6" />
        <Field label="Nota fiscal" className="col-6"><input className="input" value={nf} onChange={e => setNf(e.target.value)} placeholder="Nº da NF" /></Field>
        <Field label="Lote" className="col-6"><input className="input" value={lote} onChange={e => setLote(e.target.value.toUpperCase())} placeholder="Sem lote" /></Field>
        <Field label="Validade" className="col-6"><input className="input" type="date" value={validade} onChange={e => setValidade(e.target.value)} /></Field>
        <div className="form-section">Financeiro</div>
        <div className="col-12"><label className="check"><input type="checkbox" checked={gerarTitulo} onChange={e => setGerarTitulo(e.target.checked)} /> Lançar no contas a pagar (valor proporcional ao recebido)</label></div>
        {gerarTitulo && <>
          <Field label="1º vencimento" className="col-6" dica={`Prazo do fornecedor: ${prazo} dias`}><input className="input" type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} /></Field>
          <Field label="Parcelas" className="col-6"><input className="input" type="number" min={1} max={24} value={parcelas} onChange={e => setParcelas(e.target.value)} /></Field>
        </>}
        <div className="col-12"><label className="check"><input type="checkbox" checked={atualizarCusto} onChange={e => setAtualizarCusto(e.target.checked)} /> Atualizar o custo do produto com o custo deste pedido ({moeda(pedido.custoTotal / pedido.quantidade)}/un)</label></div>
        {!cega && diverge && <div className="col-12"><Notice tom="warn">A quantidade difere do pedido. A divergência será registrada e somente o contado entra no estoque.</Notice></div>}
      </form>
    </Modal>
  );
}
