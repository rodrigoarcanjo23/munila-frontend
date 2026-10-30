import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
  IoAddOutline, IoArrowUndoOutline, IoCheckmarkCircle, IoCloseCircleOutline, IoCreateOutline, IoDocumentTextOutline, IoDownloadOutline,
  IoPrintOutline, IoRefreshOutline, IoShieldCheckmarkOutline, IoSparklesOutline,
} from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useCarregar } from '../../lib/useCarregar';
import { contem, dataHora, dataUTC, hojeISO, numero, paraNumero } from '../../lib/format';
import { DataTable, type Col } from '../../components/DataTable';
import { Badge, Code, Empty, Field, Loading, Modal, Notice, Panel, SearchInput, Segmented, useDialogo } from '../../components/ui';
import { FichaImpressa } from './FichaImpressa';
import { ROTULO_MOV, TOM_RQ, entradaPorUnidade, qtd, rotuloUn, type Ficha, type Receita, type Requisicao, type RequisicaoDetalhe, type StatusRequisicao } from './tf';

const ETAPAS = ['Requisição', 'Entrega', 'Conversão', 'Lançamento'] as const;
const feitas = (s: StatusRequisicao) => ({ Solicitada: 1, Entregue: 2, Convertida: 3, 'Concluída': 4, Cancelada: 0, Estornada: 0 }[s]);
const PROXIMA: Partial<Record<StatusRequisicao, string>> = { Solicitada: 'Registrar entrega', Entregue: 'Converter', Convertida: 'Lançar no estoque' };
const n = (v: string) => paraNumero(v) || 0;
const semImp = (c: string) => c.replace(/^IMP-/, '');

/** Etapas do registro (requisição → entrega → conversão → lançamento). */
function Etapas({ status, compacta }: { status: StatusRequisicao; compacta?: boolean }) {
  const f = feitas(status);
  if (status === 'Cancelada' || status === 'Estornada') return <Badge tom={TOM_RQ[status]}>{status}</Badge>;
  const ol = (
    <ol className="rq-etapas" aria-label={`Etapa: ${status}`}>
      {ETAPAS.map((e, i) => <li key={e} className={i < f ? 'is-feita' : i === f ? 'is-atual' : ''} title={e}><span>{e}</span></li>)}
    </ol>
  );
  if (!compacta) return ol;
  return <div className="rq-etapas--compacta">{ol}<small>{f >= 4 ? 'Lançada no estoque' : `Falta: ${ETAPAS[f].toLowerCase()}`}</small></div>;
}

