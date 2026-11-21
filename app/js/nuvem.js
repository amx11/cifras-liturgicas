// Conta (Firebase): cada pessoa entra com a conta Google e tem as SUAS coisas, independentes das de qualquer outra
// pessoa — missas, cifras colocadas/personalizadas, nomes editados, tons, paróquia e instrumento —, iguais em qualquer
// aparelho em que entrar. Funciona sem internet (cache do Firestore) e sincroniza quando a conexão volta.
// No 1º login o que já estava no aparelho vai para a conta; ao sair, as coisas da conta saem do aparelho (continuam
// na conta), para outra pessoa que use o mesmo aparelho não ver nada. Folhetos (assinatura) ficam só no aparelho.
// Sem conta, o app funciona como antes, só no aparelho.
// MINISTÉRIO (opcional): quem cria é coordenador e CADASTRA os membros pelo e-mail Google; quem entra com um e-mail
// cadastrado cai no ministério. As missas do ministério (e as cifras próprias usadas nelas) aparecem para todos os
// membros; só o coordenador muda; o membro pode duplicar (fica uma cópia pessoal).
import { estado, ganchos, recarregarIndice, guardarNoAparelho } from './dados.js';
import { firebaseConfig } from './firebase-config.js';

export const conta = { ativa: false, usuario: null, pronto: false, erro: '', aviso: '', grupo: null, grupoNome: '', papel: null };
export const coordenador = () => !!conta.grupo && conta.papel === 'coordenador';
const enviadosMin = { missas: new Map(), musicas: new Map() };
let fb = null;            // { auth, db, a: funções do Auth, f: funções do Firestore }
let assinaturas = [];
const enviados = { missas: new Map(), musicas: new Map(), edicoes: new Map(), config: '' };   // último conteúdo enviado/recebido
const avisar = () => window.dispatchEvent(new Event('nuvem-mudou'));
const PREFS_DA_CONTA = ['paroquia', 'instrumento', 'nivel', 'missasAutomaticas'];

export async function iniciarNuvem() {
  if (!firebaseConfig?.apiKey) return;
  try {
    const [{ initializeApp }, a, f] = await Promise.all([
      import('../vendor/firebase/firebase-app.js'), import('../vendor/firebase/firebase-auth.js'), import('../vendor/firebase/firebase-firestore.js')]);
    const app = initializeApp(firebaseConfig);
    const auth = a.getAuth(app);
    const db = f.initializeFirestore(app, { localCache: f.persistentLocalCache({ tabManager: f.persistentMultipleTabManager() }) });
    fb = { auth, db, a, f };
    conta.ativa = true;
    a.getRedirectResult(auth).catch(() => {});
    a.onAuthStateChanged(auth, async u => {
      parar();
      const antes = conta.usuario?.uid;
      conta.usuario = u ? { uid: u.uid, nome: u.displayName || u.email, email: u.email, foto: u.photoURL } : null;
      if (u) { try { await abrirConta(u.uid); } catch (e) { conta.erro = e.message; } }
      else if (antes) limparDaConta();
      conta.pronto = true; avisar();
    });
    ganchos.aoSalvar = aoSalvar;
  } catch (e) { conta.erro = 'não foi possível iniciar a conta: ' + e.message; }
}

export async function entrar() {
  const { auth, a } = fb;
  const prov = new a.GoogleAuthProvider();
  prov.setCustomParameters({ prompt: 'select_account' });
  try { await a.signInWithPopup(auth, prov); }
  catch (e) { if (/popup/.test(e.code || '')) await a.signInWithRedirect(auth, prov); else throw e; }
}
export async function sair() {
  limparDaConta();
  await fb.a.signOut(fb.auth);
}

