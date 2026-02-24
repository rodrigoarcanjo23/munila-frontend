import React, { useState, useEffect } from 'react';
import { api } from '../api';

interface Localizacao {
  id: string;
  codigo: string;
  zona: string;
  corredor: string;
  prateleira: string;
}

export function Locais() {
  const [locais, setLocais] = useState<Localizacao[]>([]);
  const [codigo, setCodigo] = useState('');
  const [zona, setZona] = useState('');
  const [corredor, setCorredor] = useState('');
  const [prateleira, setPrateleira] = useState('');
  
  // Novo estado para saber se estamos a editar ou a criar
  const [editandoId, setEditandoId] = useState<string | null>(null);

  useEffect(() => {
    carregarLocais();
  }, []);

  async function carregarLocais() {
    try {
      const response = await api.get('/localizacoes');
      setLocais(response.data);
    } catch (error) {
      console.error('Erro ao buscar locais:', error);
    }
  }

  async function handleSalvarLocal(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editandoId) {
        // Se tem ID, é uma EDIÇÃO
        await api.put(`/localizacoes/${editandoId}`, { codigo, zona, corredor, prateleira });
        alert('Local atualizado com sucesso!');
      } else {
        // Se não tem ID, é uma CRIAÇÃO
        await api.post('/localizacoes', { codigo, zona, corredor, prateleira });
        alert('Local criado com sucesso!');
      }
      
      limparFormulario();
      carregarLocais();
    } catch (error) {
      console.error('Erro ao salvar local:', error);
      alert('Erro ao salvar o local. Verifique se o Back-end já atualizou na nuvem.');
    }
  }

  function handleEditar(local: Localizacao) {
    setCodigo(local.codigo);
    setZona(local.zona);
    setCorredor(local.corredor);
    setPrateleira(local.prateleira);
    setEditandoId(local.id);
  }

  async function handleExcluir(id: string) {
    if (window.confirm('Tem a certeza que deseja excluir esta prateleira/local?')) {
      try {
        await api.delete(`/localizacoes/${id}`);
        alert('Local excluído com sucesso!');
        carregarLocais();
      } catch (error) {
        console.error('Erro ao excluir:', error);
        alert('Não foi possível excluir. Provavelmente existem produtos guardados neste local.');
      }
    }
  }

  function limparFormulario() {
    setCodigo('');
    setZona('');
    setCorredor('');
    setPrateleira('');
    setEditandoId(null);
  }

  // --- ESTILOS VISUAIS ---
  const containerStyle = { padding: '10px' };
  const cardStyle = { backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', marginBottom: '30px' };
  const inputContainerStyle = { display: 'flex', flexDirection: 'column' as const, gap: '8px' };
  const labelStyle = { fontSize: '14px', fontWeight: 'bold', color: '#34495e' };
  const inputStyle = { padding: '10px', borderRadius: '6px', border: '1px solid #bdc3c7', fontSize: '14px', outline: 'none', backgroundColor: '#f9fbfb' };
  const thStyle = { padding: '15px', borderBottom: '2px solid #ecf0f1', textAlign: 'left' as const, color: '#7f8c8d', fontSize: '12px', textTransform: 'uppercase' as const };
  const tdStyle = { padding: '15px', borderBottom: '1px solid #ecf0f1', color: '#2c3e50', fontSize: '14px', fontWeight: '500' };

  return (
    <div style={containerStyle}>
      <h1 style={{ color: '#2c3e50', margin: '0 0 5px 0' }}>Gestão de Locais Físicos</h1>
      <p style={{ color: '#7f8c8d', margin: '0 0 25px 0' }}>Cadastre as ruas, prateleiras e células do seu armazém.</p>

      {/* CARD DO FORMULÁRIO */}
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#2c3e50', borderBottom: '1px solid #ecf0f1', paddingBottom: '10px' }}>
          {editandoId ? '✏️ A Editar Local' : 'Nova Prateleira / Célula'}
        </h2>
        
        <form onSubmit={handleSalvarLocal}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            <div style={inputContainerStyle}>
              <label style={labelStyle}>Código (Ex: R01-P01)</label>
              <input required type="text" value={codigo} onChange={e => setCodigo(e.target.value)} style={inputStyle} placeholder="R01-P01" />
            </div>
            <div style={inputContainerStyle}>
              <label style={labelStyle}>Zona (Ex: Pulmão, Loja)</label>
              <input required type="text" value={zona} onChange={e => setZona(e.target.value)} style={inputStyle} placeholder="Pulmão" />
            </div>
            <div style={inputContainerStyle}>
              <label style={labelStyle}>Corredor / Rua</label>
              <input required type="text" value={corredor} onChange={e => setCorredor(e.target.value)} style={inputStyle} placeholder="01" />
            </div>
            <div style={inputContainerStyle}>
              <label style={labelStyle}>Prateleira / Célula</label>
              <input required type="text" value={prateleira} onChange={e => setPrateleira(e.target.value)} style={inputStyle} placeholder="A" />
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
            {editandoId && (
              <button type="button" onClick={limparFormulario} style={{ backgroundColor: '#95a5a6', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                Cancelar
              </button>
            )}
            <button type="submit" style={{ backgroundColor: editandoId ? '#f39c12' : '#27ae60', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
              {editandoId ? 'Atualizar Local' : '+ Salvar Local'}
            </button>
          </div>
        </form>
      </div>

      {/* CARD DA TABELA */}
      <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f8f9fa' }}>
            <tr>
              <th style={thStyle}>Código</th>
              <th style={thStyle}>Zona</th>
              <th style={thStyle}>Corredor</th>
              <th style={thStyle}>Prateleira</th>
              <th style={{...thStyle, textAlign: 'center'}}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {locais.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#95a5a6' }}>Nenhum local cadastrado ainda.</td>
              </tr>
            ) : (
              locais.map(local => (
                <tr key={local.id} style={{ transition: '0.2s' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f4f7f6'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ ...tdStyle, fontWeight: 'bold' }}>{local.codigo}</td>
                  <td style={tdStyle}>
                    <span style={{ backgroundColor: '#e8f4f8', color: '#0288D1', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                      {local.zona}
                    </span>
                  </td>
                  <td style={tdStyle}>{local.corredor}</td>
                  <td style={tdStyle}>{local.prateleira}</td>
                  <td style={{...tdStyle, textAlign: 'center'}}>
                    <button onClick={() => handleEditar(local)} style={{ backgroundColor: 'transparent', color: '#f39c12', border: '1px solid #f39c12', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', marginRight: '8px', fontWeight: 'bold', fontSize: '12px' }}>
                      Editar
                    </button>
                    <button onClick={() => handleExcluir(local.id)} style={{ backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}