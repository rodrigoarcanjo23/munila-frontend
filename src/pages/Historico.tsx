import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoDownloadOutline, IoDocumentTextOutline } from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { contem, dataHora, moeda, numero } from '../lib/format';
import { TODOS_TIPOS, ehEntrada } from '../lib/regras';
import { aba as abaExcel, exportarExcel, exportarPDF } from '../lib/exportar';
import type { LogAuditoria, Movimentacao } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Code, Empty, Field, Kpi, Loading, Notice, PageHeader, Panel, Segmented } from '../components/ui';

export default function Historico() {
  const navigate = useNavigate();
  const [aba, setAba] = useState<'mov' | 'exc'>('mov');
  const [f, setF] = useState({ produto: '', acao: '', responsavel: '', documento: '', inicio: '', fim: '' });
  const { dados, carregando } = useCarregar(async () => {
    const [m, l] = await Promise.all([api.get<Movimentacao[]>('/movimentacoes'), api.get<LogAuditoria[]>('/logs-auditoria')]);
    return { movs: m.data, logs: l.data };
  });

  const movs = useMemo(() => (dados?.movs ?? []).filter(m => {
    const dia = new Date(m.dataHora).toLocaleDateString('sv-SE');
    return contem(f.produto, m.produto?.nome, m.produto?.sku) && contem(f.responsavel, m.usuario?.nome) && contem(f.documento, m.codigo, m.observacao)
      && (!f.acao || m.tipoAcao === f.acao) && (!f.inicio || dia >= f.inicio) && (!f.fim || dia <= f.fim);
  }), [dados, f]);
  const valor = (m: Movimentacao) => m.quantidade * (m.produto?.precoCusto || 0);
  const totalEntrada = movs.filter(m => ehEntrada(m.tipoAcao)).reduce((a, m) => a + valor(m), 0);
  const totalSaida = movs.filter(m => !ehEntrada(m.tipoAcao)).reduce((a, m) => a + valor(m), 0);
  const filtrosAtivos = Object.values(f).some(Boolean);

  const colunas: Col<Movimentacao>[] = [
    { key: 'd', titulo: 'Data e hora', ordenar: m => m.dataHora, render: m => dataHora(m.dataHora) },
    { key: 'p', titulo: 'Produto', principal: true, ordenar: m => m.produto?.nome, render: m => <><div className="cell-title">{m.produto?.nome}</div><div className="cell-sub">{[m.lote && `Lote ${m.lote}`, m.observacao].filter(Boolean).join(' · ')}</div></> },
    { key: 'a', titulo: 'Ação', ordenar: m => m.tipoAcao, render: m => <Badge tom={ehEntrada(m.tipoAcao) ? 'ok' : 'bad'}>{m.tipoAcao}</Badge> },
    { key: 'doc', titulo: 'Documento', ordenar: m => m.codigo || '', render: m => (m.codigo ? <Code>{m.codigo}</Code> : '-') },
    { key: 'q', titulo: 'Qtd.', align: 'right', ordenar: m => m.quantidade, render: m => <span className={ehEntrada(m.tipoAcao) ? 'up' : 'down'}>{ehEntrada(m.tipoAcao) ? '+' : '−'}{numero(m.quantidade)}</span> },
    { key: 'cu', titulo: 'Custo un.', align: 'right', ocultarCelular: true, render: m => moeda(m.produto?.precoCusto) },
    { key: 'v', titulo: 'Total', align: 'right', ordenar: valor, render: m => <b>{moeda(valor(m))}</b> },
    { key: 'u', titulo: 'Responsável', ordenar: m => m.usuario?.nome, render: m => m.usuario?.nome || 'Sistema' },
  ];
  const colExc: Col<LogAuditoria>[] = [
    { key: 'd', titulo: 'Data e hora', ordenar: l => l.dataHora, render: l => dataHora(l.dataHora) },
    { key: 'a', titulo: 'Ação', render: l => <Badge tom="bad" plain>{l.acao}</Badge> },
    { key: 'i', titulo: 'Item excluído', principal: true, render: l => <span className="cell-title">{l.itemNome}</span> },
    { key: 'u', titulo: 'Responsável', render: l => l.usuarioNome },
    { key: 'm', titulo: 'Motivo', render: l => <em>{l.motivo}</em> },
  ];
  const exportMov = [
    { titulo: 'Data e hora', valor: (m: Movimentacao) => dataHora(m.dataHora) }, { titulo: 'Produto', valor: (m: Movimentacao) => m.produto?.nome || '-', largura: 40 },
    { titulo: 'Ação', valor: (m: Movimentacao) => m.tipoAcao, largura: 28 }, { titulo: 'Documento', valor: (m: Movimentacao) => m.codigo || '' },
    { titulo: 'Quantidade', valor: (m: Movimentacao) => m.quantidade }, { titulo: 'Custo unitário', valor: (m: Movimentacao) => moeda(m.produto?.precoCusto) },
    { titulo: 'Valor total', valor: (m: Movimentacao) => moeda(valor(m)) }, { titulo: 'Responsável', valor: (m: Movimentacao) => m.usuario?.nome || 'Sistema' },
    { titulo: 'Observação', valor: (m: Movimentacao) => m.observacao || '', largura: 40 },
  ];

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Auditoria" descricao="Todas as movimentações com custo e responsável, e o registro permanente de exclusões."
        acoes={<>
          <button className="btn" onClick={() => exportarExcel('Relatorio_Auditoria_Completo', [{ nome: 'Movimentações', colunas: exportMov, linhas: movs }], [
            abaExcel<LogAuditoria>('Exclusões', [
              { titulo: 'Data e hora', valor: l => dataHora(l.dataHora) }, { titulo: 'Ação', valor: l => l.acao },
              { titulo: 'Item excluído', valor: l => l.itemNome, largura: 40 }, { titulo: 'Responsável', valor: l => l.usuarioNome },
              { titulo: 'Motivo', valor: l => l.motivo, largura: 50 },
            ], dados?.logs ?? []),
          ])}><IoDownloadOutline /> Excel</button>
          <button className="btn" onClick={() => exportarPDF({ arquivo: 'Relatorio_Auditoria', titulo: 'Auditoria e custos', paisagem: true, resumo: [`Entradas ${moeda(totalEntrada)}`, `Saídas ${moeda(totalSaida)}`], colunas: exportMov.slice(0, 8), linhas: movs })}><IoDocumentTextOutline /> PDF</button>
        </>} />

      <div className="kpis">
        <Kpi label="Lançamentos no filtro" valor={numero(movs.length)} />
        <Kpi label="Custo das entradas" valor={moeda(totalEntrada)} tom="ok" />
        <Kpi label="Custo das saídas" valor={moeda(totalSaida)} tom="bad" />
        <Kpi label="Exclusões registradas" valor={numero(dados?.logs.length ?? 0)} onClick={() => setAba('exc')} />
      </div>

      <Panel flush>
        <div className="toolbar"><Segmented valor={aba} onChange={setAba} opcoes={[{ valor: 'mov', label: 'Movimentações', n: movs.length }, { valor: 'exc', label: 'Exclusões', n: dados?.logs.length ?? 0 }]} /></div>
        {aba === 'mov' ? (
          <>
            <div className="toolbar">
              <div className="filters">
                <Field label="Produto"><input className="input" value={f.produto} onChange={e => setF({ ...f, produto: e.target.value })} placeholder="Nome ou SKU" /></Field>
                <Field label="Ação">
                  <select className="select" value={f.acao} onChange={e => setF({ ...f, acao: e.target.value })}>
                    <option value="">Todas as ações</option>
                    {TODOS_TIPOS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Responsável"><input className="input" value={f.responsavel} onChange={e => setF({ ...f, responsavel: e.target.value })} /></Field>
                <Field label="Documento"><input className="input" value={f.documento} onChange={e => setF({ ...f, documento: e.target.value })} placeholder="RE, RS, OS, NF…" /></Field>
                <Field label="De"><input className="input" type="date" value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} /></Field>
                <Field label="Até"><input className="input" type="date" value={f.fim} onChange={e => setF({ ...f, fim: e.target.value })} /></Field>
                {filtrosAtivos && <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn btn--ghost" onClick={() => setF({ produto: '', acao: '', responsavel: '', documento: '', inicio: '', fim: '' })}>Limpar filtros</button></div>}
              </div>
            </div>
            <DataTable colunas={colunas} linhas={movs} chave={m => m.id} ordemInicial={{ key: 'd', dir: 'desc' }} onLinha={m => navigate(`/kardex/${m.produtoId}`)} />
          </>
        ) : (
          <>
            <div style={{ padding: 12 }}><Notice tom="warn">Os itens abaixo foram removidos definitivamente. O registro de quem excluiu e o motivo não pode ser apagado.</Notice></div>
            <DataTable colunas={colExc} linhas={dados?.logs ?? []} chave={l => l.id} vazio={<Empty titulo="Nenhuma exclusão registrada" />} />
          </>
        )}
      </Panel>
    </>
  );
}
