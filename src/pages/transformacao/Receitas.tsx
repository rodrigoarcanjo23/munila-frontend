import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { IoAddOutline, IoArchiveOutline, IoCopyOutline, IoPlayOutline, IoTimeOutline, IoTrashOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { contem, dataHora, numero } from '../../lib/format';
import { Badge, Code, Empty, Field, Loading, Modal, Notice, Panel, SearchInput, useDialogo } from '../../components/ui';
import { qtd, type Material, type Receita } from './tf';

export function Receitas({ receitas, materiais, onUsar, onAlterado }: { receitas: Receita[]; materiais: Material[]; onUsar: (r: Receita) => void; onAlterado: () => void }) {
  const { confirmar } = useDialogo();
  const [busca, setBusca] = useState('');
  const [editor, setEditor] = useState<Partial<Receita> | null>(null);
  const [historico, setHistorico] = useState<string | null>(null);
  const lista = useMemo(() => receitas.filter(r => contem(busca, r.codigo, r.nome, r.produto.nome, r.produto.codigo, ...r.itens.map(i => i.material.nome))), [receitas, busca]);

  async function arquivar(r: Receita) {
    const ok = await confirmar({ titulo: `Arquivar ${r.codigo} v${r.versao}?`, mensagem: 'A receita deixa de aparecer para novas transformações. As ordens que já a usaram continuam apontando para ela.', confirmar: 'Arquivar', perigo: true });
    if (!ok) return;
    try { await api.post(`/tf/receitas/${r.id}/arquivar`); toast.success('Receita arquivada.'); onAlterado(); } catch (err) { toast.error(msgErro(err)); }
  }

  return (
    <>
      <Panel titulo="Receitas (fichas técnicas)" descricao="Quanto de cada material vira quanto de produto. Salvar uma alteração cria uma versão nova; a anterior fica guardada."
        acoes={<button className="btn btn--sm btn--primary" onClick={() => setEditor({ quantidadeBase: 1, toleranciaAviso: 3, toleranciaBloqueio: 10, itens: [] })} disabled={!materiais.length}><IoAddOutline /> Nova receita</button>}>
        <div className="toolbar"><SearchInput value={busca} onChange={setBusca} placeholder="Receita, produto ou material" /></div>
        {lista.length === 0 ? <Empty titulo="Nenhuma receita ativa">Crie uma receita para que a transformação calcule o consumo padrão e o rendimento.</Empty> : (
          <div className="tf-receitas">
            {lista.map(r => (
              <article key={r.id} className="tf-receita">
                <header>
                  <div><Code>{r.codigo}</Code> <Badge plain>v{r.versao}</Badge></div>
                  <div className="row" style={{ gap: 2 }}>
                    <button className="icon-btn" title="Versões" aria-label="Ver versões" onClick={() => setHistorico(r.codigo)}><IoTimeOutline /></button>
                    <button className="icon-btn" title="Editar (cria nova versão)" aria-label="Editar" onClick={() => setEditor(r)}><IoCopyOutline /></button>
                    <button className="icon-btn" title="Arquivar" aria-label="Arquivar" onClick={() => arquivar(r)}><IoArchiveOutline /></button>
                  </div>
                </header>
                <h3>{r.nome}</h3>
                <div className="tf-receita__equacao">
                  <ul>
                    {r.itens.filter(i => i.papel === 'CONSUMO').map(i => <li key={i.id}><b>{qtd(i.quantidade, i.material.unidade)}</b> {i.material.nome}</li>)}
                  </ul>
                  <span className="tf-receita__seta" aria-hidden>→</span>
                  <div>
                    <b className="tf-receita__produto">{qtd(r.quantidadeBase, r.produto.unidade)}</b>
                    <div>{r.produto.nome}</div>
                    {r.itens.filter(i => i.papel === 'SUBPRODUTO').map(i => <div key={i.id} className="cell-sub">+ {qtd(i.quantidade, i.material.unidade)} {i.material.nome}</div>)}
                  </div>
                </div>
                <footer>
                  <span className="muted">Tolerância ±{numero(r.toleranciaAviso, 1)}% / ±{numero(r.toleranciaBloqueio, 1)}% · {r._count?.ordens ?? 0} OT</span>
                  <button className="btn btn--sm btn--primary" onClick={() => onUsar(r)}><IoPlayOutline /> Usar</button>
                </footer>
              </article>
            ))}
          </div>
        )}
      </Panel>
      {editor && <EditorReceita inicial={editor} materiais={materiais} onFechar={() => setEditor(null)} onSalvo={() => { setEditor(null); onAlterado(); }} />}
      {historico && <Versoes codigo={historico} onFechar={() => setHistorico(null)} />}
    </>
  );
}

interface LinhaItem { materialId: string; quantidade: string; papel: 'CONSUMO' | 'SUBPRODUTO' }

function EditorReceita({ inicial, materiais, onFechar, onSalvo }: { inicial: Partial<Receita>; materiais: Material[]; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({
    codigo: inicial.codigo ?? '', nome: inicial.nome ?? '', produtoId: inicial.produtoId ?? '', quantidadeBase: String(inicial.quantidadeBase ?? 1),
    toleranciaAviso: String(inicial.toleranciaAviso ?? 3), toleranciaBloqueio: String(inicial.toleranciaBloqueio ?? 10), observacao: inicial.observacao ?? '',
  });
  const [itens, setItens] = useState<LinhaItem[]>(inicial.itens?.length ? inicial.itens.map(i => ({ materialId: i.materialId, quantidade: String(i.quantidade), papel: i.papel })) : [{ materialId: '', quantidade: '', papel: 'CONSUMO' }]);
  const [salvando, setSalvando] = useState(false);
  const ativos = materiais.filter(m => m.ativo);
  const produto = materiais.find(m => m.id === f.produtoId);
  const un = (id: string) => materiais.find(m => m.id === id)?.unidade ?? '';
  const muda = (i: number, p: Partial<LinhaItem>) => setItens(xs => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await api.post<Receita>('/tf/receitas', { ...f, itens: itens.filter(i => i.materialId) });
      toast.success(r.data.versao > 1 ? `Versão ${r.data.versao} criada. A anterior foi guardada.` : 'Receita criada.');
      onSalvo();
    } catch (err) { toast.error(msgErro(err)); } finally { setSalvando(false); }
  }

  return (
    <Modal aberto drawer tamanho="lg" onFechar={onFechar} titulo={inicial.id ? `Nova versão de ${inicial.codigo}` : 'Nova receita'}
      descricao={inicial.id ? `Hoje na v${inicial.versao}. Ao salvar, nasce a v${(inicial.versao ?? 0) + 1} e só ela pode ser usada em novas ordens.` : 'Descreva quanto de cada material produz a quantidade base do produto.'}
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" form="tf-rec" disabled={salvando}>{inicial.id ? 'Salvar nova versão' : 'Criar receita'}</button></>}>
      <form id="tf-rec" onSubmit={salvar} className="form-grid">
        <Field label="Produto gerado" className="col-8">
          <select className="select" required value={f.produtoId} onChange={e => setF({ ...f, produtoId: e.target.value })} disabled={Boolean(inicial.id)}>
            <option value="">Selecione…</option>
            {ativos.filter(m => m.tipo === 'PRODUTO' || m.tipo === 'INTERMEDIARIO').map(m => <option key={m.id} value={m.id}>[{m.codigo}] {m.nome}</option>)}
          </select>
        </Field>
        <Field label={`Rende${produto ? ` (${produto.unidade})` : ''}`} className="col-4"><input className="input" type="number" min={0} step="any" required value={f.quantidadeBase} onChange={e => setF({ ...f, quantidadeBase: e.target.value })} /></Field>
        <Field label="Nome da receita" className="col-8"><input className="input" required value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Kit de limpeza padrão" /></Field>
        <Field label="Código" className="col-4" dica={inicial.id ? undefined : 'Em branco: RC-<produto>'}><input className="input" value={f.codigo} disabled={Boolean(inicial.id)} onChange={e => setF({ ...f, codigo: e.target.value.toUpperCase() })} /></Field>

        <div className="col-12">
          <h3 className="tf-sub">Materiais</h3>
          <div className="tf-editor-itens">
            {itens.map((it, i) => (
              <div key={i} className={`tf-editor-item ${it.papel === 'SUBPRODUTO' ? 'tf-editor-item--sub' : ''}`}>
                <select className="select" value={it.papel} onChange={e => muda(i, { papel: e.target.value as LinhaItem['papel'] })} aria-label="Papel">
                  <option value="CONSUMO">Consome</option><option value="SUBPRODUTO">Gera também</option>
                </select>
                <select className="select" required value={it.materialId} onChange={e => muda(i, { materialId: e.target.value })} aria-label="Material">
                  <option value="">Material…</option>
                  {ativos.filter(m => m.id !== f.produtoId).map(m => <option key={m.id} value={m.id}>[{m.codigo}] {m.nome}</option>)}
                </select>
                <div className="tf-editor-qtd">
                  <input className="input" type="number" min={0} step="any" required value={it.quantidade} onChange={e => muda(i, { quantidade: e.target.value })} aria-label="Quantidade" />
                  <span className="muted">{un(it.materialId)}</span>
                </div>
                <button type="button" className="icon-btn" aria-label="Remover" onClick={() => setItens(xs => xs.filter((_, j) => j !== i))} disabled={itens.length === 1}><IoTrashOutline /></button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn--sm mt-8" onClick={() => setItens(xs => [...xs, { materialId: '', quantidade: '', papel: 'CONSUMO' }])}><IoAddOutline /> Adicionar material</button>
        </div>

        <div className="col-12"><h3 className="tf-sub">Tolerância de rendimento</h3></div>
        <Field label="Até quanto é normal (%)" className="col-6" dica="Dentro disso, conclui direto"><input className="input" type="number" min={0} step="any" value={f.toleranciaAviso} onChange={e => setF({ ...f, toleranciaAviso: e.target.value })} /></Field>
        <Field label="Até quanto justifica (%)" className="col-6" dica="Acima disso, outro usuário precisa aprovar"><input className="input" type="number" min={0} step="any" value={f.toleranciaBloqueio} onChange={e => setF({ ...f, toleranciaBloqueio: e.target.value })} /></Field>
        <Field label="Observação" className="col-12"><input className="input" value={f.observacao} onChange={e => setF({ ...f, observacao: e.target.value })} placeholder="Modo de preparo, cuidados, referência do cliente" /></Field>
      </form>
    </Modal>
  );
}

function Versoes({ codigo, onFechar }: { codigo: string; onFechar: () => void }) {
  const { dados } = useCarregar(async () => (await api.get<Receita[]>(`/tf/receitas/${encodeURIComponent(codigo)}/versoes`)).data, [codigo]);
  return (
    <Modal aberto drawer tamanho="md" onFechar={onFechar} titulo={`Versões de ${codigo}`} descricao="Cada ordem guarda a versão que usou. Versões antigas não podem mais ser usadas.">
      {!dados ? <Loading linhas={3} /> : (
        <ol className="tf-versoes">
          {dados.map(v => (
            <li key={v.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>v{v.versao} · {v.nome}</b>
                {v.ativa ? <Badge tom="ok">Em uso</Badge> : <Badge plain>Arquivada</Badge>}
              </div>
              <div className="cell-sub">{dataHora(v.createdAt)} · {v.criadoPor} · rende {qtd(v.quantidadeBase, v.produto.unidade)} · ±{numero(v.toleranciaAviso, 1)}% / ±{numero(v.toleranciaBloqueio, 1)}%</div>
              <ul>{v.itens.map(i => <li key={i.id}>{i.papel === 'SUBPRODUTO' ? 'gera ' : ''}{qtd(i.quantidade, i.material.unidade)} {i.material.nome}</li>)}</ul>
            </li>
          ))}
        </ol>
      )}
      {dados && dados.length === 1 && <Notice tom="info">Esta receita ainda só tem uma versão.</Notice>}
    </Modal>
  );
}
