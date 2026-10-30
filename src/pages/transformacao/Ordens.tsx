import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { IoCheckmarkCircleOutline, IoCloseCircleOutline, IoArrowUndoOutline, IoPlayOutline, IoGitNetworkOutline, IoShieldCheckmarkOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { contem, dataHora, dataUTC, numero } from '../../lib/format';
import { DataTable, type Col } from '../../components/DataTable';
import { Badge, Code, Empty, Loading, Modal, Notice, Panel, SearchInput, Segmented, useDialogo } from '../../components/ui';
import { ROTULO_MOV, TOM_FAIXA, TOM_STATUS, qtd, type Ordem, type OrdemDetalhe, type StatusOrdem } from './tf';
import { ReguaRendimento } from './Rendimento';

export function Ordens({ ordens, onExecutar, onRastrear, onAlterado }: { ordens: Ordem[]; onExecutar: (o: Ordem) => void; onRastrear: (lote: string) => void; onAlterado: () => void }) {
  const [filtro, setFiltro] = useState<'todas' | StatusOrdem>('todas');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const conta = (s: StatusOrdem) => ordens.filter(o => o.status === s).length;
  const linhas = useMemo(() => ordens.filter(o => (filtro === 'todas' || o.status === filtro) && contem(busca, o.codigo, o.produto.nome, o.produto.codigo, o.loteCodigo, o.receita?.codigo, o.executadoPor, o.notaFiscal, o.requisicao?.codigo)), [ordens, filtro, busca]);

  const colunas: Col<Ordem>[] = [
    { key: 'c', titulo: 'OT', ordenar: o => o.codigo, render: o => <><Code>{o.codigo}</Code><div className="cell-sub">{o.notaFiscal ? `NF ${o.notaFiscal} · ` : ''}{dataHora(o.concluidaEm ?? o.executadaEm ?? o.createdAt)}</div></> },
    { key: 'p', titulo: 'Produto', principal: true, ordenar: o => o.produto.nome, render: o => <><div className="cell-title">{o.produto.nome}</div><div className="cell-sub">{o.receita ? `${o.receita.codigo} v${o.receita.versao}` : 'Sem receita'}{o.loteCodigo ? ` · lote ${o.loteCodigo}` : ''}</div></> },
    { key: 'q', titulo: 'Produzido', align: 'right', ordenar: o => o.quantidadeProduzida ?? 0, render: o => <><b>{o.quantidadeProduzida !== null ? qtd(o.quantidadeProduzida) : '-'}</b><span className="muted"> / {qtd(o.quantidadePlanejada, o.produto.unidade)}</span></> },
    { key: 'r', titulo: 'Rendimento', align: 'right', ordenar: o => o.rendimento ?? -1, render: o => (o.rendimento !== null ? <Badge tom={TOM_FAIXA[o.faixa ?? '']}>{numero(o.rendimento, 1)}%</Badge> : <span className="muted">-</span>) },
    { key: 's', titulo: 'Situação', ordenar: o => o.status, render: o => <Badge tom={TOM_STATUS[o.status]}>{o.status}</Badge> },
    { key: 'u', titulo: 'Executado por', ocultarCelular: true, render: o => <>{o.executadoPor ?? '-'}{o.aprovadoPor && <div className="cell-sub">aprovado: {o.aprovadoPor}</div>}</> },
  ];

  return (
    <>
      <Panel flush>
        <div className="toolbar">
          <Segmented valor={filtro} onChange={setFiltro} opcoes={[
            { valor: 'todas', label: 'Todas', n: ordens.length }, { valor: 'Aguardando aprovação', label: 'Aguardando aprovação', n: conta('Aguardando aprovação') },
            { valor: 'Planejada', label: 'Planejadas', n: conta('Planejada') }, { valor: 'Concluída', label: 'Concluídas', n: conta('Concluída') },
            { valor: 'Estornada', label: 'Estornadas', n: conta('Estornada') }, { valor: 'Cancelada', label: 'Canceladas', n: conta('Cancelada') },
          ]} />
          <SearchInput value={busca} onChange={setBusca} placeholder="OT, NF, produto, lote ou pessoa" />
        </div>
        <DataTable colunas={colunas} linhas={linhas} chave={o => o.id} onLinha={o => setAberta(o.id)} ordemInicial={{ key: 'c', dir: 'desc' }} destaque={o => o.status === 'Aguardando aprovação'}
          vazio={<Empty titulo="Nenhuma ordem de transformação">Use "Nova transformação" para registrar a primeira.</Empty>} />
      </Panel>
      {aberta && <DetalheOrdem id={aberta} onFechar={() => setAberta(null)} onExecutar={o => { setAberta(null); onExecutar(o); }} onRastrear={l => { setAberta(null); onRastrear(l); }} onAlterado={onAlterado} />}
    </>
  );
}

function DetalheOrdem({ id, onFechar, onExecutar, onRastrear, onAlterado }: { id: string; onFechar: () => void; onExecutar: (o: Ordem) => void; onRastrear: (lote: string) => void; onAlterado: () => void }) {
  const { pedirTexto } = useDialogo();
  const { dados: o, recarregar } = useCarregar(async () => (await api.get<OrdemDetalhe>(`/tf/ordens/${id}`)).data, [id]);
  const [enviando, setEnviando] = useState(false);

  async function acao(caminho: string, corpo: object, msg: string) {
    setEnviando(true);
    try { await api.post(`/tf/ordens/${id}/${caminho}`, corpo); toast.success(msg); recarregar(true); onAlterado(); }
    catch (err) { toast.error(msgErro(err)); } finally { setEnviando(false); }
  }
  const aprovar = async () => {
    const parecer = await pedirTexto({ titulo: `Aprovar ${o?.codigo}?`, mensagem: 'O estoque segregado será movimentado agora. A aprovação fica registrada com o seu nome.', confirmar: 'Aprovar', pedirTexto: { label: 'Parecer (opcional)' } });
    if (parecer !== null) acao('aprovar', { parecer }, 'Ordem aprovada e lançada no estoque.');
  };
  const reprovar = async () => {
    const motivo = await pedirTexto({ titulo: `Reprovar ${o?.codigo}?`, mensagem: 'Nada é movimentado. A ordem fica cancelada com o motivo.', confirmar: 'Reprovar', perigo: true, pedirTexto: { label: 'Motivo', obrigatorio: true } });
    if (motivo) acao('cancelar', { motivo }, 'Ordem reprovada.');
  };
  const cancelar = async () => {
    const motivo = await pedirTexto({ titulo: `Cancelar ${o?.codigo}?`, confirmar: 'Cancelar ordem', perigo: true, pedirTexto: { label: 'Motivo', obrigatorio: true } });
    if (motivo) acao('cancelar', { motivo }, 'Ordem cancelada.');
  };
  const estornar = async () => {
    const motivo = await pedirTexto({ titulo: `Estornar ${o?.codigo}?`, mensagem: 'Os insumos voltam para os lotes de origem e o produto gerado sai. Nada é apagado: o estorno vira novos registros.', confirmar: 'Estornar', perigo: true, pedirTexto: { label: 'Motivo do estorno', obrigatorio: true } });
    if (motivo) acao('estornar', { motivo }, 'Ordem estornada.');
  };

  const consumos = o?.itens.filter(i => i.papel === 'CONSUMO') ?? [];
  const gerados = o?.itens.filter(i => i.papel === 'PRODUTO' || i.papel === 'SUBPRODUTO') ?? [];
  const perdas = o?.itens.filter(i => i.papel === 'PERDA') ?? [];

  return (
    <Modal aberto drawer tamanho="lg" onFechar={onFechar}
      titulo={o ? <span className="row" style={{ gap: 8 }}><Code>{o.codigo}</Code> {o.produto.nome}</span> : 'Ordem de transformação'}
      descricao={o ? `${o.receita ? `Receita ${o.receita.codigo} v${o.receita.versao}` : 'Sem receita'} · aberta por ${o.criadoPor} em ${dataHora(o.createdAt)}` : undefined}
      rodape={o && (
        <div className="row" style={{ width: '100%', justifyContent: 'flex-end' }}>
          {o.status === 'Planejada' && <><button className="btn btn--ghost" onClick={cancelar} disabled={enviando}><IoCloseCircleOutline /> Cancelar</button><button className="btn btn--primary" onClick={() => onExecutar(o)}><IoPlayOutline /> Executar</button></>}
          {o.status === 'Aguardando aprovação' && <><button className="btn" onClick={reprovar} disabled={enviando}><IoCloseCircleOutline /> Reprovar</button><button className="btn btn--primary" onClick={aprovar} disabled={enviando}><IoCheckmarkCircleOutline /> Aprovar</button></>}
          {o.status === 'Concluída' && <button className="btn" onClick={estornar} disabled={enviando}><IoArrowUndoOutline /> Estornar</button>}
        </div>
      )}>
      {!o ? <Loading linhas={5} /> : (
        <div className="tf-detalhe">
          <div className="row" style={{ gap: 6 }}>
            <Badge tom={TOM_STATUS[o.status]}>{o.status}</Badge>
            {o.faixa && <Badge tom={TOM_FAIXA[o.faixa]} plain>{o.faixa === 'OK' ? 'Dentro da tolerância' : o.faixa === 'Sem receita' ? 'Sem receita' : o.faixa === 'Justificar' ? 'Desvio justificado' : 'Desvio com aprovação'}</Badge>}
            {o.loteCodigo && o.status === 'Concluída' && <button className="btn btn--sm btn--ghost" onClick={() => onRastrear(o.loteCodigo!)}><IoGitNetworkOutline /> Rastrear lote {o.loteCodigo}</button>}
          </div>
          {o.status === 'Aguardando aprovação' && <Notice tom="warn">Desvio acima do limite. Um gestor diferente de quem apontou ({o.executadoPor}) precisa aprovar para o estoque ser movimentado.</Notice>}
          {o.motivoCancelamento && <Notice tom="bad">{o.status === 'Estornada' ? 'Estornada' : 'Cancelada'}: {o.motivoCancelamento}</Notice>}

          <div className="tf-numeros">
            <div><span>Planejado</span><b>{qtd(o.quantidadePlanejada, o.produto.unidade)}</b></div>
            <div><span>Produzido</span><b>{o.quantidadeProduzida !== null ? qtd(o.quantidadeProduzida, o.produto.unidade) : '-'}</b></div>
            <div><span>Nota fiscal</span><b>{o.notaFiscal ?? '-'}</b></div>
            <div><span>Lote gerado</span><b>{o.loteCodigo ?? '-'}</b></div>
            <div><span>Validade</span><b>{dataUTC(o.validade)}</b></div>
          </div>
          {o.receita && o.rendimento !== null && <ReguaRendimento rendimento={o.rendimento} aviso={o.receita.toleranciaAviso} bloqueio={o.receita.toleranciaBloqueio} />}
          {o.justificativa && <div className="tf-citacao"><span>Justificativa de {o.executadoPor}</span>{o.justificativa}</div>}

          <h3 className="tf-sub">Consumo: padrão × real</h3>
          <table className="table">
            <thead><tr><th>Material</th><th className="num">Padrão</th><th className="num">Real</th><th className="num">Variação</th></tr></thead>
            <tbody>
              {consumos.map(c => {
                const v = c.quantidadePadrao ? ((c.quantidade - c.quantidadePadrao) / c.quantidadePadrao) * 100 : null;
                const tol = o.receita && v !== null ? (Math.abs(v) <= o.receita.toleranciaAviso ? 'ok' : Math.abs(v) <= o.receita.toleranciaBloqueio ? 'warn' : 'bad') : '';
                return (
                  <tr key={c.id}>
                    <td>{c.material?.nome}<div className="cell-sub"><Code>{c.material?.codigo}</Code>{c.lote && ` · lote pedido ${c.lote.codigo}`}</div></td>
                    <td className="num">{c.quantidadePadrao !== null ? qtd(c.quantidadePadrao, c.material?.unidade) : '-'}</td>
                    <td className="num"><b>{qtd(c.quantidade, c.material?.unidade)}</b></td>
                    <td className="num">{v !== null ? <span className={`tf-tom--${tol}`}>{v > 0 ? '+' : ''}{numero(v, 1)}%</span> : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {(gerados.length > 0 || perdas.length > 0) && (
            <>
              <h3 className="tf-sub">Gerado e perdido</h3>
              <ul className="tf-lista">
                {gerados.map(g => <li key={g.id}><Badge tom={g.papel === 'PRODUTO' ? 'ok' : 'warn'} plain>{g.papel === 'PRODUTO' ? 'Produto' : 'Subproduto'}</Badge><span>{g.material?.nome}</span><b>{qtd(g.quantidade, g.material?.unidade)}</b>{g.lote && <Code>{g.lote.codigo}</Code>}</li>)}
                {perdas.map(p => <li key={p.id}><Badge tom="bad" plain>Perda</Badge><span>{p.material?.nome ?? 'Processo'} · {p.motivo}</span><b>{qtd(p.quantidade, p.material?.unidade)}</b></li>)}
              </ul>
            </>
          )}

          {o.balanco && (
            <>
              <h3 className="tf-sub">Balanço de massa ({o.balanco.unidade})</h3>
              <div className="tf-balanco">
                <div><span>Entrou</span><b>{qtd(o.balanco.entrada)}</b></div>
                <div><span>Produto</span><b>{qtd(o.balanco.produto)}</b></div>
                <div><span>Subprodutos</span><b>{qtd(o.balanco.subprodutos)}</b></div>
                <div><span>Perdas declaradas</span><b>{qtd(o.balanco.perdas)}</b></div>
                <div className={Math.abs(o.balanco.naoExplicado) > 0.001 ? 'is-alerta' : ''}><span>Não explicado</span><b>{qtd(o.balanco.naoExplicado)}</b></div>
              </div>
            </>
          )}

          {o.movimentos.length > 0 && (
            <>
              <h3 className="tf-sub">Lançamentos no estoque segregado</h3>
              <table className="table tf-tabela-mini">
                <tbody>
                  {o.movimentos.map(m => (
                    <tr key={m.id}>
                      <td><Badge tom={m.quantidade > 0 ? 'ok' : 'warn'} plain>{ROTULO_MOV[m.tipo] ?? m.tipo}</Badge></td>
                      <td>{m.material.nome}<div className="cell-sub">lote {m.lote?.codigo ?? '-'} · {dataHora(m.dataHora)} · {m.usuario}</div></td>
                      <td className="num"><b className={m.quantidade > 0 ? 'up' : 'down'}>{m.quantidade > 0 ? '+' : '−'}{qtd(Math.abs(m.quantidade), m.material.unidade)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3 className="tf-sub"><IoShieldCheckmarkOutline style={{ verticalAlign: -2 }} /> Trilha de auditoria</h3>
          <ol className="tf-trilha">
            {o.eventos.map(e => (
              <li key={e.id}>
                <b>{e.acao}</b> · {dataHora(e.dataHora)} · {e.usuario}
                <div>{e.resumo}</div>
                <code title={e.hash}>#{e.seq} {e.hash.slice(0, 12)}…</code>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  );
}
