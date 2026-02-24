import { useEffect, useState } from 'react';
import { api } from './api';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';

interface EstoqueItem {
  id: string;
  quantidade: number;
  produto: { nome: string; tipo: string };
}

interface Movimentacao {
  tipoAcao: string;
}

interface GraficoBarra {
  nome: string;
  quantidade: number;
}

interface GraficoPizza {
  name: string;
  value: number;
}

export function Dashboard() {
  const [dadosEstoque, setDadosEstoque] = useState<GraficoBarra[]>([]);
  const [dadosPizza, setDadosPizza] = useState<GraficoPizza[]>([]);
  const [carregando, setCarregando] = useState(true);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  useEffect(() => {
    async function carregarDados() {
      try {
        const [resEstoque, resMov] = await Promise.all([
          api.get('/estoque'),
          api.get('/movimentacoes')
        ]);

        const formatadoBarra = resEstoque.data
          .filter((item: EstoqueItem) => item.quantidade > 0)
          .slice(0, 10)
          .map((item: EstoqueItem) => ({
            nome: item.produto.nome.substring(0, 15) + '...',
            quantidade: item.quantidade
          }));
        setDadosEstoque(formatadoBarra);

        const acoes: Record<string, number> = {};
        resMov.data.forEach((m: Movimentacao) => {
          acoes[m.tipoAcao] = (acoes[m.tipoAcao] || 0) + 1;
        });
        
        const formatadoPizza = Object.keys(acoes).map(key => ({
          name: key.replace('_', ' '),
          value: acoes[key]
        }));
        setDadosPizza(formatadoPizza);

      } catch (error) {
        console.error("Erro ao carregar dashboard", error);
      } finally {
        setCarregando(false);
      }
    }
    carregarDados();
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '30px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>📊 Dashboard Gerencial</h1>
        <p style={{ color: '#7f8c8d' }}>Indicadores de desempenho Munila & VIAPRO</p>
      </header>

      {carregando ? (
        <p>Calculando indicadores...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
          
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ textAlign: 'center', color: '#34495e' }}>Top 10 Produtos (Saldo Atual)</h3>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={dadosEstoque}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nome" fontSize={12} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="quantidade" fill="#3498db" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ textAlign: 'center', color: '#34495e' }}>Distribuição de Operações</h3>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={dadosPizza}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name }) => name}
                  >
                    {dadosPizza.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}