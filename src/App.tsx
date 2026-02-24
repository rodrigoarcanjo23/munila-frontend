import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard'; // Vamos criar este a seguir!
import Estoque from './pages/Estoque';
import Produtos from './pages/Produtos';
import Historico from './pages/Historico';
import Gestores from './pages/Gestores';
import Fornecedores from './pages/Fornecedores';
import Compras from './pages/Compras';
import { Locais } from './pages/Locais';


// Componente do Menu Lateral para ficar organizado
function Sidebar({ usuarioLogado, fazerLogout }: any) {
  const location = useLocation();
  const isAdmin = usuarioLogado.cargo.toLowerCase().includes('admin') || usuarioLogado.cargo.toLowerCase().includes('gestor');

  const navItemStyle = (path: string) => ({
    display: 'block',
    padding: '12px 20px',
    color: location.pathname === path ? '#fff' : '#bdc3c7',
    backgroundColor: location.pathname === path ? '#0288D1' : 'transparent',
    textDecoration: 'none',
    fontWeight: 'bold',
    borderRadius: '8px',
    marginBottom: '8px',
    transition: '0.2s'
  });

  return (
    <div style={{ width: '250px', backgroundColor: '#2c3e50', color: 'white', display: 'flex', flexDirection: 'column', height: '100vh', position: 'fixed', top: 0, left: 0 }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #34495e', marginBottom: '20px' }}>
<img 
  src="/favicon.png" 
  alt="Logo ViaPro" 
  style={{ 
    width: '130px', 
    display: 'block', 
    margin: '0 auto' 
  }} 
/>        <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#95a5a6' }}>Versão Desktop</p>
      </div>

      <nav style={{ flex: 1, padding: '0 15px' }}>
        <Link to="/" style={navItemStyle('/')}>📊 Dashboard</Link>
        <Link to="/estoque" style={navItemStyle('/estoque')}>📦 Armazém</Link>
        <Link to="/produtos" style={navItemStyle('/produtos')}>🏷️ Catálogo</Link>
        <Link to="/historico" style={navItemStyle('/historico')}>🕒 Auditoria</Link>
        <Link to="/fornecedores" style={navItemStyle('/fornecedores')}>🏭 Fornecedores</Link>
        <Link to="/compras" style={navItemStyle('/compras')}>🛒 Pedidos (Compras)</Link>
        <Link to="/locais" style={navItemStyle('/locais')}>📍 Locais</Link>

        {isAdmin && <Link to="/gestores" style={navItemStyle('/gestores')}>👥 Gestores</Link>}
      </nav>

      <div style={{ padding: '20px', borderTop: '1px solid #34495e' }}>
        <div style={{ marginBottom: '15px' }}>
          <span style={{ display: 'block', fontWeight: 'bold' }}>{usuarioLogado.nome}</span>
          <span style={{ fontSize: '12px', color: '#bdc3c7' }}>{usuarioLogado.cargo}</span>
        </div>
        <button onClick={fazerLogout} style={{ width: '100%', background: '#e74c3c', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          Sair do Sistema
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const userSalvo = localStorage.getItem('@Munila:user');
    if (userSalvo) {
      try { setUsuarioLogado(JSON.parse(userSalvo)); } catch (e) { localStorage.removeItem('@Munila:user'); }
    }
    setCarregando(false);
  }, []);

  function fazerLogout() {
    if (window.confirm("Deseja mesmo sair do sistema Munila?")) {
      localStorage.removeItem('@Munila:user');
      setUsuarioLogado(null);
    }
  }

  if (carregando) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f4f7f6' }}><h2>A carregar...</h2></div>;
  if (!usuarioLogado) return <Login onLoginSucesso={setUsuarioLogado} />;

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f4f7f6', minHeight: '100vh' }}>
        {/* MENU LATERAL FIXO */}
        <Sidebar usuarioLogado={usuarioLogado} fazerLogout={fazerLogout} />

        {/* ÁREA DE CONTEÚDO (Com margem para não ficar por baixo do menu) */}
        <div style={{ marginLeft: '250px', flex: 1, padding: '30px' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            
            {/* Telas provisórias para os botões do menu não darem erro */}
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/historico" element={<Historico />} />
            <Route path="/gestores" element={<Gestores />} />
            <Route path="/fornecedores" element={<Fornecedores />} />
            <Route path="/compras" element={<Compras />} />
            <Route path="/locais" element={<Locais />} />
            
            

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}