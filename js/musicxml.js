// MusicXML (do Audiveris, MuseScore, Finale...) -> cifra em ChordPro.
// Exato por construção: cada <harmony> vale a partir da nota seguinte, e a sílaba é a <lyric> dessa nota.
// Nota sem sílaba (prolongamento/melisma ou pausa): o acorde vai para a próxima sílaba cantada, como na cifra.
// Funciona no navegador e no Node (leitura por expressões, sem DOM).

const PASSO = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const KIND = {
  major: '', minor: 'm', augmented: 'aug', diminished: 'dim', dominant: '7', 'major-seventh': '7M', 'minor-seventh': 'm7',
  'diminished-seventh': 'º', 'augmented-seventh': '7(#5)', 'half-diminished': 'm7(b5)', 'major-minor': 'm(7M)', 'major-sixth': '6',
  'minor-sixth': 'm6', 'dominant-ninth': '7(9)', 'major-ninth': '7M(9)', 'minor-ninth': 'm7(9)', 'dominant-11th': '7(11)',
  'dominant-13th': '7(13)', 'suspended-second': 'sus2', 'suspended-fourth': 'sus4', power: '5', none: '',
};
const tag = (x, t) => { const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(x); return m ? m[1].trim() : null; };
const desc = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const nota = (passo, alt) => passo + (alt === '1' ? '#' : alt === '-1' ? 'b' : alt === '2' ? '##' : '');

function acordeDe(h) {
  const raiz = nota(tag(h, 'root-step') || 'C', tag(h, 'root-alter'));
  const kindTag = /<kind([^>]*)>([^<]*)<\/kind>/.exec(h);
  // texto do acorde como está escrito na partitura (atributo text), senão pelo tipo
  const texto = kindTag && /text="([^"]*)"/.exec(kindTag[1])?.[1];
  let suf = texto != null ? texto : KIND[kindTag?.[2]?.trim()] ?? '';
  for (const d of h.matchAll(/<degree>([\s\S]*?)<\/degree>/g)) {
    if (texto != null) break;
    const v = tag(d[1], 'degree-value'), a = tag(d[1], 'degree-alter'), t = tag(d[1], 'degree-type');
    if (t === 'add') suf += `(${a === '-1' ? 'b' : a === '1' ? '#' : ''}${v})`;
  }
  const baixo = tag(h, 'bass-step') ? '/' + nota(tag(h, 'bass-step'), tag(h, 'bass-alter')) : '';
  return raiz + suf + baixo;
}

// Lê a 1ª parte com letra; devolve eventos: { tipo:'acorde', nome } | { tipo:'nota', silabas:{n:{texto,liga}} } | { tipo:'quebra' }
function eventos(xml) {
  const partes = [...xml.matchAll(/<part\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/part>/g)].map(m => m[2]);
  const parte = partes.find(p => /<lyric/.test(p)) || partes[0] || '';
  const ev = [];
  for (const compasso of parte.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)) {
    for (const el of compasso[1].matchAll(/<print\b[^>]*?(?:\/>|>[\s\S]*?<\/print>)|<harmony\b[\s\S]*?<\/harmony>|<note\b[\s\S]*?<\/note>/g)) {
      const x = el[0];
      if (x.startsWith('<print')) { if (/new-system="yes"|new-page="yes"/.test(x)) ev.push({ tipo: 'quebra' }); continue; }
      if (x.startsWith('<harmony')) { ev.push({ tipo: 'acorde', nome: acordeDe(x) }); continue; }
      if (/<chord\s*\/>/.test(x) || /<grace\b/.test(x)) continue;          // nota do mesmo acorde / ornamento
      const silabas = {};
      for (const l of x.matchAll(/<lyric\b([^>]*)>([\s\S]*?)<\/lyric>/g)) {
        const n = /number="([^"]+)"/.exec(l[1])?.[1] || '1';
        const textos = [...l[2].matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(t => desc(t[1]));
        if (!textos.length) continue;
        const sil = (/<syllabic>(\w+)<\/syllabic>/.exec(l[2]) || [])[1] || 'single';
        // elisão ("do‿e"): duas sílabas na mesma nota, separadas por espaço
        silabas[n] = { texto: textos.join(' '), liga: sil === 'begin' || sil === 'middle' };
      }
      ev.push({ tipo: 'nota', pausa: /<rest\b/.test(x), silabas });
    }
  }
  return ev;
}