// ---------- Abrir a conta: junta o que está no aparelho com o que está na conta e passa a sincronizar ----------
const col = (uid, nome) => fb.f.collection(fb.db, 'usuarios', uid, nome);
const docu = (uid, nome, id) => fb.f.doc(fb.db, 'usuarios', uid, nome, id);
const limpo = o => { const { dono, grupo, ...r } = o; return JSON.parse(JSON.stringify(r)); };
const semMarcas = o => { const { dono, grupo, ...r } = o; return JSON.parse(JSON.stringify(r)); };
const marca = uid => ({ atualizadoEm: fb.f.serverTimestamp(), atualizadoPor: uid });
async function abrirConta(uid) {
  const { f } = fb;
  // o que for de outra conta (não deveria sobrar, mas por garantia) sai do aparelho
  estado.missas = estado.missas.filter(x => !x.dono || x.dono === uid);
  estado.minhas = estado.minhas.filter(m => !m.dono || m.dono === uid);
  const [ms, mu, ed, cf] = await Promise.all([f.getDocs(col(uid, 'missas')), f.getDocs(col(uid, 'musicas')), f.getDocs(col(uid, 'edicoes')), f.getDoc(docu(uid, 'config', 'preferencias'))]);
  const naConta = { missas: new Set(ms.docs.map(d => d.id)), musicas: new Set(mu.docs.map(d => d.id)), edicoes: new Set(ed.docs.map(d => d.id)) };
  // 1º login / aparelho novo: o que está só no aparelho (sem dono) vai para a conta
  let subiram = 0;
  const lote = f.writeBatch(fb.db);
  for (const x of estado.missas) if (!x.dono && !x.grupo && !naConta.missas.has(x.id)) { lote.set(docu(uid, 'missas', x.id), { ...limpo(x), ...marca(uid) }); subiram++; }
  for (const m of estado.minhas) if (!m.dono && !m.grupo && !naConta.musicas.has(m.chave)) { lote.set(docu(uid, 'musicas', m.chave), { ...limpo(m), ...marca(uid) }); subiram++; }
  for (const [k, e] of Object.entries(estado.edicoes)) if (!naConta.edicoes.has(k)) { lote.set(docu(uid, 'edicoes', k), { ...e, ...marca(uid) }); subiram++; }
  if (!cf.exists()) lote.set(docu(uid, 'config', 'preferencias'), { tons: estado.tons || {}, ...Object.fromEntries(PREFS_DA_CONTA.map(k => [k, estado.prefs[k] ?? null])), ...marca(uid) });
  if (subiram || !cf.exists()) await lote.commit();
  if (subiram) conta.aviso = `${subiram} ${subiram === 1 ? 'item que estava' : 'itens que estavam'} neste aparelho ${subiram === 1 ? 'foi guardado' : 'foram guardados'} na sua conta.`;
  assinar(uid);
  await abrirMinisterio(uid);
}

