/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CHAVE_SESSAO } from './api';

export interface Usuario {
  id: string;
  nome: string;
  cargo: string;
  email: string;
  token?: string;
}

export type Perfil = 'admin' | 'estoque' | 'vendas' | 'outro';

export function perfilDe(cargo?: string): Perfil {
  const c = (cargo || '').toLowerCase();
  if (c.includes('admin') || c.includes('gestor')) return 'admin';
  if (c.includes('estoq') || c.includes('operador') || c.includes('separador')) return 'estoque';
  if (c.includes('vend')) return 'vendas';
  return 'outro';
}

interface AuthCtx {
  usuario: Usuario | null;
  perfil: Perfil;
  isAdmin: boolean;
  podeEditarCadastros: boolean;
  entrar: (u: Usuario) => void;
  sair: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

function lerSessao(): Usuario | null {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null');
  } catch {
    localStorage.removeItem(CHAVE_SESSAO);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(lerSessao);

  const entrar = useCallback((u: Usuario) => {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(u));
    setUsuario(u);
  }, []);

  const sair = useCallback(() => {
    localStorage.removeItem(CHAVE_SESSAO);
    setUsuario(null);
  }, []);

  useEffect(() => {
    const expirou = () => sair();
    window.addEventListener('viapro:sessao-expirada', expirou);
    return () => window.removeEventListener('viapro:sessao-expirada', expirou);
  }, [sair]);

  const valor = useMemo<AuthCtx>(() => {
    const perfil = perfilDe(usuario?.cargo);
    return { usuario, perfil, isAdmin: perfil === 'admin', podeEditarCadastros: perfil !== 'vendas', entrar, sair };
  }, [usuario, entrar, sair]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
