import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { IoAddOutline, IoPencilOutline, IoDownloadOutline, IoArrowUpOutline, IoSwapVerticalOutline, IoLockClosedOutline, IoGitNetworkOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { contem, dataHora, dataUTC, moeda } from '../../lib/format';
import { DataTable, type Col } from '../../components/DataTable';
import { Badge, Code, Empty, Field, Loading, Modal, Notice, Panel, SearchInput, useDialogo } from '../../components/ui';
import { ROTULO_MOV, TIPOS, TOM_LOTE, UNIDADES, qtd, rotuloTipo, tomTipo, type Lote, type Material, type Movimento } from './tf';

export function Estoque({ materiais, onAlterado, onEntrada, onRastrear }: { materiais: Material[]; onAlterado: () => void; onEntrada: (materialId?: string) => void; onRastrear: (lote: string) => void }) {
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [inativos, setInativos] = useState(false);
  const [form, setForm] = useState<Partial<Material> | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const linhas = useMemo(() => materiais.filter(m => (inativos || m.ativo) && (!tipo || m.tipo === tipo) && contem(busca, m.codigo, m.nome, m.terceiroNome)), [materiais, busca, tipo, inativos]);

  const colunas: Col<Material>[] = [
    { key: 'n', titulo: 'Material', principal: true, ordenar: m => m.nome, render: m => <><div className="cell-title">{m.nome}{!m.ativo && <span className="muted"> (inativo)</span>}</div><div className="cell-sub"><Code>{m.codigo}</Code></div></> },
    { key: 't', titulo: 'Tipo', ordenar: m => m.tipo, render: m => <Badge tom={tomTipo(m.tipo)} plain>{rotuloTipo(m.tipo)}</Badge> },
    { key: 'p', titulo: 'Dono', ocultarCelular: true, ordenar: m => m.proprietario, render: m => (m.proprietario === 'Terceiro' ? <Badge tom="warn" plain>Terceiro: {m.terceiroNome}</Badge> : <span className="muted">Próprio</span>) },
    { key: 's', titulo: 'Saldo liberado', align: 'right', ordenar: m => m.saldoLiberado, render: m => <><b className={m.estoqueMinimo !== null && m.saldoLiberado < m.estoqueMinimo ? 'down' : ''}>{qtd(m.saldoLiberado, m.unidade)}</b>{m.saldo !== m.saldoLiberado && <div className="cell-sub">{qtd(m.saldo - m.saldoLiberado)} retido</div>}</> },
    { key: 'l', titulo: 'Lotes', align: 'right', ocultarCelular: true, ordenar: m => m.lotesComSaldo, render: m => m.lotesComSaldo },
    { key: 'v', titulo: 'Próx. validade', ocultarCelular: true, ordenar: m => m.proximaValidade ?? '9', render: m => (m.proximaValidade ? <span className={new Date(m.proximaValidade) < new Date() ? 'down' : ''}>{dataUTC(m.proximaValidade)}</span> : '-') },
    { key: 'c', titulo: 'Valor', align: 'right', ocultarCelular: true, ordenar: m => m.saldo * (m.custoUnitario ?? 0), render: m => (m.custoUnitario ? moeda(m.saldo * m.custoUnitario) : '-') },
  ];

  return (
    <>
      <Panel flush acoes={<>
        <button className="btn btn--sm" onClick={() => setForm({ tipo: 'MATERIA_PRIMA', unidade: 'UN', proprietario: 'Próprio', controlaValidade: false })}><IoAddOutline /> Novo material</button>
        <button className="btn btn--sm btn--primary" onClick={() => onEntrada()} disabled={!materiais.length}><IoDownloadOutline /> Entrada</button>
      </>} titulo="Materiais do estoque segregado" descricao="Saldo calculado pelo razão de movimentos. Para corrigir, use ajuste com motivo (nada é editado à mão).">
        <div className="toolbar">
          <SearchInput value={busca} onChange={setBusca} placeholder="Código, nome ou dono" />
          <select className="select" value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo"><option value="">Todos os tipos</option>{TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}</select>
          <label className="check"><input type="checkbox" checked={inativos} onChange={e => setInativos(e.target.checked)} /> Mostrar inativos</label>
        </div>
        <DataTable colunas={colunas} linhas={linhas} chave={m => m.id} onLinha={m => setAberto(m.id)} ordemInicial={{ key: 'n', dir: 'asc' }}
          vazio={<Empty titulo="Nenhum material">Cadastre as matérias-primas e os produtos que passam pela transformação.</Empty>} />
      </Panel>
      {form && <FormMaterial inicial={form} onFechar={() => setForm(null)} onSalvo={() => { setForm(null); onAlterado(); }} />}
      {aberto && (
        <DetalheMaterial material={materiais.find(m => m.id === aberto)!} onFechar={() => setAberto(null)} onEditar={m => { setAberto(null); setForm(m); }}
          onEntrada={() => { setAberto(null); onEntrada(aberto); }} onRastrear={l => { setAberto(null); onRastrear(l); }} onAlterado={onAlterado} />
      )}
    </>
  );
}

function FormMaterial({ inicial, onFechar, onSalvo }: { inicial: Partial<Material>; onFechar: () => void; onSalvo: () => void }) {
  const [m, setM] = useState<Partial<Material>>(inicial);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof Material, v: unknown) => setM(x => ({ ...x, [k]: v }));
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      if (m.id) await api.put(`/tf/materiais/${m.id}`, m); else await api.post('/tf/materiais', m);
      toast.success(m.id ? 'Material atualizado. A alteração ficou na auditoria.' : 'Material cadastrado.');
      onSalvo();
    } catch (err) { toast.error(msgErro(err)); } finally { setSalvando(false); }
  }
  return (
    <Modal aberto onFechar={onFechar} titulo={m.id ? `Editar ${m.codigo}` : 'Novo material'} tamanho="md"
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" form="tf-mat" disabled={salvando}>Salvar</button></>}>
      <form id="tf-mat" onSubmit={salvar} className="form-grid">
        <Field label="Código" className="col-4"><input className="input" required value={m.codigo ?? ''} onChange={e => set('codigo', e.target.value.toUpperCase())} /></Field>
        <Field label="Nome" className="col-8"><input className="input" required value={m.nome ?? ''} onChange={e => set('nome', e.target.value)} /></Field>
        <Field label="Tipo" className="col-6"><select className="select" value={m.tipo} onChange={e => set('tipo', e.target.value)}>{TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}</select></Field>
        <Field label="Unidade" className="col-3" dica={m.id && (m.movimentos ?? 0) > 0 ? 'Fixa: já tem movimentos' : undefined}>
          <select className="select" value={m.unidade} onChange={e => set('unidade', e.target.value)} disabled={Boolean(m.id && (m.movimentos ?? 0) > 0)}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select>
        </Field>
        <Field label="Custo unitário" className="col-3"><input className="input" type="number" min={0} step="any" value={m.custoUnitario ?? ''} onChange={e => set('custoUnitario', e.target.value)} /></Field>
        <Field label="Estoque mínimo" className="col-4"><input className="input" type="number" min={0} step="any" value={m.estoqueMinimo ?? ''} onChange={e => set('estoqueMinimo', e.target.value)} /></Field>
        <Field label="Dono do material" className="col-8">
          <select className="select" value={m.proprietario} onChange={e => set('proprietario', e.target.value)}>
            <option value="Próprio">Próprio (da empresa)</option>
            <option value="Terceiro">De terceiro (industrialização por encomenda)</option>
          </select>
        </Field>
        {m.proprietario === 'Terceiro' && <>
          <Field label="Nome do dono" className="col-8"><input className="input" required value={m.terceiroNome ?? ''} onChange={e => set('terceiroNome', e.target.value)} /></Field>
          <Field label="CNPJ/CPF" className="col-4"><input className="input" value={m.terceiroDoc ?? ''} onChange={e => set('terceiroDoc', e.target.value)} /></Field>
        </>}
        <div className="col-12"><label className="check"><input type="checkbox" checked={Boolean(m.controlaValidade)} onChange={e => set('controlaValidade', e.target.checked)} /> Controla validade (data obrigatória em cada lote)</label></div>
        <Field label="Observação" className="col-12"><input className="input" value={m.observacao ?? ''} onChange={e => set('observacao', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

function DetalheMaterial({ material: m, onFechar, onEditar, onEntrada, onRastrear, onAlterado }: { material: Material; onFechar: () => void; onEditar: (m: Material) => void; onEntrada: () => void; onRastrear: (l: string) => void; onAlterado: () => void }) {
  const { pedirTexto } = useDialogo();
  const { dados, recarregar } = useCarregar(async () => {
    const [l, mv] = await Promise.all([api.get<Lote[]>(`/tf/lotes?materialId=${m.id}`), api.get<Movimento[]>(`/tf/movimentos?materialId=${m.id}&limite=300`)]);
    return { lotes: l.data, movimentos: mv.data };
  }, [m.id]);
  const [op, setOp] = useState<{ tipo: 'ajuste' | 'saida'; lote: Lote } | null>(null);
  const atualizar = () => { recarregar(true); onAlterado(); };

  async function situacao(l: Lote, status: Lote['status']) {
    const motivo = await pedirTexto({ titulo: `Lote ${l.codigo}: ${status}`, mensagem: status === 'Liberado' ? 'O lote volta a poder ser consumido.' : 'Lotes em quarentena ou bloqueados não são consumidos pela transformação.', confirmar: 'Confirmar', pedirTexto: { label: 'Motivo', obrigatorio: true } });
    if (!motivo) return;
    try { await api.put(`/tf/lotes/${l.id}/status`, { status, motivo }); toast.success('Situação do lote alterada.'); atualizar(); } catch (err) { toast.error(msgErro(err)); }
  }
  async function ativar() {
    try { await api.post(`/tf/materiais/${m.id}/ativo`, { ativo: !m.ativo }); toast.success(m.ativo ? 'Material desativado.' : 'Material reativado.'); onAlterado(); onFechar(); } catch (err) { toast.error(msgErro(err)); }
  }

  return (
    <Modal aberto drawer tamanho="lg" onFechar={onFechar} titulo={<span className="row" style={{ gap: 8 }}><Code>{m.codigo}</Code> {m.nome}</span>}
      descricao={`${rotuloTipo(m.tipo)} · ${m.unidade} · ${m.proprietario === 'Terceiro' ? `de ${m.terceiroNome}` : 'próprio'}`}
      rodape={<div className="row" style={{ width: '100%', justifyContent: 'space-between' }}>
        <button className="btn btn--ghost" onClick={ativar}>{m.ativo ? 'Desativar' : 'Reativar'}</button>
        <div className="row"><button className="btn" onClick={() => onEditar(m)}><IoPencilOutline /> Editar</button><button className="btn btn--primary" onClick={onEntrada} disabled={!m.ativo}><IoDownloadOutline /> Entrada</button></div>
      </div>}>
      {!dados ? <Loading linhas={4} /> : (
        <div className="tf-detalhe">
          <div className="tf-numeros">
            <div><span>Saldo liberado</span><b>{qtd(m.saldoLiberado, m.unidade)}</b></div>
            <div><span>Retido (quarentena/bloqueio)</span><b>{qtd(m.saldo - m.saldoLiberado, m.unidade)}</b></div>
            <div><span>Mínimo</span><b>{m.estoqueMinimo !== null ? qtd(m.estoqueMinimo, m.unidade) : '-'}</b></div>
            <div><span>Valor</span><b>{m.custoUnitario ? moeda(m.saldo * m.custoUnitario) : '-'}</b></div>
          </div>
          {m.proprietario === 'Terceiro' && <Notice tom="info">Material de terceiro: fica em poder da empresa, mas pertence a {m.terceiroNome}{m.terceiroDoc ? ` (${m.terceiroDoc})` : ''}. O que sobrar deve voltar ao dono com nota de retorno.</Notice>}

          <h3 className="tf-sub">Lotes</h3>
          {dados.lotes.length === 0 ? <p className="muted">Nenhum lote ainda.</p> : (
            <table className="table">
              <thead><tr><th>Lote</th><th>Situação</th><th>Validade</th><th>Origem</th><th className="num">Saldo</th><th /></tr></thead>
              <tbody>
                {dados.lotes.map(l => (
                  <tr key={l.id} className={l.saldo <= 0 ? 'tf-apagado' : ''}>
                    <td><b>{l.codigo}</b><div className="cell-sub">{[l.documento, l.fornecedor].filter(Boolean).join(' · ')}</div></td>
                    <td><Badge tom={TOM_LOTE[l.status]}>{l.status}</Badge></td>
                    <td>{l.validade ? <span className={new Date(l.validade) < new Date() ? 'down' : ''}>{dataUTC(l.validade)}</span> : '-'}</td>
                    <td>{l.origem}</td>
                    <td className="num"><b>{qtd(l.saldo)}</b></td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end', gap: 2 }}>
                        <button className="icon-btn" title="Rastrear" aria-label="Rastrear lote" onClick={() => onRastrear(l.codigo)}><IoGitNetworkOutline /></button>
                        <button className="icon-btn" title="Ajustar saldo (inventário)" aria-label="Ajustar" onClick={() => setOp({ tipo: 'ajuste', lote: l })}><IoSwapVerticalOutline /></button>
                        {l.saldo > 0 && <button className="icon-btn" title="Saída" aria-label="Saída" onClick={() => setOp({ tipo: 'saida', lote: l })}><IoArrowUpOutline /></button>}
                        <select className="select select--sm tf-select-status" value={l.status} onChange={e => situacao(l, e.target.value as Lote['status'])} aria-label="Situação do lote" title="Mudar situação">
                          <option>Liberado</option><option>Quarentena</option><option>Bloqueado</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 className="tf-sub"><IoLockClosedOutline style={{ verticalAlign: -2 }} /> Razão de movimentos (imutável)</h3>
          {dados.movimentos.length === 0 ? <p className="muted">Sem movimentos.</p> : (
            <table className="table tf-tabela-mini">
              <thead><tr><th>#</th><th>Movimento</th><th>Lote</th><th className="num">Qtd.</th><th className="num">Saldo do lote</th></tr></thead>
              <tbody>
                {dados.movimentos.map(mv => (
                  <tr key={mv.id}>
                    <td className="muted">{mv.seq}</td>
                    <td><b>{ROTULO_MOV[mv.tipo] ?? mv.tipo}</b>{mv.documento && <> · <Code>{mv.documento}</Code></>}<div className="cell-sub">{dataHora(mv.dataHora)} · {mv.usuario}{mv.motivo ? ` · ${mv.motivo}` : ''}</div></td>
                    <td>{mv.lote?.codigo ?? '-'}</td>
                    <td className="num"><b className={mv.quantidade > 0 ? 'up' : 'down'}>{mv.quantidade > 0 ? '+' : '−'}{qtd(Math.abs(mv.quantidade))}</b></td>
                    <td className="num">{qtd(mv.saldoLoteApos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {op && <OperacaoLote tipo={op.tipo} lote={op.lote} unidade={m.unidade} onFechar={() => setOp(null)} onSalvo={() => { setOp(null); atualizar(); }} />}
    </Modal>
  );
}

function OperacaoLote({ tipo, lote, unidade, onFechar, onSalvo }: { tipo: 'ajuste' | 'saida'; lote: Lote; unidade: string; onFechar: () => void; onSalvo: () => void }) {
  const [valor, setValor] = useState(tipo === 'ajuste' ? String(lote.saldo) : '');
  const [motivo, setMotivo] = useState('');
  const [documento, setDocumento] = useState('');
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      if (tipo === 'ajuste') await api.post('/tf/ajustes', { loteId: lote.id, saldoContado: Number(valor), motivo, documento });
      else await api.post('/tf/saidas', { materialId: lote.materialId, loteId: lote.id, quantidade: Number(valor), destino: motivo, documento });
      toast.success(tipo === 'ajuste' ? 'Ajuste registrado no razão.' : 'Saída registrada.');
      onSalvo();
    } catch (err) { toast.error(msgErro(err)); }
  }
  const dif = Number(valor) - lote.saldo;
  return (
    <Modal aberto onFechar={onFechar} tamanho="sm" titulo={tipo === 'ajuste' ? `Ajustar lote ${lote.codigo}` : `Saída do lote ${lote.codigo}`}
      descricao={`Saldo atual: ${qtd(lote.saldo, unidade)}`}
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" form="tf-op">Registrar</button></>}>
      <form id="tf-op" onSubmit={salvar} className="form-grid">
        <Field label={tipo === 'ajuste' ? `Saldo contado (${unidade})` : `Quantidade (${unidade})`} className="col-12"
          dica={tipo === 'ajuste' && valor !== '' && dif !== 0 ? `Diferença: ${dif > 0 ? '+' : ''}${qtd(dif, unidade)}` : undefined}>
          <input className="input" type="number" min={0} step="any" required value={valor} onChange={e => setValor(e.target.value)} autoFocus />
        </Field>
        <Field label={tipo === 'ajuste' ? 'Motivo do ajuste' : 'Destino / motivo'} className="col-12">
          <input className="input" required value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={tipo === 'ajuste' ? 'Ex.: contagem cíclica, avaria encontrada' : 'Ex.: entregue ao cliente, devolvido ao dono, descarte'} />
        </Field>
        <Field label="Documento (opcional)" className="col-12"><input className="input" value={documento} onChange={e => setDocumento(e.target.value)} placeholder="NF, termo, protocolo" /></Field>
      </form>
    </Modal>
  );
}

export function Entrada({ materiais, materialId, onFechar, onSalvo }: { materiais: Material[]; materialId?: string; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ materialId: materialId ?? '', quantidade: '', lote: '', validade: '', status: 'Liberado', documento: '', fornecedor: '', motivo: '' });
  const m = materiais.find(x => x.id === f.materialId);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try { const r = await api.post('/tf/entradas', f); toast.success(`Entrada registrada no lote ${r.data.lote.codigo}.`); onSalvo(); } catch (err) { toast.error(msgErro(err)); }
  }
  return (
    <Modal aberto onFechar={onFechar} titulo="Entrada de material" descricao="Recebimento, saldo inicial ou material enviado por terceiro." tamanho="md"
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" form="tf-ent">Registrar entrada</button></>}>
      <form id="tf-ent" onSubmit={salvar} className="form-grid">
        <Field label="Material" className="col-12">
          <select className="select" required value={f.materialId} onChange={e => setF({ ...f, materialId: e.target.value })}>
            <option value="">Selecione…</option>
            {materiais.filter(x => x.ativo).map(x => <option key={x.id} value={x.id}>[{x.codigo}] {x.nome} ({x.unidade})</option>)}
          </select>
        </Field>
        <Field label={`Quantidade${m ? ` (${m.unidade})` : ''}`} className="col-4"><input className="input" type="number" min={0} step="any" required value={f.quantidade} onChange={e => setF({ ...f, quantidade: e.target.value })} /></Field>
        <Field label="Lote" className="col-4" dica="Em branco: automático (EN…)"><input className="input" value={f.lote} onChange={e => setF({ ...f, lote: e.target.value.toUpperCase() })} /></Field>
        <Field label={`Validade${m?.controlaValidade ? ' (obrigatória)' : ''}`} className="col-4"><input className="input" type="date" required={m?.controlaValidade} value={f.validade} onChange={e => setF({ ...f, validade: e.target.value })} /></Field>
        <Field label="Situação inicial" className="col-6">
          <select className="select" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
            <option value="Liberado">Liberado para uso</option>
            <option value="Quarentena">Quarentena (aguarda inspeção)</option>
          </select>
        </Field>
        <Field label="Documento" className="col-6"><input className="input" value={f.documento} onChange={e => setF({ ...f, documento: e.target.value })} placeholder="NF 1234" /></Field>
        <Field label={m?.proprietario === 'Terceiro' ? 'Remetente' : 'Fornecedor'} className="col-12"><input className="input" value={f.fornecedor} onChange={e => setF({ ...f, fornecedor: e.target.value })} placeholder={m?.terceiroNome ?? ''} /></Field>
      </form>
    </Modal>
  );
}
