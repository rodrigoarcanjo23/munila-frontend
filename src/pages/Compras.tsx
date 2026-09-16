import React, { useState, useEffect } from 'react';
import { api } from '../api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify'; 
import { 
  IoTimeOutline, IoWarningOutline, IoWalletOutline 
} from 'react-icons/io5';

export default function Compras() {
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [pedidos, setPedidos] = useState<any[]>([]); 
  const [carregando, setCarregando] = useState(true);

  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [modalVisivel, setModalVisivel] = useState(false);

  // Estado para saber se estamos editando
  const [idEdicao, setIdEdicao] = useState<string | null>(null);

  const [fornecedorId, setFornecedorId] = useState('');
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [custoEstimado, setCustoEstimado] = useState('');
  const [previsaoEntrega, setPrevisaoEntrega] = useState('');

  async function carregarDados() {
    setCarregando(true);
    const userSalvo = localStorage.getItem('@Munila:user');
    if (userSalvo) setUsuarioLogado(JSON.parse(userSalvo));

    try {
      try {
        const resFornecedores = await api.get('/fornecedores');
        setFornecedores(resFornecedores.data);
      } catch (e) { toast.error("Erro ao carregar fornecedores"); } 

      try {
        const resProdutos = await api.get('/produtos');
        const materiasPrimas = resProdutos.data.filter((p: any) => p.tipo === 'MATERIA_PRIMA');
        setProdutos(materiasPrimas.length > 0 ? materiasPrimas : resProdutos.data);
      } catch (e) { toast.error("Erro ao carregar produtos"); } 

      try {
        const resPedidos = await api.get('/pedidos-compra');
        setPedidos(resPedidos.data);
      } catch (e) { toast.error("Erro ao carregar pedidos"); } 

    } finally { setCarregando(false); }
  }

  useEffect(() => { carregarDados(); }, []);

  function abrirModalNovo() {
    setIdEdicao(null);
    setFornecedorId(''); setProdutoId(''); setQuantidade(''); setCustoEstimado(''); setPrevisaoEntrega('');
    setModalVisivel(true);
  }

  function abrirModalEdicao(pedido: any) {
    setIdEdicao(pedido.id);
    setFornecedorId(pedido.fornecedorId);
    setProdutoId(pedido.produtoId);
    setQuantidade(String(pedido.quantidade));
    setCustoEstimado(String(pedido.custoTotal / pedido.quantidade)); 
    setPrevisaoEntrega(pedido.dataPrevisao ? pedido.dataPrevisao.substring(0, 10) : '');
    setModalVisivel(true);
  }

  async function salvarPedido(e: React.FormEvent) {
    e.preventDefault();
    if (!fornecedorId || !produtoId || !quantidade) {
      return toast.warn("Por favor, selecione o Fornecedor, o Produto e a Quantidade."); 
    }

    const custoTotal = Number(quantidade) * Number(custoEstimado.toString().replace(',', '.') || 0);
    const payload = {
      fornecedorId, produtoId, quantidade, custoTotal,
      dataPrevisao: previsaoEntrega ? previsaoEntrega + "T00:00:00.000Z" : undefined 
    };

    try {
      if (idEdicao) {
        await api.put(`/pedidos-compra/${idEdicao}`, payload);
        toast.success("Pedido de Compra atualizado com sucesso!");
      } else {
        await api.post('/pedidos-compra', payload);
        toast.success("Pedido de Compra emitido e e-mails disparados!"); 
      }
      setModalVisivel(false);
      carregarDados();
    } catch (error: any) { 
      const erroReal = error.response?.data?.error || error.message;
      toast.error(`Erro do Servidor: ${erroReal}`); 
    }
  }

  async function apagarPedido(id: string) {
    if (window.confirm("Deseja mesmo excluir este pedido de compra? Esta ação não pode ser desfeita.")) {
      try {
        await api.delete(`/pedidos-compra/${id}`);
        toast.success("Pedido excluído com sucesso.");
        carregarDados();
      } catch (error: any) {
        const erroReal = error.response?.data?.error || "Erro ao excluir o pedido.";
        toast.error(erroReal);
      }
    }
  }

  async function marcarComoRecebido(id: string) {
    if (!usuarioLogado) return toast.error("Erro de segurança: A sua sessão expirou."); 

    if (window.confirm("Confirmar a recepção? O estoque do Armazém vai ser atualizado automaticamente!")) {
      try {
        await api.put(`/pedidos-compra/${id}/receber`, { usuarioId: usuarioLogado.id });
        carregarDados();
        toast.success("Mercadoria recebida e estoque atualizado com sucesso!"); 
      } catch (error: any) { 
        const erroReal = error.response?.data?.error || error.message;
        toast.error(`Erro ao receber mercadoria: ${erroReal}`); 
      }
    }
  }

  // ==========================================
  // LÓGICA DO MINI-DASHBOARD FINANCEIRO E ATRASOS
  // ==========================================
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const totalEmTransito = pedidos
    .filter(p => p.status === 'Pendente')
    .reduce((acc, p) => acc + Number(p.custoTotal), 0);

  const totalCompradoMes = pedidos
    .filter(p => new Date(p.createdAt).getMonth() === new Date().getMonth())
    .reduce((acc, p) => acc + Number(p.custoTotal), 0);

  const pedidosAtrasados = pedidos.filter(p => {
    if (p.status !== 'Pendente' || !p.dataPrevisao) return false;
    const prev = new Date(p.dataPrevisao);
    prev.setHours(0, 0, 0, 0);
    return prev < hoje;
  }).length;

  const exportarExcel = () => {
    if (pedidos.length === 0) return toast.warn("Não há dados para exportar."); 
    const dadosFormatados = pedidos.map(item => ({
      'Código': item.codigo || '-', 'Data do Pedido': new Date(item.createdAt).toLocaleDateString('pt-BR'),
      'Fornecedor': item.fornecedor?.nomeEmpresa || 'Desconhecido', 'Produto/Insumo': item.produto?.nome || 'Desconhecido',
      'Quantidade': item.quantidade, 'Custo Total (R$)': item.custoTotal.toFixed(2).replace('.', ','), 'Status': item.status
    }));
    const worksheet = XLSX.utils.json_to_sheet(dadosFormatados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pedidos de Compra");
    XLSX.writeFile(workbook, "Relatorio_Compras_ViaPro.xlsx");
  };

  const exportarPDF = () => {
    if (pedidos.length === 0) return toast.warn("Não há dados para exportar."); 
    const doc = new jsPDF();
    doc.setFontSize(18); doc.setTextColor(44, 62, 80); doc.text("Relatório de Pedidos de Compra", 14, 22);
    doc.setFontSize(10); doc.setTextColor(127, 140, 141); doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);
    const colunas = ["Código", "Data", "Fornecedor", "Produto", "Qtd", "Custo Total", "Status"];
    const linhas = pedidos.map(item => [
      item.codigo || '-', new Date(item.createdAt).toLocaleDateString('pt-BR'),
      item.fornecedor?.nomeEmpresa || '-', item.produto?.nome || '-', item.quantidade.toString(),
      `R$ ${item.custoTotal.toFixed(2).replace('.', ',')}`, item.status
    ]);
    autoTable(doc, {
      head: [colunas], body: linhas, startY: 35, styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [230, 126, 34], textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [253, 246, 237] } 
    });
    doc.save("Relatorio_Compras_ViaPro.pdf");
  };

  if (carregando) return <div>Sincronizando Módulo de Compras...</div>;

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ color: '#2c3e50', margin: 0 }}>Pedidos de Compra</h1>
          <p style={{ margin: 0, color: '#7f8c8d', fontSize: '14px' }}>Gestão de suprimentos e recebimento de fornecedores.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={exportarExcel} style={styles.btnExcel}>📊 Exportar Excel</button>
          <button onClick={exportarPDF} style={styles.btnPDF}>📄 Exportar PDF</button>
          <button onClick={abrirModalNovo} style={styles.btnPrincipal}>+ Emitir Pedido</button>
        </div>
      </div>

      {/* MINI-DASHBOARD FINANCEIRO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '25px' }}>
        <div style={{...styles.cardDashboard, borderLeft: '5px solid #f39c12'}}>
          <div style={styles.iconDash}><IoTimeOutline size={24} color="#f39c12" /></div>
          <div>
            <p style={styles.dashTitle}>Total em Trânsito (Pendentes)</p>
            <h2 style={styles.dashValue}>R$ {totalEmTransito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
          </div>
        </div>
        <div style={{...styles.cardDashboard, borderLeft: '5px solid #e74c3c'}}>
          <div style={{...styles.iconDash, backgroundColor: '#fdedec'}}><IoWarningOutline size={24} color="#e74c3c" /></div>
          <div>
            <p style={styles.dashTitle}>Entregas Atrasadas</p>
            <h2 style={{...styles.dashValue, color: '#e74c3c'}}>{pedidosAtrasados} fornecedor(es)</h2>
          </div>
        </div>
        <div style={{...styles.cardDashboard, borderLeft: '5px solid #27ae60'}}>
          <div style={{...styles.iconDash, backgroundColor: '#eafaf1'}}><IoWalletOutline size={24} color="#27ae60" /></div>
          <div>
            <p style={styles.dashTitle}>Compras neste Mês</p>
            <h2 style={styles.dashValue}>R$ {totalCompradoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
          </div>
        </div>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Código</th>
              <th style={styles.th}>Data do Pedido</th>
              <th style={styles.th}>Fornecedor</th>
              <th style={styles.th}>Insumo</th>
              <th style={{...styles.th, textAlign: 'center'}}>Qtd</th>
              <th style={styles.th}>Custo Total</th>
              <th style={styles.th}>Status</th>
              <th style={{...styles.th, textAlign: 'center'}}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.length === 0 && (
              <tr><td colSpan={8} style={{textAlign: 'center', padding: '30px', color: '#7f8c8d'}}>Ainda não efetuou nenhum pedido.</td></tr>
            )}
            {pedidos.map((item) => {
              // Lógica de Detecção de Atraso
              let badgeStatus = styles.badgeAmarelo;
              let textoStatus = item.status;

              if (item.status === 'Recebido') {
                badgeStatus = styles.badgeVerde;
              } else if (item.dataPrevisao) {
                const prev = new Date(item.dataPrevisao);
                prev.setHours(0,0,0,0);
                if (prev < hoje) {
                  badgeStatus = styles.badgeVermelho;
                  textoStatus = 'Atrasado';
                }
              }

              return (
                <tr key={item.id} style={styles.tr}>
                  <td style={styles.td}><span style={styles.badgeCodigo}>{item.codigo || '-'}</span></td>
                  <td style={styles.td}>
                    <div>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</div>
                    {item.dataPrevisao && (
                      <div style={{ fontSize: '11px', color: '#7f8c8d', marginTop: '2px' }}>
                        Prev: {new Date(item.dataPrevisao).toLocaleDateString('pt-BR')}
                      </div>
                    )}
                  </td>
                  <td style={styles.td}><strong>{item.fornecedor?.nomeEmpresa}</strong></td>
                  <td style={styles.td}>{item.produto?.nome}</td>
                  <td style={{...styles.td, textAlign: 'center', fontWeight: 'bold'}}>{item.quantidade}</td>
                  <td style={{...styles.td, color: '#e74c3c', fontWeight: 'bold'}}>R$ {item.custoTotal.toFixed(2).replace('.', ',')}</td>
                  <td style={styles.td}><span style={badgeStatus}>{textoStatus}</span></td>
                  
                  <td style={{...styles.td, textAlign: 'center'}}>
                    {item.status === 'Pendente' ? (
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                        <button onClick={() => marcarComoRecebido(item.id)} style={styles.btnAcao}>📥 Receber</button>
                        <button onClick={() => abrirModalEdicao(item)} style={styles.btnEditar}>✏️ Editar</button>
                        <button onClick={() => apagarPedido(item.id)} style={styles.btnApagar}>🗑️ Excluir</button>
                      </div>
                    ) : (
                      <span style={{ color: '#7f8c8d', fontSize: '12px', fontWeight: 'bold' }}>✓ Concluído</span>
                    )}
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
              <h2 style={{ margin: 0, color: '#2c3e50' }}>{idEdicao ? 'Editar Pedido de Compra' : 'Emitir Pedido de Compra'}</h2>
              <button onClick={() => setModalVisivel(false)} style={styles.btnFechar}>✖</button>
            </div>
            <form onSubmit={salvarPedido} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={styles.label}>Fornecedor Destinatário *</label>
                <select style={styles.input} value={fornecedorId} onChange={e => setFornecedorId(e.target.value)} required>
                  <option value="">Selecione um fornecedor...</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nomeEmpresa}</option>)}
                </select>
              </div>
              <div>
                <label style={styles.label}>Produto / Insumo *</label>
                <select style={styles.input} value={produtoId} onChange={e => setProdutoId(e.target.value)} required>
                  <option value="">Selecione um produto/insumo...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Quantidade a Comprar *</label>
                  <input type="number" style={styles.input} value={quantidade} onChange={e => setQuantidade(e.target.value)} required min="1" placeholder="Ex: 500" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Custo Unitário (R$)</label>
                  <input type="text" style={styles.input} value={custoEstimado} onChange={e => setCustoEstimado(e.target.value)} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label style={styles.label}>Data de Entrega (Previsão)</label>
                <input type="date" style={styles.input} value={previsaoEntrega} onChange={e => setPrevisaoEntrega(e.target.value)} />
              </div>
              <button type="submit" style={styles.btnSalvar}>
                {idEdicao ? 'Salvar Alterações' : 'Gerar Pedido'}
              </button>
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
  tr: { borderBottom: '1px solid #ecf0f1' },
  td: { padding: '15px 20px', color: '#2c3e50', fontSize: '14px', verticalAlign: 'middle' },
  badgeAmarelo: { backgroundColor: '#fef9e7', color: '#f39c12', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeVermelho: { backgroundColor: '#fdedec', color: '#c0392b', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeVerde: { backgroundColor: '#eafaf1', color: '#27ae60', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeCodigo: { backgroundColor: '#f1f2f6', color: '#2c3e50', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #ddd' },
  btnPrincipal: { backgroundColor: '#e67e22', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  btnAcao: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  btnEditar: { backgroundColor: '#f1c40f', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  btnApagar: { backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  btnExcel: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(39, 174, 96, 0.3)' },
  btnPDF: { backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(231, 76, 60, 0.3)' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '500px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
  btnFechar: { background: 'none', border: 'none', fontSize: '20px', color: '#e74c3c', cursor: 'pointer' },
  label: { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box', backgroundColor: '#fafafa' },
  btnSalvar: { backgroundColor: '#e67e22', color: 'white', padding: '15px', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '20px' },
  cardDashboard: { backgroundColor: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '15px' },
  iconDash: { backgroundColor: '#fef5e7', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dashTitle: { margin: '0 0 5px 0', fontSize: '13px', color: '#7f8c8d', fontWeight: 'bold', textTransform: 'uppercase' },
  dashValue: { margin: 0, fontSize: '22px', color: '#2c3e50' }
};