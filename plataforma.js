/* Capacidades locais do site. Os bancos de frases só são lidos de bancos/*.js quando o site roda no próprio PC (127.0.0.1/localhost);
   o build publicável (--publico) não os inclui. */
(() => {
  "use strict";
  const COLS = ["mascaras", "frases", "correcoes", "comandos", "macros", "regras", "exemplos", "dicionario", "casos", "historico", "treino", "config", "bancoNT"];
  const BANKS = ["bank_tc", "bank_nt", "bank_tc_meta", "bank_nt_meta"];
  const listeners = new Set();
  const clone = value => value === undefined ? undefined : structuredClone(value);
  // Sincronização (109-v2-sync.js): cada escrita local deixa um carimbo em "_meta/<col>/<id>" (data + apagado = tombstone).
  // Chaves que começam com "_" nunca entram em coleção nem em backup. Config de máquina não sincroniza.
  const LOCAL_CFG = /^(abas-v2|vocab-v3|local-.*)$/;
  const syncable = (col, id) => col !== "bancoNT" && !(col === "config" && LOCAL_CFG.test(id));
  let lastStamp = 0;
  const nowIso = () => { let t = Date.now(); if (t <= lastStamp) t = lastStamp + 1; lastStamp = t; return new Date(t).toISOString(); };
  const hooks = [];
  const changed = (col, id) => { if (syncable(col, id)) for (const f of hooks) { try{ f(col, id); }catch(e){} } };
  const stampPut = (store, col, id) => { if (syncable(col, id)) store.put({ atualizado: nowIso(), apagado: false }, "_meta/" + col + "/" + id); };
  const ready = new Promise((resolve, reject) => {
    const req = indexedDB.open("laudos-tutu-site", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("documentos");
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(new Error("Não foi possível abrir o banco local. Permita o armazenamento neste navegador."));
    req.onblocked = () => reject(new Error("Feche outras abas do Laudos para abrir o banco local."));
  });
  async function transaction(mode, action){
    const connection = await ready;
    return new Promise((resolve, reject) => {
      const tx = connection.transaction("documentos", mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Não foi possível salvar no banco local."));
      try{ result = action(tx.objectStore("documentos")); }
      catch(e){ tx.abort(); reject(e); }
    });
  }
  async function readAll(){
    let keys, values;
    await transaction("readonly", store => {
      store.getAllKeys().onsuccess = e => keys = e.target.result;
      store.getAll().onsuccess = e => values = e.target.result;
    });
    return keys.map((key, i) => [key, values[i]]);
  }
  function docSnapshot(id, value){
    return { id, exists: value !== undefined, data: () => clone(value) };
  }
  function checkCol(col){
    if (!COLS.includes(col)) throw new Error("Coleção local desconhecida.");
  }
  async function notify(col){
    await Promise.all([...listeners].filter(s => !col || s.col === col).map(s => s.emit()));
  }
  function query(col, filters = [], order = null, maximum = null){
    checkCol(col);
    const get = async () => {
      let rows = (await readAll()).filter(([key]) => key.startsWith(col + "/"))
        .map(([key, value]) => docSnapshot(key.slice(col.length + 1), value));
      for (const [field, op, value] of filters) rows = rows.filter(d => {
        const x = d.data()[field];
        return op === "<" ? x < value : op === ">" ? x > value : x === value;
      });
      if (order) rows.sort((a, b) => {
        const x = a.data()[order[0]] ?? "", y = b.data()[order[0]] ?? "";
        return (x < y ? -1 : x > y ? 1 : a.id.localeCompare(b.id)) * (order[1] === "desc" ? -1 : 1);
      });
      if (maximum !== null) rows = rows.slice(0, maximum);
      return { docs: rows, size: rows.length, empty: !rows.length };
    };
    return {
      get,
      where(field, op, value){
        if (!["<", ">", "=="].includes(op)) throw new Error("Filtro local não suportado.");
        return query(col, [...filters, [field, op, value]], order, maximum);
      },
      orderBy: (field, dir) => query(col, filters, [field, dir], maximum),
      limit: n => query(col, filters, order, n),
      async add(value){ const id = crypto.randomUUID(); await db.doc(col + "/" + id).set(value); return { id }; },
      onSnapshot(callback, onError = () => {}){
        let active = true;
        const sub = { col, async emit(){
          try{ const snapshot = await get(); if (active) callback(snapshot); }
          catch(e){ if (active) onError(e); }
        } };
        listeners.add(sub); sub.emit();
        return () => { active = false; listeners.delete(sub); };
      }
    };
  }
  const db = {
    collection: col => query(col),
    doc(path){
      const [col, id, extra] = path.split("/"); checkCol(col);
      if (!id || extra !== undefined) throw new Error("Identificador local inválido.");
      const write = async (value, merge, update = false) => {
        await transaction("readwrite", store => {
          if (!merge){ store.put(clone(value), path); stampPut(store, col, id); return; }
          store.get(path).onsuccess = e => {
            if (update && e.target.result === undefined){ e.target.transaction.abort(); return; }
            store.put({ ...e.target.result, ...clone(value) }, path); stampPut(store, col, id);
          };
        });
        await notify(col); changed(col, id);
      };
      return {
        async get(){
          let value;
          await transaction("readonly", store => { store.get(path).onsuccess = e => value = e.target.result; });
          return docSnapshot(id, value);
        },
        set: (value, options) => write(value, options?.merge),
        update: value => write(value, true, true),
        async delete(){
          await transaction("readwrite", store => {
            store.delete(path);
            if (syncable(col, id)) store.put({ atualizado: nowIso(), apagado: true }, "_meta/" + col + "/" + id);
          });
          await notify(col); changed(col, id);
        }
      };
    }
  };
  async function sample(input, options = {}){
    const texto = typeof input === "string" ? input : input.map(m => `${m.role}: ${m.content}`).join("\n\n");
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const timeout = setTimeout(abort, 120000);
    try{
      const response = await fetch("http://127.0.0.1:47831/ia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, modelTier: options.modelTier || "balanced" }), signal: controller.signal
      });
      if (!response.ok) throw new Error("Ponte local respondeu com erro.");
      const result = await response.json();
      const text = typeof result === "string" ? result : (result.text ?? result.texto);
      if (typeof text !== "string" || !text.trim()) throw new Error("Resposta vazia da ponte local.");
      options.onText?.({ text });
      return { text, truncated: Boolean(result.truncated) };
    }catch(e){
      if (options.signal?.aborted) throw new DOMException("Pedido cancelado.", "AbortError");
      const error = new Error("Ponte local indisponível. Abra a ponte em 127.0.0.1:47831 para usar IA. As funções locais continuam disponíveis.");
      error.code = "ponte_indisponivel"; throw error;
    }finally{ clearTimeout(timeout); options.signal?.removeEventListener("abort", abort); }
  }
  sample.json = async (input, options) => {
    const { text } = await sample(input, options);
    try{ return JSON.parse(text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")); }
    catch(e){ throw new Error("A ponte local devolveu JSON inválido. Tente novamente."); }
  };
  const downloads = { async save({ filename, data, mimeType = "application/json" }){
    const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } };
  window.claude = { async use(name){
    if (name === "db"){ await ready; return db; }
    if (name === "sample") return sample;
    if (name === "downloads") return downloads;
    if (name === "permissions") return { state: () => "unavailable" };
    return null; // Notion/MCP indisponível: o módulo compartilhado mantém a cópia salva.
  } };
  function validateBackup(backup){
    if (!backup || backup.app !== "Laudos" || ![1, 2].includes(backup.versao) || !backup.dados || Array.isArray(backup.dados)) throw new Error("Formato de backup inválido.");
    const writes = [];
    for (const [col, docs] of Object.entries(backup.dados)){
      checkCol(col);
      if (!Array.isArray(docs)) throw new Error("Coleção inválida no backup.");
      const ids = new Set();
      for (const entry of docs){
        if (!entry || typeof entry.id !== "string" || !entry.id || entry.id.includes("/") || ids.has(entry.id)) throw new Error("Documento inválido ou duplicado no backup.");
        ids.add(entry.id);
        const { id, ...legacy } = entry;
        const value = backup.versao === 2 ? entry.data : legacy;
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Campos de documento inválidos no backup.");
        writes.push([col + "/" + id, value]);
      }
    }
    if (backup.bancos){
      for (const name of BANKS){
        const value = backup.bancos[name];
        if (name.endsWith("_meta")){
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Metadados de banco inválidos.");
        } else if (!Array.isArray(value) || value.some(e => !Array.isArray(e) || e.length < 4 || e.some(v => typeof v !== "string"))) throw new Error("Banco de frases inválido.");
        writes.push(["_bancos/" + name, value]);
      }
    } else if (backup.versao === 2) throw new Error("Backup sem bancos de frases.");
    return writes;
  }
  async function importBackup(backup){
    const writes = validateBackup(backup); // Valida tudo antes de iniciar uma única transação atômica.
    const cols = new Set();
    await transaction("readwrite", store => {
      for (const [key, value] of writes){
        store.put(clone(value), key);
        const [col, id] = key.split("/");
        if (col !== "_bancos" && syncable(col, id)){ store.put({ atualizado: nowIso(), apagado: false }, "_meta/" + key); cols.add(col + "/" + id); }
      }
    });
    await notify();
    for (const k of cols) changed(...k.split("/"));
    return writes.filter(([key]) => !key.startsWith("_bancos/")).length;
  }
  async function exportBackup(){
    const dados = Object.fromEntries(COLS.map(c => [c, []]));
    const bancos = { bank_tc: [], bank_nt: [], bank_tc_meta: {}, bank_nt_meta: {} };
    for (const [key, value] of await readAll()){
      const [col, id] = key.split("/");
      if (col === "_bancos") bancos[id] = value;
      else if (col.startsWith("_")) continue;   // _meta, _sync, _gh, _cfg: nunca no backup (a chave do GitHub fica de fora)
      else { checkCol(col); dados[col].push({ id, data: value }); }
    }
    return { app: "Laudos", versao: 2, dados, bancos };
  }
  // Mescla entradas de banco [grupo, seção, título, texto] sem repetir frases (grupo/seção/título + texto sem acento).
  // As entradas já existentes não mudam; de cada entrada nova entram só as frases que faltam (como entrada própria).
  const foldLine = v => String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  function mergeBank(base, extra){
    const out = (base || []).map(e => e.slice()), seen = new Set();
    let added = 0, dup = 0;
    const keyOf = e => e[0] + "|" + e[1] + "|" + e[2];
    for (const e of out) for (const line of e[3].split("\n")) seen.add(keyOf(e) + "|" + foldLine(line));
    for (const e of extra || []){
      if (!Array.isArray(e) || e.length < 4) continue;
      const fresh = [];
      for (const raw of String(e[3]).split("\n")){
        const line = raw.trim(); if (!line) continue;
        const sk = keyOf(e) + "|" + foldLine(line);
        if (seen.has(sk)){ dup++; continue; }
        seen.add(sk); added++; fresh.push(line);
      }
      if (fresh.length) out.push([e[0], e[1], e[2], fresh.join("\n"), ...e.slice(4)]);
    }
    return { entries: out, added, dup };
  }
  async function saveBankNT(entries, meta){
    await transaction("readwrite", store => { store.put(clone(entries), "_bancos/bank_nt"); store.put(clone(meta), "_bancos/bank_nt_meta"); });
  }
  // ---- armazenamento auxiliar da sincronização (chaves "_..." do IndexedDB; nunca em coleção nem em backup) ----
  const kvGet = async key => { let v; await transaction("readonly", s => { s.get(key).onsuccess = e => v = e.target.result; }); return v; };
  const kvSet = async (key, value) => { await transaction("readwrite", s => { s.put(clone(value), key); }); };
  const kvDel = async key => { await transaction("readwrite", s => { s.delete(key); }); };
  const rangeOf = prefix => IDBKeyRange.bound(prefix, prefix + "￿");
  // {id: {has, data, atualizado|null, apagado}} das coleções sincronizáveis; atualizado null = nunca carimbado.
  async function listCol(col){
    let dk, dv, mk, mv;
    await transaction("readonly", store => {
      store.getAllKeys(rangeOf(col + "/")).onsuccess = e => dk = e.target.result;
      store.getAll(rangeOf(col + "/")).onsuccess = e => dv = e.target.result;
      store.getAllKeys(rangeOf("_meta/" + col + "/")).onsuccess = e => mk = e.target.result;
      store.getAll(rangeOf("_meta/" + col + "/")).onsuccess = e => mv = e.target.result;
    });
    const out = {};
    dk.forEach((k, i) => { const id = k.slice(col.length + 1); if (syncable(col, id)) out[id] = { has: true, data: dv[i], atualizado: null, apagado: false }; });
    mk.forEach((k, i) => {
      const id = k.slice(col.length + 7); if (!syncable(col, id)) return;
      const o = out[id] || (out[id] = { has: false, data: undefined });
      o.atualizado = mv[i].atualizado; o.apagado = !!mv[i].apagado;
      if (o.apagado && o.has) { o.has = false; o.data = undefined; }
    });
    for (const id of Object.keys(out)) if (!out[id].has && !out[id].apagado) delete out[id];
    return out;
  }
  // Grava o que veio do GitHub sem disparar a fila de envio. `expect` = carimbo local visto na leitura: se mudou
  // no meio do ciclo (o médico editou), o item é ignorado e o próximo ciclo resolve.
  async function applyRemote(col, items){   // devolve quantos itens foram ignorados por edição simultânea
    if (!items.length) return 0;
    let ignorados = 0;
    await transaction("readwrite", store => {
      for (const it of items){
        const mk = "_meta/" + col + "/" + it.id;
        store.get(mk).onsuccess = e => {
          const cur = e.target.result;
          if ((cur ? cur.atualizado : null) !== it.expect){ ignorados++; return; }
          if (it.apagado) store.delete(col + "/" + it.id); else store.put(clone(it.data), col + "/" + it.id);
          store.put({ atualizado: it.atualizado, apagado: !!it.apagado }, mk);
        };
      }
    });
    await notify(col);
    return ignorados;
  }
  async function setMetas(col, items){   // carimba docs antigos (sem carimbo) que subiram agora
    await transaction("readwrite", store => {
      for (const it of items){
        const mk = "_meta/" + col + "/" + it.id;
        store.get(mk).onsuccess = e => { if (!e.target.result) store.put({ atualizado: it.atualizado, apagado: false }, mk); };
      }
    });
  }
  const sync = { onChange: f => { hooks.push(f); }, syncable, nowIso, kvGet, kvSet, kvDel, listCol, applyRemote, setMetas, notify,
    COLS: COLS.filter(c => c !== "bancoNT") };

  // ---- cliente da API REST do GitHub (repo privado de dados) ----
  const GH_REPO = "arturaragao/laudos-tutu-dados", GH_API = "https://api.github.com";
  const gh = { repo: GH_REPO, token: "" };
  const ghErr = (msg, status, extra) => Object.assign(new Error(msg), { status, ...extra });
  const b64 = s => { const b = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
  const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, "")), c => c.charCodeAt(0)));
  async function ghFetch(path, { method = "GET", body, raw = false } = {}){
    if (!gh.token) throw ghErr("Sem chave do GitHub.", 0, { semChave: true });
    try{
      return await fetch(GH_API + "/repos/" + GH_REPO + path, { method, cache: "no-store",
        headers: { Authorization: "Bearer " + gh.token, Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined });
    }catch(e){ throw ghErr("Sem rede.", 0, { offline: true }); }
  }
  function ghFalha(res){
    const limite = res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");
    return ghErr("GitHub respondeu " + res.status, res.status, { limite, auth: (res.status === 401 || res.status === 403) && !limite, conflito: res.status === 409 || res.status === 422 });
  }
  gh.list = async dir => {
    const res = await ghFetch("/contents/" + dir + "?ref=main");
    if (res.status === 404) return [];
    if (!res.ok) throw ghFalha(res);
    const j = await res.json();
    return Array.isArray(j) ? j.map(f => ({ name: f.name, sha: f.sha })) : [];
  };
  gh.getJson = async path => {   // arquivos > 1 MB: o contents vem sem conteúdo; o blob (até 100 MB) vem cru
    const res = await ghFetch("/contents/" + path + "?ref=main");
    if (res.status === 404) return null;
    if (!res.ok) throw ghFalha(res);
    const j = await res.json();
    let text;
    if (j.encoding === "base64" && j.content) text = unb64(j.content);
    else {
      const r2 = await ghFetch("/git/blobs/" + j.sha, { raw: true });
      if (!r2.ok) throw ghFalha(r2);
      text = await r2.text();
    }
    return { sha: j.sha, json: JSON.parse(text) };
  };
  gh.putJson = async (path, obj, sha, message) => {
    const res = await ghFetch("/contents/" + path, { method: "PUT", body: { message, content: b64(JSON.stringify(obj)), branch: "main", ...(sha ? { sha } : {}) } });
    if (!res.ok) throw ghFalha(res);
    return (await res.json()).content.sha;
  };
  gh.dispararNotion = async () => {
    const res = await ghFetch("/actions/workflows/notion.yml/dispatches", { method: "POST", body: { ref: "main" } });
    if (!res.ok) throw ghFalha(res);
  };

  // ---- bancos de frases do repo de dados (cache no IndexedDB; só baixa o que mudou) ----
  let bancoPendente = null;
  function bancosRefresh(){
    if (!bancoPendente) bancoPendente = refreshBancos().finally(() => { bancoPendente = null; });
    return bancoPendente;
  }
  async function refreshBancos(){
    try {
    const idx = await gh.getJson("bancos/indice.json");
    if (!idx) return false;
    const j = idx.json;
    const lista = Array.isArray(j.bancos) ? j.bancos : Object.entries(j.bancos || j.hash || {}).map(([slug, v]) =>
      typeof v === "string" ? { slug, hash: v, origem: j.origem?.[slug], contagem: j.contagem?.[slug] } : { ...v, slug });
    if ((!Array.isArray(j.bancos) && !j.bancos && !j.hash) || lista.some(b => !/^[a-z0-9_-]+$/.test(b.slug) || !(b.hash || b.atualizado)) || new Set(lista.map(b => b.slug)).size !== lista.length)
      throw new Error("Índice de bancos inválido.");
    for (const b of lista) b.origem = b.origem || (typeof j.origem === "string" ? j.origem : j.origem?.[b.slug]);
    const writes = [];
    let mudou = false;
    for (const b of lista){
      const c = await kvGet("_gh/banco/" + b.slug);
      if (c && (b.hash ? c.hash === b.hash : c.atualizado === b.atualizado)) continue;
      const f = await gh.getJson("bancos/" + b.slug + ".json");
      if (!f || !Array.isArray(f.json?.frases) || f.json.frases.some(e => !Array.isArray(e) || e.length < 4 || e.some(v => typeof v !== "string")))
        throw new Error("Banco inválido ou ausente: " + b.slug);
      writes.push(["_gh/banco/" + b.slug, { hash: b.hash || null, atualizado: b.atualizado || j.gerado || f.json.atualizado, doc: f.json }]); mudou = true;
    }
    const antigo = await kvGet("_gh/indice");
    const slugs = lista.map(b => b.slug);
    if (!antigo || antigo.slugs.join() !== slugs.join()) mudou = true;
    writes.push(["_gh/indice", { slugs, bancos: lista, atualizado: j.gerado || j.atualizado || "", quando: new Date().toISOString(), avisos: j.avisos || [] }]);
    await transaction("readwrite", s => { for (const [k, v] of writes) s.put(clone(v), k); s.delete("_gh/bancosErro"); });
    document.dispatchEvent(new CustomEvent("tutu-bancos-status"));
    return mudou;
    } catch (e) {
      await kvSet("_gh/bancosErro", e.message || "Falha ao ler os bancos.").catch(() => {});
      document.dispatchEvent(new CustomEvent("tutu-bancos-status"));
      throw e;
    }
  }
  const brData = iso => { const d = new Date(iso); return isNaN(d) ? "sem data" : d.toLocaleDateString("pt-BR"); };
  // {tc, nt}: cada lado = {frases, atualizado} ou null. notas-tomografia = NT; as demais (TC, USG, RM, RX) = TC.
  async function lerBancosGh(){
    const rows = new Map(await readAll());
    const out = { tc: null, nt: null, pares: [] }, idx = rows.get("_gh/indice");
    if (!idx) return out;
    for (const slug of idx.slugs){
      const c = rows.get("_gh/banco/" + slug);
      if (!c || !Array.isArray(c.doc?.frases)) continue;
      if (slug === "notas-tomografia" && Array.isArray(c.doc?.pares)) out.pares = c.doc.pares.filter(p => Array.isArray(p) && p.length >= 4);   // achado -> conclusão (só nesta página)
      const lado = slug === "notas-tomografia" ? "nt" : "tc";
      const o = out[lado] || (out[lado] = { frases: [], atualizado: "" });
      o.frases.push(...c.doc.frases.filter(e => Array.isArray(e) && e.length >= 4));
      if (!o.atualizado || (slug === "notas-tc" || slug === "notas-tomografia")) o.atualizado = c.atualizado || o.atualizado;
    }
    return out;
  }

  // ---- chave do GitHub: IndexedDB local + extensão (chrome.storage.sync entrega nos outros PCs) ----
  const chaveHooks = [];
  document.addEventListener("laudos-chave", async e => {
    let t = ""; try{ t = String(JSON.parse(e.detail).token || ""); }catch(_){ return; }
    if (!t || t === gh.token) return;
    gh.token = t; await kvSet("_cfg/token", t).catch(() => {});
    for (const f of chaveHooks) { try{ f(t); }catch(_){} }
  });
  const pedirChave = () => document.dispatchEvent(new CustomEvent("laudos-chave-pedir"));
  async function setToken(t){
    t = String(t || "").trim(); gh.token = t;
    if (t) await kvSet("_cfg/token", t); else await kvDel("_cfg/token");
    document.dispatchEvent(new CustomEvent("laudos-chave-salvar", { detail: JSON.stringify({ token: t }) }));
  }
  window.tutuSite = { ready, db, importBackup, exportBackup, mergeBank, saveBankNT, sync, gh, setToken, pedirChave,
    onChave: f => { chaveHooks.push(f); }, bancosRefresh, lerBancosGh, brData };
  // Bancos carregados antes do app: índices, vocabulário e treino usam o mesmo código do artefato.
  // Fonte: repo de dados (cache local) > bancos/*.js (reserva, só no PC) + o que foi importado/guardado no IndexedDB.
  const loadScript = src => new Promise(resolve => {
    const tag = document.createElement("script"); tag.src = src; tag.charset = "utf-8";
    tag.onload = tag.onerror = () => resolve();
    document.head.append(tag);
  });
  (async () => {
    gh.token = (await kvGet("_cfg/token").catch(() => "")) || "";
    if (!gh.token){ pedirChave(); const iv = setInterval(pedirChave, 400); setTimeout(() => clearInterval(iv), 4000); }
    let g = await lerBancosGh();
    if (gh.token && !g.tc && !g.nt){   // primeira vez neste PC: espera os bancos (até 20 s) para o app já nascer completo
      try{ await Promise.race([bancosRefresh(), new Promise((_, no) => setTimeout(no, 20000))]); g = await lerBancosGh(); }catch(e){}
    }
    const backup = await exportBackup();
    if ((!g.tc || !g.nt) && ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname)){
      await loadScript("bancos/bank_tc.js"); await loadScript("bancos/bank_nt.js");
    }
    if (!g.pares.length && ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname)) await loadScript("bancos/pares.js");   // reserva local (data/notas-tomografia.json)
    window.BANK_PARES = g.pares.length ? g.pares : (window.BANK_PARES || []);
    const fileTC = window.BANK_TC || [], fileNT = window.BANK_NT || [], b = backup.bancos;
    const fileMeta = window.BANK_NT_META || {}, fileDate = window.BANK_TC_DATE;
    window.BANK_TC = mergeBank(g.tc ? g.tc.frases : fileTC, b.bank_tc).entries;
    window.BANK_NT = mergeBank(g.nt ? g.nt.frases : fileNT, b.bank_nt).entries;
    window.BANK_TC_DATE = g.tc ? brData(g.tc.atualizado) : (b.bank_tc_meta.data || fileDate || "sem backup importado");
    window.BANK_NT_META = g.nt
      ? { laudos: g.nt.frases.filter(e => /Técnica/i.test(e[1])).length, data: brData(g.nt.atualizado), iso: g.nt.atualizado || new Date().toISOString() }
      : { laudos: 0, data: "sem backup importado", iso: new Date().toISOString(), ...fileMeta, ...(b.bank_nt.length ? b.bank_nt_meta : {}) };
    window.BANK_GH = { tc: !!g.tc, nt: !!g.nt };
    const script = document.createElement("script"); script.src = "app.js"; script.charset = "utf-8";
    document.body.append(script);
  })().catch(e => { document.getElementById("status").textContent = e.message; });
})();
