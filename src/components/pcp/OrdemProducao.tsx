/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import {
  IoPlayOutline, IoPauseOutline, IoCheckmarkDoneOutline, IoCloseCircleOutline, IoPencilOutline, IoTrashOutline, IoArrowUndoOutline,
  IoPrintOutline, IoSendOutline, IoReturnDownBackOutline, IoAddOutline,
} from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { dataHora, dataUTC, hojeISO, moeda, numero } from '../../lib/format';
import { exportarPDF } from '../../lib/exportar';
import type { Armazem, Produto } from '../../lib/tipos';
import {
  PRIORIDADES, ROTULO_MATERIAL, STATUS_ABERTOS, TOM_MATERIAL, TOM_PRIORIDADE, TOM_STATUS, paraInput,
  type OrdemDetalhe, type OrdemProducao, type Recurso,
} from '../../lib/pcp';
import { ProdutoPicker } from '../ProdutoPicker';
import { Badge, Code, Field, Loading, Modal, Notice, useDialogo } from '../ui';
import { SelectArmazem } from '../EstoqueModais';

export interface CadastrosPCP { produtos: Produto[]; recursos: Recurso[]; armazens: Armazem[] }

/** Carrega o que os formulários de OP precisam (produtos com receita, recursos e armazéns). */
export function useCadastrosPCP() {
  const [dados, setDados] = useState<CadastrosPCP>({ produtos: [], recursos: [], armazens: [] });
  useEffect(() => {
    Promise.all([api.get<Produto[]>('/produtos'), api.get<{ recursos: Recurso[] }>('/pcp/recursos'), api.get<Armazem[]>('/armazens')])
      .then(([p, r, a]) => setDados({ produtos: p.data, recursos: r.data.recursos.filter(x => x.ativo), armazens: a.data }))
      .catch(() => {});
  }, []);
  return dados;
}

export function StatusOPBadge({ op }: { op: Pick<OrdemProducao, 'status' | 'atrasada'> }) {
  return <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><Badge tom={TOM_STATUS[op.status]}>{op.status}</Badge>{op.atrasada && <Badge tom="bad" plain>Atrasada</Badge>}</span>;
}

export function MaterialBadge({ op }: { op: Pick<OrdemProducao, 'material'> }) {
  if (!op.material) return null;
  const m = op.material;
  return <Badge tom={TOM_MATERIAL[m.status]} plain>{m.status === 'Parcial' ? `Material p/ ${numero(m.podeProduzir)}` : ROTULO_MATERIAL[m.status]}</Badge>;
}

export function Progresso({ op }: { op: Pick<OrdemProducao, 'quantidadeProduzida' | 'quantidadePlanejada' | 'progresso'> }) {
  return (
    <div className="op-prog" title={`${op.quantidadeProduzida} de ${op.quantidadePlanejada}`}>
      <div className="meter"><i style={{ width: `${op.progresso}%` }} /></div>
      <span>{numero(op.quantidadeProduzida)}/{numero(op.quantidadePlanejada)}</span>
    </div>
  );
}

// ------------------------------------------------------------------ criar / editar OP

interface FormOP {
  produtoId: string; quantidade: string; inicioPrevisto: string; entregaPrevista: string; recursoId: string; prioridade: string;
  armazemId: string; loteProducao: string; validade: string; observacao: string; liberar: boolean;
}

