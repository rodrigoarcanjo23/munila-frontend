import React, { useState, useEffect } from 'react';
import { 
  IoBeakerOutline, IoAddCircleOutline, IoCubeOutline, IoTrashOutline, 
  IoPencilOutline, IoCheckmarkOutline, IoCloseOutline, IoListOutline,
  IoSearchOutline, IoFilterOutline, IoTimeOutline, IoPersonOutline 
} from 'react-icons/io5';
import { toast } from 'react-toastify';
import { api } from '../api'; 

interface ItemEstoque {
  id: string;
  tipo: 'INSUMO' | 'ACABADO';
  sku: string;
  nome: string;
  quantidade: number;
}

interface IngredienteReceita {
  idInsumo: string;
  nomeInsumo: string;
  qtdPorUnidade: number;
}

interface LoteProduzido {
  id: string;
  codigoLote: string;
  produtoNome: string;
  produtoSku: string;
  quantidade: number;
  receitaUsada: (IngredienteReceita & { totalGasto: number })[];
  createdAt: string;
}

interface LogAuditoria {
  id: string;
  acao: 'Criação' | 'Exclusão';
  detalhes: string;
  usuario: string;
  dataHora: string;
}

export default function Transformacao() {
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);

  // Banco de Dados Real (conectado à API)
  const [estoque, setEstoque] = useState<ItemEstoque[]>([]);
  const [lotesProduzidos, setLotesProduzidos] = useState<LoteProduzido[]>([]);
  const [ingredientesReceita, setIngredientesReceita] = useState<IngredienteReceita[]>([]);
  const [auditoria, setAuditoria] = useState<LogAuditoria[]>([]);

  // Campos Nova MP
  const [novaMpNome, setNovaMpNome] = useState('');
  const [novaMpSku, setNovaMpSku] = useState('');
  const [novaMpQtd, setNovaMpQtd] = useState('');

  // Campos Edição MP
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editQtd, setEditQtd] = useState('');

  // Campos Receita e Transformação
  const [mpSelecionadaId, setMpSelecionadaId] = useState('');
  const [qtdMpGastaPorUnidade, setQtdMpGastaPorUnidade] = useState('1');
  const [nomeProdutoFinal, setNomeProdutoFinal] = useState('');
  const [skuProdutoFinal, setSkuProdutoFinal] = useState('');
  const [qtdLotesProduzir, setQtdLotesProduzir] = useState('1');

  // Filtros da Tabela de Estoque
  const [buscaEstoque, setBuscaEstoque] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  // 1. CARREGAR DADOS INICIAIS DO BANCO
  async function carregarDadosBanco() {
    try {
      setCarregando(true);
      const [resEstoque, resLotes, resAuditoria] = await Promise.all([
        api.get('/transformacao/estoque'),
        api.get('/transformacao/lotes'),
        api.get('/transformacao/auditoria')
      ]);
      setEstoque(resEstoque.data);
      setLotesProduzidos(resLotes.data);
      setAuditoria(resAuditoria.data);
    } catch (error) {
      toast.error("Erro ao carregar os dados do módulo.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    const userSalvo = localStorage.getItem('@Munila:user');
    if (userSalvo) setUsuarioLogado(JSON.parse(userSalvo));
    carregarDadosBanco();
  }, []);

  // Filtros Derivados para a UI
  const materiasPrimas = estoque.filter(item => item.tipo === 'INSUMO');
  const estoqueFiltrado = estoque.filter(item => {
    const matchBusca = item.nome.toLowerCase().includes(buscaEstoque.toLowerCase()) || item.sku.toLowerCase().includes(buscaEstoque.toLowerCase());
    const matchTipo = filtroTipo === '' || item.tipo === filtroTipo;
    return matchBusca && matchTipo;
  });

  // Validação de Duplicidade no Frontend antes de enviar
  function verificaDuplicidade(nome: string, sku: string, idIgnorado?: string): boolean {
    const nomeNormalizado = nome.toLowerCase().trim();
    const skuNormalizado = sku.toLowerCase().trim();
    return estoque.some(item => 
      item.id !== idIgnorado && 
      (item.nome.toLowerCase().trim() === nomeNormalizado || item.sku.toLowerCase().trim() === skuNormalizado)
    );
  }

  // ==========================================
  // CRUD DE MATÉRIA-PRIMA (COM API)
  // ==========================================
  async function adicionarMateriaPrima(e: React.FormEvent) {
    e.preventDefault();
    if (!novaMpNome || !novaMpSku || Number(novaMpQtd) <= 0) return toast.warn("Preencha Nome, SKU e Quantidade válida.");
    if (verificaDuplicidade(novaMpNome, novaMpSku)) return toast.error("Este Nome ou SKU já está cadastrado no módulo.");

    try {
      await api.post('/transformacao/estoque', {
        tipo: 'INSUMO', sku: novaMpSku, nome: novaMpNome, quantidade: Number(novaMpQtd)
      });
      toast.success("Insumo cadastrado e salvo no banco!");
      setNovaMpNome(''); setNovaMpSku(''); setNovaMpQtd('');
      carregarDadosBanco(); 
    } catch (error) {
      toast.error("Erro ao salvar insumo.");
    }
  }

  function iniciarEdicao(item: ItemEstoque) {
    setEditandoId(item.id);
    setEditNome(item.nome);
    setEditSku(item.sku);
    setEditQtd(item.quantidade.toString());
  }

  async function salvarEdicao(id: string) {
    if (!editNome || !editSku || Number(editQtd) < 0) return toast.warn("Dados inválidos para edição.");
    if (verificaDuplicidade(editNome, editSku, id)) return toast.error("Este Nome ou SKU já está em uso por outro item.");

    try {
      await api.put(`/transformacao/estoque/${id}`, {
        nome: editNome, sku: editSku, quantidade: Number(editQtd)
      });
      toast.success("Insumo atualizado no banco!");
      setEditandoId(null);
      carregarDadosBanco();
    } catch (error) {
      toast.error("Erro ao atualizar item.");
    }
  }

  async function removerItem(id: string) {
    if(ingredientesReceita.some(ing => ing.idInsumo === id)) return toast.error("Este insumo está em uso na receita atual!");
    
    if(window.confirm("Deseja realmente apagar este item permanentemente?")) {
      try {
        await api.delete(`/transformacao/estoque/${id}`);
        toast.info("Item removido do módulo de transformação.");
        carregarDadosBanco();
      } catch (error) {
        toast.error("Erro ao remover item.");
      }
    }
  }

  // ==========================================
  // MONTAR RECEITA (NÃO PRECISA DE API AINDA)
  // ==========================================
  function adicionarInsumoNaReceita() {
    if (!mpSelecionadaId || Number(qtdMpGastaPorUnidade) <= 0) return toast.warn("Selecione um insumo e a quantidade gasta.");
    const mp = estoque.find(m => m.id === mpSelecionadaId);
    if (!mp) return;

    const ingredienteExistente = ingredientesReceita.find(ing => ing.idInsumo === mp.id);
    if (ingredienteExistente) {
      setIngredientesReceita(ingredientesReceita.map(ing => 
        ing.idInsumo === mp.id ? { ...ing, qtdPorUnidade: ing.qtdPorUnidade + Number(qtdMpGastaPorUnidade) } : ing
      ));
    } else {
      setIngredientesReceita([...ingredientesReceita, { idInsumo: mp.id, nomeInsumo: mp.nome, qtdPorUnidade: Number(qtdMpGastaPorUnidade) }]);
    }
    setMpSelecionadaId(''); setQtdMpGastaPorUnidade('1');
  }

  function removerInsumoDaReceita(idInsumo: string) {
    setIngredientesReceita(ingredientesReceita.filter(ing => ing.idInsumo !== idInsumo));
  }

  // ==========================================
  // MOTOR DE TRANSFORMAÇÃO (SALVANDO NO BANCO)
  // ==========================================
  async function executarTransformacao(e: React.FormEvent) {
    e.preventDefault();
    if (ingredientesReceita.length === 0) return toast.warn("Sua receita está vazia! Adicione insumos primeiro.");
    if (!nomeProdutoFinal || !skuProdutoFinal || Number(qtdLotesProduzir) <= 0) return toast.warn("Preencha o Nome, SKU e a quantidade a fabricar.");

    const totalAProduzir = Number(qtdLotesProduzir);
    const nomeNormalizado = nomeProdutoFinal.toLowerCase().trim();
    const skuNormalizado = skuProdutoFinal.toLowerCase().trim();

    const itemExistente = estoque.find(i => i.nome.toLowerCase().trim() === nomeNormalizado || i.sku.toLowerCase().trim() === skuNormalizado);
    if (itemExistente) {
      if (itemExistente.tipo === 'INSUMO') return toast.error("Este Nome/SKU já pertence a um Insumo.");
      if (itemExistente.nome.toLowerCase().trim() !== nomeNormalizado || itemExistente.sku.toLowerCase().trim() !== skuNormalizado) {
        return toast.error("O Nome e o SKU não combinam com o registro existente deste produto.");
      }
    }

    for (const ing of ingredientesReceita) {
      const mp = estoque.find(m => m.id === ing.idInsumo);
      const necessidade = ing.qtdPorUnidade * totalAProduzir;
      if (!mp || mp.quantidade < necessidade) {
        return toast.error(`Saldo insuficiente de ${ing.nomeInsumo}! Necessário: ${necessidade} un.`);
      }
    }

    const receitaComGastos = ingredientesReceita.map(ing => ({
      ...ing,
      totalGasto: ing.qtdPorUnidade * totalAProduzir
    }));

    try {
      const toastId = toast.loading("Processando produção no banco de dados...");
      await api.post('/transformacao/lotes', {
        produtoNome: nomeProdutoFinal,
        produtoSku: skuProdutoFinal,
        quantidade: totalAProduzir,
        receitaUsada: receitaComGastos,
        usuario: usuarioLogado?.nome
      });
      
      toast.update(toastId, { render: `Sucesso! ${totalAProduzir}x ${nomeProdutoFinal} fabricados.`, type: "success", isLoading: false, autoClose: 3000 });
      setIngredientesReceita([]); setNomeProdutoFinal(''); setSkuProdutoFinal(''); setQtdLotesProduzir('1');
      carregarDadosBanco(); 
    } catch (error) {
      toast.dismiss();
      toast.error("Erro interno ao processar a produção.");
    }
  }

  // ==========================================
  // ESTORNO DE LOTE (COM API)
  // ==========================================
  async function desfazerTransformacao(idLote: string) {
    if(window.confirm("Deseja cancelar este lote e devolver os insumos gastos?")) {
      try {
        const toastId = toast.loading("Estornando lote...");
        await api.delete(`/transformacao/lotes/${idLote}`, {
          data: { usuario: usuarioLogado?.nome }
        });
        toast.update(toastId, { render: "Lote desfeito e estoque restaurado!", type: "info", isLoading: false, autoClose: 3000 });
        carregarDadosBanco();
      } catch (error) {
        toast.dismiss();
        toast.error("Erro ao tentar desfazer o lote.");
      }
    }
  }

  if (carregando && estoque.length === 0) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#7f8c8d' }}>Carregando módulo de transformação...</div>;

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px' }}>
        <div style={{ backgroundColor: '#f4ecf7', padding: '10px', borderRadius: '50%' }}>
          <IoBeakerOutline size={28} color="#8e44ad" />
        </div>
        <div>
          <h1 style={{ color: '#2c3e50', margin: 0, fontSize: '24px' }}>Transformação de Produtos</h1>
          <p style={{ margin: 0, color: '#7f8c8d', fontSize: '13px' }}>Módulo oficial de conversão de insumos, receitas de produção e rastreabilidade de lotes.</p>
        </div>
      </div>

      <div style={styles.gridContainer}>
        
        {/* COLUNA 1: MATÉRIA-PRIMA */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>1. Insumos (Matéria-Prima)</h2>
          <form onSubmit={adicionarMateriaPrima} style={styles.addForm}>
            <input type="text" placeholder="Nome (ex: Tecido Azul)" style={styles.input} value={novaMpNome} onChange={e => setNovaMpNome(e.target.value)} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <input type="text" placeholder="SKU" style={{...styles.input, flex: 2}} value={novaMpSku} onChange={e => setNovaMpSku(e.target.value)} />
              <input type="number" placeholder="Qtd." style={{...styles.input, flex: 1.5}} value={novaMpQtd} onChange={e => setNovaMpQtd(e.target.value)} min="1" />
            </div>
            <button type="submit" style={{...styles.btnSecundario, width: '100%', marginTop: '10px', justifyContent: 'center', padding: '12px'}}><IoAddCircleOutline size={20} /> Cadastrar Insumo</button>
          </form>

          <div style={styles.lista}>
            {materiasPrimas.length === 0 && <p style={styles.emptyText}>Nenhum insumo cadastrado neste módulo.</p>}
            {materiasPrimas.map(mp => (
              <div key={mp.id} style={styles.listItem}>
                {editandoId === mp.id ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <input type="text" style={styles.inputPequeno} value={editNome} onChange={e => setEditNome(e.target.value)} />
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <input type="text" placeholder="SKU" style={styles.inputPequeno} value={editSku} onChange={e => setEditSku(e.target.value)} />
                      <input type="number" style={styles.inputPequeno} value={editQtd} onChange={e => setEditQtd(e.target.value)} />
                      <button onClick={() => salvarEdicao(mp.id)} style={{...styles.btnAcaoIcon, backgroundColor: '#27ae60', color: 'white', borderRadius: '4px'}}><IoCheckmarkOutline/></button>
                      <button onClick={() => setEditandoId(null)} style={{...styles.btnAcaoIcon, backgroundColor: '#95a5a6', color: 'white', borderRadius: '4px'}}><IoCloseOutline/></button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: '#2c3e50', display: 'block', fontSize: '14px' }}>{mp.nome}</strong>
                      <span style={{ color: '#0288D1', fontWeight: 'bold', fontSize: '12px', marginRight: '10px' }}>SKU: {mp.sku}</span>
                      <span style={{ color: '#2c3e50', fontSize: '12px' }}>Saldo: <strong>{mp.quantidade}</strong></span>
                    </div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button onClick={() => iniciarEdicao(mp)} style={{...styles.btnAcaoIcon, color: '#f39c12'}}><IoPencilOutline size={18} /></button>
                      <button onClick={() => removerItem(mp.id)} style={{...styles.btnAcaoIcon, color: '#e74c3c'}}><IoTrashOutline size={18} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* COLUNA 2: MONTAR RECEITA E TRANSFORMAR */}
        <div style={{...styles.card, border: '2px solid #8e44ad', backgroundColor: '#fafbfc', boxShadow: '0 10px 25px rgba(142, 68, 173, 0.1)'}}>
          <h2 style={{...styles.cardTitle, color: '#8e44ad', borderBottomColor: '#e8d4f4'}}>2. Motor de Transformação</h2>
          
          <div style={{ backgroundColor: '#f4ecf7', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
            <label style={styles.label}>Insumos para gerar 1 unidade final:</label>
            <select style={{...styles.input, marginBottom: '10px'}} value={mpSelecionadaId} onChange={e => setMpSelecionadaId(e.target.value)}>
              <option value="">Selecione um insumo...</option>
              {materiasPrimas.map(mp => (
                <option key={mp.id} value={mp.id}>[{mp.sku}] {mp.nome} (Saldo: {mp.quantidade})</option>
              ))}
            </select>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="number" style={{...styles.input, width: '100px', textAlign: 'center'}} value={qtdMpGastaPorUnidade} onChange={e => setQtdMpGastaPorUnidade(e.target.value)} min="0.01" step="0.01" />
              <button type="button" onClick={adicionarInsumoNaReceita} style={{...styles.btnSecundario, backgroundColor: '#8e44ad', padding: '10px 15px', flex: 1, justifyContent: 'center'}}>
                <IoAddCircleOutline size={18} /> Adicionar à Receita
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '20px', minHeight: '90px', border: '1px dashed #bdc3c7', borderRadius: '8px', padding: '10px', backgroundColor: 'white' }}>
            {ingredientesReceita.length === 0 && <p style={{ fontSize: '12px', color: '#bdc3c7', textAlign: 'center', margin: '15px 0' }}>Sua receita está vazia.</p>}
            {ingredientesReceita.map((ing) => (
              <div key={ing.idInsumo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f4f7f6' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#2c3e50' }}>{ing.nomeInsumo}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', color: '#e74c3c', fontWeight: 'bold' }}>-{ing.qtdPorUnidade} un</span>
                  <button type="button" onClick={() => removerInsumoDaReceita(ing.idInsumo)} style={{...styles.btnAcaoIcon, color: '#e74c3c'}}><IoCloseOutline size={16}/></button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={executarTransformacao} style={{ borderTop: '2px solid #e8d4f4', paddingTop: '15px' }}>
            <label style={styles.label}>Produto Final:</label>
            <input type="text" placeholder="Nome (Ex: Pack Lenço)" style={{...styles.input, marginBottom: '10px'}} value={nomeProdutoFinal} onChange={e => setNomeProdutoFinal(e.target.value)} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 2 }}>
                <label style={styles.label}>SKU Final:</label>
                <input type="text" placeholder="SKU" style={styles.input} value={skuProdutoFinal} onChange={e => setSkuProdutoFinal(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Qtd Lotes:</label>
                <input type="number" style={{...styles.input, fontWeight: 'bold', color: '#8e44ad'}} value={qtdLotesProduzir} onChange={e => setQtdLotesProduzir(e.target.value)} min="1" />
              </div>
            </div>
            
            <button type="submit" style={styles.btnAcaoTransformar}>Fabricar Produto <IoCubeOutline size={20} /></button>
          </form>
        </div>

        {/* COLUNA 3: HISTÓRICO DE PRODUÇÃO */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>3. Lotes Fabricados</h2>
          <div style={styles.lista}>
            {lotesProduzidos.length === 0 && <p style={styles.emptyText}>Nenhum lote fabricado ainda.</p>}
            {lotesProduzidos.map(lote => (
              <div key={lote.id} style={{...styles.listItem, backgroundColor: '#eafaf1', borderColor: '#27ae60', flexDirection: 'column', alignItems: 'stretch'}}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <IoCubeOutline size={22} color="#27ae60" />
                    <div>
                      <strong style={{ color: '#27ae60', display: 'block', fontSize: '14px' }}>{lote.produtoNome}</strong>
                      <span style={{ color: '#2c3e50', fontSize: '11px' }}>Lote <strong style={{color: '#34495e'}}>{lote.codigoLote}</strong> gerou: <strong>{lote.quantidade} un</strong></span>
                    </div>
                  </div>
                  <button onClick={() => desfazerTransformacao(lote.id)} title="Desfazer Lote" style={{...styles.btnAcaoIcon, backgroundColor: '#fdedec', color: '#c0392b', padding: '6px', borderRadius: '6px'}}><IoTrashOutline size={16} /></button>
                </div>
                
                <div style={{ backgroundColor: '#fff', padding: '8px', borderRadius: '6px', border: '1px dashed #2ecc71' }}>
                  <span style={{ fontSize: '10px', color: '#7f8c8d', fontWeight: 'bold', textTransform: 'uppercase' }}>Insumos Gastos no Lote:</span>
                  {lote.receitaUsada.map(ing => (
                    <div key={ing.idInsumo} style={{ fontSize: '11px', color: '#34495e', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{ing.nomeInsumo}</span><strong style={{color: '#e74c3c'}}>-{ing.totalGasto}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ÁREA INFERIOR: ESTOQUE E AUDITORIA LADO A LADO */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '30px' }}>
        
        {/* TABELA DE ESTOQUE VIRTUAL */}
        <div style={{ flex: '2 1 600px', ...styles.card }}>
          <h2 style={{ ...styles.cardTitle, borderBottom: 'none', marginBottom: '15px' }}>📦 Estoque de Transformação Consolidado</h2>
          
          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <IoSearchOutline style={{ position: 'absolute', left: '12px', top: '12px', color: '#95a5a6' }} size={18} />
              <input type="text" placeholder="Buscar por Nome ou SKU..." value={buscaEstoque} onChange={e => setBuscaEstoque(e.target.value)} style={{...styles.inputFiltro, paddingLeft: '40px'}} />
            </div>
            <div style={{ position: 'relative', width: '200px' }}>
              <IoFilterOutline style={{ position: 'absolute', left: '12px', top: '12px', color: '#95a5a6' }} size={18} />
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{...styles.inputFiltro, paddingLeft: '40px'}}>
                <option value="">Todos os Tipos</option>
                <option value="INSUMO">Matéria-Prima</option>
                <option value="ACABADO">Produto Acabado</option>
              </select>
            </div>
          </div>

          <div style={styles.tabelaContainer}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th style={styles.th}>Tipo</th>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Nome do Produto</th>
                  <th style={{...styles.th, textAlign: 'right'}}>Saldo Atual</th>
                  <th style={{...styles.th, textAlign: 'center'}}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {estoqueFiltrado.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: '#7f8c8d' }}>Nenhum item encontrado no estoque.</td></tr>}
                {estoqueFiltrado.map((item) => (
                  <tr key={item.id} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, backgroundColor: item.tipo === 'INSUMO' ? '#e1f5fe' : '#eafaf1', color: item.tipo === 'INSUMO' ? '#0288D1' : '#27ae60' }}>
                        {item.tipo === 'INSUMO' ? 'Matéria-Prima' : 'Acabado'}
                      </span>
                    </td>
                    <td style={styles.td}><strong>{item.sku}</strong></td>
                    <td style={styles.td}>{item.nome}</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: '900', fontSize: '16px', color: item.quantidade === 0 ? '#e74c3c' : '#2c3e50' }}>
                      {item.quantidade}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                        <button onClick={() => iniciarEdicao(item)} style={{...styles.btnAcaoIcon, color: '#f39c12'}}><IoPencilOutline size={18} /></button>
                        <button onClick={() => removerItem(item.id)} style={{...styles.btnAcaoIcon, color: '#e74c3c'}}><IoTrashOutline size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* LOG DE AUDITORIA */}
        <div style={{ flex: '1 1 300px', ...styles.card, backgroundColor: '#2c3e50', color: 'white' }}>
          <h2 style={{ ...styles.cardTitle, color: 'white', borderBottomColor: '#34495e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IoTimeOutline size={20} /> Auditoria de Produção
          </h2>
          
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '400px', paddingRight: '5px' }}>
            {auditoria.length === 0 && <p style={{ textAlign: 'center', color: '#95a5a6', fontSize: '13px', marginTop: '20px' }}>Nenhuma ação registrada no banco.</p>}
            
            {auditoria.map(log => (
              <div key={log.id} style={{ marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #34495e' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: log.acao === 'Criação' ? '#2ecc71' : '#e74c3c', textTransform: 'uppercase' }}>
                    {log.acao}
                  </span>
                  <span style={{ fontSize: '11px', color: '#95a5a6' }}>
                    {new Date(log.dataHora).toLocaleTimeString()}
                  </span>
                </div>
                <p style={{ margin: '0 0 8px 0', fontSize: '13px', lineHeight: '1.4', color: '#ecf0f1' }}>{log.detalhes}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#bdc3c7', fontSize: '11px' }}>
                  <IoPersonOutline /> <span>{log.usuario}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  gridContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' },
  card: { backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' },
  cardTitle: { margin: '0 0 20px 0', fontSize: '16px', color: '#2c3e50', borderBottom: '2px solid #ecf0f1', paddingBottom: '10px' },
  addForm: { backgroundColor: '#f9fbfb', padding: '15px', borderRadius: '8px', border: '1px solid #ecf0f1', marginBottom: '15px' },
  input: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box', outline: 'none' },
  inputFiltro: { width: '100%', padding: '10px 15px', borderRadius: '6px', border: '1px solid #ecf0f1', fontSize: '13px', boxSizing: 'border-box', outline: 'none', backgroundColor: '#f9fbfb' },
  inputPequeno: { width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #bdc3c7', fontSize: '12px', boxSizing: 'border-box' },
  btnSecundario: { backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' },
  btnAcaoIcon: { background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  label: { display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#7f8c8d', marginBottom: '5px' },
  lista: { flex: 1, overflowY: 'auto', maxHeight: '420px' },
  emptyText: { textAlign: 'center', color: '#bdc3c7', fontSize: '13px', marginTop: '30px' },
  listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid #ecf0f1', borderRadius: '8px', marginBottom: '10px', backgroundColor: '#fff' },
  btnAcaoTransformar: { backgroundColor: '#8e44ad', width: '100%', color: 'white', border: 'none', padding: '15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '20px', boxShadow: '0 4px 10px rgba(142, 68, 173, 0.3)' },
  tabelaContainer: { backgroundColor: 'white', borderRadius: '8px', border: '1px solid #ecf0f1', overflow: 'hidden' },
  th: { padding: '15px', backgroundColor: '#f9fbfb', color: '#7f8c8d', borderBottom: '2px solid #ecf0f1', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '1px' },
  tr: { borderBottom: '1px solid #ecf0f1', transition: '0.2s' },
  td: { padding: '12px 15px', color: '#2c3e50', fontSize: '13px', verticalAlign: 'middle' },
  badge: { padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }
};