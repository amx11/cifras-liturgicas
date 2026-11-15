// Acervo (arquidiocese + músicas próprias) e dados salvos no aparelho
import { normalizar, detectarTom, transporTom, semitonsEntre } from './cifra.js';

const CHAVES = { prefs: 'cl.prefs', minhas: 'cl.minhas', edicoes: 'cl.edicoes', tons: 'cl.tons', missas: 'cl.missas' };

function ler(chave, padrao) {
  try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
}
function gravar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch { return false; }
}

export const PREFS_PADRAO = {
  fonte: 17, tema: 'auto', mostrarAcordes: true, mono: false,
  servidor: location.protocol === 'file:' ? 'http://localhost:8765' : (location.port === '8765' ? location.origin : 'http://localhost:8765'),
};

export const estado = {
  taxonomia: { tempos: {}, partes: {}, categorias: {}, anos: {} },
  fonte: null,
  atualizado: null,
  musicas: [],
  porChave: new Map(),
  prefs: { ...PREFS_PADRAO, ...ler(CHAVES.prefs, {}) },
  minhas: ler(CHAVES.minhas, []),
  edicoes: ler(CHAVES.edicoes, {}),
  tons: ler(CHAVES.tons, {}),
  missas: ler(CHAVES.missas, []),
};

export function salvarPrefs() { gravar(CHAVES.prefs, estado.prefs); }
export function salvarTons() { gravar(CHAVES.tons, estado.tons); }
export function salvarMissas() { return gravar(CHAVES.missas, estado.missas); }

export async function carregarAcervo() {
  let dados = { musicas: [] };
  try {
    const r = await fetch('data/musicas.json', { cache: 'no-cache' });
    if (r.ok) dados = await r.json();
  } catch { /* sem acervo: segue só com as músicas próprias */ }
  estado.taxonomia = { tempos: dados.tempos || {}, partes: dados.partes || {}, categorias: dados.categorias || {}, anos: dados.anos || {} };
  estado.fonte = dados.fonte;
  estado.atualizado = dados.atualizado;
  // Correções revisadas (gravadas pelo servidor local em data/correcoes.json) valem para todos os aparelhos
  let correcoes = {};
  try { const r = await fetch('data/correcoes.json', { cache: 'no-cache' }); if (r.ok) correcoes = await r.json(); } catch { /* opcional */ }
  estado.correcoes = correcoes;
  estado.base = dados.musicas.map(m => {
    const c = correcoes[m.id];
    const base = { ...m, chave: 'a' + m.id, origem: 'arquipoa' };
    if (c) Object.assign(base, { chordpro: c.chordpro, cabecalho: c.cabecalho ?? m.cabecalho, temCifra: c.chordpro.includes('['), tom: detectarTom(c.chordpro),
      ocr: m.ocr ? { ...m.ocr, revisar: false, revisada: c.data } : m.ocr,
        daPartitura: m.daPartitura ? { ...m.daPartitura, revisar: false, revisada: c.data } : m.daPartitura, corrigida: c.data });
    return base;
  });
  // Pasta de Cantos (versões simplificadas): agrupadas pelo título com as versões do acervo
  try {
    const r = await fetch('data/pasta.json', { cache: 'no-cache' });
    if (r.ok) for (const m of (await r.json()).musicas) estado.base.push({ ...m, chave: 'p' + m.id, origem: 'pasta' });
  } catch { /* opcional */ }
  migrarTons();
  montarIndice();
}

// Quando o tom de referência de uma música muda no acervo (m.tomAntes -> m.tom), as escolhas salvas
// (tom da música e tom de cada canto nas missas) são convertidas para continuar soando igual.
function migrarTons() {
  const feitos = estado.prefs.tonsMigrados || {};
  let mudou = false;
  for (const m of estado.base) {
    if (!m.tomAntes || feitos[m.id] === m.tom) continue;
    const conv = t => (t ? transporTom(m.tom, semitonsEntre(m.tomAntes, t)) : t);
    if (estado.tons[m.chave]) { estado.tons[m.chave] = conv(estado.tons[m.chave]); if (estado.tons[m.chave] === m.tom) delete estado.tons[m.chave]; }
    for (const x of estado.missas) for (const it of x.itens || []) if (it.chave === m.chave && it.tom) it.tom = conv(it.tom);
    feitos[m.id] = m.tom; mudou = true;
  }
  if (mudou) { estado.prefs.tonsMigrados = feitos; salvarPrefs(); salvarTons(); salvarMissas(); }
}

