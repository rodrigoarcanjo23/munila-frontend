import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  IoRefreshOutline, IoCheckmarkCircleOutline, IoAnalyticsOutline, IoArrowForwardOutline, IoPersonOutline,
} from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { compacto, dataUTC, haQuanto, iniciais, moeda, numero, pct } from '../lib/format';
import { Badge, Code, Empty, Kpi, Loading, PageHeader, Panel } from '../components/ui';
import './Dashboard.css';

interface Painel {
  kpis: Record<string, number | null>;
  alertas: { nivel: 'critico' | 'atencao' | 'info'; titulo: string; rota: string }[];
  hoje: { entradas: number; saidas: number; movimentos: number; usuarios: number; separacoesConcluidas: number; recebimentos: number; porHora: { hora: number; movimentos: number }[] };
  equipe: { usuarioId: string; nome: string; cargo: string; movimentos: number; entradas: number; saidas: number; separacoes: number; linhas: number; minutosSeparando: number }[];
  separacao: {
    pendentes: number; emSeparacao: number; urgentes: number; linhas: number; maisAntigaH: number | null;
    ordens: { id: string; codigo: string; status: string; prioridade: string; tipo: string; solicitante: string; separador: string | null; linhas: number; marcadas: number; unidades: number; criadaEm: string; iniciadaEm: string | null }[];
  };
  recebimentos: {
    atrasados: number; hoje: number; semana: number; semData: number; valorHojeEAtrasado: number;
    pedidos: { id: string; codigo: string | null; fornecedor: string; produto: { id: string; nome: string; sku: string }; quantidade: number; valor: number; dataPrevisao: string | null }[];
  };
  producao: {
    abertas: number; emProducao: number; atrasadas: number; entregaHoje: number;
    ordens: { id: string; codigo: string; produto: { nome: string; sku: string }; status: string; prioridade: string; planejada: number; produzida: number; entregaPrevista: string | null; recurso: string | null; atrasada: boolean }[];
  };
  fora: {
    demonstracao: { unidades: number; valor: number; porResponsavel: { responsavel: string; unidades: number; valor: number; produtos: number }[] };
    avaria: { unidades: number; valor: number; produtos: { produtoId: string; nome: string; sku: string; unidades: number; valor: number }[] };
  };
  financeiro: { pagar: number; receber: number; vencidos: number; pagarVencido: number; receberVencido: number; titulos: { id: string; tipo: 'PAGAR' | 'RECEBER'; descricao: string; quem: string | null; valor: number; vencimento: string; documento: string | null; parcela: string | null }[] };
  filas: { transformacao: { aguardando: number; planejadas: number }; inventario: { abertos: number; itensAContar: number } };
  qualidade: { indice: number; total: number; itens: { chave: string; rotulo: string; impacto: string; quantidade: number }[] };
  atividade: { id: string; dataHora: string; tipo: string; quantidade: number; entrada: boolean; produto: { id: string; nome: string; sku: string }; usuario: string; valor: number }[];
}

