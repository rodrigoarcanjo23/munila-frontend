import { useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { IoAddOutline, IoPencilOutline, IoTrashOutline, IoMailOutline, IoCallOutline, IoDownloadOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { contem } from '../lib/format';
import { exportarExcel } from '../lib/exportar';
import type { Fornecedor } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { Field, Loading, Modal, PageHeader, Panel, SearchInput, useDialogo } from '../components/ui';

const vazio = { nomeEmpresa: '', cnpj: '', contatoNome: '', telefone: '', email: '' };
const mascaraCNPJ = (v: string) => v.replace(/\D/g, '').slice(0, 14)
  .replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');

export default function Fornecedores() {
  const { confirmar } = useDialogo();
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<typeof vazio | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const { dados, carregando, recarregar } = useCarregar(async () => (await api.get<Fornecedor[]>('/fornecedores')).data);
  const linhas = (dados ?? []).filter(f => contem(busca, f.nomeEmpresa, f.cnpj, f.contatoNome, f.email, f.telefone));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form?.nomeEmpresa.trim()) return toast.warn('Informe o nome da empresa.');
    try {
      if (editandoId) await api.put(`/fornecedores/${editandoId}`, form); else await api.post('/fornecedores', form);
      toast.success(editandoId ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
      setForm(null); recarregar(true);
    } catch (err) { toast.error(msgErro(err)); }
  }
  async function excluir(f: Fornecedor) {
    if (!(await confirmar({ titulo: `Excluir ${f.nomeEmpresa}?`, mensagem: 'Só é possível excluir fornecedores sem produtos ou pedidos vinculados.', confirmar: 'Excluir', perigo: true }))) return;
    try { await api.delete(`/fornecedores/${f.id}`); toast.success('Fornecedor excluído.'); recarregar(true); } catch (err) { toast.error(msgErro(err)); }
  }

  const colunas: Col<Fornecedor>[] = [
    { key: 'nome', titulo: 'Empresa', principal: true, ordenar: f => f.nomeEmpresa, render: f => <><div className="cell-title">{f.nomeEmpresa}</div><div className="cell-sub">{f.cnpj || 'CNPJ não informado'}</div></> },
    { key: 'contato', titulo: 'Contato', ordenar: f => f.contatoNome, render: f => f.contatoNome || '-' },
    { key: 'tel', titulo: 'Telefone', render: f => f.telefone ? <a href={`tel:${f.telefone.replace(/[^\d+]/g, '')}`}><IoCallOutline style={{ verticalAlign: -2 }} /> {f.telefone}</a> : '-' },
    { key: 'email', titulo: 'E-mail', ocultarCelular: true, render: f => f.email ? <a href={`mailto:${f.email}`}><IoMailOutline style={{ verticalAlign: -2 }} /> {f.email}</a> : <span className="muted">Sem e-mail (pedidos não serão enviados)</span> },
    { key: 'prod', titulo: 'Produtos', align: 'right', ordenar: f => f._count?.produtos ?? 0, render: f => f._count?.produtos ?? 0 },
    { key: 'ped', titulo: 'Pedidos', align: 'right', ordenar: f => f._count?.pedidosCompra ?? 0, render: f => f._count?.pedidosCompra ?? 0 },
  ];

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Fornecedores" descricao="Cadastro de fornecedores. O e-mail é usado para enviar automaticamente os pedidos de compra."
        acoes={<>
          <button className="btn" onClick={() => exportarExcel('Fornecedores_ViaPro', [{ nome: 'Fornecedores', linhas, colunas: [
            { titulo: 'Empresa', valor: f => f.nomeEmpresa, largura: 35 }, { titulo: 'CNPJ', valor: f => f.cnpj || '' }, { titulo: 'Contato', valor: f => f.contatoNome || '' },
            { titulo: 'Telefone', valor: f => f.telefone || '' }, { titulo: 'E-mail', valor: f => f.email || '', largura: 30 },
          ] }])}><IoDownloadOutline /> Excel</button>
          <button className="btn btn--primary" onClick={() => { setForm(vazio); setEditandoId(null); }}><IoAddOutline /> Novo fornecedor</button>
        </>} />
      <Panel flush>
        <div className="toolbar"><SearchInput value={busca} onChange={setBusca} placeholder="Empresa, CNPJ, contato ou e-mail" /></div>
        <DataTable colunas={colunas} linhas={linhas} chave={f => f.id} ordemInicial={{ key: 'nome', dir: 'asc' }}
          acoes={f => (
            <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
              <button className="icon-btn" aria-label="Editar" title="Editar" onClick={() => { setForm({ nomeEmpresa: f.nomeEmpresa, cnpj: f.cnpj || '', contatoNome: f.contatoNome || '', telefone: f.telefone || '', email: f.email || '' }); setEditandoId(f.id); }}><IoPencilOutline /></button>
              <button className="icon-btn icon-btn--bad" aria-label="Excluir" title="Excluir" onClick={() => excluir(f)}><IoTrashOutline /></button>
            </div>
          )} />
      </Panel>
      {form && (
        <Modal aberto onFechar={() => setForm(null)} titulo={editandoId ? 'Editar fornecedor' : 'Novo fornecedor'} tamanho="md"
          rodape={<><button className="btn" onClick={() => setForm(null)}>Cancelar</button><button className="btn btn--primary" form="form-forn">Salvar fornecedor</button></>}>
          <form id="form-forn" onSubmit={salvar} className="form-grid">
            <Field label="Razão social / nome da empresa" className="col-8"><input className="input" required value={form.nomeEmpresa} onChange={e => setForm({ ...form, nomeEmpresa: e.target.value })} /></Field>
            <Field label="CNPJ" className="col-4"><input className="input" inputMode="numeric" value={form.cnpj} onChange={e => setForm({ ...form, cnpj: mascaraCNPJ(e.target.value) })} placeholder="00.000.000/0000-00" /></Field>
            <Field label="Pessoa de contato" className="col-12"><input className="input" value={form.contatoNome} onChange={e => setForm({ ...form, contatoNome: e.target.value })} /></Field>
            <Field label="Telefone / WhatsApp" className="col-6"><input className="input" type="tel" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></Field>
            <Field label="E-mail comercial" className="col-6"><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          </form>
        </Modal>
      )}
    </>
  );
}
