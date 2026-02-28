import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Historico() {
  const [historico, setHistorico] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  // ==========================================
  // FILTROS AVANÇADOS E DE DATA
  // ==========================================
  const [filtroProduto, setFiltroProduto] = useState('');
  const [filtroAcao, setFiltroAcao] = useState('');
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  const [filtroDataInicial, setFiltroDataInicial] = useState('');
  const [filtroDataFinal, setFiltroDataFinal] = useState('');

  // Formata a moeda local
  const formatarReal = (valor: number) => Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

  useEffect(() => {
    async function carregarHistorico() {
      try {
        const res = await api.get('/movimentacoes');
        setHistorico(res.data);
      } catch (error) {
        alert("Erro ao carregar a auditoria.");
      } finally {
        setCarregando(false);
      }
    }
    carregarHistorico();
  }, []);

  // Lógica de Filtragem Dinâmica com Intervalo de Datas
  const historicoFiltrado = useMemo(() => {
    return historico.filter(item => {
      const nomeProduto = (item.produto?.nome || '').toLowerCase();
      const nomeResponsavel = (item.usuario?.nome || '').toLowerCase();
      const dataOperacaoISO = item.dataHora.substring(0, 10); // 'YYYY-MM-DD'

      const matchProduto = nomeProduto.includes(filtroProduto.toLowerCase());
      const matchResponsavel = nomeResponsavel.includes(filtroResponsavel.toLowerCase());
      const matchAcao = filtroAcao === '' || item.tipoAcao === filtroAcao;
      
      let matchData = true;
      if (filtroDataInicial) {
        matchData = matchData && (dataOperacaoISO >= filtroDataInicial);
      }
      if (filtroDataFinal) {
        matchData = matchData && (dataOperacaoISO <= filtroDataFinal);
      }

      return matchProduto && matchResponsavel && matchAcao && matchData;
    });
  }, [historico, filtroProduto, filtroAcao, filtroResponsavel, filtroDataInicial, filtroDataFinal]);

  // Cálculos de Resumo Financeiro
  const { totalEntrada, totalSaida } = useMemo(() => {
    let entradas = 0;
    let saidas = 0;

    historicoFiltrado.forEach(item => {
      const isEntrada = ['Entrada de mercadoria', 'Devolução VIAPRO', 'Ajuste de Entrada de Inventário'].includes(item.tipoAcao);
      const custoUn = item.produto?.precoCusto || 0;
      const valorAcao = item.quantidade * custoUn;

      if (isEntrada) entradas += valorAcao;
      else saidas += valorAcao;
    });

    return { totalEntrada: entradas, totalSaida: saidas };
  }, [historicoFiltrado]);


  const exportarExcel = () => {
    if (historicoFiltrado.length === 0) return alert("Não há dados para exportar com estes filtros.");

    const dadosFormatados = historicoFiltrado.map(item => {
      const custoUn = item.produto?.precoCusto || 0;
      const custoTotalAcao = item.quantidade * custoUn;
      const isEntrada = ['Entrada de mercadoria', 'Devolução VIAPRO', 'Ajuste de Entrada de Inventário'].includes(item.tipoAcao);

      return {
        'Código RE/RS': item.codigo || 'S/C',
        'Data e Hora': new Date(item.dataHora).toLocaleString('pt-BR'),
        'Produto': item.produto?.nome || 'Desconhecido',
        'Ação Realizada': item.tipoAcao,
        'Sinal': isEntrada ? '+' : '-',
        'Quantidade': item.quantidade,
        'Custo Unitário': formatarReal(custoUn),
        'Valor Total Movimentado': formatarReal(custoTotalAcao),
        'Responsável': item.usuario?.nome || 'Sistema',
        'Observação': item.observacao || '-'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dadosFormatados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Auditoria e Custos");
    XLSX.writeFile(workbook, "Relatorio_Auditoria_Custos.xlsx");
  };

  const exportarPDF = () => {
    if (historicoFiltrado.length === 0) return alert("Não há dados para exportar com estes filtros.");

    const doc = new jsPDF('landscape'); // Usar modo paisagem para caber mais colunas
    doc.setFontSize(16);
    doc.setTextColor(44, 62, 80);
    doc.text("Relatório de Auditoria e Custos - ViaPro ERP", 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(127, 140, 141);
    
    let periodo = "Todo o período";
    if (filtroDataInicial && filtroDataFinal) periodo = `De ${filtroDataInicial.split('-').reverse().join('/')} até ${filtroDataFinal.split('-').reverse().join('/')}`;
    else if (filtroDataInicial) periodo = `A partir de ${filtroDataInicial.split('-').reverse().join('/')}`;
    else if (filtroDataFinal) periodo = `Até ${filtroDataFinal.split('-').reverse().join('/')}`;

    doc.text(`Período: ${periodo}`, 14, 28);
    
    // Sumário Financeiro no topo do PDF
    doc.setFontSize(11);
    doc.setTextColor(39, 174, 96); doc.text(`Entradas no Período: ${formatarReal(totalEntrada)}`, 14, 35);
    doc.setTextColor(231, 76, 60); doc.text(`Saídas no Período: ${formatarReal(totalSaida)}`, 80, 35);

    const colunas = ["Data e Hora", "Produto", "Ação", "Qtd", "Custo Un.", "Total Ação", "Responsável"];
    const linhas = historicoFiltrado.map(item => {
      const custoUn = item.produto?.precoCusto || 0;
      const isEntrada = ['Entrada de mercadoria', 'Devolução VIAPRO', 'Ajuste de Entrada de Inventário'].includes(item.tipoAcao);
      return [
        new Date(item.dataHora).toLocaleString('pt-BR'),
        item.produto?.nome || '-',
        item.tipoAcao,
        isEntrada ? `+${item.quantidade}` : `-${item.quantidade}`,
        formatarReal(custoUn),
        formatarReal(custoUn * item.quantidade),
        item.usuario?.nome || '-'
      ];
    });

    autoTable(doc, {
      head: [colunas], body: linhas, startY: 42, styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [2, 136, 209], textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [245, 247, 250] } 
    });
    doc.save("Relatorio_Auditoria_Custos.pdf");
  };

  if (carregando) return <div>A extrair logs do sistema...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Auditoria de Custos e Movimentações</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={exportarExcel} style={styles.btnExcel}>📊 Exportar Excel</button>
          <button onClick={exportarPDF} style={styles.btnPDF}>📄 Exportar PDF</button>
        </div>
      </div>

      {/* NOVO: CARD DE RESUMO FINANCEIRO DO PERÍODO */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
         <div style={{ ...styles.resumoCard, borderLeft: '5px solid #27ae60' }}>
           <span style={styles.resumoLabel}>Custo Total Entrada (Período)</span>
           <div style={{ ...styles.resumoValor, color: '#27ae60' }}>{formatarReal(totalEntrada)}</div>
         </div>
         <div style={{ ...styles.resumoCard, borderLeft: '5px solid #e74c3c' }}>
           <span style={styles.resumoLabel}>Custo Total Saída (Período)</span>
           <div style={{ ...styles.resumoValor, color: '#e74c3c' }}>{formatarReal(totalSaida)}</div>
         </div>
      </div>

      {/* BARRA DE FILTROS ATUALIZADA */}
      <div style={styles.filtrosContainer}>
        <div style={styles.filtroItem}>
          <label style={styles.labelFiltro}>Buscar Produto</label>
          <input type="text" style={styles.inputFiltro} placeholder="Nome do produto..." value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)} />
        </div>
        <div style={styles.filtroItem}>
          <label style={styles.labelFiltro}>Tipo de Ação</label>
          <select style={styles.inputFiltro} value={filtroAcao} onChange={e => setFiltroAcao(e.target.value)}>
            <option value="">Todas as Ações</option>
            <option value="Entrada de mercadoria">Entrada de mercadoria</option>
            <option value="Saída de mercadoria">Saída de mercadoria</option>
            <option value="Devolução VIAPRO">Devolução VIAPRO</option>
            <option value="Ajuste de Saída de Inventário">Ajuste de Saída de Inventário</option>
            <option value="Ajuste de Entrada de Inventário">Ajuste de Entrada de Inventário</option>
            <option value="Saída para demonstração">Saída para demonstração</option>
          </select>
        </div>
        <div style={styles.filtroItem}>
          <label style={styles.labelFiltro}>Data Inicial</label>
          <input type="date" style={styles.inputFiltro} value={filtroDataInicial} onChange={e => setFiltroDataInicial(e.target.value)} />
        </div>
        <div style={styles.filtroItem}>
          <label style={styles.labelFiltro}>Data Final</label>
          <input type="date" style={styles.inputFiltro} value={filtroDataFinal} onChange={e => setFiltroDataFinal(e.target.value)} />
        </div>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Data e Hora</th>
              <th style={styles.th}>Produto</th>
              <th style={styles.th}>Ação</th>
              <th style={{...styles.th, textAlign: 'center'}}>Qtd</th>
              <th style={{...styles.th, textAlign: 'right'}}>Custo Un.</th>
              <th style={{...styles.th, textAlign: 'right'}}>Total Ação</th>
              <th style={styles.th}>Responsável</th>
            </tr>
          </thead>
          <tbody>
            {historicoFiltrado.length === 0 && (
              <tr><td colSpan={7} style={{textAlign: 'center', padding: '20px', color: '#7f8c8d'}}>Nenhuma movimentação encontrada.</td></tr>
            )}
            {historicoFiltrado.map((item) => {
              const isEntrada = ['Entrada de mercadoria', 'Devolução VIAPRO', 'Ajuste de Entrada de Inventário'].includes(item.tipoAcao);
              const custoUn = item.produto?.precoCusto || 0;
              const valorTotalAcao = item.quantidade * custoUn;
              
              return (
                <tr key={item.id} style={styles.tr}>
                  <td style={styles.td}>{new Date(item.dataHora).toLocaleString('pt-BR')}</td>
                  <td style={styles.td}><strong>{item.produto?.nome}</strong></td>
                  <td style={styles.td}>
                    <span style={isEntrada ? styles.badgeVerde : styles.badgeVermelho}>
                      {item.tipoAcao}
                    </span>
                  </td>
                  <td style={{...styles.td, textAlign: 'center', fontWeight: '900', color: isEntrada ? '#27ae60' : '#e74c3c'}}>
                    {isEntrada ? `+${item.quantidade}` : `-${item.quantidade}`}
                  </td>
                  <td style={{...styles.td, textAlign: 'right', color: '#7f8c8d'}}>
                     {formatarReal(custoUn)}
                  </td>
                  <td style={{...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#2c3e50'}}>
                     {formatarReal(valorTotalAcao)}
                  </td>
                  <td style={styles.td}>{item.usuario?.nome}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  // ESTILOS DOS NOVOS FILTROS E CARDS
  resumoCard: { backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', flex: 1 },
  resumoLabel: { fontSize: '12px', fontWeight: 'bold', color: '#7f8c8d', textTransform: 'uppercase' },
  resumoValor: { fontSize: '28px', fontWeight: '900', marginTop: '10px' },
  
  filtrosContainer: { display: 'flex', gap: '15px', backgroundColor: '#f9fbfb', padding: '15px', borderRadius: '8px', border: '1px solid #ecf0f1', marginBottom: '20px', flexWrap: 'wrap' },
  filtroItem: { flex: 1, minWidth: '150px' },
  labelFiltro: { display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#7f8c8d', marginBottom: '5px', textTransform: 'uppercase' },
  inputFiltro: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' },

  tableContainer: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '15px 20px', backgroundColor: '#f9fbfb', color: '#7f8c8d', borderBottom: '2px solid #ecf0f1', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '1px' },
  tr: { borderBottom: '1px solid #ecf0f1' },
  td: { padding: '15px 20px', color: '#2c3e50', fontSize: '14px', verticalAlign: 'middle' },
  
  badgeCodigo: { backgroundColor: '#f1f2f6', color: '#2c3e50', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #ddd' },
  badgeVerde: { backgroundColor: '#eafaf1', color: '#27ae60', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeVermelho: { backgroundColor: '#fdf2e9', color: '#e74c3c', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  
  btnExcel: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(39, 174, 96, 0.3)' },
  btnPDF: { backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(231, 76, 60, 0.3)' }
};