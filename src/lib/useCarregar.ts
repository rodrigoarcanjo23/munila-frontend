import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { msgErro } from './api';

/**
 * Carrega dados de forma padronizada (estado de carregamento, erro e recarga).
 * `fn` pode buscar várias rotas em paralelo e devolver o objeto que a tela precisa.
 */
export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const r = await fnRef.current();
      setDados(r);
      setErro(null);
    } catch (e) {
      const m = msgErro(e, 'Não foi possível carregar os dados.');
      setErro(m);
      toast.error(m, { toastId: m }); // evita mensagens repetidas
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { dados, setDados, carregando, erro, recarregar };
}