export function ModalOP({ cad, ordem, inicial, onFechar, onSalvo }: {
  cad: CadastrosPCP; ordem?: OrdemProducao | null; inicial?: Partial<FormOP>; onFechar: () => void; onSalvo: (op: OrdemProducao) => void;
}) {
  const fabricados = useMemo(() => cad.produtos.filter(p => (p.ingredientes?.length ?? 0) > 0), [cad.produtos]);
  const padraoArm = cad.armazens.find(a => a.padrao)?.id ?? '';
  const [f, setF] = useState<FormOP>(() => ordem ? {
    produtoId: ordem.produtoId, quantidade: String(ordem.quantidadePlanejada), inicioPrevisto: paraInput(ordem.inicioPrevisto), entregaPrevista: paraInput(ordem.entregaPrevista),
    recursoId: ordem.recursoId ?? '', prioridade: ordem.prioridade, armazemId: ordem.armazemId ?? '', loteProducao: ordem.loteProducao ?? '',
    validade: paraInput(ordem.validade), observacao: ordem.observacao ?? '', liberar: false,
  } : { produtoId: '', quantidade: '', inicioPrevisto: hojeISO(), entregaPrevista: '', recursoId: '', prioridade: 'Normal', armazemId: '', loteProducao: '', validade: '', observacao: '', liberar: false, ...inicial });
  const [salvando, setSalvando] = useState(false);
  const produto = cad.produtos.find(p => p.id === f.produtoId);
  const qtd = Math.max(0, Math.round(Number(f.quantidade) || 0));
  const set = (k: keyof FormOP, v: string | boolean) => setF(x => ({ ...x, [k]: v }));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f.produtoId) return toast.warn('Escolha o produto.');
    setSalvando(true);
    try {
      const corpo = { ...f, quantidade: qtd, armazemId: f.armazemId || null, recursoId: f.recursoId || null };
      const r = ordem ? await api.put<OrdemProducao>(`/pcp/ordens/${ordem.id}`, corpo) : await api.post<OrdemProducao>('/pcp/ordens', corpo);
      toast.success(ordem ? `${r.data.codigo} atualizada.` : `${r.data.codigo} criada.`);
      onSalvo(r.data);
    } catch (err) { toast.error(msgErro(err)); } finally { setSalvando(false); }
  }

  return (
    <Modal aberto onFechar={onFechar} titulo={ordem ? `Editar ${ordem.codigo}` : 'Nova ordem de produção'} tamanho="lg"
      descricao={ordem ? ordem.produto.nome : 'Os componentes são copiados da ficha técnica no momento da criação.'}
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" form="form-op" disabled={salvando}>{ordem ? 'Salvar ordem' : 'Criar ordem'}</button></>}>
      <form id="form-op" className="form-grid" onSubmit={salvar}>
        <div className="col-12">
          {ordem ? <div className="op-produto-sel"><b>{ordem.produto.nome}</b> <Code>{ordem.produto.sku}</Code></div> : produto ? (
            <div className="op-produto-sel"><b>{produto.nome}</b> <Code>{produto.sku}</Code><button type="button" className="btn btn--sm btn--ghost" onClick={() => set('produtoId', '')}>Trocar</button></div>
          ) : (
            <Field label="Produto a produzir">
              <ProdutoPicker produtos={fabricados} onSelecionar={p => setF(x => ({ ...x, produtoId: p.id }))} placeholder="Produtos com ficha técnica" autoFocus />
              {fabricados.length === 0 && <small>Nenhum produto tem ficha técnica ainda. Cadastre em PCP → Fichas técnicas.</small>}
            </Field>
          )}
        </div>
        <Field label="Quantidade" className="col-3"><input className="input" type="number" min={1} required value={f.quantidade} onChange={e => set('quantidade', e.target.value)} /></Field>
        <Field label="Início previsto" className="col-3"><input className="input" type="date" value={f.inicioPrevisto} onChange={e => set('inicioPrevisto', e.target.value)} /></Field>
        <Field label="Entrega prevista" className="col-3"><input className="input" type="date" min={f.inicioPrevisto || undefined} value={f.entregaPrevista} onChange={e => set('entregaPrevista', e.target.value)} /></Field>
        <Field label="Prioridade" className="col-3">
          <select className="select" value={f.prioridade} onChange={e => set('prioridade', e.target.value)}>{PRIORIDADES.map(p => <option key={p}>{p}</option>)}</select>
        </Field>
        <Field label="Recurso (linha / célula)" className="col-4">
          <select className="select" value={f.recursoId} onChange={e => set('recursoId', e.target.value)}>
            <option value="">Sem recurso definido</option>
            {cad.recursos.map(r => <option key={r.id} value={r.id}>{r.codigo} · {r.nome}</option>)}
          </select>
        </Field>
        <SelectArmazem className="col-4" armazens={cad.armazens} value={f.armazemId || padraoArm} onChange={v => set('armazemId', v)} />
        <Field label="Lote de produção" className="col-4" dica="Em branco: usa o código da OP"><input className="input" value={f.loteProducao} onChange={e => set('loteProducao', e.target.value)} placeholder="Ex.: L2610A" /></Field>
        <Field label="Validade do lote" className="col-4"><input className="input" type="date" value={f.validade} onChange={e => set('validade', e.target.value)} /></Field>
        <Field label="Observação" className="col-8"><input className="input" value={f.observacao} onChange={e => set('observacao', e.target.value)} placeholder="Instruções para a produção" /></Field>
        {!ordem && <div className="col-12"><label className="check"><input type="checkbox" checked={f.liberar} onChange={e => set('liberar', e.target.checked)} /> Já liberar para a produção</label></div>}

        {produto?.ingredientes?.length ? (
          <div className="col-12">
            <table className="table op-mini">
              <thead><tr><th>Componente</th><th className="num">Por unidade</th><th className="num">Necessário</th><th className="num">Custo</th></tr></thead>
              <tbody>
                {produto.ingredientes.map(i => (
                  <tr key={i.produtoFilhoId}><td>{i.produtoFilho?.nome}<div className="cell-sub"><Code>{i.produtoFilho?.sku}</Code></div></td><td className="num">{i.quantidade}</td><td className="num"><b>{numero(i.quantidade * qtd)}</b></td><td className="num">{moeda(i.quantidade * qtd * (i.produtoFilho?.precoCusto || 0))}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ detalhe da OP (gaveta)

export function DrawerOP({ id, cad, onFechar, onAlterado }: { id: string; cad: CadastrosPCP; onFechar: () => void; onAlterado: () => void }) {
  const { confirmar, pedirTexto } = useDialogo();
  const [op, setOp] = useState<OrdemDetalhe | null>(null);
  const [editar, setEditar] = useState(false);
  const [versao, setVersao] = useState(0);
  const [ap, setAp] = useState({ quantidade: '', refugo: '', minutos: '', lote: '', validade: '', observacao: '', encerrar: false });
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.get<OrdemDetalhe>(`/pcp/ordens/${id}`).then(r => { if (vivo) setOp(r.data); }).catch(err => toast.error(msgErro(err)));
    return () => { vivo = false; };
  }, [id, versao]);
  const recarregar = () => { setVersao(v => v + 1); onAlterado(); };

  const MSG_ACAO: Record<string, string> = { liberar: 'Ordem liberada para a produção.', iniciar: 'Produção iniciada.', pausar: 'Ordem pausada.', encerrar: 'Ordem encerrada.', voltar: 'Ordem voltou para planejada.', reabrir: 'Ordem reaberta.', cancelar: 'Ordem cancelada.' };
  async function acao(nome: string, corpo: Record<string, unknown> = {}) {
    try { await api.post(`/pcp/ordens/${id}/acao`, { acao: nome, ...corpo }); toast.success(MSG_ACAO[nome] ?? 'Ordem atualizada.'); recarregar(); } catch (err) { toast.error(msgErro(err)); }
  }
  async function cancelar() {
    const motivo = await pedirTexto({ titulo: `Cancelar ${op?.codigo}?`, mensagem: 'A ordem sai da programação e não consome material.', confirmar: 'Cancelar ordem', perigo: true, pedirTexto: { label: 'Motivo', obrigatorio: true } });
    if (motivo) acao('cancelar', { motivo });
  }
  async function pausar() {
    const motivo = await pedirTexto({ titulo: `Pausar ${op?.codigo}?`, confirmar: 'Pausar', pedirTexto: { label: 'Motivo da parada', placeholder: 'Ex.: falta de embalagem, manutenção' } });
    if (motivo !== null) acao('pausar', { motivo });
  }
  async function excluir() {
    if (!(await confirmar({ titulo: `Excluir ${op?.codigo}?`, mensagem: 'A ordem planejada será apagada.', confirmar: 'Excluir', perigo: true }))) return;
    try { await api.delete(`/pcp/ordens/${id}`); toast.success('Ordem excluída.'); onAlterado(); onFechar(); } catch (err) { toast.error(msgErro(err)); }
  }
  async function apontar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await api.post<{ encerrada: boolean }>(`/pcp/ordens/${id}/apontamentos`, { ...ap, encerrar: ap.encerrar || undefined });
      toast.success(r.data.encerrada ? 'Produção apontada e ordem concluída.' : 'Produção apontada.');
      setAp({ quantidade: '', refugo: '', minutos: '', lote: '', validade: '', observacao: '', encerrar: false });
      recarregar();
    } catch (err) { toast.error(msgErro(err)); } finally { setEnviando(false); }
  }
  async function estornar(a: OrdemDetalhe['apontamentos'][number]) {
    const motivo = await pedirTexto({ titulo: 'Estornar apontamento?', mensagem: `Devolve os componentes aos lotes de origem e retira ${a.quantidade} un do estoque${a.lote ? ` (lote ${a.lote})` : ''}.`, confirmar: 'Estornar', perigo: true, pedirTexto: { label: 'Motivo', obrigatorio: true } });
    if (!motivo) return;
    try { await api.delete(`/pcp/apontamentos/${a.id}`, { data: { motivo } }); toast.success('Apontamento estornado.'); recarregar(); } catch (err) { toast.error(msgErro(err)); }
  }
  function imprimir() {
    if (!op) return;
    exportarPDF({
      arquivo: `Ordem_${op.codigo}`, titulo: `Ordem de produção ${op.codigo}`, subtitulo: `${op.produto.nome} (${op.produto.sku})`,
      resumo: [
        `Quantidade: ${op.quantidadePlanejada} ${op.produto.unidade || 'UN'}`, `Prioridade: ${op.prioridade}`,
        `Início: ${dataUTC(op.inicioPrevisto)} · Entrega: ${dataUTC(op.entregaPrevista)}`, `Recurso: ${op.recurso?.nome ?? '-'}`,
        `Armazém: ${op.armazem?.nome ?? 'padrão'} · Lote: ${op.loteProducao || op.codigo}`, op.observacao ? `Obs.: ${op.observacao}` : '',
      ].filter(Boolean),
      colunas: [
        { titulo: 'SKU', valor: c => c.produto.sku }, { titulo: 'Componente', valor: c => c.produto.nome, largura: 60 },
        { titulo: 'Por unidade', valor: c => c.porUnidade }, { titulo: 'Total', valor: c => c.quantidadePrevista },
        { titulo: 'Lotes (FEFO)', valor: c => (c.lotesSugeridos ?? []).map(l => `${l.lote || 'sem lote'}: ${l.quantidade}`).join(' · '), largura: 50 },
        { titulo: 'Conferido', valor: () => '' },
      ],
      linhas: op.componentes,
    });
  }

  const aberta = op ? STATUS_ABERTOS.includes(op.status) : false;
  return (
    <>
      <Modal aberto drawer onFechar={onFechar} titulo={op ? <span className="row" style={{ gap: 8 }}><Code>{op.codigo}</Code> {op.produto.nome}</span> : 'Ordem de produção'}
        descricao={op ? `${op.origem} · criada em ${dataHora(op.createdAt)}${op.responsavel ? ` por ${op.responsavel.nome}` : ''}` : undefined}
        rodape={op && (
          <div className="op-acoes">
            {op.status === 'Planejada' && <button className="btn btn--primary" onClick={() => acao('liberar')}><IoSendOutline /> Liberar</button>}
            {(op.status === 'Liberada' || op.status === 'Pausada') && <button className="btn btn--primary" onClick={() => acao('iniciar')}><IoPlayOutline /> {op.status === 'Pausada' ? 'Retomar' : 'Iniciar'}</button>}
            {op.status === 'Em produção' && <button className="btn" onClick={pausar}><IoPauseOutline /> Pausar</button>}
            {aberta && op.quantidadeProduzida > 0 && <button className="btn" onClick={async () => { if (await confirmar({ titulo: `Encerrar ${op.codigo}?`, mensagem: `Fecha a ordem com ${op.quantidadeProduzida} de ${op.quantidadePlanejada} produzidas.`, confirmar: 'Encerrar' })) acao('encerrar'); }}><IoCheckmarkDoneOutline /> Encerrar</button>}
            {op.status === 'Liberada' && <button className="btn btn--ghost" onClick={() => acao('voltar')}><IoReturnDownBackOutline /> Voltar a planejada</button>}
            {op.status === 'Concluída' && <button className="btn" onClick={() => acao('reabrir')}><IoArrowUndoOutline /> Reabrir</button>}
            {aberta && <button className="btn btn--ghost" onClick={() => setEditar(true)}><IoPencilOutline /> Editar</button>}
            <button className="btn btn--ghost" onClick={imprimir}><IoPrintOutline /> Imprimir</button>
            {op.status === 'Planejada' && op.apontamentos.length === 0 && <button className="btn btn--ghost op-acoes__perigo" onClick={excluir}><IoTrashOutline /> Excluir</button>}
            {aberta && op.apontamentos.length === 0 && op.status !== 'Planejada' && <button className="btn btn--ghost op-acoes__perigo" onClick={cancelar}><IoCloseCircleOutline /> Cancelar</button>}
          </div>
        )}>
        {!op ? <Loading linhas={5} /> : (
          <div className="op-detalhe">
            <div className="op-cab">
              <div className="row" style={{ gap: 6 }}>
                <StatusOPBadge op={op} />
                <Badge tom={TOM_PRIORIDADE[op.prioridade]} plain>Prioridade {op.prioridade.toLowerCase()}</Badge>
                <MaterialBadge op={op} />
              </div>
              <div className="op-cab__nums">
                <div><span>Planejado</span><b>{numero(op.quantidadePlanejada)}</b></div>
                <div><span>Produzido</span><b>{numero(op.quantidadeProduzida)}</b></div>
                <div><span>Refugo</span><b>{numero(op.quantidadeRefugo)}</b></div>
                <div><span>Falta</span><b>{numero(op.restante)}</b></div>
              </div>
              <div className="meter op-cab__meter"><i style={{ width: `${op.progresso}%` }} /></div>
            </div>

            <dl className="op-info">
              <div><dt>Início previsto</dt><dd>{dataUTC(op.inicioPrevisto)}</dd></div>
              <div><dt>Entrega prevista</dt><dd className={op.atrasada ? 'down' : ''}>{dataUTC(op.entregaPrevista)}</dd></div>
              <div><dt>Recurso</dt><dd>{op.recurso ? `${op.recurso.codigo} · ${op.recurso.nome}` : '-'}</dd></div>
              <div><dt>Armazém</dt><dd>{op.armazem?.nome ?? 'Padrão'}</dd></div>
              <div><dt>Lote</dt><dd>{op.loteProducao || op.codigo}</dd></div>
              <div><dt>Validade</dt><dd>{dataUTC(op.validade)}</dd></div>
              <div><dt>Iniciada</dt><dd>{dataHora(op.iniciadaEm)}</dd></div>
              <div><dt>{op.status === 'Cancelada' ? 'Cancelada' : 'Concluída'}</dt><dd>{dataHora(op.concluidaEm)}</dd></div>
              <div><dt>Custo previsto</dt><dd>{moeda(op.custoPrevisto)}</dd></div>
              <div><dt>Produtividade</dt><dd>{op.produtividade === null ? '-' : `${numero(op.produtividade, 1)} un/h`}</dd></div>
            </dl>
            {op.observacao && <Notice tom="info">{op.observacao.split('\n').map((l, i) => <div key={i}>{l}</div>)}</Notice>}
            {op.motivoCancelamento && <Notice tom="bad">Cancelada: {op.motivoCancelamento}</Notice>}
            {op.material && op.material.faltas.length > 0 && (
              <Notice tom={op.material.status === 'Falta' ? 'bad' : 'warn'}>
                {op.material.status === 'Falta' ? 'Não há material para começar.' : `Há material para ${numero(op.material.podeProduzir)} unidades.`} Faltam: {op.material.faltas.map(f => `${numero(f.falta)} ${f.nome}`).join(', ')}. O saldo é reservado primeiro para as ordens em produção e as de maior prioridade.
              </Notice>
            )}

            <h3 className="op-sub">Componentes</h3>
            <div className="op-tabela">
              <table className="table">
                <thead><tr><th>Componente</th><th className="num">Por un.</th><th className="num">Consumido</th><th className="num">A consumir</th><th className="num">Saldo no armazém</th><th>Lotes sugeridos (FEFO)</th></tr></thead>
                <tbody>
                  {op.componentes.map(c => (
                    <tr key={c.id}>
                      <td>{c.produto.nome}<div className="cell-sub"><Code>{c.produto.sku}</Code></div></td>
                      <td className="num">{c.porUnidade}</td>
                      <td className="num">{numero(c.quantidadeConsumida)}</td>
                      <td className="num"><b>{numero(c.restante ?? 0)}</b></td>
                      <td className={`num ${(c.saldoArmazem ?? 0) < (c.restante ?? 0) ? 'down' : ''}`}>{numero(c.saldoArmazem ?? 0)}</td>
                      <td><div className="op-lotes">{(c.lotesSugeridos ?? []).length ? c.lotesSugeridos!.map((l, i) => <span key={i}>{l.lote || 'Sem lote'} <b>{numero(l.quantidade)}</b>{l.validade && <small> · {dataUTC(l.validade)}</small>}</span>) : <span className="muted">-</span>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {aberta && op.status !== 'Planejada' && (
              <form className="op-apontar" onSubmit={apontar}>
                <h3 className="op-sub">Apontar produção</h3>
                <div className="form-grid">
                  <Field label="Peças boas" className="col-3"><input className="input" type="number" min={0} value={ap.quantidade} onChange={e => setAp({ ...ap, quantidade: e.target.value })} placeholder={String(op.restante)} autoFocus /></Field>
                  <Field label="Refugo" className="col-3"><input className="input" type="number" min={0} value={ap.refugo} onChange={e => setAp({ ...ap, refugo: e.target.value })} placeholder="0" /></Field>
                  <Field label="Tempo (min)" className="col-3"><input className="input" type="number" min={0} value={ap.minutos} onChange={e => setAp({ ...ap, minutos: e.target.value })} /></Field>
                  <Field label="Lote" className="col-3"><input className="input" value={ap.lote} onChange={e => setAp({ ...ap, lote: e.target.value })} placeholder={op.loteProducao || op.codigo} /></Field>
                  <Field label="Observação" className="col-8"><input className="input" value={ap.observacao} onChange={e => setAp({ ...ap, observacao: e.target.value })} /></Field>
                  <Field label="Validade" className="col-4"><input className="input" type="date" value={ap.validade} onChange={e => setAp({ ...ap, validade: e.target.value })} /></Field>
                </div>
                <div className="op-apontar__rodape">
                  <label className="check"><input type="checkbox" checked={ap.encerrar} onChange={e => setAp({ ...ap, encerrar: e.target.checked })} /> Encerrar a ordem com este apontamento</label>
                  <button className="btn btn--primary" disabled={enviando}><IoAddOutline /> Apontar</button>
                </div>
                <p className="muted op-nota">Os componentes saem pelo lote que vence primeiro (peças boas + refugo) e o produto entra no armazém da ordem. A ordem conclui sozinha ao atingir a quantidade planejada.</p>
              </form>
            )}

            <h3 className="op-sub">Apontamentos</h3>
            {op.apontamentos.length === 0 ? <p className="muted">Nenhum apontamento ainda.</p> : (
              <ul className="op-hist">
                {op.apontamentos.map(a => (
                  <li key={a.id}>
                    <div><b>{numero(a.quantidade)} un</b>{a.refugo > 0 && <span className="down"> · {a.refugo} refugo</span>}{a.minutos ? <span className="muted"> · {a.minutos} min</span> : null}
                      <div className="cell-sub">{dataHora(a.dataHora)} · {a.usuario.nome}{a.lote && ` · lote ${a.lote}`}{a.codigoEntrada && ` · ${a.codigoEntrada}`}{a.observacao && ` · ${a.observacao}`}</div>
                    </div>
                    {op.status !== 'Cancelada' && <button className="btn btn--sm btn--ghost" onClick={() => estornar(a)}><IoArrowUndoOutline /> Estornar</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
      {editar && op && <ModalOP cad={cad} ordem={op} onFechar={() => setEditar(false)} onSalvo={() => { setEditar(false); recarregar(); }} />}
    </>
  );
}
