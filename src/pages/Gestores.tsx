import { useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { IoAddOutline, IoPencilOutline, IoTrashOutline, IoKeyOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { perfilDe, useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { contem, iniciais } from '../lib/format';
import type { UsuarioResumo } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { Badge, Field, Loading, Modal, Notice, PageHeader, Panel, SearchInput, useDialogo } from '../components/ui';

const PERFIS = [
  { cargo: 'Administrador', descricao: 'Acesso total, inclusive usuários, exclusões e saldo em contagem cega.' },
  { cargo: 'Gestor', descricao: 'Mesmo acesso do administrador.' },
  { cargo: 'Estoquista', descricao: 'Opera estoque, ordens, inventário, compras e cadastros.' },
  { cargo: 'Vendedor', descricao: 'Consulta e solicita ordens. Não altera cadastros de produtos.' },
];
const tomPerfil = (c: string) => ({ admin: 'primary', estoque: 'ok', vendas: 'info', outro: undefined } as const)[perfilDe(c)];

export default function Gestores() {
  const { usuario: eu } = useAuth();
  const { confirmar } = useDialogo();
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<{ id?: string; nome: string; email: string; cargo: string; senha: string } | null>(null);
  const { dados, carregando, recarregar } = useCarregar(async () => (await api.get<UsuarioResumo[]>('/usuarios')).data);
  const linhas = (dados ?? []).filter(u => contem(busca, u.nome, u.email, u.cargo));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.id && form.senha.length < 4) return toast.warn('Defina uma senha provisória com ao menos 4 caracteres.');
    try {
      const payload = { nome: form.nome, email: form.email.trim().toLowerCase(), cargo: form.cargo, ...(form.senha ? { senha: form.senha } : {}) };
      if (form.id) await api.put(`/usuarios/${form.id}`, payload); else await api.post('/usuarios', payload);
      toast.success(form.id ? 'Usuário atualizado.' : 'Acesso criado.');
      setForm(null); recarregar(true);
    } catch (err) { toast.error(msgErro(err, 'E-mail já em uso.')); }
  }
  async function excluir(u: UsuarioResumo) {
    if (u.id === eu?.id) return toast.warn('Você não pode remover o próprio acesso.');
    if (!(await confirmar({ titulo: `Remover o acesso de ${u.nome}?`, mensagem: 'Usuários com movimentações registradas não podem ser removidos (o histórico é preservado).', confirmar: 'Remover acesso', perigo: true }))) return;
    try { await api.delete(`/usuarios/${u.id}`); toast.success('Acesso removido.'); recarregar(true); } catch (err) { toast.error(msgErro(err)); }
  }

  const colunas: Col<UsuarioResumo>[] = [
    { key: 'n', titulo: 'Nome', principal: true, ordenar: u => u.nome, render: u => <div className="row" style={{ flexWrap: 'nowrap' }}><div className="avatar">{iniciais(u.nome)}</div><div><div className="cell-title">{u.nome}{u.id === eu?.id && <span className="muted"> (você)</span>}</div><div className="cell-sub">{u.email}</div></div></div> },
    { key: 'c', titulo: 'Perfil de acesso', ordenar: u => u.cargo, render: u => <Badge tom={tomPerfil(u.cargo)}>{u.cargo}</Badge> },
  ];

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Usuários e acessos" descricao="Quem acessa o sistema e o que cada perfil pode fazer. As senhas são armazenadas criptografadas."
        acoes={<button className="btn btn--primary" onClick={() => setForm({ nome: '', email: '', cargo: 'Estoquista', senha: '' })}><IoAddOutline /> Novo usuário</button>} />
      <div className="grid grid-main-side">
        <Panel flush>
          <div className="toolbar"><SearchInput value={busca} onChange={setBusca} placeholder="Nome, e-mail ou perfil" /></div>
          <DataTable colunas={colunas} linhas={linhas} chave={u => u.id} ordemInicial={{ key: 'n', dir: 'asc' }}
            acoes={u => (
              <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                <button className="icon-btn" title="Editar" aria-label="Editar" onClick={() => setForm({ id: u.id, nome: u.nome, email: u.email || '', cargo: u.cargo, senha: '' })}><IoPencilOutline /></button>
                <button className="icon-btn icon-btn--bad" title="Remover acesso" aria-label="Remover acesso" onClick={() => excluir(u)}><IoTrashOutline /></button>
              </div>
            )} />
        </Panel>
        <Panel titulo="Perfis">
          <div className="stack" style={{ gap: 12 }}>
            {PERFIS.map(p => <div key={p.cargo}><Badge tom={tomPerfil(p.cargo)}>{p.cargo}</Badge><p className="muted mt-8">{p.descricao}</p></div>)}
          </div>
        </Panel>
      </div>
      {form && (
        <Modal aberto onFechar={() => setForm(null)} titulo={form.id ? 'Editar usuário' : 'Criar acesso'} tamanho="sm"
          rodape={<><button className="btn" onClick={() => setForm(null)}>Cancelar</button><button className="btn btn--primary" form="form-user">Salvar</button></>}>
          <form id="form-user" onSubmit={salvar} className="form-grid">
            <Field label="Nome completo" className="col-12"><input className="input" required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></Field>
            <Field label="E-mail" className="col-12"><input className="input" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Perfil" className="col-12">
              <select className="select" value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })}>
                {PERFIS.map(p => <option key={p.cargo}>{p.cargo}</option>)}
                {!PERFIS.some(p => p.cargo === form.cargo) && <option>{form.cargo}</option>}
              </select>
            </Field>
            <Field label={form.id ? 'Nova senha (opcional)' : 'Senha provisória'} className="col-12" dica={form.id ? 'Preencha só para redefinir a senha.' : undefined}>
              <div className="input-icon"><IoKeyOutline /><input className="input" type="text" autoComplete="new-password" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} required={!form.id} /></div>
            </Field>
            {form.id === eu?.id && form.cargo !== eu?.cargo && <div className="col-12"><Notice tom="warn">Você está alterando o próprio perfil. Saia e entre de novo para aplicar.</Notice></div>}
          </form>
        </Modal>
      )}
    </>
  );
}
