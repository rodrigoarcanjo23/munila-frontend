import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IoAddOutline, IoDownloadOutline } from 'react-icons/io5';
import { api } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { contem, dataHora, dataUTC, moeda, numero } from '../../lib/format';
import { exportarExcel } from '../../lib/exportar';
import { STATUS_ABERTOS, TOM_PRIORIDADE, type OrdemProducao } from '../../lib/pcp';
import { DataTable, type Col } from '../../components/DataTable';
import { Badge, Code, Empty, Loading, PageHeader, Panel, SearchInput, Segmented } from '../../components/ui';
import { DrawerOP, MaterialBadge, ModalOP, Progresso, StatusOPBadge, useCadastrosPCP } from '../../components/pcp/OrdemProducao';
import './pcp.css';

type Filtro = 'abertas' | 'atrasadas' | 'concluidas' | 'canceladas' | 'todas';

export default function PCPOrdens() {
  const [params, setParams] = useSearchParams();
  const filtro = (params.get('filtro') as Filtro) || 'abertas';
  const setFiltro = (f: Filtro) => setParams(f === 'abertas' ? {} : { filtro: f }, { replace: true });
  const [busca, setBusca] = useState('');
  const [recurso, setRecurso] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const cad = useCadastrosPCP();
  const { dados, carregando, recarregar } = useCarregar(async () => (await api.get<OrdemProducao[]>('/pcp/ordens?limite=2000')).data);

  const contagem = useMemo(() => {
    const l = dados ?? [];
    return {
      abertas: l.filter(o => STATUS_ABERTOS.includes(o.status)).length, atrasadas: l.filter(o => o.atrasada).length,
      concluidas: l.filter(o => o.status === 'Concluída').length, canceladas: l.filter(o => o.status === 'Cancelada').length, todas: l.length,
    };
  }, [dados]);

  const linhas = useMemo(() => (dados ?? []).filter(o =>
    (filtro === 'todas' || (filtro === 'abertas' && STATUS_ABERTOS.includes(o.status)) || (filtro === 'atrasadas' && o.atrasada)
      || (filtro === 'concluidas' && o.status === 'Concluída') || (filtro === 'canceladas' && o.status === 'Cancelada'))
    && (!recurso || (recurso === '-' ? !o.recursoId : o.recursoId === recurso))
    && contem(busca, o.codigo, o.produto.nome, o.produto.sku, o.loteProducao, o.observacao)), [dados, filtro, recurso, busca]);

  const colunas: Col<OrdemProducao>[] = [
    { key: 'c', titulo: 'OP', ordenar: o => o.codigo, render: o => <><Code>{o.codigo}</Code><div className="cell-sub">{o.origem}</div></> },
    { key: 'p', titulo: 'Produto', principal: true, ordenar: o => o.produto.nome, render: o => <><div className="cell-title">{o.produto.nome}</div><div className="cell-sub"><Code>{o.produto.sku}</Code> {o.loteProducao && `lote ${o.loteProducao}`}</div></> },
    { key: 's', titulo: 'Situação', ordenar: o => o.status, render: o => <StatusOPBadge op={o} /> },
    { key: 'pr', titulo: 'Prioridade', ordenar: o => ['Urgente', 'Alta', 'Normal', 'Baixa'].indexOf(o.prioridade), render: o => <Badge tom={TOM_PRIORIDADE[o.prioridade]} plain>{o.prioridade}</Badge> },
    { key: 'q', titulo: 'Produção', ordenar: o => o.progresso, render: o => <Progresso op={o} /> },
    { key: 'i', titulo: 'Início', ordenar: o => o.inicioPrevisto, render: o => dataUTC(o.inicioPrevisto) },
    { key: 'e', titulo: 'Entrega', ordenar: o => o.entregaPrevista, render: o => <span className={o.atrasada ? 'down' : ''}>{dataUTC(o.entregaPrevista)}</span> },
    { key: 'r', titulo: 'Recurso', ocultarCelular: true, ordenar: o => o.recurso?.codigo, render: o => o.recurso ? <span title={o.recurso.nome}>{o.recurso.codigo}</span> : <span className="muted">-</span> },
    { key: 'm', titulo: 'Material', ocultarCelular: true, render: o => <MaterialBadge op={o} /> },
  ];

  function exportar() {
    exportarExcel('Ordens_de_producao', [{
      nome: 'Ordens', linhas, colunas: [
        { titulo: 'OP', valor: o => o.codigo }, { titulo: 'SKU', valor: o => o.produto.sku }, { titulo: 'Produto', valor: o => o.produto.nome, largura: 40 },
        { titulo: 'Situação', valor: o => o.status + (o.atrasada ? ' (atrasada)' : '') }, { titulo: 'Prioridade', valor: o => o.prioridade }, { titulo: 'Origem', valor: o => o.origem },
        { titulo: 'Planejado', valor: o => o.quantidadePlanejada }, { titulo: 'Produzido', valor: o => o.quantidadeProduzida }, { titulo: 'Refugo', valor: o => o.quantidadeRefugo },
        { titulo: 'Início previsto', valor: o => dataUTC(o.inicioPrevisto) }, { titulo: 'Entrega prevista', valor: o => dataUTC(o.entregaPrevista) },
        { titulo: 'Iniciada', valor: o => dataHora(o.iniciadaEm) }, { titulo: 'Concluída', valor: o => dataHora(o.concluidaEm) },
        { titulo: 'Recurso', valor: o => o.recurso?.nome ?? '' }, { titulo: 'Lote', valor: o => o.loteProducao || o.codigo }, { titulo: 'Material', valor: o => o.material?.status ?? '' },
        { titulo: 'Custo previsto', valor: o => moeda(o.custoPrevisto) },
      ],
    }]);
  }

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Ordens de produção" descricao="Todas as OPs com situação, prazo, material e andamento. Clique em uma ordem para liberar, apontar ou encerrar."
        acoes={<>
          <button className="btn" onClick={exportar}><IoDownloadOutline /> Excel</button>
          <button className="btn btn--primary" onClick={() => setNova(true)}><IoAddOutline /> Nova ordem</button>
        </>} />
      <Panel flush>
        <div className="toolbar">
          <Segmented valor={filtro} onChange={setFiltro} opcoes={[
            { valor: 'abertas', label: 'Abertas', n: contagem.abertas }, { valor: 'atrasadas', label: 'Atrasadas', n: contagem.atrasadas },
            { valor: 'concluidas', label: 'Concluídas', n: contagem.concluidas }, { valor: 'canceladas', label: 'Canceladas', n: contagem.canceladas },
            { valor: 'todas', label: 'Todas', n: contagem.todas },
          ]} />
          <SearchInput value={busca} onChange={setBusca} placeholder="OP, produto, SKU ou lote" />
          <select className="select" value={recurso} onChange={e => setRecurso(e.target.value)} aria-label="Recurso">
            <option value="">Todos os recursos</option>
            <option value="-">Sem recurso</option>
            {cad.recursos.map(r => <option key={r.id} value={r.id}>{r.codigo} · {r.nome}</option>)}
          </select>
        </div>
        <DataTable colunas={colunas} linhas={linhas} chave={o => o.id} onLinha={o => setAberta(o.id)} destaque={o => o.atrasada}
          ordemInicial={{ key: filtro === 'abertas' || filtro === 'atrasadas' ? 'e' : 'c', dir: filtro === 'abertas' || filtro === 'atrasadas' ? 'asc' : 'desc' }}
          vazio={<Empty titulo="Nenhuma ordem aqui">{filtro === 'abertas' ? <>Crie uma ordem ou gere as ordens a partir do plano mestre. <button className="btn btn--sm btn--primary mt-8" onClick={() => setNova(true)}><IoAddOutline /> Nova ordem</button></> : 'Nenhuma ordem com esse filtro.'}</Empty>} />
      </Panel>
      <p className="muted pcp-nota">{numero(linhas.length)} ordem(ns) · {numero(linhas.reduce((a, o) => a + (STATUS_ABERTOS.includes(o.status) ? o.restante : 0), 0))} un ainda a produzir</p>
      {nova && <ModalOP cad={cad} onFechar={() => setNova(false)} onSalvo={o => { setNova(false); recarregar(true); setAberta(o.id); }} />}
      {aberta && <DrawerOP id={aberta} cad={cad} onFechar={() => setAberta(null)} onAlterado={() => recarregar(true)} />}
    </>
  );
}
