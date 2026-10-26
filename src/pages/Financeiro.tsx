import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { IoAddOutline, IoCheckmarkCircleOutline, IoPencilOutline, IoCloseCircleOutline, IoArrowUndoOutline, IoDownloadOutline, IoCardOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { contem, dataUTC, hojeISO, isoParaInput, moeda, numero, paraNumero } from '../lib/format';
import { exportarExcel } from '../lib/exportar';
import type { ContaBancaria, Fornecedor, Titulo } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Field, Kpi, Loading, Modal, Notice, PageHeader, Panel, SearchInput, Segmented, useDialogo } from '../components/ui';

type Tipo = 'PAGAR' | 'RECEBER';
type FiltroStatus = 'Aberto' | 'Vencido' | 'Pago' | 'Cancelado' | 'Todos';
interface Resumo { pagarAberto: number; receberAberto: number; pagarVencido: number; receberVencido: number; pagarVencidoQtd: number; receberVencidoQtd: number; pagar7dias: number; receber7dias: number }

const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const vencido = (t: Titulo) => t.status === 'Aberto' && new Date(String(t.vencimento).slice(0, 10) + 'T00:00:00') < hoje0();
function situacao(t: Titulo): { texto: string; tom: 'ok' | 'warn' | 'bad' | undefined } {
  if (t.status === 'Pago') return { texto: t.tipo === 'PAGAR' ? 'Pago' : 'Recebido', tom: 'ok' };
  if (t.status === 'Cancelado') return { texto: 'Cancelado', tom: undefined };
  if (vencido(t)) return { texto: 'Vencido', tom: 'bad' };
  return { texto: 'Em aberto', tom: 'warn' };
}
const FORMAS = ['Boleto', 'PIX', 'Transferência', 'Dinheiro', 'Cartão', 'Cheque'];

