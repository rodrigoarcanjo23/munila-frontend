import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoCreateOutline, IoOpenOutline, IoPrintOutline } from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { dataUTC, numero } from '../lib/format';
import { tomStatusEstoque } from '../lib/regras';
import { etiquetaDoEndereco, imprimirEtiquetasEndereco, partesDoEndereco } from '../lib/etiquetas';
import type { Armazem, Localizacao } from '../lib/tipos';
import { Badge, Code, Empty, Loading, Modal } from './ui';

// ============================================================
// ✨ FASE 12: etiqueta do endereço (como no sistema antigo) e o conteúdo do endereço:
// cada item com a quantidade aqui e os demais endereços onde ele também está.
// ============================================================
const ROTULOS = ['Rua', 'Col', 'Niv', 'Apt'];

/** Pré-visualização da etiqueta 100 × 50 mm. */
export function EtiquetaEndereco({ deposito, codigo, partes, barras, compacta }: { deposito: string; codigo: string; partes: string[] | null; barras: string | null; compacta?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    import('jsbarcode').then(({ default: JsBarcode }) => {
      if (!ref.current) return;
      try { JsBarcode(ref.current, barras || codigo, { format: 'CODE128', height: compacta ? 34 : 46, width: 1.4, displayValue: true, fontSize: 13, margin: 0, textMargin: 2, font: 'Arial', background: 'transparent' }); } catch { /* código vazio */ }
    });
  }, [barras, codigo, compacta]);
  return (
    <div className={`etq ${compacta ? 'etq--compacta' : ''}`} aria-label={`Etiqueta do endereço ${codigo}`}>
      <div className="etq__dep">{deposito}</div>
      {partes ? (
        <div className="etq__cod">
          {partes.map((p, i) => [
            <span key={i} className="etq__p"><small>{ROTULOS[i].toUpperCase()}</small><b>{p}</b></span>,
            i < 3 && <span key={`s${i}`} className="etq__p etq__sep"><small>-</small><b>.</b></span>,
          ])}
        </div>
      ) : <div className="etq__cod"><span className="etq__p"><small>&nbsp;</small><b>{codigo || '—'}</b></span></div>}
      <svg ref={ref} className="etq__barras" />
    </div>
  );
}

interface Conteudo {
  local: Localizacao & { armazem: Armazem | null };
  itens: {
    produto: { id: string; sku: string; nome: string; unidade: string | null; embalagem: number | null; enderecoLocalizacao: string | null };
    quantidade: number; cadastroAqui: boolean; caixas: number | null; total: number;
    picking: { minimo: number; maximo: number } | null;
    lotes: { id: string; lote: string | null; validade: string | null; quantidade: number; status: string }[];
    outros: { localizacaoId: string | null; codigo: string; armazem: string | null; quantidade: number }[];
  }[];
}

