import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { IoArrowBackOutline, IoArrowForwardOutline, IoGitNetworkOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { dataHora, dataUTC, numero } from '../../lib/format';
import { Badge, Code, Empty, Loading, Panel, SearchInput } from '../../components/ui';
import { TOM_LOTE, qtd } from './tf';

interface No {
  loteId: string; lote: string; material: string; codigoMaterial: string; unidade: string; quantidade: number; validade: string | null; status: string; origem: string;
  documento: string | null; fornecedor: string | null; proprietario: string;
  ordem?: { id: string; codigo: string; data: string | null; receita: string | null; rendimento: number | null } | null;
  filhos: No[]; saidas?: { data: string; quantidade: number; destino: string | null; documento: string | null }[];
}
interface Achado { id: string; codigo: string; material: { nome: string } }
interface Arvores { lote: { id: string; codigo: string; saldo: number; material: { nome: string; unidade: string } }; origem: No | null; destino: No | null }

export function Rastreio({ inicial }: { inicial?: string }) {
  const [termo, setTermo] = useState(inicial ?? '');
  const [achados, setAchados] = useState<Achado[] | null>(null);
  const [arv, setArv] = useState<Arvores | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function buscar(t = termo) {
    if (!t.trim()) return;
    setCarregando(true); setArv(null);
    try {
      const r = await api.get<{ lotes: Achado[] }>(`/tf/rastreio?lote=${encodeURIComponent(t.trim())}`);
      setAchados(r.data.lotes);
      const exato = r.data.lotes.find(l => l.codigo.toUpperCase() === t.trim().toUpperCase());
      if (r.data.lotes.length === 1 || exato) await abrir((exato ?? r.data.lotes[0]).id, t);
    } catch (err) { toast.error(msgErro(err)); } finally { setCarregando(false); }
  }
  async function abrir(loteId: string, t = termo) {
    setCarregando(true);
    try { setArv((await api.get<Arvores>(`/tf/rastreio?lote=${encodeURIComponent(t.trim() || 'x')}&loteId=${loteId}`)).data); } catch (err) { toast.error(msgErro(err)); } finally { setCarregando(false); }
  }
  // Abre direto quando chega um lote vindo de outra aba.
  useEffect(() => { if (inicial) void buscar(inicial); }, [inicial]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel titulo="Rastreabilidade de lote" descricao="Para trás: de quais lotes e fornecedores veio. Para frente: em que foi transformado e para quem saiu. Útil em recall e reclamação de cliente.">
      <form className="toolbar" onSubmit={e => { e.preventDefault(); void buscar(); }}>
        <SearchInput value={termo} onChange={setTermo} placeholder="Código do lote (ex.: TF000123, EN000045)" onEnter={() => void buscar()} />
        <button className="btn btn--primary" disabled={!termo.trim() || carregando}><IoGitNetworkOutline /> Rastrear</button>
      </form>
      {achados && achados.length > 1 && !arv && (
        <div className="tf-achados">
          {achados.map(a => <button key={a.id} className="btn btn--sm" onClick={() => abrir(a.id)}><b>{a.codigo}</b> {a.material.nome}</button>)}
        </div>
      )}
      {achados && achados.length === 0 && <Empty titulo="Lote não encontrado">Confira o código impresso na etiqueta ou no documento.</Empty>}
      {carregando && <Loading linhas={4} />}
      {arv && !carregando && (
        <>
          <div className="tf-rastro-alvo">
            <Code>{arv.lote.codigo}</Code> <b>{arv.lote.material.nome}</b> <span className="muted">· saldo atual {qtd(arv.lote.saldo, arv.lote.material.unidade)}</span>
          </div>
          <div className="tf-rastro">
            <section>
              <h3 className="tf-sub"><IoArrowBackOutline /> De onde veio</h3>
              {arv.origem && <Arvore no={arv.origem} sentido="origem" raiz />}
            </section>
            <section>
              <h3 className="tf-sub"><IoArrowForwardOutline /> Para onde foi</h3>
              {arv.destino && (arv.destino.filhos.length || arv.destino.saidas?.length ? <Arvore no={arv.destino} sentido="destino" raiz /> : <p className="muted">Ainda não foi consumido nem saiu.</p>)}
            </section>
          </div>
        </>
      )}
    </Panel>
  );
}

function Arvore({ no, sentido, raiz }: { no: No; sentido: 'origem' | 'destino'; raiz?: boolean }) {
  return (
    <div className={`tf-no ${raiz ? 'tf-no--raiz' : ''}`}>
      <div className="tf-no__cartao">
        <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
          <span><Code>{no.lote}</Code> <b>{no.material}</b></span>
          <Badge tom={TOM_LOTE[no.status]} plain>{no.status}</Badge>
        </div>
        <div className="cell-sub">
          {qtd(no.quantidade, no.unidade)} · {no.origem}{no.validade ? ` · val. ${dataUTC(no.validade)}` : ''}
          {no.fornecedor ? ` · ${no.fornecedor}` : ''}{no.documento ? ` · ${no.documento}` : ''}
          {no.proprietario !== 'Próprio' ? ` · ${no.proprietario}` : ''}
        </div>
        {no.ordem && (
          <div className="tf-no__ordem">
            {sentido === 'origem' ? 'gerado por' : 'via'} <Code>{no.ordem.codigo}</Code>{no.ordem.receita ? ` (${no.ordem.receita})` : ''}{no.ordem.rendimento !== null ? ` · rend. ${numero(no.ordem.rendimento, 1)}%` : ''}{no.ordem.data ? ` · ${dataHora(no.ordem.data)}` : ''}
          </div>
        )}
        {no.saidas?.map((s, i) => <div key={i} className="tf-no__saida">saída de {qtd(s.quantidade, no.unidade)} → {s.destino ?? 'sem destino'}{s.documento ? ` (${s.documento})` : ''} · {dataHora(s.data)}</div>)}
      </div>
      {no.filhos.length > 0 && <div className="tf-no__filhos">{no.filhos.map((f, i) => <Arvore key={`${f.loteId}-${i}`} no={f} sentido={sentido} />)}</div>}
    </div>
  );
}
