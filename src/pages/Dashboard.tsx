import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function Dashboard() {
  const [visaoAtiva, setVisaoAtiva] = useState<'estoque' | 'vendas'>('estoque');
  const [dadosEstoque, setDadosEstoque] = useState<any>({ total: 0, criticos: 0, topProdutos: [] });
  const [dadosVendas, setDadosVendas] = useState<any>({ faturamentoMes: 0, topClientes: [] });
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregarDashboard() {
      try {
        const [resEstoque, resMovimentacoes, resProdutos] = await Promise.all([
          api.get('/estoque'),
          api.get('/movimentacoes'),
          api.get('/produtos')
        ]);
        
        const estoque = resEstoque.data;
        const historico = resMovimentacoes.data;
        const produtos = resProdutos.data;

        const precosMap: Record<string, number> = {};
        produtos.forEach((p: any) => { precosMap[p.id] = p.precoVenda || 0; });

        // 1. DADOS DE ESTOQUE
        let total = 0; let criticos = 0;
        estoque.forEach((i: any) => {
          if (i.status === 'Disponível') {
            total += i.quantidade;
            if (i.quantidade < 10) criticos++;
          }
        });
        const topProd = [...estoque].filter(i => i.status === 'Disponível').sort((a, b) => b.quantidade - a.quantidade).slice(0, 5);
        setDadosEstoque({ total, criticos, topProdutos: topProd });

        // 2. DADOS FINANCEIROS
        const agora = new Date();
        let faturamentoMes = 0;
        const mapaClientes: Record<string, number> = {};

        historico.forEach((mov: any) => {
          if (mov.tipoAcao === 'Saida_Venda') {
            const dataMov = new Date(mov.dataHora);
            if (dataMov.getMonth() === agora.getMonth() && dataMov.getFullYear() === agora.getFullYear()) {
              
              const precoVendaItem = precosMap[mov.produtoId] || 0;
              const valorDaVenda = mov.quantidade * precoVendaItem;
              
              faturamentoMes += valorDaVenda;

              let nomeCliente = "Balcão";
              if (mov.observacao && mov.observacao.startsWith("Cliente: ")) {
                nomeCliente = mov.observacao.split(" | ")[0].replace("Cliente: ", "").trim();
              }
              if (!mapaClientes[nomeCliente]) mapaClientes[nomeCliente] = 0;
              mapaClientes[nomeCliente] += valorDaVenda;
            }
          }
        });
        
        const topCli = Object.keys(mapaClientes)
          .map(nome => ({ nome, valorGasto: mapaClientes[nome] }))
          .sort((a, b) => b.valorGasto - a.valorGasto)
          .slice(0, 5);
          
        setDadosVendas({ faturamentoMes, topClientes: topCli });

      } catch (error) { console.error("Erro ao carregar dashboard", error); } 
      finally { setCarregando(false); }
    }
    carregarDashboard();
  }, []);

  const formatarReal = (valor: number) => {
    return Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  };

  if (carregando) return <div>Atualizando indicadores...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Visão Geral do Negócio</h1>
        
        {/* Toggle UI */}
        <div style={{ display: 'flex', backgroundColor: '#e0e6ed', padding: '4px', borderRadius: '8px' }}>
          <button 
            onClick={() => setVisaoAtiva('estoque')} 
            style={{ ...styles.toggleBtn, backgroundColor: visaoAtiva === 'estoque' ? '#0288D1' : 'transparent', color: visaoAtiva === 'estoque' ? 'white' : '#7f8c8d' }}>
            Armazém
          </button>
          <button 
            onClick={() => setVisaoAtiva('vendas')} 
            style={{ ...styles.toggleBtn, backgroundColor: visaoAtiva === 'vendas' ? '#27ae60' : 'transparent', color: visaoAtiva === 'vendas' ? 'white' : '#7f8c8d' }}>
            Financeiro
          </button>
        </div>
      </div>

      {visaoAtiva === 'estoque' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            <div style={{ ...styles.card, borderLeft: '5px solid #0288D1' }}>
              <h3 style={styles.cardTitulo}>Itens no Armazém</h3>
              <p style={{ ...styles.cardValor, color: '#0288D1' }}>{dadosEstoque.total}</p>
            </div>
            <div style={{ ...styles.card, borderLeft: '5px solid #e74c3c' }}>
              <h3 style={styles.cardTitulo}>Estoque Crítico</h3>
              <p style={{ ...styles.cardValor, color: '#e74c3c' }}>{dadosEstoque.criticos}</p>
            </div>
          </div>

          <div style={styles.card}>
            <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', color: '#2c3e50' }}>Top 5 Produtos em Volume</h3>
            {dadosEstoque.topProdutos.length === 0 ? <p>Sem produtos.</p> : dadosEstoque.topProdutos.map((item: any) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f4f7f6' }}>
                <span style={{ fontWeight: 'bold', color: '#34495e' }}>{item.produto.nome}</span>
                <span style={{ color: '#0288D1', fontWeight: 'bold' }}>{item.quantidade} un</span>
              </div>
            ))}
          </div>
        </>
      )}

      {visaoAtiva === 'vendas' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            <div style={{ ...styles.card, borderLeft: '5px solid #27ae60' }}>
              <h3 style={styles.cardTitulo}>Faturamento (Mês Atual)</h3>
              <p style={{ ...styles.cardValor, color: '#27ae60' }}>{formatarReal(dadosVendas.faturamentoMes)}</p>
            </div>
          </div>

          <div style={styles.card}>
            <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', color: '#2c3e50' }}>Top Clientes (Por Faturamento)</h3>
            {dadosVendas.topClientes.length === 0 ? <p>Sem vendas registadas.</p> : dadosVendas.topClientes.map((cliente: any) => (
              <div key={cliente.nome} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f4f7f6' }}>
                <span style={{ fontWeight: 'bold', color: '#34495e' }}>{cliente.nome}</span>
                <span style={{ color: '#27ae60', fontWeight: 'bold' }}>{formatarReal(cliente.valorGasto)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  card: { backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' },
  cardTitulo: { margin: 0, fontSize: '14px', color: '#7f8c8d', textTransform: 'uppercase' as const, letterSpacing: '1px' },
  cardValor: { margin: '10px 0 0 0', fontSize: '36px', fontWeight: '900' },
  toggleBtn: { padding: '8px 20px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', fontSize: '14px' }
};