export function Requisicoes({ receitas, onAlterado, onEntrada }: { receitas: Receita[]; onAlterado: () => void; onEntrada: (materialId: string) => void }) {
  const { dados, recarregar } = useCarregar(async () => {
    const [f, r] = await Promise.all([api.get<Ficha[]>('/tf/fichas?todas=1'), api.get<Requisicao[]>('/tf/requisicoes')]);
    return { fichas: f.data, requisicoes: r.data };
  });
  const [filtro, setFiltro] = useState<'andamento' | 'Concluída' | 'encerradas' | 'todas'>('andamento');
  const [busca, setBusca] = useState('');
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [fichas, setFichas] = useState(false);
  const [semeando, setSemeando] = useState(false);
  const atualizar = () => { recarregar(true); onAlterado(); };

  const lista = dados?.requisicoes ?? [];
  const andamento = (r: Requisicao) => ['Solicitada', 'Entregue', 'Convertida'].includes(r.status);
  const linhas = useMemo(() => lista.filter(r =>
    (filtro === 'todas' || (filtro === 'andamento' ? andamento(r) : filtro === 'Concluída' ? r.status === 'Concluída' : ['Cancelada', 'Estornada'].includes(r.status)))
    && contem(busca, r.codigo, r.numeroViapro, r.ficha.nome, ...r.itens.map(i => i.material.codigo), ...r.ordens.map(o => o.produto.codigo), ...r.ordens.map(o => o.loteCodigo))), [lista, filtro, busca]);

  async function semear() {
    setSemeando(true);
    try {
      const r = (await api.post<{ materiais: string[]; receitas: string[]; fichas: string[] }>('/tf/fichas/padrao', {})).data;
      toast.success(`Pronto: ${r.fichas.length} ficha(s), ${r.receitas.length} receita(s) e ${r.materiais.length} material(is) cadastrados.`);
      atualizar();
    } catch (err) { toast.error(msgErro(err)); } finally { setSemeando(false); }
  }

  const colunas: Col<Requisicao>[] = [
    { key: 'c', titulo: 'Registro', ordenar: r => r.codigo, render: r => <><Code>{r.codigo}</Code><div className="cell-sub">{dataUTC(r.solicitadoEm)}{r.numeroViapro ? ` · VIAPRO ${r.numeroViapro}` : ''}</div></> },
    { key: 'f', titulo: 'Produto', principal: true, ordenar: r => r.ficha.nome, render: r => <><div className="cell-title">{r.ficha.nome}</div><div className="cell-sub">{r.itens.map(i => `${qtd(i.quantidadeEntregue ?? i.quantidade)} ${semImp(i.material.codigo)}`).join(' · ')}</div></> },
    {
      key: 'a', titulo: 'Produto acabado', render: r => {
        const os = r.ordens.filter(o => o.status !== 'Cancelada');
        if (!os.length) return <span className="muted">-</span>;
        return <div className="rq-saidas">{os.map(o => <span key={o.id}><b>{qtd(o.quantidadeProduzida ?? o.quantidadePlanejada)}</b> {rotuloUn(o.produto.unidade).toLowerCase()} {o.produto.codigo}</span>)}</div>;
      },
    },
    { key: 'e', titulo: 'Etapa', ordenar: r => feitas(r.status), render: r => <Etapas status={r.status} compacta /> },
    { key: 'p', titulo: '', align: 'right', render: r => PROXIMA[r.status] ? <button className="btn btn--sm btn--primary" onClick={e => { e.stopPropagation(); setAberta(r.id); }}>{PROXIMA[r.status]}</button> : <button className="btn btn--sm" onClick={e => { e.stopPropagation(); setAberta(r.id); }}>Ver ficha</button> },
  ];

  if (!dados) return <Loading />;
  const ativas = dados.fichas.filter(f => f.ativa);
  return (
    <>
      {ativas.length === 0 ? (
        <Panel titulo="Registro de transformação" descricao="Produto importado ou inacabado que vira produto acabado, nas três etapas da ficha em papel.">
          <div className="rq-vazio">
            <p>Nenhuma ficha cadastrada ainda. Cadastre de uma vez as 8 fichas do registro (Lenço Tá na Mão, Passa Febre Quadrado, Bichinhos, Mix e os 4 Puxa Saco), com os materiais, as receitas e os cálculos da planilha.</p>
            <div className="row">
              <button className="btn btn--primary" onClick={semear} disabled={semeando}><IoSparklesOutline /> {semeando ? 'Cadastrando…' : 'Cadastrar as 8 fichas do registro'}</button>
              <button className="btn" onClick={() => setFichas(true)}><IoCreateOutline /> Criar ficha manualmente</button>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel flush>
          <div className="toolbar">
            <Segmented valor={filtro} onChange={setFiltro} opcoes={[
              { valor: 'andamento', label: 'Em andamento', n: lista.filter(andamento).length },
              { valor: 'Concluída', label: 'Lançadas', n: lista.filter(r => r.status === 'Concluída').length },
              { valor: 'encerradas', label: 'Canceladas e estornadas', n: lista.filter(r => ['Cancelada', 'Estornada'].includes(r.status)).length },
              { valor: 'todas', label: 'Todas', n: lista.length },
            ]} />
            <SearchInput value={busca} onChange={setBusca} placeholder="Registro, nº VIAPRO, produto ou lote" />
            <button className="btn" onClick={() => setFichas(true)}><IoDocumentTextOutline /> Fichas</button>
            <button className="btn btn--primary" onClick={() => setNova(true)}><IoAddOutline /> Nova requisição</button>
          </div>
          <DataTable colunas={colunas} linhas={linhas} chave={r => r.id} onLinha={r => setAberta(r.id)} ordemInicial={{ key: 'c', dir: 'desc' }}
            vazio={<Empty titulo={filtro === 'andamento' ? 'Nenhum registro em andamento' : 'Nada por aqui'}>Use "Nova requisição" para pedir o produto importado à logística.</Empty>} />
        </Panel>
      )}

      {nova && <NovaRequisicao fichas={ativas} onFechar={() => setNova(false)} onCriada={id => { setNova(false); atualizar(); setAberta(id); }} />}
      {aberta && <DetalheRequisicao id={aberta} onFechar={() => setAberta(null)} onAlterado={atualizar} onEntrada={onEntrada} />}
      {fichas && <Fichas fichas={dados.fichas} receitas={receitas} onFechar={() => setFichas(false)} onAlterado={atualizar} onSemear={semear} semeando={semeando} />}
    </>
  );
}

