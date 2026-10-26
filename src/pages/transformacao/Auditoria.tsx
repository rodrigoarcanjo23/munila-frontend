import { useMemo, useState } from 'react';
import { IoDownloadOutline, IoShieldCheckmarkOutline, IoWarningOutline, IoRefreshOutline } from 'react-icons/io5';
import { api } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { contem, dataHora, numero } from '../../lib/format';
import { exportarExcel } from '../../lib/exportar';
import { Badge, Code, Empty, Loading, Notice, Panel, SearchInput, Segmented } from '../../components/ui';
import { ROTULO_MOV, qtd, type Evento, type Movimento } from './tf';

export interface Integridade {
  integro: boolean; verificadoEm: string;
  movimentos: { total: number; ok: boolean; quebraEm: number | null };
  eventos: { total: number; ok: boolean; quebraEm: number | null };
  saldos: { ok: boolean; divergentes: { lote: string; material: string; saldo: number; razao: number }[] };
}
interface Legado { id: string; acao: string; detalhes: string; usuario: string; loteInfo: string | null; quantidadeInfo: number | null; dataHora: string }
interface Linha { id: string; tipo: 'Evento' | 'Movimento' | 'Legado'; seq: number | null; dataHora: string; titulo: string; texto: string; usuario: string; hash: string | null; antes?: unknown; depois?: unknown }

const mesAtras = () => new Date(Date.now() - 30 * 86400000).toLocaleDateString('sv-SE');

