import { useMemo, useState } from 'react';
import { IoDownloadOutline, IoDocumentTextOutline } from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { contem, dataHora, moeda, numero } from '../lib/format';
import { exportarExcel, exportarPDF } from '../lib/exportar';
import type { Estoque, Movimentacao } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { Code, Empty, Kpi, Loading, PageHeader, Panel, SearchInput, Segmented } from '../components/ui';

export default function Rupturas() {
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<'saldo' | 'ocorrencias'>('saldo');
  const { dados, carregando } = useCarregar(async () => {
    const [e, m] = await Promise.all([api.get<Estoque[]>('/estoque'), api.get<Movimentacao[]>('/movimentacoes')]);
    return { estoque: e.data.filter(x => x.status === 'Ruptura' && x.quantidade > 0), ocorrencias: m.data.filter(x => x.tipoAcao === 'Perdas/Avarias') };
  });

  const saldo = useMemo(() => (dados?.estoque ?? []).filter(i => contem(busca, i.produto.nome, i.produto.sku)), [dados, busca]);
  const ocorrencias = useMemo(() => (dados?.ocorrencias ?? []).filter(i => contem(busca, i.produto?.nome, i.produto?.sku, i.observacao, i.usuario?.nome)), [dados, busca]);
  const prejuizo = saldo.reduce((a, i) => a + i.quantidade * (i.produto.precoCusto || 0), 0);
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const doMes = (dados?.ocorrencias ?? []).filter(o => new Date(o.dataHora) >= inicioMes);

  const colSaldo: Col<Estoque>[] = [
    { key: 'p', titulo: 'Produto avariado / perdido', principal: true, ordenar: i => i.produto.nome, render: i => <><div className="cell-title">{i.produto.nome}</div><div className="cell-sub"><Code>{i.produto.sku}</Code></div></> },
    { key: 'q', titulo: 'Qtd. perdida', align: 'right', ordenar: i => i.quantidade, render: i => <span className="qty qty--bad">{numero(i.quantidade)}</span> },
    { key: 'c', titulo: 'Custo unitário', align: 'right', ordenar: i => i.produto.precoCusto || 0, render: i => moeda(i.produto.precoCusto) },
    { key: 't', titulo: 'Prejuízo', align: 'right', ordenar: i => i.quantidade * (i.produto.precoCusto || 0), render: i => <b className="down">{moeda(i.quantidade * (i.produto.precoCusto || 0))}</b>, rodape: moeda(prejuizo) },
  ];
  const colOc: Col<Movimentacao>[] = [
    { key: 'd', titulo: 'Data', ordenar: m => m.dataHora, render: m => dataHora(m.dataHora) },
    { key: 'p', titulo: 'Produto', principal: true, ordenar: m => m.produto?.nome, render: m => <><div className="cell-title">{m.produto?.nome}</div><div className="cell-sub">{m.observacao}</div></> },
    { key: 'q', titulo: 'Qtd.', align: 'right', ordenar: m => m.quantidade, render: m => numero(m.quantidade) },
    { key: 'v', titulo: 'Valor', align: 'right', ordenar: m => m.quantidade * (m.produto?.precoCusto || 0), render: m => moeda(m.quantidade * (m.produto?.precoCusto || 0)) },
    { key: 'u', titulo: 'Registrado por', ocultarCelular: true, render: m => m.usuario?.nome },
    { key: 'c', titulo: 'Documento', ocultarCelular: true, render: m => m.codigo ? <Code>{m.codigo}</Code> : '-' },
  ];
  const exportCols = [
    { titulo: 'Produto avariado', valor: (i: Estoque) => i.produto.nome, largura: 40 }, { titulo: 'SKU', valor: (i: Estoque) => i.produto.sku },
    { titulo: 'Quantidade perdida', valor: (i: Estoque) => i.quantidade }, { titulo: 'Custo unitário', valor: (i: Estoque) => moeda(i.produto.precoCusto) },
    { titulo: 'Prejuízo', valor: (i: Estoque) => moeda((i.produto.precoCusto || 0) * i.quantidade) },
  ];

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Perdas e avarias" descricao="Itens segregados por avaria e histórico de ocorrências, com o prejuízo calculado pelo custo."
        acoes={<>
          <button className="btn" onClick={() => exportarExcel('Relatorio_Perdas_ViaPro', [{ nome: 'Rupturas e avarias', colunas: exportCols, linhas: saldo }])}><IoDownloadOutline /> Excel</button>
          <button className="btn" onClick={() => exportarPDF({ arquivo: 'Relatorio_Perdas_ViaPro', titulo: 'Perdas e avarias (ruptura)', resumo: [`Prejuízo total: ${moeda(prejuizo)}`], colunas: exportCols, linhas: saldo })}><IoDocumentTextOutline /> PDF</button>
        </>} />
      <div className="kpis">
        <Kpi label="Prejuízo em avarias" valor={moeda(prejuizo)} tom={prejuizo ? 'bad' : 'ok'} />
        <Kpi label="Unidades segregadas" valor={numero(saldo.reduce((a, i) => a + i.quantidade, 0))} />
        <Kpi label="Ocorrências no mês" valor={numero(doMes.length)} dica={moeda(doMes.reduce((a, o) => a + o.quantidade * (o.produto?.precoCusto || 0), 0))} />
      </div>
      <Panel flush>
        <div className="toolbar">
          <Segmented valor={aba} onChange={setAba} opcoes={[{ valor: 'saldo', label: 'Saldo em avaria', n: saldo.length }, { valor: 'ocorrencias', label: 'Ocorrências', n: ocorrencias.length }]} />
          <SearchInput value={busca} onChange={setBusca} placeholder="Buscar produto" />
        </div>
        {aba === 'saldo'
          ? <DataTable colunas={colSaldo} linhas={saldo} chave={i => i.id} ordemInicial={{ key: 't', dir: 'desc' }} vazio={<Empty titulo="Nenhum produto em avaria">Excelente! Registre perdas em Estoque → Movimentar → Perda / avaria.</Empty>} />
          : <DataTable colunas={colOc} linhas={ocorrencias} chave={m => m.id} ordemInicial={{ key: 'd', dir: 'desc' }} />}
      </Panel>
    </>
  );
}
