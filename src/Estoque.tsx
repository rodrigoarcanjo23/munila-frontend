import { useEffect, useState } from 'react';
import { api } from './api';

interface Produto { id: string; nome: string; sku: string; tipo: string; }
interface Localizacao { zona: string; prateleira: string; }
interface Responsavel { nome: string; }
interface EstoqueItem { id: string; quantidade: number; status: string; produto: Produto; localizacao?: Localizacao; responsavel?: Responsavel; }
interface Usuario { id: string; nome: string; }

export function Estoque() {
  const [inventario, setInventario] = useState<EstoqueItem[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');

  const [modalAberto, setModalAberto] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState<EstoqueItem | null>(null);
  
  const [formTipo, setFormTipo] = useState('Saida_Demonstracao');
  const [formUsuarioId, setFormUsuarioId] = useState('');
  const [formQuantidade, setFormQuantidade] = useState(1);
  const [formObservacao, setFormObservacao] = useState('');
  const [formCliente, setFormCliente] = useState('');

  const LIMITE_CRITICO = 10;

  async function carregarDados() {
    setCarregando(true);
    try {
      const [resEstoque, resUsuarios] = await Promise.all([
        api.get('/estoque'),
        api.get('/usuarios')
      ]);
      setInventario(resEstoque.data);
      setUsuarios(resUsuarios.data);
      if (resUsuarios.data.length > 0) setFormUsuarioId(resUsuarios.data[0].id);
    } catch (error) { 
      console.error("Erro ao carregar dados", error); 
    } finally { 
      setCarregando(false); 
    }
  }

  useEffect(() => { carregarDados(); }, []);

  const inventarioFiltrado = inventario.filter(item => 
    item.produto.nome.toLowerCase().includes(busca.toLowerCase()) ||
    item.produto.sku.toLowerCase().includes(busca.toLowerCase())
  );

  function abrirModal(item: EstoqueItem) {
    setItemSelecionado(item);
    setFormTipo(item.produto.tipo === 'MATERIA_PRIMA' ? 'Entrada_Estoque' : 'Saida_Venda');
    setFormQuantidade(1);
    setFormCliente('');
    setFormObservacao('');
    setModalAberto(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemSelecionado) return;

    try {
      let endpoint = '';
      
      // Corrigido o tipo do payload
      let payload: Record<string, string | number | undefined> = { 
        produtoId: itemSelecionado.produto.id, 
        usuarioId: formUsuarioId, 
        observacao: formObservacao 
      };

      if (formTipo === 'Saida_Venda') {
        endpoint = '/movimentacoes/saida-venda';
        payload = { ...payload, estoqueOrigemId: itemSelecionado.id, quantidade: formQuantidade, cliente: formCliente };
      } else if (formTipo === 'Saida_Demonstracao') {
        endpoint = '/movimentacoes/saida-demonstracao';
        payload = { ...payload, estoqueOrigemId: itemSelecionado.id, quantidade: formQuantidade, dataPrevistaRetorno: new Date().toISOString() };
      } else if (formTipo === 'Entrada_Estoque') {
        endpoint = '/movimentacoes/entrada';
        payload = { ...payload, estoqueDestinoId: itemSelecionado.id, quantidade: formQuantidade };
      } else if (formTipo === 'Ajuste_Estoque') {
        endpoint = '/movimentacoes/ajuste';
        payload = { ...payload, estoqueId: itemSelecionado.id, novaQuantidade: formQuantidade };
      }

      await api.post(endpoint, payload);
      alert("✅ Movimentação registrada!");
      setModalAberto(false);
      carregarDados();
    } catch (err) { 
      console.error(err); 
      alert("Erro na operação"); 
    }
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ color: '#2c3e50', margin: 0 }}>📦 Estoque Munila & VIAPRO</h1>
          <p style={{ color: '#7f8c8d' }}>Gestão Industrial com Alertas Críticos</p>
        </div>
        <div style={{ textAlign: 'right' }}>
           <input 
            type="text" 
            placeholder="🔍 Buscar SKU ou Nome..." 
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ padding: '10px', width: '300px', borderRadius: '8px', border: '1px solid #ddd' }}
          />
        </div>
      </header>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        <div style={{ flex: 1, backgroundColor: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', borderLeft: '5px solid #e74c3c' }}>
          <span style={{ fontSize: '12px', color: '#7f8c8d', fontWeight: 'bold' }}>PRODUTOS EM NÍVEL CRÍTICO</span>
          <h2 style={{ margin: '5px 0', color: '#e74c3c' }}>
            {inventario.filter(i => i.quantidade < LIMITE_CRITICO && i.status === 'Disponível').length}
          </h2>
        </div>
        <div style={{ flex: 1, backgroundColor: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', borderLeft: '5px solid #27ae60' }}>
          <span style={{ fontSize: '12px', color: '#7f8c8d', fontWeight: 'bold' }}>TOTAL DE ITENS NO ARMAZÉM</span>
          <h2 style={{ margin: '5px 0', color: '#2c3e50' }}>
            {inventario.reduce((acc, curr) => acc + (curr.status === 'Disponível' ? curr.quantidade : 0), 0)}
          </h2>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '15px' }}>Tipo</th>
              <th style={{ padding: '15px' }}>Produto</th>
              <th style={{ padding: '15px', textAlign: 'center' }}>Saldo</th>
              <th style={{ padding: '15px' }}>Local / Responsável</th>
              <th style={{ padding: '15px', textAlign: 'right' }}>Gerenciar</th>
            </tr>
          </thead>
          <tbody>
            {inventarioFiltrado.map(item => {
              const ehCritico = item.quantidade < LIMITE_CRITICO && item.status === 'Disponível';
              
              return (
                <tr key={item.id} style={{ 
                  borderTop: '1px solid #eee',
                  backgroundColor: ehCritico ? '#fff5f5' : 'transparent' 
                }}>
                  <td style={{ padding: '15px' }}>
                    <span style={{ 
                      fontSize: '10px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '4px',
                      backgroundColor: item.produto.tipo === 'MATERIA_PRIMA' ? '#e8f4fd' : '#fef9e7',
                      color: item.produto.tipo === 'MATERIA_PRIMA' ? '#2980b9' : '#f39c12'
                    }}>
                      {item.produto.tipo === 'MATERIA_PRIMA' ? 'M. PRIMA' : 'ACABADO'}
                    </span>
                  </td>
                  <td style={{ padding: '15px' }}>
                    <strong>{item.produto.nome}</strong> 
                    {ehCritico && (
                      <span style={{ marginLeft: '10px', fontSize: '10px', backgroundColor: '#e74c3c', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                        ESTOQUE BAIXO
                      </span>
                    )}
                    <br />
                    <small style={{ color: '#888' }}>{item.produto.sku}</small>
                  </td>
                  <td style={{ 
                    padding: '15px', 
                    textAlign: 'center', 
                    fontSize: '18px', 
                    fontWeight: 'bold',
                    color: ehCritico ? '#e74c3c' : '#2980b9'
                  }}>
                    {item.quantidade}
                  </td>
                  <td style={{ padding: '15px' }}>
                    {item.status === 'Disponível' ? item.localizacao?.zona : item.responsavel?.nome}
                  </td>
                  <td style={{ padding: '15px', textAlign: 'right' }}>
                    <button onClick={() => abrirModal(item)} style={{ padding: '8px 15px', borderRadius: '5px', border: 'none', backgroundColor: ehCritico ? '#e74c3c' : '#2c3e50', color: 'white', cursor: 'pointer' }}>
                      Gerenciar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalAberto && itemSelecionado && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '450px' }}>
            <h3 style={{ marginTop: 0 }}>{itemSelecionado.produto.nome}</h3>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <label>Operação:
                <select value={formTipo} onChange={(e) => setFormTipo(e.target.value)} style={{ width: '100%', padding: '8px' }}>
                  <option value="Entrada_Estoque">📥 Entrada (Recebimento/Produção)</option>
                  <option value="Saida_Venda">💸 Saída p/ Venda</option>
                  <option value="Saida_Demonstracao">🤝 Saída p/ Demonstração</option>
                  <option value="Ajuste_Estoque">🔧 Ajuste Manual (Inventário)</option>
                </select>
              </label>
              
              {formTipo === 'Saida_Venda' && (
                <label>Cliente / Destino:
                  <input type="text" required value={formCliente} onChange={(e) => setFormCliente(e.target.value)} style={{ width: '100%', padding: '8px' }} />
                </label>
              )}
              
              <label>Responsável:
                <select value={formUsuarioId} onChange={(e) => setFormUsuarioId(e.target.value)} style={{ width: '100%', padding: '8px' }}>
                  {usuarios.map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </label>

              <label>Quantidade:
                <input type="number" required min="1" value={formQuantidade} onChange={(e) => setFormQuantidade(Number(e.target.value))} style={{ width: '100%', padding: '8px' }} />
              </label>
              
              <label>Observação:
                <textarea value={formObservacao} onChange={(e) => setFormObservacao(e.target.value)} style={{ width: '100%', padding: '8px' }} />
              </label>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setModalAberto(false)} style={{ flex: 1, padding: '10px' }}>Cancelar</button>
                <button type="submit" style={{ flex: 1, padding: '10px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px' }}>Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}