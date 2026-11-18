// MuseScore (.mscx, de dentro do .mscz) -> eventos nota a nota com acorde e sílaba de cada estrofe.
// O acorde (<Harmony>) vale a partir da sua posição no tempo; a sílaba é a <Lyrics> da nota cantada nessa
// posição (ou a próxima, se cair numa pausa/prolongamento). Exato por construção, como no MusicXML.
// Sem dependências do navegador (roda no Node e no app).

// ---- XML mínimo: árvore { tag, attrs, filhos, texto }
function lerXml(xml) {
  const raiz = { tag: '#', filhos: [] }, pilha = [raiz];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) { const t = pilha[pilha.length - 1]; t.texto = (t.texto || '') + m[5]; t.filhos.push({ tag: '#t', texto: m[5], filhos: [] }); continue; }
    if (!m[2]) continue;
    if (m[1]) { if (pilha.length > 1) pilha.pop(); continue; }
    const attrs = {};
    for (const a of (m[3] || '').matchAll(/([\w.:-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
    const no = { tag: m[2], attrs, filhos: [] };
    pilha[pilha.length - 1].filhos.push(no);
    if (!m[4]) pilha.push(no);
  }
  return raiz;
}
const filho = (n, t) => n.filhos.find(f => f.tag === t);
const filhos = (n, t) => n.filhos.filter(f => f.tag === t);
const txt = (n, t) => { const f = t ? filho(n, t) : n; return f ? desc((f.texto || '').trim()) : null; };
const desc = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
// texto de <text> (pode ter <sym>, <b>, <font>…): só o texto corrido
// elisão ("onde‿o"): símbolo lyricsElision, glifo da fonte ScoreText ou caractere de uso privado → espaço
const textoRico = n => !n ? '' : n.filhos.map(f => f.tag === '#t' ? f.texto : f.tag === 'sym' ? (/elision/i.test(f.texto || '') ? ' ' : '')
  : f.tag === 'font' && /ScoreText/i.test(f.attrs.face || '') ? ' ' : textoRico(f)).join('');

// ---- tempo (MuseScore: 480 por semínima)
const DUR = { long: 7680, breve: 3840, whole: 1920, half: 960, quarter: 480, eighth: 240, '16th': 120, '32nd': 60, '64th': 30, '128th': 15 };
const fracao = s => { const [a, b] = String(s || '0/1').split('/').map(Number); return b ? Math.round(1920 * a / b) : 0; };

// ---- acorde: <root> e <base> em TPC (classe de altura tonal: 14 = Dó, +1 = uma quinta acima)
const TPC = ['Fbb', 'Cbb', 'Gbb', 'Dbb', 'Abb', 'Ebb', 'Bbb', 'Fb', 'Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#', 'F##', 'C##', 'G##', 'D##', 'A##', 'E##', 'B##'];
const notaTpc = t => TPC[+t + 1] || '?';
function acordeDe(h) {
  const root = txt(h, 'root');
  const nome = txt(h, 'name') || '';
  if (root == null) return nome || null;                       // acorde escrito só como texto
  const base = txt(h, 'base');
  return notaTpc(root) + nome.replace(/^maj7$/, '7M').replace(/^Maj7$/, '7M') + (base != null ? '/' + notaTpc(base) : '');
}

// eventos de uma pauta: [{ t, tipo:'acorde', nome } | { t, tipo:'nota', silabas:{v:{texto,liga}}, pausa }] e quebras
function lerPauta(staff) {
  const ev = [];
  let t0 = 0;
  for (const med of filhos(staff, 'Measure')) {
    let fimMed = t0;
    filhos(med, 'voice').forEach((voz, iv) => {
      let t = t0, razao = 1;
      for (const el of voz.filhos) {
        switch (el.tag) {
          case 'location': t += fracao(txt(el, 'fractions')); break;
          case 'Tuplet': { const nn = +txt(el, 'normalNotes') || 1, an = +txt(el, 'actualNotes') || 1; razao = nn / an; break; }
          case 'endTuplet': razao = 1; break;
          case 'Harmony': { const nome = acordeDe(el); if (nome) ev.push({ t, tipo: 'acorde', nome, voz: iv }); break; }
          case 'Chord': case 'Rest': {
            const dt = txt(el, 'durationType');
            let d = dt === 'measure' ? fracao(txt(el, 'duration')) : (DUR[dt] || 0);
            const pontos = +txt(el, 'dots') || 0;
            d = d * (2 - 1 / 2 ** pontos) * razao;
            if (filho(el, 'Tuplet') && razao === 1) { /* referência a tuplet por id (formato antigo): sem ajuste */ }
            if (el.tag === 'Chord' && !filho(el, 'acciaccatura') && !filho(el, 'appoggiatura') && !/grace|acciaccatura|appoggiatura/.test(el.filhos.map(f => f.tag).join())) {
              const silabas = {};
              for (const l of filhos(el, 'Lyrics')) {
                const v = String(+(txt(l, 'no') || 0) + 1);
                let texto = textoRico(filho(l, 'text')).replace(/[ ‿_-]/g, ' ').replace(/\s+/g, ' ').trim();
                if (!texto) continue;
                const sil = txt(l, 'syllabic') || 'single';
                silabas[v] = { texto, liga: sil === 'begin' || sil === 'middle' };
              }
              ev.push({ t, tipo: 'nota', silabas, voz: iv });
            } else if (el.tag === 'Rest') ev.push({ t, tipo: 'nota', pausa: true, silabas: {}, voz: iv });
            t += d;
            break;
          }
          default: break;
        }
      }
      if (iv === 0) fimMed = Math.max(fimMed, t);
    });
    // quebra de linha marcada no compasso
    const quebra = filhos(med, 'LayoutBreak').some(b => /line|page/.test(txt(b, 'subtype') || ''));
    t0 = fimMed > t0 ? fimMed : t0 + fracao(med.attrs.len || '4/4');
    if (quebra) ev.push({ t: t0 - 0.5, tipo: 'quebra' });
  }
  return ev;
}

// Lê o arquivo .mscx: a pauta com letra dá as sílabas; os acordes vêm de todas as pautas (sem repetir)
export function mscxParaEventos(xml) {
  const arv = lerXml(xml);
  const score = (function busca(n) { if (n.tag === 'Score') return n; for (const f of n.filhos) { const r = busca(f); if (r) return r; } return null; })(arv);
  if (!score) return [];
  const pautas = filhos(score, 'Staff').filter(s => filhos(s, 'Measure').length);
  const lidas = pautas.map(lerPauta);
  const comLetra = lidas.findIndex(ev => ev.some(e => e.tipo === 'nota' && Object.keys(e.silabas).length));
  if (comLetra < 0) return [];
  const notas = lidas[comLetra].filter(e => e.tipo === 'nota' && (e.voz === 0 || Object.keys(e.silabas).length));
  // acordes: os da pauta com letra; se ela não tiver nenhum, os da primeira pauta que tiver
  let acordes = lidas[comLetra].filter(e => e.tipo === 'acorde');
  if (!acordes.length) acordes = (lidas.find(ev => ev.some(e => e.tipo === 'acorde')) || []).filter(e => e.tipo === 'acorde');
  const quebras = lidas[comLetra].filter(e => e.tipo === 'quebra');
  // mesma posição: acorde antes da nota; notas de vozes diferentes no mesmo tempo: uma só (a que tem letra)
  const vistas = new Map();
  for (const n of notas) { const k = n.t; const v = vistas.get(k); if (!v || (!Object.keys(v.silabas).length && Object.keys(n.silabas).length)) vistas.set(k, n); }
  const ord = { quebra: 0, acorde: 1, nota: 2 };
  return [...quebras, ...new Set(acordes.map(a => a.t + '|' + a.nome))].map(x => typeof x === 'string' ? { t: +x.split('|')[0], tipo: 'acorde', nome: x.split('|').slice(1).join('|') } : x)
    .concat([...vistas.values()])
    .sort((a, b) => a.t - b.t || ord[a.tipo] - ord[b.tipo]);
}

// .mscz é um zip: devolve o texto do .mscx (recebe a função unzipSync do fflate e os bytes)
export function mscxDoMscz(unzipSync, bytes) {
  const arqs = unzipSync(bytes, { filter: f => /\.mscx$/i.test(f.name) && !f.name.includes('/') || /\.mscx$/i.test(f.name) });
  const nome = Object.keys(arqs).find(n => /\.mscx$/i.test(n));
  return nome ? new TextDecoder().decode(arqs[nome]) : null;
}
