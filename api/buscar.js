// Vercel Serverless Function — /api/buscar.js
// Integração com Escavador API — mesmo endpoint do Lovable

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

  try {
    let path = '';
    let todosProcessos = [];

    if (tipo === 'numero') {
      const cnj = valor.replace(/\D/g, '');
      path = `/api/v2/processos/numero_cnj/${cnj}`;
      const response = await fetch(`${BASE}${path}`, { headers });
      if (!response.ok) throw new Error(`Escavador: ${response.status}`);
      const data = await response.json();
      if (data) todosProcessos = [normalizarProcesso(data)];

    } else if (tipo === 'cpf' || tipo === 'oab') {
      const digits = valor.replace(/\D/g, '');
      path = `/api/v2/envolvido/processos?cpf_cnpj=${digits}&limit=50`;
      const response = await fetch(`${BASE}${path}`, { headers });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Escavador ${response.status}: ${err}`);
      }
      const data = await response.json();
      const items = data.items || data.processos || data.data || [];
      todosProcessos = items.map(normalizarProcesso);

    } else if (tipo === 'advogado' || tipo === 'parte') {
      path = `/api/v2/envolvido/processos?nome=${encodeURIComponent(valor)}&limit=50`;
      const response = await fetch(`${BASE}${path}`, { headers });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Escavador ${response.status}: ${err}`);
      }
      const data = await response.json();
      const items = data.items || data.processos || data.data || [];
      todosProcessos = items.map(normalizarProcesso);
    }

    return res.status(200).json({ processos: todosProcessos, total: todosProcessos.length });

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Erro interno' });
  }
}

function normalizarProcesso(p) {
  const partes = p.partes || p.envolvidos || [];
  const autor = partes.find(x =>
    (x.tipo_parte || x.polo || x.tipo || '').toLowerCase().includes('ativo') ||
    (x.tipo_parte || x.polo || x.tipo || '').toLowerCase().includes('autor') ||
    (x.tipo_parte || x.polo || x.tipo || '').toLowerCase().includes('requerente')
  ) || partes[0] || {};
  const reu = partes.find(x =>
    (x.tipo_parte || x.polo || x.tipo || '').toLowerCase().includes('passivo') ||
    (x.tipo_parte || x.polo || x.tipo || '').toLowerCase().includes('réu') ||
    (x.tipo_parte || x.polo || x.tipo || '').toLowerCase().includes('requerido')
  ) || partes[1] || {};

  const advogados = partes
    .filter(x => (x.tipo_participacao || x.tipo || '').toLowerCase().includes('advogado'))
    .map(x => `${x.nome} — OAB/${x.oab_estado || ''} ${x.oab_numero || ''}`)
    .join(', ') || '—';

  const ultimaMov = (p.movimentacoes || p.ultimas_movimentacoes || [])[0];

  return {
    numero: p.numero_unico || p.numero_cnj || p.numero || '—',
    tipo: p.classe || p.tipo || p.assunto || '—',
    tribunal: p.tribunal?.sigla || p.tribunal_sigla || p.tribunal || '—',
    vara: p.vara || p.orgao || p.tribunal_nome || '—',
    fase: p.fase_atual || p.fase || p.situacao || '—',
    status: p.situacao || p.status || 'Em andamento',
    ultima_movimentacao: ultimaMov
      ? `${ultimaMov.data || ''} — ${ultimaMov.tipo || ultimaMov.descricao || ''}`
      : p.ultima_movimentacao || '—',
    data_ajuizamento: p.data_inicio || p.data_ajuizamento || '—',
    partes: {
      polo_ativo: autor.nome || '—',
      polo_passivo: reu.nome || '—',
    },
    advogado: advogados,
    valor_causa: p.valor_causa
      ? 'R$ ' + parseFloat(p.valor_causa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '—',
    proximo_prazo: null,
  };
}
