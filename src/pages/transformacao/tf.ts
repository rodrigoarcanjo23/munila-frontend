// Tipos e regras de exibição do módulo de Transformação (estoque segregado).
import { numero } from '../../lib/format';

export type TipoMaterial = 'MATERIA_PRIMA' | 'INTERMEDIARIO' | 'PRODUTO' | 'SUBPRODUTO';
export const TIPOS: { valor: TipoMaterial; label: string; tom: 'info' | 'primary' | 'ok' | 'warn' }[] = [
  { valor: 'MATERIA_PRIMA', label: 'Matéria-prima', tom: 'info' },
  { valor: 'INTERMEDIARIO', label: 'Intermediário', tom: 'primary' },
  { valor: 'PRODUTO', label: 'Produto final', tom: 'ok' },
  { valor: 'SUBPRODUTO', label: 'Subproduto / sobra', tom: 'warn' },
];
export const rotuloTipo = (t: string) => TIPOS.find(x => x.valor === t)?.label ?? t;
export const tomTipo = (t: string) => TIPOS.find(x => x.valor === t)?.tom ?? 'info';
export const UNIDADES = ['UN', 'KG', 'G', 'L', 'ML', 'M', 'M2', 'CX', 'PC', 'RL', 'FL'];
export const MOTIVOS_PERDA = ['Refugo de processo', 'Material danificado', 'Erro de corte/medida', 'Setup / ajuste de máquina', 'Amostra / teste de qualidade', 'Vencido', 'Outro'];

export interface Material {
  id: string; codigo: string; nome: string; tipo: TipoMaterial; unidade: string; custoUnitario: number | null; estoqueMinimo: number | null; controlaValidade: boolean;
  proprietario: 'Próprio' | 'Terceiro'; terceiroNome: string | null; terceiroDoc: string | null; ativo: boolean; observacao: string | null;
  saldo: number; saldoLiberado: number; lotesComSaldo: number; proximaValidade: string | null; movimentos: number;
}
export interface Lote {
  id: string; materialId: string; codigo: string; validade: string | null; status: 'Liberado' | 'Quarentena' | 'Bloqueado'; saldo: number; origem: string; ordemId: string | null;
  documento: string | null; fornecedor: string | null; createdAt: string;
  material: { id: string; codigo: string; nome: string; unidade: string; tipo: string; proprietario: string; terceiroNome: string | null };
}
export interface Movimento {
  id: string; seq: number; dataHora: string; tipo: string; materialId: string; loteId: string | null; quantidade: number; saldoLoteApos: number | null;
  documento: string | null; ordemId: string | null; usuario: string; motivo: string | null; hash: string; hashAnterior: string | null;
  material: { codigo: string; nome: string; unidade: string }; lote: { codigo: string } | null;
}
export interface Evento { id: string; seq: number; dataHora: string; entidade: string; entidadeId: string | null; acao: string; resumo: string; antes: unknown; depois: unknown; usuario: string; hash: string }
export interface ItemReceita { id: string; materialId: string; papel: 'CONSUMO' | 'SUBPRODUTO'; quantidade: number; material: { id: string; codigo: string; nome: string; unidade: string } }
export interface Receita {
  id: string; codigo: string; versao: number; nome: string; produtoId: string; quantidadeBase: number; toleranciaAviso: number; toleranciaBloqueio: number; ativa: boolean;
  observacao: string | null; criadoPor: string; createdAt: string; produto: { id: string; codigo: string; nome: string; unidade: string }; itens: ItemReceita[]; _count?: { ordens: number };
}
export interface ItemOrdem { id: string; papel: 'CONSUMO' | 'PRODUTO' | 'SUBPRODUTO' | 'PERDA'; materialId: string | null; loteId: string | null; quantidadePadrao: number | null; quantidade: number; motivo: string | null; material: { id: string; codigo: string; nome: string; unidade: string } | null; lote: { id: string; codigo: string } | null }
export type StatusOrdem = 'Planejada' | 'Aguardando aprovação' | 'Concluída' | 'Cancelada' | 'Estornada';
export interface Ordem {
  id: string; codigo: string; status: StatusOrdem; receitaId: string | null; produtoId: string; quantidadePlanejada: number; quantidadeProduzida: number | null;
  rendimento: number | null; desvio: number | null; faixa: string | null; justificativa: string | null; loteCodigo: string | null; validade: string | null; observacao: string | null;
  criadoPor: string; executadoPor: string | null; aprovadoPor: string | null; aprovadoEm: string | null; createdAt: string; executadaEm: string | null; concluidaEm: string | null;
  canceladaEm: string | null; estornadaEm: string | null; motivoCancelamento: string | null;
  produto: { id: string; codigo: string; nome: string; unidade: string };
  receita: { id: string; codigo: string; versao: number; nome: string; quantidadeBase: number; toleranciaAviso: number; toleranciaBloqueio: number } | null;
  itens: ItemOrdem[];
}
export interface OrdemDetalhe extends Ordem {
  movimentos: Movimento[]; eventos: Evento[];
  balanco: { unidade: string; entrada: number; produto: number; subprodutos: number; perdas: number; naoExplicado: number } | null;
}

