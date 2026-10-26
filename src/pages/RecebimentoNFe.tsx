import { useState, type ChangeEvent, type DragEvent } from 'react';
import { toast } from 'react-toastify';
import { IoCloudUploadOutline, IoCheckmarkDoneOutline, IoRefreshOutline, IoLinkOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { dataHora, moeda, normalizar, numero } from '../lib/format';
import type { Produto } from '../lib/tipos';
import { useArmazens } from '../components/EstoqueModais';
import { Badge, Code, Empty, Field, Kpi, Loading, Notice, PageHeader, Panel, useDialogo } from '../components/ui';

interface ItemNF {
  n: string; lote: string; validade: string; cProd: string; cEAN: string; xProd: string; uCom: string; qCom: number; vUnCom: number; vProd: number;
  produtoId: string; fator: number; automatico: boolean;
}
interface Duplicata { numero: string; vencimento: string; valor: number }
interface NotaFiscal { numero: string; serie: string; emitente: string; cnpj: string; chave: string; emissao: string; valorTotal: number; itens: ItemNF[]; duplicatas: Duplicata[] }

const txt = (el: Element | null | undefined, tag: string) => el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';

/** Lê o XML da NF-e (modelo 55) no navegador — nada é enviado até a confirmação. */
function lerXML(xml: string, produtos: Produto[]): NotaFiscal {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo XML inválido.');
  const inf = doc.getElementsByTagName('infNFe')[0];
  if (!inf) throw new Error('Este XML não é uma NF-e (infNFe não encontrado).');
  const ide = inf.getElementsByTagName('ide')[0];
  const emit = inf.getElementsByTagName('emit')[0];
  // Cada <det> vira uma linha; se o item tiver vários lotes (<rastro>), vira uma linha por lote.
  const itens = Array.from(inf.getElementsByTagName('det')).flatMap((det, i) => {
    const prod = det.getElementsByTagName('prod')[0];
    const cEAN = txt(prod, 'cEAN');
    const cProd = txt(prod, 'cProd');
    const achado = produtos.find(p => (cEAN && cEAN !== 'SEM GTIN' && p.codigoBarras === cEAN) || normalizar(p.sku) === normalizar(cProd));
    const base = {
      cProd, cEAN: cEAN === 'SEM GTIN' ? '' : cEAN, xProd: txt(prod, 'xProd'), uCom: txt(prod, 'uCom'),
      qCom: Number(txt(prod, 'qCom')) || 0, vUnCom: Number(txt(prod, 'vUnCom')) || 0, vProd: Number(txt(prod, 'vProd')) || 0,
      produtoId: achado?.id ?? '', fator: 1, automatico: Boolean(achado),
    };
    const rastros = Array.from(prod.getElementsByTagName('rastro'));
    if (rastros.length === 0) return [{ ...base, n: String(i + 1), lote: '', validade: '' }];
    return rastros.map((r, j) => ({
      ...base, n: rastros.length > 1 ? `${i + 1}.${j + 1}` : String(i + 1),
      lote: txt(r, 'nLote').toUpperCase(), validade: txt(r, 'dVal').slice(0, 10), qCom: Number(txt(r, 'qLote')) || base.qCom,
    }));
  });
  const duplicatas = Array.from(inf.getElementsByTagName('dup')).map(d => ({
    numero: txt(d, 'nDup'), vencimento: txt(d, 'dVenc').slice(0, 10), valor: Number(txt(d, 'vDup')) || 0,
  }));
  return {
    numero: txt(ide, 'nNF'), serie: txt(ide, 'serie'), emitente: txt(emit, 'xNome'), cnpj: txt(emit, 'CNPJ'),
    chave: (inf.getAttribute('Id') || '').replace(/^NFe/, ''), emissao: txt(ide, 'dhEmi') || txt(ide, 'dEmi'),
    valorTotal: Number(txt(inf.getElementsByTagName('ICMSTot')[0], 'vNF')) || itens.reduce((a, i) => a + i.vProd, 0), itens, duplicatas,
  };
}

export default function RecebimentoNFe() {
  const { usuario } = useAuth();
  const { confirmar } = useDialogo();
  const [nota, setNota] = useState<NotaFiscal | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [atualizarCusto, setAtualizarCusto] = useState(true);
  const [gerarTitulos, setGerarTitulos] = useState(true);
  const { armazens, padraoId } = useArmazens();
  const [armazemId, setArmazemId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ codigo: string; unidades: number } | null>(null);
  const { dados: produtos, carregando } = useCarregar(async () => (await api.get<Produto[]>('/produtos')).data);

  async function abrirArquivo(file?: File) {
    if (!file) return;
    try {
      setNota(lerXML(await file.text(), produtos ?? []));
      setResultado(null);
    } catch (e) { toast.error((e as Error).message); }
  }

  const atualizarItem = (n: string, patch: Partial<ItemNF>) => setNota(x => x && { ...x, itens: x.itens.map(i => (i.n === n ? { ...i, ...patch } : i)) });
  const vinculados = nota?.itens.filter(i => i.produtoId) ?? [];

  async function confirmarEntrada() {
    if (!nota || vinculados.length === 0) return toast.warn('Vincule ao menos um item a um produto.');
    const ignorados = nota.itens.length - vinculados.length;
    if (!(await confirmar({
      titulo: `Dar entrada na NF-e ${nota.numero}?`, confirmar: 'Registrar entrada',
      mensagem: <>{vinculados.length} item(ns) entrarão no estoque disponível.{ignorados > 0 && <><br /><b>{ignorados} item(ns) sem vínculo serão ignorados.</b></>}</>,
    }))) return;
    setEnviando(true);
    try {
      const { data } = await api.post('/recebimentos/nfe', {
        usuarioId: usuario?.id, numero: nota.numero, emitente: nota.emitente, cnpjEmitente: nota.cnpj, chave: nota.chave, atualizarCusto,
        armazemId: armazemId || padraoId || undefined, gerarTitulos, duplicatas: nota.duplicatas,
        itens: vinculados.map(i => ({ produtoId: i.produtoId, quantidade: Math.round(i.qCom * i.fator), custoUnitario: i.fator ? i.vUnCom / i.fator : i.vUnCom, lote: i.lote || undefined, validade: i.validade || undefined })),
      });
      setResultado(data);
      toast.success(`Entrada ${data.codigo} registrada: ${data.unidades} unidades${data.titulos ? ` e ${data.titulos} título(s) a pagar` : ''}.`);
    } catch (e) { toast.error(msgErro(e)); } finally { setEnviando(false); }
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setArrastando(false); abrirArquivo(e.dataTransfer.files[0]); };

  if (carregando && !produtos) return <Loading />;
  return (
    <>
      <PageHeader titulo="Entrada por XML da NF-e" descricao="Importe o XML da nota do fornecedor: os itens são reconhecidos pelo código de barras ou SKU e entram no estoque em um clique."
        acoes={nota && <button className="btn" onClick={() => { setNota(null); setResultado(null); }}><IoRefreshOutline /> Outra nota</button>} />

      {!nota && (
        <label className="panel" onDragOver={e => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={onDrop}
          style={{ display: 'grid', placeItems: 'center', padding: 48, cursor: 'pointer', borderStyle: 'dashed', borderWidth: 2, borderColor: arrastando ? 'var(--primary)' : 'var(--line-strong)', background: arrastando ? 'var(--primary-soft)' : undefined }}>
          <input type="file" accept=".xml,text/xml" className="sr-only" onChange={(e: ChangeEvent<HTMLInputElement>) => abrirArquivo(e.target.files?.[0])} />
          <div className="empty" style={{ padding: 0 }}>
            <IoCloudUploadOutline style={{ fontSize: 44 }} />
            <b>Arraste o XML da NF-e aqui ou clique para escolher</b>
            O arquivo é lido no seu navegador. Nada é gravado até você confirmar.
          </div>
        </label>
      )}

      {nota && (
        <>
          <div className="kpis">
            <Kpi label="Nota fiscal" valor={`${nota.numero}${nota.serie ? `/${nota.serie}` : ''}`} dica={nota.emissao ? dataHora(nota.emissao) : undefined} />
            <Kpi label="Emitente" valor={<span style={{ fontSize: 18 }}>{nota.emitente}</span>} dica={nota.cnpj && `CNPJ ${nota.cnpj}`} />
            <Kpi label="Valor da nota" valor={moeda(nota.valorTotal)} tom="primary" />
            <Kpi label="Itens vinculados" valor={`${vinculados.length} / ${nota.itens.length}`} tom={vinculados.length === nota.itens.length ? 'ok' : 'warn'} />
          </div>

          {resultado && <div className="mb-16"><Notice tom="ok">Entrada <b>{resultado.codigo}</b> registrada com {numero(resultado.unidades)} unidades. Consulte em Auditoria ou no Kardex de cada produto.</Notice></div>}

          <Panel flush titulo="Itens da nota" descricao="Confira o vínculo de cada item. Use o fator quando o fornecedor vende em caixa (ex.: 1 CX = 12 UN)."
            acoes={<>
              <select className="select" style={{ width: 'auto' }} value={armazemId || padraoId} onChange={e => setArmazemId(e.target.value)} aria-label="Armazém de destino">
                {armazens.map(a => <option key={a.id} value={a.id}>Entrar em: {a.nome}</option>)}
              </select>
              <label className="check"><input type="checkbox" checked={atualizarCusto} onChange={e => setAtualizarCusto(e.target.checked)} /> Atualizar custo dos produtos</label>
              <button className="btn btn--primary" onClick={confirmarEntrada} disabled={enviando || !!resultado}><IoCheckmarkDoneOutline /> {enviando ? 'Registrando…' : 'Registrar entrada'}</button>
            </>}>
            {nota.itens.length === 0 ? <Empty titulo="A nota não tem itens" /> : (
              <div className="table-wrap">
                <table className="table table--cards">
                  <thead><tr><th>#</th><th>Item na nota</th><th>Lote / validade</th><th className="num">Qtd. nota</th><th className="num">Unitário</th><th>Produto no sistema</th><th className="num">Fator</th><th className="num">Entra no estoque</th></tr></thead>
                  <tbody>
                    {nota.itens.map(i => (
                      <tr key={i.n}>
                        <td data-label="#">{i.n}</td>
                        <td data-primary=""><div className="cell-title">{i.xProd}</div><div className="cell-sub"><Code>{i.cProd}</Code> {i.cEAN && <>EAN {i.cEAN}</>}</div></td>
                        <td data-label="Lote">
                          <input className="input" style={{ height: 32, width: 110 }} value={i.lote} placeholder="Sem lote" onChange={e => atualizarItem(i.n, { lote: e.target.value.toUpperCase() })} aria-label="Lote" />
                          <input className="input mt-8" style={{ height: 32, width: 140 }} type="date" value={i.validade} onChange={e => atualizarItem(i.n, { validade: e.target.value })} aria-label="Validade" />
                        </td>
                        <td className="num" data-label="Qtd. nota">{numero(i.qCom, i.qCom % 1 ? 2 : 0)} {i.uCom}</td>
                        <td className="num" data-label="Unitário">{moeda(i.vUnCom)}</td>
                        <td data-label="Produto">
                          <div className="row" style={{ flexWrap: 'nowrap' }}>
                            <select className="select" style={{ height: 32, minWidth: 200 }} value={i.produtoId} onChange={e => atualizarItem(i.n, { produtoId: e.target.value, automatico: false })} aria-label="Produto vinculado">
                              <option value="">Não dar entrada</option>
                              {(produtos ?? []).map(p => <option key={p.id} value={p.id}>{p.nome} ({p.sku})</option>)}
                            </select>
                            {i.automatico && i.produtoId && <Badge tom="ok" plain><IoLinkOutline /> auto</Badge>}
                          </div>
                        </td>
                        <td className="num" data-label="Fator"><input className="input" type="number" min={1} style={{ width: 70, height: 32, textAlign: 'right', marginLeft: 'auto' }} value={i.fator} onChange={e => atualizarItem(i.n, { fator: Math.max(1, Number(e.target.value) || 1) })} aria-label="Fator de conversão" /></td>
                        <td className="num" data-label="Entra"><b>{i.produtoId ? numero(Math.round(i.qCom * i.fator)) : '-'}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          {nota.duplicatas.length > 0 && (
            <Panel flush className="mt-16" titulo="Duplicatas (cobrança)" descricao="Viram contas a pagar no financeiro ao registrar a entrada."
              acoes={<label className="check"><input type="checkbox" checked={gerarTitulos} onChange={e => setGerarTitulos(e.target.checked)} /> Lançar no contas a pagar</label>}>
              <table className="table">
                <thead><tr><th>Duplicata</th><th>Vencimento</th><th className="num">Valor</th></tr></thead>
                <tbody>{nota.duplicatas.map(d => <tr key={d.numero + d.vencimento}><td>{d.numero}</td><td>{d.vencimento.split('-').reverse().join('/')}</td><td className="num">{moeda(d.valor)}</td></tr>)}</tbody>
              </table>
            </Panel>
          )}
          {nota.chave && <p className="muted mt-8" style={{ fontSize: 12 }}>Chave de acesso: {nota.chave}</p>}
        </>
      )}

      {!nota && (
        <div className="grid grid-3 mt-16">
          <Panel titulo="Reconhecimento automático"><p className="muted">Itens com o mesmo código de barras (EAN) ou SKU do cadastro são vinculados sozinhos.</p></Panel>
          <Panel titulo="Conversão de unidade"><Field label="Exemplo"><p className="muted">Nota com 10 CX e fator 12 → entram 120 unidades.</p></Field></Panel>
          <Panel titulo="Rastreabilidade"><p className="muted">A entrada recebe um código RE e o número da nota fica registrado na movimentação de cada produto.</p></Panel>
        </div>
      )}
    </>
  );
}
