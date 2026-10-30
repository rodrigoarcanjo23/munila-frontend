import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IoCloseOutline, IoPrintOutline } from 'react-icons/io5';
import { toast } from 'react-toastify';
import { data, dataHora, dataUTC } from '../../lib/format';
import { entradaPorUnidade, qtd, rotuloUn, type Ficha, type Requisicao } from './tf';

/**
 * "Registro de transformação de produto: importado / inacabado" no mesmo desenho da planilha em papel:
 * 1. Requisição do produto importado · 2. Conversão em produto acabado · 3. Lançamento de estoque.
 * Sem requisição, sai a ficha em branco para preencher à mão.
 */
export function FichaImpressa({ ficha, rq, onFechar }: { ficha: Ficha; rq?: Requisicao | null; onFechar: () => void }) {
  useEffect(() => {
    document.body.classList.add('com-ficha');
    toast.dismiss();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', esc);
    return () => { document.body.classList.remove('com-ficha'); document.removeEventListener('keydown', esc); };
  }, [onFechar]);

  const saidas = ficha.saidas.filter(s => s.receita);
  const entradas = ficha.entradas;
  const unEntrada = [...new Set(entradas.map(e => rotuloUn(e.unidade)))].join(' / ').toLowerCase();
  const item = (materialId: string) => rq?.itens.find(i => i.materialId === materialId);
  const ordens = (rq?.ordens ?? []).filter(o => o.status !== 'Cancelada');
  const ordemDe = (receitaCodigo: string) => ordens.find(o => o.receita?.codigo === receitaCodigo);
  const lotesEntregues = rq ? rq.itens.flatMap(i => (i.lotes ?? []).map(l => ({ ...l, material: i.material }))) : [];
  const avarias = rq?.itens.filter(i => i.avariada > 0) ?? [];
  const nIn = entradas.length, nOut = saidas.length;
  const linhas2 = Math.max(nIn, nOut);
  const vazio = (n: number) => Array.from({ length: n }, (_, i) => i);

  // consumo de entrada por saída (para escrever o cálculo com números)
  const usadoNaSaida = (receitaCodigo: string) => {
    const o = ordemDe(receitaCodigo);
    return o ? o.itens.filter(i => i.papel === 'CONSUMO').reduce((a, i) => a + i.quantidade, 0) : null;
  };
  const calculoComNumeros = (s: Ficha['saidas'][number]) => {
    const usado = usadoNaSaida(s.receitaCodigo);
    const o = ordemDe(s.receitaCodigo);
    if (usado === null || !o || !s.receita) return null;
    const porUn = entradaPorUnidade(s.receita);
    return `${qtd(usado)} ${porUn >= 1 ? `÷ ${qtd(porUn)}` : `× ${qtd(1 / porUn)}`} = ${qtd(o.quantidadePlanejada)}`;
  };

  const celulaEntrada = (i: number, rowSpan?: number) => {
    const e = entradas[i];
    if (!e) return <><td /><td /><td /></>;
    const it = item(e.id);
    const usado = ordens.reduce((a, o) => a + o.itens.filter(x => x.papel === 'CONSUMO' && x.materialId === e.id).reduce((b, x) => b + x.quantidade, 0), 0);
    return (
      <>
        <td rowSpan={rowSpan} className="fi-c">{e.codigo.replace(/^IMP-/, '')}</td>
        <td rowSpan={rowSpan}>{e.nome}</td>
        <td rowSpan={rowSpan} className="fi-c">{rq && it && ordens.length ? qtd(usado + it.avariada) : ''}</td>
      </>
    );
  };
  const celulaSaida = (j: number, rowSpan?: number) => {
    const s = saidas[j];
    if (!s?.receita) return <><td /><td /><td /><td /><td /><td /></>;
    const o = ordemDe(s.receitaCodigo);
    const feito = o && o.status === 'Concluída';
    const num = calculoComNumeros(s);
    return (
      <>
        <td rowSpan={rowSpan} className="fi-c fi-calc">{s.calculo}{num && <small>{num}</small>}</td>
        <td rowSpan={rowSpan} className="fi-c">{s.receita.produto.codigo}</td>
        <td rowSpan={rowSpan}>{s.receita.produto.nome}</td>
        <td rowSpan={rowSpan} className="fi-c">{feito ? o!.loteCodigo : ''}</td>
        <td rowSpan={rowSpan} className="fi-c">{o ? qtd(o.quantidadePlanejada) : ''}</td>
        <td rowSpan={rowSpan} className="fi-c">{rotuloUn(s.receita.produto.unidade)}</td>
      </>
    );
  };

  const folha = (
    <div className="ficha-impressao" role="dialog" aria-modal="true" aria-label="Registro de transformação">
      <div className="ficha-barra no-print">
        <div><b>Registro de transformação</b><span>{rq ? `${rq.codigo} · ${ficha.nome}` : `Ficha em branco · ${ficha.nome}`}</span></div>
        <button className="btn btn--primary" onClick={() => window.print()} autoFocus><IoPrintOutline /> Imprimir</button>
        <button className="icon-btn" onClick={onFechar} aria-label="Fechar"><IoCloseOutline /></button>
      </div>

      <article className="fi-folha">
        <header className="fi-cab">
          <img src="/marca/munila.png" alt="Grupo Munila" />
          <h1>REGISTRO DE TRANSFORMAÇÃO DE PRODUTO: IMPORTADO / INACABADO</h1>
          <img src="/marca/logo-claro.png" alt="ViaPro" />
        </header>
        <p className="fi-produto">PRODUTO: {ficha.nome.toUpperCase()}</p>

        <Secao titulo="1. REQUISIÇÃO DO PRODUTO IMPORTADO">
          <table className="fi-t">
            <tbody>
              <tr><Lado rowSpan={nIn + 1}>VIAPRO</Lado><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>QUANTIDADE<small>({unEntrada})</small></th><th>DATA</th><th>Nº SOLICITAÇÃO<small>VIAPRO ERP</small></th><th>Nº REQUISIÇÃO VIAPRO</th></tr>
            
              {entradas.map((e, i) => (
                <tr key={e.id}>
                  <td className="fi-c">{e.codigo.replace(/^IMP-/, '')}</td>
                  <td>{e.nome}</td>
                  <td className="fi-c">{rq ? (item(e.id) ? qtd(item(e.id)!.quantidade) : '-') : ''}</td>
                  {i === 0 && <><td rowSpan={nIn} className="fi-c">{rq ? dataUTC(rq.solicitadoEm) : ''}</td><td rowSpan={nIn} className="fi-c fi-forte">{rq?.codigo ?? ''}</td><td rowSpan={nIn} className="fi-c fi-forte">{rq?.numeroViapro ?? ''}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
          <table className="fi-t fi-t--logistica">
            <tbody><tr><Lado rowSpan={Math.max(lotesEntregues.length, nIn, 2) + 1}>LOGÍSTICA MUNILA</Lado><th>LOTE</th><th>ENTREGUE POR</th><th>DATA</th></tr>
              {(lotesEntregues.length ? lotesEntregues : vazio(Math.max(nIn, 2))).map((l, i) => (
                <tr key={i}>
                  <td className="fi-c">{typeof l === 'object' ? <>{l.codigo}<small> · {l.material.codigo.replace(/^IMP-/, '')}: {qtd(l.quantidade)}</small></> : ''}</td>
                  {i === 0 && <><td rowSpan={Math.max(lotesEntregues.length, nIn, 2)} className="fi-c">{rq?.entreguePor ?? ''}</td><td rowSpan={Math.max(lotesEntregues.length, nIn, 2)} className="fi-c">{rq?.entregueEm ? dataUTC(rq.entregueEm) : ''}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>

        <Secao titulo="2. CONVERSÃO DO PRODUTO IMPORTADO EM PRODUTO ACABADO">
          <table className="fi-t">
            <tbody>
              <tr><Lado rowSpan={linhas2 + 3}>VIAPRO</Lado><th colSpan={4} className="fi-grupo">PRODUTO IMPORTADO</th><th colSpan={5} className="fi-grupo">PRODUTO ACABADO</th></tr>
              <tr><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>QUANTIDADE<small>({unEntrada})</small></th><th>CÁLCULO</th><th>CÓDIGO</th><th>DESCRIÇÃO</th><th className="fi-w-lote">LOTE</th><th className="fi-w-qtd">QUANTIDADE</th><th>UND</th></tr>
            
              {vazio(linhas2).map(i => (
                <tr key={i}>
                  {nIn === 1 && nOut > 1 ? (i === 0 ? celulaEntrada(0, nOut) : null) : celulaEntrada(i)}
                  {nOut === 1 && nIn > 1 ? (i === 0 ? celulaSaida(0, nIn) : null) : celulaSaida(i)}
                </tr>
              ))}
              <tr className="fi-rodape">
                <td colSpan={4}><b>QTD AVARIADA:</b> {avarias.map(a => `${qtd(a.avariada)} ${rotuloUn(a.material.unidade)} (${a.material.codigo.replace(/^IMP-/, '')})`).join(', ')}{rq?.avariaMotivo ? ` · ${rq.avariaMotivo}` : ''}</td>
                <td colSpan={3}><b>RESPONSÁVEL:</b> {rq?.responsavelConversao ?? ''}</td>
                <td colSpan={2}><b>DATA:</b> {rq?.convertidaEm ? dataUTC(rq.convertidaEm) : ''}</td>
              </tr>
            </tbody>
          </table>
        </Secao>

        <Secao titulo="3. LANÇAMENTO DE ESTOQUE DE PRODUTO ACABADO">
          <table className="fi-t">
            <tbody><tr><Lado rowSpan={nOut + 1}>LOGÍSTICA MUNILA</Lado><th>CÓDIGO</th><th>DESCRIÇÃO</th><th className="fi-w-lote">LOTE</th><th className="fi-w-qtd">QUANTIDADE</th><th>UND</th><th>LANÇADO POR</th><th>DATA</th></tr>
              {saidas.map((s, j) => {
                const o = ordemDe(s.receitaCodigo);
                const feito = o?.status === 'Concluída';
                return (
                  <tr key={s.receitaCodigo}>
                    <td className="fi-c">{s.receita!.produto.codigo}</td>
                    <td>{s.receita!.produto.nome}</td>
                    <td className="fi-c">{feito ? o!.loteCodigo : ''}</td>
                    <td className="fi-c">{feito ? qtd(o!.quantidadeProduzida) : ''}</td>
                    <td className="fi-c">{rotuloUn(s.receita!.produto.unidade)}</td>
                    {j === 0 && <><td rowSpan={nOut} className="fi-c">{rq?.lancadoPor ?? ''}</td><td rowSpan={nOut} className="fi-c">{rq?.lancadoEm ? data(rq.lancadoEm) : ''}</td></>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Secao>

        <footer className="fi-pe">
          {rq ? <>Situação: {rq.status}{rq.justificativa ? ` · Justificativa: ${rq.justificativa}` : ''}{rq.motivoCancelamento ? ` · Motivo: ${rq.motivoCancelamento}` : ''}</> : 'Ficha em branco'}
          <span>Emitido pelo ViaPro ERP em {dataHora(new Date())}</span>
        </footer>
      </article>
    </div>
  );
  return createPortal(folha, document.body);
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section className="fi-secao"><h2>{titulo}</h2>{children}</section>;
}
function Lado({ children, rowSpan }: { children: ReactNode; rowSpan: number }) {
  return <th rowSpan={rowSpan} className="fi-lado">{children}</th>;
}
