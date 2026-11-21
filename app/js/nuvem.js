// Conta e grupo (Firebase): entrar com Google, criar um grupo (ministério) ou entrar nele com o código de convite.
// No grupo ficam as MISSAS, as CIFRAS COLOCADAS (e personalizadas) e os NOMES EDITADOS; o coordenador edita, os músicos
// veem e tocam. Funciona sem internet (cache do Firestore no aparelho) e sincroniza quando a conexão volta.
// Fica só no aparelho: tom preferido de cada um, preferências, folhetos (assinatura). Sem conta, o app é como antes.
import { estado, ganchos, recarregarIndice, guardarNoAparelho } from './dados.js';
import { firebaseConfig } from './firebase-config.js';

export const conta = { ativa: false, usuario: null, grupo: null, grupoNome: '', codigo: '', papel: null, pronto: false, erro: '' };
export const coordenador = () => !!conta.grupo && conta.papel === 'coordenador';
let fb = null;            // { auth, db, f: funções do Firestore, a: funções do Auth }
let assinaturas = [];
const enviadas = { missas: new Map(), musicas: new Map(), edicoes: new Map() };   // último conteúdo enviado/recebido (evita eco)
const avisar = () => window.dispatchEvent(new Event('nuvem-mudou'));

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
      conta.usuario = u ? { uid: u.uid, nome: u.displayName || u.email, email: u.email, foto: u.photoURL } : null;
      parar();
      Object.assign(conta, { grupo: null, grupoNome: '', codigo: '', papel: null });
      if (u) {
        try {
          const us = await f.getDoc(f.doc(db, 'usuarios', u.uid));
          if (us.exists() && us.data().grupo) await abrirGrupo(us.data().grupo);
        } catch (e) { conta.erro = e.message; }
      }
      conta.pronto = true; avisar();
    });
    ganchos.aoSalvar = aoSalvar;
  } catch (e) { conta.erro = 'não foi possível iniciar a conta: ' + e.message; }
}

// ---------- Entrar / sair ----------
export async function entrar() {
  const { auth, a } = fb;
  const prov = new a.GoogleAuthProvider();
  try { await a.signInWithPopup(auth, prov); }
  catch (e) { if (/popup/.test(e.code || '')) await a.signInWithRedirect(auth, prov); else throw e; }
}
export const sair = () => fb.a.signOut(fb.auth);

// ---------- Grupo ----------
const gerarCodigo = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
export async function criarGrupo(nome) {
  const { db, f } = fb, u = conta.usuario;
  const g = f.doc(f.collection(db, 'grupos'));
  const codigo = gerarCodigo();
  await f.setDoc(g, { nome, criadoPor: u.uid, criadoEm: f.serverTimestamp(), codigo });
  await f.setDoc(f.doc(db, 'grupos', g.id, 'membros', u.uid), { nome: u.nome, email: u.email, papel: 'coordenador', entrouEm: f.serverTimestamp() });
  await f.setDoc(f.doc(db, 'convites', codigo), { grupo: g.id, criadoPor: u.uid });
  await f.setDoc(f.doc(db, 'usuarios', u.uid), { grupo: g.id }, { merge: true });
  await abrirGrupo(g.id); avisar();
}
export async function entrarNoGrupo(codigo) {
  const { db, f } = fb, u = conta.usuario;
  codigo = codigo.trim().toUpperCase();
  const c = await f.getDoc(f.doc(db, 'convites', codigo));
  if (!c.exists()) throw new Error('código não encontrado');
  const g = c.data().grupo;
  await f.setDoc(f.doc(db, 'grupos', g, 'membros', u.uid), { nome: u.nome, email: u.email, papel: 'musico', convite: codigo, entrouEm: f.serverTimestamp() });
  await f.setDoc(f.doc(db, 'usuarios', u.uid), { grupo: g }, { merge: true });
  await abrirGrupo(g); avisar();
}
export async function sairDoGrupo() {
  const { db, f } = fb, u = conta.usuario, g = conta.grupo;
  parar();
  await f.setDoc(f.doc(db, 'usuarios', u.uid), { grupo: null }, { merge: true });
  try { await f.deleteDoc(f.doc(db, 'grupos', g, 'membros', u.uid)); } catch { /* coordenador único pode não sair */ }
  Object.assign(conta, { grupo: null, grupoNome: '', codigo: '', papel: null });
  limparDoGrupo(); avisar();
}
export async function membros() {
  const { db, f } = fb;
  const s = await f.getDocs(f.collection(db, 'grupos', conta.grupo, 'membros'));
  return s.docs.map(d => ({ uid: d.id, ...d.data() }));
}
export const mudarPapel = (uid, papel) => fb.f.updateDoc(fb.f.doc(fb.db, 'grupos', conta.grupo, 'membros', uid), { papel });
export const removerMembro = uid => fb.f.deleteDoc(fb.f.doc(fb.db, 'grupos', conta.grupo, 'membros', uid));

