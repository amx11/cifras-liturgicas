// Sumário: todas as músicas numeradas, separadas por tempo litúrgico e, dentro dele, por parte da missa
import { estado } from './dados.js';
import { esc, ORDEM_TEMPOS, ORDEM_PARTES, COR_TEMPO, nomeTempo, nomeParte } from './ui.js';

export function telaSumario(tela) {
  // uma entrada por música (as versões compartilham o número); tempos e partes somados de todas as versões
  const entradas = [...estado.grupos.values()].map(vs => {
    const tempos = new Set(), partes = new Set();
    vs.forEach(m => { (m.tempos || []).forEach(t => tempos.add(t)); (m.partes || []).forEach(p => partes.add(p)); });
    const principal = vs.find(m => m.origem === 'arquipoa') || vs[0];
    return { num: principal.num, nome: principal.nome, chave: principal.chave, versoes: vs.length, tempos, partes };
  }).sort((a, b) => a.num - b.num);
  const secoes = [...ORDEM_TEMPOS.filter(t => estado.taxonomia.tempos[t]).map(t => ({ id: 't' + t, titulo: nomeTempo(t), cor: COR_TEMPO[t], itens: entradas.filter(e => e.tempos.has(t)) })),
    { id: 'sem', titulo: 'Uso geral (sem tempo próprio)', cor: 'var(--suave, #888)', itens: entradas.filter(e => !e.tempos.size) }].filter(s => s.itens.length);
  const linha = e => `<a class="sum-item" href="#/musica/${esc(e.chave)}"><span class="num">${e.num}</span><span class="sum-nome">${esc(e.nome)}</span>${e.versoes > 1 ? `<span class="pequeno suave">${e.versoes} versões</span>` : ''}</a>`;
  const porParte = itens => {
    const blocos = [];
    const usados = new Set();
    for (const p of [...ORDEM_PARTES, ...Object.keys(estado.taxonomia.partes).map(Number).filter(p => !ORDEM_PARTES.includes(p))]) {
      const lista = itens.filter(e => !usados.has(e) && e.partes.has(p));
      if (!lista.length) continue;
      lista.forEach(e => usados.add(e));
      blocos.push(`<h3 class="sum-parte">${esc(nomeParte(p))} <span class="pequeno suave">(${lista.length})</span></h3>${lista.map(linha).join('')}`);
    }
    const resto = itens.filter(e => !usados.has(e));
    if (resto.length) blocos.push(`<h3 class="sum-parte">Outros cantos <span class="pequeno suave">(${resto.length})</span></h3>${resto.map(linha).join('')}`);
    return blocos.join('');
  };
  tela.innerHTML = `
    <h1>Sumário</h1>
    <p class="pequeno suave">${entradas.length} músicas numeradas em ordem alfabética. Toque num tempo para abrir; cada música aparece em todos os tempos em que é usada. Para ir direto a um número, digite-o na busca de Músicas.</p>
    <div class="sum-indice nao-imprimir">${secoes.map(s => `<button class="btn peq" data-ir="${s.id}" style="border-color:${s.cor}">${esc(s.titulo)} <span class="suave">${s.itens.length}</span></button>`).join('')}</div>
    ${secoes.map(s => `<details class="sum-tempo" id="sum-${s.id}" style="--cor:${s.cor}"><summary><b>${esc(s.titulo)}</b> <span class="pequeno suave">${s.itens.length} músicas</span></summary>${porParte(s.itens)}</details>`).join('')}`;
  tela.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => {
    const d = tela.querySelector('#sum-' + b.dataset.ir);
    d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
