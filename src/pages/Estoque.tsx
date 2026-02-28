import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify'; 

export default function Estoque() {
  const location = useLocation();
  const [inventario, setInventario] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [busca, setBusca] = useState('');
  const [categoriaSelecionada, setCategoriaSelecionada] = useState('');
  const [mostrarCriticos, setMostrarCriticos] = useState(location.state?.filtrarCriticos || false);

  const [modalVisivel, setModalVisivel] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState<any>(null);
  const [formTipo, setFormTipo] = useState('Entrada de mercadoria');
  const [formQuantidade, setFormQuantidade] = useState('1');
  const [formObservacao, setFormObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);

  // ==========================================
  // FUNÇÃO DE FORMATAÇÃO FINANCEIRA
  // ==========================================
  const formatarReal = (valor: number) => Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

  async function carregarDados() {
    setCarregando(true);
    try {
      const [resEstoque, resCategorias, resProdutos] = await Promise.all([
        api.get('/estoque'), api.get('/categorias'), api.get('/produtos')
      ]);
      
      const produtosMap: any = {};
      resProdutos.data.forEach((p: any) => { produtosMap[p.id] = p; });

      const apenasDisponiveis = resEstoque.data
        .filter((item: any) => item.status === 'Disponível')
        .map((item: any) => ({
          ...item,
          produto: produtosMap[item.produtoId] || item.produto
        }));

      setInventario(apenasDisponiveis);
      setCategorias(resCategorias.data);
      
      const userSalvo = localStorage.getItem('@Munila:user');
      if (userSalvo) setUsuarioLogado(JSON.parse(userSalvo));
    } catch (error) { 
      toast.error("Erro ao conectar com o servidor."); 
    } 
    finally { setCarregando(false); }
  }

  useEffect(() => { carregarDados(); }, []);

  function abrirModal(item: any) {
    setItemSelecionado(item);
    setFormTipo('Entrada de mercadoria');
    setFormQuantidade('1');
    setFormObservacao('');
    setModalVisivel(true);
  }

  async function registrarMovimentacao(e: React.FormEvent) {
    e.preventDefault();
    if (!itemSelecionado || !usuarioLogado) return;
    
    const qtdNum = Number(formQuantidade);
    if (qtdNum <= 0 || isNaN(qtdNum)) {
      return toast.warn("Aviso: Digite uma quantidade válida."); 
    }

    setEnviando(true);
    try {
      await api.post('/movimentacoes/operacao', {
        produtoId: itemSelecionado.produto.id,
        usuarioId: usuarioLogado.id,
        estoqueId: itemSelecionado.id,
        quantidade: qtdNum,
        tipoAcao: formTipo,
        observacao: formObservacao
      });
      
      toast.success("Operação registada com sucesso no Armazém!"); 
      setModalVisivel(false);
      carregarDados();
    } catch (error: any) { 
      toast.error("Erro ao registar: " + (error.response?.data?.error || "Verifique o saldo no armazém.")); 
    } 
    finally { setEnviando(false); }
  }

  let inventarioFiltrado = inventario.filter(item => 
    item.produto.nome.toLowerCase().includes(busca.toLowerCase()) ||
    item.produto.sku.toLowerCase().includes(busca.toLowerCase())
  );

  if (categoriaSelecionada) inventarioFiltrado = inventarioFiltrado.filter(item => item.produto.categoriaId === categoriaSelecionada);
  if (mostrarCriticos) inventarioFiltrado = inventarioFiltrado.filter(item => item.quantidade < 10);

  inventarioFiltrado.sort((a, b) => a.produto.nome.localeCompare(b.produto.nome));

  const exportarExcel = () => {
    if (inventarioFiltrado.length === 0) return toast.warn("Não há dados para exportar."); 
    const dadosFormatados = inventarioFiltrado.map(item => ({
      'Produto': item.produto.nome, 
      'SKU': item.produto.sku, 
      'Endereço': item.produto.enderecoLocalizacao || '-',
      'Lote': item.produto.lote || '-', 
      'Fornecedor': item.produto.fornecedor?.nomeEmpresa || '-', 
      'Custo Unitário': formatarReal(item.produto.precoCusto),
      'Saldo em Estoque': item.quantidade,
      'Custo Total Imobilizado': formatarReal((item.produto.precoCusto || 0) * item.quantidade)
    }));
    const worksheet = XLSX.utils.json_to_sheet(dadosFormatados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Posição de Estoque");
    XLSX.writeFile(workbook, "Relatorio_Armazem_ViaPro.xlsx");
  };

  const exportarPDF = () => {
    if (inventarioFiltrado.length === 0) return toast.warn("Não há dados para exportar."); 
    const doc = new jsPDF();
    doc.setFontSize(18); doc.setTextColor(44, 62, 80); doc.text("Relatório de Posição de Estoque", 14, 22);
    doc.setFontSize(10); doc.setTextColor(127, 140, 141); doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);
    const colunas = ["Produto", "SKU", "Endereço", "Lote", "Custo Un.", "Saldo"];
    const linhas = inventarioFiltrado.map(item => [
      item.produto.nome, 
      item.produto.sku, 
      item.produto.enderecoLocalizacao || '-',
      item.produto.lote || '-', 
      formatarReal(item.produto.precoCusto),
      item.quantidade.toString()
    ]);
    autoTable(doc, {
      head: [colunas], body: linhas, startY: 35, styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [2, 136, 209], textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [245, 247, 250] } 
    });
    doc.save("Relatorio_Armazem_ViaPro.pdf");
  };

  if (carregando) return <div>Atualizando armazém...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Gestão de Armazém</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={exportarExcel} style={styles.btnExcel}>📊 Exportar Excel</button>
          <button onClick={exportarPDF} style={styles.btnPDF}>📄 Exportar PDF</button>
        </div>
      </div>

      <div style={styles.toolbar}>
        <input type="text" placeholder="Buscar por nome ou SKU..." style={styles.inputBusca} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select style={styles.selectCategoria} value={categoriaSelecionada} onChange={(e) => setCategoriaSelecionada(e.target.value)}>
          <option value="">Todas as Categorias</option>
          {categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}
        </select>
        
        <label style={{ 
          display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', 
          backgroundColor: mostrarCriticos ? '#fdf2e9' : 'white', 
          padding: '10px 15px', borderRadius: '8px', border: `1px solid ${mostrarCriticos ? '#e74c3c' : '#ddd'}`, 
          color: mostrarCriticos ? '#e74c3c' : '#7f8c8d', fontWeight: 'bold', fontSize: '14px', transition: '0.2s' 
        }}>
          <input type="checkbox" checked={mostrarCriticos} onChange={e => setMostrarCriticos(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
          Apenas Críticos (abaixo de 10)
        </label>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Produto</th>
              <th style={styles.th}>SKU</th>
              <th style={styles.th}>Endereço</th>
              <th style={styles.th}>Lote</th>
              <th style={styles.th}>Fornecedor</th>
              <th style={{...styles.th, textAlign: 'right'}}>Custo Un.</th>
              <th style={{...styles.th, textAlign: 'center'}}>Saldo</th>
              <th style={{...styles.th, textAlign: 'center'}}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {inventarioFiltrado.length === 0 && (
              <tr><td colSpan={8} style={{textAlign: 'center', padding: '20px', color: '#7f8c8d'}}>Nenhum produto encontrado.</td></tr>
            )}
            {inventarioFiltrado.map((item) => {
              const ehCritico = item.quantidade < 10;
              return (
                <tr key={item.id} style={styles.tr}>
                  <td style={styles.td}><strong>{item.produto.nome}</strong></td>
                  <td style={styles.td}><span style={styles.badgeCinza}>{item.produto.sku}</span></td>
                  <td style={styles.td}>{item.produto.enderecoLocalizacao || '-'}</td>
                  <td style={styles.td}>{item.produto.lote || '-'}</td>
                  <td style={styles.td}>{item.produto.fornecedor?.nomeEmpresa || '-'}</td>
                  <td style={{...styles.td, color: '#27ae60', fontWeight: 'bold', textAlign: 'right'}}>
                    {formatarReal(item.produto.precoCusto)}
                  </td>
                  <td style={{...styles.td, textAlign: 'center'}}>
                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: ehCritico ? '#e74c3c' : '#2c3e50' }}>{item.quantidade}</span>
                  </td>
                  <td style={{...styles.td, textAlign: 'center'}}>
                    <button onClick={() => abrirModal(item)} style={styles.btnAcao}>Gerenciar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalVisivel && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#2c3e50' }}>Movimentar Estoque</h2>
              <button onClick={() => setModalVisivel(false)} style={styles.btnFechar}>✖</button>
            </div>
            
            <p style={{ color: '#7f8c8d', marginBottom: '20px' }}><strong>Produto:</strong> {itemSelecionado?.produto.nome} (Saldo: {itemSelecionado?.quantidade})</p>

            <form onSubmit={registrarMovimentacao} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={styles.label}>Nova Ação de Inventário</label>
                <select style={styles.input} value={formTipo} onChange={(e) => setFormTipo(e.target.value)}>
                  <option value="Entrada de mercadoria">📥 Entrada de mercadoria</option>
                  <option value="Saída de mercadoria">📤 Saída de mercadoria</option>
                  <option value="Devolução VIAPRO">🔄 Devolução VIAPRO</option>
                  <option value="Ajuste de Saída de Inventário">📉 Ajuste de Saída de Inventário</option>
                  <option value="Ajuste de Entrada de Inventário">📈 Ajuste de Entrada de Inventário</option>
                  <option value="Saída para demonstração">🛍️ Saída para demonstração</option>
                </select>
              </div>

              <div>
                <label style={styles.label}>Quantidade de Itens</label>
                <input type="number" style={styles.input} value={formQuantidade} onChange={e => setFormQuantidade(e.target.value)} required min="1" />
              </div>

              <div>
                <label style={styles.label}>Observação (Motivo / Responsável Externo)</label>
                <input type="text" style={styles.input} value={formObservacao} onChange={e => setFormObservacao(e.target.value)} placeholder="Detalhes da operação..." />
              </div>

              <button type="submit" style={styles.btnConfirmar} disabled={enviando}>
                {enviando ? 'Processando...' : 'Confirmar Movimentação'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  toolbar: { display: 'flex', gap: '15px', marginBottom: '20px' },
  inputBusca: { flex: 2, padding: '12px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', outline: 'none' },
  selectCategoria: { flex: 1, padding: '12px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', outline: 'none', backgroundColor: 'white', cursor: 'pointer' },
  tableContainer: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '15px 20px', backgroundColor: '#f9fbfb', color: '#7f8c8d', borderBottom: '2px solid #ecf0f1', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '1px' },
  tr: { borderBottom: '1px solid #ecf0f1', transition: '0.2s' },
  td: { padding: '15px 20px', color: '#2c3e50', fontSize: '14px', verticalAlign: 'middle' },
  badgeCinza: { backgroundColor: '#f1f2f6', color: '#7f8c8d', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  btnAcao: { backgroundColor: '#0288D1', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '500px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
  btnFechar: { background: 'none', border: 'none', fontSize: '20px', color: '#e74c3c', cursor: 'pointer' },
  label: { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box', backgroundColor: '#fafafa' },
  btnConfirmar: { backgroundColor: '#0288D1', color: 'white', padding: '15px', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' },
  btnExcel: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(39, 174, 96, 0.3)' },
  btnPDF: { backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(231, 76, 60, 0.3)' }
};