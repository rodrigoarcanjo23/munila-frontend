import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { toast } from 'react-toastify';
import { 
  IoAddOutline, IoPrintOutline, IoCheckmarkCircleOutline, 
  IoPlayOutline, IoTrashOutline, IoSearchOutline, IoEyeOutline, 
  IoPersonOutline, IoPauseCircleOutline, IoWarningOutline, IoBarcodeOutline
} from 'react-icons/io5';

export default function Separacao() {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);

  // Estados do Modal de Nova OS
  const [modalNovaOrdem, setModalNovaOrdem] = useState(false);
  const [quantidadeDesejada, setQuantidadeDesejada] = useState('1');
  const [tipoOS, setTipoOS] = useState('SAIDA'); 
  const [prioridadeOS, setPrioridadeOS] = useState('Normal'); // ✨ ESTADO DE PRIORIDADE
  const [carrinho, setCarrinho] = useState<any[]>([]);

  // Estados de Visualização e Conferência
  const [ordemSelecionada, setOrdemSelecionada] = useState<any>(null);
  const [osEmConferencia, setOsEmConferencia] = useState<any>(null); // ✨ ESTADO DO CHECKLIST
  const [itensConferidos, setItensConferidos] = useState<string[]>([]);

  // Estados de Busca e Filtros
  const [produtoSelecionado, setProdutoSelecionado] = useState(''); 
  const [buscaProduto, setBuscaProduto] = useState(''); 
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('Pendente'); 
  const [buscaOS, setBuscaOS] = useState(''); // ✨ PESQUISA GLOBAL DE OS
  const [filtroData, setFiltroData] = useState('Todos'); // ✨ FILTRO DE DATA

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
    if (!produtoSelecionado || Number(quantidadeDesejada) <= 0) return toast.warn("Selecione um produto e a quantidade.");
    
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
    setProdutoSelecionado(''); setBuscaProduto(''); setQuantidadeDesejada('1');
  }

  function removerDoCarrinho(index: number) {
    const novoCarrinho = [...carrinho];
    novoCarrinho.splice(index, 1);
    setCarrinho(novoCarrinho);
  }

  async function gerarOrdem() {
    if (carrinho.length === 0) return toast.warn("O carrinho está vazio.");
    try {
      await api.post('/wms/ordens', {
        solicitanteId: usuarioLogado.id,
        tipo: tipoOS, 
        prioridade: prioridadeOS, // ✨ ENVIA PRIORIDADE
        itens: carrinho
      });
      toast.success(`Ordem de ${tipoOS} gerada com sucesso!`);
      setModalNovaOrdem(false); setCarrinho([]); setPrioridadeOS('Normal');
      carregarDados();
    } catch (error: any) { toast.error(error.response?.data?.error || "Erro ao gerar OS."); }
  }

  async function excluirOrdem(id: string) {
    if (!window.confirm("Atenção: Deseja cancelar e excluir esta OS?")) return;
    try {
      await api.delete(`/wms/ordens/${id}`);
      toast.success("Ordem excluída com sucesso.");
      carregarDados();
    } catch (error: any) { toast.error("Erro ao excluir a ordem."); }
  }

  async function iniciarSeparacao(id: string) {
    try {
      await api.put(`/wms/ordens/${id}/status`, { status: 'Em Separação', separadorId: usuarioLogado?.id });
      toast.info("Ordem em separação!");
      carregarDados();
    } catch (error) { toast.error("Erro ao iniciar separação."); }
  }

  // ✨ NOVA FUNÇÃO DE PAUSA ✨
  async function pausarSeparacao(id: string) {
    if (!window.confirm("Deseja pausar esta OS e devolvê-la para a fila de Pendentes?")) return;
    try {
      await api.put(`/wms/ordens/${id}/pausar`);
      toast.warn("Ordem devolvida para a fila.");
      carregarDados();
    } catch (error) { toast.error("Erro ao pausar a OS."); }
  }

  // ✨ ORDENAÇÃO INTELIGENTE POR LOCALIZAÇÃO (ROTEIRIZAÇÃO) ✨
  const ordenarItensPorLocal = (itens: any[]) => {
    return [...itens].sort((a, b) => {
      const localA = a.produto.enderecoLocalizacao || 'ZZZ';
      const localB = b.produto.enderecoLocalizacao || 'ZZZ';
      return localA.localeCompare(localB);
    });
  };

  // ✨ FUNÇÕES DO CHECKLIST ✨
  function abrirConferencia(ordem: any) {
    setOsEmConferencia({ ...ordem, itens: ordenarItensPorLocal(ordem.itens) });
    setItensConferidos([]);
  }

  function toggleItemConferido(itemId: string) {
    if (itensConferidos.includes(itemId)) {
      setItensConferidos(itensConferidos.filter(id => id !== itemId));
    } else {
      setItensConferidos([...itensConferidos, itemId]);
    }
  }

  async function confirmarFinalizacao(id: string) {
    try {
      await api.post(`/wms/ordens/${id}/concluir`, { usuarioId: usuarioLogado?.id });
      toast.success("Checklist validado! Operação concluída e estoque atualizado!");
      setOsEmConferencia(null);
      carregarDados();
    } catch (error: any) { toast.error(error.response?.data?.error || "Erro ao finalizar separação."); }
  }

  function imprimirZebra(ordem: any) {
    const janela = window.open('', '', 'width=400,height=600');
    if (!janela) return toast.error("Pop-up bloqueado pelo navegador.");

    const itensRoteirizados = ordenarItensPorLocal(ordem.itens); // ✨ APLICA A ROTEIRIZAÇÃO NA IMPRESSÃO
    const tituloDoc = ordem.tipo === 'ENTRADA' ? 'LISTA DE ENTRADA' : ordem.tipo === 'DEVOLUCAO' ? 'LISTA DE DEVOLUÇÃO' : 'LISTA DE PICKING';
    const dataOS = ordem.createdAt ? new Date(ordem.createdAt) : new Date();
    const dataFormatada = dataOS.toLocaleDateString('pt-BR');
    const horaFormatada = dataOS.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const htmlZebra = `
      <html>
        <head>
          <title>Impressão Zebra - ${ordem.codigo}</title>
          <style>
            @page { margin: 0; }
            body { font-family: 'Courier New', Courier, monospace; font-size: 12px; width: 75mm; margin: 0 auto; padding: 5mm 2mm; color: black; background: white; }
            .header { text-align: center; border-bottom: 2px dashed black; padding-bottom: 8px; margin-bottom: 10px; }
            .title { font-size: 16px; font-weight: bold; margin: 0; }
            .subtitle { font-size: 11px; margin: 5px 0 0 0; }
            .priority { font-weight: bold; font-size: 14px; padding: 2px; margin-top: 5px; border: 1px solid black; }
            .item { margin-bottom: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 8px; page-break-inside: avoid; }
            .item-linha1 { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3px; }
            .box { width: 14px; height: 14px; border: 2px solid black; display: inline-block; margin-right: 5px; flex-shrink: 0; margin-top: 1px; }
            .item-nome { font-weight: bold; font-size: 12px; flex: 1; line-height: 1.1; word-wrap: break-word; }
            .item-qtd { font-weight: bold; font-size: 15px; margin-left: 8px; white-space: nowrap; }
            .item-linha2 { display: flex; flex-direction: column; padding-left: 23px; }
            .item-meta { font-size: 10px; color: #333; margin-bottom: 3px; }
            .item-local { font-size: 12px; font-weight: bold; border: 1px dashed black; padding: 2px 4px; display: inline-block; width: fit-content; background: #eee; }
            .barcode { text-align: center; margin-top: 15px; font-size: 16px; letter-spacing: 2px; border: 1px solid black; padding: 5px; page-break-inside: avoid; }
            .footer { text-align: center; font-size: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed black; }
          </style>
        </head>
        <body>
          <div class="header">
            <p class="title">${tituloDoc}</p>
            <p class="subtitle">ORDEM ${ordem.codigo} (${ordem.tipo})</p>
            ${ordem.prioridade === 'Urgente' || ordem.prioridade === 'Alta' ? `<div class="priority">PRIORIDADE: ${ordem.prioridade.toUpperCase()}</div>` : ''}
            <p class="subtitle">Solicitante: ${ordem.solicitante?.nome || 'Fábrica'}</p>
            <p class="subtitle">Data: ${dataFormatada} às ${horaFormatada}</p>
          </div>
          <div style="margin-bottom: 15px;">
            ${itensRoteirizados.map((item: any) => `
              <div class="item">
                <div class="item-linha1">
                  <span class="box"></span>
                  <span class="item-nome">${item.produto.nome}</span>
                  <span class="item-qtd">${item.quantidade} un</span>
                </div>
                <div class="item-linha2">
                  <span class="item-meta">SKU: ${item.produto.sku}</span>
                  <span class="item-local">LOCAL: ${item.produto.enderecoLocalizacao || 'Estoque Geral'}</span>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="barcode">*${ordem.codigo}*</div>
          <div class="footer">ViaPro WMS</div>
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `;
    janela.document.write(htmlZebra);
    janela.document.close();
  }

  // ✨ SUPER FILTRO COM BUSCA E DATAS ✨
  const ordensFiltradas = ordens.filter(ordem => {
    if (filtroStatus !== 'Todos' && ordem.status !== filtroStatus) return false;
    
    // Busca por Texto (OS ou Solicitante)
    if (buscaOS) {
      const termo = buscaOS.toLowerCase();
      const matchCodigo = ordem.codigo.toLowerCase().includes(termo);
      const matchSolicitante = ordem.solicitante?.nome?.toLowerCase().includes(termo);
      if (!matchCodigo && !matchSolicitante) return false;
    }

    // Filtro por Data
    if (filtroData !== 'Todos') {
      const dataOS = new Date(ordem.createdAt);
      const hoje = new Date();
      if (filtroData === 'Hoje') {
        if (dataOS.toDateString() !== hoje.toDateString()) return false;
      } else if (filtroData === 'Ultimos7Dias') {
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        if (dataOS < seteDiasAtras) return false;
      }
    }
    return true;
  }).sort((a, b) => {
    // ✨ ORDENAÇÃO DE PENDENTES: URGENTE VEM PRIMEIRO ✨
    if (a.status === 'Pendente' && b.status === 'Pendente') {
      const pesoPrioridade = { 'Urgente': 3, 'Alta': 2, 'Normal': 1 };
      const pesoA = pesoPrioridade[a.prioridade as keyof typeof pesoPrioridade] || 1;
      const pesoB = pesoPrioridade[b.prioridade as keyof typeof pesoPrioridade] || 1;
      if (pesoA !== pesoB) return pesoB - pesoA; // Ordem decrescente de importância
    }
    // Depois, ordena pela data mais recente
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (carregando) return <div>A carregar módulo WMS...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Gestão de Ordens e Retiradas</h1>
        <button onClick={() => setModalNovaOrdem(true)} style={styles.btnPrincipal}>
          <IoAddOutline size={20} /> Nova Ordem
        </button>
      </div>

      {/* ✨ NOVA BARRA DE FERRAMENTAS E FILTROS ✨ */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', backgroundColor: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <IoSearchOutline size={18} color="#7f8c8d" style={{ position: 'absolute', left: '12px', top: '12px' }} />
          <input 
            type="text" 
            placeholder="Buscar por código (OS) ou Solicitante..." 
            value={buscaOS}
            onChange={(e) => setBuscaOS(e.target.value)}
            style={{...styles.inputFiltro, paddingLeft: '38px', backgroundColor: '#f9fbfb'}}
          />
        </div>
        <div style={{ width: '200px' }}>
          <select value={filtroData} onChange={(e) => setFiltroData(e.target.value)} style={{...styles.inputFiltro, backgroundColor: '#f9fbfb'}}>
            <option value="Todos">Todas as Datas</option>
            <option value="Hoje">Criadas Hoje</option>
            <option value="Ultimos7Dias">Últimos 7 dias</option>
          </select>
        </div>
      </div>

      <div style={styles.tabsContainer}>
        {['Todos', 'Pendente', 'Em Separação', 'Concluída'].map((status) => {
          const isActive = filtroStatus === status;
          const corAba = status === 'Pendente' ? '#f39c12' : status === 'Em Separação' ? '#3498db' : status === 'Concluída' ? '#27ae60' : '#8e44ad';
          return (
            <button
              key={status}
              onClick={() => setFiltroStatus(status)}
              style={{ ...styles.tabButton, color: isActive ? corAba : '#95a5a6', borderBottomColor: isActive ? corAba : 'transparent' }}
            >
              {status === 'Todos' ? 'Todas' : status === 'Pendente' ? 'Pendentes' : status === 'Em Separação' ? 'Em Execução' : 'Concluídas'}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {ordensFiltradas.length === 0 && <p style={{ color: '#7f8c8d' }}>Nenhuma ordem de serviço encontrada.</p>}
        
        {ordensFiltradas.map((ordem) => {
          const corTipo = ordem.tipo === 'ENTRADA' ? { bg: '#eafaf1', text: '#27ae60' } : ordem.tipo === 'SAIDA' ? { bg: '#fdedec', text: '#c0392b' } : { bg: '#ebf5fb', text: '#2980b9' };
          
          // Cores da Prioridade
          const corPrioridade = ordem.prioridade === 'Urgente' ? '#e74c3c' : ordem.prioridade === 'Alta' ? '#e67e22' : '#95a5a6';

          const dataCard = ordem.createdAt ? new Date(ordem.createdAt) : new Date();
          const dataExibicaoCard = `${dataCard.toLocaleDateString('pt-BR')} às ${dataCard.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
          const dataConclusaoObj = ordem.updatedAt ? new Date(ordem.updatedAt) : null;
          const dataConclusaoFormatada = dataConclusaoObj ? `${dataConclusaoObj.toLocaleDateString('pt-BR')} às ${dataConclusaoObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '';

          return (
            <div key={ordem.id} style={{ ...styles.card, position: 'relative', overflow: 'hidden', borderTop: `5px solid ${ordem.status === 'Pendente' ? '#f39c12' : ordem.status === 'Em Separação' ? '#3498db' : '#27ae60'}` }}>
              
              {/* ✨ BADGE DE PRIORIDADE ✨ */}
              <div style={{ position: 'absolute', top: '15px', right: '-30px', backgroundColor: corPrioridade, color: 'white', fontSize: '10px', fontWeight: 'bold', padding: '4px 35px', transform: 'rotate(45deg)', textTransform: 'uppercase', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 1 }}>
                {ordem.prioridade}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingRight: '20px' }}>
                <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>{ordem.codigo}</h3>
                <span style={{ backgroundColor: ordem.status === 'Pendente' ? '#fef5e7' : ordem.status === 'Em Separação' ? '#ebf5fb' : '#eafaf1', color: ordem.status === 'Pendente' ? '#f39c12' : ordem.status === 'Em Separação' ? '#2980b9' : '#27ae60', padding: '5px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
                  {ordem.status}
                </span>
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <span style={{ backgroundColor: corTipo.bg, color: corTipo.text, padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase' }}>
                  {ordem.tipo} DE MATERIAL
                </span>
              </div>
              
              <p style={{ margin: '0 0 5px 0', fontSize: '13px', color: '#7f8c8d' }}><strong>Solicitante:</strong> {ordem.solicitante?.nome}</p>
              <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#7f8c8d' }}><strong>Data Criação:</strong> {dataExibicaoCard}</p>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#7f8c8d' }}><strong>Itens:</strong> {ordem.itens.length} produtos</p>
                <button onClick={() => { setOrdemSelecionada({...ordem, itens: ordenarItensPorLocal(ordem.itens)}) }} style={{ background: 'none', border: 'none', color: '#3498db', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <IoEyeOutline size={16} /> Ver lista (Rota)
                </button>
              </div>

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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ backgroundColor: '#ebf5fb', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d6eaf8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <IoPersonOutline color="#2980b9" size={14} />
                      <span style={{ color: '#2980b9', fontSize: '12px' }}>Em separação por: <strong>{ordem.separador?.nome}</strong></span>
                    </div>
                    {/* ✨ BOTÃO DE PAUSA ✨ */}
                    <button onClick={() => pausarSeparacao(ordem.id)} title="Pausar OS" style={{ background: 'none', border: 'none', color: '#f39c12', cursor: 'pointer' }}>
                      <IoPauseCircleOutline size={20} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => imprimirZebra(ordem)} style={{...styles.btnAcao, backgroundColor: '#34495e', flex: 1}}>
                      <IoPrintOutline size={18} /> Zebra
                    </button>
                    {/* ✨ AGORA ABRE O CHECKLIST EM VEZ DE FINALIZAR DIRETO ✨ */}
                    <button onClick={() => abrirConferencia(ordem)} style={{...styles.btnAcao, backgroundColor: '#27ae60', flex: 2}}>
                      <IoBarcodeOutline size={18} /> Conferir & Finalizar
                    </button>
                  </div>
                </div>
              )}
              
              {ordem.status === 'Concluída' && (
                <div style={{ backgroundColor: '#f9fbfb', padding: '10px', borderRadius: '6px', border: '1px solid #eafaf1' }}>
                  <div style={{ color: '#27ae60', fontWeight: 'bold', fontSize: '13px', marginBottom: '2px' }}>Concluído por {ordem.separador?.nome}</div>
                  {dataConclusaoFormatada && <div style={{ fontSize: '11px', color: '#7f8c8d' }}>Em: {dataConclusaoFormatada}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ✨ MODAL DO CHECKLIST DE CONFERÊNCIA (POKA-YOKE) ✨ */}
      {osEmConferencia && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '650px', backgroundColor: '#fdfefe'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #ecf0f1', paddingBottom: '15px', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: '0 0 5px 0', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IoBarcodeOutline color="#8e44ad" /> Checklist de Separação
                </h2>
                <p style={{ margin: 0, color: '#7f8c8d', fontSize: '13px' }}>Marque todos os itens recolhidos para liberar a conclusão da OS {osEmConferencia.codigo}.</p>
              </div>
              <span style={{ backgroundColor: '#eafaf1', color: '#27ae60', padding: '6px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold' }}>
                {itensConferidos.length} / {osEmConferencia.itens.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto', paddingRight: '5px' }}>
              {osEmConferencia.itens.map((item: any) => {
                const isConferido = itensConferidos.includes(item.id);
                return (
                  <div 
                    key={item.id} 
                    onClick={() => toggleItemConferido(item.id)}
                    style={{ ...styles.checklistItem, borderColor: isConferido ? '#27ae60' : '#ddd', backgroundColor: isConferido ? '#eafaf1' : 'white', opacity: isConferido ? 0.8 : 1 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <input type="checkbox" checked={isConferido} readOnly style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: isConferido ? '#27ae60' : '#2c3e50', textDecoration: isConferido ? 'line-through' : 'none' }}>
                          {item.produto.nome}
                        </div>
                        <div style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '4px' }}>
                          SKU: {item.produto.sku} <span style={{ margin: '0 5px' }}>|</span> 
                          Local: <strong style={{ color: '#e67e22' }}>{item.produto.enderecoLocalizacao || 'Estoque Geral'}</strong>
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: '900', color: isConferido ? '#27ae60' : '#0288D1' }}>
                      {item.quantidade} un
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '25px', paddingTop: '15px', borderTop: '1px solid #ecf0f1' }}>
              <button type="button" onClick={() => setOsEmConferencia(null)} style={{...styles.btnCancelar, backgroundColor: '#f1f2f6'}}>Cancelar e Voltar</button>
              
              <button 
                type="button" 
                disabled={itensConferidos.length !== osEmConferencia.itens.length}
                onClick={() => confirmarFinalizacao(osEmConferencia.id)} 
                style={{
                  ...styles.btnPrincipal, 
                  backgroundColor: itensConferidos.length === osEmConferencia.itens.length ? '#27ae60' : '#bdc3c7',
                  cursor: itensConferidos.length === osEmConferencia.itens.length ? 'pointer' : 'not-allowed'
                }}
              >
                <IoCheckmarkCircleOutline size={20} /> Concluir e Baixar Estoque
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VISUALIZAÇÃO DOS DETALHES (Somente Leitura, com Rota) */}
      {ordemSelecionada && !osEmConferencia && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '600px'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2 style={{ margin: '0', color: '#2c3e50' }}>Detalhes da Rota: {ordemSelecionada.codigo}</h2>
              <span style={{ backgroundColor: '#f1f2f6', color: '#7f8c8d', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{ordemSelecionada.tipo}</span>
            </div>
            
            <div style={{ backgroundColor: '#fdfefe', border: '1px solid #ecf0f1', borderRadius: '8px', padding: '5px', maxHeight: '350px', overflowY: 'auto' }}>
              {ordemSelecionada.itens.map((item: any, index: number) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid #eee', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#2c3e50' }}>{item.produto.nome}</span>
                    <span style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '3px' }}>
                      SKU: {item.produto.sku} | <span style={{fontWeight: 'bold'}}>Local: <span style={{ color: '#e67e22'}}>{item.produto.enderecoLocalizacao || 'Estoque Geral'}</span></span>
                    </span>
                  </div>
                  <span style={{ color: '#0288D1', fontWeight: '900', fontSize: '16px', whiteSpace: 'nowrap', marginLeft: '15px' }}>{item.quantidade} un</span>
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button type="button" onClick={() => setOrdemSelecionada(null)} style={{...styles.btnCancelar, backgroundColor: '#e0e0e0', color: '#333'}}>Fechar Detalhes</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CRIAÇÃO DA NOVA OS (AGORA COM PRIORIDADE) */}
      {modalNovaOrdem && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '650px', overflow: 'visible'}}>
            <h2 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>Gerar Nova Ordem de Serviço</h2>
            
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              {/* TIPO DE OS */}
              <div style={{ flex: 1, padding: '15px', backgroundColor: '#f9fbfb', borderRadius: '8px', border: '1px solid #ecf0f1' }}>
                <label style={styles.label}>Finalidade</label>
                <select style={styles.input} value={tipoOS} onChange={e => setTipoOS(e.target.value)}>
                  <option value="SAIDA">Saída (Retirada)</option>
                  <option value="ENTRADA">Entrada (Recebimento)</option>
                  <option value="DEVOLUCAO">Devolução (Retorno)</option>
                </select>
              </div>
              {/* PRIORIDADE */}
              <div style={{ flex: 1, padding: '15px', backgroundColor: prioridadeOS === 'Urgente' ? '#fdedec' : '#f9fbfb', borderRadius: '8px', border: prioridadeOS === 'Urgente' ? '1px solid #e74c3c' : '1px solid #ecf0f1' }}>
                <label style={{...styles.label, color: prioridadeOS === 'Urgente' ? '#c0392b' : '#34495e'}}>
                  {prioridadeOS === 'Urgente' ? <IoWarningOutline /> : null} Nível de Prioridade
                </label>
                <select style={{...styles.input, fontWeight: prioridadeOS === 'Urgente' ? 'bold' : 'normal', color: prioridadeOS === 'Urgente' ? '#c0392b' : '#333'}} value={prioridadeOS} onChange={e => setPrioridadeOS(e.target.value)}>
                  <option value="Normal">Normal</option>
                  <option value="Alta">Alta</option>
                  <option value="Urgente">Urgente (Imediato)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'flex-end' }}>
              <div style={{ flex: 3, position: 'relative' }}>
                <label style={styles.label}>Produto (Nome ou SKU)</label>
                <div style={{ position: 'relative' }}>
                  <IoSearchOutline size={18} color="#7f8c8d" style={{ position: 'absolute', left: '10px', top: '12px' }} />
                  <input type="text" style={{...styles.input, paddingLeft: '35px'}} placeholder="Pesquise..." value={buscaProduto} onChange={(e) => { setBuscaProduto(e.target.value); setProdutoSelecionado(''); setMostrarSugestoes(true); }} onFocus={() => setMostrarSugestoes(true)} onBlur={() => setTimeout(() => setMostrarSugestoes(false), 200)} />
                </div>
                {mostrarSugestoes && buscaProduto.length > 0 && (
                  <div style={styles.listaFlutuante}>
                    {produtosFiltrados.length === 0 ? <div style={{ padding: '15px', color: '#7f8c8d', textAlign: 'center', fontSize: '13px' }}>Nenhum produto encontrado.</div> : produtosFiltrados.map((p) => (
                      <div key={p.id} style={styles.itemFlutuante} onMouseDown={() => selecionarProdutoSugestao(p)}>
                        <span style={{ fontWeight: 'bold', color: '#2c3e50', display: 'block' }}>{p.nome}</span>
                        <span style={{ color: '#0288D1', fontSize: '11px', fontWeight: 'bold' }}>SKU: {p.sku} | Loc: {p.enderecoLocalizacao || '-'}</span>
                      </div>
                    ))}
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
  btnPrincipal: { backgroundColor: '#8e44ad', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' },
  card: { backgroundColor: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' },
  btnAcao: { color: 'white', border: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
  label: { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' },
  input: { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#white', outline: 'none' },
  inputFiltro: { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box', outline: 'none', cursor: 'pointer' },
  btnCancelar: { backgroundColor: '#f1f2f6', color: '#7f8c8d', border: 'none', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  listaFlutuante: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', marginTop: '5px', maxHeight: '220px', overflowY: 'auto', zIndex: 100, boxShadow: '0 10px 25px rgba(0,0,0,0.15)' },
  itemFlutuante: { padding: '12px 15px', borderBottom: '1px solid #f4f7f6', cursor: 'pointer', transition: 'background-color 0.2s', display: 'flex', flexDirection: 'column', gap: '2px' },
  tabsContainer: { display: 'flex', gap: '20px', marginBottom: '25px', borderBottom: '2px solid #ecf0f1', paddingBottom: '0px' },
  tabButton: { background: 'none', border: 'none', borderBottom: '3px solid transparent', padding: '10px 5px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', marginBottom: '-2px' },
  checklistItem: { border: '2px solid', padding: '15px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
};