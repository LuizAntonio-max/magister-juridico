export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { tipo, valor, uf } = req.body;
  if (!valor) return res.status(400).json({ error: 'Parâmetro obrigatório: valor' });

  const token = process.env.ESCAVADOR_TOKEN;
  if (!token) return res.status(500).json({ error: 'Token não configurado' });

  const BASE = 'https://api.escavador.com';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const onlyDigits = (s) => (s ?? '').replace(/\D/g, '');

  async function fetchAllPages(baseUrl) {
    let todos = [];
    let page = 1;
    let totalPages = 1;
    do {
      const sep = baseUrl.includes('?') ? '&' : '?';
      const url = `${BASE}${baseUrl}${sep}page=${page}&limit=50`;
      const r = await fetch(url, { headers });
      if (!r.ok) break;
      const data = await r.json();
      const items = data?.items ?? data?.processos ?? data?.data ?? [];
      if (!items.length) break;
      todos = [...todos, ...items];
      const total = data?.paginator?.total ?? data?.total ?? items.length;
      const perPage = data?.paginator?.per_page ?? data?.per_page ?? 50;
      totalPages = Math.ceil(total / perPage);
      if (page >= Math.min(totalPages, 20)) break;
      page++;
    } while (page <= totalPages);
    return todos;
  }

  try {
    let processos = [];

    if (tipo === 'numero') {
      const cnj = onlyDigits(valor);
      const r = await fetch(`${BASE}/api/v2/processos/numero_cnj/${cnj}`, { headers });
      if (!r.ok) throw new Error(`Escavador ${r.status}`);
      const data = await r.json();
      if (data) processos = [normalizarProcesso(data)];

    } else if (tipo === 'cpf') {
      const digits = onlyDigits(valor);
      const items = await fetchAllPages(`/api/v2/envolvido/processos?cpf_cnpj=${digits}`);
      processos = items.map(normalizarProcesso);

    } else if (tipo === 'oab') {
      const items = await fetchAllPages(`/api/v2/advogado/processos?oab_numero=${encodeURIComponent(valor)}&oab_estado=${encodeURIComponent(uf||'SP')}`);
      processos = items.map(normalizarProcesso);

    } else {
      const items = await fetchAllPages(`/api/v2/envolvido/processos?nome=${encodeURIComponent(valor)}`);
      processos = items.map(normalizarProcesso);
    }

    return res.status(200).json({ processos, total: processos.length });

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Erro interno' });
  }
}

function normalizarProcesso(p) {
  const partes = p.partes || p.envolvidos || p.fontes?.flatMap(f => f.partes || []) || [];
  const autor = partes.find(x => (x.tipo_parte||x.polo||x.tipo_participacao||'').toLowerCase().match(/ativo|autor|requerente/)) || partes[0] || {};
  const reu = partes.find(x => (x.tipo_parte||x.polo||x.tipo_participacao||'').toLowerCase().match(/passivo|réu|requerido/)) || partes[1] || {};
  const advs = partes.filter(x => (x.tipo_participacao||x.tipo_parte||'').toLowerCase().includes('advogado')).map(x => `${x.nome}${x.oab_numero?' — OAB/'+(x.oab_estado||'')+' '+x.oab_numero:''}`).join(', ') || '—';
  const movs = p.movimentacoes || p.ultimas_movimentacoes || (p.fontes||[]).flatMap(f=>f.movimentacoes||[]);
  const m = movs[0];
  return {
    numero: p.numero_unico||p.numero_cnj||p.numero||'—',
    tipo: p.classe||p.tipo||p.assunto||'—',
    tribunal: p.tribunal?.sigla||p.tribunal_sigla||p.fontes?.[0]?.tribunal||p.tribunal||'—',
    vara: p.vara||p.orgao||p.fontes?.[0]?.descricao||'—',
    fase: p.fase_atual||p.fase||p.situacao||'—',
    status: p.situacao||p.status||'Em andamento',
    ultima_movimentacao: m ? `${m.data||''} — ${m.tipo||m.descricao||m.titulo||''}` : '—',
    data_ajuizamento: p.data_inicio||p.data_ajuizamento||'—',
    partes: { polo_ativo: autor.nome||'—', polo_passivo: reu.nome||'—' },
    advogado: advs,
    valor_causa: p.valor_causa ? 'R$ '+parseFloat(p.valor_causa).toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—',
    proximo_prazo: null,
  };
}
