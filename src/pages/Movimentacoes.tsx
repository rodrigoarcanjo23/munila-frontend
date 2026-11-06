import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  IoAddCircleOutline, IoArrowDownCircleOutline, IoArrowUpCircleOutline, IoCheckmarkCircle, IoConstructOutline, IoDocumentTextOutline,
  IoGitCompareOutline, IoRemoveCircleOutline, IoRepeatOutline, IoTimeOutline, IoTrashOutline, IoWarningOutline,
} from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { contem, dataHora, dataUTC, hojeISO, numero } from '../lib/format';
import { ehEntrada } from '../lib/regras';
import type { Localizacao, Movimentacao, Produto } from '../lib/tipos';
import { ModalProducao, ModalTransferencia, SelectArmazem, useArmazens, useLotes } from '../components/EstoqueModais';
import { ProdutoPicker } from '../components/ProdutoPicker';
import { Badge, Code, Empty, Field, Loading, Notice, PageHeader, Panel, SearchInput, Segmented } from '../components/ui';
import type { Estoque as EstoqueT } from '../lib/tipos';

// ============================================================
// ✨ Entrada e saída de mercadoria: tudo que muda saldo, num lugar só (antes ficava na página Estoque).
// Um lançamento tem um tipo, um documento e vários itens; vira um único código RE/RS no Kardex.
// ============================================================
type Tipo = 'ENTRADA' | 'DEVOLUCAO' | 'AJUSTE_MAIS' | 'SAIDA' | 'AJUSTE_MENOS' | 'PERDA';
const TIPOS: { valor: Tipo; label: string; dica: string; icone: ReactNode; tom: 'in' | 'out' | 'neutral'; entrada: boolean; motivo?: boolean }[] = [
  { valor: 'ENTRADA', label: 'Entrada', dica: 'Mercadoria recebida', icone: <IoArrowDownCircleOutline />, tom: 'in', entrada: true },
  { valor: 'DEVOLUCAO', label: 'Devolução VIAPRO', dica: 'Retorno da indústria', icone: <IoRepeatOutline />, tom: 'in', entrada: true },
  { valor: 'AJUSTE_MAIS', label: 'Ajuste (+)', dica: 'Correção de contagem', icone: <IoAddCircleOutline />, tom: 'neutral', entrada: true, motivo: true },
  { valor: 'SAIDA', label: 'Saída', dica: 'Retirada avulsa', icone: <IoArrowUpCircleOutline />, tom: 'out', entrada: false },
  { valor: 'AJUSTE_MENOS', label: 'Ajuste (−)', dica: 'Correção de contagem', icone: <IoRemoveCircleOutline />, tom: 'neutral', entrada: false, motivo: true },
  { valor: 'PERDA', label: 'Perda / avaria', dica: 'Vai para o painel de perdas', icone: <IoWarningOutline />, tom: 'out', entrada: false, motivo: true },
];
interface Item { chave: string; produto: Produto; quantidade: number; lote: string; validade: string; localizacaoId: string; estoqueId: string; origemRotulo: string }