const TOM_PRIORIDADE: Record<string, 'bad' | 'warn' | undefined> = { Urgente: 'bad', Alta: 'warn' };
const hojeISO = () => new Date().toLocaleDateString('sv-SE');
/** "hoje", "amanhã", "atrasado 3 d", "05/11 · em 4 d" para datas de agenda (só a data, sem hora). */
function quando(iso: string | null) {
  if (!iso) return { texto: 'sem data', tom: '' };
  const d = Math.round((new Date(iso.slice(0, 10) + 'T12:00:00').getTime() - new Date(hojeISO() + 'T12:00:00').getTime()) / 86400000);
  if (d < 0) return { texto: `atrasado ${-d} d`, tom: 'down' };
  if (d === 0) return { texto: 'hoje', tom: 'qty--warn' };
  if (d === 1) return { texto: 'amanhã', tom: '' };
  return { texto: `${dataUTC(iso).slice(0, 5)} · em ${d} d`, tom: 'muted' };
}
const duracao = (h: number | null) => (h === null ? '-' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${numero(h, h < 10 ? 1 : 0)} h` : `${numero(h / 24, 0)} dias`);

function Contador({ rotulo, valor, tom }: { rotulo: string; valor: ReactNode; tom?: string }) {
  return <div className="contador"><span>{rotulo}</span><b className={tom}>{valor}</b></div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { dados, carregando, erro, recarregar } = useCarregar(async () => {
    const r = await api.get<Painel>('/dashboard/painel?dias=7');
    return { painel: r.data, em: new Date() };
  });

  // A central costuma ficar aberta numa tela do armazém: atualiza sozinha a cada 2 minutos.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') recarregar(true); }, 120000);
    return () => clearInterval(t);
  }, [recarregar]);

  if (carregando && !dados) return <Loading />;
  if (!dados) return (
    <>
      <PageHeader titulo="Painel" />
      <Panel><Empty titulo="Não foi possível montar o painel">{erro}<div className="mt-16"><button className="btn btn--primary" onClick={() => recarregar()}><IoRefreshOutline /> Tentar de novo</button></div></Empty></Panel>
    </>
  );
  const p = dados.painel;
  const k = (n: string) => Number(p.kpis[n] || 0);
  const { separacao: sep, recebimentos: rec, producao: prod, fora, financeiro: fin } = p;
  const maxHora = Math.max(1, ...p.hoje.porHora.map(h => h.movimentos));
  const maxEquipe = Math.max(1, ...p.equipe.map(e => e.movimentos + e.separacoes));

  return (
    <>
      <PageHeader
        titulo="Painel"
        descricao={<>Central da operação: filas, agenda e equipe de hoje. Atualizado às {dados.em.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} e a cada 2 minutos. Tendências e análises ficam no <Link to="/bi">Painel BI</Link>.</>}
        acoes={<>
          <button className="btn" onClick={() => recarregar()}><IoRefreshOutline /> Atualizar</button>
          <button className="btn hide-sm" onClick={() => navigate('/bi')}><IoAnalyticsOutline /> Painel BI</button>
        </>}
      />

      {/* -------- O que está na fila agora -------- */}
      <div className="kpis kpis--painel">
        <Kpi label="Separação na fila" valor={numero(sep.pendentes + sep.emSeparacao)} tom={sep.urgentes ? 'bad' : undefined} onClick={() => navigate('/separacao')}
          dica={sep.urgentes ? `${sep.urgentes} urgente(s) · ${numero(sep.linhas)} linhas a separar` : `${sep.emSeparacao} em andamento · ${numero(sep.linhas)} linhas`} />
        <Kpi label="Recebimentos hoje" valor={numero(rec.hoje + rec.atrasados)} tom={rec.atrasados ? 'warn' : undefined} onClick={() => navigate('/compras')}
          dica={rec.atrasados ? `${rec.atrasados} atrasado(s) · ${moeda(rec.valorHojeEAtrasado)}` : `${rec.semana} previsto(s) nos próximos 7 dias`} />
        <Kpi label="Produção em aberto" valor={numero(prod.abertas)} tom={prod.atrasadas ? 'warn' : undefined} onClick={() => navigate('/pcp/ordens')}
          dica={`${prod.emProducao} em produção · ${prod.atrasadas} atrasada(s)`} />
        <Kpi label="Repor estoque" valor={numero(k('criticos'))} tom={k('zerados') ? 'bad' : k('criticos') ? 'warn' : 'ok'} onClick={() => navigate('/compras/sugestao')}
          dica={`abaixo do mínimo · ${numero(k('zerados'))} zerado(s)`} />
        <Kpi label="Fora do disponível" valor={`${numero(fora.demonstracao.unidades + fora.avaria.unidades)} un`} onClick={() => navigate('/rupturas')}
          dica={`${numero(fora.demonstracao.unidades)} em demonstração · ${numero(fora.avaria.unidades)} em avaria`} tom={fora.avaria.unidades ? 'warn' : undefined} />
        <Kpi label="A pagar na semana" valor={moeda(fin.pagar)} tom={fin.pagarVencido ? 'bad' : undefined} onClick={() => navigate('/financeiro')}
          dica={fin.pagarVencido ? `${moeda(fin.pagarVencido)} já vencido` : fin.receberVencido ? `${moeda(fin.receberVencido)} a receber em atraso` : `${moeda(fin.receber)} a receber`} />
      </div>

      {/* -------- Pulso de hoje -------- */}
      <section className="painel-hoje" aria-label="Operação de hoje">
        <h2>Hoje</h2>
        <dl>
          <div><dt>Movimentos</dt><dd>{numero(p.hoje.movimentos)}</dd></div>
          <div><dt>Entradas</dt><dd>{numero(p.hoje.entradas)} <small>un</small></dd></div>
          <div><dt>Saídas</dt><dd>{numero(p.hoje.saidas)} <small>un</small></dd></div>
          <div><dt>Separações concluídas</dt><dd>{numero(p.hoje.separacoesConcluidas)}</dd></div>
          <div><dt>Recebimentos feitos</dt><dd>{numero(p.hoje.recebimentos)}</dd></div>
          <div><dt>Pessoas operando</dt><dd>{numero(p.hoje.usuarios)}</dd></div>
        </dl>
        <div className="painel-hoje__horas" role="img" aria-label="Movimentos por hora hoje">
          {p.hoje.porHora.slice(6, 23).map(h => (
            <span key={h.hora} title={`${h.hora}h: ${h.movimentos} movimento(s)`}>
              <i style={{ height: `${h.movimentos ? Math.max(8, (h.movimentos / maxHora) * 100) : 0}%` }} />
              {h.hora % 3 === 0 && <small>{h.hora}h</small>}
            </span>
          ))}
        </div>
      </section>

      {/* -------- Fila de separação + alertas -------- */}
      <div className="grid grid-main-side mb-16">
        <Panel flush titulo="Fila de separação" descricao={sep.maisAntigaH !== null ? `Por prioridade e antiguidade. A mais antiga espera há ${duracao(sep.maisAntigaH)}.` : 'Por prioridade e antiguidade'}
          acoes={<button className="btn btn--sm" onClick={() => navigate('/separacao')}>Abrir separação <IoArrowForwardOutline /></button>}>
          {sep.ordens.length === 0 ? <div className="empty"><IoCheckmarkCircleOutline style={{ color: 'var(--ok)', opacity: 1 }} /><b>Fila zerada</b>Nenhuma ordem aguardando separação.</div> : (
            <table className="table table--compacta">
              <thead><tr><th>Ordem</th><th>Prioridade</th><th className="hide-sm">Pedida por</th><th className="hide-sm">Andamento</th><th className="num">Espera</th></tr></thead>
              <tbody>
                {sep.ordens.map(o => (
                  <tr key={o.id} onClick={() => navigate('/separacao')} style={{ cursor: 'pointer' }}>
                    <td><Code>{o.codigo}</Code><div className="cell-sub">{numero(o.linhas)} linha(s) · {numero(o.unidades)} un</div></td>
                    <td><Badge tom={TOM_PRIORIDADE[o.prioridade]} plain>{o.prioridade}</Badge></td>
                    <td className="hide-sm">{o.solicitante}</td>
                    <td className="hide-sm">
                      {o.status === 'Em Separação' ? (
                        <div className="andamento"><div className="meter"><i style={{ width: `${o.linhas ? (o.marcadas / o.linhas) * 100 : 0}%` }} /></div><span>{o.marcadas}/{o.linhas}</span></div>
                      ) : <span className="muted">aguardando</span>}
                      {o.separador && <div className="cell-sub">{o.separador}</div>}
                    </td>
                    <td className="num nowrap">{haQuanto(o.criadaEm).replace(/^há /, '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel titulo="O que precisa de atenção" descricao={p.alertas.length ? `${p.alertas.length} ponto(s), do mais grave ao informativo` : undefined} flush>
          {p.alertas.length === 0
            ? <div className="empty"><IoCheckmarkCircleOutline style={{ color: 'var(--ok)', opacity: 1 }} /><b>Tudo em ordem</b>Nenhum alerta no momento.</div>
            : <ul className="alert-list painel-alertas">{p.alertas.map(a => <li key={a.titulo}><Link to={a.rota}><span className={`dot dot--${a.nivel}`} /><span className="sr-only">{a.nivel === 'critico' ? 'Crítico: ' : a.nivel === 'atencao' ? 'Atenção: ' : ''}</span>{a.titulo}</Link></li>)}</ul>}
        </Panel>
      </div>

      {/* -------- Agenda de recebimentos + produção -------- */}
      <div className="grid grid-2 mb-16">
        <Panel flush titulo="Agenda de recebimentos" descricao="Pedidos de compra pendentes, do mais urgente ao mais distante"
          acoes={<button className="btn btn--sm" onClick={() => navigate('/compras')}>Pedidos <IoArrowForwardOutline /></button>}>
          <div className="contadores">
            <Contador rotulo="Atrasados" valor={rec.atrasados} tom={rec.atrasados ? 'down' : ''} />
            <Contador rotulo="Hoje" valor={rec.hoje} tom={rec.hoje ? 'qty--warn' : ''} />
            <Contador rotulo="Próximos 7 dias" valor={rec.semana} />
            <Contador rotulo="Sem data" valor={rec.semData} />
          </div>
          {rec.pedidos.length === 0 ? <div className="empty">Nenhum pedido de compra pendente.</div> : (
            <table className="table table--compacta">
              <tbody>
                {rec.pedidos.map(r => {
                  const q = quando(r.dataPrevisao);
                  return (
                    <tr key={r.id} onClick={() => navigate('/compras')} style={{ cursor: 'pointer' }}>
                      <td><div className="cell-title">{r.produto.nome}</div><div className="cell-sub">{r.fornecedor}{r.codigo ? ` · ${r.codigo}` : ''}</div></td>
                      <td className="num">{numero(r.quantidade)} un<div className="cell-sub">{moeda(r.valor)}</div></td>
                      <td className="num nowrap"><span className={q.tom}>{q.texto}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel flush titulo="Produção em andamento" descricao="Ordens abertas: atrasadas primeiro, depois as que estão na linha"
          acoes={<button className="btn btn--sm" onClick={() => navigate('/pcp')}>Central do PCP <IoArrowForwardOutline /></button>}>
          <div className="contadores">
            <Contador rotulo="Abertas" valor={prod.abertas} />
            <Contador rotulo="Em produção" valor={prod.emProducao} />
            <Contador rotulo="Entregam hoje" valor={prod.entregaHoje} tom={prod.entregaHoje ? 'qty--warn' : ''} />
            <Contador rotulo="Atrasadas" valor={prod.atrasadas} tom={prod.atrasadas ? 'down' : ''} />
          </div>
          {prod.ordens.length === 0 ? <div className="empty">Nenhuma ordem de produção aberta.</div> : (
            <table className="table table--compacta">
              <tbody>
                {prod.ordens.map(o => {
                  const q = quando(o.entregaPrevista);
                  const feito = o.planejada ? Math.min(100, (o.produzida / o.planejada) * 100) : 0;
                  return (
                    <tr key={o.id} onClick={() => navigate('/pcp/ordens')} style={{ cursor: 'pointer' }}>
                      <td><div className="cell-title">{o.produto.nome}</div><div className="cell-sub"><Code>{o.codigo}</Code> · {o.status}{o.recurso ? ` · ${o.recurso}` : ''}</div></td>
                      <td style={{ width: '28%' }}><div className="andamento"><div className="meter"><i style={{ width: `${feito}%` }} /></div><span>{numero(o.produzida)}/{numero(o.planejada)}</span></div></td>
                      <td className="num nowrap"><span className={o.atrasada ? 'down' : q.tom}>{o.entregaPrevista ? q.texto.replace('atrasado', 'atrasada') : 'sem data'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {/* -------- Equipe, financeiro e material fora do disponível -------- */}
      <div className="grid grid-3 mb-16">
        <Panel flush titulo="Equipe hoje" descricao="Quem está operando e quanto já fez">
          {p.equipe.length === 0 ? <div className="empty"><IoPersonOutline /><b>Ninguém operou ainda hoje</b>Os lançamentos e separações aparecem aqui ao longo do dia.</div> : (
            <ul className="equipe">
              {p.equipe.map(e => (
                <li key={e.usuarioId}>
                  <span className="avatar">{iniciais(e.nome)}</span>
                  <span className="equipe__texto">
                    <b>{e.nome}</b>
                    <small>{e.separacoes ? `${e.separacoes} separação(ões) · ${e.linhas} linhas${e.minutosSeparando ? ` · ${duracao(e.minutosSeparando / 60)}` : ''}` : e.cargo}</small>
                    <span className="meter"><i style={{ width: `${((e.movimentos + e.separacoes) / maxEquipe) * 100}%` }} /></span>
                  </span>
                  <span className="equipe__num"><b>{numero(e.movimentos)}</b><small>lançamentos</small></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel flush titulo="Agenda financeira" descricao="Vencidos e próximos 7 dias"
          acoes={<button className="btn btn--sm btn--ghost" onClick={() => navigate('/financeiro')}>Abrir</button>}>
          <div className="contadores">
            <Contador rotulo="A pagar" valor={`R$ ${compacto(fin.pagar)}`} tom={fin.pagarVencido ? 'down' : ''} />
            <Contador rotulo="A receber" valor={`R$ ${compacto(fin.receber)}`} tom={fin.receber ? 'up' : ''} />
            <Contador rotulo="Vencidos" valor={fin.vencidos} tom={fin.vencidos ? 'down' : ''} />
          </div>
          {fin.titulos.length === 0 ? <div className="empty">Nada vencendo nos próximos 7 dias.</div> : (
            <ul className="agenda">
              {fin.titulos.map(t => {
                const q = quando(t.vencimento);
                return (
                  <li key={t.id}>
                    <span className={`agenda__tipo ${t.tipo === 'PAGAR' ? 'is-pagar' : 'is-receber'}`}>{t.tipo === 'PAGAR' ? 'Pagar' : 'Receber'}</span>
                    <span className="agenda__texto"><b>{t.quem ?? t.descricao}</b><small>{t.quem ? t.descricao : ''}{t.parcela ? ` · ${t.parcela}` : ''}</small></span>
                    <span className="agenda__valor"><b>{moeda(t.valor)}</b><small className={q.tom}>{q.texto.replace('atrasado', 'vencido')}</small></span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel titulo="Fora do disponível" descricao="Material da empresa que não está na prateleira">
          <div className="fora">
            <div className="fora__bloco">
              <div className="fora__cab"><b>Em demonstração</b><span>{numero(fora.demonstracao.unidades)} un · {moeda(fora.demonstracao.valor)}</span></div>
              {fora.demonstracao.porResponsavel.length === 0 ? <p className="muted">Nada em demonstração.</p> : (
                <ul>{fora.demonstracao.porResponsavel.map(r => <li key={r.responsavel}><span>{r.responsavel}<small>{r.produtos} produto(s)</small></span><b>{numero(r.unidades)} un</b></li>)}</ul>
              )}
            </div>
            <div className="fora__bloco">
              <div className="fora__cab"><b>Em avaria</b><span>{numero(fora.avaria.unidades)} un · {moeda(fora.avaria.valor)}</span></div>
              {fora.avaria.produtos.length === 0 ? <p className="muted">Nenhuma avaria pendente.</p> : (
                <ul>{fora.avaria.produtos.map(a => <li key={a.produtoId}><Link to={`/kardex/${a.produtoId}`}>{a.nome}<small>{a.sku}</small></Link><b>{numero(a.unidades)} un</b></li>)}</ul>
              )}
            </div>
            <div className="fora__links">
              <Link to="/transformacao?aba=ordens">Transformações aguardando aprovação: <b>{p.filas.transformacao.aguardando}</b></Link>
              <Link to="/inventario">Inventário: <b>{numero(p.filas.inventario.itensAContar)}</b> item(ns) a contar</Link>
            </div>
          </div>
        </Panel>
      </div>

      {/* -------- Atividade + qualidade do cadastro -------- */}
      <div className="grid grid-main-side">
        <Panel titulo="Atividade recente" descricao="Últimos lançamentos no estoque" flush acoes={<button className="btn btn--sm btn--ghost" onClick={() => navigate('/historico')}>Histórico</button>}>
          {p.atividade.length === 0 ? <div className="empty">Nenhum lançamento ainda.</div> : (
            <ol className="atividade">
              {p.atividade.map(a => (
                <li key={a.id}>
                  <span className={`atividade__sinal ${a.entrada ? 'is-entrada' : 'is-saida'}`} aria-label={a.entrada ? 'Entrada' : 'Saída'}>{a.entrada ? '+' : '−'}</span>
                  <span className="atividade__texto">
                    <span><b>{numero(a.quantidade)} un</b> <Link to={`/kardex/${a.produto.id}`}>{a.produto.nome}</Link></span>
                    <small>{a.tipo} · {a.usuario} · {haQuanto(a.dataHora)}</small>
                  </span>
                  <span className="atividade__valor">{a.valor ? moeda(a.valor) : ''}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel titulo="Qualidade do cadastro" descricao="Clique para abrir só os produtos com a pendência">
          <div className="qualidade-indice">
            <b className={p.qualidade.indice >= 90 ? 'up' : p.qualidade.indice >= 70 ? 'qty--warn' : 'down'}>{pct(p.qualidade.indice, 0)}</b>
            <span>dos campos importantes preenchidos em {numero(p.qualidade.total)} produtos</span>
          </div>
          <ul className="qualidade-lista">
            {p.qualidade.itens.filter(q => q.quantidade > 0).map(q => (
              <li key={q.chave}>
                <Link to={`/produtos?pendencia=${q.chave}`}>
                  <span><span><b>{numero(q.quantidade)}</b> · {q.rotulo}</span><small>{q.impacto}</small></span>
                  <IoArrowForwardOutline aria-hidden />
                </Link>
              </li>
            ))}
            {p.qualidade.itens.every(q => q.quantidade === 0) && <li className="muted">Cadastro completo.</li>}
          </ul>
        </Panel>
      </div>
    </>
  );
}
