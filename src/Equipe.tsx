import { useEffect, useState } from 'react';
import { api } from './api';

interface Usuario {
  id: string;
  nome: string;
  cargo: string;
  email: string;
}

export function Equipe() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [idEdicao, setIdEdicao] = useState<string | null>(null);
  
  // Estados do formulário
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('Representante');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  async function carregarUsuarios() {
    try {
      const res = await api.get('/usuarios');
      setUsuarios(res.data);
    } catch (error) { console.error("Erro ao carregar", error); }
  }

  useEffect(() => { carregarUsuarios(); }, []);

  function abrirModalNovo() {
    setIdEdicao(null);
    setNome(''); setCargo('Representante'); setEmail(''); setSenha('');
    setModalAberto(true);
  }

  function abrirModalEdicao(u: Usuario) {
    setIdEdicao(u.id);
    setNome(u.nome); setCargo(u.cargo); setEmail(u.email); setSenha('');
    setModalAberto(true);
  }

  async function handleDelete(id: string) {
    if (confirm("Tem certeza que deseja excluir este usuário?")) {
      try {
        await api.delete(`/usuarios/${id}`);
        alert("✅ Usuário excluído!");
        carregarUsuarios();
      } catch (error: any) {
        alert(error.response?.data?.error || "Erro ao excluir.");
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (idEdicao) {
        // Editando usuário existente
        await api.put(`/usuarios/${idEdicao}`, { nome, cargo, email });
        alert("✅ Usuário atualizado com sucesso!");
      } else {
        // Criando novo usuário
        await api.post('/usuarios', { nome, cargo, email, senha });
        alert("✅ Usuário cadastrado com sucesso!");
      }
      setModalAberto(false);
      carregarUsuarios();
    } catch (error) {
      alert("Erro ao salvar dados do usuário.");
    }
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ color: '#2c3e50', margin: 0 }}>👥 Gestão de Equipe</h1>
          <p style={{ color: '#7f8c8d' }}>Usuários e Representantes do sistema</p>
        </div>
        <button onClick={abrirModalNovo} style={{ backgroundColor: '#2980b9', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          + Novo Usuário
        </button>
      </header>

      <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee' }}>
              <th style={{ padding: '15px' }}>Nome</th>
              <th style={{ padding: '15px' }}>Cargo</th>
              <th style={{ padding: '15px' }}>E-mail</th>
              <th style={{ padding: '15px', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '15px', fontWeight: 'bold', color: '#2c3e50' }}>{u.nome}</td>
                <td style={{ padding: '15px', color: '#7f8c8d' }}>{u.cargo}</td>
                <td style={{ padding: '15px', color: '#7f8c8d' }}>{u.email}</td>
                <td style={{ padding: '15px', textAlign: 'right' }}>
                  <button onClick={() => abrirModalEdicao(u)} style={{ backgroundColor: '#f1c40f', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', marginRight: '5px', fontWeight: 'bold' }}>✏️ Editar</button>
                  <button onClick={() => handleDelete(u.id)} style={{ backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>🗑️ Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '400px' }}>
            <h2 style={{ marginTop: 0 }}>{idEdicao ? 'Editar Usuário' : 'Cadastrar Usuário'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Nome</label>
              <input type="text" required value={nome} onChange={e => setNome(e.target.value)} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }} />
              
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Cargo</label>
              <input type="text" required value={cargo} onChange={e => setCargo(e.target.value)} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }} />
              
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>E-mail</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }} />
              
              {/* Só pede senha se for um usuário NOVO */}
              {!idEdicao && (
                <>
                  <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Senha</label>
                  <input type="password" required value={senha} onChange={e => setSenha(e.target.value)} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }} />
                </>
              )}
              
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setModalAberto(false)} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '5px' }}>Cancelar</button>
                <button type="submit" style={{ flex: 1, padding: '10px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>{idEdicao ? 'Atualizar' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}