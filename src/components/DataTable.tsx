import { useMemo, useState, type ReactNode } from 'react';
import { IoArrowDown, IoArrowUp } from 'react-icons/io5';
import { Empty } from './ui';

export interface Col<T> {
  key: string;
  titulo: ReactNode;
  /** Conteúdo da célula. */
  render: (row: T) => ReactNode;
  /** Valor usado na ordenação (se omitido, a coluna não ordena). */
  ordenar?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  /** Coluna principal: no celular vira o título do cartão. */
  principal?: boolean;
  /** Esconder no celular (informação secundária). */
  ocultarCelular?: boolean;
  /** Rótulo usado no modo cartão (celular). */
  rotulo?: string;
  rodape?: ReactNode;
}

interface Props<T> {
  colunas: Col<T>[];
  linhas: T[];
  chave: (row: T) => string;
  vazio?: ReactNode;
  porPagina?: number;
  ordemInicial?: { key: string; dir: 'asc' | 'desc' };
  acoes?: (row: T) => ReactNode;
  destaque?: (row: T) => boolean;
  onLinha?: (row: T) => void;
  /** Transforma em cartões no celular (padrão: sim). */
  cartoes?: boolean;
}

export function DataTable<T>({ colunas, linhas, chave, vazio, porPagina = 60, ordemInicial, acoes, destaque, onLinha, cartoes = true }: Props<T>) {
  const [ordem, setOrdem] = useState(ordemInicial ?? null);
  const [limite, setLimite] = useState(porPagina);

  const ordenadas = useMemo(() => {
    if (!ordem) return linhas;
    const col = colunas.find(c => c.key === ordem.key);
    if (!col?.ordenar) return linhas;
    const f = col.ordenar;
    return [...linhas].sort((a, b) => {
      const va = f(a), vb = f(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true });
      return ordem.dir === 'asc' ? r : -r;
    });
  }, [linhas, ordem, colunas]);

  const visiveis = ordenadas.slice(0, limite);
  const temRodape = colunas.some(c => c.rodape !== undefined);

  function alternar(c: Col<T>) {
    if (!c.ordenar) return;
    setOrdem(o => (o?.key === c.key ? { key: c.key, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }));
  }

  if (linhas.length === 0) return <>{vazio ?? <Empty titulo="Nenhum registro encontrado" />}</>;

  return (
    <>
      <div className="table-wrap">
        <table className={`table ${cartoes ? 'table--cards' : ''}`}>
          <thead>
            <tr>
              {colunas.map(c => (
                <th
                  key={c.key}
                  className={`${c.ordenar ? 'sortable' : ''} ${c.align === 'right' ? 'num' : c.align === 'center' ? 'center' : ''}`}
                  onClick={() => alternar(c)}
                  aria-sort={ordem?.key === c.key ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.titulo}
                  {ordem?.key === c.key && (ordem.dir === 'asc' ? <IoArrowUp style={{ marginLeft: 4, verticalAlign: -2 }} /> : <IoArrowDown style={{ marginLeft: 4, verticalAlign: -2 }} />)}
                </th>
              ))}
              {acoes && <th className="actions"><span className="sr-only">Ações</span></th>}
            </tr>
          </thead>
          <tbody>
            {visiveis.map(row => (
              <tr key={chave(row)} className={destaque?.(row) ? 'is-selected' : ''} onClick={onLinha ? () => onLinha(row) : undefined} style={onLinha ? { cursor: 'pointer' } : undefined}>
                {colunas.map(c => (
                  <td
                    key={c.key}
                    data-label={c.rotulo ?? (typeof c.titulo === 'string' ? c.titulo : '')}
                    data-primary={c.principal ? '' : undefined}
                    className={`${c.align === 'right' ? 'num' : c.align === 'center' ? 'center' : ''} ${c.ocultarCelular ? 'hide-sm' : ''}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
                {acoes && <td className="actions" onClick={e => e.stopPropagation()}>{acoes(row)}</td>}
              </tr>
            ))}
          </tbody>
          {temRodape && (
            <tfoot>
              <tr>
                {colunas.map(c => (
                  <td key={c.key} className={`${c.align === 'right' ? 'num' : ''} ${c.ocultarCelular ? 'hide-sm' : ''}`} data-label={typeof c.titulo === 'string' ? c.titulo : ''}>
                    {c.rodape}
                  </td>
                ))}
                {acoes && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="table-foot">
        <span>Exibindo {visiveis.length} de {linhas.length} registro{linhas.length === 1 ? '' : 's'}</span>
        {limite < ordenadas.length && (
          <button className="btn btn--sm" onClick={() => setLimite(l => l + porPagina * 2)}>Mostrar mais</button>
        )}
      </div>
    </>
  );
}
