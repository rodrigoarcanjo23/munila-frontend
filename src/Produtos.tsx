import { useEffect, useState } from 'react';
import { api } from './api';

interface Produto { id: string; nome: string; sku: string; tipo: string; categoriaId: string; categoria: { nome: string } }
interface Categoria { id: string; nome: string; }
interface Localizacao { id: string; zona: string; }

export function Produtos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [localizacoes, setLocalizacoes] = useState<Localizacao[]>([]);
  
  const [modalAberto, setModalAberto] = useState(false);
  const [idEdicao, setIdEdicao] = useState<string | null>(null);

  // Estados do formulário
  const [nome, setNome] = useState('');
  const [sku, setSku] = useState('');
  const [tipo, setTipo] = useState('ACABADO');
  const [categoriaId, setCategoriaId] = useState('');
  const [localizacaoId, setLocalizacaoId] = useState('');

  async function carregarDados() {
    try {
      const [resProd, resCat, resLoc] = await Promise.all([
        api.get('/produtos'),
        api.get('/categorias'),
        api.get('/localizacoes')
      ]);
      setProdutos(resProd.data);
      setCategorias(resCat.data);
      setLocalizacoes(resLoc.data);
      
      if (resCat.data.length > 0 && !categoriaId) setCategoriaId(resCat.data[0].id);
      if (resLoc.data.length > 0 && !localizacaoId) setLocalizacaoId(resLoc.data[0].id);
    } catch (error) { console.error("Erro ao carregar dados", error); }
  }

  useEffect(() => { carregarDados(); }, []);

  function abrirModalNovo() {
    setIdEdicao(null);
    setNome(''); setSku(''); setTipo('ACABADO'); 
    if (categorias.length > 0) setCategoriaId(categorias[0].id);
    setModalAberto(true);
  }

  function abrirModalEdicao(p: Produto) {
    setIdEdicao(p.id);
    setNome(p.nome); setSku(p.sku); setTipo(p.tipo); setCategoriaId(p.categoriaId);
    setModalAberto(true);
  }

  async function handleDelete(id: string) {
    if (confirm("Tem certeza que deseja excluir este produto?")) {
      try {
        await api.delete(`/produtos/${id}`);
        alert("✅ Produto excluído!");
        carregarDados();
      } catch (error: any) {
        alert(error.response?.data?.error || "Erro ao excluir produto.");
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (idEdicao) {
        // Editando
        await api.put(`/produtos/${idEdicao}`, { nome, sku, tipo, categoriaId });
        alert("✅ Produto atualizado!");
      } else {
        // Criando Novo e iniciando o estoque
        const resProduto = await api.post('/produtos', { 
          nome, sku, tipo, categoriaId, descricao: "Produto cadastrado via painel" 
        });
        await api.post('/estoque', {
          produtoId: resProduto.data.id,
          quantidade: 0,
          status: 'Disponível',
          localizacaoId: localizacaoId
        });
        alert("✅ Produto criado com saldo 0!");
      }

      setModalAberto(false);
      carregarDados();
    } catch (error) {
      alert("Erro ao salvar. Verifique se o SKU já não existe.");
    }
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ color: '#2c3e50', margin: 0 }}>🏷️ Catálogo de Produtos</h1>
          <p style={{ color: '#7f8c8d' }}>Gestão de Matérias-Primas e Produtos Acabados</p>
        </div>
        <button onClick={abrirModalNovo} style={{ backgroundColor: '#2980b9', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          + Novo Produto
        </button>
      </header>

      <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee' }}>
              <th style={{ padding: '15px' }}>SKU</th>
              <th style={{ padding: '15px' }}>Nome do Produto</th>
              <th style={{ padding: '15px' }}>Tipo</th>
              <th style={{ padding: '15px' }}>Categoria</th>
              <th style={{ padding: '15px', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '15px', color: '#7f8c8d', fontSize: '14px' }}>{p.sku}</td>
                <td style={{ padding: '15px', fontWeight: 'bold', color: '#2c3e50' }}>{p.nome}</td>
                <td style={{ padding: '15px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '4px', backgroundColor: p.tipo === 'MATERIA_PRIMA' ? '#e8f4fd' : '#fef9e7', color: p.tipo === 'MATERIA_PRIMA' ? '#2980b9' : '#f39c12' }}>
                    {p.tipo === 'MATERIA_PRIMA' ? 'M. PRIMA' : 'ACABADO'}
                  </span>
                </td>
                <td style={{ padding: '15px', color: '#7f8c8d' }}>{p.categoria?.nome}</td>
                <td style={{ padding: '15px', textAlign: 'right' }}>
                  <button onClick={() => abrirModalEdicao(p)} style={{ backgroundColor: '#f1c40f', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', marginRight: '5px', fontWeight: 'bold' }}>✏️</button>
                  <button onClick={() => handleDelete(p.id)} style={{ backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '450px' }}>
            <h2 style={{ marginTop: 0 }}>{idEdicao ? 'Editar Produto' : 'Cadastrar Produto'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Nome do Produto</label>
              <input type="text" required value={nome} onChange={e => setNome(e.target.value)} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }} />
              
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Código SKU</label>
              <input type="text" required value={sku} onChange={e => setSku(e.target.value)} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }} />
              
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Tipo:</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}>
                <option value="ACABADO">Produto Acabado (Venda)</option>
                <option value="MATERIA_PRIMA">Matéria-Prima (Indústria/VIAPRO)</option>
              </select>

              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Categoria:</label>
              <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>

              {/* Só pede local de armazém se for um produto novo para iniciar o estoque */}
              {!idEdicao && (
                <>
                  <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Armazenamento Inicial:</label>
                  <select value={localizacaoId} onChange={e => setLocalizacaoId(e.target.value)} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}>
                    {localizacoes.map(l => <option key={l.id} value={l.id}>{l.zona}</option>)}
                  </select>
                </>
              )}
              
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setModalAberto(false)} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '5px' }}>Cancelar</button>
                <button type="submit" style={{ flex: 1, padding: '10px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>{idEdicao ? 'Atualizar' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}