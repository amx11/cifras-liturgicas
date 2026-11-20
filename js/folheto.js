// Folheto "O Dia do Senhor" (Arquidiocese de Porto Alegre). O folheto é de assinatura: não há endereço público para
// baixar, então o PDF que o assinante recebe é guardado SÓ NO APARELHO (IndexedDB, nunca vai para o site) e ligado à
// missa da mesma data (a missa de sábado à tarde usa o folheto do domingo). Do folheto o app lê a data e os cantos
// indicados ("CANTO: ACC (H.L.) nº 413"), que têm o mesmo número das cifras da Arquidiocese. O QR code do folheto
// leva a arquipoa.com/musica-liturgica, de onde já vêm os repertórios do fim de semana.

const BANCO = 'cl-folhetos', LOJA = 'folhetos';

// ---------- Leitura (funções puras: também rodam no Node, para testar) ----------
const sem = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// títulos de seção do folheto -> parte da missa (vale o título mais próximo antes do "CANTO:")
const SECOES = [
  [4, /entrada|abertura/g], [10, /preparacao dos dons|dons|oferendas|ofertorio/g], [16, /comunhao/g],
  [18, /depois da comunhao|acao de gracas|canto final|bencao final|envio/g], [90, /canto a maria|mariano/g],
];
export function cantosDoFolheto(texto) {
  const t = sem(texto);
  const out = [];
  for (const m of t.matchAll(/canto\b[^\n]{0,60}?\bn\s*[º°o]?\s*\.?\s*(\d{1,4})\b/g)) {
    const num = +m[1];
    // o OCR mistura as colunas do folheto: vale (1) "(opção para Entrada/Comunhão)" logo depois do número;
    // (2) o título de seção logo antes ("17) COMUNHÃO  CANTO: ..."), se o próprio item não for só "19) CANTO:";
    // (3) senão fica sem parte e o app usa a classificação do canto no acervo
    const depois = t.slice(m.index, m.index + 220);
    const antes = t.slice(Math.max(0, m.index - 200), m.index);
    let parte = null;
    const op = depois.match(/opcao para (?:a |o )?(entrada|comunhao|ofert\w*|oferendas|final|envio|maria)/);
    if (op) parte = /entrada/.test(op[1]) ? 4 : /comunhao/.test(op[1]) ? 16 : /ofert|oferendas/.test(op[1]) ? 10 : /maria/.test(op[1]) ? 90 : 18;
    else if (!/\b\d{1,2}\s*\)\s*$/.test(antes)) {
      let melhor = -1, tam = 0;
      for (const [p, re] of SECOES) for (const s of antes.matchAll(re)) {
        const fim = s.index + s[0].length;
        if (fim > melhor || (fim === melhor && s[0].length > tam)) { melhor = fim; tam = s[0].length; parte = p; }
      }
    }
    if (!out.some(c => c.num === num)) out.push({ num, parte });
  }
  return out;
}
const iso = (a, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31) ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
// data: pelo nome do arquivo ("2026-11-22-Cristo Rei.pdf") ou pelo cabeçalho ("Ano LIV - 22/11/2026")
export function dataDoFolheto(nome, texto = '') {
  let m = nome.match(/(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = nome.match(/(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = texto.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(20\d{2})\b/);
  return m ? iso(+m[3], +m[2], +m[1]) : null;
}
export const tituloDoFolheto = nome => nome.replace(/\.pdf$/i, '').replace(/^\s*\d{4}[-_.]\d{1,2}[-_.]\d{1,2}\s*[-_]?\s*/, '')
  .replace(/^\s*\d{1,2}[-_.]\d{1,2}[-_.]\d{4}\s*[-_]?\s*/, '').replace(/_+/g, ' ').replace(/^(\d+)\s*º?\s*DTC$/i, '$1º Domingo do Tempo Comum').trim() || 'Folheto';

// folheto de uma data: o do mesmo dia, ou o do domingo seguinte (missa de sábado à tarde)
export function folhetoDaData(lista, data) {
  if (!data) return null;
  const amanha = new Date(data + 'T12:00'); amanha.setDate(amanha.getDate() + 1);
  const d1 = amanha.toISOString().slice(0, 10);
  return lista.find(f => f.data === data) || lista.find(f => f.data === d1) || null;
}

// ---------- Aparelho (IndexedDB) ----------
function abrirBanco() {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA, { keyPath: 'data' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}
async function naLoja(modo, fn) {
  const db = await abrirBanco();
  return new Promise((ok, falha) => {
    const t = db.transaction(LOJA, modo);
    const req = fn(t.objectStore(LOJA));
    t.oncomplete = () => { db.close(); ok(req?.result); };
    t.onerror = () => { db.close(); falha(t.error); };
  });
}
let cache = null;
// lista dos folhetos guardados (sem o PDF, para ser leve); o PDF é lido só ao abrir
export async function listarFolhetos() {
  if (cache) return cache;
  try {
    const todos = await naLoja('readonly', s => s.getAll());
    cache = todos.map(({ arquivo, ...resto }) => resto).sort((a, b) => b.data.localeCompare(a.data));
  } catch { cache = []; }
  return cache;
}
export async function pdfDoFolheto(data) {
  const f = await naLoja('readonly', s => s.get(data));
  return f?.arquivo || null;
}
export async function removerFolheto(data) {
  await naLoja('readwrite', s => s.delete(data));
  cache = null;
}

// PDFs que chegaram pelo "Compartilhar" do Android (o service worker guarda; aqui viram File e saem da fila)
export async function folhetosCompartilhados() {
  if (!('caches' in self)) return [];
  try {
    const cache = await caches.open('cl-compartilhados');
    const out = [];
    for (const req of await cache.keys()) {
      const r = await cache.match(req);
      if (r) out.push(new File([await r.blob()], decodeURIComponent(r.headers.get('X-Nome') || 'folheto.pdf'), { type: 'application/pdf' }));
      await cache.delete(req);
    }
    return out;
  } catch { return []; }
}

// ---------- Sincronizar: lê os PDFs escolhidos e guarda os novos ----------
// arquivos: File[] (PDFs do folheto). Já guardado com o mesmo nome e tamanho = pula.
export async function sincronizarFolhetos(arquivos, progresso = () => {}) {
  const ja = await listarFolhetos();
  const novos = [], pulados = [], falhas = [];
  const { lerTextoPdf } = await import('./ocr.js');
  let k = 0;
  for (const arq of arquivos) {
    k++;
    const rot = arquivos.length > 1 ? `Folheto ${k} de ${arquivos.length} (${arq.name}): ` : `${arq.name}: `;
    if (!/\.pdf$/i.test(arq.name) && arq.type !== 'application/pdf') { falhas.push(`${arq.name}: não é PDF`); continue; }
    if (ja.some(f => f.nome === arq.name && f.tamanho === arq.size)) { pulados.push(arq.name); continue; }
    try {
      const dados = new Uint8Array(await arq.arrayBuffer());
      const texto = await lerTextoPdf(dados, msg => progresso(rot + msg));
      const data = dataDoFolheto(arq.name, texto);
      if (!data) { falhas.push(`${arq.name}: não achei a data (ponha a data no nome do arquivo, ex.: 2026-11-22-Cristo Rei.pdf)`); continue; }
      const f = { data, nome: arq.name, tamanho: arq.size, titulo: tituloDoFolheto(arq.name), cantos: cantosDoFolheto(texto),
        lido: new Date().toISOString(), arquivo: new Blob([dados], { type: 'application/pdf' }) };
      await naLoja('readwrite', s => s.put(f));
      cache = null;
      const { arquivo, ...resumo } = f;
      novos.push(resumo);
    } catch (e) { falhas.push(`${arq.name}: ${e.message}`); }
  }
  return { novos, pulados, falhas };
}
