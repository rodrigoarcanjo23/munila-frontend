/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'react-toastify';
import {
  IoArrowDownCircleOutline, IoArrowUpCircleOutline, IoRepeatOutline, IoAddCircleOutline, IoRemoveCircleOutline, IoHandRightOutline,
  IoWarningOutline, IoReturnDownBackOutline,
} from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { dataUTC, numero } from '../lib/format';
import { rotuloLote } from '../lib/regras';
import type { Armazem, Estoque as EstoqueT, Produto } from '../lib/tipos';
import { ProdutoPicker } from './ProdutoPicker';
import { Badge, Code, Field, Modal, Notice } from './ui';

/** Lista de armazéns (com cache simples por sessão de tela). */
export function useArmazens() {
  const [armazens, setArmazens] = useState<Armazem[]>([]);
  useEffect(() => { api.get<Armazem[]>('/armazens').then(r => setArmazens(r.data)).catch(() => {}); }, []);
  const padrao = armazens.find(a => a.padrao) ?? armazens[0];
  return { armazens, padraoId: padrao?.id ?? '' };
}

export function SelectArmazem({ armazens, value, onChange, todos, label = 'Armazém', className }: {
  armazens: Armazem[]; value: string; onChange: (v: string) => void; todos?: boolean; label?: string; className?: string;
}) {
  return (
    <Field label={label} className={className}>
      <select className="select" value={value} onChange={e => onChange(e.target.value)}>
        {todos && <option value="">Todos os armazéns</option>}
        {armazens.map(a => <option key={a.id} value={a.id}>{a.nome}{a.padrao ? ' (padrão)' : ''}</option>)}
      </select>
    </Field>
  );
}

export interface LoteDisp { estoqueId: string; lote: string | null; validade: string | null; quantidade: number; endereco?: string | null }

/** Lotes disponíveis de um produto num armazém, na ordem FEFO. */
export function useLotes(produtoId?: string, armazemId?: string) {
  const chave = produtoId && armazemId ? `${produtoId}|${armazemId}` : null;
  const [estado, setEstado] = useState<{ chave: string | null; lotes: LoteDisp[] }>({ chave: null, lotes: [] });
  useEffect(() => {
    if (!chave) return;
    api.get<LoteDisp[]>(`/estoque/lotes?produtoId=${produtoId}&armazemId=${armazemId}`)
      .then(r => setEstado({ chave, lotes: r.data })).catch(() => setEstado({ chave, lotes: [] }));
  }, [chave, produtoId, armazemId]);
  return chave && estado.chave === chave ? estado.lotes : [];
}

/** Entrada de mercadoria com armazém, lote e validade. */
export function ModalEntrada({ produtos, armazens, padraoId, onFechar, onSalvo }: {
  produtos: Produto[]; armazens: Armazem[]; padraoId: string; onFechar: () => void; onSalvo: () => void;
}) {
  const [produto, setProduto] = useState<Produto | null>(null);
  const [f, setF] = useState({ armazemId: padraoId, lote: '', validade: '', quantidade: '', tipoAcao: 'Entrada de mercadoria', observacao: '' });
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!produto) return toast.warn('Escolha o produto.');
    if (!(Number(f.quantidade) > 0)) return toast.warn('Informe a quantidade.');
    setSalvando(true);
    try {
      const { data } = await api.post('/estoque/entrada', { ...f, produtoId: produto.id, quantidade: Number(f.quantidade), validade: f.validade || null });
      toast.success(`Entrada ${data.codigo} registrada.`);
      onSalvo();
    } catch (err) { toast.error(msgErro(err)); } finally { setSalvando(false); }
  }

  return (
    <Modal aberto onFechar={onFechar} titulo="Entrada de mercadoria" descricao="Registra saldo novo em um armazém, com lote e validade." tamanho="md"
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" form="form-entrada" disabled={salvando}>{salvando ? 'Registrando…' : 'Registrar entrada'}</button></>}>
      <form id="form-entrada" onSubmit={salvar} className="form-grid">
        <div className="col-12">
          {produto
            ? <div className="row"><b style={{ flex: 1 }}>{produto.nome}</b><Code>{produto.sku}</Code><button type="button" className="btn btn--sm" onClick={() => setProduto(null)}>Trocar</button></div>
            : <ProdutoPicker produtos={produtos} onSelecionar={p => { setProduto(p); setF(s => ({ ...s, lote: s.lote || p.lote || '' })); }} autoFocus />}
        </div>
        <SelectArmazem armazens={armazens} value={f.armazemId} onChange={v => setF({ ...f, armazemId: v })} className="col-6" />
        <Field label="Tipo" className="col-6">
          <select className="select" value={f.tipoAcao} onChange={e => setF({ ...f, tipoAcao: e.target.value })}>
            <option>Entrada de mercadoria</option><option>Devolução VIAPRO</option><option>Ajuste de Entrada de Inventário</option>
          </select>
        </Field>
        <Field label="Lote" className="col-4"><input className="input" value={f.lote} onChange={e => setF({ ...f, lote: e.target.value.toUpperCase() })} placeholder="Sem lote" /></Field>
        <Field label="Validade" className="col-4"><input className="input" type="date" value={f.validade} onChange={e => setF({ ...f, validade: e.target.value })} /></Field>
        <Field label="Quantidade" className="col-4"><input className="input" type="number" min={1} value={f.quantidade} onChange={e => setF({ ...f, quantidade: e.target.value })} required /></Field>
        <Field label="Observação" className="col-12"><input className="input" value={f.observacao} onChange={e => setF({ ...f, observacao: e.target.value })} placeholder="NF, motivo…" /></Field>
      </form>
    </Modal>
  );
}

