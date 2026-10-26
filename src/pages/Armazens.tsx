import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { IoAddOutline, IoGitCompareOutline, IoPencilOutline, IoTrashOutline, IoStar } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { contem, dataHora, moeda, numero } from '../lib/format';
import { rotuloLote } from '../lib/regras';
import type { Armazem, Movimentacao, Produto } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { ModalTransferencia } from '../components/EstoqueModais';
import { Code, Empty, Field, Loading, Modal, PageHeader, Panel, SearchInput, useDialogo } from '../components/ui';

interface LinhaTransf { codigo: string; data: string; produto: string; sku: string; lote: string | null; quantidade: number; origem: string; destino: string; usuario?: string; obs?: string | null }

export default function Armazens() {
  const { isAdmin } = useAuth();
  const { confirmar } = useDialogo();
  const [form, setForm] = useState<{ id?: string; codigo: string; nome: string; endereco: string; padrao: boolean } | null>(null);
  const [transferir, setTransferir] = useState(false);
  const [busca, setBusca] = useState('');

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [a, m, p] = await Promise.all([api.get<Armazem[]>('/armazens'), api.get<Movimentacao[]>('/movimentacoes?limite=3000'), api.get<Produto[]>('/produtos')]);
    return { armazens: a.data, movs: m.data, produtos: p.data };
  });

  // Cada transferência gera uma saída (origem) e uma entrada (destino) com o mesmo código TR.
  const transferencias = useMemo<LinhaTransf[]>(() => {
    if (!dados) return [];
    const nome = new Map(dados.armazens.map(a => [a.id, a.nome]));
    const saidas = dados.movs.filter(m => m.tipoAcao === 'Transferência (saída)');
    const entradas = dados.movs.filter(m => m.tipoAcao === 'Transferência (entrada)');
    return saidas.map(s => {
      const e = entradas.find(x => x.codigo === s.codigo && x.produtoId === s.produtoId && x.lote === s.lote);
      return {
        codigo: s.codigo || '-', data: s.dataHora, produto: s.produto?.nome || '-', sku: s.produto?.sku || '-', lote: s.lote ?? null, quantidade: s.quantidade,
        origem: nome.get(s.armazemId || '') || '-', destino: nome.get(e?.armazemId || '') || '-', usuario: s.usuario?.nome, obs: s.observacao,
      };
    });
  }, [dados]);
  const linhas = transferencias.filter(t => contem(busca, t.codigo, t.produto, t.sku, t.lote, t.origem, t.destino));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    try {
      if (form.id) await api.put(`/armazens/${form.id}`, form); else await api.post('/armazens', form);
      toast.success(form.id ? 'Armazém atualizado.' : 'Armazém criado.');
      setForm(null); recarregar(true);
    } catch (err) { toast.error(msgErro(err)); }
  }
  async function excluir(a: Armazem) {
    if (!(await confirmar({ titulo: `Excluir ${a.nome}?`, mensagem: 'Só é possível excluir armazéns sem saldo. Os endereços vinculados ficam sem armazém.', confirmar: 'Excluir', perigo: true }))) return;
    try { await api.delete(`/armazens/${a.id}`); toast.success('Armazém excluído.'); recarregar(true); } catch (err) { toast.error(msgErro(err)); }
  }

  const colunas: Col<LinhaTransf>[] = [
    { key: 'd', titulo: 'Data', ordenar: t => t.data, render: t => dataHora(t.data) },
    { key: 'c', titulo: 'Documento', render: t => <Code>{t.codigo}</Code> },
    { key: 'p', titulo: 'Produto', principal: true, ordenar: t => t.produto, render: t => <><div className="cell-title">{t.produto}</div><div className="cell-sub">{t.sku} · {rotuloLote(t.lote)}</div></> },
    { key: 'r', titulo: 'Rota', render: t => <span className="nowrap">{t.origem} → {t.destino}</span> },
    { key: 'q', titulo: 'Qtd.', align: 'right', ordenar: t => t.quantidade, render: t => <b>{numero(t.quantidade)}</b> },
    { key: 'u', titulo: 'Responsável', ocultarCelular: true, render: t => t.usuario },
  ];

  if (carregando && !dados) return <Loading />;
  return (
    <>
      <PageHeader titulo="Armazéns e transferências" descricao="Cada armazém tem saldo próprio por lote. As transferências mantêm lote e validade e saem pelo lote que vence primeiro."
        acoes={<>
          {isAdmin && <button className="btn" onClick={() => setForm({ codigo: '', nome: '', endereco: '', padrao: false })}><IoAddOutline /> Novo armazém</button>}
          <button className="btn btn--primary" onClick={() => setTransferir(true)} disabled={(dados?.armazens.length ?? 0) < 2}><IoGitCompareOutline /> Nova transferência</button>
        </>} />

      <div className="grid grid-3 mb-16">
        {dados?.armazens.map(a => (
          <section key={a.id} className="panel">
            <div className="panel__head">
              <div>
                <h2>{a.nome} {a.padrao && <IoStar title="Armazém padrão" style={{ color: 'var(--tag)', verticalAlign: -2 }} />}</h2>
                <p><Code>{a.codigo}</Code> {a.endereco}</p>
              </div>
              {isAdmin && (
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="icon-btn" aria-label="Editar" onClick={() => setForm({ id: a.id, codigo: a.codigo, nome: a.nome, endereco: a.endereco || '', padrao: a.padrao })}><IoPencilOutline /></button>
                  {!a.padrao && <button className="icon-btn icon-btn--bad" aria-label="Excluir" onClick={() => excluir(a)}><IoTrashOutline /></button>}
                </div>
              )}
            </div>
            <div className="panel__body">
              <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 12px', margin: 0 }}>
                <dt className="muted">Produtos com saldo</dt><dd style={{ margin: 0, fontWeight: 700 }}>{numero(a.produtos)}</dd>
                <dt className="muted">Unidades</dt><dd style={{ margin: 0, fontWeight: 700 }}>{numero(a.unidades)}</dd>
                <dt className="muted">Valor em estoque</dt><dd style={{ margin: 0, fontWeight: 700 }}>{moeda(a.valor)}</dd>
                <dt className="muted">Endereços</dt><dd style={{ margin: 0 }}>{a._count?.locais ?? 0}</dd>
              </dl>
              {a.padrao && <p className="muted mt-8" style={{ fontSize: 12.5 }}>Armazém padrão: usado quando nenhum armazém é informado, inclusive pelo app mobile.</p>}
            </div>
          </section>
        ))}
      </div>

      <Panel flush titulo="Transferências">
        <div className="toolbar"><SearchInput value={busca} onChange={setBusca} placeholder="Documento, produto, lote ou armazém" /></div>
        <DataTable colunas={colunas} linhas={linhas} chave={t => t.codigo + t.sku + (t.lote || '')} ordemInicial={{ key: 'd', dir: 'desc' }}
          vazio={<Empty titulo="Nenhuma transferência ainda">Use “Nova transferência” para mover saldo entre a Munila e a VIAPRO.</Empty>} />
      </Panel>

      {transferir && dados && (
        <ModalTransferencia produtos={dados.produtos} armazens={dados.armazens} onFechar={() => setTransferir(false)} onSalvo={() => { setTransferir(false); recarregar(true); }} />
      )}
      {form && (
        <Modal aberto onFechar={() => setForm(null)} titulo={form.id ? 'Editar armazém' : 'Novo armazém'} tamanho="sm"
          rodape={<><button className="btn" onClick={() => setForm(null)}>Cancelar</button><button className="btn btn--primary" form="form-arm">Salvar armazém</button></>}>
          <form id="form-arm" onSubmit={salvar} className="form-grid">
            <Field label="Código" className="col-4"><input className="input" required value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} placeholder="MUN" /></Field>
            <Field label="Nome" className="col-8"><input className="input" required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></Field>
            <Field label="Endereço" className="col-12"><input className="input" value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} placeholder="Rua, número, cidade" /></Field>
            <div className="col-12"><label className="check"><input type="checkbox" checked={form.padrao} onChange={e => setForm({ ...form, padrao: e.target.checked })} /> Armazém padrão</label></div>
          </form>
        </Modal>
      )}
    </>
  );
}