async function abrirGrupo(g) {
  const { db, f } = fb, u = conta.usuario;
  const [gd, md] = await Promise.all([f.getDoc(f.doc(db, 'grupos', g)), f.getDoc(f.doc(db, 'grupos', g, 'membros', u.uid))]);
  if (!gd.exists() || !md.exists()) return;
  Object.assign(conta, { grupo: g, grupoNome: gd.data().nome, codigo: gd.data().codigo || '', papel: md.data().papel });
  assinar(g);
}

// ---------- Sincronização ----------
const semLocal = o => { const { grupo, ...r } = o; return JSON.parse(JSON.stringify(r)); };
const igual = (mapa, id, dados) => mapa.get(id) === JSON.stringify(dados);
function assinar(g) {
  const { db, f } = fb;
  parar();
  // membro: papel pode mudar (promovido a coordenador)
  assinaturas.push(f.onSnapshot(f.doc(db, 'grupos', g, 'membros', conta.usuario.uid), d => { if (d.exists() && d.data().papel !== conta.papel) { conta.papel = d.data().papel; avisar(); } }));
  assinaturas.push(f.onSnapshot(f.collection(db, 'grupos', g, 'missas'), s => {
    const doGrupo = s.docs.map(d => { const x = { ...d.data(), id: d.id, grupo: g }; delete x.atualizadoEm; delete x.atualizadoPor; enviadas.missas.set(d.id, JSON.stringify(semLocal(x))); return x; });
    estado.missas = [...estado.missas.filter(x => x.grupo !== g), ...doGrupo];
    guardarNoAparelho(); window.dispatchEvent(new Event('missa-mudou')); avisar();
  }));
  assinaturas.push(f.onSnapshot(f.collection(db, 'grupos', g, 'musicas'), s => {
    const doGrupo = s.docs.map(d => { const m = { ...d.data(), chave: d.id, grupo: g }; delete m.atualizadoEm; enviadas.musicas.set(d.id, JSON.stringify(semLocal(m))); return m; });
    estado.minhas = [...estado.minhas.filter(m => m.grupo !== g), ...doGrupo];
    guardarNoAparelho(); recarregarIndice(); avisar();
  }));
  assinaturas.push(f.onSnapshot(f.collection(db, 'grupos', g, 'edicoes'), s => {
    estado.edicoesGrupo = Object.fromEntries(s.docs.map(d => { const e = d.data(); delete e.atualizadoEm; enviadas.edicoes.set(d.id, JSON.stringify(e)); return [d.id, e]; }));
    recarregarIndice(); avisar();
  }));
}
function parar() { assinaturas.forEach(u => u()); assinaturas = []; }
function limparDoGrupo() {
  estado.missas = estado.missas.filter(x => !x.grupo);
  estado.minhas = estado.minhas.filter(m => !m.grupo);
  estado.edicoesGrupo = {};
  guardarNoAparelho(); recarregarIndice();
}

// o app salvou algo: se for do grupo e eu for coordenador, manda para a nuvem
async function aoSalvar(tipo, arg) {
  if (!coordenador() || !fb) return;
  const { db, f } = fb, g = conta.grupo, uid = conta.usuario.uid;
  const marca = { atualizadoEm: f.serverTimestamp(), atualizadoPor: uid };
  try {
    if (tipo === 'missas') {
      const atuais = estado.missas.filter(x => x.grupo === g);
      for (const x of atuais) {
        const dados = semLocal(x);
        if (igual(enviadas.missas, x.id, dados)) continue;
        enviadas.missas.set(x.id, JSON.stringify(dados));
        await f.setDoc(f.doc(db, 'grupos', g, 'missas', x.id), { ...dados, ...marca });
      }
      for (const id of [...enviadas.missas.keys()]) if (!atuais.some(x => x.id === id)) { enviadas.missas.delete(id); await f.deleteDoc(f.doc(db, 'grupos', g, 'missas', id)); }
    } else if (tipo === 'musica' && arg?.grupo === g) {
      const dados = semLocal(arg);
      if (!igual(enviadas.musicas, arg.chave, dados)) { enviadas.musicas.set(arg.chave, JSON.stringify(dados)); await f.setDoc(f.doc(db, 'grupos', g, 'musicas', arg.chave), { ...dados, ...marca }); }
    } else if (tipo === 'excluirMusica' && enviadas.musicas.has(arg)) {
      enviadas.musicas.delete(arg); await f.deleteDoc(f.doc(db, 'grupos', g, 'musicas', arg));
    } else if (tipo === 'edicao') {
      const e = estado.edicoes[arg];
      if (e && !igual(enviadas.edicoes, arg, e)) { enviadas.edicoes.set(arg, JSON.stringify(e)); await f.setDoc(f.doc(db, 'grupos', g, 'edicoes', arg), { ...e, ...marca }); }
    } else if (tipo === 'desfazerEdicao') {
      enviadas.edicoes.delete(arg); await f.deleteDoc(f.doc(db, 'grupos', g, 'edicoes', arg));
    }
  } catch (e) { conta.erro = 'não foi possível enviar ao grupo: ' + e.message; avisar(); }
}

