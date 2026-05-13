import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { toast } from 'react-toastify';
import { IoAddOutline, IoPrintOutline, IoCheckmarkCircleOutline, IoPlayOutline } from 'react-icons/io5';

export default function Separacao() {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);

  // Estados do Modal de Nova OS
  const [modalNovaOrdem, setModalNovaOrdem] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState('');
  const [quantidadeDesejada, setQuantidadeDesejada] = useState('1');
  const [carrinho, setCarrinho] = useState<any[]>([]);

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
      // Filtra apenas produtos que a indústria envia para o armazém (ex: Acabados)
      setProdutos(resProdutos.data.filter((p: any) => p.tipo === 'ACABADO' || p.tipo === 'MATERIA_PRIMA'));
    } catch (error) {
      toast.error("Erro ao carregar os dados de separação.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarDados(); }, []);

  // === FUNÇÕES DA NOVA ORDEM ===
  function adicionarAoCarrinho() {
    if (!produtoSelecionado || Number(quantidadeDesejada) <= 0) return toast.warn("Selecione um produto e uma quantidade válida.");
    
    const prodRef = produtos.find(p => p.id === produtoSelecionado);
    if (!prodRef) return;

    // Verifica se já está no carrinho para somar
    const index = carrinho.findIndex(item => item.produtoId === produtoSelecionado);
    if (index >= 0) {
      const novoCarrinho = [...carrinho];
      novoCarrinho[index].quantidade += Number(quantidadeDesejada);
      setCarrinho(novoCarrinho);
    } else {
      setCarrinho([...carrinho, { produtoId: prodRef.id, nome: prodRef.nome, sku: prodRef.sku, quantidade: Number(quantidadeDesejada) }]);
    }

    setProdutoSelecionado('');
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
        itens: carrinho
      });
      toast.success("Ordem de Serviço gerada com sucesso!");
      setModalNovaOrdem(false);
      setCarrinho([]);
      carregarDados();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Erro ao gerar OS.");
    }
  }

  // === FUNÇÕES DO ESTOQUISTA ===
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
      toast.success("Separação concluída e estoque atualizado com sucesso!");
      carregarDados();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Erro ao finalizar separação.");
    }
  }

  // ✨ A MÁGICA DA IMPRESSORA ZEBRA ✨
  function imprimirZebra(ordem: any) {
    // Cria uma janela popup isolada
    const janela = window.open('', '', 'width=400,height=600');
    if (!janela) return toast.error("Pop-up bloqueado pelo navegador.");

    // Monta um HTML limpo, focado em preto e branco, tamanho de etiqueta contínua (ex: 80mm ou 100mm)
    const htmlZebra = `
      <html>
        <head>
          <title>Impressão Zebra - ${ordem.codigo}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 14px; margin: 0; padding: 10px; color: black; background: white; }
            .header { text-align: center; border-bottom: 2px dashed black; padding-bottom: 10px; margin-bottom: 10px; }
            .title { font-size: 18px; font-weight: bold; margin: 0; }
            .subtitle { font-size: 12px; margin: 5px 0 0 0; }
            .item { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
            .box { width: 15px; height: 15px; border: 2px solid black; display: inline-block; margin-right: 8px; vertical-align: middle; }
            .item-nome { font-weight: bold; font-size: 13px; flex: 1; }
            .item-qtd { font-weight: bold; font-size: 16px; margin-left: 10px; }
            .barcode { text-align: center; margin-top: 20px; font-size: 24px; letter-spacing: 2px; border: 1px solid black; padding: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <p class="title">LISTA DE PICKING</p>
            <p class="subtitle">ORDEM ${ordem.codigo}</p>
            <p class="subtitle">Solicitante: ${ordem.solicitante?.nome || 'Fábrica'}</p>
          </div>
          
          <div style="margin-bottom: 20px;">
            ${ordem.itens.map((item: any) => `
              <div class="item">
                <div style="display: flex; align-items: flex-start; flex: 1;">
                  <span class="box"></span>
                  <div class="item-nome">
                    ${item.produto.nome}<br/>
                    <span style="font-size: 10px; font-weight: normal;">SKU: ${item.produto.sku}</span>
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

  if (carregando) return <div>A carregar módulo WMS...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Módulo de Separação (WMS)</h1>
        <button onClick={() => setModalNovaOrdem(true)} style={styles.btnPrincipal}>
          <IoAddOutline size={20} /> Nova Solicitação
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {ordens.length === 0 && <p style={{ color: '#7f8c8d' }}>Nenhuma ordem de separação encontrada.</p>}
        
        {ordens.map((ordem) => (
          <div key={ordem.id} style={{ ...styles.card, borderTop: `5px solid ${ordem.status === 'Pendente' ? '#f39c12' : ordem.status === 'Em Separação' ? '#3498db' : '#27ae60'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '18px' }}>{ordem.codigo}</h3>
              <span style={{ 
                backgroundColor: ordem.status === 'Pendente' ? '#fef5e7' : ordem.status === 'Em Separação' ? '#ebf5fb' : '#eafaf1',
                color: ordem.status === 'Pendente' ? '#f39c12' : ordem.status === 'Em Separação' ? '#2980b9' : '#27ae60',
                padding: '5px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold'
              }}>
                {ordem.status}
              </span>
            </div>
            
            <p style={{ margin: '0 0 5px 0', fontSize: '13px', color: '#7f8c8d' }}><strong>Solicitante:</strong> {ordem.solicitante?.nome}</p>
            <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#7f8c8d' }}><strong>Itens:</strong> {ordem.itens.length} produtos diferentes</p>

            {ordem.status === 'Pendente' && (
              <button onClick={() => iniciarSeparacao(ordem.id)} style={{...styles.btnAcao, backgroundColor: '#3498db', width: '100%'}}>
                <IoPlayOutline size={18} /> Iniciar Separação
              </button>
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
        ))}
      </div>

      {/* MODAL NOVA SOLICITAÇÃO */}
      {modalNovaOrdem && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '600px'}}>
            <h2 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>Gerar Ordem de Serviço (Zebra)</h2>
            <p style={{ color: '#7f8c8d', marginBottom: '20px' }}>Adicione os produtos que precisam ser transferidos da indústria para o estoque da ViaPro.</p>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'flex-end' }}>
              <div style={{ flex: 3 }}>
                <label style={styles.label}>Produto</label>
                <select style={styles.input} value={produtoSelecionado} onChange={e => setProdutoSelecionado(e.target.value)}>
                  <option value="">Selecione...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>[{p.sku}] - {p.nome}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Qtd.</label>
                <input type="number" style={styles.input} value={quantidadeDesejada} onChange={e => setQuantidadeDesejada(e.target.value)} min="1" />
              </div>
              <button type="button" onClick={adicionarAoCarrinho} style={{...styles.btnAcao, backgroundColor: '#0288D1', height: '42px', padding: '0 15px'}}>Adicionar</button>
            </div>

            {/* LISTA DO CARRINHO */}
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
  input: { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box', backgroundColor: '#fafafa' },
  btnCancelar: { backgroundColor: '#f1f2f6', color: '#7f8c8d', border: 'none', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }
};