import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { IoCheckmarkCircle, IoDownloadOutline, IoDocumentTextOutline, IoArrowUndoOutline, IoShieldCheckmarkOutline, IoSearchOutline, IoClipboardOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { contem, dataHora, dataUTC, haQuanto, moeda, numero } from '../lib/format';
import { exportarExcel } from '../lib/exportar';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Code, Empty, Field, Kpi, Loading, Modal, Notice, PageHeader, Panel, SearchInput, Segmented } from '../components/ui';

/** ✨ FASE 10: sobra sem NF (inventário / recebimento) até ser regularizada. */
export interface Divergencia {
  id: string; codigo: string; tipo: string; origem: string; documentoOrigem: string | null; produtoId: string; lote: string | null; validade: string | null;
  quantidadeDocumento: number | null; quantidadeContada: number | null; quantidade: number; quantidadeResolvida: number;
  status: 'Aberta' | 'Parcial' | 'Resolvida'; observacao: string | null; criadoPor: string; createdAt: string; resolvidaEm: string | null;
  produto: { id: string; sku: string; nome: string; precoCusto: number | null; enderecoLocalizacao: string | null };
  armazem: { id: string; nome: string } | null;
  fornecedor: { id: string; nomeEmpresa: string; cnpj: string | null } | null;
  resolucoes: { id: string; tipo: TipoResolucao; quantidade: number; documento: string | null; justificativa: string | null; usuarioNome: string; codigoMovimento: string | null; createdAt: string }[];
}
type TipoResolucao = 'NOVA_NF' | 'DEVOLUCAO' | 'AJUSTE' | 'RECONTAGEM';
type Filtro = 'abertas' | 'resolvidas' | 'todas';

const RESOLUCOES: { tipo: TipoResolucao; titulo: string; texto: string; icone: ReactNode; doc?: string; just?: string; soGestor?: boolean }[] = [
  { tipo: 'NOVA_NF', titulo: 'Chegou a NF das unidades a mais', texto: 'O fornecedor (ou o dono da mercadoria) emitiu a nota. A sobra vira saldo disponível.', icone: <IoDocumentTextOutline />, doc: 'Número da NF' },
  { tipo: 'DEVOLUCAO', titulo: 'Excedente devolvido ou retirado', texto: 'A sobra saiu do armazém. Ela é baixada sem passar pelo saldo disponível.', icone: <IoArrowUndoOutline />, doc: 'NF de devolução ou protocolo de retirada' },
  { tipo: 'AJUSTE', titulo: 'Incorporar por ajuste de inventário', texto: 'Para erro de contagem antigo, quando não há nota a receber. Vira saldo disponível com ajuste rastreável.', icone: <IoShieldCheckmarkOutline />, just: 'Justificativa (vai para a auditoria)', soGestor: true },
  { tipo: 'RECONTAGEM', titulo: 'Recontagem não confirmou', texto: 'A sobra não existe de fato. A linha de sobra é baixada.', icone: <IoSearchOutline />, just: 'O que a recontagem encontrou' },
];
const ROTULO: Record<TipoResolucao, string> = { NOVA_NF: 'Nova NF', DEVOLUCAO: 'Devolução', AJUSTE: 'Ajuste aprovado', RECONTAGEM: 'Recontagem' };
const pendente = (d: Divergencia) => d.quantidade - d.quantidadeResolvida;
const tomStatus = (s: Divergencia['status']) => (s === 'Resolvida' ? 'ok' : s === 'Parcial' ? 'info' : 'warn') as 'ok' | 'info' | 'warn';

