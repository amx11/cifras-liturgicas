import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfParaCifra } from '../app/js/pdf.js';
import { renderizarTexto, detectarTom, transporTom, semitonsEntre } from '../app/js/cifra.js';
const r = await pdfParaCifra(pdfjs, new Uint8Array(readFileSync(process.argv[2])));
console.log('TITULO:', r.titulo, '\nCAB:', r.cabecalho, '\nTOM:', detectarTom(r.chordpro));
console.log(r.chordpro.split('\n').slice(0, 14).join('\n'));
console.log('---- transposto para C:');
console.log(renderizarTexto(r.chordpro, { semitons: semitonsEntre('Am', 'Cm') }).split('\n').slice(0, 10).join('\n'));
