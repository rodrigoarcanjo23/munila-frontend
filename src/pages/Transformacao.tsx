import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IoAddOutline, IoDownloadOutline, IoShieldCheckmarkOutline, IoWarningOutline } from 'react-icons/io5';
import { api } from '../lib/api';
import { useCarregar } from '../lib/useCarregar';
import { Loading, PageHeader } from '../components/ui';
import type { Material, Ordem, Receita } from './transformacao/tf';
import { Painel, type PainelTf } from './transformacao/Painel';
import { Ordens } from './transformacao/Ordens';
import { Estoque, Entrada } from './transformacao/Estoque';
import { Receitas } from './transformacao/Receitas';
import { Rastreio } from './transformacao/Rastreio';
import { Auditoria } from './transformacao/Auditoria';
import { NovaTransformacao } from './transformacao/NovaTransformacao';
import { Requisicoes } from './transformacao/Requisicoes';
import './transformacao/tf.css';

const ABAS = [
  { id: 'painel', label: 'Painel' },
  { id: 'requisicoes', label: 'Requisições' },
  { id: 'ordens', label: 'Ordens' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'receitas', label: 'Receitas' },
  { id: 'rastreio', label: 'Rastreabilidade' },
  { id: 'auditoria', label: 'Auditoria' },
] as const;
type Aba = (typeof ABAS)[number]['id'];

export default function Transformacao() {
  const [params, setParams] = useSearchParams();
  const aba: Aba = (ABAS.find(a => a.id === params.get('aba'))?.id ?? 'painel');
  const loteRastreio = params.get('lote') ?? undefined;
  const irPara = (id: Aba, extra: Record<string, string> = {}) => setParams({ aba: id, ...extra }, { replace: false });

  const [nova, setNova] = useState<{ ordem?: Ordem; receitaId?: string } | null>(null);
  const [entrada, setEntrada] = useState<{ materialId?: string } | null>(null);

  const { dados, recarregar } = useCarregar(async () => {
    const [m, r, o, p] = await Promise.all([
      api.get<Material[]>('/tf/materiais'), api.get<Receita[]>('/tf/receitas'), api.get<Ordem[]>('/tf/ordens'), api.get<PainelTf>('/tf/painel'),
    ]);
    return { materiais: m.data, receitas: r.data, ordens: o.data, painel: p.data };
  });
  const atualizar = () => recarregar(true);
  const integro = dados?.painel.integridade.integro;
  const ordensAbertas = dados?.ordens.filter(o => o.status === 'Planejada' || o.status === 'Aguardando aprovação').length ?? 0;

  return (
    <div className="page tf-pagina">
      <PageHeader
        titulo="Transformação"
        descricao={<>
          Estoque separado do oficial: matéria-prima que vira produto acabado, com receita, rendimento e trilha imutável.{' '}
          {dados && (
            <button type="button" className={`tf-selo ${integro ? 'tf-selo--ok' : 'tf-selo--bad'}`} onClick={() => irPara('auditoria')}>
              {integro ? <IoShieldCheckmarkOutline /> : <IoWarningOutline />}
              {integro ? 'Registros íntegros' : 'Divergência nos registros'}
            </button>
          )}
        </>}
        acoes={<>
          <button className="btn" onClick={() => setEntrada({})} disabled={!dados?.materiais.length}><IoDownloadOutline /> Entrada de material</button>
          <button className="btn btn--primary" onClick={() => setNova({})} disabled={!dados?.materiais.length}><IoAddOutline /> Nova transformação</button>
        </>}
      />

      <nav className="tf-abas" role="tablist" aria-label="Seções da transformação">
        {ABAS.map(a => (
          <button key={a.id} role="tab" type="button" aria-selected={aba === a.id} className="tf-aba" onClick={() => irPara(a.id)}>
            {a.label}{a.id === 'ordens' && ordensAbertas > 0 && <span className="tf-aba__n">{ordensAbertas}</span>}
          </button>
        ))}
      </nav>

      {!dados ? <Loading /> : (
        <div role="tabpanel">
          {aba === 'painel' && <Painel painel={dados.painel} ordens={dados.ordens} onAba={id => irPara(id as Aba)} onAbrirOrdem={() => setNova({})} />}
          {aba === 'requisicoes' && <Requisicoes receitas={dados.receitas} onAlterado={atualizar} onEntrada={id => setEntrada({ materialId: id })} />}
          {aba === 'ordens' && <Ordens ordens={dados.ordens} onExecutar={o => setNova({ ordem: o })} onRastrear={l => irPara('rastreio', { lote: l })} onAlterado={atualizar} />}
          {aba === 'estoque' && <Estoque materiais={dados.materiais} onAlterado={atualizar} onEntrada={id => setEntrada({ materialId: id })} onRastrear={l => irPara('rastreio', { lote: l })} />}
          {aba === 'receitas' && <Receitas receitas={dados.receitas} materiais={dados.materiais} onUsar={r => setNova({ receitaId: r.id })} onAlterado={atualizar} />}
          {aba === 'rastreio' && <Rastreio key={loteRastreio ?? ''} inicial={loteRastreio} />}
          {aba === 'auditoria' && <Auditoria />}
        </div>
      )}

      {nova && dados && (
        <NovaTransformacao materiais={dados.materiais} receitas={dados.receitas} ordem={nova.ordem} receitaInicial={nova.receitaId}
          onFechar={() => setNova(null)} onSalvo={() => { setNova(null); atualizar(); }} />
      )}
      {entrada && dados && <Entrada materiais={dados.materiais} materialId={entrada.materialId} onFechar={() => setEntrada(null)} onSalvo={() => { setEntrada(null); atualizar(); }} />}
    </div>
  );
}