// Grava a correção de uma música do acervo: no projeto (servidor local) e, se não houver servidor, só neste aparelho
export async function salvarCorrecao(chave, campos) {
  const m = musica(chave);
  if (!m || m.origem !== 'arquipoa') return { ok: false };
  const id = +chave.slice(1);
  try {
    const r = await fetch('/api/correcao', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, chordpro: campos.chordpro, cabecalho: campos.cabecalho }) });
    if (r.ok) { delete estado.edicoes[chave]; gravar(CHAVES.edicoes, estado.edicoes); await carregarAcervo(); return { ok: true, onde: 'projeto' }; }
  } catch { /* sem servidor: grava local */ }
  const agora = new Date().toISOString();
  const ok = editarMusica(chave, { chordpro: campos.chordpro, ocr: m.ocr ? { ...m.ocr, revisar: false, revisada: agora } : m.ocr,
    daPartitura: m.daPartitura ? { ...m.daPartitura, revisar: false, revisada: agora } : m.daPartitura });
  return { ok, onde: 'aparelho' };
}

function montarIndice() {
  const todas = [...estado.base, ...estado.minhas.map(m => ({ ...m, origem: 'minha' }))];
  for (const m of todas) {
    const ed = estado.edicoes[m.chave];
    if (ed) Object.assign(m, ed, { editada: true });
    if (m.chordpro && !m.tom) m.tom = detectarTom(m.chordpro);
    m.buscaTitulo = normalizar(`${m.numero ?? ''} ${m.nome} ${m.complemento || ''}`);
    m.buscaLetra = normalizar(m.chordpro || '');
  }
  todas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    || (a.origem === 'minha') - (b.origem === 'minha') || (parseInt(a.numero) || 1e9) - (parseInt(b.numero) || 1e9)
    || (a.criada || '').localeCompare(b.criada || ''));
  // Versões: mesma letra/título com melodias diferentes ficam no mesmo grupo;
  // uma versão personalizada fica sempre junto da música em que foi baseada
  estado.grupos = new Map();
  // Mesmo título e mesmo número com complementos diferentes = peças distintas de uma série (ex.: Antífonas do Ó)
  const serie = new Map();
  for (const m of todas) if (m.numero != null && !m.base) { const k = chaveGrupo(m.nome) + '#' + m.numero; serie.set(k, (serie.get(k) || 0) + 1); }
  const chaveDe = m => {
    let k = chaveGrupo(m.nome);
    if (TITULOS_GENERICOS.test(k) || (m.numero != null && serie.get(k + '#' + m.numero) > 1)) k += '|' + normalizar(m.complemento || '');
    return k;
  };
  const grupoDe = new Map(todas.filter(m => !m.base).map(m => [m.chave, chaveDe(m)]));
  // Canto da Pasta de Cantos (sem número): entra no grupo do acervo de mesmo título; se o acervo separou o título
  // em vários grupos (série com complementos), no maior deles
  {
    const tamanho = new Map();
    for (const m of todas) if (m.origem === 'arquipoa') { const k = grupoDe.get(m.chave); tamanho.set(k, (tamanho.get(k) || 0) + 1); }
    for (const m of todas) {
      if (m.origem !== 'pasta') continue;
      const k = chaveGrupo(m.nome);
      const cands = [...tamanho.keys()].filter(g => g === k || g.startsWith(k + '|'));
      if (cands.length) grupoDe.set(m.chave, cands.sort((a, b) => tamanho.get(b) - tamanho.get(a))[0]);
    }
  }
  for (const m of todas) {
    m.grupo = (m.base && grupoDe.get(m.base)) || grupoDe.get(m.chave) || chaveDe(m);
    if (!estado.grupos.has(m.grupo)) estado.grupos.set(m.grupo, []);
    estado.grupos.get(m.grupo).push(m);
  }
  for (const vs of estado.grupos.values()) vs.forEach((m, i) => { m.versao = i + 1; m.totalVersoes = vs.length; });
  estado.musicas = todas;
  estado.porChave = new Map(todas.map(m => [m.chave, m]));
}

