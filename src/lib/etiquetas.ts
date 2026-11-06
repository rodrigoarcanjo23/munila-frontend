import { toast } from 'react-toastify';

export interface Etiqueta {
  codigo: string;      // conteúdo do código de barras
  titulo: string;      // texto grande
  linha2?: string;     // texto menor
  destaque?: boolean;  // etiqueta de endereço (faixa amarela)
}

/** Gera o SVG do código de barras (Code128) como texto. */
export async function svgCodigoBarras(codigo: string, altura = 50) {
  const { default: JsBarcode } = await import('jsbarcode');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, codigo, { format: 'CODE128', height: altura, displayValue: true, fontSize: 13, margin: 4, font: 'monospace' });
  return svg.outerHTML;
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * Abre a janela de impressão com etiquetas (50×30 mm por padrão, funciona em Zebra/Elgin e em folha A4).
 */
export async function imprimirEtiquetas(etiquetas: Etiqueta[], formato: 'termica' | 'a4' = 'termica') {
  if (etiquetas.length === 0) return toast.warn('Nada para imprimir.');
  const janela = window.open('', '_blank', 'width=520,height=700');
  if (!janela) return toast.error('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');

  const blocos = await Promise.all(etiquetas.map(async e => `
    <div class="et ${e.destaque ? 'et--end' : ''}">
      <div class="t">${esc(e.titulo)}</div>
      ${e.linha2 ? `<div class="s">${esc(e.linha2)}</div>` : ''}
      ${await svgCodigoBarras(e.codigo, e.destaque ? 46 : 38)}
    </div>`));

  const termica = formato === 'termica';
  janela.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
    @page { ${termica ? 'size: 50mm 30mm; margin: 0;' : 'size: A4; margin: 8mm;'} }
    body { margin: 0; font-family: Arial, sans-serif; color: #000; }
    .grid { ${termica ? '' : 'display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;'} }
    .et { ${termica ? 'width:50mm;height:30mm;page-break-after:always;' : 'height:30mm;border:1px dashed #999;'} box-sizing:border-box; padding:1.5mm 2mm; text-align:center; overflow:hidden; display:flex; flex-direction:column; justify-content:center; }
    .et .t { font-weight:700; font-size:10pt; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .et .s { font-size:7.5pt; color:#333; }
    .et svg { width:100%; height:auto; max-height:17mm; }
    .et--end .t { font-size:15pt; font-family: monospace; background:#f2b705; padding:0.5mm 0; }
  </style></head><body><div class="grid">${blocos.join('')}</div>
  <script>window.onload=function(){setTimeout(function(){window.print();},250)}</script></body></html>`);
  janela.document.close();
}

// ============================================================
// ✨ FASE 12: etiqueta de endereço no padrão do sistema antigo (100 × 50 mm)
//   DEP. 001-DEPOSITO MATRIZ / RUA - COL - NIV - APT / 21.02.001.001 / código de barras
// ============================================================
export interface EtiquetaEndereco {
  deposito: string;            // "DEP. 001-DEPOSITO MATRIZ"
  codigo: string;              // "21.02.001.001"
  partes?: string[] | null;    // ["21","02","001","001"] quando está no padrão
  codigoBarras: string;        // 13 dígitos (ou o próprio código, para endereços antigos)
}
const ROTULOS = ['RUA', 'COL', 'NIV', 'APT'];

export async function imprimirEtiquetasEndereco(lista: EtiquetaEndereco[], formato: 'termica' | 'a4' = 'termica') {
  if (lista.length === 0) return toast.warn('Nada para imprimir.');
  const janela = window.open('', '_blank', 'width=720,height=720');
  if (!janela) return toast.error('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
  const blocos = await Promise.all(lista.map(async e => {
    const { default: JsBarcode } = await import('jsbarcode');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, e.codigoBarras, { format: 'CODE128', height: 60, width: 1.6, displayValue: true, fontSize: 15, margin: 0, textMargin: 2, font: 'Arial' });
    const codigo = e.partes?.length === 4
      ? `<div class="cod">${e.partes.map((p, i) => `<span class="p"><small>${ROTULOS[i]}</small><b>${esc(p)}</b></span>${i < 3 ? '<span class="sep"><small>-</small><b>.</b></span>' : ''}`).join('')}</div>`
      : `<div class="cod cod--livre"><span class="p"><b>${esc(e.codigo)}</b></span></div>`;
    return `<div class="et"><div class="dep">${esc(e.deposito)}</div>${codigo}<div class="bar">${svg.outerHTML}</div></div>`;
  }));
  const termica = formato === 'termica';
  janela.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas de endereço</title><style>
    @page { ${termica ? 'size: 100mm 50mm; margin: 0;' : 'size: A4; margin: 8mm;'} }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
    .grid { ${termica ? '' : 'display:grid;grid-template-columns:repeat(2,1fr);gap:4mm;'} }
    .et { width: ${termica ? '100mm' : '100%'}; height: 50mm; ${termica ? 'page-break-after: always;' : 'border: 1px solid #000;'} padding: 2mm 3mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; }
    .dep { font-size: 17pt; line-height: 1; white-space: nowrap; }
    .cod { display: flex; align-items: flex-end; justify-content: center; line-height: .9; }
    .cod .p, .cod .sep { display: flex; flex-direction: column; align-items: center; }
    .cod small { font-size: 10.5pt; font-weight: 400; margin-bottom: .5mm; }
    .cod b { font-size: 40pt; font-weight: 700; letter-spacing: -.5pt; }
    .cod .sep b { margin: 0 .2mm; }
    .cod--livre b { font-size: 36pt; }
    .bar svg { height: 17mm; width: auto; max-width: 70mm; display: block; }
  </style></head><body><div class="grid">${blocos.join('')}</div>
  <script>window.onload=function(){setTimeout(function(){window.print();},300)}</script></body></html>`);
  janela.document.close();
}

/** Monta a etiqueta de um endereço cadastrado. */
export function etiquetaDoEndereco(l: { codigo: string; rua?: string | null; modulo?: number | null; nivel?: number | null; apartamento?: number | null; codigoBarras?: string | null; armazem?: { nome: string; numero?: number | null } | null }, padrao?: { nome: string; numero?: number | null }): EtiquetaEndereco {
  const arm = l.armazem ?? padrao;
  const num = String(arm?.numero ?? 1).padStart(3, '0');
  const partes = partesDoEndereco(l);
  return { deposito: `DEP. ${num}-${(arm?.nome ?? 'DEPÓSITO').toUpperCase()}`, codigo: l.codigo, partes, codigoBarras: l.codigoBarras || l.codigo };
}

/** ["21","02","001","001"] quando o código do endereço segue o padrão RUA.COL.NIV.APT. */
export function partesDoEndereco(l: { codigo: string; rua?: string | null; modulo?: number | null; nivel?: number | null; apartamento?: number | null }) {
  const m = l.codigo.match(/^([A-Z0-9]+)\.(\d+)\.(\d+)\.(\d+)$/i);
  return m ? [m[1], m[2], m[3], m[4]] : null;
}