export function Auditoria() {
  const [inicio, setInicio] = useState(mesAtras);
  const [fim, setFim] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'Evento' | 'Movimento' | 'Legado'>('todos');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [a, i] = await Promise.all([
      api.get<{ eventos: Evento[]; movimentos: Movimento[]; legado: Legado[] }>(`/tf/auditoria?limite=2000${inicio ? `&inicio=${inicio}` : ''}${fim ? `&fim=${fim}` : ''}`),
      api.get<Integridade>('/tf/integridade'),
    ]);
    return { ...a.data, integridade: i.data };
  }, [inicio, fim]);

  const linhas = useMemo<Linha[]>(() => {
    if (!dados) return [];
    const ev: Linha[] = dados.eventos.map(e => ({ id: e.id, tipo: 'Evento', seq: e.seq, dataHora: e.dataHora, titulo: `${e.entidade}: ${e.acao}`, texto: e.resumo, usuario: e.usuario, hash: e.hash, antes: e.antes, depois: e.depois }));
    const mv: Linha[] = dados.movimentos.map(m => ({
      id: m.id, tipo: 'Movimento', seq: m.seq, dataHora: m.dataHora, titulo: `${ROTULO_MOV[m.tipo] ?? m.tipo} ${m.quantidade > 0 ? '+' : '−'}${qtd(Math.abs(m.quantidade), m.material.unidade)}`,
      texto: `${m.material.nome}${m.lote ? ` · lote ${m.lote.codigo}` : ''}${m.documento ? ` · ${m.documento}` : ''}${m.motivo ? ` · ${m.motivo}` : ''}`, usuario: m.usuario, hash: m.hash,
    }));
    const lg: Linha[] = dados.legado.map(l => ({ id: l.id, tipo: 'Legado', seq: null, dataHora: l.dataHora, titulo: l.acao, texto: `${l.detalhes}${l.loteInfo ? ` · lote ${l.loteInfo}` : ''}`, usuario: l.usuario, hash: null }));
    return [...ev, ...mv, ...lg].sort((a, b) => b.dataHora.localeCompare(a.dataHora) || (b.seq ?? 0) - (a.seq ?? 0));
  }, [dados]);
  const visiveis = linhas.filter(l => (filtro === 'todos' || l.tipo === filtro) && contem(busca, l.titulo, l.texto, l.usuario));

  function exportar() {
    exportarExcel('auditoria_transformacao', [{
      nome: 'Trilha', linhas: visiveis, colunas: [
        { titulo: 'Data/hora', valor: l => dataHora(l.dataHora), largura: 18 }, { titulo: 'Tipo', valor: l => l.tipo }, { titulo: 'Seq', valor: l => l.seq ?? '' },
        { titulo: 'O quê', valor: l => l.titulo, largura: 30 }, { titulo: 'Detalhe', valor: l => l.texto, largura: 70 }, { titulo: 'Usuário', valor: l => l.usuario, largura: 20 },
        { titulo: 'Antes', valor: l => (l.antes ? JSON.stringify(l.antes) : ''), largura: 40 }, { titulo: 'Depois', valor: l => (l.depois ? JSON.stringify(l.depois) : ''), largura: 40 },
        { titulo: 'Hash', valor: l => l.hash ?? '', largura: 66 },
      ],
    }]);
  }

  const ig = dados?.integridade;
  return (
    <>
      {ig && (
        <div className={`tf-integridade ${ig.integro ? 'tf-integridade--ok' : 'tf-integridade--bad'}`}>
          <div className="tf-integridade__icone">{ig.integro ? <IoShieldCheckmarkOutline /> : <IoWarningOutline />}</div>
          <div>
            <b>{ig.integro ? 'Registros íntegros' : 'Registros com divergência'}</b>
            <p>
              {ig.integro
                ? `Os ${numero(ig.movimentos.total)} movimentos e ${numero(ig.eventos.total)} eventos formam uma corrente de hashes sem quebra, e o saldo de cada lote bate com a soma do razão. Qualquer edição direta no banco seria detectada aqui.`
                : 'Algum registro foi alterado fora do sistema ou o saldo não bate com o razão. Veja os detalhes abaixo e acione o responsável pelo banco de dados.'}
            </p>
            {!ig.movimentos.ok && <Notice tom="bad">Corrente de movimentos quebrada no registro nº {ig.movimentos.quebraEm}.</Notice>}
            {!ig.eventos.ok && <Notice tom="bad">Corrente de eventos quebrada no registro nº {ig.eventos.quebraEm}.</Notice>}
            {ig.saldos.divergentes.map(d => <Notice key={d.lote} tom="bad">Lote {d.lote} ({d.material}): saldo {qtd(d.saldo)}, razão diz {qtd(d.razao)}.</Notice>)}
            <span className="cell-sub">Verificado em {dataHora(ig.verificadoEm)}</span>
          </div>
          <button className="btn btn--sm" onClick={() => recarregar(true)}><IoRefreshOutline /> Verificar de novo</button>
        </div>
      )}

      <Panel flush titulo="Trilha de auditoria" descricao="Tudo o que aconteceu, por quem e quando. Os registros não podem ser editados nem apagados pelo sistema."
        acoes={<button className="btn btn--sm" onClick={exportar} disabled={!visiveis.length}><IoDownloadOutline /> Excel</button>}>
        <div className="toolbar">
          <label className="tf-periodo">De <input className="input" type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></label>
          <label className="tf-periodo">até <input className="input" type="date" value={fim} onChange={e => setFim(e.target.value)} /></label>
          <SearchInput value={busca} onChange={setBusca} placeholder="Usuário, lote, OT, material" />
          <Segmented valor={filtro} onChange={setFiltro} opcoes={[
            { valor: 'todos', label: 'Tudo' }, { valor: 'Evento', label: 'Ações' }, { valor: 'Movimento', label: 'Movimentos' },
            ...(dados?.legado.length ? [{ valor: 'Legado' as const, label: 'Sistema antigo' }] : []),
          ]} />
        </div>
        {carregando && !dados ? <Loading /> : visiveis.length === 0 ? <Empty titulo="Nada no período">Amplie o período ou limpe a busca.</Empty> : (
          <ol className="tf-trilha tf-trilha--grande">
            {visiveis.slice(0, 600).map(l => (
              <li key={l.id} className={`tf-trilha__item tf-trilha__item--${l.tipo.toLowerCase()}`}>
                <button type="button" className="tf-trilha__linha" onClick={() => setAberto(aberto === l.id ? null : l.id)} aria-expanded={aberto === l.id}>
                  <span className="tf-trilha__quando">{dataHora(l.dataHora)}</span>
                  <span className="tf-trilha__oque"><b>{l.titulo}</b> <span className="muted">{l.texto}</span></span>
                  <span className="tf-trilha__quem">{l.usuario}</span>
                  <Badge plain tom={l.tipo === 'Evento' ? 'primary' : l.tipo === 'Movimento' ? 'info' : undefined}>{l.tipo === 'Legado' ? 'Antigo' : `${l.tipo === 'Evento' ? 'E' : 'M'}${l.seq}`}</Badge>
                </button>
                {aberto === l.id && (
                  <div className="tf-trilha__extra">
                    {(l.antes != null || l.depois != null) && (
                      <div className="tf-diff">
                        <div><span>Antes</span><pre>{l.antes != null ? JSON.stringify(l.antes, null, 2) : '—'}</pre></div>
                        <div><span>Depois</span><pre>{l.depois != null ? JSON.stringify(l.depois, null, 2) : '—'}</pre></div>
                      </div>
                    )}
                    {l.hash ? <div className="cell-sub">Hash: <Code>{l.hash}</Code></div> : <div className="cell-sub">Registro do módulo anterior (sem corrente de hash).</div>}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {visiveis.length > 600 && <p className="muted" style={{ padding: 12 }}>Mostrando 600 de {numero(visiveis.length)}. Exporte para ver tudo.</p>}
      </Panel>
    </>
  );
}
