import { useMemo, useState } from 'react';
import { IoBarcodeOutline } from 'react-icons/io5';
import { contem, normalizar } from '../lib/format';
import { Code, Loc } from './ui';

export interface ProdutoBasico {
  id: string;
  sku: string;
  nome: string;
  codigoBarras?: string | null;
  enderecoLocalizacao?: string | null;
}

/**
 * Busca de produto por nome, SKU ou código de barras.
 * Funciona com leitor de código de barras: ao ler e "Enter", seleciona o produto exato automaticamente.
 */
export function ProdutoPicker<P extends ProdutoBasico>({ produtos, onSelecionar, placeholder = 'Nome, SKU ou leia o código de barras', autoFocus }: {
  produtos: P[]; onSelecionar: (p: P) => void; placeholder?: string; autoFocus?: boolean;
}) {
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);

  const sugestoes = useMemo(
    () => (termo.trim() ? produtos.filter(p => contem(termo, p.nome, p.sku, p.codigoBarras)).slice(0, 12) : []),
    [termo, produtos],
  );

  function escolher(p: P) {
    onSelecionar(p);
    setTermo('');
    setAberto(false);
    setAtivo(0);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo(a => Math.min(a + 1, sugestoes.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(a => Math.max(a - 1, 0)); }
    if (e.key === 'Escape') setAberto(false);
    if (e.key === 'Enter') {
      e.preventDefault();
      const t = normalizar(termo.trim());
      const exato = produtos.find(p => normalizar(p.codigoBarras) === t || normalizar(p.sku) === t);
      const alvo = exato ?? sugestoes[ativo];
      if (alvo) escolher(alvo);
    }
  }

  return (
    <div className="ac">
      <div className="input-icon">
        <IoBarcodeOutline />
        <input
          className="input" value={termo} placeholder={placeholder} autoFocus={autoFocus}
          onChange={e => { setTermo(e.target.value); setAberto(true); setAtivo(0); }}
          onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)} onKeyDown={onKey}
          role="combobox" aria-expanded={aberto && sugestoes.length > 0} aria-label="Buscar produto"
        />
      </div>
      {aberto && termo.trim() && (
        <div className="ac__list" role="listbox">
          {sugestoes.length === 0 && <div className="ac__item muted">Nenhum produto encontrado.</div>}
          {sugestoes.map((p, i) => (
            <div key={p.id} className="ac__item" role="option" aria-selected={i === ativo} onMouseDown={() => escolher(p)}>
              <div>
                <div className="cell-title">{p.nome}</div>
                <div className="cell-sub"><Code>{p.sku}</Code></div>
              </div>
              <Loc>{p.enderecoLocalizacao}</Loc>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
