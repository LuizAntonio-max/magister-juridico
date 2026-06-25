// Vercel Serverless Function — /api/buscar.js
// Integração real com Escavador API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { tipo, valor, uf, cpf } = req.body;
  if (!valor) return res.status(400).json({ error: 'Parâmetro obrigatório: valor' });

  const token = process.env.ESCAVADOR_TOKEN;
  if (!token) return res.status(500).json({ error: 'Token do Escavador não configurado' });

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  try {
    let todosProcessos = [];

    if (tipo === 'numero') {
      const url = `https://api.escavador.com/api/v2/processos/numero_unico/${encodeURIComponent(valor)}`;
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Escavador: ${response.status}`);
      const data = await response.json();
      if (data && data.numero_unico) todosProcessos = [normalizarProcesso(data)];

    } else if (tipo === 'oab') {
      // Busca por OAB — todas as páginas
      for (let p = 1; p <= 10; p++) {
        const url = `https://api.escavador.com/api/v2/advogado/processos?oab_numero=${encodeURIComponent(valor)}&oab_estado=${encodeURIComponent(uf || 'SP')}&page=${p}&limit=100`;
        const response = await fetch(url, { headers });
        if (!response.ok) break;
        const data = await response.json();
        const items = data.items || data.processos || data.data || [];
        if (!items.length) break;
        todosProcessos = [...todosProcessos, ...items.map(normalizarProcesso)];
        const total = data.total || 0;
        const porPagina = data.per_page || 100;
        if (p >= Math.ceil(total / porPagina)) break;
      }

      // Busca adicional por CPF se fornecido
      if (cpf) {
        const [r1, r2] = await Promise.all([
          fetch(`https://api.escavador.com/api/v2/advogado/processos?cpf=${encodeURIComponent(cpf)}&page=1&limit=100`, { headers }),
          fetch(`https://api.escavador.com/api/v2/processos/envolvido?cpf=${encodeURIComponent(cpf)}&page=1&limit=100`, { headers }),
        ]);
        const [d1, d2] = await Promise.all([r1.ok ? r1.json() : {}, r2.ok ? r2.json() : {}]);
        const numerosExistentes = new Set(todosProcessos.map(p => p.numero));
        const i1 = (d1.items || d1.processos || d1.data || []).map(normalizarProcesso).filter(p => !numerosExistentes.has(p.numero));
        const numerosApos1 = new Set([...todosProcessos, ...i1].map(p => p.numero));
        const i2 = (d2.items || d2.processos || d2.data || []).map(normalizarProcesso).filter(p => !numerosApos1.has(p.numero));
        todosProcessos = [...todosProcessos, ...i1, ...i2];
      }

    } else if (tipo === 'cpf') {
      const [r1, r2] = await Promise.all([
        fetch(`https://api.escavador.com/api/v2/advogado/processos?cpf=${encodeURIComponent(valor)}&page=1&limit=100`, { headers }),
        fetch(`https://api.escavador.com/api/v2/processos/envolvido?cpf=${encodeURIComponent(valor)}&page=1&limit=100`, { headers }),
      ]);
      const [d1, d2] = await Promise.all([r1.ok ? r1.json() : {}, r2.ok ? r2.json() : {}]);
      const i1 = (d1.items || d1.processos || d1.data || []).map(normalizarProcesso);
      const numeros = new Set(i1.map(p => p.numero));
      const i2 = (d2.items || d2.processos || d2.data || []).map(normalizarProcesso).filter(p => !numeros.has(p.numero));
      todosProcessos = [...i1, ...i2];

    } else if (tipo === 'advogado') {
      const url = `https://api.escavador.com/api/v2/advogado/processos?nome=${encodeURIComponent(valor)}&page=1&limit=100`;
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Escavador: ${response.status}`);
      const data = await response.json();
      todosProcessos = (data.items || data.processos || data.data || []).map(normalizarProcesso);

    } else if (tipo === 'parte') {
      const url = `https://api.escavador.com/api/v2/processos/envolvido?nome=${encodeURIComponent(valor)}&page=1&limit=100`;
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Escavador: ${response.status}`);
      const data = await response.json();
      todosProcessos = (data.items || data.processos || data.data || []).map(normalizarProcesso);
    }

    return res.status(200).json({ processos: todosProcessos, total: todosProcessos.length });

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Erro interno' });
  }
}

function normalizarProcesso(p) {
  const partes = p.partes || p.envolvidos || [];
  const autor = partes.find(x =>
    (x.tipo_parte || x.polo || '').toLowerCase().includes('ativo') ||
    (x.tipo_parte || x.polo || '').toLowerCase().includes('autor') ||
    (x.tipo_parte || x.polo || '').toLowerCase().includes('requerente')
  ) || partes[0] || {};
  const reu = partes.find(x =>
    (x.tipo_parte || x.polo || '').toLowerCase().includes('passivo') ||
    (x.tipo_parte || x.polo || '').toLowerCase().includes('réu') ||
    (x.tipo_parte || x.polo || '').toLowerCase().includes('requerido')
  ) || partes[1] || {};

  const advogados = partes
    .filter(x => (x.tipo_participacao || '').toLowerCase().includes('advogado'))
    .map(x => `${x.nome} — OAB/${x.oab_estado || ''} ${x.oab_numero || ''}`)
    .join(', ') || p.advogados?.map(a => `${a.nome} — OAB/${a.oab_estado || ''} ${a.oab_numero || ''}`).join(', ') || '—';

  const ultimaMov = (p.movimentacoes || p.ultimas_movimentacoes || [])[0];

  return {
    numero: p.numero_unico || p.numero || '—',
    tipo: p.classe || p.tipo || p.assunto || '—',
    tribunal: p.tribunal?.sigla || p.tribunal || p.orgao_julgador || '—',
    vara: p.vara || p.orgao || p.tribunal?.nome || '—',
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
