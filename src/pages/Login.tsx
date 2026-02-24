import React, { useState } from 'react';
import { api } from '../api'; // Ajuste o caminho se o seu api.ts estiver noutra pasta

export default function Login({ onLoginSucesso }: { onLoginSucesso: (user: any) => void }) {
  const [modo, setModo] = useState<'login' | 'cadastro'>('login');
  
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('Vendedor');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function handleAcao(e: React.FormEvent) {
    e.preventDefault(); // Evita que a página recarregue ao submeter o formulário
    
    if (!email || !senha) return alert('Aviso: Preencha o e-mail e a palavra-passe.');

    setCarregando(true);
    try {
      if (modo === 'login') {
        const res = await api.post('/login', { email: email.trim().toLowerCase(), senha });
        const usuario = res.data;
        
        // Na Web usamos localStorage em vez de AsyncStorage!
        localStorage.setItem('@Munila:user', JSON.stringify(usuario));
        onLoginSucesso(usuario);
      } else {
        if (!nome || !cargo) return alert('Aviso: Preencha Nome e Cargo para cadastrar.');
        
        await api.post('/usuarios', { 
          nome, 
          cargo, 
          email: email.trim().toLowerCase(), 
          senha 
        });
        
        alert('Sucesso! Conta criada. Pode fazer login agora.');
        setModo('login');
        setSenha('');
      }
    } catch (error: any) {
      alert('Erro: ' + (error.response?.data?.error || 'Erro ao conectar com o servidor.'));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoContainer}>
          {/* Pode substituir pelo caminho da sua logo real se a tiver na pasta public */}
          <h1 style={styles.titulo}>Munila</h1>
          <p style={styles.subtitulo}>Gestão de Estoque</p>
        </div>

        <form onSubmit={handleAcao} style={styles.form}>
          {modo === 'cadastro' && (
            <>
              <input style={styles.input} type="text" placeholder="Nome Completo" value={nome} onChange={e => setNome(e.target.value)} />
              
              <select style={styles.input} value={cargo} onChange={e => setCargo(e.target.value)}>
                <option value="Vendedor">Vendedor (Apenas Saídas)</option>
                <option value="Estoquista">Estoquista (Entradas e Ajustes)</option>
                <option value="Administrador">Administrador (Acesso Total)</option>
              </select>
            </>
          )}

          <input style={styles.input} type="email" placeholder="E-mail corporativo" value={email} onChange={e => setEmail(e.target.value)} required />
          <input style={styles.input} type="password" placeholder="Palavra-passe" value={senha} onChange={e => setSenha(e.target.value)} required />

          <button type="submit" style={styles.btnPrincipal} disabled={carregando}>
            {carregando ? 'Aguarde...' : (modo === 'login' ? 'Entrar no Sistema' : 'Criar Conta')}
          </button>
        </form>

        <button type="button" style={styles.btnSecundario} onClick={() => setModo(modo === 'login' ? 'cadastro' : 'login')}>
          {modo === 'login' ? 'Novo por aqui? Criar uma conta' : 'Já tem conta? Faça Login'}
        </button>
      </div>
    </div>
  );
}

// Estilos embutidos para facilitar a integração no seu projeto Web
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f4f7f6',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  card: {
    backgroundColor: 'white',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  logoContainer: { textAlign: 'center', marginBottom: '30px' },
  titulo: { color: '#0288D1', fontSize: '36px', margin: '0 0 5px 0', fontWeight: 'bold' },
  subtitulo: { color: '#7f8c8d', margin: 0, textTransform: 'uppercase', letterSpacing: '1px', fontSize: '12px', fontWeight: 'bold' },
  form: { display: 'flex', flexDirection: 'column', width: '100%', gap: '15px' },
  input: {
    padding: '12px 15px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '15px',
    outline: 'none',
    backgroundColor: '#fafafa',
    width: '100%',
    boxSizing: 'border-box'
  },
  btnPrincipal: {
    backgroundColor: '#0288D1',
    color: 'white',
    padding: '14px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '10px',
    transition: 'background 0.3s'
  },
  btnSecundario: {
    background: 'none',
    border: 'none',
    color: '#7f8c8d',
    marginTop: '20px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px'
  }
};