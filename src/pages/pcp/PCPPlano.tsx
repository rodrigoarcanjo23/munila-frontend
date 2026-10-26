import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { IoSaveOutline, IoFlashOutline, IoConstructOutline, IoWarning, IoDownloadOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { contem, numero } from '../../lib/format';
import { exportarExcel } from '../../lib/exportar';
import { diaMes } from '../../lib/pcp';
import { Code, Empty, Loading, PageHeader, Panel, SearchInput, useDialogo } from '../../components/ui';
import { CargaRecursos } from './Carga';
import './pcp.css';

interface LinhaSemana { semana: string; demanda: number; plano: number; ops: number; projetado: number; sugestao: number; abaixo: boolean }
interface ProdutoPlano { produtoId: string; nome: string; sku: string; unidade: string; categoria: string; saldo: number; seguranca: number; demandaMediaSemana: number; historico: number[]; linhas: LinhaSemana[] }
interface Resp {
  semanas: string[]; produtos: ProdutoPlano[];
  carga: { recursos: { id: string; codigo: string; nome: string; capacidadeSemana: number; semanas: { carga: number; pct: number | null }[] }[]; semRecurso: number[] };
}

export default function PCPPlano() {
  const { confirmar } = useDialogo();
  const [n, setN] = useState(8);
  const [edicao, setEdicao] = useState<Record<string, number>>({}); // produtoId|semana -> quantidade
  const [busca, setBusca] = useState('');
  const [semanaOP, setSemanaOP] = useState('');
  const [salvando, setSalvando] = useState(false);
  const { dados, carregando, recarregar } = useCarregar(async () => (await api.get<Resp>(`/pcp/plano?semanas=${n}`)).data, [n]);

  const chave = (p: string, s: string) => `${p}|${s}`;
  const planoDe = (p: ProdutoPlano, l: LinhaSemana) => edicao[chave(p.produtoId, l.semana)] ?? l.plano;
  const alterados = Object.keys(edicao).length;

  // recalcula o estoque projetado com as edições ainda não salvas
  const produtos = useMemo(() => (dados?.produtos ?? []).filter(p => contem(busca, p.nome, p.sku, p.categoria)).map(p => {
    let proj = p.saldo;
    return { ...p, linhas: p.linhas.map(l => { const plano = planoDe(p, l); proj += Math.max(plano, l.ops) - l.demanda; return { ...l, plano, projetado: proj, abaixo: proj < p.seguranca }; }) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dados, edicao, busca]);

  function editar(p: ProdutoPlano, s: string, v: string, original: number) {
    const q = Math.max(0, Math.round(Number(v) || 0));
    setEdicao(e => { const c = { ...e }; if (q === original) delete c[chave(p.produtoId, s)]; else c[chave(p.produtoId, s)] = q; return c; });
  }
  function aplicarSugestoes() {
    const novo = { ...edicao };
    let n2 = 0;
    for (const p of dados?.produtos ?? []) for (const l of p.linhas) if (l.plano === 0 && l.sugestao > 0 && novo[chave(p.produtoId, l.semana)] === undefined) { novo[chave(p.produtoId, l.semana)] = l.sugestao; n2++; }
    setEdicao(novo);
    toast.info(n2 ? `${n2} semana(s) preenchida(s) com a sugestão. Revise e salve.` : 'Nenhuma sugestão nova: o plano já cobre a demanda e o estoque de segurança.');
  }
  async function salvar() {
    setSalvando(true);
    try {
      const itens = Object.entries(edicao).map(([k, quantidade]) => { const [produtoId, semana] = k.split('|'); return { produtoId, semana, quantidade }; });
      await api.put('/pcp/plano', { itens });
      toast.success('Plano mestre salvo.');
      setEdicao({}); recarregar(true);
    } catch (err) { toast.error(msgErro(err)); } finally { setSalvando(false); }
  }
  async function gerarOPs() {
    const semana = semanaOP || dados?.semanas[0];
    if (!semana) return;
    if (alterados) return toast.warn('Salve o plano antes de gerar as ordens.');
    if (!(await confirmar({ titulo: `Gerar ordens da semana de ${diaMes(semana)}?`, mensagem: 'Cria uma OP planejada para cada produto com quantidade no plano dessa semana, descontando as ordens que já existem.', confirmar: 'Gerar ordens' }))) return;
    try {
      const r = await api.post<{ criadas: number }>('/pcp/plano/gerar-ops', { semana });
      toast.success(r.data.criadas ? `${r.data.criadas} ordem(ns) criada(s).` : 'Nada a gerar: as ordens já cobrem o plano dessa semana.');
      recarregar(true);
    } catch (err) { toast.error(msgErro(err)); }
  }
  function exportar() {
    if (!dados) return;
    const linhas = produtos.flatMap(p => (['Demanda prevista', 'Plano', 'OPs firmes', 'Estoque projetado'] as const).map(t => ({ p, t })));
    exportarExcel('Plano_mestre', [{
      nome: 'Plano mestre', linhas, colunas: [
        { titulo: 'SKU', valor: x => x.p.sku }, { titulo: 'Produto', valor: x => x.p.nome, largura: 36 }, { titulo: 'Linha', valor: x => x.t, largura: 18 },
        ...dados.semanas.map((s, i) => ({ titulo: diaMes(s), valor: (x: { p: typeof produtos[number]; t: string }) => { const l = x.p.linhas[i]; return x.t === 'Demanda prevista' ? l.demanda : x.t === 'Plano' ? l.plano : x.t === 'OPs firmes' ? l.ops : l.projetado; } })),
      ],
    }]);
  }

  if (carregando && !dados) return <Loading />;
  if (!dados) return null;
  const totais = dados.semanas.map((_, i) => produtos.reduce((a, p) => a + p.linhas[i].plano, 0));

  return (
    <>
      <PageHeader titulo="Plano mestre de produção" descricao="Quanto produzir de cada produto por semana. A demanda prevista vem do histórico de vendas; o estoque projetado mostra se o plano cobre a demanda e o estoque de segurança."
        acoes={<>
          <select className="select" style={{ width: 'auto' }} value={n} onChange={e => setN(Number(e.target.value))} aria-label="Horizonte">
            <option value={6}>6 semanas</option><option value={8}>8 semanas</option><option value={12}>12 semanas</option><option value={16}>16 semanas</option>
          </select>
          <button className="btn" onClick={exportar}><IoDownloadOutline /> Excel</button>
          <button className="btn" onClick={aplicarSugestoes}><IoFlashOutline /> Aplicar sugestões</button>
          <button className="btn btn--primary" onClick={salvar} disabled={!alterados || salvando}><IoSaveOutline /> Salvar plano{alterados ? ` (${alterados})` : ''}</button>
        </>} />

      <Panel flush className="mb-16">
        <div className="toolbar">
          <SearchInput value={busca} onChange={setBusca} placeholder="Produto, SKU ou categoria" />
          <div className="row pcp-gerar">
            <span className="muted">Firmar o plano:</span>
            <select className="select" value={semanaOP || dados.semanas[0]} onChange={e => setSemanaOP(e.target.value)} aria-label="Semana">
              {dados.semanas.map(s => <option key={s} value={s}>Semana de {diaMes(s)}</option>)}
            </select>
            <button className="btn" onClick={gerarOPs}><IoConstructOutline /> Gerar ordens</button>
          </div>
        </div>
        {produtos.length === 0 ? <Empty titulo="Nenhum produto fabricado">O plano mestre lista os produtos que têm ficha técnica. <Link to="/pcp/estruturas">Cadastrar ficha técnica</Link></Empty> : (
          <div className="mps-scroll">
            <table className="mps">
              <thead>
                <tr>
                  <th className="mps__fixa">Produto</th><th className="mps__tipo" />
                  {dados.semanas.map((s, i) => <th key={s} className={i === 0 ? 'is-atual' : ''}>{i === 0 ? 'Esta semana' : 'Semana'}<b>{diaMes(s)}</b></th>)}
                </tr>
              </thead>
              <tbody>
                {produtos.map(p => (
                  <Fragment key={p.produtoId}>
                    <tr className="mps__inicio">
                      <th className="mps__fixa" rowSpan={4}>
                        <div className="cell-title">{p.nome}</div>
                        <div className="cell-sub"><Code>{p.sku}</Code> {p.categoria}</div>
                        <div className="mps__info">Saldo <b>{numero(p.saldo)}</b> · segurança <b>{numero(p.seguranca)}</b> · venda média <b>{numero(p.demandaMediaSemana, 1)}</b>/sem</div>
                      </th>
                      <td className="mps__tipo">Demanda prevista</td>
                      {p.linhas.map(l => <td key={l.semana} className="num muted">{numero(l.demanda)}</td>)}
                    </tr>
                    <tr>
                      <td className="mps__tipo"><b>Plano</b></td>
                      {p.linhas.map(l => {
                        const original = dados.produtos.find(x => x.produtoId === p.produtoId)!.linhas.find(x => x.semana === l.semana)!.plano;
                        const mudou = edicao[chave(p.produtoId, l.semana)] !== undefined;
                        return (
                          <td key={l.semana} className="mps__input">
                            <input type="number" min={0} inputMode="numeric" className={mudou ? 'is-mudou' : ''} value={l.plano || ''} placeholder={l.sugestao > 0 ? String(l.sugestao) : '0'}
                              aria-label={`Plano de ${p.nome} na semana de ${diaMes(l.semana)}`} title={l.sugestao > 0 ? `Sugestão: ${l.sugestao}` : undefined}
                              onChange={e => editar(p, l.semana, e.target.value, original)} />
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="mps__tipo">OPs firmes</td>
                      {p.linhas.map(l => <td key={l.semana} className="num">{l.ops ? numero(l.ops) : <span className="muted">-</span>}</td>)}
                    </tr>
                    <tr className="mps__fim">
                      <td className="mps__tipo">Estoque projetado</td>
                      {p.linhas.map(l => <td key={l.semana} className={`num ${l.abaixo ? 'mps__abaixo' : ''}`} title={l.abaixo ? `Abaixo do estoque de segurança (${p.seguranca})` : undefined}>{l.abaixo && <IoWarning aria-label="Abaixo da segurança" />}{numero(l.projetado)}</td>)}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr><th className="mps__fixa">Total planejado</th><td className="mps__tipo" />{totais.map((t, i) => <td key={i} className="num"><b>{numero(t)}</b></td>)}</tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
      <p className="muted pcp-nota">Número cinza no campo do plano é a sugestão: o mínimo para o estoque projetado não ficar abaixo da segurança. Quando o plano é menor que as OPs firmes, vale a quantidade das OPs.</p>

      <Panel titulo="Carga dos recursos com o plano" descricao="Ordens abertas mais a parte do plano que ainda não virou ordem (no recurso que o produto mais usa)">
        <CargaRecursos semanas={dados.semanas} recursos={dados.carga.recursos} semRecurso={dados.carga.semRecurso} />
      </Panel>
    </>
  );
}
