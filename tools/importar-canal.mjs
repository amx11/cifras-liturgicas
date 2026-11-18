// Converte as cifras (PDF) do canal "Santa Missa Jovem" baixadas por tools/baixar-canal.mjs em app/data/canal.json.
// Nome e parte da missa vêm do título do vídeo ("Entrada - Hino à Nossa Senhora da Assunção"); o vídeo fica como
// link para ouvir. Depois rode node tools/limpar-letras.mjs (maiúsculas, acorde no começo da sílaba…).
// Também o canal "Salmodiai ao nosso Deus" (cifra em Google Docs, texto monoespaçado) → app/data/salmodiai.json.
// Uso: node tools/importar-canal.mjs [canal|salmodiai]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pdfParaCifra } from '../app/js/pdf.js';
import { detectarTom, textoParaChordPro } from '../app/js/cifra.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const CANAIS = {
  canal: { arquivo: 'canal.json', base: 700000, nome: 'Santa Missa Jovem', url: 'https://www.youtube.com/@santamissajovem' },
  salmodiai: { arquivo: 'salmodiai.json', base: 710000, nome: 'Salmodiai ao nosso Deus', url: 'https://www.youtube.com/@SalmodiaiaonossoDeus', partes: [6] },
};
const PASTA = process.argv[2] || 'canal', CFG = CANAIS[PASTA];
const DIR = RAIZ + `tools/cache/${PASTA}/`;
const pdfjs = await import(RAIZ + 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const info = JSON.parse(readFileSync(DIR + 'videos.json', 'utf8'));
const ids = readFileSync(DIR + 'ids.txt', 'utf8').split(/\s+/).filter(Boolean);

// parte da missa pelo começo do título (partes: 1 Glória, 2 Santo, 3 Aclamação, 4 Entrada, 5 Ato penitencial,
// 6 Salmo, 10 Oferendas, 15 Cordeiro, 16 Comunhão, 18 Outros/Final, 90 Canto a Maria)
const PARTES = [
  [/^entrada|^abertura/i, [4]], [/^ato penitencial|^kyrie|^senhor,? tende/i, [5]], [/^gl[óo]ria/i, [1]],
  [/^salmo/i, [6]], [/^aclama[çc][ãa]o|^aleluia/i, [3]], [/^ofert[óo]rio|^oferendas|^apresenta[çc][ãa]o/i, [10]],
  [/^santo/i, [2]], [/^cordeiro/i, [15]], [/^comunh[ãa]o/i, [16]], [/^p[óo]s.?comunh[ãa]o|^a[çc][ãa]o de gra[çc]as/i, [18]],
  [/^final|^envio|^sa[íi]da/i, [18]], [/^maria|^mariano|^nossa senhora/i, [90]],
  [/^divers[oa]s?$|^outros?$/i, []],
];
// tempo litúrgico pelo título e pela descrição (hashtags como "#4ºDomingodaQuaresma"): 1 Advento, 2 Quaresma,
// 3 Tempo Pascal, 4 Natal, 5 Tempo Comum, 6 Semana Santa, 7 Solenidades e Festas
const TEMPOS = [
  [1, /advento/], [4, /natal|epifania|sagrada fam[ií]lia|batismo do senhor|santa m[ãa]e de deus/],
  [2, /quaresma|cinzas/], [6, /semana santa|ramos|quinta.?feira santa|sexta.?feira santa|s[áa]bado santo|lava.?p[ée]s|ado?ra[çc][ãa]o (d|[àa]) cruz|vig[ií]lia pascal|paix[ãa]o/],
  [3, /p[áa]scoa|pascal|ressurrei|ascens[ãa]o|pentecostes/], [5, /tempo comum|domingo do tempo comum|\bdtc\b|domingo ?comum/],
  [7, /corpus christi|sant[ií]ssima trindade|cristo rei|assun[çc][ãa]o|imaculada|aparecida|s[ãa]o pedro e s[ãa]o paulo|todos os santos|finados|s[ãa]o jos[ée]|s[ãa]o jo[ãa]o batista|apresenta[çc][ãa]o do senhor|anuncia[çc][ãa]o|transfigura[çc][ãa]o|exalta[çc][ãa]o da santa cruz|sagrado cora[çc][ãa]o|dedica[çc][ãa]o/],
];
const temposDe = (titulo, descricao) => {
  const t = (titulo + ' ' + (descricao.match(/#\S+/g) || []).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2'))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/#/g, ' ');
  return TEMPOS.filter(([, re]) => re.test(t)).map(([n]) => n);
};
const musicas = [];
let semPdf = 0, semCifra = 0;
ids.forEach((vid, i) => {
  const v = info[vid];
  if (!v) return;
  const arq = existsSync(`${DIR}pdf/${vid}.pdf`) ? `${DIR}pdf/${vid}.pdf` : existsSync(`${DIR}doc/${vid}.txt`) ? `${DIR}doc/${vid}.txt` : null;
  if (!arq) { semPdf++; return; }
  musicas.push({ vid, v, arq, i });
});
const saida = [];
for (const { vid, v, arq, i } of musicas) {
  let r;
  try {
    if (arq.endsWith('.txt')) {
      // Google Docs (monoespaçado): acordes em cima da letra; o que vem antes da 1ª linha de acordes é cabeçalho,
      // e o 1º bloco de letra é o refrão (salmo responsorial)
      const linhas = readFileSync(arq, 'utf8').split('\n');
      const cp = textoParaChordPro(linhas.join('\n'));
      const ls = cp.split('\n');
      const k = ls.findIndex(l => /\[[^\]]+\]/.test(l));
      const cab = ls.slice(0, Math.max(0, k)).filter(l => l.trim());
      let corpo = ls.slice(Math.max(0, k)).join('\n').trim();
      if (CFG.partes?.includes(6) && !/^\s*(R\s*[.:]|\d+\s*[.)])/.test(corpo.replace(/\[[^\]]*\]/g, ''))) corpo = 'R. ' + corpo;
      // estrofes marcadas com "- " viram 1., 2., 3.…
      let n = 0;
      corpo = corpo.replace(/\n{3,}/g, '\n\n').split('\n\n').map(p => {
        const m = p.match(/^((?:\[[^\]]*\])*)\s*[-–—]\s+/);
        return m ? `${++n}. ${m[1]}` + p.slice(m[0].length) : p;
      }).join('\n\n');
      r = { chordpro: corpo, cabecalho: cab };
    } else r = await pdfParaCifra(pdfjs, new Uint8Array(readFileSync(arq)));
  } catch (e) { console.log('erro', vid, e.message); semCifra++; continue; }
  if (!r?.chordpro || !/\[[^\]]+\]/.test(r.chordpro)) { semCifra++; continue; }
  const tituloVideo = v.titulo.normalize('NFC').trim();
  const [parteTxt, ...resto] = tituloVideo.split(/\s+[-–]\s+/);
  const temParte = resto.length && PARTES.some(([re]) => re.test(parteTxt));
  // salmo: "Salmo 49" (o app completa com a frase do refrão); demais: o nome depois da parte da missa
  // salmo: "Salmo 49" (o app completa com a frase do refrão); o que vier antes ("Sábado Santo") vai para o complemento
  const pedacos = tituloVideo.split(/\s+[-–]\s+/);
  const iSalmo = pedacos.findIndex(x => /^salmo\s*\d+/i.test(x));
  const ehSalmo = iSalmo >= 0;
  // demais: o nome é o último pedaço ("Adoração à Cruz - Lamentos do Senhor", "Sábado Santo - Isaías 12 - Com alegria…");
  // os pedaços antes dele (parte da missa, ocasião, livro do cântico) vão para o complemento
  const nome = (ehSalmo ? pedacos[iSalmo].match(/^salmo\s*\d+/i)[0].replace(/^salmo\s*/i, 'Salmo ') : pedacos[pedacos.length - 1]).replace(/\s*\|.*$/, '').trim();
  const ocasiao = (ehSalmo ? pedacos.slice(0, iSalmo) : pedacos.slice(temParte ? 1 : 0, -1)).join(' · ');
  const partes = temParte ? PARTES.find(([re]) => re.test(parteTxt))[1] : (CFG.partes || (/^salmo/i.test(tituloVideo) ? [6] : []));
  saida.push({
    id: CFG.base + i, nome, titulo: tituloVideo, complemento: [CFG.nome, temParte && !ehSalmo && PARTES.find(([re]) => re.test(parteTxt))[1].length ? parteTxt : '', ocasiao].filter(Boolean).join(' · '),
    numero: null, partes, tempos: temposDe(tituloVideo, v.descricao || ''), anos: [], categorias: [], cabecalho: (r.cabecalho || []).filter(l => l.trim()),
    youtube: vid, chordpro: r.chordpro, tom: detectarTom(r.chordpro), temCifra: true, fonte: `https://www.youtube.com/watch?v=${vid}`,
  });
}
writeFileSync(RAIZ + 'app/data/' + CFG.arquivo, JSON.stringify({ fonte: CFG.url, atualizado: new Date().toISOString(), musicas: saida }));
console.log(`${saida.length} cifras do canal ${CFG.nome} · ${semPdf} vídeos sem PDF de cifra · ${semCifra} PDFs sem cifra legível`);
