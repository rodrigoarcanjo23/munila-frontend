import type { OndaDetalhe } from './wms';

/**
 * Planta do armazém vista de cima com a rota da onda (serpentina) e as paradas numeradas.
 * A expedição fica embaixo; cada rua é uma faixa vertical.
 */
export function MapaRota({ mapa, rota, coleta, atual }: { mapa: OndaDetalhe['mapa']; rota: OndaDetalhe['rota']; coleta: OndaDetalhe['coleta']; atual?: number }) {
  if (!mapa.posicoes.length) return null;
  const maxX = Math.max(...mapa.posicoes.map(p => p.x));
  const maxY = Math.max(...mapa.posicoes.map(p => p.y)) + mapa.passoModulo;
  const pad = 2;
  const W = maxX + pad * 2, H = maxY + pad * 2 + 1.5;
  // y do armazém cresce para o fundo; no SVG o fundo fica em cima
  const sx = (x: number) => x + pad;
  const sy = (y: number) => H - pad - 1.5 - y;
  const comprimento = new Map<number, number>();
  for (const p of mapa.posicoes) comprimento.set(p.ruaIndice, Math.max(comprimento.get(p.ruaIndice) ?? 0, p.y + mapa.passoModulo / 2));
  const paradas = coleta.filter(c => c.endereco).map(c => {
    const pos = mapa.posicoes.find(p => p.id === c.endereco!.id);
    return pos ? { seq: c.seq, x: pos.x, y: pos.y, feito: c.marcado } : null;
  }).filter(Boolean) as { seq: number; x: number; y: number; feito: boolean }[];
  const caminho = rota.pontos.map(p => `${sx(p.x)},${sy(p.y)}`).join(' ');

  return (
    <svg className="mapa-rota" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rota da onda com ${paradas.length} paradas e ${Math.round(rota.distancia)} metros`}>
      {mapa.ruas.map((r, i) => (
        <g key={r}>
          <rect className="mapa-rota__rua" x={sx(i * mapa.larguraRua) - 0.7} y={sy(comprimento.get(i) ?? 0)} width={1.4} height={comprimento.get(i) ?? 0} rx={0.3} />
          <text className="mapa-rota__rotulo" x={sx(i * mapa.larguraRua)} y={sy((comprimento.get(i) ?? 0)) - 0.5} textAnchor="middle">{r}</text>
        </g>
      ))}
      <rect className="mapa-rota__doca" x={pad - 1} y={H - pad - 0.6} width={Math.max(4, maxX + 2)} height={1.1} rx={0.3} />
      <text className="mapa-rota__rotulo mapa-rota__rotulo--doca" x={pad - 0.6} y={H - pad + 0.25}>Expedição</text>
      <polyline className="mapa-rota__caminho" points={caminho} />
      {paradas.map(p => (
        <g key={p.seq} className={`mapa-rota__parada ${p.feito ? 'is-feito' : ''} ${atual === p.seq ? 'is-atual' : ''}`}>
          <circle cx={sx(p.x)} cy={sy(p.y)} r={0.75} />
          <text x={sx(p.x)} y={sy(p.y) + 0.28} textAnchor="middle">{p.seq}</text>
        </g>
      ))}
    </svg>
  );
}