// ---------- Ministério ----------
const emailDe = () => (conta.usuario?.email || '').toLowerCase();
async function abrirMinisterio(uid) {
  const { f, db } = fb;
  let g = null;
  const us = await f.getDoc(f.doc(db, 'usuarios', uid));
  if (us.exists() && us.data().grupo) g = us.data().grupo;
  if (!g) {
    // cadastrado pelo coordenador? entra no ministério com o papel do cadastro
    const cad = await f.getDoc(f.doc(db, 'cadastros', emailDe())).catch(() => null);
    if (cad?.exists()) {
      const { grupo, papel, nomeGrupo } = cad.data();
      await f.setDoc(f.doc(db, 'grupos', grupo, 'membros', uid), { nome: conta.usuario.nome, email: emailDe(), papel, entrouEm: f.serverTimestamp() });
      await f.setDoc(f.doc(db, 'usuarios', uid), { grupo }, { merge: true });
      g = grupo;
      conta.aviso = [conta.aviso, `Você foi cadastrado no ministério ${nomeGrupo || ''}.`].filter(Boolean).join(' ');
    }
  }
  if (g) await entrarNoMinisterio(g);
}
async function entrarNoMinisterio(g) {
  const { f, db } = fb, uid = conta.usuario.uid;
  const [gd, md] = await Promise.all([f.getDoc(f.doc(db, 'grupos', g)), f.getDoc(f.doc(db, 'grupos', g, 'membros', uid))]);
  if (!gd.exists() || !md.exists()) { await f.setDoc(f.doc(db, 'usuarios', uid), { grupo: null }, { merge: true }).catch(() => {}); return; }
  Object.assign(conta, { grupo: g, grupoNome: gd.data().nome, papel: md.data().papel });
  // papel pode mudar; se o coordenador remover, sai do ministério
  assinaturas.push(f.onSnapshot(f.doc(db, 'grupos', g, 'membros', uid), d => {
    if (!d.exists()) { sairDoMinisterioLocal(); f.setDoc(f.doc(db, 'usuarios', uid), { grupo: null }, { merge: true }).catch(() => {}); return; }
    if (d.data().papel !== conta.papel) { conta.papel = d.data().papel; avisar(); }
  }));
  assinaturas.push(f.onSnapshot(f.collection(db, 'grupos', g, 'missas'), s => {
    const doMin = s.docs.map(d => { const x = { ...d.data(), id: d.id, grupo: g }; delete x.atualizadoEm; delete x.atualizadoPor; delete x.dono; enviadosMin.missas.set(d.id, JSON.stringify(semMarcas(x))); return x; });
    estado.missas = [...estado.missas.filter(x => x.grupo !== g), ...doMin];
    guardarNoAparelho(); window.dispatchEvent(new Event('missa-mudou')); avisar();
  }));
  assinaturas.push(f.onSnapshot(f.collection(db, 'grupos', g, 'musicas'), s => {
    const pessoais = new Set(estado.minhas.filter(m => !m.grupo).map(m => m.chave));
    const doMin = s.docs.map(d => { const m = { ...d.data(), chave: d.id, grupo: g }; delete m.atualizadoEm; delete m.atualizadoPor; delete m.dono; enviadosMin.musicas.set(d.id, JSON.stringify(semMarcas(m))); return m; })
      .filter(m => !pessoais.has(m.chave));                 // a do coordenador já está como pessoal
    estado.minhas = [...estado.minhas.filter(m => m.grupo !== g), ...doMin];
    guardarNoAparelho(); recarregarIndice(); avisar();
  }));
  avisar();
}
function sairDoMinisterioLocal() {
  estado.missas = estado.missas.filter(x => !x.grupo);
  estado.minhas = estado.minhas.filter(m => !m.grupo);
  Object.assign(conta, { grupo: null, grupoNome: '', papel: null });
  enviadosMin.missas.clear(); enviadosMin.musicas.clear();
  guardarNoAparelho(); recarregarIndice(); avisar(); window.dispatchEvent(new Event('missa-mudou'));
}
export async function criarMinisterio(nome) {
  const { db, f } = fb, uid = conta.usuario.uid;
  const g = f.doc(f.collection(db, 'grupos'));
  await f.setDoc(g, { nome, criadoPor: uid, criadoEm: f.serverTimestamp() });
  await f.setDoc(f.doc(db, 'grupos', g.id, 'membros', uid), { nome: conta.usuario.nome, email: emailDe(), papel: 'coordenador', entrouEm: f.serverTimestamp() });
  await f.setDoc(f.doc(db, 'usuarios', uid), { grupo: g.id }, { merge: true });
  await entrarNoMinisterio(g.id);
}
// coordenador cadastra um membro pelo e-mail Google (quando a pessoa entrar com esse e-mail, já cai no ministério)
export async function cadastrar(email, papel) {
  const { db, f } = fb;
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('e-mail inválido');
  await f.setDoc(f.doc(db, 'cadastros', email), { grupo: conta.grupo, nomeGrupo: conta.grupoNome, papel, cadastradoPor: conta.usuario.uid, criadoEm: f.serverTimestamp() });
}
export async function pessoasDoMinisterio() {
  const { db, f } = fb, g = conta.grupo;
  const [ms, cs] = await Promise.all([f.getDocs(f.collection(db, 'grupos', g, 'membros')), f.getDocs(f.query(f.collection(db, 'cadastros'), f.where('grupo', '==', g)))]);
  const membros = ms.docs.map(d => ({ uid: d.id, ...d.data() }));
  const emails = new Set(membros.map(m => (m.email || '').toLowerCase()));
  const pendentes = cs.docs.map(d => ({ email: d.id, ...d.data() })).filter(c => !emails.has(c.email));
  return { membros, pendentes };
}
export async function mudarPapel(uid, email, papel) {
  const { db, f } = fb;
  await f.updateDoc(f.doc(db, 'grupos', conta.grupo, 'membros', uid), { papel });
  if (email) await f.setDoc(f.doc(db, 'cadastros', email), { papel }, { merge: true }).catch(() => {});
}
export async function removerPessoa(uid, email) {
  const { db, f } = fb;
  if (uid) await f.deleteDoc(f.doc(db, 'grupos', conta.grupo, 'membros', uid));
  if (email) await f.deleteDoc(f.doc(db, 'cadastros', email)).catch(() => {});
}
export async function sairDoMinisterio() {
  const { db, f } = fb, uid = conta.usuario.uid, g = conta.grupo;
  await f.deleteDoc(f.doc(db, 'grupos', g, 'membros', uid)).catch(() => {});
  await f.deleteDoc(f.doc(db, 'cadastros', emailDe())).catch(() => {});
  await f.setDoc(f.doc(db, 'usuarios', uid), { grupo: null }, { merge: true });
  sairDoMinisterioLocal();
}
function assinar(uid) {
  const { f } = fb;
  assinaturas.push(f.onSnapshot(col(uid, 'missas'), s => {
    const daConta = s.docs.map(d => { const x = { ...d.data(), id: d.id, dono: uid }; delete x.atualizadoEm; delete x.atualizadoPor; enviados.missas.set(d.id, JSON.stringify(limpo(x))); return x; });
    estado.missas = [...estado.missas.filter(x => x.grupo || (x.dono !== uid && !daConta.some(y => y.id === x.id))), ...daConta];
    guardarNoAparelho(); window.dispatchEvent(new Event('missa-mudou')); avisar();
  }));
  assinaturas.push(f.onSnapshot(col(uid, 'musicas'), s => {
    const daConta = s.docs.map(d => { const m = { ...d.data(), chave: d.id, dono: uid }; delete m.atualizadoEm; delete m.atualizadoPor; enviados.musicas.set(d.id, JSON.stringify(limpo(m))); return m; });
    estado.minhas = [...estado.minhas.filter(m => (m.grupo && !daConta.some(y => y.chave === m.chave)) || (!m.grupo && m.dono !== uid && !daConta.some(y => y.chave === m.chave))), ...daConta];
    guardarNoAparelho(); recarregarIndice(); avisar();
  }));
  assinaturas.push(f.onSnapshot(col(uid, 'edicoes'), s => {
    estado.edicoes = Object.fromEntries(s.docs.map(d => { const e = d.data(); delete e.atualizadoEm; delete e.atualizadoPor; enviados.edicoes.set(d.id, JSON.stringify(e)); return [d.id, e]; }));
    guardarNoAparelho(); recarregarIndice(); avisar();
  }));
  assinaturas.push(f.onSnapshot(docu(uid, 'config', 'preferencias'), d => {
    if (!d.exists()) return;
    const c = d.data();
    estado.tons = c.tons || {};
    for (const k of PREFS_DA_CONTA) if (c[k] !== undefined && c[k] !== null) estado.prefs[k] = c[k];
    enviados.config = JSON.stringify(configAtual());
    guardarNoAparelho(); avisar();
  }));
}
function parar() { assinaturas.forEach(u => u()); assinaturas = []; Object.values(enviados).forEach(v => v.clear?.()); enviados.config = ''; enviadosMin.missas.clear(); enviadosMin.musicas.clear(); }
// ao sair: as coisas da conta saem deste aparelho (continuam na conta)
function limparDaConta() {
  parar();
  estado.missas = estado.missas.filter(x => !x.dono && !x.grupo);
  estado.minhas = estado.minhas.filter(m => !m.dono && !m.grupo);
  Object.assign(conta, { grupo: null, grupoNome: '', papel: null });
  estado.edicoes = {}; estado.tons = {};
  for (const k of PREFS_DA_CONTA) delete estado.prefs[k];
  if (estado.prefs.missaAtiva && !estado.missas.some(x => x.id === estado.prefs.missaAtiva)) estado.prefs.missaAtiva = null;
  guardarNoAparelho(); recarregarIndice(); avisar();
  window.dispatchEvent(new Event('missa-mudou'));
}

