import { toast } from 'react-toastify';

// Exportações centralizadas. As bibliotecas são carregadas sob demanda (deixa o app inicial mais leve).

export interface Coluna<T> {
  titulo: string;
  valor: (item: T) => string | number | null | undefined;
  largura?: number;
}

const dataArquivo = () => new Date().toLocaleDateString('sv-SE');

/** Aba de planilha com tipo "apagado" — permite misturar tipos diferentes no mesmo arquivo. */
export interface AbaExcel { nome: string; colunas: Coluna<never>[]; linhas: unknown[] }
export const aba = <T,>(nome: string, colunas: Coluna<T>[], linhas: T[]): AbaExcel => ({ nome, colunas: colunas as Coluna<never>[], linhas });

export async function exportarExcel<T>(nomeArquivo: string, principais: { nome: string; colunas: Coluna<T>[]; linhas: T[] }[], extras: AbaExcel[] = []) {
  const abas = [...principais.map(a => aba(a.nome, a.colunas, a.linhas)), ...extras];
  if (abas.every(a => a.linhas.length === 0)) return toast.warn('Não há dados para exportar.');
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const aba of abas) {
    const dados = aba.linhas.map(l => Object.fromEntries(aba.colunas.map(c => [c.titulo, c.valor(l as never) ?? ''])));
    const ws = XLSX.utils.json_to_sheet(dados);
    ws['!cols'] = aba.colunas.map(c => ({ wch: c.largura ?? Math.max(12, c.titulo.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, aba.nome.slice(0, 31));
  }
  XLSX.writeFile(wb, `${nomeArquivo}_${dataArquivo()}.xlsx`);
  toast.success('Planilha exportada.');
}

export async function exportarPDF<T>(opts: {
  arquivo: string;
  titulo: string;
  subtitulo?: string;
  resumo?: string[];
  colunas: Coluna<T>[];
  linhas: T[];
  paisagem?: boolean;
  destacar?: (item: T, coluna: number) => [number, number, number] | undefined;
}) {
  if (opts.linhas.length === 0) return toast.warn('Não há dados para exportar.');
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: opts.paisagem ? 'landscape' : 'portrait' });
  const largura = doc.internal.pageSize.getWidth();

  doc.setFillColor(21, 35, 59);
  doc.rect(0, 0, largura, 22, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(opts.titulo, 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`ViaPro ERP · emitido em ${new Date().toLocaleString('pt-BR')}`, largura - 14, 14, { align: 'right' });

  let y = 30;
  doc.setTextColor(60);
  if (opts.subtitulo) { doc.setFontSize(10); doc.text(opts.subtitulo, 14, y); y += 6; }
  if (opts.resumo?.length) {
    doc.setFontSize(10);
    doc.setTextColor(1, 81, 118);
    doc.text(opts.resumo.join('    |    '), 14, y);
    y += 6;
  }

  autoTable(doc, {
    startY: y + 2,
    head: [opts.colunas.map(c => c.titulo)],
    body: opts.linhas.map(l => opts.colunas.map(c => String(c.valor(l) ?? ''))),
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [1, 81, 118], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    didParseCell: d => {
      if (d.section !== 'body' || !opts.destacar) return;
      const cor = opts.destacar(opts.linhas[d.row.index], d.column.index);
      if (cor) { d.cell.styles.textColor = cor; d.cell.styles.fontStyle = 'bold'; }
    },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${doc.getNumberOfPages()}`, largura - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    },
  });
  doc.save(`${opts.arquivo}_${dataArquivo()}.pdf`);
  toast.success('PDF gerado.');
}

export const VERMELHO: [number, number, number] = [192, 57, 43];
export const VERDE: [number, number, number] = [46, 125, 79];
export const LARANJA: [number, number, number] = [169, 104, 0];
