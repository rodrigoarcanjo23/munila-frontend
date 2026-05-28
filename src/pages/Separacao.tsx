import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { toast } from 'react-toastify';
import { IoAddOutline, IoPrintOutline, IoCheckmarkCircleOutline, IoPlayOutline, IoTrashOutline, IoSearchOutline } from 'react-icons/io5';

export default function Separacao() {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);

  // Estados do Modal de Nova OS
  const [modalNovaOrdem, setModalNovaOrdem] = useState(false);
  const [quantidadeDesejada, setQuantidadeDesejada] = useState('1');
  const [tipoOS, setTipoOS] = useState('SAIDA'); 
  const [carrinho, setCarrinho] = useState<any[]>([]);

  // Estados para a Busca Inteligente
  const [produtoSelecionado, setProdutoSelecionado] = useState(''); 
  const [buscaProduto, setBuscaProduto] = useState(''); 
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);

  // ✨ NOVO ESTADO DO FILTRO ✨
  const [filtroStatus, setFiltroStatus] = useState('Pendente'); 

  async function carregarDados() {
    setCarregando(true);
    try {
      const userSalvo = localStorage.getItem('@Munila:user');
      if (userSalvo) setUsuarioLogado(JSON.parse(userSalvo));

      const [resOrdens, resProdutos] = await Promise.all([
        api.get('/wms/ordens'),
        api.get('/produtos')
      ]);
      setOrdens(resOrdens.data);
      setProdutos(resProdutos.data.filter((p: any) => p.tipo === 'ACABADO' || p.tipo === 'MATERIA_PRIMA'));
    } catch (error) {
      toast.error("Erro ao carregar os dados de separação.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarDados(); }, []);

  const produtosFiltrados = produtos.filter(p => 
    p.nome.toLowerCase().includes(buscaProduto.toLowerCase()) || 
    p.sku.toLowerCase().includes(buscaProduto.toLowerCase())
  );

  function selecionarProdutoSugestao(produto: any) {
    setProdutoSelecionado(produto.id);
    setBuscaProduto(`[${produto.sku}] - ${produto.nome}`);
    setMostrarSugestoes(false);
  }

  function adicionarAoCarrinho() {
    if (!produtoSelecionado || Number(quantidadeDesejada) <= 0) return toast.warn("Selecione um produto válido da lista e uma quantidade.");
    
    const prodRef = produtos.find(p => p.id === produtoSelecionado);
    if (!prodRef) return;

    const index = carrinho.findIndex(item => item.produtoId === produtoSelecionado);
    if (index >= 0) {
      const novoCarrinho = [...carrinho];
      novoCarrinho[index].quantidade += Number(quantidadeDesejada);
      setCarrinho(novoCarrinho);
    } else {
      setCarrinho([...carrinho, { produtoId: prodRef.id, nome: prodRef.nome, sku: prodRef.sku, quantidade: Number(quantidadeDesejada) }]);
    }

    setProdutoSelecionado('');
    setBuscaProduto('');
    setQuantidadeDesejada('1');
  }

  function removerDoCarrinho(index: number) {
    const novoCarrinho = [...carrinho];
    novoCarrinho.splice(index, 1);
    setCarrinho(novoCarrinho);
  }

  async function gerarOrdem() {
    if (carrinho.length === 0) return toast.warn("O carrinho está vazio.");
    if (!usuarioLogado) return toast.error("Sessão inválida.");

    try {
      await api.post('/wms/ordens', {
        solicitanteId: usuarioLogado.id,
        tipo: tipoOS, 
        itens: carrinho
      });
      toast.success(`Ordem de ${tipoOS} gerada com sucesso!`);
      setModalNovaOrdem(false);
      setCarrinho([]);
      carregarDados();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Erro ao gerar OS.");
    }
  }

  async function excluirOrdem(id: string) {
    if (!window.confirm("Atenção: Deseja realmente cancelar e excluir esta Ordem de Serviço?")) return;

    try {
      await api.delete(`/wms/ordens/${id}`);
      toast.success("Ordem excluída com sucesso.");
      carregarDados();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Erro ao excluir a ordem.");
    }
  }

  async function iniciarSeparacao(id: string) {
    try {
      await api.put(`/wms/ordens/${id}/status`, { status: 'Em Separação', separadorId: usuarioLogado?.id });
      toast.info("Ordem em separação!");
      carregarDados();
    } catch (error) { toast.error("Erro ao iniciar separação."); }
  }

  async function finalizarSeparacao(id: string) {
    try {
      await api.post(`/wms/ordens/${id}/concluir`, { usuarioId: usuarioLogado?.id });
      toast.success("Operação concluída e estoque atualizado com sucesso!");
      carregarDados();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Erro ao finalizar separação.");
    }
  }

  function imprimirZebra(ordem: any) {
    const janela = window.open('', '', 'width=400,height=600');
    if (!janela) return toast.error("Pop-up bloqueado pelo navegador.");

    const tituloDoc = ordem.tipo === 'ENTRADA' ? 'LISTA DE ENTRADA' : ordem.tipo === 'DEVOLUCAO' ? 'LISTA DE DEVOLUÇÃO' : 'LISTA DE PICKING';

    const htmlZebra = `
      <html>
        <head>
          <title>Impressão Zebra - ${ordem.codigo}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 14px; margin: 0; padding: 10px; color: black; background: white; }
            .header { text-align: center; border-bottom: 2px dashed black; padding-bottom: 10px; margin-bottom: 10px; }
            .title { font-size: 18px; font-weight: bold; margin: 0; }
            .subtitle { font-size: 12px; margin: 5px 0 0 0; }
            .item { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
            .box { width: 15px; height: 15px; border: 2px solid black; display: inline-block; margin-right: 8px; vertical-align: middle; margin-top: 2px; }
            .item-detalhes { flex: 1; display: flex; flex-direction: column; }
            .item-nome { font-weight: bold; font-size: 14px; margin-bottom: 3px; }
            .item-meta { font-size: 11px; font-weight: normal; color: #333; }
            .item-local { font-size: 12px; font-weight: bold; margin-top: 3px; border: 1px dashed black; padding: 2px 4px; display: inline-block; width: fit-content; }
            .item-qtd { font-weight: bold; font-size: 18px; margin-left: 10px; }
            .barcode { text-align: center; margin-top: 20px; font-size: 24px; letter-spacing: 2px; border: 1px solid black; padding: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <p class="title">${tituloDoc}</p>
            <p class="subtitle">ORDEM ${ordem.codigo} (${ordem.tipo})</p>
            <p class="subtitle">Solicitante: ${ordem.solicitante?.nome || 'Fábrica'}</p>
          </div>
          
          <div style="margin-bottom: 20px;">
            ${ordem.itens.map((item: any) => `
              <div class="item">
                <div style="display: flex; align-items: flex-start; flex: 1;">
                  <span class="box"></span>
                  <div class="item-detalhes">
                    <span class="item-nome">${item.produto.nome}</span>
                    <span class="item-meta">SKU: ${item.produto.sku}</span>
                    <span class="item-local">LOCAL: ${item.produto.enderecoLocalizacao || 'Estoque Principal'}</span>
                  </div>
                </div>
                <div class="item-qtd">${item.quantidade} un</div>
              </div>
            `).join('')}
          </div>

          <div class="barcode">
            *${ordem.codigo}*
          </div>
          <p style="text-align: center; font-size: 10px; margin-top: 5px;">ViaPro WMS</p>
          
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `;
    janela.document.write(htmlZebra);
    janela.document.close();
  }

  // ✨ LÓGICA DE FILTRAGEM DAS ORDENS ✨
  const ordensFiltradas = ordens.filter(ordem => 
    filtroStatus === 'Todos' || ordem.status === filtroStatus
  );

  if (carregando) return <div>A carregar módulo WMS...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Gestão de Ordens e Retiradas</h1>
        <button onClick={() => setModalNovaOrdem(true)} style={styles.btnPrincipal}>
          <IoAddOutline size={20} /> Nova Ordem
        </button>
      </div>

      {/* ✨ MENU DE ABAS (TABS) ✨ */}
      <div style={styles.tabsContainer}>
        {['Todos', 'Pendente', 'Em Separação', 'Concluída'].map((status) => {
          const isActive = filtroStatus === status;
          const corAba = status === 'Pendente' ? '#f39c12' : status === 'Em Separação' ? '#3498db' : status === 'Concluída' ? '#27ae60' : '#8e44ad';
          
          return (
            <button
              key={status}
              onClick={() => setFiltroStatus(status)}
              style={{
                ...styles.tabButton,
                color: isActive ? corAba : '#95a5a6',
                borderBottomColor: isActive ? corAba : 'transparent'
              }}
            >
              {status === 'Todos' ? 'Todas' : status === 'Pendente' ? 'Pendentes' : status === 'Em Separação' ? 'Em Execução' : 'Concluídas'}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {ordensFiltradas.length === 0 && <p style={{ color: '#7f8c8d' }}>Nenhuma ordem de serviço encontrada nesta categoria.</p>}
        
        {ordensFiltradas.map((ordem) => {
          const corTipo = ordem.tipo === 'ENTRADA' ? { bg: '#eafaf1', text: '#27ae60' } 
                        : ordem.tipo === 'SAIDA' ? { bg: '#fdedec', text: '#c0392b' } 
                        : { bg: '#ebf5fb', text: '#2980b9' };

          return (
            <div key={ordem.id} style={{ ...styles.card, borderTop: `5px solid ${ordem.status === 'Pendente' ? '#f39c12' : ordem.status === 'Em Separação' ? '#3498db' : '#27ae60'}` }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {ordem.codigo}
                </h3>
                <span style={{ 
                  backgroundColor: ordem.status === 'Pendente' ? '#fef5e7' : ordem.status === 'Em Separação' ? '#ebf5fb' : '#eafaf1',
                  color: ordem.status === 'Pendente' ? '#f39c12' : ordem.status === 'Em Separação' ? '#2980b9' : '#27ae60',
                  padding: '5px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold'
                }}>
                  {ordem.status}
                </span>
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <span style={{ backgroundColor: corTipo.bg, color: corTipo.text, padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase' }}>
                  {ordem.tipo} DE MATERIAL
                </span>
              </div>
              
              <p style={{ margin: '0 0 5px 0', fontSize: '13px', color: '#7f8c8d' }}><strong>Solicitante:</strong> {ordem.solicitante?.nome}</p>
              <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#7f8c8d' }}><strong>Itens:</strong> {ordem.itens.length} produtos diferentes</p>

              {ordem.status === 'Pendente' && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => iniciarSeparacao(ordem.id)} style={{...styles.btnAcao, backgroundColor: '#3498db', flex: 1}}>
                    <IoPlayOutline size={18} /> Iniciar Operação
                  </button>
                  <button onClick={() => excluirOrdem(ordem.id)} style={{...styles.btnAcao, backgroundColor: '#e74c3c', padding: '10px 15px'}} title="Excluir Ordem">
                    <IoTrashOutline size={18} />
                  </button>
                </div>
              )}

              {ordem.status === 'Em Separação' && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => imprimirZebra(ordem)} style={{...styles.btnAcao, backgroundColor: '#34495e', flex: 1}}>
                    <IoPrintOutline size={18} /> Zebra
                  </button>
                  <button onClick={() => finalizarSeparacao(ordem.id)} style={{...styles.btnAcao, backgroundColor: '#27ae60', flex: 2}}>
                    <IoCheckmarkCircleOutline size={18} /> Finalizar
                  </button>
                </div>
              )}
              
              {ordem.status === 'Concluída' && (
                <div style={{ textAlign: 'center', color: '#27ae60', fontWeight: 'bold', fontSize: '14px', padding: '10px', backgroundColor: '#f9fbfb', borderRadius: '6px' }}>
                  Concluído por {ordem.separador?.nome}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modalNovaOrdem && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '650px', overflow: 'visible'}}>
            <h2 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>Gerar Nova Ordem de Serviço</h2>
            <p style={{ color: '#7f8c8d', marginBottom: '20px' }}>Monte a lista de produtos e escolha a direção da movimentação.</p>

            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9fbfb', borderRadius: '8px', border: '1px solid #ecf0f1' }}>
              <label style={styles.label}>Finalidade da Ordem de Serviço</label>
              <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                {['SAIDA', 'ENTRADA', 'DEVOLUCAO'].map(tipo => (
                  <label key={tipo} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: 'bold', color: tipoOS === tipo ? '#0288D1' : '#7f8c8d' }}>
                    <input 
                      type="radio" 
                      name="tipoOS" 
                      value={tipo} 
                      checked={tipoOS === tipo} 
                      onChange={() => setTipoOS(tipo)} 
                      style={{ cursor: 'pointer' }}
                    />
                    {tipo === 'SAIDA' ? 'Saída (Retirada)' : tipo === 'ENTRADA' ? 'Entrada (Recebimento)' : 'Devolução (Retorno)'}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'flex-end' }}>
              <div style={{ flex: 3, position: 'relative' }}>
                <label style={styles.label}>Produto (Nome ou SKU)</label>
                <div style={{ position: 'relative' }}>
                  <IoSearchOutline size={18} color="#7f8c8d" style={{ position: 'absolute', left: '10px', top: '12px' }} />
                  <input 
                    type="text" 
                    style={{...styles.input, paddingLeft: '35px'}} 
                    placeholder="Comece a digitar para pesquisar..."
                    value={buscaProduto}
                    onChange={(e) => {
                      setBuscaProduto(e.target.value);
                      setProdutoSelecionado('');
                      setMostrarSugestoes(true);
                    }}
                    onFocus={() => setMostrarSugestoes(true)}
                    onBlur={() => setTimeout(() => setMostrarSugestoes(false), 200)}
                  />
                </div>

                {mostrarSugestoes && buscaProduto.length > 0 && (
                  <div style={styles.listaFlutuante}>
                    {produtosFiltrados.length === 0 ? (
                      <div style={{ padding: '15px', color: '#7f8c8d', textAlign: 'center', fontSize: '13px' }}>Nenhum produto encontrado.</div>
                    ) : (
                      produtosFiltrados.map((p) => (
                        <div 
                          key={p.id} 
                          style={styles.itemFlutuante}
                          onMouseDown={() => selecionarProdutoSugestao(p)}
                        >
                          <span style={{ fontWeight: 'bold', color: '#2c3e50', display: 'block' }}>{p.nome}</span>
                          <span style={{ color: '#0288D1', fontSize: '11px', fontWeight: 'bold' }}>SKU: {p.sku}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div style={{ flex: 1 }}>
                <label style={styles.label}>Qtd.</label>
                <input type="number" style={styles.input} value={quantidadeDesejada} onChange={e => setQuantidadeDesejada(e.target.value)} min="1" />
              </div>
              <button type="button" onClick={adicionarAoCarrinho} style={{...styles.btnAcao, backgroundColor: '#0288D1', height: '42px', padding: '0 15px'}}>Adicionar</button>
            </div>

            <div style={{ backgroundColor: '#f9fbfb', border: '1px solid #ecf0f1', borderRadius: '8px', minHeight: '150px', padding: '10px', marginBottom: '20px' }}>
              {carrinho.length === 0 && <p style={{ textAlign: 'center', color: '#bdc3c7', marginTop: '50px' }}>Nenhum item adicionado.</p>}
              {carrinho.map((item, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #eee', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#2c3e50' }}>{item.nome} <span style={{color: '#7f8c8d', fontWeight: 'normal'}}>({item.sku})</span></span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span style={{ color: '#0288D1', fontWeight: '900' }}>{item.quantidade} un</span>
                    <button onClick={() => removerDoCarrinho(index)} style={{ color: '#e74c3c', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={() => setModalNovaOrdem(false)} style={styles.btnCancelar}>Cancelar</button>
              <button type="button" onClick={gerarOrdem} style={{...styles.btnPrincipal, backgroundColor: '#8e44ad'}}>
                Gerar Ordem de Serviço
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  btnPrincipal: { backgroundColor: '#8e44ad', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' },
  card: { backgroundColor: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' },
  btnAcao: { color: 'white', border: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
  label: { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' },
  input: { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box', backgroundColor: '#fafafa', outline: 'none' },
  btnCancelar: { backgroundColor: '#f1f2f6', color: '#7f8c8d', border: 'none', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  listaFlutuante: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', marginTop: '5px', maxHeight: '220px', overflowY: 'auto', zIndex: 100, boxShadow: '0 10px 25px rgba(0,0,0,0.15)' },
  itemFlutuante: { padding: '12px 15px', borderBottom: '1px solid #f4f7f6', cursor: 'pointer', transition: 'background-color 0.2s', display: 'flex', flexDirection: 'column', gap: '2px' },
  // ✨ ESTILOS DAS ABAS ✨
  tabsContainer: { display: 'flex', gap: '20px', marginBottom: '25px', borderBottom: '2px solid #ecf0f1', paddingBottom: '0px' },
  tabButton: { background: 'none', border: 'none', borderBottom: '3px solid transparent', padding: '10px 5px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', marginBottom: '-2px' }
};