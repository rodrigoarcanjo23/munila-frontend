// ✨ FASE 12: padrão de endereço RUA · COL · NIV · APT (mesma regra da API, para a pré-visualização)
const pad = (n: number, t: number) => String(n).padStart(t, '0');
const int = (v: string | number | null | undefined) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.round(Number(v))));

export interface Partes { rua: string; coluna: string; nivel: string; apartamento: string }

export function codigoPadrao(p: Partes) {
  const rua = p.rua.trim().toUpperCase();
  const c = int(p.coluna), n = int(p.nivel), a = int(p.apartamento);
  if (!rua || c == null || n == null || a == null) return null;
  return `${/^\d+$/.test(rua) ? pad(Number(rua), 2) : rua}.${pad(c, 2)}.${pad(n, 3)}.${pad(a, 3)}`;
}

export function digitoEAN(doze: string) {
  const s = [...doze].reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0);
  return String((10 - (s % 10)) % 10);
}

export function codigoBarras(deposito: number | null | undefined, p: Partes) {
  const rua = p.rua.trim();
  const c = int(p.coluna), n = int(p.nivel), a = int(p.apartamento);
  if (deposito == null || !/^\d+$/.test(rua) || c == null || n == null || a == null) return null;
  const partes: [number, number][] = [[deposito, 2], [Number(rua), 2], [c, 2], [n, 3], [a, 3]];
  if (partes.some(([v, t]) => String(v).length > t)) return null;
  const doze = partes.map(([v, t]) => pad(v, t)).join('');
  return doze + digitoEAN(doze);
}

export const depositoRotulo = (arm?: { nome: string; numero?: number | null } | null) => `DEP. ${pad(arm?.numero ?? 1, 3)}-${(arm?.nome ?? 'Depósito').toUpperCase()}`;
