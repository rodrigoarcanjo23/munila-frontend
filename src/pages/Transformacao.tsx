import React, { useState, useEffect } from 'react';
import { 
  IoBeakerOutline, IoAddCircleOutline, IoCubeOutline, IoTrashOutline, 
  IoPencilOutline, IoCheckmarkOutline, IoCloseOutline,
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
  lote?: string;
}

interface IngredienteReceita {
  idInsumo: string;
  nomeInsumo: string;
  qtdPorUnidade: number;
}

interface LogAuditoria {
  id: string;
  acao: 'Criação' | 'Exclusão' | 'Edição';
  detalhes: string;
  usuario: string;
  dataHora: string;
  loteInfo?: string; 
  quantidadeInfo?: number; 
}

export default function Transformacao() {
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);

  const [estoque, setEstoque] = useState<ItemEstoque[]>([]);
  const [ingredientesReceita, setIngredientesReceita] = useState<IngredienteReceita[]>([]);
  const [auditoria, setAuditoria] = useState<LogAuditoria[]>([]);

  // Campos Insumo
  const [novaMpNome, setNovaMpNome] = useState('');
  const [novaMpSku, setNovaMpSku] = useState('');
  const [novaMpLote, setNovaMpLote] = useState('');
  const [novaMpQtd, setNovaMpQtd] = useState('');

  // Campos Edição Universal (MP e Acabado)
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editLote, setEditLote] = useState('');
  const [editQtd, setEditQtd] = useState('');

  // Motor de Transformação
  const [mpSelecionadaId, setMpSelecionadaId] = useState('');
  const [qtdMpGastaPorUnidade, setQtdMpGastaPorUnidade] = useState('1');
  const [nomeProdutoFinal, setNomeProdutoFinal] = useState('');
  const [skuProdutoFinal, setSkuProdutoFinal] = useState('');
  const [loteProdutoFinal, setLoteProdutoFinal] = useState(''); 
  const [qtdLotesProduzir, setQtdLotesProduzir] = useState('1');

  // Filtros
  const [buscaEstoque, setBuscaEstoque] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [buscaAuditoria, setBuscaAuditoria] = useState('');

  async function carregarDadosBanco() {
    try {
      setCarregando(true);
      const [resEstoque, resAuditoria] = await Promise.all([
        api.get('/transformacao/estoque'),
        api.get('/transformacao/auditoria') 
      ]);
      setEstoque(resEstoque.data);
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

  const materiasPrimas = estoque.filter(item => item.tipo === 'INSUMO');
  
  const estoqueFiltrado = estoque.filter(item => {
    const matchBusca = item.nome.toLowerCase().includes(buscaEstoque.toLowerCase()) || 
                       item.sku.toLowerCase().includes(buscaEstoque.toLowerCase()) ||
                       (item.lote && item.lote.toLowerCase().includes(buscaEstoque.toLowerCase()));
    const matchTipo = filtroTipo === '' || item.tipo === filtroTipo;
    return matchBusca && matchTipo;
  });

  const auditoriaFiltrada = auditoria.filter(log => {
    const termo = buscaAuditoria.toLowerCase();
    return log.detalhes.toLowerCase().includes(termo) ||
           log.usuario.toLowerCase().includes(termo) ||
           (log.loteInfo && log.loteInfo.toLowerCase().includes(termo));
  });

  function verificaDuplicidade(nome: string, sku: string, idIgnorado?: string): boolean {
    const nomeNormalizado = nome.toLowerCase().trim();
    const skuNormalizado = sku.toLowerCase().trim();
    return estoque.some(item => 
      item.id !== idIgnorado && 
      (item.nome.toLowerCase().trim() === nomeNormalizado || item.sku.toLowerCase().trim() === skuNormalizado)
    );
  }

  async function adicionarMateriaPrima(e: React.FormEvent) {
    e.preventDefault();
    if (!novaMpNome || !novaMpSku || Number(novaMpQtd) <= 0) return toast.warn("Preencha Nome, SKU e Quantidade.");
    if (verificaDuplicidade(novaMpNome, novaMpSku)) return toast.error("Este Nome ou SKU já está cadastrado.");

    try {
      await api.post('/transformacao/estoque', {
        tipo: 'INSUMO', sku: novaMpSku, nome: novaMpNome, quantidade: Number(novaMpQtd), lote: novaMpLote
      });
      toast.success("Insumo cadastrado!");
      setNovaMpNome(''); setNovaMpSku(''); setNovaMpQtd(''); setNovaMpLote('');
      carregarDadosBanco(); 
    } catch (error) { toast.error("Erro ao salvar insumo."); }
  }

  function iniciarEdicao(item: ItemEstoque) {
    setEditandoId(item.id);
    setEditNome(item.nome);
    setEditSku(item.sku);
    setEditLote(item.lote || '');
    setEditQtd(item.quantidade.toString());
  }

  async function salvarEdicao(id: string) {
    if (!editNome || !editSku || Number(editQtd) < 0) return toast.warn("Dados inválidos para edição.");
    if (verificaDuplicidade(editNome, editSku, id)) return toast.error("Nome ou SKU já em uso.");

    try {
      await api.put(`/transformacao/estoque/${id}`, {
        nome: editNome, sku: editSku, quantidade: Number(editQtd), lote: editLote
      });
      toast.success("Item atualizado com sucesso!");
      setEditandoId(null);
      carregarDadosBanco();
    } catch (error) { toast.error("Erro ao atualizar item."); }
  }

  async function removerItem(id: string) {
    if(ingredientesReceita.some(ing => ing.idInsumo === id)) return toast.error("Este insumo está na receita atual!");
    if(window.confirm("Deseja realmente apagar este item permanentemente?")) {
      try {
        await api.delete(`/transformacao/estoque/${id}`);
        toast.info("Item removido.");
        carregarDadosBanco();
      } catch (error) { toast.error("Erro ao remover item."); }
    }
  }

  function selecionarProdutoExistente(produtoId: string) {
    const produto = estoque.find(i => i.id === produtoId);
    if(produto) {
      setNomeProdutoFinal(produto.nome);
      setSkuProdutoFinal(produto.sku);
      setLoteProdutoFinal(produto.lote || '');
    }
  }

  function adicionarInsumoNaReceita() {
    if (!mpSelecionadaId || Number(qtdMpGastaPorUnidade) <= 0) return toast.warn("Selecione um insumo e a quantidade gasta.");
    const mp = estoque.find(m => m.id === mpSelecionadaId);
    if (!mp) return;

    const ingExistente = ingredientesReceita.find(ing => ing.idInsumo === mp.id);
    if (ingExistente) {
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

  async function executarTransformacao(e: React.FormEvent) {
    e.preventDefault();
    if (ingredientesReceita.length === 0) return toast.warn("A receita está vazia!");
    if (!nomeProdutoFinal || !skuProdutoFinal || Number(qtdLotesProduzir) <= 0) return toast.warn("Preencha Nome, SKU e Quantidade a fabricar.");
    if (!loteProdutoFinal) return toast.warn("O número do Lote é obrigatório.");

    const totalAProduzir = Number(qtdLotesProduzir);
    const nomeNormalizado = nomeProdutoFinal.toLowerCase().trim();
    const skuNormalizado = skuProdutoFinal.toLowerCase().trim();

    const itemExistente = estoque.find(i => i.nome.toLowerCase().trim() === nomeNormalizado || i.sku.toLowerCase().trim() === skuNormalizado);
    if (itemExistente && itemExistente.tipo === 'INSUMO') return toast.error("Este Nome/SKU já pertence a um Insumo.");

    for (const ing of ingredientesReceita) {
      const mp = estoque.find(m => m.id === ing.idInsumo);
      const necessidade = ing.qtdPorUnidade * totalAProduzir;
      if (!mp || mp.quantidade < necessidade) {
        return toast.error(`Saldo insuficiente de ${ing.nomeInsumo}! Necessário: ${necessidade} un.`);
      }
    }

    const receitaComGastos = ingredientesReceita.map(ing => ({ ...ing, totalGasto: ing.qtdPorUnidade * totalAProduzir }));

    try {
      const toastId = toast.loading("Processando produção...");
      await api.post('/transformacao/lotes', {
        produtoNome: nomeProdutoFinal,
        produtoSku: skuProdutoFinal,
        quantidade: totalAProduzir,
        codigoLote: loteProdutoFinal,
        receitaUsada: receitaComGastos,
        usuario: usuarioLogado?.nome
      });
      
      toast.update(toastId, { render: `Sucesso! Fabricados ${totalAProduzir}x ${nomeProdutoFinal} (Lote: ${loteProdutoFinal}).`, type: "success", isLoading: false, autoClose: 3000 });
      setIngredientesReceita([]); setNomeProdutoFinal(''); setSkuProdutoFinal(''); setQtdLotesProduzir('1'); setLoteProdutoFinal('');
      carregarDadosBanco(); 
    } catch (error) {
      toast.dismiss();
      toast.error("Erro ao processar a produção.");
    }
  }

  if (carregando && estoque.length === 0) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#7f8c8d' }}>Carregando módulo...</div>;

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px' }}>
        <div style={{ backgroundColor: '#f4ecf7', padding: '10px', borderRadius: '50%' }}>
          <IoBeakerOutline size={28} color="#8e44ad" />
        </div>
        <div>
          <h1 style={{ color: '#2c3e50', margin: 0, fontSize: '24px' }}>Transformação de Produtos</h1>
          <p style={{ margin: 0, color: '#7f8c8d', fontSize: '13px' }}>Módulo oficial de conversão de insumos, produção e rastreabilidade de lotes.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' }}>
        
        {/* COLUNA 1: MATÉRIA-PRIMA */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>1. Insumos (Matéria-Prima)</h2>
          <form onSubmit={adicionarMateriaPrima} style={styles.addForm}>
            <input type="text" placeholder="Nome (ex: Tecido Azul)" style={styles.input} value={novaMpNome} onChange={e => setNovaMpNome(e.target.value)} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <input type="text" placeholder="SKU" style={{...styles.input, flex: 1.5}} value={novaMpSku} onChange={e => setNovaMpSku(e.target.value)} />
              <input type="text" placeholder="Lote (Opcional)" style={{...styles.input, flex: 1.5}} value={novaMpLote} onChange={e => setNovaMpLote(e.target.value)} />
              <input type="number" placeholder="Qtd." style={{...styles.input, flex: 1}} value={novaMpQtd} onChange={e => setNovaMpQtd(e.target.value)} min="1" />
            </div>
            <button type="submit" style={{...styles.btnSecundario, width: '100%', marginTop: '10px', justifyContent: 'center', padding: '12px'}}><IoAddCircleOutline size={20} /> Cadastrar Insumo</button>
          </form>

          <div style={styles.lista}>
            {materiasPrimas.length === 0 && <p style={styles.emptyText}>Nenhum insumo cadastrado.</p>}
            {materiasPrimas.map(mp => (
              <div key={mp.id} style={styles.listItem}>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: '#2c3e50', display: 'block', fontSize: '14px' }}>{mp.nome}</strong>
                  <span style={{ color: '#0288D1', fontWeight: 'bold', fontSize: '12px', marginRight: '10px' }}>SKU: {mp.sku}</span>
                  {mp.lote && <span style={{ color: '#e67e22', fontSize: '12px', marginRight: '10px' }}>Lote: {mp.lote}</span>}
                  <span style={{ color: '#2c3e50', fontSize: '12px' }}>Saldo: <strong>{mp.quantidade}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* COLUNA 2: MOTOR DE TRANSFORMAÇÃO */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
               <label style={styles.label}>Produto Final:</label>
               <select 
                  style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #bdc3c7', outline: 'none', backgroundColor: '#fff', color: '#34495e', fontWeight: 'bold', cursor: 'pointer' }}
                  onChange={e => selecionarProdutoExistente(e.target.value)}
               >
                  <option value="">Repetir um produto já existente?</option>
                  {estoque.filter(i => i.tipo === 'ACABADO').map(p => (
                     <option key={p.id} value={p.id}>{p.nome} (Lote: {p.lote || 'S/L'})</option>
                  ))}
               </select>
            </div>
            <input type="text" placeholder="Nome (Ex: Pack Lenço)" style={{...styles.input, marginBottom: '10px'}} value={nomeProdutoFinal} onChange={e => setNomeProdutoFinal(e.target.value)} />
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <div style={{ flex: 1.5 }}>
                <label style={styles.label}>SKU Final:</label>
                <input type="text" placeholder="SKU" style={styles.input} value={skuProdutoFinal} onChange={e => setSkuProdutoFinal(e.target.value)} />
              </div>
              <div style={{ flex: 1.5 }}>
                <label style={styles.label}>Nº do Lote:</label>
                <input type="text" placeholder="Ex: L-2026" style={styles.input} value={loteProdutoFinal} onChange={e => setLoteProdutoFinal(e.target.value)} required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Qtd a Fabricar:</label>
                <input type="number" style={{...styles.input, fontWeight: 'bold', color: '#8e44ad'}} value={qtdLotesProduzir} onChange={e => setQtdLotesProduzir(e.target.value)} min="1" />
              </div>
            </div>
            <button type="submit" style={styles.btnAcaoTransformar}>Fabricar Produto <IoCubeOutline size={20} /></button>
          </form>
        </div>
      </div>

      {/* ✨ LAYOUT ATUALIZADO: COLUNADO E 100% LARGURA ✨ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', marginTop: '30px' }}>
        
        {/* TABELA DE ESTOQUE VIRTUAL */}
        <div style={styles.card}>
          <h2 style={{ ...styles.cardTitle, borderBottom: 'none', marginBottom: '15px' }}>📦 Estoque de Transformação Consolidado</h2>
          
          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <IoSearchOutline style={{ position: 'absolute', left: '12px', top: '12px', color: '#95a5a6' }} size={18} />
              <input type="text" placeholder="Buscar por Nome, SKU ou Lote..." value={buscaEstoque} onChange={e => setBuscaEstoque(e.target.value)} style={{...styles.inputFiltro, paddingLeft: '40px'}} />
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
                  <th style={styles.th}>Lote</th>
                  <th style={{...styles.th, textAlign: 'right'}}>Saldo Atual</th>
                  <th style={{...styles.th, textAlign: 'center'}}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {estoqueFiltrado.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: '#7f8c8d' }}>Nenhum item encontrado.</td></tr>}
                {estoqueFiltrado.map((item) => (
                  <tr key={item.id} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, backgroundColor: item.tipo === 'INSUMO' ? '#e1f5fe' : '#eafaf1', color: item.tipo === 'INSUMO' ? '#0288D1' : '#27ae60' }}>
                        {item.tipo === 'INSUMO' ? 'Matéria-Prima' : 'Acabado'}
                      </span>
                    </td>
                    
                    {editandoId === item.id ? (
                      <>
                        <td style={styles.td}><input type="text" style={styles.inputPequeno} value={editSku} onChange={e=>setEditSku(e.target.value)}/></td>
                        <td style={styles.td}><input type="text" style={styles.inputPequeno} value={editNome} onChange={e=>setEditNome(e.target.value)}/></td>
                        <td style={styles.td}><input type="text" style={styles.inputPequeno} value={editLote} onChange={e=>setEditLote(e.target.value)} placeholder="Lote"/></td>
                        <td style={{...styles.td, textAlign: 'right'}}><input type="number" style={{...styles.inputPequeno, width: '80px', textAlign: 'right'}} value={editQtd} onChange={e=>setEditQtd(e.target.value)}/></td>
                        <td style={{ ...styles.td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '5px' }}>
                             <button onClick={() => salvarEdicao(item.id)} style={{...styles.btnAcaoIcon, backgroundColor: '#27ae60', color: 'white', borderRadius: '4px'}}><IoCheckmarkOutline/></button>
                             <button onClick={() => setEditandoId(null)} style={{...styles.btnAcaoIcon, backgroundColor: '#95a5a6', color: 'white', borderRadius: '4px'}}><IoCloseOutline/></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={styles.td}><strong>{item.sku}</strong></td>
                        <td style={styles.td}>{item.nome}</td>
                        <td style={styles.td}><span style={{color: '#e67e22', fontWeight: 'bold'}}>{item.lote || '-'}</span></td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: '900', fontSize: '16px', color: item.quantidade === 0 ? '#e74c3c' : '#2c3e50' }}>
                          {item.quantidade}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                            <button onClick={() => iniciarEdicao(item)} style={{...styles.btnAcaoIcon, color: '#f39c12'}} title="Editar Item"><IoPencilOutline size={18} /></button>
                            <button onClick={() => removerItem(item.id)} style={{...styles.btnAcaoIcon, color: '#e74c3c'}} title="Excluir Item"><IoTrashOutline size={18} /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RELATÓRIO DE PRODUÇÃO (AUDITORIA) - AGORA EMBAIXO DO ESTOQUE */}
        <div style={{ ...styles.card, backgroundColor: '#2c3e50', color: 'white' }}>
          <h2 style={{ ...styles.cardTitle, color: 'white', borderBottomColor: '#34495e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IoTimeOutline size={20} /> Relatório de Produção
          </h2>
          
          <div style={{ position: 'relative', marginBottom: '15px' }}>
             <IoSearchOutline style={{ position: 'absolute', left: '10px', top: '10px', color: '#95a5a6' }} size={16} />
             <input 
               type="text" 
               placeholder="Pesquisar lote, produto ou usuário..." 
               value={buscaAuditoria} 
               onChange={e => setBuscaAuditoria(e.target.value)} 
               style={{ width: '100%', padding: '10px 10px 10px 32px', borderRadius: '6px', border: '1px solid #34495e', backgroundColor: '#34495e', color: 'white', fontSize: '13px', outline: 'none' }} 
             />
          </div>
          
          <div style={{ overflowY: 'auto', maxHeight: '450px', paddingRight: '5px' }}>
            {auditoriaFiltrada.length === 0 && <p style={{ textAlign: 'center', color: '#95a5a6', fontSize: '13px', marginTop: '20px' }}>Nenhum registro encontrado.</p>}
            
            {auditoriaFiltrada.map(log => (
              <div key={log.id} style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#34495e', borderRadius: '8px', borderLeft: `4px solid ${log.acao === 'Criação' ? '#2ecc71' : '#e74c3c'}` }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: log.acao === 'Criação' ? '#2ecc71' : '#e74c3c', textTransform: 'uppercase' }}>
                      {log.acao}
                    </span>
                    {log.loteInfo && <span style={{ fontSize: '10px', backgroundColor: '#e67e22', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>LOTE: {log.loteInfo}</span>}
                  </div>
                  <span style={{ fontSize: '11px', color: '#bdc3c7' }}>
                    {new Date(log.dataHora).toLocaleDateString()} às {new Date(log.dataHora).toLocaleTimeString()}
                  </span>
                </div>
                
                <p style={{ margin: '8px 0', fontSize: '13px', lineHeight: '1.4', color: '#ecf0f1', fontWeight: '500' }}>{log.detalhes}</p>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #7f8c8d' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#bdc3c7', fontSize: '11px' }}>
                    <IoPersonOutline /> <span>{log.usuario}</span>
                  </div>
                  {log.quantidadeInfo && (
                     <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0288D1' }}>Qtd: {log.quantidadeInfo} un</span>
                  )}
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