// Títulos que sozinhos não identificam a música (o complemento diz qual é)
const TITULOS_GENERICOS = /^(salmo|cantico|canto|hino|antifona|aclamacao|refrao)$/;

// Chave do grupo de versões: o título sem observações entre parênteses/colchetes, sem acentos e sem "versão N"
export function chaveGrupo(nome) {
  const base = String(nome || '').replace(/\s*[([].*$/, '').trim() || nome;
  return normalizar(base).replace(/\b(versao|melodia|vers|mel)\s*\d+\b/g, '').replace(/\s+(i{1,3}|iv|\d)$/, '').trim();
}

export function versoes(m) { return estado.grupos?.get(m.grupo) || [m]; }

// Rótulo curto que diferencia as versões: complemento, autor ou primeira linha de acordes
export function rotuloVersao(m) {
  const acordes = (m.chordpro || '').match(/\[([^\]]+)\]/g)?.slice(0, 4).map(a => a.slice(1, -1)).join(' ');
  const desc = m.complemento || m.cabecalho?.find(l => /letra|m[úu]sica|autor|melodia/i.test(l)) || '';
  if (m.personalizada) {
    const dia = m.criada ? new Date(m.criada).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
    return { titulo: `Personalizada${dia ? ' · ' + dia : ''}`, desc: desc === 'Versão personalizada' ? '' : desc, acordes: acordes || '' };
  }
  return { titulo: `${m.origem === 'minha' ? 'Minha versão' : 'Versão ' + m.versao}${m.numero ? ' · nº ' + m.numero : ''}`, desc, acordes: acordes || '' };
}

export function musica(chave) { return estado.porChave.get(chave); }

export function salvarMinha(m) {
  const chave = m.chave || 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const registro = {
    chave, nome: m.nome || 'Sem título', complemento: m.complemento || '', numero: null,
    tempos: m.tempos || [], partes: m.partes || [], anos: m.anos || [], categorias: [],
    cabecalho: m.cabecalho || [], chordpro: m.chordpro || '', temCifra: (m.chordpro || '').includes('['),
    tom: detectarTom(m.chordpro || ''), youtube: m.youtube || null, criada: m.criada || new Date().toISOString(),
    base: m.base || null, personalizada: !!m.personalizada, audio: m.audio || null,
    audios: m.audios || null, audioQuebrado: !!m.audioQuebrado, youtubeInicio: m.youtubeInicio || null,
    ocr: m.ocr || null,
  };
  const i = estado.minhas.findIndex(x => x.chave === chave);
  if (i >= 0) estado.minhas[i] = registro; else estado.minhas.push(registro);
  const ok = gravar(CHAVES.minhas, estado.minhas);
  montarIndice();
  return ok ? chave : null;
}

// Salva uma cópia personalizada (cifra e/ou letra alteradas) sem tocar no original; devolve a chave nova
export function criarPersonalizada(baseChave, campos) {
  const base = musica(baseChave);
  return salvarMinha({
    ...campos, base: base?.base || baseChave, personalizada: true,
    nome: campos.nome || base?.nome, tempos: campos.tempos ?? base?.tempos, partes: campos.partes ?? base?.partes,
    anos: campos.anos ?? base?.anos, cabecalho: campos.cabecalho ?? base?.cabecalho,
  });
}

export function editarMusica(chave, campos) {
  const m = musica(chave);
  if (!m) return false;
  if (m.origem === 'minha') return !!salvarMinha({ ...m, ...campos });
  const tom = detectarTom(campos.chordpro ?? m.chordpro ?? '');
  estado.edicoes[chave] = { ...(estado.edicoes[chave] || {}), ...campos, tom, temCifra: (campos.chordpro ?? m.chordpro ?? '').includes('[') };
  const ok = gravar(CHAVES.edicoes, estado.edicoes);
  // recarrega o original para descartar campos antigos
  const original = estado.base.find(x => x.chave === chave);
  if (original) delete original.tom;
  montarIndice();
  return ok;
}

export function desfazerEdicao(chave) {
  delete estado.edicoes[chave];
  gravar(CHAVES.edicoes, estado.edicoes);
  return carregarAcervo();
}

export function excluirMinha(chave) {
  estado.minhas = estado.minhas.filter(m => m.chave !== chave);
  gravar(CHAVES.minhas, estado.minhas);
  montarIndice();
}

// Busca: todas as palavras precisam aparecer no título ou na letra; título vem primeiro
export function buscar({ termo = '', tempo = null, parte = null, ano = null, origem = null, agrupar = false } = {}) {
  const palavras = normalizar(termo).split(' ').filter(Boolean);
  const res = [];
  for (const m of estado.musicas) {
    if (tempo !== null && !m.tempos?.includes(tempo)) continue;
    if (parte !== null && !m.partes?.includes(parte)) continue;
    if (ano !== null && !m.anos?.includes(ano)) continue;
    if (origem && m.origem !== origem) continue;
    if (palavras.length) {
      const noTitulo = palavras.every(p => m.buscaTitulo.includes(p));
      if (!noTitulo && !palavras.every(p => m.buscaLetra.includes(p))) continue;
      res.push({ m, peso: noTitulo ? 0 : 1 });
    } else res.push({ m, peso: 0 });
  }
  const lista = res.sort((a, b) => a.peso - b.peso).map(r => r.m);
  if (!agrupar) return lista;
  // Uma linha por grupo de versões (a primeira versão que passou no filtro)
  const vistos = new Set();
  return lista.filter(m => !vistos.has(m.grupo) && vistos.add(m.grupo));
}

// Encontra músicas do acervo cuja letra combina com um trecho transcrito
export function reconhecerPorLetra(texto, limite = 3) {
  const palavras = normalizar(texto).split(' ').filter(p => p.length > 1);
  if (palavras.length < 3) return [];
  const trios = new Set();
  for (let i = 0; i + 2 < palavras.length; i++) trios.add(palavras.slice(i, i + 3).join(' '));
  const unicas = new Set(palavras);
  const res = [];
  for (const m of estado.musicas) {
    if (!m.buscaLetra) continue;
    let pt = 0;
    for (const t of trios) if (m.buscaLetra.includes(t)) pt += 3;
    const ps = new Set(m.buscaLetra.split(' '));
    for (const p of unicas) if (p.length > 3 && ps.has(p)) pt += 0.3;
    if (pt > 2) res.push({ m, pt });
  }
  return res.sort((a, b) => b.pt - a.pt).slice(0, limite);
}

export function exportarBackup() {
  return { app: 'cifras-liturgicas', versao: 1, data: new Date().toISOString(),
    minhas: estado.minhas, edicoes: estado.edicoes, tons: estado.tons, missas: estado.missas, prefs: estado.prefs };
}

export function importarBackup(obj) {
  if (obj?.app !== 'cifras-liturgicas') throw new Error('Arquivo não é um backup do Cifras Litúrgicas');
  const unir = (atual, novos, chave) => {
    const mapa = new Map(atual.map(x => [x[chave], x]));
    for (const n of novos || []) mapa.set(n[chave], n);
    return [...mapa.values()];
  };
  estado.minhas = unir(estado.minhas, obj.minhas, 'chave');
  estado.missas = unir(estado.missas, obj.missas, 'id');
  estado.edicoes = { ...estado.edicoes, ...(obj.edicoes || {}) };
  estado.tons = { ...estado.tons, ...(obj.tons || {}) };
  gravar(CHAVES.minhas, estado.minhas); gravar(CHAVES.missas, estado.missas);
  gravar(CHAVES.edicoes, estado.edicoes); gravar(CHAVES.tons, estado.tons);
  return carregarAcervo();
}