export default function Financeiro() {
  const { confirmar, pedirTexto } = useDialogo();
  const [tipo, setTipo] = useState<Tipo>('PAGAR');
  const [status, setStatus] = useState<FiltroStatus>('Aberto');
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState({ inicio: '', fim: '' });
  const [novo, setNovo] = useState<Titulo | 'novo' | null>(null);
  const [baixar, setBaixar] = useState<Titulo | null>(null);
  const [contas, setContas] = useState(false);

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [t, r, c, f, cat] = await Promise.all([
      api.get<Titulo[]>('/financeiro/titulos'), api.get<Resumo>('/financeiro/resumo'), api.get<ContaBancaria[]>('/financeiro/contas'),
      api.get<Fornecedor[]>('/fornecedores'), api.get<string[]>('/financeiro/categorias'),
    ]);
    return { titulos: t.data, resumo: r.data, contas: c.data, fornecedores: f.data, categorias: cat.data };
  });

  const doTipo = useMemo(() => (dados?.titulos ?? []).filter(t => t.tipo === tipo), [dados, tipo]);
  const linhas = useMemo(() => doTipo
    .filter(t => status === 'Todos' || (status === 'Vencido' ? vencido(t) : t.status === status))
    .filter(t => { const v = String(t.vencimento).slice(0, 10); return (!periodo.inicio || v >= periodo.inicio) && (!periodo.fim || v <= periodo.fim); })
    .filter(t => contem(busca, t.descricao, t.documento, t.pessoa, t.fornecedor?.nomeEmpresa, t.categoria)), [doTipo, status, periodo, busca]);
  const total = linhas.reduce((a, t) => a + (t.status === 'Pago' ? t.valorPago ?? t.valor : t.valor), 0);
  const r = dados?.resumo;
  const pagar = tipo === 'PAGAR';

  async function cancelar(t: Titulo) {
    const motivo = await pedirTexto({ titulo: `Cancelar "${t.descricao}"?`, mensagem: 'O título deixa de contar no fluxo de caixa.', confirmar: 'Cancelar título', perigo: true, pedirTexto: { label: 'Motivo', obrigatorio: true } });
    if (!motivo) return;
    try { await api.post(`/financeiro/titulos/${t.id}/cancelar`, { motivo }); toast.success('Título cancelado.'); recarregar(true); } catch (e) { toast.error(msgErro(e)); }
  }
  async function estornar(t: Titulo) {
    if (!(await confirmar({ titulo: 'Estornar a baixa?', mensagem: 'O título volta a ficar em aberto e o valor sai do saldo da conta.', confirmar: 'Estornar' }))) return;
    try { await api.post(`/financeiro/titulos/${t.id}/estornar`); toast.success('Baixa estornada.'); recarregar(true); } catch (e) { toast.error(msgErro(e)); }
  }

  const colunas: Col<Titulo>[] = [
    { key: 'v', titulo: 'Vencimento', ordenar: t => t.vencimento, render: t => <span className={vencido(t) ? 'down' : ''}>{dataUTC(t.vencimento)}</span> },
    { key: 'd', titulo: 'Descrição', principal: true, ordenar: t => t.descricao, render: t => (
      <><div className="cell-title">{t.descricao}{t.parcela && <span className="muted"> ({t.parcela})</span>}</div><div className="cell-sub">{[t.documento, t.categoria].filter(Boolean).join(' · ')}</div></>
    ) },
    { key: 'p', titulo: pagar ? 'Favorecido' : 'Cliente', ordenar: t => t.fornecedor?.nomeEmpresa || t.pessoa, render: t => t.fornecedor?.nomeEmpresa || t.pessoa || '-' },
    { key: 'val', titulo: 'Valor', align: 'right', ordenar: t => t.valor, render: t => <><b>{moeda(t.valor)}</b>{t.status === 'Pago' && t.valorPago != null && t.valorPago !== t.valor && <div className="cell-sub">baixado {moeda(t.valorPago)}</div>}</>, rodape: moeda(total) },
    { key: 's', titulo: 'Situação', ordenar: t => situacao(t).texto, render: t => <><Badge tom={situacao(t).tom}>{situacao(t).texto}</Badge>{t.status === 'Pago' && <div className="cell-sub">{dataUTC(t.dataPagamento)}{t.conta && ` · ${t.conta.nome}`}</div>}</> },
  ];

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Contas a pagar e receber" descricao="Títulos gerados pelo recebimento de compras e notas fiscais, além dos lançados manualmente."
        acoes={<>
          <button className="btn" onClick={() => setContas(true)}><IoCardOutline /> Contas bancárias</button>
          <button className="btn" onClick={() => exportarExcel(`Financeiro_${pagar ? 'Pagar' : 'Receber'}`, [{ nome: pagar ? 'A pagar' : 'A receber', linhas, colunas: [
            { titulo: 'Vencimento', valor: t => dataUTC(t.vencimento) }, { titulo: 'Descrição', valor: t => t.descricao, largura: 40 }, { titulo: 'Parcela', valor: t => t.parcela || '' },
            { titulo: 'Documento', valor: t => t.documento || '' }, { titulo: 'Categoria', valor: t => t.categoria || '' }, { titulo: pagar ? 'Favorecido' : 'Cliente', valor: t => t.fornecedor?.nomeEmpresa || t.pessoa || '', largura: 30 },
            { titulo: 'Valor', valor: t => t.valor }, { titulo: 'Situação', valor: t => situacao(t).texto }, { titulo: 'Pago em', valor: t => (t.dataPagamento ? dataUTC(t.dataPagamento) : '') }, { titulo: 'Valor pago', valor: t => t.valorPago ?? '' },
          ] }])}><IoDownloadOutline /> Excel</button>
          <button className="btn btn--primary" onClick={() => setNovo('novo')}><IoAddOutline /> Novo título</button>
        </>} />

      <div className="kpis">
        <Kpi label="A pagar em aberto" valor={moeda(r?.pagarAberto)} dica={`${moeda(r?.pagar7dias)} vencem em 7 dias`} onClick={() => { setTipo('PAGAR'); setStatus('Aberto'); }} />
        <Kpi label="Pagamentos vencidos" valor={moeda(r?.pagarVencido)} dica={`${r?.pagarVencidoQtd ?? 0} título(s)`} tom={r?.pagarVencido ? 'bad' : 'ok'} onClick={() => { setTipo('PAGAR'); setStatus('Vencido'); }} />
        <Kpi label="A receber em aberto" valor={moeda(r?.receberAberto)} dica={`${moeda(r?.receber7dias)} em 7 dias`} tom="primary" onClick={() => { setTipo('RECEBER'); setStatus('Aberto'); }} />
        <Kpi label="Recebimentos atrasados" valor={moeda(r?.receberVencido)} dica={`${r?.receberVencidoQtd ?? 0} título(s)`} tom={r?.receberVencido ? 'warn' : undefined} onClick={() => { setTipo('RECEBER'); setStatus('Vencido'); }} />
      </div>

      {dados && dados.contas.length === 0 && <div className="mb-16"><Notice tom="info" acao={<button className="btn btn--sm" onClick={() => setContas(true)}>Cadastrar conta</button>}>Cadastre ao menos uma conta (banco ou caixa) com o saldo atual para o fluxo de caixa ficar correto.</Notice></div>}

      <Panel flush>
        <div className="toolbar">
          <Segmented<Tipo> valor={tipo} onChange={setTipo} opcoes={[{ valor: 'PAGAR', label: 'A pagar' }, { valor: 'RECEBER', label: 'A receber' }]} />
          <Segmented<FiltroStatus> valor={status} onChange={setStatus} opcoes={[
            { valor: 'Aberto', label: 'Em aberto', n: doTipo.filter(t => t.status === 'Aberto').length },
            { valor: 'Vencido', label: 'Vencidos', n: doTipo.filter(vencido).length },
            { valor: 'Pago', label: pagar ? 'Pagos' : 'Recebidos' },
            { valor: 'Cancelado', label: 'Cancelados' },
            { valor: 'Todos', label: 'Todos' },
          ]} />
        </div>
        <div className="toolbar">
          <SearchInput value={busca} onChange={setBusca} placeholder="Descrição, documento, fornecedor, cliente ou categoria" />
          <input className="input" style={{ width: 'auto' }} type="date" value={periodo.inicio} onChange={e => setPeriodo({ ...periodo, inicio: e.target.value })} aria-label="Vencimento de" />
          <input className="input" style={{ width: 'auto' }} type="date" value={periodo.fim} onChange={e => setPeriodo({ ...periodo, fim: e.target.value })} aria-label="Vencimento até" />
        </div>
        <DataTable colunas={colunas} linhas={linhas} chave={t => t.id} ordemInicial={{ key: 'v', dir: 'asc' }} destaque={vencido}
          acoes={t => (
            <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
              {t.status === 'Aberto' && <button className="btn btn--sm btn--ok" onClick={() => setBaixar(t)}><IoCheckmarkCircleOutline /> {pagar ? 'Pagar' : 'Receber'}</button>}
              {t.status === 'Aberto' && <button className="icon-btn" aria-label="Editar" title="Editar" onClick={() => setNovo(t)}><IoPencilOutline /></button>}
              {t.status === 'Aberto' && <button className="icon-btn icon-btn--bad" aria-label="Cancelar" title="Cancelar" onClick={() => cancelar(t)}><IoCloseCircleOutline /></button>}
              {t.status === 'Pago' && <button className="btn btn--sm" onClick={() => estornar(t)}><IoArrowUndoOutline /> Estornar</button>}
            </div>
          )} />
      </Panel>

      {novo && dados && <ModalTitulo titulo={novo === 'novo' ? null : novo} tipo={tipo} fornecedores={dados.fornecedores} categorias={dados.categorias} onFechar={() => setNovo(null)} onSalvo={() => { setNovo(null); recarregar(true); }} />}
      {baixar && dados && <ModalBaixa titulo={baixar} contas={dados.contas} onFechar={() => setBaixar(null)} onSalvo={() => { setBaixar(null); recarregar(true); }} />}
      {contas && dados && <ModalContas contas={dados.contas} onFechar={() => setContas(false)} onAlterado={() => recarregar(true)} />}
    </>
  );
}