// ------------------------------------------------------------ 1. nova requisição
function NovaRequisicao({ fichas, onFechar, onCriada }: { fichas: Ficha[]; onFechar: () => void; onCriada: (id: string) => void }) {
  const [fichaId, setFichaId] = useState(fichas[0]?.id ?? '');
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [numeroViapro, setNumeroViapro] = useState('');
  const [dia, setDia] = useState(hojeISO());
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const ficha = fichas.find(f => f.id === fichaId);

  async function salvar() {
    if (!ficha) return;
    const itens = ficha.entradas.map(e => ({ materialId: e.id, quantidade: n(quantidades[e.id] ?? '') })).filter(i => i.quantidade > 0);
    if (!itens.length) return toast.warn('Informe a quantidade de pelo menos um produto importado.');
    setEnviando(true);
    try {
      const r = await api.post<Requisicao>('/tf/requisicoes', { fichaId, itens, numeroViapro, observacao, solicitadoEm: dia });
      toast.success(`Requisição ${r.data.codigo} aberta. Agora a logística registra a entrega.`);
      onCriada(r.data.id);
    } catch (err) { toast.error(msgErro(err)); } finally { setEnviando(false); }
  }

  return (
    <Modal aberto tamanho="lg" onFechar={onFechar} titulo="Nova requisição de transformação" descricao="1. Requisição do produto importado: o que a VIAPRO pede para a logística entregar."
      rodape={<><button className="btn btn--ghost" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" onClick={salvar} disabled={enviando}>{enviando ? 'Abrindo…' : 'Abrir requisição'}</button></>}>
      <div className="stack">
        <div className="rq-fichas" role="radiogroup" aria-label="Produto">
          {fichas.map(f => (
            <button key={f.id} type="button" role="radio" aria-checked={f.id === fichaId} className="rq-ficha" onClick={() => { setFichaId(f.id); setQuantidades({}); }}>
              <b>{f.nome}</b>
              <span>{f.saidas.filter(s => s.receita).map(s => s.receita!.produto.codigo).join(' · ')}</span>
            </button>
          ))}
        </div>
        {ficha && (
          <div className="tf-tabela">
            <table className="table">
              <thead><tr><th>Produto importado</th><th className="num">Quantidade</th></tr></thead>
              <tbody>
                {ficha.entradas.map(e => (
                  <tr key={e.id}>
                    <td><div className="cell-title">{e.nome}</div><div className="cell-sub"><Code>{semImp(e.codigo)}</Code></div></td>
                    <td className="num" style={{ width: 190 }}>
                      <div className="rq-qtd"><input className="input" inputMode="decimal" value={quantidades[e.id] ?? ''} onChange={ev => setQuantidades(q => ({ ...q, [e.id]: ev.target.value }))} aria-label={`Quantidade de ${e.nome}`} /><span>{rotuloUn(e.unidade)}</span></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="form-grid">
          <Field label="Nº requisição VIAPRO" className="col-4"><input className="input" value={numeroViapro} onChange={e => setNumeroViapro(e.target.value)} placeholder="Opcional" /></Field>
          <Field label="Data" className="col-3"><input className="input" type="date" value={dia} onChange={e => setDia(e.target.value)} /></Field>
          <Field label="Observação" className="col-5"><input className="input" value={observacao} onChange={e => setObservacao(e.target.value)} /></Field>
        </div>
        <p className="muted" style={{ fontSize: 12.5 }}>O nº de solicitação VIAPRO ERP é gerado ao salvar (RQ…). Nada sai do estoque agora: o consumo acontece no lançamento.</p>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ detalhe com as 3 etapas
function DetalheRequisicao({ id, onFechar, onAlterado, onEntrada }: { id: string; onFechar: () => void; onAlterado: () => void; onEntrada: (materialId: string) => void }) {
  const { usuario } = useAuth();
  const { pedirTexto } = useDialogo();
  const { dados: rq, recarregar } = useCarregar(async () => (await api.get<RequisicaoDetalhe>(`/tf/requisicoes/${id}`)).data, [id]);
  const [enviando, setEnviando] = useState(false);
  const [imprimir, setImprimir] = useState(false);
  const [refazer, setRefazer] = useState<'entrega' | 'conversao' | null>(null);

  async function enviar(caminho: string, corpo: object, msg: string) {
    setEnviando(true);
    try { await api.post(`/tf/requisicoes/${id}/${caminho}`, corpo); toast.success(msg); setRefazer(null); recarregar(true); onAlterado(); return true; }
    catch (err) { toast.error(msgErro(err)); return false; } finally { setEnviando(false); }
  }
  const cancelar = async () => {
    const motivo = await pedirTexto({ titulo: `Cancelar ${rq?.codigo}?`, mensagem: 'Nada foi lançado no estoque ainda. O registro fica cancelado com o motivo.', confirmar: 'Cancelar requisição', perigo: true, pedirTexto: { label: 'Motivo', obrigatorio: true } });
    if (motivo) enviar('cancelar', { motivo }, 'Requisição cancelada.');
  };
  const estornar = async () => {
    const motivo = await pedirTexto({ titulo: `Estornar ${rq?.codigo}?`, mensagem: 'O produto acabado sai do estoque e o importado (inclusive o avariado) volta para os lotes de origem. Nada é apagado.', confirmar: 'Estornar', perigo: true, pedirTexto: { label: 'Motivo do estorno', obrigatorio: true } });
    if (motivo) enviar('estornar', { motivo }, 'Requisição estornada.');
  };

  const etapa = rq ? feitas(rq.status) : 0;
  const ativo = rq && !['Cancelada', 'Estornada'].includes(rq.status);
  return (
    <Modal aberto drawer tamanho="xl" onFechar={onFechar}
      titulo={rq ? <span className="row" style={{ gap: 8 }}><Code>{rq.codigo}</Code> {rq.ficha.nome}</span> : 'Registro de transformação'}
      descricao={rq ? `Aberta por ${rq.solicitadoPor} em ${dataHora(rq.createdAt)}${rq.numeroViapro ? ` · requisição VIAPRO ${rq.numeroViapro}` : ''}` : undefined}
      rodape={rq && (
        <div className="row" style={{ width: '100%' }}>
          <button className="btn" onClick={() => setImprimir(true)}><IoPrintOutline /> Imprimir ficha</button>
          <span className="spacer" />
          {['Solicitada', 'Entregue', 'Convertida'].includes(rq.status) && <button className="btn btn--ghost" onClick={cancelar} disabled={enviando}><IoCloseCircleOutline /> Cancelar requisição</button>}
          {rq.status === 'Concluída' && <button className="btn" onClick={estornar} disabled={enviando}><IoArrowUndoOutline /> Estornar</button>}
        </div>
      )}>
      {!rq ? <Loading linhas={6} /> : (
        <div className="tf-detalhe rq-detalhe">
          <Etapas status={rq.status} />
          {rq.motivoCancelamento && <Notice tom="bad">{rq.status === 'Estornada' ? 'Estornada' : 'Cancelada'}: {rq.motivoCancelamento}</Notice>}

          {/* 1. Requisição + entrega */}
          <section className={`rq-secao ${ativo && etapa === 1 ? 'is-atual' : ''}`}>
            <h3 className="rq-secao__titulo"><span>1</span> Requisição do produto importado</h3>
            <div className="table-wrap"><table className="table tf-tabela-mini">
              <thead><tr><th>Código</th><th>Descrição</th><th className="num">Pedido</th><th className="num">Entregue</th><th>Lote</th></tr></thead>
              <tbody>
                {rq.itens.map(i => (
                  <tr key={i.id}>
                    <td><Code>{semImp(i.material.codigo)}</Code></td>
                    <td>{i.material.nome}</td>
                    <td className="num">{qtd(i.quantidade, rotuloUn(i.material.unidade))}</td>
                    <td className="num"><b>{i.quantidadeEntregue !== null ? qtd(i.quantidadeEntregue, rotuloUn(i.material.unidade)) : '-'}</b></td>
                    <td>{i.lotes?.length ? i.lotes.map(l => <span key={l.loteId} className="rq-lote">{l.codigo}{i.lotes!.length > 1 ? ` (${qtd(l.quantidade)})` : ''}</span>) : <span className="muted">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {rq.entreguePor && <p className="rq-meta">Logística Munila: entregue por <b>{rq.entreguePor}</b> em {dataUTC(rq.entregueEm)}{rq.registradoEntregaPor && rq.registradoEntregaPor !== rq.entreguePor ? ` · registrado por ${rq.registradoEntregaPor}` : ''}</p>}
            {(rq.status === 'Solicitada' || refazer === 'entrega') && <FormEntrega rq={rq} padrao={usuario?.nome ?? ''} enviando={enviando} onEntrada={onEntrada} onRecarregar={() => recarregar(true)} onCancelar={refazer ? () => setRefazer(null) : undefined}
              onSalvar={corpo => enviar('entrega', corpo, 'Entrega registrada. Próximo passo: conversão.')} />}
            {rq.status === 'Entregue' && refazer !== 'entrega' && <button className="btn btn--sm btn--ghost" onClick={() => setRefazer('entrega')}><IoRefreshOutline /> Corrigir entrega</button>}
          </section>

          {/* 2. Conversão */}
          <section className={`rq-secao ${ativo && etapa === 2 ? 'is-atual' : ''} ${etapa < 2 && !rq.convertidaEm ? 'is-futura' : ''}`}>
            <h3 className="rq-secao__titulo"><span>2</span> Conversão do produto importado em produto acabado</h3>
            {(rq.status === 'Entregue' || refazer === 'conversao') ? (
              <FormConversao rq={rq} padrao={usuario?.nome ?? ''} enviando={enviando} onCancelar={refazer ? () => setRefazer(null) : undefined}
                onSalvar={corpo => enviar('conversao', corpo, 'Conversão registrada. Próximo passo: lançamento no estoque.')} />
            ) : rq.convertidaEm ? (
              <>
                <ResumoConversao rq={rq} />
                {rq.status === 'Convertida' && <button className="btn btn--sm btn--ghost" onClick={() => setRefazer('conversao')}><IoRefreshOutline /> Refazer conversão</button>}
              </>
            ) : <p className="muted">Depois da entrega, divida o que chegou entre os produtos acabados da ficha.</p>}
          </section>

          {/* 3. Lançamento */}
          <section className={`rq-secao ${ativo && etapa === 3 ? 'is-atual' : ''} ${etapa < 3 && !rq.lancadoEm ? 'is-futura' : ''}`}>
            <h3 className="rq-secao__titulo"><span>3</span> Lançamento de estoque de produto acabado</h3>
            {rq.status === 'Convertida' && refazer !== 'conversao' ? (
              <FormLancamento rq={rq} enviando={enviando} onSalvar={corpo => enviar('lancamento', corpo, 'Produto acabado lançado no estoque da transformação.')} />
            ) : rq.lancadoEm ? (
              <>
                <div className="table-wrap"><table className="table tf-tabela-mini">
                  <thead><tr><th>Código</th><th>Descrição</th><th>Lote</th><th className="num">Quantidade</th><th className="num">Rendimento</th></tr></thead>
                  <tbody>
                    {rq.ordens.filter(o => o.status === 'Concluída' || o.status === 'Estornada').map(o => (
                      <tr key={o.id}>
                        <td><Code>{o.produto.codigo}</Code><div className="cell-sub">{o.codigo}</div></td>
                        <td>{o.produto.nome}</td>
                        <td>{o.loteCodigo ? <span className="rq-lote">{o.loteCodigo}</span> : '-'}</td>
                        <td className="num"><b>{qtd(o.quantidadeProduzida, rotuloUn(o.produto.unidade))}</b></td>
                        <td className="num"><Badge tom={o.faixa === 'OK' ? 'ok' : o.faixa === 'Justificar' ? 'warn' : 'bad'} plain>{numero(o.rendimento ?? 0, 1)}%</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <p className="rq-meta">Lançado por <b>{rq.lancadoPor}</b> em {dataHora(rq.lancadoEm)}{rq.justificativa ? ` · Justificativa: ${rq.justificativa}` : ''}</p>
              </>
            ) : <p className="muted">Depois da conversão, a logística confere a quantidade real e o lote de cada produto acabado.</p>}
          </section>

          {rq.movimentos.length > 0 && (
            <details className="rq-mais">
              <summary>Lançamentos no estoque da transformação ({rq.movimentos.length})</summary>
              <div className="table-wrap"><table className="table tf-tabela-mini">
                <tbody>
                  {rq.movimentos.map(m => (
                    <tr key={m.id}>
                      <td><Badge tom={m.quantidade > 0 ? 'ok' : m.tipo === 'PERDA' ? 'bad' : 'warn'} plain>{ROTULO_MOV[m.tipo] ?? m.tipo}</Badge></td>
                      <td>{m.material.nome}<div className="cell-sub">lote {m.lote?.codigo ?? '-'} · {m.documento} · {dataHora(m.dataHora)} · {m.usuario}</div></td>
                      <td className="num"><b className={m.quantidade > 0 ? 'up' : 'down'}>{m.quantidade > 0 ? '+' : '−'}{qtd(Math.abs(m.quantidade), m.material.unidade)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </details>
          )}
          <details className="rq-mais">
            <summary><IoShieldCheckmarkOutline style={{ verticalAlign: -2 }} /> Trilha de auditoria ({rq.eventos.length})</summary>
            <ol className="tf-trilha">
              {rq.eventos.map(e => (
                <li key={e.id}><b>{e.acao}</b> · {dataHora(e.dataHora)} · {e.usuario}<div>{e.resumo}</div><code title={e.hash}>#{e.seq} {e.hash.slice(0, 12)}…</code></li>
              ))}
            </ol>
          </details>
        </div>
      )}
      {imprimir && rq && <FichaImpressa ficha={rq.fichaMontada} rq={rq} onFechar={() => setImprimir(false)} />}
    </Modal>
  );
}

// 1b. entrega pela logística
function FormEntrega({ rq, padrao, enviando, onSalvar, onCancelar, onEntrada, onRecarregar }: {
  rq: RequisicaoDetalhe; padrao: string; enviando: boolean; onSalvar: (corpo: object) => void; onCancelar?: () => void; onEntrada: (materialId: string) => void; onRecarregar: () => void;
}) {
  const [quem, setQuem] = useState(rq.entreguePor ?? padrao);
  const [dia, setDia] = useState(hojeISO());
  const [linhas, setLinhas] = useState(() => Object.fromEntries(rq.itens.map(i => [i.id, { qtd: String(i.quantidadeEntregue ?? i.quantidade), lote: i.lotes?.length === 1 ? i.lotes[0].loteId : '' }])));
  const disp = (materialId: string) => rq.disponibilidade.find(d => d.materialId === materialId);
  const faltando = rq.itens.filter(i => n(linhas[i.id].qtd) > (disp(i.materialId)?.saldoLiberado ?? 0));

  function salvar() {
    if (!quem.trim()) return toast.warn('Informe quem entregou.');
    onSalvar({
      entreguePor: quem, entregueEm: dia,
      itens: rq.itens.map(i => ({ id: i.id, quantidadeEntregue: n(linhas[i.id].qtd), lotes: linhas[i.id].lote ? [{ loteId: linhas[i.id].lote, quantidade: n(linhas[i.id].qtd) }] : [] })),
    });
  }
  return (
    <div className="rq-form">
      <div className="rq-form__titulo">Logística Munila · entrega</div>
      <div className="tf-tabela">
        <table className="table">
          <thead><tr><th>Produto importado</th><th className="num">Saldo na transformação</th><th className="num">Entregue</th><th>Lote</th></tr></thead>
          <tbody>
            {rq.itens.map(i => {
              const d = disp(i.materialId);
              const l = linhas[i.id];
              const lotes = (d?.lotes ?? []).filter(x => x.status === 'Liberado');
              const falta = n(l.qtd) > (d?.saldoLiberado ?? 0);
              return (
                <tr key={i.id}>
                  <td><div className="cell-title">{i.material.nome}</div><div className="cell-sub"><Code>{semImp(i.material.codigo)}</Code> · pedido {qtd(i.quantidade)}</div></td>
                  <td className="num"><span className={falta ? 'tf-tom--bad' : ''}>{qtd(d?.saldoLiberado ?? 0, rotuloUn(i.material.unidade))}</span></td>
                  <td className="num" style={{ width: 150 }}><div className="rq-qtd"><input className="input" inputMode="decimal" value={l.qtd} onChange={e => setLinhas(s => ({ ...s, [i.id]: { ...l, qtd: e.target.value } }))} aria-label="Quantidade entregue" /><span>{rotuloUn(i.material.unidade)}</span></div></td>
                  <td style={{ width: 220 }}>
                    <select className="select" value={l.lote} onChange={e => setLinhas(s => ({ ...s, [i.id]: { ...l, lote: e.target.value } }))} aria-label="Lote entregue">
                      <option value="">Automático (vence primeiro)</option>
                      {lotes.map(x => <option key={x.id} value={x.id}>{x.codigo} · saldo {qtd(x.saldo)}{x.validade ? ` · val. ${dataUTC(x.validade)}` : ''}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {faltando.length > 0 && (
        <Notice tom="warn" acao={<div className="row">{faltando.map(i => <button key={i.id} className="btn btn--sm" onClick={() => onEntrada(i.materialId)}><IoDownloadOutline /> Entrada de {semImp(i.material.codigo)}</button>)}<button className="btn btn--sm btn--ghost" onClick={onRecarregar}><IoRefreshOutline /> Atualizar saldo</button></div>}>
          Falta saldo no estoque da transformação. Registre a entrada do produto importado (com o lote da caixa) e atualize.
        </Notice>
      )}
      <div className="form-grid">
        <Field label="Entregue por" className="col-6"><input className="input" value={quem} onChange={e => setQuem(e.target.value)} /></Field>
        <Field label="Data" className="col-3"><input className="input" type="date" value={dia} onChange={e => setDia(e.target.value)} /></Field>
        <div className="col-3 rq-form__acoes">
          {onCancelar && <button className="btn btn--ghost" onClick={onCancelar}>Voltar</button>}
          <button className="btn btn--primary" onClick={salvar} disabled={enviando}><IoCheckmarkCircle /> Registrar entrega</button>
        </div>
      </div>
    </div>
  );
}

// 2. conversão: divide o entregue entre as saídas da ficha
function FormConversao({ rq, padrao, enviando, onSalvar, onCancelar }: { rq: RequisicaoDetalhe; padrao: string; enviando: boolean; onSalvar: (corpo: object) => void; onCancelar?: () => void }) {
  const saidas = rq.fichaMontada.saidas.filter(s => s.receita);
  const anteriores = rq.ordens.filter(o => o.status === 'Planejada');
  // entrada destinada a cada saída (na unidade de entrada; em fichas com vários sachês, o total somado)
  const [destinado, setDestinado] = useState<Record<string, string>>(() => Object.fromEntries(saidas.map(s => {
    const o = anteriores.find(x => x.receita?.codigo === s.receitaCodigo);
    return [s.receitaCodigo, o ? String(+(o.quantidadePlanejada * entradaPorUnidade(s.receita!)).toFixed(3)) : saidas.length === 1 ? String(rq.itens.reduce((a, i) => a + (i.quantidadeEntregue ?? 0), 0)) : ''];
  })));
  const [avaria, setAvaria] = useState<Record<string, string>>(() => Object.fromEntries(rq.itens.map(i => [i.id, i.avariada ? String(i.avariada) : ''])));
  const [motivo, setMotivo] = useState(rq.avariaMotivo ?? '');
  const [quem, setQuem] = useState(rq.responsavelConversao ?? padrao);
  const [dia, setDia] = useState(hojeISO());

  const calc = saidas.map(s => {
    const porUn = entradaPorUnidade(s.receita!);
    const produz = Math.floor(n(destinado[s.receitaCodigo] ?? '') / porUn + 1e-9);
    const fator = produz / s.receita!.quantidadeBase;
    const consumo = s.receita!.itens.filter(i => i.papel === 'CONSUMO').map(i => ({ materialId: i.materialId, quantidade: i.quantidade * fator }));
    return { s, porUn, produz, consumo };
  });
  const balanco = rq.itens.map(i => {
    const usado = calc.reduce((a, c) => a + c.consumo.filter(x => x.materialId === i.materialId).reduce((b, x) => b + x.quantidade, 0), 0);
    const av = n(avaria[i.id] ?? '');
    const entregue = i.quantidadeEntregue ?? 0;
    return { i, usado, av, entregue, sobra: entregue - usado - av };
  });
  const estoura = balanco.some(b => b.sobra < -1e-6);
  const temAvaria = balanco.some(b => b.av > 0);

  function usarResto(codigo: string) {
    const c = calc.find(x => x.s.receitaCodigo === codigo)!;
    // quantas unidades cabem no que sobra de cada material desta receita
    const cabe = Math.min(...c.s.receita!.itens.filter(i => i.papel === 'CONSUMO').map(it => {
      const b = balanco.find(x => x.i.materialId === it.materialId);
      const livre = (b?.sobra ?? 0) + c.consumo.filter(x => x.materialId === it.materialId).reduce((a, x) => a + x.quantidade, 0);
      return Math.floor((livre / it.quantidade) * c.s.receita!.quantidadeBase + 1e-9);
    }));
    setDestinado(d => ({ ...d, [codigo]: String(+(Math.max(0, cabe) * c.porUn).toFixed(3)) }));
  }
  function salvar() {
    const lista = calc.filter(c => c.produz > 0);
    if (!lista.length) return toast.warn('Informe quanto vai para pelo menos um produto acabado.');
    if (estoura) return toast.warn('A soma passa do que foi entregue.');
    if (temAvaria && !motivo.trim()) return toast.warn('Descreva o que aconteceu com a quantidade avariada.');
    onSalvar({
      responsavel: quem, data: dia, avariaMotivo: motivo,
      saidas: lista.map(c => ({ receitaCodigo: c.s.receitaCodigo, quantidade: c.produz })),
      avarias: balanco.filter(b => b.av > 0).map(b => ({ itemId: b.i.id, quantidade: b.av })),
    });
  }
  const unEntrada = rotuloUn(rq.itens[0]?.material.unidade);
  return (
    <div className="rq-form">
      <div className="tf-tabela">
        <table className="table">
          <thead><tr><th>Produto acabado</th><th>Cálculo</th><th className="num">Entrada destinada</th><th className="num">Gera</th></tr></thead>
          <tbody>
            {calc.map(c => {
              const r = c.s.receita!;
              const multi = r.itens.filter(i => i.papel === 'CONSUMO').length > 1;
              const sobraNaLinha = n(destinado[c.s.receitaCodigo] ?? '') - c.produz * c.porUn;
              return (
                <tr key={c.s.receitaCodigo}>
                  <td><div className="cell-title">{r.produto.nome}</div><div className="cell-sub"><Code>{r.produto.codigo}</Code></div></td>
                  <td><span className="rq-calc">{c.s.calculo}</span></td>
                  <td className="num" style={{ width: 210 }}>
                    <div className="rq-qtd"><input className="input" inputMode="decimal" value={destinado[c.s.receitaCodigo] ?? ''} onChange={e => setDestinado(d => ({ ...d, [c.s.receitaCodigo]: e.target.value }))} aria-label={`Entrada para ${r.produto.nome}`} /><span>{multi ? 'Total' : unEntrada}</span></div>
                    <button type="button" className="rq-link" onClick={() => usarResto(c.s.receitaCodigo)}>usar o que sobra</button>
                  </td>
                  <td className="num"><b className="rq-gera">{qtd(c.produz)}</b> <span className="muted">{rotuloUn(r.produto.unidade).toLowerCase()}</span>{sobraNaLinha > 1e-6 && <div className="cell-sub">{qtd(sobraNaLinha)} não fecham 1 unidade</div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rq-balanco">
        {balanco.map(b => (
          <div key={b.i.id} className={b.sobra < -1e-6 ? 'is-erro' : ''}>
            <span><Code>{semImp(b.i.material.codigo)}</Code> entregue {qtd(b.entregue)}</span>
            <span>usa <b>{qtd(b.usado)}</b></span>
            <label>avariada <input className="input input--mini" inputMode="decimal" value={avaria[b.i.id] ?? ''} onChange={e => setAvaria(a => ({ ...a, [b.i.id]: e.target.value }))} aria-label={`Avariada de ${b.i.material.codigo}`} /></label>
            <span className={b.sobra < -1e-6 ? 'tf-tom--bad' : b.sobra > 1e-6 ? 'tf-tom--warn' : 'tf-tom--ok'}>{b.sobra < -1e-6 ? `passa ${qtd(-b.sobra)}` : b.sobra > 1e-6 ? `sobra ${qtd(b.sobra)}` : 'fecha'}</span>
          </div>
        ))}
      </div>
      {balanco.some(b => b.sobra > 1e-6) && !estoura && <p className="muted" style={{ fontSize: 12.5 }}>O que sobrar continua no estoque da transformação, no mesmo lote.</p>}
      <div className="form-grid">
        {temAvaria && <Field label="O que aconteceu com o avariado" className="col-12"><input className="input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: caixa molhada, pacotes rasgados" /></Field>}
        <Field label="Responsável" className="col-6"><input className="input" value={quem} onChange={e => setQuem(e.target.value)} /></Field>
        <Field label="Data" className="col-3"><input className="input" type="date" value={dia} onChange={e => setDia(e.target.value)} /></Field>
        <div className="col-3 rq-form__acoes">
          {onCancelar && <button className="btn btn--ghost" onClick={onCancelar}>Voltar</button>}
          <button className="btn btn--primary" onClick={salvar} disabled={enviando || estoura}><IoCheckmarkCircle /> Registrar conversão</button>
        </div>
      </div>
    </div>
  );
}

function ResumoConversao({ rq }: { rq: RequisicaoDetalhe }) {
  const ordens = rq.ordens.filter(o => o.status !== 'Cancelada');
  const saida = (codigo?: string) => rq.fichaMontada.saidas.find(s => s.receitaCodigo === codigo);
  const avarias = rq.itens.filter(i => i.avariada > 0);
  return (
    <>
      <div className="table-wrap"><table className="table tf-tabela-mini">
        <thead><tr><th>Produto acabado</th><th>Cálculo</th><th className="num">Usa</th><th className="num">Calculado</th></tr></thead>
        <tbody>
          {ordens.map(o => (
            <tr key={o.id}>
              <td><Code>{o.produto.codigo}</Code> {o.produto.nome}</td>
              <td><span className="rq-calc">{saida(o.receita?.codigo)?.calculo ?? '-'}</span></td>
              <td className="num">{o.itens.filter(i => i.papel === 'CONSUMO').map(i => `${qtd(i.quantidade)} ${semImp(i.material?.codigo ?? '')}`).join(' + ')}</td>
              <td className="num"><b>{qtd(o.quantidadePlanejada, rotuloUn(o.produto.unidade))}</b></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="rq-meta">
        Responsável <b>{rq.responsavelConversao}</b> em {dataUTC(rq.convertidaEm)}
        {avarias.length > 0 && <> · <span className="tf-tom--bad">avariado: {avarias.map(a => `${qtd(a.avariada)} ${rotuloUn(a.material.unidade).toLowerCase()} ${semImp(a.material.codigo)}`).join(', ')}</span>{rq.avariaMotivo ? ` (${rq.avariaMotivo})` : ''}</>}
      </p>
    </>
  );
}

// 3. lançamento (logística confere quantidade real e lote)
function FormLancamento({ rq, enviando, onSalvar }: { rq: RequisicaoDetalhe; enviando: boolean; onSalvar: (corpo: object) => void }) {
  const ordens = rq.ordens.filter(o => o.status === 'Planejada');
  const [linhas, setLinhas] = useState(() => Object.fromEntries(ordens.map(o => [o.id, { qtd: String(o.quantidadePlanejada), lote: '' }])));
  const [justificativa, setJustificativa] = useState('');
  const difs = ordens.filter(o => Math.abs(n(linhas[o.id].qtd) - o.quantidadePlanejada) > 1e-6);
  const foraTol = ordens.filter(o => {
    const r = o.quantidadePlanejada > 0 ? (n(linhas[o.id].qtd) / o.quantidadePlanejada) * 100 : 0;
    return Math.abs(r - 100) > (o.receita?.toleranciaAviso ?? 3);
  });
  function salvar() {
    if (foraTol.length && !justificativa.trim()) return toast.warn('Escreva a justificativa da diferença.');
    onSalvar({ justificativa, saidas: ordens.map(o => ({ ordemId: o.id, produzido: n(linhas[o.id].qtd), loteCodigo: linhas[o.id].lote.trim() || null })) });
  }
  return (
    <div className="rq-form">
      <div className="tf-tabela">
        <table className="table">
          <thead><tr><th>Produto acabado</th><th className="num">Calculado</th><th className="num">Quantidade real</th><th>Lote</th></tr></thead>
          <tbody>
            {ordens.map(o => {
              const l = linhas[o.id];
              return (
                <tr key={o.id}>
                  <td><div className="cell-title">{o.produto.nome}</div><div className="cell-sub"><Code>{o.produto.codigo}</Code> · {o.codigo}</div></td>
                  <td className="num">{qtd(o.quantidadePlanejada, rotuloUn(o.produto.unidade))}</td>
                  <td className="num" style={{ width: 170 }}><div className="rq-qtd"><input className="input" inputMode="decimal" value={l.qtd} onChange={e => setLinhas(s => ({ ...s, [o.id]: { ...l, qtd: e.target.value } }))} aria-label="Quantidade real" /><span>{rotuloUn(o.produto.unidade)}</span></div></td>
                  <td style={{ width: 190 }}><input className="input" value={l.lote} onChange={e => setLinhas(s => ({ ...s, [o.id]: { ...l, lote: e.target.value } }))} placeholder="Automático (TF…)" aria-label="Lote do produto acabado" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {difs.length > 0 && <Field label={foraTol.length ? 'Justificativa da diferença (obrigatória)' : 'Justificativa da diferença'}><input className="input" value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder="Ex.: 5 blisters com solda aberta" /></Field>}
      <div className="rq-form__rodape">
        <p className="muted">Ao lançar, o importado sai dos lotes entregues{rq.itens.some(i => i.avariada > 0) ? ', o avariado sai como perda' : ''} e o produto acabado entra no estoque da transformação com o seu nome.</p>
        <button className="btn btn--primary" onClick={salvar} disabled={enviando}><IoCheckmarkCircle /> Lançar no estoque</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ fichas (modelos do registro)
function Fichas({ fichas, receitas, onFechar, onAlterado, onSemear, semeando }: { fichas: Ficha[]; receitas: Receita[]; onFechar: () => void; onAlterado: () => void; onSemear: () => void; semeando: boolean }) {
  const [editando, setEditando] = useState<Partial<Ficha> | null>(null);
  const [imprimir, setImprimir] = useState<Ficha | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [nome, setNome] = useState('');

  function editar(f?: Ficha) {
    setEditando(f ?? {});
    setNome(f?.nome ?? '');
    setSel(f?.saidas.map(s => s.receitaCodigo) ?? []);
  }
  async function salvar() {
    setSalvando(true);
    try { await api.post('/tf/fichas', { id: editando?.id, codigo: editando?.codigo, nome, saidas: sel }); toast.success('Ficha salva.'); setEditando(null); onAlterado(); }
    catch (err) { toast.error(msgErro(err)); } finally { setSalvando(false); }
  }
  async function arquivar(f: Ficha) {
    try { await api.post(`/tf/fichas/${f.id}/ativa`, { ativa: !f.ativa }); toast.success(f.ativa ? 'Ficha arquivada.' : 'Ficha reativada.'); onAlterado(); }
    catch (err) { toast.error(msgErro(err)); }
  }

  return (
    <Modal aberto drawer tamanho="lg" onFechar={onFechar} titulo="Fichas do registro de transformação" descricao="Cada ficha é um produto da planilha: as entradas importadas e as saídas possíveis, com o cálculo de cada uma."
      rodape={<div className="row" style={{ width: '100%' }}>
        <button className="btn" onClick={onSemear} disabled={semeando}><IoSparklesOutline /> {semeando ? 'Conferindo…' : 'Cadastrar fichas da planilha que faltam'}</button>
        <span className="spacer" />
        <button className="btn btn--primary" onClick={() => editar()}><IoAddOutline /> Nova ficha</button>
      </div>}>
      {editando ? (
        <div className="stack">
          <Field label="Nome (aparece como PRODUTO na ficha)"><input className="input" value={nome} onChange={e => setNome(e.target.value)} autoFocus /></Field>
          <div>
            <div className="tf-rotulo">Saídas (receitas). A entrada da ficha é o que essas receitas consomem.</div>
            <div className="rq-escolha">
              {receitas.map(r => (
                <label key={r.id} className="check">
                  <input type="checkbox" checked={sel.includes(r.codigo)} onChange={e => setSel(s => e.target.checked ? [...s, r.codigo] : s.filter(x => x !== r.codigo))} />
                  <span><b>{r.produto.codigo}</b> {r.produto.nome}<small> · {r.codigo} · usa {r.itens.filter(i => i.papel === 'CONSUMO').map(i => `${qtd(i.quantidade)} ${i.material.codigo}`).join(' + ')} por {qtd(r.quantidadeBase)}</small></span>
                </label>
              ))}
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn--ghost" onClick={() => setEditando(null)}>Voltar</button>
            <button className="btn btn--primary" onClick={salvar} disabled={salvando || !nome.trim() || !sel.length}>Salvar ficha</button>
          </div>
        </div>
      ) : (
        <div className="rq-lista-fichas">
          {fichas.length === 0 && <Empty titulo="Nenhuma ficha">Cadastre as fichas da planilha ou crie uma nova.</Empty>}
          {fichas.map(f => (
            <article key={f.id} className={`rq-cartao ${f.ativa ? '' : 'is-arquivada'}`}>
              <header>
                <div><h3>{f.nome}</h3><span className="muted">{f.codigo}{f.requisicoes ? ` · ${f.requisicoes} registro(s)` : ''}{!f.ativa ? ' · arquivada' : ''}</span></div>
                <div className="row">
                  <button className="btn btn--sm" onClick={() => setImprimir(f)}><IoPrintOutline /> Em branco</button>
                  <button className="btn btn--sm btn--ghost" onClick={() => editar(f)}><IoCreateOutline /> Editar</button>
                  <button className="btn btn--sm btn--ghost" onClick={() => arquivar(f)}>{f.ativa ? 'Arquivar' : 'Reativar'}</button>
                </div>
              </header>
              <div className="rq-equacao">
                <div>{f.entradas.map(e => <span key={e.id}><Code>{semImp(e.codigo)}</Code> {e.nome}</span>)}</div>
                <span aria-hidden>→</span>
                <div>{f.saidas.map(s => s.receita ? <span key={s.receitaCodigo}><Code>{s.receita.produto.codigo}</Code> {s.receita.produto.nome} <em className="rq-calc">{s.calculo}</em></span> : <span key={s.receitaCodigo} className="tf-tom--bad">Receita {s.receitaCodigo} arquivada</span>)}</div>
              </div>
            </article>
          ))}
        </div>
      )}
      {imprimir && <FichaImpressa ficha={imprimir} onFechar={() => setImprimir(null)} />}
    </Modal>
  );
}
