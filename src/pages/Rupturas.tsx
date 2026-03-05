// src/pages/Rupturas.tsx
import React, { useState, useEffect } from 'react';
import { api } from '../api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify'; 

export default function Rupturas() {
  const [inventarioRuptura, setInventarioRuptura] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');

  const formatarReal = (valor: number) => Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

  async function carregarRupturas() {
    setCarregando(true);
    try {
      // Busca todos os estoques e filtra apenas os que têm status 'Ruptura'
      const res = await api.get('/estoque');
      const apenasRupturas = res.data.filter((item: any) => item.status === 'Ruptura' && item.quantidade > 0);
      setInventarioRuptura(apenasRupturas);
    } catch (error) { 
      toast.error("Erro ao carregar o relatório de avarias."); 
    } finally { 
      setCarregando(false); 
    }
  }

  useEffect(() => { carregarRupturas(); }, []);

  const rupturasFiltradas = inventarioRuptura.filter(item => 
    item.produto?.nome.toLowerCase().includes(busca.toLowerCase()) ||
    item.produto?.sku.toLowerCase().includes(busca.toLowerCase())
  ).sort((a, b) => a.produto?.nome.localeCompare(b.produto?.nome));

  const totalPrejuizo = rupturasFiltradas.reduce((total, item) => total + (item.quantidade * (item.produto?.precoCusto || 0)), 0);

  const exportarExcel = () => {
    if (rupturasFiltradas.length === 0) return toast.warn("Não há dados para exportar."); 
    const dadosFormatados = rupturasFiltradas.map(item => ({
      'Produto Avariado': item.produto?.nome, 
      'SKU': item.produto?.sku, 
      'Quantidade Perdida': item.quantidade,
      'Custo Unitário': formatarReal(item.produto?.precoCusto),
      'Prejuízo Calculado': formatarReal((item.produto?.precoCusto || 0) * item.quantidade)
    }));
    const worksheet = XLSX.utils.json_to_sheet(dadosFormatados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rupturas e Avarias");
    XLSX.writeFile(workbook, "Relatorio_Perdas_ViaPro.xlsx");
  };

  const exportarPDF = () => {
    if (rupturasFiltradas.length === 0) return toast.warn("Não há dados para exportar."); 
    const doc = new jsPDF();
    doc.setFontSize(18); doc.setTextColor(231, 76, 60); doc.text("Relatório de Perdas e Avarias (Ruptura)", 14, 22);
    doc.setFontSize(10); doc.setTextColor(127, 140, 141); doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);
    
    doc.setFontSize(12); doc.setTextColor(44, 62, 80); 
    doc.text(`Prejuízo Total Imobilizado: ${formatarReal(totalPrejuizo)}`, 14, 40);

    const colunas = ["Produto", "SKU", "Qtd Perdida", "Custo Un.", "Prejuízo"];
    const linhas = rupturasFiltradas.map(item => [
      item.produto?.nome || 'Desconhecido', 
      item.produto?.sku || '-', 
      item.quantidade.toString(),
      formatarReal(item.produto?.precoCusto),
      formatarReal((item.produto?.precoCusto || 0) * item.quantidade)
    ]);
    autoTable(doc, {
      head: [colunas], body: linhas, startY: 48, styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [231, 76, 60], textColor: [255, 255, 255] } 
    });
    doc.save("Relatorio_Perdas_ViaPro.pdf");
  };

  if (carregando) return <div>Atualizando relatório de avarias...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#e74c3c', margin: 0 }}>⚠️ Painel de Rupturas (Perdas e Avarias)</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={exportarExcel} style={styles.btnExcel}>📊 Exportar Excel</button>
          <button onClick={exportarPDF} style={styles.btnPDF}>📄 Exportar PDF</button>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#7f8c8d', textTransform: 'uppercase' }}>Prejuízo Financeiro Total</span>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#e74c3c' }}>{formatarReal(totalPrejuizo)}</div>
        </div>
        <input 
          type="text" 
          placeholder="Buscar produto perdido..." 
          style={{ width: '300px', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px' }} 
          value={busca} 
          onChange={(e) => setBusca(e.target.value)} 
        />
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Produto Avariado/Perdido</th>
              <th style={styles.th}>SKU</th>
              <th style={{...styles.th, textAlign: 'center'}}>Qtd. Perdida</th>
              <th style={{...styles.th, textAlign: 'right'}}>Custo Unitário</th>
              <th style={{...styles.th, textAlign: 'right'}}>Prejuízo</th>
            </tr>
          </thead>
          <tbody>
            {rupturasFiltradas.length === 0 && (
              <tr><td colSpan={5} style={{textAlign: 'center', padding: '20px', color: '#7f8c8d'}}>Nenhum produto em ruptura/avaria. Excelente!</td></tr>
            )}
            {rupturasFiltradas.map((item) => (
              <tr key={item.id} style={styles.tr}>
                <td style={styles.td}><strong>{item.produto?.nome}</strong></td>
                <td style={styles.td}><span style={styles.badgeCinza}>{item.produto?.sku}</span></td>
                <td style={{...styles.td, textAlign: 'center'}}>
                  <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#e74c3c' }}>{item.quantidade}</span>
                </td>
                <td style={{...styles.td, color: '#7f8c8d', textAlign: 'right'}}>{formatarReal(item.produto?.precoCusto)}</td>
                <td style={{...styles.td, fontWeight: 'bold', color: '#e74c3c', textAlign: 'right'}}>
                  {formatarReal(item.quantidade * (item.produto?.precoCusto || 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  tableContainer: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '15px 20px', backgroundColor: '#fdf2e9', color: '#e74c3c', borderBottom: '2px solid #fadbd8', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '1px', fontWeight: 'bold' },
  tr: { borderBottom: '1px solid #ecf0f1', transition: '0.2s' },
  td: { padding: '15px 20px', color: '#2c3e50', fontSize: '14px', verticalAlign: 'middle' },
  badgeCinza: { backgroundColor: '#f1f2f6', color: '#7f8c8d', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  btnExcel: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' },
  btnPDF: { backgroundColor: '#c0392b', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }
};