// ---------- O app salvou algo: manda para a conta ----------
const configAtual = () => ({ tons: estado.tons || {}, ...Object.fromEntries(PREFS_DA_CONTA.map(k => [k, estado.prefs[k] ?? null])) });
async function aoSalvar(tipo, arg) {
  const uid = conta.usuario?.uid;
  if (!uid || !fb) return;
  const { f } = fb;
  try {
    if (tipo === 'missas') {
      const pessoais = estado.missas.filter(x => !x.grupo);
      for (const x of pessoais) {
        if (x.dono && x.dono !== uid) continue;
        x.dono = uid;
        const dados = limpo(x), s = JSON.stringify(dados);
        if (enviados.missas.get(x.id) === s) continue;
        enviados.missas.set(x.id, s);
        await f.setDoc(docu(uid, 'missas', x.id), { ...dados, ...marca(uid) });
      }
      for (const id of [...enviados.missas.keys()]) if (!pessoais.some(x => x.id === id)) { enviados.missas.delete(id); await f.deleteDoc(docu(uid, 'missas', id)); }
      // ministério: só o coordenador grava; as cifras próprias usadas na missa vão junto (para todos conseguirem abrir)
      if (coordenador()) {
        const g = conta.grupo, doMin = estado.missas.filter(x => x.grupo === g);
        for (const x of doMin) {
          const dados = semMarcas(x), s = JSON.stringify(dados);
          if (enviadosMin.missas.get(x.id) !== s) { enviadosMin.missas.set(x.id, s); await f.setDoc(f.doc(fb.db, 'grupos', g, 'missas', x.id), { ...dados, ...marca(uid) }); }
          for (const it of x.itens || []) {
            const m = it.chave && estado.minhas.find(y => y.chave === it.chave && !y.grupo);
            if (!m) continue;
            const dm = semMarcas(m), sm = JSON.stringify(dm);
            if (enviadosMin.musicas.get(m.chave) !== sm) { enviadosMin.musicas.set(m.chave, sm); await f.setDoc(f.doc(fb.db, 'grupos', g, 'musicas', m.chave), { ...dm, ...marca(uid) }); }
          }
        }
        for (const id of [...enviadosMin.missas.keys()]) if (!doMin.some(x => x.id === id)) { enviadosMin.missas.delete(id); await f.deleteDoc(f.doc(fb.db, 'grupos', g, 'missas', id)); }
      }
    } else if (tipo === 'musica' && arg && !arg.grupo) {
      arg.dono = uid;
      const m = estado.minhas.find(x => x.chave === arg.chave); if (m) m.dono = uid;
      const dados = limpo(arg), s = JSON.stringify(dados);
      if (enviados.musicas.get(arg.chave) !== s) { enviados.musicas.set(arg.chave, s); await f.setDoc(docu(uid, 'musicas', arg.chave), { ...dados, ...marca(uid) }); }
    } else if (tipo === 'excluirMusica') {
      enviados.musicas.delete(arg); await f.deleteDoc(docu(uid, 'musicas', arg));
    } else if (tipo === 'edicao') {
      const e = estado.edicoes[arg];
      if (e && enviados.edicoes.get(arg) !== JSON.stringify(e)) { enviados.edicoes.set(arg, JSON.stringify(e)); await f.setDoc(docu(uid, 'edicoes', arg), { ...e, ...marca(uid) }); }
    } else if (tipo === 'desfazerEdicao') {
      enviados.edicoes.delete(arg); await f.deleteDoc(docu(uid, 'edicoes', arg));
    } else if (tipo === 'prefs' || tipo === 'tons') {
      const c = configAtual(), s = JSON.stringify(c);
      if (enviados.config !== s) { enviados.config = s; await f.setDoc(docu(uid, 'config', 'preferencias'), { ...c, ...marca(uid) }); }
    }
  } catch (e) { conta.erro = 'não foi possível guardar na conta: ' + e.message; avisar(); }
}