/** Transferência entre armazéns (FEFO na origem, mantém lote e validade). */
export function ModalTransferencia({ produtos, armazens, inicial, onFechar, onSalvo }: {
  produtos: Produto[]; armazens: Armazem[]; inicial?: { produto?: Produto; origemId?: string; lote?: string | null };
  onFechar: () => void; onSalvo: () => void;
}) {
  const [produto, setProduto] = useState<Produto | null>(inicial?.produto ?? null);
  const [origemId, setOrigemId] = useState(inicial?.origemId ?? armazens.find(a => a.padrao)?.id ?? armazens[0]?.id ?? '');
  const [destinoId, setDestinoId] = useState(armazens.find(a => a.id !== (inicial?.origemId ?? armazens.find(x => x.padrao)?.id))?.id ?? '');
  const [lote, setLote] = useState(inicial?.lote ?? '');
  const [quantidade, setQuantidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const lotes = useLotes(produto?.id, origemId);
  const disponivel = lote ? lotes.filter(l => (l.lote ?? '') === lote).reduce((a, l) => a + l.quantidade, 0) : lotes.reduce((a, l) => a + l.quantidade, 0);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!produto) return toast.warn('Escolha o produto.');
    setSalvando(true);
    try {
      const { data } = await api.post('/estoque/transferencia', { produtoId: produto.id, origemId, destinoId, lote: lote || undefined, quantidade: Number(quantidade), observacao });
      toast.success(`Transferência ${data.codigo} registrada.`);
      onSalvo();
    } catch (err) { toast.error(msgErro(err)); } finally { setSalvando(false); }
  }

  return (
    <Modal aberto onFechar={onFechar} titulo="Transferir entre armazéns" descricao="Sai da origem pelo lote que vence primeiro (ou pelo lote escolhido) e entra no destino com o mesmo lote e validade." tamanho="md"
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" form="form-transf" disabled={salvando || !produto || origemId === destinoId}>{salvando ? 'Transferindo…' : 'Transferir'}</button></>}>
      <form id="form-transf" onSubmit={salvar} className="form-grid">
        <div className="col-12">
          {produto
            ? <div className="row"><b style={{ flex: 1 }}>{produto.nome}</b><Code>{produto.sku}</Code>{!inicial?.produto && <button type="button" className="btn btn--sm" onClick={() => setProduto(null)}>Trocar</button>}</div>
            : <ProdutoPicker produtos={produtos} onSelecionar={setProduto} autoFocus />}
        </div>
        <SelectArmazem armazens={armazens} value={origemId} onChange={v => { setOrigemId(v); setLote(''); }} label="Origem" className="col-6" />
        <SelectArmazem armazens={armazens} value={destinoId} onChange={setDestinoId} label="Destino" className="col-6" />
        <Field label="Lote" className="col-6">
          <select className="select" value={lote} onChange={e => setLote(e.target.value)}>
            <option value="">Automático (vence primeiro)</option>
            {lotes.filter(l => l.lote).map(l => <option key={l.estoqueId} value={l.lote!}>{l.lote} · {numero(l.quantidade)} un · val. {dataUTC(l.validade)}</option>)}
          </select>
        </Field>
        <Field label="Quantidade" className="col-6" dica={produto ? `Disponível na origem: ${numero(disponivel)}` : undefined}>
          <input className="input" type="number" min={1} max={disponivel || undefined} value={quantidade} onChange={e => setQuantidade(e.target.value)} required />
        </Field>
        <Field label="Observação" className="col-12"><input className="input" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Motivo da transferência" /></Field>
        {origemId === destinoId && <div className="col-12"><Notice tom="warn">Origem e destino precisam ser diferentes.</Notice></div>}
        {produto && lotes.length > 0 && (
          <div className="col-12">
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Lotes na origem (ordem de saída)</div>
            <div className="row">{lotes.map((l, i) => <Badge key={l.estoqueId} tom={i === 0 ? 'primary' : undefined} plain>{rotuloLote(l.lote)} · {numero(l.quantidade)} · {dataUTC(l.validade)}</Badge>)}</div>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------ movimentação de uma linha (demonstração, avaria, retorno…)
export const OPERACOES: { valor: string; label: string; dica: string; icone: ReactNode; tom: 'in' | 'out' | 'neutral'; status?: string[] }[] = [
  { valor: 'Entrada de mercadoria', label: 'Entrada', dica: 'Recebimento avulso', icone: <IoArrowDownCircleOutline />, tom: 'in' },
  { valor: 'Devolução VIAPRO', label: 'Devolução VIAPRO', dica: 'Retorno da indústria', icone: <IoRepeatOutline />, tom: 'in' },
  { valor: 'Ajuste de Entrada de Inventário', label: 'Ajuste (+)', dica: 'Correção de contagem', icone: <IoAddCircleOutline />, tom: 'neutral' },
  { valor: 'Saída de mercadoria', label: 'Saída', dica: 'Retirada avulsa', icone: <IoArrowUpCircleOutline />, tom: 'out' },
  { valor: 'Saída para demonstração', label: 'Demonstração', dica: 'Fica sob sua responsabilidade', icone: <IoHandRightOutline />, tom: 'out' },
  { valor: 'Ajuste de Saída de Inventário', label: 'Ajuste (−)', dica: 'Correção de contagem', icone: <IoRemoveCircleOutline />, tom: 'neutral' },
  { valor: 'Perdas/Avarias', label: 'Perda / avaria', dica: 'Vai para o painel de perdas', icone: <IoWarningOutline />, tom: 'out' },
  { valor: 'Retorno de demonstração', label: 'Retorno de demonstração', dica: 'Volta ao saldo disponível', icone: <IoReturnDownBackOutline />, tom: 'in', status: ['Em Demonstração'] },
];
const SOMA = ['Entrada de mercadoria', 'Devolução VIAPRO', 'Ajuste de Entrada de Inventário'];

export function ModalMovimento({ item, usuarioId, onFechar, onSalvo }: { item: EstoqueT; usuarioId: string; onFechar: () => void; onSalvo: () => void }) {
  const opcoes = OPERACOES.filter(o => !o.status || o.status.includes(item.status));
  const [tipo, setTipo] = useState(item.status === 'Em Demonstração' ? 'Retorno de demonstração' : 'Entrada de mercadoria');
  const [qtd, setQtd] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const n = Number(qtd) || 0;
  const saldoDepois = SOMA.includes(tipo) ? item.quantidade + n : item.quantidade - n;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (n <= 0) return toast.warn('Informe uma quantidade válida.');
    setSalvando(true);
    try {
      await api.post('/movimentacoes/operacao', { produtoId: item.produtoId, usuarioId, estoqueId: item.id, quantidade: n, tipoAcao: tipo, observacao: obs });
      toast.success('Movimentação registrada.');
      onSalvo();
    } catch (err) {
      toast.error(msgErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto onFechar={onFechar} tamanho="md" titulo="Movimentar estoque"
      descricao={<>{item.produto.nome} · saldo {item.status.toLowerCase()}: <b>{numero(item.quantidade)}</b></>}
      rodape={<>
        <button className="btn" onClick={onFechar}>Cancelar</button>
        <button className="btn btn--primary" form="form-mov" disabled={salvando}>{salvando ? 'Registrando…' : 'Registrar movimentação'}</button>
      </>}
    >
      <form id="form-mov" onSubmit={salvar} className="stack">
        <div className="tiles" role="group" aria-label="Tipo de movimentação">
          {opcoes.map(o => (
            <button type="button" key={o.valor} className="tile" data-tone={o.tom} aria-pressed={tipo === o.valor} onClick={() => setTipo(o.valor)}>
              {o.icone}{o.label}<small>{o.dica}</small>
            </button>
          ))}
        </div>
        <div className="form-grid">
          <Field label="Quantidade" className="col-4">
            <input className="input input--lg" type="number" min={1} inputMode="numeric" value={qtd} onChange={e => setQtd(e.target.value)} required autoFocus />
          </Field>
          <Field label="Motivo ou observação" className="col-8">
            <input className="input input--lg" style={{ fontSize: 15, fontWeight: 400 }} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: devolução de cliente, erro de contagem" />
          </Field>
        </div>
        {n > 0 && (
          <Notice tom={saldoDepois < 0 ? 'bad' : 'info'}>
            {saldoDepois < 0 ? 'Quantidade maior que o saldo desta linha.' : <>Saldo desta linha após a operação: <b>{numero(saldoDepois)}</b></>}
          </Notice>
        )}
      </form>
    </Modal>
  );
}

/** Ordem de produção interna pela receita (composição) do produto. */
export function ModalProducao({ produtos, estoque, usuarioId, armazens, armazemInicial, onFechar, onSalvo }: {
  produtos: Produto[]; estoque: EstoqueT[]; usuarioId: string; armazens: Armazem[]; armazemInicial: string; onFechar: () => void; onSalvo: () => void;
}) {
  const [armazemId, setArmazemId] = useState(armazemInicial);
  const [lote, setLote] = useState('');
  const [validade, setValidade] = useState('');
  const [produtoId, setProdutoId] = useState('');
  const [qtd, setQtd] = useState('1');
  const [salvando, setSalvando] = useState(false);
  const comReceita = produtos.filter(p => p.tipo === 'ACABADO').sort((a, b) => a.nome.localeCompare(b.nome));
  const produto = produtos.find(p => p.id === produtoId);
  const n = Number(qtd) || 0;
  const saldo = (id: string) => estoque.filter(e => e.produtoId === id && e.status === 'Disponível' && (!armazemId || e.armazemId === armazemId)).reduce((a, e) => a + e.quantidade, 0);
  const necessidades = (produto?.ingredientes || []).map(i => ({
    nome: i.produtoFilho?.nome || '-', sku: i.produtoFilho?.sku || '-', necessario: i.quantidade * n, disponivel: saldo(i.produtoFilhoId),
  }));
  const falta = necessidades.some(x => x.disponivel < x.necessario);

  async function executar(e: FormEvent) {
    e.preventDefault();
    if (!produtoId) return toast.warn('Selecione o produto que deseja fabricar.');
    if (n <= 0) return toast.warn('A quantidade deve ser maior que zero.');
    setSalvando(true);
    try {
      const r = await api.post('/producao/executar', { produtoFinalId: produtoId, quantidadeProduzir: n, usuarioId, armazemId, lote: lote || undefined, validade: validade || undefined });
      toast.success(r.data.mensagem || 'Lote produzido. Matéria-prima baixada.');
      onSalvo();
    } catch (err) {
      toast.error(msgErro(err, 'Erro ao executar produção.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto onFechar={onFechar} tamanho="md" titulo="Ordem de produção interna"
      descricao="O sistema baixa as matérias-primas conforme a receita cadastrada no produto e dá entrada no produto acabado."
      rodape={<>
        <button className="btn" onClick={onFechar}>Cancelar</button>
        <button className="btn btn--primary" form="form-prod" disabled={salvando || falta || !produto?.ingredientes?.length}>{salvando ? 'Produzindo…' : 'Executar produção'}</button>
      </>}
    >
      <form id="form-prod" onSubmit={executar} className="stack">
        <div className="form-grid">
          <Field label="Produto final" className="col-8">
            <select className="select" value={produtoId} onChange={e => setProdutoId(e.target.value)} required>
              <option value="">Selecione…</option>
              {comReceita.map(p => <option key={p.id} value={p.id}>[{p.sku}] {p.nome}{p.ingredientes?.length ? '' : ' (sem receita)'}</option>)}
            </select>
          </Field>
          <Field label="Quantidade a produzir" className="col-4">
            <input className="input" type="number" min={1} value={qtd} onChange={e => setQtd(e.target.value)} required />
          </Field>
          <SelectArmazem armazens={armazens} value={armazemId} onChange={setArmazemId} className="col-4" />
          <Field label="Lote do produto final" className="col-4"><input className="input" value={lote} onChange={e => setLote(e.target.value.toUpperCase())} placeholder="Opcional" /></Field>
          <Field label="Validade" className="col-4"><input className="input" type="date" value={validade} onChange={e => setValidade(e.target.value)} /></Field>
        </div>
        {produto && !produto.ingredientes?.length && <Notice tom="warn">Este produto não tem receita. Cadastre a receita em Produtos → Editar.</Notice>}
        {necessidades.length > 0 && (
          <table className="table">
            <thead><tr><th>Matéria-prima</th><th className="num">Necessário</th><th className="num">Disponível</th></tr></thead>
            <tbody>
              {necessidades.map(x => (
                <tr key={x.sku}>
                  <td><div className="cell-title">{x.nome}</div><div className="cell-sub"><Code>{x.sku}</Code></div></td>
                  <td className="num">{numero(x.necessario)}</td>
                  <td className={`num qty ${x.disponivel < x.necessario ? 'qty--bad' : 'qty--ok'}`}>{numero(x.disponivel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {falta && <Notice tom="bad">Saldo insuficiente de matéria-prima para esta quantidade.</Notice>}
      </form>
    </Modal>
  );
}