export const TOM_STATUS: Record<StatusOrdem, 'info' | 'warn' | 'ok' | 'bad' | undefined> = {
  Planejada: 'info', 'Aguardando aprovação': 'warn', 'Concluída': 'ok', Cancelada: undefined, Estornada: 'bad',
};
export const TOM_FAIXA: Record<string, 'ok' | 'warn' | 'bad' | undefined> = { OK: 'ok', Justificar: 'warn', Aprovar: 'bad', 'Sem receita': undefined };
export const TOM_LOTE: Record<string, 'ok' | 'warn' | 'bad'> = { Liberado: 'ok', Quarentena: 'warn', Bloqueado: 'bad' };
export const ROTULO_MOV: Record<string, string> = {
  ENTRADA: 'Entrada', CONSUMO: 'Consumo', PRODUCAO: 'Produção', SUBPRODUTO: 'Subproduto', PERDA: 'Perda', AJUSTE: 'Ajuste', SAIDA: 'Saída', ESTORNO: 'Estorno',
};

/** Quantidade com até 3 casas, sem zeros à direita. */
export const qtd = (v: number | null | undefined, un?: string) => {
  const n = Number(v || 0);
  const s = Number.isInteger(n) ? numero(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  return un ? `${s} ${un}` : s;
};

/** Mesmo cálculo da API: rendimento = produzido ÷ o que os insumos consumidos deveriam render (pela receita). */
export function avaliar(receita: Pick<Receita, 'quantidadeBase' | 'toleranciaAviso' | 'toleranciaBloqueio' | 'itens'> | null, consumos: { materialId: string; quantidade: number }[], produzido: number) {
  if (!receita || produzido <= 0) return null;
  const real = new Map<string, number>();
  for (const c of consumos) real.set(c.materialId, (real.get(c.materialId) || 0) + (c.quantidade || 0));
  const itens = receita.itens.filter(i => i.papel === 'CONSUMO');
  const esperado = Math.min(...itens.map(i => ((real.get(i.materialId) || 0) / i.quantidade) * receita.quantidadeBase));
  const rendimento = esperado > 0 ? (produzido / esperado) * 100 : 0;
  const variacoes = itens.map(i => {
    const padrao = i.quantidade * (produzido / receita.quantidadeBase);
    const r = real.get(i.materialId) || 0;
    return { materialId: i.materialId, padrao, real: r, variacao: padrao > 0 ? ((r - padrao) / padrao) * 100 : 0 };
  });
  const pior = Math.max(Math.abs(rendimento - 100), ...variacoes.map(v => Math.abs(v.variacao)));
  const faixa = pior <= receita.toleranciaAviso ? 'OK' : pior <= receita.toleranciaBloqueio ? 'Justificar' : 'Aprovar';
  return { rendimento, esperado, variacoes, faixa, pior };
}
