// Acervo (arquidiocese + músicas próprias) e dados salvos no aparelho
import { normalizar, detectarTom, transporTom, semitonsEntre } from './cifra.js';
import { revisarClassificacao } from './classificar.js';

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
  estado.taxonomia = { tempos: dados.tempos || {}, partes: { ...(dados.partes || {}), 90: 'Canto a Maria' }, categorias: dados.categorias || {}, anos: dados.anos || {} };
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
  // Cifras avulsas acrescentadas a pedido (de outros sites), também agrupadas como versões do mesmo título
  try {
    const r = await fetch('data/adicionadas.json', { cache: 'no-cache' });
    if (r.ok) for (const m of (await r.json()).musicas) estado.base.push({ ...m, chave: 'x' + m.id, origem: 'adicionada' });
  } catch { /* opcional */ }
  migrarTons();
  montarIndice();
}

// Repertórios propostos pela Arquidiocese (um por fim de semana): com o servidor local vêm atualizados do site;
// no app publicado, do arquivo gerado por tools/importar-repertorios.mjs
let repertorios = null;
export async function carregarRepertorios() {
  if (repertorios) return repertorios;
  for (const url of ['/api/repertorios', 'data/repertorios.json']) {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), url.startsWith('/api') ? 70_000 : 15_000);
      const r = await fetch(url, { cache: 'no-cache', signal: ctl.signal });
      clearTimeout(t);
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) { repertorios = (await r.json()).repertorios || []; return repertorios; }
    } catch { /* tenta o próximo */ }
  }
  return [];
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

