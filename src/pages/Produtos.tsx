import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  IoAddOutline, IoDownloadOutline, IoDocumentTextOutline, IoPencilOutline, IoTrashOutline, IoReceiptOutline,
  IoPrintOutline, IoCloseOutline,
} from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCarregar } from '../lib/useCarregar';
import { contem, data, dataUTC, hojeISO, isoParaInput, moeda, numero, paraNumero, pct } from '../lib/format';
import { ORIGENS_FISCAIS, descricaoLimpa, estoqueMinimo, procedencia } from '../lib/regras';
import { exportarExcel, exportarPDF } from '../lib/exportar';
import { imprimirEtiquetas } from '../lib/etiquetas';
import type { Categoria, Fornecedor, Localizacao, Produto } from '../lib/tipos';
import { DataTable, type Col } from '../components/DataTable';
import { ProdutoPicker } from '../components/ProdutoPicker';
import { Badge, Code, Field, Loading, Loc, Modal, Notice, PageHeader, Panel, SearchInput, useDialogo } from '../components/ui';

export default function Produtos() {
  const navigate = useNavigate();
  const { usuario, isAdmin, podeEditarCadastros } = useAuth();
  const { pedirTexto } = useDialogo();
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [tipo, setTipo] = useState('');
  const [editando, setEditando] = useState<Produto | 'novo' | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const { dados, carregando, recarregar } = useCarregar(async () => {
    const [p, c, l, f] = await Promise.all([
      api.get<Produto[]>('/produtos'), api.get<Categoria[]>('/categorias'), api.get<Localizacao[]>('/localizacoes'), api.get<Fornecedor[]>('/fornecedores'),
    ]);
    return { produtos: p.data, categorias: c.data, locais: l.data, fornecedores: f.data };
  });

  const filtrados = useMemo(() => (dados?.produtos ?? []).filter(p =>
    (!categoria || p.categoriaId === categoria) && (!tipo || p.tipo === tipo) &&
    contem(busca, p.nome, p.sku, p.lote, p.enderecoLocalizacao, p.codigoBarras, p.fornecedor?.nomeEmpresa)),
  [dados, busca, categoria, tipo]);

  async function excluir(p: Produto) {
    const motivo = await pedirTexto({
      titulo: `Excluir ${p.nome}?`, perigo: true, confirmar: 'Excluir produto',
      mensagem: 'O produto, o saldo e todo o histórico de movimentações serão apagados. A exclusão fica registrada na auditoria.',
      pedirTexto: { label: 'Motivo da exclusão', obrigatorio: true, placeholder: 'Ex.: cadastro duplicado' },
    });
    if (!motivo) return;
    try {
      await api.delete(`/produtos/${p.id}`, { data: { motivo, usuarioId: usuario?.id } });
      toast.success('Produto excluído.');
      recarregar(true);
    } catch (e) { toast.error(msgErro(e)); }
  }

  function etiquetas(lista: Produto[]) {
    imprimirEtiquetas(lista.map(p => ({ codigo: p.codigoBarras || p.sku, titulo: p.nome, linha2: `${p.sku}${p.enderecoLocalizacao ? ` | ${p.enderecoLocalizacao}` : ''}` })));
  }

  const colunas: Col<Produto>[] = [
    { key: 'sel', titulo: <input type="checkbox" aria-label="Selecionar todos" checked={filtrados.length > 0 && selecionados.length === filtrados.length} onChange={e => setSelecionados(e.target.checked ? filtrados.map(p => p.id) : [])} />, ocultarCelular: true,
      render: p => <input type="checkbox" aria-label={`Selecionar ${p.nome}`} checked={selecionados.includes(p.id)} onChange={e => setSelecionados(s => (e.target.checked ? [...s, p.id] : s.filter(x => x !== p.id)))} onClick={e => e.stopPropagation()} /> },
    { key: 'nome', titulo: 'Produto', principal: true, ordenar: p => p.nome, render: p => (
      <><div className="cell-title">{p.nome}</div><div className="cell-sub"><Code>{p.sku}</Code>{p.codigoBarras && <> &nbsp;{p.codigoBarras}</>}</div></>
    ) },
    { key: 'proc', titulo: 'Procedência', ordenar: p => p.tipo, render: p => <Badge tom={p.tipo === 'MATERIA_PRIMA' ? 'warn' : 'ok'} plain>{procedencia(p.tipo)}</Badge> },
    { key: 'cat', titulo: 'Categoria', ocultarCelular: true, ordenar: p => p.categoria?.nome, render: p => p.categoria?.nome || '-' },
    { key: 'end', titulo: 'Endereço', ordenar: p => p.enderecoLocalizacao || 'zzz', render: p => <Loc>{p.enderecoLocalizacao}</Loc> },
    { key: 'min', titulo: 'Mínimo', align: 'right', ocultarCelular: true, ordenar: p => estoqueMinimo(p), render: p => numero(estoqueMinimo(p)) },
    { key: 'pv', titulo: 'Preço venda', align: 'right', ocultarCelular: true, ordenar: p => p.precoVenda || 0, render: p => moeda(p.precoVenda) },
    { key: 'val', titulo: 'Validade', ocultarCelular: true, ordenar: p => p.validade || 'z', render: p => dataUTC(p.validade) },
    { key: 'forn', titulo: 'Fornecedor', ocultarCelular: true, ordenar: p => p.fornecedor?.nomeEmpresa, render: p => p.fornecedor?.nomeEmpresa || <span className="muted">Fabricação própria</span> },
  ];

  const exportCols = [
    { titulo: 'Nome do produto', valor: (p: Produto) => p.nome, largura: 45 },
    { titulo: 'SKU', valor: (p: Produto) => p.sku },
    { titulo: 'Código de barras', valor: (p: Produto) => p.codigoBarras || '-', largura: 16 },
    { titulo: 'Procedência', valor: (p: Produto) => procedencia(p.tipo) },
    { titulo: 'Categoria', valor: (p: Produto) => p.categoria?.nome || '-', largura: 20 },
    { titulo: 'Endereço', valor: (p: Produto) => p.enderecoLocalizacao || '-' },
    { titulo: 'Estoque mínimo', valor: (p: Produto) => estoqueMinimo(p) },
    { titulo: 'Custo', valor: (p: Produto) => moeda(p.precoCusto) },
    { titulo: 'Venda', valor: (p: Produto) => moeda(p.precoVenda) },
    { titulo: 'Data de cadastro', valor: (p: Produto) => data(p.dataCadastro) },
    { titulo: 'Fornecedor', valor: (p: Produto) => p.fornecedor?.nomeEmpresa || '-', largura: 28 },
  ];

  if (carregando && !dados) return <Loading />;

  return (
    <>
      <PageHeader
        titulo="Produtos"
        descricao="Catálogo com códigos, endereços, parâmetros de reposição, preços e receitas de produção."
        acoes={<>
          <button className="btn" onClick={() => exportarExcel('Catalogo_ViaPro', [{ nome: 'Catálogo', colunas: exportCols, linhas: filtrados }])}><IoDownloadOutline /> Excel</button>
          <button className="btn" onClick={() => exportarPDF({ arquivo: 'Catalogo_ViaPro', titulo: 'Catálogo de produtos', paisagem: true, colunas: exportCols, linhas: filtrados })}><IoDocumentTextOutline /> PDF</button>
          {podeEditarCadastros && <button className="btn btn--primary" onClick={() => setEditando('novo')}><IoAddOutline /> Novo produto</button>}
        </>}
      />

      <Panel flush>
        <div className="toolbar">
          <SearchInput value={busca} onChange={setBusca} placeholder="Nome, SKU, código de barras, lote, endereço ou fornecedor" />
          <select className="select" value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {dados?.categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select className="select" value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Procedência">
            <option value="">Nacional e importado</option>
            <option value="ACABADO">Nacional (montado)</option>
            <option value="MATERIA_PRIMA">Importado (matéria-prima)</option>
          </select>
          {selecionados.length > 0 && (
            <button className="btn" onClick={() => etiquetas((dados?.produtos ?? []).filter(p => selecionados.includes(p.id)))}><IoPrintOutline /> Etiquetas ({selecionados.length})</button>
          )}
        </div>
        <DataTable
          colunas={colunas} linhas={filtrados} chave={p => p.id} ordemInicial={{ key: 'nome', dir: 'asc' }}
          acoes={p => (
            <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
              <button className="icon-btn" title="Kardex" aria-label="Kardex" onClick={() => navigate(`/kardex/${p.id}`)}><IoReceiptOutline /></button>
              <button className="icon-btn" title="Imprimir etiqueta" aria-label="Imprimir etiqueta" onClick={() => etiquetas([p])}><IoPrintOutline /></button>
              {podeEditarCadastros && <button className="icon-btn" title="Editar" aria-label="Editar" onClick={() => setEditando(p)}><IoPencilOutline /></button>}
              {isAdmin && <button className="icon-btn icon-btn--bad" title="Excluir" aria-label="Excluir" onClick={() => excluir(p)}><IoTrashOutline /></button>}
            </div>
          )}
        />
      </Panel>

      {editando && dados && (
        <ModalProduto
          produto={editando === 'novo' ? null : editando}
          {...dados}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); recarregar(true); }}
          onCategoriaCriada={() => recarregar(true)}
        />
      )}
    </>
  );
}

