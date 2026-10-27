// Tipos das entidades devolvidas pela API.

export interface Armazem { id: string; codigo: string; nome: string; endereco?: string | null; padrao: boolean; ativo: boolean; produtos?: number; unidades?: number; valor?: number; _count?: { locais: number } }

export interface Categoria { id: string; nome: string; descricao?: string | null; _count?: { produtos: number } }
export interface Fornecedor {
  id: string; nomeEmpresa: string; cnpj?: string | null; contatoNome?: string | null; telefone?: string | null; email?: string | null;
  prazoPagamentoDias?: number | null;
  _count?: { produtos: number; pedidosCompra: number };
}
export interface Localizacao { id: string; codigo: string; zona: string; corredor: string; prateleira: string; armazemId?: string | null; armazem?: Armazem | null }
export interface UsuarioResumo { id: string; nome: string; cargo: string; email?: string }

export interface Composicao { id: string; produtoFilhoId: string; quantidade: number; produtoFilho?: Produto }

export interface Produto {
  id: string; sku: string; nome: string; descricao?: string | null; codigoBarras?: string | null; tipo: string;
  precoCusto?: number | null; precoVenda?: number | null; dataCadastro?: string; lote?: string | null; enderecoLocalizacao?: string | null;
  unidade?: string | null; estoqueMinimo?: number | null; estoqueMaximo?: number | null; leadTimeDias?: number | null; validade?: string | null;
  fornecedorId?: string | null; fornecedor?: Fornecedor | null; categoriaId: string; categoria?: Categoria | null;
  ingredientes?: Composicao[];
  ncm?: string | null; cest?: string | null; origemFiscal?: number | null; cfopPadrao?: string | null;
}

export interface Estoque {
  id: string; produtoId: string; produto: Produto; quantidade: number; status: string;
  localizacaoId?: string | null; localizacao?: Localizacao | null; responsavel?: UsuarioResumo | null;
  armazemId?: string | null; armazem?: Armazem | null; lote?: string | null; validade?: string | null;
}

export interface Movimentacao {
  id: string; produtoId: string; usuarioId: string; quantidade: number; tipoAcao: string; codigo?: string | null;
  observacao?: string | null; dataHora: string; produto?: Produto; usuario?: UsuarioResumo;
  armazemId?: string | null; lote?: string | null; validade?: string | null;
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
  armazemId?: string | null; armazem?: Armazem | null;
  ondaId?: string | null; // ✨ FASE 7: ordem agrupada numa onda de separação
}

export interface LogAuditoria { id: string; acao: string; itemNome: string; usuarioNome: string; motivo: string; dataHora: string }

export interface ContaBancaria { id: string; nome: string; saldoInicial: number; ativa: boolean; saldoAtual?: number }
export interface Titulo {
  id: string; tipo: 'PAGAR' | 'RECEBER'; descricao: string; categoria?: string | null; documento?: string | null; parcela?: string | null;
  valor: number; vencimento: string; status: 'Aberto' | 'Pago' | 'Cancelado'; valorPago?: number | null; dataPagamento?: string | null;
  formaPagamento?: string | null; observacao?: string | null; pessoa?: string | null; fornecedorId?: string | null;
  fornecedor?: { id: string; nomeEmpresa: string } | null; pedidoCompra?: { codigo: string | null } | null; conta?: ContaBancaria | null;
  contaId?: string | null; usuarioNome?: string | null; createdAt: string;
}
export interface ParteLote { estoqueId?: string; lote: string | null; validade: string | null; quantidade: number; armazemId?: string | null }
