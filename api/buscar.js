// Vercel Serverless Function — /api/buscar.js
// Integração real com Escavador API — busca todas as páginas

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

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  try {
    let todosProcessos = [];
    let pagina = 1;
    let totalPaginas = 1;

    do {
      let url = '';
      if (tipo === 'oab') {
        url = `https://api.escavador.com/api/v2/advogado/processos?oab_numero=${encodeURIComponent(valor)}&oab_estado=${encodeURIComponent(uf || 'SP')}&page=${pagina}&limit=50`;
      } else if (tipo === 'advogado') {
        url = `https://api.escavador.com/api/v2/advogado/processos?nome=${encodeURIComponent(valor)}&page=${pagina}&limit=50`;
      } else if (tipo === 'numero') {
        url = `https://api.escavador.com/api/v2/processos/numero_unico/${encodeURIComponent(valor)}`;
      } else if (tipo === 'parte') {
        url = `https://api.escavador.com/api/v2/processos/envolvido?nome=${encodeURIComponent(valor)}&page=${pagina}&limit=50`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Escavador: ${response.status} — ${errText}` });
      }

      const data = await response.json();

      if (tipo === 'numero') {
        if (data && data.numero_unico) todosProcessos = [normalizarProcesso(data)];
        break;
      }

      const items = data.items || data.processos || data.data || [];
      todosProcessos = [...todosProcessos, ...items.map(normalizarProcesso)];

      const total = data.total || data.meta?.total || items.length;
      const porPagina = data.per_page || data.meta?.per_page || 50;
      totalPaginas = Math.ceil(total / porPagina);

      if (pagina >= Math.min(totalPaginas, 5)) break;
      pagina++;

    } while (pagina <= totalPaginas);

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
    partes: { polo_ativo: autor.nome || '—', polo_passivo: reu.nome || '—' },
    advogado: advogados,
    valor_causa: p.valor_causa
      ? 'R$ ' + parseFloat(p.valor_causa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '—',
    proximo_prazo: null,
  };
}
