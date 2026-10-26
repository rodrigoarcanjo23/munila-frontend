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
