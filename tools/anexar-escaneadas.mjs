// Cifras da arquidiocese que são PDF escaneado (imagem, sem texto): copia o PDF para o app
// (app/data/pdf/<id>.pdf) e marca a música com `pdfImagem`, para ser exibida e exportada mesmo sem texto.
// Uso: node tools/anexar-escaneadas.mjs   (o importador também chama isto no final)
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';

const RAIZ = new URL('../', import.meta.url).pathname;
const CACHE = RAIZ + 'tools/cache/';
const DESTINO = RAIZ + 'app/data/pdf/';
const ARQ = RAIZ + 'app/data/musicas.json';

const decodificar = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");

export function anexarEscaneadas(dados) {
  mkdirSync(DESTINO, { recursive: true });
  let n = 0;
  for (const m of dados.musicas) {
    delete m.pdfImagem;
    if (m.chordpro) continue;
    const pdf = `${CACHE}pdf/${m.id}-cif.pdf`;
    if (!existsSync(pdf)) continue;
    copyFileSync(pdf, `${DESTINO}${m.id}.pdf`);
    m.pdfImagem = `data/pdf/${m.id}.pdf`;
    const modal = `${CACHE}html/modalCifra-${m.id}.html`;
    if (!m.pdf && existsSync(modal)) {
      const link = readFileSync(modal, 'utf8').match(/href="(https:\/\/www\.arquipoa\.com\/uploads\/Musicas\/[^"]+\.pdf)"/i);
      if (link) m.pdf = decodificar(link[1]);
    }
    n++;
  }
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dados = JSON.parse(readFileSync(ARQ, 'utf8'));
  const n = anexarEscaneadas(dados);
  writeFileSync(ARQ, JSON.stringify(dados));
  console.log(`${n} cifras escaneadas anexadas em app/data/pdf/ (${readdirSync(DESTINO).length} arquivos)`);
}
