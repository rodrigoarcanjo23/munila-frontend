import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { IoAddOutline, IoCloseOutline, IoSaveOutline, IoCheckmarkDoneOutline, IoFlaskOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { dataUTC, numero } from '../../lib/format';
import { Badge, Code, Field, Modal, Notice, Segmented } from '../../components/ui';
import { MOTIVOS_PERDA, avaliar, qtd, type Lote, type Material, type Ordem, type Receita } from './tf';
import { ReguaRendimento } from './Rendimento';

interface Linha { materialId: string; quantidade: string; loteId: string }
interface Perda { materialId: string; quantidade: string; motivo: string; outro: string }
interface Simulacao { consumos: { materialId: string; padrao: number; disponivel: number; falta: number; lotes: { codigo: string; quantidade: number }[] }[]; subprodutos: { materialId: string; esperado: number }[]; podeProduzir: number; temMaterial: boolean }

/**
 * Ordem de Transformação em uma tela: escolhe a receita, confere o material disponível (FEFO),
 * aponta o consumo real, o que foi produzido, subprodutos e perdas — e vê o rendimento antes de confirmar.
 */
export function NovaTransformacao({ materiais, receitas, ordem, receitaInicial, onFechar, onSalvo }: {
  materiais: Material[]; receitas: Receita[]; ordem?: Ordem | null; receitaInicial?: string; onFechar: () => void; onSalvo: () => void;
}) {
  const [modo, setModo] = useState<'receita' | 'livre'>(ordem && !ordem.receitaId ? 'livre' : 'receita');
  const [receitaId, setReceitaId] = useState(ordem?.receitaId ?? receitaInicial ?? receitas[0]?.id ?? '');
  const [planejado, setPlanejado] = useState(String(ordem?.quantidadePlanejada ?? receitas.find(r => r.id === (receitaInicial ?? receitas[0]?.id))?.quantidadeBase ?? 1));
  const [produtoLivre, setProdutoLivre] = useState(ordem?.produtoId ?? '');
  const [consumos, setConsumos] = useState<Linha[]>([]);
  const [subprodutos, setSubprodutos] = useState<{ materialId: string; quantidade: string }[]>([]);
  const [perdas, setPerdas] = useState<Perda[]>([]);
  const [produzido, setProduzido] = useState('');
  const [lote, setLote] = useState('');
  const [validade, setValidade] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [observacao, setObservacao] = useState(ordem?.observacao ?? '');
  const [sim, setSim] = useState<Simulacao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { dados: lotes } = useCarregar(async () => (await api.get<Lote[]>('/tf/lotes?comSaldo=1')).data);

  const receita = modo === 'receita' ? receitas.find(r => r.id === receitaId) ?? null : null;
  const mat = (id: string) => materiais.find(m => m.id === id);
  const n = (s: string) => Number(String(s).replace(',', '.')) || 0;

  // Simulação: consumo padrão para a quantidade planejada, saldo liberado e lotes que vão sair (FEFO)
  const rid = receita?.id;
  useEffect(() => {
    if (!rid || n(planejado) <= 0) { setSim(null); return; }
    let vivo = true;
    const t = setTimeout(() => {
      api.get<Simulacao>(`/tf/simular?receitaId=${rid}&quantidade=${n(planejado)}`).then(r => {
        if (!vivo) return;
        setSim(r.data);
        setConsumos(r.data.consumos.map(c => ({ materialId: c.materialId, quantidade: String(+c.padrao.toFixed(3)), loteId: '' })));
        setSubprodutos(r.data.subprodutos.map(s => ({ materialId: s.materialId, quantidade: String(+s.esperado.toFixed(3)) })));
        setProduzido(planejado);
      }).catch(err => toast.error(msgErro(err)));
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [rid, planejado]);

  const av = useMemo(() => avaliar(receita, consumos.map(c => ({ materialId: c.materialId, quantidade: n(c.quantidade) })), n(produzido)), [receita, consumos, produzido]);
  const produto = receita ? mat(receita.produtoId) : mat(produtoLivre);
  const precisaJustificar = av && av.faixa !== 'OK';
  const lotesDe = (id: string) => (lotes ?? []).filter(l => l.materialId === id && l.status === 'Liberado' && l.saldo > 0);
  const insumos = materiais.filter(m => m.ativo && m.id !== produto?.id);

  async function salvar(executar: boolean) {
    if (!produto) return toast.warn('Escolha a receita ou o produto.');
    if (n(planejado) <= 0) return toast.warn('Informe a quantidade a produzir.');
    if (executar) {
      if (!consumos.some(c => n(c.quantidade) > 0)) return toast.warn('Informe o que foi consumido.');
      if (n(produzido) <= 0) return toast.warn('Informe quanto foi produzido.');
      if (precisaJustificar && !justificativa.trim()) return toast.warn('Escreva a justificativa do desvio.');
      if (perdas.some(p => n(p.quantidade) > 0 && !(p.motivo === 'Outro' ? p.outro.trim() : p.motivo))) return toast.warn('Toda perda precisa de motivo.');
    }
    const execucao = executar ? {
      consumos: consumos.filter(c => n(c.quantidade) > 0).map(c => ({ materialId: c.materialId, quantidade: n(c.quantidade), loteId: c.loteId || null })),
      produzido: n(produzido),
      subprodutos: subprodutos.filter(s => n(s.quantidade) > 0).map(s => ({ materialId: s.materialId, quantidade: n(s.quantidade) })),
      perdas: perdas.filter(p => n(p.quantidade) > 0).map(p => ({ materialId: p.materialId || null, quantidade: n(p.quantidade), motivo: p.motivo === 'Outro' ? p.outro.trim() : p.motivo })),
      loteCodigo: lote.trim() || null, validade: validade || null, justificativa: justificativa.trim() || null, observacao: observacao.trim() || null,
    } : null;
    setEnviando(true);
    try {
      if (ordem) {
        const r = await api.post(`/tf/ordens/${ordem.id}/executar`, execucao);
        toast.success(r.data.precisaAprovar ? `${ordem.codigo} enviada para aprovação.` : `${ordem.codigo} concluída.`);
      } else {
        const r = await api.post('/tf/ordens', { receitaId: receita?.id ?? null, produtoId: produto.id, quantidadePlanejada: n(planejado), observacao: observacao.trim() || null, execucao });
        const o = r.data.ordem as Ordem;
        toast.success(!executar ? `${o.codigo} salva como planejada.` : o.status === 'Aguardando aprovação' ? `${o.codigo} registrada e enviada para aprovação de um gestor.` : `${o.codigo} concluída. Lote ${o.loteCodigo} gerado.`);
      }
      onSalvo();
    } catch (err) { toast.error(msgErro(err)); } finally { setEnviando(false); }
  }

  return (
    <Modal aberto drawer tamanho="xl" onFechar={onFechar}
      titulo={ordem ? `Executar ${ordem.codigo}` : 'Nova transformação'}
      descricao="Estoque segregado: nada aqui altera o estoque oficial."
      rodape={<>
        {!ordem && <button className="btn" onClick={() => salvar(false)} disabled={enviando}><IoSaveOutline /> Salvar como planejada</button>}
        <button className="btn btn--primary" onClick={() => salvar(true)} disabled={enviando}><IoCheckmarkDoneOutline /> {av?.faixa === 'Aprovar' ? 'Registrar e enviar para aprovação' : 'Concluir transformação'}</button>
      </>}>
      <div className="tf-wizard">
        {/* 1. O que produzir */}
        <section>
          <h3 className="tf-passo"><span>1</span> O que vai ser produzido</h3>
          {!ordem && <Segmented valor={modo} onChange={v => { setModo(v); setConsumos([]); setSubprodutos([]); setSim(null); }} opcoes={[{ valor: 'receita', label: 'Pela receita' }, { valor: 'livre', label: 'Sem receita (avulsa)' }]} />}
          <div className="form-grid mt-16">
            {modo === 'receita' ? (
              <Field label="Receita" className="col-8">
                <select className="select" value={receitaId} onChange={e => setReceitaId(e.target.value)} disabled={!!ordem}>
                  {receitas.length === 0 && <option value="">Nenhuma receita cadastrada</option>}
                  {receitas.map(r => <option key={r.id} value={r.id}>{r.codigo} v{r.versao} · {r.nome} (rende {qtd(r.quantidadeBase, r.produto.unidade)})</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Produto gerado" className="col-8">
                <select className="select" value={produtoLivre} onChange={e => setProdutoLivre(e.target.value)} disabled={!!ordem}>
                  <option value="">Selecione…</option>
                  {materiais.filter(m => m.ativo && m.tipo !== 'MATERIA_PRIMA').map(m => <option key={m.id} value={m.id}>[{m.codigo}] {m.nome}</option>)}
                </select>
              </Field>
            )}
            <Field label={`Quantidade a produzir${produto ? ` (${produto.unidade})` : ''}`} className="col-4">
              <input className="input" type="number" min={0} step="any" value={planejado} onChange={e => setPlanejado(e.target.value)} />
            </Field>
          </div>
          {sim && !sim.temMaterial && <div className="mt-8"><Notice tom="warn">Falta material liberado para essa quantidade. Com o saldo atual dá para produzir até {qtd(sim.podeProduzir, produto?.unidade)}.</Notice></div>}
        </section>

        {/* 2. Consumo */}
        <section>
          <h3 className="tf-passo"><span>2</span> Consumo real <small>já vem com o padrão da receita; corrija para o que foi usado de fato</small></h3>
          <div className="tf-tabela">
            <table className="table">
              <thead><tr><th>Material</th><th className="num">Padrão</th><th className="num">Disponível</th><th style={{ width: 130 }}>Consumido</th><th>Lote</th><th className="num">Variação</th><th /></tr></thead>
              <tbody>
                {consumos.map((c, i) => {
                  const m = mat(c.materialId);
                  const s = sim?.consumos.find(x => x.materialId === c.materialId);
                  const v = av?.variacoes.find(x => x.materialId === c.materialId);
                  const tol = receita ? (Math.abs(v?.variacao ?? 0) <= receita.toleranciaAviso ? 'ok' : Math.abs(v?.variacao ?? 0) <= receita.toleranciaBloqueio ? 'warn' : 'bad') : '';
                  return (
                    <tr key={c.materialId + i}>
                      <td>
                        {modo === 'livre' ? (
                          <select className="select" value={c.materialId} onChange={e => setConsumos(cs => cs.map((x, j) => (j === i ? { ...x, materialId: e.target.value, loteId: '' } : x)))}>
                            <option value="">Selecione…</option>
                            {insumos.map(x => <option key={x.id} value={x.id}>[{x.codigo}] {x.nome}</option>)}
                          </select>
                        ) : <><div className="cell-title">{m?.nome}</div><div className="cell-sub"><Code>{m?.codigo}</Code></div></>}
                      </td>
                      <td className="num">{s ? qtd(s.padrao, m?.unidade) : '-'}</td>
                      <td className="num"><span className={s && s.falta > 0 ? 'down' : ''}>{qtd(m?.saldoLiberado ?? 0, m?.unidade)}</span></td>
                      <td><input className="input" type="number" min={0} step="any" value={c.quantidade} onChange={e => setConsumos(cs => cs.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))} aria-label={`Consumo de ${m?.nome ?? 'material'}`} /></td>
                      <td>
                        <select className="select" value={c.loteId} onChange={e => setConsumos(cs => cs.map((x, j) => (j === i ? { ...x, loteId: e.target.value } : x)))} aria-label="Lote">
                          <option value="">Automático (vence primeiro)</option>
                          {lotesDe(c.materialId).map(l => <option key={l.id} value={l.id}>{l.codigo} · {qtd(l.saldo)}{l.validade ? ` · vence ${dataUTC(l.validade)}` : ''}</option>)}
                        </select>
                      </td>
                      <td className="num">{v ? <span className={`tf-tom--${tol}`}>{v.variacao > 0 ? '+' : ''}{numero(v.variacao, 1)}%</span> : '-'}</td>
                      <td>{modo === 'livre' && <button className="icon-btn icon-btn--bad" aria-label="Remover" onClick={() => setConsumos(cs => cs.filter((_, j) => j !== i))}><IoCloseOutline /></button>}</td>
                    </tr>
                  );
                })}
                {consumos.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>{modo === 'receita' ? 'Escolha a receita e a quantidade.' : 'Adicione os materiais consumidos.'}</td></tr>}
              </tbody>
            </table>
          </div>
          {modo === 'livre' && <button className="btn btn--sm mt-8" onClick={() => setConsumos(cs => [...cs, { materialId: '', quantidade: '', loteId: '' }])}><IoAddOutline /> Adicionar material</button>}
        </section>

        {/* 3. Resultado */}
        <section>
          <h3 className="tf-passo"><span>3</span> Resultado</h3>
          <div className="form-grid">
            <Field label={`Produzido (bom)${produto ? ` · ${produto.unidade}` : ''}`} className="col-4"><input className="input" type="number" min={0} step="any" value={produzido} onChange={e => setProduzido(e.target.value)} /></Field>
            <Field label="Lote gerado" className="col-4" dica="Em branco: código automático (TF…)"><input className="input" value={lote} onChange={e => setLote(e.target.value.toUpperCase())} placeholder="Automático" /></Field>
            <Field label="Validade" className="col-4" dica="Em branco: herda a menor validade dos insumos"><input className="input" type="date" value={validade} onChange={e => setValidade(e.target.value)} /></Field>
          </div>

          {receita && <div className="mt-16"><ReguaRendimento rendimento={av?.rendimento ?? null} aviso={receita.toleranciaAviso} bloqueio={receita.toleranciaBloqueio} /></div>}

          {subprodutos.length > 0 && (
            <div className="mt-16">
              <div className="tf-rotulo">Subprodutos e sobras aproveitáveis</div>
              {subprodutos.map((s, i) => (
                <div key={s.materialId} className="tf-linha">
                  <span style={{ flex: 1 }}>{mat(s.materialId)?.nome}</span>
                  <input className="input" style={{ width: 130 }} type="number" min={0} step="any" value={s.quantidade} onChange={e => setSubprodutos(ss => ss.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))} />
                  <span className="muted" style={{ width: 40 }}>{mat(s.materialId)?.unidade}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-16">
            <div className="tf-rotulo">Perdas <small className="muted">(refugo, material danificado…; ficam registradas com motivo)</small></div>
            {perdas.map((p, i) => (
              <div key={i} className="tf-linha tf-linha--perda">
                <select className="select" value={p.materialId} onChange={e => setPerdas(ps => ps.map((x, j) => (j === i ? { ...x, materialId: e.target.value } : x)))} aria-label="Material perdido">
                  {produto && <option value={produto.id}>{produto.nome} (produto)</option>}
                  {consumos.map(c => mat(c.materialId)).filter(Boolean).map(m => <option key={m!.id} value={m!.id}>{m!.nome}</option>)}
                </select>
                <input className="input" type="number" min={0} step="any" placeholder="Qtd." value={p.quantidade} onChange={e => setPerdas(ps => ps.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))} aria-label="Quantidade perdida" />
                <select className="select" value={p.motivo} onChange={e => setPerdas(ps => ps.map((x, j) => (j === i ? { ...x, motivo: e.target.value } : x)))} aria-label="Motivo">
                  <option value="">Motivo…</option>
                  {MOTIVOS_PERDA.map(m => <option key={m}>{m}</option>)}
                </select>
                {p.motivo === 'Outro' && <input className="input" placeholder="Descreva" value={p.outro} onChange={e => setPerdas(ps => ps.map((x, j) => (j === i ? { ...x, outro: e.target.value } : x)))} />}
                <button className="icon-btn icon-btn--bad" aria-label="Remover perda" onClick={() => setPerdas(ps => ps.filter((_, j) => j !== i))}><IoCloseOutline /></button>
              </div>
            ))}
            <button className="btn btn--sm" onClick={() => setPerdas(ps => [...ps, { materialId: produto?.id ?? '', quantidade: '', motivo: '', outro: '' }])} disabled={!produto}><IoAddOutline /> Registrar perda</button>
          </div>
        </section>

        {/* 4. Justificativa */}
        <section>
          <h3 className="tf-passo"><span>4</span> Observações {precisaJustificar && <Badge tom={av!.faixa === 'Aprovar' ? 'bad' : 'warn'}>{av!.faixa === 'Aprovar' ? 'Justificativa + aprovação' : 'Justificativa obrigatória'}</Badge>}</h3>
          {precisaJustificar && (
            <Field label="Justificativa do desvio" className="mb-16" dica={av!.faixa === 'Aprovar' ? 'O desvio passou do limite: a ordem fica aguardando um gestor (outra pessoa) aprovar, e só então o estoque é movimentado.' : undefined}>
              <textarea className="textarea" value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder="O que aconteceu? Ex.: lote de MDF com empeno, troca de operador, ajuste de máquina…" />
            </Field>
          )}
          <Field label="Observação (opcional)"><input className="input" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Turno, máquina, operador…" /></Field>
          {!receita && modo === 'livre' && <p className="muted mt-8" style={{ fontSize: 12.5 }}><IoFlaskOutline style={{ verticalAlign: -2 }} /> Sem receita o sistema não calcula rendimento. Cadastre uma receita para acompanhar perdas e desvios.</p>}
        </section>
      </div>
    </Modal>
  );
}
