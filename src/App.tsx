import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { AuthProvider, useAuth } from './lib/auth';
import AppShell from './components/AppShell';
import { DialogoProvider, Loading } from './components/ui';
import Login from './pages/Login';

// Cada tela é carregada sob demanda (o app abre mais rápido, principalmente no celular).
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Estoque = lazy(() => import('./pages/Estoque'));
const Separacao = lazy(() => import('./pages/Separacao'));
const Inventario = lazy(() => import('./pages/Inventario'));
const Locais = lazy(() => import('./pages/Locais'));
const Validade = lazy(() => import('./pages/Validade'));
const Rupturas = lazy(() => import('./pages/Rupturas'));
const Compras = lazy(() => import('./pages/Compras'));
const SugestaoCompras = lazy(() => import('./pages/SugestaoCompras'));
const RecebimentoNFe = lazy(() => import('./pages/RecebimentoNFe'));
const Fornecedores = lazy(() => import('./pages/Fornecedores'));
const Transformacao = lazy(() => import('./pages/Transformacao'));
const Produtos = lazy(() => import('./pages/Produtos'));
const CurvaABC = lazy(() => import('./pages/CurvaABC'));
const Kardex = lazy(() => import('./pages/Kardex'));
const Historico = lazy(() => import('./pages/Historico'));
const Gestores = lazy(() => import('./pages/Gestores'));

function SomenteAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

function Rotas() {
  const { usuario } = useAuth();
  if (!usuario) return <Login />;

  return (
    <BrowserRouter>
      <AppShell>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/separacao" element={<Separacao />} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/inventario/:id" element={<Inventario />} />
            <Route path="/locais" element={<Locais />} />
            <Route path="/validade" element={<Validade />} />
            <Route path="/rupturas" element={<Rupturas />} />
            <Route path="/compras" element={<Compras />} />
            <Route path="/compras/sugestao" element={<SugestaoCompras />} />
            <Route path="/recebimento-nfe" element={<RecebimentoNFe />} />
            <Route path="/fornecedores" element={<Fornecedores />} />
            <Route path="/transformacao" element={<Transformacao />} />
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/curva-abc" element={<CurvaABC />} />
            <Route path="/kardex" element={<Kardex />} />
            <Route path="/kardex/:id" element={<Kardex />} />
            <Route path="/historico" element={<Historico />} />
            <Route path="/gestores" element={<SomenteAdmin><Gestores /></SomenteAdmin>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DialogoProvider>
        <Rotas />
        {/* Fora das rotas: as mensagens também aparecem na tela de login (antes não apareciam). */}
        <ToastContainer position="top-right" autoClose={3500} newestOnTop theme="colored" />
      </DialogoProvider>
    </AuthProvider>
  );
}