/** Painel do endereço: etiqueta + itens guardados aqui e onde mais cada item está. */
export function EnderecoDetalhe({ localId, padrao, onFechar, onEditar, onAbrirEndereco }: {
  localId: string; padrao?: Armazem; onFechar: () => void; onEditar: (l: Localizacao) => void; onAbrirEndereco: (id: string) => void;
}) {
  const navigate = useNavigate();
  const { dados } = useCarregar(async () => (await api.get<Conteudo>(`/localizacoes/${localId}/conteudo`)).data, [localId]);
  const l = dados?.local;
  const unidades = dados?.itens.reduce((a, i) => a + i.quantidade, 0) ?? 0;
  const et = l ? etiquetaDoEndereco(l, padrao) : null;
  return (
    <Modal aberto drawer tamanho="lg" onFechar={onFechar}
      titulo={l ? <span className="fi-titulo">Endereço <span className="loc">{l.codigo}</span></span> : 'Endereço'}
      descricao={l ? [l.armazem?.nome, l.tipo, l.zona].filter(Boolean).join(' · ') : undefined}
      rodape={l && <>
        <button className="btn" onClick={() => et && imprimirEtiquetasEndereco([et])}><IoPrintOutline /> Imprimir etiqueta</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn--primary" onClick={() => onEditar(l)}><IoCreateOutline /> Editar endereço</button>
      </>}>
      {!dados || !l || !et ? <Loading linhas={6} /> : (
        <div className="end">
          <div className="end__topo">
            <EtiquetaEndereco deposito={et.deposito} codigo={l.codigo} partes={partesDoEndereco(l)} barras={l.codigoBarras ?? null} compacta />
            <dl className="end__dados">
              <div><dt>Itens aqui</dt><dd>{numero(dados.itens.filter(i => i.quantidade > 0).length)}</dd></div>
              <div><dt>Unidades aqui</dt><dd>{numero(unidades)}</dd></div>
              <div><dt>Código de barras</dt><dd className="mono">{l.codigoBarras ?? <span className="muted">usa o próprio código</span>}</dd></div>
              <div><dt>Situação</dt><dd>{l.ativo === false ? <Badge tom="bad" plain>Inativo</Badge> : <Badge tom="ok" plain>Ativo</Badge>}</dd></div>
            </dl>
          </div>

          <h3 className="end__titulo">O que está guardado aqui</h3>
          {dados.itens.length === 0 ? <Empty titulo="Endereço livre">Nenhum item com saldo ou com este endereço no cadastro. Para guardar algo aqui, use a ficha do item (endereçar) ou uma entrada em “Entrada e saída”.</Empty> : (
            <ul className="end__itens">
              {dados.itens.map(i => {
                const pct = i.total ? Math.round((i.quantidade / i.total) * 100) : 0;
                return (
                  <li key={i.produto.id} className="end__item">
                    <div className="end__item-cab">
                      <button type="button" className="end__nome" onClick={() => navigate(`/estoque?item=${i.produto.id}`)} title="Abrir a ficha do item">
                        <b>{i.produto.nome}</b><span><Code>{i.produto.sku}</Code>{i.cadastroAqui && <Badge tom="primary" plain>endereço principal</Badge>}{i.picking && <Badge tom="info" plain>picking {i.picking.minimo}–{i.picking.maximo}</Badge>}</span>
                      </button>
                      <div className="end__qtd">
                        <b>{numero(i.quantidade)}</b><small>{i.produto.unidade ?? 'UN'} aqui{i.caixas ? ` · ${i.caixas} cx` : ''}</small>
                      </div>
                    </div>
                    <div className="end__barra" title={`${pct}% do saldo do item está aqui`}><span style={{ width: `${pct}%` }} /></div>
                    {i.lotes.length > 0 && (
                      <div className="end__lotes">
                        {i.lotes.map(x => (
                          <span key={x.id} className="end__lote">{x.lote ?? 'sem lote'}{x.validade ? ` · val. ${dataUTC(x.validade)}` : ''} · <b>{numero(x.quantidade)}</b>{x.status !== 'Disponível' && <Badge tom={tomStatusEstoque(x.status)} plain>{x.status === 'Ruptura' ? 'Avaria' : x.status}</Badge>}</span>
                        ))}
                      </div>
                    )}
                    <div className="end__outros">
                      <span className="muted">{i.outros.length ? 'Também em:' : 'Só neste endereço.'}</span>
                      {i.outros.map((o, k) => (
                        <button key={k} type="button" className="end__outro" disabled={!o.localizacaoId} onClick={() => o.localizacaoId && onAbrirEndereco(o.localizacaoId)}
                          title={o.localizacaoId ? 'Abrir este endereço' : 'Saldo sem endereço próprio (usa o endereço do cadastro)'}>
                          <span className="mono">{o.codigo}</span>{o.armazem && o.armazem !== l.armazem?.nome ? <small>{o.armazem}</small> : null}<b>{numero(o.quantidade)}</b>
                        </button>
                      ))}
                      <span className="end__total">Total do item: <b>{numero(i.total)}</b></span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="muted end__nota"><IoOpenOutline /> Clique no nome do item para abrir a ficha completa, ou num outro endereço para ver o que há nele.</p>
        </div>
      )}
    </Modal>
  );
}
