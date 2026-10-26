import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoDownloadOutline } from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { contem, dataUTC, moeda, numero } from '../lib/format';
import { exportarExcel } from '../lib/exportar';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Code, Empty, Kpi, Loading, Loc, PageHeader, Panel, SearchInput, Segmented } from '../components/ui';

interface ItemValidade {
  produtoId: string; sku: string; nome: string; lote?: string | null; categoria: string; endereco?: string | null;
  validade: string; diasParaVencer: number; saldo: number; valor: number; faixa: string;
}

const FAIXAS = ['Vencido', 'Até 30 dias', '31 a 60 dias', '61 a 90 dias', 'Acima de 90 dias'];
const tom = (f: string) => (f === 'Vencido' ? 'bad' : f === 'Até 30 dias' ? 'warn' : f === 'Acima de 90 dias' ? 'ok' : 'info') as 'bad' | 'warn' | 'ok' | 'info';

export default function Validade() {
  const navigate = useNavigate();
  const [faixa, setFaixa] = useState('Todas');
  const [busca, setBusca] = useState('');
  const [comSaldo, setComSaldo] = useState(true);
  const { dados, carregando } = useCarregar(async () => (await api.get<ItemValidade[]>('/gerencial/validade')).data);

  const itens = useMemo(() => (dados ?? []).filter(i => (!comSaldo || i.saldo > 0) && (faixa === 'Todas' || i.faixa === faixa) && contem(busca, i.nome, i.sku, i.lote, i.endereco)), [dados, faixa, busca, comSaldo]);
  const porFaixa = (f: string) => (dados ?? []).filter(i => i.faixa === f && (!comSaldo || i.saldo > 0));

  const colunas: Col<ItemValidade>[] = [
    { key: 'prod', titulo: 'Produto', principal: true, ordenar: i => i.nome, render: i => <><div className="cell-title">{i.nome}</div><div className="cell-sub"><Code>{i.sku}</Code>{i.lote && <> &nbsp;Lote {i.lote}</>}</div></> },
    { key: 'end', titulo: 'Endereço', render: i => <Loc>{i.endereco}</Loc> },
    { key: 'val', titulo: 'Validade', ordenar: i => i.validade, render: i => dataUTC(i.validade) },
    { key: 'dias', titulo: 'Prazo', align: 'right', ordenar: i => i.diasParaVencer, render: i => <Badge tom={tom(i.faixa)}>{i.diasParaVencer < 0 ? `vencido há ${-i.diasParaVencer} d` : `${i.diasParaVencer} dias`}</Badge> },
    { key: 'saldo', titulo: 'Saldo', align: 'right', ordenar: i => i.saldo, render: i => numero(i.saldo) },
    { key: 'valor', titulo: 'Valor em risco', align: 'right', ordenar: i => i.valor, render: i => moeda(i.valor), rodape: moeda(itens.reduce((a, i) => a + i.valor, 0)) },
  ];

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Controle de validade" descricao="Produtos por prazo de vencimento, para priorizar a saída (FEFO) e evitar perdas."
        acoes={<button className="btn" onClick={() => exportarExcel('Validade_ViaPro', [{ nome: 'Validade', linhas: itens, colunas: [
          { titulo: 'Produto', valor: i => i.nome, largura: 40 }, { titulo: 'SKU', valor: i => i.sku }, { titulo: 'Lote', valor: i => i.lote || '-' },
          { titulo: 'Validade', valor: i => dataUTC(i.validade) }, { titulo: 'Dias', valor: i => i.diasParaVencer }, { titulo: 'Saldo', valor: i => i.saldo }, { titulo: 'Valor', valor: i => moeda(i.valor) },
        ] }])}><IoDownloadOutline /> Excel</button>} />

      <div className="kpis">
        {FAIXAS.slice(0, 4).map(f => {
          const g = porFaixa(f);
          return <Kpi key={f} label={f} valor={numero(g.length)} dica={moeda(g.reduce((a, i) => a + i.valor, 0))} tom={g.length ? (tom(f) === 'info' ? undefined : tom(f)) : undefined} onClick={() => setFaixa(f)} />;
        })}
      </div>

      <Panel flush>
        <div className="toolbar">
          <Segmented valor={faixa} onChange={setFaixa} opcoes={['Todas', ...FAIXAS].map(f => ({ valor: f, label: f }))} />
          <SearchInput value={busca} onChange={setBusca} placeholder="Produto, SKU, lote ou endereço" />
          <label className="check"><input type="checkbox" checked={comSaldo} onChange={e => setComSaldo(e.target.checked)} /> Só com saldo</label>
        </div>
        <DataTable colunas={colunas} linhas={itens} chave={i => i.produtoId} ordemInicial={{ key: 'dias', dir: 'asc' }} onLinha={i => navigate(`/kardex/${i.produtoId}`)}
          vazio={<Empty titulo="Nenhum produto nesta faixa">Informe a data de validade no cadastro do produto para acompanhar aqui.</Empty>} />
      </Panel>
    </>
  );
}
