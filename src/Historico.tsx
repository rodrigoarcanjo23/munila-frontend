import { useEffect, useState } from 'react';
import { api } from './api';

interface Movimentacao {
  id: string;
  tipoAcao: string;
  quantidade: number;
  dataHora: string;
  observacao: string;
  produto: { nome: string; sku: string; tipo: string };
  usuario: { nome: string };
}

export function Historico() {
  const [historico, setHistorico] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    async function carregarHistorico() {
      try {
        const resposta = await api.get('/movimentacoes');
        setHistorico(resposta.data);
      } catch (error) {
        console.error("Erro ao buscar o histórico:", error);
      } finally {
        setCarregando(false);
      }
    }
    carregarHistorico();
  }, []);

  // Filtro inteligente que busca em todos os campos relevantes
  const historicoFiltrado = historico.filter(item => {
    const termo = filtro.toLowerCase();
    const dataBr = new Date(item.dataHora).toLocaleString('pt-BR').toLowerCase();
    
    return (
      item.produto.nome.toLowerCase().includes(termo) ||
      item.tipoAcao.toLowerCase().includes(termo) ||
      item.usuario.nome.toLowerCase().includes(termo) ||
      item.observacao?.toLowerCase().includes(termo) ||
      dataBr.includes(termo)
    );
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: 0, color: '#2c3e50', fontSize: '28px' }}>⏱️ Auditoria de Movimentações</h1>
          <p style={{ margin: '5px 0 0 0', color: '#7f8c8d' }}>Rastreabilidade Munila & VIAPRO</p>
        </div>
        <input 
          type="text" 
          placeholder="🔍 Filtrar por produto, data, cliente ou ação..." 
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          style={{ padding: '12px', width: '400px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px' }}
        />
      </header>

      <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', padding: '25px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
        {carregando ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#95a5a6' }}>Carregando auditoria...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '15px 10px', borderBottom: '2px solid #ecf0f1', color: '#7f8c8d' }}>Data/Hora</th>
                <th style={{ padding: '15px 10px', borderBottom: '2px solid #ecf0f1', color: '#7f8c8d' }}>Ação</th>
                <th style={{ padding: '15px 10px', borderBottom: '2px solid #ecf0f1', color: '#7f8c8d' }}>Produto</th>
                <th style={{ padding: '15px 10px', borderBottom: '2px solid #ecf0f1', color: '#7f8c8d', textAlign: 'center' }}>Qtd</th>
                <th style={{ padding: '15px 10px', borderBottom: '2px solid #ecf0f1', color: '#7f8c8d' }}>Usuário</th>
                <th style={{ padding: '15px 10px', borderBottom: '2px solid #ecf0f1', color: '#7f8c8d' }}>Observação / Cliente</th>
              </tr>
            </thead>
            <tbody>
              {historicoFiltrado.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #ecf0f1' }}>
                  <td style={{ padding: '15px 10px', fontSize: '13px' }}>
                    {new Date(item.dataHora).toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '15px 10px' }}>
                    <span style={{
                      backgroundColor: item.tipoAcao.includes('Venda') ? '#fdedec' : '#eaf2f8',
                      color: item.tipoAcao.includes('Venda') ? '#e74c3c' : '#2980b9',
                      padding: '5px 10px', borderRadius: '15px', fontSize: '11px', fontWeight: 'bold'
                    }}>
                      {item.tipoAcao.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '15px 10px', fontSize: '14px' }}>
                    <strong>{item.produto.nome}</strong>
                  </td>
                  <td style={{ padding: '15px 10px', textAlign: 'center', fontWeight: 'bold' }}>
                    {item.quantidade > 0 ? `+${item.quantidade}` : item.quantidade}
                  </td>
                  <td style={{ padding: '15px 10px', fontSize: '14px' }}>{item.usuario.nome}</td>
                  <td style={{ padding: '15px 10px', color: '#7f8c8d', fontSize: '13px' }}>
                    {item.observacao || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}