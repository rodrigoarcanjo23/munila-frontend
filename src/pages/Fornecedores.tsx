import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function Fornecedores() {
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Estados do Modal
  const [modalVisivel, setModalVisivel] = useState(false);
  const [idEdicao, setIdEdicao] = useState<string | null>(null);

  // Campos do Formulário
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [contatoNome, setContatoNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');

  async function carregarFornecedores() {
    setCarregando(true);
    try {
      // Usamos a rota /fornecedores (assumindo que o back-end já a suporte ou suportará)
      const res = await api.get('/fornecedores');
      setFornecedores(res.data.sort((a: any, b: any) => a.nomeEmpresa.localeCompare(b.nomeEmpresa)));
    } catch (error) {
      console.log("A rota /fornecedores pode ainda não existir no Back-end, exibindo lista vazia por enquanto.");
      setFornecedores([]); // Prevenção de erro caso a API ainda não tenha a rota
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarFornecedores(); }, []);

  function abrirModalNovo() {
    setIdEdicao(null);
    setNomeEmpresa(''); setCnpj(''); setContatoNome(''); setTelefone(''); setEmail('');
    setModalVisivel(true);
  }

  function abrirModalEdicao(f: any) {
    setIdEdicao(f.id);
    setNomeEmpresa(f.nomeEmpresa); setCnpj(f.cnpj || ''); 
    setContatoNome(f.contatoNome || ''); setTelefone(f.telefone || ''); setEmail(f.email || '');
    setModalVisivel(true);
  }

  async function apagarFornecedor(id: string) {
    if (window.confirm("Deseja mesmo remover este fornecedor?")) {
      try {
        await api.delete(`/fornecedores/${id}`);
        carregarFornecedores();
      } catch (err) { alert("Bloqueado: Este fornecedor possui histórico de compras atrelado."); }
    }
  }

  async function salvarFornecedor(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeEmpresa) return alert("O Nome da Empresa é obrigatório.");

    const payload = { nomeEmpresa, cnpj, contatoNome, telefone, email };

    try {
      if (idEdicao) {
        await api.put(`/fornecedores/${idEdicao}`, payload);
      } else {
        await api.post('/fornecedores', payload);
      }
      setModalVisivel(false);
      carregarFornecedores();
    } catch (error: any) {
      // Simulação para o Frontend não quebrar caso a API ainda não esteja pronta
      alert(error.response?.data?.error || "Erro ao salvar. Verifique se a rota /fornecedores existe na API.");
    }
  }

  if (carregando) return <div>A carregar lista de fornecedores...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Gestão de Fornecedores</h1>
        <button onClick={abrirModalNovo} style={styles.btnPrincipal}>+ Novo Fornecedor</button>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Empresa</th>
              <th style={styles.th}>CNPJ / NIF</th>
              <th style={styles.th}>Pessoa de Contato</th>
              <th style={styles.th}>Telefone / E-mail</th>
              <th style={{...styles.th, textAlign: 'center'}}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {fornecedores.length === 0 && (
              <tr><td colSpan={5} style={{textAlign: 'center', padding: '30px', color: '#7f8c8d'}}>Nenhum fornecedor cadastrado ou rota da API pendente.</td></tr>
            )}
            {fornecedores.map((item) => (
              <tr key={item.id} style={styles.tr}>
                <td style={styles.td}><strong>{item.nomeEmpresa}</strong></td>
                <td style={styles.td}><span style={styles.badgeCinza}>{item.cnpj || 'Não informado'}</span></td>
                <td style={styles.td}>{item.contatoNome || '-'}</td>
                <td style={styles.td}>
                  <div style={{ fontSize: '12px', color: '#2c3e50' }}>{item.telefone}</div>
                  <div style={{ fontSize: '12px', color: '#7f8c8d' }}>{item.email}</div>
                </td>
                <td style={{...styles.td, textAlign: 'center'}}>
                  <button onClick={() => abrirModalEdicao(item)} style={styles.btnEditar}>Editar</button>
                  <button onClick={() => apagarFornecedor(item.id)} style={styles.btnApagar}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL DO FORNECEDOR */}
      {modalVisivel && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#2c3e50' }}>{idEdicao ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
              <button onClick={() => setModalVisivel(false)} style={styles.btnFechar}>✖</button>
            </div>

            <form onSubmit={salvarFornecedor} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 2 }}>
                  <label style={styles.label}>Nome da Empresa / Razão Social *</label>
                  <input type="text" style={styles.input} value={nomeEmpresa} onChange={e => setNomeEmpresa(e.target.value)} required placeholder="Ex: Tecidos Silva Ltda" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>CNPJ</label>
                  <input type="text" style={styles.input} value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
                </div>
              </div>

              <div>
                <label style={styles.label}>Pessoa de Contato (Representante)</label>
                <input type="text" style={styles.input} value={contatoNome} onChange={e => setContatoNome(e.target.value)} placeholder="Ex: Sr. Carlos" />
              </div>

              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Telefone / WhatsApp</label>
                  <input type="text" style={styles.input} value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>E-mail Comercial</label>
                  <input type="email" style={styles.input} value={email} onChange={e => setEmail(e.target.value)} placeholder="vendas@empresa.com" />
                </div>
              </div>

              <button type="submit" style={styles.btnSalvar}>Salvar Fornecedor</button>
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
  badgeCinza: { backgroundColor: '#f1f2f6', color: '#7f8c8d', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  btnPrincipal: { backgroundColor: '#8e44ad', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
  btnEditar: { backgroundColor: '#f1f2f6', color: '#f39c12', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', marginRight: '8px' },
  btnApagar: { backgroundColor: '#fef5e7', color: '#e74c3c', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '600px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
  btnFechar: { background: 'none', border: 'none', fontSize: '20px', color: '#e74c3c', cursor: 'pointer' },
  label: { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px', marginTop: '10px' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box', backgroundColor: '#fafafa' },
  btnSalvar: { backgroundColor: '#8e44ad', color: 'white', padding: '15px', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '20px' }
};