export function musicxmlParaChordPro(xml) { return eventosParaChordPro(eventos(xml)); }

// eventos (do MusicXML ou do MuseScore) -> ChordPro, um bloco por estrofe
export function eventosParaChordPro(ev) {
  const versos = [...new Set(ev.flatMap(e => e.tipo === 'nota' ? Object.keys(e.silabas) : []))].sort((a, b) => (+a || 99) - (+b || 99));
  if (!versos.length) {            // só acordes (sem letra): uma linha de acordes por sistema
    const linhas = [[]];
    for (const e of ev) { if (e.tipo === 'quebra' && linhas[linhas.length - 1].length) linhas.push([]); if (e.tipo === 'acorde') linhas[linhas.length - 1].push(`[${e.nome}]`); }
    return linhas.filter(l => l.length).map(l => l.join(' ')).join('\n');
  }
  const blocos = [];
  for (const v of versos) {
    const linhas = [];
    let linha = '', pendentes = [], cantou = false, ultima = -1;   // ultima: onde começa o texto da última sílaba cantada
    for (const e of ev) {
      if (e.tipo === 'quebra') {
        if (linha.trim()) { linhas.push(linha); linha = ''; ultima = -1; }
        else pendentes = [];                                // sistema inteiro sem letra neste verso (introdução, refrão de outro verso)
        continue;
      }
      if (e.tipo === 'acorde') { pendentes.push(e.nome); continue; }
      const s = e.silabas[v];
      if (!s) {
        // nota sem sílaba: se é a mesma sílaba ainda soando (melisma/ligadura), o acorde fica nela ("[F/A][C/G]ção");
        // numa pausa, espera a próxima sílaba
        if (!e.pausa && pendentes.length && ultima >= 0 && cantou) {
          // logo depois da sílaba que está soando ("Tu[A6] vieste", "refei[F/A]ção[C/G].")
          const ins = pendentes.map(a => `[${a}]`).join('');
          linha = linha.slice(0, ultima) + ins + linha.slice(ultima); ultima += ins.length; pendentes = [];
        }
        continue;
      }
      // palavra partida na quebra de sistema: a sílaba continua a palavra da linha anterior
      if (!linha && linhas.length && /\S$/.test(linhas[linhas.length - 1]) && linhas[linhas.length - 1].endsWith('\u0000')) {
        linha = linhas.pop().slice(0, -1);
      }
      linha += pendentes.map(a => `[${a}]`).join('') + s.texto;
      ultima = linha.length;                                // fim do texto da sílaba cantada
      linha += s.liga ? '\u0000' : ' ';
      pendentes = []; cantou = true;
    }
    if (pendentes.length) linha += pendentes.map(a => `[${a}]`).join(' ');
    if (linha.trim()) linhas.push(linha);
    // junta palavras que continuam na linha seguinte ("Ma-" / "ria")
    for (let i = 0; i < linhas.length - 1; i++) if (linhas[i].endsWith('\u0000')) {
      const resto = linhas[i + 1].match(/^\S+\s?/)?.[0] || '';
      linhas[i] = linhas[i].slice(0, -1) + resto.trimEnd(); linhas[i + 1] = linhas[i + 1].slice(resto.length);
    }
    if (cantou) blocos.push(linhas.map(l => l.replace(/\u0000/g, '').replace(/\s+$/, '')).filter(l => l.trim()).join('\n'));
  }
  return blocos.join('\n\n');
}