// ---------- Tela: Ajustes → Conta ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function cartaoConta() {
  const cab = '<h2 style="margin-top:0">Conta</h2>';
  if (!conta.ativa) return `<div class="cartao">${cab}<p class="pequeno suave">${conta.erro ? esc(conta.erro) : 'A conta não está disponível neste app. Tudo fica só neste aparelho.'}</p></div>`;
  if (!conta.pronto) return `<div class="cartao">${cab}<p class="pequeno suave">Carregando…</p></div>`;
  const u = conta.usuario;
  if (!u) return `<div class="cartao">${cab}
    <p class="pequeno suave">Entre com a sua conta Google para ter as suas missas, cifras, nomes editados e tons em qualquer aparelho. Cada conta é independente: ninguém vê as coisas de outra pessoa. O que já está neste aparelho vai para a sua conta no primeiro login.</p>
    <button class="btn primario" data-conta="entrar">Entrar com Google</button>
    ${conta.erro ? `<p class="pequeno" style="color:var(--perigo,#b00020)">${esc(conta.erro)}</p>` : ''}</div>`;
  return `<div class="cartao">${cab}
    <p>${u.foto ? `<img src="${esc(u.foto)}" alt="" width="28" height="28" style="border-radius:50%;vertical-align:middle;margin-right:6px">` : ''}<b>${esc(u.nome)}</b> <span class="pequeno suave">${esc(u.email)}</span></p>
    <p class="pequeno suave">Suas missas, cifras, nomes editados, tons, paróquia e instrumento ficam guardados na sua conta e aparecem em qualquer aparelho em que você entrar. Os folhetos continuam só no aparelho.</p>
    ${conta.aviso ? `<p class="pequeno">✓ ${esc(conta.aviso)}</p>` : ''}
    <button class="btn" data-conta="sair">Sair da conta</button>
    ${conta.erro ? `<p class="pequeno" style="color:var(--perigo,#b00020)">${esc(conta.erro)}</p>` : ''}</div>`;
}
export function cartaoMinisterio() {
  if (!conta.ativa || !conta.pronto || !conta.usuario) return '';
  const cab = '<h2 style="margin-top:0">Ministério (opcional)</h2>';
  if (!conta.grupo) return `<div class="cartao">${cab}
    <p class="pequeno suave">Para o ministério de música usar as mesmas missas: o coordenador cria o ministério e cadastra cada membro pelo e-mail Google. Quem foi cadastrado entra no ministério sozinho, ao entrar na conta.</p>
    <div class="barra"><input type="text" id="nome-min" placeholder="Nome (ex.: Ministério de Música Santa Rita)" style="flex:1;min-width:220px"><button class="btn primario" data-conta="criarmin">Criar ministério</button></div></div>`;
  return `<div class="cartao">${cab}
    <p>Ministério: <b>${esc(conta.grupoNome)}</b> · você é <b>${conta.papel === 'coordenador' ? 'coordenador' : 'membro (músico)'}</b></p>
    ${coordenador() ? `
      <p class="pequeno suave">Cadastre cada pessoa pelo e-mail da conta Google dela. Músico vê, toca e apresenta as missas do ministério; coordenador também monta e muda.</p>
      <div class="barra"><input type="email" id="email-cad" placeholder="e-mail Google da pessoa" style="flex:1;min-width:200px">
        <select id="papel-cad"><option value="musico">músico</option><option value="coordenador">coordenador</option></select>
        <button class="btn primario" data-conta="cadastrar">Cadastrar</button></div>
      <div id="pessoas"><button class="btn peq" data-conta="pessoas">Ver pessoas</button></div>`
    : '<p class="pequeno suave">As missas do ministério aparecem em Missas. Só o coordenador muda; para mexer, use Duplicar (fica uma cópia sua).</p>'}
    <button class="btn peq perigo" data-conta="sairmin">Sair do ministério</button></div>`;
}
export async function acaoConta(b, raiz, redesenhar) {
  conta.erro = '';
  try {
    const a = b.dataset.conta;
    if (a === 'entrar') await entrar();
    if (a === 'sair' && confirm('Sair da conta? As suas missas e cifras saem deste aparelho, mas continuam guardadas na sua conta.')) { conta.aviso = ''; await sair(); }
    if (a === 'criarmin') { const n = raiz.querySelector('#nome-min').value.trim(); if (!n) throw new Error('dê um nome ao ministério'); await criarMinisterio(n); }
    if (a === 'cadastrar') { await cadastrar(raiz.querySelector('#email-cad').value, raiz.querySelector('#papel-cad').value); conta.aviso = 'Pessoa cadastrada: ao entrar com esse e-mail, ela já cai no ministério.'; }
    if (a === 'sairmin' && confirm('Sair do ministério? As missas do ministério saem deste aparelho.')) await sairDoMinisterio();
    if (a === 'pessoas') {
      const { membros, pendentes } = await pessoasDoMinisterio();
      const linha = (nome, email, papel, uid) => `<li><b>${esc(nome || email)}</b> <span class="suave">${esc(email || '')}</span> · ${papel === 'coordenador' ? 'coordenador' : 'músico'}${uid ? '' : ' <span class="suave">(ainda não entrou)</span>'}
        ${uid !== conta.usuario.uid ? ` <button class="btn peq" data-conta="papel" data-uid="${uid || ''}" data-email="${esc(email || '')}" data-papel="${papel === 'coordenador' ? 'musico' : 'coordenador'}">${papel === 'coordenador' ? 'Tornar músico' : 'Tornar coordenador'}</button> <button class="btn peq perigo" data-conta="remover" data-uid="${uid || ''}" data-email="${esc(email || '')}">Remover</button>` : ''}</li>`;
      raiz.querySelector('#pessoas').innerHTML = `<ul class="pequeno" style="padding-left:1.2em">${membros.map(m => linha(m.nome, m.email, m.papel, m.uid)).join('')}${pendentes.map(c => linha('', c.email, c.papel, '')).join('')}</ul>`;
      return;
    }
    if (a === 'papel') { if (b.dataset.uid) await mudarPapel(b.dataset.uid, b.dataset.email, b.dataset.papel); else await cadastrar(b.dataset.email, b.dataset.papel); }
    if (a === 'remover' && confirm('Remover esta pessoa do ministério?')) await removerPessoa(b.dataset.uid, b.dataset.email);
  } catch (e) { conta.erro = e.message; }
  redesenhar();
}
