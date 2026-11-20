// Orações Eucarísticas. O texto fica no Católico Orante (mesma tradução do Missal do folheto: "Enviai o vosso
// Espírito Santo!", "O Espírito nos una num só corpo!"); o app não copia o texto — mostra a página dentro da missa,
// como o vídeo, já na oração escolhida. O folheto diz qual oração será usada ("ORAÇÃO EUCARÍSTICA III").
export const URL_ORACOES = 'https://www.catolicoorante.com.br/oeucaristicas.html';

// id = âncora da página
export const ORACOES = [
  ['I', 'Oração Eucarística I (Cânon Romano)'], ['II', 'Oração Eucarística II'], ['III', 'Oração Eucarística III'],
  ['IV', 'Oração Eucarística IV'], ['V', 'Oração Eucarística V'],
  ['DC-I', 'Para Diversas Circunstâncias I'], ['DC-II', 'Para Diversas Circunstâncias II'],
  ['DC-III', 'Para Diversas Circunstâncias III'], ['DC-IV', 'Para Diversas Circunstâncias IV'],
  ['CC-I', 'Com Crianças I'], ['CC-II', 'Com Crianças II'], ['CC-III', 'Com Crianças III'],
  ['R-I', 'Sobre a Reconciliação I'], ['R-II', 'Sobre a Reconciliação II'],
];
export const nomeOracao = id => ORACOES.find(([k]) => k === id)?.[1] || '';
export const urlOracao = id => `${URL_ORACOES}#${id}`;

// "ORAÇÃO EUCARÍSTICA Ill (Prefácio próprio)", "ORAÇÃO EUCARÍSTICA PARA DIV. CIRC. Il" (o OCR lê o I como l, | ou 1)
export function oracaoDoTexto(texto) {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const m = t.match(/oracao eucaristica\s+((?:para\s+(?:as\s+)?div\w*\.?\s*circ\w*\.?|com\s+criancas|sobre\s+a\s+reconciliacao|da\s+reconciliacao|reconciliacao)\s*)?([ivxl|1]{1,4})(?![a-z])/);
  if (!m) return null;
  const romano = m[2].replace(/[l|1]/g, 'i').toUpperCase();
  if (!/^(I{1,3}|IV|V)$/.test(romano)) return null;
  const pre = m[1] ? (/div/.test(m[1]) ? 'DC-' : /crianc/.test(m[1]) ? 'CC-' : 'R-') : '';
  const id = pre + romano;
  return ORACOES.some(([k]) => k === id) ? id : null;
}
