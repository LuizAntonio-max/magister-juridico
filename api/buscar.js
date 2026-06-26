export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { tipo, valor, uf } = req.body;
  if (!valor) return res.status(400).json({ error: 'Parâmetro obrigatório' });

  const token = process.env.ESCAVADOR_TOKEN;
  if (!token) return res.status(500).json({ error: 'Token não configurado' });

  const BASE = 'https://api.escavador.com';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const digits = (s) => (s ?? '').replace(/\D/g, '');

  // Paginação por CURSOR (como o Lovable faz para movimentações)
  async function fetchWithCursor(baseUrl) {
    let todos = [];
    let cursor = null;
    for (let i = 0; i < 50; i++) { // até 50 páginas = 2500 processos
      const url = cursor
        ? `${BASE}${baseUrl}&cursor=${encodeURIComponent(cursor)}`
        : `${BASE}${baseUrl}`;
      const r = await fetch(url, { headers });
      if (!r.ok) break;
      const data = await r.json();
      const items = data?.items ?? data?.processos ?? data?.data ?? [];
      if (!items.length) break;
      todos = [...todos, ...items];
      // Tenta pegar cursor da próxima página
      const next = data?.links?.next ?? data?.paginator?.next_cursor ?? data?.meta?.next_cursor ?? null;
      if (!next) break;
      try {
        const u = new URL(next);
        cursor = u.searchParams.get('cursor');
        if (!cursor) break;
      } catch {
        cursor = String(next);
      }
    }
    return todos;
  }

  // Paginação por PÁGINA numérica
  async function fetchWithPage(baseUrl) {
    let todos = [];
    let page = 1;
    for (let i = 0; i < 50; i++) {
      const sep = baseUrl.includes('?') ? '&' : '?';
      const r = await fetch(`${BASE}${baseUrl}${sep}page=${page}&limit=50`, { headers });
      if (!r.ok) break;
      const data = await r.json();
      const items = data?.items ?? data?.processos ?? data?.data ?? [];
      if (!items.length) break;
      todos = [...todos, ...items];
      const total = data?.paginator?.total ?? data?.total ?? 0;
      const perPage = data?.paginator?.per_page ?? 50;
      if (page >= Math.ceil(total / perPage)) break;
      page++;
    }
    return todos;
  }

  try {
    let processos = [];

    if (tipo === 'numero') {
      const cnj = digits(valor);
      const r = await fetch(`${BASE}/api/v2/processos/numero_cnj/${cnj}`, { headers });
      const data = await r.json();
      if (r.ok && data) processos = [normalizarProcesso(data)];

    } else if (tipo === 'oab') {
      // Tenta 3 endpoints diferentes para maximizar resultados
      const [i1, i2, i3] = await Promise.all([
        // Endpoint 1: advogado por OAB com paginação numérica
        fetchWithPage(`/api/v2/advogado/processos?oab_numero=${encodeURIComponent(valor)}&oab_estado=${encodeURIComponent(uf||'SP')}`),
        // Endpoint 2: advogado por OAB com cursor
        fetchWithCursor(`/api/v2/advogado/processos?oab_numero=${encodeURIComponent(valor)}&oab_estado=${encodeURIComponent(uf||'SP')}&limit=50`),
        // Endpoint 3: envolvido por CPF (se valor for CPF)
        digits(valor).length === 11
          ? fetchWithPage(`/api/v2/envolvido/processos?cpf_cnpj=${digits(valor)}`)
          : Promise.resolve([]),
      ]);
      // Une todos sem duplicatas
      const map = new Map();
      [...i1, ...i2, ...i3].forEach(p => {
        const num = p.numero_unico || p.numero_cnj || p.numero || Math.random();
        if (!map.has(num)) map.set(num, p);
      });
      processos = [...map.values()].map(normalizarProcesso);

    } else if (tipo === 'cpf') {
      const cpf = digits(valor);
      const [i1, i2] = await Promise.all([
        fetchWithPage(`/api/v2/envolvido/processos?cpf_cnpj=${cpf}`),
        fetchWithCursor(`/api/v2/envolvido/processos?cpf_cnpj=${cpf}&limit=50`),
      ]);
      const map = new Map();
      [...i1, ...i2].forEach(p => {
        const num = p.numero_unico || p.numero_cnj || p.numero || Math.random();
        if (!map.has(num)) map.set(num, p);
      });
      processos = [...map.values()].map(normalizarProcesso);

    } else {
      // advogado ou parte — busca por nome
      const [i1, i2] = await Promise.all([
        fetchWithPage(`/api/v2/envolvido/processos?nome=${encodeURIComponent(valor)}`),
        fetchWithCursor(`/api/v2/envolvido/processos?nome=${encodeURIComponent(valor)}&limit=50`),
      ]);
      const map = new Map();
      [...i1, ...i2].forEach(p => {
        const num = p.numero_unico || p.numero_cnj || p.numero || Math.random();
        if (!map.has(num)) map.set(num, p);
      });
      processos = [...map.values()].map(normalizarProcesso);
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
    ultima_movimentacao: m?`${m.data||''} — ${m.tipo||m.descricao||m.titulo||''}`:p.data_ultima_movimentacao?`Última: ${p.data_ultima_movimentacao}`:'—',
    data_ajuizamento: p.data_inicio||p.data_ajuizamento||'—',
    partes:{polo_ativo:autor.nome||'—',polo_passivo:reu.nome||'—'},
    advogado:advs,
    valor_causa:p.valor_causa?'R$ '+parseFloat(p.valor_causa).toLocaleString('pt-BR',{minimumFractionDigits:2}):'—',
    proximo_prazo:null,
  };
}