export default function Movimentacoes() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { armazens, padraoId } = useArmazens();
  const [transferir, setTransferir] = useState(false);
  const [produzir, setProduzir] = useState(false);
  const { dados, recarregar } = useCarregar(async () => {
    const [p, l, m, e] = await Promise.all([
      api.get<Produto[]>('/produtos'), api.get<Localizacao[]>('/localizacoes'),
      api.get<Movimentacao[]>('/movimentacoes', { params: { inicio: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), limite: 3000 } }),
      api.get<EstoqueT[]>('/estoque'),
    ]);
    return { produtos: p.data, locais: l.data, movimentos: m.data, estoque: e.data };
  });

  if (!dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Entrada e saída de mercadoria"
        descricao="Entradas, saídas, ajustes e perdas com vários itens por documento. Cada lançamento gera um código único no Kardex."
        acoes={<>
          <button className="btn" onClick={() => navigate('/recebimento-nfe')}><IoDocumentTextOutline /> Importar NF-e</button>
          {armazens.length > 1 && <button className="btn" onClick={() => setTransferir(true)}><IoGitCompareOutline /> Transferir entre armazéns</button>}
          <button className="btn" onClick={() => setProduzir(true)}><IoConstructOutline /> Produzir lote</button>
        </>} />
      <Lancamento produtos={dados.produtos} locais={dados.locais} armazens={armazens} padraoId={padraoId} onFeito={() => recarregar(true)} />
      <Recentes movimentos={dados.movimentos} onKardex={id => navigate(`/kardex/${id}`)} onHistorico={() => navigate('/historico')} />
      {transferir && <ModalTransferencia produtos={dados.produtos} armazens={armazens} onFechar={() => setTransferir(false)} onSalvo={() => { setTransferir(false); recarregar(true); }} />}
      {produzir && usuario && <ModalProducao produtos={dados.produtos} estoque={dados.estoque} usuarioId={usuario.id} armazens={armazens} armazemInicial={padraoId}
        onFechar={() => setProduzir(false)} onSalvo={() => { setProduzir(false); recarregar(true); }} />}
    </>
  );
}

