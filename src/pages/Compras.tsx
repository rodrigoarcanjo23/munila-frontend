import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function Compras() {
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [pedidos, setPedidos] = useState<any[]>([]); 
  const [carregando, setCarregando] = useState(true);

  // Essencial para enviar a assinatura da Auditoria!
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);

  const [modalVisivel, setModalVisivel] = useState(false);

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
      } catch (e) { console.error("Erro ao carregar fornecedores"); }

      try {
        const resProdutos = await api.get('/produtos');
        const materiasPrimas = resProdutos.data.filter((p: any) => p.tipo === 'MATERIA_PRIMA');
        setProdutos(materiasPrimas.length > 0 ? materiasPrimas : resProdutos.data);
      } catch (e) { console.error("Erro ao carregar produtos"); }

      try {
        const resPedidos = await api.get('/pedidos-compra');
        setPedidos(resPedidos.data);
      } catch (e) { console.error("Erro ao carregar pedidos"); }

    } finally { 
      setCarregando(false); 
    }
  }

  useEffect(() => { carregarDados(); }, []);

  function abrirModalNovo() {
    setFornecedorId(''); setProdutoId(''); setQuantidade(''); setCustoEstimado(''); setPrevisaoEntrega('');
    setModalVisivel(true);
  }

  async function salvarPedido(e: React.FormEvent) {
    e.preventDefault();
    if (!fornecedorId || !produtoId || !quantidade) {
      return alert("Por favor, selecione o Fornecedor, o Produto e a Quantidade.");
    }

    const custoTotal = Number(quantidade) * Number(custoEstimado.replace(',', '.') || 0);

    try {
      await api.post('/pedidos-compra', {
        fornecedorId,
        produtoId,
        quantidade,
        custoTotal,
        dataPrevisao: previsaoEntrega ? previsaoEntrega + "T00:00:00.000Z" : undefined 
      });
      setModalVisivel(false);
      carregarDados();
      alert("Pedido de Compra emitido e guardado com sucesso!");
    } catch (error: any) { 
      const erroReal = error.response?.data?.error || error.message;
      alert(`Erro do Servidor: ${erroReal}\n\nVerifique se o Back-end foi reiniciado.`); 
    }
  }

  async function marcarComoRecebido(id: string) {
    if (!usuarioLogado) return alert("Erro de segurança: A sua sessão expirou.");

    if (window.confirm("Confirmar a receção? O estoque do Armazém vai ser atualizado automaticamente!")) {
      try {
        await api.put(`/pedidos-compra/${id}/receber`, {
          usuarioId: usuarioLogado.id // Passa quem recebeu a mercadoria para gravar no histórico
        });
        
        carregarDados();
        alert("Mercadoria recebida e estoque atualizado com sucesso!");
      } catch (error: any) { 
        const erroReal = error.response?.data?.error || error.message;
        alert(`Erro ao receber mercadoria: ${erroReal}`); 
      }
    }
  }

  if (carregando) return <div>Sincronizando Módulo de Compras...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Pedidos de Compra</h1>
        <button onClick={abrirModalNovo} style={styles.btnPrincipal}>+ Emitir Pedido</button>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
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
              <tr><td colSpan={7} style={{textAlign: 'center', padding: '30px', color: '#7f8c8d'}}>Ainda não efetuou nenhum pedido.</td></tr>
            )}
            {pedidos.map((item) => (
              <tr key={item.id} style={styles.tr}>
                <td style={styles.td}>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</td>
                <td style={styles.td}><strong>{item.fornecedor?.nomeEmpresa}</strong></td>
                <td style={styles.td}>{item.produto?.nome}</td>
                <td style={{...styles.td, textAlign: 'center', fontWeight: 'bold'}}>{item.quantidade}</td>
                <td style={{...styles.td, color: '#e74c3c', fontWeight: 'bold'}}>R$ {item.custoTotal.toFixed(2).replace('.', ',')}</td>
                <td style={styles.td}>
                  <span style={item.status === 'Pendente' ? styles.badgeAmarelo : styles.badgeVerde}>{item.status}</span>
                </td>
                <td style={{...styles.td, textAlign: 'center'}}>
                  {item.status === 'Pendente' ? (
                    <button onClick={() => marcarComoRecebido(item.id)} style={styles.btnAcao}>Receber Mercadoria</button>
                  ) : (
                    <span style={{ color: '#7f8c8d', fontSize: '12px', fontWeight: 'bold' }}>✓ Concluído</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalVisivel && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#2c3e50' }}>Emitir Pedido de Compra</h2>
              <button onClick={() => setModalVisivel(false)} style={styles.btnFechar}>✖</button>
            </div>

            <form onSubmit={salvarPedido} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={styles.label}>Fornecedor Destinatário *</label>
                <select style={styles.input} value={fornecedorId} onChange={e => setFornecedorId(e.target.value)} required>
                  <option value="">Selecione um fornecedor...</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nomeEmpresa}</option>)}
                </select>
                {fornecedores.length === 0 && <span style={{fontSize: '11px', color: '#e74c3c'}}>*Cadastre um fornecedor no menu lateral primeiro.</span>}
              </div>

              <div>
                <label style={styles.label}>Produto / Insumo *</label>
                <select style={styles.input} value={produtoId} onChange={e => setProdutoId(e.target.value)} required>
                  <option value="">Selecione um produto/insumo...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                {produtos.length === 0 && <span style={{fontSize: '11px', color: '#e74c3c'}}>*Nenhum produto cadastrado no catálogo.</span>}
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

              <button type="submit" style={styles.btnSalvar}>Gerar Pedido</button>
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
  badgeVerde: { backgroundColor: '#eafaf1', color: '#27ae60', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  btnPrincipal: { backgroundColor: '#e67e22', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
  btnAcao: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '500px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
  btnFechar: { background: 'none', border: 'none', fontSize: '20px', color: '#e74c3c', cursor: 'pointer' },
  label: { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box', backgroundColor: '#fafafa' },
  btnSalvar: { backgroundColor: '#e67e22', color: 'white', padding: '15px', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '20px' }
};