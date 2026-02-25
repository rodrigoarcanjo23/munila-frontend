import React, { useState } from 'react';
import { api } from '../api';
import { toast } from 'react-toastify'; // <-- IMPORTAÇÃO

export default function Login({ onLoginSucesso }: any) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function fazerLogin(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);

    try {
      const response = await api.post('/login', { email, senha });
      localStorage.setItem('@Munila:user', JSON.stringify(response.data));
      
      toast.success(`Bem-vindo, ${response.data.nome}!`); // TOAST
      onLoginSucesso(response.data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Erro ao conectar com o servidor."); // TOAST
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f4f7f6' }}>
      <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        
        <img 
          src="/favicon.png" 
          alt="ViaPro ERP" 
          style={{ width: '140px', marginBottom: '10px' }} 
        />
        <p style={{ color: '#7f8c8d', fontSize: '14px', marginBottom: '30px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
          Gestão de Armazém
        </p>

        <form onSubmit={fazerLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input 
            type="email" 
            placeholder="Seu e-mail" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            required 
            style={styles.input}
          />
          <input 
            type="password" 
            placeholder="Sua senha" 
            value={senha} 
            onChange={e => setSenha(e.target.value)} 
            required 
            style={styles.input}
          />
          
          <button type="submit" disabled={carregando} style={styles.btn}>
            {carregando ? 'A Autenticar...' : 'Entrar no Sistema'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  input: { padding: '15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', outline: 'none', backgroundColor: '#f9fbfb' },
  btn: { backgroundColor: '#0288D1', color: 'white', padding: '15px', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px', transition: '0.2s' }
};