// ---------- Tela: Ajustes → Conta e grupo ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function cartaoConta() {
  if (!conta.ativa) return `<div class="cartao"><h2 style="margin-top:0">Conta e grupo</h2><p class="pequeno suave">${conta.erro ? esc(conta.erro) : 'A conta ainda não foi configurada neste app (Firebase). Enquanto isso, tudo fica só neste aparelho.'}</p></div>`;
  if (!conta.pronto) return '<div class="cartao"><h2 style="margin-top:0">Conta e grupo</h2><p class="pequeno suave">Carregando…</p></div>';
  const u = conta.usuario;
  if (!u) return `<div class="cartao"><h2 style="margin-top:0">Conta e grupo</h2>
    <p class="pequeno suave">Entre com a sua conta Google para usar as missas e cifras do seu grupo (ministério de música) em qualquer aparelho.</p>
    <button class="btn primario" data-conta="entrar">Entrar com Google</button></div>`;
  return `<div class="cartao"><h2 style="margin-top:0">Conta e grupo</h2>
    <p>${u.foto ? `<img src="${esc(u.foto)}" alt="" width="28" height="28" style="border-radius:50%;vertical-align:middle;margin-right:6px">` : ''}<b>${esc(u.nome)}</b> <span class="pequeno suave">${esc(u.email)}</span>
      <button class="btn peq" data-conta="sair" style="margin-left:8px">Sair</button></p>
    ${conta.grupo ? `
      <p>Grupo: <b>${esc(conta.grupoNome)}</b> · você é <b>${conta.papel === 'coordenador' ? 'coordenador' : 'músico'}</b></p>
      ${coordenador() ? `<p class="pequeno">Código de convite: <b style="font-size:1.3em;letter-spacing:.12em">${esc(conta.codigo)}</b> <button class="btn peq" data-conta="copiar">Copiar</button><br><span class="suave">Quem entrar com esse código fica como músico (vê e toca). Você pode promover a coordenador.</span></p>
        <div id="membros"><button class="btn peq" data-conta="membros">Ver membros</button></div>` : '<p class="pequeno suave">As missas e cifras do grupo aparecem sozinhas; só o coordenador muda.</p>'}
      <button class="btn peq perigo" data-conta="sairgrupo">Sair do grupo</button>`
    : `<p class="pequeno suave">Você ainda não está num grupo.</p>
      <div class="barra"><input type="text" id="nome-grupo" placeholder="Nome do grupo (ex.: Ministério de Música Santa Rita)" style="flex:1;min-width:200px"><button class="btn primario" data-conta="criar">Criar grupo</button></div>
      <div class="barra"><input type="text" id="codigo-grupo" placeholder="Código de convite" style="text-transform:uppercase;width:12em"><button class="btn" data-conta="entrargrupo">Entrar no grupo</button></div>`}
    ${conta.erro ? `<p class="pequeno" style="color:var(--perigo,#b00020)">${esc(conta.erro)}</p>` : ''}</div>`;
}
export async function acaoConta(b, raiz, redesenhar) {
  conta.erro = '';
  try {
    const a = b.dataset.conta;
    if (a === 'entrar') await entrar();
    if (a === 'sair') await sair();
    if (a === 'criar') { const n = raiz.querySelector('#nome-grupo').value.trim(); if (!n) throw new Error('dê um nome ao grupo'); await criarGrupo(n); }
    if (a === 'entrargrupo') { const c = raiz.querySelector('#codigo-grupo').value.trim(); if (!c) throw new Error('digite o código'); await entrarNoGrupo(c); }
    if (a === 'sairgrupo' && confirm('Sair do grupo? As missas e cifras do grupo saem deste aparelho.')) await sairDoGrupo();
    if (a === 'copiar') await navigator.clipboard.writeText(conta.codigo).catch(() => {});
    if (a === 'membros') {
      const ms = await membros();
      raiz.querySelector('#membros').innerHTML = `<ul class="pequeno" style="padding-left:1.2em">${ms.map(m => `<li><b>${esc(m.nome)}</b> <span class="suave">${esc(m.email)}</span> · ${m.papel}
        ${m.uid !== conta.usuario.uid ? `<button class="btn peq" data-conta="papel" data-uid="${m.uid}" data-papel="${m.papel === 'coordenador' ? 'musico' : 'coordenador'}">${m.papel === 'coordenador' ? 'Tornar músico' : 'Tornar coordenador'}</button> <button class="btn peq perigo" data-conta="remover" data-uid="${m.uid}">Remover</button>` : ''}</li>`).join('')}</ul>`;
      return;
    }
    if (a === 'papel') { await mudarPapel(b.dataset.uid, b.dataset.papel); b.closest('#membros').innerHTML = '<button class="btn peq" data-conta="membros">Ver membros</button>'; }
    if (a === 'remover' && confirm('Remover esta pessoa do grupo?')) { await removerMembro(b.dataset.uid); b.closest('li').remove(); return; }
  } catch (e) { conta.erro = e.message; }
  redesenhar();
}

// o que for criado agora (missa, cifra) é do grupo quando quem cria é o coordenador
ganchos.grupoNovo = () => (coordenador() ? conta.grupo : null);
