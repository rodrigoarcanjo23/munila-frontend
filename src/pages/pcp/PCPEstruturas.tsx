import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { IoAddOutline, IoPencilOutline, IoTrashOutline, IoConstructOutline, IoCashOutline, IoGitNetworkOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { contem, moeda, numero, pct } from '../../lib/format';
import type { Produto } from '../../lib/tipos';
import { ProdutoPicker } from '../../components/ProdutoPicker';
import { Badge, Code, Empty, Loading, Modal, PageHeader, SearchInput, useDialogo } from '../../components/ui';
import { ModalOP, useCadastrosPCP } from '../../components/pcp/OrdemProducao';
import './pcp.css';

interface Comp { produtoId: string; nome: string; sku: string; unidade: string; quantidade: number; custoUnitario: number; subtotal: number; saldo: number; temEstrutura: boolean; rende: number }
interface Estrutura {
  produtoId: string; nome: string; sku: string; unidade: string; categoria: string; precoVenda: number; custoCadastro: number; custoEstrutura: number;
  margem: number | null; divergenciaCusto: number | null; podeProduzir: number; saldo: number; componentes: Comp[]; usadoEm: string[];
}

export default function PCPEstruturas() {
  const navigate = useNavigate();
  const { confirmar } = useDialogo();
  const cad = useCadastrosPCP();
  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ produtoId: string; nome: string; itens: { produtoId: string; nome: string; sku: string; quantidade: number }[] } | null>(null);
  const [novaFicha, setNovaFicha] = useState(false);
  const [novaOP, setNovaOP] = useState<string | null>(null);
  const { dados, carregando, recarregar } = useCarregar(async () => (await api.get<{ estruturas: Estrutura[] }>('/pcp/estruturas')).data.estruturas);

  const lista = useMemo(() => (dados ?? []).filter(e => contem(busca, e.nome, e.sku, e.categoria, ...e.componentes.map(c => c.nome))), [dados, busca]);
  const sel = (dados ?? []).find(e => e.produtoId === selId) ?? lista[0] ?? null;
  const semFicha = useMemo(() => cad.produtos.filter(p => !(p.ingredientes?.length)), [cad.produtos]);

  function abrirEditor(e: Estrutura | Produto) {
    if ('componentes' in e) setEditor({ produtoId: e.produtoId, nome: e.nome, itens: e.componentes.map(c => ({ produtoId: c.produtoId, nome: c.nome, sku: c.sku, quantidade: c.quantidade })) });
    else setEditor({ produtoId: e.id, nome: e.nome, itens: [] });
  }
  async function salvarFicha() {
    if (!editor) return;
    if (!editor.itens.length && !(await confirmar({ titulo: 'Remover a ficha técnica?', mensagem: 'Sem componentes, o produto deixa de aparecer no plano mestre e não pode ter novas ordens de produção.', confirmar: 'Remover', perigo: true }))) return;
    try {
      await api.put(`/pcp/estruturas/${editor.produtoId}`, { componentes: editor.itens.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })) });
      toast.success('Ficha técnica salva.');
      setSelId(editor.produtoId); setEditor(null); recarregar(true);
    } catch (err) { toast.error(msgErro(err)); }
  }
  async function atualizarCusto(e: Estrutura) {
    if (!(await confirmar({ titulo: 'Atualizar o custo do produto?', mensagem: `O custo do cadastro passa de ${moeda(e.custoCadastro)} para ${moeda(e.custoEstrutura)} (soma dos componentes). Afeta a valorização do estoque e as margens.`, confirmar: 'Atualizar custo' }))) return;
    try { await api.put(`/pcp/estruturas/${e.produtoId}/custo`, { custo: e.custoEstrutura }); toast.success('Custo atualizado.'); recarregar(true); } catch (err) { toast.error(msgErro(err)); }
  }

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Fichas técnicas" descricao="Estrutura de cada produto fabricado: componentes, quantidades, custo calculado e quanto dá para produzir com o estoque atual."
        acoes={<button className="btn btn--primary" onClick={() => setNovaFicha(true)}><IoAddOutline /> Nova ficha técnica</button>} />
      {!dados?.length ? (
        <div className="panel"><Empty titulo="Nenhuma ficha técnica">Escolha um produto e informe os componentes e quantidades para começar a planejar a produção. <button className="btn btn--primary btn--sm mt-8" onClick={() => setNovaFicha(true)}><IoAddOutline /> Nova ficha técnica</button></Empty></div>
      ) : (
        <div className="bom">
          <aside className="panel bom__lista">
            <div className="toolbar"><SearchInput value={busca} onChange={setBusca} placeholder="Produto ou componente" /></div>
            <ul>
              {lista.map(e => (
                <li key={e.produtoId}>
                  <button type="button" className={sel?.produtoId === e.produtoId ? 'is-ativo' : ''} onClick={() => setSelId(e.produtoId)}>
                    <span className="cell-title">{e.nome}</span>
                    <span className="cell-sub"><Code>{e.sku}</Code> {e.componentes.length} componente(s) · {moeda(e.custoEstrutura)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          {sel && (
            <section className="panel bom__det">
              <header className="bom__cab">
                <div><h2>{sel.nome}</h2><p className="muted"><Code>{sel.sku}</Code> {sel.categoria} · saldo {numero(sel.saldo)} {sel.unidade}</p></div>
                <div className="row">
                  <button className="btn btn--sm" onClick={() => abrirEditor(sel)}><IoPencilOutline /> Editar ficha</button>
                  <button className="btn btn--sm btn--primary" onClick={() => setNovaOP(sel.produtoId)}><IoConstructOutline /> Nova OP</button>
                </div>
              </header>
              <dl className="bom__nums">
                <div><dt>Custo pela ficha</dt><dd>{moeda(sel.custoEstrutura)}</dd></div>
                <div><dt>Custo no cadastro</dt><dd>{moeda(sel.custoCadastro)}{sel.divergenciaCusto !== null && Math.abs(sel.divergenciaCusto) >= 1 && <small className={sel.divergenciaCusto > 0 ? 'down' : 'up'}> {sel.divergenciaCusto > 0 ? '+' : ''}{pct(sel.divergenciaCusto, 0)}</small>}</dd></div>
                <div><dt>Preço de venda</dt><dd>{sel.precoVenda ? moeda(sel.precoVenda) : '-'}</dd></div>
                <div><dt>Margem pela ficha</dt><dd>{sel.margem === null ? '-' : pct(sel.margem, 0)}</dd></div>
                <div><dt>Dá para produzir</dt><dd>{numero(sel.podeProduzir)} {sel.unidade}</dd></div>
              </dl>
              {sel.divergenciaCusto !== null && Math.abs(sel.divergenciaCusto) >= 1 && (
                <div className="bom__aviso"><span>O custo do cadastro está diferente da soma dos componentes.</span><button className="btn btn--sm" onClick={() => atualizarCusto(sel)}><IoCashOutline /> Usar custo da ficha</button></div>
              )}
              <div className="op-tabela">
                <table className="table">
                  <thead><tr><th>Componente</th><th className="num">Qtd. por un.</th><th className="num">Custo un.</th><th className="num">Subtotal</th><th>Peso no custo</th><th className="num">Saldo</th><th className="num">Rende</th></tr></thead>
                  <tbody>
                    {[...sel.componentes].sort((a, b) => b.subtotal - a.subtotal).map(c => {
                      const gargalo = c.rende === sel.podeProduzir;
                      return (
                        <tr key={c.produtoId} onClick={() => navigate(`/kardex/${c.produtoId}`)} style={{ cursor: 'pointer' }}>
                          <td>{c.nome}<div className="cell-sub"><Code>{c.sku}</Code> {c.temEstrutura && <Badge plain tom="primary"><IoGitNetworkOutline /> Semiacabado</Badge>}</div></td>
                          <td className="num"><b>{c.quantidade}</b> {c.unidade}</td>
                          <td className="num">{moeda(c.custoUnitario)}</td>
                          <td className="num">{moeda(c.subtotal)}</td>
                          <td style={{ minWidth: 110 }}><div className="meter"><i style={{ width: `${sel.custoEstrutura ? (c.subtotal / sel.custoEstrutura) * 100 : 0}%` }} /></div></td>
                          <td className="num">{numero(c.saldo)}</td>
                          <td className="num">{gargalo ? <Badge tom="warn" plain>{numero(c.rende)} · gargalo</Badge> : numero(c.rende)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {sel.usadoEm.length > 0 && <p className="muted pcp-nota">Este produto também é componente de: {sel.usadoEm.join(', ')}.</p>}
            </section>
          )}
        </div>
      )}

      {novaFicha && (
        <Modal aberto onFechar={() => setNovaFicha(false)} titulo="Nova ficha técnica" descricao="Escolha o produto que será fabricado" tamanho="md">
          <ProdutoPicker produtos={semFicha} autoFocus placeholder="Produto sem ficha técnica" onSelecionar={p => { setNovaFicha(false); abrirEditor(p); }} />
        </Modal>
      )}
      {editor && (
        <Modal aberto onFechar={() => setEditor(null)} titulo={`Ficha técnica · ${editor.nome}`} descricao="Quantidade de cada componente para produzir 1 unidade" tamanho="lg"
          rodape={<><button className="btn" onClick={() => setEditor(null)}>Cancelar</button><button className="btn btn--primary" onClick={salvarFicha}>Salvar ficha técnica</button></>}>
          <ProdutoPicker produtos={cad.produtos.filter(p => p.id !== editor.produtoId && !editor.itens.some(i => i.produtoId === p.id))} placeholder="Adicionar componente (nome, SKU ou código de barras)"
            onSelecionar={p => setEditor({ ...editor, itens: [...editor.itens, { produtoId: p.id, nome: p.nome, sku: p.sku, quantidade: 1 }] })} />
          {editor.itens.length === 0 ? <p className="muted mt-16">Nenhum componente ainda.</p> : (
            <table className="table mt-16">
              <thead><tr><th>Componente</th><th className="num" style={{ width: 140 }}>Qtd. por unidade</th><th style={{ width: 48 }} /></tr></thead>
              <tbody>
                {editor.itens.map((i, k) => (
                  <tr key={i.produtoId}>
                    <td>{i.nome}<div className="cell-sub"><Code>{i.sku}</Code></div></td>
                    <td className="num"><input className="input" type="number" min={1} step={1} value={i.quantidade} aria-label={`Quantidade de ${i.nome}`}
                      onChange={e => setEditor({ ...editor, itens: editor.itens.map((x, j) => (j === k ? { ...x, quantidade: Math.max(1, Math.round(Number(e.target.value) || 1)) } : x)) })} /></td>
                    <td><button className="icon-btn icon-btn--bad" aria-label={`Remover ${i.nome}`} onClick={() => setEditor({ ...editor, itens: editor.itens.filter((_, j) => j !== k) })}><IoTrashOutline /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted pcp-nota">Ordens já criadas mantêm a ficha da época em que foram abertas; a nova ficha vale para as próximas ordens, para o plano mestre e para o MRP.</p>
        </Modal>
      )}
      {novaOP && <ModalOP cad={cad} inicial={{ produtoId: novaOP }} onFechar={() => setNovaOP(null)} onSalvo={() => { setNovaOP(null); toast.info('Acompanhe a ordem em PCP → Ordens de produção.'); }} />}
    </>
  );
}