function Lancamento({ produtos, locais, armazens, padraoId, onFeito }: {
  produtos: Produto[]; locais: Localizacao[]; armazens: ReturnType<typeof useArmazens>['armazens']; padraoId: string; onFeito: () => void;
}) {
  const [tipo, setTipo] = useState<Tipo>('ENTRADA');
  const [armazemId, setArmazemId] = useState('');
  const [documento, setDocumento] = useState('');
  const [observacao, setObservacao] = useState('');
  const [itens, setItens] = useState<Item[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState<{ codigo: string; itens: number; unidades: number } | null>(null);
  // linha em edição (produto escolhido, ainda não adicionado)
  const [produto, setProduto] = useState<Produto | null>(null);
  const [qtd, setQtd] = useState('');
  const [lote, setLote] = useState('');
  const [validade, setValidade] = useState('');
  const [localizacaoId, setLocalizacaoId] = useState('');
  const [estoqueId, setEstoqueId] = useState('');
  const arm = armazemId || padraoId;
  const t = TIPOS.find(x => x.valor === tipo)!;
  const lotes = useLotes(!t.entrada ? produto?.id : undefined, arm);
  const locaisArm = useMemo(() => locais.filter(l => l.ativo !== false && (!l.armazemId || l.armazemId === arm)).sort((a, b) => a.codigo.localeCompare(b.codigo)), [locais, arm]);
  const enderecoCadastro = produto?.enderecoLocalizacao ? locaisArm.find(l => l.codigo === produto.enderecoLocalizacao) : undefined;

  function trocarTipo(v: Tipo) {
    const novo = TIPOS.find(x => x.valor === v)!;
    if (itens.length && novo.entrada !== t.entrada) setItens([]); // entrada e saída usam campos diferentes
    setTipo(v); setEstoqueId(''); setFeito(null);
  }
  function limparLinha() { setProduto(null); setQtd(''); setLote(''); setValidade(''); setLocalizacaoId(''); setEstoqueId(''); }
  function adicionar() {
    if (!produto) return toast.warn('Escolha o produto.');
    const n = Math.round(Number(qtd));
    if (!(n > 0)) return toast.warn('Informe a quantidade.');
    const linha = lotes.find(l => l.estoqueId === estoqueId);
    if (!t.entrada && linha && n > linha.quantidade) return toast.warn(`Esse lote/endereço tem só ${numero(linha.quantidade)}.`);
    const local = locaisArm.find(l => l.id === localizacaoId);
    setItens(x => [...x, {
      chave: `${produto.id}-${Date.now()}`, produto, quantidade: n, lote: lote.trim().toUpperCase(), validade, localizacaoId, estoqueId,
      origemRotulo: t.entrada ? (local?.codigo ?? (enderecoCadastro ? `${enderecoCadastro.codigo} (cadastro)` : 'sem endereço')) : linha ? `${linha.endereco ?? 'endereço do cadastro'} · ${linha.lote ?? 'sem lote'}` : 'Automático (vence primeiro)',
    }]);
    limparLinha();
  }
  async function registrar() {
    if (!itens.length) return toast.warn('Adicione pelo menos um item.');
    if (t.motivo && !observacao.trim()) return toast.warn('Escreva o motivo.');
    setSalvando(true);
    try {
      const { data } = await api.post('/estoque/lancamento', {
        tipo, armazemId: arm || undefined, documento, observacao,
        itens: itens.map(i => ({ produtoId: i.produto.id, quantidade: i.quantidade, lote: i.lote || null, validade: i.validade || null, localizacaoId: t.entrada ? (i.localizacaoId || undefined) : undefined, estoqueId: !t.entrada ? (i.estoqueId || null) : undefined })),
      });
      toast.success(`Lançamento ${data.codigo} registrado: ${data.itens} item(ns), ${numero(data.unidades)} un.`);
      setFeito(data); setItens([]); setDocumento(''); setObservacao(''); onFeito();
    } catch (e) { toast.error(msgErro(e), { autoClose: 9000 }); } finally { setSalvando(false); }
  }
  const total = itens.reduce((a, i) => a + i.quantidade, 0);

  return (
    <Panel titulo="Novo lançamento" descricao={t.entrada ? 'O saldo entra no endereço escolhido (ou no endereço do cadastro do produto).' : 'Sai pelo lote que vence primeiro, ou do endereço e lote que você escolher.'}>
      <div className="stack">
        <div className="tiles mov-tipos" role="radiogroup" aria-label="Tipo de lançamento">
          {TIPOS.map(o => (
            <button type="button" key={o.valor} className="tile" data-tone={o.tom} role="radio" aria-checked={tipo === o.valor} aria-pressed={tipo === o.valor} onClick={() => trocarTipo(o.valor)}>
              {o.icone}{o.label}<small>{o.dica}</small>
            </button>
          ))}
        </div>
        <div className="form-grid">
          {armazens.length > 1 && <SelectArmazem armazens={armazens} value={arm} onChange={v => { setArmazemId(v); setItens([]); limparLinha(); }} className="col-3" />}
          <Field label="Documento" className={armazens.length > 1 ? 'col-3' : 'col-4'} dica="NF, pedido, protocolo"><input className="input" value={documento} onChange={e => setDocumento(e.target.value)} placeholder="Ex.: NF 12345" /></Field>
          <Field label={t.motivo ? 'Motivo (obrigatório)' : 'Observação'} className={armazens.length > 1 ? 'col-6' : 'col-8'}>
            <input className="input" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder={t.motivo ? 'Ex.: recontagem do endereço A-04, caixa molhada' : 'Opcional'} />
          </Field>
        </div>

        <div className="mov-linha">
          <div className="mov-linha__produto">
            {produto
              ? <div className="mov-escolhido"><b>{produto.nome}</b><Code>{produto.sku}</Code><button type="button" className="btn btn--sm btn--ghost" onClick={limparLinha}>Trocar</button></div>
              : <ProdutoPicker produtos={produtos} onSelecionar={p => { setProduto(p); setLote(t.entrada ? p.lote ?? '' : ''); }} placeholder="Produto: nome, SKU ou bipe o código" />}
          </div>
          {produto && <>
            {t.entrada ? <>
              <Field label="Endereço"><select className="select" value={localizacaoId} onChange={e => setLocalizacaoId(e.target.value)}>
                <option value="">{enderecoCadastro ? `${enderecoCadastro.codigo} (cadastro)` : 'Sem endereço'}</option>
                {locaisArm.map(l => <option key={l.id} value={l.id}>{l.codigo}{l.tipo ? ` · ${l.tipo}` : ''}</option>)}
              </select></Field>
              <Field label="Lote"><input className="input" value={lote} onChange={e => setLote(e.target.value.toUpperCase())} placeholder="Sem lote" /></Field>
              <Field label="Validade"><input className="input" type="date" value={validade} min={tipo === 'ENTRADA' ? hojeISO() : undefined} onChange={e => setValidade(e.target.value)} /></Field>
            </> : (
              <Field label="De onde sai" className="mov-origem"><select className="select" value={estoqueId} onChange={e => setEstoqueId(e.target.value)}>
                <option value="">Automático (vence primeiro) · {numero(lotes.reduce((a, l) => a + l.quantidade, 0))} disp.</option>
                {lotes.map(l => <option key={l.estoqueId} value={l.estoqueId}>{l.endereco ?? 'endereço do cadastro'} · {l.lote ?? 'sem lote'}{l.validade ? ` · val. ${dataUTC(l.validade)}` : ''} · {numero(l.quantidade)}</option>)}
              </select></Field>
            )}
            <Field label={`Quantidade (${produto.unidade ?? 'UN'})`}><input className="input" type="number" min={1} value={qtd} onChange={e => setQtd(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }} autoFocus /></Field>
            <button type="button" className="btn btn--primary mov-add" onClick={adicionar}><IoAddCircleOutline /> Adicionar</button>
          </>}
        </div>

        {itens.length === 0 ? (
          feito ? <Notice tom="ok">Lançamento <b>{feito.codigo}</b> registrado: {feito.itens} item(ns), {numero(feito.unidades)} un. O saldo já está atualizado no Estoque e no Kardex.</Notice>
            : <p className="muted" style={{ fontSize: 13 }}>Escolha o produto, informe a quantidade e clique em Adicionar. Repita para cada item do documento.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Produto</th><th>{t.entrada ? 'Endereço' : 'De onde sai'}</th>{t.entrada && <th>Lote / validade</th>}<th className="num">Quantidade</th><th className="actions" /></tr></thead>
              <tbody>
                {itens.map(i => (
                  <tr key={i.chave}>
                    <td><div className="cell-title">{i.produto.nome}</div><div className="cell-sub"><Code>{i.produto.sku}</Code></div></td>
                    <td>{i.origemRotulo}</td>
                    {t.entrada && <td>{i.lote || <span className="muted">sem lote</span>}<div className="cell-sub">{i.validade ? `val. ${dataUTC(i.validade)}` : ''}</div></td>}
                    <td className="num"><b className={t.entrada ? 'up' : 'down'}>{t.entrada ? '+' : '−'}{numero(i.quantidade)}</b></td>
                    <td className="actions"><button className="icon-btn icon-btn--bad" aria-label={`Tirar ${i.produto.nome}`} onClick={() => setItens(x => x.filter(y => y.chave !== i.chave))}><IoTrashOutline /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={t.entrada ? 3 : 2}><b>{itens.length} item(ns)</b></td><td className="num"><b>{numero(total)}</b></td><td /></tr></tfoot>
            </table>
          </div>
        )}
        {itens.length > 0 && (
          <div className="mov-acoes">
            <button className="btn btn--ghost" onClick={() => setItens([])}>Limpar</button>
            <button className="btn btn--primary" onClick={registrar} disabled={salvando}><IoCheckmarkCircle /> {salvando ? 'Registrando…' : `Registrar ${t.label.toLowerCase()} (${itens.length} item${itens.length > 1 ? 's' : ''})`}</button>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Lançamentos dos últimos 30 dias agrupados pelo código (um documento = uma linha). */
function Recentes({ movimentos, onKardex, onHistorico }: { movimentos: Movimentacao[]; onKardex: (produtoId: string) => void; onHistorico: () => void }) {
  const [filtro, setFiltro] = useState<'todos' | 'entradas' | 'saidas' | 'ajustes'>('todos');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [limite, setLimite] = useState(25);
  const grupos = useMemo(() => {
    const m = new Map<string, Movimentacao[]>();
    for (const x of movimentos) { const k = `${x.codigo ?? x.id}|${x.tipoAcao}`; if (!m.has(k)) m.set(k, []); m.get(k)!.push(x); }
    return [...m.entries()].map(([k, ms]) => ({ chave: k, codigo: ms[0].codigo ?? '-', tipo: ms[0].tipoAcao, data: ms[0].dataHora, usuario: ms[0].usuario?.nome ?? '-', obs: ms[0].observacao ?? '', itens: ms, unidades: ms.reduce((a, x) => a + x.quantidade, 0) }));
  }, [movimentos]);
  const linhas = grupos
    .filter(g => filtro === 'todos' || (filtro === 'ajustes' ? /Ajuste/.test(g.tipo) : filtro === 'entradas' ? ehEntrada(g.tipo) && !/Ajuste/.test(g.tipo) : !ehEntrada(g.tipo) && !/Ajuste/.test(g.tipo)))
    .filter(g => contem(busca, g.codigo, g.tipo, g.usuario, g.obs, ...g.itens.map(i => i.produto?.nome), ...g.itens.map(i => i.produto?.sku)))
    ;
  const visiveis = linhas.slice(0, limite);
  return (
    <Panel flush titulo="Lançamentos recentes" descricao="Últimos 30 dias, por documento." acoes={<button className="btn btn--sm" onClick={onHistorico}><IoTimeOutline /> Histórico completo</button>}>
      <div className="toolbar">
        <Segmented valor={filtro} onChange={setFiltro} opcoes={[{ valor: 'todos', label: 'Todos' }, { valor: 'entradas', label: 'Entradas' }, { valor: 'saidas', label: 'Saídas' }, { valor: 'ajustes', label: 'Ajustes' }]} />
        <SearchInput value={busca} onChange={setBusca} placeholder="Código, produto, documento ou pessoa" />
      </div>
      {linhas.length === 0 ? <Empty titulo="Nenhum lançamento">Os lançamentos feitos aqui, no recebimento e na separação aparecem nesta lista.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Código</th><th>Tipo</th><th>Itens</th><th className="num">Unidades</th><th>Quem</th><th>Observação</th></tr></thead>
            <tbody>
              {visiveis.map(g => {
                const entra = ehEntrada(g.tipo);
                return [
                  <tr key={g.chave} className="is-clicavel" onClick={() => setAberto(a => (a === g.chave ? null : g.chave))}>
                    <td><Code>{g.codigo}</Code><div className="cell-sub">{dataHora(g.data)}</div></td>
                    <td><Badge tom={/Ajuste/.test(g.tipo) ? 'info' : entra ? 'ok' : 'bad'} plain>{g.tipo}</Badge></td>
                    <td>{g.itens.length === 1 ? g.itens[0].produto?.nome : `${g.itens.length} itens`}</td>
                    <td className="num"><b className={entra ? 'up' : 'down'}>{entra ? '+' : '−'}{numero(g.unidades)}</b></td>
                    <td>{g.usuario}</td>
                    <td className="muted" style={{ maxWidth: 320 }}>{g.obs}</td>
                  </tr>,
                  aberto === g.chave && (
                    <tr key={`${g.chave}-d`} className="mov-detalhe"><td colSpan={6}>
                      {g.itens.map(i => (
                        <div key={i.id} className="mov-detalhe__item">
                          <span><Code>{i.produto?.sku}</Code> {i.produto?.nome}</span>
                          <span className="muted">{i.lote ?? 'sem lote'}{i.validade ? ` · val. ${dataUTC(i.validade)}` : ''}</span>
                          <b>{numero(i.quantidade)}</b>
                          <button className="btn btn--sm btn--ghost" onClick={() => onKardex(i.produtoId)}>Kardex</button>
                        </div>
                      ))}
                    </td></tr>
                  ),
                ];
              })}
            </tbody>
          </table>
          {linhas.length > limite && <div className="table-more"><button className="btn btn--sm" onClick={() => setLimite(l => l + 50)}>Mostrar mais ({numero(linhas.length - limite)} restantes)</button></div>}
        </div>
      )}
    </Panel>
  );
}
