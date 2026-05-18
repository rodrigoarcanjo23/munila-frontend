import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { toast } from 'react-toastify';
import { IoPencilSharp, IoTrashSharp, IoAddOutline, IoCloseCircle, IoDownloadOutline, IoDocumentTextOutline } from 'react-icons/io5';

// ✨ IMPORTAÇÕES PARA EXPORTAÇÃO ✨
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Produtos() {
  const [produtos, setProdutos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [localizacoes, setLocalizacoes] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [termoBusca, setTermoBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');

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
  const [estoqueMinimo, setEstoqueMinimo] = useState('10'); 
  const [precoCusto, setPrecoCusto] = useState('');
  const [precoVenda, setPrecoVenda] = useState('');
  const [lote, setLote] = useState('');
  const [enderecoLocalizacao, setEnderecoLocalizacao] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [dataCadastro, setDataCadastro] = useState('');
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');

  const [ingredientesLista, setIngredientesLista] = useState<{produtoFilhoId: string, nome: string, quantidade: number}[]>([]);
  const [ingredienteSelecionado, setIngredienteSelecionado] = useState('');
  const [ingredienteQtd, setIngredienteQtd] = useState('1');

  const formatarDataBR = (dataString: string) => {
    if (!dataString) return '-';
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR');
  };

  const renderProcedencia = (tipoBanco: string) => {
    if (tipoBanco === 'MATERIA_PRIMA') return <span style={styles.badgeImportado}>Importado</span>;
    return <span style={styles.badgeNacional}>Nacional</span>;
  };

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
    } catch (error) { toast.error("Erro ao carregar o catálogo de produtos."); } 
    finally { setCarregando(false); }
  }

  useEffect(() => { carregarDados(); }, []);

  const cargoLower = usuarioLogado?.cargo?.toLowerCase() || '';
  const isVendedor = cargoLower.includes('vendedor');
  const isAdmin = cargoLower.includes('admin') || cargoLower.includes('gestor');

  const produtosFiltrados = useMemo(() => {
    return produtos.filter(p => {
      const passaCategoria = filtroCategoria === '' || p.categoriaId === filtroCategoria;
      const termo = termoBusca.toLowerCase();
      const passaBusca = p.nome.toLowerCase().includes(termo) || p.sku.toLowerCase().includes(termo) || (p.lote && p.lote.toLowerCase().includes(termo)) || (p.enderecoLocalizacao && p.enderecoLocalizacao.toLowerCase().includes(termo));
      return passaCategoria && passaBusca;
    });
  }, [produtos, termoBusca, filtroCategoria]);

  const materiasPrimas = produtos.filter(p => p.tipo === 'MATERIA_PRIMA');

  // ==========================================
  // ✨ FUNÇÕES DE EXPORTAÇÃO DO CATÁLOGO ✨
  // ==========================================

  const exportarExcel = () => {
    if (produtosFiltrados.length === 0) {
      return toast.warn("Não há produtos para exportar.");
    }

    const dadosPlanilha = produtosFiltrados.map((item) => ({
      'Nome do Produto': item.nome,
      'SKU': item.sku,
      'Procedência': item.tipo === 'MATERIA_PRIMA' ? 'Importado' : 'Nacional',
      'Categoria': item.categoria?.nome || '-',
      'Endereço Físico': item.enderecoLocalizacao || '-',
      'Data de Cadastro': formatarDataBR(item.dataCadastro),
      'Fornecedor': item.fornecedor?.nomeEmpresa || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dadosPlanilha);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Catálogo");
    
    const dataHj = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Catalogo_ViaPro_${dataHj}.xlsx`);
    toast.success("Excel exportado com sucesso!");
  };

  const exportarPDF = () => {
    if (produtosFiltrados.length === 0) {
      return toast.warn("Não há produtos para exportar.");
    }

    try {
      const doc = new jsPDF('landscape'); // Orientação paisagem pois tem mais colunas
      
      doc.setFontSize(18);
      doc.text("Catálogo de Produtos - ViaPro", 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 28);

      const tableColumn = ["Produto", "SKU", "Procedência", "Categoria", "Endereço", "Data Cad.", "Fornecedor"];
      const tableRows: any[] = [];

      produtosFiltrados.forEach(item => {
        const rowData = [
          item.nome,
          item.sku,
          item.tipo === 'MATERIA_PRIMA' ? 'Importado' : 'Nacional',
          item.categoria?.nome || '-',
          item.enderecoLocalizacao || '-',
          formatarDataBR(item.dataCadastro),
          item.fornecedor?.nomeEmpresa || '-'
        ];
        tableRows.push(rowData);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 35,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] }
      });

      const dataHj = new Date().toISOString().split('T')[0];
      doc.save(`Catalogo_ViaPro_${dataHj}.pdf`);
      toast.success("PDF exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro interno ao gerar o arquivo PDF.");
    }
  };

  // ==========================================
  // MODAIS E SALVAMENTOS
  // ==========================================

  function abrirModalNovo() {
    setIdEdicao(null);
    setNome(''); setSku(''); setTipo('ACABADO'); setDescricao(''); setQuantidadeInicial('0');
    setPrecoCusto(''); setPrecoVenda(''); setEstoqueMinimo('10');
    setLote(''); setEnderecoLocalizacao(''); setFornecedorId('');
    setDataCadastro(new Date().toISOString().substring(0, 10));
    setIngredientesLista([]); 
    if (categorias.length > 0) setCategoriaId(categorias[0].id);
    if (localizacoes.length > 0) setLocalizacaoId(localizacoes[0].id);
    setModalVisivel(true);
  }

  function abrirModalEdicao(p: any) {
    setIdEdicao(p.id);
    setNome(p.nome); setSku(p.sku); setTipo(p.tipo || 'ACABADO'); setCategoriaId(p.categoriaId);
    let descReal = p.descricao || '';
    let min = '10';
    const match = descReal.match(/\[MIN:(\d+)\]/);
    if (match) { min = match[1]; descReal = descReal.replace(match[0], '').trim(); }
    setDescricao(descReal); setEstoqueMinimo(min);
    setPrecoCusto(p.precoCusto ? String(p.precoCusto) : ''); setPrecoVenda(p.precoVenda ? String(p.precoVenda) : '');
    setLote(p.lote || ''); setEnderecoLocalizacao(p.enderecoLocalizacao || ''); setFornecedorId(p.fornecedorId || '');
    setDataCadastro(p.dataCadastro ? new Date(p.dataCadastro).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10));
    setIngredientesLista([]); 
    setModalVisivel(true);
  }

  async function apagarProduto(id: string) {
    const motivo = window.prompt("⚠️ AÇÃO AUDITÁVEL ⚠️\nPara excluir este produto, digite o motivo:");
    if (motivo === null) return; 
    if (motivo.trim() === '') return toast.warn("O motivo é obrigatório.");
    try {
      await api.delete(`/produtos/${id}`, { data: { motivo: motivo, usuarioId: usuarioLogado?.id } });
      toast.success("Produto e histórico excluídos com sucesso!"); carregarDados();
    } catch (err: any) { toast.error("Erro ao excluir: " + (err.response?.data?.error || "Falha na comunicação.")); }
  }

  function adicionarIngrediente() {
    if (!ingredienteSelecionado) return toast.warn("Selecione um item importado (matéria-prima).");
    if (Number(ingredienteQtd) <= 0) return toast.warn("A quantidade deve ser maior que zero.");
    
    const mat = materiasPrimas.find(m => m.id === ingredienteSelecionado);
    if (!mat) return;

    if (ingredientesLista.find(i => i.produtoFilhoId === mat.id)) {
      return toast.warn("Este item já está na receita!");
    }

    setIngredientesLista([...ingredientesLista, { produtoFilhoId: mat.id, nome: mat.nome, quantidade: Number(ingredienteQtd) }]);
    setIngredienteSelecionado('');
    setIngredienteQtd('1');
  }

  function removerIngrediente(id: string) {
    setIngredientesLista(ingredientesLista.filter(i => i.produtoFilhoId !== id));
  }

  async function salvarProduto(e: React.FormEvent) {
    e.preventDefault();
    if (!nome || !sku) return toast.warn("Preencha o Nome e o SKU do produto."); 
    if (!categoriaId) return toast.warn("Crie ou selecione uma Categoria."); 

    const custoNum = Number(precoCusto.toString().replace(',', '.')) || 0;
    const vendaNum = Number(precoVenda.toString().replace(',', '.')) || 0;
    const minNum = Number(estoqueMinimo) || 10;
    const descricaoComTag = `${descricao.trim()} [MIN:${minNum}]`.trim();

    const payload = { 
      nome, sku, tipo, categoriaId, descricao: descricaoComTag, 
      precoCusto: custoNum, precoVenda: vendaNum,
      lote, enderecoLocalizacao, 
      fornecedorId: fornecedorId || null, dataCadastro,
      ingredientes: tipo === 'ACABADO' ? ingredientesLista : [] 
    };

    try {
      if (idEdicao) {
        await api.put(`/produtos/${idEdicao}`, payload);
        toast.success("Produto atualizado com sucesso!"); 
      } else {
        const res = await api.post('/produtos', payload);
        await api.post('/estoque', { produtoId: res.data.id, quantidade: Number(quantidadeInicial) || 0, status: 'Disponível', localizacaoId });
        toast.success("Novo produto registado no catálogo!"); 
      }
      setModalVisivel(false);
      carregarDados();
    } catch (error: any) { 
      toast.error("Erro: " + (error.response?.data?.error || "Verifique os dados preenchidos.")); 
    }
  }

  if (carregando) return <div>A carregar catálogo...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Catálogo de Produtos</h1>
        
        {/* ✨ BOTÕES DE AÇÃO ALINHADOS NO TOPO ✨ */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={exportarExcel} style={{ ...styles.btnPrincipal, backgroundColor: '#27ae60' }}>
            <IoDownloadOutline size={18} /> Exportar Excel
          </button>
          
          <button onClick={exportarPDF} style={{ ...styles.btnPrincipal, backgroundColor: '#e74c3c' }}>
            <IoDocumentTextOutline size={18} /> Exportar PDF
          </button>

          {!isVendedor && (
            <button onClick={abrirModalNovo} style={{...styles.btnPrincipal, backgroundColor: '#27ae60', marginLeft: '10px'}}>
              <IoAddOutline size={20} /> Novo Produto
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', backgroundColor: 'white', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
        <div style={{ flex: 2 }}>
          <input type="text" placeholder="Buscar por Nome, SKU, Lote ou Endereço..." style={styles.inputBusca} value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <select style={styles.selectBusca} value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="">Todas as Categorias</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Nome do Produto</th>
              <th style={styles.th}>SKU</th>
              <th style={styles.th}>Procedência</th>
              <th style={styles.th}>Categoria</th>
              <th style={styles.th}>Endereço</th>
              <th style={styles.th}>Data Cad.</th>
              <th style={styles.th}>Fornecedor</th>
              {!isVendedor && <th style={{...styles.th, textAlign: 'center'}}>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {produtosFiltrados.length === 0 && <tr><td colSpan={8} style={{textAlign: 'center', padding: '20px', color: '#7f8c8d'}}>Nenhum produto encontrado na busca.</td></tr>}
            {produtosFiltrados.map((item) => (
              <tr key={item.id} style={styles.tr}>
                <td style={styles.td}><strong>{item.nome}</strong></td>
                <td style={styles.td}><span style={styles.badgeSku}>{item.sku}</span></td>
                <td style={styles.td}>{renderProcedencia(item.tipo)}</td>
                <td style={styles.td}>{item.categoria?.nome || '-'}</td>
                <td style={styles.td}>{item.enderecoLocalizacao || '-'}</td>
                <td style={styles.td}>{formatarDataBR(item.dataCadastro)}</td>
                <td style={styles.td}>{item.fornecedor?.nomeEmpresa || '-'}</td>
                {!isVendedor && (
                  <td style={{...styles.td, textAlign: 'center'}}>
                    <div style={styles.acoesContainer}>
                      <button onClick={() => abrirModalEdicao(item)} style={styles.btnAcaoEditar} title="Editar Produto"><IoPencilSharp size={16} /> Editar</button>
                      {isAdmin && (<button onClick={() => apagarProduto(item.id)} style={styles.btnAcaoApagar} title="Excluir Produto"><IoTrashSharp size={16} /> Excluir</button>)}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalVisivel && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#2c3e50' }}>{idEdicao ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={() => setModalVisivel(false)} style={styles.btnFechar}>✖</button>
            </div>

            <form onSubmit={salvarProduto} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={styles.formGroupTitle}>Dados Essenciais</div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 2 }}><label style={styles.label}>Nome do Produto *</label><input type="text" style={styles.input} value={nome} onChange={e => setNome(e.target.value)} required placeholder="Ex: Lupa de Leitura" /></div>
                <div style={{ flex: 1 }}><label style={styles.label}>SKU (Código) *</label><input type="text" style={styles.input} value={sku} onChange={e => setSku(e.target.value)} required placeholder="Ex: MUN-099" /></div>
                <div style={{ flex: 1 }}><label style={styles.label}>Data Cad.</label><input type="date" style={styles.input} value={dataCadastro} onChange={e => setDataCadastro(e.target.value)} required /></div>
              </div>

              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Procedência</label>
                  <select style={styles.input} value={tipo} onChange={e => setTipo(e.target.value)}>
                    <option value="ACABADO">Nacional (Montado)</option>
                    <option value="MATERIA_PRIMA">Importado (Matéria-Prima)</option>
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

              {tipo === 'ACABADO' && !idEdicao && (
                <div style={{ backgroundColor: '#f0f4f8', padding: '15px', borderRadius: '8px', border: '1px solid #d9e2ec', marginTop: '5px' }}>
                  <div style={{...styles.formGroupTitle, backgroundColor: 'transparent', padding: 0, marginTop: 0, marginBottom: '10px', color: '#0288D1'}}>Receita de Produção (Opcional)</div>
                  <p style={{ fontSize: '12px', color: '#7f8c8d', marginBottom: '15px' }}>Se este produto for um "Kit", selecione abaixo as matérias-primas necessárias para montar 1 unidade dele.</p>
                  
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '15px' }}>
                    <div style={{ flex: 3 }}>
                      <label style={styles.label}>Adicionar Item Importado</label>
                      <select style={styles.input} value={ingredienteSelecionado} onChange={e => setIngredienteSelecionado(e.target.value)}>
                        <option value="">Selecione uma matéria-prima...</option>
                        {materiasPrimas.map(m => <option key={m.id} value={m.id}>{m.sku} - {m.nome}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={styles.label}>Qtd. Usada</label>
                      <input type="number" style={styles.input} value={ingredienteQtd} onChange={e => setIngredienteQtd(e.target.value)} min="1" />
                    </div>
                    <button type="button" onClick={adicionarIngrediente} style={{...styles.btnPrincipal, backgroundColor: '#0288D1', padding: '12px 15px'}}>Adicionar</button>
                  </div>

                  {ingredientesLista.length > 0 && (
                    <table style={{ width: '100%', backgroundColor: 'white', borderRadius: '6px', overflow: 'hidden', fontSize: '13px' }}>
                      <thead style={{ backgroundColor: '#e2e8f0', color: '#334e68' }}>
                        <tr><th style={{padding:'8px'}}>Item Componente</th><th style={{padding:'8px', textAlign:'center'}}>Qtd</th><th style={{padding:'8px', textAlign:'center'}}>Remover</th></tr>
                      </thead>
                      <tbody>
                        {ingredientesLista.map(ing => (
                          <tr key={ing.produtoFilhoId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                            <td style={{padding:'8px'}}>{ing.nome}</td>
                            <td style={{padding:'8px', textAlign:'center', fontWeight: 'bold'}}>{ing.quantidade} un</td>
                            <td style={{padding:'8px', textAlign:'center'}}><button type="button" onClick={() => removerIngrediente(ing.produtoFilhoId)} style={{background:'none', border:'none', color:'#e74c3c', cursor:'pointer'}}><IoCloseCircle size={18}/></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              <div style={styles.formGroupTitle}>Logística e Alertas</div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 2 }}><label style={styles.label}>Endereço Físico</label><input type="text" style={styles.input} value={enderecoLocalizacao} onChange={e => setEnderecoLocalizacao(e.target.value)} placeholder="Rua - Prateleira - Célula" /></div>
                <div style={{ flex: 1 }}><label style={styles.label}>Nº do Lote</label><input type="text" style={styles.input} value={lote} onChange={e => setLote(e.target.value)} placeholder="Ex: L2026B" /></div>
                <div style={{ flex: 1 }}><label style={{...styles.label, color: '#e74c3c'}}>Estoque Mínimo *</label><input type="number" style={{...styles.input, borderColor: '#fadbd8', backgroundColor: '#fdf2e9'}} value={estoqueMinimo} onChange={e => setEstoqueMinimo(e.target.value)} min="1" required /></div>
              </div>

              <div><label style={styles.label}>Fornecedor de Origem</label>
                <select style={styles.input} value={fornecedorId} onChange={e => setFornecedorId(e.target.value)}>
                  <option value="">(Nenhum / Fabrico Próprio)</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nomeEmpresa}</option>)}
                </select>
              </div>

              <div style={styles.formGroupTitle}>Financeiro</div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}><label style={styles.label}>Preço de Custo (R$)</label><input type="text" style={styles.input} value={precoCusto} onChange={e => setPrecoCusto(e.target.value)} placeholder="0,00" /></div>
                <div style={{ flex: 1 }}><label style={styles.label}>Preço de Venda (R$)</label><input type="text" style={styles.input} value={precoVenda} onChange={e => setPrecoVenda(e.target.value)} placeholder="0,00" /></div>
              </div>

              <button type="submit" style={styles.btnSalvar}>Salvar Cadastro</button>
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
  acoesContainer: { display: 'flex', justifyContent: 'center', gap: '8px' },
  btnAcaoEditar: { border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#f39c12', color: 'white' },
  btnAcaoApagar: { border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#e74c3c', color: 'white' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
  btnFechar: { background: 'none', border: 'none', fontSize: '20px', color: '#e74c3c', cursor: 'pointer' },
  label: { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box', backgroundColor: '#fafafa' },
  btnSalvar: { backgroundColor: '#27ae60', color: 'white', padding: '15px', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' },
  btnPrincipal: { color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' },
  inputBusca: { width: '100%', padding: '12px 15px', borderRadius: '8px', border: '1px solid #ecf0f1', fontSize: '14px', backgroundColor: '#f9fbfb', color: '#2c3e50', boxSizing: 'border-box' },
  selectBusca: { width: '100%', padding: '12px 15px', borderRadius: '8px', border: '1px solid #ecf0f1', fontSize: '14px', backgroundColor: '#f9fbfb', color: '#2c3e50', cursor: 'pointer' },
  btnLink: { background: 'none', border: 'none', color: '#27ae60', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', padding: 0 },
  btnCancelar: { backgroundColor: '#f1f2f6', color: '#7f8c8d', border: 'none', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  btnSalvarPequeno: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  formGroupTitle: { backgroundColor: '#ecf0f1', padding: '5px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', color: '#7f8c8d', textTransform: 'uppercase', marginTop: '10px' }
};