interface Ingrediente { produtoFilhoId: string; nome: string; sku: string; quantidade: number }

function ModalProduto({ produto, produtos, categorias, locais, fornecedores, onFechar, onSalvo, onCategoriaCriada }: {
  produto: Produto | null; produtos: Produto[]; categorias: Categoria[]; locais: Localizacao[]; fornecedores: Fornecedor[];
  onFechar: () => void; onSalvo: () => void; onCategoriaCriada: () => void;
}) {
  const novo = !produto;
  const [f, setF] = useState({
    nome: produto?.nome ?? '', sku: produto?.sku ?? '', codigoBarras: produto?.codigoBarras ?? '', tipo: produto?.tipo ?? 'ACABADO',
    categoriaId: produto?.categoriaId ?? categorias[0]?.id ?? '', unidade: produto?.unidade ?? 'UN',
    descricao: descricaoLimpa(produto?.descricao), dataCadastro: isoParaInput(produto?.dataCadastro) || hojeISO(),
    enderecoLocalizacao: produto?.enderecoLocalizacao ?? '', lote: produto?.lote ?? '', validade: isoParaInput(produto?.validade),
    estoqueMinimo: String(produto ? estoqueMinimo(produto) : 10), estoqueMaximo: produto?.estoqueMaximo != null ? String(produto.estoqueMaximo) : '',
    leadTimeDias: produto?.leadTimeDias != null ? String(produto.leadTimeDias) : '', fornecedorId: produto?.fornecedorId ?? '',
    precoCusto: produto?.precoCusto ? String(produto.precoCusto).replace('.', ',') : '', precoVenda: produto?.precoVenda ? String(produto.precoVenda).replace('.', ',') : '',
    estoqueInicial: '0', localizacaoId: '',
    ncm: produto?.ncm ?? '', cest: produto?.cest ?? '', origemFiscal: produto?.origemFiscal != null ? String(produto.origemFiscal) : '', cfopPadrao: produto?.cfopPadrao ?? '',
  });
  const [receita, setReceita] = useState<Ingrediente[]>(
    (produto?.ingredientes ?? []).map(i => ({ produtoFilhoId: i.produtoFilhoId, nome: i.produtoFilho?.nome ?? '-', sku: i.produtoFilho?.sku ?? '-', quantidade: i.quantidade })),
  );
  const [qtdIngrediente, setQtdIngrediente] = useState('1');
  const [novaCategoria, setNovaCategoria] = useState<string | null>(null);
  const [cats, setCats] = useState(categorias);
  const [salvando, setSalvando] = useState(false);
  const set = (campo: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [campo]: e.target.value }));

  const custo = paraNumero(f.precoCusto), venda = paraNumero(f.precoVenda);
  const margem = custo > 0 ? ((venda - custo) / custo) * 100 : 0;
  const materias = produtos.filter(p => p.tipo === 'MATERIA_PRIMA' && p.id !== produto?.id);

  async function criarCategoria() {
    if (!novaCategoria?.trim()) return;
    try {
      const { data: c } = await api.post<Categoria>('/categorias', { nome: novaCategoria.trim() });
      setCats(x => [...x, c]);
      setF(s => ({ ...s, categoriaId: c.id }));
      setNovaCategoria(null);
      onCategoriaCriada();
      toast.success('Categoria criada.');
    } catch (e) { toast.error(msgErro(e)); }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f.nome.trim() || !f.sku.trim()) return toast.warn('Preencha o nome e o SKU.');
    if (!f.categoriaId) return toast.warn('Crie ou selecione uma categoria.');
    setSalvando(true);
    const payload = {
      ...f, nome: f.nome.trim(), sku: f.sku.trim(), precoCusto: custo, precoVenda: venda,
      estoqueMinimo: f.estoqueMinimo === '' ? null : Number(f.estoqueMinimo),
      estoqueMaximo: f.estoqueMaximo === '' ? null : Number(f.estoqueMaximo),
      leadTimeDias: f.leadTimeDias === '' ? null : Number(f.leadTimeDias),
      validade: f.validade || null, fornecedorId: f.fornecedorId || null, origemFiscal: f.origemFiscal === '' ? null : Number(f.origemFiscal),
      ingredientes: f.tipo === 'ACABADO' ? receita.map(r => ({ produtoFilhoId: r.produtoFilhoId, quantidade: r.quantidade })) : [],
      estoqueInicial: novo ? Number(f.estoqueInicial) || 0 : undefined,
      localizacaoId: novo ? f.localizacaoId || null : undefined,
    };
    try {
      if (novo) await api.post('/produtos', payload); else await api.put(`/produtos/${produto!.id}`, payload);
      toast.success(novo ? 'Produto cadastrado.' : 'Produto atualizado.');
      onSalvo();
    } catch (err) {
      toast.error(msgErro(err, 'Verifique os dados preenchidos.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto onFechar={onFechar} tamanho="lg" titulo={novo ? 'Novo produto' : `Editar ${produto!.nome}`}
      rodape={<>
        <button className="btn" onClick={onFechar}>Cancelar</button>
        <button className="btn btn--primary" form="form-produto" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar produto'}</button>
      </>}
    >
      <form id="form-produto" onSubmit={salvar} className="form-grid">
        <div className="form-section">Identificação</div>
        <Field label="Nome do produto" className="col-6"><input className="input" value={f.nome} onChange={set('nome')} required placeholder="Ex.: Lupa de leitura" /></Field>
        <Field label="SKU" className="col-3"><input className="input" value={f.sku} onChange={set('sku')} required placeholder="MUN-099" /></Field>
        <Field label="Código de barras (EAN)" className="col-3"><input className="input" value={f.codigoBarras} onChange={set('codigoBarras')} inputMode="numeric" /></Field>
        <Field label="Procedência" className="col-3">
          <select className="select" value={f.tipo} onChange={set('tipo')}>
            <option value="ACABADO">Nacional (montado)</option>
            <option value="MATERIA_PRIMA">Importado (matéria-prima)</option>
          </select>
        </Field>
        <Field label="Categoria" className="col-4">
          {novaCategoria === null ? (
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <select className="select" value={f.categoriaId} onChange={set('categoriaId')}>
                {cats.length === 0 && <option value="">Nenhuma categoria</option>}
                {cats.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <button type="button" className="btn" onClick={() => setNovaCategoria('')}>Nova</button>
            </div>
          ) : (
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input" autoFocus value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} placeholder="Nome da categoria"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criarCategoria(); } }} />
              <button type="button" className="btn btn--primary" onClick={criarCategoria}>Criar</button>
              <button type="button" className="icon-btn" aria-label="Cancelar" onClick={() => setNovaCategoria(null)}><IoCloseOutline /></button>
            </div>
          )}
        </Field>
        <Field label="Unidade" className="col-2">
          <select className="select" value={f.unidade} onChange={set('unidade')}>
            {['UN', 'CX', 'PCT', 'KIT', 'KG', 'L', 'M'].map(u => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Data de cadastro" className="col-3"><input className="input" type="date" value={f.dataCadastro} onChange={set('dataCadastro')} /></Field>
        <Field label="Descrição" className="col-12"><input className="input" value={f.descricao} onChange={set('descricao')} placeholder="Opcional" /></Field>

        <div className="form-section">Armazenagem e reposição</div>
        <Field label="Endereço físico" className="col-4" dica={locais.length ? 'Escolha um endereço cadastrado ou digite.' : undefined}>
          <input className="input" list="lista-enderecos" value={f.enderecoLocalizacao} onChange={set('enderecoLocalizacao')} placeholder="A01-P01" />
          <datalist id="lista-enderecos">{locais.map(l => <option key={l.id} value={l.codigo}>{l.zona}</option>)}</datalist>
        </Field>
        <Field label="Lote" className="col-4"><input className="input" value={f.lote} onChange={set('lote')} placeholder="L2026B" /></Field>
        <Field label="Validade" className="col-4"><input className="input" type="date" value={f.validade} onChange={set('validade')} /></Field>
        <Field label="Estoque mínimo" className="col-3"><input className="input" type="number" min={0} value={f.estoqueMinimo} onChange={set('estoqueMinimo')} /></Field>
        <Field label="Estoque máximo" className="col-3" dica="Opcional"><input className="input" type="number" min={0} value={f.estoqueMaximo} onChange={set('estoqueMaximo')} /></Field>
        <Field label="Prazo de entrega (dias)" className="col-3" dica="Usado na sugestão de compras"><input className="input" type="number" min={0} value={f.leadTimeDias} onChange={set('leadTimeDias')} placeholder="7" /></Field>
        <Field label="Fornecedor" className="col-3">
          <select className="select" value={f.fornecedorId} onChange={set('fornecedorId')}>
            <option value="">Fabricação própria</option>
            {fornecedores.map(x => <option key={x.id} value={x.id}>{x.nomeEmpresa}</option>)}
          </select>
        </Field>

        <div className="form-section">Preços</div>
        <Field label="Preço de custo (R$)" className="col-4"><input className="input" inputMode="decimal" value={f.precoCusto} onChange={set('precoCusto')} placeholder="0,00" /></Field>
        <Field label="Preço de venda (R$)" className="col-4"><input className="input" inputMode="decimal" value={f.precoVenda} onChange={set('precoVenda')} placeholder="0,00" /></Field>
        <Field label="Margem sobre o custo" className="col-4"><div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)' }}><b className={margem >= 0 ? 'up' : 'down'}>{pct(margem)}</b></div></Field>

        <div className="form-section">Fiscal (para NF-e)</div>
        <Field label="NCM" className="col-3"><input className="input" inputMode="numeric" value={f.ncm} onChange={set('ncm')} placeholder="0000.00.00" /></Field>
        <Field label="CEST" className="col-3"><input className="input" inputMode="numeric" value={f.cest} onChange={set('cest')} placeholder="Opcional" /></Field>
        <Field label="CFOP padrão" className="col-2"><input className="input" inputMode="numeric" value={f.cfopPadrao} onChange={set('cfopPadrao')} placeholder="5102" /></Field>
        <Field label="Origem" className="col-4">
          <select className="select" value={f.origemFiscal} onChange={set('origemFiscal')}>
            <option value="">Selecione…</option>
            {ORIGENS_FISCAIS.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
          </select>
        </Field>

        {novo && <>
          <div className="form-section">Saldo inicial</div>
          <Field label="Quantidade inicial" className="col-4"><input className="input" type="number" min={0} value={f.estoqueInicial} onChange={set('estoqueInicial')} /></Field>
          <Field label="Endereço do saldo" className="col-8">
            <select className="select" value={f.localizacaoId} onChange={set('localizacaoId')}>
              <option value="">Não vincular</option>
              {locais.map(l => <option key={l.id} value={l.id}>{l.codigo} · {l.zona}</option>)}
            </select>
          </Field>
        </>}

        {f.tipo === 'ACABADO' && <>
          <div className="form-section">Receita de produção (kit)</div>
          <div className="col-12">
            <p className="muted" style={{ marginBottom: 10 }}>Matérias-primas necessárias para montar 1 unidade. Usada em “Produzir lote”.</p>
            <div className="form-grid">
              <div className="col-8"><ProdutoPicker produtos={materias} placeholder="Adicionar matéria-prima (nome, SKU ou código)" onSelecionar={m => {
                if (receita.some(r => r.produtoFilhoId === m.id)) return toast.warn('Este item já está na receita.');
                setReceita(r => [...r, { produtoFilhoId: m.id, nome: m.nome, sku: m.sku, quantidade: Math.max(1, Number(qtdIngrediente) || 1) }]);
              }} /></div>
              <Field label="Qtd. por unidade" className="col-4"><input className="input" type="number" min={1} value={qtdIngrediente} onChange={e => setQtdIngrediente(e.target.value)} /></Field>
            </div>
            {materias.length === 0 && <div className="mt-8"><Notice tom="info">Cadastre produtos importados (matéria-prima) para montar receitas.</Notice></div>}
            {receita.length > 0 && (
              <table className="table mt-8">
                <thead><tr><th>Componente</th><th className="num">Qtd.</th><th className="actions" /></tr></thead>
                <tbody>
                  {receita.map(r => (
                    <tr key={r.produtoFilhoId}>
                      <td><div className="cell-title">{r.nome}</div><div className="cell-sub"><Code>{r.sku}</Code></div></td>
                      <td className="num"><input className="input" style={{ width: 80, height: 32, textAlign: 'right' }} type="number" min={1} value={r.quantidade}
                        onChange={e => setReceita(x => x.map(y => (y.produtoFilhoId === r.produtoFilhoId ? { ...y, quantidade: Math.max(1, Number(e.target.value) || 1) } : y)))} /></td>
                      <td className="actions"><button type="button" className="icon-btn icon-btn--bad" aria-label="Remover" onClick={() => setReceita(x => x.filter(y => y.produtoFilhoId !== r.produtoFilhoId))}><IoTrashOutline /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>}
      </form>
    </Modal>
  );
}
