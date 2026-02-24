import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function Produtos() {
  const [produtos, setProdutos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [localizacoes, setLocalizacoes] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]); // NOVO: Estado para fornecedores
  const [carregando, setCarregando] = useState(true);

  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [modalCategoriaVisivel, setModalCategoriaVisivel] = useState(false);
  const [idEdicao, setIdEdicao] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [sku, setSku] = useState('');
  const [tipo, setTipo] = useState('ACABADO');
  const [categoriaId, setCategoriaId] = useState('');
  const [localizacaoId, setLocalizacaoId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [quantidadeInicial, setQuantidadeInicial] = useState('0');
  
  const [precoCusto, setPrecoCusto] = useState('');
  const [precoVenda, setPrecoVenda] = useState('');

  // ==========================================
  // NOVOS CAMPOS: Lote, Endereço e Fornecedor
  // ==========================================
  const [lote, setLote] = useState('');
  const [enderecoLocalizacao, setEnderecoLocalizacao] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');

  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');

  async function carregarDados() {
    setCarregando(true);
    try {
      const [resProd, resCat, resLoc, resForn] = await Promise.all([
        api.get('/produtos'), api.get('/categorias'), api.get('/localizacoes'), api.get('/fornecedores')
      ]);
      
      setProdutos(resProd.data.sort((a: any, b: any) => a.nome.localeCompare(b.nome)));
      setCategorias(resCat.data);
      setLocalizacoes(resLoc.data);
      setFornecedores(resForn.data);
      
      if (resCat.data.length > 0 && !categoriaId) setCategoriaId(resCat.data[0].id);
      if (resLoc.data.length > 0 && !localizacaoId) setLocalizacaoId(resLoc.data[0].id);

      const userSalvo = localStorage.getItem('@Munila:user');
      if (userSalvo) setUsuarioLogado(JSON.parse(userSalvo));

    } catch (error) { alert("Erro ao carregar o catálogo."); } 
    finally { setCarregando(false); }
  }

  useEffect(() => { carregarDados(); }, []);

  const cargoLower = usuarioLogado?.cargo?.toLowerCase() || '';
  const isVendedor = cargoLower.includes('vendedor');
  const isAdmin = cargoLower.includes('admin') || cargoLower.includes('gestor');

  function abrirModalNovo() {
    setIdEdicao(null);
    setNome(''); setSku(''); setTipo('ACABADO'); setDescricao(''); setQuantidadeInicial('0');
    setPrecoCusto(''); setPrecoVenda('');
    setLote(''); setEnderecoLocalizacao(''); setFornecedorId('');
    if (categorias.length > 0) setCategoriaId(categorias[0].id);
    if (localizacoes.length > 0) setLocalizacaoId(localizacoes[0].id);
    setModalVisivel(true);
  }

  function abrirModalEdicao(p: any) {
    setIdEdicao(p.id);
    setNome(p.nome); setSku(p.sku); setTipo(p.tipo || 'ACABADO'); setCategoriaId(p.categoriaId);
    setDescricao(p.descricao || '');
    setPrecoCusto(p.precoCusto ? String(p.precoCusto) : '');
    setPrecoVenda(p.precoVenda ? String(p.precoVenda) : '');
    setLote(p.lote || '');
    setEnderecoLocalizacao(p.enderecoLocalizacao || '');
    setFornecedorId(p.fornecedorId || '');
    setModalVisivel(true);
  }

  async function apagarProduto(id: string) {
    if (window.confirm("Deseja mesmo excluir este produto?")) {
      try {
        await api.delete(`/produtos/${id}`);
        carregarDados();
      } catch (err) { alert("Bloqueado: Este produto possui histórico no armazém."); }
    }
  }

  async function salvarNovaCategoria(e: React.FormEvent) {
    e.preventDefault();
    if (!novaCategoriaNome.trim()) return alert("Digite o nome da categoria.");
    try {
      const res = await api.post('/categorias', { nome: novaCategoriaNome, descricao: "Criada via Desktop" });
      setCategorias([...categorias, res.data]); setCategoriaId(res.data.id);
      setModalCategoriaVisivel(false); setNovaCategoriaNome('');
    } catch (error) { alert("Erro ao criar a categoria."); }
  }

  async function salvarProduto(e: React.FormEvent) {
    e.preventDefault();
    if (!nome || !sku) return alert("Preencha Nome e SKU.");
    if (!categoriaId) return alert("Crie ou selecione uma Categoria.");

    const custoNum = Number(precoCusto.toString().replace(',', '.')) || 0;
    const vendaNum = Number(precoVenda.toString().replace(',', '.')) || 0;

    const payload = { 
      nome, sku, tipo, categoriaId, descricao, 
      precoCusto: custoNum, precoVenda: vendaNum,
      lote, enderecoLocalizacao, 
      fornecedorId: fornecedorId || null // Envia nulo se não selecionar
    };

    try {
      if (idEdicao) {
        await api.put(`/produtos/${idEdicao}`, payload);
      } else {
        const res = await api.post('/produtos', payload);
        await api.post('/estoque', { produtoId: res.data.id, quantidade: Number(quantidadeInicial) || 0, status: 'Disponível', localizacaoId });
      }
      setModalVisivel(false);
      carregarDados();
    } catch (error: any) { alert("Erro: " + (error.response?.data?.error || "Verifique os dados.")); }
  }

  if (carregando) return <div>A carregar catálogo...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Catálogo de Produtos</h1>
        {!isVendedor && <button onClick={abrirModalNovo} style={styles.btnPrincipal}>+ Novo Produto</button>}
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Nome do Produto</th>
              <th style={styles.th}>SKU</th>
              <th style={styles.th}>Endereço</th>
              <th style={styles.th}>Lote</th>
              <th style={styles.th}>Fornecedor</th>
              {!isVendedor && <th style={{...styles.th, textAlign: 'center'}}>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {produtos.length === 0 && <tr><td colSpan={6} style={{textAlign: 'center', padding: '20px', color: '#7f8c8d'}}>Nenhum produto cadastrado.</td></tr>}
            {produtos.map((item) => (
              <tr key={item.id} style={styles.tr}>
                <td style={styles.td}><strong>{item.nome}</strong></td>
                <td style={styles.td}><span style={styles.badgeCinza}>{item.sku}</span></td>
                <td style={styles.td}>{item.enderecoLocalizacao || '-'}</td>
                <td style={styles.td}>{item.lote || '-'}</td>
                <td style={styles.td}>{item.fornecedor?.nomeEmpresa || '-'}</td>
                
                {!isVendedor && (
                  <td style={{...styles.td, textAlign: 'center'}}>
                    <button onClick={() => abrirModalEdicao(item)} style={styles.btnEditar}>Editar</button>
                    {isAdmin && <button onClick={() => apagarProduto(item.id)} style={styles.btnApagar}>Excluir</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalVisivel && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxHeight: '90vh', overflowY: 'auto'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#2c3e50' }}>{idEdicao ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={() => setModalVisivel(false)} style={styles.btnFechar}>✖</button>
            </div>

            <form onSubmit={salvarProduto} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {/* BLOCO: DADOS BÁSICOS */}
              <div style={styles.formGroupTitle}>Dados Essenciais</div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 2 }}>
                  <label style={styles.label}>Nome do Produto *</label>
                  <input type="text" style={styles.input} value={nome} onChange={e => setNome(e.target.value)} required placeholder="Ex: Lupa de Leitura" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>SKU (Código) *</label>
                  <input type="text" style={styles.input} value={sku} onChange={e => setSku(e.target.value)} required placeholder="Ex: MUN-099" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Classificação</label>
                  <select style={styles.input} value={tipo} onChange={e => setTipo(e.target.value)}>
                    <option value="ACABADO">Acabado (Venda)</option>
                    <option value="MATERIA_PRIMA">Matéria Prima</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <label style={{...styles.label, marginBottom: 0}}>Categoria</label>
                    <button type="button" onClick={() => setModalCategoriaVisivel(true)} style={styles.btnLink}>+ Nova</button>
                  </div>
                  <select style={styles.input} value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              </div>

              {/* BLOCO: RASTREABILIDADE */}
              <div style={styles.formGroupTitle}>Logística e Rastreabilidade</div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Endereço Físico (Ex: R-01-P02-C01)</label>
                  <input type="text" style={styles.input} value={enderecoLocalizacao} onChange={e => setEnderecoLocalizacao(e.target.value)} placeholder="Rua - Prateleira - Célula" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Nº do Lote</label>
                  <input type="text" style={styles.input} value={lote} onChange={e => setLote(e.target.value)} placeholder="Ex: L2026B" />
                </div>
              </div>

              <div>
                <label style={styles.label}>Fornecedor de Origem</label>
                <select style={styles.input} value={fornecedorId} onChange={e => setFornecedorId(e.target.value)}>
                  <option value="">(Nenhum / Fabrico Próprio)</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nomeEmpresa}</option>)}
                </select>
              </div>

              {/* BLOCO: FINANCEIRO E INÍCIO */}
              <div style={styles.formGroupTitle}>Financeiro</div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Preço de Custo (R$)</label>
                  <input type="text" style={styles.input} value={precoCusto} onChange={e => setPrecoCusto(e.target.value)} placeholder="0,00" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Preço de Venda (R$)</label>
                  <input type="text" style={styles.input} value={precoVenda} onChange={e => setPrecoVenda(e.target.value)} placeholder="0,00" />
                </div>
              </div>

              {!idEdicao && (
                <div style={{ display: 'flex', gap: '15px', backgroundColor: '#f9fbfb', padding: '15px', borderRadius: '8px', border: '1px solid #ecf0f1', marginTop: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={styles.label}>Qtd. Inicial do Inventário</label>
                    <input type="number" style={styles.input} value={quantidadeInicial} onChange={e => setQuantidadeInicial(e.target.value)} min="0" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={styles.label}>Zona Principal</label>
                    <select style={styles.input} value={localizacaoId} onChange={e => setLocalizacaoId(e.target.value)}>
                      {localizacoes.map(l => <option key={l.id} value={l.id}>{l.zona}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <button type="submit" style={styles.btnSalvar}>Salvar Cadastro</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Categoria (mantido) */}
      {modalCategoriaVisivel && (
        <div style={{...styles.modalOverlay, zIndex: 1100}}>
          <div style={{...styles.modalContent, maxWidth: '400px'}}>
            <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>Nova Categoria</h3>
            <form onSubmit={salvarNovaCategoria} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <input type="text" style={styles.input} value={novaCategoriaNome} onChange={e => setNovaCategoriaNome(e.target.value)} placeholder="Nome da Categoria" autoFocus required />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setModalCategoriaVisivel(false)} style={styles.btnCancelar}>Cancelar</button>
                <button type="submit" style={styles.btnSalvarPequeno}>Criar</button>
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
  tr: { borderBottom: '1px solid #ecf0f1' },
  td: { padding: '15px 20px', color: '#2c3e50', fontSize: '14px', verticalAlign: 'middle' },
  badgeCinza: { backgroundColor: '#f1f2f6', color: '#7f8c8d', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeAmarelo: { backgroundColor: '#fef9e7', color: '#f39c12', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeAzul: { backgroundColor: '#e1f5fe', color: '#0288D1', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  btnPrincipal: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
  btnEditar: { backgroundColor: '#f1f2f6', color: '#f39c12', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', marginRight: '8px' },
  btnApagar: { backgroundColor: '#fef5e7', color: '#e74c3c', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '600px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
  btnFechar: { background: 'none', border: 'none', fontSize: '20px', color: '#e74c3c', cursor: 'pointer' },
  label: { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box', backgroundColor: '#fafafa' },
  btnSalvar: { backgroundColor: '#27ae60', color: 'white', padding: '15px', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' },
  btnLink: { background: 'none', border: 'none', color: '#27ae60', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', padding: 0 },
  btnCancelar: { backgroundColor: '#f1f2f6', color: '#7f8c8d', border: 'none', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  btnSalvarPequeno: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  formGroupTitle: { backgroundColor: '#ecf0f1', padding: '5px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', color: '#7f8c8d', textTransform: 'uppercase', marginTop: '10px' }
};