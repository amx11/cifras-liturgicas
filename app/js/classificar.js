// Revisão da classificação (parte da missa e tempo litúrgico) com regras da liturgia, aplicada ao carregar o acervo:
// 1) versão sem classificação (Pasta de Cantos, adicionadas) herda a das versões da Arquidiocese do mesmo título;
// 2) sem classificação nenhuma: parte da missa pelo título (Glória, Santo, Cordeiro, Kyrie, Salmo, Aleluia...);
// 3) ordinário da missa (texto fixo, serve o ano todo): Santo e Cordeiro em todos os tempos; Glória em todos,
//    menos Advento e Quaresma (não se canta o Glória nesses tempos, salvo solenidades);
// 4) Aleluia nunca na Quaresma.
// Tempos: 1 Advento, 2 Quaresma, 3 Pascal, 4 Natal, 5 Comum, 6 Semana Santa, 7 Solenidades.
// Partes: 1 Glória, 2 Santo, 3 Aclamação, 4 Entrada, 5 Ato penitencial, 6 Salmo, 10 Oferendas, 15 Cordeiro, 16 Comunhão, 18 Outros, 20 Oração Eucarística, 90 Canto a Maria.

const TODOS = [1, 4, 5, 2, 6, 3, 7];
const SEM_GLORIA = [1, 2];
const n = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PRECE = /^(aclamacao memorial|aclamacao (apos|depois) a consagracao|doxologia|grande amem|prece eucaristica|oracao eucaristica|dialogo do prefacio|prefacio)\b/;
const PRECE_LETRA = /anunciamos,? senhor,? a vossa morte|todas as vezes que comemos|salvador do mundo,? salvai-nos|por cristo,? com cristo/;
// parte da missa pelo título (só para quem não tem classificação)
const PELO_TITULO = [
  [15, /^cordeiro\b/],
  [2, /^(santo|santao|hosana)\b(?!\s+(antonio|espirito|dos santos))/],
  [1, /^(hino do )?gloria\b(?! (a vos|e louvor|a cristo|ao filho|vocacional))/],
  [5, /^kyrie|^senhor,? (tende|que viestes|que vieste|que fazeis|que sois|vos sois o caminho)|^cristo,? tende|^piedade|^perdao,? senhor|^misericordia$/],
  [6, /^salmo\b/],
  [3, /^aleluia|^aclamacao ao evangelho|^louvor e gloria|^gloria a vos,? o cristo|^pela palavra de deus/],
  [10, /ofert|oferend|apresentamos|^o dizimo|^e o dizimo|^nossa terra deu-nos trigo|^bendito sejas,? senhor,? deus do universo/],
  [16, /\b(pao|ceia|eucarist|hostia|comunhao)|^na mesa|mesa sagrada|mesa do pai/],
  [4, /^(reunidos|celebrai|bem-vind|entre nessa procissao|eu venho do sul|o espirito de deus nos reune|vem louvar|vinde,? (alegres|todos)|teu povo aqui reunido|alegres vamos)/],
];

// o ordinário só é aceito pelo título se a letra tiver o texto litúrgico (evita, p. ex., um canto de louvor chamado "Glória...")
const CONFIRMA = {
  1: /paz na terra|paz aos homens|nas alturas|nos vos louvamos|vos louvamos|rei dos ceus/,
  2: /hosana|deus do universo|o ceu e a terra|ceus e terra/,
  15: /tirais o pecado|tira o pecado/,
  5: /piedade|eleison|tende compaixao/,
};

const MARIANO = /\b(maria|nossa senhora|virgem|ave|magnificat|salve,? rainha|mae de deus|mae (do|da|dos|fiel|peregrina|de)|imaculada|aparecida|senhora (da|do|de)|rainha do ceu)\b/;

export function revisarClassificacao(grupos) {
  const resumo = { herdadas: 0, peloTitulo: 0, ordinario: 0, removidos: 0 };
  for (const vs of grupos) {
    // 1) herança dentro do grupo de versões
    const ref = vs.filter(m => m.origem === 'arquipoa' || m.origem === 'adicionada');
    const partesG = [...new Set(ref.flatMap(m => m.partes || []))];
    const temposG = [...new Set(ref.flatMap(m => m.tempos || []))];
    for (const m of vs) {
      if (ref.includes(m)) continue;
      let mudou = false;
      if (!m.partes?.length && partesG.length) { m.partes = partesG; mudou = true; }
      if (!m.tempos?.length && temposG.length) { m.tempos = temposG; mudou = true; }
      if (mudou) resumo.herdadas++;
    }
  }
  for (const vs of grupos) for (const m of vs) {
    const titulo = n(m.nome);
    // Oração Eucarística: aclamação memorial ("Anunciamos, Senhor…", "Todas as vezes…", "Salvador do mundo…"),
    // doxologia ("Por Cristo, com Cristo…") e Amém — parte própria, depois do Santo
    if (PRECE.test(titulo) || (/^(amem|mist[eé]rio da f[eé])$/.test(titulo) && PRECE_LETRA.test(n(m.chordpro).replace(/\[[^\]]*\]/g, '')))) {
      m.partes = [20];
      m.tempos = [...TODOS];   // texto fixo do Missal: serve o ano todo
    }
    // 2) pelo título
    if (!m.partes?.length) {
      const letra = n((m.chordpro || '').replace(/\[[^\]]*\]/g, '')).replace(/\s+/g, ' ');
      const r = PELO_TITULO.find(([p, re]) => re.test(titulo) && (!CONFIRMA[p] || CONFIRMA[p].test(letra)));
      if (r) { m.partes = [r[0]]; m.classificacaoInferida = true; resumo.peloTitulo++; }
    }
    // Canto a Maria (antes do canto final): todo canto mariano, além da parte que já tiver
    if (MARIANO.test(titulo) && !(m.partes || []).includes(90)) m.partes = [...(m.partes || []), 90];
    const partes = m.partes || [];
    // 3) ordinário da missa: o texto é sempre o mesmo, então serve a todos os tempos permitidos
    const ehGloria = partes.includes(1) && /gloria/.test(titulo) && !/gloria a vos|gloria e louvor|louvor e gloria|gloria a cristo/.test(titulo);
    const ehOrdinario = ehGloria || partes.includes(2) || partes.includes(15);
    if (ehOrdinario) {
      const permitidos = ehGloria ? TODOS.filter(t => !SEM_GLORIA.includes(t)) : TODOS;
      const antes = (m.tempos || []).length;
      m.tempos = permitidos;
      if (antes !== permitidos.length) resumo.ordinario++;
    } else if (partes.includes(5) && !m.tempos?.length) m.tempos = TODOS;   // ato penitencial sem tempo: qualquer tempo
    // 4) Aleluia nunca na Quaresma
    if (/^aleluia|aleluia/.test(titulo) && m.tempos?.includes(2)) { m.tempos = m.tempos.filter(t => t !== 2); resumo.removidos++; }
  }
  return resumo;
}
