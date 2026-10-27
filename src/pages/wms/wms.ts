// Tipos do módulo de mapa, slotting e ondas (WMS).
export type Classe = 'A' | 'B' | 'C' | null;
export interface PosResumo { id: string; codigo: string; rua: string; modulo: number; nivel: number; custo: number; dourada: boolean }
export interface ProdutoNaPosicao { id: string; nome: string; sku: string; coletas: number; classe: Classe; saldo: number }
export interface Posicao { id: string; codigo: string; rua: string; modulo: number; nivel: number; tipo: string; ativo: boolean; custo: number; dourada: boolean; produtos: ProdutoNaPosicao[]; coletas: number }
export interface LayoutResp {
  armazemId: string;
  armazens: { id: string; nome: string; codigo: string; padrao: boolean }[];
  ruas: string[];
  config: { larguraRua: number; passoModulo: number };
  posicoes: Posicao[];
  naoMapeados: { id: string; codigo: string; rua: string | null; modulo: number | null; nivel: number | null; tipo: string | null }[];
  enderecosSoltos: { texto: string; produtos: number }[];
  semPosicao: { id: string; nome: string; sku: string; coletas: number; classe: Classe; endereco: string | null }[];
  resumo: { posicoes: number; ocupadas: number; douradas: number; itensA: number; aNaDourada: number; aSemPosicao: number };
}
export interface ProdutoMov { id: string; nome: string; sku: string; coletas: number; classe: Classe }
export interface SlottingResp {
  armazemId: string; dias: number; mapeado: boolean;
  indice: { antes: number | null; depois: number | null; reducaoPct: number };
  ganhoMesMetros: number;
  porClasse: { classe: 'A' | 'B' | 'C'; itens: number; coletas: number; pctColetas: number; custoMedio: number | null; naDourada: number; semPosicao: number }[];
  movimentos: { produto: ProdutoMov; de: PosResumo | null; para: PosResumo; troca: { produto: ProdutoMov; de: PosResumo; para: PosResumo | null } | null; ganhoMesMetros: number }[];
  afinidade: { a: string; b: string; juntos: number; jaccard: number; distancia: number | null; longe: boolean; produtoA: { id: string; nome: string; sku: string; pos: PosResumo | null }; produtoB: { id: string; nome: string; sku: string; pos: PosResumo | null } }[];
}

export interface OndaLista {
  id: string; codigo: string; status: 'Aberta' | 'Em separação' | 'Concluída' | 'Cancelada'; criadoPor: string; separadorNome: string | null;
  distanciaOnda: number | null; distanciaIndividual: number | null; createdAt: string; iniciadaEm: string | null; concluidaEm: string | null;
  ordens: { id: string; codigo: string; status: string }[]; linhas: number; marcadas: number; unidades: number;
}
export interface Pendente { id: string; codigo: string; prioridade: string; createdAt: string; solicitante: string; linhas: number; unidades: number; ruas: string[]; semPosicao: number }
export interface SugestaoResp { armazemId: string; mapeado: boolean; pendentes: Pendente[]; sugestao: { ordemIds: string[]; distanciaOnda: number; distanciaIndividual: number } }
export interface Parada {
  seq: number; endereco: PosResumo | null; produto: { id: string; nome: string; sku: string }; lote: string | null; validade: string | null; quantidade: number;
  totalProduto: number; falta: number; marcado: boolean; destino: { ordemId: string; codigo: string; quantidade: number; tote: string }[];
}
export interface OndaDetalhe extends Omit<OndaLista, 'ordens' | 'linhas' | 'marcadas' | 'unidades'> {
  ordens: { id: string; codigo: string; status: string; prioridade: string; solicitante: string; tote: string; linhas: number; unidades: number }[];
  coleta: Parada[];
  rota: { pontos: { x: number; y: number }[]; distancia: number; semPosicao: number };
  mapa: { ruas: string[]; posicoes: { id: string; rua: string; ruaIndice: number; modulo: number; x: number; y: number }[]; larguraRua: number; passoModulo: number };
}

export const TOM_ONDA: Record<OndaLista['status'], 'info' | 'warn' | 'ok' | undefined> = { Aberta: 'info', 'Em separação': 'warn', 'Concluída': 'ok', Cancelada: undefined };
export const economia = (onda: number | null, individual: number | null) => (onda !== null && individual ? Math.max(0, Math.round(((individual - onda) / individual) * 100)) : null);
export const metros = (m: number | null | undefined) => (m === null || m === undefined ? '-' : m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${Math.round(m).toLocaleString('pt-BR')} m`);
