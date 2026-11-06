import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { IoAddOutline, IoCreateOutline, IoGitBranchOutline, IoReceiptOutline, IoSaveOutline, IoTrashOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { dataUTC, isoParaInput, moeda, numero } from '../lib/format';
import { ORIGENS_FISCAIS, tomStatusEstoque } from '../lib/regras';
import type { Categoria, Fornecedor, Localizacao, Produto } from '../lib/tipos';
import { Badge, Code, Field, Loading, Modal, Notice, Segmented } from './ui';

// ============================================================
// ✨ Janela do item (ficha): tudo de um produto num lugar só, como no sistema antigo.
// Um item pode estar em vários endereços: cada linha de lote/endereço se edita aqui.
// Mudar quantidade = ajuste de inventário no Kardex (com motivo). Cadastro, EANs, dimensões e picking: botão Salvar.
// ============================================================
export interface Saldos { consignado: number; transito: number; pulmao: number; fisico: number; solicitado: number; reservado: number; avaria: number; disponivel: number; quarentena: number; venda: number }
interface LocMin { id: string; codigo: string; tipo?: string | null; zona?: string | null }
interface Linha {
  id: string; status: string; armazem: { id: string; nome: string } | null; localizacao: LocMin | null; enderecoCadastro: string | null;
  lote: string | null; validade: string | null; vencido: boolean; quantidade: number; caixas: number | null; avulsas: number | null; responsavel: string | null;
}
interface Ean { codigo: string; embalagem: number | string; padrao: boolean }
interface Dim { tipo: string; embalagem: string; quantidade: number | string; altura: number | string | null; largura: number | string | null; profundidade: number | string | null; peso: number | string | null }
interface Pick { localizacaoId: string; minimo: number | string; maximo: number | string }
interface Ficha {
  produto: Omit<Produto, 'eans'> & { eans: Ean[]; dimensoes: Dim[]; pickings: (Pick & { localizacao: LocMin })[] };
  classe: 'A' | 'B' | 'C'; saldos: Saldos; linhas: Linha[];
  ordens: { quantidade: number; ordem: { id: string; codigo: string | null; status: string; prioridade: string; createdAt: string } }[];
  pedidos: { id: string; codigo: string | null; quantidade: number; dataPrevisao: string | null; fornecedor: { nomeEmpresa: string } | null }[];
}
type Aba = 'estoque' | 'cadastro';

export const CAIXAS_SALDO: { k: keyof Saldos; label: string; dica: string }[] = [
  { k: 'consignado', label: 'Est. consig.', dica: 'Em demonstração com representantes' },
  { k: 'transito', label: 'Trânsito', dica: 'Pedidos de compra pendentes' },
  { k: 'pulmao', label: 'Pulmão', dica: 'Disponível em endereços do tipo Pulmão' },
  { k: 'fisico', label: 'Físico', dica: 'Disponível + avaria + sobra sem NF' },
  { k: 'solicitado', label: 'Solicit.', dica: 'Ordens de separação pendentes' },
  { k: 'reservado', label: 'Reserv.', dica: 'Ordens em separação' },
  { k: 'avaria', label: 'Avaria', dica: 'Saldo em Ruptura' },
  { k: 'disponivel', label: 'Dispon.', dica: 'Saldo disponível nos endereços' },
  { k: 'quarentena', label: 'Quarent.', dica: 'Sobra sem NF + lotes vencidos' },
];
const vol = (d: Dim) => { const a = Number(d.altura), l = Number(d.largura), p = Number(d.profundidade); return a > 0 && l > 0 && p > 0 ? a * l * p : null; };
const endLinha = (l: Linha) => l.localizacao?.codigo ?? l.enderecoCadastro;

export function FichaItem({ produtoId, onFechar, onMudou, onKardex }: { produtoId: string; onFechar: () => void; onMudou: () => void; onKardex?: () => void }) {
  const { isAdmin, podeEditarCadastros } = useAuth();
  const [aba, setAba] = useState<Aba>('estoque');
  const { dados, recarregar } = useCarregar(async () => {
    const [f, l, c, fo] = await Promise.all([
      api.get<Ficha>(`/estoque/ficha/${produtoId}`), api.get<Localizacao[]>('/localizacoes'), api.get<Categoria[]>('/categorias'), api.get<Fornecedor[]>('/fornecedores'),
    ]);
    return { ficha: f.data, locais: l.data, categorias: c.data, fornecedores: fo.data };
  }, [produtoId]);

  // rascunho do cadastro (salvo de uma vez)
  const [prod, setProd] = useState<Record<string, any>>({});
  const [eans, setEans] = useState<Ean[]>([]);
  const [dims, setDims] = useState<Dim[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!dados) return;
    const p = dados.ficha.produto;
    setProd({
      sku: p.sku, nome: p.nome, unidade: p.unidade ?? 'UN', categoriaId: p.categoriaId, fornecedorId: p.fornecedorId ?? '', fabricante: p.fabricante ?? '', linha: p.linha ?? '',
      referenciaFabricante: p.referenciaFabricante ?? '', embalagem: p.embalagem ?? '', enderecoLocalizacao: p.enderecoLocalizacao ?? '', lote: p.lote ?? '', validade: isoParaInput(p.validade),
      estoqueMinimo: p.estoqueMinimo ?? '', estoqueMaximo: p.estoqueMaximo ?? '', leadTimeDias: p.leadTimeDias ?? '', precoCusto: p.precoCusto ?? '', precoVenda: p.precoVenda ?? '',
      ncm: p.ncm ?? '', cest: p.cest ?? '', origemFiscal: p.origemFiscal ?? '', cfopPadrao: p.cfopPadrao ?? '', descricao: (p.descricao ?? '').replace(/\s*\[MIN:\d+\]/g, ''), tipo: p.tipo,
    });
    setEans(p.eans.length ? p.eans.map(e => ({ ...e })) : p.codigoBarras ? [{ codigo: p.codigoBarras, embalagem: 1, padrao: true }] : []);
    setDims(p.dimensoes.map(d => ({ ...d })));
    setPicks(p.pickings.map(x => ({ localizacaoId: x.localizacaoId, minimo: x.minimo, maximo: x.maximo })));
    setSujo(false);
  }, [dados]);

  const locaisArm = useMemo(() => (dados?.locais ?? []).filter(l => l.ativo !== false).sort((a, b) => a.codigo.localeCompare(b.codigo)), [dados]);
  const campo = (k: string) => ({ value: prod[k] ?? '', onChange: (e: { target: { value: string } }) => { setProd(x => ({ ...x, [k]: e.target.value })); setSujo(true); }, disabled: !podeEditarCadastros });

  async function salvar() {
    setSalvando(true);
    try {
      await api.put(`/estoque/ficha/${produtoId}`, { produto: { ...prod, embalagem: prod.embalagem === '' ? null : prod.embalagem }, eans, dimensoes: dims, pickings: picks });
      toast.success('Ficha do item salva.');
      setSujo(false); recarregar(true); onMudou();
    } catch (e) { toast.error(msgErro(e), { autoClose: 9000 }); } finally { setSalvando(false); }
  }
  function fechar() {
    if (sujo && !window.confirm('Há alterações não salvas na ficha. Fechar mesmo assim?')) return;
    onFechar();
  }

  const f = dados?.ficha;
  const p = f?.produto;
  return (
    <Modal aberto onFechar={fechar} tamanho="xl"
      titulo={p ? <span className="fi-titulo"><Code>{p.sku}</Code> {p.nome}</span> : 'Item'}
      descricao={p ? [p.fabricante, p.linha, p.categoria?.nome].filter(Boolean).join(' · ') || undefined : undefined}
      rodape={<>
        {onKardex && <button className="btn btn--ghost" onClick={onKardex}><IoReceiptOutline /> Kardex</button>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={fechar}>Fechar</button>
        {podeEditarCadastros && <button className="btn btn--primary" onClick={salvar} disabled={!sujo || salvando}><IoSaveOutline /> {salvando ? 'Salvando…' : 'Salvar ficha'}</button>}
      </>}>
      {!f || !p ? <Loading linhas={8} /> : (
        <div className="fi">
          <div className="fi-cab">
            <div><small>Código</small><b>{p.sku}</b></div>
            <div className="fi-cab__nome"><small>Produto</small><b>{p.nome}</b></div>
            <div><small>ABC</small><Badge tom={f.classe === 'A' ? 'bad' : f.classe === 'B' ? 'warn' : undefined}>{f.classe}</Badge></div>
            <div><small>Fabricante</small><b>{p.fabricante || '-'}</b></div>
            <div><small>Linha</small><b>{p.linha || '-'}</b></div>
            <div className="fi-cab__venda"><small>Estoque venda</small><b>{numero(f.saldos.venda)}</b></div>
          </div>
          <div className="fi-saldos">
            {CAIXAS_SALDO.map(c => (
              <div key={c.k} className={`fi-saldo ${f.saldos[c.k] ? '' : 'is-zero'}`} data-k={c.k} title={c.dica}><small>{c.label}</small><b>{numero(f.saldos[c.k])}</b></div>
            ))}
          </div>

          <Segmented<Aba> valor={aba} onChange={setAba} opcoes={[{ valor: 'estoque', label: 'Lotes e embalagens' }, { valor: 'cadastro', label: 'Cadastro completo' }]} />

          {aba === 'estoque' ? <>
            <Lotes ficha={f} locais={locaisArm} podeAjustar={podeEditarCadastros} onMudou={() => { recarregar(true); onMudou(); }} />
            <div className="fi-grade">
              <section className="fi-bloco">
                <header><h4>Picking × armazenamento</h4>{podeEditarCadastros && <button className="btn btn--sm btn--ghost" onClick={() => { setPicks(x => [...x, { localizacaoId: '', minimo: '', maximo: '' }]); setSujo(true); }}><IoAddOutline /> Endereço</button>}</header>
                {picks.length === 0 ? <p className="muted fi-vazio">Nenhum endereço de picking com mínimo e máximo.</p> : (
                  <table className="fi-mini"><thead><tr><th>Endereço</th><th className="num">Pick. mín.</th><th className="num">Pick. máx.</th><th /></tr></thead><tbody>
                    {picks.map((x, i) => (
                      <tr key={i}>
                        <td><select className="select select--sm" value={x.localizacaoId} disabled={!podeEditarCadastros} onChange={e => { setPicks(a => a.map((y, j) => j === i ? { ...y, localizacaoId: e.target.value } : y)); setSujo(true); }} aria-label="Endereço de picking">
                          <option value="">Escolha…</option>{locaisArm.map(l => <option key={l.id} value={l.id}>{l.codigo}{l.tipo ? ` · ${l.tipo}` : ''}</option>)}
                        </select></td>
                        <td><input className="input input--sm num" type="number" min={0} value={x.minimo} disabled={!podeEditarCadastros} onChange={e => { setPicks(a => a.map((y, j) => j === i ? { ...y, minimo: e.target.value } : y)); setSujo(true); }} aria-label="Mínimo" /></td>
                        <td><input className="input input--sm num" type="number" min={0} value={x.maximo} disabled={!podeEditarCadastros} onChange={e => { setPicks(a => a.map((y, j) => j === i ? { ...y, maximo: e.target.value } : y)); setSujo(true); }} aria-label="Máximo" /></td>
                        <td>{podeEditarCadastros && <button className="icon-btn icon-btn--bad" aria-label="Remover" onClick={() => { setPicks(a => a.filter((_, j) => j !== i)); setSujo(true); }}><IoTrashOutline /></button>}</td>
                      </tr>
                    ))}
                  </tbody></table>
                )}
              </section>

              <section className="fi-bloco">
                <header><h4>EANs</h4>{podeEditarCadastros && <button className="btn btn--sm btn--ghost" onClick={() => { setEans(x => [...x, { codigo: '', embalagem: 1, padrao: x.length === 0 }]); setSujo(true); }}><IoAddOutline /> EAN</button>}</header>
                {eans.length === 0 ? <p className="muted fi-vazio">Sem código de barras. Inclua o EAN da unidade e o da caixa (DUN-14).</p> : (
                  <table className="fi-mini"><thead><tr><th>EAN</th><th className="num">Emb.</th><th className="center">Padrão</th><th /></tr></thead><tbody>
                    {eans.map((x, i) => (
                      <tr key={i}>
                        <td><input className="input input--sm mono" value={x.codigo} disabled={!podeEditarCadastros} inputMode="numeric" onChange={e => { setEans(a => a.map((y, j) => j === i ? { ...y, codigo: e.target.value.replace(/\s/g, '') } : y)); setSujo(true); }} aria-label="Código EAN" /></td>
                        <td><input className="input input--sm num" type="number" min={1} value={x.embalagem} disabled={!podeEditarCadastros} onChange={e => { setEans(a => a.map((y, j) => j === i ? { ...y, embalagem: e.target.value } : y)); setSujo(true); }} aria-label="Unidades na embalagem" /></td>
                        <td className="center"><input type="radio" name="ean-padrao" checked={x.padrao} disabled={!podeEditarCadastros} onChange={() => { setEans(a => a.map((y, j) => ({ ...y, padrao: j === i }))); setSujo(true); }} aria-label="EAN padrão" /></td>
                        <td>{podeEditarCadastros && <button className="icon-btn icon-btn--bad" aria-label="Remover EAN" onClick={() => { setEans(a => { const n = a.filter((_, j) => j !== i); if (n.length && !n.some(y => y.padrao)) n[0] = { ...n[0], padrao: true }; return n; }); setSujo(true); }}><IoTrashOutline /></button>}</td>
                      </tr>
                    ))}
                  </tbody></table>
                )}
              </section>

              <section className="fi-bloco fi-bloco--largo">
                <header><h4>Dimensões</h4>{podeEditarCadastros && dims.length < 2 && <button className="btn btn--sm btn--ghost" onClick={() => { setDims(x => [...x, { tipo: x.some(d => d.tipo === 'CADASTRO') ? 'COMPRA' : 'CADASTRO', embalagem: x.length ? 'CX' : 'UN', quantidade: x.length ? (prod.embalagem || 1) : 1, altura: '', largura: '', profundidade: '', peso: '' }]); setSujo(true); }}><IoAddOutline /> Dimensão</button>}</header>
                {dims.length === 0 ? <p className="muted fi-vazio">Sem medidas. Cadastre a unidade (cadastro) e a caixa de compra.</p> : (
                  <div className="table-wrap"><table className="fi-mini"><thead><tr><th>Tipo</th><th>Emb.</th><th className="num">Qtd.</th><th className="num">Alt. (cm)</th><th className="num">Lrg. (cm)</th><th className="num">Prf. (cm)</th><th className="num">Peso (g)</th><th className="num">Vol. (cm³)</th><th /></tr></thead><tbody>
                    {dims.map((d, i) => {
                      const set = (k: keyof Dim) => (e: { target: { value: string } }) => { setDims(a => a.map((y, j) => j === i ? { ...y, [k]: e.target.value } : y)); setSujo(true); };
                      const v = vol(d);
                      return (
                        <tr key={i}>
                          <td><select className="select select--sm" value={d.tipo} onChange={set('tipo')} disabled={!podeEditarCadastros} aria-label="Tipo"><option value="CADASTRO">Cadastro</option><option value="COMPRA">Compra</option></select></td>
                          <td><input className="input input--sm" style={{ width: 56 }} value={d.embalagem} onChange={set('embalagem')} disabled={!podeEditarCadastros} aria-label="Embalagem" /></td>
                          {(['quantidade', 'altura', 'largura', 'profundidade', 'peso'] as const).map(k => (
                            <td key={k}><input className="input input--sm num" type="number" min={0} step="any" value={d[k] ?? ''} onChange={set(k)} disabled={!podeEditarCadastros} aria-label={k} /></td>
                          ))}
                          <td className="num">{v ? numero(v, v % 1 ? 1 : 0) : '-'}</td>
                          <td>{podeEditarCadastros && <button className="icon-btn icon-btn--bad" aria-label="Remover dimensão" onClick={() => { setDims(a => a.filter((_, j) => j !== i)); setSujo(true); }}><IoTrashOutline /></button>}</td>
                        </tr>
                      );
                    })}
                  </tbody></table></div>
                )}
              </section>
            </div>

            {(f.ordens.length > 0 || f.pedidos.length > 0) && (
              <div className="fi-grade">
                {f.ordens.length > 0 && <section className="fi-bloco"><header><h4>Ordens abertas (solicitado / reservado)</h4></header>
                  <table className="fi-mini"><tbody>{f.ordens.map((o, i) => <tr key={i}><td><Code>{o.ordem.codigo ?? '-'}</Code></td><td><Badge tom={o.ordem.status === 'Pendente' ? 'warn' : 'info'} plain>{o.ordem.status}</Badge></td><td className="num"><b>{numero(o.quantidade)}</b></td></tr>)}</tbody></table>
                </section>}
                {f.pedidos.length > 0 && <section className="fi-bloco"><header><h4>Compras em trânsito</h4></header>
                  <table className="fi-mini"><tbody>{f.pedidos.map(o => <tr key={o.id}><td><Code>{o.codigo ?? '-'}</Code></td><td>{o.fornecedor?.nomeEmpresa ?? '-'}</td><td className="muted">{o.dataPrevisao ? `prev. ${dataUTC(o.dataPrevisao)}` : ''}</td><td className="num"><b>{numero(o.quantidade)}</b></td></tr>)}</tbody></table>
                </section>}
              </div>
            )}
          </> : (
            <div className="form-grid fi-cad">
              <Field label="Código (SKU)" className="col-3"><input className="input" {...campo('sku')} /></Field>
              <Field label="Descrição" className="col-6"><input className="input" {...campo('nome')} /></Field>
              <Field label="UN" className="col-3"><input className="input" {...campo('unidade')} /></Field>
              <Field label="Fabricante" className="col-4"><input className="input" {...campo('fabricante')} /></Field>
              <Field label="Linha" className="col-4"><input className="input" {...campo('linha')} /></Field>
              <Field label="Ref. fabricante" className="col-4"><input className="input" {...campo('referenciaFabricante')} /></Field>
              <Field label="Categoria" className="col-4"><select className="select" {...campo('categoriaId')}>{dados.categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
              <Field label="Fornecedor" className="col-4"><select className="select" {...campo('fornecedorId')}><option value="">Nenhum</option>{dados.fornecedores.map(c => <option key={c.id} value={c.id}>{c.nomeEmpresa}</option>)}</select></Field>
              <Field label="Tipo" className="col-4"><select className="select" {...campo('tipo')}><option value="ACABADO">Produto acabado</option><option value="MATERIA_PRIMA">Matéria-prima</option></select></Field>
              <Field label="Embalagem (un. por caixa)" className="col-3" dica="Usado para caixas fechadas"><input className="input" type="number" min={1} {...campo('embalagem')} /></Field>
              <Field label="Endereço principal" className="col-3"><input className="input" list="fi-locais" {...campo('enderecoLocalizacao')} /><datalist id="fi-locais">{locaisArm.map(l => <option key={l.id} value={l.codigo} />)}</datalist></Field>
              <Field label="Lote padrão" className="col-3"><input className="input" {...campo('lote')} /></Field>
              <Field label="Validade padrão" className="col-3"><input className="input" type="date" {...campo('validade')} /></Field>
              <Field label="Estoque mínimo" className="col-3"><input className="input" type="number" min={0} {...campo('estoqueMinimo')} /></Field>
              <Field label="Estoque máximo" className="col-3"><input className="input" type="number" min={0} {...campo('estoqueMaximo')} /></Field>
              <Field label="Lead time (dias)" className="col-3"><input className="input" type="number" min={0} {...campo('leadTimeDias')} /></Field>
              {isAdmin ? <>
                <Field label="Preço de custo" className="col-3" dica={prod.precoCusto ? moeda(Number(prod.precoCusto)) : undefined}><input className="input" type="number" min={0} step="0.01" {...campo('precoCusto')} /></Field>
                <Field label="Preço de venda" className="col-3" dica={prod.precoVenda ? moeda(Number(prod.precoVenda)) : undefined}><input className="input" type="number" min={0} step="0.01" {...campo('precoVenda')} /></Field>
              </> : <div className="col-3" />}
              <Field label="NCM" className="col-3"><input className="input" {...campo('ncm')} /></Field>
              <Field label="CEST" className="col-3"><input className="input" {...campo('cest')} /></Field>
              <Field label="CFOP padrão" className="col-3"><input className="input" {...campo('cfopPadrao')} /></Field>
              <Field label="Origem" className="col-6"><select className="select" {...campo('origemFiscal')}><option value="">Não informada</option>{ORIGENS_FISCAIS.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}</select></Field>
              <Field label="Observações" className="col-12"><textarea className="textarea" rows={2} {...campo('descricao')} /></Field>
              <div className="col-12"><Notice>Os códigos de barras ficam na aba de lotes (EANs). O EAN padrão vira o código de barras principal do produto.</Notice></div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Lotes por endereço, com edição em linha e "Endereçar" (dividir para outro endereço). */
function Lotes({ ficha, locais, podeAjustar, onMudou }: { ficha: Ficha; locais: Localizacao[]; podeAjustar: boolean; onMudou: () => void }) {
  const emb = ficha.produto.embalagem || null;
  const [edit, setEdit] = useState<{ id: string; modo: 'editar' | 'enderecar'; localizacaoId: string; lote: string; validade: string; quantidade: string; motivo: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const locaisDe = (l: Linha) => locais.filter(x => !x.armazemId || !l.armazem || x.armazemId === l.armazem.id);

  function abrir(l: Linha, modo: 'editar' | 'enderecar') {
    setEdit({ id: l.id, modo, localizacaoId: modo === 'editar' ? l.localizacao?.id ?? '' : '', lote: l.lote ?? '', validade: isoParaInput(l.validade), quantidade: modo === 'editar' ? String(l.quantidade) : '', motivo: '' });
  }
  async function confirmar(l: Linha) {
    if (!edit) return;
    setSalvando(true);
    try {
      if (edit.modo === 'enderecar') {
        const q = Math.round(Number(edit.quantidade));
        if (!(q > 0) || !edit.localizacaoId) { toast.warn('Informe a quantidade e o endereço de destino.'); return; }
        await api.post(`/estoque/linhas/${l.id}/enderecar`, { quantidade: q, localizacaoId: edit.localizacaoId, motivo: edit.motivo });
        toast.success(`${numero(q)} un. levadas para ${locais.find(x => x.id === edit.localizacaoId)?.codigo}.`);
      } else {
        const corpo: Record<string, unknown> = { motivo: edit.motivo };
        if (Number(edit.quantidade) !== l.quantidade) corpo.quantidade = edit.quantidade;
        if (edit.localizacaoId !== (l.localizacao?.id ?? '')) corpo.localizacaoId = edit.localizacaoId || null;
        if (edit.lote.trim().toUpperCase() !== (l.lote ?? '')) corpo.lote = edit.lote;
        if (edit.validade !== isoParaInput(l.validade)) corpo.validade = edit.validade || null;
        if (Object.keys(corpo).length === 1) { setEdit(null); return; }
        const { data } = await api.put<{ mudancas: string[] }>(`/estoque/linhas/${l.id}`, corpo);
        toast.success(data.mudancas.length ? `Atualizado: ${data.mudancas.join('; ')}.` : 'Nada mudou.');
      }
      setEdit(null); onMudou();
    } catch (e) { toast.error(msgErro(e), { autoClose: 9000 }); } finally { setSalvando(false); }
  }

  const total = ficha.linhas.reduce((a, l) => a + (l.status === 'Disponível' ? l.quantidade : 0), 0);
  const diferenca = edit?.modo === 'editar' ? Number(edit.quantidade) - (ficha.linhas.find(l => l.id === edit.id)?.quantidade ?? 0) : 0;
  return (
    <section className="fi-bloco fi-lotes">
      <header><h4>Lotes e endereços</h4><span className="muted">{ficha.linhas.length} linha(s) · {numero(total)} disponível{emb ? ` · caixa com ${emb}` : ''}</span></header>
      {ficha.linhas.length === 0 ? <p className="muted fi-vazio">Sem saldo. Faça uma entrada em “Entrada e saída”.</p> : (
        <div className="table-wrap">
          <table className="fi-mini fi-mini--lotes">
            <thead><tr><th>Armazém</th><th>Zona</th><th>Local</th><th>Lote</th><th>Vencimento</th><th className="num">Emb.</th><th className="num">Est. físico</th><th className="num">Cx. fechadas</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {ficha.linhas.map(l => {
                const aberto = edit?.id === l.id;
                const zona = l.localizacao ? [...new Set([l.localizacao.zona, l.localizacao.tipo].filter(Boolean))].join(' · ') : '';
                return [
                  <tr key={l.id} className={aberto ? 'is-selected' : ''}>
                    <td>{l.armazem?.nome ?? '-'}</td>
                    <td className="muted">{zona || (l.localizacao ? '-' : 'cadastro')}</td>
                    <td><b className="mono">{endLinha(l) ?? <span className="muted">sem endereço</span>}</b></td>
                    <td>{l.lote ?? <span className="muted">sem lote</span>}</td>
                    <td className={l.vencido ? 'down' : ''}>{l.validade ? dataUTC(l.validade) : '-'}{l.vencido && <small> vencido</small>}</td>
                    <td className="num muted">{emb ?? '-'}</td>
                    <td className="num"><b>{numero(l.quantidade)}</b></td>
                    <td className="num">{l.caixas !== null ? <>{numero(l.caixas)}{l.avulsas ? <small className="muted"> + {l.avulsas}</small> : null}</> : '-'}</td>
                    <td><Badge tom={tomStatusEstoque(l.status)} plain>{l.status === 'Ruptura' ? 'Avaria' : l.status}</Badge>{l.responsavel && <div className="cell-sub">com {l.responsavel}</div>}</td>
                    <td className="actions">
                      {podeAjustar && l.status === 'Disponível' && <div className="row" style={{ flexWrap: 'nowrap', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="icon-btn" title="Editar endereço, lote, validade ou quantidade" aria-label="Editar linha" onClick={() => (aberto && edit?.modo === 'editar' ? setEdit(null) : abrir(l, 'editar'))}><IoCreateOutline /></button>
                        {l.quantidade > 0 && <button className="icon-btn" title="Levar parte para outro endereço" aria-label="Endereçar" onClick={() => (aberto && edit?.modo === 'enderecar' ? setEdit(null) : abrir(l, 'enderecar'))}><IoGitBranchOutline /></button>}
                      </div>}
                    </td>
                  </tr>,
                  aberto && edit && (
                    <tr key={`${l.id}-e`} className="fi-edit"><td colSpan={10}>
                      {edit.modo === 'editar' ? (
                        <div className="fi-edit__grid">
                          <Field label="Local"><select className="select select--sm" value={edit.localizacaoId} onChange={e => setEdit({ ...edit, localizacaoId: e.target.value })}>
                            <option value="">{ficha.produto.enderecoLocalizacao ? `${ficha.produto.enderecoLocalizacao} (cadastro)` : 'Sem endereço'}</option>
                            {locaisDe(l).map(x => <option key={x.id} value={x.id}>{x.codigo}{x.tipo ? ` · ${x.tipo}` : ''}</option>)}
                          </select></Field>
                          <Field label="Lote"><input className="input input--sm" value={edit.lote} onChange={e => setEdit({ ...edit, lote: e.target.value.toUpperCase() })} /></Field>
                          <Field label="Vencimento"><input className="input input--sm" type="date" value={edit.validade} onChange={e => setEdit({ ...edit, validade: e.target.value })} /></Field>
                          <Field label="Quantidade" dica={diferenca ? <b className={diferenca > 0 ? 'up' : 'down'}>Ajuste {diferenca > 0 ? '+' : '−'}{numero(Math.abs(diferenca))} no Kardex</b> : undefined}>
                            <input className="input input--sm num" type="number" min={0} value={edit.quantidade} onChange={e => setEdit({ ...edit, quantidade: e.target.value })} />
                          </Field>
                          <Field label={diferenca || edit.lote !== (l.lote ?? '') || edit.validade !== isoParaInput(l.validade) ? 'Motivo (obrigatório)' : 'Motivo'} className="fi-edit__motivo">
                            <input className="input input--sm" value={edit.motivo} onChange={e => setEdit({ ...edit, motivo: e.target.value })} placeholder="Ex.: recontagem do endereço" />
                          </Field>
                          <div className="fi-edit__acoes"><button className="btn btn--sm" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn--sm btn--primary" disabled={salvando} onClick={() => confirmar(l)}>Aplicar</button></div>
                        </div>
                      ) : (
                        <div className="fi-edit__grid">
                          <Field label={`Quantidade (de ${numero(l.quantidade)})`}><input className="input input--sm num" type="number" min={1} max={l.quantidade} value={edit.quantidade} onChange={e => setEdit({ ...edit, quantidade: e.target.value })} autoFocus /></Field>
                          <Field label="Para o endereço"><select className="select select--sm" value={edit.localizacaoId} onChange={e => setEdit({ ...edit, localizacaoId: e.target.value })}>
                            <option value="">Escolha…</option>
                            {locaisDe(l).filter(x => x.id !== l.localizacao?.id).map(x => <option key={x.id} value={x.id}>{x.codigo}{x.tipo ? ` · ${x.tipo}` : ''}</option>)}
                          </select></Field>
                          <Field label="Observação" className="fi-edit__motivo"><input className="input input--sm" value={edit.motivo} onChange={e => setEdit({ ...edit, motivo: e.target.value })} placeholder="Ex.: reabastecer o picking" /></Field>
                          <div className="fi-edit__acoes"><button className="btn btn--sm" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn--sm btn--primary" disabled={salvando} onClick={() => confirmar(l)}>Endereçar</button></div>
                        </div>
                      )}
                    </td></tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