export default function Divergencias() {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>('abertas');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<Divergencia | null>(null);
  const [antigos, setAntigos] = useState(false);
  const { usuario } = useAuth();
  const gestor = /admin|gestor/i.test(usuario?.cargo ?? '');
  const { dados, carregando, recarregar } = useCarregar(async () => (await api.get<Divergencia[]>('/divergencias', { params: { status: 'todas' } })).data);

  const todas = dados ?? [];
  const abertas = todas.filter(d => d.status !== 'Resolvida');
  const linhas = useMemo(() => todas
    .filter(d => (filtro === 'todas' ? true : filtro === 'abertas' ? d.status !== 'Resolvida' : d.status === 'Resolvida'))
    .filter(d => contem(busca, d.codigo, d.produto.nome, d.produto.sku, d.documentoOrigem, d.fornecedor?.nomeEmpresa, d.lote, d.origem)), [todas, filtro, busca]);
  const unidades = abertas.reduce((a, d) => a + pendente(d), 0);
  const valor = abertas.reduce((a, d) => a + pendente(d) * (d.produto.precoCusto || 0), 0);
  const antiga = abertas.reduce<string | null>((m, d) => (!m || d.createdAt < m ? d.createdAt : m), null);

  const colunas: Col<Divergencia>[] = [
    { key: 'c', titulo: 'Ocorrência', ordenar: d => d.createdAt, render: d => <><Code>{d.codigo}</Code><div className="cell-sub">{dataHora(d.createdAt)}</div></> },
    { key: 'p', titulo: 'Produto', principal: true, ordenar: d => d.produto.nome, render: d => <><div className="cell-title">{d.produto.nome}</div><div className="cell-sub"><Code>{d.produto.sku}</Code>{d.lote && <> · lote {d.lote}</>}{d.armazem && <> · {d.armazem.nome}</>}</div></> },
    { key: 'o', titulo: 'Origem', ordenar: d => d.origem, render: d => <><div>{d.origem}</div><div className="cell-sub">{d.documentoOrigem ?? '-'}{d.fornecedor && <> · {d.fornecedor.nomeEmpresa}</>}</div></> },
    { key: 'cont', titulo: 'Documento × contado', align: 'right', ocultarCelular: true, render: d => <span className="muted">{d.quantidadeDocumento ?? '?'} × {d.quantidadeContada ?? '?'}</span> },
    { key: 'q', titulo: 'Sobra pendente', align: 'right', ordenar: pendente, render: d => <><b className={pendente(d) > 0 ? 'qty qty--warn' : ''}>{numero(pendente(d))}</b><div className="cell-sub">de {numero(d.quantidade)} un</div></>, rodape: numero(linhas.reduce((a, d) => a + pendente(d), 0)) },
    { key: 'v', titulo: 'Valor', align: 'right', ocultarCelular: true, ordenar: d => pendente(d) * (d.produto.precoCusto || 0), render: d => moeda(pendente(d) * (d.produto.precoCusto || 0)) },
    { key: 's', titulo: 'Situação', ordenar: d => d.status, render: d => <><Badge tom={tomStatus(d.status)}>{d.status}</Badge>{d.status !== 'Resolvida' && <div className="cell-sub">{haQuanto(d.createdAt)}</div>}</> },
    { key: 'a', titulo: '', align: 'right', render: d => <button className={`btn btn--sm ${d.status !== 'Resolvida' ? 'btn--primary' : ''}`} onClick={e => { e.stopPropagation(); setAberta(d); }}>{d.status !== 'Resolvida' ? 'Resolver' : 'Ver'}</button> },
  ];

  function exportar() {
    exportarExcel('Sobras_sem_NF', [{ nome: 'Sobras sem NF', linhas, colunas: [
      { titulo: 'Ocorrência', valor: d => d.codigo }, { titulo: 'Data', valor: d => dataHora(d.createdAt) }, { titulo: 'Situação', valor: d => d.status },
      { titulo: 'SKU', valor: d => d.produto.sku }, { titulo: 'Produto', valor: d => d.produto.nome, largura: 40 }, { titulo: 'Lote', valor: d => d.lote ?? '' },
      { titulo: 'Validade', valor: d => (d.validade ? dataUTC(d.validade) : '') }, { titulo: 'Armazém', valor: d => d.armazem?.nome ?? '' },
      { titulo: 'Origem', valor: d => d.origem }, { titulo: 'Documento de origem', valor: d => d.documentoOrigem ?? '', largura: 24 },
      { titulo: 'Fornecedor', valor: d => d.fornecedor?.nomeEmpresa ?? '', largura: 30 }, { titulo: 'CNPJ', valor: d => d.fornecedor?.cnpj ?? '' },
      { titulo: 'Qtd. documento', valor: d => d.quantidadeDocumento ?? '' }, { titulo: 'Qtd. contada', valor: d => d.quantidadeContada ?? '' },
      { titulo: 'Sobra', valor: d => d.quantidade }, { titulo: 'Resolvido', valor: d => d.quantidadeResolvida }, { titulo: 'Pendente', valor: pendente },
      { titulo: 'Custo unitário', valor: d => d.produto.precoCusto ?? 0 }, { titulo: 'Valor pendente', valor: d => pendente(d) * (d.produto.precoCusto || 0) },
      { titulo: 'Resoluções', valor: d => d.resolucoes.map(r => `${ROTULO[r.tipo]} ${r.quantidade} un${r.documento ? ` (${r.documento})` : ''}`).join('; '), largura: 40 },
    ] }]);
  }

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Divergências: sobra sem NF"
        descricao="Unidades encontradas a mais no inventário ou no recebimento ficam guardadas fora do saldo disponível até ter nota, ser devolvidas ou serem aprovadas por um gestor."
        acoes={<>
          {gestor && <button className="btn" onClick={() => setAntigos(true)}><IoClipboardOutline /> Sobras de inventários já concluídos</button>}
          <button className="btn" onClick={exportar}><IoDownloadOutline /> Excel para fornecedor ou contador</button>
        </>} />

      <div className="kpis">
        <Kpi label="Sobras em aberto" valor={numero(abertas.length)} tom={abertas.length ? 'warn' : undefined} onClick={() => setFiltro('abertas')} dica={abertas.length ? 'aguardando NF, devolução ou ajuste' : 'nada pendente'} />
        <Kpi label="Unidades sem NF" valor={numero(unidades)} dica="fora do disponível: não podem ser pedidas" />
        <Kpi label="Valor a custo" valor={moeda(valor)} dica="não entra no valor do estoque" />
        <Kpi label="Mais antiga" valor={antiga ? haQuanto(antiga) : '-'} tom={antiga && Date.now() - new Date(antiga).getTime() > 15 * 86400000 ? 'bad' : undefined} dica={antiga ? `aberta em ${dataHora(antiga)}` : undefined} />
      </div>

      <Panel flush>
        <div className="toolbar">
          <Segmented valor={filtro} onChange={setFiltro} opcoes={[
            { valor: 'abertas', label: 'Em aberto', n: abertas.length },
            { valor: 'resolvidas', label: 'Resolvidas', n: todas.length - abertas.length },
            { valor: 'todas', label: 'Todas', n: todas.length },
          ]} />
          <SearchInput value={busca} onChange={setBusca} placeholder="Ocorrência, produto, NF, inventário ou fornecedor" />
        </div>
        <DataTable colunas={colunas} linhas={linhas} chave={d => d.id} onLinha={setAberta} ordemInicial={{ key: 'c', dir: 'desc' }}
          vazio={<Empty titulo={filtro === 'abertas' ? 'Nenhuma sobra pendente' : 'Nada por aqui'}>Quando um inventário ou recebimento contar mais do que o sistema ou a nota, a diferença aparece aqui.</Empty>} />
      </Panel>

      {antigos && <ModalInventariosAntigos onFechar={() => setAntigos(false)} onTrazido={() => recarregar(true)} />}
      {aberta && <ModalResolver dv={aberta} onFechar={() => setAberta(null)} onKardex={() => navigate(`/kardex/${aberta.produtoId}`)}
        onSalvo={d => { recarregar(true); setAberta(d.status === 'Resolvida' ? null : d); }} />}
    </>
  );
}