function ModalTitulo({ titulo, tipo, fornecedores, categorias, onFechar, onSalvo }: {
  titulo: Titulo | null; tipo: Tipo; fornecedores: Fornecedor[]; categorias: string[]; onFechar: () => void; onSalvo: () => void;
}) {
  const [f, setF] = useState({
    tipo: titulo?.tipo ?? tipo, descricao: titulo?.descricao ?? '', categoria: titulo?.categoria ?? (tipo === 'PAGAR' ? 'Fornecedores' : 'Vendas'),
    documento: titulo?.documento ?? '', fornecedorId: titulo?.fornecedorId ?? '', pessoa: titulo?.pessoa ?? '',
    valor: titulo ? String(titulo.valor).replace('.', ',') : '', vencimento: isoParaInput(titulo?.vencimento) || hojeISO(), parcelas: '1', intervaloDias: '30', observacao: titulo?.observacao ?? '',
  });
  const [salvando, setSalvando] = useState(false);
  const n = Math.max(1, Number(f.parcelas) || 1);
  const valor = paraNumero(f.valor);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f.descricao || valor <= 0) return toast.warn('Informe descrição e valor.');
    setSalvando(true);
    const payload = { ...f, valor, vencimento: `${f.vencimento}T12:00:00`, parcelas: n, intervaloDias: Number(f.intervaloDias) || 30, fornecedorId: f.fornecedorId || null };
    try {
      if (titulo) await api.put(`/financeiro/titulos/${titulo.id}`, payload); else await api.post('/financeiro/titulos', payload);
      toast.success(titulo ? 'Título atualizado.' : n > 1 ? `${n} parcelas lançadas.` : 'Título lançado.');
      onSalvo();
    } catch (err) { toast.error(msgErro(err)); } finally { setSalvando(false); }
  }

  return (
    <Modal aberto onFechar={onFechar} titulo={titulo ? 'Editar título' : 'Novo título'} tamanho="md"
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" form="form-titulo" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button></>}>
      <form id="form-titulo" onSubmit={salvar} className="form-grid">
        {!titulo && <div className="col-12"><Segmented<Tipo> valor={f.tipo} onChange={v => setF({ ...f, tipo: v, fornecedorId: v === 'RECEBER' ? '' : f.fornecedorId, categoria: ['Fornecedores', 'Vendas', ''].includes(f.categoria) ? (v === 'PAGAR' ? 'Fornecedores' : 'Vendas') : f.categoria })} opcoes={[{ valor: 'PAGAR', label: 'Conta a pagar' }, { valor: 'RECEBER', label: 'Conta a receber' }]} /></div>}
        <Field label="Descrição" className="col-8"><input className="input" required value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} placeholder={f.tipo === 'PAGAR' ? 'Ex.: Aluguel outubro' : 'Ex.: Venda farmácia X'} /></Field>
        <Field label="Categoria" className="col-4">
          <input className="input" list="cat-fin" value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })} />
          <datalist id="cat-fin">{categorias.map(c => <option key={c} value={c} />)}</datalist>
        </Field>
        {f.tipo === 'PAGAR' ? (
          <Field label="Fornecedor" className="col-6">
            <select className="select" value={f.fornecedorId} onChange={e => setF({ ...f, fornecedorId: e.target.value })}>
              <option value="">Outro (informar ao lado)</option>
              {fornecedores.map(x => <option key={x.id} value={x.id}>{x.nomeEmpresa}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label={f.tipo === 'PAGAR' ? 'Favorecido' : 'Cliente'} className={f.tipo === 'PAGAR' ? 'col-6' : 'col-12'}>
          <input className="input" value={f.pessoa} onChange={e => setF({ ...f, pessoa: e.target.value })} disabled={!!f.fornecedorId} placeholder={f.fornecedorId ? 'Usando o fornecedor' : 'Nome'} />
        </Field>
        <Field label="Documento" className="col-4"><input className="input" value={f.documento} onChange={e => setF({ ...f, documento: e.target.value })} placeholder="NF, boleto…" /></Field>
        <Field label={n > 1 ? 'Valor total' : 'Valor'} className="col-4"><input className="input" inputMode="decimal" required value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} placeholder="0,00" /></Field>
        <Field label={n > 1 ? '1º vencimento' : 'Vencimento'} className="col-4"><input className="input" type="date" required value={f.vencimento} onChange={e => setF({ ...f, vencimento: e.target.value })} /></Field>
        {!titulo && <>
          <Field label="Parcelas" className="col-4"><input className="input" type="number" min={1} max={60} value={f.parcelas} onChange={e => setF({ ...f, parcelas: e.target.value })} /></Field>
          <Field label="Intervalo (dias)" className="col-4"><input className="input" type="number" min={1} value={f.intervaloDias} onChange={e => setF({ ...f, intervaloDias: e.target.value })} disabled={n === 1} /></Field>
          <div className="col-4" style={{ display: 'flex', alignItems: 'flex-end' }}>{n > 1 && valor > 0 && <span className="muted">{n}× de {moeda(valor / n)}</span>}</div>
        </>}
        <Field label="Observação" className="col-12"><input className="input" value={f.observacao} onChange={e => setF({ ...f, observacao: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

function ModalBaixa({ titulo, contas, onFechar, onSalvo }: { titulo: Titulo; contas: ContaBancaria[]; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ valorPago: String(titulo.valor).replace('.', ','), dataPagamento: hojeISO(), contaId: contas.find(c => c.ativa)?.id ?? '', formaPagamento: 'PIX', observacao: '' });
  const pago = paraNumero(f.valorPago);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/financeiro/titulos/${titulo.id}/baixar`, { ...f, valorPago: pago, dataPagamento: `${f.dataPagamento}T12:00:00` });
      toast.success(titulo.tipo === 'PAGAR' ? 'Pagamento registrado.' : 'Recebimento registrado.');
      onSalvo();
    } catch (err) { toast.error(msgErro(err)); }
  }
  return (
    <Modal aberto onFechar={onFechar} titulo={titulo.tipo === 'PAGAR' ? 'Registrar pagamento' : 'Registrar recebimento'} descricao={`${titulo.descricao}${titulo.parcela ? ` (${titulo.parcela})` : ''}: ${moeda(titulo.valor)}, vence ${dataUTC(titulo.vencimento)}`} tamanho="sm"
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--ok" form="form-baixa">Confirmar</button></>}>
      <form id="form-baixa" onSubmit={salvar} className="form-grid">
        <Field label="Valor" className="col-6"><input className="input" inputMode="decimal" value={f.valorPago} onChange={e => setF({ ...f, valorPago: e.target.value })} /></Field>
        <Field label="Data" className="col-6"><input className="input" type="date" value={f.dataPagamento} onChange={e => setF({ ...f, dataPagamento: e.target.value })} /></Field>
        <Field label="Conta" className="col-6">
          <select className="select" value={f.contaId} onChange={e => setF({ ...f, contaId: e.target.value })}>
            <option value="">Não informar</option>
            {contas.filter(c => c.ativa).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Field>
        <Field label="Forma" className="col-6"><select className="select" value={f.formaPagamento} onChange={e => setF({ ...f, formaPagamento: e.target.value })}>{FORMAS.map(x => <option key={x}>{x}</option>)}</select></Field>
        {pago !== titulo.valor && pago > 0 && <div className="col-12"><Notice tom="info">{pago > titulo.valor ? `Acréscimo de ${moeda(pago - titulo.valor)} (juros/multa).` : `Desconto de ${moeda(titulo.valor - pago)}.`}</Notice></div>}
      </form>
    </Modal>
  );
}

function ModalContas({ contas, onFechar, onAlterado }: { contas: ContaBancaria[]; onFechar: () => void; onAlterado: () => void }) {
  const [nome, setNome] = useState('');
  const [saldo, setSaldo] = useState('');
  async function criar(e: FormEvent) {
    e.preventDefault();
    try { await api.post('/financeiro/contas', { nome, saldoInicial: paraNumero(saldo) }); setNome(''); setSaldo(''); toast.success('Conta cadastrada.'); onAlterado(); } catch (err) { toast.error(msgErro(err)); }
  }
  async function alternar(c: ContaBancaria) {
    try { await api.put(`/financeiro/contas/${c.id}`, { ativa: !c.ativa }); onAlterado(); } catch (err) { toast.error(msgErro(err)); }
  }
  return (
    <Modal aberto onFechar={onFechar} titulo="Contas bancárias e caixa" descricao="O saldo inicial é o saldo da conta no dia em que você começou a usar o financeiro." tamanho="md">
      <table className="table">
        <thead><tr><th>Conta</th><th className="num">Saldo inicial</th><th className="num">Saldo atual</th><th className="actions" /></tr></thead>
        <tbody>
          {contas.length === 0 && <tr><td colSpan={4} className="muted">Nenhuma conta cadastrada.</td></tr>}
          {contas.map(c => (
            <tr key={c.id}>
              <td><span className="cell-title">{c.nome}</span>{!c.ativa && <span className="muted"> (inativa)</span>}</td>
              <td className="num">{moeda(c.saldoInicial)}</td>
              <td className="num"><b>{moeda(c.saldoAtual)}</b></td>
              <td className="actions"><button className="btn btn--sm" onClick={() => alternar(c)}>{c.ativa ? 'Desativar' : 'Ativar'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={criar} className="form-grid mt-16">
        <Field label="Nova conta" className="col-6"><input className="input" required value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Banco do Brasil, Caixa da loja" /></Field>
        <Field label="Saldo inicial (R$)" className="col-4"><input className="input" inputMode="decimal" value={saldo} onChange={e => setSaldo(e.target.value)} placeholder="0,00" /></Field>
        <div className="col-2" style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn btn--primary btn--block"><IoAddOutline /> Adicionar</button></div>
      </form>
      <p className="muted mt-8" style={{ fontSize: 12.5 }}>{numero(contas.length)} conta(s). Baixas sem conta informada não alteram o saldo.</p>
    </Modal>
  );
}
