import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function Estoque() {
  const [inventario, setInventario] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  
  // Níveis de Acesso
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);

  // Filtros
  const [busca, setBusca] = useState('');
  const [categoriaSelecionada, setCategoriaSelecionada] = useState('');

  // Modal de Operação
  const [modalVisivel, setModalVisivel] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState<any>(null);
  const [formTipo, setFormTipo] = useState('Saida_Venda');
  const [formQuantidade, setFormQuantidade] = useState('1');
  const [formCliente, setFormCliente] = useState('');
  const [formObservacao, setFormObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function carregarDados() {
    setCarregando(true);
    try {
      const [resEstoque, resCategorias] = await Promise.all([
        api.get('/estoque'), api.get('/categorias')
      ]);
      
      const apenasDisponiveis = resEstoque.data.filter((item: any) => item.status === 'Disponível');
      setInventario(apenasDisponiveis);
      setCategorias(resCategorias.data);
      
      const userSalvo = localStorage.getItem('@Munila:user');
      if (userSalvo) {
        setUsuarioLogado(JSON.parse(userSalvo));
      }
    } catch (error) {
      alert("Erro ao conectar com o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarDados(); }, []);

  const cargoLower = usuarioLogado?.cargo?.toLowerCase() || '';
  const isVendedor = cargoLower.includes('vendedor');
  const isEstoque = cargoLower.includes('estoqu');
  const isAdmin = !isVendedor && !isEstoque;

  function abrirModal(item: any) {
    setItemSelecionado(item);
    if (isEstoque && !isAdmin) setFormTipo('Entrada');
    else setFormTipo('Saida_Venda');
    setFormQuantidade('1');
    setFormCliente('');
    setFormObservacao('');
    setModalVisivel(true);
  }

  async function registrarMovimentacao(e: React.FormEvent) {
    e.preventDefault();
    if (!itemSelecionado || !usuarioLogado) return;
    
    const qtdNum = Number(formQuantidade);
    if (qtdNum <= 0 || isNaN(qtdNum)) {
      if (formTipo !== 'Ajuste' || qtdNum < 0) return alert("Aviso: Digite uma quantidade válida.");
    }

    if ((formTipo === 'Saida_Venda' || formTipo === 'Saida_Demonstracao') && qtdNum > itemSelecionado.quantidade) {
      return alert(`Aviso: O saldo atual é de apenas ${itemSelecionado.quantidade} unidades.`);
    }

    if (formTipo === 'Saida_Venda' && formCliente.trim() === '') {
      return alert("Aviso: O nome do cliente é obrigatório para vendas.");
    }

    setEnviando(true);
    try {
      let endpoint = '';
      let payload: any = { produtoId: itemSelecionado.produto.id, usuarioId: usuarioLogado.id, observacao: formObservacao };

      if (formTipo === 'Entrada') {
        endpoint = '/movimentacoes/entrada';
        payload.estoqueDestinoId = itemSelecionado.id;
        payload.quantidade = qtdNum;
      } else if (formTipo === 'Ajuste') {
        endpoint = '/movimentacoes/ajuste';
        payload.estoqueId = itemSelecionado.id;
        payload.novaQuantidade = qtdNum;
      } else if (formTipo === 'Saida_Venda') {
        endpoint = '/movimentacoes/saida-venda';
        payload.estoqueOrigemId = itemSelecionado.id;
        payload.quantidade = qtdNum;
        payload.cliente = formCliente;
      } else if (formTipo === 'Saida_Demonstracao') {
        endpoint = '/movimentacoes/saida-demonstracao';
        payload.estoqueOrigemId = itemSelecionado.id;
        payload.quantidade = qtdNum;
        payload.dataPrevistaRetorno = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }

      await api.post(endpoint, payload);
      alert("Operação registada com sucesso!");
      setModalVisivel(false);
      carregarDados();
    } catch (error) { alert("Erro ao registar a operação."); } 
    finally { setEnviando(false); }
  }

  // Filtragem e Ordenação Alfabética
  let inventarioFiltrado = inventario.filter(item => 
    item.produto.nome.toLowerCase().includes(busca.toLowerCase()) ||
    item.produto.sku.toLowerCase().includes(busca.toLowerCase())
  );

  if (categoriaSelecionada) {
    inventarioFiltrado = inventarioFiltrado.filter(item => item.produto.categoriaId === categoriaSelecionada);
  }

  inventarioFiltrado.sort((a, b) => a.produto.nome.localeCompare(b.produto.nome));

  if (carregando) return <div>Atualizando armazém...</div>;

  return (
    <div>
      <h1 style={{ color: '#2c3e50', marginTop: 0, marginBottom: '20px' }}>Gestão de Armazém</h1>

      {/* BARRA DE FERRAMENTAS (Filtros) */}
      <div style={styles.toolbar}>
        <input 
          type="text" 
          placeholder="Buscar por nome ou SKU..." 
          style={styles.inputBusca} 
          value={busca} 
          onChange={(e) => setBusca(e.target.value)} 
        />
        <select 
          style={styles.selectCategoria} 
          value={categoriaSelecionada} 
          onChange={(e) => setCategoriaSelecionada(e.target.value)}
        >
          <option value="">Todas as Categorias</option>
          {categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}
        </select>
      </div>

      {/* TABELA DE DADOS */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Produto</th>
              <th style={styles.th}>SKU</th>
              <th style={styles.th}>Categoria</th>
              <th style={styles.th}>Tipo</th>
              <th style={{...styles.th, textAlign: 'center'}}>Saldo</th>
              <th style={{...styles.th, textAlign: 'center'}}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {inventarioFiltrado.length === 0 && (
              <tr><td colSpan={6} style={{textAlign: 'center', padding: '20px', color: '#7f8c8d'}}>Nenhum produto encontrado.</td></tr>
            )}
            {inventarioFiltrado.map((item) => {
              const ehCritico = item.quantidade < 10;
              return (
                <tr key={item.id} style={styles.tr}>
                  <td style={styles.td}><strong>{item.produto.nome}</strong></td>
                  <td style={styles.td}><span style={styles.badgeCinza}>{item.produto.sku}</span></td>
                  <td style={styles.td}>{item.produto.categoria?.nome}</td>
                  <td style={styles.td}>
                    <span style={item.produto.tipo === 'MATERIA_PRIMA' ? styles.badgeAzul : styles.badgeAmarelo}>
                      {item.produto.tipo === 'MATERIA_PRIMA' ? 'M. Prima' : 'Acabado'}
                    </span>
                  </td>
                  <td style={{...styles.td, textAlign: 'center'}}>
                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: ehCritico ? '#e74c3c' : '#27ae60' }}>
                      {item.quantidade}
                    </span>
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

      {/* MODAL WEB DE OPERAÇÕES */}
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
                <label style={styles.label}>Tipo de Operação</label>
                <select style={styles.input} value={formTipo} onChange={(e) => setFormTipo(e.target.value)}>
                  {(isAdmin || isEstoque) && <option value="Entrada">Entrada de Mercadoria</option>}
                  {(isAdmin || isVendedor) && <option value="Saida_Venda">Saída P/ Venda</option>}
                  {(isAdmin || isVendedor) && <option value="Saida_Demonstracao">Saída P/ Demonstração</option>}
                  {(isAdmin || isEstoque) && <option value="Ajuste">Ajuste Manual de Inventário</option>}
                </select>
              </div>

              {formTipo === 'Saida_Venda' && (
                <div>
                  <label style={styles.label}>Cliente / Destino</label>
                  <input type="text" style={styles.input} value={formCliente} onChange={e => setFormCliente(e.target.value)} placeholder="Ex: Farmácia Central" required />
                </div>
              )}

              <div>
                <label style={styles.label}>{formTipo === 'Ajuste' ? 'Novo Saldo Final (Total)' : 'Quantidade'}</label>
                <input type="number" style={styles.input} value={formQuantidade} onChange={e => setFormQuantidade(e.target.value)} required min={formTipo === 'Ajuste' ? 0 : 1} />
              </div>

              <div>
                <label style={styles.label}>Observação (Opcional)</label>
                <input type="text" style={styles.input} value={formObservacao} onChange={e => setFormObservacao(e.target.value)} placeholder="Motivo ou nota adicional..." />
              </div>

              <button type="submit" style={formTipo === 'Ajuste' ? styles.btnAlerta : styles.btnConfirmar} disabled={enviando}>
                {enviando ? 'Processando...' : (formTipo === 'Entrada' ? 'Confirmar Entrada' : formTipo === 'Ajuste' ? 'Aplicar Ajuste' : 'Confirmar Saída')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ESTILOS WEB
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
  badgeAmarelo: { backgroundColor: '#fef9e7', color: '#f39c12', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeAzul: { backgroundColor: '#e1f5fe', color: '#0288D1', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  
  btnAcao: { backgroundColor: '#0288D1', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '500px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
  btnFechar: { background: 'none', border: 'none', fontSize: '20px', color: '#e74c3c', cursor: 'pointer' },
  label: { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box' },
  btnConfirmar: { backgroundColor: '#0288D1', color: 'white', padding: '15px', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' },
  btnAlerta: { backgroundColor: '#f39c12', color: 'white', padding: '15px', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }
};