import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Dashboard() {
  const navigate = useNavigate();
  const [visaoAtiva, setVisaoAtiva] = useState<'estoque' | 'financeiro'>('estoque');
  const [dadosEstoque, setDadosEstoque] = useState<any>({ total: 0, criticos: 0, topProdutos: [] });
  const [dadosResumo, setDadosResumo] = useState({ totalItensCadastrados: 0, custoTotal: 0 });
  
  // NOVO ESTADO FINANCEIRO FOCADO EM ARMAZÉM
  const [dadosFinanceiros, setDadosFinanceiros] = useState<any>({ 
    potencialReceita: 0, 
    entradasMes: 0, 
    saidasMes: 0, 
    topImobilizado: [] 
  });
  
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregarDashboard() {
      try {
        const [resEstoque, resMovimentacoes, resProdutos, resResumo] = await Promise.all([
          api.get('/estoque'), api.get('/movimentacoes'), api.get('/produtos'), api.get('/dashboard/resumo')
        ]);
        
        const estoque = resEstoque.data;
        const historico = resMovimentacoes.data;
        
        setDadosResumo(resResumo.data);

        // ==========================================
        // LÓGICA DO ARMAZÉM
        // ==========================================
        let total = 0; let criticos = 0;
        estoque.forEach((i: any) => {
          if (i.status === 'Disponível') {
            total += i.quantidade;
            if (i.quantidade < 10) criticos++;
          }
        });
        const topProd = [...estoque].filter(i => i.status === 'Disponível').sort((a, b) => b.quantidade - a.quantidade).slice(0, 5);
        setDadosEstoque({ total, criticos, topProdutos: topProd });

        // ==========================================
        // NOVA LÓGICA DE INTELIGÊNCIA FINANCEIRA
        // ==========================================
        const agora = new Date();
        const mesAtual = agora.getMonth();
        const anoAtual = agora.getFullYear();

        let potencialReceita = 0;
        let entradasMes = 0;
        let saidasMes = 0;
        const imobilizadoMap: Record<string, { nome: string, valor: number }> = {};

        // 1. Calcula o Potencial de Receita e o Capital Imobilizado por Produto
        estoque.forEach((i: any) => {
          if (i.status === 'Disponível') {
            const precoVenda = i.produto?.precoVenda || 0;
            const precoCusto = i.produto?.precoCusto || 0;
            
            potencialReceita += (i.quantidade * precoVenda);
            
            const valorImobilizado = i.quantidade * precoCusto;
            if (imobilizadoMap[i.produtoId]) {
              imobilizadoMap[i.produtoId].valor += valorImobilizado;
            } else {
              imobilizadoMap[i.produtoId] = { nome: i.produto?.nome || 'Desconhecido', valor: valorImobilizado };
            }
          }
        });

        // 2. Calcula as Entradas e Saídas do Mês Atual (Giro de Estoque)
        historico.forEach((mov: any) => {
          const dataMov = new Date(mov.dataHora);
          if (dataMov.getMonth() === mesAtual && dataMov.getFullYear() === anoAtual) {
            const custoUn = mov.produto?.precoCusto || 0;
            const valorAcao = mov.quantidade * custoUn;
            const isEntrada = ['Entrada de mercadoria', 'Devolução VIAPRO', 'Ajuste de Entrada de Inventário'].includes(mov.tipoAcao);
            
            if (isEntrada) entradasMes += valorAcao;
            else saidasMes += valorAcao;
          }
        });
        
        // 3. Ordena os produtos que mais prendem capital
        const topImobilizado = Object.values(imobilizadoMap)
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 5);
          
        setDadosFinanceiros({ potencialReceita, entradasMes, saidasMes, topImobilizado });

      } catch (error) { console.error("Erro ao carregar dashboard", error); } 
      finally { setCarregando(false); }
    }
    carregarDashboard();
  }, []);

  const formatarReal = (valor: number) => Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

  const exportarExcel = () => {
    const workbook = XLSX.utils.book_new();
    const dadosE = [
      { Indicador: 'Total de Itens no Armazém', Valor: dadosEstoque.total },
      { Indicador: 'Produtos Únicos Cadastrados', Valor: dadosResumo.totalItensCadastrados },
      { Indicador: 'Itens em Estoque Crítico', Valor: dadosEstoque.criticos },
      { Indicador: '', Valor: '' },
      { Indicador: 'TOP 5 PRODUTOS (VOLUME)', Valor: 'QUANTIDADE' },
      ...dadosEstoque.topProdutos.map((p: any) => ({ Indicador: p.produto.nome, Valor: p.quantidade }))
    ];
    const wsEstoque = XLSX.utils.json_to_sheet(dadosE);
    XLSX.utils.book_append_sheet(workbook, wsEstoque, "Resumo Armazém");

    const dadosF = [
      { Indicador: 'Custo Total Imobilizado', Valor: formatarReal(dadosResumo.custoTotal) },
      { Indicador: 'Faturamento Potencial', Valor: formatarReal(dadosFinanceiros.potencialReceita) },
      { Indicador: 'Giro do Mês (Entradas)', Valor: formatarReal(dadosFinanceiros.entradasMes) },
      { Indicador: 'Giro do Mês (Saídas)', Valor: formatarReal(dadosFinanceiros.saidasMes) },
      { Indicador: '', Valor: '' },
      { Indicador: 'TOP 5 - MAIOR CAPITAL IMOBILIZADO', Valor: 'VALOR' },
      ...dadosFinanceiros.topImobilizado.map((p: any) => ({ Indicador: p.nome, Valor: formatarReal(p.valor) }))
    ];
    const wsFinanceiro = XLSX.utils.json_to_sheet(dadosF);
    XLSX.utils.book_append_sheet(workbook, wsFinanceiro, "Inteligência Financeira");
    XLSX.writeFile(workbook, "Relatorio_Gerencial_ViaPro.xlsx");
  };

  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.setTextColor(44, 62, 80); doc.text("Relatório Gerencial - ViaPro ERP", 14, 22);
    doc.setFontSize(10); doc.setTextColor(127, 140, 141); doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);

    doc.setFontSize(14); doc.setTextColor(2, 136, 209); doc.text("1. Resumo do Armazém", 14, 45);
    doc.setFontSize(11); doc.setTextColor(44, 62, 80);
    doc.text(`Itens Totais em Estoque: ${dadosEstoque.total}`, 14, 55);
    doc.text(`Produtos Únicos Cadastrados: ${dadosResumo.totalItensCadastrados}`, 14, 62);
    doc.text(`Alerta de Estoque Crítico: ${dadosEstoque.criticos} produtos`, 14, 69);

    autoTable(doc, {
      startY: 75, head: [["Top 5 Produtos (Maior Volume)", "Quantidade"]],
      body: dadosEstoque.topProdutos.map((p: any) => [p.produto.nome, `${p.quantidade} un`]),
      styles: { fontSize: 10, cellPadding: 4 }, headStyles: { fillColor: [2, 136, 209] }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 75;
    doc.setFontSize(14); doc.setTextColor(39, 174, 96); doc.text("2. Inteligência Financeira e Custos", 14, finalY + 20);
    doc.setFontSize(11); doc.setTextColor(44, 62, 80); 
    doc.text(`Custo Total Imobilizado: ${formatarReal(dadosResumo.custoTotal)}`, 14, finalY + 30);
    doc.text(`Faturamento Potencial: ${formatarReal(dadosFinanceiros.potencialReceita)}`, 14, finalY + 37);

    autoTable(doc, {
      startY: finalY + 45, head: [["Top 5 - Maior Capital Imobilizado", "Valor Preso"]],
      body: dadosFinanceiros.topImobilizado.map((p: any) => [p.nome, formatarReal(p.valor)]),
      styles: { fontSize: 10, cellPadding: 4 }, headStyles: { fillColor: [39, 174, 96] }
    });

    doc.save("Relatorio_Gerencial_ViaPro.pdf");
  };

  if (carregando) return <div>Atualizando indicadores...</div>;

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
        <button onClick={() => setVisaoAtiva('financeiro')} style={{ ...styles.toggleBtn, backgroundColor: visaoAtiva === 'financeiro' ? '#27ae60' : 'transparent', color: visaoAtiva === 'financeiro' ? 'white' : '#7f8c8d' }}>Financeiro</button>
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
            <div 
              onClick={() => navigate('/estoque', { state: { filtrarCriticos: true } })}
              style={{ ...styles.card, borderLeft: '5px solid #e74c3c', cursor: 'pointer', position: 'relative' }}
              title="Clique para ver a lista de produtos críticos"
            >
              <h3 style={styles.cardTitulo}>Estoque Crítico</h3>
              <p style={{ ...styles.cardValor, color: '#e74c3c' }}>{dadosEstoque.criticos}</p>
              <div style={{ position: 'absolute', bottom: '15px', right: '20px', fontSize: '11px', color: '#e74c3c', fontWeight: 'bold' }}>
                ➔ VER LISTA
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', color: '#2c3e50' }}>Top 5 Produtos em Volume</h3>
            {dadosEstoque.topProdutos.length === 0 ? <p>Sem produtos.</p> : dadosEstoque.topProdutos.map((item: any) => (
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            <div style={{ ...styles.card, borderLeft: '5px solid #27ae60' }}>
              <h3 style={styles.cardTitulo}>Custo Total (Investido)</h3>
              <p style={{ ...styles.cardValor, color: '#27ae60' }}>{formatarReal(dadosResumo.custoTotal)}</p>
            </div>
            <div style={{ ...styles.card, borderLeft: '5px solid #2980b9' }}>
              <h3 style={styles.cardTitulo}>Faturamento Potencial</h3>
              <p style={{ ...styles.cardValor, color: '#2980b9', fontSize: '28px' }}>{formatarReal(dadosFinanceiros.potencialReceita)}</p>
            </div>
            <div style={{ ...styles.card, borderLeft: '5px solid #f39c12' }}>
              <h3 style={styles.cardTitulo}>Giro Mês (Entradas)</h3>
              <p style={{ ...styles.cardValor, color: '#f39c12', fontSize: '28px' }}>{formatarReal(dadosFinanceiros.entradasMes)}</p>
            </div>
            <div style={{ ...styles.card, borderLeft: '5px solid #e74c3c' }}>
              <h3 style={styles.cardTitulo}>Giro Mês (Saídas)</h3>
              <p style={{ ...styles.cardValor, color: '#e74c3c', fontSize: '28px' }}>{formatarReal(dadosFinanceiros.saidasMes)}</p>
            </div>
          </div>

          <div style={styles.card}>
            <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', color: '#2c3e50' }}>Top 5 - Maior Capital Imobilizado</h3>
            <p style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '-5px', marginBottom: '15px' }}>Produtos com maior volume de dinheiro de custo "preso" no armazém atualmente.</p>
            {dadosFinanceiros.topImobilizado.length === 0 ? <p>Adicione preços de custo no catálogo para gerar este relatório.</p> : dadosFinanceiros.topImobilizado.map((item: any) => (
              <div key={item.nome} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f4f7f6' }}>
                <span style={{ fontWeight: 'bold', color: '#34495e' }}>{item.nome}</span>
                <span style={{ color: '#27ae60', fontWeight: 'bold' }}>{formatarReal(item.valor)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  card: { backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' },
  cardTitulo: { margin: 0, fontSize: '13px', color: '#7f8c8d', textTransform: 'uppercase' as const, letterSpacing: '1px' },
  cardValor: { margin: '10px 0 0 0', fontSize: '32px', fontWeight: '900' },
  toggleBtn: { padding: '8px 20px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', fontSize: '14px' },
  btnExcel: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(39, 174, 96, 0.3)' },
  btnPDF: { backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(231, 76, 60, 0.3)' }
};