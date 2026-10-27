import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { IoFlashOutline, IoPlayOutline, IoCheckmarkDoneOutline, IoArrowUndoOutline, IoDocumentTextOutline, IoMapOutline, IoCloseOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { dataUTC, haQuanto, numero } from '../../lib/format';
import { exportarPDF } from '../../lib/exportar';
import { Badge, Code, Empty, Loading, Loc, Modal, Notice, PageHeader, Panel, useDialogo } from '../../components/ui';
import { MapaRota } from './MapaRota';
import { TOM_ONDA, economia, metros, type OndaDetalhe, type OndaLista, type SugestaoResp } from './wms';
import './wms.css';

const TOM_PRIORIDADE: Record<string, 'bad' | 'warn' | undefined> = { Urgente: 'bad', Alta: 'warn' };

export default function Ondas() {
  const navigate = useNavigate();
  const [selecionadas, setSelecionadas] = useState<string[] | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const { dados, recarregar } = useCarregar(async () => {
    const [s, o] = await Promise.all([api.get<SugestaoResp>('/wms/ondas/sugestao'), api.get<OndaLista[]>('/wms/ondas')]);
    return { sugestao: s.data, ondas: o.data };
  });
  // Até o usuário mexer, a seleção é a sugerida pelo sistema.
  const sel = selecionadas ?? dados?.sugestao.sugestao.ordemIds ?? [];
  const chaveSel = [...sel].sort().join(',');
  const { dados: sim } = useCarregar(async () => (sel.length >= 2 ? (await api.post<{ distanciaOnda: number; distanciaIndividual: number; semPosicao: number }>('/wms/ondas/simular', { ordemIds: sel })).data : null), [chaveSel]);

  const ativas = dados?.ondas.filter(o => o.status === 'Aberta' || o.status === 'Em separação') ?? [];
  const concluidas = dados?.ondas.filter(o => o.status === 'Concluída') ?? [];
  const economizado = concluidas.reduce((a, o) => a + Math.max(0, (o.distanciaIndividual ?? 0) - (o.distanciaOnda ?? 0)), 0);
  const alternar = (id: string) => setSelecionadas(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);

  async function criar() {
    try {
      const r = await api.post<{ id: string; codigo: string }>('/wms/ondas', { ordemIds: sel });
      toast.success(`Onda ${r.data.codigo} criada com ${sel.length} ordens.`);
      setSelecionadas(null); recarregar(true); setAberta(r.data.id);
    } catch (e) { toast.error(msgErro(e)); }
  }

  if (!dados) return <Loading />;
  const pend = dados.sugestao.pendentes;
  const eco = sim ? economia(sim.distanciaOnda, sim.distanciaIndividual) : null;

  return (
    <div className="wms">
      <PageHeader titulo="Ondas de separação"
        descricao="Junte várias ordens numa única volta pelo armazém. A coleta sai na ordem da rota mais curta e cada item já indica em qual caixa vai."
        acoes={<button className="btn" onClick={() => navigate('/layout')}><IoMapOutline /> Mapa do armazém</button>} />

      <dl className="wms-resumo">
        <div><dt>Prontas para onda</dt><dd>{numero(pend.length)}</dd><span>ordens de saída pendentes fora de onda</span></div>
        <div><dt>Ondas em andamento</dt><dd>{numero(ativas.length)}</dd><span>{numero(ativas.reduce((a, o) => a + o.ordens.length, 0))} ordens dentro delas</span></div>
        <div><dt>Ondas concluídas</dt><dd>{numero(concluidas.length)}</dd><span>{numero(concluidas.reduce((a, o) => a + o.ordens.length, 0))} ordens separadas em lote</span></div>
        <div><dt>Caminhada evitada</dt><dd className="up">{metros(economizado)}</dd><span>comparando com separar ordem por ordem</span></div>
      </dl>
      {!dados.sugestao.mapeado && <div className="mb-16"><Notice tom="warn" acao={<button className="btn btn--sm" onClick={() => navigate('/layout')}>Montar mapa</button>}>O armazém ainda não tem posições no mapa. As ondas funcionam, mas sem rota otimizada: a coleta sai agrupada por produto.</Notice></div>}

      <div className="grid grid-main-side">
        <Panel flush titulo="Montar onda" descricao="A sugestão começa pela ordem mais urgente e junta as que passam pelas mesmas ruas."
          acoes={<>
            <button className="btn btn--sm" onClick={() => setSelecionadas(null)} disabled={selecionadas === null}><IoFlashOutline /> Sugerir</button>
            <button className="btn btn--sm btn--ghost" onClick={() => setSelecionadas([])} disabled={!sel.length}>Limpar</button>
          </>}>
          {pend.length === 0 ? <Empty titulo="Nenhuma ordem esperando">Ordens de saída pendentes aparecem aqui para formar ondas.</Empty> : (
            <table className="table table--compacta onda-pend">
              <thead><tr><th style={{ width: 36 }} /><th>Ordem</th><th>Prioridade</th><th className="hide-sm">Ruas</th><th className="num">Itens</th><th className="num">Espera</th></tr></thead>
              <tbody>
                {pend.map(o => (
                  <tr key={o.id} className={sel.includes(o.id) ? 'is-selected' : ''} onClick={() => alternar(o.id)} style={{ cursor: 'pointer' }}>
                    <td><input type="checkbox" checked={sel.includes(o.id)} onChange={() => alternar(o.id)} onClick={e => e.stopPropagation()} aria-label={`Incluir ${o.codigo}`} /></td>
                    <td><Code>{o.codigo}</Code><div className="cell-sub">{o.solicitante}</div></td>
                    <td><Badge tom={TOM_PRIORIDADE[o.prioridade]} plain>{o.prioridade}</Badge></td>
                    <td className="hide-sm"><span className="row" style={{ gap: 4 }}>{o.ruas.map(r => <span key={r} className="rua-chip">{r}</span>)}{o.semPosicao ? <small className="muted">+{o.semPosicao} sem posição</small> : null}</span></td>
                    <td className="num">{o.linhas}<div className="cell-sub">{numero(o.unidades)} un</div></td>
                    <td className="num nowrap">{haQuanto(o.createdAt).replace(/^há /, '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {pend.length > 0 && (
            <div className="onda-rodape">
              <div className="onda-rodape__sim">
                {sel.length < 2 ? <span className="muted">Escolha pelo menos 2 ordens.</span> : !sim ? <span className="muted">Calculando a rota…</span> : (
                  <>
                    <span>Uma a uma: <b>{metros(sim.distanciaIndividual)}</b></span>
                    <span>Em onda: <b>{metros(sim.distanciaOnda)}</b></span>
                    {eco !== null && <Badge tom="ok">−{eco}% de caminhada</Badge>}
                  </>
                )}
              </div>
              <button className="btn btn--primary" disabled={sel.length < 2} onClick={criar}>Criar onda com {sel.length} ordens</button>
            </div>
          )}
        </Panel>

        <Panel flush titulo="Ondas" descricao="Abertas e em separação primeiro">
          {dados.ondas.length === 0 ? <Empty titulo="Nenhuma onda ainda">Monte a primeira ao lado.</Empty> : (
            <ul className="ondas-lista">
              {[...ativas, ...dados.ondas.filter(o => !ativas.includes(o))].slice(0, 20).map(o => {
                const e = economia(o.distanciaOnda, o.distanciaIndividual);
                return (
                  <li key={o.id}>
                    <button type="button" onClick={() => setAberta(o.id)}>
                      <span className="row" style={{ justifyContent: 'space-between' }}><b><Code>{o.codigo}</Code> {o.status === 'Cancelada' ? '' : `${o.ordens.length} ordens`}</b><Badge tom={TOM_ONDA[o.status]}>{o.status}</Badge></span>
                      {o.status !== 'Cancelada' && <span className="meter"><i style={{ width: `${o.linhas ? (o.marcadas / o.linhas) * 100 : 0}%` }} /></span>}
                      <small>{o.status === 'Cancelada' ? 'Desfeita: as ordens voltaram para a fila' : `${o.marcadas}/${o.linhas} linhas · ${numero(o.unidades)} un${e !== null ? ` · −${e}% de caminhada` : ''}`} · {o.separadorNome ?? o.criadoPor} · {haQuanto(o.concluidaEm ?? o.iniciadaEm ?? o.createdAt)}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {aberta && <DetalheOnda id={aberta} onFechar={() => setAberta(null)} onAlterado={() => recarregar(true)} />}
    </div>
  );
}

function DetalheOnda({ id, onFechar, onAlterado }: { id: string; onFechar: () => void; onAlterado: () => void }) {
  const { confirmar } = useDialogo();
  const { dados: o, recarregar } = useCarregar(async () => (await api.get<OndaDetalhe>(`/wms/ondas/${id}`)).data, [id]);
  const [foco, setFoco] = useState<number | undefined>();
  const [ocupado, setOcupado] = useState(false);
  // Marcação otimista: o check responde na hora, sem esperar o servidor (coletor com rede lenta).
  const [otimista, setOtimista] = useState<Record<string, boolean>>({});
  const feito = (c: { produto: { id: string }; marcado: boolean }) => otimista[c.produto.id] ?? c.marcado;
  const proxima = useMemo(() => o?.coleta.find(c => !(otimista[c.produto.id] ?? c.marcado))?.seq, [o, otimista]);
  const atual = foco ?? proxima; // a próxima parada não coletada, ou a que está sob o mouse

  if (!o) return <Modal aberto drawer tamanho="xl" onFechar={onFechar} titulo="Carregando onda…"><Loading /></Modal>;
  const emSeparacao = o.status === 'Em separação';
  const aberta = o.status === 'Aberta';
  const feitas = new Set(o.coleta.filter(feito).map(c => c.produto.id)).size;
  const produtos = new Set(o.coleta.map(c => c.produto.id)).size;
  const eco = economia(o.distanciaOnda, o.distanciaIndividual);
  const atualizar = () => { recarregar(true); onAlterado(); };

  async function acao(fn: () => Promise<unknown>, ok: string) {
    setOcupado(true);
    try { await fn(); toast.success(ok); atualizar(); } catch (e) { toast.error(msgErro(e)); } finally { setOcupado(false); }
  }
  async function marcar(produtoId: string, marcado: boolean) {
    setOtimista(x => ({ ...x, [produtoId]: marcado }));
    try { await api.put(`/wms/ondas/${id}/linhas`, { produtoId, marcado }); recarregar(true); } catch (e) {
      setOtimista(x => ({ ...x, [produtoId]: !marcado }));
      toast.error(msgErro(e));
    }
  }
  async function concluir() {
    const faltam = produtos - feitas;
    if (faltam) {
      const ok = await confirmar({ titulo: `Concluir com ${faltam} produto(s) sem conferência?`, mensagem: 'As ordens serão baixadas do estoque com as quantidades pedidas.', confirmar: 'Concluir mesmo assim', perigo: true });
      if (!ok) return;
    }
    acao(() => api.post(`/wms/ondas/${id}/concluir`, { forcar: true }), `Onda ${o!.codigo} concluída: ${o!.ordens.length} ordens baixadas.`);
  }
  async function desfazer() {
    const ok = await confirmar({ titulo: `Desfazer a onda ${o!.codigo}?`, mensagem: 'As ordens voltam para a fila como pendentes, sem perder os itens.', confirmar: 'Desfazer onda', perigo: true });
    if (ok) acao(() => api.post(`/wms/ondas/${id}/cancelar`), 'Onda desfeita. As ordens voltaram para a fila.');
  }
  function imprimir() {
    exportarPDF({
      arquivo: `Onda_${o!.codigo}`, titulo: `Onda ${o!.codigo} · lista de coleta`, paisagem: true,
      resumo: [`${o!.ordens.length} ordens · rota de ${metros(o!.distanciaOnda)}`, `Caixas: ${o!.ordens.map(x => `${x.tote}=${x.codigo}`).join('  ')}`],
      colunas: [
        { titulo: '#', valor: (c: OndaDetalhe['coleta'][number]) => c.seq },
        { titulo: 'Endereço', valor: c => c.endereco?.codigo ?? 'sem posição' },
        { titulo: 'Produto', valor: c => `[${c.produto.sku}] ${c.produto.nome}`, largura: 45 },
        { titulo: 'Lote', valor: c => c.lote ?? '-' },
        { titulo: 'Pegar', valor: c => c.quantidade },
        { titulo: 'Distribuir', valor: c => c.destino.map(d => `${d.tote}×${d.quantidade}`).join('  '), largura: 30 },
        { titulo: 'OK', valor: () => '[   ]' },
      ],
      linhas: o!.coleta,
    });
  }

  return (
    <Modal aberto drawer tamanho="xl" onFechar={onFechar}
      titulo={<span className="row" style={{ gap: 8 }}><Code>{o.codigo}</Code> Onda com {o.ordens.length} ordens <Badge tom={TOM_ONDA[o.status]}>{o.status}</Badge></span>}
      descricao={`Criada por ${o.criadoPor} ${haQuanto(o.createdAt)}${o.separadorNome ? ` · separador: ${o.separadorNome}` : ''}`}
      rodape={<div className="row" style={{ width: '100%', justifyContent: 'space-between' }}>
        <div className="row">
          {(aberta || emSeparacao) && <button className="btn btn--ghost" onClick={desfazer} disabled={ocupado}><IoArrowUndoOutline /> Desfazer onda</button>}
          <button className="btn" onClick={imprimir}><IoDocumentTextOutline /> Lista de coleta</button>
        </div>
        <div className="row">
          {aberta && <button className="btn btn--primary" onClick={() => acao(() => api.post(`/wms/ondas/${id}/iniciar`), 'Separação iniciada.')} disabled={ocupado}><IoPlayOutline /> Iniciar separação</button>}
          {emSeparacao && <button className="btn btn--primary" onClick={concluir} disabled={ocupado}><IoCheckmarkDoneOutline /> Concluir onda ({feitas}/{produtos})</button>}
        </div>
      </div>}>
      <div className="onda-det">
        <dl className="onda-det__numeros">
          <div><dt>Rota da onda</dt><dd>{metros(o.distanciaOnda)}</dd></div>
          <div><dt>Ordem por ordem</dt><dd>{metros(o.distanciaIndividual)}</dd></div>
          <div><dt>Economia</dt><dd className="up">{eco !== null ? `−${eco}%` : '-'}</dd></div>
          <div><dt>Paradas</dt><dd>{o.coleta.length}</dd></div>
          <div><dt>Coletado</dt><dd>{feitas}/{produtos}</dd></div>
        </dl>
        <div className="caixas" aria-label="Caixas por ordem">
          {o.ordens.map(x => <span key={x.id} className="caixa"><b>{x.tote}</b><span><Code>{x.codigo}</Code><small>{x.solicitante}{x.status === 'Concluída' ? ' · concluída' : ''}</small></span></span>)}
        </div>
        {aberta && <Notice tom="info">Pegue {o.ordens.length} caixas e etiquete com as letras acima. Ao iniciar, as ordens passam para "Em separação" e saem da fila do app.</Notice>}
        {o.rota.semPosicao > 0 && <Notice tom="warn">{o.rota.semPosicao} parada(s) sem posição no mapa ficaram no fim da rota.</Notice>}

        <div className="onda-det__corpo">
          <div className="onda-det__mapa"><MapaRota mapa={o.mapa} rota={o.rota} coleta={o.coleta.map(c => ({ ...c, marcado: feito(c) }))} atual={atual} /></div>
          <ol className="coleta">
            {o.coleta.map(c => (
              <li key={`${c.seq}`} className={`${feito(c) ? 'is-feito' : ''} ${atual === c.seq ? 'is-atual' : ''}`} onMouseEnter={() => setFoco(c.seq)} onMouseLeave={() => setFoco(undefined)}>
                <span className="coleta__seq">{c.seq}</span>
                <span className="coleta__onde">{c.endereco ? <Loc>{c.endereco.codigo}</Loc> : <Loc />}{c.endereco && <small>nível {c.endereco.nivel}</small>}</span>
                <span className="coleta__oque">
                  <b>{c.produto.nome}</b>
                  <small><Code>{c.produto.sku}</Code>{c.lote ? ` · lote ${c.lote}` : ''}{c.validade ? ` · vence ${dataUTC(c.validade)}` : ''}{c.falta ? <span className="down"> · falta {c.falta}</span> : null}</small>
                  <span className="coleta__destino">{c.destino.map(d => <span key={d.ordemId} className="caixa-mini" title={d.codigo}><b>{d.tote}</b>×{d.quantidade}</span>)}</span>
                </span>
                <span className="coleta__qtd"><b>{numero(c.quantidade)}</b><small>un</small></span>
                <label className="coleta__ok" title={emSeparacao ? 'Marcar como coletado' : 'Inicie a separação para marcar'}>
                  <input type="checkbox" checked={feito(c)} disabled={!emSeparacao} onChange={e => marcar(c.produto.id, e.target.checked)} aria-label={`Coletado: ${c.produto.nome}`} />
                </label>
              </li>
            ))}
          </ol>
        </div>
        {o.status === 'Cancelada' && <Notice tom="info"><IoCloseOutline /> Onda desfeita: as ordens voltaram para a fila.</Notice>}
      </div>
    </Modal>
  );
}
