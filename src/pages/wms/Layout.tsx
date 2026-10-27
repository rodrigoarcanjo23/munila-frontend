import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { IoAddOutline, IoArrowForwardOutline, IoCheckmarkOutline, IoDocumentTextOutline, IoStar, IoSwapHorizontalOutline, IoCloudDownloadOutline } from 'react-icons/io5';
import { api, msgErro } from '../../lib/api';
import { useCarregar } from '../../lib/useCarregar';
import { numero, pct } from '../../lib/format';
import { exportarPDF } from '../../lib/exportar';
import type { Produto } from '../../lib/tipos';
import { ProdutoPicker } from '../../components/ProdutoPicker';
import { Badge, Code, Empty, Field, Loading, Loc, Modal, Notice, PageHeader, Panel, Segmented, useDialogo } from '../../components/ui';
import { metros, type LayoutResp, type Posicao, type SlottingResp } from './wms';
import './wms.css';

type Aba = 'mapa' | 'slotting';
type Modo = 'giro' | 'classe' | 'ocupacao';
const TOM_CLASSE: Record<string, 'primary' | 'info' | undefined> = { A: 'primary', B: 'info' };

export default function Layout() {
  const [params, setParams] = useSearchParams();
  const aba: Aba = params.get('aba') === 'slotting' ? 'slotting' : 'mapa';
  const [armazemId, setArmazemId] = useState('');
  const { dados, recarregar } = useCarregar(async () => (await api.get<LayoutResp>(`/wms/layout${armazemId ? `?armazemId=${armazemId}` : ''}`)).data, [armazemId]);

  return (
    <div className="wms">
      <PageHeader
        titulo="Mapa e slotting"
        descricao="O armazém visto de cima: onde cada produto está, quanto ele sai e onde deveria estar para a separação andar menos."
        acoes={dados && dados.armazens.length > 1 ? (
          <select className="select" value={armazemId || dados.armazemId} onChange={e => setArmazemId(e.target.value)} aria-label="Armazém">
            {dados.armazens.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        ) : undefined}
      />
      <nav className="wms-abas" role="tablist">
        <button role="tab" aria-selected={aba === 'mapa'} onClick={() => setParams({ aba: 'mapa' })}>Mapa do armazém</button>
        <button role="tab" aria-selected={aba === 'slotting'} onClick={() => setParams({ aba: 'slotting' })}>Slotting por giro</button>
      </nav>
      {!dados ? <Loading /> : aba === 'mapa'
        ? <Mapa dados={dados} onAlterado={() => recarregar(true)} />
        : <Slotting armazemId={dados.armazemId} mapeado={dados.posicoes.length > 0} onAlterado={() => recarregar(true)} irParaMapa={() => setParams({ aba: 'mapa' })} />}
    </div>
  );
}

// ================================================================== mapa
function corCelula(p: Posicao | undefined, modo: Modo, maxColetas: number) {
  if (!p || !p.ativo) return undefined;
  if (modo === 'ocupacao') return p.produtos.length ? 'color-mix(in srgb, var(--primary) 55%, var(--surface))' : undefined;
  if (modo === 'classe') {
    const c = p.produtos[0]?.classe;
    return c === 'A' ? 'var(--primary)' : c === 'B' ? 'color-mix(in srgb, var(--primary) 50%, var(--surface))' : p.produtos.length ? 'color-mix(in srgb, var(--primary) 18%, var(--surface))' : undefined;
  }
  if (!p.coletas) return p.produtos.length ? 'color-mix(in srgb, var(--primary) 10%, var(--surface))' : undefined;
  const t = Math.sqrt(p.coletas / maxColetas);
  return `color-mix(in srgb, var(--primary) ${Math.round(18 + t * 82)}%, var(--surface))`;
}

function Mapa({ dados, onAlterado }: { dados: LayoutResp; onAlterado: () => void }) {
  const [modo, setModo] = useState<Modo>('giro');
  const [sel, setSel] = useState<{ rua: string; modulo: number } | null>(null);
  const [gerar, setGerar] = useState(false);
  const porChave = useMemo(() => new Map(dados.posicoes.map(p => [`${p.rua}|${p.modulo}|${p.nivel}`, p])), [dados.posicoes]);
  const maxModulo = Math.max(0, ...dados.posicoes.map(p => p.modulo));
  const maxNivel = Math.max(0, ...dados.posicoes.map(p => p.nivel));
  const maxColetas = Math.max(1, ...dados.posicoes.map(p => p.coletas));
  const r = dados.resumo;
  const doModulo = sel ? dados.posicoes.filter(p => p.rua === sel.rua && p.modulo === sel.modulo).sort((a, b) => b.nivel - a.nivel) : [];

  return (
    <>
      <dl className="wms-resumo">
        <div><dt>Posições mapeadas</dt><dd>{numero(r.posicoes)}</dd><span>{numero(r.ocupadas)} ocupadas · {numero(r.posicoes - r.ocupadas)} livres</span></div>
        <div><dt>Zona dourada</dt><dd>{numero(r.douradas)}</dd><span>posições de picking nos níveis 2 e 3 (cintura e peito)</span></div>
        <div><dt>Itens A na zona dourada</dt><dd className={r.itensA && r.aNaDourada < r.itensA ? 'qty--warn' : 'up'}>{r.aNaDourada}<small> de {r.itensA}</small></dd><span>{r.aSemPosicao ? `${r.aSemPosicao} item(ns) A sem posição no mapa` : 'os que mais saem'}</span></div>
        <div><dt>A arrumar</dt><dd>{numero(dados.naoMapeados.length + dados.enderecosSoltos.length)}</dd><span>endereços sem posição ou só escritos no produto</span></div>
      </dl>

      {dados.posicoes.length === 0 ? (
        <Panel>
          <Empty titulo="O mapa ainda está vazio">
            Gere os endereços do armazém (ruas × módulos × níveis) ou informe a posição dos endereços que você já usa.
            <div className="mt-16 row" style={{ justifyContent: 'center' }}><button className="btn btn--primary" onClick={() => setGerar(true)}><IoAddOutline /> Gerar endereços</button></div>
          </Empty>
        </Panel>
      ) : (
        <div className="grid grid-main-side mb-16">
          <Panel flush titulo="Vista de cima" descricao="Cada coluna é uma rua; a expedição fica embaixo. Clique num módulo para ver os níveis."
            acoes={<>
              <Segmented valor={modo} onChange={setModo} opcoes={[{ valor: 'giro', label: 'Giro' }, { valor: 'classe', label: 'Classe ABC' }, { valor: 'ocupacao', label: 'Ocupação' }]} />
              <button className="btn btn--sm" onClick={() => setGerar(true)}><IoAddOutline /> Gerar endereços</button>
            </>}>
            <div className="mapa-wrap">
              <div className="mapa" style={{ gridTemplateColumns: `28px repeat(${dados.ruas.length}, minmax(72px, 128px))` }}>
                <span />
                {dados.ruas.map(rua => <span key={rua} className="mapa__rua">Rua {rua}</span>)}
                {Array.from({ length: maxModulo }, (_, i) => maxModulo - i).map(m => (
                  <div key={m} className="mapa__linha" style={{ display: 'contents' }}>
                    <span className="mapa__mod">{m}</span>
                    {dados.ruas.map(rua => {
                      const niveis = Array.from({ length: maxNivel }, (_, k) => porChave.get(`${rua}|${m}|${maxNivel - k}`));
                      const existe = niveis.some(Boolean);
                      const ativo = sel?.rua === rua && sel.modulo === m;
                      return (
                        <button key={rua} type="button" className={`mapa__cel ${existe ? '' : 'is-vazio'} ${ativo ? 'is-sel' : ''}`} disabled={!existe}
                          onClick={() => setSel({ rua, modulo: m })} aria-label={`Rua ${rua}, módulo ${m}`}>
                          {niveis.map((p, k) => (
                            <i key={k} className={`${p?.dourada && p.tipo === 'Picking' ? 'is-ouro' : ''} ${p && !p.produtos.length ? 'is-livre' : ''}`}
                              style={{ background: corCelula(p, modo, maxColetas) }} title={p ? `${p.codigo} · ${p.produtos.map(x => x.nome).join(', ') || 'livre'}${p.coletas ? ` · ${p.coletas} coletas` : ''}` : ''} />
                          ))}
                        </button>
                      );
                    })}
                  </div>
                ))}
                <span />
                <div className="mapa__expedicao" style={{ gridColumn: `2 / span ${dados.ruas.length}` }}>Expedição</div>
              </div>
            </div>
            <div className="mapa-legenda">
              {modo === 'giro' && <><span><i style={{ background: 'color-mix(in srgb, var(--primary) 18%, var(--surface))' }} />sai pouco</span><span><i style={{ background: 'var(--primary)' }} />sai muito</span></>}
              {modo === 'classe' && <><span><i style={{ background: 'var(--primary)' }} />A</span><span><i style={{ background: 'color-mix(in srgb, var(--primary) 50%, var(--surface))' }} />B</span><span><i style={{ background: 'color-mix(in srgb, var(--primary) 18%, var(--surface))' }} />C</span></>}
              {modo === 'ocupacao' && <span><i style={{ background: 'color-mix(in srgb, var(--primary) 55%, var(--surface))' }} />ocupada</span>}
              <span><i className="is-livre" />livre</span>
              <span><i className="is-ouro-leg" />zona dourada</span>
            </div>
          </Panel>

          <Panel titulo={sel ? `Rua ${sel.rua} · módulo ${sel.modulo}` : 'Detalhe'} descricao={sel ? 'Do nível mais alto para o chão' : 'Clique num módulo do mapa'}>
            {!sel ? <p className="muted">Os níveis 2 e 3 (marcados com estrela) são a zona dourada: é onde o item que mais sai deve ficar.</p> : (
              <ul className="mapa-detalhe">
                {doModulo.map(p => <NivelDetalhe key={p.id} p={p} armazemId={dados.armazemId} onAlterado={onAlterado} />)}
              </ul>
            )}
          </Panel>
        </div>
      )}

      <Mapeamento dados={dados} onAlterado={onAlterado} />
      {gerar && <GerarEnderecos armazemId={dados.armazemId} onFechar={() => setGerar(false)} onSalvo={() => { setGerar(false); onAlterado(); }} />}
    </>
  );
}

function NivelDetalhe({ p, armazemId, onAlterado }: { p: Posicao; armazemId: string; onAlterado: () => void }) {
  const [escolher, setEscolher] = useState(false);
  const { dados: produtos } = useCarregar(async () => (escolher ? (await api.get<Produto[]>('/produtos')).data : []), [escolher]);
  async function atribuir(produtoId: string) {
    try { await api.post('/wms/layout/atribuir', { produtoId, localizacaoId: p.id, armazemId }); toast.success(`Produto endereçado em ${p.codigo}.`); setEscolher(false); onAlterado(); } catch (e) { toast.error(msgErro(e)); }
  }
  return (
    <li>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="row" style={{ gap: 6 }}><Loc>{p.codigo}</Loc> <span className="muted">nível {p.nivel}</span>{p.dourada && p.tipo === 'Picking' && <IoStar className="ouro" aria-label="Zona dourada" />}</span>
        <span className="muted">{p.tipo}{!p.ativo ? ' · inativo' : ''}</span>
      </div>
      {p.produtos.length === 0 ? <span className="muted">Livre</span> : p.produtos.map(x => (
        <div key={x.id} className="mapa-detalhe__prod">
          <span><b>{x.nome}</b><small><Code>{x.sku}</Code> · saldo {numero(x.saldo)}</small></span>
          <span className="num">{x.classe && <Badge tom={TOM_CLASSE[x.classe]} plain>{x.classe}</Badge>}<small>{numero(x.coletas)} coletas</small></span>
        </div>
      ))}
      {escolher ? (
        <div className="mt-8">{produtos ? <ProdutoPicker produtos={produtos} onSelecionar={x => atribuir(x.id)} autoFocus placeholder="Produto para este endereço" /> : <Loading linhas={1} />}</div>
      ) : <button className="btn btn--sm btn--ghost mt-8" onClick={() => setEscolher(true)}><IoAddOutline /> Endereçar produto aqui</button>}
    </li>
  );
}

function Mapeamento({ dados, onAlterado }: { dados: LayoutResp; onAlterado: () => void }) {
  const [edicao, setEdicao] = useState<Record<string, { rua: string; modulo: string; nivel: string; tipo: string }>>({});
  const val = (id: string, l: LayoutResp['naoMapeados'][number]) => edicao[id] ?? { rua: l.rua ?? '', modulo: l.modulo ? String(l.modulo) : '', nivel: l.nivel ? String(l.nivel) : '', tipo: l.tipo ?? 'Picking' };
  async function salvar(id: string, l: LayoutResp['naoMapeados'][number]) {
    const v = val(id, l);
    try { await api.put(`/wms/layout/posicoes/${id}`, v); toast.success(`${l.codigo} posicionado no mapa.`); onAlterado(); } catch (e) { toast.error(msgErro(e)); }
  }
  async function importar() {
    try { const r = await api.post<{ criados: number }>('/wms/layout/importar-enderecos', { armazemId: dados.armazemId }); toast.success(`${r.data.criados} endereço(s) criado(s). Agora informe a posição de cada um.`); onAlterado(); } catch (e) { toast.error(msgErro(e)); }
  }
  if (!dados.naoMapeados.length && !dados.enderecosSoltos.length && !dados.semPosicao.length) return null;
  return (
    <div className="grid grid-2">
      <Panel flush titulo="Endereços sem posição no mapa" descricao="Informe rua, módulo (contando da expedição) e nível (1 = chão) para que entrem no mapa, no slotting e na rota.">
        {dados.naoMapeados.length === 0 ? <p className="muted" style={{ padding: 16 }}>Todos os endereços cadastrados estão no mapa.</p> : (
          <table className="table table--compacta mapeamento">
            <thead><tr><th>Endereço</th><th>Rua</th><th>Módulo</th><th>Nível</th><th>Tipo</th><th /></tr></thead>
            <tbody>
              {dados.naoMapeados.map(l => {
                const v = val(l.id, l);
                const set = (k: keyof typeof v, x: string) => setEdicao(e => ({ ...e, [l.id]: { ...v, [k]: k === 'rua' ? x.toUpperCase() : x } }));
                return (
                  <tr key={l.id}>
                    <td><Loc>{l.codigo}</Loc></td>
                    <td><input className="input" value={v.rua} onChange={e => set('rua', e.target.value)} aria-label="Rua" placeholder="A" /></td>
                    <td><input className="input" type="number" min={1} value={v.modulo} onChange={e => set('modulo', e.target.value)} aria-label="Módulo" /></td>
                    <td><input className="input" type="number" min={1} value={v.nivel} onChange={e => set('nivel', e.target.value)} aria-label="Nível" /></td>
                    <td><select className="select" value={v.tipo} onChange={e => set('tipo', e.target.value)} aria-label="Tipo">{['Picking', 'Pulmão', 'Chão', 'Doca'].map(t => <option key={t}>{t}</option>)}</select></td>
                    <td><button className="icon-btn" title="Salvar" aria-label="Salvar posição" disabled={!v.rua || !v.modulo} onClick={() => salvar(l.id, l)}><IoCheckmarkOutline /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
      <div className="stack">
        {dados.enderecosSoltos.length > 0 && (
          <Panel titulo="Endereços só escritos no produto" descricao="Aparecem no cadastro de produtos mas não existem como endereço." acoes={<button className="btn btn--sm btn--primary" onClick={importar}><IoCloudDownloadOutline /> Criar {dados.enderecosSoltos.length} endereço(s)</button>}>
            <div className="row">{dados.enderecosSoltos.slice(0, 30).map(e => <span key={e.texto} className="row" style={{ gap: 4 }}><Loc>{e.texto}</Loc><small className="muted">{e.produtos}</small></span>)}</div>
          </Panel>
        )}
        {dados.semPosicao.length > 0 && (
          <Panel flush titulo="Itens que saem e não estão no mapa" descricao="Sem endereço ou com endereço sem posição. Ficam fora do slotting e vão para o fim da rota.">
            <table className="table table--compacta">
              <tbody>
                {dados.semPosicao.slice(0, 12).map(p => (
                  <tr key={p.id}><td><div className="cell-title">{p.nome}</div><div className="cell-sub"><Code>{p.sku}</Code>{p.endereco ? <> · {p.endereco}</> : ''}</div></td><td>{p.classe && <Badge tom={TOM_CLASSE[p.classe]} plain>{p.classe}</Badge>}</td><td className="num">{numero(p.coletas)} coletas</td></tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </div>
  );
}

function GerarEnderecos({ armazemId, onFechar, onSalvo }: { armazemId: string; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ ruas: 'A B C D', modulos: '10', niveis: '4', tipo: 'Picking' });
  const ruas = f.ruas.split(/[,;\s]+/).filter(Boolean);
  const total = ruas.length * Number(f.modulos || 0) * Number(f.niveis || 0);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try { const r = await api.post<{ criados: number; ignorados: number }>('/wms/layout/gerar', { ...f, armazemId }); toast.success(`${r.data.criados} endereço(s) criado(s)${r.data.ignorados ? `; ${r.data.ignorados} já existiam` : ''}.`); onSalvo(); } catch (err) { toast.error(msgErro(err)); }
  }
  return (
    <Modal aberto onFechar={onFechar} titulo="Gerar endereços" descricao="Cria uma grade de posições no formato RUA-MÓDULO-NÍVEL (ex.: A-03-2)." tamanho="md"
      rodape={<><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn btn--primary" form="gerar-end" disabled={!total}>Criar {numero(total)} endereço(s)</button></>}>
      <form id="gerar-end" onSubmit={salvar} className="form-grid">
        <Field label="Ruas" className="col-12" dica="Separadas por espaço ou vírgula. A primeira é a mais perto da expedição."><input className="input" value={f.ruas} onChange={e => setF({ ...f, ruas: e.target.value.toUpperCase() })} /></Field>
        <Field label="Módulos por rua" className="col-4" dica="1 = frente"><input className="input" type="number" min={1} max={99} value={f.modulos} onChange={e => setF({ ...f, modulos: e.target.value })} /></Field>
        <Field label="Níveis" className="col-4" dica="1 = chão"><input className="input" type="number" min={1} max={9} value={f.niveis} onChange={e => setF({ ...f, niveis: e.target.value })} /></Field>
        <Field label="Tipo" className="col-4"><select className="select" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{['Picking', 'Pulmão', 'Chão', 'Doca'].map(t => <option key={t}>{t}</option>)}</select></Field>
        <div className="col-12"><Notice tom="info">Endereços que já existem são mantidos. Exemplo do que será criado: {ruas.slice(0, 2).map(r => <Code key={r}>{r}-01-1</Code>)} … <Code>{ruas[ruas.length - 1] ?? 'A'}-{String(f.modulos || 1).padStart(2, '0')}-{f.niveis || 1}</Code></Notice></div>
      </form>
    </Modal>
  );
}

// ================================================================== slotting
function Slotting({ armazemId, mapeado, onAlterado, irParaMapa }: { armazemId: string; mapeado: boolean; onAlterado: () => void; irParaMapa: () => void }) {
  const navigate = useNavigate();
  const { confirmar } = useDialogo();
  const [dias, setDias] = useState<'60' | '90' | '180'>('90');
  const { dados, recarregar } = useCarregar(async () => (await api.get<SlottingResp>(`/wms/slotting?armazemId=${armazemId}&dias=${dias}`)).data, [armazemId, dias]);
  if (!mapeado) return <Panel><Empty titulo="Primeiro, monte o mapa">O slotting compara o giro de cada item com o esforço de cada posição. Gere os endereços ou informe a posição dos que já existem.<div className="mt-16"><button className="btn btn--primary" onClick={irParaMapa}>Ir para o mapa <IoArrowForwardOutline /></button></div></Empty></Panel>;
  if (!dados) return <Loading />;

  async function aplicar(m: SlottingResp['movimentos'][number]) {
    const ok = await confirmar({
      titulo: `Mover ${m.produto.nome}?`, confirmar: 'Aplicar remanejamento',
      mensagem: <>O endereço de picking passa de <b>{m.de?.codigo ?? 'nenhum'}</b> para <b>{m.para.codigo}</b>{m.troca ? <> e <b>{m.troca.produto.nome}</b> vai para <b>{m.troca.para?.codigo}</b></> : ''}. O cadastro e o saldo disponível são atualizados agora. Faça a troca física em seguida. A mudança fica na auditoria.</>,
    });
    if (!ok) return;
    try { await api.post('/wms/slotting/aplicar', { produtoId: m.produto.id, paraId: m.para.id, trocaProdutoId: m.troca?.produto.id, armazemId }); toast.success('Remanejamento aplicado.'); recarregar(true); onAlterado(); } catch (e) { toast.error(msgErro(e)); }
  }
  function imprimir() {
    exportarPDF({
      arquivo: 'Remanejamentos_slotting', titulo: 'Tarefas de remanejamento (slotting)', paisagem: true,
      resumo: [`Caminhada por coleta: ${metros(dados!.indice.antes)} → ${metros(dados!.indice.depois)} (−${pct(dados!.indice.reducaoPct, 0)})`],
      colunas: [
        { titulo: '#', valor: (_m: SlottingResp['movimentos'][number]) => dados!.movimentos.indexOf(_m) + 1 },
        { titulo: 'Produto', valor: m => `[${m.produto.sku}] ${m.produto.nome}`, largura: 40 },
        { titulo: 'Classe', valor: m => m.produto.classe ?? '' },
        { titulo: 'De', valor: m => m.de?.codigo ?? '-' },
        { titulo: 'Para', valor: m => m.para.codigo },
        { titulo: 'Troca com', valor: m => (m.troca ? `[${m.troca.produto.sku}] ${m.troca.produto.nome} → ${m.troca.para?.codigo}` : '-'), largura: 40 },
        { titulo: 'Feito', valor: () => '[   ]' },
      ],
      linhas: dados!.movimentos,
    });
  }

  const i = dados.indice;
  const a = dados.porClasse.find(c => c.classe === 'A');
  return (
    <>
      <dl className="wms-resumo">
        <div><dt>Caminhada por coleta</dt><dd>{i.antes !== null ? `${numero(i.antes, 1)} m` : '-'}</dd><span>ida e volta, ponderada pelo giro de cada item</span></div>
        <div><dt>Depois das sugestões</dt><dd className="up">{i.depois !== null ? `${numero(i.depois, 1)} m` : '-'}</dd><span>{i.reducaoPct ? `−${pct(i.reducaoPct, 0)} de caminhada` : 'já está bem distribuído'}</span></div>
        <div><dt>Economia estimada</dt><dd>{metros(dados.ganhoMesMetros)}</dd><span>por mês, no ritmo dos últimos {dados.dias} dias</span></div>
        <div><dt>Itens A na zona dourada</dt><dd className={a && a.naDourada < a.itens ? 'qty--warn' : 'up'}>{a?.naDourada ?? 0}<small> de {a?.itens ?? 0}</small></dd><span>{a ? `${pct(a.pctColetas, 0)} das coletas vêm dos itens A` : ''}</span></div>
      </dl>

      <Panel flush className="mb-16" titulo="Remanejamentos sugeridos" descricao="Do maior ganho para o menor. Quem sai mais vai para perto da expedição e para a altura da cintura; o item de giro baixo cede o lugar."
        acoes={<>
          <Segmented valor={dias} onChange={setDias} opcoes={[{ valor: '60', label: '60 d' }, { valor: '90', label: '90 d' }, { valor: '180', label: '180 d' }]} />
          <button className="btn btn--sm" onClick={imprimir} disabled={!dados.movimentos.length}><IoDocumentTextOutline /> Lista de tarefas</button>
        </>}>
        {dados.movimentos.length === 0 ? <Empty titulo="Nada a remanejar">Os itens que mais saem já estão nas posições de menor esforço.</Empty> : (
          <table className="table slot-tabela">
            <thead><tr><th>Produto</th><th>De</th><th /><th>Para</th><th className="hide-sm">Troca com</th><th className="num">Ganho/mês</th><th /></tr></thead>
            <tbody>
              {dados.movimentos.map(m => (
                <tr key={m.produto.id}>
                  <td><div className="cell-title">{m.produto.nome}</div><div className="cell-sub">{m.produto.classe && <Badge tom={TOM_CLASSE[m.produto.classe]} plain>{m.produto.classe}</Badge>} <Code>{m.produto.sku}</Code> · {numero(m.produto.coletas)} coletas</div></td>
                  <td>{m.de ? <PosTag p={m.de} /> : <span className="muted">sem endereço</span>}</td>
                  <td className="muted" aria-hidden><IoArrowForwardOutline /></td>
                  <td><PosTag p={m.para} /></td>
                  <td className="hide-sm">{m.troca ? <span className="row" style={{ gap: 6 }}><IoSwapHorizontalOutline className="muted" /><span><span className="cell-title">{m.troca.produto.nome}</span><div className="cell-sub">{numero(m.troca.produto.coletas)} coletas · vai para {m.troca.para?.codigo}</div></span></span> : <span className="muted">posição livre</span>}</td>
                  <td className="num"><b>{metros(m.ganhoMesMetros)}</b></td>
                  <td><button className="btn btn--sm btn--primary" onClick={() => aplicar(m)}>Aplicar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="grid grid-2">
        <Panel flush titulo="Classe ABC × posição" descricao="ABC pelo número de coletas: A = 20% dos itens que mais saem, B = 30% seguintes, C = o restante.">
          <table className="table table--compacta">
            <thead><tr><th>Classe</th><th className="num">Itens</th><th className="num">Coletas</th><th className="num">Esforço médio</th><th className="num">Na zona dourada</th></tr></thead>
            <tbody>
              {dados.porClasse.map(c => (
                <tr key={c.classe}>
                  <td><Badge tom={TOM_CLASSE[c.classe]} plain>{c.classe}</Badge></td>
                  <td className="num">{c.itens}{c.semPosicao ? <div className="cell-sub">{c.semPosicao} sem posição</div> : null}</td>
                  <td className="num">{pct(c.pctColetas, 0)}</td>
                  <td className="num">{c.custoMedio !== null ? `${numero(c.custoMedio, 1)} m` : '-'}</td>
                  <td className="num">{c.naDourada} de {c.itens - c.semPosicao}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted slot-nota">Esforço = caminho da expedição até a posição + esforço do nível (agachar no nível 1, escada do 4 em diante). O ideal é o esforço médio cair de C para A.</p>
        </Panel>

        <Panel flush titulo="Produtos que saem juntos" descricao="Pares que aparecem nas mesmas ordens (índice de Jaccard). Deixá-los lado a lado encurta a separação.">
          {dados.afinidade.length === 0 ? <Empty titulo="Sem pares frequentes">Ainda não há ordens suficientes com os mesmos produtos.</Empty> : (
            <ul className="afinidade">
              {dados.afinidade.map(p => (
                <li key={`${p.a}${p.b}`}>
                  <span className="afinidade__par">
                    <button type="button" className="link" onClick={() => navigate(`/kardex/${p.produtoA.id}`)}>{p.produtoA.nome}</button>
                    <span className="muted"> + </span>
                    <button type="button" className="link" onClick={() => navigate(`/kardex/${p.produtoB.id}`)}>{p.produtoB.nome}</button>
                    <small>{p.juntos} ordens juntos · {pct(p.jaccard * 100, 0)} de afinidade{p.produtoA.pos && p.produtoB.pos ? ` · ${p.produtoA.pos.codigo} e ${p.produtoB.pos.codigo}` : ''}</small>
                  </span>
                  {p.distancia === null ? <Badge plain>sem posição</Badge> : p.longe ? <Badge tom="warn" plain>{numero(p.distancia, 0)} m entre eles</Badge> : <Badge tom="ok" plain>vizinhos</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function PosTag({ p }: { p: { codigo: string; nivel: number; dourada: boolean; custo: number } }) {
  return (
    <span className="pos-tag">
      <Loc>{p.codigo}</Loc>
      <small>{p.dourada ? <><IoStar className="ouro" /> dourada</> : `nível ${p.nivel}`} · {numero(p.custo, 1)} m</small>
    </span>
  );
}

