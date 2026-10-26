import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { IoCheckmarkCircle, IoAlertCircleOutline, IoSaveOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { Code, Field, Loading, Notice, PageHeader, Panel } from '../components/ui';

interface Config {
  razaoSocial?: string | null; nomeFantasia?: string | null; cnpj?: string | null; inscricaoEstadual?: string | null; regimeTributario?: string | null;
  cep?: string | null; logradouro?: string | null; numero?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null;
  telefone?: string | null; email?: string | null; emissorNFe?: string | null; ambienteNFe?: string | null;
}
interface Pendencias { empresaFaltando: string[]; produtosPendentes: { id: string; sku: string; nome: string; faltando: string[] }[]; totalProdutos: number; pronto: boolean }

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export default function Empresa() {
  const [f, setF] = useState<Config>({});
  const [salvando, setSalvando] = useState(false);
  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [c, p] = await Promise.all([api.get<Config>('/empresa'), api.get<Pendencias>('/fiscal/pendencias')]);
    return { config: c.data, pend: p.data };
  });
  useEffect(() => { if (dados) setF(dados.config); }, [dados]);
  const set = (k: keyof Config) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try { await api.put('/empresa', f); toast.success('Dados da empresa salvos.'); recarregar(true); } catch (err) { toast.error(msgErro(err)); } finally { setSalvando(false); }
  }

  if (carregando && !dados) return <Loading />;
  const pend = dados?.pend;
  const prodOk = (pend?.totalProdutos ?? 0) - (pend?.produtosPendentes.length ?? 0);

  return (
    <>
      <PageHeader titulo="Empresa e fiscal" descricao="Dados do emitente e checklist para emitir NF-e. A emissão será feita por um provedor integrado (ex.: Focus NFe), que precisa destes dados e do certificado digital A1."
        acoes={<button className="btn btn--primary" form="form-empresa" disabled={salvando}><IoSaveOutline /> {salvando ? 'Salvando…' : 'Salvar'}</button>} />

      <div className="grid grid-main-side">
        <Panel titulo="Dados do emitente">
          <form id="form-empresa" onSubmit={salvar} className="form-grid">
            <Field label="Razão social" className="col-8"><input className="input" value={f.razaoSocial ?? ''} onChange={set('razaoSocial')} /></Field>
            <Field label="Nome fantasia" className="col-4"><input className="input" value={f.nomeFantasia ?? ''} onChange={set('nomeFantasia')} /></Field>
            <Field label="CNPJ" className="col-4"><input className="input" inputMode="numeric" value={f.cnpj ?? ''} onChange={set('cnpj')} placeholder="00.000.000/0000-00" /></Field>
            <Field label="Inscrição estadual" className="col-4"><input className="input" value={f.inscricaoEstadual ?? ''} onChange={set('inscricaoEstadual')} /></Field>
            <Field label="Regime tributário" className="col-4">
              <select className="select" value={f.regimeTributario ?? ''} onChange={set('regimeTributario')}>
                <option value="">Selecione…</option><option>Simples Nacional</option><option>Lucro Presumido</option><option>Lucro Real</option>
              </select>
            </Field>
            <div className="form-section">Endereço</div>
            <Field label="CEP" className="col-3"><input className="input" inputMode="numeric" value={f.cep ?? ''} onChange={set('cep')} /></Field>
            <Field label="Logradouro" className="col-7"><input className="input" value={f.logradouro ?? ''} onChange={set('logradouro')} /></Field>
            <Field label="Número" className="col-2"><input className="input" value={f.numero ?? ''} onChange={set('numero')} /></Field>
            <Field label="Bairro" className="col-5"><input className="input" value={f.bairro ?? ''} onChange={set('bairro')} /></Field>
            <Field label="Cidade" className="col-5"><input className="input" value={f.cidade ?? ''} onChange={set('cidade')} /></Field>
            <Field label="UF" className="col-2"><select className="select" value={f.uf ?? ''} onChange={set('uf')}><option value="" />{UFS.map(u => <option key={u}>{u}</option>)}</select></Field>
            <Field label="Telefone" className="col-6"><input className="input" value={f.telefone ?? ''} onChange={set('telefone')} /></Field>
            <Field label="E-mail fiscal" className="col-6"><input className="input" type="email" value={f.email ?? ''} onChange={set('email')} /></Field>
            <div className="form-section">Emissão de NF-e</div>
            <Field label="Provedor de emissão" className="col-6" dica="Integração prevista para a próxima fase.">
              <select className="select" value={f.emissorNFe ?? ''} onChange={set('emissorNFe')}>
                <option value="">Ainda não definido</option><option>Focus NFe</option><option>NFE.io</option><option>PlugNotas</option><option>eNotas</option><option>Outro</option>
              </select>
            </Field>
            <Field label="Ambiente" className="col-6">
              <select className="select" value={f.ambienteNFe ?? 'homologacao'} onChange={set('ambienteNFe')}>
                <option value="homologacao">Homologação (testes)</option><option value="producao">Produção</option>
              </select>
            </Field>
          </form>
        </Panel>

        <div className="stack">
          <Panel titulo="Pronto para emitir NF-e?">
            {pend?.pronto
              ? <Notice tom="ok">Cadastro completo. Falta só contratar o provedor e enviar o certificado A1.</Notice>
              : <Notice tom="warn">Complete os itens abaixo antes de integrar a emissão.</Notice>}
            <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gap: 8 }}>
              <li className="row" style={{ flexWrap: 'nowrap' }}>
                {pend?.empresaFaltando.length ? <IoAlertCircleOutline style={{ color: 'var(--warn)', flex: 'none' }} /> : <IoCheckmarkCircle style={{ color: 'var(--ok)', flex: 'none' }} />}
                <span>Dados do emitente{pend?.empresaFaltando.length ? `: falta ${pend.empresaFaltando.join(', ')}` : ' completos'}</span>
              </li>
              <li className="row" style={{ flexWrap: 'nowrap' }}>
                {pend?.produtosPendentes.length ? <IoAlertCircleOutline style={{ color: 'var(--warn)', flex: 'none' }} /> : <IoCheckmarkCircle style={{ color: 'var(--ok)', flex: 'none' }} />}
                <span>Produtos com NCM, origem e CFOP: {prodOk} de {pend?.totalProdutos ?? 0}</span>
              </li>
              <li className="row" style={{ flexWrap: 'nowrap' }}>
                <IoAlertCircleOutline style={{ color: 'var(--text-3)', flex: 'none' }} /><span>Certificado digital A1 e contrato com o provedor (fora do sistema)</span>
              </li>
            </ul>
          </Panel>
          {!!pend?.produtosPendentes.length && (
            <Panel titulo="Produtos sem dados fiscais" flush descricao="Edite em Produtos → seção Fiscal">
              <table className="table">
                <tbody>
                  {pend.produtosPendentes.slice(0, 12).map(p => (
                    <tr key={p.id}><td><div className="cell-title">{p.nome}</div><div className="cell-sub"><Code>{p.sku}</Code> {p.faltando.join(', ')}</div></td></tr>
                  ))}
                </tbody>
              </table>
              <div className="table-foot"><span>{pend.produtosPendentes.length} produto(s)</span><Link className="btn btn--sm" to="/produtos">Abrir produtos</Link></div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
