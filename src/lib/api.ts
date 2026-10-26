import axios from 'axios';

const CHAVE_SESSAO = '@Munila:user';

/** URL da API: defina VITE_API_URL no .env (ex.: http://localhost:3333). Padrão: servidor do Render. */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://munila-backend.onrender.com',
  timeout: 60000,
});

// Envia o token JWT em todas as requisições.
api.interceptors.request.use(config => {
  try {
    const sessao = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null');
    if (sessao?.token) config.headers.Authorization = `Bearer ${sessao.token}`;
  } catch { /* sessão inválida: segue sem token */ }
  return config;
});

// Sessão expirada → avisa o app para voltar ao login.
api.interceptors.response.use(
  r => r,
  erro => {
    if (erro.response?.status === 401 && !String(erro.config?.url || '').includes('/login')) {
      window.dispatchEvent(new Event('viapro:sessao-expirada'));
    }
    return Promise.reject(erro);
  },
);

/** Extrai a mensagem de erro amigável devolvida pela API. */
export function msgErro(erro: unknown, padrao = 'Não foi possível concluir a operação.') {
  const e = erro as { response?: { status?: number; data?: { error?: string } }; code?: string; message?: string };
  if (e?.response?.data?.error) return e.response.data.error;
  if (e?.response?.status === 404) return 'Esta função ainda não existe na API em uso. Publique a versão nova da API (ou rode a API local) e tente de novo.';
  if (e?.code === 'ERR_NETWORK') return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  if (e?.code === 'ECONNABORTED') return 'O servidor demorou a responder. Tente novamente.';
  return padrao;
}

export { CHAVE_SESSAO };
