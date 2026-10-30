import { useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { IoLockClosedOutline, IoMailOutline } from 'react-icons/io5';
import { api, msgErro } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Marca } from '../components/ui';

export default function Login() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function fazerLogin(e: FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      const { data } = await api.post('/login', { email: email.trim().toLowerCase(), senha });
      entrar(data);
      toast.success(`Bem-vindo, ${data.nome.split(' ')[0]}!`);
    } catch (erro) {
      toast.error(msgErro(erro, 'Não foi possível entrar.'));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login">
      <section className="login__art" aria-hidden>
        <div className="login__rack">
          {['A01-P01', 'A01-P02', 'B02-P01', 'Q01-P01'].map(c => <span key={c} className="loc">{c}</span>)}
        </div>
        <div>
          <h1>Cada item no endereço certo.</h1>
          <p>Estoque, separação, inventário, compras e produção em um só lugar — do escritório ao corredor do armazém.</p>
        </div>
        <small>ViaPro ERP · Munila</small>
      </section>

      <section className="login__form">
        <form onSubmit={fazerLogin}>
          <div className="login__marca"><Marca /></div>
          <div>
            <h2 style={{ font: '700 24px var(--font-cond)' }}>Entrar no sistema</h2>
            <p className="muted" style={{ marginTop: 4 }}>Use o e-mail e a senha cadastrados pelo gestor.</p>
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <div className="input-icon">
              <IoMailOutline />
              <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <div className="input-icon">
              <IoLockClosedOutline />
              <input id="senha" className="input" type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} required />
            </div>
          </div>
          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={carregando}>
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="muted" style={{ fontSize: 12.5 }}>O primeiro acesso do dia pode levar alguns segundos enquanto o servidor inicia.</p>
        </form>
      </section>
    </div>
  );
}
