// Usa os arquivos MuseScore (.mscz) da arquidiocese — acorde e sílaba exatos de cada estrofe — para:
// 1) completar os acordes das estrofes que na cifra vieram só com a letra;
// 2) conferir a sílaba dos acordes que já existem (a partitura vale; só quando é claramente o mesmo arranjo).
// Os .mscz ficam em tools/cache/mscz (node tools/baixar-mscz.mjs). Roda depois de conferir-partituras.
// Uso: node tools/mscz-cifras.mjs [--sem-salvar] [-v] [ids...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { unzipSync } from '../app/vendor/fflate.mjs';
import { mscxDoMscz, mscxParaEventos } from '../app/js/mscx.js';
import { eventosParaChordPro } from '../app/js/musicxml.js';
import { conferirComPartitura, completarPelaPartitura } from '../app/js/conferir.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const ARQ = RAIZ + 'app/data/musicas.json';
const args = process.argv.slice(2), SALVAR = !args.includes('--sem-salvar'), V = args.includes('-v');
const so = new Set(args.filter(a => /^\d+$/.test(a)).map(Number));
const dados = JSON.parse(readFileSync(ARQ, 'utf8'));
const contar = cp => (cp.match(/\[/g) || []).length;
const st = { lidos: 0, semLetra: 0, conferidas: 0, movidos: 0, completadas: 0, estrofes: 0, acordes: 0, outro: 0 };
for (const m of dados.musicas) {
  if (so.size && !so.has(m.id)) continue;
  delete m.museScore;
  const arq = `${RAIZ}tools/cache/mscz/${m.id}.mscz`;
  if (!m.chordpro || !existsSync(arq)) continue;
  let part;
  try { part = eventosParaChordPro(mscxParaEventos(mscxDoMscz(unzipSync, new Uint8Array(readFileSync(arq))))); } catch (e) { if (V) console.log('erro', m.id, e.message); continue; }
  st.lidos++;
  if (!part || contar(part) < 3) { st.semLetra++; continue; }
  const info = {};
  // 0) cifra montada da leitura da partitura em PDF/imagem: refaz todos os acordes pelo MuseScore (exato),
  //    mantendo a letra e as linhas; só aceita se TODOS os parágrafos que tinham acordes forem refeitos
  if (m.daPartitura && !m.daPartitura.transcrita) {
    const pars = m.chordpro.split(/\n[ \t]*\n/);
    const comAcordes = pars.filter(p => /\[[^\]]+\]/.test(p) && p.replace(/\[[^\]]*\]/g, '').trim()).length;
    const limpa = pars.map(p => p.replace(/\[[^\]]*\]/g, '').split('\n').filter(l => l.trim()).join('\n')).filter(Boolean).join('\n\n');
    const r = completarPelaPartitura(limpa, part);
    if (r && r.estrofes >= comAcordes && comAcordes) {
      if (V) console.log(`## ${m.id} ${m.nome}: refeita pelo MuseScore (${r.estrofes} parágrafos, ${r.acordes} acordes)`);
      m.chordpro = r.chordpro; info.refeita = true; info.acordesNovos = r.acordes; st.refeitas = (st.refeitas || 0) + 1;
      m.daPartitura = { ...m.daPartitura, formato: 'musescore', revisar: false, duvidas: [] };
      m.museScore = info;
      continue;
    }
  }
  // 1) acordes existentes: mesma conferência da partitura em PDF, agora com a fonte exata
  if (contar(m.chordpro) >= 3) {
    const r = conferirComPartitura(m.chordpro, part, { nomes: !!m.ocr });
    if (r.comparados >= 5 && r.comparados >= contar(m.chordpro) * 0.4) {
      st.conferidas++; info.comparados = r.comparados;
      if (r.movidos || r.renomeados) {
        if (V) { const a = m.chordpro.split('\n'), b = r.chordpro.split('\n'); console.log(`== ${m.id} ${m.nome}: ${r.movidos} movidos de ${r.comparados}`); a.forEach((l, i) => { if (l !== b[i]) console.log('   ' + l + '\n → ' + b[i]); }); }
        m.chordpro = r.chordpro; info.movidos = r.movidos; info.renomeados = r.renomeados; st.movidos += r.movidos;
      }
      // a partitura conferiu a maioria: dúvidas de posição/nome do OCR resolvidas
      if (m.ocr?.locais && r.comparados >= contar(m.chordpro) * 0.6) {
        m.ocr.locais = m.ocr.locais.filter(l => !l.d.startsWith('posição') && !l.d.startsWith('lido') && !(l.d.startsWith('acorde ilegível') && !m.chordpro.includes('[?]')));
        m.ocr.duvidas = (m.ocr.duvidas || []).filter(d => !d.startsWith('posição') && !d.includes('→'));
        m.ocr.revisar = m.ocr.locais.length > 0;
      }
    } else st.outro++;
  }
  // 2) estrofes sem acordes
  const c = completarPelaPartitura(m.chordpro, part);
  if (c) {
    if (V) { const a = m.chordpro.split('\n'), b = c.chordpro.split('\n'); console.log(`++ ${m.id} ${m.nome}: ${c.estrofes} estrofes, ${c.acordes} acordes`); a.forEach((l, i) => { if (l !== b[i]) console.log('   ' + b[i]); }); }
    m.chordpro = c.chordpro; info.estrofes = c.estrofes; info.acordesNovos = c.acordes;
    st.completadas++; st.estrofes += c.estrofes; st.acordes += c.acordes;
    if (!m.temCifra) m.temCifra = true;
  }
  if (Object.keys(info).length) m.museScore = info;
}
if (SALVAR) writeFileSync(ARQ, JSON.stringify(dados));
console.log(`${st.refeitas || 0} cifras da partitura refeitas · ${st.lidos} MuseScore lidos (${st.semLetra} sem letra/acordes) · ${st.conferidas} cifras conferidas, ${st.movidos} acordes trocados de sílaba · ${st.outro} de outro arranjo · ${st.completadas} músicas completadas: ${st.estrofes} estrofes, ${st.acordes} acordes`);