function ModalResolver({ dv, onFechar, onSalvo, onKardex }: { dv: Divergencia; onFechar: () => void; onSalvo: (d: Divergencia) => void; onKardex: () => void }) {
  const { usuario } = useAuth();
  const gestor = /admin|gestor/i.test(usuario?.cargo ?? '');
  const [tipo, setTipo] = useState<TipoResolucao | null>(null);
  const [qtd, setQtd] = useState(String(pendente(dv)));
  const [documento, setDocumento] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [salvando, setSalvando] = useState(false);
  const opcao = RESOLUCOES.find(r => r.tipo === tipo);

  async function salvar() {
    if (!tipo || !opcao) return toast.warn('Escolha como a sobra foi resolvida.');
    const n = Math.round(Number(qtd));
    if (!(n > 0) || n > pendente(dv)) return toast.warn(`Informe de 1 a ${pendente(dv)} unidade(s).`);
    if (opcao.doc && !documento.trim()) return toast.warn(`Informe: ${opcao.doc.toLowerCase()}.`);
    if (opcao.just && !justificativa.trim()) return toast.warn('Escreva a justificativa.');
    setSalvando(true);
    try {
      const { data } = await api.post<Divergencia>(`/divergencias/${dv.id}/resolver`, { tipo, quantidade: n, documento, justificativa });
      const mov = data.resolucoes.at(-1)?.codigoMovimento;
      toast.success(`${dv.codigo}: ${n} un ${tipo === 'NOVA_NF' || tipo === 'AJUSTE' ? `entraram no saldo disponível${mov ? ` (${mov})` : ''}` : 'baixadas da sobra'}.${data.status === 'Resolvida' ? ' Ocorrência resolvida.' : ` Faltam ${pendente(data)} un.`}`);
      setTipo(null); setDocumento(''); setJustificativa(''); setQtd(String(pendente(data)));
      onSalvo(data);
    } catch (e) { toast.error(msgErro(e)); } finally { setSalvando(false); }
  }

  return (
    <Modal aberto drawer tamanho="lg" onFechar={onFechar}
      titulo={<span className="row" style={{ gap: 8 }}><Code>{dv.codigo}</Code> Sobra sem NF</span>}
      descricao={`${dv.produto.nome} · ${dv.origem}${dv.documentoOrigem ? ` ${dv.documentoOrigem}` : ''}`}
      rodape={<div className="row" style={{ width: '100%' }}>
        <button className="btn btn--ghost" onClick={onKardex}>Ver Kardex do produto</button>
        <span className="spacer" />
        {dv.status !== 'Resolvida' && <button className="btn btn--primary" onClick={salvar} disabled={salvando || !tipo}><IoCheckmarkCircle /> {salvando ? 'Registrando…' : 'Registrar resolução'}</button>}
      </div>}>
      <div className="stack">
        <div className="dv-resumo">
          <div><span>No documento</span><b>{dv.quantidadeDocumento ?? '?'}</b></div>
          <div><span>Contado</span><b>{dv.quantidadeContada ?? '?'}</b></div>
          <div className="is-sobra"><span>Sobra</span><b>+{numero(dv.quantidade)}</b></div>
          <div><span>Pendente</span><b>{numero(pendente(dv))}</b></div>
        </div>
        <dl className="dv-dados">
          <dt>Produto</dt><dd><Code>{dv.produto.sku}</Code> {dv.produto.nome}</dd>
          <dt>Onde está</dt><dd>{dv.armazem?.nome ?? '-'}{dv.lote ? ` · lote ${dv.lote}` : ''}{dv.validade ? ` · validade ${dataUTC(dv.validade)}` : ''}{dv.produto.enderecoLocalizacao ? ` · ${dv.produto.enderecoLocalizacao}` : ''}</dd>
          {dv.fornecedor && <><dt>Fornecedor</dt><dd>{dv.fornecedor.nomeEmpresa}{dv.fornecedor.cnpj ? ` · ${dv.fornecedor.cnpj}` : ''}</dd></>}
          <dt>Registrada</dt><dd>{dataHora(dv.createdAt)} por {dv.criadoPor}</dd>
          {dv.observacao && <><dt>Detalhe</dt><dd>{dv.observacao}</dd></>}
        </dl>

        {dv.resolucoes.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Resolução</th><th className="num">Qtd.</th><th>Documento / justificativa</th><th>Quem</th></tr></thead>
              <tbody>
                {dv.resolucoes.map(r => (
                  <tr key={r.id}>
                    <td><Badge tom={r.tipo === 'NOVA_NF' || r.tipo === 'AJUSTE' ? 'ok' : 'info'} plain>{ROTULO[r.tipo]}</Badge>{r.codigoMovimento && <div className="cell-sub">{r.codigoMovimento}</div>}</td>
                    <td className="num"><b>{numero(r.quantidade)}</b></td>
                    <td>{r.documento}{r.documento && r.justificativa ? ' · ' : ''}{r.justificativa}</td>
                    <td>{r.usuarioNome}<div className="cell-sub">{dataHora(r.createdAt)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {dv.status === 'Resolvida' ? <Notice tom="ok">Resolvida em {dataHora(dv.resolvidaEm)}.</Notice> : (
          <>
            <div className="dv-rotulo">Como a sobra foi resolvida?</div>
            <div className="dv-opcoes" role="radiogroup">
              {RESOLUCOES.map(r => {
                const bloqueada = r.soGestor && !gestor;
                return (
                  <button key={r.tipo} type="button" role="radio" aria-checked={tipo === r.tipo} disabled={bloqueada} className="dv-opcao" onClick={() => setTipo(r.tipo)}>
                    <span className="dv-opcao__icone">{r.icone}</span>
                    <span><b>{r.titulo}</b><small>{bloqueada ? 'Só gestor ou administrador.' : r.texto}</small></span>
                  </button>
                );
              })}
            </div>
            {opcao && (
              <div className="form-grid">
                <Field label="Quantidade" className="col-3" dica={`até ${pendente(dv)}`}><input className="input" type="number" min={1} max={pendente(dv)} value={qtd} onChange={e => setQtd(e.target.value)} /></Field>
                {opcao.doc && <Field label={opcao.doc} className="col-9"><input className="input" value={documento} onChange={e => setDocumento(e.target.value)} autoFocus /></Field>}
                {opcao.just && <Field label={opcao.just} className={opcao.doc ? 'col-12' : 'col-9'}><input className="input" value={justificativa} onChange={e => setJustificativa(e.target.value)} autoFocus={!opcao.doc} /></Field>}
                {opcao.doc && <Field label="Observação (opcional)" className="col-12"><input className="input" value={justificativa} onChange={e => setJustificativa(e.target.value)} /></Field>}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ inventários concluídos antes da regra
interface ItemAntigo { produtoId: string; sku: string; nome: string; precoCusto: number | null; sistema: number; contado: number; sobra: number; registrado: number; pendente: number; disponivelAgora: number }
interface InventarioAntigo { id: string; codigo: string; descricao: string | null; concluidoEm: string | null; armazem: { id: string; nome: string } | null; itens: ItemAntigo[] }

/**
 * Inventários fechados antes desta regra puseram a sobra direto no disponível. Aqui o gestor escolhe quanto dessa
 * sobra volta para "Sobra sem NF": sai do disponível com movimento no Kardex e abre a ocorrência.
 */
function ModalInventariosAntigos({ onFechar, onTrazido }: { onFechar: () => void; onTrazido: () => void }) {
  const { dados, recarregar } = useCarregar(async () => (await api.get<InventarioAntigo[]>('/divergencias/inventarios')).data);
  const [invId, setInvId] = useState<string | null>(null);
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const lista = (dados ?? []).filter(i => i.itens.some(x => x.pendente > 0) || i.id === invId);
  const inv = lista.find(i => i.id === invId) ?? null;
  const maximo = (x: ItemAntigo) => Math.min(x.pendente, x.disponivelAgora);
  const escolher = (i: InventarioAntigo) => { setInvId(i.id); setQtds(Object.fromEntries(i.itens.map(x => [x.produtoId, String(maximo(x))]))); };

  async function trazer() {
    if (!inv) return;
    const itens = inv.itens.map(x => ({ produtoId: x.produtoId, quantidade: Math.round(Number(qtds[x.produtoId]) || 0) })).filter(x => x.quantidade > 0);
    if (!itens.length) return toast.warn('Informe a quantidade de pelo menos um item.');
    const acima = inv.itens.find(x => (Number(qtds[x.produtoId]) || 0) > maximo(x));
    if (acima) return toast.warn(`[${acima.sku}]: no máximo ${maximo(acima)}.`);
    setSalvando(true);
    try {
      const { data } = await api.post<{ ocorrencias: string[] }>(`/divergencias/inventarios/${inv.id}/trazer`, { itens, observacao: obs });
      toast.success(`${itens.reduce((a, x) => a + x.quantidade, 0)} un saíram do disponível e viraram sobra sem NF (${data.ocorrencias.join(', ')}).`);
      onTrazido(); recarregar(true); setInvId(null);
    } catch (e) { toast.error(msgErro(e)); } finally { setSalvando(false); }
  }

  return (
    <Modal aberto drawer tamanho="lg" onFechar={onFechar} titulo="Sobras de inventários já concluídos"
      descricao="Inventários fechados antes desta regra puseram a sobra direto no saldo disponível. Escolha o que deve voltar para sobra sem NF até ter nota."
      rodape={inv ? <div className="row" style={{ width: '100%' }}>
        <button className="btn btn--ghost" onClick={() => setInvId(null)}>Voltar</button><span className="spacer" />
        <button className="btn btn--primary" onClick={trazer} disabled={salvando}><IoCheckmarkCircle /> {salvando ? 'Registrando…' : 'Tirar do disponível e abrir ocorrência'}</button>
      </div> : undefined}>
      {!dados ? <Loading linhas={4} /> : !inv ? (
        lista.length === 0 ? <Empty titulo="Nada a trazer">Nenhum inventário concluído tem sobra fora de uma ocorrência.</Empty> : (
          <div className="dv-invs">
            {lista.map(i => {
              const pend = i.itens.filter(x => x.pendente > 0);
              return (
                <button key={i.id} type="button" className="dv-inv" onClick={() => escolher(i)}>
                  <span><Code>{i.codigo}</Code> {i.descricao ?? ''}</span>
                  <small>Concluído {i.concluidoEm ? dataHora(i.concluidoEm) : '-'}{i.armazem ? ` · ${i.armazem.nome}` : ''}</small>
                  <b>{pend.length} item(ns) · {numero(pend.reduce((a, x) => a + x.pendente, 0))} un de sobra fora de ocorrência</b>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div className="stack">
          <Notice tom="warn">As unidades escolhidas saem do saldo disponível (com lançamento no Kardex) e ficam como sobra sem NF até a nota chegar, serem devolvidas ou um gestor aprovar o ajuste.</Notice>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Produto</th><th className="num">Sistema × contado</th><th className="num">Sobra</th><th className="num">Já em ocorrência</th><th className="num">Disponível hoje</th><th className="num">Trazer</th></tr></thead>
              <tbody>
                {inv.itens.map(x => (
                  <tr key={x.produtoId}>
                    <td><div className="cell-title">{x.nome}</div><div className="cell-sub"><Code>{x.sku}</Code></div></td>
                    <td className="num muted">{numero(x.sistema)} × {numero(x.contado)}</td>
                    <td className="num"><b>+{numero(x.sobra)}</b></td>
                    <td className="num">{x.registrado ? numero(x.registrado) : '-'}</td>
                    <td className="num">{numero(x.disponivelAgora)}</td>
                    <td className="num" style={{ width: 120 }}>
                      {maximo(x) > 0 ? <input className="input" type="number" min={0} max={maximo(x)} value={qtds[x.produtoId] ?? ''} onChange={e => setQtds(q => ({ ...q, [x.produtoId]: e.target.value }))} aria-label={`Quantidade de ${x.nome}`} style={{ textAlign: 'right' }} />
                        : <span className="muted">{x.pendente === 0 ? 'já trazido' : 'sem saldo'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Field label="Observação (vai para a ocorrência)"><input className="input" value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: sobra confirmada na recontagem de 05/11" /></Field>
        </div>
      )}
    </Modal>
  );
}
