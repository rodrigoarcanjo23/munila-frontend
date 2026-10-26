import { useEffect, useState } from 'react';

const NOMES = ['primary', 'ok', 'bad', 'warn', 'info', 'line', 'text-2', 'text-3', 'surface', 'tag'] as const;
type Cores = Record<(typeof NOMES)[number], string>;

function ler(): Cores {
  const s = getComputedStyle(document.documentElement);
  return Object.fromEntries(NOMES.map(n => [n, s.getPropertyValue(`--${n}`).trim()])) as Cores;
}

/** Cores do tema resolvidas (gráficos SVG não entendem var(--x) em atributos). Atualiza ao trocar o tema. */
export function useCores() {
  const [cores, setCores] = useState<Cores>(ler);
  useEffect(() => {
    const atualizar = () => setCores(ler());
    const obs = new MutationObserver(atualizar);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', atualizar);
    return () => { obs.disconnect(); mq.removeEventListener('change', atualizar); };
  }, []);
  return cores;
}
