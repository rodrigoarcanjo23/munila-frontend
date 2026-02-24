import React, { useState, useEffect } from 'react';
import { api } from '../api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Historico() {
  const [historico, setHistorico] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

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

  // ==========================================
  // EXPORTAR PARA EXCEL
  // ==========================================
  const exportarExcel = () => {
    if (historico.length === 0) return alert("Não há dados para exportar.");

    // Formatar os dados para o formato de grelha do Excel (Agora com o Código)
    const dadosFormatados = historico.map(item => ({
      'Código RE/RS': item.codigo || 'S/C',
      'Data e Hora': new Date(item.dataHora).toLocaleString('pt-BR'),
      'Produto': item.produto?.nome || 'Desconhecido',
      'Ação Realizada': item.tipoAcao.replace('_', ' '),
      'Quantidade': item.quantidade,
      'Responsável': item.usuario?.nome || 'Sistema',
      'Observação': item.observacao || '-'
    }));

    // Criar a folha de cálculo e o ficheiro
    const worksheet = XLSX.utils.json_to_sheet(dadosFormatados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Auditoria ViaPro");
    
    // Descarregar o ficheiro
    XLSX.writeFile(workbook, "Relatorio_Auditoria_ViaPro.xlsx");
  };

  // ==========================================
  // EXPORTAR PARA PDF
  // ==========================================
  const exportarPDF = () => {
    if (historico.length === 0) return alert("Não há dados para exportar.");

    const doc = new jsPDF();
    
    // Título do Documento
    doc.setFontSize(18);
    doc.setTextColor(44, 62, 80); // Cor Azul Escuro
    doc.text("Relatório de Auditoria e Movimentações - ViaPro ERP", 14, 22);
    
    // Data de emissão
    doc.setFontSize(10);
    doc.setTextColor(127, 140, 141);
    doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);

    // Estrutura da Tabela (Agora com o Código)
    const colunas = ["Código", "Data e Hora", "Produto", "Ação", "Qtd", "Responsável", "Observação"];
    const linhas = historico.map(item => [
      item.codigo || 'S/C',
      new Date(item.dataHora).toLocaleString('pt-BR'),
      item.produto?.nome || '-',
      item.tipoAcao.replace('_', ' '),
      item.quantidade > 0 ? `+${item.quantidade}` : item.quantidade,
      item.usuario?.nome || '-',
      item.observacao || '-'
    ]);

    // Desenhar a Tabela Mágica
    autoTable(doc, {
      head: [colunas],
      body: linhas,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 3 }, // Fonte levemente menor para caber todas as colunas
      headStyles: { fillColor: [2, 136, 209], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 247, 250] } 
    });

    // Descarregar o ficheiro
    doc.save("Relatorio_Auditoria_ViaPro.pdf");
  };

  if (carregando) return <div>A extrair logs do sistema...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Auditoria de Movimentações</h1>
        
        {/* BOTÕES DE EXPORTAÇÃO */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={exportarExcel} style={styles.btnExcel}>
            📊 Exportar Excel
          </button>
          <button onClick={exportarPDF} style={styles.btnPDF}>
            📄 Exportar PDF
          </button>
        </div>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Código</th>
              <th style={styles.th}>Data e Hora</th>
              <th style={styles.th}>Produto</th>
              <th style={styles.th}>Ação</th>
              <th style={{...styles.th, textAlign: 'center'}}>Qtd</th>
              <th style={styles.th}>Responsável</th>
              <th style={styles.th}>Observação</th>
            </tr>
          </thead>
          <tbody>
            {historico.length === 0 && (
              <tr><td colSpan={7} style={{textAlign: 'center', padding: '20px', color: '#7f8c8d'}}>Sem histórico registado.</td></tr>
            )}
            {historico.map((item) => {
              const isEntrada = item.tipoAcao.includes('Entrada') || (item.tipoAcao === 'Ajuste_Estoque' && item.quantidade > 0);
              
              return (
                <tr key={item.id} style={styles.tr}>
                  <td style={styles.td}>
                    {/* Badge destacado para o código da requisição */}
                    <span style={styles.badgeCodigo}>{item.codigo || '-'}</span>
                  </td>
                  <td style={styles.td}>{new Date(item.dataHora).toLocaleString('pt-BR')}</td>
                  <td style={styles.td}><strong>{item.produto?.nome}</strong></td>
                  <td style={styles.td}>
                    <span style={isEntrada ? styles.badgeVerde : styles.badgeVermelho}>
                      {item.tipoAcao.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{...styles.td, textAlign: 'center', fontWeight: '900', color: isEntrada ? '#27ae60' : '#e74c3c'}}>
                    {item.quantidade > 0 ? `+${item.quantidade}` : item.quantidade}
                  </td>
                  <td style={styles.td}>{item.usuario?.nome}</td>
                  <td style={{...styles.td, color: '#7f8c8d', fontSize: '13px'}}>{item.observacao || '-'}</td>
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
  tableContainer: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '15px 20px', backgroundColor: '#f9fbfb', color: '#7f8c8d', borderBottom: '2px solid #ecf0f1', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '1px' },
  tr: { borderBottom: '1px solid #ecf0f1' },
  td: { padding: '15px 20px', color: '#2c3e50', fontSize: '14px', verticalAlign: 'middle' },
  
  badgeCodigo: { backgroundColor: '#f1f2f6', color: '#2c3e50', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #ddd' },
  badgeVerde: { backgroundColor: '#eafaf1', color: '#27ae60', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeVermelho: { backgroundColor: '#fdf2e9', color: '#e74c3c', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  
  // ESTILOS DOS NOVOS BOTÕES
  btnExcel: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(39, 174, 96, 0.3)' },
  btnPDF: { backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(231, 76, 60, 0.3)' }
};