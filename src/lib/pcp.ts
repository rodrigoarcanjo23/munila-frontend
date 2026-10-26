// Tipos e regras de exibição do módulo de PCP.

export type StatusOP = 'Planejada' | 'Liberada' | 'Em produção' | 'Pausada' | 'Concluída' | 'Cancelada';
export const STATUS_ABERTOS: StatusOP[] = ['Planejada', 'Liberada', 'Em produção', 'Pausada'];
export const PRIORIDADES = ['Urgente', 'Alta', 'Normal', 'Baixa'] as const;

export const TOM_STATUS: Record<StatusOP, 'info' | 'primary' | 'warn' | 'ok' | 'bad' | undefined> = {
  Planejada: undefined, Liberada: 'info', 'Em produção': 'primary', Pausada: 'warn', 'Concluída': 'ok', Cancelada: 'bad',
};
export const TOM_PRIORIDADE: Record<string, 'bad' | 'warn' | undefined> = { Urgente: 'bad', Alta: 'warn' };
export const TOM_MATERIAL: Record<string, 'ok' | 'warn' | 'bad' | undefined> = { OK: 'ok', Parcial: 'warn', Falta: 'bad' };
export const ROTULO_MATERIAL: Record<string, string> = { OK: 'Material ok', Parcial: 'Material parcial', Falta: 'Falta material', 'Sem receita': 'Sem receita' };

export interface Recurso {
  id: string; codigo: string; nome: string; tipo: string; capacidadeDia: number; diasSemana: number; eficiencia: number; ativo: boolean; observacao?: string | null;
  capacidadeSemana?: number; ordensAbertas?: number; carga?: { carga: number; pct: number | null }[];
}

export interface ComponenteOP {
  id: string; produtoId: string; porUnidade: number; quantidadePrevista: number; quantidadeConsumida: number;
  produto: { id: string; nome: string; sku: string; unidade?: string | null; precoCusto?: number | null };
  restante?: number; saldoArmazem?: number; lotesSugeridos?: { lote: string | null; validade: string | null; quantidade: number }[];
}

export interface Material {
  status: 'OK' | 'Parcial' | 'Falta' | 'Sem receita'; podeProduzir: number;
  faltas: { produtoId: string; nome: string; sku: string; necessario: number; disponivel: number; falta: number }[];
}

export interface OrdemProducao {
  id: string; codigo: string; produtoId: string; quantidadePlanejada: number; quantidadeProduzida: number; quantidadeRefugo: number;
  status: StatusOP; prioridade: string; origem: string; inicioPrevisto: string | null; entregaPrevista: string | null;
  iniciadaEm: string | null; concluidaEm: string | null; recursoId: string | null; armazemId: string | null; loteProducao: string | null;
  validade: string | null; observacao: string | null; motivoCancelamento: string | null; createdAt: string; updatedAt: string;
  produto: { id: string; nome: string; sku: string; unidade?: string | null; precoCusto?: number | null };
  recurso: { id: string; codigo: string; nome: string } | null; armazem: { id: string; nome: string; codigo: string } | null;
  responsavel: { id: string; nome: string } | null; componentes: ComponenteOP[];
  restante: number; progresso: number; atrasada: boolean; noPrazo: boolean | null; material: Material | null; custoPrevisto: number;
}

export interface Apontamento {
  id: string; quantidade: number; refugo: number; minutos: number | null; lote: string | null; observacao: string | null;
  codigoEntrada: string | null; codigoConsumo: string | null; dataHora: string; usuario: { nome: string };
}

export interface OrdemDetalhe extends OrdemProducao { apontamentos: Apontamento[]; produtividade: number | null; minutos: number }

/** "2026-10-26" → "26/10". */
export const diaMes = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '-');
/** Data ISO "somente dia" para input type=date. */
export const paraInput = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');
