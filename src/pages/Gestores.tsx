import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function Gestores() {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Modal
  const [modalVisivel, setModalVisivel] = useState(false);
  const [idEdicao, setIdEdicao] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('Vendedor');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  async function carregarEquipe() {
    setCarregando(true);
    try {
      const res = await api.get('/usuarios');
      setUsuarios(res.data.sort((a: any, b: any) => a.nome.localeCompare(b.nome)));
    } catch (error) {
      alert("Erro ao carregar equipa.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarEquipe(); }, []);

  function abrirModalNovo() {
    setIdEdicao(null); setNome(''); setCargo('Vendedor'); setEmail(''); setSenha('');
    setModalVisivel(true);
  }

  function abrirModalEdicao(u: any) {
    setIdEdicao(u.id); setNome(u.nome); setCargo(u.cargo); setEmail(u.email); setSenha('');
    setModalVisivel(true);
  }

  async function excluirUsuario(id: string, nomeUsuario: string) {
    if (window.confirm(`Deseja mesmo remover o acesso de ${nomeUsuario}?`)) {
      try {
        await api.delete(`/usuarios/${id}`);
        carregarEquipe();
      } catch (err) { alert("Bloqueado: O utilizador já tem movimentações no sistema."); }
    }
  }

  async function salvarUsuario(e: React.FormEvent) {
    e.preventDefault();
    if (!idEdicao && !senha) return alert("Defina uma senha provisória para a nova conta.");

    try {
      if (idEdicao) {
        await api.put(`/usuarios/${idEdicao}`, { nome, cargo, email: email.trim().toLowerCase() });
      } else {
        await api.post('/usuarios', { nome, cargo, email: email.trim().toLowerCase(), senha });
      }
      setModalVisivel(false);
      carregarEquipe();
    } catch (error: any) {
      alert("Erro: " + (error.response?.data?.error || "E-mail já em uso."));
    }
  }

  if (carregando) return <div>A carregar a sua equipa...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Gestores de Estoque</h1>
        <button onClick={abrirModalNovo} style={styles.btnPrincipal}>+ Novo Colaborador</button>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Nome</th>
              <th style={styles.th}>E-mail</th>
              <th style={styles.th}>Nível de Acesso</th>
              <th style={{...styles.th, textAlign: 'center'}}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((item) => (
              <tr key={item.id} style={styles.tr}>
                <td style={styles.td}><strong>{item.nome}</strong></td>
                <td style={styles.td}>{item.email}</td>
                <td style={styles.td}>
                  <span style={item.cargo.includes('Admin') ? styles.badgeAzul : item.cargo.includes('Estoqu') ? styles.badgeVerde : styles.badgeCinza}>
                    {item.cargo}
                  </span>
                </td>
                <td style={{...styles.td, textAlign: 'center'}}>
                  <button onClick={() => abrirModalEdicao(item)} style={styles.btnEditar}>Editar</button>
                  <button onClick={() => excluirUsuario(item.id, item.nome)} style={styles.btnApagar}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {modalVisivel && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#2c3e50' }}>{idEdicao ? 'Editar Perfil' : 'Criar Acesso'}</h2>
              <button onClick={() => setModalVisivel(false)} style={styles.btnFechar}>✖</button>
            </div>
            <form onSubmit={salvarUsuario} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <input type="text" style={styles.input} value={nome} onChange={e => setNome(e.target.value)} required placeholder="Nome Completo" />
              <input type="email" style={styles.input} value={email} onChange={e => setEmail(e.target.value)} required placeholder="E-mail" />
              <select style={styles.input} value={cargo} onChange={e => setCargo(e.target.value)}>
                <option value="Vendedor">Vendedor</option>
                <option value="Estoquista">Estoquista</option>
                <option value="Administrador">Administrador</option>
              </select>
              {!idEdicao && <input type="text" style={styles.input} value={senha} onChange={e => setSenha(e.target.value)} placeholder="Definir Palavra-passe" required />}
              <button type="submit" style={styles.btnPrincipal}>Salvar Conta</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  tableContainer: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '15px 20px', backgroundColor: '#f9fbfb', color: '#7f8c8d', borderBottom: '2px solid #ecf0f1', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '1px' },
  tr: { borderBottom: '1px solid #ecf0f1' },
  td: { padding: '15px 20px', color: '#2c3e50', fontSize: '14px', verticalAlign: 'middle' },
  badgeAzul: { backgroundColor: '#e1f5fe', color: '#0288D1', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeVerde: { backgroundColor: '#eafaf1', color: '#27ae60', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeCinza: { backgroundColor: '#f1f2f6', color: '#7f8c8d', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  btnPrincipal: { backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  btnEditar: { backgroundColor: '#f1f2f6', color: '#f39c12', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', marginRight: '8px' },
  btnApagar: { backgroundColor: '#fef5e7', color: '#e74c3c', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '400px' },
  btnFechar: { background: 'none', border: 'none', fontSize: '20px', color: '#e74c3c', cursor: 'pointer' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box' }
};