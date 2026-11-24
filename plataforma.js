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
  async function chamarPonteLocal(texto, options, controller){
    // /ia2: Antigravity (Gemini) com o Claude de reserva; ponte antiga (sem /ia2, 404) cai na /ia (só Claude).
    const pedir = rota => fetch("http://127.0.0.1:47831/" + rota, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto, modelTier: options.modelTier || "balanced",
        ...(rota === "ia2" && options.modo === "delta" ? { modo: "delta", laudo: options.laudo } : {}) }), signal: controller.signal
    });
    let response = await pedir("ia2");
    if (response.status === 404) response = await pedir("ia");
    if (!response.ok){
      let detalhe = "";
      try{
        const errJson = await response.json();
        if (errJson && typeof errJson.erro === "string") detalhe = errJson.erro.trim();
      }catch(_){}
      const err = new Error(detalhe || `A ponte local respondeu com erro (HTTP ${response.status}).`);
      err.code = response.status === 504 ? "ia_timeout" : "ia_erro";
      err.tempo = response.status === 504;
      err.status = response.status;
      throw err;
    }
    const result = await response.json();
    const text = typeof result === "string" ? result : (result.text ?? result.texto);
    if (typeof text !== "string" || !text.trim()){
      const err = new Error("Resposta vazia da ponte local.");
      err.code = "empty_completion";
      throw err;
    }
    options.onText?.({ text });
    const motor = result.motor || "claude";
    sample.ultimo = { motor, modelo: result.modelo || "", aviso: result.aviso || "" };
    return { text, modo: result.modo, truncated: Boolean(result.truncated), motor, modelo: result.modelo || "", aviso: result.aviso || "" };
  }
  async function sample(input, options = {}){
    const texto = typeof input === "string" ? input : input.map(m => `${m.role}: ${m.content}`).join("\n\n");
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    const onTimeout = () => { timedOut = true; controller.abort(); };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 95000;
    const timeout = setTimeout(onTimeout, timeoutMs);
    try{
      const nuvem = !options.apenasLocal ? lerNuvem() : null;
      if (nuvem){
        let textoNuvem = texto, modoNuvem = options.modo, laudoNuvem = options.laudo;
        if (!options.anonimizado){
          const anonFn = typeof window !== "undefined" ? window.tutuV2?.anonimizar : null;
          if (typeof anonFn !== "function"){
            const err = new Error("bloqueado: filtro de privacidade indisponível");
            err.code = "bloqueado";
            throw err;
          }
          textoNuvem = anonFn(texto);
          if (modoNuvem === "delta" && typeof laudoNuvem === "string" && !options.laudoAnonimizado){
            const orig = laudoNuvem.split("\n"), anons = orig.map(l => l.trim() ? anonFn(l) : "");
            if (anons.some((l, i) => l !== orig[i])){ modoNuvem = undefined; laudoNuvem = undefined; }
          }
        }
        let nuvemErr = null;
        try{
          const modeloEfetivo = options.modelo || nuvem.modeloConversa;
          const thinkingEfetivo = options.thinking || (modeloEfetivo === "gemini-3.5-flash-lite" && nuvem.thinking !== "medium" ? "minimal" : nuvem.thinking);
          const resp = await fetch(nuvem.url + "/ia2", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Tutu-Token": nuvem.token },
            body: JSON.stringify({
              texto: textoNuvem,
              modelTier: options.modelTier || "balanced",
              modelo: modeloEfetivo,
              thinking: thinkingEfetivo,
              ...(typeof options.frasesBanco === "string" && options.frasesBanco.trim()
                ? { frasesBanco: options.frasesBanco.trim().slice(0, 3500) }
                : {}),
              ...(modoNuvem === "delta" && laudoNuvem ? { modo: "delta", laudo: laudoNuvem } : {})
            }),
            signal: controller.signal
          });
          if (resp.status === 401){
            const err = new Error("Token da IA na nuvem recusado — confira em Configurações › IA.");
            err.code = "ia_erro"; err.status = 401; err.authNuvem = true;
            throw err;
          }
          if (resp.status === 402){
            let detalhe = "Limite mensal de créditos atingido. Ajuste em Configurações › IA.";
            try{ const j = await resp.json(); if (typeof j?.erro === "string" && j.erro.trim()) detalhe = j.erro.trim(); }catch(_){}
            const err = new Error(detalhe);
            err.code = "limite_uso"; err.status = 402; err.authNuvem = true;
            throw err;
          }
          if (!resp.ok){
            let detalhe = "";
            try{ const j = await resp.json(); if (typeof j?.erro === "string") detalhe = j.erro.trim(); }catch(_){}
            const err = new Error(detalhe || `A IA na nuvem respondeu com erro (HTTP ${resp.status}).`);
            err.code = resp.status === 504 ? "ia_timeout" : "ia_erro";
            err.tempo = resp.status === 504; err.status = resp.status;
            throw err;
          }
          const result = await resp.json();
          const text = typeof result === "string" ? result : (result.text ?? result.texto);
          if (typeof text !== "string" || !text.trim()){
            const err = new Error("Resposta vazia da IA na nuvem.");
            err.code = "empty_completion";
            throw err;
          }
          options.onText?.({ text });
          const motor = result.motor || "nuvem";
          const custoUsd = Number(result.custoUsd) || 0;
          sample.ultimo = { motor, modelo: result.modelo || "", aviso: result.aviso || "", custoUsd };
          try{ document.dispatchEvent(new CustomEvent("tutu-uso-atualizado", { detail: { modelo: result.modelo || modeloEfetivo, custoUsd } })); }catch(_){}
          return { text, modo: result.modo, truncated: Boolean(result.truncated), motor, modelo: result.modelo || "", aviso: result.aviso || "", custoUsd };
        }catch(err){
          if (options.signal?.aborted || timedOut || err?.authNuvem) throw err;
          nuvemErr = err;
        }
        try{
          return await chamarPonteLocal(texto, options, controller);
        }catch(_){
          if (nuvemErr && (nuvemErr.code === "ia_timeout" || nuvemErr.code === "ia_erro" || nuvemErr.code === "empty_completion")) throw nuvemErr;
          const error = new Error("IA na nuvem e ponte local indisponíveis.");
          error.code = "ponte_indisponivel";
          throw error;
        }
      }
      return await chamarPonteLocal(texto, options, controller);
    }catch(e){
      if (options.signal?.aborted){
        const err = new Error("Pedido cancelado.");
        err.name = "AbortError";
        err.code = "cancelled";
        throw err;
      }
      if (timedOut){
        const err = new Error(`A IA demorou mais de ${Math.round(timeoutMs / 1000)} s e foi cancelada. Tente novamente.`);
        err.code = "ia_timeout";
        err.tempo = true;
        throw err;
      }
      if (e && (e.code === "bloqueado" || /^bloqueado/i.test(e.message || "") || e.code === "limite_uso" || e.code === "ponte_indisponivel" || e.code === "ia_timeout" || e.code === "ia_erro" || e.code === "empty_completion")) throw e;
      const error = new Error("Ponte local indisponível. Abra a ponte em 127.0.0.1:47831 para usar IA. As funções locais continuam disponíveis.");
      error.code = "ponte_indisponivel"; throw error;
    }finally{ clearTimeout(timeout); options.signal?.removeEventListener("abort", abort); }
  }
  sample.json = async (input, options) => {
    const { text } = await sample(input, options);
    try{ return JSON.parse(text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")); }
    catch(e){ throw new Error("A ponte local devolveu JSON inválido. Tente novamente."); }
  };
  const PONTE_TOKEN_KEY = "tutu_ponte_token";
  const PONTE_URL_KEY = "tutu_ponte_url";
  const PONTE_ORIGEM_AUTORIZADA = "https://desktop-7q8eafr.tail37a2ed.ts.net";
  const NUVEM_URL_KEY = "tutu_nuvem_url";
  const NUVEM_TOKEN_KEY = "tutu_nuvem_token";
  const NUVEM_MODELO_AUDIO_KEY = "tutu_nuvem_modelo_audio";
  const NUVEM_MODELO_CONVERSA_KEY = "tutu_nuvem_modelo_conversa";
  const NUVEM_THINKING_KEY = "tutu_nuvem_thinking";
  const NUVEM_MODELOS = ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.5-flash-lite", "claude-haiku-5-5", "claude-sonnet-5-5"];
  const NUVEM_THINKINGS = ["minimal", "low", "medium"];
  const normModeloNuvem = (m, def = "gemini-4-hydrogen") => NUVEM_MODELOS.includes(m) ? m : def;
  const normThinkingNuvem = t => NUVEM_THINKINGS.includes(t) ? t : "low";
  function salvarModeloConversa(modelo){
    const m = normModeloNuvem(modelo, "");
    if (!m) return false;
    try{ localStorage.setItem(NUVEM_MODELO_CONVERSA_KEY, m); }catch(_){ return false; }
    document.dispatchEvent(new CustomEvent("tutu-nuvem-mudou"));
    return true;
  }
  function validarNuvemUrl(raw, restritoPareamento = false){
    try{
      const u = new URL(String(raw || "").trim());
      if (u.username || u.password || u.search || u.hash || u.pathname !== "/") return "";
      if (u.protocol === "https:"){
        if (restritoPareamento && !u.hostname.endsWith(".workers.dev")) return "";
        return u.hostname.includes(".") ? u.origin : "";
      }
      if (u.protocol === "http:"){
        const localPage = typeof location !== "undefined" && (location.hostname === "127.0.0.1" || location.hostname === "localhost");
        if (localPage && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return u.origin;
      }
      return "";
    }catch(_){ return ""; }
  }
  function lerNuvem(){
    try{
      const url = validarNuvemUrl(localStorage.getItem(NUVEM_URL_KEY) || "");
      const token = (localStorage.getItem(NUVEM_TOKEN_KEY) || "").trim();
      if (!url || !token) return null;
      return {
        url,
        token,
        modeloAudio: normModeloNuvem(localStorage.getItem(NUVEM_MODELO_AUDIO_KEY) || ""),
        modeloConversa: normModeloNuvem(localStorage.getItem(NUVEM_MODELO_CONVERSA_KEY) || ""),
        thinking: normThinkingNuvem(localStorage.getItem(NUVEM_THINKING_KEY) || "")
      };
    }catch(_){ return null; }
  }
  function salvarNuvem({ url, token, modeloAudio, modeloConversa, thinking } = {}){
    const prev = lerNuvem();
    const urlOk = validarNuvemUrl(url !== undefined ? url : (prev?.url || ""));
    const tokRaw = token !== undefined ? String(token || "").trim() : "";
    const tokOk = tokRaw || (urlOk && prev && urlOk === prev.url ? prev.token : "");
    if (!urlOk || !tokOk) return false;
    const ma = normModeloNuvem(modeloAudio !== undefined ? modeloAudio : (prev?.modeloAudio || ""));
    const mc = normModeloNuvem(modeloConversa !== undefined ? modeloConversa : (prev?.modeloConversa || ""));
    const th = normThinkingNuvem(thinking !== undefined ? thinking : (prev?.thinking || ""));
    try{
      localStorage.setItem(NUVEM_URL_KEY, urlOk);
      localStorage.setItem(NUVEM_TOKEN_KEY, tokOk);
      localStorage.setItem(NUVEM_MODELO_AUDIO_KEY, ma);
      localStorage.setItem(NUVEM_MODELO_CONVERSA_KEY, mc);
      localStorage.setItem(NUVEM_THINKING_KEY, th);
    }catch(_){ return false; }
    document.dispatchEvent(new CustomEvent("tutu-nuvem-mudou"));
    return true;
  }
  function limparNuvem(){
    try{
      localStorage.removeItem(NUVEM_URL_KEY);
      localStorage.removeItem(NUVEM_TOKEN_KEY);
    }catch(_){}
    document.dispatchEvent(new CustomEvent("tutu-nuvem-mudou"));
  }
  function nuvemStatus(){
    const n = lerNuvem();
    if (n) return { configurada: true, ...n };
    try{
      return {
        configurada: false,
        url: validarNuvemUrl(localStorage.getItem(NUVEM_URL_KEY) || ""),
        modeloAudio: normModeloNuvem(localStorage.getItem(NUVEM_MODELO_AUDIO_KEY) || ""),
        modeloConversa: normModeloNuvem(localStorage.getItem(NUVEM_MODELO_CONVERSA_KEY) || ""),
        thinking: normThinkingNuvem(localStorage.getItem(NUVEM_THINKING_KEY) || "")
      };
    }catch(_){
      return { configurada: false, url: "", modeloAudio: "gemini-4-hydrogen", modeloConversa: "gemini-4-hydrogen", thinking: "low" };
    }
  }
  function nuvemLinkPareamento(){
    const n = lerNuvem();
    if (!n || !validarNuvemUrl(n.url, true)) return "";
    const base = typeof location !== "undefined" && (location.hostname === "127.0.0.1" || location.hostname === "localhost")
      ? (location.origin + location.pathname)
      : "https://arturaragao.github.io/laudos-tutu-site/";
    return `${base}#nuvem=${encodeURIComponent(n.token)}&nuvemUrl=${encodeURIComponent(n.url)}&ma=${encodeURIComponent(n.modeloAudio)}&mc=${encodeURIComponent(n.modeloConversa)}&th=${encodeURIComponent(n.thinking)}`;
  }
  async function testarNuvem(){
    const n = lerNuvem();
    if (!n) return { ok: false, erro: "IA na nuvem não configurada." };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const t0 = Date.now();
    try{
      const r = await fetch(n.url + "/health", {
        method: "GET",
        headers: { "X-Tutu-Token": n.token },
        cache: "no-store",
        signal: ctl.signal
      });
      const ms = Date.now() - t0;
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, ms, status: r.status, erro: dados?.erro || (r.status === 401 ? "Token recusado pelo Worker." : `HTTP ${r.status}`) };
      return { ok: true, ms, dados };
    }catch(e){
      return { ok: false, ms: Date.now() - t0, erro: e?.name === "AbortError" ? "Tempo esgotado (8 s)." : "Não foi possível alcançar a URL do Worker." };
    }finally{
      clearTimeout(timer);
    }
  }
  async function nuvemFetchJson(path, { method = "GET", body } = {}){
    const n = lerNuvem();
    if (!n) return { ok: false, erro: "IA na nuvem não configurada." };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    try{
      const r = await fetch(n.url + path, {
        method,
        headers: {
          "X-Tutu-Token": n.token,
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: ctl.signal
      });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, status: r.status, erro: dados?.erro || `HTTP ${r.status}` };
      return dados && typeof dados === "object" ? { ok: true, ...dados } : { ok: true };
    }catch(e){
      return { ok: false, erro: e?.name === "AbortError" ? "Tempo esgotado (10 s)." : "Falha ao conectar à IA na nuvem." };
    }finally{
      clearTimeout(timer);
    }
  }
  const filaUsgListar = () => nuvemFetchJson("/fila-usg");
  const filaUsgSalvar = doc => nuvemFetchJson("/fila-usg", { method: "POST", body: doc });
  const filaUsgApagar = (id, sha) => {
    const q = sha ? `?sha=${encodeURIComponent(sha)}` : "";
    return nuvemFetchJson(`/fila-usg/${encodeURIComponent(id)}${q}`, { method: "DELETE" });
  };
  const nuvemUso = () => nuvemFetchJson("/uso");
  const salvarNuvemUso = cfg => nuvemFetchJson("/uso/config", { method: "POST", body: cfg });
  const salvarRegraNuvem = doc => nuvemFetchJson("/aprendizado/regra", { method: "POST", body: doc });
  const salvarCorrecaoNuvem = doc => nuvemFetchJson("/aprendizado/correcao", { method: "POST", body: doc });
  function validarPonteUrl(raw){
    try{
      const u = new URL(String(raw || "").trim());
      if (u.username || u.password || u.port) return "";
      if (u.pathname !== "/" || u.search || u.hash) return "";
      return u.origin === PONTE_ORIGEM_AUTORIZADA ? PONTE_ORIGEM_AUTORIZADA : "";
    }catch(_){ return ""; }
  }
  function lerPonte(){
    try{
      const token = (localStorage.getItem(PONTE_TOKEN_KEY) || "").trim();
      const url = validarPonteUrl(localStorage.getItem(PONTE_URL_KEY) || "");
      return token && url ? { token, url } : null;
    }catch(_){ return null; }
  }
  function salvarPonte(token, url){
    const urlOk = validarPonteUrl(url);
    const tokOk = String(token || "").trim();
    if (!tokOk || !urlOk) return false;
    try{
      localStorage.setItem(PONTE_TOKEN_KEY, tokOk);
      localStorage.setItem(PONTE_URL_KEY, urlOk);
    }catch(_){ return false; }
    document.dispatchEvent(new CustomEvent("tutu-ponte-mudou"));
    return true;
  }
  function desparearPonte(){
    try{
      localStorage.removeItem(PONTE_TOKEN_KEY);
      localStorage.removeItem(PONTE_URL_KEY);
    }catch(_){}
    document.dispatchEvent(new CustomEvent("tutu-ponte-mudou"));
  }
  let pontePareadaMsg = "";
  const mostrarStatusPareamento = msg => {
    if (typeof setStatus === "function") setStatus(msg, "ok");
    else {
      const st = document.getElementById("status");
      if (st) st.textContent = msg;
    }
  };
  function checarHashPareamento(){
    try{
      const h = location.hash || "";
      if (!h || h.length < 2) return;
      const params = new URLSearchParams(h.slice(1));
      if (params.has("nuvem") && params.has("nuvemUrl")){
        const tok = String(params.get("nuvem") || "").trim();
        const urlOk = validarNuvemUrl(params.get("nuvemUrl"), true);
        if (!tok || !urlOk) return;
        if (typeof confirm === "function" && !confirm("Conectar este aparelho à IA na nuvem?")) {
          try{ history.replaceState(null, "", location.pathname + location.search); }catch(_){}
          return;
        }
        if (!salvarNuvem({
          url: urlOk,
          token: tok,
          modeloAudio: params.get("ma") || undefined,
          modeloConversa: params.get("mc") || undefined,
          thinking: params.get("th") || undefined
        })) return;
        try{ history.replaceState(null, "", location.pathname + location.search); }catch(_){}
        pontePareadaMsg = "IA na nuvem conectada ✓";
        mostrarStatusPareamento(pontePareadaMsg);
        return;
      }
      if (!params.has("ponte") || !params.has("ponteUrl")) return;
      const tok = String(params.get("ponte") || "").trim();
      const urlOk = validarPonteUrl(params.get("ponteUrl"));
      if (!tok || !urlOk) return;
      if (typeof confirm === "function" && !confirm("Parear este aparelho com a ponte do PC?")) {
        try{ history.replaceState(null, "", location.pathname + location.search); }catch(_){}
        return;
      }
      if (!salvarPonte(tok, urlOk)) return;
      try{ history.replaceState(null, "", location.pathname + location.search); }catch(_){}
      pontePareadaMsg = "Ponte do PC pareada ✓";
      mostrarStatusPareamento(pontePareadaMsg);
    }catch(_){}
  }
  checarHashPareamento();
  if (typeof window !== "undefined") window.addEventListener?.("hashchange", checarHashPareamento);
  if (pontePareadaMsg){
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.tutuV2?.initialized || Date.now() - t0 > 10000){
        clearInterval(iv);
        mostrarStatusPareamento(pontePareadaMsg);
      }
    }, 50);
  }
  const ehCelular = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") ||
    (typeof window !== "undefined" && window.innerWidth > 0 && window.innerWidth <= 768);
  async function tentarDirectEndpoint(url, headers, connectMs, bodyStr, onDelta, options = {}){
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, connectMs);
    let response;
    try{
      response = await fetch(url, {
        method: "POST",
        headers,
        body: bodyStr,
        signal: controller.signal
      });
    }catch(_){
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (options.signal?.aborted && !timedOut){
        const err = new Error("Pedido cancelado.");
        err.name = "AbortError"; err.code = "cancelled";
        throw err;
      }
      const err = new Error("Ponte indisponível para Direct.");
      err.code = "ponte_indisponivel";
      err.fase = "conexao";
      throw err;
    }
    clearTimeout(timer);
    const ct = (response.headers.get("content-type") || "").toLowerCase();
    if (response.status !== 200 || !ct.includes("text/event-stream") || !response.body){
      let detalhe = "";
      if (response.status === 402){
        try{ const j = await response.json(); if (typeof j?.erro === "string") detalhe = j.erro.trim(); }catch(_){}
        options.signal?.removeEventListener("abort", abort);
        const err = new Error(detalhe || "Limite mensal de créditos atingido. Ajuste em Configurações › IA.");
        err.code = "limite_uso"; err.status = 402; err.fase = "conexao";
        throw err;
      }
      try{ await response.body?.cancel(); }catch(_){}
      options.signal?.removeEventListener("abort", abort);
      const err = new Error(response.status === 401 ? "Token da ponte recusado — parear de novo." : "Ponte indisponível para Direct.");
      err.code = response.status === 401 ? "ponte_nao_autorizada" : "ponte_indisponivel";
      err.status = response.status;
      err.fase = "conexao";
      throw err;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", acum = "", finalizado = null;
    const processarBloco = bloco => {
      const linhas = bloco.split("\n");
      let ev = "message";
      const dados = [];
      for (const l of linhas){
        if (!l || l.startsWith(":")) continue;
        if (l.startsWith("event:")) ev = l.slice(6).trim() || "message";
        else if (l.startsWith("data:")) dados.push(l.slice(5).replace(/^ /, ""));
      }
      if (!dados.length) return;
      let payload;
      try{ payload = JSON.parse(dados.join("\n")); }
      catch(_){ throw new Error("Resposta SSE inválida da ponte."); }
      if (ev === "erro"){
        const err = new Error(payload?.motivo || "Erro no Direct.");
        err.code = "direct_erro";
        throw err;
      }
      if (ev === "done"){
        finalizado = {
          laudo: typeof payload?.laudo === "string" ? payload.laudo : acum,
          motor: payload?.motor || "",
          modelo: payload?.modelo || "",
          custoUsd: Number(payload?.custoUsd) || 0,
          filaSalva: !!payload?.filaSalva,
          filaId: typeof payload?.filaId === "string" ? payload.filaId : ""
        };
        if (finalizado.motor === "nuvem" || finalizado.custoUsd > 0){
          try{ document.dispatchEvent(new CustomEvent("tutu-uso-atualizado", { detail: { modelo: finalizado.modelo, custoUsd: finalizado.custoUsd } })); }catch(_){}
        }
        return;
      }
      if (typeof payload?.delta === "string" && payload.delta){
        acum += payload.delta;
        onDelta?.(payload.delta, acum);
      }
    };
    try{
      while (true){
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
        if (done) buffer += decoder.decode().replace(/\r\n?/g, "\n");
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1){
          const bloco = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          processarBloco(bloco);
          if (finalizado) return finalizado;
        }
        if (done){
          if (buffer.trim()) processarBloco(buffer);
          if (finalizado) return finalizado;
          throw new Error("Stream Direct encerrado antes da conclusão.");
        }
      }
    }catch(e){
      try{ await reader.cancel(); }catch(_){}
      if (options.signal?.aborted){
        const err = new Error("Pedido cancelado.");
        err.name = "AbortError"; err.code = "cancelled";
        throw err;
      }
      if (e && !e.fase) e.fase = "stream";
      throw e;
    }finally{
      options.signal?.removeEventListener("abort", abort);
    }
  }
  async function directStream({ exame, mascara, texto, leve, salvarFila, nome, frasesBanco, padroesMascara } = {}, onDelta, options = {}){
    const nuvem = !options.apenasLocal ? lerNuvem() : null;
    if (nuvem){
      const nuvemMs = Number(options.nuvemTimeoutMs) > 0 ? Number(options.nuvemTimeoutMs) : 6000;
      const bodyNuvem = JSON.stringify({
        exame: exame || "",
        mascara: mascara || "",
        texto: texto || "",
        leve: !!leve,
        modelo: options.modelo || nuvem.modeloAudio,
        thinking: options.thinking || nuvem.thinking,
        salvarFila: !!salvarFila,
        nome: nome || "",
        ...(typeof frasesBanco === "string" && frasesBanco.trim() ? { frasesBanco: frasesBanco.trim().slice(0, 4500) } : {}),
        ...(typeof padroesMascara === "string" && padroesMascara.trim() ? { padroesMascara: padroesMascara.trim().slice(0, 2000) } : {})
      });
      try{
        return await tentarDirectEndpoint(
          nuvem.url + "/direct",
          { "Content-Type": "application/json", "X-Tutu-Token": nuvem.token },
          nuvemMs,
          bodyNuvem,
          onDelta,
          options
        );
      }catch(e){
        if (e?.code === "cancelled" || e?.code === "limite_uso") throw e;
        if (e?.status === 401){
          const err = new Error("Token da IA na nuvem recusado — confira em Configurações › IA.");
          err.code = "nuvem_nao_autorizada";
          err.status = 401;
          throw err;
        }
      }
    }
    const bodyStr = JSON.stringify({ exame: exame || "", mascara: mascara || "", texto: texto || "" });
    const localMs = Number(options.connectTimeoutMs) > 0 ? Number(options.connectTimeoutMs) : 1500;
    const remoteMs = Number(options.remoteConnectTimeoutMs) > 0 ? Number(options.remoteConnectTimeoutMs) : 2500;
    if (!ehCelular()){
      try{
        return await tentarDirectEndpoint("http://127.0.0.1:47831/direct", { "Content-Type": "application/json" }, localMs, bodyStr, onDelta, options);
      }catch(e){
        if (e?.code === "cancelled" || e?.fase === "stream") throw e;
      }
    }
    const ponte = lerPonte();
    if (!ponte){
      const err = new Error("Ponte local indisponível para Direct.");
      err.code = "ponte_indisponivel";
      throw err;
    }
    try{
      return await tentarDirectEndpoint(
        ponte.url + "/direct",
        { "Content-Type": "application/json", "X-Tutu-Token": ponte.token },
        remoteMs,
        bodyStr,
        onDelta,
        options
      );
    }catch(e){
      if (e?.status === 401){
        desparearPonte();
        const err = new Error("Token da ponte recusado — parear de novo.");
        err.code = "ponte_nao_autorizada";
        err.status = 401;
        throw err;
      }
      throw e;
    }
  }
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
  gh.getText = async path => {   // arquivo de texto (ex.: ia/regras/<exame>.md): { sha, text } ou null
    const res = await ghFetch("/contents/" + path + "?ref=main");
    if (res.status === 404) return null;
    if (!res.ok) throw ghFalha(res);
    const j = await res.json();
    return { sha: j.sha, text: j.encoding === "base64" && j.content ? unb64(j.content) : "" };
  };
  gh.putText = async (path, text, sha, message) => {
    const res = await ghFetch("/contents/" + path, { method: "PUT", body: { message, content: b64(String(text)), branch: "main", ...(sha ? { sha } : {}) } });
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
      o.frases.push(...c.doc.frases.filter(e => Array.isArray(e) && e.length >= 4).map(e => e.length >= 6 ? e : [e[0], e[1], e[2], e[3], e[4] || null, c.doc.modalidade || "TC"]));   // e[4] = pares {a,c} do robô; e[5] = modalidade (modo Frase @)
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
    onChave: f => { chaveHooks.push(f); }, bancosRefresh, lerBancosGh, brData, directStream,
    nuvemStatus, salvarNuvem, salvarModeloConversa, limparNuvem, testarNuvem, nuvemLinkPareamento,
    filaUsgListar, filaUsgSalvar, filaUsgApagar, nuvemUso, salvarNuvemUso,
    salvarRegraNuvem, salvarCorrecaoNuvem,
    ponteStatus: () => { const p = lerPonte(); return { pareada: !!p, url: p?.url || "" }; }, desparearPonte };
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
    const script = document.createElement("script"); script.src = "app.js?v=bcfb7f4"; script.charset = "utf-8";
    document.body.append(script);
  })().catch(e => { document.getElementById("status").textContent = e.message; });
})();
