// Tipos das entidades devolvidas pela API.

export interface Categoria { id: string; nome: string; descricao?: string | null; _count?: { produtos: number } }
export interface Fornecedor {
  id: string; nomeEmpresa: string; cnpj?: string | null; contatoNome?: string | null; telefone?: string | null; email?: string | null;
  _count?: { produtos: number; pedidosCompra: number };
}
export interface Localizacao { id: string; codigo: string; zona: string; corredor: string; prateleira: string }
export interface UsuarioResumo { id: string; nome: string; cargo: string; email?: string }

export interface Composicao { id: string; produtoFilhoId: string; quantidade: number; produtoFilho?: Produto }

export interface Produto {
  id: string; sku: string; nome: string; descricao?: string | null; codigoBarras?: string | null; tipo: string;
  precoCusto?: number | null; precoVenda?: number | null; dataCadastro?: string; lote?: string | null; enderecoLocalizacao?: string | null;
  unidade?: string | null; estoqueMinimo?: number | null; estoqueMaximo?: number | null; leadTimeDias?: number | null; validade?: string | null;
  fornecedorId?: string | null; fornecedor?: Fornecedor | null; categoriaId: string; categoria?: Categoria | null;
  ingredientes?: Composicao[];
}

export interface Estoque {
  id: string; produtoId: string; produto: Produto; quantidade: number; status: string;
  localizacaoId?: string | null; localizacao?: Localizacao | null; responsavel?: UsuarioResumo | null;
}

export interface Movimentacao {
  id: string; produtoId: string; usuarioId: string; quantidade: number; tipoAcao: string; codigo?: string | null;
  observacao?: string | null; dataHora: string; produto?: Produto; usuario?: UsuarioResumo;
}

export interface PedidoCompra {
  id: string; codigo?: string | null; fornecedorId: string; fornecedor?: Fornecedor; produtoId: string; produto?: Produto;
  quantidade: number; custoTotal: number; dataPrevisao?: string | null; status: string; createdAt: string;
  quantidadeRecebida?: number | null; divergencia?: string | null; dataRecebimento?: string | null; observacao?: string | null;
}

export interface ItemOS { id: string; produtoId: string; quantidade: number; marcado: boolean; produto: Produto }
export interface OrdemServico {
  id: string; codigo: string; status: string; tipo: string; prioridade: string; solicitanteId: string;
  solicitante?: { nome: string }; separador?: { nome: string } | null; itens: ItemOS[]; observacao?: string | null;
  iniciadaEm?: string | null; concluidaEm?: string | null; createdAt: string; updatedAt: string;
}

export interface LogAuditoria { id: string; acao: string; itemNome: string; usuarioNome: string; motivo: string; dataHora: string }
