/* Capacidades locais do site. Nenhum banco ou segredo é distribuído no build. */
(() => {
  "use strict";
  const COLS = ["mascaras", "frases", "correcoes", "comandos", "macros", "regras", "exemplos", "dicionario", "casos", "historico", "treino", "config", "bancoNT"];
  const BANKS = ["bank_tc", "bank_nt", "bank_tc_meta", "bank_nt_meta"];
  const listeners = new Set();
  const clone = value => value === undefined ? undefined : structuredClone(value);
  const ready = new Promise((resolve, reject) => {
    const req = indexedDB.open("laudos-tutu-site", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("documentos");
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(new Error("Não foi possível abrir o banco local. Permita o armazenamento neste navegador."));
    req.onblocked = () => reject(new Error("Feche outras abas do Tutu para abrir o banco local."));
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
          if (!merge){ store.put(clone(value), path); return; }
          store.get(path).onsuccess = e => {
            if (update && e.target.result === undefined){ e.target.transaction.abort(); return; }
            store.put({ ...e.target.result, ...clone(value) }, path);
          };
        });
        await notify(col);
      };
      return {
        async get(){
          let value;
          await transaction("readonly", store => { store.get(path).onsuccess = e => value = e.target.result; });
          return docSnapshot(id, value);
        },
        set: (value, options) => write(value, options?.merge),
        update: value => write(value, true, true),
        async delete(){ await transaction("readwrite", store => { store.delete(path); }); await notify(col); }
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
    await transaction("readwrite", store => { for (const [key, value] of writes) store.put(clone(value), key); });
    await notify();
    return writes.filter(([key]) => !key.startsWith("_bancos/")).length;
  }
  async function exportBackup(){
    const dados = Object.fromEntries(COLS.map(c => [c, []]));
    const bancos = { bank_tc: [], bank_nt: [], bank_tc_meta: {}, bank_nt_meta: {} };
    for (const [key, value] of await readAll()){
      const [col, id] = key.split("/");
      if (col === "_bancos") bancos[id] = value;
      else { checkCol(col); dados[col].push({ id, data: value }); }
    }
    return { app: "Laudos", versao: 2, dados, bancos };
  }
  window.tutuSite = { ready, db, importBackup, exportBackup };
  // Bancos carregados antes do app: índices, vocabulário e treino usam o mesmo código do artefato.
  (async () => {
    const backup = await exportBackup();
    window.BANK_TC = backup.bancos.bank_tc;
    window.BANK_NT = backup.bancos.bank_nt;
    window.BANK_TC_DATE = backup.bancos.bank_tc_meta.data || "sem backup importado";
    window.BANK_NT_META = { laudos: 0, data: "sem backup importado", iso: new Date().toISOString(), ...backup.bancos.bank_nt_meta };
    const script = document.createElement("script"); script.src = "app.js"; script.charset = "utf-8";
    document.body.append(script);
  })().catch(e => { document.getElementById("status").textContent = e.message; });
})();
