import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { toast } from 'react-toastify';
import { IoConstructOutline, IoSwapVerticalOutline, IoCloseCircleOutline, IoDownloadOutline, IoDocumentTextOutline } from 'react-icons/io5';

// Importações para Exportação
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ✨ FUNÇÃO QUE LÊ A TAG ESCONDIDA NA DESCRIÇÃO PARA CADA PRODUTO ✨
function extrairEstoqueMinimo(descricao: string | null | undefined): number {
  if (!descricao) return 10; // Valor padrão caso não tenha descrição
  const match = descricao.match(/\[MIN:(\d+)\]/);
  return match && match[1] ? parseInt(match[1], 10) : 10;
}

export default function Estoque() {
  const location = useLocation();
  const [inventario, setInventario] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState('');
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);

  const [mostrarApenasCritico, setMostrarApenasCritico] = useState(false);

  // Estados do Modal de Movimentação Normal
  const [modalMovimentoVisivel, setModalMovimentoVisivel] = useState(false);
  const [estoqueSelecionado, setEstoqueSelecionado] = useState<any>(null);
  const [tipoAcao, setTipoAcao] = useState('Entrada de mercadoria');
  const [quantidadeMovimento, setQuantidadeMovimento] = useState('');
  const [observacao, setObservacao] = useState('');

  // Estados do Modal de Produção Industrial
  const [modalProducaoVisivel, setModalProducaoVisivel] = useState(false);
  const [produtoFinalId, setProdutoFinalId] = useState('');
  const [quantidadeProduzir, setQuantidadeProduzir] = useState('1');

  useEffect(() => {
    if (location.state?.filtro === 'critico' || location.search.includes('critico')) {
      setMostrarApenasCritico(true);
    }
  }, [location]);

  async function carregarDados() {
    setCarregando(true);
    try {
      const [resEstoque, resProd] = await Promise.all([
        api.get('/estoque'),
        api.get('/produtos')
      ]);
      setInventario(resEstoque.data);
      setProdutos(resProd.data);

      const userSalvo = localStorage.getItem('@Munila:user');
      if (userSalvo) setUsuarioLogado(JSON.parse(userSalvo));
    } catch (error) {
      toast.error("Erro ao carregar os dados do armazém.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarDados(); }, []);

  const inventarioFiltrado = useMemo(() => {
    const filtrado = inventario.filter(i => {
      if (mostrarApenasCritico) {
        const minimo = extrairEstoqueMinimo(i.produto?.descricao); 
        if (i.quantidade > minimo) return false; 
      }
      const termo = termoBusca.toLowerCase();
      const nomeProduto = i.produto?.nome?.toLowerCase() || '';
      const skuProduto = i.produto?.sku?.toLowerCase() || '';
      return nomeProduto.includes(termo) || skuProduto.includes(termo) || i.status.toLowerCase().includes(termo);
    });

    return filtrado.sort((a, b) => {
      const nomeA = a.produto?.nome || '';
      const nomeB = b.produto?.nome || '';
      return nomeA.localeCompare(nomeB);
    });
  }, [inventario, termoBusca, mostrarApenasCritico]);

  const produtosProduziveis = produtos
    .filter(p => p.tipo === 'ACABADO')
    .sort((a, b) => {
      const nomeA = a.nome || '';
      const nomeB = b.nome || '';
      return nomeA.localeCompare(nomeB);
    });

  // ==========================================
  // FUNÇÕES DE EXPORTAÇÃO
  // ==========================================

  const exportarExcel = () => {
    if (inventarioFiltrado.length === 0) {
      return toast.warn("Não há dados para exportar.");
    }

    const dadosPlanilha = inventarioFiltrado.map((item) => ({
      'Produto': item.produto?.nome || 'Desconhecido',
      'SKU': item.produto?.sku || '-',
      'Qtd. Atual': item.quantidade,
      'Estoque Mínimo': extrairEstoqueMinimo(item.produto?.descricao),
      'Status': item.status,
      'Endereço (Zona)': item.produto?.enderecoLocalizacao || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dadosPlanilha);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Armazém");
    
    const dataHj = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Inventario_ViaPro_${dataHj}.xlsx`);
    toast.success("Excel exportado com sucesso!");
  };

  const exportarPDF = () => {
    if (inventarioFiltrado.length === 0) {
      return toast.warn("Não há dados para exportar.");
    }

    try {
      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.text("Relatório de Armazém & Inventário - ViaPro", 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 28);

      const tableColumn = ["Produto", "SKU", "Qtd Atual", "Qtd Mín.", "Status", "Local"];
      const tableRows: any[] = [];

      inventarioFiltrado.forEach(item => {
        const rowData = [
          item.produto?.nome || 'Desconhecido',
          item.produto?.sku || '-',
          `${item.quantidade} un`,
          `${extrairEstoqueMinimo(item.produto?.descricao)} un`, 
          item.status,
          item.produto?.enderecoLocalizacao || '-'
        ];
        tableRows.push(rowData);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 35,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        // ✨ LÓGICA DE CORES NO PDF ADICIONADA AQUI ✨
        didParseCell: (data) => {
          if (data.section === 'body') {
            // Coluna "Qtd Atual" (Índice 2)
            if (data.column.index === 2) {
              const qtdAtual = parseInt(data.row.raw[2] as string, 10);
              const qtdMin = parseInt(data.row.raw[3] as string, 10);
              
              if (qtdAtual <= qtdMin) {
                // Vermelho WMS (#e74c3c)
                data.cell.styles.textColor = [231, 76, 60]; 
                data.cell.styles.fontStyle = 'bold';
              } else {
                // Verde WMS (#27ae60)
                data.cell.styles.textColor = [39, 174, 96]; 
                data.cell.styles.fontStyle = 'bold';
              }
            }

            // Coluna "Status" (Índice 4)
            if (data.column.index === 4) {
              if (data.cell.raw === 'Disponível') {
                data.cell.styles.textColor = [39, 174, 96]; // Verde
                data.cell.styles.fontStyle = 'bold';
              } else {
                data.cell.styles.textColor = [243, 156, 18]; // Laranja
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        }
      });

      const dataHj = new Date().toISOString().split('T')[0];
      doc.save(`Inventario_ViaPro_${dataHj}.pdf`);
      toast.success("PDF exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro interno ao gerar o arquivo PDF.");
    }
  };

  // ==========================================
  // MODAIS E SALVAMENTOS
  // ==========================================

  function abrirModalMovimento(item: any) {
    setEstoqueSelecionado(item);
    setTipoAcao('Entrada de mercadoria');
    setQuantidadeMovimento('');
    setObservacao('');
    setModalMovimentoVisivel(true);
  }

  function abrirModalProducao() {
    setProdutoFinalId('');
    setQuantidadeProduzir('1');
    setModalProducaoVisivel(true);
  }

  async function salvarMovimento(e: React.FormEvent) {
    e.preventDefault();
    if (!quantidadeMovimento || Number(quantidadeMovimento) <= 0) return toast.warn("Informe uma quantidade válida.");
    if (!usuarioLogado) return toast.error("Sessão expirada. Faça login novamente.");

    try {
      await api.post('/movimentacoes/operacao', {
        produtoId: estoqueSelecionado.produtoId,
        usuarioId: usuarioLogado.id,
        estoqueId: estoqueSelecionado.id,
        quantidade: quantidadeMovimento,
        tipoAcao: tipoAcao,
        observacao: observacao
      });
      toast.success("Movimentação registada com sucesso!");
      setModalMovimentoVisivel(false);
      carregarDados();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Erro ao movimentar estoque.");
    }
  }

  async function executarProducao(e: React.FormEvent) {
    e.preventDefault();
    if (!produtoFinalId) return toast.warn("Selecione o produto que deseja fabricar.");
    if (Number(quantidadeProduzir) <= 0) return toast.warn("A quantidade a produzir deve ser maior que zero.");

    try {
      const res = await api.post('/producao/executar', {
        produtoFinalId: produtoFinalId,
        quantidadeProduzir: Number(quantidadeProduzir),
        usuarioId: usuarioLogado.id
      });
      
      toast.success(res.data.mensagem || "Lote produzido com sucesso! Matéria-prima baixada.");
      setModalProducaoVisivel(false);
      carregarDados();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Erro ao executar produção.");
    }
  }

  const opcoesMovimentacao = [
    { valor: 'Entrada de mercadoria', label: 'Entrada de Mercadoria', icon: '📦', cor: '#27ae60' },
    { valor: 'Devolução VIAPRO', label: 'Devolução VIAPRO', icon: '🔄', cor: '#2980b9' },
    { valor: 'Ajuste de Entrada de Inventário', label: 'Ajuste (+)', icon: '➕', cor: '#27ae60' },
    { valor: 'Saída de mercadoria', label: 'Saída de mercadoria', icon: '📤', cor: '#e74c3c' },
    { valor: 'Saída para demonstração', label: 'Demonstração', icon: '🤝', cor: '#f39c12' },
    { valor: 'Ajuste de Saída de Inventário', label: 'Ajuste (-)', icon: '➖', cor: '#e74c3c' },
    { valor: 'Perdas/Avarias', label: 'Perdas/Avarias', icon: '⚠️', cor: '#c0392b' }
  ];

  if (carregando) return <div style={{ textAlign: 'center', marginTop: '50px' }}>A carregar o armazém...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Armazém & Inventário</h1>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={exportarExcel} style={{ ...styles.btnPrincipal, backgroundColor: '#27ae60' }}>
            <IoDownloadOutline size={18} /> Exportar Excel
          </button>
          
          <button onClick={exportarPDF} style={{ ...styles.btnPrincipal, backgroundColor: '#e74c3c' }}>
            <IoDocumentTextOutline size={18} /> Exportar PDF
          </button>

          <button onClick={abrirModalProducao} style={{...styles.btnPrincipal, backgroundColor: '#8e44ad'}}>
            <IoConstructOutline size={20} /> Produzir Lote
          </button>
        </div>
      </div>

      {mostrarApenasCritico && (
        <div style={{ marginBottom: '20px', backgroundColor: '#feeceb', padding: '12px 15px', borderRadius: '8px', border: '1px solid #f5c6cb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#c0392b', fontWeight: 'bold', fontSize: '14px' }}>
            ⚠️ Exibindo apenas itens em Estoque Crítico (Abaixo do Mínimo)
          </span>
          <button onClick={() => setMostrarApenasCritico(false)} style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold' }}>
            <IoCloseCircleOutline size={18} /> Limpar Filtro
          </button>
        </div>
      )}

      <div style={{ marginBottom: '20px', backgroundColor: 'white', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
        <input 
          type="text" 
          placeholder="Pesquisar no armazém por Nome, SKU ou Status..." 
          style={styles.inputBusca} 
          value={termoBusca} 
          onChange={(e) => setTermoBusca(e.target.value)} 
        />
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Produto</th>
              <th style={styles.th}>SKU</th>
              <th style={styles.th}>Qtd. Atual</th>
              <th style={styles.th}>Qtd. Mínima</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Endereço (Zona)</th>
              <th style={{...styles.th, textAlign: 'center'}}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {inventarioFiltrado.length === 0 && <tr><td colSpan={7} style={{textAlign: 'center', padding: '20px', color: '#7f8c8d'}}>Nenhum item encontrado no armazém.</td></tr>}
            {inventarioFiltrado.map((item) => {
              const estoqueMin = extrairEstoqueMinimo(item.produto?.descricao);
              const isCritico = item.quantidade <= estoqueMin;

              return (
                <tr key={item.id} style={styles.tr}>
                  <td style={styles.td}><strong>{item.produto?.nome || 'Produto Desconhecido'}</strong></td>
                  <td style={styles.td}><span style={styles.badgeSku}>{item.produto?.sku || '-'}</span></td>
                  <td style={styles.td}>
                    <strong style={{ fontSize: '16px', color: isCritico ? '#e74c3c' : '#27ae60' }}>
                      {item.quantidade} un
                    </strong>
                  </td>
                  <td style={styles.td}>
                    <span style={{ color: '#7f8c8d', fontSize: '13px', fontWeight: 'bold' }}>
                      {estoqueMin} un
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={item.status === 'Disponível' ? styles.badgeNacional : styles.badgeImportado}>
                      {item.status}
                    </span>
                  </td>
                  <td style={styles.td}>{item.produto?.enderecoLocalizacao || '-'}</td>
                  <td style={{...styles.td, textAlign: 'center'}}>
                    <button onClick={() => abrirModalMovimento(item)} style={styles.btnAcaoEditar}>
                      <IoSwapVerticalOutline size={16} /> Movimentar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL DE MOVIMENTAÇÃO */}
      {modalMovimentoVisivel && estoqueSelecionado && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '600px'}}>
            <h2 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>Gestão Rápida de Estoque</h2>
            <p style={{ color: '#7f8c8d', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
              Item: <strong style={{color: '#2c3e50'}}>{estoqueSelecionado.produto?.nome}</strong><br/>
              Saldo Atual: <strong style={{color: '#0288D1'}}>{estoqueSelecionado.quantidade} unidades</strong>
            </p>

            <form onSubmit={salvarMovimento} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div>
                <label style={styles.label}>1. Selecione o Tipo de Movimentação</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px', marginTop: '10px' }}>
                  {opcoesMovimentacao.map((opcao) => (
                    <div 
                      key={opcao.valor}
                      onClick={() => setTipoAcao(opcao.valor)}
                      style={{
                        border: tipoAcao === opcao.valor ? `2px solid ${opcao.cor}` : '1px solid #ecf0f1',
                        backgroundColor: tipoAcao === opcao.valor ? `${opcao.cor}10` : '#f9fbfb',
                        padding: '12px 5px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s ease-in-out',
                        transform: tipoAcao === opcao.valor ? 'scale(1.02)' : 'scale(1)'
                      }}
                    >
                      <span style={{ fontSize: '24px' }}>{opcao.icon}</span>
                      <span style={{ fontSize: '11px', fontWeight: tipoAcao === opcao.valor ? 'bold' : '600', color: tipoAcao === opcao.valor ? opcao.cor : '#7f8c8d', lineHeight: '1.2' }}>
                        {opcao.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>2. Quantidade</label>
                  <input type="number" style={{...styles.input, fontSize: '18px', fontWeight: 'bold'}} value={quantidadeMovimento} onChange={e => setQuantidadeMovimento(e.target.value)} min="1" placeholder="0" required />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={styles.label}>3. Motivo / Observação</label>
                  <input type="text" style={styles.input} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex: Devolução cliente, Erro de contagem..." />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', paddingTop: '15px', borderTop: '1px solid #eee' }}>
                <button type="button" onClick={() => setModalMovimentoVisivel(false)} style={styles.btnCancelar}>Cancelar</button>
                <button type="submit" style={styles.btnSalvarPequeno}>Confirmar Operação</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE ORDEM DE PRODUÇÃO */}
      {modalProducaoVisivel && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '600px'}}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
              <div style={{ backgroundColor: '#f4ecf7', padding: '10px', borderRadius: '50%' }}>
                <IoConstructOutline size={24} color="#8e44ad" />
              </div>
              <h2 style={{ margin: '0', color: '#2c3e50' }}>Ordem de Produção Interna</h2>
            </div>
            
            <p style={{ color: '#7f8c8d', marginBottom: '20px', fontSize: '14px', lineHeight: '1.5' }}>
              Selecione um produto <strong>Nacional</strong> (Montado) para fabricar. O sistema irá automaticamente dar baixa nas matérias-primas necessárias de acordo com a Receita cadastrada no Catálogo.
            </p>

            <form onSubmit={executarProducao} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ backgroundColor: '#f9fbfb', padding: '15px', borderRadius: '8px', border: '1px solid #ecf0f1' }}>
                <label style={styles.label}>Produto Final a Fabricar</label>
                <select style={styles.input} value={produtoFinalId} onChange={e => setProdutoFinalId(e.target.value)} required>
                  <option value="">Selecione o produto final...</option>
                  {produtosProduziveis.map(p => (
                    <option key={p.id} value={p.id}>[{p.sku}] - {p.nome}</option>
                  ))}
                </select>

                <div style={{ marginTop: '15px' }}>
                  <label style={styles.label}>Quantidade de Lotes (Unidades Finais)</label>
                  <input type="number" style={{...styles.input, fontSize: '18px', fontWeight: 'bold', color: '#8e44ad'}} value={quantidadeProduzir} onChange={e => setQuantidadeProduzir(e.target.value)} min="1" required />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setModalProducaoVisivel(false)} style={styles.btnCancelar}>Cancelar</button>
                <button type="submit" style={{...styles.btnSalvarPequeno, backgroundColor: '#8e44ad'}}>🛠️ Executar Produção</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  tableContainer: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '15px 20px', backgroundColor: '#f9fbfb', color: '#7f8c8d', borderBottom: '2px solid #ecf0f1', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '1px' },
  tr: { borderBottom: '1px solid #ecf0f1', transition: '0.2s' },
  td: { padding: '15px 20px', color: '#2c3e50', fontSize: '14px', verticalAlign: 'middle' },
  badgeSku: { backgroundColor: '#e1f5fe', color: '#0288D1', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '900', letterSpacing: '0.5px', border: '1px solid #b3e5fc' },
  badgeNacional: { backgroundColor: '#eafaf1', color: '#27ae60', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' },
  badgeImportado: { backgroundColor: '#fef5e7', color: '#f39c12', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' },
  btnAcaoEditar: { border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#3498db', color: 'white', margin: '0 auto' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
  label: { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box', backgroundColor: '#fafafa' },
  btnPrincipal: { color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' },
  inputBusca: { width: '100%', padding: '12px 15px', borderRadius: '8px', border: '1px solid #ecf0f1', fontSize: '14px', backgroundColor: '#f9fbfb', color: '#2c3e50', boxSizing: 'border-box' },
  btnCancelar: { backgroundColor: '#f1f2f6', color: '#7f8c8d', border: 'none', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  btnSalvarPequeno: { color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', backgroundColor: '#27ae60' }
};