// Título que não diz qual é a música ("Salmo 144", "Cordeiro de Deus", "Aclamação memorial"): ganha a frase inicial
// da letra ("Salmo 144 – Bendirei eternamente vosso nome"); quando a letra começa pelo próprio título (texto fixo,
// como o Cordeiro), o autor/complemento distingue
const NOME_GENERICO = /^(salmo( \d+)?|hino( do gl[óo]ria)?|canto|c[âa]ntico|aclama[çc][ãa]o( memorial| ao evangelho)?|ant[íi]fona|refr[ãa]o|aleluia!?|santo!?|santo, santo, santo!?|kyrie|gl[óo]ria|cordeiro de deus|doxologia( final)?|sem t[íi]tulo|ofert[óo]rio|comunh[ãa]o|entrada|ato penitencial|senhor,? tende piedade|ladainha|sequ[êe]ncia|pai nosso|creio)$/i;
function fraseInicial(cp) {
  for (const bruta of (cp || '').split('\n')) {
    if (/^\s*\{/.test(bruta)) continue;
    let l = bruta.replace(/\[[^\]]*\]/g, '').replace(/\/:|:\/|\|:|:\|/g, ' ').trim();
    // marcas no começo: "R.", "Refrão:", "1.", "S.:", "Pres.:", "Todos:", aspas, e o próprio "Salmo 127 -"
    for (let ant = null; ant !== l;) {
      ant = l;
      l = l.replace(/^(R\s*[.:]+|Refr[ãa]o\s*:?|Ref\s*[.:]|[A-Za-zÀ-ú]{1,5}\.?\s*:|\d+\s*[.)\-–:]|["“'«]|salmo\s+\d+\s*[-–:]?)\s*/i, '').trim();
    }
    if (!/[a-zà-ú]{3}/i.test(l) || /^(intro|tom|obs|final|solo)\b/i.test(l)) continue;
    // até o fim da frase (. ; ! ? ou parêntese), com pelo menos 3 palavras e no máximo 8
    const frase = l.split(/[.;!?(]/)[0];
    const partes = frase.split(/[,:]/);
    let out = [];
    for (const p of partes) { out.push(...p.trim().split(/\s+/).filter(Boolean)); if (out.length >= 3) break; }
    out = out.slice(0, 8);
    if (out.join(' ').length >= 4) return out.join(' ').replace(/["”»]/g, '');
  }
  return '';
}
function nomear(m) {
  m.nomeOriginal ??= m.nome;
  const base = m.nomeOriginal.trim();
  if (!NOME_GENERICO.test(base)) { m.nome = m.nomeOriginal; return; }
  const frase = fraseInicial(m.chordpro);
  const nucleo = normalizar(base.replace(/^(hino do |salmo( \d+)? ?)/i, ''));
  const repete = frase && nucleo && normalizar(frase).startsWith(nucleo.slice(0, 12));
  const comp = /simplificada|pasta de cantos/i.test(m.complemento || '') ? '' : (m.complemento || '').replace(/^\(|\)$/g, '').split(' - ')[0].trim();
  const extra = repete || !frase ? comp : frase;
  m.nome = extra && normalizar(extra) !== normalizar(base) ? `${base} – ${extra}` : base;
}

function montarIndice() {
  const todas = [...estado.base, ...estado.minhas.map(m => ({ ...m, origem: 'minha' }))];
  for (const m of todas) nomear(m);
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
  // Salmo: cada refrão é um canto (o mesmo salmo tem refrões diferentes conforme o domingo). Chave = começo do refrão
  // (complemento); refrões em que um é o começo do outro ("Bendirei eternamente" / "... vosso nome") ficam juntos.
  const refraoSalmo = new Map();
  {
    const porSalmo = new Map();
    for (const m of todas) {
      const k = chaveGrupo(m.nome);
      if (!/^salmo \d+/.test(k) || m.base) continue;
      const r = normalizar(m.complemento || m.chordpro?.split('\n')[0] || '').split(' ').filter(Boolean).slice(0, 3).join(' ');
      if (!porSalmo.has(k)) porSalmo.set(k, []);
      porSalmo.get(k).push([m.chave, r]);
    }
    for (const lista of porSalmo.values()) {
      const canon = [];
      for (const [chave, r] of [...lista].sort((a, b) => a[1].length - b[1].length)) {
        const c = canon.find(x => r && (r.startsWith(x) || x.startsWith(r)));
        if (!c) canon.push(r);
        refraoSalmo.set(chave, c ?? r);
      }
    }
  }
  const chaveDe = m => {
    let k = chaveGrupo(m.nome);
    const missal = textoDoMissal(m);
    if (missal) return 'ordinario|' + missal;
    if (SEPARAR.has(m.chave)) return k + '|' + m.chave;
    if (refraoSalmo.has(m.chave)) return k + '|' + refraoSalmo.get(m.chave);
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
      if ((m.origem !== 'pasta' && m.origem !== 'adicionada') || SEPARAR.has(m.chave) || textoDoMissal(m)) continue;
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
  // os grupos por título/texto servem só para a classificação (parte da missa e tempo herdados entre cantos iguais)
  estado.revisaoClassificacao = revisarClassificacao([...estado.grupos.values()]);
  // Sem versões: cada música é independente, com número próprio (como num cancioneiro), em ordem alfabética.
  // As músicas só suas ficam no fim, para não mudar a numeração do acervo.
  estado.grupos = new Map(todas.map(m => { m.grupo = m.chave; m.versao = 1; m.totalVersoes = 1; return [m.chave, [m]]; }));
  let num = 0;
  for (const m of todas) if (m.origem !== 'minha') m.num = ++num;
  for (const m of todas) if (m.origem === 'minha') m.num = ++num;
  estado.musicas = todas;
  estado.porChave = new Map(todas.map(m => [m.chave, m]));
}

// Títulos que sozinhos não identificam a música (o complemento diz qual é)
// Ordinário com o texto do Missal (Glória, Santo, Cordeiro): é UMA música por texto, e cada compositor/melodia
// é uma versão dela, qualquer que seja o título ("Santo", "Santo, Santo, Santo", "Cordeiro de Deus - Pe. Sala"...).
// Os de letra própria (paráfrases) não passam no teste e ficam como músicas separadas.
const TEXTO_MISSAL = {
  gloria: [/gloria a deus nas alturas/, /vos louvamos/, /(cordeiro de deus|unigenito)/],
  santo: [/deus do universo/, /(ceu|ceus) e (a )?terra (proclamam|proclama)/, /hosana/],
  cordeiro: [/cordeiro de deus/, /tirais o pecado do mu/, /paz/],
};
// texto do Missal com a letra estragada pela conversão (OCR), conferido à mão
const MISSAL_CONFERIDO = { a664: 'santo', a39: 'santo' };
function textoDoMissal(m) {
  if (m.base || !m.chordpro) return null;
  if (MISSAL_CONFERIDO[m.chave]) return MISSAL_CONFERIDO[m.chave];
  const titulo = normalizar(m.nome);
  // sem rótulos de linha ("S.:", "T:") e sem os hífens de melisma ("mun-un-do", "altu--ras")
  const t = normalizar(m.chordpro.replace(/\[[^\]]*\]/g, '').replace(/^\s*intro.*$/gim, '').replace(/^\s*[A-Za-z]{1,4}\.?:\s*/gm, '').replace(/-+\s*/g, ''));
  for (const [nome, testes] of Object.entries(TEXTO_MISSAL)) {
    if (!(nome === 'gloria' ? /gloria/.test(titulo) : titulo.startsWith(nome))) continue;
    if (testes.every(re => re.test(t))) return nome;
  }
  return null;
}

// Mesmo título mas texto diferente (conferido letra a letra): cada um fica como música própria, não como versão
const SEPARAR = new Set([
  'a481', 'a33', 'a144',   // Aclamação memorial: "Salvador do mundo", "Toda vez que comemos", "Todas as vezes" (≠ "Anunciamos")
  'a549',                  // Aleluia pascal com Salmo 117 (≠ "É preciso vigiar")
  'a167',                  // Eu sou o pão da vida (outra letra)
  'p900175',               // Glória parafraseado ("Glória, Glória, Aleluia")
  'p900158',               // A barca II ("Tu te abeiraste da praia")
  'p900168', 'p900415', 'p900203',   // Santos com letra própria (não o texto do Missal)
  'p900452',               // "Todo teu" da Pasta que na verdade é outra canção
]);
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
  const desc = m.complemento || m.cabecalho?.find(l => /letra|m[úu]sica|autor|melodia/i.test(l))
    || (m.nome !== versoes(m)[0]?.nome ? m.nome : '');   // título próprio da versão ("Cordeiro de Deus VII")
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
// Busca: o número da música; ou palavras-chave em qualquer ordem, no título e na letra juntos (com acento ou sem,
// pedaço de palavra também vale: "alelu" acha "aleluia"); a frase exata vem primeiro. Se nenhuma música tiver
// todas as palavras, mostra as que têm mais delas.
const VAZIAS = new Set(['a', 'o', 'e', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'que', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'se', 'me', 'te', 'ao', 'aos', 'por', 'pra', 'para', 'com']);
export function buscar({ termo = '', tempo = null, parte = null, ano = null, origem = null } = {}) {
  const frase = normalizar(termo);
  let palavras = frase.split(' ').filter(Boolean);
  const chave = palavras.filter(p => !VAZIAS.has(p));
  if (chave.length) palavras = chave;
  const numero = /^\s*(n[ºo°]?\s*)?\d+\s*$/i.test(termo) ? +termo.replace(/\D/g, '') : null;
  const todas = [], parciais = [];
  for (const m of estado.musicas) {
    if (numero !== null) {
      if (m.num === numero || +m.numero === numero) todas.push({ m, peso: m.num === numero ? 1e6 : 1e5 });
      continue;
    }
    if (tempo !== null && !m.tempos?.includes(tempo)) continue;
    if (parte !== null && !m.partes?.includes(parte)) continue;
    if (ano !== null && !m.anos?.includes(ano)) continue;
    if (origem && m.origem !== origem) continue;
    if (!palavras.length) { todas.push({ m, peso: 0 }); continue; }
    const tit = m.buscaTitulo, let_ = m.buscaLetra;
    let achadas = 0, peso = 0;
    for (const p of palavras) {
      const emT = tit.includes(p), emL = let_.includes(p);
      if (emT || emL) achadas++;
      // palavra inteira vale mais que pedaço
      if (emT) peso += (` ${tit} `.includes(` ${p} `) ? 12 : 8);
      if (emL) peso += (` ${let_} `.includes(` ${p} `) ? 3 : 2);
    }
    if (!achadas) continue;
    if (frase.includes(' ')) {
      if (tit.includes(frase)) peso += 200; else if (let_.includes(frase)) peso += 120;
    }
    if (tit.startsWith(palavras[0])) peso += 5;
    (achadas === palavras.length ? todas : parciais).push({ m, peso: peso + achadas * 20 });
  }
  const ord = l => l.sort((a, b) => b.peso - a.peso).map(r => r.m);
  if (todas.length || !palavras.length || numero !== null) return ord(todas);
  const r = ord(parciais); r.parcial = true; return r;
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
