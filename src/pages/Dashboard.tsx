import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Dashboard() {
  const navigate = useNavigate();
  const [visaoAtiva, setVisaoAtiva] = useState<'estoque' | 'financeiro'>('financeiro'); 
  
  const [dadosEstoque, setDadosEstoque] = useState<any>({ total: 0, criticos: 0, topProdutos: [] });
  const [dadosResumo, setDadosResumo] = useState({ totalItensCadastrados: 0, custoTotal: 0, totalRupturas: 0 });
  
  const [listaImobilizado, setListaImobilizado] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [caixaComprometido, setCaixaComprometido] = useState(0);
  const [prejuizoMes, setPrejuizoMes] = useState(0);
  const [giroEntradas, setGiroEntradas] = useState(0);
  const [giroSaidas, setGiroSaidas] = useState(0);
  
  const [buscaFinanceiro, setBuscaFinanceiro] = useState('');
  const [categoriaFinanceiro, setCategoriaFinanceiro] = useState('');
  
  const [carregando, setCarregando] = useState(true);

  const formatarReal = (valor: number) => {
    return Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
  };

  useEffect(() => {
    async function carregarDashboard() {
      try {
        const [resEstoque, resMovimentacoes, resProdutos, resResumo, resCategorias, resPedidos] = await Promise.all([
          api.get('/estoque'), api.get('/movimentacoes'), api.get('/produtos'), api.get('/dashboard/resumo'),
          api.get('/categorias'), api.get('/pedidos-compra')
        ]);
        
        const estoque = resEstoque.data;
        const historico = resMovimentacoes.data;
        const produtos = resProdutos.data;
        
        setCategorias(resCategorias.data);
        setDadosResumo(resResumo.data);

        // 1. DADOS DE ESTOQUE (Top 5 e Cálculo Crítico Dinâmico)
        let totalEstoque = 0; let criticos = 0;
        estoque.forEach((i: any) => {
          if (i.status === 'Disponível') {
            totalEstoque += i.quantidade;
            
            // Lê o estoque mínimo da descrição ou usa 10 como padrão
            let minEstoque = 10;
            const desc = i.produto?.descricao || '';
            const match = desc.match(/\[MIN:(\d+)\]/);
            if (match) minEstoque = parseInt(match[1], 10);
            
            // Compara com o mínimo exclusivo do produto
            if (i.quantidade <= minEstoque) criticos++;
          }
        });
        const topProd = [...estoque].filter(i => i.status === 'Disponível').sort((a, b) => b.quantidade - a.quantidade).slice(0, 5);
        setDadosEstoque({ total: totalEstoque, criticos, topProdutos: topProd });

        // 2. MAPA FINANCEIRO E LISTA COMPLETA
        const imobilizadoMap: Record<string, any> = {};
        estoque.forEach((i: any) => {
          if (i.status === 'Disponível' || i.status === 'Em Demonstração') {
            const p = produtos.find((prod: any) => prod.id === i.produtoId) || {};
            const precoVenda = p.precoVenda || 0;
            const precoCusto = p.precoCusto || 0;
            
            if (!imobilizadoMap[i.produtoId]) {
              imobilizadoMap[i.produtoId] = { 
                produtoId: i.produtoId,
                nome: p.nome || 'Desconhecido', 
                sku: p.sku || '-',
                categoriaId: p.categoriaId,
                categoriaNome: p.categoria?.nome || '-',
                quantidade: 0,
                precoCusto: precoCusto,
                precoVenda: precoVenda,
                valorImobilizado: 0,
                receitaPotencial: 0
              };
            }
            imobilizadoMap[i.produtoId].quantidade += i.quantidade;
            imobilizadoMap[i.produtoId].valorImobilizado += (i.quantidade * precoCusto);
            imobilizadoMap[i.produtoId].receitaPotencial += (i.quantidade * precoVenda);
          }
        });

        setListaImobilizado(Object.values(imobilizadoMap));

        // 3. INTELIGÊNCIA MENSAL (Movimentações)
        const agora = new Date();
        let entradasMes = 0; let saidasMes = 0; let perdasMes = 0;

        historico.forEach((mov: any) => {
          const dataMov = new Date(mov.dataHora);
          if (dataMov.getMonth() === agora.getMonth() && dataMov.getFullYear() === agora.getFullYear()) {
            const custoUn = mov.produto?.precoCusto || 0;
            const valorAcao = mov.quantidade * custoUn;
            
            if (['Entrada de mercadoria', 'Devolução VIAPRO', 'Ajuste de Entrada de Inventário'].includes(mov.tipoAcao)) {
              entradasMes += valorAcao;
            } else if (['Saída de mercadoria', 'Ajuste de Saída de Inventário', 'Saída para demonstração'].includes(mov.tipoAcao)) {
              saidasMes += valorAcao;
            } else if (mov.tipoAcao === 'Perdas/Avarias') {
              perdasMes += valorAcao; 
            }
          }
        });
        setGiroEntradas(entradasMes);
        setGiroSaidas(saidasMes);
        setPrejuizoMes(perdasMes);

        // 4. CAIXA COMPROMETIDO (Pedidos Pendentes)
        const totalPendente = resPedidos.data
          .filter((ped: any) => ped.status === 'Pendente')
          .reduce((acc: number, ped: any) => acc + ped.custoTotal, 0);
        setCaixaComprometido(totalPendente);

      } catch (error) { console.error("Erro ao carregar dashboard", error); } 
      finally { setCarregando(false); }
    }
    carregarDashboard();
  }, []);

  const financeiroFiltrado = useMemo(() => {
    return listaImobilizado.filter(item => {
      const matchBusca = item.nome.toLowerCase().includes(buscaFinanceiro.toLowerCase()) || item.sku.toLowerCase().includes(buscaFinanceiro.toLowerCase());
      const matchCat = categoriaFinanceiro === '' || item.categoriaId === categoriaFinanceiro;
      return matchBusca && matchCat;
    }).sort((a, b) => b.valorImobilizado - a.valorImobilizado);
  }, [listaImobilizado, buscaFinanceiro, categoriaFinanceiro]);

  const totaisFiltrados = useMemo(() => {
    return financeiroFiltrado.reduce((acc, item) => {
      acc.quantidade += item.quantidade;
      acc.custo += item.valorImobilizado;
      acc.potencial += item.receitaPotencial;
      return acc;
    }, { quantidade: 0, custo: 0, potencial: 0 });
  }, [financeiroFiltrado]);

  const exportarExcel = () => {
    const workbook = XLSX.utils.book_new();
    
    const dadosE = [
      { Indicador: 'Total de Itens no Armazém', Valor: dadosEstoque.total },
      { Indicador: 'Produtos Únicos Cadastrados', Valor: dadosResumo.totalItensCadastrados },
      { Indicador: 'Itens em Estoque Crítico', Valor: dadosEstoque.criticos },
      { Indicador: 'Itens Perdidos/Avariados (Ruptura)', Valor: dadosResumo.totalRupturas },
      { Indicador: '', Valor: '' },
      { Indicador: 'TOP 5 PRODUTOS (VOLUME)', Valor: 'QUANTIDADE' },
      ...dadosEstoque.topProdutos.map((p: any) => ({ Indicador: p.produto.nome, Valor: p.quantidade }))
    ];
    const wsEstoque = XLSX.utils.json_to_sheet(dadosE);
    XLSX.utils.book_append_sheet(workbook, wsEstoque, "Resumo Armazém");

    const dadosF = [
      { Produto: 'CUSTO TOTAL (FILTRO ATUAL)', Categoria: '', SKU: '', Qtd: totaisFiltrados.quantidade, Custo_Un: '', Custo_Total: formatarReal(totaisFiltrados.custo), Margem: '' },
      { Produto: '', Categoria: '', SKU: '', Qtd: '', Custo_Un: '', Custo_Total: '', Margem: '' },
      ...financeiroFiltrado.map((item) => {
        const lucro = item.receitaPotencial - item.valorImobilizado;
        const margem = item.valorImobilizado > 0 ? ((lucro / item.valorImobilizado) * 100).toFixed(1) + '%' : '0%';
        return {
          Produto: item.nome, Categoria: item.categoriaNome, SKU: item.sku,
          Qtd: item.quantidade, Custo_Un: formatarReal(item.precoCusto), Custo_Total: formatarReal(item.valorImobilizado), Margem: margem
        };
      })
    ];
    const wsFinanceiro = XLSX.utils.json_to_sheet(dadosF);
    XLSX.utils.book_append_sheet(workbook, wsFinanceiro, "Detalhamento Financeiro");
    XLSX.writeFile(workbook, "Relatorio_Gerencial_ViaPro.xlsx");
  };

  const exportarPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(16); doc.setTextColor(44, 62, 80); doc.text("Relatório Financeiro de Estoque", 14, 20);
    doc.setFontSize(10); doc.setTextColor(127, 140, 141); doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);

    doc.setFontSize(12); doc.setTextColor(39, 174, 96); 
    doc.text(`Custo Total do Filtro: ${formatarReal(totaisFiltrados.custo)}`, 14, 40);
    doc.setTextColor(41, 128, 185);
    doc.text(`Total de Itens do Filtro: ${totaisFiltrados.quantidade} un`, 100, 40);

    const colunas = ["Produto", "SKU", "Categoria", "Qtd", "Custo Un.", "Custo Total", "Margem"];
    const linhas = financeiroFiltrado.map(item => {
      const lucro = item.receitaPotencial - item.valorImobilizado;
      const margem = item.valorImobilizado > 0 ? ((lucro / item.valorImobilizado) * 100).toFixed(1) + '%' : '0%';
      return [item.nome, item.sku, item.categoriaNome, item.quantidade.toString(), formatarReal(item.precoCusto), formatarReal(item.valorImobilizado), margem];
    });

    autoTable(doc, { head: [colunas], body: linhas, startY: 48, styles: { fontSize: 8 }, headStyles: { fillColor: [39, 174, 96] } });
    doc.save("Relatorio_Financeiro_ViaPro.pdf");
  };

  if (carregando) return <div>A processar inteligência financeira...</div>;

  const faturamentoTotalGeral = listaImobilizado.reduce((acc, item) => acc + item.receitaPotencial, 0);
  const lucroProjetado = faturamentoTotalGeral - dadosResumo.custoTotal;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Visão Geral do Negócio</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={exportarExcel} style={styles.btnExcel}>📊 Relatório Excel</button>
          <button onClick={exportarPDF} style={styles.btnPDF}>📄 Relatório PDF</button>
        </div>
      </div>

      <div style={{ display: 'flex', backgroundColor: '#e0e6ed', padding: '4px', borderRadius: '8px', marginBottom: '25px', width: 'fit-content' }}>
        <button onClick={() => setVisaoAtiva('estoque')} style={{ ...styles.toggleBtn, backgroundColor: visaoAtiva === 'estoque' ? '#0288D1' : 'transparent', color: visaoAtiva === 'estoque' ? 'white' : '#7f8c8d' }}>Armazém</button>
        <button onClick={() => setVisaoAtiva('financeiro')} style={{ ...styles.toggleBtn, backgroundColor: visaoAtiva === 'financeiro' ? '#27ae60' : 'transparent', color: visaoAtiva === 'financeiro' ? 'white' : '#7f8c8d' }}>Financeiro (Novo)</button>
      </div>

      {visaoAtiva === 'estoque' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            <div style={{ ...styles.card, borderLeft: '5px solid #8e44ad' }}>
              <h3 style={styles.cardTitulo}>Produtos Cadastrados</h3>
              <p style={{ ...styles.cardValor, color: '#8e44ad' }}>{dadosResumo.totalItensCadastrados}</p>
            </div>
            <div style={{ ...styles.card, borderLeft: '5px solid #0288D1' }}>
              <h3 style={styles.cardTitulo}>Volume no Armazém</h3>
              <p style={{ ...styles.cardValor, color: '#0288D1' }}>{dadosEstoque.total}</p>
            </div>
            <div onClick={() => navigate('/estoque', { state: { filtrarCriticos: true } })} style={{ ...styles.card, borderLeft: '5px solid #e74c3c', cursor: 'pointer' }}>
              <h3 style={styles.cardTitulo}>Estoque Crítico</h3>
              <p style={{ ...styles.cardValor, color: '#e74c3c' }}>{dadosEstoque.criticos}</p>
            </div>
            <div onClick={() => navigate('/rupturas')} style={{ ...styles.card, borderLeft: '5px solid #f39c12', cursor: 'pointer' }}>
              <h3 style={styles.cardTitulo}>Perdas e Avarias (Qtd)</h3>
              <p style={{ ...styles.cardValor, color: '#f39c12' }}>{dadosResumo.totalRupturas}</p>
            </div>
          </div>
          <div style={styles.card}>
            <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', color: '#2c3e50' }}>Top 5 Produtos em Volume</h3>
            {dadosEstoque.topProdutos.map((item: any) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f4f7f6' }}>
                <span style={{ fontWeight: 'bold', color: '#34495e' }}>{item.produto.nome}</span>
                <span style={{ color: '#0288D1', fontWeight: 'bold' }}>{item.quantidade} un</span>
              </div>
            ))}
          </div>
        </>
      )}

      {visaoAtiva === 'financeiro' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            <div style={{ ...styles.card, borderLeft: '5px solid #27ae60', padding: '20px' }}>
              <h3 style={styles.cardTitulo}>Custo Total (Imobilizado)</h3>
              <p style={{ ...styles.cardValor, color: '#27ae60', fontSize: '26px' }}>{formatarReal(dadosResumo.custoTotal)}</p>
            </div>
            <div style={{ ...styles.card, borderLeft: '5px solid #2980b9', padding: '20px' }}>
              <h3 style={styles.cardTitulo}>Faturamento Potencial</h3>
              <p style={{ ...styles.cardValor, color: '#2980b9', fontSize: '26px' }}>{formatarReal(faturamentoTotalGeral)}</p>
            </div>
            <div style={{ ...styles.card, borderLeft: '5px solid #8e44ad', padding: '20px' }}>
              <h3 style={styles.cardTitulo}>Lucro Projetado</h3>
              <p style={{ ...styles.cardValor, color: '#8e44ad', fontSize: '26px' }}>{formatarReal(lucroProjetado)}</p>
            </div>
            <div style={{ ...styles.card, borderLeft: '5px solid #f39c12', padding: '20px' }}>
              <h3 style={styles.cardTitulo}>Caixa Comprometido (Pedidos)</h3>
              <p style={{ ...styles.cardValor, color: '#f39c12', fontSize: '26px' }}>{formatarReal(caixaComprometido)}</p>
            </div>
            <div style={{ ...styles.card, borderLeft: '5px solid #c0392b', padding: '20px', backgroundColor: '#fdedec' }}>
              <h3 style={{...styles.cardTitulo, color: '#c0392b'}}>Prejuízo do Mês (Perdas)</h3>
              <p style={{ ...styles.cardValor, color: '#c0392b', fontSize: '26px' }}>{formatarReal(prejuizoMes)}</p>
            </div>
          </div>

          <div style={styles.tabelaContainer}>
            <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
              <h2 style={{ margin: '0 0 15px 0', color: '#2c3e50', fontSize: '18px' }}>Relatório Detalhado de Capital Imobilizado</h2>
              
              <div style={{ display: 'flex', gap: '15px' }}>
                <input 
                  type="text" 
                  placeholder="Buscar produto por Nome ou SKU..." 
                  style={styles.inputFiltro} 
                  value={buscaFinanceiro} 
                  onChange={(e) => setBuscaFinanceiro(e.target.value)} 
                />
                <select style={styles.selectFiltro} value={categoriaFinanceiro} onChange={(e) => setCategoriaFinanceiro(e.target.value)}>
                  <option value="">Todas as Categorias</option>
                  {categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '20px', marginTop: '15px', padding: '15px', backgroundColor: '#f9fbfb', borderRadius: '8px', border: '1px solid #e0e6ed' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#7f8c8d', fontWeight: 'bold', textTransform: 'uppercase' }}>Total de Itens na Busca</span>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: '#2980b9' }}>{totaisFiltrados.quantidade} unidades</div>
                </div>
                <div style={{ borderLeft: '1px solid #ddd', paddingLeft: '20px' }}>
                  <span style={{ fontSize: '12px', color: '#7f8c8d', fontWeight: 'bold', textTransform: 'uppercase' }}>Custo Total da Busca</span>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: '#27ae60' }}>{formatarReal(totaisFiltrados.custo)}</div>
                </div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th style={styles.th}>Produto / SKU</th>
                  <th style={styles.th}>Categoria</th>
                  <th style={{...styles.th, textAlign: 'center'}}>Qtd.</th>
                  <th style={{...styles.th, textAlign: 'right'}}>Custo Un.</th>
                  <th style={{...styles.th, textAlign: 'right'}}>Total Imobilizado</th>
                  <th style={{...styles.th, textAlign: 'right'}}>Margem de Lucro</th>
                </tr>
              </thead>
              <tbody>
                {financeiroFiltrado.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#7f8c8d' }}>Nenhum produto encontrado neste filtro.</td></tr>
                ) : (
                  financeiroFiltrado.map((item) => {
                    const lucro = item.receitaPotencial - item.valorImobilizado;
                    const margemLucro = item.valorImobilizado > 0 ? (lucro / item.valorImobilizado) * 100 : 0;
                    
                    return (
                      <tr key={item.produtoId} style={styles.tr}>
                        <td style={styles.td}>
                          <strong>{item.nome}</strong><br/>
                          <span style={{ fontSize: '11px', color: '#7f8c8d' }}>{item.sku}</span>
                        </td>
                        <td style={styles.td}><span style={styles.badge}>{item.categoriaNome}</span></td>
                        <td style={{...styles.td, textAlign: 'center', fontWeight: 'bold', fontSize: '16px'}}>{item.quantidade}</td>
                        <td style={{...styles.td, textAlign: 'right', color: '#7f8c8d'}}>{formatarReal(item.precoCusto)}</td>
                        <td style={{...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#27ae60'}}>{formatarReal(item.valorImobilizado)}</td>
                        <td style={{...styles.td, textAlign: 'right'}}>
                          <span style={{ backgroundColor: margemLucro > 50 ? '#eafaf1' : '#fef5e7', color: margemLucro > 50 ? '#27ae60' : '#f39c12', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px' }}>
                            +{margemLucro.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  card: { backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' },
  cardTitulo: { margin: 0, fontSize: '12px', color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: '1px' },
  cardValor: { margin: '10px 0 0 0', fontSize: '32px', fontWeight: '900' },
  toggleBtn: { padding: '8px 20px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', fontSize: '14px' },
  btnExcel: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(39, 174, 96, 0.3)' },
  btnPDF: { backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(231, 76, 60, 0.3)' },
  tabelaContainer: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', overflow: 'hidden' },
  inputFiltro: { flex: 2, padding: '12px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', outline: 'none', backgroundColor: '#f9fbfb' },
  selectFiltro: { flex: 1, padding: '12px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', outline: 'none', backgroundColor: '#f9fbfb', cursor: 'pointer' },
  th: { padding: '15px 20px', backgroundColor: '#f9fbfb', color: '#7f8c8d', borderBottom: '2px solid #ecf0f1', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '1px' },
  tr: { borderBottom: '1px solid #ecf0f1' },
  td: { padding: '15px 20px', color: '#2c3e50', fontSize: '14px', verticalAlign: 'middle' },
  badge: { backgroundColor: '#f1f2f6', color: '#7f8c8d', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }
};