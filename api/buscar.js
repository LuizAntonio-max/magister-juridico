// Vercel Serverless Function — /api/buscar.js
// Baseado exatamente no código do Lovable (escavador-search/index.ts)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { tipo, valor, uf } = req.body;
  if (!valor) return res.status(400).json({ error: 'Parâmetro obrigatório: valor' });

  const token = process.env.ESCAVADOR_TOKEN;
  if (!token) return res.status(500).json({ error: 'Token do Escavador não configurado' });

  const BASE = 'https://api.escavador.com';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const onlyDigits = (s) => (s ?? '').replace(/\D/g, '');

  async function callEscavador(path) {
    const r = await fetch(`${BASE}${path}`, { headers });
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    return { ok: r.ok, status: r.status, data };
  }

  try {
    let processos = [];

    if (tipo === 'numero') {
      const cnj = onlyDigits(valor);
      const result = await callEscavador(`/api/v2/processos/numero_cnj/${cnj}`);
      if (!result.ok) throw new Error(`Escavador ${result.status}`);
      if (result.data) processos = [normalizarProcesso(result.data)];

    } else if (tipo === 'cpf') {
      const digits = onlyDigits(valor);
      const result = await callEscavador(`/api/v2/envolvido/processos?cpf_cnpj=${digits}&limit=50`);
      if (!result.ok) throw new Error(`Escavador ${result.status}`);
      processos = (result.data?.items ?? []).map(normalizarProcesso);

    } else if (tipo === 'oab') {
      const r1 = await callEscavador(`/api/v2/advogado/processos?oab_numero=${encodeURIComponent(valor)}&oab_estado=${encodeURIComponent(uf || 'SP')}&limit=50`);
      if (r1.ok) processos = (r1.data?.items ?? []).map(normalizarProcesso);

    } else {
      const result = await callEscavador(`/api/v2/envolvido/processos?nome=${encodeURIComponent(valor)}&limit=50`);
      if (!result.ok) throw new Error(`Escavador ${result.status}`);
      processos = (result.data?.items ?? []).map(normalizarProcesso);
    }

    return res.status(200).json({ processos, total: processos.length });

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Erro interno' });
  }
}

function normalizarProcesso(p) {
  const partes = p.partes || p.envolvidos || p.fontes?.flatMap(f => f.partes || []) || [];
  const autor = partes.find(x =>
    (x.tipo_parte || x.polo || x.tipo_participacao || '').toLowerCase().includes('ativo') ||
    (x.tipo_parte || x.polo || x.tipo_participacao || '').toLowerCase().includes('autor') ||
    (x.tipo_parte || x.polo || x.tipo_participacao || '').toLowerCase().includes('requerente')
  ) || partes[0] || {};
  const reu = partes.find(x =>
    (x.tipo_parte || x.polo || x.tipo_participacao || '').toLowerCase().includes('passivo') ||
    (x.tipo_parte || x.polo || x.tipo_participacao || '').toLowerCase().includes('réu') ||
    (x.tipo_parte || x.polo || x.tipo_participacao || '').toLowerCase().includes('requerido')
  ) || partes[1] || {};
  const advogados = partes
    .filter(x => (x.tipo_participacao || x.tipo_parte || '').toLowerCase().includes('advogado'))
    .map(x => `${x.nome}${x.oab_numero ? ' — OAB/' + (x.oab_estado || '') + ' ' + x.oab_numero : ''}`)
    .join(', ') || '—';
  const movs = p.movimentacoes || p.ultimas_movimentacoes ||
    (p.fontes || []).flatMap(f => f.movimentacoes || []);
  const ultimaMov = movs[0];
  return {
    numero: p.numero_unico || p.numero_cnj || p.numero || '—',
    tipo: p.classe || p.tipo || p.assunto || '—',
    tribunal: p.tribunal?.sigla || p.tribunal_sigla || p.fontes?.[0]?.tribunal || p.tribunal || '—',
    vara: p.vara || p.orgao || p.fontes?.[0]?.descricao || '—',
    fase: p.fase_atual || p.fase || p.situacao || '—',
    status: p.situacao || p.status || 'Em andamento',
    ultima_movimentacao: ultimaMov
      ? `${ultimaMov.data || ''} — ${ultimaMov.tipo || ultimaMov.descricao || ultimaMov.titulo || ''}`
      : p.data_ultima_movimentacao ? `Última atualização: ${p.data_ultima_movimentacao}` : '—',
    data_ajuizamento: p.data_inicio || p.data_ajuizamento || '—',
    partes: { polo_ativo: autor.nome || '—', polo_passivo: reu.nome || '—' },
    advogado: advogados,
    valor_causa: p.valor_causa
      ? 'R$ ' + parseFloat(p.valor_causa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '—',
    proximo_prazo: null,
  };
}
