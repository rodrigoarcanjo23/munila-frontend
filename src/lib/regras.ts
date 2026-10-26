// Regras de negócio compartilhadas pelas telas (espelham a API).

export const TIPOS_ENTRADA = [
  'Entrada de mercadoria',
  'Devolução VIAPRO',
  'Ajuste de Entrada de Inventário',
  'Entrada por produção',
  'Retorno de demonstração',
];
export const TIPOS_SAIDA = [
  'Saída de mercadoria',
  'Ajuste de Saída de Inventário',
  'Saída para demonstração',
  'Perdas/Avarias',
  'Saída para produção',
];
export const TODOS_TIPOS = [...TIPOS_ENTRADA, ...TIPOS_SAIDA];
export const ehEntrada = (tipo: string) => TIPOS_ENTRADA.includes(tipo);

export const ESTOQUE_MINIMO_PADRAO = 10;

/** Campo novo `estoqueMinimo`, com fallback para a tag legada [MIN:x] na descrição. */
export function estoqueMinimo(p?: { estoqueMinimo?: number | null; descricao?: string | null } | null) {
  if (!p) return ESTOQUE_MINIMO_PADRAO;
  if (p.estoqueMinimo !== null && p.estoqueMinimo !== undefined) return p.estoqueMinimo;
  const m = p.descricao?.match(/\[MIN:(\d+)\]/);
  return m ? parseInt(m[1], 10) : ESTOQUE_MINIMO_PADRAO;
}

/** Descrição sem a tag técnica [MIN:x]. */
export const descricaoLimpa = (d?: string | null) => (d || '').replace(/\s*\[MIN:\d+\]/g, '').trim();

export const procedencia = (tipo?: string) => (tipo === 'MATERIA_PRIMA' ? 'Importado' : 'Nacional');

export type Tom = 'ok' | 'warn' | 'bad' | 'info' | 'primary' | undefined;

export function tomStatusEstoque(status: string): Tom {
  if (status === 'Disponível') return 'ok';
  if (status === 'Ruptura') return 'bad';
  if (status === 'Em Demonstração') return 'warn';
  return 'info';
}

export function tomStatusOS(status: string): Tom {
  if (status === 'Pendente') return 'warn';
  if (status === 'Em Separação') return 'info';
  if (status === 'Concluída') return 'ok';
  return undefined;
}

export function tomPrioridade(p: string): Tom {
  if (p === 'Urgente') return 'bad';
  if (p === 'Alta') return 'warn';
  return undefined;
}

export const PESO_PRIORIDADE: Record<string, number> = { Urgente: 3, Alta: 2, Normal: 1 };

export const TIPO_OS_LABEL: Record<string, string> = { SAIDA: 'Saída', ENTRADA: 'Entrada', DEVOLUCAO: 'Devolução' };
