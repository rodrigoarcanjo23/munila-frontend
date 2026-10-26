const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numFmt = new Intl.NumberFormat('pt-BR');
const compactFmt = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export const moeda = (v: number | null | undefined) => moedaFmt.format(v || 0);
export const numero = (v: number | null | undefined, casas = 0) =>
  casas ? (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : numFmt.format(v || 0);
export const compacto = (v: number) => compactFmt.format(v || 0);
export const pct = (v: number | null | undefined, casas = 1) => `${(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;

export function data(v?: string | Date | null) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
}

/** Datas "somente dia" vindas do banco (validade, previsão) são gravadas em UTC: exibe sem deslocar o fuso. */
export function dataUTC(v?: string | Date | null) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function dataHora(v?: string | Date | null) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '-' : `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function haQuanto(v?: string | Date | null) {
  if (!v) return '';
  const min = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

/** AAAA-MM-DD local (para inputs type=date). */
export const hojeISO = () => new Date().toLocaleDateString('sv-SE');
export const isoParaInput = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

/** Aceita "12,50" ou "12.50". */
export const paraNumero = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).trim();
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : 0;
};

export const normalizar = (s?: string | null) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Busca tolerante a acentos em vários campos. */
export const contem = (termo: string, ...campos: (string | null | undefined)[]) => {
  const t = normalizar(termo.trim());
  if (!t) return true;
  return campos.some(c => normalizar(c).includes(t));
};

export const iniciais = (nome?: string) =>
  (nome || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
