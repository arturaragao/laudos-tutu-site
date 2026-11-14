/* ============ FORMATAÇÃO ============ */
const FORMAT = {
  font: "Arial", size: "11pt",
  title:   { bold: true, underline: true },
  heading: { bold: true, underline: true }
};
const HEADINGS = ["Informações Clínicas","Técnica de exame","Achados","Conclusão","Achados adicionais"];
const NORMAL_CONCLUSION = "Exame dentro dos limites da normalidade.";

/* ============ BANCO DE FRASES (Notion · Notas TC) ============
   Cópia das seções de descrições (ABDOME, TÓRAX, CRÂNIO...), sem as áreas de pareceres
   e sem números de prontuário / nomes. [grupo, seção, título, texto]                    */
const BANK_DATE = window.BANK_TC_DATE;
const BANK = window.BANK_TC.concat(window.BANK_NT);
let NT_INFO = { laudos: window.BANK_NT_META.laudos, data: window.BANK_NT_META.data, fonte: "cópia" };

/* ---------- Notas Tomografia (Notion): extrai as frases dos laudos, sem dados do paciente ----------
   Recebe o texto da página (formato do notion-fetch) e devolve entradas no formato do banco:
   [região, "Laudos · seção", órgão, "frase\nfrase\n..."]. Mesma função no build e no botão "Atualizar". */
function extractNotasTomografia(t){
  const fo = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const REG = [
    ["TÓRAX", /torax|pulm|mediast/], ["CRÂNIO", /cranio|encefalo|cabeca|face|orbita/],
    ["COLUNA", /coluna|lomb|cervical|toracica-dorsal|sacr/], ["ABDOME", /abdom|pelve|urinari|figado|renal/]
  ];
  const ORG = [
    ["Técnica", /exame obtido|cortes axiais|reformata|meio de contraste iodado|protocolo|aquisic/],
    ["Comparação", /exame anterior|exame previo|estudo previo|estudo anterior|comparativ|{data}/],
    ["Fígado", /figado|hepat|segmento (i|ii|iii|iv|v|vi|vii|viii|iva|ivb)\b/],
    ["Vesícula e vias biliares", /vesicula|biliar|coledoc|colelit|colecist/],
    ["Pâncreas", /pancrea/], ["Baço", /\bbaco|esplen/], ["Adrenais", /adrena|suprarrena/],
    ["Rins e vias urinárias", /\brins?\b|\brim\b|renal|renais|ureter|pielo|calic|bexiga|vesical|nefr/],
    ["Útero, anexos e próstata", /utero|ovari|anex|prostat|endometr|seminais/],
    ["Alças e peritônio", /alca|intestin|colon|sigm|apendic|reto\b|diverticul|estomag|duoden|liquido livre|ascite|periton|mesent|pneumoperit|omento/],
    ["Vasos", /aort|arteria|veia|venos|iliac|cava|porta\b|trombo|aneurism|ateroma/],
    ["Linfonodos", /linfono/],
    ["Parede e hérnias", /hernia|parede abdominal|subcutan|muscul/],
    ["Pulmões", /pulm|lobo (superior|inferior|medio)|nodul|vidro fosco|consolida|atelect|enfisem|bronq|opacidad|reticul|lingula|segmento (apical|basal|anterior|posterior)/],
    ["Pleura", /pleur/], ["Mediastino e coração", /mediast|traque|esofag|timo|cardi|coronar|pericard/],
    ["Encéfalo", /encefal|ventricul|sulcos|cisterna|substancia branca|isquem|hemorrag|parenquima encef|calota|craniano|cerebel|tronco/],
    ["Seios da face e mastoides", /seios|sinus|mastoid|orbita/],
    ["Ossos e coluna", /osse|ossea|vertebr|degenerativ|osteof|fratura|litic|blastic|discal|disco|canal vertebral|forame|facet|sacroil|costel|esclero/]
  ];
  const secOf = h => {
    const f = fo(h).replace(/[:.]+$/, "").trim();
    if (/^(indicacao|dados clinicos|informac)/.test(f)) return "ind";
    if (/^tecnica/.test(f)) return "tec";
    if (/^(conclusao|impressao)/.test(f)) return "con";
    if (/^achados? adiciona/.test(f)) return "add";
    if (/^achados/.test(f)) return "ach";
    if (/^(exames? anteriores|comentario|obs|adendo)/.test(f)) return "ach";
    if (/^tomografia/.test(f)) return "tit";
    return null;                      // subtítulo dentro dos achados (ex.: "Nódulo Pulmonar")
  };
  const groups = new Map(), freq = new Map();
  let nLaudos = 0;
  const re = /<summary>([\s\S]*?)<\/summary>/g;
  let m, grupo = "", marks = [];
  while ((m = re.exec(t))) marks.push({ s: m[1], i: m.index, end: re.lastIndex });
  for (const mk of marks){
    const plain = mk.s.replace(/<[^>]+>|\*/g, "").trim();
    if (!/^\d{6,}/.test(plain)){ grupo = plain; continue; }
    let body = t.slice(mk.end, t.indexOf("</details>", mk.end) < 0 ? undefined : t.indexOf("</details>", mk.end));
    body = body.replace(/<image[\s\S]*?(<\/image>|\/>)|!\[[^\]]*\]\([^)]*\)/g, "");
    if (!/tomografia|cortes axiais|exame (foi )?obtido/i.test(body)) continue;
    nLaudos++;
    let sec = null, titulo = "";
    for (let line of body.split("\n")){
      const raw = line.trim(); if (!raw) continue;
      const txt = raw.replace(/<[^>]+>/g, "").replace(/\*\*/g, "").replace(/^[\\\s•\-–]+/, "").trim();
      if (!txt) continue;
      const isHead = /<span underline/.test(raw) || /^\*\*[^*]+\*\*:?$/.test(raw);
      if (isHead){ const s = secOf(txt); if (s === "tit") titulo = txt; else if (s) sec = s; continue; }
      if (!sec || sec === "ind" || sec === "tit") continue;
      // sem dados do paciente: datas viram {data}, números longos (prontuário, acesso) saem
      let f = txt.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "{data}").replace(/\b\d{6,}\b/g, "").replace(/\s{2,}/g, " ").trim();
      if (f.length < 12 || f.length > 420 || /\b(dr\.?a?|crm|paciente|nome|prontu[aá]rio|atendimento)\b/i.test(f) || /pmid|pmcid|doi:|epub|et al\./i.test(f)) continue;
      const ff = fo(f);
      const regiao = (REG.find(([, r]) => r.test(fo(grupo + " " + titulo))) || ["OUTROS"])[0];
      const secao = sec === "tec" ? "Técnica" : sec === "con" ? "Conclusão" : "Achados";
      let org = (ORG.find(([, r]) => r.test(ff)) || ["Geral"])[0];
      if (sec === "tec") org = "Técnica";
      if (sec === "con" && /^o estudo|demonstra|mostra,? (na|como)/.test(ff)) org = "Frases de conclusão";
      const key = regiao + "|" + secao + "|" + org;
      const norm = ff.replace(/\d+([.,]\d+)?/g, "#").replace(/[^a-z#{} ]/g, "").replace(/\s+/g, " ").trim();
      if (!groups.has(key)) groups.set(key, new Map());
      const g = groups.get(key);
      if (!g.has(norm)) g.set(norm, f);
      freq.set(key + "|" + norm, (freq.get(key + "|" + norm) || 0) + 1);
    }
  }
  const out = [];
  for (const [key, g] of groups){
    const [regiao, secao, org] = key.split("|");
    const lines = [...g.entries()].sort((a, b) => (freq.get(key + "|" + b[0]) || 0) - (freq.get(key + "|" + a[0]) || 0)).map(x => x[1]);
    let buf = [], len = 0;
    const flush = () => { if (buf.length) out.push([regiao, "Laudos · " + secao, org, buf.join("\n")]); buf = []; len = 0; };
    for (const l of lines){ if (len + l.length > 700) flush(); buf.push(l); len += l.length + 1; }
    flush();
  }
  return { entries: out, laudos: nLaudos };
}


/* ============ MÁSCARAS ============ */
const DEFAULT_EXAMS = [
  { id:"abdome", code:"AB", name:"TC de abdome total", proto:"Com contraste", sexo:true, mine:true, voz:["abdome","abdome total","abdômen","abdômen total","abdominal"],
    groups:["ABDOME","ABDOME COM CONTRASTE","ANGIO TC ABD E ILÍACAS","ANGIO ABD E ILÍACAS"],
    mask:`TOMOGRAFIA COMPUTADORIZADA DE ABDOME TOTAL
Informações Clínicas
[<>]
Técnica de exame
Exame de Tomografia Computadorizada do abdome total realizado com técnica helicoidal multidetectores, antes, durante e após a injeção endovenosa de contraste iodado.
Achados
[<Fígado com morfologia, dimensões e coeficientes de atenuação normais.>]
[<Veias supra-hepáticas e do sistema porta permeáveis e com calibre normal.>]
[<Vesícula biliar normodistendida, de paredes lisas e finas.>]
[<Vias biliares intra e extra-hepáticas com calibre normais.>]
[<Pâncreas com morfologia, dimensões e densidade normais.>]
[<Baço com morfologia, dimensões e densidade normais.>]
[<Glândulas adrenais com morfologia, dimensões e densidade normais.>]
[<Rins de topografia, dimensões, morfologia e densidade normais.>]
[<Ausência de dilatação dos sistemas uretero-pielo-caliciais.>]
[<Alças do trato gastrointestinal com calibre e espessura parietal normais.>]
[<Apêndice cecal com calibre usual e sem sinal inflamatório adjacente.>]
[<Ausência de linfonodomegalias no segmento estudado.>]
[<Aorta abdominal e artérias ilíacas de calibre e trajeto usuais.>]
[<Bexiga de paredes lisas e finas. Gordura perivesical preservada.>]
[Próstata de aspecto usual.]
[Útero de aspecto tomográfico habitual. Regiões anexiais sem particularidades ao método.]
[<Reto sem alterações. Gordura perirretal e isquiorretal livres.>]
[<Não há evidência de líquido livre na cavidade peritoneal.>]
[<Planos musculares e adiposos da parede abdominal sem alterações.>]
[<Estruturas ósseas de aspecto tomográfico preservado.>]
Conclusão
1.
Achados adicionais` },
  { id:"cranio", code:"CR", name:"TC de crânio", proto:"Sem contraste", sexo:false, mine:false, voz:["crânio","cabeça","encéfalo"],
    groups:["CRÂNIO","CABEÇA","ANGIO CRÂNIO"],
    mask:`TOMOGRAFIA COMPUTADORIZADA DE CRÂNIO
Informações Clínicas
[<>]
Técnica de exame
Exame de Tomografia Computadorizada do crânio realizado com técnica helicoidal multidetectores, sem a injeção endovenosa de contraste iodado.
Achados
[<Ausência de coleções hemorrágicas intra ou extra-axiais.>]
[<Parênquima encefálico com atenuação e diferenciação córtico-subcortical preservadas.>]
[<Sistema ventricular com dimensões e morfologia habituais, centrado.>]
[<Sulcos corticais, fissuras encefálicas e cisternas da base com amplitude normal para a faixa etária.>]
[<Estruturas da linha média centradas.>]
[<Estruturas da fossa posterior sem alterações.>]
[<Calota craniana íntegra.>]
[<Seios paranasais e cavidades mastóideas visualizados normalmente aerados.>]
Conclusão
1.
Achados adicionais` },
  { id:"torax", code:"TX", name:"TC de tórax", proto:"Sem contraste", sexo:false, mine:false, voz:["tórax","torax","pulmão","pulmões"],
    groups:["TÓRAX","ANGIOTC TÓRAX - TEP"],
    mask:`TOMOGRAFIA COMPUTADORIZADA DE TÓRAX
Informações Clínicas
[<>]
Técnica de exame
Exame de Tomografia Computadorizada do tórax realizado com técnica helicoidal multidetectores, sem a injeção endovenosa de contraste iodado.
Achados
[<Traqueia e brônquios principais pérvios, de calibre normal.>]
[<Parênquima pulmonar com atenuação preservada, sem nódulos, consolidações ou opacidades.>]
[<Ausência de derrame pleural ou pneumotórax.>]
[<Estruturas mediastinais centradas, sem linfonodomegalias.>]
[<Coração com dimensões normais. Ausência de derrame pericárdico.>]
[<Aorta torácica e tronco da artéria pulmonar com calibre normal.>]
[<Esôfago sem alterações.>]
[<Estruturas ósseas e partes moles da parede torácica sem alterações.>]
[<Cortes do abdome superior sem alterações.>]
Conclusão
1.
Achados adicionais` },
  { id:"par-cranio", code:"PCR", name:"TC de crânio", proto:"Parecer provisório", tipo:"parecer", sexo:false, mine:true, voz:["parecer crânio","parecer cranio"], groups:[],
    mask:`PARECER PROVISÓRIO RADIOLOGIA
TC CRÂNIO {data}
Ausência de alterações intracranianas agudas.` },
  { id:"par-abdome", code:"PAB", name:"TC de abdome total", proto:"Parecer provisório", tipo:"parecer", sexo:false, mine:true, voz:["parecer abdome","parecer abdome total","parecer abdômen"], groups:[],
    mask:`PARECER PROVISÓRIO RADIOLOGIA
TC ABDOME TOTAL {data}
Ausência de líquido livre intra-abdominal ou pneumoperitônio.
Ausência de linfonodomegalias ou lesões expansivas intra-abdominais.
Na região cecoapendicular não há sinais inflamatórios.` },
  { id:"par-torax", code:"PTX", name:"TC de tórax", proto:"Parecer provisório", tipo:"parecer", sexo:false, mine:true, voz:["parecer tórax","parecer torax"], groups:[],
    mask:`PARECER PROVISÓRIO RADIOLOGIA
TC TÓRAX {data}
Ausência de lesões no parênquima pulmonar ou no mediastino.
Ausência de consolidações no parênquima pulmonar.
Ausência de derrame pleural ou pneumotórax.` },
  { id:"par-tep", code:"PTE", name:"Angio-TC de tórax (TEP)", proto:"Parecer provisório", tipo:"parecer", sexo:false, mine:true, voz:["parecer tep","parecer angio tórax","parecer angiotomografia de tórax"], groups:[],
    mask:`PARECER PROVISÓRIO RADIOLOGIA
ANGIOTC TÓRAX {data}
Ausência de sinais de tromboembolismo pulmonar.` },
  { id:"par-politrauma", code:"PPT", name:"Politrauma", proto:"Parecer provisório", tipo:"parecer", sexo:false, mine:true, voz:["parecer politrauma","parecer trauma"], groups:[],
    mask:`PARECER PROVISÓRIO RADIOLOGIA
TC CRÂNIO {data}
Ausência de alterações intracranianas agudas.
TC TÓRAX {data}
Ausência de derrame pleural, pneumotórax ou consolidações no parênquima pulmonar.
TC ABDOME TOTAL {data}
Ausência de líquido livre intra-abdominal ou pneumoperitônio.
TC COLUNA TOTAL {data}
Ausência de sinais de fraturas.` },
  { id:"par-coluna-total", code:"PCT", name:"TC de coluna total", proto:"Parecer provisório", tipo:"parecer", sexo:false, mine:true, voz:["parecer coluna total","parecer coluna"], groups:[],
    mask:`PARECER PROVISÓRIO RADIOLOGIA
TC COLUNA TOTAL {data}
Ausência de sinais de fraturas.` },
  { id:"par-coluna-cervical", code:"PCC", name:"TC de coluna cervical", proto:"Parecer provisório", tipo:"parecer", sexo:false, mine:true, voz:["parecer coluna cervical","parecer cervical"], groups:[],
    mask:`PARECER PROVISÓRIO RADIOLOGIA
TC COLUNA CERVICAL {data}
Ausência de sinais de fraturas.` },
  { id:"par-coluna-toracica", code:"PCO", name:"TC de coluna torácica", proto:"Parecer provisório", tipo:"parecer", sexo:false, mine:true, voz:["parecer coluna torácica","parecer coluna toracica","parecer coluna dorsal"], groups:[],
    mask:`PARECER PROVISÓRIO RADIOLOGIA
TC COLUNA TORÁCICA {data}
Ausência de sinais de fraturas.` },
  { id:"par-coluna-lombar", code:"PCL", name:"TC de coluna lombar", proto:"Parecer provisório", tipo:"parecer", sexo:false, mine:true, voz:["parecer coluna lombar","parecer lombar"], groups:[],
    mask:`PARECER PROVISÓRIO RADIOLOGIA
TC COLUNA LOMBAR {data}
Ausência de sinais de fraturas.` },
  { id:"par-angio-cranio", code:"PAC", name:"TC crânio + angio-TC crânio e pescoço", proto:"Parecer provisório", tipo:"parecer", sexo:false, mine:true, voz:["parecer angio crânio","parecer angio","parecer avc","parecer angio crânio e pescoço"], groups:[],
    mask:`PARECER PROVISÓRIO RADIOLOGIA
TC CRÂNIO {data}
Ausência de alterações intracranianas agudas.
ANGIOTC CRÂNIO E PESCOÇO {data}
Ausência de oclusões / estenoses significativas dos principais vasos cervicais ou intracranianos.
Ausência de áreas de realce anômalo pelo meio de contraste.` },
];
let EXAMS = DEFAULT_EXAMS.map(e => ({ ...e }));

const MARK = "===REVISAO===";
const $ = id => document.getElementById(id);
let extras = [];   /* máscaras adicionais ditadas junto com a principal */
let current = EXAMS[0], sexo = "", sample = null, ctl = null, chatTurns = [];

const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
};
const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const fold = s => s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();


/* ---------- banco: busca dos trechos relevantes ---------- */
const STOP = new Set("para pela pelo com sem uma umas uns sobre entre como mais menos cerca medindo mede aspecto sinais sinal area areas regiao terco direito direita esquerdo esquerda bilateral pequena pequeno leve leves discreto discreta moderada moderado acentuada acentuado exame normal normais restante demais ausencia presenca nota notase observase".split(" "));
// sinônimos por radical (5 letras, sem acento): cada palavra do grupo também busca as outras
const SYN = (() => { const m = {}; for (const g of ["figad hepat", "renal rins", "vesic bilia", "encef cereb", "cisto cisti", "calcu litia", "linfo linfa", "derra efusa", "hipod hipoa", "dilat ectas", "estea gordu", "baco esple", "tromb embol"]){ const w = g.split(" "); for (const a of w) m[a] = w.filter(b => b !== a); } return m; })();
const BIDX = BANK.map(e => ({ key: fold(e[0]+" "+e[1]+" "+e[2]), body: fold(e[3]) }));
function terms(t, semSinonimo){
  const out = new Set();
  for (const w of fold(t).split(/[^a-z0-9]+/)){
    if (w.length < 4 || STOP.has(w)) continue;
    const s = w.slice(0,5); out.add(s); if (SYN[s] && !semSinonimo) for (const x of SYN[s]) out.add(x);
  }
  return [...out];
}
function pickBank(text, budget = 22000){
  const ts = terms(text); if (!ts.length) return [];
  const scored = [];
  BANK.forEach((e,i) => {
    let sc = 0;
    for (const t of ts){
      if (BIDX[i].key.includes(t)) sc += 6;
      const n = BIDX[i].body.split(t).length - 1; sc += Math.min(n,3);
    }
    if (!sc) return;
    const gs = current.groups || [];
    sc *= !gs.length ? 1 : gs.includes(e[0]) ? 1.5 : 0.6;
    scored.push([sc,i]);
  });
  scored.sort((a,b) => b[0]-a[0]);
  // parte do espaço fica reservada para as frases dos laudos de referência (Notas Tomografia)
  const pick = []; let used = 0;
  const take = (list, lim, max, porOrgao) => {
    let n = 0; const org = {};
    for (const [sc,i] of list){
      if (sc < 4) break;
      if (pick.includes(i)) continue;
      if (porOrgao){ const k = BANK[i][2]; if ((org[k] || 0) >= porOrgao) continue; org[k] = (org[k] || 0) + 1; }
      const len = BANK[i][3].length + 60;
      if (used + len > lim) continue;
      pick.push(i); used += len; n++;
      if (n >= max || pick.length >= 40) break;
    }
  };
  take(scored.filter(([,i]) => /^Laudos/.test(BANK[i][1])), budget * 0.4, 6, 2);
  take(scored.filter(([,i]) => !/^Laudos/.test(BANK[i][1])), budget, 40);
  return pick;
}
/* ---------- banco: só as frases mais parecidas com cada achado ditado (economiza tokens) ---------- */
let PIDX = null;   // índice de frases; zerado quando o banco muda (replaceNT)
const trigrams = t => { const s = " " + t.replace(/[^a-z0-9]+/g, " ").trim() + " ", out = new Set(); for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3)); return out; };
function phraseIndex(){
  if (PIDX) return PIDX;
  PIDX = []; const seen = new Set();
  for (const e of BANK) for (let s of String(e[3]).split("\n")){
    s = s.replace(/^[\s*\\]+|[\s*\\]+$/g, "").trim();
    if (s.length < 15 || s.length > 400) continue;
    const k = fold(s); if (seen.has(k)) continue; seen.add(k);
    PIDX.push({ s, g: e[0], conc: /conclus/i.test(e[1] + " " + e[2]), st: new Set(terms(s, true)), tri: trigrams(k) });
  }
  return PIDX;
}
function phraseScore(p, ft, ftri, gs){
  let hit = 0; for (const t of ft) if (p.st.has(t)) hit++;
  if (hit < Math.min(2, ft.length)) return 0;   // pelo menos 2 termos em comum (evita "vesículas seminais" para "vesícula")
  let inter = 0; for (const g of ftri) if (p.tri.has(g)) inter++;
  const sc = 2 * hit / (ft.length + p.st.size) + inter / (ftri.size + p.tri.size - inter);
  return sc * (!gs.length ? 1 : gs.includes(p.g) ? 1.3 : 0.7);
}
/* para cada linha de achado: as frases mais parecidas + 1 frase de conclusão; no máximo `max` no total */
function pickPhrases(fresh, max = 16){
  const lines = String(fresh).split("\n").map(l => l.trim()).filter(l => terms(l).length);
  if (!lines.length) return [];
  const idx = phraseIndex(), gs = [current, ...extras].flatMap(e => e.groups || []), out = [];
  const per = Math.max(2, Math.min(4, Math.floor(max / lines.length)));
  for (const l of lines){
    const ft = terms(l), ftri = trigrams(fold(l));
    const sc = idx.map(p => [phraseScore(p, ft, ftri, gs), p]).filter(x => x[0] >= 0.25).sort((a, b) => b[0] - a[0]);
    const take = (list, n) => { for (const [, p] of list){ if (!n) break; if (!out.includes(p.s)){ out.push(p.s); n--; } } };
    take(sc.filter(x => !x[1].conc), per - 1);
    take(sc.filter(x => x[1].conc && x[0] >= 0.45), 1);
  }
  return out.slice(0, max);
}
function bankBlock(idx){
  return idx.map(i => { const e = BANK[i]; return `### ${e[0]} › ${e[1]}${e[2] ? " › " + e[2] : ""}\n${e[3]}`; }).join("\n\n");
}


/* ---------- exames e máscara ---------- */
function renderExams(){
  const wrap = $("exams"); wrap.textContent = ""; updMaskChip();
  const groups = [["Pareceres provisórios", EXAMS.filter(e => e.tipo === "parecer")], ["Laudos", EXAMS.filter(e => e.tipo !== "parecer")]];
  for (const [label, list] of groups){
    if (!list.length) continue;
    const h = document.createElement("div"); h.className = "exam-group"; h.textContent = label; wrap.append(h);
    for (const ex of list){
      const b = document.createElement("button");
      b.className = "exam"; b.type = "button";
      b.setAttribute("aria-pressed", ex.id === current.id ? "true" : "false");
      b.innerHTML = `<span class="name"></span><span class="proto"></span>`;
      b.querySelector(".name").textContent = shortName(ex);
      const p = b.querySelector(".proto"); p.textContent = ex.tipo === "parecer" ? "" : ex.proto;
      if (!ex.mine){ const s = document.createElement("span"); s.className = "prov"; s.textContent = " · provisória"; p.append(s); }
      b.dataset.id = ex.id;
      b.onclick = () => { selectExam(ex.id, false); if ($("examCol").classList.contains("peek")) hidePeekNow(); };
      b.ondblclick = () => { hidePeekNow(); openModal("mascModal"); renderMascList(); loadMask(ex.id); $("mNome").focus(); };
      b.title = "Clique para laudar · dois cliques para editar a máscara";
      wrap.append(b);
    }
  }

  const sel = $("plantaoExam"); sel.textContent = "";
  for (const [label, list] of groups){
    if (!list.length) continue;
    const g = document.createElement("optgroup"); g.label = label;
    for (const ex of list){ const o = document.createElement("option"); o.value = ex.id; o.textContent = shortName(ex); o.selected = ex.id === current.id; g.append(o); }
    sel.append(g);
  }
}
function shortName(ex){ return String(ex.name).replace(/^parecer\s*[·:-]\s*/i, ""); }
function fullName(ex){ return (ex.tipo === "parecer" ? "Parecer · " : "") + shortName(ex); }
function maskAll(){ return [current, ...extras].map(maskOf).join("\n\n"); }
function nameAll(){ return [current, ...extras].map(e => e.name).join(" + "); }
function selectExam(id, focus, add){
  const ex = EXAMS.find(e => e.id === id); if (!ex) return;
  if (add && ex.id !== current.id){
    if (!extras.some(e => e.id === ex.id)){ extras.push(ex); appendModel(ex); }
    updMaskChip(); return;
  }
  const changed = ex.id !== current.id;
  if (changed) extras = [];
  /* modelo ainda intacto (ou folha vazia): troca direto; com edições suas: salva o caso no histórico e começa outro */
  const dirty = sheetHasContent() && !modelIntact();
  if (changed && dirty && typeof saveCaseNow === "function"){ saveCaseNow(); newCase(); }
  current = ex; store.set("exame", ex.id);
  $("exams").querySelectorAll("button.exam").forEach(b => b.setAttribute("aria-pressed", b.dataset.id === id ? "true" : "false"));
  $("plantaoExam").value = id; updMaskChip();
  if (changed || !sheetHasContent()){ clearReviewState(); loadModel(ex); }
  if (focus) focusSheet(true);
}
function updMaskChip(){
  const c = document.getElementById("maskChip"); if (!c || !current) return;
  $("maskChipTx").textContent = [current, ...extras].map(fullName).join(" + ") + (current.mine ? "" : " (provisória)");
  c.title = "Máscara selecionada: " + fullName(current); c.classList.toggle("par", current.tipo === "parecer");
  try{ publishVoice(); }catch(e){}   // vocabulário do exame aberto para o reconhecimento de voz (no carregamento ainda não existe)
}
function fmt(html, f){ if (f.underline) html = `<u>${html}</u>`; if (f.bold) html = `<b>${html}</b>`; return html; }
let PSTYLE = `margin:0;font-family:${FORMAT.font},Helvetica,sans-serif;font-size:${FORMAT.size};line-height:normal`;
const P = (inner, al) => `<p style="${PSTYLE}${al ? ";text-align:" + AL_CSS[al] : ""}">${inner}</p>`;
const BLANK = P("<br>");
const stripTags = t => String(t).replace(/<\/?[bui]>/gi, "");
const fmtInline = t => esc(t).replace(/&lt;(\/?)([bui])&gt;/gi, "<$1$2>");
const ALIGN_RE = /^\{\{(centro|justificado|esquerda|direita)\}\}/;
const AL_CSS = { centro:"center", justificado:"justify", esquerda:"left", direita:"right" };
const CSS_AL = { center:"centro", justify:"justificado", right:"direita" };
const splitAlign = t => { t = String(t); const m = t.match(ALIGN_RE); return m ? { al: m[1], t: t.slice(m[0].length) } : { al: "", t }; };
const stripMarks = t => stripTags(splitAlign(t).t);
const isHeading = t => HSET.has(norm(stripMarks(t)));
const todayBR = () => { const d = new Date(); return String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0") + "/" + d.getFullYear(); };
const maskOf = ex => String(ex.mask).replace(/\{data\}/gi, todayBR());
/* serializa um bloco editável (contenteditable) em linhas com <b>, <u>, <i>, {{alinhamento}} e listas */
function serEditable(root){
  const lines = []; let cur = "", curAl = "";
  const BLOCK = /^(DIV|P|H[1-6]|BLOCKQUOTE|SECTION)$/;
  const alignOf = el => { if (!el || el.nodeType !== 1) return ""; const a = (el.style && el.style.textAlign) || el.getAttribute("align") || ""; return CSS_AL[a] || (a === "left" ? "" : ""); };
  const tagOf = c => {
    let tag = { B:"b", STRONG:"b", U:"u", I:"i", EM:"i" }[c.nodeName];
    if (!tag && c.nodeName === "SPAN"){ const st = c.getAttribute("style") || "";
      if (/font-weight:\s*(bold|[6-9]00)/.test(st)) tag = "b"; else if (/underline/.test(st)) tag = "u"; else if (/italic/.test(st)) tag = "i"; }
    return tag;
  };
  const flush = force => { cur = cur.replace(/ {2,}/g, " ").replace(/^ +/, ""); if (cur !== "" || force) lines.push((curAl ? `{{${curAl}}}` : "") + cur); cur = ""; curAl = ""; };
  function walk(node, al){
    for (const c of node.childNodes){
      if (c.nodeType === 3){ const v = c.nodeValue.replace(/ /g, " ").replace(/\n/g, " "); if (v){ cur += v; if (!curAl) curAl = al; } continue; }
      if (c.nodeType !== 1) continue;
      if (c.nodeName === "DEL" || (c.classList && c.classList.contains("rmline"))) continue;   /* texto apagado pela correção (vermelho) não conta */
      if (c.nodeName === "BR"){ if (!curAl) curAl = al; flush(true); continue; }
      if (c.nodeName === "UL" || c.nodeName === "OL"){
        flush(false); let n = 0;
        for (const li of c.children){ if (li.nodeName !== "LI") continue; n++;
          cur = c.nodeName === "OL" ? n + ". " : "• "; curAl = alignOf(li) || alignOf(c) || al;
          walk(li, curAl); if (cur !== "") flush(false); }
        continue;
      }
      if (BLOCK.test(c.nodeName)){
        flush(false); const a = alignOf(c) || al, before = lines.length;
        walk(c, a);
        if (cur !== "") flush(false); else if (lines.length === before){ curAl = a; flush(true); }
        continue;
      }
      const tag = tagOf(c);
      if (tag){ cur += `<${tag}>`; walk(c, al); cur += `</${tag}>`; } else walk(c, al);
    }
  }
  walk(root, "");
  flush(false);
  return lines.map(l => l.replace(/<(b|u|i)><\/\1>/g, "").replace(/<(b|u|i)>(\s*)<\/\1>/g, "$2")).join("\n").replace(/\n+$/, "");
}
const textToEditable = t => String(t).split("\n").map(l => { const { al, t: x } = splitAlign(l); return `<div${al ? ` style="text-align:${AL_CSS[al]}"` : ""}>${fmtInline(x) || "<br>"}</div>`; }).join("");
function laudoTagged(){ return serEditable($("laudo")).replace(/\n{3,}/g,"\n\n").trim(); }
const norm = s => s.trim().replace(/[:\s]+$/,"").toLowerCase();
const HSET = new Set(HEADINGS.map(norm));


/* ============ FOLHA: modelo, cursor, texto e edições marcadas ============ */
const sheet = $("laudo");
try{ document.execCommand("defaultParagraphSeparator", false, "p"); }catch(e){}
let modelSig = store.get("modelSig") || "";
const sheetHasContent = () => !!laudoText().trim();
const modelIntact = () => !!modelSig && laudoTagged() === modelSig;
function rangeAtEnd(el){ const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); return r; }
/* devolve o cursor para onde ele estava (a folha guarda a última posição); nunca joga para o fim se já houver posição */
function focusSheet(clinic){
  sheet.focus({ preventScroll: true });
  const s = getSelection(); let r = null;
  if (clinic === true){
    const ps = [...sheet.children], i = ps.findIndex(p => norm(p.textContent) === "informações clínicas");
    if (i >= 0 && ps[i + 1]) r = rangeAtEnd(ps[i + 1]); else if (ps.length) r = rangeAtEnd(ps[ps.length - 1]);
  } else if (sheetRange && sheet.contains(sheetRange.startContainer) && sheet.contains(sheetRange.endContainer)) r = sheetRange;
  else if (sheet.lastElementChild) r = rangeAtEnd(sheet.lastElementChild);
  if (r){ s.removeAllRanges(); s.addRange(r); }
}
/* linhas da máscara; as vazias viram parágrafo vazio (menos no início e no fim) */
function maskLines(ex){
  const lines = maskOf(ex).split("\n").map(l => l.trim());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}
/* BLANK antes de título só se a linha anterior não for já um parágrafo vazio da máscara */
function modelSheetHtml(ex){
  const parecer = ex.tipo === "parecer";
  let out = "", vazio = false, first = true;
  for (const raw of maskLines(ex)){
    if (!raw){ out += BLANK; vazio = true; continue; }
    const { al, t } = splitAlign(raw), head = !parecer && !first && isHeading(t);
    if (!parecer && first) out += P(fmt(fmtInline(stripTags(t)), FORMAT.title), al);
    else if (head) out += (vazio ? "" : BLANK) + P(fmt(fmtInline(stripTags(t)), FORMAT.heading), al);
    else if (t === "[<>]") out += P("<br>", al);
    else { let m;
      if ((m = t.match(/^\[<(.*)>\]$/)) || (m = t.match(/^\[(.*)\]$/))) out += P(fmtInline(m[1]), al);
      else out += P(fmtInline(t), al); }
    first = false; vazio = false;
  }
  return out;
}
function resetSheetState(){
  lastGenerated = ""; checkedHash = ""; versions = []; verPtr = -1; $("verCount").textContent = ""; $("alertBox").hidden = true;
  clearReviewState();
}
function clearReviewState(){ confItems = []; resetReview(); }
function loadModel(ex){
  resetSheetState();
  sheet.innerHTML = modelSheetHtml(ex);
  modelSig = laudoTagged(); store.set("modelSig", modelSig);
  pushVersion("Modelo"); updateCount(); updVolHint(); scheduleCaseSave();
  const a = document.activeElement;
  if (!a || a === document.body || a === sheet) cursorAfterModel();
}
/* cursor numa linha nova logo abaixo da última linha escrita da máscara */
function cursorAfterModel(){
  let last = sheet.lastElementChild;
  if (!last || blockText(last).trim()){ sheet.insertAdjacentHTML("beforeend", BLANK); last = sheet.lastElementChild; }
  sheet.focus({ preventScroll: true });
  const r = document.createRange(); r.setStart(last, 0); r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  try{ last.scrollIntoView({ block: "nearest" }); }catch(e){}
}
const isParHeader = el => !!el && /^parecer provisorio/.test(fold(el.textContent).trim());
function appendModel(ex){
  let html = modelSheetHtml(ex);
  if (current.tipo === "parecer" && ex.tipo === "parecer"){
    // vários exames num parecer só: "PARECER PROVISÓRIO RADIOLOGIA" uma vez no topo, cada exame com sua linha e achados
    const d = document.createElement("div"); d.innerHTML = html;
    if (isParHeader(d.firstElementChild)) d.firstElementChild.remove();
    html = d.innerHTML;
    const h = sheet.firstElementChild;
    if (isParHeader(h) && h.nextElementSibling && h.nextElementSibling.textContent.trim()) h.insertAdjacentHTML("afterend", BLANK);
  }
  // a linha em branco do cursor no fim não acumula entre as máscaras
  while (sheet.children.length > 1 && !sheet.lastElementChild.textContent.trim()) sheet.lastElementChild.remove();
  sheet.insertAdjacentHTML("beforeend", BLANK + html);
  modelSig = ""; store.set("modelSig", ""); pushVersion("Modelo adicionado"); scheduleCaseSave();
  cursorAfterModel();
}
/* texto da folha sem o que está riscado em vermelho */
function sheetTextNodes(root){
  const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && n.parentElement.closest("del.rm") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  let n; while ((n = w.nextNode())) out.push(n); return out;
}
const blockText = b => sheetTextNodes(b).map(n => n.nodeValue).join("");
function rangeFromOffsets(root, s, e){
  const nodes = sheetTextNodes(root); if (!nodes.length) return null;
  let pos = 0, sN = null, sO = 0, eN = null, eO = 0;
  for (const n of nodes){
    const L = n.nodeValue.length;
    if (!sN && pos + L > s){ sN = n; sO = s - pos; }
    if (sN && pos + L >= e){ eN = n; eO = e - pos; break; }
    pos += L;
  }
  const last = nodes[nodes.length - 1];
  if (!sN){ sN = last; sO = last.nodeValue.length; }
  if (!eN){ eN = last; eO = last.nodeValue.length; }
  const r = document.createRange(); r.setStart(sN, sO); r.setEnd(eN, eO); return r;
}
function offsetOf(root, node, off){
  const r = document.createRange(); r.setStart(root, 0);
  try{ r.setEnd(node, off); }catch(e){ return 0; }
  let pos = 0;
  for (const n of sheetTextNodes(root)){
    if (r.comparePoint(n, 0) > 0) break;
    pos += (n === r.endContainer ? r.endOffset : n.nodeValue.length);
    if (n === r.endContainer) break;
  }
  return pos;
}
/* insere texto (várias linhas) no cursor da folha */
function insertAtCaret(text){
  focusSheet();
  String(text).split("\n").forEach((ln, i) => { if (i) document.execCommand("insertParagraph"); if (ln) document.execCommand("insertText", false, ln); });
  scheduleEditVersion();
}
function setClinica(clin){
  const ps = [...sheet.children], i = ps.findIndex(p => norm(p.textContent) === "informações clínicas");
  const mk = t => { const p = document.createElement("p"); p.setAttribute("style", PSTYLE); p.textContent = t; return p; };
  if (i >= 0){
    const nx = ps[i + 1];
    if (nx && !nx.textContent.trim() && !isHeading(nx.textContent)){ nx.textContent = clin; }
    else ps[i].after(mk(clin));
  } else if (ps.length) (ps[1] || ps[0]).after(mk("Informações clínicas: " + clin.replace(/[.\s]+$/, "") + "."));
  else sheet.append(mk(clin));
  scheduleCaseSave(); renderAlerts();
}
/* ---- edições marcadas: verde = texto novo do Claude · vermelho = apagado/trocado (clique desfaz) ---- */
let editSeq = 0;
const lineKey = l => fold(stripMarks(l)).replace(/\s+/g, " ").trim();
function lcsOps(a, b, eq){
  const n = a.length, m = b.length, d = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) d[i][j] = eq(a[i], b[j]) ? d[i+1][j+1] + 1 : Math.max(d[i+1][j], d[i][j+1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m){
    if (eq(a[i], b[j])){ ops.push(["=", i, j]); i++; j++; }
    else if (d[i+1][j] >= d[i][j+1]){ ops.push(["-", i]); i++; } else { ops.push(["+", j]); j++; }
  }
  while (i < n) ops.push(["-", i++]); while (j < m) ops.push(["+", j++]);
  return ops;
}
const wordSet = t => new Set(fold(stripMarks(t)).split(/[^a-z0-9]+/).filter(w => w.length > 2));
function simil(a, b){
  const na = lineKey(a).replace(/\.$/, "");
  if (/^\d+$/.test(na) && lineKey(b).startsWith(na + ".")) return 1;   // "1." vazio preenchido: é a mesma linha
  const A = wordSet(a), B = wordSet(b); if (!A.size || !B.size) return 0; let k = 0; for (const w of A) if (B.has(w)) k++; return k / (A.size + B.size - k); }
function pairGap(dels, adds){
  const res = []; let di = 0;
  for (const a of adds){
    let best = -1, bs = 0;
    for (let k = di; k < dels.length; k++){ const s = simil(dels[k], a.t); if (s > bs){ bs = s; best = k; } }
    if (best >= 0 && bs >= 0.3){ for (let k = di; k < best; k++) res.push({ del: dels[k] }); res.push({ del: dels[best], add: a }); di = best + 1; }
    else res.push({ add: a });
  }
  for (let k = di; k < dels.length; k++) res.push({ del: dels[k] });
  return res;
}
const delEl = (t, id) => `<del class="rm" data-e="${id}" contenteditable="false" title="Clique para voltar ao texto anterior">${fmtInline(t)}</del>`;
const insEl = (t, id) => `<span class="chg" data-e="${id}">${fmtInline(t)}</span>`;
function wordDiffHtml(oldT, newT){
  const id0 = ++editSeq;
  if (/<\/?[bui]>/i.test(oldT + newT)) return delEl(oldT, id0) + " " + insEl(newT, id0);
  const a = oldT.split(/\s+/).filter(Boolean), b = newT.split(/\s+/).filter(Boolean), ops = lcsOps(a, b, (x, y) => x === y);
  const out = []; let dels = [], adds = [];
  const flush = () => { if (!dels.length && !adds.length) return; const id = ++editSeq; if (dels.length) out.push(delEl(dels.join(" "), id)); if (adds.length) out.push(insEl(adds.join(" "), id)); dels = []; adds = []; };
  for (const [op, i, j] of ops){
    if (op === "=") { flush(); out.push(esc(b[j])); } else if (op === "-") dels.push(a[i]); else adds.push(b[i]);
  }
  flush();
  return out.join(" ");
}
/* compara o texto que o médico tinha com o devolvido e monta a folha com as marcações */
function diffLaudoHtml(oldText, newText){
  const clean = t => deMarkdown(t).replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  const parecer = current.tipo === "parecer";
  const oldL = clean(oldText); let newL = clean(newText);
  newL = newL.filter((t, i) => !(norm(stripMarks(t)) === "achados adicionais" && (i === newL.length - 1 || isHeading(newL[i + 1]))));
  const ops = lcsOps(oldL, newL, (x, y) => lineKey(x) === lineKey(y));
  const units = []; let dels = [], adds = [];
  const flushGap = () => { for (const u of pairGap(dels, adds)) units.push(u); dels = []; adds = []; };
  for (const [op, i, j] of ops){
    if (op === "=") { flushGap(); units.push({ same: newL[j], idx: j }); }
    else if (op === "-") dels.push(oldL[i]); else adds.push({ t: newL[i], idx: i });
  }
  flushGap();
  /* pairGap recebe strings de add: normaliza (adds viraram objetos) */
  return units.map(u => {
    if (u.same !== undefined){
      const { al, t } = splitAlign(u.same);
      if (!parecer && u.idx === 0) return P(fmt(fmtInline(stripTags(t)), FORMAT.title), al);
      if (!parecer && isHeading(t)) return BLANK + P(fmt(fmtInline(stripTags(t)), FORMAT.heading), al);
      return P(fmtInline(t), al);
    }
    if (u.del !== undefined && u.add !== undefined){
      const { al, t } = splitAlign(u.add.t), o = splitAlign(u.del).t;
      if (!parecer && u.add.idx === 0) return P(fmt(fmtInline(stripTags(t)), FORMAT.title), al);
      if (!parecer && isHeading(t)) return BLANK + P(fmt(fmtInline(stripTags(t)), FORMAT.heading), al);
      return P(wordDiffHtml(o, t), al);
    }
    if (u.add !== undefined){
      const { al, t } = splitAlign(u.add.t);
      if (!parecer && u.add.idx === 0) return P(fmt(fmtInline(stripTags(t)), FORMAT.title), al);
      if (!parecer && isHeading(t)) return BLANK + P(fmt(fmtInline(stripTags(t)), FORMAT.heading), al);
      return P(insEl(t, ++editSeq), al);
    }
    const o = splitAlign(u.del).t;
    if (!parecer && isHeading(o)) return "";
    return `<p class="rmline" style="${PSTYLE}">${delEl(o, ++editSeq)}</p>`;
  }).join("");
}
function collapseSpaces(p){
  p.normalize();
  const ns = sheetTextNodes(p);
  for (const n of ns) n.nodeValue = n.nodeValue.replace(/ {2,}/g, " ");
  if (ns.length){ ns[0].nodeValue = ns[0].nodeValue.replace(/^ +/, ""); const z = ns[ns.length - 1]; z.nodeValue = z.nodeValue.replace(/ +$/, ""); }
}
function revertEdit(id){
  const els = [...sheet.querySelectorAll(`[data-e="${id}"]`)];
  const parents = new Set();
  for (const el of els){
    const par = el.closest("p,div,li") || el.parentElement; parents.add(par);
    if (el.matches("del.rm")){ el.replaceWith(document.createTextNode(el.textContent)); if (par && par.classList.contains("rmline")) par.classList.remove("rmline"); }
    else el.remove();
  }
  parents.forEach(p => p && p !== sheet && collapseSpaces(p));
  pushVersion("Edição desfeita"); renderAlerts(); scheduleCaseSave();
}
sheet.addEventListener("mousedown", e => { if (e.target.closest && e.target.closest("del.rm")) e.preventDefault(); });
sheet.addEventListener("click", e => { const d = e.target.closest && e.target.closest("del.rm"); if (!d) return; e.preventDefault(); revertEdit(d.dataset.e); });
/* aceita tudo: some o vermelho e o verde vira texto normal (usado ao copiar) */
function acceptAllEdits(){
  const had = sheet.querySelector("del.rm, .chg, p.rmline");
  sheet.querySelectorAll("del.rm").forEach(d => d.remove());
  sheet.querySelectorAll("p.rmline").forEach(p => p.remove());
  sheet.querySelectorAll(".chg").forEach(s => s.replaceWith(...s.childNodes));
  sheet.querySelectorAll(":scope > p, :scope > div, li").forEach(collapseSpaces);
  /* "Achados adicionais" sem nada embaixo não vai para o laudo */
  const ps = [...sheet.children];
  for (let i = ps.length - 1; i >= 0; i--){
    if (!ps[i].textContent.trim()) continue;
    if (norm(ps[i].textContent) === "achados adicionais"){ if (ps[i-1] && !ps[i-1].textContent.trim()) ps[i-1].remove(); ps[i].remove(); }
    break;
  }
  return !!had;
}
function lockSheet(on){ sheet.contentEditable = on ? "false" : "true"; }

function maskHtml(ex){
  const parecer = ex.tipo === "parecer";
  let out = "", vazio = false, first = true;
  for (const raw of maskLines(ex)){
    if (!raw){ out += BLANK; vazio = true; continue; }
    const { al, t } = splitAlign(raw); let m;
    if (!parecer && first) out += P(fmt(fmtInline(stripTags(t)), FORMAT.title), al);
    else if (!parecer && isHeading(t)) out += (vazio ? "" : BLANK) + P(fmt(fmtInline(stripTags(t)), FORMAT.heading), al);
    else if (t === "[<>]") out += P(`<span class="fill">[campo a preencher]</span>`, al);
    else if ((m = t.match(/^\[<(.*)>\]$/))) out += P(fmtInline(m[1]), al);
    else if ((m = t.match(/^\[(.*)\]$/))) out += P(`<span class="opt">${fmtInline(m[1])} (opcional)</span>`, al);
    else out += P(fmtInline(t), al);
    first = false; vazio = false;
  }
  return out;
}
function openMask(){
  $("modalTitle").textContent = "Máscara · " + fullName(current) + (current.mine ? "" : " (provisória)");
  $("maskSheet").innerHTML = maskHtml(current);
  $("modal").hidden = false; $("modalUse").focus();
}
function closeMask(focusDict){ $("modal").hidden = true; if (focusDict) focusSheet(); }
$("verMask").onclick = openMask;
$("modalX").onclick = () => closeMask(false);
$("modalClose").onclick = () => closeMask(false);
$("modalUse").onclick = () => closeMask(true);
$("modal").addEventListener("click", e => { if (e.target === $("modal")) closeMask(false); });

/* ---------- sexo ---------- */

function detectSexo(t){
  const f = fold(String(t || ""));
  if (/\b(sexo )?(feminino|feminina|mulher|paciente do sexo feminino)\b/.test(f)) return "F";
  if (/\b(sexo )?(masculino|homem|paciente do sexo masculino)\b/.test(f)) return "M";
  return "";
}
function syncSexo(){ sexo = detectSexo(laudoText()); }
function sexText(){
  if (!current.sexo) return "";
  return sexo === "M" ? "Masculino" : sexo === "F" ? "Feminino" : "não informado";
}
function sexLine(){
  if (!current.sexo) return "";
  syncSexo();
  return sexo ? `SEXO DO PACIENTE: ${sexText()} (dito pelo médico — use-o e NÃO o liste como dado faltante)\n` : "SEXO DO PACIENTE: procure no ditado; se não houver, omita próstata e útero e registre em Dado faltante.\n";
}


/* ---------- regras de estilo (salvas no banco da página) ---------- */
let db = null, rules = [];
function rulesFor(ex){ return rules.filter(r => r.exame === "todos" || r.exame === ex.id); }
function rulesBlock(){
  const rs = rulesFor(current);
  return rs.length ? rs.map(r => "- " + r.texto).join("\n") : "";
}
function renderRules(){
  const ul = $("ruleList"); ul.textContent = "";
  $("ruleCount").textContent = "(" + rules.length + ")";
  if (!rules.length){ const li = document.createElement("li"); li.className = "empty"; li.textContent = db ? "Nenhuma regra ainda." : "As regras não podem ser salvas nesta visualização."; ul.append(li); return; }
  const exName = id => id === "todos" ? "Todos" : (EXAMS.find(e => e.id === id)?.code || id);
  for (const r of rules){
    const li = document.createElement("li");
    const chip = document.createElement("span"); chip.className = "chip " + (r.origem === "edição" ? "c-ok" : "c-info"); chip.textContent = exName(r.exame) + (r.origem === "edição" ? " · edição" : "");
    const tx = document.createElement("span"); tx.textContent = r.texto;
    const del = document.createElement("button"); del.className = "del"; del.type = "button"; del.textContent = "Excluir"; del.setAttribute("aria-label", "Excluir regra: " + r.texto);
    del.onclick = async () => { try{ await db.doc("regras/" + r.id).delete(); }catch(e){ $("styleReply").textContent = "Não foi possível excluir. Tente de novo."; } };
    li.append(chip, tx, del); ul.append(li);
  }
}
async function addRules(list, origem){
  if (!db || !list || !list.length) return 0;
  let n = 0;
  for (const r of list){
    const texto = String(r.texto || "").trim(); if (!texto) continue;
    const exame = EXAMS.some(e => e.id === r.exame) ? r.exame : "todos";
    try{ await db.collection("regras").add({ texto, exame, origem, criadoEm: new Date().toISOString() }); n++; }
    catch(e){ if (e && e.code === "quota_exceeded"){ $("styleReply").textContent = "Limite de regras atingido. Exclua algumas."; break; } }
  }
  return n;
}
async function removeRules(ids){
  if (!db || !ids) return;
  for (const id of ids){ if (rules.some(r => r.id === id)) { try{ await db.doc("regras/" + id).delete(); }catch(e){} } }
}
function rulesListForPrompt(){ return rules.map(r => `${r.id} | ${r.exame} | ${r.texto}`).join("\n") || "(nenhuma)"; }
const examIds = () => EXAMS.map(e => `"${e.id}" (${e.name})`).join(", ");


/* ---------- comandos de voz: frases, correções, comandos (salvos no banco da página) ---------- */
const ACOES = { proximo_campo:"Próximo campo", proxima_secao:"Próxima seção", secao_anterior:"Seção anterior", ir_adicionais:"Ir para os achados adicionais", sugerir_conclusao:"Sugerir a conclusão (sem Claude)", ir_conclusao:"Ir para a conclusão", ir_achados:"Ir para os achados do laudo", ir_tecnica:"Ir para a técnica", ir_clinica:"Ir para as informações clínicas", ir_fim:"Ir para o fim do laudo", voltar_ditado:"Voltar o cursor para o laudo", selecionar_frase:"Selecionar a última frase", foco:"Modo foco (liga/desliga)", plantao:"Modo plantão (liga/desliga)", normal:"Exame normal", gerar:"Gerar laudo", copiar:"Copiar laudo", novo:"Novo exame", revisar:"Revisar laudo", apagar_frase:"Apagar última frase", apagar_isso:"Apagar último trecho" };
const BUILTIN_CMDS = [
  { fala:"próximo campo", acao:"proximo_campo" }, { fala:"campo seguinte", acao:"proximo_campo" },
  { fala:"vá para conclusão", acao:"ir_conclusao" }, { fala:"vai para conclusão", acao:"ir_conclusao" }, { fala:"ir para conclusão", acao:"ir_conclusao" }, { fala:"vá para a conclusão", acao:"ir_conclusao" },
  { fala:"vá para achados", acao:"ir_achados" }, { fala:"vai para achados", acao:"ir_achados" }, { fala:"ir para achados", acao:"ir_achados" }, { fala:"vá para os achados", acao:"ir_achados" },
  { fala:"vá para técnica", acao:"ir_tecnica" }, { fala:"vá para informações clínicas", acao:"ir_clinica" },
  { fala:"vá para o fim", acao:"ir_fim" }, { fala:"voltar para o ditado", acao:"voltar_ditado" }, { fala:"voltar ao ditado", acao:"voltar_ditado" },
  { fala:"selecionar última frase", acao:"selecionar_frase" }, { fala:"selecionar frase", acao:"selecionar_frase" },
  { fala:"exame normal", acao:"normal" }, { fala:"laudo normal", acao:"normal" }, { fala:"gerar laudo", acao:"gerar" }, { fala:"gerar o laudo", acao:"gerar" }, { fala:"gera laudo", acao:"gerar" }, { fala:"copiar laudo", acao:"copiar" }, { fala:"copiar o laudo", acao:"copiar" }, { fala:"copia laudo", acao:"copiar" }, { fala:"copia o laudo", acao:"copiar" }, { fala:"novo exame", acao:"novo" }, { fala:"novo laudo", acao:"novo" }, { fala:"próximo exame", acao:"novo" },
  { fala:"próxima seção", acao:"proxima_secao" }, { fala:"seção seguinte", acao:"proxima_secao" }, { fala:"próximo título", acao:"proxima_secao" },
  { fala:"seção anterior", acao:"secao_anterior" }, { fala:"voltar seção", acao:"secao_anterior" },
  { fala:"conclusão", acao:"ir_conclusao" }, { fala:"achados", acao:"ir_achados" }, { fala:"técnica", acao:"ir_tecnica" }, { fala:"informações clínicas", acao:"ir_clinica" },
  { fala:"achados adicionais", acao:"ir_adicionais" }, { fala:"vá para achados adicionais", acao:"ir_adicionais" },
  { fala:"sugerir conclusão", acao:"sugerir_conclusao" }, { fala:"sugere conclusão", acao:"sugerir_conclusao" }, { fala:"conclusão automática", acao:"sugerir_conclusao" },
  { fala:"revisar laudo", acao:"revisar" }, { fala:"apagar frase", acao:"apagar_frase" }, { fala:"apagar isso", acao:"apagar_isso" }
];
let frases = [], correcoes = [], comandos = [], macros = [];
let dictOk = new Set();   // palavras/trechos que o médico confirmou como corretos
/* termos da(s) máscara(s) aberta(s) + correções aprendidas: o reconhecimento de voz dá mais peso a eles */
function vocabExame(){
  const seen = new Set(), out = [];
  const add = t => { for (const w of String(t).split(/[^A-Za-zÀ-ú-]+/)) { const k = fold(w); if (w.length >= 5 && !seen.has(k) && !STOP.has(k)){ seen.add(k); out.push(w.toLowerCase()); } } };
  // termos que o médico já corrigiu vêm primeiro (valem mais e nunca são cortados pelo limite); depois os da máscara
  for (const c of correcoes) add(c.para);
  try{ add(stripTags(maskAll())); }catch(e){}
  return out.slice(0, 150);
}
/* o termo certo de cada correção salva entra na hora no vocabulário geral (escolha entre as alternativas, junção "sub galeal" -> "subgaleal") */
function vocabCorrecoes(){
  try{
    if (typeof VOCAB === "undefined") return;
    const tem = new Set(VOCAB);
    for (const c of correcoes) for (const w of String(c.para || "").toLowerCase().split(/[^a-zà-úç-]+/)) if (w.length >= 5 && !tem.has(w)){ tem.add(w); VOCAB.unshift(w); }
    if (typeof KNOWN !== "undefined") for (const c of correcoes) for (const w of fold(String(c.para || "")).split(/[^a-z]+/)) if (w.length >= 3) KNOWN.add(w);
  }catch(e){}
}
/* nomes próprios que nunca aparecem em minúscula no banco/máscaras (Hounsfield, Willis...): o ditado mantém a maiúscula no meio da frase */
let capBase = null;
function maiusculasMeio(){
  const scan = (t, caps, low) => { for (const s of String(t).split(/[.!?:;\n]+/)) { const ws = s.split(/[^\p{L}]+/u).filter(Boolean); for (let i = 1; i < ws.length; i++){ const w = ws[i];
    if (/^\p{Lu}\p{Ll}{3,}$/u.test(w)) caps.add(fold(w)); else if (/^\p{Ll}/u.test(w)) low.add(fold(w)); } } };
  if (!capBase){ capBase = { caps: new Set(), low: new Set() }; try{ for (const e of BANK) scan(e[3], capBase.caps, capBase.low); }catch(e){} }
  const caps = new Set(capBase.caps), low = new Set(capBase.low);
  try{ scan(stripTags(maskAll()), caps, low); }catch(e){}
  return [...caps].filter(w => !low.has(w)).slice(0, 300);
}
function publishVoice(){
  vocabCorrecoes();
  const cfg = {
    commands: [...BUILTIN_CMDS, ...comandos.map(c => ({ fala:c.fala, acao:c.acao })),
      ...EXAMS.flatMap(e => (e.voz || []).filter(v => /^parecer\b/i.test(v)).map(v => ({ fala:v, acao:"exame:" + e.id })))],
    exams: EXAMS.map(e => ({ id:e.id, voz:e.voz || [], nome:shortName(e), parecer:e.tipo === "parecer" })),
    frases: frases.map(f => ({ nome:f.nome, texto:f.texto })),
    vocab: window.__VOCAB || [],
    vocabExame: vocabExame(),
    maiusculas: maiusculasMeio(),
    correcoes: [...correcoes.map(c => ({ de:c.de, para:c.para, ...(Array.isArray(c.ctx) && c.ctx.length ? { ctx:c.ctx } : {}) })),
      ...frases.flatMap(f => [{ de:"autotexto " + f.nome, para:String(f.texto) }, { de:"auto texto " + f.nome, para:String(f.texto) }]),
      ...macros.flatMap(m => { const t = String(m.texto); const a = "macro " + m.nome, b = "macro " + fold(m.nome); return a === b ? [{ de:a, para:t }] : [{ de:a, para:t }, { de:b, para:t }]; })]
  };
  $("voiceConfig").textContent = JSON.stringify(cfg);
}
function vozMsg(t, err){ $("vozMsg").textContent = t; $("vozMsg").style.color = err ? "var(--crit)" : "var(--ok)"; }
function listItem(k, v, onDel, fixed, onEdit){
  const li = document.createElement("li");
  const a = document.createElement("span"); a.className = "k"; a.textContent = k;
  const b = document.createElement("span"); b.textContent = v;
  li.append(a, b);
  if (fixed){ const f = document.createElement("span"); f.className = "fixed"; f.textContent = "padrão"; li.append(f); }
  else {
    const acts = document.createElement("span"); acts.className = "acts";
    if (onEdit){ const e = document.createElement("button"); e.className = "edit"; e.type = "button"; e.textContent = "Editar"; e.setAttribute("aria-label", "Editar " + k); e.onclick = onEdit; acts.append(e); }
    const d = document.createElement("button"); d.className = "del"; d.type = "button"; d.textContent = "Excluir"; d.setAttribute("aria-label", "Excluir " + k); d.onclick = onDel; acts.append(d);
    li.append(acts);
  }
  return li;
}
function emptyItem(t){ const li = document.createElement("li"); li.className = "empty"; li.textContent = t; return li; }
async function delDoc(col, id){ try{ await db.doc(col + "/" + id).delete(); }catch(e){ vozMsg("Não foi possível excluir. Tente de novo.", true); } }
function renderVoz(){
  const fl = $("fList"); fl.textContent = "";
  if (!frases.length) fl.append(emptyItem(db ? "Nenhum autotexto ainda." : "Indisponível nesta visualização."));
  for (const f of frases) fl.append(listItem("autotexto " + f.nome, f.texto, () => delDoc("frases", f.id), false, () => startEdit("frases", f)));
  const cl = $("cList"); cl.textContent = "";
  if (!correcoes.length) cl.append(emptyItem("Nenhuma correção ainda."));
  for (const c of correcoes) cl.append(listItem(c.de, "→ " + c.para, () => delDoc("correcoes", c.id), false, () => startEdit("correcoes", c)));
  const ml = $("mcList"); ml.textContent = "";
  if (!macros.length) ml.append(emptyItem("Nenhuma macro ainda."));
  for (const m of macros) ml.append(listItem("macro " + m.nome, m.texto, () => delDoc("macros", m.id), false, () => startEdit("macros", m)));
  const kl = $("kList"); kl.textContent = "";
  for (const c of BUILTIN_CMDS) kl.append(listItem(c.fala, ACOES[c.acao], null, true));
  kl.append(listItem("máscara / exame + nome", "Troca o exame (ex.: " + EXAMS.map(e => (e.voz||[])[0]).filter(Boolean).join(", ") + ")", null, true));
  kl.append(listItem("pausar / reiniciar", "Pausa e retoma o ditado", null, true));
  for (const c of comandos) kl.append(listItem(c.fala, ACOES[c.acao] || c.acao, () => delDoc("comandos", c.id), false, () => startEdit("comandos", c)));
  publishVoice();
}
const vnorm = s => fold(String(s)).replace(/[.,;:!?"]/g, "").replace(/\s+/g, " ").trim();
async function addFrase(nome, texto, id){
  nome = vnorm(nome).replace(/^(frase|auto\s?texto)\s+/, ""); texto = String(texto || "").trim();
  if (!db || !nome || !texto) return false;
  const old = id ? frases.find(f => f.id === id) : frases.find(f => vnorm(f.nome) === nome);
  if (old) await db.doc("frases/" + old.id).set({ nome, texto, criadoEm: old.criadoEm || new Date().toISOString() });
  else await db.collection("frases").add({ nome, texto, criadoEm: new Date().toISOString() });
  return true;
}
/* ctx (opcional): palavras vizinhas onde a troca vale (correção de palavra que também existe); sem ctx vale em qualquer lugar */
async function addCorrecao(de, para, id, ctx){
  // "de" é o trecho errado inteiro, sem pontuação nas pontas (a extensão também aplica a regra a variantes próximas: junto, com hífen, uma letra diferente)
  de = String(de || "").replace(/\s+/g, " ").replace(/^[\s.,;:!?"]+|[\s.,;:!?"]+$/g, ""); para = String(para || "").trim();
  if (!db || !de || !para) return false;
  const old = id ? correcoes.find(c => c.id === id) : correcoes.find(c => vnorm(c.de) === vnorm(de));
  const cx = Array.isArray(ctx) ? ctx : (id && old && Array.isArray(old.ctx) ? old.ctx : null);
  const doc = { de, para, ...(cx && cx.length ? { ctx: cx } : {}) };
  if (old) await db.doc("correcoes/" + old.id).set({ ...doc, criadoEm: old.criadoEm || new Date().toISOString() });
  else await db.collection("correcoes").add({ ...doc, criadoEm: new Date().toISOString() });
  return true;
}
async function addComando(fala, acao, id){
  fala = vnorm(fala);
  if (!db || !fala || !ACOES[acao]) return false;
  const old = id ? comandos.find(c => c.id === id) : comandos.find(c => vnorm(c.fala) === fala);
  if (old) await db.doc("comandos/" + old.id).set({ fala, acao, criadoEm: old.criadoEm || new Date().toISOString() });
  else await db.collection("comandos").add({ fala, acao, criadoEm: new Date().toISOString() });
  return true;
}
const VOZ_FORMS = {
  frases:   { btn:"fAdd",  label:"Adicionar autotexto", fields:{ fNome:"nome", fTexto:"texto" } },
  correcoes:{ btn:"cAdd",  label:"Adicionar",       fields:{ cDe:"de", cPara:"para" } },
  macros:   { btn:"mcAdd", label:"Adicionar macro", fields:{ mcNome:"nome", mcTexto:"texto" } },
  comandos: { btn:"kAdd",  label:"Adicionar",       fields:{ kFala:"fala", kAcao:"acao" } }
};
const editingVoz = { frases:null, correcoes:null, macros:null, comandos:null };
function startEdit(kind, item){
  const f = VOZ_FORMS[kind];
  for (const [id, key] of Object.entries(f.fields)) $(id).value = item[key] ?? "";
  editingVoz[kind] = item.id;
  $(f.btn).textContent = "Salvar alterações";
  let c = $(f.btn + "Cancel");
  if (!c){ c = document.createElement("button"); c.id = f.btn + "Cancel"; c.type = "button"; c.className = "btn ghost small"; c.textContent = "Cancelar"; c.onclick = () => endEdit(kind); $(f.btn).after(c); }
  c.hidden = false;
  vozMsg("Editando. Altere e clique em Salvar alterações.");
  $(Object.keys(f.fields)[0]).focus();
}
function endEdit(kind){
  const f = VOZ_FORMS[kind];
  editingVoz[kind] = null;
  for (const id of Object.keys(f.fields)) if ($(id).tagName !== "SELECT") $(id).value = "";
  $(f.btn).textContent = f.label;
  const c = $(f.btn + "Cancel"); if (c) c.hidden = true;
}
function vozTab(t){
  document.querySelectorAll("#vozModal [data-vt]").forEach(b => b.setAttribute("aria-selected", b.dataset.vt === t));
  document.querySelectorAll("#vozModal [data-vp]").forEach(p => p.hidden = p.dataset.vp !== t);
}

/* ---------- ditado ---------- */
function updateCount(){
  const t = laudoText().trim(), n = t ? t.split(/\s+/).length : 0;
  $("count").textContent = n + (n === 1 ? " palavra" : " palavras");
}
sheet.addEventListener("input", updateCount);

$("limpar").onclick = () => {
  saveCaseNow(); newCase(); extras = [];
  $("compData").value = ""; $("compTexto").value = ""; $("compBox").open = false; updComp();
  sexo = ""; setStatus(""); loadModel(current); cursorAfterModel();
};
/* máscara falada ("modelo ..."): sempre abre como exame novo e guarda o anterior no histórico */
function openMaskAsNew(ex){
  if (sheetHasContent() && !modelIntact()) saveCaseNow();
  newCase(); extras = []; current = ex; store.set("exame", ex.id);
  $("exams").querySelectorAll("button.exam").forEach(b => b.setAttribute("aria-pressed", b.dataset.id === ex.id ? "true" : "false"));
  $("plantaoExam").value = ex.id; updMaskChip();
  $("compData").value = ""; $("compTexto").value = ""; $("compBox").open = false; updComp();
  sexo = ""; loadModel(ex); cursorAfterModel();
}

/* ---------- status ---------- */
const emitExt = (name, d) => document.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(d) }));
function setStatus(msg, kind){ const s = $("status"); s.textContent = msg; s.className = "status" + (kind ? " " + kind : ""); }
const ERR = {
  not_granted: "O uso do Claude nesta página não foi autorizado. Recarregue a página e permita quando for perguntado.",
  sampling_disabled: "O Claude não está disponível para esta conta.",
  rate_limited: "Limite de uso atingido por agora. Tente de novo em alguns minutos.",
  session_expired: "Sua sessão expirou. Entre de novo no claude.ai.",
  prompt_too_large: "Texto grande demais. Encurte o ditado.",
  refused: "O Claude não respondeu a esse pedido. Reformule os achados.",
  empty_completion: "O Claude não devolveu texto. Tente reformular.",
};
const errMsg = e => ERR[e && e.code] || "Falha de conexão. Tente de novo.";


/* ---------- revisão ---------- */
const REVIEW_RULES = `Categorias permitidas (use exatamente estes nomes): Inconsistência, Dúvida de ditado, Dado faltante, Ortografia, Concordância, Terminologia, Sugestão.
- Inconsistência: lateralidade, medidas, achado descrito nos Achados e ausente na Conclusão (ou o contrário), classificação incoerente.
- Dúvida de ditado: palavra que pode ter sido mal reconhecida pelo ditado por voz.
- Dado faltante: informação necessária para classificar ou recomendar (ex.: tamanho, fase, realce).
- Ortografia / Concordância: erro de português, indicando o trecho e a correção.
- Terminologia: termo mais técnico ou mais correto (CBR / RadLex / Fleischner), com a troca sugerida.
- Sugestão: apenas complementos estritamente necessários (ex.: recomendação de seguimento prevista em diretriz). Não sugira nada opcional.
Formato: uma linha por item, "- [Categoria] texto curto". Se não houver nada, escreva só "- [OK] Nada a conferir."`;
const CAT = { "inconsistencia":"c-crit", "duvida de ditado":"c-warn", "dado faltante":"c-warn", "ortografia":"c-info", "concordancia":"c-info", "terminologia":"c-info", "sugestao":"c-ok", "ok":"c-ok" };
function resetReview(){ confItems = []; $("reviewBody").innerHTML = '<p class="review-empty">Clique em Conferir: a página confere na hora, sem gastar tokens. Depois, se quiser, peça a conferência do Claude.</p>'; }
function showReview(text, pending){
  const items = text.split("\n").map(l => l.trim()).filter(l => l.startsWith("-")).map(l => l.replace(/^-\s*/,""));
  const body = $("reviewBody");
  if (!items.length){ body.innerHTML = `<p class="review-empty">${pending ? "Revisando…" : "Sem itens de revisão."}</p>`; return; }
  const ul = document.createElement("ul");
  for (const it of items){
    const m = it.match(/^\[([^\]]+)\]\s*(.*)$/);
    const cat = m ? m[1] : "Nota", txt = m ? m[2] : it;
    const li = document.createElement("li");
    const chip = document.createElement("span"); chip.className = "chip " + (CAT[fold(cat)] || "c-info"); chip.textContent = cat;
    const sp = document.createElement("span"); sp.textContent = txt;
    li.append(chip, sp); ul.append(li);
  }
  body.textContent = ""; body.append(ul);
}

/* ---------- prompt do laudo ---------- */
const RECS_RULE = `RECOMENDAÇÕES AUTOMÁTICAS (ativadas pelo médico): para achados incidentais com conduta definida em diretriz (ACR Incidental Findings: lesão renal, nódulo adrenal, cisto pancreático, lesão hepática, lesão anexial, nódulo tireoidiano; Fleischner para nódulo pulmonar; Bosniak 2019; Society for Vascular Surgery para aneurisma de aorta), acrescente a recomendação de seguimento em frase curta, citando a diretriz, junto ao item correspondente da conclusão (ou em linha própria no parecer). Não recomende nada para achados sem indicação de seguimento.`;
const MARKS_RULE = `Algumas linhas podem começar com {{centro}}, {{justificado}} ou {{direita}} (alinhamento do texto): mantenha esses marcadores no início das linhas que vierem da máscara. Linhas que começam com "• " são itens de lista: mantenha o marcador.`;
function normalSetAll(){ const set = new Set(); for (const ex of [current, ...extras]) for (const x of normalSet(ex)) set.add(x); return set; }
/* trechos que o médico acrescentou ou alterou em relação ao modelo (só isso orienta a busca no banco) */
function userFindings(draft){
  const NS = normalSetAll(), out = [];
  for (const raw of String(draft).split("\n")){
    const t = splitAlign(raw.trim()).t; if (!t.trim() || isHeading(t) || /^\d+\.?\s*$/.test(t.trim())) continue;
    const body = stripTags(t).replace(/^\d+\.\s+/, "");
    const fresh = splitSent(body).filter(x => !NS.has(normSent(x)));
    if (fresh.length) out.push(fresh.join(" "));
  }
  return out.join("\n");
}
const CONF_SPEC = `Categorias de "tipo" (use exatamente): Inconsistência, Dado faltante, Dúvida de ditado, Ortografia, Concordância, Terminologia, Alteração adicional, Sugestão.
- Inconsistência: lateralidade, medida, achado nos Achados ausente na Conclusão (ou o contrário), classificação incoerente, órgão incompatível com o sexo.
- Alteração adicional: outra mudança possível que NÃO foi aplicada (melhor termo, frase mais precisa, detalhe que costuma constar).
- Sugestão: melhoria ou complemento clinicamente útil (ex.: diferencial, classificação, recomendação de seguimento por diretriz).
Para itens com correção direta: "de" = trecho EXATO copiado do texto corrigido (curto, que apareça uma única vez, dentro de uma única linha) e "para" = o trecho proposto. Sem correção direta: "de" e "para" vazios. "motivo" curto. No máximo 8 itens, só os úteis.`;
/* Rascunho numerado (L1, L2...). Linhas normais intactas da máscara aparecem só pelo início ("≡ ..."), e o Claude
   responde em DIFF, só com as linhas que mudam (Ln: / +Ln: / -Ln); a página aplica. Economiza entrada e saída. */
let genLines = [];   // { raw, n } por linha do rascunho (n = 0 nas linhas vazias)
function isNormalLine(t, NS){
  const body = stripTags(t);
  return !isHeading(t) && !/^\d/.test(body) && body.length >= 25 && splitSent(body).every(x => NS.has(normSent(x)));
}
function numberDraft(draft){
  const NS = normalSetAll(), out = []; let n = 0; genLines = [];
  for (const raw of String(draft).split("\n")){
    const line = raw.trim();
    if (!line){ genLines.push({ raw, n: 0 }); continue; }
    n++; genLines.push({ raw, n });
    const { t } = splitAlign(line);
    out.push("L" + n + " " + (isNormalLine(t, NS) ? "≡ " + stripTags(t).split(/\s+/).slice(0, 6).join(" ") + " …" : line));
  }
  return out.join("\n");
}
const genProtocol = prompt => /^FORMATO DA RESPOSTA: DIFF/m.test(prompt) ? "diff" : "texto";
const OP_RE = /^\s*(?:[*•]\s+)?([+-]?)\s*L(\d+)\b\s*[:.)\]–—-]?\s?(.*)$/;
/* aplica a resposta em diff; devolve o texto novo, ou null se a resposta não tiver nenhuma operação */
function applyDiff(reply){
  const rep = {}, ins = {}, del = new Set(), ok = new Set(genLines.map(g => g.n).filter(Boolean)); let ops = 0;
  for (const ln of deMarkdown(reply).replace(/\r/g, "").split("\n")){
    const m = ln.match(OP_RE); if (!m) continue;
    const sg = m[1], n = +m[2], t = m[3].trim();
    if (!ok.has(n) || /^≡/.test(t)) continue;
    ops++;
    if (sg === "+"){ if (t) (ins[n] = ins[n] || []).push(t); }
    else if (!t) del.add(n);
    else rep[n] = t;
  }
  if (!ops) return null;
  const out = [];
  for (const g of genLines){
    if (!g.n){ out.push(g.raw); continue; }
    if (rep[g.n] !== undefined) out.push(rep[g.n]); else if (!del.has(g.n)) out.push(g.raw);
    if (ins[g.n]) out.push(...ins[g.n]);
  }
  return out.join("\n");
}
/* texto final a partir da resposta: diff; "OK" = nada muda; null = resposta fora do formato */
function genResult(draft, text){
  const d = applyDiff(text); if (d !== null) return d;
  if (/^\s*ok\.?\s*$/i.test(text)) return draft;
  return null;
}
function buildPrompt(frases, draft){
  const parecer = current.tipo === "parecer";
  const rb = rulesBlock(), ex = examplesBlock(userFindings(draft)), numbered = numberDraft(draft);
  const marks = /\{\{(centro|justificado|direita)\}\}|^\s*• /m.test(draft);
  return `Assistente de laudos de tomografia de um radiologista brasileiro (português do Brasil). Corrija o ${parecer ? "PARECER PROVISÓRIO" : "LAUDO"} abaixo, ditado por voz sobre a máscara do exame.
EXAME: ${nameAll()}
${sexLine()}${rb ? `REGRAS DE ESTILO DO MÉDICO (prioridade máxima):
${rb}
` : ""}TEXTO (linhas numeradas; "≡" = frase normal da máscara, só o início aparece; pode haver erros de reconhecimento de voz):
"""
${numbered}
"""
${extras.length ? (parecer ? "Há vários exames num parecer só: \"PARECER PROVISÓRIO RADIOLOGIA\" fica uma vez no topo; cada exame tem sua linha (\"TC ... data\") com os achados dele logo abaixo, e uma linha em branco entre os exames. Cada achado ditado vai para o exame a que pertence (anatomia).\n" : "Há mais de um exame no texto, em sequência: trate cada um com seu cabeçalho.\n") : ""}${ex ? `${exParecidos ? `LAUDOS ANTERIORES DO MÉDICO COM ACHADOS PARECIDOS (siga a forma de descrever e de concluir; NUNCA copie achados, medidas ou lateralidade deles)` : `TRECHOS DE UM ${parecer ? "PARECER" : "LAUDO"} RECENTE DO MÉDICO (só estilo; NUNCA copie achados)`}:
"""
${ex}
"""
` : ""}${frases.length ? `FRASES DO BANCO DO MÉDICO (forma de descrever, não são achados deste paciente):
${frases.map(s => "- " + s).join("\n")}
` : ""}${volBlock()}REGRAS:
1. Preserve conteúdo e sentido. Nunca invente achados, medidas ou lateralidade; mantenha medidas e unidades (vírgula decimal).
2. Corrija erros do ditado e passe a linguagem falada para linguagem de laudo; se uma frase do banco servir, aproxime a redação dela (adaptando medidas, lateralidade, grau).
3. Cada achado ditado vai para a posição anatômica certa, no lugar da frase normal que ele contradiz (ou logo após a do mesmo órgão), e a linha ditada original é apagada. Uma frase por linha.
4. ${parecer ? "Parecer: mantenha o cabeçalho (\"PARECER PROVISÓRIO RADIOLOGIA\" e a linha do exame). Achados alterados logo abaixo da linha do exame, em frases curtas; apague as negativas que eles contradizem." : "Conclusão: itens numerados (\"1. \", \"2. \"...) por relevância clínica, concisos e coerentes com os achados; se normal: \"1. " + NORMAL_CONCLUSION + "\". Aplique a classificação pertinente (Fleischner, Lung-RADS, LI-RADS, Bosniak 2019, Balthazar etc.) quando os dados permitirem. Achados adicionais: só o que o médico ditou como adicional/incidental; se não houver, apague o título."}
5. Campos não preenchidos ([algo] ou {a|b|c}) saem do texto.${current.sexo ? " Frases opcionais por sexo (próstata / útero e anexos): mantenha só a pertinente; sem o sexo, apague as duas." : ""}
6. Texto puro, sem markdown. Mantenha as marcações <b>, <u>, <i> e os títulos como estão.${marks ? " " + MARKS_RULE : ""}
FORMATO DA RESPOSTA: DIFF, só as linhas que mudam, uma operação por linha, sem comentários:
Ln: texto novo   (substitui a linha n)
+Ln: texto       (insere depois da linha n; várias seguidas ficam nessa ordem)
-Ln              (apaga a linha n)
Linhas não citadas ficam como estão; nunca repita uma linha sem mudança. Se nada mudar, responda só: OK`;
}

/* ---------- renderização do laudo ---------- */
function normSent(s){ return fold(stripMarks(s)).replace(/^\d+\.\s*/,"").replace(/[\s.;:]+$/,"").replace(/\s+/g," ").trim(); }
function splitSent(t){ return t.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/); }
function normalSet(ex){
  const set = new Set([normSent(NORMAL_CONCLUSION)]);
  for (const ln of maskOf(ex).split("\n")){
    const t = splitAlign(ln.trim()).t.replace(/^\[<?/,"").replace(/>?\]$/,"");
    if (!t) continue;
    for (const s of splitSent(t)) set.add(normSent(s));
  }
  return set;
}
function lineHtml(t, NS){
  let pre = "", rest = t;
  const m = t.match(/^(\d+\.\s+)(.*)$/); if (m){ pre = m[1]; rest = m[2]; }
  const parts = splitSent(rest).map(s => NS.has(normSent(s)) ? fmtInline(s) : `<span class="chg">${fmtInline(s)}</span>`);
  const preHtml = pre ? (NS.has(normSent(rest)) ? esc(pre) : `<span class="chg">${esc(pre)}</span>`) : "";
  return preHtml + parts.join(" ");
}
// remove marcações de markdown que o modelo às vezes inclui (**negrito**, __sublinhado__, # títulos)
const deMarkdown = t => String(t).replace(/\*\*|__/g, "").replace(/^[ \t]*#{1,6}[ \t]+/gm, "").replace(/^[ \t]*\*[ \t]+/gm, "");
function toHtml(text){
  let lines = deMarkdown(text).replace(/\r/g,"").split("\n").map(l => l.trim()).filter(Boolean);
  const parecer = current.tipo === "parecer";
  lines = lines.filter((t,i) => !(norm(stripMarks(t)) === "achados adicionais" && (i === lines.length-1 || isHeading(lines[i+1]))));
  const NS = normalSet(current);
  return lines.map((raw,i) => {
    const { al, t } = splitAlign(raw);
    if (!parecer && i === 0) return P(fmt(fmtInline(stripTags(t)), FORMAT.title), al);
    if (!parecer && isHeading(t)) return BLANK + P(fmt(fmtInline(stripTags(t)), FORMAT.heading), al);
    return P(lineHtml(t, NS), al);
  }).join("");
}
function laudoText(){
  return laudoTagged().split("\n").map(stripMarks).join("\n").replace(/\n{3,}/g,"\n\n").trim();
}
function busy(on){
  for (const id of ["gerar","revisar","enviar"]) $(id).disabled = on || (!sample && id !== "revisar");
  $("parar").hidden = !on;
}
let genBusy = false;
function parseConf(rev){
  const t = String(rev || ""), a = t.indexOf("{"), b = t.lastIndexOf("}");
  let arr = [];
  if (a >= 0 && b > a){ try{ const o = JSON.parse(t.slice(a, b + 1)); arr = Array.isArray(o.itens) ? o.itens : []; }catch(e){} }
  return normItems(arr);
}
function normItems(arr){
  const vis = laudoText();
  return (Array.isArray(arr) ? arr : []).filter(it => it && (it.motivo || it.de) && !dictOk.has(fold(String(it.de || "").trim()))).map(it => {
    let de = String(it.de || ""), para = String(it.para ?? "");
    if (!de || de.includes("\n") || !vis.includes(de)){ de = ""; para = ""; }
    return { tipo: String(it.tipo || ""), de, para, motivo: String(it.motivo || "") };
  }).filter(it => it.motivo || it.de).slice(0, 12);
}
function applyGenerated(draft, text){
  const i = text.indexOf(MARK);
  const lau = i === -1 ? text : text.slice(0, i), rev = i === -1 ? "" : text.slice(i + MARK.length);
  pushVersion("Antes da correção");
  sheet.innerHTML = diffLaudoHtml(draft, lau);
  lastGenerated = laudoText(); lastGenTagged = laudoTagged(); pushVersion("Corrigido pelo Claude");
  renderAlerts(); updateCount(); updVolHint(); scheduleCaseSave(); checkedHash = "";
  confItems = parseConf(rev); if (confItems.length) renderConf(); else resetReview();
  return { red: sheet.querySelectorAll("del.rm").length, green: sheet.querySelectorAll(".chg").length };
}
let lastGenTagged = "";   // folha logo depois do último Gerar: se nada mudou, não reenviar ao Claude
async function gerar(){
  if (!sample || genBusy) return;
  const draft = laudoTagged();
  if (draft && draft === lastGenTagged){ setStatus("Nada mudou desde o último Gerar: nada foi enviado ao Claude.", "ok"); return; }
  if (!draft.trim()){ setStatus("A folha está vazia. Diga \"modelo parecer tc crânio\" (ou escolha o exame na lista) e escreva ou dite os achados.", "err"); focusSheet(); return; }
  genBusy = true; syncSexo();
  const fresh = userFindings(draft);
  if (!fresh.trim() && !extras.length){   // nada além do modelo: preenche a conclusão normal direto, sem gastar o Claude
    genBusy = false; laudoNormal(); setStatus("Sem achados novos: conclusão normal preenchida direto do modelo, sem usar o Claude.", "ok"); emitExt("laudos-aviso", { tipo: "pronto" }); return;
  }
  const frases = pickPhrases(fresh);
  const prompt = buildPrompt(frases, draft);
  const bankNote = (frases.length ? `${frases.length} frases do banco usadas como referência.` : "Nenhuma frase do banco corresponde ao texto.") +
    (exParecidos ? ` ${exUsados} ${exUsados === 1 ? "laudo seu parecido usado" : "laudos seus parecidos usados"} como modelo.` : "");
  ctl = new AbortController(); busy(true); lockSheet(true);
  setStatus("Corrigindo o laudo… " + bankNote);
  try{
    const t0 = performance.now();
    const { text, truncated } = await sample(prompt, {
      signal: ctl.signal, cache: false, modelTier: effectiveTier(fresh),
      onText: ({ text }) => setStatus(`Corrigindo… ${text.length} caracteres. ` + bankNote)
    });
    lockSheet(false);
    const out = genResult(draft, text);
    if (out === null){ setStatus("A resposta do Claude veio fora do formato; o laudo ficou como estava. Tente Gerar de novo.", "err"); emitExt("laudos-aviso", { tipo: "erro" }); return; }
    const r = applyGenerated(draft, out);
    emitExt("laudos-aviso", { tipo: "pronto" });
    const secs = ((performance.now() - t0) / 1000).toFixed(0);
    setStatus(truncated ? "A resposta foi cortada no limite de tamanho. Confira o laudo." : (r.red || r.green ? `Laudo corrigido em ${secs} s: verde = editado, vermelho = apagado (clique no vermelho para desfazer). ` : `Laudo conferido em ${secs} s: nenhuma edição necessária. `) + bankNote, truncated ? "err" : "ok");
  }catch(e){
    if (e && e.code === "cancelled") setStatus("Correção interrompida. O texto continua como estava.");
    else { setStatus(errMsg(e), "err"); emitExt("laudos-aviso", { tipo: "erro" }); if (e && (e.code==="not_granted"||e.code==="sampling_disabled")) disableClaude(); }
  }finally{ genBusy = false; busy(false); lockSheet(false); if (document.hasFocus()) focusSheet(); }
}
function revisar(){ return conferirLocal(); }

/* ---------- copiar (sem o verde) ---------- */
function clipboardHtml(){
  const tmp = document.createElement("div");
  tmp.innerHTML = $("laudo").innerHTML;
  tmp.querySelectorAll("del.rm, p.rmline").forEach(s => s.remove());
  tmp.querySelectorAll("span.chg").forEach(s => s.replaceWith(...s.childNodes));
  tmp.querySelectorAll("[style*='color']").forEach(n => n.style.removeProperty("color"));
  tmp.querySelectorAll("font").forEach(f => f.replaceWith(...f.childNodes));
  tmp.querySelectorAll("[style]").forEach(n => { n.style.removeProperty("font-family"); n.style.removeProperty("font-size"); if (!n.getAttribute("style").trim()) n.removeAttribute("style"); });
  tmp.querySelectorAll("span:not([style]):not([class])").forEach(x => x.replaceWith(...x.childNodes));
  /* PACS (editor tipo TX Text Control) ignora "margin:0" abreviado e põe espaço antes/depois do parágrafo:
     margens por extenso em pt; linha vazia com <br> virava duas linhas, então vai com &nbsp;. */
  const cpStyle = `margin-top:0pt;margin-bottom:0pt;margin-left:0pt;margin-right:0pt;text-indent:0pt;line-height:normal;font-family:${FORMAT.font},Helvetica,sans-serif;font-size:${FORMAT.size}`;
  tmp.querySelectorAll("p,div,li").forEach(n => {
    const a = n.style.textAlign; n.setAttribute("style", cpStyle + (a ? ";text-align:" + a : ""));
    if (n.tagName !== "LI" && !n.querySelector("p,div,ul,ol,img") && !n.textContent.replace(/ /g, " ").trim()) n.innerHTML = "&nbsp;";
  });
  tmp.querySelectorAll("ul,ol").forEach(n => n.setAttribute("style", `margin:0;padding-left:24px;font-family:${FORMAT.font},Helvetica,sans-serif;font-size:${FORMAT.size}`));
  return `<div style="font-family:${FORMAT.font},Helvetica,sans-serif;font-size:${FORMAT.size}">${tmp.innerHTML}</div>`;
}
let lastGenerated = "";
const cleanLines = t => t.split("\n").map(l => l.trim()).filter(Boolean);
async function copyToClipboard(plain, html){
  try{
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type:"text/html" }),
      "text/plain": new Blob([plain], { type:"text/plain" })
    })]);
    return true;
  }catch(e){}
  try{
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-9999px;top:0;background:#fff;color:#000";
    holder.innerHTML = html; document.body.append(holder);
    const r = document.createRange(); r.selectNodeContents(holder);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const ok = document.execCommand("copy"); sel.removeAllRanges(); holder.remove();
    if (ok) return true;
  }catch(e){}
  return false;
}
async function doCopy(){
  acceptAllEdits(); normalizeSheet();
  const plain = laudoText();
  if (!plain){ setStatus("Nada para copiar ainda.", "err"); return; }
  const ok = await copyToClipboard(plain, clipboardHtml());
  if (ok){ setStatus(`Laudo copiado em ${FORMAT.font} ${parseFloat(FORMAT.size)} com todas as edições aceitas. Cole no PACS.`, "ok"); emitExt("laudos-aviso", { tipo: "copiado" }); }
  else {
    const r = document.createRange(); r.selectNodeContents($("laudo"));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    setStatus("Laudo selecionado. Aperte Ctrl+C para copiar.");
  }
  saveExample(laudoTagged());
  caseCopied = true; saveCaseNow();
  learnFromEdit(plain);
}
/* Atalho global da extensão (Ctrl+Shift+2): a página entrega o laudo e a extensão copia, mesmo com o PACS na frente */
function copyForExtension(id){
  acceptAllEdits(); normalizeSheet();
  const plain = laudoText();
  if (!plain){ emitExt("laudos-copia", { id, ok: false }); setStatus("Atalho de copiar: ainda não há laudo.", "err"); return; }
  emitExt("laudos-copia", { id, ok: true, html: clipboardHtml(), text: plain });
  setStatus(`Laudo copiado pelo atalho global em ${FORMAT.font} ${parseFloat(FORMAT.size)} (sem o verde).`, "ok");
  saveExample(laudoTagged());
  caseCopied = true; saveCaseNow();
  learnFromEdit(plain);
}
$("copiar").onclick = () => doCopy();

/* ---------- exemplos: últimos laudos finais por exame (só estilo) ---------- */
let examples = {};
/* ---------- laudos anteriores do médico: guarda só o que foge da máscara e usa os mais PARECIDOS com o caso atual ---------- */
const EX_MAX = 40, EX_CHARS = 600;
let exUsados = 0, exParecidos = false;   // último examplesBlock: quantos laudos entraram e se foram escolhidos por semelhança
/* só as linhas alteradas e a conclusão, sem marcações e sem datas (nunca dados do paciente) */
function compactExample(t){
  const NS = normalSetAll();
  const keep = String(t).split("\n").map(l => l.trim()).filter(l => l && !isHeading(splitAlign(l).t) && !isNormalLine(splitAlign(l).t, NS) && !NS.has(normSent(l)));
  let out = "";
  for (let l of keep){
    l = stripTags(splitAlign(l).t).replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "{data}").trim();
    if (!l || out.length + (out ? 1 : 0) + l.length > EX_CHARS) continue;
    out += (out ? "\n" : "") + l;
  }
  return out;
}
async function saveExample(text){
  if (!db) return;
  const c = compactExample(text); if (!c) return;
  const k = fold(c), list = (examples[current.id] || []).filter(t => fold(t) !== k);
  list.unshift(c); examples[current.id] = list.slice(0, EX_MAX);
  try{ await db.doc("exemplos/" + current.id).set({ laudos: examples[current.id], atualizadoEm: new Date().toISOString() }); }catch(e){}
}
const EXIDX = new Map();   // texto do exemplo -> termos e trigramas (cache)
function exIndex(t){ let v = EXIDX.get(t); if (!v){ v = { st: new Set(terms(t)), tri: trigrams(fold(t)) }; EXIDX.set(t, v); } return v; }
/* até 2 laudos do médico com achados parecidos com os ditados agora (de qualquer exame; o mesmo exame vale mais);
   sem nenhum parecido, o mais recente do mesmo exame (só estilo). Até 900 caracteres. */
function examplesBlock(fresh){
  const ids = [current, ...extras].map(e => e.id), cands = [];
  for (const [id, list] of Object.entries(examples)){
    const mesmo = ids.includes(id);
    (list || []).forEach((raw, i) => {
      const t = raw.length > EX_CHARS ? (mesmo ? compactExample(raw) : "") : raw;   // laudos antigos (inteiros) só do mesmo exame
      if (t) cands.push({ t, mesmo, i });
    });
  }
  exUsados = 0; exParecidos = false;
  if (!cands.length) return "";
  const ft = terms(fresh || ""), ftri = trigrams(fold(fresh || ""));
  const score = c => {
    if (!ft.length) return 0;
    const p = exIndex(c.t); let hit = 0; for (const x of ft) if (p.st.has(x)) hit++;
    if (hit < Math.min(2, ft.length)) return 0;
    let inter = 0; for (const g of ftri) if (p.tri.has(g)) inter++;
    return (hit / ft.length + inter / (ftri.size + p.tri.size - inter)) * (c.mesmo ? 1.2 : 1);
  };
  const ranked = cands.map(c => [score(c), c]).filter(x => x[0] >= 0.3).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  exParecidos = ranked.length > 0;
  const pick = exParecidos ? ranked : cands.filter(c => c.mesmo && c.i === 0);
  let out = "";
  for (const c of pick){
    if (exUsados >= (exParecidos ? 2 : 1)) break;
    const add = c.t.slice(0, exParecidos ? 700 : 600);
    if (out.length + add.length > 900) continue;
    out += (out ? "\n---\n" : "") + add; exUsados++;
  }
  return out;
}

/* ---------- aprender com as edições ---------- */
async function learnFromEdit(edited){
  if (!sample || !db || !lastGenerated) return;
  const before = cleanLines(lastGenerated), after = cleanLines(edited);
  const bSet = new Set(before), aSet = new Set(after);
  const removed = before.filter(l => !aSet.has(l)).slice(0, 12), added = after.filter(l => !bSet.has(l)).slice(0, 12);
  lastGenerated = edited;
  if (!removed.length && !added.length) return;
  const prompt = `Um radiologista brasileiro editou um laudo de ${current.name} gerado automaticamente antes de copiá-lo. Descubra o que as edições revelam sobre o ESTILO dele, para aplicar em laudos futuros.

LINHAS ORIGINAIS QUE ELE REMOVEU OU ALTEROU:
${removed.map(l => "- " + l).join("\n") || "(nenhuma)"}

LINHAS COMO ELE DEIXOU:
${added.map(l => "- " + l).join("\n") || "(nenhuma)"}

REGRAS JÁ EXISTENTES (id | exame | texto):
${rulesListForPrompt()}

Escreva de 0 a 3 regras de estilo GENERALIZÁVEIS, curtas e imperativas (ex.: "Na conclusão, esplenomegalia deve ser escrita apenas como 'Esplenomegalia homogênea.'"). Ignore correções que dependem só deste caso (medidas, lateralidade, achados específicos do paciente) e o que as regras existentes já cobrem. Se uma regra existente for contrariada pela edição, inclua o id dela em "remove". Nunca inclua dados do paciente.
"exame" deve ser um de: ${examIds()}, ou "todos".
Responda só com JSON: {"add":[{"texto":"...","exame":"..."}],"remove":["id"]}`;
  try{
    const out = await sample.json(prompt, { modelTier:"quick", cache:false });
    await removeRules(Array.isArray(out?.remove) ? out.remove : []);
    const n = await addRules(Array.isArray(out?.add) ? out.add : [], "edição");
    if (n){ setStatus(`Laudo copiado. Aprendi ${n} ${n === 1 ? "regra" : "regras"} com a sua edição.`, "ok"); $("styleReply").textContent = `Aprendi com a sua edição: ${out.add.map(r => r.texto).join(" · ")}`; }
  }catch(e){}
}


/* ---------- abas ---------- */
function selectTab(which){ if (which === "chat") $("claudeBox").open = true; }

/* ---------- chat ---------- */
function addMsg(role, text, box){
  const c = box || $("chat");
  const d = document.createElement("div"); d.className = "msg " + role; d.textContent = text;
  c.append(d); c.scrollTop = c.scrollHeight; return d;
}
function contextTurn(){
  return `Você é um consultor de radiologia (tomografia) conversando com um médico radiologista brasileiro durante o laudo. Responda em português do Brasil, de forma direta e técnica, em texto puro sem markdown. Cite a diretriz ou classificação quando usar uma. Se faltar informação, diga qual.

CASO ATUAL — ${current.name}${current.sexo ? " · sexo " + sexText().toLowerCase() : ""}
(sexo e informações clínicas, se houver, estão no próprio laudo)
Laudo atual:
"""
${laudoText() || "(folha vazia)"}
"""`;
}
async function ask(question){
  if (!sample || !question.trim()) return;
  selectTab("chat"); addMsg("me", question);
  chatTurns.push({ role:"user", content: question });
  if (chatTurns.length > 12) chatTurns = chatTurns.slice(-12);
  while (chatTurns.length && chatTurns[0].role !== "user") chatTurns.shift();
  const bubble = addMsg("ai", "Pensando…");
  ctl = new AbortController(); busy(true);
  try{
    const { text } = await sample([{ role:"user", content: contextTurn() }, ...chatTurns], {
      signal: ctl.signal, cache: false,
      onText: ({ text }) => { bubble.textContent = text; $("chat").scrollTop = $("chat").scrollHeight; }
    });
    bubble.textContent = text; chatTurns.push({ role:"assistant", content: text });
  }catch(e){
    bubble.textContent = (e && e.text) ? e.text + "\n\n[interrompido]" : (e && e.code === "cancelled" ? "[interrompido]" : errMsg(e));
  }finally{ busy(false); }
}

/* ---------- ensinar estilo ---------- */
async function ensinar(){
  const q = $("ensinar").value.trim();
  if (!q) return;
  if (!sample){ $("styleReply").textContent = "O Claude não está disponível nesta visualização."; return; }
  if (!db){ $("styleReply").textContent = "As regras não podem ser salvas nesta visualização."; return; }
  $("ensinar").value = "";
  const bubble = $("styleReply"); bubble.textContent = "Salvando…";
  $("ensinarBtn").disabled = true;
  const prompt = `Você mantém a lista de regras de estilo de laudos de tomografia de um radiologista brasileiro. Essas regras são aplicadas automaticamente em todos os laudos futuros.

EXAME SELECIONADO AGORA: ${current.name} (id "${current.id}")
REGRAS EXISTENTES (id | exame | texto):
${rulesListForPrompt()}

MENSAGEM DO MÉDICO:
"""
${q}
"""

Se a mensagem ensina algo sobre como escrever os laudos (e não é um pedido de frase rápida, correção de ditado ou comando de voz), transforme em regra(s) curtas, imperativas e precisas, preservando exatamente as palavras que ele quer no laudo (entre aspas). Se ela altera ou contradiz uma regra existente, remova a antiga (ids em "remove") e escreva a nova. Se ele pedir para apagar regras, use "remove". Se for só uma pergunta, responda em "reply" sem criar regra.
"exame": use ${examIds()}, ou "todos" quando a regra vale para qualquer exame (ex.: regras de conclusão sobre órgãos que aparecem em vários exames).
"reply": 1 frase curta em português confirmando o que foi salvo, como aplicará, ou respondendo a pergunta.
A mensagem também pode pedir itens de ditado por voz. Nesse caso, NÃO crie regra; use:
- "frases": autotexto que ele vai inserir dizendo "autotexto <nome>" (pode ter campos [x] e listas {a|b|c}). "nome" curto e fácil de falar; "texto" exatamente como ele quer no laudo.
- "correcoes": termo que o ditado escreve errado ("de") e a forma correta ("para").
- "macros": conjunto de vários achados que ele insere de uma vez dizendo "macro <nome>" ("texto" com um achado por linha).
- "comandos": apelido falado ("fala") para uma ação existente ("acao"): ${Object.keys(ACOES).map(k => `"${k}" (${ACOES[k]})`).join(", ")}.
FRASES EXISTENTES: ${frases.map(f => f.nome).join("; ") || "(nenhuma)"}
CORREÇÕES EXISTENTES: ${correcoes.map(c => c.de + " → " + c.para).join("; ") || "(nenhuma)"}
Responda só com JSON: {"reply":"...","add":[{"texto":"...","exame":"..."}],"remove":["id"],"frases":[{"nome":"...","texto":"..."}],"correcoes":[{"de":"...","para":"..."}],"comandos":[{"fala":"...","acao":"..."}],"macros":[{"nome":"...","texto":"...","exame":"..."}]}`;
  try{
    const out = await sample.json(prompt, { modelTier:"quick", cache:false });
    await removeRules(Array.isArray(out?.remove) ? out.remove : []);
    await addRules(Array.isArray(out?.add) ? out.add : [], "conversa");
    for (const f of (Array.isArray(out?.frases) ? out.frases : [])) { try{ await addFrase(f.nome, f.texto); }catch(e){} }
    for (const c of (Array.isArray(out?.correcoes) ? out.correcoes : [])) { try{ await addCorrecao(c.de, c.para); }catch(e){} }
    for (const c of (Array.isArray(out?.comandos) ? out.comandos : [])) { try{ await addComando(c.fala, c.acao); }catch(e){} }
    for (const m of (Array.isArray(out?.macros) ? out.macros : [])) { try{ await addMacro(m.nome, m.texto, m.exame); }catch(e){} }
    bubble.textContent = String(out?.reply || "Regra salva.");
  }catch(e){
    bubble.textContent = e && e.code === "invalid_json" ? "Não entendi bem. Pode reformular a instrução?" : errMsg(e);
  }finally{ $("ensinarBtn").disabled = false; }
}
$("ensinarBtn").onclick = ensinar;
$("ensinar").addEventListener("keydown", e => { if (e.key === "Enter" && !e.ctrlKey && !e.metaKey){ e.preventDefault(); ensinar(); } });

$("enviar").onclick = () => { const q = $("pergunta").value; $("pergunta").value = ""; ask(q); };
$("revisar").onclick = () => conferirLocal();
$("gerar").onclick = gerar;
$("parar").onclick = () => ctl && ctl.abort();
$("limparChat").onclick = () => { chatTurns = []; $("chat").querySelectorAll(".msg:not(.hint)").forEach(n => n.remove()); };

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("modal").hidden){ closeMask(false); return; }
  if (e.key === "Escape" && !$("vozModal").hidden){ $("vozModal").hidden = true; return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter"){
    e.preventDefault();
    const a = document.activeElement;
    if (a === $("pergunta")) $("enviar").click();
    else if (a === $("ensinar")) ensinar();
    else gerar();
  }
  if (e.altKey && !e.ctrlKey && (e.key === "s" || e.key === "S")){
    e.preventDefault(); if (!$("modal").hidden) closeMask(false);
    const a = document.activeElement;
    if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT" || a.isContentEditable)) return;
    focusSheet();   // mantém o cursor onde ele estava
  }
});


/* ---------- Claude e banco ---------- */
function disableClaude(){ sample = null; busy(false); $("claudeState").textContent = "Claude: indisponível nesta visualização"; }
(async () => {
  busy(false);
  try{ sample = wrapSample(window.claude ? await window.claude.use("sample") : null); }catch(e){ sample = null; }
  if (sample){ $("claudeState").innerHTML = "Claude: <b>conectado</b> (usa sua conta)"; busy(false); }
  else { disableClaude(); setStatus("Abra esta página dentro do claude.ai para gerar laudos com o Claude."); }
})();
(async () => {
  try{ db = window.claude ? await window.claude.use("db") : null; }catch(e){ db = null; }
  if (!db){ renderRules(); return; }
  db.collection("exemplos").onSnapshot(snap => {
    const m = {}; for (const d of snap.docs){ const v = d.data(); if (Array.isArray(v?.laudos)) m[d.id] = v.laudos.map(String); }
    examples = m;
  }, () => {});
  const sub = (col, set) => db.collection(col).orderBy("criadoEm").onSnapshot(snap => { set(snap.docs.map(d => ({ id: d.id, ...d.data() }))); renderVoz(); }, () => {});
  if (caseId && (!sheetHasContent() || modelIntact())){
    db.doc("casos/" + caseId).get().then(d => { if (d.exists && (!sheetHasContent() || modelIntact())){ const v = d.data(); if (v.laudoHtml) $("laudo").innerHTML = v.laudoHtml; updateCount(); versions = v.versoes || []; verPtr = versions.length - 1; $("verCount").textContent = versions.length ? "(" + versions.length + ")" : ""; renderAlerts(); setStatus("Laudo em andamento recuperado.", "ok"); } }).catch(() => {});
  }
  db.doc("treino/estatisticas").get().then(d => showTrainStat(d.exists ? d.data().sessoes : [])).catch(() => {});
  db.doc("config/formato").get().then(d => { const f = d.exists && d.data(); if (f && f.font) { store.set("docFormat", JSON.stringify(f)); setDocFormat(f.font, String(f.size || "11"), false); } }).catch(() => {});
  db.doc("config/atalhos").get().then(d => { const k = d.exists && d.data().keymap; if (k && typeof k === "object"){ keymap = k; store.set("keymap", JSON.stringify(k)); } }).catch(() => {});
  db.doc("config/ui").get().then(d => { const o = d.exists && d.data().calcOrder; if (Array.isArray(o)){ calcOrder = [...o.filter(k => CALCS[k]), ...Object.keys(CALCS).filter(k => !o.includes(k))]; store.set("calcOrder", JSON.stringify(calcOrder)); } }).catch(() => {});
  db.collection("mascaras").onSnapshot(snap => applyMasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
  sub("macros", v => { macros = v; renderMacroChips(); });
  db.collection("dicionario").onSnapshot(snap => {
    dictOk = new Set(snap.docs.map(d => fold(String(d.data().palavra || "").trim())).filter(Boolean));
    for (const p of dictOk) for (const w of p.split(/[^a-z]+/)) if (w.length >= 3) KNOWN.add(w);
  }, () => {});
  sub("frases", v => frases = v); sub("correcoes", v => correcoes = v); sub("comandos", v => comandos = v);
  db.collection("regras").orderBy("criadoEm").onSnapshot(snap => {
    rules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRules();
  }, () => { $("styleReply").textContent = "Conexão com as regras perdida. Recarregue a página."; });
})();


/* ================= 5. Exame normal instantâneo ================= */
function laudoNormal(){
  syncSexo();
  if (!sheetHasContent()) loadModel(current);
  /* conclusão normal na linha "1." (ou no lugar da conclusão atual) */
  const ps = [...sheet.children], ic = ps.findIndex(p => norm(p.textContent) === "conclusão");
  if (ic >= 0){
    let j = ic + 1; while (ps[j] && !ps[j].textContent.trim()) j++;
    if (ps[j] && !isHeading(ps[j].textContent) && /^\s*(1\.?)?\s*$/.test(ps[j].textContent)) ps[j].textContent = "1. " + NORMAL_CONCLUSION;
  }
  /* linhas opcionais por sexo: tira a que não vale quando o sexo é conhecido */
  let aviso = false;
  if (current.sexo){
    for (const p of [...sheet.children]){
      const x = fold(p.textContent);
      const pros = /prostata/.test(x), ute = /utero|anexia/.test(x);
      if (!pros && !ute) continue;
      if (sexo === "M" && ute) p.remove(); else if (sexo === "F" && pros) p.remove(); else if (!sexo) aviso = true;
    }
  }
  lastGenerated = laudoText(); pushVersion("Exame normal"); renderAlerts(); updateCount(); scheduleCaseSave();
  $("reviewBody").innerHTML = '<p class="review-empty">Conclusão normal preenchida direto do modelo, sem usar o Claude.</p>';
  setStatus(aviso ? "Conclusão normal preenchida. Sexo não informado: apague à mão a linha de próstata ou de útero." : "Conclusão normal preenchida.", aviso ? "err" : "ok");
}
$("normalBtn").onclick = laudoNormal;

/* ================= 7. Comparativo ================= */
const COMP_IDX = BANK.map((e,i) => /compara/i.test(e[1] + " " + e[2]) ? i : -1).filter(i => i >= 0).slice(0, 6);
const compText = () => "";   // comparação removida da tela: o médico escreve a comparação no ditado
function updComp(){ $("compFlag").textContent = compText() ? "· ativo" : ""; store.set("compTexto", $("compTexto").value); store.set("compData", $("compData").value); }
$("compTexto").addEventListener("input", updComp);
$("compData").addEventListener("input", updComp);

/* ================= Modais: abrir / fechar ================= */
function openModal(id){ $(id).hidden = false; }
function closeModal(id){ $(id).hidden = true; }
document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => closeModal(b.dataset.close));
for (const id of ["mascModal","calcModal","histModal"]) $(id).addEventListener("click", e => { if (e.target === $(id)) closeModal(id); });
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  for (const id of ["mascModal","calcModal","histModal","setModal","trainModal"]) if (!$(id).hidden){ closeModal(id); e.stopPropagation(); }
}, true);


/* ================= 6. Editor de máscaras ================= */
const BANK_GROUPS = [...new Set(BANK.map(e => e[0]))];
function cleanMask(d){
  return { id:d.id, code:String(d.code || "").toUpperCase().slice(0,3) || "??", name:d.name || d.id, proto:d.proto || "",
    sexo:!!d.sexo, tipo:d.tipo === "parecer" ? "parecer" : "laudo", voz:Array.isArray(d.voz) ? d.voz : [], mask:String(d.mask || ""), groups:Array.isArray(d.groups) ? d.groups : [],
    criadoEm:d.criadoEm || "" };
}
let maskDocs = [];
function applyMasks(docs){
  maskDocs = docs;
  const byId = new Map(docs.map(d => [d.id, d]));
  const list = DEFAULT_EXAMS.map(e => byId.has(e.id) ? { ...e, ...cleanMask(byId.get(e.id)), mine:true, custom:false, overridden:true } : { ...e });
  docs.filter(d => !DEFAULT_EXAMS.some(e => e.id === d.id))
      .sort((a,b) => String(a.criadoEm).localeCompare(String(b.criadoEm)))
      .forEach(d => list.push({ ...cleanMask(d), mine:true, custom:true }));
  EXAMS = list;
  current = EXAMS.find(x => x.id === current.id) || EXAMS[0];
  renderExams(); renderVoz();
  if (!$("mascModal").hidden) renderMascList();
}
let editing = null;   // id sendo editado, ou null para nova
function renderMascList(){
  const l = $("mascList"); l.textContent = "";
  const ordered = [...EXAMS.filter(e => e.tipo === "parecer"), ...EXAMS.filter(e => e.tipo !== "parecer")];
  let lastT = null;
  for (const ex of ordered){
    const t = ex.tipo === "parecer" ? "Pareceres provisórios" : "Laudos";
    if (t !== lastT){ const h = document.createElement("div"); h.className = "exam-group"; h.textContent = t; l.append(h); lastT = t; }
    const b = document.createElement("button"); b.type = "button"; b.dataset.id = ex.id;
    b.setAttribute("aria-pressed", editing === ex.id ? "true" : "false");
    const n = document.createElement("span"); n.textContent = shortName(ex);
    const m = document.createElement("span"); m.className = "meta"; m.textContent = ex.custom ? "sua" : ex.overridden ? "editada" : ex.mine ? "" : "provisória";
    b.append(n, m); b.onclick = () => loadMask(ex.id);
    b.ondblclick = () => { closeModal("mascModal"); selectTab("laudo"); selectExam(ex.id, true); setStatus("Máscara: " + fullName(ex), "ok"); };
    b.title = "Clique para editar · dois cliques para laudar com esta máscara";
    l.append(b);
  }
}
function groupBoxes(sel){
  const g = $("mGroups"); g.textContent = "";
  for (const name of BANK_GROUPS){
    const lab = document.createElement("label");
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = name; cb.checked = sel.includes(name);
    lab.append(cb, document.createTextNode(" " + name)); g.append(lab);
  }
}
function loadMask(id){
  editing = id;
  const ex = EXAMS.find(e => e.id === id);
  $("mNome").value = ex ? ex.name : ""; $("mProto").value = ex ? ex.proto : "";
  $("mVoz").value = ex ? (ex.voz || []).join(", ") : ""; $("mSexo").checked = ex ? !!ex.sexo : false; $("mParecer").checked = ex ? ex.tipo === "parecer" : false;
  $("mTexto").innerHTML = textToEditable(ex ? ex.mask : "TOMOGRAFIA COMPUTADORIZADA DE \nInformações Clínicas\n[<>]\nTécnica de exame\n\nAchados\n[<>]\nConclusão\n1. \nAchados adicionais");
  groupBoxes(ex ? (ex.groups || []) : []);
  const isDefault = ex && DEFAULT_EXAMS.some(d => d.id === ex.id);
  $("mDel").hidden = !ex || (isDefault && !ex.overridden);
  $("mDel").textContent = isDefault ? "Restaurar padrão" : "Excluir";
  $("mMsg").textContent = "";
  const btns = $("mascList").querySelectorAll("button");
  if (btns.length !== EXAMS.length) renderMascList();
  else btns.forEach(b => b.setAttribute("aria-pressed", b.dataset.id === editing ? "true" : "false"));
}
function autoCode(name){
  const f = fold(name), angio = /angio/.test(f);
  const w = f.replace(/^(angio-?\s*tc|angiotc|tc|tomografia)\s+/, "").split(/[^a-z0-9]+/).filter(x => x && !["de","do","da","dos","das","e","com","sem","angio","tc"].includes(x));
  return ((angio ? "A" : "") + (w[0] || "??").slice(0, 2)).toUpperCase().slice(0, 3);
}
function slug(t){ return fold(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "mascara"; }
$("mascBtn").onclick = () => { openModal("mascModal"); loadMask(current.id); };
$("mascNew").onclick = () => { loadMask(null); $("mNome").focus(); };
$("mSave").onclick = async () => {
  const msg = (t, err) => { $("mMsg").textContent = t; $("mMsg").style.color = err ? "var(--crit)" : "var(--ok)"; };
  if (!db) return msg("Não é possível salvar nesta visualização.", true);
  const name = $("mNome").value.trim(), mask = serEditable($("mTexto")).replace(/\r/g, "").trim();
  if (!name || !mask) return msg("Preencha o nome e o texto da máscara.", true);
  const heads = mask.split("\n").map(l => norm(stripMarks(l)));
  if (!$("mParecer").checked && (!heads.includes("achados") || !heads.includes("conclusão"))) return msg("A máscara precisa ter as seções Achados e Conclusão (ou marque \"Parecer provisório\").", true);
  let id = editing;
  if (!id){ id = slug(name); let k = 2; while (EXAMS.some(e => e.id === id)) id = slug(name) + "-" + k++; }
  const groups = [...$("mGroups").querySelectorAll("input:checked")].map(c => c.value);
  const old = maskDocs.find(d => d.id === id);
  try{
    await db.doc("mascaras/" + id).set({
      name, code: autoCode(name),
      proto: $("mProto").value.trim(), sexo: $("mSexo").checked, tipo: $("mParecer").checked ? "parecer" : "laudo",
      voz: $("mVoz").value.split(",").map(v => v.trim()).filter(Boolean),
      mask, groups, criadoEm: old?.criadoEm || new Date().toISOString()
    });
    editing = id; msg("Máscara salva.");
  }catch(e){ msg("Não foi possível salvar. Tente de novo.", true); }
};
$("mDel").onclick = async () => {
  if (!db || !editing) return;
  const isDefault = DEFAULT_EXAMS.some(d => d.id === editing);
  if ($("mDel").dataset.confirm !== editing){ $("mDel").dataset.confirm = editing; $("mDel").textContent = isDefault ? "Confirmar restauração" : "Confirmar exclusão"; return; }
  $("mDel").dataset.confirm = "";
  try{ await db.doc("mascaras/" + editing).delete(); }catch(e){}
  loadMask(isDefault ? editing : EXAMS[0].id);
};

/* ================= Macros ================= */
async function addMacro(nome, texto, exame, id){
  nome = vnorm(nome).replace(/^macro\s+/, ""); texto = String(texto || "").trim();
  if (!db || !nome || !texto) return false;
  exame = "todos";
  const old = id ? macros.find(m => m.id === id) : macros.find(m => vnorm(m.nome) === nome);
  const data = { nome, texto, exame, criadoEm: old?.criadoEm || new Date().toISOString() };
  if (old) await db.doc("macros/" + old.id).set(data); else await db.collection("macros").add(data);
  return true;
}
function insertAchados(t){
  insertAtCaret(t); updateCount(); updVolHint();
}
function renderMacroChips(){ return;
  const w = $("macroChips"); if (!w) return; w.textContent = "";
  const list = macros.filter(m => m.exame === "todos" || m.exame === current.id);
  if (!list.length) return;
  const l = document.createElement("span"); l.className = "lbl"; l.textContent = "Macros"; w.append(l);
  for (const m of list){
    const b = document.createElement("button"); b.type = "button"; b.textContent = m.nome; b.title = m.texto;
    b.onclick = () => insertAchados(m.texto); w.append(b);
  }
}
$("mcAdd").onclick = async () => {
  try{ if (await addMacro($("mcNome").value, $("mcTexto").value, "todos", editingVoz.macros)){ vozMsg(`Macro salva. Diga "macro ${vnorm($("mcNome").value)}".`); endEdit("macros"); $("mcNome").focus(); } else vozMsg("Preencha o nome e o texto.", true); }
  catch(e){ vozMsg("Não foi possível salvar. Tente de novo.", true); }
};


/* ================= Navegação por seções e conclusão sugerida (sem Claude) ================= */

/* "próxima seção" / "seção anterior": pula entre os títulos da máscara (Informações Clínicas, Técnica, Achados...) */
function sectionNav(dir){
  const ps = [...$("laudo").children], b = caretBlock(), i = b ? ps.indexOf(b) : -1;
  const heads = ps.map((p, k) => isHeading(p.textContent.trim()) ? k : -1).filter(k => k >= 0);
  if (!heads.length){ setStatus("Este laudo não tem seções."); return false; }
  let target;
  if (dir > 0) target = heads.find(k => k > i) ?? heads[heads.length - 1];
  else { const cur = [...heads].reverse().find(k => k <= i); target = [...heads].reverse().find(k => k < (cur ?? 0)) ?? heads[0]; }
  return goSection(norm(ps[target].textContent));
}

/* ---- conclusão sugerida a partir dos achados alterados ----
   1) frase de conclusão do banco do médico, só se todos os termos dela estiverem no achado (e com o mesmo lado);
   2) senão, o diagnóstico ditado ("compatível com X", "sugestivo de X"...);
   3) senão, o próprio achado enxugado (sem negativas no fim).
   Nunca acrescenta achado, medida ou lado que não foi ditado. */
const ESTILO = new Set(["manif", "sinai", "achad", "imagem", "image", "compa", "suger", "infer", "aspec", "prova", "prova", "obser", "nota", "evide", "carac", "prese"]);
const lado = t => { const f = fold(t); const d = /\b(direit[oa]s?|a direita)\b/.test(f), e = /\b(esquerd[oa]s?|a esquerda)\b/.test(f); return d && e ? "ambos" : d ? "D" : e ? "E" : /\bbilater/.test(f) ? "ambos" : ""; };
const ORGAO_ADJ = { figad: "hepática", rim: "renal", rins: "renal", pulmo: "pulmonar", pancr: "pancreática", baco: "esplênica", adren: "adrenal", tireo: "tireoidiana" };
function cleanFinding(t){
  let s = splitSent(stripTags(splitAlign(t).t).trim())[0] || "";
  s = s.replace(/,?\s+sem\s+(sinais|evid[eê]ncias?|altera[cç][oõ]es)\b.*$/i, "").replace(/[\s.;,]+$/, "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) + "." : "";
}
function conclusionFor(f){
  const ft = new Set(terms(f)), ftri = trigrams(fold(f)), gs = [current, ...extras].flatMap(e => e.groups || []), lf = lado(f);
  const cands = phraseIndex().filter(p => p.conc).map(p => [phraseScore(p, [...ft], ftri, gs), p]).filter(x => x[0] >= 0.6).sort((a, b) => b[0] - a[0]);
  for (const [, p] of cands){
    if (/\d/.test(p.s) || p.s.length > 140) continue;                          // medidas/detalhes do outro paciente
    if ([...p.st].some(t => !ft.has(t) && !ESTILO.has(t))) continue;          // termo que não foi ditado
    if (lado(p.s) !== lf) continue;                                             // lado diferente (ou ausente)
    return p.s.replace(/^\s*\d+\.\s*/, "").replace(/\s*\*+$/, "").replace(/[.\s]*$/, ".");
  }
  const dx = fold(f).match(/(?:compativel com|compativeis com|sugestiv[oa]s? de|sugerindo|inferindo|relacionad[oa]s? (?:a|com)|podendo corresponder a)\s+([^.;,]+)/);
  if (dx){
    const i = fold(f).indexOf(dx[1]); let x = f.slice(i, i + dx[1].length).trim();
    if (x.split(/\s+/).length <= 6){
      const org = Object.keys(ORGAO_ADJ).find(k => terms(f).some(t => t.startsWith(k)));
      if (x.split(/\s+/).length === 1 && org && !terms(x).some(t => t.startsWith("hepat") || t.startsWith(org))) x += " " + ORGAO_ADJ[org];
      if (lf && !lado(x)) x += lf === "D" ? " à direita" : lf === "E" ? " à esquerda" : " bilateral";
      return x.charAt(0).toUpperCase() + x.slice(1) + ".";
    }
  }
  return cleanFinding(f);
}
function alteredFindings(){
  const lines = laudoTagged().split("\n").map(l => l.trim()), NS = normalSetAll(), out = [];
  const i = lines.findIndex(l => norm(stripTags(l)) === "achados"), c = lines.findIndex(l => norm(stripTags(l)) === "conclusão");
  const x = lines.findIndex(l => norm(stripTags(l)) === "achados adicionais");
  const ach = [...(i >= 0 ? lines.slice(i + 1, c > i ? c : undefined) : []), ...(x > c && c >= 0 ? lines.slice(x + 1) : [])];
  for (const l of ach){
    const t = stripTags(splitAlign(l).t).trim();
    if (!t || isHeading(t) || /^\d+\.?$/.test(t)) continue;
    if (splitSent(t).every(s => NS.has(normSent(s)))) continue;
    out.push(t);
  }
  return out;
}
function suggestConclusion(){
  if (current.tipo === "parecer"){ setStatus("O parecer provisório não tem conclusão."); return; }
  const ps = [...sheet.children], hi = ps.findIndex(p => norm(p.textContent) === "conclusão");
  if (hi < 0){ setStatus("Não achei o título Conclusão na folha.", "err"); return; }
  let end = hi + 1; while (end < ps.length && !isHeading(ps[end].textContent.trim())) end++;
  while (end > hi + 1 && !ps[end - 1].textContent.trim()) end--;   // mantém a linha em branco antes do próximo título
  const atual = ps.slice(hi + 1, end).map(p => p.textContent.trim()).filter(t => t && !/^\d+\.?$/.test(t));
  if (atual.length && !(atual.length === 1 && normSent(atual[0]) === normSent(NORMAL_CONCLUSION))){
    setStatus("A conclusão já tem texto. Apague-a para eu sugerir outra.", "err"); return;
  }
  const fs = alteredFindings();
  const itens = [...new Set(fs.map(conclusionFor).filter(Boolean))];
  if (!itens.length){ setStatus("Não há achados alterados: use \"laudo normal\" para a conclusão normal."); return; }
  pushVersion("Antes da conclusão sugerida");
  for (let k = end - 1; k > hi; k--) ps[k].remove();
  ps[hi].insertAdjacentHTML("afterend", itens.map((t, n) => P(`<span class="chg">${esc((n + 1) + ". " + t)}</span>`)).join(""));
  updateCount(); renderAlerts(); scheduleCaseSave(); pushVersion("Conclusão sugerida");
  setStatus(`Conclusão sugerida a partir de ${fs.length} ${fs.length === 1 ? "achado" : "achados"}, sem usar o Claude (em verde). Confira; o Gerar laudo pode refinar.`, "ok");
}
$("sugConc").onclick = () => { suggestConclusion(); focusSheet(); };

/* ================= Lista de exames: recolher / fixar ================= */
let peekTimer = null, suppressPeek = false;
function hidePeekNow(){ suppressPeek = true; clearTimeout(peekTimer); $("examCol").classList.remove("peek"); setTimeout(() => { suppressPeek = false; }, 800); }
function setCollapsed(on){
  document.body.classList.toggle("side-collapsed", on);
  $("examCol").classList.remove("peek");
  $("pinBtn").title = on ? "Fixar a lista de exames" : "Recolher a lista para o lado";
  $("pinBtn").setAttribute("aria-label", on ? "Fixar a lista de exames" : "Recolher a lista de exames");
  store.set("sideCollapsed", on ? "1" : "0");
  if ($("setCollapse")) $("setCollapse").value = on ? "1" : "0";
}
$("pinBtn").onclick = () => setCollapsed(!document.body.classList.contains("side-collapsed"));
const peek = on => { if (on && suppressPeek) return; clearTimeout(peekTimer); if (on) $("examCol").classList.add("peek"); else peekTimer = setTimeout(() => $("examCol").classList.remove("peek"), 250); };
let railHover = null;
$("railBtn").addEventListener("mouseenter", () => { clearTimeout(railHover); railHover = setTimeout(() => peek(true), 280); });
$("railBtn").addEventListener("mouseleave", () => clearTimeout(railHover));
$("railBtn").onclick = () => { clearTimeout(railHover); peek(!$("examCol").classList.contains("peek")); };
$("examCol").addEventListener("mouseenter", () => { if (document.body.classList.contains("side-collapsed") && $("examCol").classList.contains("peek")) clearTimeout(peekTimer); });
$("examCol").addEventListener("mouseleave", () => { if (document.body.classList.contains("side-collapsed")) peek(false); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("examCol").classList.contains("peek")) $("examCol").classList.remove("peek"); });


/* ================= Campos [x] e listas {a|b} no texto dos achados ================= */
const FIELD_RE = /\[[^\[\]<>\n]{1,40}\]|\{[^{}\n]*\|[^{}\n]*\}/g;
function nextField(){
  const nodes = sheetTextNodes(sheet), t = nodes.map(n => n.nodeValue).join("");
  const sel = getSelection(), rg = sel.rangeCount && sheet.contains(sel.anchorNode) ? sel.getRangeAt(0) : sheetRange;
  const from = rg && sheet.contains(rg.endContainer) ? offsetOf(sheet, rg.endContainer, rg.endOffset) : 0;
  FIELD_RE.lastIndex = 0; let m, first = null, hit = null;
  while ((m = FIELD_RE.exec(t))){ if (!first) first = m; if (m.index >= from){ hit = m; break; } }
  hit = hit || first;
  if (!hit) return false;
  const r = rangeFromOffsets(sheet, hit.index, hit.index + hit[0].length); if (!r) return false;
  sheet.focus({ preventScroll: true }); sel.removeAllRanges(); sel.addRange(r);
  return true;
}
sheet.addEventListener("keydown", e => {
  if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey){ FIELD_RE.lastIndex = 0; if (FIELD_RE.test(sheetTextNodes(sheet).map(n => n.nodeValue).join(""))){ e.preventDefault(); nextField(); } }
});

/* ================= Navegação por voz na folha ================= */
function caretAtEnd(el){
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function goSection(name){
  const lau = $("laudo"); selectTab("laudo");
  const ps = [...lau.children];
  if (!ps.length) return false;
  if (name === "fim"){ lau.focus(); caretAtEnd(ps[ps.length-1]); return true; }
  const i = ps.findIndex(p => norm(p.textContent) === name);
  if (i < 0) return false;
  let last = null;
  for (let j = i + 1; j < ps.length; j++){
    const t = ps[j].textContent.trim();
    if (isHeading(t)) break;
    if (t) last = ps[j];
  }
  lau.focus();
  if (last){ caretAtEnd(last); last.scrollIntoView({ block:"nearest" }); return true; }
  const np = document.createElement("p"); np.setAttribute("style", PSTYLE); np.innerHTML = "<br>";
  ps[i].after(np); caretAtEnd(np); return true;
}
function selectLastSentence(){
  const a = document.activeElement;
  if (a && a.tagName === "TEXTAREA"){
    const end = a.selectionEnd, before = a.value.slice(0, end).replace(/\s+$/, "");
    const body = before.replace(/[.!?]$/, "");
    const k = Math.max(body.lastIndexOf("."), body.lastIndexOf("!"), body.lastIndexOf("?"), body.lastIndexOf("\n"));
    let st = k < 0 ? 0 : k + 1; while (/\s/.test(a.value[st] || "")) st++;
    a.setSelectionRange(st, before.length); return true;
  }
  const lau = $("laudo"), sel = getSelection();
  if (!sel.rangeCount || !lau.contains(sel.anchorNode)){ goSection("fim"); }
  const node = sel.anchorNode, block = node && (node.nodeType === 1 ? node : node.parentElement).closest("#laudo > p, #laudo > div, #laudo li");
  if (!block) return false;
  const txt = block.textContent, trimmed = txt.replace(/\s+$/, "").replace(/[.!?]$/, "");
  const k = Math.max(trimmed.lastIndexOf(". "), trimmed.lastIndexOf("! "), trimmed.lastIndexOf("? "));
  const startOff = k < 0 ? 0 : k + 2;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT); let pos = 0, n, sN = null, sO = 0, eN = null, eO = 0;
  const endOff = txt.replace(/\s+$/, "").length;
  while ((n = walker.nextNode())){
    const len = n.nodeValue.length;
    if (!sN && pos + len >= startOff){ sN = n; sO = startOff - pos; }
    if (pos + len >= endOff){ eN = n; eO = endOff - pos; break; }
    pos += len;
  }
  if (!sN || !eN) return false;
  const r = document.createRange(); r.setStart(sN, sO); r.setEnd(eN, eO);
  sel.removeAllRanges(); sel.addRange(r); return true;
}
function runPageAction(a){
  switch (a){
    case "proximo_campo": nextField(); return true;
    case "ir_conclusao": goSection("conclusão"); return true;
    case "ir_achados": goSection("achados"); return true;
    case "ir_tecnica": goSection("técnica de exame"); return true;
    case "ir_clinica": goSection("informações clínicas"); return true;
    case "ir_fim": goSection("fim"); return true;
    case "proxima_secao": sectionNav(1); return true;
    case "secao_anterior": sectionNav(-1); return true;
    case "ir_adicionais": if (!goSection("achados adicionais")) setStatus("Este laudo não tem Achados adicionais."); return true;
    case "sugerir_conclusao": suggestConclusion(); return true;
    case "voltar_ditado": focusSheet(); return true;
    case "selecionar_frase": selectLastSentence(); return true;
    case "foco": setFoco(!document.body.classList.contains("foco")); return true;
  }
  return false;
}

/* ================= Alertas instantâneos (sem Claude) ================= */
const ORGAOS = ["rim","glândula adrenal","adrenal","ureter","ovário","região anexial","anexo","pulmão","hemitórax","hemisfério cerebral","hemisfério cerebelar","seio maxilar","mama","testículo","fossa ilíaca","hipocôndrio","flanco","lobo superior","lobo médio","lobo inferior","artéria ilíaca","veia ilíaca","artéria renal","veia renal","órbita","mastoide","hemicólon","quadril","joelho","ombro","ventrículo lateral","lobo hepático"];
const ORG_RE = new RegExp("(" + ORGAOS.map(o => fold(o)).sort((a,b) => b.length - a.length).join("|") + ")[^.;\\n]{0,40}?\\b(direit[oa]|esquerd[oa])\\b", "g");
function sidePairs(txt){
  const out = new Set(), f = fold(txt); let m; ORG_RE.lastIndex = 0;
  while ((m = ORG_RE.exec(f))) out.add(m[1].replace(/^glandula /, "") + "|" + (m[2].startsWith("direit") ? "D" : "E"));
  return out;
}
function computeAlerts(){
  const al = [], text = laudoText();
  if (!text.trim()){ return al; }
  const lines = text.split("\n");
  const idx = h => lines.findIndex(l => norm(l) === h);
  const iA = idx("achados"), iC = idx("conclusão"), iX = idx("achados adicionais");
  if (iA >= 0 && iC > iA){
    const achT = lines.slice(iA + 1, iC).join("\n"), conT = lines.slice(iC + 1, iX > iC ? iX : undefined).join("\n");
    const pa = sidePairs(achT), pc = sidePairs(conT);
    for (const k of pc){
      const [org, sd] = k.split("|"), other = org + "|" + (sd === "D" ? "E" : "D");
      if (!pa.has(k) && pa.has(other)) al.push(["Lateralidade", `"${org}" à ${sd === "D" ? "direita" : "esquerda"} na conclusão, mas à ${sd === "D" ? "esquerda" : "direita"} nos achados.`]);
    }
  }
  if (iC >= 0){
    const conT2 = lines.slice(iC + 1, iX > iC ? iX : undefined).join("").replace(/[\s\d.]/g, "");
    if (!conT2 && !(current.tipo === "parecer")) al.push(["Conclusão", "A conclusão está vazia."]);
  }
  syncSexo();
  const f = fold(text);
  if (sexo === "M" && /\b(utero|ovario|endometri|regioes anexiais|anexial)/.test(f)) al.push(["Sexo", "Paciente masculino, mas o laudo cita útero/ovário/anexos."]);
  if (sexo === "F" && /\b(prostata|vesiculas seminais|testicul)/.test(f)) al.push(["Sexo", "Paciente feminina, mas o laudo cita próstata/testículo."]);
  const um = /(\d+(?:[.,]\d+)?)\s*(cm|mm)\b(?!³|3)/g; let m;
  while ((m = um.exec(text))){
    const v = num(m[1]);
    if ((m[2] === "cm" && v > 30) || (m[2] === "mm" && v > 300)) al.push(["Medida", `"${m[0]}" parece grande demais. Confira a unidade.`]);
  }
  FIELD_RE.lastIndex = 0;
  const fl = text.match(FIELD_RE); if (fl) al.push(["Campo", `Campo não preenchido: ${fl.slice(0,3).join(", ")}`]);
  return al;
}
function renderAlerts(){
  const al = computeAlerts(), box = $("alertBox");
  box.hidden = !al.length; box.textContent = "";
  for (const [k, v] of al){ const d = document.createElement("div"); const b = document.createElement("b"); b.textContent = k; d.append(b, document.createTextNode(v)); box.append(d); }
}
let alertTimer = null;
$("laudo").addEventListener("input", () => { clearTimeout(alertTimer); alertTimer = setTimeout(renderAlerts, 600); scheduleEditVersion(); });

/* ================= Versões do laudo ================= */
let versions = [], editVerTimer = null;
function pushVersion(label){
  const html = $("laudo").innerHTML; if (!html.trim()) return;
  if (versions.length && versions[versions.length-1].html === html) return;
  const d = new Date();
  versions.push({ label, html, hora: String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0") + ":" + String(d.getSeconds()).padStart(2,"0") });
  if (versions.length > 30) versions.shift();
  verPtr = versions.length - 1;
  if (typeof scheduleCaseSave === "function") scheduleCaseSave();
  $("verCount").textContent = "(" + versions.length + ")";
}
function scheduleEditVersion(){ clearTimeout(editVerTimer); editVerTimer = setTimeout(() => pushVersion("Sua edição"), 2500); }
function renderVerMenu(){
  const m = $("verMenu"); m.textContent = "";
  if (!versions.length){ const li = document.createElement("li"); li.className = "meta"; li.style.padding = "8px 10px"; li.textContent = "Nenhuma versão ainda."; m.append(li); return; }
  [...versions].reverse().forEach((v, ri) => {
    const li = document.createElement("li"); const b = document.createElement("button"); b.type = "button";
    const a = document.createElement("span"); a.textContent = v.label; const h = document.createElement("span"); h.className = "meta"; h.textContent = v.hora;
    b.append(a, h);
    b.onclick = () => { pushVersion("Antes de restaurar"); $("laudo").innerHTML = v.html; verPtr = versions.indexOf(v); renderAlerts(); closeVer(); scheduleCaseSave(); setStatus("Versão das " + v.hora + " restaurada.", "ok"); };
    li.append(b); m.append(li);
  });
}
function closeVer(){ $("verMenu").hidden = true; $("verBtn").setAttribute("aria-expanded", "false"); }
$("verBtn").onclick = () => { const open = $("verMenu").hidden; if (open){ renderVerMenu(); $("verMenu").hidden = false; $("verBtn").setAttribute("aria-expanded", "true"); } else closeVer(); };
document.addEventListener("click", e => { if (!$("verMenu").hidden && !e.target.closest(".ver-wrap")) closeVer(); });

/* ================= Ajustes: tamanhos, tema, foco, atalhos ================= */
const KEY_ACTIONS = { gerar:"Gerar laudo", copiar:"Copiar laudo", desfazer:"Voltar para a alteração anterior", conferir:"Conferir o laudo agora", normal:"Exame normal", novo:"Novo exame", revisar:"Revisar o texto atual", proximo_campo:"Próximo campo", voltar_ditado:"Voltar o cursor para o laudo", ir_conclusao:"Ir para a conclusão", selecionar_frase:"Selecionar a última frase", plantao:"Modo plantão", foco:"Modo foco" };
let keymap = {};
try{ keymap = JSON.parse(store.get("keymap") || "{}") || {}; }catch(e){ keymap = {}; }
function comboOf(e){
  if (["Control","Shift","Alt","Meta"].includes(e.key)) return "";
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return (e.ctrlKey ? "Ctrl+" : "") + (e.altKey ? "Alt+" : "") + (e.shiftKey ? "Shift+" : "") + (e.metaKey ? "Meta+" : "") + k;
}
let capturing = null;
function renderKeys(){
  const l = $("keyList"); l.textContent = "";
  for (const [a, label] of Object.entries(KEY_ACTIONS)){
    const li = document.createElement("li");
    const n = document.createElement("span"); n.textContent = label;
    const k = document.createElement("kbd"); k.textContent = capturing === a ? "aperte…" : (Object.keys(keymap).find(c => keymap[c] === a) || "—");
    const acts = document.createElement("span"); acts.className = "acts";
    const def = document.createElement("button"); def.className = "edit"; def.type = "button"; def.textContent = "Definir"; def.onclick = () => { capturing = a; renderKeys(); };
    const clr = document.createElement("button"); clr.className = "del"; clr.type = "button"; clr.textContent = "Limpar";
    clr.onclick = () => { for (const c of Object.keys(keymap)) if (keymap[c] === a) delete keymap[c]; saveKeys(); renderKeys(); };
    acts.append(def, clr); li.append(n, k, acts); l.append(li);
  }
}
async function saveKeys(){ store.set("keymap", JSON.stringify(keymap)); if (db){ try{ await db.doc("config/atalhos").set({ keymap }); }catch(e){} } }
function runKeyAction(a){
  if (runPageAction(a)) return;
  if (a === "desfazer"){ undoVersion(); return; } if (a === "conferir"){ conferir(false); return; }
  if (a === "gerar") gerar(); else if (a === "copiar") $("copiar").click(); else if (a === "normal") laudoNormal();
  else if (a === "novo") $("limpar").click(); else if (a === "revisar") revisar(); else if (a === "plantao") togglePlantao();
}
document.addEventListener("keydown", e => {
  const c = comboOf(e); if (!c) return;
  if (capturing){
    e.preventDefault(); e.stopPropagation();
    if (c === "Escape"){ capturing = null; renderKeys(); return; }
    if (c === "Alt+S"){ capturing = null; renderKeys(); return; }
    for (const k of Object.keys(keymap)) if (keymap[k] === capturing) delete keymap[k];
    keymap[c] = capturing; capturing = null; saveKeys(); renderKeys(); return;
  }
  if (keymap[c]){ e.preventDefault(); e.stopPropagation(); runKeyAction(keymap[c]); }
}, true);

/* Ctrl+C: com texto selecionado copia a seleção (normal); sem seleção, copia o laudo */
function hasSelection(){
  const a = document.activeElement;
  if (a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && /^(text|search|url|email|tel|password|)$/i.test(a.type || "")))){
    try{ if (a.selectionStart !== a.selectionEnd) return true; }catch(e){}
  }
  const s = getSelection(); return !!(s && !s.isCollapsed && s.toString().trim());
}
window.addEventListener("keydown", e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  if (e.code !== "KeyC" && (e.key || "").toLowerCase() !== "c") return;
  if (capturing) return;
  if (hasSelection()) { e.stopImmediatePropagation(); return; }   // deixa o navegador copiar a seleção
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.repeat) return;
  $("copiar").click();
}, true);

function applyLook(){
  const z = +(store.get("zoom") || 100), d = +(store.get("dictSize") || 16), th = store.get("theme") || "escuro";
  $("laudo").style.zoom = z / 100;
  document.documentElement.style.setProperty("--dict-size", d + "px");
  document.body.classList.toggle("light", th === "claro");
  $("setZoom").value = z; $("zoomVal").textContent = z + "%";
  $("setDict").value = d; $("dictVal").textContent = d + " px";
  $("setTheme").value = th;
}
$("setZoom").oninput = () => { store.set("zoom", $("setZoom").value); applyLook(); };
$("setDict").oninput = () => { store.set("dictSize", $("setDict").value); applyLook(); };
$("setTheme").onchange = () => { store.set("theme", $("setTheme").value); applyLook(); };
function setFoco(on){ document.body.classList.toggle("foco", on); $("setFoco").checked = on; store.set("foco", on ? "1" : "0"); if (on) selectTab("laudo"); }
$("setFoco").onchange = () => setFoco($("setFoco").checked);
$("setBtn").onclick = () => { openModal("setModal"); capturing = null; renderKeys(); };
$("setModal").addEventListener("click", e => { if (e.target === $("setModal")) closeModal("setModal"); });


/* ================= Layout: divisórias arrastáveis e disposição ================= */
const LAYOUT_DEF = { mode:"stack", side:250, top:38, left:46 };
let layout = { ...LAYOUT_DEF };
try{ layout = { ...LAYOUT_DEF, ...(JSON.parse(store.get("layout") || "{}") || {}) }; }catch(e){}
function applyLayout(){
  const w = $("work");
  w.classList.toggle("stack", layout.mode === "stack"); w.classList.toggle("side", layout.mode === "side");
  document.documentElement.style.setProperty("--side-w", layout.side + "px");
  document.documentElement.style.setProperty("--top-h", layout.top + "%");
  document.documentElement.style.setProperty("--left-w", layout.left + "%");
  $("setLayout").value = layout.mode;
  $("setSide").value = layout.side; $("sideVal").textContent = layout.side + " px";
  const pct = layout.mode === "stack" ? layout.top : layout.left;
  $("setTop").value = pct; $("topVal").textContent = pct + "%";
  $("splitWork").setAttribute("aria-orientation", layout.mode === "stack" ? "horizontal" : "vertical");
}
function saveLayout(){ store.set("layout", JSON.stringify(layout)); applyLayout(); }
function dragSplitter(el, onMove){
  el.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add("dragging"); document.body.classList.add("resizing");
    const mv = ev => onMove(ev);
    const up = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.classList.remove("dragging"); document.body.classList.remove("resizing"); saveLayout(); };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  });
}
dragSplitter($("splitSide"), ev => { layout.side = Math.round(Math.min(460, Math.max(180, ev.clientX - $("grid").getBoundingClientRect().left))); applyLayout(); });
dragSplitter($("splitWork"), ev => {
  const r = $("work").getBoundingClientRect();
  if (layout.mode === "stack") layout.top = Math.round(Math.min(80, Math.max(20, (ev.clientY - r.top) / r.height * 100)));
  else layout.left = Math.round(Math.min(75, Math.max(25, (ev.clientX - r.left) / r.width * 100)));
  applyLayout();
});
/* Alça no canto das caixas (achados e folha do laudo): arrasta para mudar a altura */
const BOX_MIN = { achBox: 90, laudoBox: 180 };
let boxH = {}; try{ boxH = JSON.parse(store.get("boxH") || "{}") || {}; }catch(e){ boxH = {}; }
function applyBox(id){
  const b = $(id), h = boxH[id];
  if (h){ b.classList.add("sized"); b.style.height = h + "px"; } else { b.classList.remove("sized"); b.style.height = ""; }
}
function saveBox(){ store.set("boxH", JSON.stringify(boxH)); }
document.querySelectorAll(".rs-grip").forEach(g => {
  const id = g.dataset.box; applyBox(id);
  g.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    e.preventDefault(); g.setPointerCapture(e.pointerId); g.classList.add("dragging"); document.body.classList.add("resizing");
    const y0 = e.clientY, h0 = $(id).getBoundingClientRect().height;
    const mv = ev => { boxH[id] = Math.round(Math.max(BOX_MIN[id], h0 + ev.clientY - y0)); applyBox(id); };
    const up = () => { g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up); g.classList.remove("dragging"); document.body.classList.remove("resizing"); saveBox(); };
    g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
  });
  g.ondblclick = () => { delete boxH[id]; applyBox(id); saveBox(); };
  g.addEventListener("keydown", e => {
    const dir = { ArrowUp: -1, ArrowDown: 1 }[e.key]; if (!dir) return;
    e.preventDefault();
    boxH[id] = Math.round(Math.max(BOX_MIN[id], (boxH[id] || $(id).getBoundingClientRect().height) + dir * 20)); applyBox(id); saveBox();
  });
});
$("splitSide").ondblclick = () => { layout.side = LAYOUT_DEF.side; saveLayout(); };
$("splitWork").ondblclick = () => { layout.top = LAYOUT_DEF.top; layout.left = LAYOUT_DEF.left; saveLayout(); };
for (const [id, key, step, min, max] of [["splitSide","side",10,180,460],["splitWork","work",2,20,80]]){
  $(id).addEventListener("keydown", e => {
    const dir = { ArrowLeft:-1, ArrowUp:-1, ArrowRight:1, ArrowDown:1 }[e.key]; if (!dir) return;
    e.preventDefault();
    if (key === "side") layout.side = Math.min(max, Math.max(min, layout.side + dir * step));
    else if (layout.mode === "stack") layout.top = Math.min(max, Math.max(min, layout.top + dir * step));
    else layout.left = Math.min(75, Math.max(25, layout.left + dir * step));
    saveLayout();
  });
}
$("setLayout").onchange = () => { layout.mode = $("setLayout").value; saveLayout(); };
$("setSide").oninput = () => { layout.side = +$("setSide").value; saveLayout(); };
$("setTop").oninput = () => { if (layout.mode === "stack") layout.top = +$("setTop").value; else layout.left = Math.min(75, Math.max(25, +$("setTop").value)); saveLayout(); };
$("setCollapse").onchange = () => setCollapsed($("setCollapse").value === "1");
$("layoutReset").onclick = () => { layout = { ...LAYOUT_DEF }; saveLayout(); setCollapsed(false); };

/* ================= Formatação padrão e fonte/tamanho do trecho ================= */
const FONTS = ["Arial","Calibri","Cambria","Georgia","Segoe UI","Tahoma","Times New Roman","Verdana","Courier New"];
const SIZES = ["8","9","10","10.5","11","12","13","14","16","18","20"];
function setDocFormat(font, size, save){
  FORMAT.font = font; FORMAT.size = size + "pt";
  PSTYLE = `margin:0;font-family:${FORMAT.font},Helvetica,sans-serif;font-size:${FORMAT.size};line-height:normal`;
  document.documentElement.style.setProperty("--doc-font", `"${font}"`);
  document.documentElement.style.setProperty("--doc-size", size + "pt");
  $("fmtLabel").textContent = `${font} ${String(size).replace(".", ",")} · sem espaçamento`;
  $("laudo").dataset.placeholder = `O laudo aparece aqui em ${font} ${String(size).replace(".", ",")}, pronto para colar. Você pode editar direto na folha.`;
  $("setFont").value = font; $("setSize").value = String(size);
  $("fontSel").value = font; $("sizeSel").value = String(size);
  if (save){ store.set("docFormat", JSON.stringify({ font, size })); if (db) db.doc("config/formato").set({ font, size }).catch(() => {}); normalizeSheet(); }
}
function normalizeSheet(){
  const l = $("laudo");
  l.querySelectorAll("font").forEach(f => f.replaceWith(...f.childNodes));
  l.querySelectorAll("[style]").forEach(n => {
    if (n.matches("#laudo > p, #laudo > div, #laudo li")) return;
    n.style.removeProperty("font-family"); n.style.removeProperty("font-size");
    if (!n.getAttribute("style").trim()) n.removeAttribute("style");
  });
  l.querySelectorAll(":scope > p, :scope > div, li").forEach(n => { const a = n.style.textAlign; n.setAttribute("style", PSTYLE + (a ? ";text-align:" + a : "")); });
  l.querySelectorAll("span:not([style]):not([class])").forEach(x => x.replaceWith(...x.childNodes));
}
for (const [id, list] of [["setFont", FONTS], ["fontSel", FONTS], ["setSize", SIZES], ["sizeSel", SIZES]]) $(id).innerHTML = list.map(v => `<option value="${v}">${v.replace(".", ",")}</option>`).join("");
$("setFont").onchange = () => setDocFormat($("setFont").value, $("setSize").value, true);
$("setSize").onchange = () => setDocFormat($("setFont").value, $("setSize").value, true);
let sheetRange = null;
document.addEventListener("selectionchange", () => { const s = getSelection(); if (s.rangeCount && $("laudo").contains(s.anchorNode)) sheetRange = s.getRangeAt(0).cloneRange(); });
function withSheetSelection(fn){
  const l = $("laudo"); l.focus();
  if (sheetRange){ const s = getSelection(); s.removeAllRanges(); s.addRange(sheetRange); }
  document.execCommand("styleWithCSS", false, true);
  try{ fn(); } finally { document.execCommand("styleWithCSS", false, false); }
  scheduleEditVersion();
}
$("fontSel").onchange = () => withSheetSelection(() => document.execCommand("fontName", false, $("fontSel").value));
$("sizeSel").onchange = () => withSheetSelection(() => {
  document.execCommand("fontSize", false, "7");
  const pt = $("sizeSel").value + "pt";
  $("laudo").querySelectorAll('span[style*="font-size"]').forEach(sp => { if (/xxx-large|-webkit-xxx-large/.test(sp.style.fontSize)) sp.style.fontSize = pt; });
  $("laudo").querySelectorAll('font[size="7"]').forEach(f => { const sp = document.createElement("span"); sp.style.fontSize = pt; sp.append(...f.childNodes); f.replaceWith(sp); });
});


/* ================= Vocabulário médico e correção do ditado ================= */
const VOCAB = (() => {
  const freq = new Map();
  const add = t => { for (const w of String(t).toLowerCase().split(/[^a-zà-úç]+/)) if (w.length >= 6){ const k = fold(w), o = freq.get(k); if (o) o.n++; else freq.set(k, { w, n: 1 }); } };
  BANK.forEach(e => add(e[3])); DEFAULT_EXAMS.forEach(e => add(e.mask));
  return [...freq.values()].sort((a,b) => b.n - a.n).slice(0, 4000).map(x => x.w);
})();
window.__VOCAB = VOCAB;
const KNOWN = (() => {
  const set = new Set();
  const add = t => { for (const w of fold(String(t)).split(/[^a-z]+/)) if (w.length >= 3) set.add(w); };
  BANK.forEach(e => { add(e[3]); add(e[1] + " " + e[2]); }); DEFAULT_EXAMS.forEach(e => add(e.mask));
  add("paciente sexo masculino feminino homem mulher indicacao historia clinica dor febre trauma queda controle pos operatorio cirurgia previa anos meses dias semanas exame anterior comparacao sem com cerca aproximadamente medindo mede centimetros milimetros ponto virgula paragrafo linha campo proximo autotexto macro normal");
  return set;
})();
let corrTimer = null, corrBusy = false, corrNoteT = null;
const corrSeen = new WeakMap();
$("setCorr").checked = store.get("corrDitado") !== "0";
$("setCorr").onchange = () => store.set("corrDitado", $("setCorr").checked ? "1" : "0");
sheet.addEventListener("input", () => { clearTimeout(corrTimer); if ($("setCorr").checked && !genBusy) corrTimer = setTimeout(corrigirDitado, 3500); });
/* parágrafo da folha onde está o cursor (ou onde ele esteve por último) */
function caretBlock(){
  const s = getSelection(); let node = null;
  if (s.rangeCount && sheet.contains(s.anchorNode)) node = s.anchorNode;
  else if (sheetRange && sheet.contains(sheetRange.startContainer)) node = sheetRange.startContainer;
  if (!node) return null;
  let el = node.nodeType === 1 ? node : node.parentElement;
  while (el && el.parentElement !== sheet) el = el.parentElement;
  return el && el.parentElement === sheet ? el : null;
}
/* troca só o pedaço que mudou e deixa o cursor exatamente no mesmo ponto do texto */
function applyBlockFix(b, cur, fixed){
  const s = getSelection(), focused = document.activeElement === sheet;
  const rg = focused && s.rangeCount && b.contains(s.anchorNode) ? s.getRangeAt(0) : (sheetRange && b.contains(sheetRange.startContainer) ? sheetRange : null);
  let co = null, ce = null;
  if (rg){ co = offsetOf(b, rg.startContainer, rg.startOffset); ce = offsetOf(b, rg.endContainer, rg.endOffset); }
  /* troca palavra por palavra (só os grupos que mudaram), de trás para frente, e mapeia o cursor por cada troca */
  const tok = t => [...t.matchAll(/\S+/g)].map(m => ({ w: m[0], s: m.index, e: m.index + m[0].length }));
  const A = tok(cur), B = tok(fixed), ops = lcsOps(A.map(x => x.w), B.map(x => x.w), (x, y) => x === y);
  const chunks = []; let run = null;
  const closeRun = nextOld => {
    if (!run) return;
    const nxt = nextOld < A.length ? A[nextOld] : null;
    const newT = run.nw.map(i => B[i].w).join(" ");
    let os, oe, nt;
    if (run.od.length){
      os = A[run.od[0]].s; oe = A[run.od[run.od.length - 1]].e; nt = newT;
      if (!run.nw.length){ if (nxt) oe = nxt.s; else if (os > 0) os = A[run.od[0] - 1] ? A[run.od[0] - 1].e : os; }
    } else {
      os = oe = nxt ? nxt.s : cur.length;
      nt = nxt ? newT + " " : (cur.length && !/\s$/.test(cur) ? " " : "") + newT;
    }
    chunks.push({ os, oe, nt }); run = null;
  };
  for (const [op, i, j] of ops){
    if (op === "=") closeRun(i);
    else { run = run || { od: [], nw: [] }; if (op === "-") run.od.push(i); else run.nw.push(i); }
  }
  closeRun(A.length);
  for (let k = chunks.length - 1; k >= 0; k--){
    const c = chunks[k], r = rangeFromOffsets(b, c.os, c.oe); if (!r) continue;
    r.deleteContents(); if (c.nt) r.insertNode(document.createTextNode(c.nt));
  }
  b.normalize();
  if (co !== null){
    const map = o => { let d = 0; for (const c of chunks){ if (o <= c.os) break; if (o >= c.oe) d += c.nt.length - (c.oe - c.os); else return c.os + d + c.nt.length; } return o + d; };
    const nr = rangeFromOffsets(b, map(co), map(ce));
    if (nr){ if (focused || !document.hasFocus()){ s.removeAllRanges(); s.addRange(nr); } sheetRange = nr.cloneRange(); }
  }
}
async function corrigirDitado(){
  if (!sample || corrBusy || genBusy || !$("setCorr").checked) return;
  const b = caretBlock(); if (!b) return;
  const cur = blockText(b);
  if (cur === corrSeen.get(b) || cur.trim().length < 6 || isHeading(cur)) return;
  const unknown = fold(cur).split(/[^a-z]+/).filter(w => w.length >= 3 && !KNOWN.has(w));
  if (!unknown.length){ corrSeen.set(b, cur); return; }   // tudo conhecido: não gasta uso
  const prev = []; let pb = b.previousElementSibling; while (pb && prev.length < 2){ prev.unshift(blockText(pb)); pb = pb.previousElementSibling; }
  const ctxTxt = prev.join("\n").slice(-250);
  const bank = pickPhrases(cur, 6).join("\n");   // só as frases mais parecidas (antes: blocos de até 1.200 caracteres)
  const prompt = `Você corrige transcrições de ditado por voz de um radiologista brasileiro (laudos de tomografia). O reconhecimento de voz do navegador erra termos médicos.

TAREFA: corrija SOMENTE palavras que foram reconhecidas errado, trocando-as pelo termo médico/radiológico que faz sentido no contexto (ex.: "hipo denso" → "hipodenso", "colé doco" → "colédoco", "pleural efusão" mantém). Remova palavras soltas que claramente são ruído e não fazem sentido no contexto médico.
NÃO reescreva o estilo, não acrescente nem remova achados, não mude números, medidas, unidades ou lateralidade, não mude a pontuação. Mantenha campos entre [colchetes] e {chaves} como estão. Se nada precisar de correção, devolva o trecho idêntico.

Linhas anteriores (só contexto, não devolva):
"""
${ctxTxt}
"""
Grafias preferidas do médico (trechos das notas dele):
"""
${bank || "(nenhum)"}
"""
TRECHO A CORRIGIR:
"""
${cur}
"""
Responda apenas com o trecho corrigido, sem aspas e sem comentários.`;
  corrBusy = true;
  try{
    const { text } = await sample(prompt, { modelTier:"quick", cache:false });
    const lead = cur.match(/^\s*/)[0], trail = cur.match(/\s*$/)[0];
    const fixed = lead + String(text).replace(/^\s*"""\s*|\s*"""\s*$/g, "").trim() + trail;
    if (!b.isConnected || blockText(b) !== cur){ corrBusy = false; return; }   // o médico continuou escrevendo: tenta de novo na próxima pausa
    if (fixed.trim() && fixed !== cur && fixed.length < cur.length * 1.6 + 20){
      applyBlockFix(b, cur, fixed);
      updateCount(); updVolHint(); scheduleCaseSave();
      const eb = errorBlocks(cur, fixed).blocks;
      learnPairs(eb);
      emitExt("laudos-estat", { corr: eb.length || 1 });   // conta no painel diário da extensão
      const a = cur.split(/\s+/), c = fixed.split(/\s+/);
      const changed = c.filter(w => !a.includes(w)).slice(0, 4).join(" ");
      $("corrNote").textContent = changed ? `Ditado corrigido: ${changed}` : "Ditado corrigido.";
      clearTimeout(corrNoteT); corrNoteT = setTimeout(() => $("corrNote").textContent = "", 6000);
    }
    corrSeen.set(b, blockText(b));
  }catch(e){ /* sem correção desta vez */ }
  corrBusy = false;
}





/* ================= Conferência: alterações adicionais e sugestões ================= */
let checkedHash = "", confItems = [], confCtl = null;
const hashText = t => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h); };
/* tira o que "de" e "para" têm em comum no começo e no fim (por palavras), para marcar só a diferença */
function trimCommon(de, para){
  const ws = c => c === undefined || /\s/.test(c);
  let p = 0; while (p < de.length && p < para.length && de[p] === para[p]) p++;
  if (!((p === de.length || ws(de[p])) && (p === para.length || ws(para[p])))) while (p > 0 && !ws(de[p - 1])) p--;
  let q = 0; while (q < de.length - p && q < para.length - p && de[de.length - 1 - q] === para[para.length - 1 - q]) q++;
  if (!((q === de.length - p || ws(de[de.length - q - 1])) && (q === para.length - p || ws(para[para.length - q - 1])))) while (q > 0 && !ws(de[de.length - q])) q--;
  return { start: p, old: de.slice(p, de.length - q), neu: para.slice(p, para.length - q) };
}
function replaceInSheet(de, para, mark){
  if (!de) return false;
  const t = mark ? trimCommon(de, para) : { start: 0, old: de, neu: para };
  if (!t.old && !t.neu) return true;
  for (const b of sheet.querySelectorAll(":scope > p, :scope > div, li")){
    const txt = blockText(b), i = txt.indexOf(de); if (i < 0) continue;
    const r = rangeFromOffsets(b, i + t.start, i + t.start + t.old.length); if (!r) continue;
    const old = r.toString();
    r.deleteContents();
    if (mark){
      const id = ++editSeq, tpl = document.createElement("template");
      tpl.innerHTML = (old ? delEl(old, id) : "") + (t.neu ? (old ? " " : "") + insEl(t.neu, id) : "");
      r.insertNode(tpl.content);
    } else r.insertNode(document.createTextNode(para));
    b.normalize(); collapseSpaces(b); scheduleCaseSave();
    return true;
  }
  return false;
}
const confSec = it => { const x = fold(it.tipo || ""); if (/sugest|melhoria|recomenda/.test(x)) return "sug"; if (/incons|lateral|medida|sexo|faltante|duvida|negac|campo/.test(x)) return "att"; return "alt"; };
const CONF_TITLES = { att: "Atenção", alt: "Alterações adicionais possíveis", sug: "Sugestões de melhoria" };
function applyConfItem(it){
  if (it.done) return false;
  const ok = replaceInSheet(it.de, it.para, true);
  it.done = true; it.falhou = !ok;
  if (ok){ pushVersion("Conferência aplicada"); renderAlerts(); }
  return ok;
}
function renderConf(){
  const body = $("reviewBody"); body.textContent = "";
  if (!confItems.length){ body.innerHTML = '<p class="review-empty">Nada a conferir: o Claude não encontrou erros nem sugestões.</p>'; return; }
  const fixable = confItems.filter(it => it.de && !it.done);
  const sum = document.createElement("div"); sum.className = "rv-sum";
  const BADGE = { att: "warn", alt: "info", sug: "ok" };
  for (const k of ["att", "alt", "sug"]){
    const n = confItems.filter(it => confSec(it) === k && !it.ignored).length; if (!n) continue;
    const b = document.createElement("span"); b.className = "rv-badge " + BADGE[k]; b.textContent = n + " · " + CONF_TITLES[k]; sum.append(b);
  }
  body.append(sum);
  if (fixable.length){
    const bar = document.createElement("div"); bar.className = "rv-bar";
    const b = document.createElement("button"); b.type = "button"; b.className = "btn small primary"; b.textContent = `Aplicar todas as alterações (${fixable.length})`;
    b.onclick = () => { let n = 0; for (const it of confItems) if (it.de && !it.done && applyConfItem(it)) n++; renderConf(); setStatus(n ? `${n} ${n === 1 ? "alteração aplicada" : "alterações aplicadas"} (marcadas em verde e vermelho).` : "Nada para aplicar.", "ok"); };
    bar.append(b); body.append(bar);
  }
  for (const k of ["att", "alt", "sug"]){
    const list = confItems.filter(it => confSec(it) === k && !it.ignored); if (!list.length) continue;
    const h = document.createElement("div"); h.className = "rv-sec"; h.textContent = CONF_TITLES[k]; body.append(h);
    for (const it of list){
      const card = document.createElement("div");
      const crit = /incons|lateral|medida|sexo/.test(fold(it.tipo || ""));
      card.className = "rv-card " + (k === "att" ? (crit ? "crit" : "warn") : k === "sug" ? "ok" : "") + (it.done ? " done" : "");
      const left = document.createElement("div");
      const top = document.createElement("div"); top.className = "rv-top";
      const chip = document.createElement("span"); chip.className = "chip " + (CAT[fold(it.tipo || "")] || (k === "att" ? "c-warn" : k === "sug" ? "c-ok" : "c-info")); chip.textContent = it.tipo || "Nota"; top.append(chip);
      if (it.motivo){ const m = document.createElement("span"); m.textContent = it.motivo; top.append(m); }
      left.append(top);
      if (it.de){
        const t = trimCommon(it.de, it.para), d = document.createElement("div"); d.className = "rv-diff";
        if (t.old){ const x = document.createElement("del"); x.textContent = t.old; d.append(x); }
        if (t.old && t.neu) d.append(" → ");
        if (t.neu){ const y = document.createElement("ins"); y.textContent = t.neu; d.append(y); } else if (!t.neu && t.old) d.append(" → (remover)");
        left.append(d);
      }
      if (it.falhou){ const w = document.createElement("div"); w.className = "rv-why"; w.textContent = "Não encontrei esse trecho no laudo (ele mudou). Faça a alteração à mão."; left.append(w); }
      card.append(left);
      const act = document.createElement("div"); act.className = "rv-act";
      if (it.de && !it.done){ const b = document.createElement("button"); b.type = "button"; b.className = "btn small"; b.textContent = "Aplicar"; b.onclick = () => { applyConfItem(it); renderConf(); }; act.append(b); }
      if (it.done && !it.falhou){ const s2 = document.createElement("span"); s2.className = "meta"; s2.textContent = "aplicado"; act.append(s2); }
      if (it.de && !it.done && /ortograf|duvida|terminolog|concord/.test(fold(it.tipo || ""))){ const ck = document.createElement("button"); ck.type = "button"; ck.className = "btn ghost small"; ck.innerHTML = '<svg viewBox="0 0 16 16" class="ico" style="color:var(--ok)"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>'; ck.title = "Está certo: adicionar ao dicionário e não apontar de novo"; ck.setAttribute("aria-label", "Está certo, adicionar ao dicionário"); ck.onclick = async () => { await addDict(it.de); it.ignored = true; renderConf(); setStatus(`"${it.de}" adicionado ao dicionário. Não será mais apontado como erro.`, "ok"); }; act.append(ck); }
      if (!it.done){ const g = document.createElement("button"); g.type = "button"; g.className = "btn ghost small"; g.textContent = "Ignorar"; g.onclick = () => { it.ignored = true; renderConf(); }; act.append(g); }
      card.append(act); body.append(card);
    }
  }
}
async function addDict(txt){
  const w = String(txt || "").trim().toLowerCase(); if (!w) return;
  const k = fold(w); dictOk.add(k); for (const x of k.split(/[^a-z]+/)) if (x.length >= 3) KNOWN.add(x);
  if (db) try{ await db.collection("dicionario").add({ palavra: w, criadoEm: new Date().toISOString() }); }catch(e){}
}
/* laudo para o Conferir: frases normais intactas da máscara vão abreviadas (economiza tokens) */
function conferText(t){
  const NS = normalSetAll();
  return t.split("\n").map(l => { const x = l.trim(); return x.length >= 25 && !/^\d/.test(x) && splitSent(x).every(y => NS.has(normSent(y))) ? "≡ " + x.split(/\s+/).slice(0, 6).join(" ") + " …" : l; }).join("\n");
}
async function conferir(){
  if (!sample) return;
  const t = laudoText(); if (!t){ setStatus("A folha está vazia.", "err"); return; }
  confCtl && confCtl.abort(); confCtl = new AbortController();
  const body = $("reviewBody"); body.innerHTML = '<p class="review-empty">Conferindo o laudo…</p>';
  setStatus("Conferindo o laudo…");
  const rb = rulesBlock();
  const prompt = `Você confere um laudo de tomografia (${current.name}) de um radiologista brasileiro. Aponte erros reais e também alterações adicionais possíveis e sugestões de melhoria:
- erros: lateralidade inconsistente; medida ou unidade incoerente; achado nos achados e ausente na conclusão (ou o contrário); negação trocada; órgão incompatível com o sexo; ortografia, acentuação, concordância e pontuação; termo claramente incorreto;
- alterações adicionais possíveis: frase mais precisa ou termo mais técnico, sem mudar o estilo dele;
- sugestões de melhoria: complementos clinicamente úteis (classificação, diferencial, recomendação de seguimento por diretriz).${rb ? `\nSiga as regras de estilo do médico (não aponte como erro o que segue estas regras):\n${rb}` : ""}
${sexLine()}
LAUDO (linhas com "≡" são frases normais da máscara, abreviadas; não as aponte):
"""
${conferText(t)}
"""

${CONF_SPEC}
Responda só com JSON: {"itens":[{"tipo":"...","de":"","para":"","motivo":"..."}]}. Sem itens: {"itens":[]}`;
  try{
    const out = await sample.json(prompt, { modelTier:"quick", cache:false, signal: confCtl.signal });
    confItems = normItems(out?.itens);
    renderConf();
    setStatus(confItems.length ? `Conferência: ${confItems.length} ${confItems.length === 1 ? "ponto" : "pontos"} abaixo.` : "Conferido: nada a corrigir.", confItems.length ? "" : "ok");
  }catch(e){
    if (e && e.code === "cancelled") return;
    body.innerHTML = `<p class="review-empty">${esc(errMsg(e))}</p>`;
  }
}

/* ================= Modelo e uso estimado ================= */
// padrão: Equilibrado (chave nova, para valer mesmo para quem tinha salvo "Rápido" antes)
// padrão: Automático (chave nova genTier3, para valer também para quem tinha salvo outra opção antes)
const genTier = () => store.get("genTier3") || "auto";
function setGenTier(v){ store.set("genTier3", v); $("setTier").value = v; $("tierQuick").value = v; }
/* Automático: Rápido com até 3 achados ditados, curtos, num exame só; senão Equilibrado */
function effectiveTier(fresh){
  const t = genTier(); if (t !== "auto") return t;
  const n = String(fresh).split("\n").filter(l => l.trim()).length;
  return n <= 3 && !extras.length && String(fresh).length <= 400 ? "quick" : "default";
}
setGenTier(genTier());
$("setTier").onchange = () => setGenTier($("setTier").value);
$("tierQuick").onchange = () => setGenTier($("tierQuick").value);
function useStats(){ try{ const u = JSON.parse(store.get("uso") || "{}"); return u.dia === dayKey() ? u : { dia: dayKey(), tok: 0, n: 0 }; }catch(e){ return { dia: dayKey(), tok: 0, n: 0 }; } }
function trackUse(input, output){
  const inp = typeof input === "string" ? input : (Array.isArray(input) ? input.map(m => m.content).join("\n") : "");
  const tok = Math.round((inp.length + String(output || "").length) / 3.6);
  const u = useStats(); u.tok += tok; u.n += 1; store.set("uso", JSON.stringify(u)); showUse();
}
function showUse(){
  const u = useStats(), k = u.tok >= 1000 ? "~" + (u.tok / 1000).toFixed(u.tok < 10000 ? 1 : 0).replace(".", ",") + " mil" : "~" + u.tok;
  $("useFoot").textContent = k + " tokens"; $("useToday").textContent = k; $("useCalls").textContent = u.n;
}
function wrapSample(s0){
  if (!s0) return s0;
  const w = async (input, opts) => { const r = await s0(input, opts); trackUse(input, r?.text); return r; };
  w.json = async (input, opts) => { const r = await s0.json(input, opts); trackUse(input, JSON.stringify(r)); return r; };
  return w;
}


/* ================= Conferir local (sem Claude, sem tokens): roda primeiro; o Claude só se o médico pedir ================= */
function localChecks(){
  const al = computeAlerts(), text = laudoText(); if (!text.trim()) return al;
  const lines = text.split("\n").map(l => l.trim()), NS = normalSetAll();
  const idx = h => lines.findIndex(l => norm(l) === h);
  const iA = idx("achados"), iC = idx("conclusão"), iX = idx("achados adicionais");
  const parecer = current.tipo === "parecer";
  const ach = parecer ? lines.slice(2) : [...(iA >= 0 ? lines.slice(iA + 1, iC > iA ? iC : undefined) : []), ...(iX > iC ? lines.slice(iX + 1) : [])];
  const con = !parecer && iC >= 0 ? lines.slice(iC + 1, iX > iC ? iX : undefined).filter(l => l.replace(/[\d.\s]/g, "")) : [];
  const isNormal = l => l.length >= 15 && splitSent(l).every(x => NS.has(normSent(x)));
  const first = l => terms(l, true)[0];
  const altered = ach.filter(l => l && !isNormal(l) && !isHeading(l));
  // medida sem unidade (ex.: "medindo 2,5" ou "2,3 x 1,5")
  for (const l of ach){
    const m = l.match(/\d+,\d+(?:\s*(?:x|×)\s*\d+(?:,\d+)?)*(?!\s*(?:x|×|cm|mm|ml|mL|cm³|cm3|UH|HU|%|ml\/|mm³|mmHg|°|º))(?=[\s.;,)]|$)/);
    if (m) al.push(["Medida", `"${m[0]}" sem unidade: "${l.slice(0, 60)}${l.length > 60 ? "…" : ""}"`]);
  }
  // frase normal da máscara e achado alterado do mesmo órgão ao mesmo tempo
  for (const a of altered){
    const k = first(a); if (!k) continue;
    const n = ach.find(l => l !== a && isNormal(l) && first(l) === k);
    if (n) al.push(["Contradição", `"${n.slice(0, 50)}…" (normal) e "${a.slice(0, 50)}…" (alterado) no mesmo laudo.`]);
  }
  if (!parecer && con.length){
    // conclusão "normal" com achados alterados (a correspondência achado × conclusão por sentido fica para o Claude:
    // a busca por palavras dava alarme falso, ex.: "colelitíase" × "cálculo na vesícula")
    if (con.length === 1 && normSent(con[0]) === normSent(NORMAL_CONCLUSION) && altered.length)
      al.push(["Conclusão", `Conclusão normal, mas há ${altered.length} ${altered.length === 1 ? "achado alterado" : "achados alterados"} nos achados.`]);
  }
  const seen = new Set(); return al.filter(([k, v]) => !seen.has(k + v) && seen.add(k + v));
}
function conferirLocal(){
  const al = localChecks(), body = $("reviewBody");
  if (!laudoText().trim()){ setStatus("A folha está vazia.", "err"); return; }
  body.innerHTML = (al.length
    ? `<div class="rv-sec">Conferência local (sem Claude)</div><ul>${al.map(([k, v]) => `<li><span class="chip c-warn">${esc(k)}</span><span>${esc(v)}</span></li>`).join("")}</ul>`
    : '<p class="review-empty">Conferência local (sem Claude): nada encontrado.</p>')
    + `<div class="rv-bar" style="margin-top:8px"><button class="btn small" id="confClaude" type="button"${sample ? "" : " disabled"}>Conferir também com o Claude</button></div>`;
  $("confClaude").onclick = () => conferir();
  setStatus(al.length ? `Conferência local: ${al.length} ${al.length === 1 ? "ponto" : "pontos"} abaixo (nenhum token gasto).` : "Conferência local: nada encontrado (nenhum token gasto).", al.length ? "" : "ok");
}

/* ================= Voltar (desfazer por versão) ================= */
let verPtr = -1;
function undoVersion(){
  clearTimeout(editVerTimer);
  const html = $("laudo").innerHTML;
  if (versions.length && html !== versions[verPtr]?.html) pushVersion("Sua edição");
  if (verPtr <= 0){ setStatus("Não há alteração anterior."); return; }
  verPtr--;
  $("laudo").innerHTML = versions[verPtr].html; renderAlerts(); scheduleCaseSave();
  setStatus(`Voltou para: ${versions[verPtr].label} (${versions[verPtr].hora}).`, "ok");
}
$("undoBtn").onclick = undoVersion;
function undoAllClaude(){
  const i = versions.map(v => v.label).lastIndexOf("Antes da correção");
  if (i < 0){ setStatus("Não há correção do Claude para desfazer neste laudo."); return; }
  const antes = versions[i].html;
  clearTimeout(editVerTimer); pushVersion("Antes de desfazer tudo");
  $("laudo").innerHTML = antes; pushVersion("Alterações do Claude desfeitas");
  renderAlerts(); updateCount(); updVolHint(); scheduleCaseSave();
  setStatus("Todas as alterações do Claude foram desfeitas. Suas edições feitas depois do Gerar laudo ficam em Versões.", "ok");
}
$("undoAllBtn").onclick = undoAllClaude;

/* ================= Salvamento automático dos laudos (casos) ================= */
let caseId = store.get("caseId") || null, caseStart = store.get("caseStart") || null, caseCopied = false, caseTimer = null, casesCleaned = false;
function newCase(){ caseId = null; caseStart = null; caseCopied = false; store.set("caseId", ""); store.set("caseStart", ""); }
function ensureCase(){
  if (!caseId){ const d = new Date(); caseId = dayKey(d) + "-" + d.getTime().toString(36); caseStart = d.toISOString(); store.set("caseId", caseId); store.set("caseStart", caseStart); }
  return caseId;
}
function scheduleCaseSave(){ clearTimeout(caseTimer); caseTimer = setTimeout(saveCaseNow, 2000); try{ store.set("laudoHtml", $("laudo").innerHTML); }catch(e){} }
async function saveCaseNow(){
  clearTimeout(caseTimer);
  try{ store.set("laudoHtml", $("laudo").innerHTML); }catch(e){}
  const ach = "", lau = laudoTagged();
  if (!ach.trim() && !lau.trim()) return;
  if (!db) return;
  const id = ensureCase(), now = new Date();
  const vs = versions.slice(-15).map(v => ({ label: v.label, hora: v.hora, html: v.html.slice(0, 20000) }));
  try{
    await db.doc("casos/" + id).set({
      dia: id.slice(0, 10), inicio: caseStart, atualizado: now.toISOString(),
      hora: String(new Date(caseStart).getHours()).padStart(2,"0") + ":" + String(new Date(caseStart).getMinutes()).padStart(2,"0"),
      exame: fullName(current), exameId: current.id, achados: ach.slice(0, 20000), laudo: lau.slice(0, 20000),
      laudoHtml: $("laudo").innerHTML.slice(0, 40000), versoes: vs, copiado: caseCopied
    });
  }catch(e){}
  if (!casesCleaned){
    casesCleaned = true;
    try{ const cut = dayKey(new Date(Date.now() - 30*864e5)); const old = await db.collection("casos").where("dia", "<", cut).get(); for (const d of old.docs) await db.doc("casos/" + d.id).delete(); }catch(e){}
  }
}
$("laudo").addEventListener("input", scheduleCaseSave);
window.addEventListener("beforeunload", () => { try{ store.set("laudoHtml", $("laudo").innerHTML); }catch(e){} });




/* ================= Treino de voz: aprende os erros do reconhecimento com a sua voz ================= */
function wordAlign(recWords, expWords){
  const R = recWords.map(fold), E = expWords.map(fold), n = R.length, m = E.length;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i; for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (R[i-1] === E[j-1] ? 0 : 1));
  const ops = []; let i = n, j = m;
  while (i > 0 || j > 0){
    if (i > 0 && j > 0 && R[i-1] === E[j-1] && d[i][j] === d[i-1][j-1]){ ops.push(["=", recWords[i-1], expWords[j-1]]); i--; j--; }
    else if (i > 0 && j > 0 && d[i][j] === d[i-1][j-1] + 1){ ops.push(["~", recWords[i-1], expWords[j-1]]); i--; j--; }
    else if (i > 0 && d[i][j] === d[i-1][j] + 1){ ops.push(["-", recWords[i-1], null]); i--; }
    else { ops.push(["+", null, expWords[j-1]]); j--; }
  }
  return ops.reverse();
}
const toWords = t => String(t).replace(/[.,;:!?()"“”]/g, " ").split(/\s+/).filter(Boolean);
function errorBlocks(rec, exp){
  const ops = wordAlign(toWords(rec), toWords(exp)), blocks = []; let cur = null;
  for (const [op, r, e] of ops){
    if (op === "="){ if (cur){ blocks.push(cur); cur = null; } continue; }
    cur = cur || { de: [], para: [] };
    if (r) cur.de.push(r); if (e) cur.para.push(e);
  }
  if (cur) blocks.push(cur);
  return { ops, blocks: blocks.filter(b => b.de.length && b.para.length && b.de.length <= 4 && b.para.length <= 4)
    .map(b => ({ de: b.de.join(" ").toLowerCase(), para: b.para.join(" ") }))
    .filter(b => fold(b.de) !== fold(b.para)) };
}
const TRAIN_SENTS = (() => {
  const out = [], seen = new Set();
  for (const e of BANK){
    for (const sent of String(e[3]).split(/(?<=[.])\s+|\n/)){
      const t = sent.trim().replace(/\s+/g, " ");
      const w = t.split(" ");
      if (w.length < 5 || w.length > 24 || /[\[\]{}_]|\d{3,}/.test(t) || seen.has(t)) continue;
      const score = w.filter(x => x.replace(/[^\p{L}]/gu, "").length >= 9).length;
      if (score >= 1){ out.push([score, t]); seen.add(t); }
    }
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, 2000).map(x => x[1]);
})();
let trainQueue = [], trainIdx = 0, trainFound = new Map(), trainWords = { ok: 0, tot: 0 }, trainTimer = null, trainDone = new Set();
// Frases ainda não lidas primeiro; entre elas, as que têm palavras que o reconhecimento já errou com você
function trainUsadas(){ try{ return new Set(JSON.parse(store.get("treinoUsadas") || "[]")); }catch(e){ return new Set(); } }
function trainShuffle(){
  const usadas = trainUsadas(), dif = new Set();
  const addDif = t => { for (const w of fold(String(t)).split(/[^a-z]+/)) if (w.length >= 5) dif.add(w); };
  for (const c of correcoes) addDif(c.para);
  for (const k of trainFound.keys()) addDif(k.split("||")[1] || "");
  const sc = TRAIN_SENTS.map(t => {
    const d = fold(t).split(/[^a-z]+/).filter(w => dif.has(w)).length;
    return { t, s: (usadas.has(hashText(t)) ? 0 : 20) + Math.min(d, 3) * 4 + Math.random() * 6 };
  });
  sc.sort((a, b) => b.s - a.s);
  return sc.slice(0, 40).map(x => x.t);
}
const trainSend = d => document.dispatchEvent(new CustomEvent("laudos-treino", { detail: JSON.stringify(d) }));
document.addEventListener("laudos-treino-status", e => {
  let d; try{ d = JSON.parse(e.detail); }catch(err){ return; }
  const min = Math.round((d.secs || 0) / 60), falta = Math.max(0, 60 - min);
  $("trainRec").textContent = `Gravações salvas no seu computador: ${d.count} ${d.count === 1 ? "frase" : "frases"} · ${(d.secs || 0) < 60 ? (d.secs || 0) + " s" : min + " min"} de áudio. ` +
    (falta ? `Meta para treinar um reconhecedor na sua voz no futuro: 1 hora (faltam uns ${falta} min, cerca de ${Math.ceil(falta * 12)} frases).` : "Meta de 1 hora atingida: as gravações já bastam para treinar um reconhecedor na sua voz no futuro.");
  $("trainRecBar").style.width = Math.min(100, (d.secs || 0) / 36) + "%";
});
function trainShow(){
  const t = trainQueue[trainIdx] || "";
  if (t) trainSend({ acao: "inicio", texto: t });
  $("trainSent").textContent = t || "Fim das frases desta sessão. Clique em Terminar e aprender.";
  $("trainInput").value = ""; $("trainDiff").textContent = "";
  const acc = trainWords.tot ? Math.round(trainWords.ok / trainWords.tot * 100) : null;
  $("trainProg").textContent = `Frase ${Math.min(trainIdx + 1, trainQueue.length)} de ${trainQueue.length}` + (acc !== null ? ` · acerto ${acc}%` : "");
  $("trainInput").focus();
}
function trainEvaluate(){
  const exp = trainQueue[trainIdx], rec = $("trainInput").value.trim();
  if (!exp || !rec || trainDone.has(trainIdx)) return;
  trainDone.add(trainIdx);
  trainSend({ acao: "fim", texto: exp, reconhecido: rec });
  try{ const u = trainUsadas(); u.add(hashText(exp)); store.set("treinoUsadas", JSON.stringify([...u].slice(-4000))); }catch(e){}
  const { ops, blocks } = errorBlocks(rec, exp);
  const expCount = ops.filter(o => o[2]).length, okCount = ops.filter(o => o[0] === "=").length;
  trainWords.ok += okCount; trainWords.tot += expCount;
  const box = $("trainDiff"); box.textContent = "";
  for (const [op, r, e] of ops){
    if (op === "="){ const s = document.createElement("span"); s.className = "ok"; s.textContent = e + " "; box.append(s); }
    else { if (r){ const s = document.createElement("span"); s.className = "bad"; s.textContent = r; box.append(s, document.createTextNode(" ")); }
           if (e){ const s = document.createElement("span"); s.className = "exp"; s.textContent = e; box.append(s, document.createTextNode(" ")); } }
  }
  for (const b of blocks){ const k = b.de + "||" + b.para; trainFound.set(k, (trainFound.get(k) || 0) + 1); }
  trainAutoLearn(blocks);
  const acc = trainWords.tot ? Math.round(trainWords.ok / trainWords.tot * 100) : 0;
  $("trainProg").textContent = `Frase ${trainIdx + 1} de ${trainQueue.length} · acerto ${acc}%`;
}
$("trainInput").addEventListener("input", () => { clearTimeout(trainTimer); trainTimer = setTimeout(trainEvaluate, 1600); });
new MutationObserver(() => { if ($("trainModal").hidden) trainSend({ acao: "cancelar" }); }).observe($("trainModal"), { attributes: true, attributeFilter: ["hidden"] });
function openTrain(){
  closeModal("setModal"); $("vozModal").hidden = true;
  trainQueue = trainShuffle(); trainIdx = 0; trainFound = new Map(); trainWords = { ok: 0, tot: 0 }; trainDone = new Set();
  $("trainResult").hidden = true; openModal("trainModal"); trainSend({ acao: "status" }); trainShow();
}
$("trainOpen").onclick = openTrain; $("trainOpen2").onclick = openTrain;
$("trainNext").onclick = () => { clearTimeout(trainTimer); trainEvaluate(); trainIdx++; trainShow(); };
$("trainSkip").onclick = () => { clearTimeout(trainTimer); trainSend({ acao: "cancelar" }); trainIdx++; trainShow(); };
$("trainEnd").onclick = () => {
  clearTimeout(trainTimer); trainEvaluate(); trainSend({ acao: "cancelar" });
  const ul = $("trainPairs"); ul.textContent = "";
  const pairs = [...trainFound.entries()].map(([k, n]) => { const [de, para] = k.split("||"); return { de, para, n }; });
  if (!pairs.length){ ul.append(emptyItem(trainWords.tot ? "Nenhum erro encontrado nesta sessão. Ótimo!" : "Nenhuma frase foi lida ainda.")); }
  for (const p of pairs){
    const risky = p.de.split(" ").length === 1 && KNOWN.has(fold(p.de)) && !VOCAB.includes(p.para.toLowerCase());
    const li = document.createElement("li");
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !risky; cb.dataset.de = p.de; cb.dataset.para = p.para;
    const t = document.createElement("span"); t.textContent = `${p.de} → ${p.para}` + (risky ? "  (palavra comum: confira antes)" : "");
    const n = document.createElement("span"); n.className = "meta"; n.textContent = p.n + "×";
    li.append(cb, t, n); ul.append(li);
  }
  $("trainResult").hidden = false; $("trainMsg").textContent = "";
  saveTrainStats();
};
$("trainSave").onclick = async () => {
  let n = 0;
  for (const cb of $("trainPairs").querySelectorAll("input:checked")){ try{ if (await addCorrecao(cb.dataset.de, cb.dataset.para)) n++; }catch(e){} }
  $("trainMsg").textContent = n ? `${n} ${n === 1 ? "correção confirmada" : "correções confirmadas"}. As correções já são salvas sozinhas a cada frase e valem no ditado.` : "Nada marcado.";
};
/* Treino -> ditado: cada erro encontrado vira correção automática na hora (sem Claude, sem tokens).
   Palavra comum sozinha (ex.: "de", "e") só vira correção se o mesmo erro aparecer 2 vezes. */
async function trainAutoLearn(blocks){
  if (!db) return;
  const n = (blocks || []).filter(b => b.de && b.para && fold(b.de) !== fold(b.para) && b.de.split(/\s+/).length <= 4 && b.para.split(/\s+/).length <= 4);
  const safe = [], risky = [];
  for (const b of n){
    const isRisky = b.de.split(" ").length === 1 && KNOWN.has(fold(b.de)) && !VOCAB.includes(b.para.toLowerCase());
    (isRisky ? risky : safe).push(b);
  }
  let saved = 0;
  for (const b of safe){ try{ if (!correcoes.some(c => fold(c.de) === fold(b.de))){ await addCorrecao(b.de, b.para); saved++; } }catch(e){} }
  if (risky.length) await learnPairs(risky, 2);
  if (saved) $("trainDiff").append(document.createTextNode(`  · ${saved} ${saved === 1 ? "correção aprendida" : "correções aprendidas"} e já ativa no ditado`));
}
async function saveTrainStats(){
  if (!db || !trainWords.tot) return;
  try{
    const ref = db.doc("treino/estatisticas"), snap = await ref.get();
    const hist = snap.exists && Array.isArray(snap.data().sessoes) ? snap.data().sessoes.slice(-49) : [];
    hist.push({ data: new Date().toISOString(), frases: trainDone.size, acerto: Math.round(trainWords.ok / trainWords.tot * 100) });
    await ref.set({ sessoes: hist });
    showTrainStat(hist);
  }catch(e){}
}
function showTrainStat(hist){
  if (!hist || !hist.length){ $("trainStat").textContent = "Ainda sem treino."; return; }
  const last = hist[hist.length - 1];
  $("trainStat").textContent = `${hist.length} ${hist.length === 1 ? "sessão" : "sessões"} · último acerto ${last.acerto}%` + (hist.length > 1 ? ` (primeiro: ${hist[0].acerto}%)` : "");
}

/* Aprendizado contínuo: correções que o Claude faz no seu ditado viram correções automáticas quando se repetem */
async function learnPairs(pairs, limite = 3){
  if (!db || !pairs.length) return;
  try{
    const ref = db.doc("treino/pares"), snap = await ref.get();
    const map = snap.exists && snap.data().pares ? { ...snap.data().pares } : {};
    const ctxMap = snap.exists && snap.data().ctx ? { ...snap.data().ctx } : {};   // palavras vizinhas vistas em cada troca
    const learned = [];
    for (const p of pairs){
      const k = p.de + "||" + p.para;
      map[k] = (map[k] || 0) + 1;
      const viz = [p.antes, p.depois].flatMap(w => fold(String(w || "")).split(/[^a-z0-9]+/)).filter(w => w.length >= 3);
      if (p.comContexto) ctxMap[k] = [...new Set([...(ctxMap[k] || []), ...viz])].slice(-12);
      const ex = correcoes.find(c => fold(c.de) === fold(p.de));
      if (map[k] >= limite && !ex){ await addCorrecao(p.de, p.para, undefined, p.comContexto ? ctxMap[k] : undefined); learned.push(`${p.de} → ${p.para}` + (p.comContexto ? " (nesse contexto)" : "")); }
      else if (ex && p.comContexto && Array.isArray(ex.ctx) && viz.some(w => !ex.ctx.includes(w))) await addCorrecao(ex.de, ex.para, ex.id, ctxMap[k]);   // amplia o contexto
    }
    await ref.set({ pares: map, ctx: ctxMap });
    if (learned.length){ $("corrNote").textContent = "Aprendi com a sua voz: " + learned.join(" · "); }
  }catch(e){}
}


/* ================= Backup ================= */
const BK_COLS = ["casos","historico","mascaras","frases","correcoes","comandos","macros","regras","exemplos","config","dicionario"];
function bkMsg(t, err){ $("bkMsg").textContent = t; $("bkMsg").style.color = err ? "var(--crit)" : "var(--ok)"; }
$("bkDown").onclick = async () => {
  if (!db){ bkMsg("Disponível só dentro do claude.ai.", true); return; }
  bkMsg("Preparando…");
  const out = { app: "Laudos", versao: 1, criadoEm: new Date().toISOString(), dados: {} };
  try{
    for (const c of BK_COLS){ const snap = await db.collection(c).get(); out.dados[c] = snap.docs.map(d => ({ id: d.id, ...d.data() })); }
    const dl = window.claude ? await window.claude.use("downloads") : null;
    if (!dl){ bkMsg("Não foi possível baixar nesta visualização.", true); return; }
    await dl.save({ filename: `laudos-backup-${dayKey()}.json`, data: JSON.stringify(out) });
    const n = Object.values(out.dados).reduce((a, v) => a + v.length, 0);
    bkMsg(`Backup salvo (${n} itens).`);
  }catch(e){ bkMsg(e && e.code === "declined" ? "Download cancelado." : "Não foi possível gerar o backup.", true); }
};
$("bkFile").onchange = async () => {
  const f = $("bkFile").files[0]; $("bkFile").value = "";
  if (!f || !db) return;
  try{
    const data = JSON.parse(await f.text());
    if (!data || !data.dados) throw new Error("formato");
    let n = 0;
    for (const c of BK_COLS){ for (const d of (data.dados[c] || [])){ const { id, ...rest } = d; if (!id) continue; await db.doc(c + "/" + id).set(rest); n++; } }
    bkMsg(`Backup restaurado (${n} itens). Recarregue a página.`);
  }catch(e){ bkMsg("Arquivo de backup inválido.", true); }
};

/* ================= Recomendações automáticas ================= */
$("recs").checked = false;
$("recs").onchange = () => store.set("recs", $("recs").checked ? "1" : "0");

/* ================= Modo plantão ================= */
function setPlantao(on){
  document.body.classList.toggle("plantao", on);
  $("plantaoBtn").setAttribute("aria-pressed", on);
  $("plantaoBtn").textContent = on ? "Sair do modo plantão" : "Modo plantão";
  store.set("plantao", on ? "1" : "0");
  if (on) focusSheet();
}
function togglePlantao(){ setPlantao(!document.body.classList.contains("plantao")); }
$("plantaoBtn").onclick = togglePlantao;
$("plantaoExam").onchange = () => selectExam($("plantaoExam").value, true);


/* ================= 8. Calculadoras ================= */
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
const br = (n, d = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const CALCS = { wash:"Washout adrenal", fle:"Fleischner", renal:"R.E.N.A.L.", esteatose:"Esteatose", osso:"Densidade óssea L1", aorta:"Aneurisma de aorta", tep:"TEP · VD/VE", abc:"Hematoma ABC/2" };
let calcOrder = Object.keys(CALCS);
try{ const o = JSON.parse(store.get("calcOrder") || "null"); if (Array.isArray(o)) calcOrder = [...o.filter(k => CALCS[k]), ...Object.keys(CALCS).filter(k => !o.includes(k))]; }catch(e){}
let calcTab = calcOrder[0];
function calcText(){
  const t = calcTab;
  if (t === "wash"){
    const pre = num($("wPre").value), por = num($("wPort").value), tar = num($("wTard").value), tam = num($("wTam").value);
    const lesao = `Nódulo na glândula adrenal ${$("wLado").value}` + (tam ? `, medindo ${br(tam)} cm` : "");
    if (pre !== null && pre <= 10) return `${lesao}, com atenuação de ${br(pre,0)} UH na fase sem contraste, compatível com adenoma rico em lipídios.`;
    if (por === null || tar === null) return pre !== null ? `${lesao}, com atenuação de ${br(pre,0)} UH na fase sem contraste. Preencha as fases portal e tardia para calcular o washout.` : "Preencha os valores de atenuação.";
    const rel = (por - tar) / por * 100;
    const abs = pre !== null && por - pre !== 0 ? (por - tar) / (por - pre) * 100 : null;
    const aden = (abs !== null && abs >= 60) || rel >= 40;
    const valores = (pre !== null ? `${br(pre,0)} UH na fase sem contraste, ` : "") + `${br(por,0)} UH na fase portal e ${br(tar,0)} UH na fase tardia`;
    const w = (abs !== null ? `washout absoluto de ${br(abs,0)}% e ` : "") + `washout relativo de ${br(rel,0)}%`;
    return `${lesao}, com atenuação de ${valores}, apresentando ${w}, ${aden ? "achados compatíveis com adenoma" : "não preenchendo os critérios de washout para adenoma"}.`;
  }
  if (t === "fle"){
    const tipo = $("fTipo").value, multi = $("fNum").value === "multi", mm = num($("fTam").value), sol = num($("fSol").value), alto = $("fRisco").value === "alto";
    if (!mm) return "Preencha o diâmetro médio.";
    let rec;
    if (tipo === "solido"){
      if (mm < 6) rec = alto ? "controle tomográfico opcional em 12 meses" : "não é necessário seguimento de rotina";
      else if (mm <= 8) rec = multi ? "controle tomográfico em 3 a 6 meses e, conforme o resultado, considerar novo controle em 18 a 24 meses"
        : alto ? "controle tomográfico em 6 a 12 meses e novo controle em 18 a 24 meses" : "controle tomográfico em 6 a 12 meses e, conforme o resultado, considerar novo controle em 18 a 24 meses";
      else rec = multi ? "controle tomográfico em 3 a 6 meses e, conforme o resultado, considerar novo controle em 18 a 24 meses" : "considerar controle tomográfico em 3 meses, PET-CT ou amostragem tecidual";
    } else if (tipo === "vf"){
      if (multi) rec = mm < 6 ? "controle tomográfico em 3 a 6 meses e, se estável, considerar controles em 2 e 4 anos" : "controle tomográfico em 3 a 6 meses, com conduta posterior guiada pelo nódulo mais suspeito";
      else rec = mm < 6 ? "não é necessário seguimento de rotina" : "controle tomográfico em 6 a 12 meses para confirmar persistência e, depois, a cada 2 anos até completar 5 anos";
    } else {
      if (multi) rec = mm < 6 ? "controle tomográfico em 3 a 6 meses e, se estável, considerar controles em 2 e 4 anos" : "controle tomográfico em 3 a 6 meses, com conduta posterior guiada pelo nódulo mais suspeito";
      else if (mm < 6) rec = "não é necessário seguimento de rotina";
      else if (sol !== null && sol >= 6) rec = "controle tomográfico em 3 a 6 meses para confirmar persistência; se persistente, com componente sólido ≥ 6 mm, o nódulo deve ser considerado altamente suspeito";
      else rec = "controle tomográfico em 3 a 6 meses para confirmar persistência e, se inalterado com componente sólido < 6 mm, controle anual por 5 anos";
    }
    return `Segundo as recomendações da Sociedade Fleischner (2017), sugere-se ${rec}.`;
  }
  if (t === "renal"){
    const r = num($("rR").value), n = num($("rN").value);
    if (r === null || n === null) return "Preencha o diâmetro (R) e a distância ao sistema coletor (N).";
    const R = r <= 4 ? 1 : r < 7 ? 2 : 3, E = +$("rE").value, N = n >= 7 ? 1 : n > 4 ? 2 : 3, L = +$("rL").value;
    const tot = R + E + N + L, A = $("rA").value, h = $("rH").checked ? "h" : "";
    const cx = tot <= 6 ? "baixa" : tot <= 9 ? "moderada" : "alta";
    return `Lesão renal à ${$("rLado").value === "direito" ? "direita" : "esquerda"} com escore de nefrometria R.E.N.A.L. ${tot}${A}${h} (R${R} E${E} N${N} L${L}), de ${cx} complexidade.`;
  }
  if (t === "esteatose"){
    const f = num($("eF").value), b = num($("eB").value);
    if (f === null) return "Preencha a atenuação do fígado sem contraste.";
    const parts = [`atenuação hepática de ${br(f,0)} UH na fase sem contraste`];
    let grade = null;
    if (b !== null){
      const d = f - b, r = f / b;
      parts.push(`diferença fígado-baço de ${d > 0 ? "+" : ""}${br(d,0)} UH e relação fígado/baço de ${br(r,2)}`);
      if (f < 40 || d < -10) grade = "moderada a acentuada"; else if (r < 1) grade = "leve";
    } else if (f < 40) grade = "moderada a acentuada";
    return grade ? `Fígado com redução difusa dos coeficientes de atenuação (${parts.join(", ")}), compatível com esteatose ${grade}.`
                 : `Fígado com ${parts.join(", ")}, sem sinais tomográficos significativos de esteatose.`;
  }
  if (t === "osso"){
    const v = num($("oL1").value);
    if (v === null) return "Preencha a atenuação de L1.";
    const txt = v <= 100 ? "valor que sugere baixa densidade mineral óssea (osteoporose), sendo recomendável correlação com densitometria"
      : v <= 160 ? "valor intermediário, podendo corresponder a osteopenia; a critério clínico, considerar densitometria"
      : "valor que sugere densidade mineral óssea preservada";
    return `Atenuação do osso trabecular de L1 de ${br(v,0)} UH, ${txt}.`;
  }
  if (t === "aorta"){
    const d = num($("aD").value);
    if (d === null) return "Preencha o diâmetro máximo.";
    const seg = $("aSeg").value, fem = $("aSexo").value === "F";
    if (d < 3) return `Aorta abdominal ${seg} com diâmetro máximo de ${br(d)} cm, sem critérios para aneurisma.`;
    const rec = (fem && d >= 5) || d >= 5.5 ? "sugere-se avaliação pela cirurgia vascular para programação de tratamento"
      : d >= 5 ? "sugere-se controle por imagem em 6 meses" : d >= 4 ? "sugere-se controle por imagem anual" : "sugere-se controle por imagem em 3 anos";
    return `Dilatação aneurismática da aorta abdominal ${seg}, com diâmetro máximo de ${br(d)} cm. Segundo as recomendações da Society for Vascular Surgery, ${rec}.`;
  }
  if (t === "tep"){
    const vd = num($("tVD").value), ve = num($("tVE").value);
    if (!vd || !ve) return "Preencha os diâmetros dos dois ventrículos.";
    const r = vd / ve;
    return r >= 1 ? `Relação entre os diâmetros dos ventrículos direito e esquerdo de ${br(r,2)} (VD ${br(vd,0)} mm / VE ${br(ve,0)} mm), sugerindo sobrecarga das câmaras cardíacas direitas.`
                  : `Relação entre os diâmetros dos ventrículos direito e esquerdo de ${br(r,2)} (VD ${br(vd,0)} mm / VE ${br(ve,0)} mm), sem sinais tomográficos de sobrecarga das câmaras cardíacas direitas.`;
  }
  if (t === "abc"){
    const a = num($("hA").value), b = num($("hB").value), c = num($("hC").value);
    if (!a || !b || !c) return "Preencha as três medidas.";
    const loc = $("hLoc").value.trim();
    return `Hematoma intraparenquimatoso${loc ? " " + loc : ""}, medindo ${br(a)} x ${br(b)} x ${br(c)} cm, com volume estimado de ${br(a*b*c/2)} mL (método ABC/2).`;
  }
  return "";
}
function updCalc(){
  $("calcOut").textContent = calcText();
  if (calcTab === "fle"){ $("fSolLab").hidden = $("fTipo").value !== "ps"; $("fRiscoLab").hidden = $("fTipo").value !== "solido"; }
}
function showCalc(k){
  calcTab = k;
  document.querySelectorAll("#calcTabs .tab").forEach(x => x.setAttribute("aria-selected", x.dataset.ct === k));
  document.querySelectorAll("#calcModal [data-cp]").forEach(p => p.hidden = p.dataset.cp !== k);
  $("calcMsg").textContent = ""; updCalc();
}
function renderCalcTabs(){
  const w = $("calcTabs"); w.textContent = "";
  for (const k of calcOrder){
    const b = document.createElement("button");
    b.className = "tab"; b.type = "button"; b.setAttribute("role", "tab"); b.dataset.ct = k; b.textContent = CALCS[k];
    b.setAttribute("aria-selected", k === calcTab);
    b.onclick = e => { if (b.dataset.dragged){ delete b.dataset.dragged; e.preventDefault(); return; } showCalc(k); };
    b.onpointerdown = e => {
      if (e.button !== 0) return;
      const x0 = e.clientX, y0 = e.clientY; let moving = false;
      const move = ev => {
        if (!moving && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        if (!moving){ moving = true; b.classList.add("dragging"); try{ b.setPointerCapture(e.pointerId); }catch(err){} }
        const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.("#calcTabs .tab");
        if (!over || over === b) return;
        const r = over.getBoundingClientRect(), after = ev.clientX > r.left + r.width / 2;
        over.parentNode.insertBefore(b, after ? over.nextSibling : over);
      };
      const up = () => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
        b.classList.remove("dragging");
        if (moving){
          b.dataset.dragged = "1";
          calcOrder = [...$("calcTabs").querySelectorAll(".tab")].map(x => x.dataset.ct);
          saveCalcOrder();
        }
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    };
    b.onkeydown = e => {   // Alt+setas também reordena, pelo teclado
      if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      e.preventDefault();
      const i = calcOrder.indexOf(k), j = i + (e.key === "ArrowLeft" ? -1 : 1);
      if (j < 0 || j >= calcOrder.length) return;
      [calcOrder[i], calcOrder[j]] = [calcOrder[j], calcOrder[i]]; saveCalcOrder(); renderCalcTabs();
      document.querySelector(`#calcTabs [data-ct="${k}"]`)?.focus();
    };
    w.append(b);
  }
}
async function saveCalcOrder(){
  store.set("calcOrder", JSON.stringify(calcOrder));
  if (db) { try{ await db.doc("config/ui").set({ calcOrder }); }catch(e){} }
}
$("calcModal").addEventListener("input", updCalc);
$("calcModal").addEventListener("change", updCalc);
$("calcBtn").onclick = () => { openModal("calcModal"); renderCalcTabs(); showCalc(calcOrder.includes(calcTab) ? calcTab : calcOrder[0]); };
$("calcIns").onclick = () => {
  const t = calcText();
  if (!t || /^Preencha/.test(t)){ $("calcMsg").textContent = "Complete os campos antes de inserir."; $("calcMsg").style.color = "var(--crit)"; return; }
  insertAtCaret(t); updateCount(); updVolHint();
  $("calcMsg").style.color = "var(--ok)"; $("calcMsg").textContent = "Inserido no laudo, onde está o cursor.";
};

/* ================= Volume automático (3 medidas em sequência) ================= */
const NUMRE = "(\\d+(?:[.,]\\d+)?)";
const SEP = "\\s*(?:x|×|por)\\s*";
function findTriples(text){
  const re = new RegExp(NUMRE + SEP + NUMRE + SEP + NUMRE + "\\s*(cm|mm|cent[ií]metros?|mil[ií]metros?)?", "gi");
  const out = []; let m;
  while ((m = re.exec(text))){
    const [a,b,c] = [m[1],m[2],m[3]].map(num);
    if (!a || !b || !c) continue;
    const mm = /^m/i.test(m[4] || "");
    const v = a*b*c*0.52 / (mm ? 1000 : 1);
    out.push({ trecho: m[0].trim(), unidade: mm ? "mm" : "cm", vol: v });
  }
  return out;
}
const volStr = v => v >= 10 ? br(v, 0) : v >= 1 ? br(v, 1) : br(v, 2);
function volBlock(){
  const ts = findTriples(laudoText());
  if (!ts.length) return "";
  return `VOLUMES JÁ CALCULADOS (elipsoide, medidas × 0,52): ${ts.map(t => `"${t.trecho}" → ${volStr(t.vol)} cm³`).join("; ")}.
Sempre que essas medidas aparecerem no laudo, acrescente logo depois delas ", com volume estimado de X cm³", usando exatamente esses valores (se o volume já estiver escrito, não repita).
`;
}
function updVolHint(){
  const ts = findTriples(laudoText());
  $("volHint").textContent = ts.length ? "Volume: " + ts.map(t => `${t.trecho} → ${volStr(t.vol)} cm³`).join(" · ") : "";
}
sheet.addEventListener("input", () => { clearTimeout(volTimer); volTimer = setTimeout(updVolHint, 400); });
let volTimer = null;

/* ================= Formatação (negrito, itálico, sublinhado) ================= */
try{ document.execCommand("styleWithCSS", false, false); }catch(e){}
document.querySelectorAll(".fmt-bar").forEach(bar => {
  bar.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.onclick = () => { const t = $(bar.dataset.target); if (document.activeElement !== t) t.focus(); document.execCommand(btn.dataset.cmd, false, null); };
  });
});


/* ================= 9. Histórico ================= */
const dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
let histCache = {}, histDay = dayKey(), histSel = null, histCleaned = false;
async function saveHistory(text){
  if (!db || !text) return;
  const k = dayKey();
  try{
    const ref = db.doc("historico/" + k);
    const snap = await ref.get();
    const itens = snap.exists && Array.isArray(snap.data().itens) ? snap.data().itens.slice() : [];
    if (itens[0] && itens[0].texto === text) return;
    const now = new Date();
    itens.unshift({ hora: String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0"), exame: current.name, exameId: current.id, texto: text.slice(0, 8000) });
    await ref.set({ itens: itens.slice(0, 120) });
    if (!histCleaned){
      histCleaned = true;
      const cut = dayKey(new Date(Date.now() - 30*864e5));
      const all = await db.collection("historico").get();
      for (const d of all.docs) if (d.id < cut) { try{ await db.doc("historico/" + d.id).delete(); }catch(e){} }
    }
  }catch(e){}
}
const fmtDay = k => { const [y,m,d] = k.split("-"); return k === dayKey() ? "Hoje" : `${d}/${m}/${y}`; };
async function openHistory(){
  openModal("histModal");
  $("histDays").textContent = "Carregando…";
  histCache = {}; histSel = null;
  await saveCaseNow();
  if (db){
    try{
      const all = await db.collection("casos").orderBy("atualizado", "desc").limit(400).get();
      for (const d of all.docs){ const v = { id: d.id, ...d.data() }; (histCache[v.dia] = histCache[v.dia] || []).push(v); }
      // laudos copiados em versões anteriores da página (antes do salvamento automático)
      const old = await db.collection("historico").get();
      for (const d of old.docs){
        for (const [i, it] of (d.data().itens || []).entries()){
          const v = { id: "hist-" + d.id + "-" + i, legado: true, dia: d.id, hora: it.hora, exame: it.exame, exameId: it.exameId, laudo: it.texto, achados: "", copiado: true, versoes: [] };
          (histCache[v.dia] = histCache[v.dia] || []).push(v);
        }
      }
      for (const k of Object.keys(histCache)) histCache[k].sort((a, b) => String(b.hora).localeCompare(String(a.hora)));
    }catch(e){}
  }
  if (!histCache[histDay]) histDay = Object.keys(histCache).sort().reverse()[0] || dayKey();
  renderHistDays(); renderHist();
}
function renderHistDays(){
  const l = $("histDays"); l.textContent = "";
  const keys = Object.keys(histCache).sort().reverse();
  if (!keys.length){ l.textContent = db ? "Nenhum laudo ainda." : "Disponível só dentro do claude.ai."; return; }
  for (const k of keys){
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-pressed", k === histDay);
    const a = document.createElement("span"); a.textContent = fmtDay(k);
    const n = document.createElement("span"); n.className = "meta"; n.textContent = histCache[k].length + " laudos";
    b.append(a, n); b.onclick = () => { histDay = k; histSel = null; renderHistDays(); renderHist(); }; l.append(b);
  }
}
function conclusionOf(t){
  const ls = String(t || "").split("\n").map(x => stripMarks(x).trim()).filter(Boolean);
  const i = ls.findIndex(x => norm(x) === "conclusão");
  return i >= 0 && ls[i+1] ? ls[i+1] : "";
}
function renderHist(){
  const q = fold($("histBusca").value.trim());
  const l = $("histList"); l.textContent = "";
  const itens = (histCache[histDay] || []).filter(it => !q || fold((it.laudo || "") + " " + (it.achados || "") + " " + it.exame).includes(q));
  if (!itens.length){ l.append(emptyItem(q ? "Nada encontrado." : "Nenhum laudo neste dia.")); }
  itens.forEach(it => {
    const li = document.createElement("li"); li.tabIndex = 0; li.setAttribute("aria-selected", histSel === it);
    const a = document.createElement("span"); a.className = "k"; a.textContent = it.hora + " · " + it.exame;
    const b = document.createElement("span"); b.textContent = conclusionOf(it.laudo) || String(it.achados || "").slice(0, 120) || "(vazio)";
    const c = document.createElement("span"); c.className = "chip " + (it.copiado ? "c-ok" : "c-warn"); c.textContent = it.copiado ? "Copiado" : "Rascunho";
    li.append(a, b, c);
    const pick = () => { histSel = it; renderHist(); };
    li.onclick = pick; li.onkeydown = e => { if (e.key === "Enter") pick(); };
    l.append(li);
  });
  $("histView").hidden = $("histBar").hidden = !histSel;
  $("histAchBox").hidden = !histSel || !histSel.achados;
  if (histSel){
    const tmp = document.createElement("div"); tmp.innerHTML = histSel.laudoHtml || toHtml(histSel.laudo || "");
    tmp.querySelectorAll("span.chg").forEach(x => x.replaceWith(...x.childNodes));
    $("histView").innerHTML = tmp.innerHTML || '<p class="review-empty">Sem laudo gerado.</p>';
    $("histAch").textContent = histSel.achados || "";
    $("histMsg").textContent = (histSel.versoes || []).length ? `${histSel.versoes.length} versões salvas` : "";
  }
}
$("histBusca").addEventListener("input", () => { histSel = null; renderHist(); });
$("histBtn").onclick = openHistory;
$("histCopy").onclick = async () => {
  if (!histSel) return;
  const html = `<div style="font-family:${FORMAT.font},Helvetica,sans-serif;font-size:${FORMAT.size}">${$("histView").innerHTML}</div>`;
  const ok = await copyToClipboard(stripMarks(histSel.laudo || ""), html);
  $("histMsg").textContent = ok ? "Copiado." : "Não foi possível copiar. Use Retomar este laudo.";
};
$("histOpen").onclick = () => {
  if (!histSel) return;
  saveCaseNow();
  const it = histSel;
  if (EXAMS.some(e => e.id === it.exameId)){ current = EXAMS.find(e => e.id === it.exameId); store.set("exame", current.id); renderExams(); }
  if (it.legado){ newCase(); } else { caseId = it.id; caseStart = it.inicio; caseCopied = !!it.copiado; } if (caseId){ store.set("caseId", caseId); store.set("caseStart", caseStart || ""); }
    $("laudo").innerHTML = it.laudoHtml || toHtml(it.laudo || ""); modelSig = ""; store.set("modelSig", ""); updateCount(); updVolHint();
  versions = (it.versoes || []).map(v => ({ ...v })); verPtr = versions.length - 1; $("verCount").textContent = versions.length ? "(" + versions.length + ")" : "";
  lastGenerated = laudoText(); resetReview(); renderAlerts(); checkedHash = "";
  closeModal("histModal"); setStatus("Laudo retomado do histórico. As alterações continuam salvas nele.", "ok");
};


/* ---------- início ---------- */
$("bankInfo").textContent = BANK.filter(e => !/^Laudos/.test(e[1])).length + " frases · cópia de " + BANK_DATE;
showNtInfo();
const saved = store.get("exame");
current = EXAMS.find(x => x.id === saved) || EXAMS[0];
renderExams();

try{ const h = store.get("laudoHtml"); if (h) { $("laudo").innerHTML = h; } }catch(e){}
if (!sheetHasContent()) sheet.innerHTML = modelSheetHtml(current), modelSig = laudoTagged(), store.set("modelSig", modelSig);

updateCount();
renderRules();
renderVoz();
$("compTexto").value = store.get("compTexto") || ""; $("compData").value = store.get("compData") || "";

updComp();
updVolHint();
setPlantao(store.get("plantao") === "1");
setCollapsed(store.get("sideCollapsed") === "1");
applyLook();
setFoco(store.get("foco") === "1");
applyLayout();
try{ const f = JSON.parse(store.get("docFormat") || "null"); setDocFormat(f?.font || "Arial", f?.size || "11", false); }catch(e){ setDocFormat("Arial", "11", false); }
publishVoice();
showUse();
if ($("laudo").textContent.trim()){ lastGenerated = laudoText(); renderAlerts(); }
$("kAcao").innerHTML = Object.entries(ACOES).map(([k,v]) => `<option value="${k}">${v}</option>`).join("");
$("vozBtn").onclick = () => { $("vozModal").hidden = false; vozMsg(""); $("fNome").focus(); };
$("vozX").onclick = () => { $("vozModal").hidden = true; };
$("vozModal").addEventListener("click", e => { if (e.target === $("vozModal")) $("vozModal").hidden = true; });
document.querySelectorAll("#vozModal [data-vt]").forEach(b => b.onclick = () => vozTab(b.dataset.vt));
$("fAdd").onclick = async () => {
  try{ if (await addFrase($("fNome").value, $("fTexto").value, editingVoz.frases)){ vozMsg(`Autotexto salvo. Diga "autotexto ${vnorm($("fNome").value)}".`); endEdit("frases"); $("fNome").focus(); } else vozMsg("Preencha o nome e o texto.", true); }
  catch(e){ vozMsg("Não foi possível salvar. Tente de novo.", true); }
};
$("cAdd").onclick = async () => {
  try{ if (await addCorrecao($("cDe").value, $("cPara").value, editingVoz.correcoes)){ vozMsg("Correção salva."); endEdit("correcoes"); $("cDe").focus(); } else vozMsg("Preencha os dois campos.", true); }
  catch(e){ vozMsg("Não foi possível salvar. Tente de novo.", true); }
};
$("kAdd").onclick = async () => {
  try{ if (await addComando($("kFala").value, $("kAcao").value, editingVoz.comandos)){ vozMsg("Comando salvo."); endEdit("comandos"); $("kFala").focus(); } else vozMsg("Escreva o que você vai falar.", true); }
  catch(e){ vozMsg("Não foi possível salvar. Tente de novo.", true); }
};

/* ações vindas da extensão de ditado */
document.addEventListener("laudos-voz", e => {
  let d; try{ d = JSON.parse(e.detail); }catch(err){ return; }
  if (!d) return;
  if (d.acao === "copiarGlobal"){ copyForExtension(d.id); return; }
  if (runPageAction(d.acao)) return;
  if (d.acao === "normal") laudoNormal();
  else if (d.acao === "gerar") gerar();
  else if (d.acao === "copiar") $("copiar").click();
  else if (d.acao === "novo") $("limpar").click();
  else if (d.acao === "revisar") revisar();
  else if (d.acao === "plantao") togglePlantao();
  else if (d.acao === "exame" || /^exame:/.test(d.acao || "")){
    const id = d.id || d.acao.slice(6);
    const ex = EXAMS.find(x => x.id === id); if (!ex) return;
    if (d.add) selectExam(ex.id, false, true); else openMaskAsNew(ex);
    setStatus((d.add ? "Máscara adicionada: " : "Máscara: ") + fullName(ex) + (ex.mine ? "" : " (provisória)"), "ok");
  }
});

/* Correção por voz ("corrigir palavra") feita na extensão: aprende a troca */
document.addEventListener("laudos-correcao", async e => {
  let d; try{ d = JSON.parse(e.detail); }catch(err){ return; }
  const de = String(d && d.de || "").trim(), para = String(d && d.para || "").trim();
  if (!de || !para || fold(de) === fold(para)) return;
  const words = fold(de).split(/[^a-z0-9]+/).filter(Boolean);
  const valida = words.length && words.every(w => w.length < 3 || KNOWN.has(w));
  try{
    if (!valida){ await addCorrecao(de, para); setStatus(`Correção aprendida: "${de}" → "${para}".`, "ok"); }
    else { await learnPairs([{ de, para, antes: d.antes, depois: d.depois, comContexto: true }], 2); setStatus(`Corrigido. Como "${de}" também é uma palavra válida, a troca só vira automática se você corrigir de novo, e só perto das mesmas palavras.`, "ok"); }
  }catch(err){}
});


/* Ligação com o Tasy (via extensão): escolhe a máscara e traz a indicação clínica */
let tasyPend = null;
function matchExamTasy(proc){
  const p = " " + fold(proc).replace(/[^a-z0-9]+/g, " ") + " ";
  const angio = /angio/.test(p), stop = new Set(["tc","de","do","da","e","com","sem","total","contraste","tomografia","computadorizada","exame","parecer"]);
  let best = null, bs = 0, bestP = null, bsP = 0;   // prefere as máscaras de parecer provisório
  for (const ex of EXAMS){
    let sc = 0;
    for (const term of [shortName(ex), ...(ex.voz || [])]){
      const toks = fold(term).replace(/[^a-z0-9]+/g, " ").split(" ").filter(t => t && !stop.has(t));
      if (!toks.length) continue;
      const hit = toks.filter(t => p.includes(" " + t + " ") || (t.length >= 5 && p.includes(" " + t.slice(0, 5)))).length;
      sc = Math.max(sc, hit / toks.length + hit * 0.1);
    }
    if (angio !== /angio/.test(fold(ex.name))) sc -= 0.5;
    if (ex.tipo === "parecer"){ if (sc > bsP){ bsP = sc; bestP = ex; } }
    else if (sc > bs){ bs = sc; best = ex; }
  }
  if (bsP >= 0.5) return bestP;
  return bs >= 0.5 ? best : null;
}
const tasyIndicacao = txt => String(txt || "").replace(/\s+/g, " ").trim().slice(0, 400);
function applyTasy(d, parts){
  const ex = d.procedimento ? matchExamTasy(d.procedimento) : null, clin = tasyIndicacao(d.clinica);
  if (parts.masc && ex && ex.id !== current.id) selectExam(ex.id, false);
  if (parts.ind && clin && !laudoText().includes(clin)) setClinica(clin.replace(/[.\s]+$/, "") + ".");
}
function onTasy(d){
  if (!d || (!d.procedimento && !d.clinica)) return;
  const ex = d.procedimento ? matchExamTasy(d.procedimento) : null, clin = tasyIndicacao(d.clinica);
  const vazio = !sheetHasContent() || modelIntact();
  if (vazio){
    applyTasy(d, { masc: true, ind: true });
    $("tasyBar").hidden = true; tasyPend = null;
    setStatus(`Tasy: ${d.procedimento || "exame"}` + (ex ? ` → máscara ${fullName(ex)}` : " (sem máscara correspondente)") + (clin ? " · indicação inserida no laudo" : "") + ".", "ok");
    return;
  }
  tasyPend = d;
  $("tasyTx").innerHTML = `<b>Tasy:</b> ${esc(d.procedimento || "exame")}` + (ex ? ` → ${esc(fullName(ex))}` : " (sem máscara correspondente)") + (clin ? ` · <b>Indicação:</b> ${esc(clin)}` : "");
  $("tasyMasc").hidden = !ex || ex.id === current.id; $("tasyMasc").textContent = ex ? "Usar máscara " + shortName(ex) : "Usar máscara";
  $("tasyInd").hidden = !clin || laudoText().includes(clin);
  $("tasyBar").hidden = false;
}
document.addEventListener("laudos-tasy", e => { let d; try{ d = JSON.parse(e.detail); }catch(err){ return; } onTasy(d); });
$("tasyMasc").onclick = () => { if (tasyPend) applyTasy(tasyPend, { masc: true }); $("tasyMasc").hidden = true; };
$("tasyInd").onclick = () => { if (tasyPend) applyTasy(tasyPend, { ind: true }); $("tasyInd").hidden = true; };
$("tasyNovo").onclick = () => { const d = tasyPend; $("limpar").click(); $("tasyBar").hidden = true; if (d) onTasy(d); };
$("tasyX").onclick = () => { $("tasyBar").hidden = true; tasyPend = null; };


/* ================= Laudos de referência (Notion › Notas Tomografia) =================
   As frases ficam guardadas na própria página (cópia embutida) e no banco de dados do artefato.
   "Atualizar do Notion" lê a página pelo conector do Notion e refaz as frases aqui mesmo, sem usar o Claude
   (não gasta o seu limite). A cada 3 dias ele atualiza sozinho, se o Notion já estiver liberado para a página. */
const NT_PAGE = "3e991fa845d880268d64d80cdbff8515";
const NT_DIAS = 3;
function showNtInfo(msg, err){
  const n = BANK.filter(e => /^Laudos/.test(e[1])).reduce((a, e) => a + e[3].split("\n").length, 0);
  $("ntInfo").textContent = msg || `${NT_INFO.laudos} laudos · ${n} frases · ${NT_INFO.fonte === "cópia" ? "cópia de " : "atualizado em "}${NT_INFO.data}`;
  $("ntInfo").style.color = err ? "var(--crit)" : "";
}
function replaceNT(entries){
  PIDX = null;
  for (let i = BANK.length - 1; i >= 0; i--) if (/^Laudos/.test(BANK[i][1])){ BANK.splice(i, 1); BIDX.splice(i, 1); }
  for (const e of entries){
    if (!Array.isArray(e) || e.length < 4) continue;
    BANK.push(e); BIDX.push({ key: fold(e[0] + " " + e[1] + " " + e[2]), body: fold(e[3]) });
    for (const w of fold(e[3]).split(/[^a-z]+/)) if (w.length >= 3) KNOWN.add(w);
  }
}
const brDate = d => new Date(d).toLocaleDateString("pt-BR");
async function loadNtFromDb(){
  if (!db) return null;
  try{
    const m = await db.doc("bancoNT/meta").get();
    if (!m.exists) return null;
    const meta = m.data(), parts = [];
    for (let i = 0; i < (meta.partes || 0); i++){
      const d = await db.doc("bancoNT/p" + i).get();
      if (!d.exists) return null;
      parts.push(...JSON.parse(d.data().json || "[]"));
    }
    if (!parts.length) return null;
    replaceNT(parts);
    NT_INFO = { laudos: meta.laudos || 0, data: brDate(meta.atualizadoEm), fonte: "db", em: meta.atualizadoEm };
    showNtInfo();
    return meta;
  }catch(e){ return null; }
}
async function saveNtToDb(entries, laudos){
  if (!db) return;
  const json = JSON.stringify(entries), parts = [];
  // cada documento do banco guarda até ~180 KB
  let cur = [], len = 2;
  for (const e of entries){
    const l = JSON.stringify(e).length + 1;
    if (len + l > 180000 && cur.length){ parts.push(cur); cur = []; len = 2; }
    cur.push(e); len += l;
  }
  if (cur.length) parts.push(cur);
  for (let i = 0; i < parts.length; i++) await db.doc("bancoNT/p" + i).set({ json: JSON.stringify(parts[i]) });
  await db.doc("bancoNT/meta").set({ partes: parts.length, laudos, frases: entries.reduce((a, e) => a + e[3].split("\n").length, 0), atualizadoEm: new Date().toISOString(), bytes: json.length });
}
function notionText(res){
  let p = res && res.payload;
  if (typeof p === "string"){ try{ p = JSON.parse(p); }catch(e){} }
  if (p && typeof p === "object" && typeof p.text === "string") return p.text;
  if (typeof p === "string") return p;
  const blocks = (res && res.content) || [];
  const txt = blocks.filter(b => b.type === "text").map(b => b.text).join("\n");
  try{ const j = JSON.parse(txt); if (j && typeof j.text === "string") return j.text; }catch(e){}
  return txt;
}
let ntBusy = false;
async function updateNtFromNotion(manual){
  if (ntBusy) return; ntBusy = true;
  $("ntUpd").disabled = true;
  showNtInfo("Buscando a página Notas Tomografia no Notion…");
  try{
    const mcp = window.claude ? await window.claude.use("mcp") : null;
    if (!mcp){ showNtInfo("Conector do Notion indisponível nesta visualização. Mantida a cópia salva.", true); return; }
    const res = await mcp.callTool("Notion", "notion-fetch", { id: NT_PAGE }, { cache: false });
    const text = notionText(res);
    const r = extractNotasTomografia(text || "");
    if (!r.entries.length){ showNtInfo("Não encontrei laudos na página do Notion. Mantida a cópia salva.", true); return; }
    replaceNT(r.entries);
    NT_INFO = { laudos: r.laudos, data: brDate(Date.now()), fonte: "db" };
    showNtInfo();
    await saveNtToDb(r.entries, r.laudos);
    if (manual) setStatus(`Laudos de referência atualizados: ${r.laudos} laudos do Notion. Nenhum uso do Claude.`, "ok");
  }catch(e){
    const code = e && e.code;
    const msg = code === "server_not_connected" ? "Conecte o Notion em claude.ai › Configurações › Conectores."
      : code === "needs_reauth" ? "Reconecte o Notion em claude.ai › Configurações › Conectores."
      : code === "not_in_manifest" || code === "not_granted" ? "O Notion não foi liberado para esta página."
      : code === "selection_required" ? "Escolha qual conexão do Notion usar (aviso do claude.ai)."
      : code === "server_unavailable" ? "O Notion não respondeu agora. Tente de novo em instantes."
      : code === "tool_error" ? "O Notion recusou a leitura: " + (e.message || "")
      : "Não consegui atualizar do Notion (" + (code || "erro") + ").";
    showNtInfo(msg + " Mantida a cópia salva.", true);
  }finally{ ntBusy = false; $("ntUpd").disabled = false; }
}
$("ntUpd").onclick = () => updateNtFromNotion(true);
(async () => {
  // espera o banco de dados do artefato; usa a versão mais nova salva; atualiza sozinho a cada 3 dias
  for (let i = 0; i < 40 && !db; i++) await new Promise(r => setTimeout(r, 250));
  const meta = await loadNtFromDb();
  const ultima = meta ? new Date(meta.atualizadoEm).getTime() : new Date(window.BANK_NT_META.iso).getTime();
  if (Date.now() - ultima < NT_DIAS * 864e5) return;
  let st = "unavailable";
  try{
    const perm = window.claude ? await window.claude.use("permissions") : null;
    st = perm ? await Promise.resolve(perm.state("mcp:Notion")).catch(() => "unavailable") : "unavailable";
  }catch(e){}
  if (st === "granted") updateNtFromNotion(false);
  else showNtInfo(`${NT_INFO.laudos} laudos · cópia de ${NT_INFO.data} · clique em Atualizar para buscar os novos`);
})();


/* ================= Ícones ao selecionar texto: corrigir palavra, criar autotexto, ensinar estilo ================= */
(() => {
  const ICON = {
    fix: '<svg viewBox="0 0 16 16"><path d="M3 13l.6-3.2L11 2.4 13.6 5 6.2 12.4z"/><path d="M9.6 3.8l2.6 2.6"/></svg>',
    auto: '<svg viewBox="0 0 16 16"><rect x="3.5" y="2" width="9" height="12" rx="1.2"/><path d="M6 2v12M8.2 5.5h2.6M8.2 8h2.6"/></svg>',
    style: '<svg viewBox="0 0 16 16"><path d="M8 2v12M2 8h12M3.8 3.8l8.4 8.4M12.2 3.8l-8.4 8.4"/></svg>'
  };
  const bar = document.createElement("div"); bar.id = "selbar"; bar.hidden = true;
  bar.innerHTML = `<button type="button" tabindex="-1" data-m="fix" title="Corrigir esta palavra e adicionar às correções" aria-label="Corrigir palavra">${ICON.fix}</button><button type="button" tabindex="-1" data-m="auto" title="Criar autotexto com o trecho selecionado" aria-label="Criar autotexto">${ICON.auto}</button><button type="button" tabindex="-1" class="cl" data-m="style" title="Ensinar um estilo de escrita ao Claude" aria-label="Ensinar estilo">${ICON.style}</button>`;
  const box = document.createElement("div"); box.id = "qfix"; box.hidden = true;
  box.innerHTML = '<div class="qf-row"><span class="qf-lab" id="qfLab"></span><select id="qfSc" hidden aria-label="Vale para"><option value="todos">Todos os exames</option><option value="este">Só este exame</option></select><input type="text" id="qfIn" autocomplete="off" spellcheck="false"><button class="btn primary small" id="qfOk" type="button">Salvar</button><button class="icon-btn" id="qfX" type="button" aria-label="Fechar" title="Fechar (Esc)">×</button></div><div class="qf-sug" id="qfSug" role="listbox" aria-label="Sugestões do banco de laudos" hidden></div>';
  document.body.append(bar, box);
  const inp = box.querySelector("#qfIn"), lab = box.querySelector("#qfLab"), sc = box.querySelector("#qfSc");
  const sugBox = box.querySelector("#qfSug");
  let rng = null, orig = "", full = "", mode = "", sugs = [], sugAt = -1;
  const hideBar = () => { bar.hidden = true; };
  const hideAll = () => { bar.hidden = true; box.hidden = true; rng = null; };
  const place = (el, rc) => {
    el.hidden = false;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(innerWidth - w - 8, rc.left)) + "px";
    el.style.top = (rc.bottom + h + 12 < innerHeight ? rc.bottom + 6 : Math.max(8, rc.top - h - 6)) + "px";
  };
  function show(){
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return hideAll();
    const r = sel.getRangeAt(0);
    if (!sheet.contains(r.commonAncestorContainer)) return hideAll();
    const raw = sel.toString(), t = raw.trim();
    if (!t || t.length > 6000) return hideAll();
    rng = r.cloneRange(); orig = t; full = raw.replace(/\r/g, "").replace(/\n{2,}/g, "\n").trim();
    const small = !/\n/.test(raw) && t.length <= 32 && t.split(/\s+/).length <= 3 && !isHeading(t);
    bar.querySelector('[data-m="fix"]').hidden = !small;
    box.hidden = true;
    place(bar, r.getBoundingClientRect());
  }
  // Palavras parecidas (grafia e som) tiradas dos bancos de laudos; sem IA.
  function renderSug(){
    sugs = []; sugAt = -1; sugBox.textContent = "";
    if (mode === "fix"){
      try{ sugs = ((window.tutuV2 && window.tutuV2.suggest) ? window.tutuV2.suggest(orig) : []).filter(x => x !== orig).slice(0, 5); }catch(e){ sugs = []; }
    }
    sugBox.hidden = !sugs.length;
    if (!sugs.length) return;
    const cap = document.createElement("span"); cap.className = "qf-cap"; cap.textContent = "Do seu banco de laudos · ↑↓ e Enter"; sugBox.append(cap);
    sugs.forEach((t, i) => {
      const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "option"); b.dataset.i = i; b.textContent = t;
      b.onclick = () => choose(i); sugBox.append(b);
    });
  }
  function markSug(){
    [...sugBox.querySelectorAll("button")].forEach((b, i) => { b.setAttribute("aria-selected", String(i === sugAt)); if (i === sugAt) b.scrollIntoView({ block: "nearest" }); });
  }
  function choose(i){ if (sugs[i] == null) return; inp.value = sugs[i]; apply(); }
  function open(m){
    if (!rng) return;
    mode = m; const rc = rng.getBoundingClientRect();
    hideBar(); sc.hidden = m !== "style";
    if (m === "fix"){ lab.textContent = "Corrigir para"; inp.value = orig; inp.placeholder = ""; }
    else if (m === "auto"){ lab.textContent = "Autotexto:"; inp.value = ""; inp.placeholder = "nome (ex.: apendicectomia)"; }
    else { lab.textContent = "Estilo"; inp.value = ""; inp.placeholder = "Ex.: escrever sempre assim… / nunca usar…"; }
    renderSug();
    place(box, rc); inp.focus(); inp.select();
  }
  const barBtns = () => [...bar.querySelectorAll("button")].filter(b => !b.hidden);
  function backToSheet(){
    sheet.focus({ preventScroll: true });
    if (rng){ const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rng.cloneRange()); }
  }
  // Teclado: com texto selecionado, seta para baixo entra na barra; setas navegam; Enter aciona; Esc volta à seleção.
  sheet.addEventListener("keydown", e => {
    if (e.key !== "ArrowDown" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || bar.hidden) return;
    const first = barBtns()[0]; if (!first) return;
    e.preventDefault(); e.stopPropagation(); first.focus();
  });
  bar.addEventListener("keydown", e => {
    const list = barBtns(), i = list.indexOf(document.activeElement); if (i < 0) return;
    const go = n => { e.preventDefault(); e.stopPropagation(); list[(n + list.length) % list.length].focus(); };
    if (e.key === "ArrowRight") go(i + 1); else if (e.key === "ArrowLeft") go(i - 1);
    else if (e.key === "Home") go(0); else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Enter" || e.key === " "){ e.preventDefault(); e.stopPropagation(); open(list[i].dataset.m); }
    else if (e.key === "Escape" || e.key === "ArrowUp"){ e.preventDefault(); e.stopPropagation(); backToSheet(); }
  });
  bar.addEventListener("mousedown", e => e.preventDefault());
  bar.addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (b) open(b.dataset.m); });
  sheet.addEventListener("mouseup", () => setTimeout(show, 0));
  sheet.addEventListener("keyup", e => { if (e.shiftKey && e.key.startsWith("Arrow")) show(); });
  sheet.addEventListener("mousedown", hideAll);
  sheet.addEventListener("input", hideAll);
  addEventListener("scroll", e => { if (e.target && e.target.classList && (e.target.classList.contains("sheet-wrap") || e.target.id === "v2Center")) hideAll(); }, true);
  document.addEventListener("mousedown", e => { if (!box.hidden && !box.contains(e.target) && !bar.contains(e.target) && !sheet.contains(e.target)) hideAll(); });
  box.addEventListener("mousedown", e => { if (!/^(INPUT|SELECT|OPTION)$/.test(e.target.tagName)) e.preventDefault(); });
  const close = () => { const r = rng; hideAll(); sheet.focus({ preventScroll: true }); if (r){ const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r.cloneRange()); } };
  box.querySelector("#qfX").onclick = close;
  async function apply(){
    const val = inp.value.trim();
    if (!val){ if (mode === "fix") return; inp.focus(); return; }
    if (mode === "fix"){
      if (!rng) return;
      if (val === orig){ close(); return; }
      sheet.focus(); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rng);
      document.execCommand("insertText", false, val);
      let saved = false; const de = orig;
      if (fold(val) !== fold(de)){ try{ saved = await addCorrecao(de.toLowerCase(), val); }catch(e){} }
      hideAll(); setStatus(saved ? `"${de}" trocado por "${val}". O ditado vai corrigir isso sozinho daqui em diante.` : `"${de}" trocado por "${val}".`, "ok");
    } else if (mode === "auto"){
      let ok = false; try{ ok = await addFrase(val, full); }catch(e){}
      const nome = vnorm(val).replace(/^(frase|auto\s?texto)\s+/, "");
      hideAll(); sheet.focus({ preventScroll: true }); setStatus(ok ? `Autotexto "${nome}" salvo. No ditado, diga "autotexto ${nome}".` : "Não consegui salvar o autotexto (a página precisa estar dentro do claude.ai).", ok ? "ok" : "err");
    } else {
      const texto = val + (full.length <= 200 ? ` (exemplo do trecho: "${full.replace(/\s+/g, " ")}")` : "");
      let n = 0; try{ n = await addRules([{ texto, exame: sc.value === "este" ? current.id : "todos" }], "estilo"); }catch(e){}
      hideAll(); sheet.focus({ preventScroll: true }); setStatus(n ? "Regra de estilo salva (sem usar o Claude). Vale a partir do próximo Gerar laudo." : "Não consegui salvar a regra (a página precisa estar dentro do claude.ai).", n ? "ok" : "err");
    }
  }
  box.querySelector("#qfOk").onclick = apply;
  inp.addEventListener("keydown", e => {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && sugs.length){
      e.preventDefault(); e.stopPropagation();
      sugAt = e.key === "ArrowDown" ? Math.min(sugs.length - 1, sugAt + 1) : Math.max(-1, sugAt - 1); markSug();
    }
    else if (e.key === "Enter" && sugAt >= 0){ e.preventDefault(); e.stopPropagation(); choose(sugAt); }
    else if (e.key === "Enter"){ e.preventDefault(); e.stopPropagation(); apply(); }
    else if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); close(); }
  });
})();

// Pós-processamento local do ditado (sem Claude): números e medidas por extenso, unidades e siglas.
// "dois vírgula três por um vírgula cinco centímetros" -> "2,3 x 1,5 cm". Usado pelo mic.js; testado em tests/test_fala.js.
(function (g) {
  const f = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const UN = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
    onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 };
  const DEZ = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
  const CEM = { cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
    quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900 };
  const numWord = w => { const x = f(w); return x in UN ? UN[x] : x in DEZ ? DEZ[x] : x in CEM ? CEM[x] : x === "mil" ? 1000 : null; };
  const UNIT_RE = /^(cent[ií]metros?|mil[ií]metros?|mililitros?|ml|cm|mm|unidades?|hounsfield|uh|graus?|por\s?cento|%|anos?|meses|m[eê]s|dias?|semanas?|horas?)$/i;
  const isDigits = w => /^\d+$/.test(w);

  // junta sequências de números por extenso ("vinte e três", "cento e dez") num valor
  function parseRun(tok, i) {
    let total = 0, cur = 0, j = i, used = false;
    while (j < tok.length) {
      const v = numWord(tok[j]);
      if (v === null) {
        if (used && f(tok[j]) === "e" && j + 1 < tok.length && numWord(tok[j + 1]) !== null && numWord(tok[j + 1]) < 1000) { j++; continue; }
        break;
      }
      if (v === 1000) { total += (cur || 1) * 1000; cur = 0; } else cur += v;
      used = true; j++;
    }
    return used ? { val: total + cur, end: j } : null;
  }

  function normalizarFala(s) {
    let tok = String(s).replace(/\bpor\s?cento\b/gi, "%").split(/\s+/).filter(Boolean);
    // 1) números por extenso -> dígitos, só em contexto de medida (antes de vírgula+número, "por", unidade, ou depois deles)
    const isNumTok = k => k >= 0 && k < tok.length && (isDigits(tok[k]) || numWord(tok[k]) !== null);
    const ctxAfter = k => { const n = f(tok[k] || ""); return ((n === "virgula" || n === "por" || n === "x") && isNumTok(k + 1)) || UNIT_RE.test(n + (n === "por" ? " " + f(tok[k + 1] || "") : "")) || (n === "por" && f(tok[k + 1] || "") === "cento"); };
    const ctxBefore = k => { const n = f(tok[k] || ""); return ((n === "virgula" || n === "por" || n === "x") && isNumTok(k - 1)) || /(rads|bosniak|categoria)$/.test(n); };
    for (let pass = 0; pass < 3; pass++) {
      const out = [];
      for (let i = 0; i < tok.length;) {
        const r = numWord(tok[i]) !== null ? parseRun(tok, i) : null;
        if (r && (ctxAfter(r.end) || ctxBefore(i - 1))) { out.push(String(r.val)); i = r.end; }
        else out.push(tok[i++]);
      }
      tok = out;
    }
    let t = tok.join(" ");
    // 2) decimal falado e "por" entre números
    t = t.replace(/(\d+)\s+v[ií]rgula\s+(\d+)/gi, "$1,$2");
    t = t.replace(/(\d+)\.(\d{1,2})(?=\s*(?:cm|mm|ml|x|×|por\b|cent|mil[ií]))/gi, "$1,$2");   // o Chrome às vezes usa ponto decimal
    t = t.replace(/(\d+(?:,\d+)?)\s*(?:por|x|×)\s*(?=\d)/gi, "$1 x ");
    // 3) unidades depois de número
    t = t.replace(/(\d)\s*cent[ií]metros?\s+quadrados?\b/gi, "$1 cm²")
      .replace(/(\d)\s*mil[ií]metros?\s+c[uú]bicos?\b/gi, "$1 mm³")
      .replace(/(\d)\s*cent[ií]metros?\s+c[uú]bicos?\b/gi, "$1 cm³")
      .replace(/(\d)\s*cent[ií]metros?\b/gi, "$1 cm")
      .replace(/(\d)\s*mil[ií]metros?\b/gi, "$1 mm")
      .replace(/(\d)\s*mililitros?\b/gi, "$1 mL")
      .replace(/(\d)\s*(?:unidades?\s+(?:de\s+)?)?hounsfield\b/gi, "$1 UH")
      .replace(/(\d)\s+%/g, "$1%");
    return t;
  }

  const SIGLAS = [
    [/\bbi[\s-]?rads\b/gi, "BI-RADS"], [/\bli[\s-]?rads\b/gi, "LI-RADS"], [/\blung[\s-]?rads\b/gi, "Lung-RADS"],
    [/\bti[\s-]?rads\b/gi, "TI-RADS"], [/\bpi[\s-]?rads\b/gi, "PI-RADS"], [/\bo[\s-]rads\b/gi, "O-RADS"],
    [/\bpet[\s-]?(?:ct|tc)\b/gi, "PET-CT"], [/\bangio[\s-]?tc\b/gi, "angio-TC"], [/\btc\b/g, "TC"], [/\brm\b/g, "RM"],
    [/\btep\b/g, "TEP"], [/\bavc\b/g, "AVC"], [/\bdpoc\b/g, "DPOC"], [/\buh\b/g, "UH"], [/\bspect\b/g, "SPECT"], [/\bfdg\b/g, "FDG"], [/\bdwi\b/g, "DWI"]
  ];
  function siglas(s) { for (const [re, to] of SIGLAS) s = s.replace(re, to); return s; }

  g.normalizarFala = normalizarFala; g.siglas = siglas;
  if (typeof module !== "undefined") module.exports = { normalizarFala, siglas };
})(typeof window !== "undefined" ? window : globalThis);

// Texto do ditado, parte pura (sem IA, sem DOM): escolher alternativa por n-gramas, correção fonética,
// substituições aprendidas, juntar/separar/hífen e baixa confiança. Usado pelo content.js; testado em tests/test_v2_texto.js.
(function (g) {
  const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const foldStr = s => Array.from(String(s)).map(c => c.normalize("NFD").charAt(0)).join("").toLowerCase();   // mesmo tamanho do original
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const TOK = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
  const palavras = text => { const re = new RegExp(TOK.source, "gu"), out = []; let m; while ((m = re.exec(text))) out.push({ w: m[0], f: fold(m[0]), s: m.index, e: m.index + m[0].length }); return out; };

  // lado, negação e presença: nunca trocados pela fonética nem juntados a outra palavra
  const PROTEGIDAS = new Set(["direito", "direita", "direitos", "direitas", "esquerdo", "esquerda", "esquerdos", "esquerdas", "bilateral", "bilaterais",
    "lateral", "nao", "sem", "nem", "nenhum", "nenhuma", "ausente", "ausentes", "ausencia", "presente", "presentes", "presenca", "sim",
    "macro", "autotexto", "frase", "corrigir", "cancelar"]);
  // regra aprendida (de/para) nunca mexe em lado, negação ou número (dígito ou por extenso); "um/uma" ficam de fora (artigos)
  const NUM_EXT = ["dois", "duas", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
    "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa", "cem", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "mil", "meio", "meia"];
  const REGRA_TABU = new Set([...PROTEGIDAS, "ambos", "ambas", "nega", "negam", "negativo", "negativa", "ausentes", "inexistente", ...NUM_EXT]);
  const regraInsegura = (de, para) => /\d/.test(de + " " + para) || palavras(fold(de) + " " + fold(para)).some(t => REGRA_TABU.has(t.f));
  const FUNCAO = new Set(["a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas", "com", "sem", "por", "para", "pelo", "pela",
    "um", "uma", "ao", "aos", "que", "se", "ou", "mais", "menos", "entre", "sobre", "ate", "ja", "ainda", "tambem", "nao", "como", "sua", "seu", "ha", "foi"]);

  /* ---------- 8: n-gramas ---------- */
  const cacheNg = new WeakMap();
  function ngMap(ng) {
    if (!ng || typeof ng !== "object") return null;
    let m = cacheNg.get(ng);
    if (!m) { m = new Map(); for (const k of Object.keys(ng)) m.set(fold(k).replace(/[^a-z0-9]+/g, " ").trim(), +ng[k] || 0); cacheNg.set(ng, m); }
    return m;
  }
  // soma de log(1+freq) dos pares e trios de palavras que existem no banco (trio vale 1,5x)
  function ngramScore(text, ng) {
    const m = ngMap(ng); if (!m || !m.size) return 0;
    const t = fold(text).split(/[^a-z0-9]+/).filter(Boolean);
    let s = 0;
    for (let i = 0; i + 1 < t.length; i++) {
      const bi = m.get(t[i] + " " + t[i + 1]); if (bi) s += Math.log1p(bi);
      if (i + 2 < t.length) { const tri = m.get(t[i] + " " + t[i + 1] + " " + t[i + 2]); if (tri) s += 1.5 * Math.log1p(tri); }
    }
    return s;
  }

  /* ---------- 9: correção fonética (só palavra fora do vocabulário, só com alta semelhança) ---------- */
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m || !n) return m || n;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  // chave fonética pt-BR simples: s/z/ss/ç/c(e,i)/sc iguais; ch/x; qu/c/k; g(e,i)/j; h mudo; l final = u; m/n nasal; letras dobradas
  function chave(w) {
    let s = String(w).toLowerCase().replace(/ç/g, "s");
    s = fold(s).replace(/[^a-z]/g, "");
    s = s.replace(/ph/g, "f").replace(/th/g, "t").replace(/ch|sh/g, "X").replace(/h/g, "")
      .replace(/sc(?=[ei])/g, "s").replace(/c(?=[ei])/g, "s").replace(/qu/g, "k").replace(/[cq]/g, "k")
      .replace(/gu(?=[ei])/g, "g").replace(/g(?=[ei])/g, "j").replace(/z/g, "s").replace(/w/g, "v").replace(/y/g, "i")
      .replace(/l$/, "u").replace(/m(?=[^aeiou]|$)/g, "n").replace(/(.)\1+/g, "$1");
    return s;
  }
  // só varia gênero (-o/-a/-e) ou número (-s): pode estar certo, não mexe
  function soFlexao(a, b) {
    const A = a.replace(/s$/, ""), B = b.replace(/s$/, "");
    if (A === B) return true;
    return A.length === B.length && A.slice(0, -1) === B.slice(0, -1) && /[aoe]/.test(A.slice(-1)) && /[aoe]/.test(B.slice(-1));
  }
  const cacheVoc = new WeakMap();
  function vocIndex(vf) {
    if (!Array.isArray(vf)) return null;
    let x = cacheVoc.get(vf);
    if (!x) {
      const raw = new Set(), byFold = new Map(), byKey = new Map();
      for (const e of vf) {
        const w = String(e && e[0] != null ? e[0] : ""), f = +(e && e[1]) || 0; if (!w) continue;
        const lw = w.toLowerCase(), fw = fold(w);
        raw.add(lw);
        const cur = byFold.get(fw); if (!cur || f > cur.f) byFold.set(fw, { w: lw, f });
        if (fw.length >= 5 && /^[a-z]+$/.test(fw)) { const k = chave(fw); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push({ w: lw, fw, f }); }
      }
      x = { raw, byFold, byKey }; cacheVoc.set(vf, x);
    }
    return x;
  }
  const casar = (orig, novo) => /^\p{Lu}/u.test(orig) && /^\p{Ll}/u.test(novo) ? novo.charAt(0).toUpperCase() + novo.slice(1) : novo;
  function corrigirFonetica(text, vf, opts) {
    const ix = vocIndex(vf); if (!ix || !text) return text;
    const minFreq = (opts && opts.minFreq) || 3;
    let out = "", last = 0;
    for (const t of palavras(text)) {
      const f = t.f;
      if (f.length < 5 || /[\d-]/.test(f) || !/^[a-z]+$/.test(f) || PROTEGIDAS.has(f)) continue;
      if (t.w === t.w.toUpperCase()) continue;                       // sigla
      if (ix.raw.has(t.w.toLowerCase())) continue;                   // já é uma palavra do vocabulário
      if (ehPrefixado(f)) continue;
      let best = null, bs = 0;
      for (const c of ix.byKey.get(chave(f)) || []) {
        if (c.f < minFreq || PROTEGIDAS.has(c.fw) || c.fw === f && false) continue;
        const d = lev(f, c.fw), sim = 1 - d / Math.max(f.length, c.fw.length);
        if (d > 2 || sim < 0.75 || (d > 0 && soFlexao(f, c.fw))) continue;
        const sc = sim * 1000 + Math.log1p(c.f);
        if (sc > bs) { bs = sc; best = c; }
      }
      if (best) { out += text.slice(last, t.s) + casar(t.w, best.w); last = t.e; }
    }
    return out + text.slice(last);
  }

  /* ---------- 10: substituições aprendidas (frase antes de palavra; palavra inteira; escopo por exame) ---------- */
  function aplicarSubstituicoes(text, subs, exame) {
    if (!text || !Array.isArray(subs) || !subs.length) return text;
    const itens = subs.filter(s => s && s.de && s.para != null && !regraInsegura(s.de, s.para) && (!s.exame || s.exame === exame))
      .map(s => ({ de: foldStr(String(s.de)).replace(/\s+/g, " ").trim(), para: String(s.para), esp: s.exame ? 1 : 0 }))
      .filter(s => s.de)
      .sort((a, b) => b.de.split(" ").length - a.de.split(" ").length || b.de.length - a.de.length || b.esp - a.esp);
    if (!itens.length) return text;
    const low = foldStr(text), aceitos = [];
    for (const it of itens) {
      const re = new RegExp("(^|[^\\p{L}\\p{N}])(" + esc(it.de).replace(/ /g, "\\s+") + ")(?=$|[^\\p{L}\\p{N}])", "giu");
      let m;
      while ((m = re.exec(low))) {
        const s = m.index + m[1].length, e = s + m[2].length;
        if (!aceitos.some(a => s < a.e && e > a.s)) aceitos.push({ s, e, para: casar(text.slice(s, e), it.para) });
        if (!m[0].length) re.lastIndex++;
      }
    }
    aceitos.sort((a, b) => a.s - b.s);
    let out = "", last = 0;
    for (const a of aceitos) { out += text.slice(last, a.s) + a.para; last = a.e; }
    return out + text.slice(last);
  }

  /* ---------- 10b: correção salva vale para variantes próximas ("sub galeão", "subgaleão", "sub-galeal" -> "subgaleal") ---------- */
  // Compara o trecho errado guardado ("de") com janelas de 1 a 4 palavras do texto, juntando as letras (sem espaço nem hífen):
  // igual, ou a 1 letra de distância (2 em termos longos), ou mesma fonética. Não mexe em lado/negação/número, em palavra
  // do vocabulário que existe sozinha, nem em mera variação de gênero/número. Regras com ctx (palavra que existe) ficam de fora.
  const soLetras = f => String(f).replace(/[^a-z]/g, "");
  function aplicarVariantes(text, regras, opts) {
    if (!text || !Array.isArray(regras) || !regras.length) return text;
    const ix = opts && vocIndex(opts.vocabFreq);
    const itens = [];
    for (const r of regras) {
      if (!r || !r.de || r.para == null || r.fuzzy === false || (Array.isArray(r.ctx) && r.ctx.length) || regraInsegura(r.de, r.para)) continue;
      const chv = soLetras(fold(r.de));
      if (chv.length < 7) continue;
      itens.push({ chv, ck: chave(chv), para: String(r.para), pf: soLetras(fold(r.para)), deToks: new Set(palavras(r.de).map(t => t.f)) });
    }
    if (!itens.length) return text;
    const ws = palavras(text), aceitos = [];
    for (let i = 0; i < ws.length; i++) {
      let melhor = null;
      for (const it of itens) {
        let junto = "";
        for (let k = 0; k < 4 && i + k < ws.length; k++) {
          const t = ws[i + k];
          if (k && !/^[ \t-]+$/.test(text.slice(ws[i + k - 1].e, t.s))) break;
          if (PROTEGIDAS.has(t.f) || /\d/.test(t.f) || (t.w === t.w.toUpperCase() && t.w.length > 1) || (FUNCAO.has(t.f) && !it.deToks.has(t.f))) break;
          junto += soLetras(t.f);
          if (junto.length < 7) continue;
          if (junto.length - it.chv.length > 2) break;
          const unico = k === 0 && !t.w.includes("-");
          if (unico && (ix && ix.raw.has(t.w.toLowerCase()) || t.w.toLowerCase() === it.para.toLowerCase())) continue;   // palavra válida ou já certa
          if (junto[0] !== it.chv[0] || Math.abs(junto.length - it.chv.length) > 2) continue;
          if (junto === it.pf) { if (unico) continue; }                       // só estava separada: junta
          else if (junto !== it.chv && soFlexao(junto, it.chv)) continue;
          else { const d = lev(junto, it.chv); if (!(d <= (it.chv.length >= 11 ? 2 : 1) || (d <= 3 && chave(junto) === it.ck))) continue; }
          const sc = lev(junto, it.chv) * 10 - k;   // menor distância; empate: janela mais longa
          if (!melhor || sc < melhor.sc) melhor = { sc, s: ws[i].s, e: t.e, para: it.para, n: k + 1 };
        }
      }
      if (melhor && !aceitos.some(a => melhor.s < a.e && melhor.e > a.s)) { aceitos.push({ s: melhor.s, e: melhor.e, para: casar(text.slice(melhor.s, melhor.e), melhor.para) }); i += melhor.n - 1; }
    }
    let out = "", last = 0;
    for (const a of aceitos) { out += text.slice(last, a.s) + a.para; last = a.e; }
    return out + text.slice(last);
  }

  /* ---------- 11: juntar / hífen (regra do hífen do português, prefixos radiológicos) ---------- */
  // prefixo terminado em vogal: true = hífen também antes da mesma vogal; false = só antes de "h". Antes de r/s dobra a consoante.
  const PREF_VOGAL = { anti: 1, arqui: 1, auto: 1, extra: 1, infra: 1, intra: 1, micro: 1, neo: 1, proto: 1, pseudo: 1, semi: 1, supra: 1, ultra: 1, retro: 1, multi: 1, mini: 1,
    peri: 0, endo: 0, epi: 0, meso: 0, hemi: 0, hipo: 0, poli: 0 };
  const PREF_R = new Set(["hiper", "inter", "super"]);   // hífen antes de h ou r
  const PREF_B = new Set(["sub"]);                       // hífen antes de h ou r
  // palavras que também são preposição: só juntam com estes segundos elementos
  const AMBIG = {
    para: new Set(["vertebral", "vertebrais", "aortico", "aortica", "aorticos", "aorticas", "traqueal", "colico", "colica", "colicos", "nasal", "nasais", "esofagico", "esofagica", "gastrico", "gastrica", "renal", "renais"]),
    contra: new Set(["lateral", "laterais", "indicacao", "indicacoes", "indicado", "indicada", "indicados", "indicadas"])
  };
  PREF_VOGAL.para = 0; PREF_VOGAL.contra = 1;
  const PRE_POS = { pre: "pré", pos: "pós" };
  const PRE_POS_WL = new Set(["contraste", "operatorio", "operatoria", "operatorios", "cirurgico", "cirurgica", "vertebral", "biopsia", "tratamento", "quimioterapia", "radioterapia", "radioterapico", "parto", "natal", "traumatico", "traumatica", "estenotico"]);
  const TODOS_PREF = new Set([...Object.keys(PREF_VOGAL), ...PREF_R, ...PREF_B, "pre", "pos", "pro"]);
  function ehPrefixado(f) { for (const p of TODOS_PREF) if (p.length >= 3 && f.length >= p.length + 3 && f.startsWith(p)) return true; return false; }
  const vogal = c => /[aeiou]/.test(c);

  function juntar2(a, b) {
    const pf = a.f, nf = b.f;
    if (/[\d-]/.test(pf + nf) || nf.length < 3 || FUNCAO.has(nf) || PROTEGIDAS.has(pf) || (PROTEGIDAS.has(nf) && !(AMBIG[pf] && AMBIG[pf].has(nf)))) return null;
    const lw = a.w.toLowerCase();
    if (lw === "pré" || lw === "pós" || lw === "pró") return a.w + "-" + b.w;
    if (PRE_POS[pf] && PRE_POS_WL.has(nf)) return casar(a.w, PRE_POS[pf]) + "-" + b.w;
    if (AMBIG[pf] && !AMBIG[pf].has(nf)) return null;
    const n1 = nf[0];
    if (pf in PREF_VOGAL) {
      if (n1 === "h" || (PREF_VOGAL[pf] && n1 === pf.slice(-1))) return a.w + "-" + b.w;
      if ((n1 === "r" || n1 === "s") && nf.length > 2 && vogal(nf[1])) return a.w + b.w.charAt(0) + b.w;
      return a.w + b.w;
    }
    if (PREF_R.has(pf)) return a.w + (n1 === "h" || n1 === "r" ? "-" : "") + b.w;
    if (PREF_B.has(pf)) return a.w + (n1 === "h" || n1 === "r" ? "-" : "") + b.w;
    return null;
  }
  // "hipo denso" -> "hipodenso" quando a junção existe no vocabulário e pelo menos uma das partes não existe sozinha
  function juntarVocab(a, b, ix) {
    if (/[\d-]/.test(a.f + b.f) || a.f.length < 2 || b.f.length < 2 || FUNCAO.has(a.f) || FUNCAO.has(b.f) || PROTEGIDAS.has(a.f) || PROTEGIDAS.has(b.f)) return null;
    if (a.f.length + b.f.length < 7) return null;
    if (ix.byFold.has(a.f) && ix.byFold.has(b.f)) return null;
    const hy = ix.byFold.get(a.f + "-" + b.f), j = ix.byFold.get(a.f + b.f), e = hy && hy.f >= 2 ? hy : j && j.f >= 2 ? j : null;
    if (!e) return null;
    return casar(a.w, e.w);
  }
  function juntarPalavras(text, opts) {
    if (!text) return text;
    const ix = opts && vocIndex(opts.vocabFreq);
    const ws = palavras(text);
    let out = "", last = 0;
    for (let i = 0; i < ws.length;) {
      const a = ws[i], b = ws[i + 1];
      if (b && /^[ \t]+$/.test(text.slice(a.e, b.s))) {
        let r = juntar2(a, b);
        if (r == null && ix) r = juntarVocab(a, b, ix);
        if (r != null) { out += text.slice(last, a.s) + r; last = b.e; i += 2; continue; }
      }
      i++;
    }
    return out + text.slice(last);
  }
  // "intra hífen hepático" / "intra - hepático" -> "intra-hepático"
  function hifenFalado(text) {
    return String(text).replace(/(\p{L}+)\s+h[ií]fen\s+(\p{L}+)/giu, "$1-$2").replace(/(\p{L}{2,})\s+-\s+(\p{L}{2,})/gu, "$1-$2");
  }
  // separar: palavra fora do vocabulário que é a junção de duas palavras frequentes que aparecem juntas no banco (par nos n-gramas)
  function separarPalavras(text, opts) {
    const ix = opts && vocIndex(opts.vocabFreq), ng = opts && ngMap(opts.ngramas);
    if (!ix || !ng || !text) return text;
    let out = "", last = 0;
    for (const t of palavras(text)) {
      const f = t.f;
      if (f.length < 10 || /[\d-]/.test(f) || !/^[a-z]+$/.test(f) || ix.raw.has(t.w.toLowerCase()) || ix.byFold.has(f) || ehPrefixado(f)) continue;
      let best = -1, bs = 0;
      for (let k = 4; k <= f.length - 4; k++) {
        const L = ix.byFold.get(f.slice(0, k)), R = ix.byFold.get(f.slice(k)), par = ng.get(f.slice(0, k) + " " + f.slice(k));
        if (L && R && par && L.f >= 3 && R.f >= 3 && par > bs) { bs = par; best = k; }
      }
      if (best > 0) { out += text.slice(last, t.s) + t.w.slice(0, best) + " " + t.w.slice(best); last = t.e; }
    }
    return out + text.slice(last);
  }

  // junta tudo o que é automático (ordem: hífen falado, prefixos/vocabulário, separar, fonética)
  function melhorarPalavras(text, opts) {
    opts = opts || {};
    let t = hifenFalado(text);
    t = juntarPalavras(t, opts);
    t = separarPalavras(t, opts);
    return corrigirFonetica(t, opts.vocabFreq, opts);
  }

  /* ---------- 15: baixa confiança ---------- */
  // palavras do texto final que diferem entre as alternativas do reconhecimento (só quando conf < limite)
  function palavrasBaixas(final, alts, original, conf, limite) {
    if (typeof conf !== "number" || conf >= (limite || 0.6) || !Array.isArray(alts) || alts.length < 2) return [];
    const wf = s => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
    const ref = wf(original != null ? original : alts[0]);
    const outros = alts.filter(a => a !== original).map(a => new Set(wf(a)));
    const dif = new Set(ref.filter(w => w.length >= 3 && !/\d/.test(w) && outros.some(s => !s.has(w))));
    const res = [];
    for (const t of palavras(final)) if (dif.has(t.f) && !res.includes(t.w)) res.push(t.w);
    return res;
  }

  const api = { fold, ngramScore, chave, lev, corrigirFonetica, aplicarSubstituicoes, aplicarVariantes, juntarPalavras, hifenFalado, separarPalavras, melhorarPalavras, palavrasBaixas, PROTEGIDAS, regraInsegura };
  g.TextoV2 = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

(() => {
const fold1 = c => c.normalize("NFD").charAt(0);
  const foldStr = s => Array.from(s).map(fold1).join("").toLowerCase();   // mesmo tamanho do original
  const vnorm = s => foldStr(String(s)).replace(/[.,;:!?"]/g, "").replace(/\s+/g, " ").trim();

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Correções (e macros): busca sem diferenciar acentos nem maiúsculas, trocando no texto original
  function applyCorrections(text, list) {
    const items = (list || []).filter(c => c && c.de).map(c => ({ de: foldStr(String(c.de)).replace(/\s+/g, " ").trim(), para: String(c.para ?? ""),
      ctx: Array.isArray(c.ctx) && c.ctx.length ? new Set(c.ctx.map(w => foldStr(String(w)))) : null }))
      .filter(c => c.de).sort((a, b) => b.de.length - a.de.length);
    for (const c of items) {
      const pat = new RegExp("(^|[^\\p{L}\\p{N}])(" + esc(c.de).replace(/ /g, "\\s+") + ")(?=$|[^\\p{L}\\p{N}])", "giu");
      let low = foldStr(text), out = "", last = 0, m;
      pat.lastIndex = 0;
      while ((m = pat.exec(low))) {
        const start = m.index + m[1].length, end = start + m[2].length;
        if (c.ctx) {   // correção de palavra que também existe: só troca perto das palavras onde foi aprendida
          const viz = [...ctxWords(low.slice(Math.max(0, start - 60), start), -1), ...ctxWords(low.slice(end, end + 60), 1)];
          if (!viz.some(w => c.ctx.has(w))) continue;
        }
        out += text.slice(last, start) + c.para; last = end;
        if (m[0].length === 0) pat.lastIndex++;
      }
      if (last) text = out + text.slice(last);
    }
    return text;
  }
  function expandPhrases(text, list) {
    if (!list || !list.length) return text;
    const names = list.map(f => ({ toks: vnorm(f.nome).split(" ").filter(Boolean), texto: String(f.texto || "") }))
      .filter(f => f.toks.length && f.texto).sort((a, b) => b.toks.length - a.toks.length);
    for (let guard = 0; guard < 10; guard++) {
      const toks = [];
      const re = /[^\s.,;:!?"]+/g; let m;
      while ((m = re.exec(text))) toks.push({ w: foldStr(m[0]), s: m.index, e: m.index + m[0].length });
      let done = false;
      for (let i = 0; i < toks.length && !done; i++) {
        if (toks[i].w !== "frase") continue;
        const hit = names.find(f => f.toks.every((t, k) => toks[i + 1 + k] && toks[i + 1 + k].w === t));
        if (!hit) continue;
        let end = toks[i + hit.toks.length].e;
        if (text[end] === ".") end++;
        const after = text.slice(end).replace(/^\s+/, "");
        text = text.slice(0, toks[i].s) + hit.texto + (after ? " " + after : "");
        done = true;
      }
      if (!done) break;
    }
    return text;
  }

let vocabSet = null, exameSet = null, exameKey = "", vocabSig = "";
  // Escolhe, entre as alternativas do reconhecimento, a que tem mais termos do vocabulário médico
  // (termos da máscara aberta valem o dobro); trechos que já são erros conhecidos (correções) contam contra.
  function bestAlternative(text, alts, cfg) {
    const T = globalThis.TextoV2, ng = cfg && cfg.ngramas && T ? cfg.ngramas : null;
    if (!alts || alts.length < 2 || !cfg || ((!Array.isArray(cfg.vocab) || !cfg.vocab.length) && !ng)) return text;
    const vocab = Array.isArray(cfg.vocab) ? cfg.vocab : [];
    if (!vocabSet || vocabSet.size !== vocab.length) vocabSet = new Set(vocab.map(w => foldStr(w)));
    const ex = cfg.vocabExame || [];
    if (exameKey !== ex.join("|")) { exameKey = ex.join("|"); exameSet = new Set(ex.map(w => foldStr(w))); }
    const erros = (cfg.correcoes || []).filter(c => c && c.de && !c.ctx && !/^(auto ?texto|macro) /.test(c.de)).map(c => " " + vnorm(c.de) + " ");
    const score = t => {
      const ws = foldStr(t).split(/[^a-z0-9]+/);
      let n = ws.reduce((s, w) => s + (exameSet.has(w) && w.length >= 5 ? 2 : vocabSet.has(w) && w.length >= 6 ? 1 : 0), 0);
      const v = " " + vnorm(t) + " "; for (const e of erros) if (v.includes(e)) n -= 1;
      return ng ? n + 0.25 * T.ngramScore(t, ng) : n;   // sequências de palavras do banco desempatam e reforçam
    };
    let best = text, bs = score(text);
    for (const a of alts) { const sc = score(a); if (sc > bs) { best = a; bs = sc; } }
    return best;
  }

const ctxWords = (t, lado) => { const ws = foldStr(t).split(/[^a-z0-9]+/).filter(w => w.length >= 3); return lado < 0 ? ws.slice(-2) : ws.slice(0, 2); };

const exameAtual = cfg => cfg.exameAtual || (document.getElementById("plantaoExam") || {}).value || null;
  const isMacro = c => c && /^(auto ?texto|macro) /i.test(String(c.de || ""));
  // correções do médico, substituições aprendidas, ajustes automáticos de palavras; por fim macros e frases
  function posTexto(text, cfg) {
    const T = globalThis.TextoV2, cs = cfg.correcoes || [];
    let t = applyCorrections(text, cs.filter(c => !isMacro(c)));
    if (T) {
      t = T.aplicarSubstituicoes(t, cfg.substituicoes, exameAtual(cfg));
      // a correção salva vale também para variantes próximas ("sub galeão", "subgaleão", "sub-galeal" -> "subgaleal")
      const vo = { vocabFreq: cfg.vocabFreq }, rs = cs.filter(c => !isMacro(c));
      t = T.aplicarVariantes(t, rs, vo);
      t = T.melhorarPalavras(t, { vocabFreq: cfg.vocabFreq, ngramas: cfg.ngramas });
      t = T.aplicarVariantes(t, rs, vo);
    }
    return expandPhrases(applyCorrections(t, cs.filter(isMacro)), cfg.frases).replace(/([.!?])\s*\.(?!\.)/g, "$1");
  }

function punct(s) {
  // números e medidas por extenso antes da pontuação ("dois vírgula três" não pode virar "dois, três")
  if (typeof normalizarFala === "function") s = normalizarFala(s.trim());
  s = " " + s.trim() + " ";
  const rules = [
    [/\s+ponto par[aá]grafo\s+/gi, ".\n"],
    [/\s+(nova linha|novo par[aá]grafo|par[aá]grafo|pr[oó]xima linha)\s+/gi, "\n"],
    [/\s+ponto e v[ií]rgula\s+/gi, "; "],
    [/\s+ponto final\s+/gi, ". "],
    [/\s+dois pontos\s+/gi, ": "],
    [/\s+ponto de interroga[cç][aã]o\s+|\s+interroga[cç][aã]o\s+/gi, "? "],
    [/\s+v[ií]rgula\s+/gi, ", "],
    [/\s+barra\s+/gi, " / "],
    [/\s+(h[ií]fen|tra[cç]o)\s+/gi, " - "],
    [/\s+abre par[eê]nteses?\s+/gi, " ("],
    [/\s+fecha par[eê]nteses?\s+/gi, ") "],
    [/\s+abre aspas\s+/gi, " \""],
    [/\s+fecha aspas\s+/gi, "\" "],
    [/\s+ponto\s+(?!de\s)/gi, ". "]
  ];
  for (const [re, to] of rules) s = s.replace(re, to);
  s = s.replace(/\s+ponto\s*$/i, ".");
  if (typeof siglas === "function") s = siglas(s);
  return s
    .replace(/\(\s+/g, "(").replace(/\s+\)/g, ")")
    .replace(/\s+([.,;:?])/g, "$1")
    .replace(/([.,;:?])(?=[^\s\n\d)"])/g, "$1 ")
    .replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n")
    .replace(/ {2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/g, "");
}


globalThis.usgVoice = { bestAlternative, posTexto, punct };
})();

/* Funções puras compartilhadas com os testes Node; nenhuma dependência de DOM. */
(function (root) {
  "use strict";
  const normalize = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function distance(a, b) {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] !== b[j - 1]));
      row = next;
    }
    return row[b.length];
  }
  function score(query, label) {
    const q = normalize(query).trim(), text = normalize(label);
    if (!q) return 1;
    if (text.includes(q)) return 100 + q.length / Math.max(1, text.length);
    const words = text.split(/[^a-z0-9]+/);
    const parts = q.split(/\s+/);
    if (parts.every(p => words.some(w => w.startsWith(p) || (p.length >= 4 && distance(p, w.slice(0, p.length)) <= 1)))) return 50;
    return 0;
  }
  function placePalette(rect, width, height, desired = 238) {
    const gap = 12, margin = 8, above = Math.max(0, rect.top - gap - margin), below = Math.max(0, height - rect.bottom - gap - margin);
    const down = below >= desired || below >= above;
    const h = Math.min(desired, down ? below : above);
    return { left: Math.max(margin, Math.min(rect.left, width - Math.min(420, width - 16) - margin)), top: down ? rect.bottom + gap : rect.top - gap - h, height: h, width: Math.min(420, width - 16) };
  }
  function validSession(value) {
    return value?.version === 2 && Array.isArray(value.tabs) && value.tabs.length > 0 &&
      value.tabs.every(t => typeof t.id === "string" && !t.id.includes("/") && typeof t.html === "string" && typeof t.examId === "string") &&
      new Set(value.tabs.map(t => t.id)).size === value.tabs.length && value.tabs.some(t => t.id === value.active);
  }
  /* Abas: só os 4 exames editados mais recentes ficam no topo (mais a aba ativa); máscara intacta não fica. */
  function keepTabs(tabs, active, max = 4) {
    const ids = new Set(tabs.filter(t => t.edited).sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || ""))).slice(0, max).map(t => t.id));
    ids.add(active);
    return tabs.filter(t => ids.has(t.id));
  }
  /* Sugestões de grafia: palavras do banco parecidas com a selecionada (letras e som). Sem IA. */
  const phoneKey = word => String(word).toLowerCase().replace(/ç/g, "s").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ph/g, "f").replace(/ch|sh/g, "x").replace(/lh/g, "1").replace(/nh/g, "2").replace(/qu(?=[ei])/g, "k").replace(/gu(?=[ei])/g, "g")
    .replace(/sc(?=[ei])|xc(?=[ei])|ss/g, "s").replace(/c(?=[ei])/g, "s").replace(/c/g, "k").replace(/g(?=[ei])/g, "j")
    .replace(/h/g, "").replace(/w/g, "v").replace(/y/g, "i").replace(/z/g, "s").replace(/u$/, "o").replace(/i$/, "e").replace(/(.)\1+/g, "$1");
  function buildWordIndex(entries) {
    return entries.map(([w, n]) => ({ w, n, f: normalize(w), p: phoneKey(w) }));
  }
  function suggestWords(word, index, max = 5) {
    const m = String(word).match(/^([^\p{L}]*)(.*?)([^\p{L}]*)$/u), pre = m[1], core = m[2], post = m[3];
    const low = core.toLowerCase(), f = normalize(core), p = phoneKey(core);
    if (low.length < 3) return [];
    const out = [];
    for (const c of index) {
      if (c.w === low || Math.abs(c.f.length - f.length) > 3) continue;
      const d1 = distance(f, c.f), d2 = distance(p, c.p);
      const limit = Math.max(1, Math.floor(f.length * 0.34));
      if (d1 > limit && !(d2 === 0 && d1 <= limit + 2)) continue;
      out.push({ w: c.w, d: Math.min(d1, d2 + 0.5), n: c.n });
    }
    out.sort((a, b) => a.d - b.d || b.n - a.n || a.w.localeCompare(b.w));
    const cap = /^\p{Lu}/u.test(core) ? (/^\p{Lu}+$/u.test(core) && core.length > 1 ? s => s.toUpperCase() : s => s[0].toUpperCase() + s.slice(1)) : s => s;
    return out.slice(0, max).map(x => ({ w: pre + cap(x.w) + post, d: x.d }));
  }
  function suggestPhrases(text, index, max = 5) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return words.length ? suggestWords(words[0], index, max).map(x => x.w) : [];
    const all = [];
    words.forEach((w, i) => suggestWords(w, index, 2).forEach(s => all.push({ t: words.map((x, j) => j === i ? s.w : x).join(" "), d: s.d })));
    all.sort((a, b) => a.d - b.d);
    return [...new Set(all.map(x => x.t))].slice(0, max);
  }
  /* Ctrl+K completar frase: continuação do fim da frase começada, a partir de frases parecidas dos bancos. */
  function lastSentence(text) {
    const t = String(text).replace(/\s+/g, " ");
    let cut = 0;
    for (const m of t.matchAll(/[.!?]\s+/g)) cut = m.index + m[0].length;
    return t.slice(cut).replace(/^\s+/, "");
  }
  const tokens = s => [...String(s).matchAll(/\S+/g)].map(m => ({ f: normalize(m[0]).replace(/^[^a-z0-9{_]+|[^a-z0-9}_]+$/g, ""), start: m.index, end: m.index + m[0].length })).filter(t => t.f);
  function buildCompletionIndex(items) {
    const map = new Map();
    for (const it of items) {
      const s = String(typeof it === "string" ? it : it.s).replace(/^[\s*\\•-]+|[\s*\\]+$/g, "").trim(), w = typeof it === "string" ? 1 : (it.w || 1);
      if (s.length < 15 || s.length > 600) continue;
      const k = normalize(s), old = map.get(k);
      if (old) old.w += w; else map.set(k, { s, w, toks: tokens(s) });
    }
    return [...map.values()];
  }
  function completeSentence(prefix, index, max = 3) {
    const pt = tokens(prefix).slice(-8).map(t => t.f);
    if (pt.length < 2) return [];
    const space = /\s$/.test(prefix);
    for (let k = pt.length; k >= 2; k--) {
      const want = pt.slice(-k), hits = new Map();
      for (const e of index) {
        const tk = e.toks;
        for (let i = 0; i + k <= tk.length; i++) {
          let ok = true;
          for (let j = 0; j < k; j++) if (tk[i + j].f !== want[j]) { ok = false; break; }
          if (!ok) continue;
          let rest = e.s.slice(tk[i + k - 1].end);
          const stop = rest.match(/^[\s\S]*?[.!?](?=\s|$)/);
          rest = (stop ? stop[0] : rest).trim();
          if (rest.length < 4) break;
          const head = i === 0 || /[.!?]\s*$/.test(e.s.slice(0, tk[i].start));
          const key = normalize(rest), prev = hits.get(key), score = e.w * (head ? 1.5 : 1);
          if (prev) prev.score += score; else hits.set(key, { rest, score });
          break;
        }
      }
      if (hits.size) {
        return [...hits.values()].sort((a, b) => b.score - a.score || a.rest.length - b.rest.length).slice(0, max)
          .map(h => (space || /^[,;:.)]/.test(h.rest) ? "" : " ") + h.rest);
      }
    }
    return [];
  }
  /* Importar laudos: converte texto colado/arquivo (.md/.txt/.html) para o formato que extractNotasTomografia lê. */
  function laudosToNotion(raw) {
    let t = String(raw).replace(/\r/g, "").replace(/^\uFEFF/, "");
    const dec = s => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&");
    if (/<summary>\s*\d{6,}/i.test(t)) {
      return t.replace(/<u>/gi, '<span underline="true">').replace(/<\/u>/gi, "</span>").replace(/<\/?(strong|b)>/gi, "**")
        .replace(/<br\s*\/?>|<\/(p|li|div|h[1-6])>/gi, "\n");
    }
    t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/(p|li|div|h[1-6]|tr)>/gi, "\n").replace(/<[^>]+>/g, "");
    t = dec(t);
    const SEC = /^(t[eé]cnica(?: de exame)?|achados(?: adicionais)?|conclus[aã]o|impress[aã]o(?: diagn[oó]stica)?|indica[cç][aã]o(?: cl[ií]nica)?|informa[cç][oõ]es cl[ií]nicas|dados cl[ií]nicos)\s*:?\s*(.*)$/i;
    const reports = []; let cur = null, seenAch = false;
    const open = () => { cur = []; seenAch = false; reports.push(cur); };
    for (let line of t.split("\n")) {
      line = line.replace(/^\s*#{1,6}\s+/, "").replace(/\*\*|__/g, "").replace(/^\s*[-*•]\s+/, "").trim();
      if (!line) continue;
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line) || /^\d{6,}/.test(line)) { open(); continue; }   // linha de identificação: só separa, nunca é guardada
      if (/^tomografia\b/i.test(line) && line.length < 120 && !/[.;]$/.test(line)) {
        if (!cur || seenAch) open();
        cur.push("**" + line + "**"); continue;
      }
      const sec = line.match(SEC);
      if (sec && (!sec[2] || /^(t[eé]cnica|achados|conclus|impress)/i.test(sec[1]))) {
        if (!cur) open();
        if (/^achados/i.test(sec[1])) seenAch = true;
        cur.push("**" + sec[1] + "**"); if (sec[2]) cur.push(sec[2]); continue;
      }
      if (!cur) open();
      cur.push(line);
    }
    return reports.filter(r => r.length).map(r => "<summary>000000</summary>\n" + r.join("\n") + "\n</details>").join("\n");
  }
  /* Chrome no Android: com continuous=true cada resultado final repete o acumulado da sessão ("segmento", "segmento médio",
     "segmento médio da"...). sessao = texto já escrito nesta sessão de voz. Devolve {novo, sessao}: novo = só o trecho
     inédito ("" se for repetição). No PC (finais sem acúmulo) devolve a frase inteira. (12/11/2026) */
  function speechDelta(sessao, atual) {
    const a = String(sessao || "").trim(), b = String(atual || "").trim();
    if (!b) return { novo: "", sessao: a };
    if (!a) return { novo: b, sessao: b };
    const na = normalize(a), nb = normalize(b);
    if (na === nb || na.endsWith(" " + nb) || na.startsWith(nb + " ")) return { novo: "", sessao: a };
    if (nb.startsWith(na + " ")) return { novo: b.split(/\s+/).slice(a.split(/\s+/).length).join(" "), sessao: b };
    return { novo: b, sessao: a + " " + b };
  }
  /* Erros fonéticos frequentes do reconhecimento do Chrome no ditado médico (12/11/2026, áudio arterial do Artur).
     "sem" sai como "onze" e o conversor de números vira "11": "11 estenoses" -> "sem estenoses". */
  const SEM_DEPOIS = "estenos|altera|sinai|evid[eê]nci|les[õo]|placa|trombo|cole[çc]|l[ií]quido|dilata|fluxo|calcifica|n[oó]dulo|cisto|espessa|refluxo|sinal|particularidade|anormalidade|ectasia|aneurisma|oclus|deformidade|irregularidade";
  const FALA_FIX = [
    [new RegExp("\\b(?:11|onze)(\\s+)(?=(?:" + SEM_DEPOIS + "))", "gi"), "sem$1"],
    [/\bvps\b/gi, "VPS"], [/\bvd\b/g, "VD"], [/\bir\b/g, "IR"],
    [/\bp[eé]rvi(o|a|os|as)\b/gi, "pérvi$1"], [/\btrif[aá]sic/gi, "trifásic"], [/\bbif[aá]sic/gi, "bifásic"], [/\bmonof[aá]sic/gi, "monofásic"],
    [/\bpopl[ií]te(a|o)\b/gi, "poplíte$1"],
  ];
  const fixFala = t => FALA_FIX.reduce((s, [re, to]) => s.replace(re, to), String(t));
  /* Máscara dita no áudio (12/11/2026): "parecer de tomografia de abdome total", "doppler arterial de membro inferior".
     Compara as palavras do nome de cada máscara com o começo do ditado; "parecer" só casa com máscara de parecer. */
  const SINONIMOS = [[/tomografias? computadorizadas?|tomografias?/g, "tc"], [/angio ?tc|angiotomografias?/g, "angiotc"],
    [/ultrassonografias?|ultrassons?|ultra sons?|ultrasom|ecografias?/g, "usg"], [/membros? inferior(?:es)?/g, "mmii"],
    [/membros? superior(?:es)?/g, "mmss"], [/ressonancias?(?: magneticas?)?/g, "rm"], [/radiografias?|raio ?x/g, "rx"]];
  const PARADAS = new Set(["de", "do", "da", "dos", "das", "e", "com", "o", "a", "os", "as", "em", "no", "na", "parecer", "exame", "vou", "fazer", "agora", "um", "uma"]);
  const termosExame = t => {
    let s = normalize(t).replace(/[^a-z0-9 ]+/g, " ");
    for (const [re, to] of SINONIMOS) s = s.replace(re, to);
    const out = new Set(s.split(/\s+/).filter(w => w && !PARADAS.has(w)));
    if (out.has("doppler")) out.add("usg");
    return out;
  };
  function exameDoTexto(texto, exames) {
    const inicio = String(texto || "").split(/\s+/).slice(0, 30).join(" ");
    const ts = termosExame(inicio), parecer = /\bparecer\b/.test(normalize(inicio));
    let melhor = null, nota = 0;
    for (const e of exames || []) {
      const ehParecer = e.tipo === "parecer" || /^parecer/i.test(e.name || "");
      if (ehParecer !== parecer) continue;
      const ns = [...termosExame(e.name || "")].filter(w => w !== "doppler");
      if (!ns.length) continue;
      const hit = ns.filter(w => ts.has(w)).length, n = hit / ns.length + ns.length / 1000;   // empate: o nome mais específico
      if (hit >= Math.min(2, ns.length) && hit / ns.length >= 0.6 && n > nota) { melhor = e; nota = n; }
    }
    return melhor;
  }
  /* Corretor: estatísticas do que os chefes mudam (sem IA). entradas = [{id, changes:[{de, para}]}], changes vindas do diff por palavra.
     Agrupa por texto normalizado (sem acento/caixa/pontuação; números viram #) e conta quantos exames têm cada mudança.
     Devolve {tira, poe, trocas, principais}: cada item {chave, texto, n, ids} (ids = até `exemplos` exames onde ocorreu). (12/11/2026) */
  const chaveMudanca = t => normalize(t).replace(/\d+(?:[.,]\d+)*/g, "#").replace(/[^a-z#\s]+/g, " ").replace(/\s+/g, " ").trim();
  function estatisticasMudancas(entradas, { max = 15, exemplos = 5 } = {}) {
    const mapas = { tira: new Map(), poe: new Map(), trocas: new Map(), remocoes: new Map() };
    const somar = (mapa, chave, texto, id) => {
      if (!chave) return;
      const o = mapa.get(chave) || { chave, n: 0, ids: [], formas: new Map() };
      o.n++; if (!o.ids.includes(id) && o.ids.length < exemplos) o.ids.push(id);
      o.formas.set(texto, (o.formas.get(texto) || 0) + 1); mapa.set(chave, o);
    };
    for (const e of entradas || []) for (const c of e.changes || []) {
      const de = String(c.de || "").trim(), para = String(c.para || "").trim(), kd = chaveMudanca(de), kp = chaveMudanca(para);
      if (de && para) { if (kd !== kp) { somar(mapas.trocas, kd + " → " + kp, de + " → " + para, e.id); somar(mapas.tira, kd, de, e.id); somar(mapas.poe, kp, para, e.id); } }
      else if (de) { somar(mapas.tira, kd, de, e.id); somar(mapas.remocoes, kd, de, e.id); }
      else if (para) somar(mapas.poe, kp, para, e.id);
    }
    const top = (mapa, n = max) => [...mapa.values()].map(o => ({ chave: o.chave, n: o.n, ids: o.ids, texto: [...o.formas].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] }))
      .sort((a, b) => b.n - a.n || a.chave.localeCompare(b.chave)).slice(0, n);
    const principais = [...top(mapas.trocas, 1e9).map(o => ({ ...o, tipo: "troca" })), ...top(mapas.remocoes, 1e9).map(o => ({ ...o, tipo: "tira" }))]
      .filter(o => o.n >= 2).sort((a, b) => b.n - a.n || a.chave.localeCompare(b.chave)).slice(0, 5);
    return { tira: top(mapas.tira), poe: top(mapas.poe), trocas: top(mapas.trocas), principais };
  }
  /* Aprendizado de voz com a IA: compara o ditado bruto com o laudo final copiado, alinha por palavras (LCS) e devolve trocas curtas
     (1 a 3 palavras de cada lado) em que a palavra ditada some do texto final e a final lembra o som ou é do vocabulário.
     Reestruturação longa, inserção/remoção pura, números e flexão simples (estenose/estenoses) ficam de fora.
     vocab = palavras conhecidas (iterável). Devolve [{de, para, antes, depois}] (antes/depois = palavras vizinhas no final). */
  const palavrasTexto = t => [...String(t || "").replace(/\[<[^>]*>\]/g, " ").matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)].map(m => ({ w: m[0].replace(/[-'’]+$/, ""), f: normalize(m[0]).replace(/[^a-z0-9]/g, "") })).filter(x => x.f);
  const bigramas = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1); return m; };
  function dice(a, b) {
    const x = bigramas(a), y = bigramas(b); let comum = 0;
    for (const [k, n] of x) comum += Math.min(n, y.get(k) || 0);
    return a.length + b.length < 4 ? 0 : 2 * comum / (a.length + b.length - 2);
  }
  const FUNCAO = new Set(["de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "um", "uma", "em", "no", "na", "com", "para", "por", "que", "se", "ao", "ou"]);
  function trocasVoz(ditado, final, vocab) {
    const A = palavrasTexto(ditado), B = palavrasTexto(final);
    if (!A.length || !B.length || A.length > 2500 || B.length > 2500) return [];
    const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i].f === B[j].f ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const voc = new Set([...(vocab || [])].map(w => normalize(w).replace(/[^a-z0-9]/g, ""))), naFinal = new Set(B.map(x => x.f)), out = [], vistos = new Set();
    let i = 0, j = 0, ai = 0, bj = 0;
    const fecha = (ia, ib, ja, jb) => {   // A[ia..ib) x B[ja..jb)
      const a = A.slice(ia, ib), b = B.slice(ja, jb);
      if (!a.length || !b.length || a.length > 3 || b.length > 3) return;
      if ([...a, ...b].some(x => /\d/.test(x.f))) return;
      if (!a.some(x => x.f.length >= 3 && !FUNCAO.has(x.f)) || !b.some(x => x.f.length >= 3 && !FUNCAO.has(x.f))) return;
      if (a.some(x => naFinal.has(x.f))) return;   // a palavra ditada ainda aparece no final: foi reordenação, não erro de voz
      const fa = a.map(x => x.f).join(""), fb = b.map(x => x.f).join("");
      if (a.length === 1 && b.length === 1 && Math.abs(fa.length - fb.length) <= 2 && (fa.startsWith(fb) || fb.startsWith(fa))) return;   // flexão
      const pa = phoneKey(fa), pb = phoneKey(fb), lim = Math.floor(Math.max(pa.length, pb.length) * 0.34);
      const parecido = Math.max(fa.length, fb.length) >= 4 && distance(pa, pb) <= Math.max(1, lim);
      const conteudo = b.filter(x => x.f.length >= 4 && !FUNCAO.has(x.f)), noVocab = conteudo.length > 0 && conteudo.every(x => voc.has(x.f));
      const desconhecida = a.some(x => !voc.has(x.f) && !FUNCAO.has(x.f)), d = dice(fa, fb);
      const viaVocab = noVocab && ((desconhecida && d >= 0.2) || (a.length === 1 && b.length === 1 && a[0].f[0] === b[0].f[0] && d >= 0.4));
      if (!parecido && !viaVocab) return;
      const de = a.map(x => x.w).join(" "), para = b.map(x => x.w).join(" "), k = normalize(de) + "|" + normalize(para);
      if (vistos.has(k)) return; vistos.add(k);
      out.push({ de: de.toLowerCase(), para, antes: B[ja - 1]?.w || "", depois: B[jb]?.w || "" });
    };
    while (i < n && j < m) {
      if (A[i].f === B[j].f) { fecha(ai, i, bj, j); i++; j++; ai = i; bj = j; }
      else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
    }
    fecha(ai, n, bj, m);
    return out;
  }
  /* Laudo em HTML (como no PACS): sanitiza e marca o que o chefe tirou (<del>) e pôs (<ins>) sobre o HTML do definitivo. Mesma lógica do app Radio (preliminares.js). */
  const OK_TAGS = new Set("p br b strong i em u s strike del ins sub sup ul ol li h1 h2 h3 h4 h5 h6 div span blockquote table thead tbody tr td th".split(" "));
  const escHtml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const decodeEntidades = s => s.replace(/&(nbsp|amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
    e = e.toLowerCase();
    if (e === "nbsp") return " "; if (e === "amp") return "&"; if (e === "lt") return "<"; if (e === "gt") return ">"; if (e === "quot") return '"'; if (e === "apos") return "'";
    const n = e[1] === "x" ? parseInt(e.slice(2), 16) : +e.slice(1); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  });
  /* HTML -> tokens seguros: só tags da lista e sem atributos (nada de on*, style, href); script/style/comentários somem. */
  function tokensHtml(html) {
    html = String(html ?? "").replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
    const out = [], re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*?(\/?)>|<|[^<\s]+|\s+/g; let m;
    while ((m = re.exec(html))) {
      if (m[2]) { const n = m[2].toLowerCase(); if (OK_TAGS.has(n)) out.push({ k: "tag", s: n === "br" ? "<br>" : m[1] ? "</" + n + ">" : "<" + n + ">" }); }
      else if (m[0] === "<") out.push({ k: "pal", s: "<" });
      else if (/^\s+$/.test(m[0])) out.push({ k: "esp" });
      else decodeEntidades(m[0]).split(/\s+/).forEach((p, j) => { if (j) out.push({ k: "esp" }); if (p) out.push({ k: "pal", s: p }); });
    }
    return out;
  }
  const htmlSeguro = html => tokensHtml(html).map(t => t.k === "tag" ? t.s : t.k === "esp" ? " " : escHtml(t.s)).join("");
  /* LCS por palavras (preliminar x definitivo); null se grande demais. */
  function lcsPalavras(a, b) {
    let i0 = 0; while (i0 < a.length && i0 < b.length && a[i0] === b[i0]) i0++;
    let fa = a.length, fb = b.length; while (fa > i0 && fb > i0 && a[fa - 1] === b[fb - 1]) { fa--; fb--; }
    const A = a.slice(i0, fa), B = b.slice(i0, fb), n = A.length, m = B.length;
    if ((n + 1) * (m + 1) > 9e6) return null;
    const l = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) l[i][j] = A[i] === B[j] ? l[i + 1][j + 1] + 1 : Math.max(l[i + 1][j], l[i][j + 1]);
    const out = a.slice(0, i0).map(p => ["=", p]); let i = 0, j = 0;
    while (i < n && j < m) { if (A[i] === B[j]) { out.push(["=", A[i]]); i++; j++; } else if (l[i + 1][j] >= l[i][j + 1]) out.push(["-", A[i++]]); else out.push(["+", B[j++]]); }
    while (i < n) out.push(["-", A[i++]]); while (j < m) out.push(["+", B[j++]]);
    for (let k = fa; k < a.length; k++) out.push(["=", a[k]]);
    return out;
  }
  /* "Corrigido": HTML do definitivo (formatação preservada) com o que saiu em <del> e o que entrou em <ins>. null = laudo grande demais. */
  function corrigidoHtml(preHtml, defHtml) {
    const dt = tokensHtml(defHtml), pre = tokensHtml(preHtml).filter(t => t.k === "pal").map(t => t.s);
    const dif = lcsPalavras(pre, dt.filter(t => t.k === "pal").map(t => t.s));
    if (!dif) return null;
    const antes = [], marca = []; let fila = [];
    for (const [t, w] of dif) { if (t === "-") fila.push(w); else { antes.push(fila); fila = []; marca.push(t); } }
    const out = [], del = l => l.length ? "<del>" + l.map(escHtml).join(" ") + "</del> " : ""; let d = 0, fim = 0;
    for (const t of dt) {
      if (t.k === "tag") out.push(t.s);
      else if (t.k === "esp") out.push(" ");
      else { out.push(del(antes[d]), marca[d] === "+" ? "<ins>" + escHtml(t.s) + "</ins>" : escHtml(t.s)); d++; fim = out.length; }
    }
    if (fila.length) out.splice(fim, 0, " " + del(fila).trim());
    return out.join("").replace(/<\/ins> <ins>/g, " ").replace(/<\/del> <del>/g, " ");
  }
  const api = { htmlSeguro, corrigidoHtml, estatisticasMudancas, trocasVoz, normalize, speechDelta, fixFala, exameDoTexto, distance, score, placePalette, validSession, keepTabs, phoneKey, buildWordIndex, suggestWords, suggestPhrases,
    lastSentence, buildCompletionIndex, completeSentence, laudosToNotion };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TutuV2Core = api;
})(globalThis);

/* Adaptação da interface existente, sem mudar layout nem módulos do artefato. */
ERR.ponte_indisponivel = "Ponte local indisponível. Abra a ponte em 127.0.0.1:47831 para usar IA. As funções locais continuam disponíveis.";
queueMicrotask(() => { $("claudeState").textContent = "IA: ponte local (sob demanda)"; });
$("bkDown").textContent = "Exportar backup";
document.querySelector('label[for="bkFile"]').textContent = "Importar backup";
$("bkDown").onclick = async () => {
  bkMsg("Preparando…");
  try{
    const backup = await window.tutuSite.exportBackup();
    const dl = await window.claude.use("downloads");
    await dl.save({ filename: "tutu-backup.json", data: JSON.stringify(backup) });
    bkMsg(`Backup salvo (${Object.values(backup.dados).reduce((n, docs) => n + docs.length, 0)} itens).`);
  }catch(e){ bkMsg("Não foi possível exportar o backup. " + e.message, true); }
};
$("bkFile").onchange = async () => {
  const file = $("bkFile").files[0]; $("bkFile").value = "";
  if (!file) return;
  try{
    const n = await window.tutuSite.importBackup(JSON.parse(await file.text()));
    // Recarregar reconstrói todos os índices e aplica também formato, atalhos e estatísticas.
    bkMsg(`Backup importado (${n} itens). Recarregando…`);
    location.reload();
  }catch(e){ bkMsg("Não foi possível importar: " + e.message, true); }
};
$("ntUpd").onclick = () => showNtInfo("Atualização pelo Notion indisponível no site. Importe um backup atualizado; a cópia local foi mantida.");
window.tutuSite.appReady = true;

/* Casca v2: move os controles originais, preservando IDs e seus listeners. */
(() => {
  "use strict";
  const ui = window.tutuV2 = {};
  const el = ui.el = (tag, attrs = {}, text = "") => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    n.textContent = text; return n;
  };
  const button = ui.button = (text, action, attrs = {}) => {
    const b = el("button", { type: "button", ...attrs }, text); b.onclick = action; return b;
  };
  const moved = {}; // elementos movidos para blocos ainda fora da página: getElementById não os acha
  const $ = id => document.getElementById(id) || moved[id] || null;
  const move = (id, parent) => { const n = $(id); if (n) { moved[id] = n; parent.append(n); } return n; };
  document.body.classList.add("tutu-v2");
  const app = ui.app = document.querySelector(".app");
  const mobile = matchMedia("(max-width:760px)");
  app.id = "tutuApp";
  const top = el("header", { id: "v2Top" });
  const tabs = el("nav", { id: "caseTabs", role: "tablist", "aria-label": "Casos abertos" });
  top.append(tabs, button("+", () => ui.newTab(), { id: "newCaseTab", title: "Novo caso", "aria-label": "Novo caso" }),
    button("Histórico", () => openHistory(), { id: "histTopBtn", title: "Todos os exames salvos (os 4 mais recentes ficam nas abas)" }));
  const actions = el("div", { class: "v2-top-actions" });
  actions.append(el("span", { id: "saveState", role: "status" }, "salvo agora"), button("Ctrl K", () => ui.openPalette(), { title: "Buscar ações · Ctrl+K" }),
    button("⚙", () => ui.settings(!app.classList.contains("settings-open")), { id: "settingsTop", title: "Configurações · Ctrl+,", "aria-label": "Configurações" }));
  const footerActions = ui.footerActions = el("div", { class: "v2-footer-actions" });
  move("copiar", footerActions); $("copiar").textContent = "Copiar laudo";
  $("copiar").append(el("kbd", {}, "Ctrl C")); top.append(actions);
  const left = ui.left = el("aside", { id: "v2Left", "aria-label": "Máscaras e histórico" });
  const leftToggle = button("≡", () => ui.toggleLeft(), { id: "leftToggle", "aria-label": "Fixar ou recolher máscaras", "aria-expanded": "true", title: "Máscaras · Ctrl E" });
  const leftBody = el("div", { id: "leftBody" });
  left.append(leftToggle, leftBody);
  leftBody.append(el("input", { id: "maskSearch", type: "search", placeholder: "Buscar máscara…", "aria-label": "Buscar máscara" }));
  move("exams", leftBody);
  leftBody.append(el("h2", {}, "Hoje / Histórico")); move("histBtn", leftBody);
  leftBody.append(button("Configurações · Ctrl ,", () => ui.settings(true), { id: "settingsOpen" }));
  const leftTools = el("div", { class: "v2-tools" });
  ["mascBtn", "verMask", "vozBtn"].forEach(id => move(id, leftTools)); leftBody.append(leftTools);
  const center = ui.center = el("main", { id: "v2Center", "aria-label": "Folha do laudo" });
  center.append(document.querySelector('#paneLaudo > .fmt-bar'));
  ["tasyBar", "compBox", "laudoBox", "volHint", "corrNote"].forEach(id => move(id, center));
  const right = ui.right = el("aside", { id: "v2Right", "aria-label": "Ferramentas do laudo" });
  const rnav = el("nav", { id: "rightTabs", role: "tablist", "aria-label": "Ferramentas" });
  const names = ["Revisar", "Classificar", "IA", "Calc", "Aprendido"], icons = ["✓", "◇", "✦", "∑", "↺"];
  ui.panels = {};
  names.forEach((name, i) => {
    const b = button("", () => ui.panel(name), { role: "tab", id: "rightTab" + i, "aria-controls": "rightPanel" + i, "aria-selected": String(i === 0), title: name });
    b.append(el("b", { "aria-hidden": "true" }, icons[i]), el("span", {}, name)); rnav.append(b);
    ui.panels[name] = el("section", { id: "rightPanel" + i, role: "tabpanel", "aria-labelledby": b.id, class: "v2-panel" });
    ui.panels[name].hidden = i !== 0;
  });
  // Abas opcionais (como Corretor) ganham ícone e nome no trilho recolhido.
  const extraIcons = { Corretor: "✎" };
  new MutationObserver(() => {
    rnav.querySelectorAll("button").forEach(b => {
      if (!b.querySelector("span")) {
        const name = b.textContent.trim();
        b.replaceChildren(el("b", { "aria-hidden": "true" }, extraIcons[name] || name.charAt(0)), el("span", {}, name));
      }
      if (!b.title) b.title = b.querySelector("span").textContent.trim();
    });
  }).observe(rnav, { childList:true });
  right.append(button("≡", () => ui.toggleRight(), { id: "rightToggle", "aria-label": "Fixar ou recolher ferramentas", title: "Ferramentas · Ctrl ]", "aria-expanded": "true" }), rnav, ...Object.values(ui.panels));
  const rev = ui.panels.Revisar, ia = ui.panels.IA, learned = ui.panels.Aprendido;
  ["revisar", "alertBox", "status"].forEach(id => move(id, rev)); rev.append(document.querySelector(".review"));
  rev.append($("verBtn").closest(".ver-wrap")); move("undoBtn", rev);
  ["gerar", "parar", "tierQuick", "sugConc"].forEach(id => move(id, ia));
  ia.append(button("Aceitar tudo", () => { acceptAllEdits(); scheduleCaseSave(); }, { id: "acceptAI" }));
  move("undoAllBtn", ia); $("undoAllBtn").textContent = "Desfazer IA";
  ia.append(document.querySelector(".legend")); move("claudeBox", ia);
  learned.append(document.querySelector(".stylebox"));
  for (const [label, tab] of [["Autotextos", "frases"], ["Correções", "correcoes"], ["Macros", "macros"], ["Comandos", "comandos"]]) {
    learned.append(button(label, () => { $("vozBtn").click(); vozTab(tab); }));
  }
  learned.append(button("Treinar minha voz", () => $("trainOpen").click()));
  const calcs = ui.panels.Calc;
  Object.entries(CALCS).forEach(([key, label]) => {
    const target = ["fle", "renal", "aorta", "tep"].includes(key) ? ui.panels.Classificar : calcs;
    target.append(button(label, () => ui.calculator(key)));
  });
  move("calcBtn", calcs);
  ui.panels.Classificar.prepend(el("h2", {}, "Classificações e critérios"));
  ui.panels.Classificar.append(el("p", { class: "meta" }, "Escolha a ferramenta para preencher os critérios e inserir o resultado na folha."));
  ui.calculator = key => { openModal("calcModal"); showCalc(key); };
  const footer = el("footer", { id: "v2Footer" });
  footer.append(footerActions);
  const voice = el("div", { id: "voicePill", role: "status", "aria-live": "polite" });
  voice.append(el("span", { id: "voiceDot", "aria-hidden": "true" }, "●"), el("span", { id: "voiceLabel" }, "Voz · Alt S"), button("F1 · Ditar", () => ui.dictate(), { id: "voiceToggle" }));
  const settings = $("setModal"); settings.classList.add("v2-settings"); settings.removeAttribute("aria-modal"); settings.setAttribute("role", "region");
  const settingsExtras = el("div", { class: "v2-settings-extras" });
  settings.querySelector(".calc-body").prepend(settingsExtras);
  settingsExtras.append(el("h2", {}, "Laudos · Configurações"));
  settingsExtras.append(button("Sépia noite", () => ui.night(), { id: "nightToggle", "aria-pressed": "false" }));
  settingsExtras.append(button("Compacto · Ctrl ⇧ L", () => ui.compact()), button("Buscar tudo · Ctrl K", () => ui.openPalette()));
  const oldFooter = document.querySelector(".sb");
  const other = el("details", { id: "legacyTools" }); other.append(el("summary", {}, "Mais ferramentas e informações"));
  other.append(oldFooter, $("examCol").querySelector(".side-foot"));
  // Todos os controles restantes continuam acessíveis nesta área, sem duplicar IDs.
  other.append($("laudoCol").querySelector(".col-head"));
  other.append($("paneLaudo"));
  // Hosts usados por callbacks antigos precisam continuar conectados ao documento.
  const hosts = el("div", { id: "legacyHosts", hidden: "" });
  hosts.append($("grid"), $("sideRail")); other.append(hosts);
  settings.querySelector(".calc-body").append(other);
  app.replaceChildren(top, left, center, right, footer, settings);
  document.body.append(voice);
  // O rodapé cresce quando os atalhos quebram; a pílula fica sempre acima dele.
  const footerSize = new ResizeObserver(() => {
    const height = Math.ceil(footer.getBoundingClientRect().height) + "px";
    voice.style.setProperty("--v2-footer-height", height);
    app.style.setProperty("--v2-footer-height", height);
  });
  footerSize.observe(footer);
  ui.settings = on => { settings.hidden = !on; app.classList.toggle("settings-open", on); if (on) { renderKeys(); $("setTitle").focus(); } else focusSheet(); ui.updateOutline?.(); };
  $("setTitle").tabIndex = -1; $("setBtn").onclick = () => ui.settings(true);
  const oldOpen = openModal, oldClose = closeModal;
  openModal = id => id === "setModal" ? ui.settings(true) : oldOpen(id);
  closeModal = id => id === "setModal" ? ui.settings(false) : oldClose(id);
  ui.panel = name => {
    if (app.classList.contains("focus-mode")) setFoco(false);
    setRightPinned(true);
    Object.entries(ui.panels).forEach(([n, p]) => { p.hidden = n !== name; $(p.getAttribute("aria-labelledby")).setAttribute("aria-selected", String(n === name)); });
    $("rightToggle").setAttribute("aria-expanded", "true");
  };
  let leftPinned = store.get("v2LeftMini") !== "1" && !mobile.matches;
  let leftPeekTimer = null;
  const showLeft = open => {
    app.classList.toggle("left-mini", !open);
    leftToggle.setAttribute("aria-expanded", String(open));
    leftToggle.setAttribute("aria-pressed", String(leftPinned));
    leftToggle.title = leftPinned ? "Desafixar máscaras · Ctrl+E" : "Fixar máscaras · Ctrl+E";
  };
  const setLeftPinned = pinned => {
    clearTimeout(leftPeekTimer);
    leftPinned = pinned;
    store.set("v2LeftMini", pinned ? "0" : "1");
    $("setCollapse").value = pinned ? "0" : "1";
    showLeft(pinned);
  };
  ui.toggleLeft = () => setLeftPinned(!leftPinned);
  leftToggle.addEventListener("mouseenter", () => { if (!mobile.matches) { clearTimeout(leftPeekTimer); showLeft(true); } });
  // Abre só ao passar perto do ≡ (pedido do Artur, 12/11/2026); a lateral aberta segura aberta enquanto o mouse estiver nela.
  left.addEventListener("mouseenter", () => { if (!mobile.matches && !app.classList.contains("left-mini")) clearTimeout(leftPeekTimer); });
  left.addEventListener("mouseleave", () => {
    clearTimeout(leftPeekTimer);
    if (!leftPinned) leftPeekTimer = setTimeout(() => showLeft(false), 250);
  });
  let rightPinned = store.get("v2RightMini") !== "1" && !mobile.matches;
  let rightPeekTimer = null;
  const rightToggle = $("rightToggle");
  const showRight = open => {
    app.classList.toggle("right-mini", !open);
    rightToggle.setAttribute("aria-expanded", String(open));
    rightToggle.setAttribute("aria-pressed", String(rightPinned));
    rightToggle.title = rightPinned ? "Desafixar ferramentas · Ctrl ]" : "Fixar ferramentas · Ctrl ]";
  };
  const setRightPinned = pinned => {
    clearTimeout(rightPeekTimer); rightPinned = pinned;
    store.set("v2RightMini", pinned ? "0" : "1"); showRight(pinned);
  };
  ui.toggleRight = () => setRightPinned(!rightPinned);
  rightToggle.addEventListener("mouseenter", () => { if (!mobile.matches) { clearTimeout(rightPeekTimer); showRight(true); } });
  right.addEventListener("mouseenter", () => { if (!mobile.matches && !app.classList.contains("right-mini")) clearTimeout(rightPeekTimer); });
  right.addEventListener("mouseleave", () => {
    clearTimeout(rightPeekTimer);
    if (!rightPinned) rightPeekTimer = setTimeout(() => showRight(false), 250);
  });
  ui.compact = () => { app.classList.toggle("compact"); ui.settings(false); ui.positionPalette?.(); };
  ui.night = () => { const night = document.body.classList.toggle("sepia-night"); store.set("v2Night", night ? "1" : "0"); $("nightToggle").textContent = night ? "Sépia dia" : "Sépia noite"; $("nightToggle").setAttribute("aria-pressed", String(night)); $("themeButton").textContent = night ? "☀" : "☾"; };
  top.append(button("☾", () => ui.night(), { id: "themeButton", title: "Alternar sépia dia/noite", "aria-label": "Alternar sépia dia/noite" }));
  if (store.get("v2Night") === "1") ui.night();
  showLeft(leftPinned);
  showRight(rightPinned);
  // No celular os botões ficam no topo, acessíveis mesmo com as gavetas fechadas.
  const placeDrawers = () => {
    clearTimeout(leftPeekTimer); clearTimeout(rightPeekTimer);
    if (mobile.matches) {
      top.prepend(leftToggle); top.append(rightToggle);
      leftPinned = rightPinned = false;
    } else {
      left.prepend(leftToggle); right.prepend(rightToggle);
      leftPinned = store.get("v2LeftMini") !== "1";
      rightPinned = store.get("v2RightMini") !== "1";
    }
    showLeft(leftPinned); showRight(rightPinned);
  };
  mobile.addEventListener("change", placeDrawers);
  placeDrawers();
  $("maskSearch").oninput = () => { document.querySelectorAll("#exams .exam").forEach(b => b.hidden = !TutuV2Core.score($("maskSearch").value, b.textContent)); };
  const render = renderExams;
  renderExams = () => { render(); $("maskSearch").oninput(); };
  // Os atalhos antigos de foco/plantão passam a usar as disposições da casca.
  setCollapsed = on => setLeftPinned(!on);
  $("setCollapse").onchange = () => setCollapsed($("setCollapse").value === "1");
  setFoco = on => { app.classList.toggle("focus-mode", on); $("setFoco").checked = on; document.body.classList.toggle("foco", on); store.set("foco", on ? "1" : "0"); };
  const originalPlantao = setPlantao;
  setPlantao = on => { originalPlantao(on); app.classList.toggle("compact", on); };
  $("setTheme").closest("label").hidden = true; // Somente o botão muda o sépia.
  const keySection = $("keyList").parentElement;
  keySection.querySelector(".label").textContent = "Atalhos de teclado";
  keySection.querySelector(".voz-help").textContent = "Defina atalhos adicionais. As teclas F do rodapé podem ser editadas abaixo. Alt+S controla o microfone.";
  ui.setScreenSize = delta => { const size = Math.max(8, Math.min(24, +(store.get("v2SheetSize") || 11) + delta)); store.set("v2SheetSize", String(size)); sheet.style.setProperty("--screen-size", size + "pt"); };
  ui.setScreenSize(0);
  // Ajustes antigos continuam operantes, agora sobre as regiões da casca.
  const originalLayout = applyLayout;
  applyLayout = () => {
    originalLayout();
    app.style.setProperty("--v2-left-width", layout.side + "px");
    const pct = layout.mode === "stack" ? layout.top : layout.left;
    app.style.setProperty("--v2-right-width", (216 + pct * 3) + "px");
    $("topVal").textContent = (216 + pct * 3) + " px";
    app.classList.toggle("compact", layout.mode === "side");
  };
  $("setLayout").options[0].textContent = "Folha central e painéis";
  $("setLayout").options[1].textContent = "Compacto ao lado do PACS";
  const topLabel = $("setTop").closest("label");
  if (topLabel.firstChild?.nodeType === 3) topLabel.firstChild.textContent = "Largura das ferramentas ";
  const layoutHelp = $("setLayout").closest(".form-grid").nextElementSibling;
  layoutHelp.textContent = "Ajuste a largura dos painéis. Ctrl+E e Ctrl+] recolhem as laterais; Ctrl+Shift+L alterna o compacto.";
  $("setZoom").oninput = () => {
    const z = +$("setZoom").value; store.set("zoom", String(z));
    store.set("v2SheetSize", String(11 * z / 100)); ui.setScreenSize(0); $("zoomVal").textContent = z + "%";
  };
  $("setDict").oninput = () => { store.set("dictSize", $("setDict").value); $("dictVal").textContent = $("setDict").value + " px"; $("voicePill").style.fontSize = $("setDict").value + "px"; };
  const dictLabel = $("setDict").closest("label");
  if (dictLabel.firstChild?.nodeType === 3) dictLabel.firstChild.textContent = "Letra da pílula de voz ";
  const originalBox = applyBox;
  applyBox = id => { originalBox(id); if (id === "laudoBox") sheet.style.minHeight = boxH[id] ? boxH[id] + "px" : "740px"; };
  $("layoutReset").onclick = () => { layout = { ...LAYOUT_DEF, side:240 }; saveLayout(); setCollapsed(false); if (app.classList.contains("right-mini")) ui.toggleRight(); };
  const originalTab = selectTab;
  selectTab = which => { originalTab(which); if (which === "chat") ui.panel("IA"); else if (which === "laudo") ui.settings(false); };
  const originalGenerate = gerar, originalLocalReview = conferirLocal;
  gerar = async (...args) => { ui.panel("IA"); return originalGenerate(...args); };
  $("gerar").onclick = () => gerar();
  conferirLocal = (...args) => { ui.panel("Revisar"); return originalLocalReview(...args); };
  ui.updateOutline = () => {
    const s = getSelection();
    if (s.rangeCount && sheet.contains(s.anchorNode)) sheetRange = s.getRangeAt(0).cloneRange();
    ui.positionPalette?.();
  };
  document.addEventListener("selectionchange", ui.updateOutline);
  center.addEventListener("scroll", ui.updateOutline, { passive: true });
  window.addEventListener("resize", ui.updateOutline);
})();

/* Abas: diário síncrono local + casos e lista de IDs no IndexedDB. */
(() => {
  "use strict";
  const ui = window.tutuV2, KEY = "tutu-v2-session";
  let tabs = [], active = "", restoring = true, writes = Promise.resolve(), revision = 0, reviewBusy = false, copying = false, listWritten = false;
  const oldConferir = conferir;
  conferir = async (...args) => { reviewBusy = true; try { return await oldConferir(...args); } finally { reviewBusy = false; confCtl = null; } };
  const oldCopy = doCopy;
  doCopy = async () => { if (copying) return; copying = true; try { return await oldCopy(); } finally { copying = false; } };
  const clone = value => structuredClone(value);
  // Texto fixo: só reescreve se mudou (sem piscar enquanto o médico digita).
  const setSave = text => { const n = $("saveState"); if (n.textContent !== text) n.textContent = text; };
  const stamp = () => new Date().toISOString();
  const newId = () => dayKey() + "-" + crypto.randomUUID();
  const cleanHTML = () => {
    const tmp = sheet.cloneNode(true);
    return tmp.innerHTML;
  };
  const caret = () => {
    const selection = getSelection();
    const r = selection.rangeCount && sheet.contains(selection.anchorNode) ? selection.getRangeAt(0) : sheetRange;
    if (!r || !sheet.contains(r.startContainer) || !sheet.contains(r.endContainer)) return null;
    return [offsetOf(sheet, r.startContainer, r.startOffset), offsetOf(sheet, r.endContainer, r.endOffset)];
  };
  function capture() {
    return { id: active || caseId || newId(), examId: current.id, exam: clone(current), extraExams: clone(extras),
      html: cleanHTML(), modelSig, versions: clone(versions), verPtr, lastGenerated, lastGenTagged, checkedHash,
      confItems: clone(confItems), sexo, copied: caseCopied, started: caseStart || stamp(), updated: stamp(),
      edited: !modelIntact() || caseCopied,   // máscara intacta e não copiada = não entra no histórico
      caret: caret(), scroll: ui.center.scrollTop, chatTurns: clone(chatTurns), chatHTML: $("chat").innerHTML,
      question: $("pergunta").value, compData: $("compData").value, compTexto: $("compTexto").value,
      review: $("reviewBody").innerHTML, localReview: !!$("confClaude"), status: $("status").textContent };
  }
  function captureActive() {
    const item = capture(), i = tabs.findIndex(t => t.id === item.id);
    if (i < 0) tabs.push(item); else tabs[i] = item;
    return item;
  }
  function session() { return { version: 2, active, tabs }; }
  function journal() {
    try { localStorage.setItem(KEY, JSON.stringify(session())); return true; }
    catch (_) { setSave("falha no salvamento local"); return false; }
  }
  // Só os 4 exames editados mais recentes ficam nas abas (+ a ativa); os outros ficam no botão Histórico.
  function prune() {
    const kept = TutuV2Core.keepTabs(tabs, active);
    if (kept.length === tabs.length) return false;
    tabs = kept; return true;
  }
  function persist() {
    if (restoring || !active) return writes;
    const item = captureActive(); const pruned = prune(), localOK = journal(), rev = ++revision;
    if (pruned) renderTabs();
    const list = { version: 2, active, ids: tabs.map(t => t.id) };
    // Captura antes de enfileirar: uma troca de aba não pode mudar o destino da escrita.
    const plain = laudoTagged(), anyEdited = tabs.some(t => t.edited);
    writes = writes.catch(() => {}).then(async () => {
      if (item.edited) await tutuSite.db.doc("casos/" + item.id).set({
        dia: dayKey(new Date(item.started)), inicio: item.started, atualizado: item.updated,
        hora: new Date(item.started).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        exame: fullName(item.exam), exameId: item.examId, laudo: plain, laudoHtml: item.html,
        achados: "", versoes: item.versions, copiado: item.copied, v2: item
      });
      // Sessão sem nenhum exame editado não deixa rastro no banco (a menos que já haja uma lista a atualizar).
      if (list.ids.length && (anyEdited || listWritten)) { await tutuSite.db.doc("config/abas-v2").set(list); listWritten = true; }
      if (rev === revision) setSave("salvo agora");
    }).catch(() => { if (rev === revision) setSave(localOK ? "salvo localmente · banco indisponível" : "falha ao salvar"); });
    return writes;
  }
  saveCaseNow = persist;
  scheduleCaseSave = () => { clearTimeout(caseTimer); if (!restoring) persist(); };
  function canSwitch() {
    if (genBusy || corrBusy || reviewBusy || copying || !$("parar").hidden) {
      setStatus("Aguarde a operação atual ou clique em Parar antes de trocar de caso."); return false;
    }
    return true;
  }
  function renderTabs() {
    const nav = $("caseTabs"); nav.replaceChildren();
    for (const t of tabs) {
      const b = ui.button("", () => ui.switchTab(t.id), { role: "tab", "data-case": t.id,
        "aria-selected": String(t.id === active), "aria-controls": "v2Center", title: fullName(t.exam || { name: t.examId }) + " · Ctrl+Tab", tabindex: t.id === active ? "0" : "-1" });
      const dot = ui.el("i", { class: "case-rec", "aria-label": "Ditado neste caso" }); dot.hidden = ui.voiceCase !== t.id;
      // × discreto (pedido do Artur, 12/11/2026): tira a aba da fileira; o laudo editado continua no Histórico.
      const x = ui.el("small", { class: "case-close", role: "button", "aria-label": "Fechar esta aba", title: "Fechar aba (continua no Histórico)" }, "×");
      x.addEventListener("click", e => { e.stopPropagation(); e.preventDefault(); ui.closeTab(t.id); });
      b.append(dot, ui.el("span", {}, shortName(t.exam || { name: t.examId })), x);
      nav.append(b);
    }
    nav.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  ui.renderTabs = renderTabs;
  function load(t, focus = true) {
    restoring = true;
    ui.voiceState = null;
    clearTimeout(caseTimer); clearTimeout(editVerTimer); clearTimeout(alertTimer); clearTimeout(corrTimer);
    active = t.id; caseId = t.id; caseStart = t.started || stamp(); caseCopied = !!t.copied;
    current = EXAMS.find(e => e.id === t.examId) || t.exam || EXAMS[0]; extras = t.extraExams || [];
    sheet.innerHTML = t.html;
    editSeq = [...sheet.querySelectorAll("[data-e]")].reduce((n, node) => Math.max(n, Number(node.dataset.e) || 0), editSeq);
    modelSig = t.modelSig || ""; versions = clone(t.versions || []); verPtr = t.verPtr ?? versions.length - 1;
    lastGenerated = t.lastGenerated || ""; lastGenTagged = t.lastGenTagged || ""; checkedHash = t.checkedHash || "";
    confItems = clone(t.confItems || []); sexo = t.sexo || ""; chatTurns = clone(t.chatTurns || []);
    $("chat").innerHTML = t.chatHTML || ""; $("pergunta").value = t.question || "";
    $("compData").value = t.compData || ""; $("compTexto").value = t.compTexto || "";
    sheetRange = null; getSelection().removeAllRanges();
    store.set("caseId", caseId); store.set("caseStart", caseStart); store.set("exame", current.id); store.set("modelSig", modelSig);
    $("verCount").textContent = versions.length ? "(" + versions.length + ")" : "";
    renderExams(); updateCount(); updVolHint(); renderAlerts(); resetReview();
    confItems = clone(t.confItems || []);
    if (t.localReview && t.review) {
      $("reviewBody").innerHTML = t.review;
      if ($("confClaude")) { $("confClaude").disabled = !sample; $("confClaude").onclick = () => conferir(); }
    } else if (confItems.length) renderConf(); else if (t.review) $("reviewBody").innerHTML = t.review;
    setStatus(t.status || "Caso recuperado.");
    if (t.caret) sheetRange = rangeFromOffsets(sheet, t.caret[0], t.caret[1]);
    ui.settings(false); if (focus) focusSheet();
    ui.center.scrollTop = t.scroll || 0;
    restoring = false; renderTabs(); ui.updateOutline();
  }
  ui.switchTab = id => {
    if (!active || id === active) { ui.settings(false); return; }
    const target = tabs.find(t => t.id === id);
    if (!target || !canSwitch()) return;
    ui.closePalette?.(); persist(); load(target); persist();
  };
  ui.cycleTabs = delta => { const index = tabs.findIndex(t => t.id === active); if (tabs.length) ui.switchTab(tabs[(index + delta + tabs.length) % tabs.length].id); };
  ui.newTab = (examId = current.id) => {
    if (restoring || !canSwitch()) return;
    const ex = EXAMS.find(e => e.id === examId); if (!ex) return;
    persist();
    const t = { id: newId(), examId: ex.id, exam: clone(ex), html: modelSheetHtml(ex), started: stamp(), versions: [], extraExams: [] };
    tabs.push(t); load(t); modelSig = laudoTagged(); pushVersion("Modelo"); persist();
  };
  ui.closeCurrent = () => {
    if (!canSwitch()) return;
    persist(); const index = tabs.findIndex(t => t.id === active); tabs.splice(index, 1);
    if (!tabs.length) { const ex = current; tabs.push({ id: newId(), examId: ex.id, exam: clone(ex), html: modelSheetHtml(ex), started: stamp(), versions: [] }); }
    load(tabs[Math.min(index, tabs.length - 1)]); persist();
  };
  ui.closeTab = id => {
    if (id === active) return ui.closeCurrent();
    const i = tabs.findIndex(t => t.id === id); if (i < 0 || !canSwitch()) return;
    tabs.splice(i, 1); renderTabs(); persist();
  };
  const originalSelect = selectExam;
  selectExam = (id, focus, add) => {
    if (restoring) return originalSelect(id, focus, add);
    if (add) { originalSelect(id, focus, add); persist(); return; }
    if (id === current.id) { if (focus) focusSheet(); return; }
    ui.newTab(id);
  };
  openMaskAsNew = ex => ui.newTab(ex.id);
  $("limpar").onclick = () => ui.newTab();
  ui.openCase = item => {
    if (!canSwitch()) return;
    const id = item.legado ? newId() : item.id;
    if (tabs.some(t => t.id === id)) { ui.switchTab(id); closeModal("histModal"); return; }
    persist();
    const t = item.v2 ? { edited: true, ...item.v2 } : { id, edited: true, examId: item.exameId || current.id, exam: EXAMS.find(e => e.id === item.exameId) || current,
      html: item.laudoHtml || toHtml(item.laudo || ""), versions: item.versoes || [], started: item.inicio || stamp(), copied: item.copiado };
    tabs.push(t); load(t); persist(); closeModal("histModal");
  };
  $("histOpen").onclick = () => { if (histSel) ui.openCase(histSel); };
  // Observa também alterações programáticas (diff, normal, versões, extensão).
  let pending = false;
  new MutationObserver(() => {
    if (restoring || pending) return;
    pending = true; queueMicrotask(() => { pending = false; persist(); ui.updateOutline(); });
  }).observe(sheet, { childList: true, subtree: true, characterData: true });
  sheet.addEventListener("input", () => { if (!restoring) { captureActive(); journal(); } });
  const flush = () => { if (!restoring) { captureActive(); journal(); persist(); } };
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  ui.activeId = () => active;
  ui.flush = persist;
  ui.caseState = () => clone(session());
  ui.ready = (async () => {
    await tutuSite.ready;
    // Drena as leituras de inicialização antigas antes da restauração da sessão v2.
    await tutuSite.db.collection("mascaras").get();
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (_) {}
    const index = await tutuSite.db.doc("config/abas-v2").get();
    listWritten = index.exists;
    if (!TutuV2Core.validSession(saved)) {
      if (index.exists && Array.isArray(index.data().ids)) {
        const meta = index.data(), rows = await Promise.all(meta.ids.map(id => tutuSite.db.doc("casos/" + id).get()));
        const recovered = rows.filter(r => r.exists && r.data().v2).map(r => r.data().v2);
        saved = { version: 2, active: recovered.some(t => t.id === meta.active) ? meta.active : recovered[0]?.id, tabs: recovered };
      }
    }
    if (TutuV2Core.validSession(saved)) { tabs = saved.tabs.map(t => t.edited === undefined ? { ...t, edited: true } : t); load(tabs.find(t => t.id === saved.active)); await persist(); }
    // Sessão nova: só diário local; o banco recebe o caso na primeira edição (instalação nova fica vazia).
    else { active = caseId || newId(); caseId = active; caseStart = caseStart || stamp(); tabs = [capture()]; restoring = false; renderTabs(); journal(); }
    focusSheet(); ui.updateOutline(); ui.initialized = true;
  })().catch(error => { setSave("falha ao recuperar abas"); setStatus(error.message, "err"); throw error; });
})();

/* Paleta, atalhos editáveis e integração de eventos com a extensão. */
(() => {
  "use strict";
  const ui = window.tutuV2;
  ui.actions = {
    ditar: { label: "Ditar", run: () => ui.dictate() },
    proximo: { label: "Próximo campo", run: () => { if (!nextField()) sectionNav(1); } },
    normal: { label: "Normal", run: () => { laudoNormal(); ui.panel("Revisar"); } },
    copiar: { label: "Copiar", run: () => $("copiar").click() },
    gerar: { label: "IA", run: () => { ui.panel("IA"); $("gerar").click(); } },
    conferir: { label: "Conferir", run: () => { ui.panel("Revisar"); conferirLocal(); } },
    classificar: { label: "Classificar", run: () => ui.panel("Classificar") },
    desfazer: { label: "Desfazer", run: () => { ui.volume?.cancel(); undoVersion(); } },
    compacto: { label: "Compacto", run: () => ui.compact() },
    hud: { label: "Janelinha sobre o PACS", run: () => ui.openHUD() }
  };
  // Objeto único editável: rodapé e execução usam exatamente a mesma configuração.
  ui.shortcuts = { F1: "ditar", F2: "proximo", F3: "normal", F4: "copiar", F6: "gerar", F7: "conferir", F8: "classificar", F9: "desfazer", "Ctrl+Shift+L": "compacto" };
  try { const saved = JSON.parse(store.get("v2Shortcuts") || "null"); if (saved && Object.values(saved).every(a => ui.actions[a])) Object.assign(ui.shortcuts, saved); } catch (_) {}
  const foot = $("v2Footer");
  ui.renderShortcuts = () => {
    const shortcuts = ui.el("div", { class: "v2-shortcuts" });
    for (const [key, action] of Object.entries(ui.shortcuts)) {
      const b = ui.button("", () => ui.actions[action].run(), { title: ui.actions[action].label + " · " + key });
      b.append(ui.el("kbd", {}, key), ui.el("span", {}, ui.actions[action].label)); shortcuts.append(b);
    }
    foot.replaceChildren(ui.footerActions, shortcuts);
  };
  ui.renderShortcuts();
  const keyEditor = ui.el("div", { class: "v2-key-editor" });
  keyEditor.append(ui.el("h2", {}, "Teclas do rodapé"));
  for (const key of Object.keys(ui.shortcuts)) {
    const label = ui.el("label", {}, key), select = ui.el("select", { "aria-label": "Ação de " + key });
    for (const [action, entry] of Object.entries(ui.actions)) select.append(ui.el("option", { value: action }, entry.label));
    select.value = ui.shortcuts[key]; select.onchange = () => { ui.shortcuts[key] = select.value; store.set("v2Shortcuts", JSON.stringify(ui.shortcuts)); ui.renderShortcuts(); };
    label.append(select); keyEditor.append(label);
  }
  $("keyList").after(keyEditor);
  let paletteRange = null, previousFocus = null, results = [], selected = 0, history = [], paletteEpoch = 0, conts = [];
  const pal = ui.el("section", { id: "commandPalette", role: "dialog", "aria-label": "Buscar máscaras e ações" }); pal.hidden = true;
  const input = ui.el("input", { id: "commandSearch", type: "search", role: "combobox", "aria-controls": "commandResults", "aria-expanded": "false", "aria-autocomplete": "list", "aria-label": "Buscar máscaras, autotextos, comandos, calculadoras e histórico", placeholder: "Máscara, autotexto, comando, cálculo…", autocomplete: "off" });
  const list = ui.el("div", { id: "commandResults", role: "listbox" });
  pal.append(input, list, ui.el("small", {}, "↑ ↓ escolher · Enter ou Tab aceitar · Esc voltar")); document.body.append(pal);
  function restoreRange() {
    if (paletteRange && sheet.contains(paletteRange.startContainer)) { sheetRange = paletteRange.cloneRange(); focusSheet(); }
  }
  const close = () => { if (pal.hidden) return; pal.hidden = true; input.setAttribute("aria-expanded", "false"); paletteEpoch++; restoreRange(); if (!paletteRange && previousFocus?.isConnected) previousFocus.focus(); };
  ui.closePalette = close;
  ui.positionPalette = () => {
    if (pal.hidden) return;
    let rect;
    try { rect = paletteRange?.getBoundingClientRect(); } catch (_) {}
    if (!rect?.height) {
      const node = paletteRange?.startContainer;
      rect = (node?.nodeType === 1 ? node : node?.parentElement)?.getBoundingClientRect();
    }
    if (!rect?.height) { const paper = sheet.getBoundingClientRect(); rect = { left: paper.left, top: paper.top + 35, bottom: paper.top + 55 }; }
    // Referência sempre é a linha do cursor. Em viewport muito baixo, a lista rola.
    rect = { left: rect.left, top: Math.max(8, Math.min(innerHeight - 28, rect.top)), bottom: Math.max(28, Math.min(innerHeight - 8, rect.bottom)) };
    const p = TutuV2Core.placePalette(rect, innerWidth, innerHeight, 230);
    Object.assign(pal.style, { left: p.left + "px", top: p.top + "px", width: p.width + "px", maxHeight: p.height + "px" });
  };
  function insert(text) { restoreRange(); insertAtCaret(text); scheduleCaseSave(); }
  function runCommand(action) {
    if (runPageAction(action)) return;
    if (action.startsWith("exame:")) { ui.newTab(action.slice(6)); return; }
    if (action === "apagar_frase") { selectLastSentence(); document.execCommand("delete"); return; }
    if (action === "apagar_isso") { undoVersion(); return; }
    if (action === "normal") laudoNormal(); else if (action === "gerar") ui.actions.gerar.run();
    else if (action === "copiar" || action === "copiarGlobal") $("copiar").click();
    else if (action === "novo") ui.newTab(); else if (action === "revisar") ui.actions.conferir.run();
    else if (action === "plantao") togglePlantao();
  }
  function catalog() {
    const items = [], add = (kind, label, run, search = "") => items.push({ kind, label, run, search });
    for (const ex of EXAMS) add("Máscara", shortName(ex), () => ui.newTab(ex.id), (ex.voz || []).join(" "));
    for (const f of frases) add("Autotexto", f.nome, () => insert(f.texto), f.texto);
    for (const m of macros) add("Macro", m.nome, () => insert(m.texto), m.texto);
    for (const [id, entry] of Object.entries(ui.actions)) add("Ação", entry.label, entry.run, id);
    for (const c of [...BUILTIN_CMDS, ...comandos]) add("Comando", c.fala, () => runCommand(c.acao));
    for (const [key, label] of Object.entries(CALCS)) add("Calculadora", label, () => ui.calculator(key));
    add("Histórico", "Hoje / Histórico de exames", () => openHistory());
    for (const row of history) add("Histórico", `${row.exame || "Laudo"} · ${row.dia || ""} ${row.hora || ""}`, () => ui.openCase(row), row.laudo || "");
    add("Ação", "Configurações", () => ui.settings(true));
    add("Ação", "Novo caso", () => ui.newTab());
    add("Ação", "Fechar aba (caso permanece no histórico)", () => ui.closeCurrent());
    add("Ação", "Máscaras: minimizar/restaurar", () => ui.toggleLeft());
    add("Ação", "Painel direito: minimizar/restaurar", () => ui.toggleRight());
    add("Ação", "Sépia dia / noite", () => ui.night());
    add("Ação", "Aceitar tudo da IA", () => { acceptAllEdits(); scheduleCaseSave(); });
    add("Ação", "Desfazer IA", () => { undoAllClaude(); ui.panel("IA"); });
    add("Ação", "Versões do laudo", () => { ui.panel("Revisar"); $("verBtn").click(); });
    for (const [label, id] of [["Editar máscaras", "mascBtn"], ["Ver máscara padrão", "verMask"], ["Autotextos, macros e voz", "vozBtn"], ["Treinar voz", "trainOpen"], ["Exportar backup", "bkDown"]]) add("Ação", label, () => $(id).click());
    add("Ação", "Importar backup", () => { ui.settings(true); $("bkFile").click(); });
    return items;
  }
  function draw() {
    const q = input.value;
    // Continuações da frase começada ficam no topo enquanto nada foi digitado; depois, busca normal.
    const top = q.trim() ? [] : conts.map((text, order) => ({ kind: "Continuação", label: text.trim(), run: () => insert(text), order, search: "", score: 1e3 }));
    results = top.concat(catalog().map((entry, order) => ({ ...entry, order, score: TutuV2Core.score(q, entry.label + " " + entry.kind + " " + entry.search) }))
      .filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 30));
    selected = Math.max(0, Math.min(selected, results.length - 1)); list.replaceChildren();
    results.forEach((entry, i) => {
      const b = ui.button("", () => execute(i), { id: "commandOption" + i, role: "option", "aria-selected": String(i === selected), tabindex: "-1", ...(entry.kind === "Continuação" ? { class: "cmd-cont", title: entry.label } : {}) });
      b.append(ui.el("small", {}, entry.kind), ui.el("span", {}, entry.label)); list.append(b);
    });
    if (!results.length) list.append(ui.el("p", {}, "Nenhum resultado."));
    if (results.length) input.setAttribute("aria-activedescendant", "commandOption" + selected); else input.removeAttribute("aria-activedescendant");
    ui.positionPalette();
  }
  function execute(index) { const item = results[index]; if (!item) return; close(); item.run(); }
  input.oninput = () => { selected = 0; draw(); };
  // A paleta pode estar aberta com resultados da versão anterior do banco.
  document.addEventListener("tutu-bancos", () => { conts = []; results = []; close(); });
  ui.openPalette = async () => {
    if (!pal.hidden) { close(); return; }
    previousFocus = document.activeElement;
    const s = getSelection(); paletteRange = s.rangeCount && sheet.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : sheetRange?.cloneRange();
    conts = []; try { conts = ui.continuations?.(paletteRange) || []; } catch (_) {}
    pal.hidden = false; input.value = ""; selected = 0; input.setAttribute("aria-expanded", "true");
    draw(); input.focus({ preventScroll: true }); const epoch = ++paletteEpoch;
    try {
      const [cases, legacy] = await Promise.all([tutuSite.db.collection("casos").orderBy("atualizado", "desc").limit(400).get(), tutuSite.db.collection("historico").get()]);
      history = cases.docs.map(d => ({ id: d.id, ...d.data() }));
      for (const d of legacy.docs) (d.data().itens || []).forEach((it, i) => history.push({ ...it, id: `hist-${d.id}-${i}`, dia: d.id, laudo: it.texto, legado: true }));
      if (!pal.hidden && paletteEpoch === epoch) draw();
    } catch (_) { if (!pal.hidden) setStatus("Histórico indisponível; demais ações continuam disponíveis."); }
  };
  document.addEventListener("pointerdown", e => { if (!pal.hidden && !pal.contains(e.target)) close(); }, true);
  ui.dictate = () => {
    close(); focusSheet();
    // A extensão atual já escuta Alt+S na página (toggleKey); não requer alteração nela.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", code: "KeyS", altKey: true, bubbles: true, cancelable: true }));
    $("voiceLabel").textContent = "Comando enviado · Alt S";
  };
  let voiceTimer;
  function voiceActivity(label, recording = true) {
    ui.voiceCase = recording ? ui.activeId() : null;
    $("voicePill").classList.toggle("recording", recording);
    $("voiceLabel").textContent = label; ui.renderTabs();
    clearTimeout(voiceTimer);
    // A extensão antiga não publica o estado do microfone para a página.
    // A bolinha indica atividade recebida, nunca um estado permanente presumido.
    if (recording) voiceTimer = setTimeout(() => { ui.voiceCase = null; $("voicePill").classList.remove("recording"); $("voiceLabel").textContent = "Voz · aguardando atividade"; ui.renderTabs(); }, 2200);
  }
  document.addEventListener("laudos-voz", e => {
    let d; try { d = typeof e.detail === "string" ? JSON.parse(e.detail) : e.detail; } catch (_) { return; }
    if (d?.acao) voiceActivity("Comando de voz recebido");
  });
  document.addEventListener("laudos-correcao", () => voiceActivity("Correção de voz recebida"));
  document.addEventListener("laudos-aviso", e => {
    let d; try { d = typeof e.detail === "string" ? JSON.parse(e.detail) : e.detail; } catch (_) { return; }
    voiceActivity(d?.tipo === "erro" ? "Confira o aviso no painel" : "Laudo pronto", false);
  });
  // Contrato opcional para versões da ponte que publicam estado/interim.
  document.addEventListener("laudos-ditado", e => {
    let d; try { d = typeof e.detail === "string" ? JSON.parse(e.detail) : e.detail; } catch (_) { return; }
    if (d) {
      ui.voiceState = { caseId: ui.activeId(), interim: d.on && !d.paused && typeof d.interim === "string" ? d.interim : "" };
      voiceActivity(d.paused ? "Ditado pausado" : d.on ? "Ditando na folha" : "Voz · Alt S", !!d.on && !d.paused);
      ui.updateHUD?.();
    }
  });
  sheet.addEventListener("input", e => { if (!e.isTrusted) voiceActivity("Texto recebido na folha"); });
  window.addEventListener("keydown", e => {
    if (capturing) return;
    const k = e.key.toLowerCase();
    let action = null;
    if (e.ctrlKey && !e.altKey && k === "k") action = () => ui.openPalette();
    else if (e.ctrlKey && e.shiftKey && !e.altKey && k === "j") action = () => ui.openHUD();
    else if (!pal.hidden && ["escape", "enter", "tab", "arrowdown", "arrowup"].includes(k) && !(k === "tab" && (e.ctrlKey || e.altKey))) action = () => {
      if (k === "escape") close(); else if (k === "enter" || k === "tab") execute(selected);
      else { selected = (selected + (k === "arrowdown" ? 1 : -1) + results.length) % (results.length || 1); draw(); $("commandOption" + selected)?.scrollIntoView({ block: "nearest" }); }
    };
    else if (e.ctrlKey && !e.altKey && k === "tab") action = () => ui.cycleTabs(e.shiftKey ? -1 : 1);
    else if (e.ctrlKey && !e.altKey && !e.shiftKey && k === "e") action = () => ui.toggleLeft();
    else if (e.ctrlKey && !e.altKey && (k === "]" || e.code === "BracketRight")) action = () => ui.toggleRight();
    else if (e.ctrlKey && !e.altKey && k === ",") action = () => ui.settings($("setModal").hidden);
    else if (e.ctrlKey && e.shiftKey && (e.code === "Digit1" || k === "1" || k === "!")) action = () => $("copiar").click();
    else if (e.ctrlKey && !e.altKey && ["=", "+", "-"].includes(k)) action = () => ui.setScreenSize(k === "-" ? -1 : 1);
    else if (k === "escape" && !$("setModal").hidden) action = () => ui.settings(false);
    else {
      const binding = ui.shortcuts[comboOf(e)];
      if (binding && !document.querySelector('.modal:not(.v2-settings):not([hidden])') && $("setModal").hidden && pal.hidden) action = ui.actions[binding].run;
    }
    if (action) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) action(); }
  }, true);
})();

/* Document PiP: espelho local do caso ativo, aberto somente por gesto. */
(() => {
  "use strict";
  const ui = window.tutuV2;
  let pip = null, opening = false, observer = null;
  const open = ui.button("◱", () => ui.openHUD(), {
    id: "hudOpen", title: "Janelinha sobre o PACS · Ctrl+Shift+J",
    "aria-label": "Janelinha sobre o PACS", "aria-pressed": "false"
  });
  $("copiar").after(open);

  function section() {
    const r = sheetRange;
    if (!r || !sheet.contains(r.startContainer)) return "Folha do laudo";
    let name = "Folha do laudo";
    for (const block of sheet.querySelectorAll("p, div, li")) {
      if (r.comparePoint(block, 0) > 0) break;
      const text = block.textContent.trim();
      if (/^(informações clínicas|técnica(?: de exame)?|achados(?: adicionais)?|conclusão)\s*:?$/i.test(text)) name = text.replace(/:$/, "");
    }
    return name;
  }
  function pending() {
    // Alertas locais + sugestões ainda acionáveis no mesmo painel Revisar.
    const suggestions = [...$("reviewBody").querySelectorAll("button")].filter(b =>
      !b.disabled && !b.hidden && /^aplicar(?: sugestão)?$/i.test(b.textContent.trim()));
    return computeAlerts().length + suggestions.length;
  }
  const put = (id, text) => {
    const node = pip.document.getElementById(id);
    if (node.textContent !== text) node.textContent = text;
  };
  ui.updateHUD = () => {
    if (!pip || pip.closed) return;
    const active = $("caseTabs").querySelector('[aria-selected="true"]');
    const name = active?.querySelector("span")?.textContent || shortName(current);
    put("hudExam", name);
    pip.document.getElementById("hudExam").title = active?.title || name;
    put("hudSection", section());
    put("hudInterim", ui.voiceState?.caseId === ui.activeId() && ui.voiceState.interim || "Aguardando frase…");
    put("hudPending", "Revisar · " + pending());
    pip.document.getElementById("hudCopy").disabled = $("copiar").disabled;
    pip.document.body.classList.toggle("sepia-night", document.body.classList.contains("sepia-night"));
  };
  function fallback(message) {
    if (!ui.app.classList.contains("compact")) ui.compact();
    setStatus(message);
    $("hudNotice")?.remove();
    const notice = ui.el("span", { id: "hudNotice", role: "status" }, message);
    open.after(notice);
  }
  ui.openHUD = async () => {
    if (pip && !pip.closed) { pip.focus(); return; }
    if (opening) return;
    if (!window.documentPictureInPicture?.requestWindow) {
      fallback("Janelinha indisponível; modo compacto ativado (Ctrl+Shift+L)."); return;
    }
    opening = true;
    try {
      pip = await window.documentPictureInPicture.requestWindow({ width: 320, height: 180 });
      const opened = pip;
      pip.addEventListener("pagehide", () => {
        if (pip !== opened) return;
        observer?.disconnect(); observer = null; pip = null;
        document.removeEventListener("selectionchange", ui.updateHUD);
        open.setAttribute("aria-pressed", "false");
      }, { once: true });
      $("hudNotice")?.remove();
      const doc = pip.document;
      doc.title = "Laudos · sobre o PACS"; doc.documentElement.lang = "pt-BR";
      // Só CSS local já carregado; não busca fontes ou estilos externos.
      for (const sheet of document.styleSheets) {
        try { doc.head.append(ui.el("style", {}, [...sheet.cssRules].map(r => r.cssText).join("\n"))); }
        catch (_) { /* Fontes remotas podem impedir a leitura de cssRules. */ }
      }
      doc.body.className = "tutu-v2 v2-hud";
      const card = ui.el("main", { id: "hudCard", "aria-label": "Laudo ativo" });
      const header = ui.el("header", { class: "hud-header" });
      header.append(ui.el("span", { class: "hud-brand" }, "Laudos"), ui.el("strong", { id: "hudExam" }));
      const footer = ui.el("footer", { class: "hud-footer" });
      footer.append(ui.el("span", { id: "hudPending", role: "status" }),
        ui.button("Copiar laudo", () => $("copiar").click(), { id: "hudCopy" }));
      card.append(header, ui.el("div", { id: "hudSection" }),
        ui.el("p", { id: "hudInterim", role: "status", "aria-live": "polite" }), footer);
      doc.body.replaceChildren(card);
      open.setAttribute("aria-pressed", "true");
      observer = new MutationObserver(ui.updateHUD);
      for (const node of [$("caseTabs"), ui.panels.Revisar, sheet])
        observer.observe(node, { childList: true, subtree: true, characterData: true, attributes: true });
      observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      observer.observe($("copiar"), { attributes: true, attributeFilter: ["disabled"] });
      document.addEventListener("selectionchange", ui.updateHUD);
      ui.updateHUD();
    } catch (_) {
      if (pip && !pip.closed) pip.close();
      fallback("Não foi possível abrir a janelinha; modo compacto ativado (Ctrl+Shift+L).");
    } finally { opening = false; }
  };
})();

/* Volume local: mesma detecção/cálculo da calculadora, sem reconstruir a folha. */
(() => {
  "use strict";
  function detect(text, closedOnly = false) {
    const edits = [];
    const sentences = /[\s\S]*?(?:[.!?](?!\d)|\n|$)/g;
    let sentence;
    while ((sentence = sentences.exec(text)) && sentence[0]) {
      const part = sentence[0];
      if (closedOnly && !/[.!?\n]$/.test(part)) continue;
      if (/\bvol(?:ume)?\b|cm\s*(?:³|\^3|3)|\bml\b/i.test(part)) continue;
      let from = 0;
      for (const triple of findTriples(part)) {
        const start = part.indexOf(triple.trecho, from);
        if (start < 0) continue;
        const end = start + triple.trecho.length;
        from = end;
        // Não interpretar um pedaço de uma sequência de quatro dimensões.
        if (/(?:\d\s*(?:x|×|por)\s*|[\d,])$/i.test(part.slice(0, start)) ||
            /^\s*(?:x|×|por)\s*\d/i.test(part.slice(end))) continue;
        // volStr é adaptativo; br é o mesmo formatador, com a precisão pedida na v2.
        const value = triple.vol >= 1 && triple.vol < 10 ? volStr(triple.vol) : br(triple.vol, 1);
        edits.push({ at: sentence.index + end, text: ", com volume estimado de " + value + " cm³" });
      }
    }
    return edits;
  }
  // Exportação permite testar a função pura com as funções originais em Node/VM.
  if (typeof module !== "undefined" && module.exports) { module.exports = { detect }; return; }
  const ui = window.tutuV2;
  ui.volume = { detect, cancel: () => clearTimeout(timer) };
  let timer = null, applying = false, composing = false;
  const enabled = () => store.get("v2AutoVolume") !== "0";
  const label = ui.el("label");
  const checkbox = ui.el("input", { type: "checkbox", id: "autoVolume" });
  checkbox.checked = enabled();
  label.append(checkbox, document.createTextNode(" Volume automático (3 dimensões)"));
  document.querySelector(".v2-settings-extras").append(label);
  function toggle(on) {
    clearTimeout(timer); store.set("v2AutoVolume", on ? "1" : "0"); checkbox.checked = on;
  }
  checkbox.onchange = () => toggle(checkbox.checked);
  ui.actions.volume = { label: "Volume automático: ligar/desligar", run: () => toggle(!enabled()) };

  function snapshot() {
    let text = "", syntheticEnd = false;
    const nodes = [];
    function walk(node) {
      if (node.nodeType === 3) {
        nodes.push({ node, start: text.length, end: text.length + node.length });
        if (node.length) { text += node.data; syntheticEnd = false; }
      } else if (node.nodeType === 1 && !node.matches('del.rm, [contenteditable="false"]')) {
        if (node.tagName === "BR") { text += "\n"; syntheticEnd = false; }
        else {
          for (const child of node.childNodes) walk(child);
          if (node !== sheet && /^(P|DIV|LI)$/.test(node.tagName)) { text += "\n"; syntheticEnd = true; }
        }
      }
    }
    walk(sheet);
    // Só remove o separador criado pelo coletor, preservando quebras reais do texto/BR.
    if (syntheticEnd) text = text.slice(0, -1);
    return { text, nodes };
  }
  function apply(closedOnly, caseId, html) {
    timer = null;
    if (!enabled() || composing || applying || !ui.initialized || ui.activeId() !== caseId ||
        sheet.innerHTML !== html || sheet.contentEditable === "false" || genBusy || corrBusy ||
        document.activeElement !== sheet) return;
    const state = snapshot();
    const edits = detect(state.text, closedOnly);
    if (!edits.length) return;
    const selection = getSelection();
    let saved = selection.rangeCount && sheet.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
    applying = true;
    try {
      clearTimeout(editVerTimer); pushVersion("Antes do volume automático");
      for (const edit of edits.reverse()) {
        const point = state.nodes.find(n => edit.at > n.start && edit.at <= n.end);
        if (!point) continue;
        const r = document.createRange(); r.setStart(point.node, edit.at - point.start); r.collapse(true);
        const atCaret = saved?.collapsed && saved.compareBoundaryPoints(Range.START_TO_START, r) === 0;
        selection.removeAllRanges(); selection.addRange(r);
        // insertText participa do undo nativo (Ctrl+Z), preservando HTML e marcações.
        if (!document.execCommand("insertText", false, edit.text)) break;
        if (atCaret) saved = selection.getRangeAt(0).cloneRange();
      }
      clearTimeout(editVerTimer); pushVersion("Volume automático");
      if (saved) { selection.removeAllRanges(); selection.addRange(saved); sheetRange = saved.cloneRange(); }
      updateCount(); updVolHint(); renderAlerts(); scheduleCaseSave(); ui.updateOutline();
    } finally { applying = false; }
  }
  function schedule(closedOnly, delay) {
    clearTimeout(timer);
    const id = ui.activeId(), html = sheet.innerHTML;
    timer = setTimeout(() => apply(closedOnly, id, html), delay);
  }
  sheet.addEventListener("compositionstart", () => { composing = true; clearTimeout(timer); });
  sheet.addEventListener("compositionend", () => { composing = false; schedule(false, 1500); });
  sheet.addEventListener("input", e => {
    if (applying) return;
    clearTimeout(timer);
    if (!enabled() || composing || e.isComposing || /^history/.test(e.inputType || "")) return;
    // Mesmo evento para teclado e extensão; só frases encerradas são elegíveis imediatamente.
    const id = ui.activeId(), html = sheet.innerHTML;
    timer = setTimeout(() => {
      if (id !== ui.activeId() || sheet.innerHTML !== html) return;
      apply(true, id, html);
      // Depois da passagem imediata, considera a frase ainda sem pontuação.
      schedule(false, 1500);
    }, 0);
  });
  // Cancela a pausa antes de desfazer; não reaplica volume em resposta ao próprio undo.
  window.addEventListener("keydown", e => {
    if (e.key === "F9" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z")) clearTimeout(timer);
  }, true);
})();

/* V3a: vocabulário automático (itens 7 e 25), substituições aprendidas (10) e correção que vira regra (23).
   Entrega à extensão, dentro do #voiceConfig: ngramas, vocabFreq, substituicoes. Sem IA, tudo local.
   Dados no db, coleção "config" (já entra no backup): config/subst-v3 (regras) e config/vocab-v3 (cache). */
(() => {
  "use strict";
  const VERSAO = 1, MAX_BI = 4000, MAX_TRI = 2000, MAX_VOC = 3000;
  const DOC_REGRAS = "config/subst-v3", DOC_CACHE = "config/vocab-v3";
  const VZ = {
    regras: [], pend: {}, bloq: [], hist: [],
    base: { bi: {}, tri: {}, vf: {} }, cop: { bi: {}, tri: {}, vf: {} }, porExame: {}, sig: "",
    extra: "", pronto: false
  };
  let fila = Promise.resolve();
  const enfileira = fn => (fila = fila.then(fn, fn).catch(() => {}));
  const foldS = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const dbp = async () => { for (let i = 0; i < 200; i++){ if (typeof db !== "undefined" && db) return db; await new Promise(r => setTimeout(r, 50)); } return null; };
  const ocioso = fn => new Promise(res => { const run = () => { try{ res(fn()); }catch(e){ res(null); } }; if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 2500 }); else setTimeout(run, 50); });
  const cede = () => new Promise(r => setTimeout(r, 0));

  /* ---------- texto -> segmentos de palavras (sem datas, números, nomes próprios, linhas de identificação) ---------- */
  function segmentos(texto){
    const out = [];
    const t = String(texto || "").replace(/<\/?[bui]>/gi, "").replace(/\{[^}]*\}/g, "\n").replace(/\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}/g, "\n");
    for (const linha of t.split(/\n+/)){
      if (/^\s*(paciente|nome|acesso|prontu[aá]rio|data de nascimento|d\.?n\.?\b|m[eé]dico|crm|solicitante)\b/i.test(linha)) continue;
      for (const frase of linha.split(/[.;:!?()\[\]"]+/)){
        let seg = [], nome = false;
        const fecha = () => { if (seg.length) out.push(seg); seg = []; };
        for (const tok of frase.split(/[^\p{L}\p{N}-]+/u)){
          if (!tok) continue;
          if (/\d/.test(tok)){ fecha(); continue; }
          const w = tok.replace(/^-+|-+$/g, ""); if (!w) continue;
          const inicial = /^\p{Lu}/u.test(w) && /\p{Ll}/u.test(w);
          if (inicial && (seg.length || nome)){ fecha(); nome = true; continue; }   // maiúscula no meio da frase: nome próprio (e os nomes seguintes)
          nome = false;
          seg.push(w.toLowerCase());
        }
        fecha();
      }
    }
    return out;
  }
  const soma = (m, k, n = 1) => { m[k] = (m[k] || 0) + n; };
  function conta(texto, alvo){
    for (const s of segmentos(texto)){
      for (let i = 0; i < s.length; i++){
        if (s[i].length >= 3) soma(alvo.vf, s[i]);
        if (i + 1 < s.length) soma(alvo.bi, s[i] + " " + s[i + 1]);
        if (i + 2 < s.length) soma(alvo.tri, s[i] + " " + s[i + 1] + " " + s[i + 2]);
      }
    }
  }
  const topo = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
  const podar = (alvo, bi, tri, vf) => { alvo.bi = Object.fromEntries(topo(alvo.bi, bi)); alvo.tri = Object.fromEntries(topo(alvo.tri, tri)); alvo.vf = Object.fromEntries(topo(alvo.vf, vf)); };
  const vazio = () => ({ bi: {}, tri: {}, vf: {} });

  /* ---------- string extra do voiceConfig ---------- */
  function montaExtra(){
    const ng = {};
    const un = (a, b) => { const m = { ...a }; for (const k in b) m[k] = (m[k] || 0) + b[k]; return m; };
    for (const [k, v] of topo(un(VZ.base.bi, VZ.cop.bi), MAX_BI)) ng[k] = v;
    for (const [k, v] of topo(un(VZ.base.tri, VZ.cop.tri), MAX_TRI)) ng[k] = v;
    // termos que o médico corrigiu (campo "para") entram com frequência alta: viram vocabulário na hora (junção "sub galeal" -> "subgaleal", fonética)
    const usr = new Map();
    try{ for (const c of correcoes) for (const w of String(c.para || "").toLowerCase().split(/[^a-zà-úç-]+/)) if (w.length >= 5 && /\p{L}/u.test(w)) usr.set(w.replace(/^-+|-+$/g, ""), 99); }catch(e){}
    const vf = topo(un(VZ.base.vf, VZ.cop.vf), MAX_VOC).filter(([w]) => !usr.has(w)).map(([w, n]) => [w, n]).concat([...usr].map(([w, n]) => [w, n]));
    const sub = VZ.regras.map(r => ({ de: r.de, para: r.para, ...(r.exame ? { exame: r.exame } : {}) }));
    VZ.extra = JSON.stringify({ ngramas: ng, vocabFreq: vf, substituicoes: sub }).slice(1, -1);
  }
  montaExtra();
  const publicaOriginal = publishVoice;
  publishVoice = function(){
    publicaOriginal.apply(this, arguments);
    try{
      const assUsr = correcoes.map(c => c.para).join("|");
      if (assUsr !== VZ.assUsr){ VZ.assUsr = assUsr; montaExtra(); }   // correção nova ou apagada: refaz o vocabulário já
      const el = $("voiceConfig"), t = el.textContent;
      // exameAtual: a extensão aplica as substituições com escopo só no exame aberto
      const ex = (typeof current !== "undefined" && current && current.id) ? current.id : null;
      if (t && t.endsWith("}") && !/"ngramas"\s*:/.test(t.slice(0, 40))) el.textContent = t.slice(0, -1) + "," + VZ.extra + ',"exameAtual":' + JSON.stringify(ex) + "}";
    }catch(e){}
  };
  const republica = () => { montaExtra(); try{ publishVoice(); }catch(e){} };

  /* ---------- vocabulário: cálculo único (adiado) + incremental ---------- */
  const examesTexto = () => { try{ return EXAMS.map(e => [e.id, stripTags(maskOf(e))]); }catch(e){ return []; } };
  const assinatura = () => { try{ return VERSAO + "|" + BANK.length + "|" + examesTexto().reduce((n, x) => n + x[1].length, 0); }catch(e){ return String(VERSAO); } };
  async function salvaCache(){
    const d = await dbp(); if (!d) return;
    try{ await d.doc(DOC_CACHE).set({ versao: VERSAO, sig: VZ.sig, base: VZ.base, cop: VZ.cop, porExame: VZ.porExame, em: new Date().toISOString() }); }catch(e){}
  }
  async function recalcula(){
    const d = await dbp();
    const base = vazio(), por = {};
    const add = async (lista, alvoExame) => {
      for (let i = 0; i < lista.length; i++){
        conta(lista[i][1], base);
        if (alvoExame && lista[i][0]){ const p = por[lista[i][0]] || (por[lista[i][0]] = vazio()); conta(lista[i][1], p); }
        if (i % 250 === 249) await cede();
      }
    };
    await add(BANK.map(e => [null, String(e[1]) + ". " + String(e[3])]), false);
    await add(examesTexto(), true);
    try{
      const ex = d ? await d.collection("exemplos").get() : { docs: [] };
      await add(ex.docs.flatMap(x => (x.data().laudos || []).map(t => [x.id, t])), true);
      const hi = d ? await d.collection("historico").get() : { docs: [] };
      await add(hi.docs.flatMap(x => (x.data().itens || []).map(i => [i.exameId, i.texto])), true);
    }catch(e){}
    podar(base, MAX_BI * 2, MAX_TRI * 2, MAX_VOC * 2);
    const porExame = {}; for (const id in por) porExame[id] = topo(por[id].vf, 200).map(x => x[0]);
    VZ.base = base; VZ.cop = vazio(); VZ.porExame = porExame; VZ.sig = assinatura();
    await salvaCache();
  }
  async function carregaVocab(){
    const d = await dbp();
    let c = null;
    try{ const s = d && await d.doc(DOC_CACHE).get(); c = s && s.exists ? s.data() : null; }catch(e){}
    if (c && c.versao === VERSAO && c.sig === assinatura()){ VZ.base = c.base || vazio(); VZ.cop = c.cop || vazio(); VZ.porExame = c.porExame || {}; VZ.sig = c.sig; }
    else await ocioso(() => 0).then(() => recalcula());
    VZ.pronto = true; republica();
  }
  /* laudo copiado: soma ao vocabulário sem recalcular tudo */
  function addLaudo(texto, exameId){
    return enfileira(async () => {
      conta(texto, VZ.cop);
      podar(VZ.cop, MAX_BI, MAX_TRI, MAX_VOC);
      const id = exameId || (typeof current !== "undefined" && current ? current.id : null);
      if (id){ const p = vazio(); conta(texto, p); const ja = VZ.porExame[id] || []; const m = {}; ja.forEach((w, i) => m[w] = 1000 - i); for (const w in p.vf) m[w] = (m[w] || 0) + 1000; VZ.porExame[id] = topo(m, 200).map(x => x[0]); }
      republica(); await salvaCache();
    });
  }
  const learnOriginal = typeof learnFromEdit === "function" ? learnFromEdit : null;
  if (learnOriginal) learnFromEdit = function(plain){ try{ addLaudo(plain); }catch(e){} return learnOriginal.apply(this, arguments); };

  /* ---------- substituições aprendidas ---------- */
  // regra nunca mexe em lado, negação ou número (espelha regraInsegura de extensao/texto-v2.js)
  const TABU = /(^|[^a-z])(direit[oa]s?|esquerd[oa]s?|bilatera(l|is)|lateral|ambos|ambas|nao|nem|sem|ausenc?i?a|ausentes?|inexistente|nenhum[a]?|nega|negam|negativ[oa]|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|mil|meio|meia)(?![a-z])/;
  const regraInsegura = (de, para) => /\d/.test(de + para) || TABU.test(foldS(de + " " + para));
  const AVISO_INSEGURA = "Regra não criada: mexe em lado/negação/número";
  const chave = (de, exame) => foldS(de).trim() + "|" + (exame || "");
  const salvaRegras = async () => {
    const d = await dbp(); if (!d) return;
    try{ await d.doc(DOC_REGRAS).set({ versao: VERSAO, regras: VZ.regras, pend: VZ.pend, bloq: VZ.bloq, hist: VZ.hist }); }catch(e){}
  };
  const nomeExame = id => { try{ const e = EXAMS.find(x => x.id === id); return e ? shortName(e) : id; }catch(e){ return id; } };
  const criarRegra = (de, para, exame, auto) => enfileira(() => criarRegraI(de, para, exame, auto)).then(() => true);
  async function criarRegraI(de, para, exame, auto){
    de = String(de || "").trim(); para = String(para || "").trim(); exame = exame || "";
    if (!de || !para || foldS(de) === foldS(para)) return false;
    if (regraInsegura(de, para)) { aviso(AVISO_INSEGURA); return false; }
    {
      const k = chave(de, exame);
      VZ.regras = VZ.regras.filter(r => chave(r.de, r.exame) !== k);
      VZ.regras.push({ de, para, ...(exame ? { exame } : {}), auto: !!auto, criadoEm: new Date().toISOString() });
      VZ.hist = VZ.hist.filter(h => h !== k).concat(k);
      delete VZ.pend[foldS(de) + ">" + foldS(para)];
      desenha(); republica(); await salvaRegras();
    }
    return true;
  }
  function apagarRegra(k, bloqueia){
    return enfileira(async () => {
      const r = VZ.regras.find(x => chave(x.de, x.exame) === k); if (!r) return;
      VZ.regras = VZ.regras.filter(x => x !== r); VZ.hist = VZ.hist.filter(h => h !== k);
      const pk = foldS(r.de) + ">" + foldS(r.para);
      delete VZ.pend[pk];
      if (bloqueia && !VZ.bloq.includes(pk)) VZ.bloq.push(pk);   // regra automática desfeita não volta sozinha
      desenha(); republica(); await salvaRegras();
    });
  }
  const desfazerUltima = () => { const k = VZ.hist[VZ.hist.length - 1]; if (!k) return Promise.resolve(false); return apagarRegra(k, true).then(() => true); };

  /* correção feita pelo médico: 1ª vez sugere, 3ª vez igual cria sozinha */
  const registrar = (de, para, exame) => enfileira(() => registrarI(de, para, exame));
  async function registrarI(de, para, exame){
    de = String(de || "").trim(); para = String(para || "").trim(); exame = exame || "";
    if (!de || !para || foldS(de) === foldS(para)) return "ignorada";
    if (regraInsegura(de, para)) { aviso(AVISO_INSEGURA); return "ignorada"; }
    const pk = foldS(de) + ">" + foldS(para);
    const existe = VZ.regras.some(r => foldS(r.de).trim() === foldS(de).trim() && foldS(r.para) === foldS(para) && (!r.exame || r.exame === exame));
    if (existe || VZ.bloq.includes(pk)) return "ignorada";
    const p = VZ.pend[pk] || (VZ.pend[pk] = { de, para, n: 0, por: {} });
    p.n++; p.por[exame] = (p.por[exame] || 0) + 1;
    if (p.n >= 3){
      const exs = Object.keys(p.por).filter(Boolean);
      await criarRegraI(de, para, p.por[""] || exs.length > 1 ? "" : exs[0] || "", true);
      aviso(`Regra criada: "${de}" → "${para}".`);
      return "auto";
    }
    sugere(de, para, exame);
    await salvaRegras();
    return "pendente";
  }
  document.addEventListener("laudos-correcao", e => {
    let d; try{ d = JSON.parse(e.detail); }catch(err){ return; }
    const exame = (d && d.exame) || (typeof current !== "undefined" && current ? current.id : "");
    registrar(d && d.de, d && d.para, exame);
  });

  /* ---------- interface pequena ---------- */
  const css = document.createElement("style");
  css.textContent = `#v3Sugestao{position:fixed;left:16px;bottom:56px;z-index:60;max-width:min(440px,calc(100vw - 32px));background:var(--paper,#fffaf0);color:var(--ink,#2b2118);border:1px solid var(--line,#c9b999);border-radius:8px;padding:8px 10px;box-shadow:0 4px 18px rgba(0,0,0,.18);font-size:13px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
#v3Sugestao[hidden]{display:none}#v3Sugestao button,#v3Subst button{font:inherit;font-size:12px;cursor:pointer}
#v3Subst{margin:10px 0}#v3Subst ul{list-style:none;margin:4px 0;padding:0}#v3Subst li{display:flex;gap:8px;align-items:center;padding:2px 0;font-size:13px}
#v3Subst li .k{font-weight:600}#v3Subst li .esc{opacity:.7;font-size:12px}#v3Subst li.empty{opacity:.7}`;
  document.head.append(css);
  const sug = document.createElement("div"); sug.id = "v3Sugestao"; sug.hidden = true; sug.setAttribute("role", "status");
  document.body.append(sug);
  let sugT = null;
  function fechaSug(){ sug.hidden = true; clearTimeout(sugT); }
  function aviso(t){ sug.textContent = t; sug.hidden = false; clearTimeout(sugT); sugT = setTimeout(fechaSug, 6000); }
  function sugere(de, para, exame){
    sug.textContent = "";
    const t = document.createElement("span"); t.textContent = `Sempre trocar "${de}" por "${para}"?`; sug.append(t);
    const b = (rotulo, fn) => { const x = document.createElement("button"); x.type = "button"; x.className = "btn small"; x.textContent = rotulo; x.onclick = () => { fn(); fechaSug(); }; sug.append(x); };
    if (exame) b("Neste exame", () => criarRegra(de, para, exame, false));
    b("Em todos", () => criarRegra(de, para, "", false));
    b("Agora não", () => {});
    sug.hidden = false; clearTimeout(sugT); sugT = setTimeout(fechaSug, 15000);
  }
  const caixa = document.createElement("div"); caixa.id = "v3Subst";
  caixa.innerHTML = `<span class="label">Substituições aprendidas</span>
<p class="voz-help" style="margin:2px 0">Trocas que o ditado aplica sozinho. Nascem de correções suas: sugestão na 1ª vez, automática na 3ª igual.</p>
<ul id="v3SubstList"></ul><div class="bar"><button class="btn small" id="v3Desfaz" type="button">Desfazer a última</button><span class="voz-msg" id="v3SubstMsg" role="status"></span></div>`;
  function desenha(){
    const ul = $("v3SubstList"); if (!ul) return;
    ul.textContent = "";
    if (!VZ.regras.length){ const li = document.createElement("li"); li.className = "empty"; li.textContent = "Nenhuma substituição ainda."; ul.append(li); }
    VZ.regras.forEach(r => {
      const li = document.createElement("li");
      const k = document.createElement("span"); k.className = "k"; k.textContent = r.de;
      const p = document.createElement("span"); p.textContent = "→ " + r.para;
      const e = document.createElement("span"); e.className = "esc"; e.textContent = (r.exame ? nomeExame(r.exame) : "todos os exames") + (r.auto ? " · automática" : "");
      const x = document.createElement("button"); x.type = "button"; x.className = "btn small"; x.textContent = "Apagar"; x.setAttribute("aria-label", "Apagar substituição " + r.de);
      x.onclick = () => apagarRegra(chave(r.de, r.exame), r.auto);
      li.append(k, p, e, x); ul.append(li);
    });
    $("v3Desfaz").disabled = !VZ.hist.length;
  }
  try{
    const corpo = document.querySelector("#setModal .calc-body");
    const antes = $("legacyTools");
    if (corpo) corpo.insertBefore(caixa, antes && antes.parentNode === corpo ? antes : null);
    $("v3Desfaz").onclick = async () => { const ok = await desfazerUltima(); $("v3SubstMsg").textContent = ok ? "Última substituição desfeita." : "Nada para desfazer."; };
    desenha();
  }catch(e){}

  /* ---------- início ---------- */
  async function carregaRegras(){
    const d = await dbp();
    try{
      const s = d && await d.doc(DOC_REGRAS).get();
      const v = s && s.exists ? s.data() : null;
      if (v){ VZ.regras = Array.isArray(v.regras) ? v.regras : []; VZ.pend = v.pend && typeof v.pend === "object" ? v.pend : {}; VZ.bloq = Array.isArray(v.bloq) ? v.bloq : []; VZ.hist = Array.isArray(v.hist) ? v.hist : []; }
    }catch(e){}
    desenha(); republica();
  }
  const ready = (async () => { await carregaRegras(); await new Promise(r => setTimeout(r, 300)); await carregaVocab(); await fila; })();
  window.tutuVocab = {
    ready, whenIdle: () => fila, addLaudo, criarRegra, desfazerUltima, registrar,
    apagar: (de, exame) => apagarRegra(chave(de, exame), false),
    regras: () => VZ.regras.map(r => ({ ...r })), porExame: id => (VZ.porExame[id] || []).slice(),
    recalcula: () => enfileira(async () => { await recalcula(); republica(); })
  };
})();

/* Voz na página (lote V3b): estado do microfone, provisório, baixa confiança, alerta de lado/negação/medida,
   campos de autotexto, treino ampliado com conjunto reservado e painel "minha voz melhorou?".
   Escuta os eventos da extensão (laudos-mic, laudos-provisorio, laudos-final); não altera o texto do laudo,
   salvo no botão "voltar ao original". Sem IA, sem rede. */
(() => {
  "use strict";
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  /* ---------- funções puras: alerta de lado, negação e medida ---------- */
  const obj = o => Object.assign(Object.create(null), o);
  const LADOS = obj({ direito: "D", direita: "D", direitos: "D", direitas: "D", esquerdo: "E", esquerda: "E", esquerdos: "E", esquerdas: "E",
    bilateral: "B", bilaterais: "B", bilateralmente: "B" });
  const NEGS = new Set(["nao", "sem", "ausencia", "ausente", "ausentes", "nenhum", "nenhuma"]);
  const NUM = obj({ zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11,
    doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
    quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100 });
  const UNID = obj({ mm: "mm", milimetro: "mm", milimetros: "mm", cm: "cm", centimetro: "cm", centimetros: "cm", ml: "ml", mililitro: "ml", mililitros: "ml",
    uh: "uh", hu: "uh" });
  const isDigits = t => /^\d/.test(t);
  // Lê "valor" (dígitos ou número por extenso, com "e" e "vírgula"); devolve {valor, usados} ou null.
  function lerNumero(tk, i) {
    let val, n = 1;
    if (isDigits(tk[i])) val = parseFloat(tk[i].replace(",", "."));
    else if (tk[i] in NUM) {
      // "um/uma" só é número com vírgula ou unidade ("uma vírgula cinco", "um cm"); senão é artigo.
      if (NUM[tk[i]] === 1 && tk[i + 1] !== "virgula" && !UNID[tk[i + 1]]) return null;
      val = NUM[tk[i]];
      if (val >= 20 && val < 100 && tk[i + 1] === "e" && tk[i + 2] in NUM && NUM[tk[i + 2]] > 0 && NUM[tk[i + 2]] < 10) { val += NUM[tk[i + 2]]; n = 3; }
    } else return null;
    if (tk[i + n] === "virgula" && tk[i + n + 1] !== undefined && (isDigits(tk[i + n + 1]) || tk[i + n + 1] in NUM)) {
      const dec = isDigits(tk[i + n + 1]) ? tk[i + n + 1].replace(/\D.*$/, "") : String(NUM[tk[i + n + 1]]);
      val = parseFloat(String(val) + "." + dec); n += 2;
    }
    return { valor: val, usados: n };
  }
  function medidas(texto) {
    const tk = norm(texto).match(/\d+(?:[.,]\d+)?|[a-z]+/g) || [], out = [];
    for (let i = 0; i < tk.length;) {
      const r = lerNumero(tk, i);
      if (!r) { i++; continue; }
      i += r.usados;
      const un = UNID[tk[i]] || "";
      if (un) i++;
      out.push({ k: String(r.valor) + un, w: String(r.valor).replace(".", ",") + (un ? " " + un : "") });
    }
    return out;
  }
  const lados = t => (norm(t).match(/[a-z]+/g) || []).filter(w => w in LADOS).map(w => ({ k: LADOS[w], w }));
  const negs = t => (norm(t).match(/[a-z]+/g) || []).filter(w => NEGS.has(w)).map(w => ({ k: "neg", w }));
  function dif(a, b) {
    const bag = new Map(); for (const x of a) bag.set(x.k, (bag.get(x.k) || 0) + 1);
    const added = [];
    for (const x of b) { if (bag.get(x.k) > 0) bag.set(x.k, bag.get(x.k) - 1); else added.push(x.w); }
    const used = new Map(); for (const x of b) used.set(x.k, (used.get(x.k) || 0) + 1);
    const removed = [];
    for (const x of a) { if (used.get(x.k) > 0) used.set(x.k, used.get(x.k) - 1); else removed.push(x.w); }
    return { removed, added };
  }
  // Compara o texto final com o original reconhecido; devolve [{tipo, de, para}] (vazio = nada a avisar).
  function riscos(texto, original) {
    if (!texto || !original || norm(texto).trim() === norm(original).trim()) return [];
    const out = [];
    for (const [tipo, fn] of [["lado", lados], ["negação", negs], ["medida", medidas]]) {
      const d = dif(fn(original), fn(texto));
      if (d.removed.length || d.added.length) out.push({ tipo, de: d.removed.join(", "), para: d.added.join(", ") });
    }
    return out;
  }

  /* ---------- estatística semanal (item 24) ---------- */
  function semanaKey(d = new Date()) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), dia = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dia);
    const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
    return y + "-S" + String(w).padStart(2, "0");
  }
  const taxa = w => (w && w.palavras > 0 ? (w.correcoes || 0) / w.palavras * 100 : null);
  function serie(semanas, n = 8) {
    return Object.keys(semanas || {}).sort().slice(-n).map(k => ({ semana: k, palavras: semanas[k].palavras || 0, correcoes: semanas[k].correcoes || 0, taxa: taxa(semanas[k]) }));
  }
  function veredito(pts) {
    const v = pts.filter(p => p.taxa !== null && p.palavras >= 100);
    if (v.length < 2) return "Ainda poucos dados: dite alguns laudos com a extensão ligada (mínimo de 100 palavras em 2 semanas).";
    const a = v[0].taxa, b = v[v.length - 1].taxa;
    if (b < a * 0.9) return `Melhorou: de ${a.toFixed(1).replace(".", ",")} para ${b.toFixed(1).replace(".", ",")} correções por 100 palavras.`;
    if (b > a * 1.1) return `Mais correções que antes: de ${a.toFixed(1).replace(".", ",")} para ${b.toFixed(1).replace(".", ",")} por 100 palavras.`;
    return `Estável: cerca de ${b.toFixed(1).replace(".", ",")} correções por 100 palavras.`;
  }

  if (typeof module !== "undefined" && module.exports) { module.exports = { riscos, medidas, semanaKey, taxa, serie, veredito }; return; }
  const ui = window.tutuV2;
  const parse = e => { try { return typeof e.detail === "string" ? JSON.parse(e.detail) : (e.detail || null); } catch (_) { return null; } };
  const el = ui.el;
  const pill = document.getElementById("voicePill");

  const style = el("style", { id: "v3VozStyle" });
  style.textContent = `
    #v3Pilha { position:fixed; bottom:104px; left:50%; transform:translateX(-50%); width:max-content; max-width:min(560px,calc(100vw - 24px)); display:flex; flex-direction:column; align-items:center; gap:6px; z-index:8; pointer-events:none; }
    body:has(#tutuApp.compact) #v3Pilha { left:auto; right:14px; transform:none; max-width:410px; align-items:flex-end; }
    #v3Provisorio { margin:0; padding:4px 12px; border-radius:12px; background:var(--panel); border:1px dashed var(--line); color:var(--muted); font-style:italic; font-size:12.5px; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #v3Aviso { pointer-events:auto; box-sizing:border-box; padding:7px 10px; border-radius:12px; background:var(--p-yellow); border:1px solid var(--line); color:var(--text); font-size:12px; max-width:100%; display:flex; flex-wrap:wrap; gap:6px 10px; align-items:center; box-shadow:0 4px 14px #0002; }
    #v3Aviso b { font-weight:600; } #v3Aviso q { font-style:normal; }
    #v3Aviso .v3-trecho { flex-basis:100%; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #v3Nivel { width:38px; height:6px; border-radius:3px; background:var(--line); overflow:hidden; display:inline-block; }
    #v3Nivel i { display:block; height:100%; width:0; background:var(--ok); }
    #voicePill[data-mic="off"] #v3Nivel, #voicePill:not([data-mic]) #v3Nivel { display:none; }
    #voicePill[data-mic="pausado"] #voiceDot { color:var(--warn); }
    #v3CamposChip { font-size:11px; padding:1px 8px; border-radius:20px; background:var(--p-yellow); }
    ::highlight(v3-baixa) { text-decoration:underline dotted; text-decoration-color:var(--warn,#937122); text-decoration-thickness:1.5px; text-underline-offset:3px; }
    ::highlight(v3-campo) { background-color:var(--p-yellow,#f5e8c4); }
    #v3Painel { margin-top:10px; } #v3Painel summary { cursor:pointer; font-weight:600; }
    #v3Painel svg { width:100%; height:auto; display:block; } #v3Painel .v3-n { font-size:12px; color:var(--muted); margin:4px 0; }
    #v3MedirBtn { margin-left:8px; }`;
  document.head.append(style);

  const pilha = el("div", { id: "v3Pilha" });
  const prov = el("p", { id: "v3Provisorio", "aria-hidden": "true" }); prov.hidden = true;
  const aviso = el("div", { id: "v3Aviso", role: "status" }); aviso.hidden = true;
  pilha.append(prov, aviso);
  document.body.append(pilha);

  /* ---------- data-caso-id no editor ---------- */
  let casoAnterior = "";
  function syncCaso() {
    const id = ui.activeId?.() || "";
    if (id) sheet.setAttribute("data-caso-id", id); else sheet.removeAttribute("data-caso-id");
    if (id !== casoAnterior) { casoAnterior = id; limparBaixas(); esconderAviso(); esconderProv(); }
    pintarCampos();
  }

  /* ---------- estado do microfone ---------- */
  const nivelBox = el("span", { id: "v3Nivel", "aria-hidden": "true" }); nivelBox.append(el("i"));
  $("voiceLabel").after(nivelBox);
  document.addEventListener("laudos-mic", e => {
    const d = parse(e); if (!d) return;
    const rec = !!d.on && !d.paused;
    pill.classList.toggle("recording", rec);
    pill.dataset.mic = !d.on ? "off" : d.paused ? "pausado" : "ligado";
    let txt = !d.on ? "Voz · Alt S" : d.paused ? "Ditado pausado" : "Ditando na folha";
    if (d.aviso) txt += " · " + d.aviso;
    $("voiceLabel").textContent = txt; pill.title = d.aviso || "";
    let n = Number(d.nivel); if (!isFinite(n)) n = 0; if (n > 1) n /= 100;
    nivelBox.firstChild.style.width = Math.round(Math.max(0, Math.min(1, n)) * 100) + "%";
    nivelBox.dataset.nivel = String(Math.round(Math.max(0, Math.min(1, n)) * 100));
    ui.voiceCase = rec ? ui.activeId() : null; ui.renderTabs?.();
    if (!d.on) esconderProv();
  });

  /* ---------- provisório em cinza (item 20) ---------- */
  let provTimer = null;
  function esconderProv() { clearTimeout(provTimer); prov.hidden = true; prov.textContent = ""; if (ui.voiceState) { ui.voiceState.interim = ""; ui.updateHUD?.(); } }
  document.addEventListener("laudos-provisorio", e => {
    const d = parse(e); if (!d) return;
    const texto = String(d.texto || "").trim();
    if (!texto) { esconderProv(); return; }
    const fora = d.destino?.caso && d.destino.caso !== ui.activeId();
    prov.textContent = (fora ? "em outra aba · " : "") + texto; prov.hidden = false;
    ui.voiceState = { caseId: d.destino?.caso || ui.activeId(), interim: texto }; ui.updateHUD?.();
    clearTimeout(provTimer); provTimer = setTimeout(esconderProv, 8000);
  });

  /* ---------- localizar texto na folha ---------- */
  function achar(str) {
    str = String(str || "").trim(); if (!str) return null;
    const full = sheetTextNodes(sheet).map(n => n.nodeValue).join(""), i = full.lastIndexOf(str);
    return i < 0 ? null : { i, r: rangeFromOffsets(sheet, i, i + str.length), str };
  }

  /* ---------- baixa confiança (item 15): CSS Custom Highlight, sem mexer no DOM/texto copiado ---------- */
  let baixas = [];
  const hlOK = typeof Highlight !== "undefined" && !!CSS.highlights;
  function repintarBaixas() { if (hlOK) { if (baixas.length) CSS.highlights.set("v3-baixa", new Highlight(...baixas.map(b => b.r))); else CSS.highlights.delete("v3-baixa"); } }
  function limparBaixas() { baixas = []; repintarBaixas(); }
  function marcarBaixas(texto, palavras) {
    const base = achar(texto); if (!base || !palavras?.length) return false;
    const full = sheetTextNodes(sheet).map(n => n.nodeValue).join(""), alvo = full.slice(base.i, base.i + base.str.length).toLowerCase();
    for (const p of [...new Set(palavras.map(x => String(x).toLowerCase().trim()).filter(Boolean))]) {
      const re = new RegExp("(?<![\\p{L}\\p{N}])" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}\\p{N}])", "gu");
      let m; while ((m = re.exec(alvo))) {
        const r = rangeFromOffsets(sheet, base.i + m.index, base.i + m.index + p.length);
        if (r) baixas.push({ r, w: p });
      }
    }
    repintarBaixas(); return true;
  }
  ui.voz3 = {
    riscos, medidas, semanaKey, serie, veredito,
    destaques: () => baixas.map(b => b.r.toString()),
    avisoAtivo: () => !aviso.hidden
  };
  // Some ao editar (a palavra mudou) e ao clicar nela.
  sheet.addEventListener("input", () => {
    const antes = baixas.length;
    baixas = baixas.filter(b => !b.r.collapsed && b.r.toString().toLowerCase() === b.w);
    if (baixas.length !== antes) repintarBaixas();
  });
  sheet.addEventListener("click", () => {
    const s = getSelection(); if (!baixas.length || !s.rangeCount) return;
    const rg = s.getRangeAt(0), antes = baixas.length;
    baixas = baixas.filter(b => { try { return !(rg.compareBoundaryPoints(Range.END_TO_START, b.r) <= 0 && rg.compareBoundaryPoints(Range.START_TO_END, b.r) >= 0); } catch (_) { return true; } });
    if (baixas.length !== antes) repintarBaixas();
  });

  /* ---------- alerta de lado/negação/medida e voltar ao original (item 16) ---------- */
  function esconderAviso() { clearTimeout(avisoTimer); aviso.hidden = true; aviso.replaceChildren(); }
  let avisoTimer = null;
  function mostrarAviso(lista, texto, original) {
    aviso.replaceChildren();
    aviso.append(el("b", {}, "Conferir:"));
    for (const r of lista) {
      const s = el("span"); s.append(document.createTextNode(r.tipo + " "));
      if (r.de) { s.append(el("q", {}, "“" + r.de + "”")); s.append(document.createTextNode(r.para ? " → " : " removido")); }
      else s.append(document.createTextNode("acrescentado "));
      if (r.para) s.append(el("q", {}, "“" + r.para + "”"));
      aviso.append(s);
    }
    aviso.append(el("span", { class: "v3-trecho" }, "Trecho: " + texto.trim()));
    aviso.append(ui.button("Voltar ao original", () => voltar(texto, original), { id: "v3Voltar" }),
      ui.button("Manter", esconderAviso, { id: "v3Manter" }));
    aviso.hidden = false; clearTimeout(avisoTimer); avisoTimer = setTimeout(esconderAviso, 25000);
  }
  function voltar(texto, original) {
    const f = achar(texto);
    if (!f || !f.r) { esconderAviso(); setStatus("Trecho não encontrado na folha; nada foi alterado."); return; }
    try { clearTimeout(editVerTimer); pushVersion("Antes de voltar ao original"); } catch (_) {}
    limparBaixas();
    sheet.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(f.r);
    document.execCommand("insertText", false, String(original).trim());
    try { clearTimeout(editVerTimer); pushVersion("Voltou ao original"); } catch (_) {}
    esconderAviso(); setStatus("Trecho voltou ao texto original reconhecido.", "ok");
  }

  /* ---------- estatística de uso (item 24) ---------- */
  let usoCache = null, pend = { palavras: 0, correcoes: 0 }, flushTimer = null, fila = Promise.resolve();
  const dbx = () => window.tutuSite?.db;
  function somar(palavras, correcoes) {
    pend.palavras += palavras; pend.correcoes += correcoes;
    clearTimeout(flushTimer); flushTimer = setTimeout(gravarUso, 1500);
  }
  function gravarUso() {
    const p = pend; pend = { palavras: 0, correcoes: 0 };
    if (!p.palavras && !p.correcoes || !dbx()) return fila;
    fila = fila.catch(() => {}).then(async () => {
      const ref = dbx().doc("treino/uso"), snap = await ref.get();
      const semanas = snap.exists && snap.data().semanas ? { ...snap.data().semanas } : {}, k = semanaKey();
      const w = semanas[k] || { palavras: 0, correcoes: 0 };
      semanas[k] = { palavras: w.palavras + p.palavras, correcoes: w.correcoes + p.correcoes };
      for (const old of Object.keys(semanas).sort().slice(0, -52)) delete semanas[old];
      await ref.set({ semanas });
    }).catch(() => {});
    return fila;
  }
  ui.voz3.gravar = gravarUso;
  document.addEventListener("laudos-correcao", () => somar(0, 1));

  document.addEventListener("laudos-final", e => {
    const d = parse(e); if (!d) return;
    esconderProv();
    const texto = String(d.texto || ""), original = String(d.original || "");
    somar(texto.split(/\s+/).filter(Boolean).length, 0);
    const alvoCaso = d.destino?.caso;
    if (alvoCaso && alvoCaso !== ui.activeId()) {
      const lista = riscos(texto, original);
      if (lista.length) { mostrarAviso(lista, "(em outra aba) " + texto, original); aviso.querySelector("#v3Voltar").hidden = true; }
      return;
    }
    const lista = riscos(texto, original);
    const tentar = (n) => {
      const ok = d.baixas?.length ? marcarBaixas(texto, d.baixas) : true;
      if (!ok && n < 3) setTimeout(() => tentar(n + 1), 120 * (n + 1));
    };
    tentar(0);
    if (lista.length) mostrarAviso(lista, texto, original); else esconderAviso();
  });

  /* ---------- campos de autotexto [___] (item 19) ---------- */
  // Tab e F2 já avançam (nextField, 50-interface.js); aqui: Shift+Tab volta, campos ficam destacados e contados.
  // O campo fica selecionado: a próxima fala (ou digitação) o substitui.
  const campoRe = () => new RegExp(FIELD_RE.source, "g");
  function prevField() {
    const t = sheetTextNodes(sheet).map(n => n.nodeValue).join(""), re = campoRe(), all = [];
    let m; while ((m = re.exec(t))) all.push(m);
    if (!all.length) return false;
    const s = getSelection(), rg = s.rangeCount && sheet.contains(s.anchorNode) ? s.getRangeAt(0) : sheetRange;
    const from = rg && sheet.contains(rg.startContainer) ? offsetOf(sheet, rg.startContainer, rg.startOffset) : t.length;
    const hit = [...all].reverse().find(x => x.index + x[0].length <= from) || all[all.length - 1];
    const r = rangeFromOffsets(sheet, hit.index, hit.index + hit[0].length); if (!r) return false;
    sheet.focus({ preventScroll: true }); s.removeAllRanges(); s.addRange(r); return true;
  }
  sheet.addEventListener("keydown", e => {
    if (e.key === "Tab" && e.shiftKey && !e.ctrlKey && !e.altKey && prevField()) e.preventDefault();
  });
  ui.actions.anterior = { label: "Campo anterior", run: () => prevField() };
  const chip = el("span", { id: "v3CamposChip" }); chip.hidden = true; pill.append(chip);
  let pintando = false;
  function pintarCampos() {
    if (pintando) return; pintando = true;
    requestAnimationFrame(() => {
      pintando = false;
      const t = sheetTextNodes(sheet).map(n => n.nodeValue).join(""), re = campoRe(), rs = [];
      let m; while ((m = re.exec(t))) { const r = rangeFromOffsets(sheet, m.index, m.index + m[0].length); if (r) rs.push(r); }
      if (hlOK) { if (rs.length) CSS.highlights.set("v3-campo", new Highlight(...rs)); else CSS.highlights.delete("v3-campo"); }
      chip.hidden = !rs.length; chip.textContent = rs.length + (rs.length === 1 ? " campo · Tab" : " campos · Tab");
      ui.voz3.campos = rs.length;
    });
  }
  new MutationObserver(pintarCampos).observe(sheet, { childList: true, subtree: true, characterData: true });
  ui.voz3.pintarCampos = pintarCampos;

  /* ---------- treino ampliado + conjunto reservado (item 22) ---------- */
  const h32 = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; };
  const reservada = t => h32(t) % 5 === 0;
  const RESERVA = TRAIN_SENTS.filter(reservada).slice(0, 100);
  const EXTRAS = (() => {
    const base = new Set(TRAIN_SENTS), seen = new Set(), out = [];
    for (const e of BANK) for (const s of String(e[3]).split(/(?<=[.])\s+|\n/)) {
      const t = s.trim().replace(/\s+/g, " "), w = t.split(" ");
      if (w.length < 4 || w.length > 30 || /[\[\]{}_<>]|\d{3,}/.test(t) || base.has(t) || seen.has(t) || reservada(t)) continue;
      seen.add(t); out.push(t);
      if (out.length >= 3000) return out;
    }
    return out;
  })();
  const trainShuffleOrig = trainShuffle;
  trainShuffle = () => {
    const usadas = trainUsadas(), lista = trainShuffleOrig().filter(t => !reservada(t));
    const mais = EXTRAS.filter(t => !lista.includes(t)).sort((a, b) => (usadas.has(hashText(a)) - usadas.has(hashText(b))) || (Math.random() - 0.5));
    return lista.concat(mais.slice(0, Math.max(0, 40 - lista.length)));
  };
  ui.voz3.treino = { reserva: RESERVA.length, extras: EXTRAS.length, reservada };
  let medindo = false;
  const autoOrig = trainAutoLearn, saveOrig = saveTrainStats;
  trainAutoLearn = b => (medindo ? Promise.resolve() : autoOrig(b));
  saveTrainStats = () => (medindo ? salvarMedicao() : saveOrig());
  async function salvarMedicao() {
    if (!dbx() || !trainWords.tot) return;
    try {
      const ref = dbx().doc("treino/medicoes"), snap = await ref.get();
      const itens = snap.exists && Array.isArray(snap.data().itens) ? snap.data().itens.slice(-99) : [];
      itens.push({ data: new Date().toISOString(), palavras: trainWords.tot, acerto: Math.round(trainWords.ok / trainWords.tot * 100) });
      await ref.set({ itens });
      $("trainProg").textContent = `Medição concluída · acerto ${itens[itens.length - 1].acerto}% em ${trainWords.tot} palavras (não gerou correções)`;
      if (painel.open) desenharPainel();
    } catch (_) {}
  }
  function medir() {
    medindo = true;
    trainQueue = [...RESERVA].sort(() => Math.random() - 0.5).slice(0, 12);
    trainIdx = 0; trainFound = new Map(); trainWords = { ok: 0, tot: 0 }; trainDone = new Set();
    $("trainResult").hidden = true; trainShow();
    $("trainProg").textContent = "MEDIÇÃO (frases reservadas) · " + $("trainProg").textContent;
  }
  const medirBtn = ui.button("Medir (frases reservadas)", medir, { id: "v3MedirBtn", title: "Lê frases que nunca entram no treino normal; não cria correções, só mede" });
  $("trainProg").after(medirBtn);
  $("trainEnd").addEventListener("click", () => { if (medindo) $("trainResult").hidden = true; });
  for (const id of ["trainOpen", "trainOpen2"]) $(id).addEventListener("click", () => { medindo = false; });
  new MutationObserver(() => { if ($("trainModal").hidden) medindo = false; }).observe($("trainModal"), { attributes: true, attributeFilter: ["hidden"] });

  /* ---------- painel "minha voz melhorou?" (item 24) ---------- */
  const painel = el("details", { id: "v3Painel" });
  painel.append(el("summary", {}, "Minha voz melhorou?"));
  const corpo = el("div", { id: "v3PainelCorpo" }); painel.append(corpo);
  ui.panels.Aprendido.append(painel);
  const SVGNS = "http://www.w3.org/2000/svg";
  function grafico(pts) {
    const W = 300, H = 110, L = 28, B = 22, T = 10, R = 8, svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("role", "img"); svg.setAttribute("id", "v3Grafico");
    svg.setAttribute("aria-label", "Correções por 100 palavras, por semana");
    const mk = (tag, a, txt) => { const n = document.createElementNS(SVGNS, tag); for (const k in a) n.setAttribute(k, a[k]); if (txt != null) n.textContent = txt; svg.append(n); return n; };
    const vals = pts.map(p => p.taxa ?? 0), max = Math.max(1, ...vals) * 1.15;
    const x = i => L + (pts.length > 1 ? i * (W - L - R) / (pts.length - 1) : (W - L - R) / 2), y = v => T + (1 - v / max) * (H - T - B);
    mk("line", { x1: L, y1: H - B, x2: W - R, y2: H - B, stroke: "currentColor", "stroke-opacity": ".3" });
    mk("line", { x1: L, y1: T, x2: L, y2: H - B, stroke: "currentColor", "stroke-opacity": ".3" });
    mk("text", { x: L - 4, y: T + 4, "text-anchor": "end", "font-size": 9, fill: "currentColor" }, max.toFixed(0));
    mk("text", { x: L - 4, y: H - B, "text-anchor": "end", "font-size": 9, fill: "currentColor" }, "0");
    if (pts.length > 1) mk("polyline", { points: pts.map((p, i) => x(i) + "," + y(p.taxa ?? 0)).join(" "), fill: "none", stroke: "var(--accent)", "stroke-width": 2 });
    pts.forEach((p, i) => {
      mk("circle", { cx: x(i), cy: y(p.taxa ?? 0), r: 3, fill: "var(--accent)" });
      if (i === 0 || i === pts.length - 1) mk("text", { x: x(i), y: H - 8, "text-anchor": i === 0 && pts.length > 1 ? "start" : "end", "font-size": 9, fill: "currentColor" }, p.semana);
    });
    return svg;
  }
  let epocaPainel = 0;
  async function desenharPainel() {
    const minha = ++epocaPainel;
    if (!dbx()) { corpo.replaceChildren(el("p", { class: "v3-n" }, "Banco indisponível.")); return; }
    await gravarUso();
    const [uso, est, med] = await Promise.all(["treino/uso", "treino/estatisticas", "treino/medicoes"].map(p => dbx().doc(p).get().catch(() => ({ exists: false }))));
    if (minha !== epocaPainel) return; // abertura repetida (toggle + ação): vale só a última
    corpo.replaceChildren();
    const pts = serie(uso.exists ? uso.data().semanas : {});
    if (!pts.length) corpo.append(el("p", { class: "v3-n", id: "v3SemDados" }, "Sem ditado registrado ainda."));
    else {
      corpo.append(grafico(pts));
      const ult = pts[pts.length - 1];
      corpo.append(el("p", { class: "v3-n", id: "v3Ultima" }, `${ult.semana}: ${ult.correcoes} correções em ${ult.palavras} palavras` + (ult.taxa !== null ? ` (${ult.taxa.toFixed(1).replace(".", ",")} por 100)` : "")));
    }
    corpo.append(el("p", { id: "v3Veredito" }, veredito(pts)));
    const s = est.exists && Array.isArray(est.data().sessoes) ? est.data().sessoes : [];
    if (s.length) corpo.append(el("p", { class: "v3-n", id: "v3Treino" }, `Treino em leitura: ${s.length} sessões, acerto ${s[0].acerto}% → ${s[s.length - 1].acerto}%.`));
    const m = med.exists && Array.isArray(med.data().itens) ? med.data().itens : [];
    corpo.append(el("p", { class: "v3-n", id: "v3Medicoes" }, m.length
      ? `Medições reservadas: ${m.length}, acerto ${m[0].acerto}% → ${m[m.length - 1].acerto}%.`
      : "Medições reservadas: nenhuma ainda (Treinar minha voz → Medir)."));
  }
  painel.addEventListener("toggle", () => { if (painel.open) desenharPainel(); });
  ui.voz3.painel = desenharPainel;
  ui.actions.minhavoz = { label: "Minha voz melhorou?", run: () => { ui.panel("Aprendido"); painel.open = true; desenharPainel(); } };

  // Por último: depende de todas as variáveis acima já inicializadas.
  new MutationObserver(syncCaso).observe($("caseTabs"), { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
  ui.ready?.then?.(syncCaso);
  syncCaso();
})();

/* Sugestões locais sem IA: continuação de frase (Ctrl+K) e palavras parecidas (painel Corrigir da barra de seleção).
   Os dados vêm dos bancos (BANK_TC/BANK_NT), dos exemplos e dos autotextos do médico. */
(() => {
  "use strict";
  const ui = window.tutuV2, core = TutuV2Core;
  let compIdx = null, compKey = "", wordIdx = null, wordKey = "";
  document.addEventListener("tutu-bancos", () => { compIdx = wordIdx = null; compKey = wordKey = ""; });
  const exampleLines = () => Object.values(examples || {}).flatMap(list => (list || []).flatMap(t => String(t).split("\n")));
  const sig = () => [BANK.length, BANK.length ? BANK[BANK.length - 1][3].length : 0, frases.length, exampleLines().length].join(":");
  function completionIndex() {
    const key = sig();
    if (compIdx && key === compKey) return compIdx;
    const items = [];
    for (const e of BANK) for (const s of String(e[3]).split("\n")) items.push({ s, w: /^Laudos/.test(e[1]) ? 1.2 : 1 });
    for (const f of frases) for (const s of String(f.texto || "").split("\n")) items.push({ s, w: 1.3 });
    for (const s of exampleLines()) items.push({ s, w: 1.5 });
    compKey = key; return (compIdx = core.buildCompletionIndex(items));
  }
  function wordIndex() {
    const key = sig() + ":" + correcoes.length + ":" + dictOk.size;
    if (wordIdx && key === wordKey) return wordIdx;
    const freq = new Map(), add = (text, n = 1) => {
      for (const w of String(text).toLowerCase().match(/\p{L}[\p{L}-]*\p{L}/gu) || []) if (w.length >= 3) freq.set(w, (freq.get(w) || 0) + n);
    };
    for (const e of BANK) add(e[3]);
    for (const e of DEFAULT_EXAMS) add(e.mask);
    for (const f of frases) add(f.texto, 2);
    for (const c of correcoes) add(c.para, 3);
    for (const w of dictOk) add(w, 2);
    wordKey = key; return (wordIdx = core.buildWordIndex([...freq]));
  }
  ui.suggest = text => core.suggestPhrases(text, wordIndex(), 5);
  // Continuações da frase começada quando o cursor está no fim do parágrafo (nunca em títulos).
  ui.continuations = range => {
    const r = range || sheetRange;
    if (!r || !r.collapsed || !sheet.contains(r.startContainer)) return [];
    let block = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    while (block && block.parentElement !== sheet) block = block.parentElement;
    if (!block) return [];
    const rest = document.createRange(); rest.selectNodeContents(block); rest.setStart(r.startContainer, r.startOffset);
    if (rest.toString().trim()) return [];
    const head = document.createRange(); head.selectNodeContents(block); head.setEnd(r.startContainer, r.startOffset);
    const text = head.toString().replace(/ /g, " ");
    if (isHeading(text.trim())) return [];
    return core.completeSentence(core.lastSentence(text), completionIndex(), 3);
  };
})();

/* Configurações › Importar laudos: texto colado ou arquivo (.md/.txt/.html) exportado do Notion "Notas Tomografia".
   Extrai só as frases (sem dados de paciente) com extractNotasTomografia e mescla no banco local (IndexedDB). Sem IA. */
(() => {
  "use strict";
  const ui = window.tutuV2, host = document.querySelector(".v2-settings-extras");
  if (!host) return;
  const el = ui.el;
  const wrap = el("section", { id: "importLaudos" });
  const text = el("textarea", { id: "importText", class: "field", rows: "4", placeholder: "Cole aqui o texto dos laudos…", "aria-label": "Texto dos laudos para importar" });
  const file = el("input", { id: "importFile", type: "file", accept: ".md,.txt,.html,.htm,text/*", "aria-label": "Arquivo de laudos (.md, .txt, .html)" });
  const msg = el("span", { id: "importMsg", class: "voz-msg", role: "status" });
  const say = (t, err) => { msg.textContent = t; msg.style.color = err ? "var(--crit)" : ""; };
  async function importar(raw) {
    const converted = TutuV2Core.laudosToNotion(raw);
    const found = converted ? extractNotasTomografia(converted) : { entries: [], laudos: 0 };
    if (!found.entries.length) { say("Não encontrei laudos com técnica, achados ou conclusão nesse texto. Nada foi alterado.", true); return; }
    const merged = tutuSite.mergeBank(BANK.filter(e => /^Laudos/.test(e[1])), found.entries);
    if (!merged.added) { say(`Nenhuma frase nova: as ${merged.dup} frases desses ${found.laudos} laudos já estavam no banco.`); return; }
    const laudos = (NT_INFO.laudos || 0) + found.laudos, data = brDate(Date.now());
    replaceNT(merged.entries);
    NT_INFO = { laudos, data, fonte: "db" }; showNtInfo();
    await tutuSite.saveBankNT(merged.entries, { laudos, data, iso: new Date().toISOString() });
    say(`Entraram ${merged.added} frases novas de ${found.laudos} laudos (${merged.dup} já existiam). Sugestões e Ctrl+K já usam; o vocabulário de voz atualiza ao recarregar a página.`);
  }
  const go = el("button", { id: "importGo", type: "button" }, "Importar laudos");
  go.onclick = async () => {
    const raw = text.value;
    if (!raw.trim()) { say("Cole o texto ou escolha um arquivo.", true); return; }
    go.disabled = true; say("Importando…");
    try { await importar(raw); text.value = ""; } catch (e) { say("Não foi possível importar: " + e.message, true); } finally { go.disabled = false; }
  };
  file.onchange = async () => {
    const f = file.files[0]; file.value = "";
    if (!f) return;
    try { text.value = await f.text(); say(`Arquivo "${f.name}" carregado (${text.value.length} caracteres). Clique em Importar laudos.`); }
    catch (e) { say("Não foi possível ler o arquivo: " + e.message, true); }
  };
  wrap.append(el("h2", {}, "Importar laudos"),
    el("p", { class: "meta" }, "Cole o texto ou escolha o arquivo (.md, .txt, .html) exportado do Notion (Notas Tomografia). Entram só as frases de técnica, achados e conclusão; datas viram {data} e números de prontuário saem. Fica apenas neste computador."),
    text, file, go, msg);
  host.append(wrap);
})();

/* Sincronização entre PCs pelo repositório privado arturaragao/laudos-tutu-dados (API REST do GitHub, sem servidor).
   dados/<coleção>.json = {versao:1, docs:{id:{data, atualizado, apagado}}}. Mescla por id: o `atualizado` mais recente vence;
   apagado = tombstone. Escritas locais deixam um carimbo (00-plataforma.js) e entram numa fila no IndexedDB que sobrevive
   a fechar a página e a ficar offline. A chave do GitHub vem de Configurações ou da extensão (chrome.storage.sync).
   Bancos de frases: bancos/*.json do mesmo repo (cache local; só baixa o que mudou). Nada de paciente: só o que o app já guarda. */
(() => {
  "use strict";
  const T = window.tutuSite, S = T.sync, G = T.gh, ui = window.tutuV2, el = ui.el;
  const num = (v, d) => Number.isFinite(window[v]) ? window[v] : d;   // TUTU_SYNC_MS / TUTU_PULL_MS: só para testes
  const DEBOUNCE = () => num("TUTU_SYNC_MS", 5000), PULL = () => num("TUTU_PULL_MS", 300000);
  const TOMB_MS = 180 * 864e5, TENTATIVAS = 5;
  const stable = v => JSON.stringify(v, (k, x) => x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : x);
  const hora = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };

  /* ---------- indicador no topo (largura fixa; "sincronizando" só aparece se demorar) ---------- */
  const TEXTO = { ok: "sincronizado ✓", sync: "sincronizando…", offline: "offline", semchave: "sem chave", erro: "erro de sincronia" };
  const ind = el("span", { id: "syncState", role: "status", "data-state": "semchave" }, TEXTO.semchave);
  document.getElementById("saveState")?.before(ind);
  let estado = "semchave", showTimer = 0, ultima = "";
  function setEstado(s, detalhe) {
    estado = s; clearTimeout(showTimer);
    const mostrar = () => { ind.dataset.state = s; ind.textContent = TEXTO[s]; ind.title = detalhe || (ultima ? "Última sincronização: " + hora(ultima) : ""); info(); };
    if (s === "sync") showTimer = setTimeout(mostrar, 600); else mostrar();
  }

  /* ---------- fila ---------- */
  const dirty = new Set(), ver = {};
  let inicial = false, carregou = false, timer = 0, rodando = false, religar = false, pendPull = false, falhas = 0, ultimoPull = 0;
  const persistir = () => S.kvSet("_sync/fila", [...dirty]).catch(() => {});
  S.onChange(col => { dirty.add(col); ver[col] = (ver[col] || 0) + 1; persistir(); agenda(DEBOUNCE(), false); });
  function agenda(ms, pull) {
    pendPull = pendPull || pull; clearTimeout(timer);
    timer = setTimeout(rodar, ms);
  }
  async function rodar() {
    if (rodando) { religar = true; return; }
    rodando = true;
    const pull = pendPull; pendPull = false;
    try { await ciclo(pull); } finally {
      rodando = false;
      if (religar) { religar = false; agenda(0, false); }
    }
    return true;
  }

  /* ---------- um documento-coleção: puxa, mescla nos dois sentidos, envia ---------- */
  async function syncCol(col, shas, mudadas) {
    for (let t = 0; t < TENTATIVAS; t++) {
      const caminho = "dados/" + col + ".json";
      const r = await G.getJson(caminho);
      const rdocs = (r && r.json && r.json.docs) || {};
      const local = await S.listCol(col);
      const out = { ...rdocs }, aplicar = [], carimbar = [];
      let sobe = false;
      for (const id of new Set([...Object.keys(rdocs), ...Object.keys(local)])) {
        const rd = rdocs[id], ld = local[id];
        if (!ld) { aplicar.push({ id, expect: null, data: rd.data, atualizado: rd.atualizado, apagado: !!rd.apagado }); continue; }
        if (!rd) {
          if (ld.atualizado === null) { ld.atualizado = S.nowIso(); carimbar.push({ id, atualizado: ld.atualizado }); }
          out[id] = { data: ld.has ? ld.data : null, atualizado: ld.atualizado, apagado: !ld.has }; sobe = true; continue;
        }
        if (ld.atualizado === null) {   // dado antigo, sem carimbo: igual ao remoto = adota; diferente = o remoto vence e o local fica guardado
          if (!(ld.has && !rd.apagado && stable(ld.data) === stable(rd.data))) await S.kvSet("_perdido/" + col + "/" + id, { data: ld.data, quando: new Date().toISOString() });
          aplicar.push({ id, expect: null, data: rd.data, atualizado: rd.atualizado, apagado: !!rd.apagado });
        } else if (rd.atualizado > ld.atualizado) {
          aplicar.push({ id, expect: ld.atualizado, data: rd.data, atualizado: rd.atualizado, apagado: !!rd.apagado });
        } else if (ld.atualizado > rd.atualizado) {
          out[id] = { data: ld.has ? ld.data : null, atualizado: ld.atualizado, apagado: !ld.has }; sobe = true;
        }
      }
      const ignorados = await S.applyRemote(col, aplicar);
      if (aplicar.length - ignorados > 0) mudadas.add(col);
      if (carimbar.length) await S.setMetas(col, carimbar);
      if (!sobe) { if (r && !ignorados) shas[col] = r.sha; else delete shas[col]; return; }
      const corte = new Date(Date.now() - TOMB_MS).toISOString();
      for (const [id, d] of Object.entries(out)) if (d.apagado && d.atualizado < corte) delete out[id];
      try { shas[col] = await G.putJson(caminho, { versao: 1, docs: out }, r && r.sha, "sync " + col); return; }
      catch (e) { if (!e.conflito) throw e; }   // 409/422: alguém gravou antes; puxa, mescla e tenta de novo
    }
    throw Object.assign(new Error("Conflito persistente em " + col), { status: 409 });
  }

  async function ciclo(pull) {
    if (!G.token) { setEstado("semchave"); return; }
    if (!carregou) {
      for (const c of (await S.kvGet("_sync/fila")) || []) dirty.add(c);
      inicial = !!(await S.kvGet("_sync/inicial")); carregou = true;
    }
    if (navigator.onLine === false) { setEstado("offline"); pendPull = pendPull || pull; return; }
    setEstado("sync");
    const mudadas = new Set(), snap = { ...ver };
    try {
      const shas = (await S.kvGet("_sync/shas")) || {};
      let cols = new Set(inicial ? dirty : S.COLS);
      if (pull) {
        const remoto = Object.fromEntries((await G.list("dados")).map(f => [f.name, f.sha]));
        for (const c of S.COLS) if (remoto[c + ".json"] && remoto[c + ".json"] !== shas[c]) cols.add(c);
      }
      for (const col of cols) {
        const v0 = ver[col] || 0;
        await syncCol(col, shas, mudadas);
        if ((ver[col] || 0) === v0) dirty.delete(col);
      }
      await S.kvSet("_sync/shas", shas);
      if (!inicial) { inicial = true; await S.kvSet("_sync/inicial", true); }
      await persistir();
      if (pull) { ultimoPull = Date.now(); await atualizarBancos(); }
      ultima = new Date().toISOString(); falhas = 0;
      await S.kvSet("_sync/ultima", ultima);
      setEstado("ok");
      if (mudadas.has("config") && !primeiraVez.feito) recarregarSeSeguro();
      primeiraVez.feito = true;
      if (dirty.size) agenda(DEBOUNCE(), false);
    } catch (e) {
      pendPull = pendPull || pull;
      if (e.semChave || e.auth) { setEstado("semchave", e.auth ? "O GitHub recusou a chave. Confira as permissões (Contents e Actions: read/write no repo laudos-tutu-dados)." : ""); return; }
      if (e.offline) { setEstado("offline"); return; }
      falhas++;
      setEstado("erro", e.message);
      agenda(e.limite ? 60000 : Math.min(60000, 5000 * 2 ** falhas), true);
    }
  }
  const primeiraVez = { feito: false };
  function recarregarSeSeguro() {   // config (formato, atalhos, voz) só é lida na abertura: aplica 1 vez, antes de o médico começar
    try { if (sessionStorage.getItem("tutuSyncReload")) return; if (typeof sheetHasContent === "function" && sheetHasContent() && !modelIntact()) return; sessionStorage.setItem("tutuSyncReload", "1"); location.reload(); } catch (_) {}
  }

  /* ---------- bancos ---------- */
  const selo = el("span", { id: "bancoState", class: "v2-banco-selo", role: "status" });
  // 12/11/2026: o selo do banco fica dentro de Configurações › Sincronização (fora da tela principal).
  selo.hidden = true; if (!document.querySelector(".v2-settings-extras")) ui.footerActions.append(selo);
  let seloEpoch = 0;
  async function bancoStatus() {
    const epoch = ++seloEpoch;
    const [idx, erro] = await Promise.all([S.kvGet("_gh/indice"), S.kvGet("_gh/bancosErro")]);
    if (epoch !== seloEpoch) return;
    if (!idx && !erro) { selo.hidden = true; return; }
    const g = await T.lerBancosGh();
    if (epoch !== seloEpoch) return;
    const fontes = [...new Set((idx?.bancos || []).map(b => b.origem).filter(Boolean))].map(v => v === "radio" ? "Radio" : "Notion").join("/") || "Notion";
    const contagens = (idx?.bancos || []).map(b => b.contagem);
    const n = contagens.length && contagens.every(n => Number.isFinite(n) && n >= 0)
      ? contagens.reduce((a, b) => a + b, 0) : (g.tc?.frases.length || 0) + (g.nt?.frases.length || 0);
    const recente = Date.now() - Date.parse(idx?.quando || idx?.atualizado) <= 48 * 36e5;
    selo.hidden = false;
    selo.dataset.state = erro ? "erro" : recente ? "ok" : "antigo";
    selo.textContent = "Banco atualizado em " + (hora(idx?.atualizado).replace(",", "") || "data desconhecida") + " · " + n + " frases · " + fontes;
    selo.title = erro || "Última leitura: " + hora(idx?.quando) + ((idx?.avisos?.length) ? " · " + JSON.stringify(idx.avisos) : "");
  }
  document.addEventListener("tutu-bancos-status", bancoStatus);
  bancoStatus(); setInterval(bancoStatus, 60000);
  async function aplicarBancos() {
    const g = await T.lerBancosGh();
    window.BANK_PARES = g.pares;
    if (!g.tc && !g.nt) { if (g.pares.length) document.dispatchEvent(new CustomEvent("tutu-bancos")); return; }
    const b = (await T.exportBackup()).bancos;
    const tc = T.mergeBank(g.tc ? g.tc.frases : window.BANK_TC, b.bank_tc).entries;
    const nt = T.mergeBank(g.nt ? g.nt.frases : window.BANK_NT, b.bank_nt).entries;
    window.BANK_TC = tc; window.BANK_NT = nt;
    if (g.tc) window.BANK_TC_DATE = T.brData(g.tc.atualizado);
    if (g.nt) window.BANK_NT_META = { laudos: g.nt.frases.filter(e => /Técnica/i.test(e[1])).length, data: T.brData(g.nt.atualizado), iso: g.nt.atualizado };
    window.BANK_GH = { tc: !!g.tc || !!window.BANK_GH?.tc, nt: !!g.nt || !!window.BANK_GH?.nt };
    const all = tc.concat(nt);
    BANK.length = 0; BANK.push(...all);
    BIDX.length = 0; for (const e of all) BIDX.push({ key: fold(e[0] + " " + e[1] + " " + e[2]), body: fold(e[3]) });
    PIDX = null; capBase = null;
    for (const e of all) for (const w of fold(e[3]).split(/[^a-z]+/)) if (w.length >= 3) KNOWN.add(w);
    COMP_IDX.length = 0; COMP_IDX.push(...BANK.map((e, i) => /compara/i.test(e[1] + " " + e[2]) ? i : -1).filter(i => i >= 0).slice(0, 6));
    BANK_GROUPS.length = 0; BANK_GROUPS.push(...new Set(BANK.map(e => e[0])));
    $("bankInfo").textContent = BANK.filter(e => !/^Laudos/.test(e[1])).length + " frases · atualizado em " + T.brData((g.tc || g.nt).atualizado);
    NT_INFO = { laudos: window.BANK_NT_META.laudos, data: window.BANK_NT_META.data, fonte: "db" }; showNtInfo();
    document.dispatchEvent(new CustomEvent("tutu-bancos"));
    await bancoStatus();
  }
  async function atualizarBancos() {
    if (await T.bancosRefresh() || !window.BANK_GH?.tc && (await T.lerBancosGh()).tc) await aplicarBancos();
  }

  /* ---------- Notion: dispara o workflow e acompanha o repositório até os bancos mudarem ---------- */
  let notionRodando = false;
  async function notionAgora() {
    if (!G.token) { say("Cole primeiro a chave do GitHub.", true); return; }
    if (notionRodando) return;
    notionRodando = true; say("Pedindo ao GitHub para atualizar do Notion…");
    try {
      const antes = ((await S.kvGet("_gh/indice")) || {}).atualizado || "";
      await G.dispararNotion();
      const pausa = num("TUTU_NOTION_POLL_MS", 20000);
      for (let i = 0; i < 18; i++) {
        say("Notion pedido; esperando o GitHub terminar…");
        await new Promise(r => setTimeout(r, i === 0 ? Math.min(2000, pausa) : pausa));
        const mudou = await T.bancosRefresh();
        const idx = (await S.kvGet("_gh/indice")) || {};
        if (mudou || (idx.atualizado && idx.atualizado !== antes)) { await aplicarBancos(); say("Notion atualizado em " + hora(new Date()) + "."); info(); return; }
      }
      say("O GitHub ainda não terminou; os bancos novos entram sozinhos na próxima sincronização.");
    } catch (e) { say(e.auth ? "A chave não tem permissão de Actions (read/write) no repo laudos-tutu-dados." : e.offline ? "Sem rede." : "Não foi possível pedir a atualização: " + e.message, true); }
    finally { notionRodando = false; }
  }

  /* ---------- Configurações › Sincronização ---------- */
  const host = document.querySelector(".v2-settings-extras");
  const msg = el("span", { id: "syncMsg", class: "voz-msg", role: "status" }), infoEl = el("p", { id: "syncInfo", class: "meta" });
  const say = (t, err) => { msg.textContent = t; msg.style.color = err ? "var(--crit)" : ""; };
  async function info() {
    const idx = (await S.kvGet("_gh/indice").catch(() => null)) || {};
    infoEl.textContent = (G.token ? "Chave guardada neste computador e na extensão. " : "Sem chave: os dados ficam só neste computador. ") +
      (ultima ? "Última sincronização: " + hora(ultima) + ". " : "") + (idx.quando ? "Bancos conferidos em " + hora(idx.quando) + "." : "");
  }
  if (host) {
    const campo = el("input", { id: "syncToken", type: "password", class: "field", autocomplete: "off", spellcheck: "false", placeholder: "Chave do GitHub (cole aqui)", "aria-label": "Chave do GitHub" });
    const salvar = ui.button("Salvar chave", async () => {
      const v = campo.value.trim();
      if (!v) { say("Cole a chave para salvar.", true); return; }
      await T.setToken(v); campo.value = ""; say("Chave salva. Sincronizando…"); info(); agenda(0, true);
    }, { id: "syncSalvar" });
    const agora = ui.button("Sincronizar agora", () => { agenda(0, true); say("Sincronizando…"); }, { id: "syncAgora" });
    const notion = ui.button("Atualizar do Notion agora", notionAgora, { id: "notionAgora" });
    const link = el("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener noreferrer", id: "syncLink" }, "criar a chave no GitHub");
    const ajuda = el("p", { class: "meta" }, "Seus dados (correções, autotextos, regras, casos, bancos) ficam no repositório privado laudos-tutu-dados e acompanham você em todos os PCs. Para ligar: ");
    ajuda.append(link, document.createTextNode(" (fine-grained token, só o repositório laudos-tutu-dados, permissões Contents e Actions em Read and write) e cole abaixo. Em outro PC com o mesmo perfil do Chrome a chave chega sozinha pela extensão. Nunca vai para o git."));
    const sec = el("section", { id: "syncSec" });
    sec.append(el("h2", {}, "Sincronização entre PCs"), selo, ajuda, campo, salvar, agora, notion, msg, infoEl);
    host.append(sec);
  }
  ui.actions.notion = { label: "Atualizar do Notion agora", run: notionAgora };
  ui.actions.sincronizar = { label: "Sincronizar agora", run: () => agenda(0, true) };
  const antigo = $("ntUpd").onclick;
  $("ntUpd").onclick = ev => G.token ? notionAgora() : antigo?.call($("ntUpd"), ev);
  $("bkFile").closest("label")?.setAttribute("title", "Reserva: a sincronização automática dispensa o backup.");

  /* ---------- gatilhos ---------- */
  T.onChave(() => { info(); agenda(0, true); });
  const puxar = () => { if (Date.now() - ultimoPull > 20000) agenda(0, true); };
  window.addEventListener("focus", puxar);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") puxar(); });
  window.addEventListener("online", () => agenda(500, true));
  window.addEventListener("offline", () => setEstado("offline"));
  setInterval(() => agenda(0, true), PULL());
  window.tutuSync = { agora: () => { agenda(0, true); }, estado: () => estado, notionAgora, aplicarBancos };
  S.kvGet("_sync/ultima").then(v => { ultima = v || ""; }).catch(() => {}).finally(() => { if (!G.token) setEstado("semchave"); agenda(0, true); });
})();

/* Conclusão sugerida enquanto o médico escreve os Achados (sem IA, sem rede).
   Parte 1 (pura, testada em Node): índice dos bancos, casamento por frase, segurança clínica, aprendizado.
   Parte 2 (tela): texto cinza ("ghost") sobreposto FORA da folha, interruptor nas Configurações, aceitar/dispensar.
   O ghost nunca entra na folha (#laudo): não vai para o Copiar laudo, para o caso salvo, para o histórico nem para o desfazer. */
(function (root) {
  "use strict";
  const fold = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const STOP = new Set(("para pela pelo pelas pelos com sem uma umas uns sobre entre como mais menos cerca medindo mede medem aspecto sinais sinal area areas regiao " +
    "terco direito direita esquerdo esquerda bilateral pequena pequeno leve leves discreto discreta dos das nos nas que ele ela seu sua suas seus ate apos durante " +
    "pode podendo apresenta apresentam observa observam nota notam visualiza visualizam tambem alem junto onde quando cada outro outra outros outras ainda sendo " +
    "sido foram esta estao estar seguinte inferior superior medial lateral anterior posterior adjacente adjacentes proximo proxima associado associada " +
    "presente presentes evidente evidentes regular regulares normal normais habitual habituais preservado preservada preservados preservadas").split(" "));
  // radical: tira a vogal/“s” final (bordas/bordos, cólica/cólicos, litíase/litíases) e fica com 7 letras
  const stem = w => (w.length >= 5 ? w.replace(/[aeo]s?$/, "") : w).slice(0, 6);
  // palavras de estilo da conclusão: não contam como conteúdo clínico (comparação com a conclusão existente e com os achados)
  const ESTILO = new Set(["achados", "compativel", "sugerindo", "sugestivo", "inferindo", "aspecto", "imagem", "provavel", "possivel"].map(x => stem(x)));
  const QUALIF = new Set("aguda agudo agudas agudos cronica cronico cronicas cronicos complicada complicado simples tipica tipico tipicos tipicas leve moderada moderado grave nao".split(" "));
  const QUALIF_TOK = new Set([...QUALIF].map(x => stem(x)));
  const IGNORAR_AREA = /^(exames?|acompanhar|geral|laudos?)\b/;
  const IGNORAR_SECAO = /^(exames?|acompanhar|geral|laudos?|tecnica|indicacao|protocolo|comparacao)\b/;
  const NEG = /\b(sem|nao|ausenc\w*|ausente\w*|afast\w*|descart\w*|exclu\w*|negativ\w*|inexistent\w*|nenhum\w*|improvav\w*|dispensa\w*)\b/;
  const NORMAL = /\bnormai?s?\b|\bnormalidade\b|\bpreservad\w*|\bhabituais?\b|\bhabitual\b|\bsem alteraco\w*/;
  const MAX_APRENDIDOS = 400, REJEICOES_BLOQUEIO = 3;

  /* tokens (radicais de 7 letras) sem números, medidas, palavras comuns e palavras curtas */
  function tokens(text) {
    const out = new Set();
    for (const w of fold(text).split(/[^a-z0-9]+/)) {
      if ((w.length < 4 && w !== "rim") || /\d/.test(w) || STOP.has(w)) continue;
      out.add(stem(w));
    }
    return out;
  }
  /* tokens do que a frase afirma: tira as palavras negadas ("sem realce pelo contraste", "ausência de líquido livre") */
  function tokensPositivos(frase) {
    // "não visibilizado/identificado" descreve ausência do órgão (status pós-cirurgia), não nega o que vem depois
    const f = fold(frase).replace(/\bnao(?=\s+(?:se\s+)?(?:visibiliz|identific|individualiz|caracteriz))/g, "nxo"), neg = new Set();
    for (const m of f.matchAll(new RegExp(NEG.source, "g"))) {
      const resto = f.slice(m.index + m[0].length).split(/[,;:.]/)[0].split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
      for (const t of tokens(m[0] + " " + resto)) neg.add(t);
    }
    // "colelitíase afastada": a negação vem depois do termo, vale para as palavras anteriores da oração
    for (const m of f.matchAll(/\b(?:afastad|descartad|excluid|ausent|inexistent)\w*/g)) {
      const antes = f.slice(0, m.index).split(/[,;:.]/).pop().split(/\s+/).filter(Boolean).slice(-4).join(" ");
      for (const t of tokens(antes)) neg.add(t);
    }
    return new Set([...tokens(frase)].filter(t => !neg.has(t)));
  }
  const semEstilo = set => new Set([...set].filter(t => !ESTILO.has(t)));
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const capitalizar = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  /* "Maria Silva, João Souza": linha só de nomes próprios (listas pessoais do banco) */
  function ehListaNomes(linha) {
    const ws = String(linha).split(/[\s,;]+/).filter(Boolean);
    return ws.length >= 2 && ws.every(w => /^\p{Lu}/u.test(w) || /^(de|da|do|dos|das|e)$/i.test(w));
  }

  /* Remove medidas ("de 13 mm", "(10 mm)", "medindo 2,3 x 1,5 cm", "até __ mm"). O Artur não põe medidas na conclusão. */
  const NUM = "(?:\\d+(?:[.,]\\d+)?|_+)";
  const MEDIDA = new RegExp(",?\\s*(?:medindo\\s+)?(?:(?:de|com|até|ate|cerca\\s+de|aproximadamente|em\\s+torno\\s+de)\\s+)*" + NUM + "(?:\\s*[x×]\\s*" + NUM + ")*\\s*(?:mm|cm|ml|cc|hu|uh|%|m)\\b", "gi");
  function limparMedidas(s) {
    let t = String(s).replace(/\s*\([^()]*(?:\d|_{2,})[^()]*\)/g, "").replace(MEDIDA, "");
    return t.replace(/\s+([,.;])/g, "$1").replace(/,\s*([.;])/g, "$1").replace(/\s{2,}/g, " ").trim();
  }

  /* Trechos que dependem do exame anterior ou de datas não servem numa conclusão nova. Devolve o texto limpo ou null (descartar). */
  const COMPARA = /\b(semelhante|similar|inalterad\w*|persist\w*|houve|surgiment\w*|reducao|regress\w*|progress\w*|exames? anteriore?s?|estudos? anteriore?s?|anteriormente|em relacao ao|em comparacao|comparad\w*|comparativ\w*|estavel|estaveis|estabilidade|estudo atual|exame atual|menos evidente|mais evidente|um pouco (?:menos|mais)|evolutiv\w*)\b/;
  function limparComparacao(texto) {
    let t = String(texto).replace(/\s*\([^()]*(?:\{data\}|\banterior|\bcompara|\bsemelhante|\bpersist)[^()]*\)/gi, "")
      .replace(/,?\s*conforme\s+(?:acima\s+)?descrit[oa]s?(?:\s+acima)?/gi, "")
      .replace(/,?\s*(?:sem altera[cç][õo]es significativas|semelhante|similar|inalterad[oa]s?)[^.;]*?(?:exames? anteriore?s?|estudos? anteriore?s?|\{data\})[^.;]*/gi, "")
      .replace(/,?\s*(?:em|na)\s+compara[cç][ãa]o\s+com[^.;]*/gi, "")
      .replace(/,?\s*(?:em\s+)?rela[cç][ãa]o\s+ao\s+exame[^.;]*/gi, "")
      .replace(/\s*\{data\}/gi, "").replace(/\s+([,.;])/g, "$1").replace(/\s{2,}/g, " ").trim();
    t = t.replace(/^[,;\s]+/, "");
    if (COMPARA.test(fold(t)) || /\bexame\b.*\b(de|do)\s*$/i.test(t)) return null;
    if (/^(sem|semelhante|similar)\b/i.test(t) && fold(texto) !== fold(t) ) return null;   // sobrou só a parte dependente da comparação
    return t;
  }

  /* Lado: "D", "E", "B" (ambos/bilateral) ou "" */
  function ladoDe(t) {
    const f = fold(t), d = /\bdireit[oa]s?\b/.test(f), e = /\besquerd[oa]s?\b/.test(f);
    return d && e ? "B" : d ? "D" : e ? "E" : /\bbilatera(?:l|is)\b/.test(f) ? "B" : "";
  }
  function removerLado(t) {
    return String(t).replace(/\s+(?:à|a)\s+(?:direita|esquerda)\b/gi, "").replace(/\s+(?:direit[oa]s?|esquerd[oa]s?|bilatera(?:l|is))\b/gi, "")
      .replace(/\s+([,.;])/g, "$1").replace(/\s{2,}/g, " ").trim();
  }

  /* Termo negado? "sem sinais de apendicite", "não há ... apendicite", "apendicite afastada". Janela = oração até a vírgula anterior. */
  function negadoEm(folded, pos, len) {
    const oracao = folded.slice(0, pos).split(/[,;:]|\bmas\b|\bporem\b|\bentretanto\b/).pop();
    if (NEG.test(oracao)) return true;
    const depois = folded.slice(pos + len, pos + len + 40).split(/[,;:.]/)[0];
    return /^\W*(?:\w+\s+){0,2}(?:afastad|descartad|excluid|ausent|inexistent|improvav)/.test(depois);
  }

  /* ---------- índice ---------- */
  function termosDe(topico, linhas) {
    // tópico sem “(Achado Adicional)” e sem “›”: “Hérnia › Umbilical (Achado Adicional)” -> “hernia umbilical”
    const termos = new Set([fold(topico).replace(/\([^()]*\)/g, " ").replace(/›/g, " ").replace(/\s+/g, " ").trim()]);
    const re = /(?:inferindo|sugerindo|sugestiv[oa]s?|compativ(?:el|eis)|podendo corresponder|correspondendo|representando)[^()]{0,160}\(([^()]{3,70})\)/g;
    for (const l of linhas) {
      const f = fold(l);
      for (const m of f.matchAll(re)) for (const p of m[1].split(/\bou\b|\/|,/)) { const x = p.replace(/\b(provavel|possivel)\b/g, "").trim(); if (x.length >= 4) termos.add(x); }
    }
    return [...termos].filter(Boolean);
  }
  function variantes(termo) {
    const ws = termo.split(/[^a-z0-9]+/).filter(Boolean), sem = ws.filter(w => !QUALIF.has(w));
    const lista = [ws];
    if (sem.length && sem.length < ws.length) lista.push(sem);
    return lista.filter(v => v.join(" ").length >= 5)
      .map(v => new RegExp("\\b" + v.map(escRe).join("\\s+") + "(?:s|es)?\\b", "g"));
  }
  function candidatasDe(linhas, topTok) {
    const curta = l => { const c = limparMedidas(l); return c && !/\d/.test(c) && c.length <= 120 && c.split(/\s+/).length <= 14; };
    if (linhas.length === 1) return curta(linhas[0]) ? [linhas[0]] : [];
    const cands = [];
    for (let i = linhas.length - 1; i >= 0 && curta(linhas[i]); i--) cands.unshift(linhas[i]);
    const fim = cands.length === linhas.length ? [linhas[linhas.length - 1]] : cands;
    // entradas que alternam descrição e conclusão: linha curta que traz a palavra do tópico também é conclusão
    for (const l of linhas) if (!fim.includes(l) && curta(l) && [...tokens(l)].some(t => topTok.has(t))) fim.push(l);
    return fim;
  }
  /* Índice das patologias do banco (BANK_TC): [área, seção, tópico, texto]. Ignora tópico vazio e listas pessoais. */
  function indexar(banco) {
    const entradas = [], df = new Map();
    for (const e of banco || []) {
      if (!Array.isArray(e) || e.length < 4) continue;
      const [area, secao, topico, texto] = e.map(x => String(x == null ? "" : x));
      if (!topico.trim() || !texto.trim()) continue;
      if (IGNORAR_AREA.test(fold(area).trim()) || IGNORAR_SECAO.test(fold(secao).trim())) continue;
      if (/\b(normal|normais|normalidade)\b/.test(fold(topico))) continue;
      const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);
      if (!linhas.length || linhas.filter(ehListaNomes).length * 2 >= linhas.length) continue;
      const termos = termosDe(topico, linhas);
      const topTok = new Set([...tokens(topico.replace(/›/g, " ")), ...termos.flatMap(t => [...tokens(t)])]);
      const cands = candidatasDe(linhas, topTok).filter(l => !ehListaNomes(l));
      const desc = linhas.filter(l => !cands.includes(l) || linhas.length === 1);
      const sets = desc.map(l => tokens(l)).filter(s => s.size >= 3);
      sets.push(topTok);
      const todos = new Set(sets.flatMap(s => [...s]));
      for (const t of todos) df.set(t, (df.get(t) || 0) + 1);
      entradas.push({ chave: fold(area).trim() + "|" + fold(secao).trim() + "|" + fold(topico).trim(), topico: topico.trim(), termos, topTok,
        res: termos.flatMap(variantes), sets, cands });
    }
    const N = entradas.length || 1, idf = new Map();
    for (const [t, n] of df) idf.set(t, Math.log(1 + N / n));
    return { entradas, idf, maxIdf: Math.log(1 + N) };
  }

  /* ---------- casamento de uma frase dos achados com uma patologia ---------- */
  function pontuar(idx, ent, fs, fsPos, folded) {
    let forte = false, vetado = false;
    for (const re of ent.res) {
      re.lastIndex = 0; let m, algum = false, ok = false;
      while ((m = re.exec(folded))) {
        algum = true;
        if (!negadoEm(folded, m.index, m[0].length)) { ok = true; break; }
        if (!m[0].length) re.lastIndex++;
      }
      if (ok) forte = true; else if (algum) vetado = true;
    }
    if (vetado && !forte) return null;                       // termo negado na frase: nunca sugerir
    if (!forte && NORMAL.test(folded)) return null;          // sem termo forte, frase de achado normal nunca sugere
    const alvo = forte ? fs : fsPos;                         // sem termo forte, só vale o que a frase afirma (não o negado)
    const w = t => idx.idf.get(t) || idx.maxIdf;
    let den = 0; for (const t of alvo) den += w(t);
    let melhor = 0, comum = 0;
    for (const L of ent.sets) {
      let s = 0, n = 0;
      for (const t of alvo) if (L.has(t)) { s += w(t); n++; }
      if (s > melhor) { melhor = s; comum = n; }
    }
    const cobre = den ? melhor / den : 0;
    if (forte) return cobre >= 0.3 && comum >= 2 ? { score: 0.6 + 0.4 * cobre, forte } : null;
    return alvo.size >= 4 && comum >= 3 && cobre >= 0.6 ? { score: cobre * 0.8, forte } : null;
  }

  /* Candidata do banco pronta para a conclusão: sem medida, sem lado inventado, sem placeholder. null se não servir. */
  function limparCandidata(linha, ladoAchado) {
    let t = String(linha).replace(/^\s*(?:\d+\s*[.)]|[-•*])\s*/, "").replace(/^\s*conclus[aã]o\s*:\s*/i, "").replace(/\s*\*+\s*$/, "").trim();
    t = limparComparacao(t); if (t == null) return null;
    // classificações (Bosniak I, LI-RADS 4...) são conclusão, não medida: ficam intactas
    const prot = [], guarda = m => { prot.push(m); return "\u0001" + String.fromCharCode(96 + prot.length) + "\u0001"; };
    t = t.replace(/\((?=[^()]*\b(?:bosniak|li-?rads|bi-?rads|ti-?rads|pi-?rads|o-?rads|lung-?rads)\b)(?![^()]*\d\s*(?:mm|cm|ml)\b)[^()]*\)/gi, guarda)
      .replace(/\b(?:bosniak|li-?rads|bi-?rads|ti-?rads|pi-?rads|o-?rads|lung-?rads)\s*(?:iv|iii|ii|i|v|\d)[a-f]?\b/gi, guarda);
    t = limparMedidas(t);
    t = t.replace(/\{([^{}|]*\|[^{}]*)\}/g, (_m, ops) => {
      const alvo = ladoAchado === "D" ? /^direit/ : ladoAchado === "E" ? /^esquerd/ : null;
      const hit = alvo && ops.split("|").map(x => x.trim()).find(x => alvo.test(fold(x)));
      return hit || "\u0000";
    }).replace(/\s*\u0000/g, "");
    if (/[{}]|_{2,}|\d/.test(t)) return null;
    const cl = ladoDe(t);
    if (cl && cl !== ladoAchado) {
      if (ladoAchado) return null;                           // lado contrário ao dos achados
      t = removerLado(t);
      if (ladoDe(t)) return null;
    }
    t = t.replace(/\s+([,.;])/g, "$1").replace(/\s{2,}/g, " ").replace(/[,;\s]+$/, "").replace(/\.+$/, "").trim();
    if (t.length < 5) return null;
    t = t.replace(/\u0001([a-z])\u0001/g, (_m, c) => prot[c.charCodeAt(0) - 97]);
    return capitalizar(t) + ".";
  }
  /* “Apendicite Aguda” -> "Apendicite aguda." (só a 1ª letra maiúscula; siglas mantidas) */
  /* ---------- segurança clínica da frase sugerida ---------- */
  // Termos de gravidade/complicação e de intensidade: só podem aparecer na sugestão se já estiverem no achado.
  const GRAVE = ["encarcer", "estrangul", "complicad", "perfur", "absces", "necros", "isquemi", "obstru", "malign", "neoplas", "metast", "trombo", "dissec",
    "ruptur", "rompid", "hemorrag", "fistul", "gangren", "infart", "carcinom", "tumor", "cancer", "sarcom", "linfoma", "agud"];
  const INTENS = ["discret", "incipient", "leve", "minim", "pequen", "moderad", "acentuad", "important", "significativ", "volumos", "extens", "grave", "sever", "grande"];
  const INT_INI = /^(?:discret[oa]s?|incipientes?|leves?|minim[oa]s?|pequen[oa]s?|moderad[oa]s?|acentuad[oa]s?|importantes?|significativ[oa]s?|volumos[oa]s?|extens[oa]s?|grandes?)\s+/i;
  /* tira a intensidade do começo da frase quando o achado não a diz (“Discreta ateromatose” -> “Ateromatose”); sem `fr`, tira sempre */
  function semIntensidade(frase, fr) {
    let t = String(frase), g = fr == null ? null : fold(fr);
    for (;;) {
      const m = t.match(INT_INI); if (!m) break;
      if (g && g.includes(fold(m[0]).trim().slice(0, 5))) break;
      t = t.slice(m[0].length);
    }
    return capitalizar(t);
  }
  // órgãos/subtipos: a sugestão não pode citar um que o achado não cita (renal ≠ hepático, umbilical ≠ inguinal)
  const ORGAOS = [
    ["renal", /\b(rim|rins|renal|renais|calic\w*|pielic\w*)\b/, "renal", "renal", true],
    ["hepatico", /\b(figado|hepat\w*)\b/, "hepático", "hepática", false],
    ["esplenico", /\b(baco|esplen\w*)\b/, "esplênico", "esplênica", false],
    ["biliar", /\b(vesicula|biliar|biliares|colecist\w*|colelit\w*|coledoc\w*|colang\w*)\b/, "biliar", "biliar", false],
    ["pancreas", /\b(pancre\w*)\b/, "pancreático", "pancreática", false],
    ["pulmao", /\b(pulmon\w*|pulmao|pulmoes|bronq\w*)\b/, "pulmonar", "pulmonar", true],
    ["pleura", /\b(pleur\w*)\b/, "pleural", "pleural", true],
    ["pericardio", /\b(pericard\w*)\b/, "pericárdico", "pericárdica", false],
    ["aorta", /\b(aort\w*|iliac\w*)\b/, "aórtico", "aórtica", false],
    ["prostata", /\b(prostat\w*)\b/, "prostático", "prostática", false],
    ["bexiga", /\b(bexig\w*|vesical|vesicais)\b/, "vesical", "vesical", false],
    ["utero", /\b(uter\w*|endometri\w*|miometri\w*|hister\w*)\b/, "uterino", "uterina", false],
    ["ovario", /\b(ovar\w*|anex\w*)\b/, "ovariano", "ovariana", true],
    ["tireoide", /\b(tireo\w*)\b/, "tireoidiano", "tireoidiana", false],
    ["adrenal", /\b(adrenal|adrenais|suprarrenal\w*|suprarrenais)\b/, "adrenal", "adrenal", true],
    ["colon", /\b(colon|colic\w*|sigmoid\w*|ceco|apendic\w*|reto)\b/, "cólico", "cólica", false],
    ["delgado", /\b(ileo|jejun\w*|duoden\w*|delgad\w*)\b/, "", "", false],
    ["estomago", /\b(gastr\w*|estomag\w*)\b/, "gástrico", "gástrica", false],
    ["h_umbilical", /\bumbilical\b/, "umbilical", "umbilical", false],
    ["h_inguinal", /\b(inguinal|inguinais)\b/, "inguinal", "inguinal", true],
    ["h_hiatal", /\bhiatal\b/, "hiatal", "hiatal", false],
    ["h_epigastrica", /\bepigastric\w*\b/, "epigástrico", "epigástrica", false],
    ["h_femoral", /\b(femoral|femorais)\b/, "femoral", "femoral", true],
    ["h_incisional", /\b(incisional|incisionais)\b/, "incisional", "incisional", false],
    ["coluna", /\b(vertebr\w*|discal|discos?|espond\w*|escolio\w*|lombar|cervical)\b/, "", "", false],
  ];
  const orgaosDe = texto => { const f = fold(texto), out = new Set(); for (const o of ORGAOS) if (o[1].test(f)) out.add(o[0]); return out; };
  const RE_CLASSE = /\b(bosniak|li-?rads|bi-?rads|ti-?rads|pi-?rads|o-?rads|lung-?rads)\s*(iv|iii|ii|i|v|\d)([a-f])?\b/g;
  const ROMANO = { i: "1", ii: "2", iii: "3", iv: "4", v: "5" };
  const classesDe = texto => new Set([...fold(texto).matchAll(RE_CLASSE)].map(m => m[1].replace("-", "") + (ROMANO[m[2]] || m[2]) + (m[3] || "")));
  /* A frase final é segura para este achado? (gravidade, intensidade, órgão/subtipo, classificação, lado) */
  function valida(frase, fr) {
    const f = fold(frase), g = fold(fr);
    const afirma = f.replace(/\b(?:nao|sem)\s+(?:\w+\s*){1,3}/g, " ").split(/[^a-z0-9]+/).filter(Boolean), no = g.split(/[^a-z0-9]+/).filter(Boolean);
    for (const k of GRAVE.concat(INTENS)) {
      if (!afirma.some(w => w.startsWith(k)) || no.some(w => w.startsWith(k))) continue;
      if (k === "agud" && /[a-z]+ite\b|inflamat|infecc/.test(g)) continue;      // “apendicite” já é um processo agudo
      return false;
    }
    const og = orgaosDe(frase), fo = orgaosDe(fr);
    for (const id of og) if (!fo.has(id)) return false;
    const cf = classesDe(fr);
    for (const c of classesDe(frase)) if (!cf.has(c)) return false;
    const lf = ladoDe(frase);
    return !lf || lf === ladoDe(fr);
  }

  /* “Apendicite Aguda” -> “Apendicite aguda.” (só a 1ª letra maiúscula; siglas mantidas). “Hérnia › inguinal” -> “Hérnia inguinal.” */
  function frasePeloTermo(topico) {
    const ws = String(topico).replace(/\s*›\s*/g, " ").split(/\s*[\/(]\s*/)[0].trim().split(/\s+/).filter(Boolean).map(w => /^\p{Lu}{2,}$/u.test(w) ? w : w.toLowerCase());
    return capitalizar(ws.join(" ")) + ".";
  }
  /* Termo genérico (“Cisto.”, “Esteatose.”): completa com o órgão do achado, o lado (órgão par) e a classificação (Bosniak...). */
  function completarTermo(frase, fr) {
    let t = frase.replace(/\.$/, "");
    const ws = t.split(/\s+/);
    if (ws.length <= 2) {
      if (ws.length === 1 && !orgaosDe(t).size) {
        const g = fold(fr); let melhor = null;
        for (const o of ORGAOS) { const m = g.match(o[1]); if (m && o[2] && (!melhor || m.index < melhor.i)) melhor = { o, i: m.index }; }
        if (melhor) {
          const masc = /(?:oma|ema|isma|rama)$/.test(fold(ws[0])) || !/(?:a|ia|ose|ite|ase|ao|dade|gem)$/.test(fold(ws[0]));
          t += " " + (masc ? melhor.o[2] : melhor.o[3]);
        }
      }
      const lado = ladoDe(fr), par = ORGAOS.some(o => o[4] && orgaosDe(t).has(o[0]));
      if (par && lado && !ladoDe(t)) t += lado === "D" ? " à direita" : lado === "E" ? " à esquerda" : " bilateral";
    }
    const cl = String(fr).match(/\b(?:Bosniak|LI-?RADS|BI-?RADS|TI-?RADS|PI-?RADS|O-?RADS|Lung-?RADS)\s*(?:IV|III|II|I|V|\d)[A-F]?\b/i);
    if (cl && !classesDe(t).size) t += " (" + cl[0] + ")";
    return t + ".";
  }
  /* Regra de status cirúrgico: órgão “não visibilizado” + pós-operatório/-ectomia no achado -> “Status pós-...”. */
  const CIRURGIA = [[/\b(vesicula|colecist\w*)\b/, "Status pós-colecistectomia.", "vesicula"], [/\buter\w*|\bhister\w*/, "Status pós-histerectomia.", "utero"],
    [/\b(baco|esplen\w*)\b/, "Status pós-esplenectomia.", "baco"], [/\b(rim|rins)\b/, "Status pós-nefrectomia.", "rim"], [/\bapendic\w*/, "Status pós-apendicectomia.", "apendice"],
    [/\bovar\w*/, "Status pós-ooforectomia.", "ovario"], [/\bprostat\w*/, "Status pós-prostatectomia.", "prostata"], [/\btireo\w*/, "Status pós-tireoidectomia.", "tireoide"]];
  function statusPos(fr) {
    const g = fold(fr);
    if (!/\bnao\s+(?:se\s+)?(?:visibiliz|identific|individualiz|caracteriz|visualiz)\w*|\bausen\w*|\bausente\b/.test(g)) return null;
    if (!/\bpos-?operat\w*|\bstatus\b|\bcirurg\w*|\bressec\w*|\bretirad\w*|\b\w*ectomia\b/.test(g)) return null;
    const c = CIRURGIA.find(x => x[0].test(g));
    return c ? { chave: "cir|" + c[2], topico: c[1], frase: c[1], origem: "regra", score: 0.95, tier: 1 } : null;
  }

  const GENERICOS = new Set("cisto cistos esteatose nodulo nodulos lesao lesoes massa massas calcificacao calcificacoes litiase atrofia hipertrofia ectasia dilatacao espessamento derrame hernia".split(" "));
  function escolherFrase(ent, fs, ladoAchado, fr) {
    const permitidos = new Set([...fs, ...ent.topTok]);
    let melhor = null;
    ent.cands.forEach((c, i) => {
      let limpa = limparCandidata(c, ladoAchado); if (!limpa) return;
      limpa = semIntensidade(limpa, fr);
      const tk = [...semEstilo(tokens(limpa.replace(/\bn[aã]o\s+complicad[oa]s?\b/gi, "")))];
      if (tk.some(t => !permitidos.has(t) && !QUALIF_TOK.has(t))) return;     // termo que não foi dito nem é do tópico
      if (!valida(limpa, fr)) return;
      const expl = tk.length ? tk.filter(t => fs.has(t)).length / tk.length : 0;
      if (!melhor || expl > melhor.expl || (expl === melhor.expl && i > melhor.i)) melhor = { limpa, expl, i };
    });
    if (melhor) return { frase: melhor.limpa, origem: "banco" };
    if (ent.topico.replace(/\s*›\s*/g, " ").split(/\s*[\/(]\s*/)[0].trim().split(/\s+/).length > 4) return null;   // tópico longo não vira conclusão
    const base = frasePeloTermo(ent.topico), tt = [...tokens(base)].filter(t => !QUALIF_TOK.has(t) && !ESTILO.has(t));
    if (tt.length >= 2 && !tt.every(t => fs.has(t))) return null;
    // diagnóstico específico que o achado não menciona (“Tuberculose”) nunca vira conclusão; só termos descritivos genéricos
    if (tt.length === 1 && !fs.has(tt[0]) && !GENERICOS.has(fold(base).split(/\W+/)[0])) return null;          // tópico de várias palavras que o achado não diz: não serve de conclusão
    const f = completarTermo(base, fr);
    return valida(f, fr) ? { frase: f, origem: "topico" } : null;
  }

  /* ---------- semelhança ---------- */
  const palavras = s => new Set(fold(s).split(/[^a-z0-9]+/).filter(w => w.length >= 2));
  function dice(a, b) {
    const A = palavras(a), B = palavras(b); if (!A.size || !B.size) return 0;
    let n = 0; for (const x of A) if (B.has(x)) n++;
    return 2 * n / (A.size + B.size);
  }
  /* a sugestão já está na conclusão? (cobertura de conteúdo clínico, ignora as palavras de estilo) */
  function jaTem(frase, linhas) {
    const a = semEstilo(tokens(frase)); if (!a.size) return false;
    for (const l of linhas || []) {
      const b = semEstilo(tokens(l)); if (!b.size) continue;
      let n = 0; for (const t of a) if (b.has(t)) n++;
      if (n / Math.min(a.size, b.size) >= 0.7) return true;
    }
    return false;
  }
  const semNumero = l => String(l).replace(/^\s*\d+\s*[.)]\s*/, "").trim();

  /* ---------- aprendizado (itens por chave da patologia) ---------- */
  const vazio = () => ({ versao: 1, itens: {} });
  function normalizar(d) {
    const r = vazio();
    if (d && typeof d === "object" && d.itens && typeof d.itens === "object") {
      for (const [k, v] of Object.entries(d.itens)) if (v && typeof v === "object") {
        r.itens[k] = { frase: typeof v.frase === "string" ? v.frase : "", usos: +v.usos || 0, rej: +v.rej || 0, atualizado: String(v.atualizado || "") };
      }
    }
    return r;
  }
  const item = (ap, chave, quando) => ap.itens[chave] || (ap.itens[chave] = { frase: "", usos: 0, rej: 0, atualizado: quando || "" });
  function podar(ap) {
    const ks = Object.keys(ap.itens);
    if (ks.length > MAX_APRENDIDOS) ks.sort((a, b) => String(ap.itens[a].atualizado).localeCompare(String(ap.itens[b].atualizado))).slice(0, ks.length - MAX_APRENDIDOS).forEach(k => delete ap.itens[k]);
  }
  /* A frase aprendida nunca leva medida nem lado (não inventar lado em outro caso). */
  function sanitizarAprendida(f) {
    let t = removerLado(limparMedidas(semNumero(f))).replace(/[,;\s]+$/, "").replace(/\.+$/, "").trim();
    if (t.length < 8 || t.length > 220 || /[{}]|_{2,}|\d/.test(t)) return "";
    return capitalizar(t) + ".";
  }
  function registrarRejeicao(ap, chave, quando) { const it = item(ap, chave, quando); it.rej++; it.atualizado = quando || it.atualizado; podar(ap); return it.rej; }
  function estaBloqueada(ap, chave) { const it = ap && ap.itens && ap.itens[chave]; return !!it && it.rej >= REJEICOES_BLOQUEIO; }
  /* O médico aceitou uma sugestão e depois fechou/copiou o laudo: acha a linha da conclusão mais parecida (>0,5).
     Editada → vira a frase preferida; igual → soma uso. Devolve true se algo mudou. */
  function aprenderDe(ap, aceitas, linhasConclusao, quando) {
    let mudou = false; const usadas = new Set();
    for (const a of aceitas || []) {
      let melhor = -1, ms = 0;
      (linhasConclusao || []).forEach((l, i) => { if (usadas.has(i)) return; const s = dice(semNumero(l), semNumero(a.texto)); if (s > ms) { ms = s; melhor = i; } });
      if (melhor < 0 || ms <= 0.5) continue;
      usadas.add(melhor);
      const linha = semNumero(linhasConclusao[melhor]), it = item(ap, a.chave, quando);
      it.usos++; it.rej = 0; it.atualizado = quando || it.atualizado; mudou = true;
      if (fold(linha).replace(/[^a-z0-9]/g, "") !== fold(semNumero(a.texto)).replace(/[^a-z0-9]/g, "")) {
        const f = sanitizarAprendida(linha); if (f) it.frase = f;
      }
    }
    if (mudou) podar(ap);
    return mudou;
  }
  /* Mescla dois documentos de aprendizado (outro PC): o `atualizado` mais recente vence por chave. */
  function mesclar(a, b) {
    const r = normalizar(a);
    for (const [k, v] of Object.entries(normalizar(b).itens)) if (!r.itens[k] || String(v.atualizado) > String(r.itens[k].atualizado)) r.itens[k] = v;
    return r;
  }

  /* ---------- sugestões ---------- */
  function frases(texto) { return String(texto).split(/(?<=[.;!?])\s+/).map(s => s.trim()).filter(Boolean); }
  /* ---------- pares (achado real do laudo do Artur -> conclusão que ele escreveu): fonte prioritária ---------- */
  const chaveConc = t => fold(t).replace(/[^a-z0-9]+/g, " ").trim();
  /* pares: [região, órgão, achado, conclusão, n]. Descarta o que não serve (normal, comparação, medida que não sai). */
  function indexarPares(pares) {
    const ents = [], df = new Map(), porChave = new Map();
    for (const p of pares || []) {
      if (!Array.isArray(p) || p.length < 4) continue;
      const achado = String(p[2] == null ? "" : p[2]), conc = String(p[3] == null ? "" : p[3]), n = Math.max(1, +p[4] || 1);
      if (!achado.trim() || !conc.trim() || ehListaNomes(conc)) continue;
      const base = limparCandidata(conc, ""); if (!base || NORMAL.test(fold(base))) continue;
      const tk = tokensPositivos(achado), ck = semEstilo(tokens(base));
      if (!tk.size || !ck.size) continue;
      const chave = "par|" + chaveConc(semIntensidade(base)), e = { achado, conc, n, tk, ck, lado: ladoDe(achado), chave };
      ents.push(e);
      const g = porChave.get(chave) || { n: 0, ck: semEstilo(tokens(semIntensidade(base))), ents: [] };
      g.n += n; g.ents.push(e); porChave.set(chave, g);
      for (const t of tk) df.set(t, (df.get(t) || 0) + 1);
    }
    const N = ents.length || 1, idf = new Map();
    for (const [t, c] of df) idf.set(t, Math.log(1 + N / c));
    return { ents, idf, maxIdf: Math.log(1 + N), porChave };
  }
  /* melhor conclusão dos pares para uma frase: acha os pares parecidos, agrupa por conclusão e prefere o grupo mais frequente (soma de n) */
  function melhorPar(ip, fsPos, lado, folded, ap, ignorarBloqueio, fr) {
    if (!ip || !ip.ents.length || !fsPos.size || NORMAL.test(folded)) return null;
    const w = t => ip.idf.get(t) || ip.maxIdf;
    let denF = 0; for (const t of fsPos) denF += w(t);
    const achou = [];
    for (const e of ip.ents) {
      if (lado && e.lado && lado !== e.lado) continue;                    // lado diferente: nunca
      let wi = 0, comum = 0, nucleo = false;
      for (const t of fsPos) if (e.tk.has(t)) { wi += w(t); comum++; if (e.ck.has(t)) nucleo = true; }
      if (comum < Math.min(2, e.tk.size, fsPos.size)) continue;
      let denP = 0; for (const t of e.tk) denP += w(t);
      const cp = wi / denP, cf = wi / denF;
      // com a palavra-núcleo da conclusão na frase basta boa cobertura; sem ela (ex.: "litíases" -> "Colelitíase") a frase precisa ser quase a mesma
      if (nucleo ? (cp < 0.6 || cf < 0.3) : (comum < 3 || cp < 0.65 || cf < 0.55)) continue;
      achou.push({ e, sim: 0.6 * cp + 0.4 * cf });
    }
    const topo = achou.length ? Math.max(...achou.map(x => x.sim)) : 0, grupos = new Map();
    for (const x of achou) {
      if (x.sim < Math.max(0.5, topo - 0.15)) continue;
      const g = grupos.get(x.e.chave) || { chave: x.e.chave, peso: 0, sim: 0, membros: [] };
      g.peso += x.e.n * x.sim; g.sim = Math.max(g.sim, x.sim); g.membros.push(x); grupos.set(x.e.chave, g);
    }
    // conclusões que o próprio achado já cobre por inteiro (ex.: “aorta” + “ilíacas” -> “Ateromatose aorto-ilíaca”), mais específica e mais frequente primeiro
    const cobertos = [];
    for (const [chave, info] of ip.porChave) {
      if (info.ck.size < 2 || info.n < 3 || ![...info.ck].every(t => fsPos.has(t))) continue;
      cobertos.push({ chave, peso: info.n, tam: info.ck.size, sim: 0.5, membros: info.ents.filter(e => !(lado && e.lado && lado !== e.lado)).map(e => ({ e, sim: 0.5 })) });
    }
    cobertos.sort((a, b) => b.tam - a.tam || b.peso - a.peso);
    for (const g of [...cobertos, ...[...grupos.values()].sort((a, b) => b.peso - a.peso || b.sim - a.sim)]) {
      if (!ignorarBloqueio && estaBloqueada(ap, g.chave)) continue;
      let aprendida = ap.itens[g.chave] && ap.itens[g.chave].frase;
      if (aprendida && !valida(aprendida, fr)) aprendida = "";
      let frase = aprendida || null;
      for (const m of g.membros.sort((a, b) => (b.e.lado === lado) - (a.e.lado === lado) || b.sim - a.sim || b.e.n - a.e.n)) {
        if (frase) break;
        const c = limparCandidata(m.e.conc, lado), f = c && semIntensidade(c, fr);
        if (f && valida(f, fr)) frase = f;
      }
      if (!frase) continue;
      return { chave: g.chave, topico: frase, frase, origem: aprendida ? "aprendida" : "pares", score: g.sim, tier: aprendida ? 0 : 1 };
    }
    return null;
  }

  /* ---------- sugestões ---------- */
  function frases(texto) { return String(texto).split(/(?<=[.;!?])\s+/).map(s => s.trim()).filter(Boolean); }
  /* achados: lista de textos (parágrafos). opts: { conclusao: [linhas existentes], aprendido, pares (índice), max, ignorarBloqueio }
     Prioridade por frase: aprendida (edições dele) > pares das Notas Tomografia > Notas TC (idx). */
  function sugerir(idx, achados, opts) {
    opts = opts || {};
    const max = opts.max || 3, ap = opts.aprendido || vazio(), ip = opts.pares || null, melhorPorChave = new Map();
    const temTC = idx && idx.entradas.length;
    if (!temTC && !(ip && ip.ents.length)) return [];
    for (const par of achados || []) for (const fr0 of frases(par)) {
      if (/[{}]/.test(fr0)) continue;
      const fr = limparComparacao(fr0) || fr0;               // “sem alterações em relação ao exame anterior” não é achado normal                         // campo ainda não preenchido
      const fs = tokens(fr); if (!fs.size) continue;
      const folded = fold(fr), lado = ladoDe(fr), fsPos = tokensPositivos(fr), opcoes = [];
      const dePar = melhorPar(ip, fsPos, lado, folded, ap, opts.ignorarBloqueio, fr);
      if (dePar) opcoes.push(dePar);
      const cir = statusPos(fr);
      if (cir && (opts.ignorarBloqueio || !estaBloqueada(ap, cir.chave))) {
        const ja = ap.itens[cir.chave] && ap.itens[cir.chave].frase;
        if (ja && valida(ja, fr)) { cir.frase = ja; cir.origem = "aprendida"; cir.tier = 0; }
        opcoes.push(cir);
      }
      if (temTC && fs.size >= 2) {
        const cand = [];
        for (const ent of idx.entradas) { const r = pontuar(idx, ent, fs, fsPos, folded); if (r) cand.push({ ent, ...r }); }
        cand.sort((a, b) => b.score - a.score);
        for (const pick of cand) {
          if (!opts.ignorarBloqueio && estaBloqueada(ap, pick.ent.chave)) continue;
          const aprendida = ap.itens[pick.ent.chave] && ap.itens[pick.ent.chave].frase;
          const f = aprendida && valida(aprendida, fr) ? { frase: aprendida, origem: "aprendida" } : escolherFrase(pick.ent, fs, lado, fr);
          if (!f) continue;                                  // candidata insegura para este achado: tenta a próxima
          opcoes.push({ chave: pick.ent.chave, topico: pick.ent.topico, frase: f.frase, origem: f.origem, score: pick.score, tier: f.origem === "aprendida" ? 0 : 2 });
          break;
        }
      }
      opcoes.sort((a, b) => a.tier - b.tier || b.score - a.score);
      const o = opcoes[0]; if (!o) continue;
      const ant = melhorPorChave.get(o.chave);
      if (!ant || o.tier < ant.tier || (o.tier === ant.tier && o.score > ant.score)) melhorPorChave.set(o.chave, o);
    }
    const out = [];
    for (const s of [...melhorPorChave.values()].sort((a, b) => a.tier - b.tier || b.score - a.score)) {
      if (jaTem(s.frase, opts.conclusao)) continue;
      if (out.some(o => jaTem(s.frase, [o.frase]))) continue;   // quase repetida de outra sugestão
      out.push(s); if (out.length >= max) break;
    }
    return out;
  }

  const api = { fold, tokens, ehListaNomes, limparMedidas, ladoDe, removerLado, negadoEm, indexar, indexarPares, limparComparacao, valida, semIntensidade, completarTermo, statusPos, limparCandidata, frasePeloTermo, sugerir, jaTem, dice, vazio, normalizar,
    registrarRejeicao, estaBloqueada, aprenderDe, mesclar, sanitizarAprendida, semNumero };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TutuConclusao = api;
})(globalThis);

/* ====================== Tela ====================== */
(() => {
  "use strict";
  if (typeof document === "undefined" || !window.tutuV2 || typeof sheet === "undefined") return;
  const ui = window.tutuV2, C = window.TutuConclusao;
  const CHAVE = "v2SugConc", DOC = "config/conclusao-v6", DEBOUNCE = 300, TECLA = "Ctrl+Enter";
  let ligado = store.get(CHAVE) !== "0", aprendido = C.vazio(), carregadoEm = 0, timer = 0, atual = null;
  let idx = null, idxBanco = null;
  const pend = new Map();           // caso -> sugestões aceitas ainda não conferidas com a conclusão final
  const dispensadas = new Map();    // caso -> Set(chave|frase) dispensadas com Esc

  /* ---------- aprendizado salvo (doc de config, sincronizado com os outros PCs) ---------- */
  async function carregar(forcar) {
    if (!forcar && Date.now() - carregadoEm < 20000) return;
    carregadoEm = Date.now();
    try { const s = await window.tutuSite.db.doc(DOC).get(); if (s && s.exists) aprendido = C.mesclar(s.data(), aprendido); } catch (_) {}
  }
  let gravando = Promise.resolve();
  function salvar() {
    gravando = gravando.catch(() => {}).then(async () => {
      try {
        const d = window.tutuSite.db.doc(DOC), s = await d.get();
        if (s && s.exists) aprendido = C.mesclar(s.data(), aprendido);
        await d.set(aprendido);
      } catch (_) {}
    });
  }
  const agora = () => new Date().toISOString();

  /* ---------- leitura da folha ---------- */
  const indice = () => {
    const banco = window.BANK_TC;
    if (!idx || idxBanco !== banco) { idx = C.indexar(banco); idxBanco = banco; }   // a sincronização troca o array: reindexa
    return idx;
  };
  let ipar = null, iparRef = null;
  const indicePares = () => {
    const b = window.BANK_PARES;
    if (!ipar || iparRef !== b) { ipar = C.indexarPares(b); iparRef = b; }       // idem: reindexa quando a sincronização troca a lista
    return ipar;
  };
  const soNumero = t => /^\s*\d+\s*[.)]?\s*$/.test(t);
  function secaoConclusao() {
    const ps = [...sheet.children], hi = ps.findIndex(p => norm(p.textContent) === "conclusão");
    if (hi < 0) return null;
    let end = hi + 1; while (end < ps.length && !isHeading(ps[end].textContent.trim())) end++;
    const blocos = ps.slice(hi + 1, end), cheios = blocos.filter(b => { const t = b.textContent.trim(); return t && !soNumero(t); });
    const ultimo = cheios[cheios.length - 1] || null, depois = ultimo ? blocos.slice(blocos.indexOf(ultimo) + 1) : blocos;
    const alvo = depois.find(b => soNumero(b.textContent)) || depois.find(b => !b.textContent.trim() && b !== blocos[blocos.length - 1]) || null;
    const nums = cheios.map(b => (b.textContent.trim().match(/^(\d+)\s*[.)]/) || [])[1]).filter(Boolean).map(Number);
    return { heading: ps[hi], blocos, cheios, ultimo, alvo, linhas: cheios.map(b => b.textContent.trim()),
      numeradas: nums.length, maxNum: nums.length ? Math.max(...nums) : 0, temPlaceholder: blocos.some(b => soNumero(b.textContent)) };
  }
  function caretEmAchados() {
    const s = getSelection(); if (!s.rangeCount || !sheet.contains(s.anchorNode)) return false;
    let b = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement;
    while (b && b.parentElement !== sheet) b = b.parentElement;
    if (!b) return false;
    const ps = [...sheet.children];
    for (let i = ps.indexOf(b); i >= 0; i--) if (isHeading(ps[i].textContent.trim())) return ["achados", "achados adicionais"].includes(norm(ps[i].textContent));
    return false;
  }

  /* ---------- ghost (fora da folha) ---------- */
  const ghost = ui.el("div", { id: "ghostConc", role: "note", "aria-label": "Sugestão de conclusão", title: "Clique para inserir na Conclusão" });
  ghost.hidden = true; document.body.append(ghost);
  /* Espaço para o ghost sem tocar no texto: uma regra CSS no <head> (margem na linha de referência) empurra visualmente
     "Achados adicionais" para baixo. Nada é gravado na folha. */
  const espaco = document.head.appendChild(document.createElement("style")); espaco.id = "ghostConcEspaco";
  const aviso = ui.el("button", { type: "button", id: "ghostAviso", title: "Ir até a sugestão" });
  aviso.hidden = true; document.body.append(aviso);
  const esconder = () => { atual = null; ghost.hidden = true; ghost.replaceChildren(); espaco.textContent = ""; aviso.hidden = true; };
  function linhasDe(sugs, info) {
    const numerar = info.temPlaceholder || info.numeradas > 0 || sugs.length > 1;
    return sugs.map((s, i) => (numerar ? (info.maxNum + i + 1) + ". " : "") + s.frase);
  }
  function posicionar() {
    if (!atual || ghost.hidden) return;
    const info = secaoConclusao(); if (!info) { esconder(); return; }
    const ref = info.alvo || info.ultimo || info.heading, i = [...sheet.children].indexOf(ref);
    const r = ref.getBoundingClientRect(), c = ui.center.getBoundingClientRect(), top = info.alvo ? r.top : r.bottom, cs = getComputedStyle(ref);
    Object.assign(ghost.style, { left: r.left + "px", top: top + "px", width: Math.max(160, r.width) + "px", fontFamily: cs.fontFamily, fontSize: cs.fontSize });
    const extra = Math.max(0, Math.ceil(ghost.offsetHeight - (info.alvo ? ref.offsetHeight : 0)));
    espaco.textContent = extra && i >= 0 ? `#laudo > :nth-child(${i + 1}) { margin-bottom: ${extra}px !important; }` : "";
    const fora = top < c.top ? "↑" : top > c.bottom - 24 ? "↓" : "";
    ghost.style.visibility = fora ? "hidden" : "visible";
    aviso.hidden = !fora; aviso.textContent = "Conclusão sugerida " + fora + " " + TECLA;
  }
  aviso.addEventListener("mousedown", e => e.preventDefault());
  aviso.addEventListener("click", () => { const info = secaoConclusao(); (info && (info.alvo || info.ultimo || info.heading))?.scrollIntoView({ block: "center" }); posicionar(); });
  function mostrar(sugs, info) {
    atual = { sugs };
    ghost.replaceChildren(...linhasDe(sugs, info).map(t => ui.el("div", { class: "gc-linha" }, t)),
      ui.el("div", { class: "gc-dica" }, TECLA + " aceitar · Esc dispensar"));
    ghost.hidden = false; posicionar();
  }

  /* ---------- cálculo (debounce) ---------- */
  function agendar(ms) { clearTimeout(timer); timer = setTimeout(calcular, ms == null ? DEBOUNCE : ms); }
  function calcular() {
    if (!ligado) { esconder(); return; }
    if (ui.voiceState && ui.voiceState.interim) { agendar(); return; }     // ditado com texto provisório: espera
    carregar();
    const info = secaoConclusao();
    if (!info || !caretEmAchados()) { esconder(); return; }
    let achados = []; try { achados = alteredFindings(); } catch (_) {}
    if (!achados.length) { esconder(); return; }
    const caso = ui.activeId ? ui.activeId() : "", desp = dispensadas.get(caso) || new Set();
    const sugs = C.sugerir(indice(), achados, { conclusao: info.linhas, aprendido, pares: indicePares() }).filter(s => !desp.has(s.chave + "|" + C.fold(s.frase)));
    if (!sugs.length) { esconder(); return; }
    mostrar(sugs, info);
  }

  /* ---------- aceitar / dispensar ---------- */
  /* Escreve linhas na Conclusão (preenche o "1." vazio ou acrescenta parágrafos); devolve o último bloco. */
  function escreverLinhas(linhas, info, novo) {
    let ultimo = info.ultimo || info.heading, primeiro = true;
    linhas.forEach(t => {
      const prox = ultimo.nextElementSibling;
      let b = primeiro && info.alvo ? info.alvo : !primeiro && prox && info.blocos.includes(prox) && soNumero(prox.textContent) ? prox : null;
      if (b) b.textContent = t; else { b = novo(t); ultimo.after(b); }
      ultimo = b; primeiro = false;
    });
    return ultimo;
  }
  /* Modo Frase (@): põe conclusões do banco na Conclusão sem repetir o que já está lá; devolve quantas entraram. */
  function inserirConclusao(frases) {
    const info = secaoConclusao(); if (!info) return 0;
    const novas = []; for (const f of frases) if (f && !C.jaTem(f, info.linhas) && !C.jaTem(f, novas)) novas.push(String(f).replace(/\s+/g, " ").trim());
    if (!novas.length) return 0;
    esconder();
    const numerar = info.temPlaceholder || info.numeradas > 0 || novas.length > 1;
    escreverLinhas(novas.map((t, i) => (numerar ? (info.maxNum + i + 1) + ". " : "") + t), info, t => { const p = document.createElement("p"); p.setAttribute("style", PSTYLE); p.textContent = t; return p; });
    return novas.length;
  }
  function aceitar() {
    if (!atual) return false;
    const info = secaoConclusao(); if (!info) { esconder(); return false; }
    const sugs = atual.sugs, linhas = linhasDe(sugs, info), caso = ui.activeId ? ui.activeId() : "";
    const novo = t => { const p = document.createElement("p"); p.setAttribute("style", PSTYLE); p.textContent = t; return p; };
    esconder();
    pushVersion("Antes da conclusão sugerida");
    const ultimo = escreverLinhas(linhas, info, novo);
    sheet.focus({ preventScroll: true }); caretAtEnd(ultimo);
    const lista = pend.get(caso) || []; sugs.forEach((s, i) => lista.push({ chave: s.chave, texto: linhas[i] })); pend.set(caso, lista);
    updateCount(); renderAlerts(); scheduleCaseSave(); pushVersion("Conclusão sugerida");
    setStatus("Conclusão inserida a partir do banco, sem usar o Claude. Pode editar: o Laudos aprende com a sua edição.", "ok");
    return true;
  }
  function dispensar() {
    if (!atual) return false;
    const caso = ui.activeId ? ui.activeId() : "", desp = dispensadas.get(caso) || new Set();
    for (const s of atual.sugs) { desp.add(s.chave + "|" + C.fold(s.frase)); C.registrarRejeicao(aprendido, s.chave, agora()); }
    dispensadas.set(caso, desp); salvar(); esconder();
    return true;
  }
  ghost.addEventListener("mousedown", e => e.preventDefault());       // não tira o cursor da folha
  ghost.addEventListener("click", () => aceitar());
  window.addEventListener("keydown", e => {
    if (!atual || ghost.hidden || !sheet.contains(e.target) && e.target !== sheet) return;
    if (e.key === "Enter" && e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) aceitar(); }
    else if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      const pal = document.getElementById("commandPalette"), bar = document.getElementById("selbar");
      if ((pal && !pal.hidden) || (bar && bar.contains(document.activeElement))) return;
      e.preventDefault(); e.stopImmediatePropagation(); dispensar();
    }
  }, true);

  /* ---------- aprender ao copiar o laudo ---------- */
  function aoCopiar() {
    const caso = ui.activeId ? ui.activeId() : "", info = secaoConclusao(); if (!info) return;
    let mudou = C.aprenderDe(aprendido, pend.get(caso), info.linhas, agora());
    pend.delete(caso);
    // sugestão bloqueada por 3 Esc volta quando ele mesmo escreve essa conclusão
    try {
      const bloq = Object.keys(aprendido.itens).filter(k => C.estaBloqueada(aprendido, k));
      if (bloq.length) for (const s of C.sugerir(indice(), alteredFindings(), { aprendido, pares: indicePares(), ignorarBloqueio: true, max: 50 }))
        if (bloq.includes(s.chave) && info.linhas.some(l => C.dice(C.semNumero(l), s.frase) > 0.5)) { aprendido.itens[s.chave].rej = 0; aprendido.itens[s.chave].atualizado = agora(); mudou = true; }
    } catch (_) {}
    if (mudou) salvar();
  }
  if (typeof learnFromEdit === "function") {
    const original = learnFromEdit;
    learnFromEdit = function () { try { aoCopiar(); } catch (_) {} return original.apply(this, arguments); };
  }

  /* ---------- gatilhos ---------- */
  new MutationObserver(() => { if (ligado) agendar(); }).observe(sheet, { childList: true, subtree: true, characterData: true });
  document.addEventListener("selectionchange", () => {
    if (!ligado) return;
    if (atual && !caretEmAchados()) esconder(); else agendar();
  });
  ui.center.addEventListener("scroll", posicionar, { passive: true });
  window.addEventListener("resize", posicionar);

  /* ---------- interruptor nas Configurações ---------- */
  const alvoCfg = document.querySelector(".v2-settings-extras");
  if (alvoCfg) {
    const rot = ui.el("label", { class: "chk-line" }), cx = ui.el("input", { type: "checkbox", id: "setSugConc" });
    cx.checked = ligado;
    cx.onchange = () => { ligado = cx.checked; store.set(CHAVE, ligado ? "1" : "0"); if (ligado) agendar(0); else esconder(); };
    rot.append(cx, document.createTextNode(" Sugerir conclusão enquanto escrevo os achados"));
    alvoCfg.append(rot);
  }
  ui.conclusao = { escrever: inserirConclusao, calcular, aceitar, dispensar, ligado: () => ligado, aprendido: () => aprendido, carregar };
  carregar(true);
})();

/* Painel "IA viu": achados da IA de imagem (docs/IA-IMAGEM.md) vindos da ponte local; o médico aceita, edita ou rejeita.
   Só consulta a ponte (127.0.0.1:47831) e só aparece quando ela responde. Nada de paciente no site: guarda apenas o caso_id já visto. */
(() => {
  "use strict";
  const ui = window.tutuV2, BASE = "http://127.0.0.1:47831", NOME = "IA viu", VISTO = "v2IAVisto";
  const POLL_MS = 10000, PRIMEIRA_MS = 3000;
  const ETAPAS = { extraindo: "extraindo o exame", series: "escolhendo a série", segmentando: "segmentando os órgãos", analisando: "analisando" };
  const TIPOS = { calculo_renal: "Cálculo renal", cisto_renal: "Cisto renal", esteatose: "Esteatose", ateromatose_aortica: "Ateromatose aórtica",
    colelitiase: "Colelitíase", colecistectomia: "Colecistectomia", hidronefrose: "Hidronefrose", litiase_ureteral: "Litíase ureteral",
    aorta_ectasia: "Ectasia da aorta", aorta_aneurisma: "Aneurisma da aorta", diverticulose: "Diverticulose", cisto_hepatico: "Cisto hepático", nodulo_hepatico: "Nódulo hepático",
    cisto_pancreatico: "Cisto pancreático", nodulo_solido_renal: "Nódulo sólido renal",
    linfonodo_aumentado: "Linfonodo aumentado", densificacao_gordura: "Densificação da gordura", paniculite_mesenterica: "Paniculite mesentérica",
    diverticulite: "Diverticulite", outro: "Outro" };
  /* Campos que o Artur pode corrigir num achado (valor da ponte -> rótulo); só aparecem os que o achado tem. */
  const CAMPOS = {
    lado: { rot: "Lado", op: { direito: "direito", esquerdo: "esquerdo", bilateral: "bilateral" } },
    terco: { rot: "Terço", op: { superior: "superior", medio: "médio", inferior: "inferior" } },
    categoria: { rot: "Tipo do cisto", op: { cortical: "cortical", parapielico: "parapiélico" } },
    grau: { rot: "Grau", op: { discreta: "discreta", moderada: "moderada", acentuada: "acentuada" } } };
  let casos = [], atualId = null, dados = null, dadosAssin = "", ponteOk = false, aviso = "", assinRender = "", busy = false, filtro = "";

  /* ---------- aba e painel ---------- */
  const tab = ui.button("", () => ui.panel(NOME), { role: "tab", id: "rightTabIA", "aria-controls": "rightPanelIA", "aria-selected": "false", title: "IA viu · Alt+I" });
  const selo = ui.el("i", { class: "ia-selo", "aria-label": "Novo resultado da IA de imagem" }, "●");
  selo.hidden = true;
  tab.append(ui.el("b", { "aria-hidden": "true" }, "🔎"), ui.el("span", {}, NOME), selo);
  tab.hidden = true;
  const panel = ui.panels[NOME] = ui.el("section", { id: "rightPanelIA", role: "tabpanel", "aria-labelledby": "rightTabIA", class: "v2-panel" });
  panel.hidden = true;
  document.getElementById("rightTabs").append(tab);
  ui.right.append(panel);

  /* ---------- ponte ---------- */
  async function ponte(rota, corpo) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    try {
      const r = await fetch(BASE + rota, corpo === undefined ? { signal: ctl.signal } :
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: ctl.signal });
      if (!r.ok) return null;
      return { json: await r.json(), aviso: r.headers.get("X-Tutu-Aviso") || "" };
    } catch (_) { return null; } finally { clearTimeout(t); }
  }
  async function poll() {
    if (document.hidden || busy) return;
    busy = true;
    try {
      const r = await ponte("/imagem/casos");
      ponteOk = !!r && Array.isArray(r.json);
      casos = ponteOk ? r.json : []; aviso = ponteOk ? r.aviso : "";
      if (ponteOk && !casos.some(c => c.caso_id === atualId)) atualId = casos[0]?.caso_id || null;
      const c = atual();
      if (c && c.etapa === "pronto") {
        const assin = c.caso_id + "|" + c.revisados + "|" + c.n_achados;
        if (assin !== dadosAssin) { const d = await ponte("/imagem/caso?id=" + encodeURIComponent(c.caso_id)); if (d) { dados = d.json; dadosAssin = assin; } }
      } else { dados = null; dadosAssin = ""; }
      tab.hidden = !ponteOk && panel.hidden;
      atualizarSelo(); render();
    } finally { busy = false; }
  }
  const atual = () => casos.find(c => c.caso_id === atualId) || null;
  const lerVisto = () => { try { return localStorage.getItem(VISTO) || ""; } catch (_) { return ""; } };
  const gravaVisto = id => { try { localStorage.setItem(VISTO, id); } catch (_) {} };
  const painelAberto = () => !panel.hidden && !ui.app.classList.contains("right-mini");
  function atualizarSelo() {
    const novo = casos[0];
    if (novo && painelAberto() && atualId === novo.caso_id && novo.etapa === "pronto") gravaVisto(novo.caso_id);
    selo.hidden = !(novo && novo.etapa === "pronto" && novo.revisados < novo.n_achados && lerVisto() !== novo.caso_id);
  }

  /* ---------- inserir na folha (Achados / Conclusão), sem duplicar ---------- */
  const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const soNumero = t => /^\s*\d+\s*[.)]?\s*$/.test(t);
  function secao(nome) {
    const ps = [...sheet.children], hi = ps.findIndex(p => norm(p.textContent) === nome);
    if (hi < 0) return null;
    let end = hi + 1; while (end < ps.length && !isHeading(ps[end].textContent.trim())) end++;
    return { head: ps[hi], blocos: ps.slice(hi + 1, end) };
  }
  const novoP = t => { const p = document.createElement("p"); p.setAttribute("style", PSTYLE); p.textContent = t; return p; };
  function colocar(sec, texto, vazio) {
    const alvo = sec.blocos.find(vazio);
    if (alvo) { alvo.textContent = texto; return alvo; }
    const cheios = sec.blocos.filter(b => b.textContent.trim()), p = novoP(texto);
    (cheios[cheios.length - 1] || sec.head).after(p); return p;
  }
  /* Devolve {achados, conclusao}: true quando inseriu, false quando já estava na folha. */
  function inserirNaFolha(frase, conclusao) {
    const res = { achados: false, conclusao: false };
    pushVersion("Antes da IA de imagem");
    let ultimo = null;
    const sa = secao("achados");
    if (!frase) { /* nada */ }
    else if (!sa) { sheet.focus({ preventScroll: true }); insertAtCaret(frase); res.achados = true; }
    else if (!sa.blocos.some(b => fold(b.textContent) === fold(frase))) { ultimo = colocar(sa, frase, b => !b.textContent.trim()); res.achados = true; }
    const sc = conclusao ? secao("conclusão") : null;
    if (sc && !sc.blocos.some(b => fold(b.textContent.replace(/^\s*\d+\s*[.)]\s*/, "")) === fold(conclusao))) {
      const cheios = sc.blocos.filter(b => b.textContent.trim() && !soNumero(b.textContent));
      const maxNum = Math.max(0, ...cheios.map(b => +(b.textContent.trim().match(/^(\d+)\s*[.)]/) || [0, 0])[1]));
      const numerar = maxNum > 0 || sc.blocos.some(b => soNumero(b.textContent));
      colocar(sc, (numerar ? (maxNum + 1) + ". " : "") + conclusao, b => soNumero(b.textContent) || !b.textContent.trim());
      res.conclusao = true;
    }
    if (ultimo) { sheet.focus({ preventScroll: true }); caretAtEnd(ultimo); }
    if (res.achados || res.conclusao) { updateCount(); renderAlerts(); scheduleCaseSave(); pushVersion("IA de imagem"); }
    return res;
  }

  /* ---------- veredito ---------- */
  /* Registro de aprendizado (Tutu-IA\correcoes.jsonl): só o que mudou; a ponte lê o "antes" do próprio achado. */
  const registrar = (c, achado, acao, depois) => ponte("/imagem/correcao", { caso_id: c.caso_id, achado, acao, depois });
  async function enviar(a, veredito, frase, depois) {
    const c = atual(); if (!c) return;
    if (veredito !== "rejeitado") {
      const r = inserirNaFolha(frase, a.conclusao);
      setStatus(r.achados || r.conclusao ? "Frase da IA inserida na folha." : "Essa frase já estava na folha.", "ok");
    }
    const r = await ponte("/imagem/revisao", { caso_id: c.caso_id, achado_id: a.id, veredito, frase_final: veredito === "rejeitado" ? "" : frase });
    if (!r) setStatus("Não consegui registrar o veredito na ponte.", "err");
    else {
      const mudou = depois && Object.keys(depois).length ? depois : undefined;
      await registrar(c, a.id, veredito === "rejeitado" ? "rejeitar" : (mudou ? "editar" : "aceitar"), mudou);
    }
    dadosAssin = ""; await poll();
  }
  async function enviarPerdido(form) {
    const c = atual(); if (!c) return;
    const lado = form.lado.value, nota = form.nota.value.trim();
    const r = await ponte("/imagem/perdido", { caso_id: c.caso_id, tipo: form.tipo.value, corte: form.corte.value.trim(), nota });
    if (r) await registrar(c, form.tipo.value, "nao_viu", { ...(lado ? { lado } : {}), ...(nota ? { texto: nota } : {}) });
    setStatus(r ? "Anotado: a IA perdeu algo." : "Não consegui anotar na ponte.", r ? "ok" : "err");
    if (r) { form.reset(); form.closest("details").open = false; dadosAssin = ""; await poll(); }
  }

  /* ---------- tela ---------- */
  const rotulo = id => `${id.slice(6, 8)}/${id.slice(4, 6)} ${id.slice(9, 11)}:${id.slice(11, 13)}`;
  function cartao(a, rev, caso) {
    const card = ui.el("article", { class: "ia-card", "data-achado": a.id });
    if (a.imagem) {
      const img = ui.el("img", { class: "ia-thumb", alt: "Corte do achado", loading: "lazy",
        src: `${BASE}/imagem/img?id=${encodeURIComponent(caso.caso_id)}&f=${encodeURIComponent(a.imagem)}` });
      card.append(img);
    }
    const frase = ui.el("p", { class: "ia-frase" }, a.frase || "");
    const det = [a.detalhe, a.corte != null ? "corte nº " + a.corte : "", a.confianca ? "confiança " + a.confianca : ""].filter(Boolean).join(" · ");
    card.append(frase, ui.el("p", { class: "meta ia-det" }, det));
    if (rev) { card.append(ui.el("p", { class: "ia-feito" }, { aceito: "✓ aceito", editado: "✓ editado", rejeitado: "✕ rejeitado" }[rev.veredito] || rev.veredito)); card.classList.add("ia-revisado"); return card; }
    const linha = ui.el("div", { class: "ia-acoes" });
    const aceitar = ui.button("Aceitar", () => enviar(a, "aceito", a.frase), { class: "ia-aceitar" });
    const editar = ui.button("Editar", () => {
      const campo = ui.el("textarea", { class: "ia-edit", rows: "3", "aria-label": "Frase editável" }); campo.value = a.frase || "";
      const sels = {}, medida = a.medida_mm != null ? ui.el("input", { class: "ia-edit-med", type: "number", min: "0.1", step: "0.1", "aria-label": "Medida em mm" }) : null;
      if (medida) medida.value = a.medida_mm;
      const extras = ui.el("div", { class: "ia-campos" });
      for (const [k, def] of Object.entries(CAMPOS)) {
        if (!a[k]) continue;
        const sel = sels[k] = ui.el("select", { "aria-label": def.rot });
        for (const [v, t] of Object.entries(def.op)) sel.append(ui.el("option", { value: v }, t));
        sel.value = a[k]; const lb = ui.el("label", {}, def.rot + " "); lb.append(sel); extras.append(lb);
      }
      if (medida) { const lb = ui.el("label", {}, "Medida (mm) "); lb.append(medida); extras.append(lb); }
      const mudou = () => {   // só o que o Artur trocou (a ponte guarda o "antes" do achado)
        const d = {};
        for (const [k, sel] of Object.entries(sels)) if (sel.value !== a[k]) d[k] = sel.value;
        if (medida && medida.value !== "" && +medida.value !== a.medida_mm) d.medida_mm = +medida.value;
        return d;
      };
      const ok = ui.button("Aceitar editado", () => campo.value.trim() && enviar(a, "editado", campo.value.trim(), mudou()), { class: "ia-aceitar-ed" });
      const cancelar = ui.button("Cancelar", () => { assinRender = ""; render(); });
      frase.replaceWith(campo); campo.after(extras); linha.replaceChildren(ok, cancelar); campo.focus();
    }, { class: "ia-editar" });
    const rejeitar = ui.button("Rejeitar", () => enviar(a, "rejeitado", ""), { class: "ia-rejeitar" });
    linha.append(aceitar, editar, rejeitar); card.append(linha);
    return card;
  }
  function formPerdido() {
    const box = ui.el("details", { class: "ia-perdeu" });
    box.append(ui.el("summary", {}, "＋ a IA não viu algo"));
    const f = ui.el("form", { class: "ia-form" }), tipo = ui.el("select", { name: "tipo", "aria-label": "Tipo do achado perdido" });
    for (const [v, t] of Object.entries(TIPOS)) tipo.append(ui.el("option", { value: v }, t));
    const lado = ui.el("select", { name: "lado", "aria-label": "Lado" }); lado.append(ui.el("option", { value: "" }, "lado?"));
    for (const [v, t] of Object.entries(CAMPOS.lado.op)) lado.append(ui.el("option", { value: v }, t));
    f.append(tipo, lado, ui.el("input", { name: "corte", type: "number", min: "0", placeholder: "Nº do corte", "aria-label": "Número do corte" }),
      ui.el("input", { name: "nota", type: "text", maxlength: "200", placeholder: "Nota curta, sem nome nem ID do paciente", "aria-label": "Nota (sem identificação do paciente)" }),
      ui.button("Enviar", () => enviarPerdido(f), { class: "ia-enviar" }));
    f.onsubmit = e => { e.preventDefault(); enviarPerdido(f); };
    box.append(f); return box;
  }
  function linhaCaso(k) {
    const proc = k.etapa !== "pronto" && k.etapa !== "erro";
    const info = k.etapa === "erro" ? "erro: " + (k.mensagem || "falhou")
      : proc ? "processando (" + (ETAPAS[k.etapa] || k.etapa || "iniciando") + ")"
      : `${k.n_achados} achado(s) · ${k.revisados >= k.n_achados ? "revisado" : "falta revisar"}`;
    const b = ui.button("", () => { atualId = k.caso_id; dados = null; dadosAssin = ""; assinRender = ""; poll(); },
      { "aria-pressed": String(k.caso_id === atualId), title: "Exame " + k.caso_id });
    if (k.etapa === "erro") b.style.opacity = "0.55";
    b.append(ui.el("b", {}, k.acesso || "sem acesso"), ` · ${rotulo(k.caso_id)} · ${info}`);
    return b;
  }
  function render() {
    const c = atual(), assin = JSON.stringify([ponteOk, aviso, atualId, casos, dados]);
    if (assin === assinRender) return;
    if (panel.contains(document.activeElement) && /^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement.tagName)) return;   // não atropela quem digita
    assinRender = assin;
    const out = [ui.el("h2", {}, "🔎 IA viu")];
    if (!ponteOk) out.push(ui.el("p", { class: "meta ia-msg" }, "Ponte local indisponível. Abra a ponte (127.0.0.1:47831) para ver o que a IA de imagem achou."));
    else {
      if (aviso) out.push(ui.el("p", { class: "ia-aviso", role: "status" }, aviso));
      if (!c) out.push(ui.el("p", { class: "meta ia-msg" }, "Nenhum exame ainda. Ponha o ZIP na pasta entrada\\ da IA de imagem."));
      if (casos.length > 1) {
        const busca = ui.el("input", { type: "search", placeholder: "Buscar por acesso ou achado (cisto, litíase…)", "aria-label": "Buscar exame", value: filtro });
        const lista = ui.el("div", { class: "ia-lista", role: "group", "aria-label": "Exames" });
        const monta = () => {
          const q = fold(busca.value);
          lista.replaceChildren(...casos.filter(k => !q || fold([k.acesso, ...(k.tipos || []).map(t => t.replace(/_/g, " "))].join(" ")).includes(q)).map(linhaCaso));
        };
        busca.addEventListener("input", () => { filtro = busca.value; assinRender = ""; monta(); });
        monta(); out.push(busca, lista);
      }
      if (c && c.etapa === "erro") out.push(ui.el("p", { class: "ia-aviso" }, "A IA não conseguiu processar: " + (c.mensagem || "erro")));
      else if (c && c.etapa !== "pronto") out.push(ui.el("p", { class: "ia-proc", role: "status" }, `Processando… (${ETAPAS[c.etapa] || c.etapa || "iniciando"})`));
      else if (c && dados) {
        const ach = dados.achados || {}, rev = (dados.revisao && dados.revisao.achados) || {}, s = ach.serie || {};
        if (s.descricao || s.fase) out.push(ui.el("p", { class: "meta" }, ["Série: " + (s.descricao || "?"), s.fase ? "fase " + s.fase : ""].filter(Boolean).join(" · ")));
        for (const w of ach.avisos || []) out.push(ui.el("p", { class: "ia-aviso" }, w));
        if (!(ach.achados || []).length) out.push(ui.el("p", { class: "meta ia-msg" }, "A IA não achou nada nos itens que avalia."));
        for (const a of ach.achados || []) out.push(cartao(a, rev[a.id], c));
        const neg = ach.negativos || [];
        if (neg.length) { const ul = ui.el("ul", { class: "ia-neg" }); ul.append(...neg.map(n => ui.el("li", {}, n.detalhe || n.tipo))); out.push(ul); }
        out.push(formPerdido());
      }
    }
    panel.replaceChildren(...out);
  }

  /* ---------- abrir/fechar, atalho, ciclo ---------- */
  ui.actions.iaviu = {
    label: NOME, run: () => {
      if (painelAberto()) { ui.toggleRight(); return; }
      tab.hidden = false; ui.panel(NOME); assinRender = ""; poll();
    }
  };
  ui.shortcuts["Alt+I"] = "iaviu";
  ui.renderShortcuts();
  tab.addEventListener("click", () => { assinRender = ""; poll(); });
  // Consulta sozinha só onde a ponte aceita a origem (site local, GitHub Pages, localhost); em outras portas ela responderia 403.
  if (location.origin === BASE || location.origin === "https://arturaragao.github.io" || /^http:\/\/localhost(:\d+)?$/.test(location.origin)) {
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
    setTimeout(poll, PRIMEIRA_MS);
    setInterval(poll, POLL_MS);
  }
  ui.iaViu = { poll, render, inserirNaFolha, painel: panel, tab };
})();

/* Rascunho do laudo a partir da IA de imagem (docs/IA-IMAGEM.md): com um clique, a máscara de TC de abdome total é preenchida
   com os achados do caso (frases prontas no estilo do Artur); órgão sem achado fica com o texto normal da máscara.
   Parte 1 (pura, testada em Node): escolhe a máscara, troca a linha normal de cada órgão, monta a conclusão (pares/banco do site primeiro).
   Parte 2 (tela): botão "Montar rascunho" ao lado do painel "IA viu" (sem mexer no arquivo dele). Só preenche a folha: nada vai para o PACS. */
(function (root) {
  "use strict";
  const fold = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const dep = () => (typeof module !== "undefined" && module.exports ? require("./110-v2-conclusao.js") : root.TutuConclusao);
  const capitalizar = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  /* órgão -> linha normal da máscara (texto sem acento, minúsculo); a ordem da lista é a ordem das frases dentro da linha */
  const LINHAS = [
    { tipos: ["esteatose"], re: /^figado\b/ },
    { tipos: ["colelitiase", "colecistectomia"], re: /^vesicula\b/ },
    { tipos: ["calculo_renal", "cisto_renal"], re: /^rins?\b/, porLado: true },
    { tipos: ["hidronefrose", "litiase_ureteral"], re: /^(ausencia de dilatacao dos sistemas|sistemas? (uretero|pielo))/, porLado: true },
    { tipos: ["diverticulose"], re: /^alcas (do trato gastrointestinal|intestinais)/ },
    { tipos: ["ateromatose_aortica", "aorta_ectasia", "aorta_aneurisma"], re: /^aorta\b/ }
  ];
  const ORDEM_LADO = { direito: 0, esquerdo: 1 };
  const MARCA = "SUGESTÃO DA IA, revisar: ";

  /* “aceito” pela IA = confiança média/alta. Sugestão (confiança baixa, detalhe “sugestão…”, colecistectomia) entra marcada para revisão. */
  const ehSugestao = a => a.tipo === "colecistectomia" || a.confianca === "baixa" || /^sugest/i.test(String(a.detalhe || ""));
  /* Achados que entram no rascunho: [{a, frase, sugestao}]. Veredito do painel: rejeitado sai; aceito/editado vira firme (já revisado). */
  function selecionar(caso, revisao) {
    const rev = (revisao && revisao.achados) || {}, out = [], ignorados = [];
    for (const a of (caso && caso.achados) || []) {
      const v = rev[a.id], vered = v && v.veredito;
      if (vered === "rejeitado") { ignorados.push({ id: a.id, motivo: "rejeitado" }); continue; }
      const frase = String((vered === "editado" && v.frase_final) || a.frase || "").trim();
      if (!frase) { ignorados.push({ id: a.id, motivo: "sem frase" }); continue; }
      out.push({ a, frase, sugestao: !(vered === "aceito" || vered === "editado") && ehSugestao(a) });
    }
    return { itens: out, ignorados };
  }

  /* Com contraste? true se o caso tem série contrastada (ou fase diferente de pré); false se a IA só achou a fase pré. */
  function temContraste(caso) {
    if (caso && caso.serie_contrastada) return true;
    const f = caso && caso.serie && caso.serie.fase;
    return !!f && f !== "pre";
  }

  /* Máscara de TC de abdome total: com contraste -> a padrão; sem contraste -> uma máscara “sem contraste” se existir. */
  function escolherMascara(exames, contraste) {
    const abd = (exames || []).filter(e => e && e.tipo !== "parecer" && /abdome total|abdomen total/.test(fold(e.name)));
    if (!abd.length) return null;
    const semC = e => /sem contraste|sem a injecao/.test(fold([e.name, e.proto, e.mask].join(" ")));
    if (contraste === false) { const s = abd.find(semC); if (s) return s; }
    return abd.find(e => e.id === "abdome") || abd.find(e => !semC(e)) || abd[0];
  }

  /* ---------- máscara em linhas ---------- */
  const lerLinha = raw => {
    const t = String(raw).trim(), al = (t.match(/^\{\{[^}]*\}\}/) || [""])[0], r = t.slice(al.length);
    const m = r.match(/^\[<(.*)>\]$/) || r.match(/^\[(.*)\]$/);
    return { al, texto: (m ? m[1] : r).replace(/<\/?[bui]>/gi, "").trim() };
  };
  const chaveTitulo = raw => fold(lerLinha(raw).texto).replace(/[:\s]+$/, "");
  const linhaNova = (al, texto) => al + "[<" + texto + ">]";
  const marcar = frase => "[" + MARCA + frase + "]";

  /* ---------- conclusão ---------- */
  const lado1 = a => (a.lado === "direito" ? "D" : a.lado === "esquerdo" ? "E" : "");
  /* Pares/banco do site primeiro (frase direta, com a trava contra gravidade/subtipo/lado inventados); senão a conclusão da própria IA sem medida. */
  function concluirUm(it, ctx) {
    const C = dep();
    let c = "";
    if (ctx && (ctx.idx || ctx.pares)) {
      try {
        const s = C.sugerir(ctx.idx || { entradas: [], idf: new Map(), maxIdf: 0 }, [it.frase], { aprendido: ctx.aprendido, pares: ctx.pares, max: 1 });
        if (s && s[0] && s[0].frase) c = s[0].frase;
      } catch (_) { /* cai na conclusão da IA */ }
    }
    if (!c && it.a.conclusao) c = C.limparMedidas(it.a.conclusao);
    c = String(c || "").replace(/^\s*achados?\s+compat[ií]ve\w+\s+com\s+/i, "").replace(/[\s.]+$/, "").trim();
    return c ? capitalizar(c) + "." : "";
  }
  /* mesmo texto exceto “à direita”/“à esquerda” no fim -> uma só, “bilateral” */
  function unirBilateral(lista) {
    const fim = /\s+à\s+(direita|esquerda)\.$/, vistos = new Map(), out = [];
    for (const x of lista) {
      const m = x.texto.match(fim);
      if (!m) { out.push(x); continue; }
      const base = fold(x.texto.replace(fim, "")) + "|" + x.sugestao, ant = vistos.get(base);
      if (ant && ant.lado !== m[1]) { ant.item.texto = x.texto.replace(fim, " bilateral."); ant.lado = "ambos"; continue; }
      if (ant) continue;                                                 // igual: não duplica
      const item = { ...x }; vistos.set(base, { item, lado: m[1] }); out.push(item);
    }
    return out;
  }
  function montarConclusao(itens, ctx) {
    const base = [], chaves = new Set();
    for (const it of [...itens.filter(i => !i.sugestao), ...itens.filter(i => i.sugestao)]) {
      const texto = concluirUm(it, ctx); if (!texto) continue;
      const k = fold(texto).replace(/[^a-z0-9]+/g, " ").trim() + "|" + it.sugestao + "|" + lado1(it.a);
      if (chaves.has(k)) continue; chaves.add(k);
      base.push({ texto, sugestao: it.sugestao });
    }
    return unirBilateral(base);
  }

  /* Linha com mais de uma estrutura: o que o achado não tocou mantém o texto normal da máscara (lado oposto, ilíacas...). */
  function completarNormal(def, normal, ord) {
    const lados = new Set(ord.map(x => x.a.lado)), um = lados.size === 1 && ORDEM_LADO[[...lados][0]] != null;
    const contra = um && ([...lados][0] === "direito" ? "esquerdo" : "direito");
    const f = fold(normal);
    if (def.tipos[0] === "calculo_renal" && um && /^rins\b/.test(f)) return " " + normal.replace(/^rins\b/i, "Rim " + contra);
    if (def.tipos[0] === "hidronefrose" && um && /^ausencia de dilatacao dos sistemas?\b/.test(f))
      return " " + normal.replace(/dos sistemas\s+/i, "do sistema ").replace(/-caliciais\b/i, "-calicinal").replace(/\.?$/, " à " + (contra === "direito" ? "direita" : "esquerda") + ".");
    if (def.tipos[0] === "ateromatose_aortica") {
      const m = normal.match(/^aorta abdominal e (art[eé]rias il[ií]acas)\s+(.*)$/i);
      if (!m) return "";
      const txt = fold(ord.map(x => x.frase).join(" ")), aorta = /aort/.test(txt), ilia = /iliac/.test(txt);
      return (aorta ? "" : " Aorta abdominal " + m[2]) + (ilia ? "" : " " + capitalizar(m[1]) + " " + m[2]);
    }
    return "";
  }

  /* ---------- montagem ---------- */
  /* maskText: texto da máscara (mesmo formato de DEFAULT_EXAMS); caso: achados.json; opts: { revisao, idx, pares, aprendido }.
     Devolve { mask, colocados, semLinha, ignorados, conclusoes, contraste, tecnicaAjustada, nAfirmados, nSugestoes }. */
  function montar(maskText, caso, opts) {
    opts = opts || {};
    const { itens, ignorados } = selecionar(caso, opts.revisao), contraste = temContraste(caso);
    let linhas = String(maskText).split("\n");
    const iAch = linhas.findIndex(l => chaveTitulo(l) === "achados"), iConc = linhas.findIndex(l => chaveTitulo(l) === "conclusao");
    const iTec = linhas.findIndex(l => chaveTitulo(l) === "tecnica de exame");
    let tecnicaAjustada = false;
    if (!contraste && iTec >= 0) {                                      // só a fase pré: técnica sem contraste
      const re = /antes,?\s*durante\s*e\s*ap[óo]s\s*a\s*inje[çc][ãa]o/i;
      for (let i = iTec + 1; i < linhas.length && !(iAch >= 0 && i >= iAch); i++) {
        if (re.test(linhas[i])) { linhas[i] = linhas[i].replace(re, "sem a injeção"); tecnicaAjustada = true; break; }
      }
    }
    const colocados = [], semLinha = [], extras = [];                    // extras: frases sem linha própria na máscara
    const dentro = iAch >= 0 ? (i => i > iAch && (iConc < 0 || i < iConc)) : (() => false);
    const porLinha = new Map();
    for (const it of itens) {
      const def = LINHAS.find(d => d.tipos.includes(it.a.tipo));
      let alvo = -1;
      if (def) for (let i = 0; i < linhas.length; i++) if (dentro(i) && def.re.test(fold(lerLinha(linhas[i]).texto))) { alvo = i; break; }
      if (alvo < 0) { semLinha.push({ id: it.a.id, frase: it.frase, sugestao: it.sugestao }); extras.push(it); continue; }
      (porLinha.get(alvo) || porLinha.set(alvo, { def, itens: [] }).get(alvo)).itens.push(it);
    }
    const saida = linhas.map(l => [l]);
    for (const [i, { def, itens: its }] of porLinha) {
      const { al, texto: normal } = lerLinha(linhas[i]);
      const ordem = it => [(def.porLado && ORDEM_LADO[it.a.lado]) || 0, def.tipos.indexOf(it.a.tipo)];
      const ord = its.slice().sort((x, y) => { const p = ordem(x), q = ordem(y); return p[0] - q[0] || p[1] - q[1]; });
      const firmes = ord.filter(x => !x.sugestao), sug = ord.filter(x => x.sugestao);
      const novas = [];
      if (firmes.length) {
        let t = firmes.map(x => x.frase).join(" ");
        t += completarNormal(def, normal, ord);
        novas.push(linhaNova(al, t));
      } else novas.push(linhas[i]);                                      // só sugestão: a linha normal fica e a sugestão vem marcada logo abaixo
      for (const x of sug) novas.push(linhaNova(al, marcar(x.frase)));
      saida[i] = novas;
      for (const x of ord) colocados.push({ id: x.a.id, tipo: x.a.tipo, linha: normal, sugestao: x.sugestao });
    }
    // sem linha própria (máscara editada): vai antes da Conclusão
    if (extras.length) {
      const pos = iConc >= 0 ? iConc : linhas.length;
      saida[pos] = [...extras.map(x => linhaNova("", x.sugestao ? marcar(x.frase) : x.frase)), ...(saida[pos] || [])];
    }
    // conclusão: troca os números soltos (“1.”) pelos itens
    const conclusoes = montarConclusao(itens, opts);
    let mask;
    if (iConc >= 0 && conclusoes.length) {
      const fim = (() => { for (let i = iConc + 1; i < linhas.length; i++) if (/^(achados adicionais|informacoes clinicas|tecnica de exame|achados)$/.test(chaveTitulo(linhas[i]))) return i; return linhas.length; })();
      const novos = conclusoes.map((c, n) => (n + 1) + ". " + (c.sugestao ? marcar(c.texto) : c.texto));
      for (let i = iConc + 1; i < fim; i++) if (/^\d+\s*[.)]?$/.test(lerLinha(linhas[i]).texto)) saida[i] = [];
      saida[iConc] = [...saida[iConc], ...novos];
    }
    mask = saida.flat().join("\n");
    return { mask, colocados, semLinha, ignorados, conclusoes, contraste, tecnicaAjustada,
      nAfirmados: itens.filter(x => !x.sugestao).length, nSugestoes: itens.filter(x => x.sugestao).length };
  }

  const api = { selecionar, ehSugestao, temContraste, escolherMascara, montar, montarConclusao, unirBilateral, MARCA };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TutuRascunho = api;
})(globalThis);

/* ====================== Tela ====================== */
(() => {
  "use strict";
  if (typeof document === "undefined" || !window.tutuV2 || typeof sheet === "undefined" || !window.tutuV2.iaViu) return;
  const ui = window.tutuV2, R = window.TutuRascunho, C = window.TutuConclusao, BASE = "http://127.0.0.1:47831";
  let busy = false, ultimo = null;                 // ultimo: { exId, html } do rascunho montado (para “Voltar ao normal”)
  let idx = null, idxRef = null, ipar = null, iparRef = null;

  async function ponte(rota) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    try { const r = await fetch(BASE + rota, { signal: ctl.signal }); return r.ok ? await r.json() : null; }
    catch (_) { return null; } finally { clearTimeout(t); }
  }
  /* Caso mostrado no painel: o botão marcado da lista (title “Exame <id>”) ou o mais novo. Se o painel passar a expor dados(), usa direto. */
  async function fonte() {
    if (typeof ui.iaViu.dados === "function") { const d = ui.iaViu.dados(); if (d && d.achados) return d; }
    const casos = await ponte("/imagem/casos");
    if (!Array.isArray(casos) || !casos.length) return null;
    const marcado = ui.iaViu.painel.querySelector('.ia-casos [aria-pressed="true"]');
    const id = marcado && /^Exame (\S+)/.exec(marcado.title || "")?.[1];
    const c = casos.find(k => k.caso_id === id) || casos[0];
    if (c.etapa !== "pronto") return { processando: true };
    const d = await ponte("/imagem/caso?id=" + encodeURIComponent(c.caso_id));
    return d && d.achados ? d : null;
  }
  const indices = () => {
    if (!idx || idxRef !== window.BANK_TC) { idx = C.indexar(window.BANK_TC); idxRef = window.BANK_TC; }
    if (!ipar || iparRef !== window.BANK_PARES) { ipar = C.indexarPares(window.BANK_PARES); iparRef = window.BANK_PARES; }
    return { idx, pares: ipar };
  };

  /* Troca o conteúdo da folha de um jeito que o Ctrl+Z nativo desfaz; se o navegador deformar o HTML, grava direto (e há as Versões/“Voltar”). */
  function trocarFolha(html) {
    const tmp = document.createElement("div"); tmp.innerHTML = html;
    sheet.focus({ preventScroll: true });
    let ok = false;
    try { document.execCommand("selectAll"); ok = document.execCommand("insertHTML", false, html); } catch (_) {}
    if (!ok || sheet.children.length !== tmp.children.length || sheet.textContent !== tmp.textContent) sheet.innerHTML = html;
  }

  async function montarRascunho() {
    if (busy) return;
    busy = true;
    try {
      const d = await fonte();
      if (!d) { setStatus("Não consegui ler o exame da IA: a ponte local está aberta e há um exame pronto?", "err"); return; }
      if (d.processando) { setStatus("A IA ainda está processando esse exame.", "err"); return; }
      const caso = d.achados, contraste = R.temContraste(caso), ex = R.escolherMascara(EXAMS, contraste);
      if (!ex) { setStatus("Não achei a máscara de TC de abdome total.", "err"); return; }
      const dirty = sheetHasContent() && !modelIntact();
      if (current.id !== ex.id) selectExam(ex.id, false);
      else if (dirty || !sheetHasContent()) { if (dirty) { saveCaseNow(); newCase(); } clearReviewState(); loadModel(ex); }
      if (extras.length) { extras = []; updMaskChip(); }
      const r = R.montar(ex.mask, caso, { revisao: d.revisao, ...indices(), aprendido: ui.conclusao && ui.conclusao.aprendido ? ui.conclusao.aprendido() : undefined });
      const html = modelSheetHtml({ ...ex, mask: r.mask });
      pushVersion("Antes do rascunho da IA");
      trocarFolha(html);
      ultimo = { exId: ex.id, html: sheet.innerHTML };
      pushVersion("Rascunho da IA");
      updateCount(); renderAlerts(); scheduleCaseSave(); atualizarBarra();
      const partes = [`Rascunho montado (${ex.name}${contraste ? "" : ", sem contraste"}): ${r.nAfirmados} ${r.nAfirmados === 1 ? "achado" : "achados"}`];
      if (r.nSugestoes) partes.push(`${r.nSugestoes} ${r.nSugestoes === 1 ? "sugestão marcada" : "sugestões marcadas"} entre colchetes`);
      if (r.semLinha.length) partes.push(`${r.semLinha.length} sem linha na máscara (antes da Conclusão)`);
      if (r.tecnicaAjustada) partes.push("técnica ajustada para sem contraste: confira");
      setStatus(partes.join("; ") + ". Revise; Ctrl+Z desfaz.", "ok");
    } finally { busy = false; }
  }
  function voltarAoNormal() {
    if (!ultimo) return;
    const ex = EXAMS.find(e => e.id === ultimo.exId); if (!ex) return;
    if (sheet.innerHTML !== ultimo.html && !window.confirm("Você editou o rascunho. Voltar ao normal apaga essas edições (as Versões guardam o que havia). Continuar?")) return;
    pushVersion("Antes de voltar ao normal");
    trocarFolha(modelSheetHtml(ex));
    pushVersion("Máscara normal");
    ultimo = null; updateCount(); renderAlerts(); scheduleCaseSave(); atualizarBarra();
    setStatus("Voltou ao texto normal da máscara.", "ok");
  }

  /* ---------- botões no painel “IA viu” (o painel apaga e refaz o conteúdo; um observador recoloca a barra) ---------- */
  const barra = ui.el("div", { class: "ia-acoes ia-rascunho" });
  const bMontar = ui.button("Montar rascunho", montarRascunho, { class: "ia-aceitar", title: "Preenche a máscara de TC de abdome total com os achados da IA · Alt+R" });
  const bVoltar = ui.button("Voltar ao normal", voltarAoNormal, { class: "ia-rejeitar", title: "Restaura o texto normal da máscara" });
  barra.append(bMontar, bVoltar);
  function atualizarBarra() { bVoltar.hidden = !ultimo; }
  atualizarBarra();
  const painel = ui.iaViu.painel;
  const colocarBarra = () => { if (!painel.contains(barra)) { const h = painel.firstElementChild; if (h) h.after(barra); else painel.append(barra); } };
  new MutationObserver(colocarBarra).observe(painel, { childList: true });
  colocarBarra();

  ui.actions.rascunhoia = { label: "Montar rascunho (IA)", run: montarRascunho };
  if (!ui.shortcuts["Alt+R"]) { ui.shortcuts["Alt+R"] = "rascunhoia"; ui.renderShortcuts(); }
  ui.rascunho = { montar: montarRascunho, voltar: voltarAoNormal };
})();

/* Corretor local: sem IA, sem sincronização e sem envio dos laudos. */
(() => {
  "use strict";
  const ui = window.tutuV2, demo = new URLSearchParams(location.search).get("demo") === "corretor";
  const $ = id => document.getElementById(id), el = ui.el, button = ui.button;
  const foldText = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const signature = /^\s*Dr(?:\(a\)|a)?\.?\s*:\s*([^\r\n]+)/im;
  const semChefe = "chefe não identificado";
  let pares = [], selecionado = "", lado = false, ladoAmplo = false, busy = false, banco;
  const cache = new WeakMap(), T = window.tutuSite, G = T?.gh;
  let indice = [], lidos = {}, lidosRemoto = {}, lidosSha = null, ghBusy = false, filaLidos = Promise.resolve();
  const pendentes = new Map(), cachePares = new Map(), falhas = new Set(), carregando = new Set();

  function normalizar(d) {
    if (!d || typeof d !== "object" || !["capturado_em", "final", "preliminar", "chefe", "titulo"].every(k => typeof d[k] === "string") ||
        !["string", "number"].includes(typeof d.id) || !String(d.id).trim() ||
        (typeof d.id === "number" && !Number.isSafeInteger(d.id)) || !Number.isSafeInteger(d.seq) ||
        !/^\d{4}-\d\d-\d\dT/.test(d.capturado_em) || !Number.isFinite(Date.parse(d.capturado_em)) ||
        !d.final.trim() || !d.preliminar.trim() || (d.acesso !== undefined &&
        (typeof d.acesso !== "string" || (d.acesso !== "" && !/^\d{8}$/.test(d.acesso))))) throw new Error("Par inválido");
    return { id: String(d.id), seq: d.seq, capturado_em: d.capturado_em, final: d.final, preliminar: d.preliminar,
      acesso: d.acesso ?? "",
      chefe: d.chefe.trim() || d.final.match(signature)?.[1].trim() || "",
      titulo: d.titulo.trim() || d.final.split(/\r?\n/).find(l => l.trim())?.trim() || "Sem título" };
  }
  /* Par do repo de dados (FORMATO-PARES.md) na forma interna; o contrato guarda texto puro de cada lado. */
  function deContrato(d) {
    const t = x => (x && typeof x.texto === "string" ? x.texto : ""), h = x => (x && typeof x.html === "string" ? x.html : "");
    const aguardando = d?.status === "aguardando";   // sem definitivo do chefe ainda: só o preliminar
    if (!d || !/^\d{4,}$/.test(String(d.acesso)) || !t(d.preliminar).trim() || (!aguardando && !t(d.definitivo).trim())) throw new Error("Par inválido");
    const final = t(d.definitivo);
    return { aguardando, preHtml: h(d.preliminar), finalHtml: h(d.definitivo), id: String(d.acesso), seq: 0, capturado_em: String(d.capturadoEm || d.aprovadoEm || d.data + "T12:00:00Z"), final, preliminar: t(d.preliminar), acesso: String(d.acesso),
      chefe: String(d.chefe || "").trim() || final.match(signature)?.[1].trim() || "", titulo: String(d.exame || d.descricaoPacs || "Sem título").trim() };
  }
  function lerJSONL(texto) {
    const res = { pares: [], puladas: 0 };
    const linhas = texto.replace(/^\uFEFF/, "").split(/\r?\n/);
    if (linhas.at(-1) === "") linhas.pop(); // quebra final de arquivo não é uma linha inválida
    for (const linha of linhas) {
      try { res.pares.push(normalizar(JSON.parse(linha))); } catch (_) { res.puladas++; }
    }
    return res;
  }
  function tipo(p) {
    const t = foldText(p.titulo);
    if (/\b(usg|us|ultrassom|ultrassonografia|doppler)\b/.test(t)) return "USG";
    if (/\b(tc|tomografia)\b/.test(t)) return "TC";
    if (/\b(rm|ressonancia)\b/.test(t)) return "RM";
    return "Outros";
  }
  function secoes(texto) {
    const out = {}, linhas = texto.replace(/\r/g, "").split("\n");
    let nome = "Texto";
    for (const linha of linhas) {
      if (signature.test(linha)) break; // assinatura não é correção do conteúdo clínico
      // Tags simples e marcação Markdown dos cabeçalhos são opcionais.
      const heading = foldText(linha.replace(/<\/?[bui]>/gi, "").replace(/[*_#]/g, "").trim()).replace(/:$/, "").trim();
      if (["achados", "conclusao", "achados adicionais"].includes(heading)) {
        nome = heading === "conclusao" ? "Conclusão" : heading === "achados" ? "Achados" : "Achados adicionais";
        out[nome] ||= [];
      } else { (out[nome] ||= []).push(linha); }
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join("\n").trim()]));
  }
  const palavras = t => t.trim().split(/\s+/).filter(Boolean).length;
  function vizinho(n, direcao) {
    let v = n[direcao];
    while (v?.nodeType === Node.TEXT_NODE && !v.textContent.trim()) v = v[direcao];
    return v?.nodeType === Node.ELEMENT_NODE ? v : null;
  }
  function analisar(p) {
    if (cache.has(p)) return cache.get(p);
    const a = secoes(p.preliminar), b = secoes(p.final), sections = [], changes = [];
    let removidas = 0, adicionadas = 0;
    for (const nome of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const antes = a[nome] || "", depois = b[nome] || "";
      if (!antes && !depois) continue;
      // O mesmo diff por palavra da folha, com seu LCS e agrupamento de edições.
      const seqAntes = editSeq, host = document.createElement("div");
      try { host.innerHTML = wordDiffHtml(antes, depois); } finally { editSeq = seqAntes; }
      let rm = 0, ins = 0;
      for (const n of host.querySelectorAll("del.rm, .chg")) {
        n.removeAttribute("data-e"); n.removeAttribute("title");
        const de = n.matches("del") ? n.textContent.trim() : "";
        const proximo = vizinho(n, "nextSibling"), anterior = vizinho(n, "previousSibling");
        const para = de ? (proximo?.matches(".chg") ? proximo.textContent.trim() : "") : n.textContent.trim();
        if (de) rm += palavras(de); else ins += palavras(para);
        if (de || !anterior?.matches("del")) changes.push({ secao: nome, de, para });
      }
      removidas += rm; adicionadas += ins;
      sections.push({ nome, antes, depois, html: host.innerHTML, rm, ins });
    }
    const res = { sections, changes, removidas, adicionadas };
    cache.set(p, res); return res;
  }

  // Banco exclusivo: não entra no backup/sync do app nem em qualquer serviço externo.
  async function armazenamento(gravar) {
    if (demo) return [];
    banco ||= new Promise((resolve, reject) => {
      const r = indexedDB.open("tutu-corretor", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("pares", { keyPath: "id" });
      r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); resolve(r.result); };
      r.onerror = r.onblocked = () => reject(new Error("Armazenamento local indisponível"));
    });
    const db = await banco;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("pares", gravar ? "readwrite" : "readonly"), store = tx.objectStore("pares");
      let resultado = [];
      if (gravar) gravar.forEach(p => store.put(p));
      else store.getAll().onsuccess = e => { resultado = e.target.result; };
      tx.oncomplete = () => resolve(resultado);
      tx.onerror = tx.onabort = () => reject(new Error("Falha ao salvar os pares neste navegador"));
    });
  }
  function maisRecente(a, b) {
    return Date.parse(a.capturado_em) > Date.parse(b.capturado_em) ||
      (Date.parse(a.capturado_em) === Date.parse(b.capturado_em) && a.seq >= b.seq);
  }
  function deduplicar(lista) {
    const porId = new Map();
    for (const p of lista) {
      const old = porId.get(p.id);
      if (!old || maisRecente(p, old)) porId.set(p.id, p);
    }
    const semAcesso = [], porAcesso = new Map();
    for (const p of porId.values()) {
      if (!p.acesso) { semAcesso.push(p); continue; }
      const old = porAcesso.get(p.acesso);
      if (!old || maisRecente(p, old)) porAcesso.set(p.acesso, p);
    }
    return [...semAcesso, ...porAcesso.values()];
  }
  async function receber(res, origem) {
    pares = deduplicar([...pares, ...res.pares]);
    let salvo = demo ? "Demonstração: só em memória." : "Salvo neste navegador.";
    try { await armazenamento(pares); } catch (_) { salvo = "Só em memória: não foi possível salvar neste navegador."; }
    status.textContent = `${origem}: ${res.pares.length} pares; ${res.puladas} linha(s) pulada(s). ${salvo}`;
    filtros(); render();
  }
  async function carregar() {
    if (demo || busy) return;
    busy = true; atualizar.disabled = true;
    const ctl = new AbortController(), timeout = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch("http://127.0.0.1:47831/corretor/pares", { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) throw new Error("Ponte indisponível");
      const d = await r.json();
      if (!Array.isArray(d.pares) || !Number.isSafeInteger(d.puladas) || d.puladas < 0) throw new Error("Resposta inválida");
      const res = { pares: [], puladas: d.puladas };
      for (const p of d.pares) { try { res.pares.push(normalizar(p)); } catch (_) { res.puladas++; } }
      await receber(res, "Ponte local");
    } catch (_) { status.textContent = "Ponte indisponível. Os pares salvos continuam disponíveis; use Importar pares.jsonl."; }
    finally { clearTimeout(timeout); busy = false; atualizar.disabled = false; }
  }

  const tab = button("Corretor", () => ui.panel("Corretor"), { id: "rightTabCorretor", role: "tab", "aria-controls": "rightPanelCorretor", "aria-selected": "false" });
  const panel = ui.panels.Corretor = el("section", { id: "rightPanelCorretor", role: "tabpanel", "aria-labelledby": tab.id, class: "v2-panel" });
  panel.hidden = true;
  /* Painel flutuante grande (<dialog> modal): a aba continua existindo, mas o conteúdo abre sobre a tela. Esc/× fecham e voltam à 1ª aba. */
  const flutuante = el("dialog", { id: "corretorFlutuante", class: "corretor-flutuante", "aria-labelledby": "corretorTitulo" });
  $("rightTabs").append(tab); flutuante.append(panel); document.body.append(flutuante);
  const outraAba = () => Object.keys(ui.panels).find(n => ui.panels[n] !== panel);
  const fecharFlutuante = () => { if (!panel.hidden && outraAba()) ui.panel(outraAba()); else if (flutuante.open) flutuante.close(); };
  const cabecalho = el("header", { class: "corretor-cab" });
  cabecalho.append(el("h2", { id: "corretorTitulo" }, "Corretor · preliminar × definitivo"), button("×", fecharFlutuante, { id: "corretorFechar", class: "corretor-fechar", "aria-label": "Fechar Corretor", title: "Fechar (Esc)" }));
  flutuante.addEventListener("close", () => { if (!panel.hidden) fecharFlutuante(); });
  flutuante.addEventListener("click", ev => { if (ev.target === flutuante) fecharFlutuante(); });
  const sincronizar = () => { if (!panel.hidden && !flutuante.open) flutuante.showModal(); else if (panel.hidden && flutuante.open) flutuante.close(); };
  new MutationObserver(sincronizar).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  const actions = el("div", { class: "corretor-actions" });
  const ghBtn = button("Atualizar do GitHub", () => carregarGh(), { id: "corretorGh" });
  const atualizar = button("Carregar da ponte", carregar, { id: "corretorCarregar" });
  const input = el("input", { type: "file", accept: ".jsonl,application/json,text/plain", id: "corretorArquivo", hidden: "" });
  input.onchange = async () => {
    const file = input.files[0]; if (!file || busy) return;
    busy = true; atualizar.disabled = true;
    try { await receber(lerJSONL(await file.text()), "Importação"); }
    catch (_) { status.textContent = "Não foi possível ler o arquivo selecionado."; }
    finally { input.value = ""; busy = false; atualizar.disabled = false; }
  };
  actions.append(ghBtn, atualizar, button("Importar pares.jsonl", () => input.click(), { id: "corretorImportar" }), input);
  const ghStatus = el("p", { id: "corretorGhStatus", role: "status" }, "GitHub: ainda não carregado.");
  const status = el("p", { id: "corretorStatus", role: "status" });
  const filters = el("div", { class: "corretor-actions" });
  function select(id, label, options) {
    const wrapper = el("label", {}, label + " "), s = el("select", { id });
    options.forEach(([v, t]) => s.append(el("option", { value: v }, t)));
    s.onchange = render; wrapper.append(s); filters.append(wrapper); return s;
  }
  const chefe = select("corretorChefe", "Chefe", [["", "Todos"]]);
  const exame = select("corretorTipo", "Exame", [["", "Todos"]]);
  const periodo = select("corretorPeriodo", "Período", [["0", "Tudo"], ["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"]]);
  const lidoSel = select("corretorLido", "Leitura", [["", "Todos"], ["nao", "Não lidos"], ["lido", "Lidos"]]);
  const ordem = select("corretorOrdem", "Ordenar", [["data", "Data (recentes)"], ["mudado", "Com alterações primeiro"]]);
  const acesso = el("input", { id: "corretorAcesso", type: "search", size: "14", placeholder: "Acesso, exame, chefe", "aria-label": "Buscar por acesso, exame ou chefe" });
  acesso.oninput = render;
  const buscaAcesso = el("label", {}, "Busca "); buscaAcesso.append(acesso); filters.append(buscaAcesso);
  const lista = el("div", { id: "corretorLista" }), detalhe = el("div", { id: "corretorDetalhe" });
  const amplo = el("dialog", { id: "corretorAmplo", class: "corretor-amplo", "aria-labelledby": "corretorAmploTitulo" });
  const amploConteudo = el("div", { id: "corretorAmploConteudo" });
  amplo.append(button("Fechar", () => amplo.close(), { id: "corretorAmploFechar" }), amploConteudo);
  panel.append(amplo);
  const panorama = el("div", { id: "corretorPanorama" });
  const esq = el("div", { class: "corretor-esq" }), dir = el("div", { class: "corretor-dir" });
  esq.append(actions, ghStatus, status, filters, el("p", { class: "meta" },
    "Estatísticas contam em quantos exames o trecho aparece (sem acento, caixa ou pontuação; números viram #). Assinatura excluída. Frequência de edição não indica erro clínico."), lista);
  dir.append(detalhe, panorama);
  panel.prepend(cabecalho); panel.append(esq, dir);

  /* Itens da lista: índice do GitHub (par baixado sob demanda) + pares locais (ponte/arquivo), todos com a mesma forma. */
  const dia = s => /^\d{4}-\d\d-\d\d/.test(String(s || "")) ? String(s).slice(0, 10) : "";
  const dataBR = d => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "sem data";
  /* Grupo "mesmo laudo" (indice.json: acessos + descricoes): um item, vários acessos. Sem o campo, é só o acesso. */
  const acessosDe = it => { const l = Array.isArray(it.acessos) ? it.acessos.map(String).filter(a => /^\d{4,}$/.test(a)) : []; return l.length > 1 && l.includes(it.acesso) ? l : [it.acesso]; };
  const rotuloAcessos = i => (i.acessos?.length > 1 ? i.acessos.join(" + ") : i.acesso);
  const lidoDe = i => Boolean(i.acessos?.some(a => lidos[a]));
  function alternarLidoItem(i) { const novo = !lidoDe(i); for (const a of i.acessos) if (Boolean(lidos[a]) !== novo) alternarLido(a); }
  function itens() {
    const locais = new Map(pares.filter(p => p.acesso).map(p => [p.acesso, p])), vistos = new Set(), out = [];
    aguardandoN = 0;
    for (const it of indice) {
      vistos.add(it.acesso);
      const aguardando = it.status === "aguardando"; if (aguardando) aguardandoN++;   // sem definitivo: lista só o preliminar
      out.push({ aguardando, id: it.acesso, acesso: it.acesso, acessos: acessosDe(it), descricoes: Array.isArray(it.descricoes) ? it.descricoes.map(String) : [], data: dia(it.data) || dia(it.capturadoEm), chefe: String(it.chefe || "").trim(), exame: it.exame || it.categoria || "Outros",
        categoria: it.categoria || "", mudou: it.mudou !== false, titulo: it.exame || "Sem título", cap: String(it.capturadoEm || ""), seq: 0, par: cachePares.get(it.acesso) || locais.get(it.acesso) || null });
    }
    for (const p of pares) if (!(p.acesso && vistos.has(p.acesso)))
      out.push({ id: p.id, acesso: p.acesso, acessos: p.acesso ? [p.acesso] : [], descricoes: [], data: dia(p.capturado_em), chefe: p.chefe, exame: tipo(p), categoria: "", mudou: true, titulo: p.titulo, cap: p.capturado_em, seq: p.seq, par: p });
    return out;
  }
  function filtros() {
    const its = itens();
    const refaz = (s, valores) => {
      const atual = s.value; s.replaceChildren(el("option", { value: "" }, "Todos"));
      valores.forEach(([v, t]) => s.append(el("option", { value: v }, t)));
      s.value = [...s.options].some(o => o.value === atual) ? atual : "";
    };
    refaz(chefe, [...new Set(its.map(i => i.chefe))].sort().map(n => [n || "__sem__", n || semChefe]));
    refaz(exame, [...new Set(its.map(i => i.exame))].sort().map(x => [x, x]));
  }
  function recorte() {
    const termo = foldText(acesso.value.trim()), dias = Number(periodo.value), corte = Date.now() - dias * 864e5;
    return itens().filter(i => (!chefe.value || (i.chefe || "__sem__") === chefe.value) && (!exame.value || i.exame === exame.value) &&
      (!dias || (i.data && Date.parse(i.data + "T12:00:00") >= corte)) &&
      (!lidoSel.value || (lidoSel.value === "lido") === Boolean(i.acesso && lidoDe(i))) &&
      (!termo || foldText([...i.acessos, ...i.descricoes, i.exame, i.chefe, i.categoria, i.titulo].join(" ")).includes(termo)));
  }

  /* GitHub: índice leve + lidos.json; cada par só é baixado ao abrir (ou em "Carregar os restantes"). */
  const ghMsg = e => e?.offline ? "sem rede" : e?.limite ? "limite de requisições do GitHub" : e?.auth ? "a chave não tem acesso ao repositório" : e?.semChave ? "sem chave" : "indisponível";
  async function carregarGh() {
    if (demo || ghBusy) return false;
    if (!G?.token) { ghStatus.textContent = "GitHub: sem chave (Configurações › Sincronização). Use a ponte ou o arquivo."; return false; }
    ghBusy = true; ghBtn.disabled = true;
    try {
      const r = await G.getJson("preliminares/indice.json");
      if (!r) { ghStatus.textContent = "GitHub: ainda não há preliminares/indice.json no repositório."; return false; }
      indice = (Array.isArray(r.json?.itens) ? r.json.itens : []).filter(i => i && /^\d{4,}$/.test(String(i.acesso))).map(i => ({ ...i, acesso: String(i.acesso) }));
      const l = await G.getJson("preliminares/lidos.json");
      lidosSha = l?.sha || null; lidosRemoto = { ...(l?.json?.lidos || {}) }; lidos = { ...lidosRemoto };
      for (const [ac, novo] of pendentes) { if (novo) lidos[ac] ||= new Date().toISOString(); else delete lidos[ac]; }
      ghStatus.textContent = `GitHub: ${indice.length} exames no índice; ${Object.keys(lidos).length} lidos.`;
      filtros(); render(); return true;
    } catch (e) { ghStatus.textContent = "GitHub: " + ghMsg(e) + ". Os pares já abertos continuam aqui; a ponte e o arquivo seguem valendo."; return false; }
    finally { ghBusy = false; ghBtn.disabled = false; }
  }
  async function carregarPar(i) {
    if (!G?.token || cachePares.has(i.acesso) || falhas.has(i.id) || carregando.has(i.id)) return;
    carregando.add(i.id);
    try {
      const r = await G.getJson("preliminares/pares/" + i.acesso + ".json");
      if (!r) throw new Error("sem par");
      cachePares.set(i.acesso, deContrato(r.json));
    } catch (_) { falhas.add(i.id); }
    finally { carregando.delete(i.id); }
  }
  async function carregarTodos() {
    const fila = recorte().filter(i => !i.aguardando && !i.par && i.acesso && !falhas.has(i.id)), total = fila.length;
    if (!total || !G?.token) return;
    let feitos = 0;
    const trabalhador = async () => { for (let i = fila.shift(); i; i = fila.shift()) { await carregarPar(i); ghStatus.textContent = `GitHub: baixando pares ${++feitos}/${total}…`; } };
    await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
    ghStatus.textContent = `GitHub: ${total} pares baixados.`; render();
  }
  /* ✓ lido: grava preliminares/lidos.json com sha; conflito (409/422) relê o remoto e refaz só esta marcação. */
  function alternarLido(ac) {
    const novo = !lidos[ac];
    if (novo) lidos[ac] = new Date().toISOString(); else delete lidos[ac];
    render();
    if (!G?.token) { ghStatus.textContent = "Lido marcado só nesta tela (sem chave do GitHub, não foi gravado)."; return; }
    pendentes.set(ac, novo); const stamp = lidos[ac];
    filaLidos = filaLidos.then(() => gravarLido(ac, novo, stamp)).catch(() => {});
  }
  async function gravarLido(ac, novo, stamp) {
    let gravou = false;
    for (let t = 0; t < 4 && !gravou; t++) {
      const base = { ...lidosRemoto }; if (novo) base[ac] = stamp; else delete base[ac];
      try { lidosSha = await G.putJson("preliminares/lidos.json", { versao: 1, lidos: base }, lidosSha, "Corretor: marcar lido"); lidosRemoto = base; gravou = true; }
      catch (e) {
        if (!e.conflito) { ghStatus.textContent = "Não foi possível gravar o lido: " + ghMsg(e) + "."; return; }
        const r = await G.getJson("preliminares/lidos.json").catch(() => null);
        lidosSha = r?.sha || null; lidosRemoto = { ...(r?.json?.lidos || {}) };
      }
    }
    if (gravou) { pendentes.delete(ac); ghStatus.textContent = "Lido gravado no GitHub."; }
    else ghStatus.textContent = "Não foi possível gravar o lido (conflito repetido). Tente de novo.";
  }

  function tabela(host, titulo, headers, rows) {
    host.append(el("h3", {}, titulo));
    if (!rows.length) { host.append(el("p", { class: "meta" }, "Sem alterações neste recorte.")); return; }
    const table = el("table"), head = el("thead"), tr = el("tr"), body = el("tbody");
    headers.forEach(h => tr.append(el("th", { scope: "col" }, h))); head.append(tr);
    for (const row of rows) { const r = el("tr"); row.forEach(t => { const td = el("td"); td.append(t instanceof Node ? t : String(t)); r.append(td); }); body.append(r); }
    table.append(head, body); host.append(table);
  }
  function abrir(i) {
    detalhe.replaceChildren();
    if (!i) { if (amplo.open) amplo.close(); return; }
    if (!i.par) {
      detalhe.append(el("h3", {}, i.titulo), el("p", { class: "meta" }, falhas.has(i.id) ? "Não foi possível carregar este par." : "Carregando o par…"));
      if (!falhas.has(i.id) && !carregando.has(i.id)) carregarPar(i).then(() => { if (selecionado === i.id) render(); });
      return;
    }
    const p = i.par;
    correcao(detalhe, p, false, rotuloAcessos(i));
    detalhe.querySelector("h3").after(button("Tela larga", () => {
      ladoAmplo = lado;
      correcao(amploConteudo, p, true, rotuloAcessos(i));
      amplo.showModal();
    }, { id: "corretorTelaLarga" }));
    if (amplo.open) correcao(amploConteudo, p, true, rotuloAcessos(i));
  }
  /* Laudo com a formatação do PACS: "Corrigido" aberto; preliminar e definitivo recolhidos. null = sem HTML (par antigo) ou grande demais: cai no texto. */
  const abertos = new Map();
  function sub(chave, rotulo, html, aberto, extra = "") {
    const d = el("details", { class: "corretor-sub" + extra }), f = el("div", { class: "corretor-folha" });
    d.open = abertos.has(chave) ? abertos.get(chave) : aberto; f.innerHTML = html;
    d.append(el("summary", {}, rotulo), f); d.addEventListener("toggle", () => abertos.set(chave, d.open));
    return d;
  }
  function laudoHtml(p) {
    const pre = TutuV2Core.htmlSeguro(p.preHtml || "");
    if (p.aguardando) return pre.trim() ? [sub(p.id + "|p", "Laudo preliminar", pre, true), el("p", { class: "corretor-aguarda" }, "Aguardando o definitivo do chefe")] : null;
    if (!pre.trim() || !(p.finalHtml || "").trim()) return null;
    const cor = TutuV2Core.corrigidoHtml(p.preHtml, p.finalHtml);
    if (cor === null) return null;
    const lg = document.createDocumentFragment();   // legenda retirada a pedido do Artur (13/11)
    return [lg, sub(p.id + "|c", "Corrigido", cor, true, " corretor-corrigido"), sub(p.id + "|p", "Laudo preliminar", pre, false), sub(p.id + "|d", "Laudo definitivo", TutuV2Core.htmlSeguro(p.finalHtml), false)];
  }
  function correcao(host, p, larga, rotulo = p.acesso) {
    host.replaceChildren();
    const folhas = laudoHtml(p), mostrarLados = !folhas && (larga ? ladoAmplo : lado);
    host.append(el("h3", larga ? { id: "corretorAmploTitulo" } : {}, p.titulo),
      el("p", { class: "meta" }, `${p.aguardando ? "aguardando o definitivo" : p.chefe || semChefe}${rotulo ? ` · Acesso ${rotulo}` : ""}`));
    if (folhas) { host.append(...folhas); return; }
    if (p.aguardando) return;
    host.append(button(mostrarLados ? "Mostrar correção aplicada" : "Lado a lado", () => {
        if (larga) {
          ladoAmplo = !ladoAmplo; correcao(host, p, true);
          host.querySelector("#corretorAmploLado").focus();
        }
        else { lado = !lado; render(); }
      }, { id: larga ? "corretorAmploLado" : "corretorLado", "aria-pressed": String(mostrarLados) }));
    if (!mostrarLados) { const lg = el("p", { class: "corretor-legenda" }); lg.append(el("del", { class: "rm" }, "apagado pelo chefe"), " ", el("span", { class: "chg" }, "adicionado pelo chefe")); host.append(lg); }
    for (const s of analisar(p).sections) {
      host.append(el("h4", {}, s.nome));
      if (mostrarLados) {
        const cols = el("div", { class: "corretor-lados" });
        for (const [label, t] of [["Preliminar", s.antes], ["Definitivo", s.depois]]) {
          const c = el("div", { class: label === "Preliminar" ? "cl-pre" : "cl-def" }); c.append(el("strong", {}, label), el("pre", {}, t)); cols.append(c);
        }
        host.append(cols);
      } else { const d = el("div", { class: "corretor-diff" }); d.innerHTML = s.html; host.append(d); }
    }
  }
  function semana(iso) {
    const d = new Date(iso); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    return d.toISOString().slice(0, 10);
  }
  function exemplos(ids, porId) {
    const box = el("span", { class: "corretor-exs" });
    ids.forEach((id, k) => {
      const i = porId.get(id); if (!i) return;
      box.append(button(rotuloAcessos(i) || "#" + (k + 1), () => { selecionado = id; render(); detalhe.scrollIntoView?.({ block: "nearest" }); }, { class: "corretor-ex", title: "Abrir este par" }));
    });
    return box;
  }
  let aguardandoN = 0;
  function estatisticas(filtrados) {
    panorama.replaceChildren(el("h2", {}, "Estatísticas do recorte"));
    const base = filtrados.filter(i => !i.aguardando), comPar = base.filter(i => i.par), falta = base.filter(i => !i.par && i.acesso && !falhas.has(i.id)).length;
    panorama.append(el("p", { class: "meta", id: "corretorCobertura" }, `${comPar.length} de ${base.length} exames com texto carregado.` + (aguardandoN ? ` ${aguardandoN} aguardando o definitivo do chefe (o robô completa na próxima coleta).` : "")));
    if (falta && G?.token) panorama.append(button(`Carregar os ${falta} restantes`, carregarTodos, { id: "corretorCarregarTodos" }));
    if (!comPar.length) return;
    const porId = new Map(comPar.map(i => [i.id, i])), analises = comPar.map(i => [i, analisar(i.par)]);
    const st = TutuV2Core.estatisticasMudancas(analises.map(([i, a]) => ({ id: i.id, changes: a.changes })));
    const linhas = (lista, rotulo = o => o.texto) => lista.map(o => [rotulo(o), o.n, exemplos(o.ids, porId)]);
    tabela(panorama, "Seus erros principais (repetidos no recorte)", ["O que os chefes mudaram", "Vezes", "Exemplos"],
      linhas(st.principais, o => (o.tipo === "troca" ? "Trocam: " : "Tiram: ") + o.texto));
    tabela(panorama, "O que os chefes mais tiram", ["Trecho", "Vezes", "Exemplos"], linhas(st.tira));
    tabela(panorama, "O que os chefes mais põem", ["Trecho", "Vezes", "Exemplos"], linhas(st.poe));
    tabela(panorama, "Trocas mais frequentes (A → B)", ["Troca", "Vezes", "Exemplos"], linhas(st.trocas));
    const sections = new Map(), grupos = new Map(), semanas = new Map();
    for (const [i, a] of analises) {
      for (const s of a.sections) { const n = sections.get(s.nome) || [0, 0]; n[0] += s.rm; n[1] += s.ins; sections.set(s.nome, n); }
      const key = JSON.stringify([i.chefe || semChefe, i.exame]); grupos.set(key, (grupos.get(key) || 0) + 1);
      if (i.data) { const w = semana(i.data + "T12:00:00Z"); semanas.set(w, (semanas.get(w) || 0) + 1); }
    }
    tabela(panorama, "Conclusão × Achados", ["Seção", "Palavras apagadas", "Adicionadas"], [...sections].map(([k, n]) => [k, ...n]));
    tabela(panorama, "Por chefe e exame", ["Chefe", "Exame", "Pares"], [...grupos].map(([k, n]) => [...JSON.parse(k), n]));
    tabela(panorama, "Evolução semanal (início segunda, UTC)", ["Semana", "Pares"], [...semanas].sort().map(([k, n]) => [k, n]));
  }
  function render() {
    const filtrados = recorte();
    filtrados.sort((a, b) => (ordem.value === "mudado" ? Number(b.mudou && !b.aguardando) - Number(a.mudou && !a.aguardando) : 0) || (b.data || "").localeCompare(a.data || "") || b.cap.localeCompare(a.cap) || b.seq - a.seq);
    lista.replaceChildren(el("h3", {}, `${filtrados.length} pares`));
    if (!filtrados.some(i => i.id === selecionado)) selecionado = filtrados[0]?.id || "";
    for (const i of filtrados) {
      const linha = el("div", { class: "corretor-linha" }), b = button("", () => { selecionado = i.id; render(); }, { class: "corretor-par", "aria-pressed": String(i.id === selecionado) });
      b.append(el("span", { class: "cp-t" }, i.titulo),
        el("span", { class: "cp-m" }, `${dataBR(i.data)} · ${i.chefe || semChefe}${i.acesso ? ` · Acesso ${rotuloAcessos(i)}` : ""}${i.aguardando ? " · aguardando definitivo" : i.mudou ? "" : " · sem mudanças"}`));
      linha.append(b);
      if (i.acesso) { const lido = lidoDe(i); linha.append(button("✓", () => alternarLidoItem(i), { class: "corretor-lido", "aria-pressed": String(lido), "aria-label": (lido ? "Marcar como não lido: acesso " : "Marcar como lido: acesso ") + rotuloAcessos(i), title: lido ? "Lido (clique para desmarcar)" : "Marcar como lido" })); }
      lista.append(linha);
    }
    abrir(filtrados.find(i => i.id === selecionado));
    estatisticas(filtrados);
  }
  function demonstracao() {
    return [
      ["USG Doppler venoso", "Veias compressíveis. Fluxo normal.", "Veias compressíveis. Fluxo preservado.", "Sem trombose."],
      ["TC abdome", "Fígado de contornos normais. Parênquima normal.", "Fígado de contornos normais. Parênquima preservado.", "Sem alterações abdominais."],
      ["TC crânio", "Ventrículos de dimensões habituais. Parênquima normal.", "Ventrículos de dimensões habituais. Parênquima preservado.", "Sem alterações agudas."]
    ].map(([titulo, antes, depois, conc], i) => normalizar({ id: "demo-" + i, seq: i + 1, acesso: `9900000${i + 1}`, capturado_em: `2026-11-0${8 - i * 2}T12:00:00Z`, chefe: "", titulo: "",
      preliminar: `${titulo}\nAchados\n${antes}\nConclusão\n${conc}`,
      final: `${titulo}\nAchados\n${depois}\nConclusão\n${conc}\nDr(a).:Chefe sintético ${i % 2 + 1}` }));
  }
  // Carrega o disco local apenas ao abrir a aba; demo não lê nem grava IndexedDB.
  let iniciado = false;
  const observer = new MutationObserver(async () => {
    if (panel.hidden || iniciado) return;
    iniciado = true;
    if (demo) { atualizar.disabled = ghBtn.disabled = true; await receber({ pares: demonstracao(), puladas: 0 }, "Demonstração"); return; }
    try { pares = deduplicar((await armazenamento()).map(normalizar)); filtros(); render(); }
    catch (_) { status.textContent = "Armazenamento local indisponível; importações ficarão só em memória."; }
    if (!(await carregarGh())) await carregar();   // GitHub primeiro; a ponte local é a alternativa
  });
  observer.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  T?.onChave?.(() => { if (iniciado && !demo) carregarGh(); });
  if (demo) ui.panel("Corretor");
})();

/* USG do celular: texto filtrado na fila; organização local, sem IA. */
(function (root) {
  "use strict";
  const palavras = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z]+/g) || [];
  function anonimizar(texto, cfg = {}) {
    if (typeof texto !== "string" || texto.length > 80000) throw Error("bloqueado: possível dado de paciente");
    const vocab = new Set(palavras(["informações clínicas técnica de exame achados conclusão fígado sem alterações fluxo trifásico estenose de vps cm s cisto medindo artéria femoral superficial direita esquerda com placa anos idade a da do dos das e", ...(cfg.vocab || []), ...(cfg.vocabExame || []), cfg.mask || "", ...(cfg.banco || [])].join(" ")));
    const mes = "(?:janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)";
    const numero = "(?:um|uma|dois|duas|três|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)";
    const dia = "(?:\\d{1,2}|primeiro|" + numero + "(?:\\s+e\\s+" + numero + ")?)";
    const ano = "(?:\\d{4}|(?:dois\\s+mil|mil\\s+novecentos)(?:\\s+(?:e\\s+)?" + numero + ")*)";
    let t = texto.replace(/\0/g, "")
      .replace(/\b(?:paciente|sr|sra|senhor|senhora)\b(?:\(a\))?\.?\s*[:=-]?\s*[^\n;.!?]+/gi, "[identidade]")
      .replace(/^\s*(?:dr(?:\(a\)|a)?\.?|médico|solicitante|assinatura|crm)\s*:?.*$/gim, "[assinatura]")
      .replace(/\b\d{4}-\d{2}-\d{2}(?:T[\d:.Z+-]+)?\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, "[data]")
      .replace(new RegExp("\\b" + dia + "\\s+de\\s+" + mes + "(?:\\s+(?:de\\s+)?" + ano + ")?\\b", "gi"), "[data]");
    const desconhecidos = trecho => {
      let n = 0;
      for (const p of palavras(trecho)) {
        if (/^(?:da|de|do|dos|das|e)$/.test(p)) continue;
        n = vocab.has(p) ? 0 : n + 1;
        if (n >= 2) return true;
      }
      return false;
    };
    // 12/11/2026: em vez de bloquear tudo, remove só a frase suspeita. Idade = "45 anos" ou "62a" colado ("50 a 69%" é faixa).
    const limpa = f => f.replace(/\[(?:identificador|identidade|data|assinatura|removido)\]/g, "");
    const remover = (texto, suspeita) => texto.split(/(?<=[.!?;\n])/).map(f => {
      if (!suspeita(limpa(f))) return f;
      const m = f.match(/^(\s*)[\s\S]*?([.!?;]?\s*)$/);
      return m[1] + "[removido]" + m[2];
    }).join("");
    t = remover(t, f => {
      for (const m of f.matchAll(/\b\d{1,3}(?:\s*anos?\b|a\b)/gi))
        if (desconhecidos(f.slice(0, m.index)) || desconhecidos(f.slice(m.index + m[0].length))) return true;
      return [...f.replace(/Informações Clínicas|Técnica de exame|Achados|Conclusão/g, "").matchAll(/\b[A-ZÀ-Ý][a-zà-ÿ]+\s+(?:(?:da|de|do|dos|das)\s+)?[A-ZÀ-Ý][a-zà-ÿ]+\b/g)].some(m => desconhecidos(m[0]));
    });
    t = t.replace(/\b(?=[a-z\d-]*[a-z])(?=[a-z\d-]*\d)[a-z\d]+(?:-[a-z\d]+)*\b/gi, "[identificador]")
      .replace(/(?:\+?55[\s-]*)?\(?\b\d{2}\)?[\s-]*\d{4,5}[\s-]?\d{4}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\d{6,}/g, "[identificador]")
      .replace(/\b(?:acesso|prontu[aá]rio|cpf)\s*[:#=-]?\s*(?:\[identificador\]|[\d .-]+)/gi, "[identificador]");
    t = remover(t, f => /@|\b(?:nome|identifica[cç][aã]o|benefici[aá]rio|nascimento|telefone|celular|endere[cç]o|rg|cns|acesso|prontu[aá]rio|cpf)\s*[:#=]?\s*\S|\b\d{6,}\b|\b\d{2,}(?:[ .-]\d{2,}){2,}\b/i.test(f));
    return t.trim();
  }
  const normalizar = (t, cfg) => (root.TutuV2Core?.fixFala || String)(root.usgVoice.posTexto(root.usgVoice.punct(t), cfg));
  const prioridade = e => /arterial.*(?:inferior|mmii)/i.test(e.name) ? 0 : /car[oó]tid/i.test(e.name) ? 1 : /abd[oô]m/i.test(e.name) ? 2 : 3;
  const examesUSG = list => list.filter(e => /\busg\b|ultrass|doppler|ecograf/i.test([e.name, e.code, e.mask?.split("\n")[0]].join(" "))).sort((a, b) => prioridade(a) - prioridade(b));
  const api = { anonimizar, normalizar, examesUSG };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TutuUSG = api;
})(globalThis);

(() => {
  "use strict";
  if (typeof document === "undefined") return;
  const ui = window.tutuV2, T = window.tutuSite, G = T.gh, U = window.TutuUSG, el = ui.el, button = ui.button;
  let speech = null, ouvindo = false, busy = false, listBusy = false;
  const ANDROID = /Android/i.test(navigator.userAgent);
  /* Tela acesa enquanto grava (Wake Lock); o navegador solta ao trocar de app, então pede de novo ao voltar. */
  let tela = null;
  const manterTela = async () => { try { if (ouvindo && !tela && navigator.wakeLock && document.visibilityState === "visible") { tela = await navigator.wakeLock.request("screen"); tela.addEventListener("release", () => { tela = null; }); } } catch (_) { tela = null; } };
  const soltarTela = () => { try { tela?.release(); } catch (_) {} tela = null; };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") manterTela(); });
  const msg = el("p", { id: "usgMsg", role: "status", "aria-live": "polite" });
  const dizer = t => { msg.textContent = t; };
  const dialog = el("dialog", { id: "usgDialog", "aria-labelledby": "usgTitulo" });
  const exame = el("select", { id: "usgExame", "aria-label": "Exame" });
  const texto = el("textarea", { id: "usgTexto", rows: "9", "aria-label": "Achados ditados", placeholder: "Dite somente os achados, sem identificação do paciente. Você pode editar aqui." });
  const parcial = el("p", { id: "usgParcial", "aria-live": "polite" });
  const ICONE_MIC = '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>';
  const ICONE_PARAR = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>';
  const iniciar = button("", () => { try { captar(); } catch (e) { stop(); dizer(e.message); } }, { id: "usgIniciar", class: "usg-mic-btn", "aria-label": "Iniciar áudio", title: "Iniciar áudio" }); iniciar.innerHTML = ICONE_MIC;
  const parar = button("", () => stop(), { id: "usgParar", class: "usg-mic-btn usg-parar", "aria-label": "Parar", title: "Parar" }); parar.innerHTML = ICONE_PARAR; parar.disabled = true;
  const enviar = button("Enviar para a IA", () => enviarPedido(), { id: "usgEnviar" });
  const estado = el("p", { id: "usgEstado", "aria-live": "polite" }), contador = el("span", { id: "usgContador" });
  const legenda = el("p", { id: "usgLegenda" }), fechar = button("×", () => { stop(); dialog.close(); }, { id: "usgFechar", "aria-label": "Fechar", title: "Fechar" });
  let enviado = false;
  /* Estado visual único: ouvindo / pausado (com texto) / vazio / enviado. Só estilo e rótulos; a lógica de áudio não passa por aqui. */
  function atualizarUI() {
    const t = texto.value.trim(), n = t ? t.split(/\s+/).length : 0;
    const k = ouvindo ? "ouvindo" : enviado && !t ? "enviado" : t ? "pausado" : "vazio";
    dialog.dataset.estado = k;
    estado.textContent = { ouvindo: "Ouvindo…", pausado: "Pausado · pronto para enviar", enviado: "Enviado ✓", vazio: "Pronto para ditar" }[k];
    legenda.textContent = ouvindo ? "Toque para parar" : "Toque para ditar";
    contador.textContent = n ? n + (n === 1 ? " palavra" : " palavras") : "";
    enviar.hidden = !t;
    iniciar.style.visibility = ouvindo ? "hidden" : ""; parar.style.visibility = ouvindo ? "" : "hidden";
    iniciar.style.pointerEvents = ouvindo ? "none" : ""; parar.style.pointerEvents = ouvindo ? "" : "none";
  }
  texto.addEventListener("input", () => { enviado = false; atualizarUI(); });
  let escolhaManual = false;
  exame.addEventListener("change", () => { escolhaManual = !!exame.value; exame.classList.toggle("sem-selecao", !exame.value); });
  const exameEscolhido = () => EXAMS.find(e => e.id === exame.value) || TutuV2Core.exameDoTexto(texto.value, EXAMS);
  function preencher() {
    const selected = exame.value; exame.replaceChildren();
    const usg = U.examesUSG(EXAMS); /* USG primeiro, mas todas as máscaras: Áudio não é só ultrassom */
    /* 12/11/2026: começa sem seleção; sem escolha manual, o exame vem do próprio áudio (TutuV2Core.exameDoTexto). */
    exame.append(el("option", { value: "" }, "— diga o exame no áudio —"));
    for (const e of [...usg, ...EXAMS.filter(x => !usg.includes(x))]) exame.append(el("option", { value: e.id }, e.name));
    exame.value = escolhaManual && [...exame.options].some(o => o.value === selected) ? selected : "";
    exame.classList.toggle("sem-selecao", !exame.value);
    if (!exame.options.length) dizer("Nenhuma máscara de USG neste navegador. Sincronize nas Configurações.");
  }
  function config(ex) {
    publishVoice();
    const cfg = JSON.parse($("voiceConfig").textContent), antes = current, ext = extras;
    try { current = ex; extras = []; cfg.vocabExame = vocabExame(); }
    finally { current = antes; extras = ext; }
    cfg.exameAtual = ex.id; return cfg;
  }
  function filtrar(t, ex) {
    return U.anonimizar(t, { ...config(ex), mask: ex.mask, banco: BANK.map(r => r[3] || "") });
  }
  /* Mesmo filtro para o Conversar sem ponte (116): usa o exame aberto na folha (vocabulário), lança "bloqueado" se não puder filtrar. */
  ui.anonimizar = t => filtrar(t, (typeof current !== "undefined" && current) || U.examesUSG(EXAMS)[0] || EXAMS[0] || {});
  function stop() {
    ouvindo = false; const s = speech; speech = null; s?.stop(); soltarTela();
    iniciar.disabled = false; parar.disabled = true; exame.disabled = false; parcial.textContent = ""; if (msg.textContent.startsWith("Ouvindo")) dizer(""); atualizarUI();
  }
  function pedirToque(motivo) {
    if (!dialog.open || !dialog.classList.contains("usg-full")) return;
    dizer(motivo + " Toque em Iniciar áudio para gravar.");
    iniciar.focus();
  }
  function captar() {
    const ex = exameEscolhido() || U.examesUSG(EXAMS)[0] || EXAMS[0]; if (!ex) throw Error("Nenhuma máscara neste navegador. Sincronize nas Configurações.");   // vocabulário; o exame final vem do áudio se não escolhido
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) throw Error("Áudio indisponível neste navegador. Digite os achados ou use um navegador com Web Speech.");
    const s = speech = new Speech(); s.lang = "pt-BR"; s.continuous = true; s.interimResults = true; s.maxAlternatives = 5;
    const cfg = config(ex);
    if (window.SpeechRecognitionPhrase && "phrases" in s) {
      try { s.phrases = [...new Set([...cfg.vocabExame, ...cfg.vocab])].slice(0, 300).map(w => new SpeechRecognitionPhrase(w, cfg.vocabExame.includes(w) ? 5 : 2.5)); } catch (_) {}
    }
    let sessao = "";   // Android repete o acumulado da sessão em cada final: só entra o trecho novo (TutuV2Core.speechDelta)
    s.onstart = () => { sessao = ""; };
    s.onresult = ev => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i], cfg = config(ex), alts = Array.from(r, a => a.transcript);
        let best = usgVoice.bestAlternative(alts[0], alts, cfg);
        if (r.isFinal && ANDROID) { const d = TutuV2Core.speechDelta(sessao, best); sessao = d.sessao; best = d.novo; if (!best) continue; }
        const t = U.normalizar(best, cfg);
        if (r.isFinal) { texto.value += (texto.value && !/\s$/.test(texto.value) ? " " : "") + t; enviado = false; }
        else interim += t;
      }
      parcial.textContent = interim; atualizarUI(); texto.scrollTop = texto.scrollHeight;
    };
    s.onerror = ev => {
      dizer("Voz: " + ev.error);
      if (/not-allowed|audio-capture|service-not-allowed/.test(ev.error)) { stop(); pedirToque("Voz: " + ev.error + "."); }
    };
    s.onend = () => { parcial.textContent = ""; if (ouvindo && speech === s) { try { s.start(); } catch (_) { stop(); } } };
    s.start(); ouvindo = true; manterTela(); iniciar.disabled = true; parar.disabled = false; exame.disabled = true; atualizarUI();
    dizer("Ouvindo em pt-BR. Dite só achados: o reconhecimento pode usar o serviço de voz do navegador.");
  }
  async function enviarPedido() {
    if (busy) return;
    if (ouvindo) { dizer("Pare o ditado antes de enviar."); return; }
    busy = true; enviar.disabled = true;
    try {
      // Nenhuma consulta remota antes de filtrar o texto editado.
      const ex = exameEscolhido();
      if (!ex) throw Error("Não reconheci o exame. Diga no começo do áudio (ex.: \"doppler arterial de membro inferior\", \"parecer de TC de abdome total\") ou escolha no menu.");
      if (!exame.value) dizer("Exame reconhecido no áudio: " + ex.name);
      const fresh = filtrar(texto.value, ex); if (!fresh) throw Error("Dite ou digite os achados.");
      if (!G.token) throw Error("Salve a chave em Configurações › Sincronização.");
      const r = await fetch("https://api.github.com/repos/" + G.repo, { cache: "no-store", headers: { Authorization: "Bearer " + G.token } });
      if (!r.ok || !(await r.json()).private) throw Error("A fila exige o repositório privado de dados.");
      await G.putJson("fila-usg/" + crypto.randomUUID() + ".json", { exame: ex.id, nome: ex.name, mascara: maskOf(ex), modo: "audio", texto: fresh, ia: "pendente", criado: new Date().toISOString() }, null, "USG: texto anônimo");
      texto.value = ""; enviado = true; atualizarUI(); dizer("Enviado ✓ — a IA organiza em ~1 min; o laudo aparece em Laudos Áudio aqui e nos PCs."); await atualizar();
    } catch (e) { dizer(/fetch/i.test(e.message) ? "Rede indisponível. O texto permanece nesta tela para tentar novamente." : e.message); }
    finally { busy = false; enviar.disabled = false; atualizarUI(); }
  }
  const micSlot = el("div", { class: "usg-mic" }), leitura = el("div", { class: "usg-leitura" }), cab = el("div", { class: "usg-cab" }), meta = el("div", { class: "usg-meta" });
  micSlot.append(el("span", { class: "usg-onda", "aria-hidden": "true" }), el("span", { class: "usg-onda usg-onda2", "aria-hidden": "true" }), iniciar, parar);
  leitura.append(texto, parcial);
  cab.append(el("h2", { id: "usgTitulo" }, "Audio"), el("label", { for: "usgExame", class: "usg-sr" }, "Exame"), exame, fechar);
  meta.append(estado, contador);
  dialog.append(cab, el("p", { id: "usgModo", class: "usg-sr" }, "Áudio"), meta, leitura, msg, enviar, micSlot, legenda);
  atualizarUI();
  document.body.append(dialog);
  const abrirDialog = () => { preencher(); if (!dialog.open) dialog.showModal(); };
  $("copiar").after(button("Audio", abrirDialog, { id: "usgOpen" }));
  const temSelecao = () => !!window.getSelection()?.toString() || texto.selectionStart !== texto.selectionEnd;
  const fora = ev => {
    const r = dialog.getBoundingClientRect();
    return ev.target === dialog && (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom);
  };
  let gestoFora = false;
  dialog.addEventListener("pointerdown", ev => { gestoFora = ev.button === 0 && fora(ev) && !temSelecao(); });
  dialog.addEventListener("pointercancel", () => { gestoFora = false; });
  dialog.addEventListener("click", ev => {
    const fechar = gestoFora && fora(ev) && !temSelecao(); gestoFora = false;
    if (fechar) { stop(); dialog.close(); }
  });
  dialog.addEventListener("cancel", stop); dialog.addEventListener("close", stop); window.addEventListener("pagehide", stop);
  if (new URLSearchParams(location.search).get("audio") === "1" || window.matchMedia("(max-width: 760px)").matches) {
    dialog.classList.add("usg-full");
    const abrirAudio = () => {
      if (!ui.initialized) { requestAnimationFrame(abrirAudio); return; }
      abrirDialog();
      try { captar(); } catch (e) { stop(); pedirToque(e.message); }
    };
    requestAnimationFrame(abrirAudio);
  }
  const painel = el("details", { id: "usgInbox" }), cachePedidos = new Map();
  const lista = el("div", { id: "usgLista" }), inboxMsg = el("p", { id: "usgInboxMsg", role: "status" });
  const sugestoes = el("details", { id: "usgSugestoes" });
  painel.append(el("summary", {}, "Laudos Áudio"), button("Atualizar pedidos", () => atualizar()), inboxMsg, lista, sugestoes); ui.center.append(painel);
  let vinculosPendentes = Promise.resolve();
  function mudarVinculos(fn) {
    const tarefa = vinculosPendentes.then(async () => {
      const vinculos = (await T.sync.kvGet("_usg/vinculos")) || {};
      fn(vinculos); await T.sync.kvSet("_usg/vinculos", vinculos);
    });
    vinculosPendentes = tarefa.catch(() => {}); return tarefa;
  }
  function organizar(fresh) {
    const ps = [...sheet.children], hi = ps.findIndex(p => norm(p.textContent) === "achados");
    const ci = ps.findIndex((p, i) => i > hi && norm(p.textContent) === "conclusão");
    if (hi < 0 || ci < 0) throw Error("A máscara precisa das seções Achados e Conclusão.");
    // Topografia derivada dos parágrafos da máscara, sem catálogo paralelo de órgãos.
    const bases = ps.slice(hi + 1, ci).filter(p => p.textContent.trim()).map(p => {
      const prefixo = fold(p.textContent).split(/[:;]|\b(?:com|sem|apresenta\w*|de calibre|de dimens\w*|pervi\w*|calibres?|fluxo\w*)\b/)[0];
      return { p, ts: terms(prefixo, true).filter(t => !/^(arter|segme|estru|paren)$/.test(t)), lado: lado(p.textContent), fs: [] };
    });
    const achados = fresh.replace(/\[(?:identidade|identificador|data|assinatura)\]/g, "").split(/\n+|(?<=[.!?;])\s+/).map(s => s.replace(/^[\s.;,]+|[\s;]+$/g, "")).filter(Boolean);
    const sobras = [], refs = [];
    for (const f of achados) {
      const ts = new Set(terms(f)), lf = lado(f);
      const ranks = bases.map(b => {
        const sc = b.ts.filter(t => ts.has(t)).reduce((s, t) => s + 1 / bases.filter(x => x.ts.includes(t)).length, 0);
        return { b, sc: lf && b.lado && lf !== b.lado ? 0 : sc + (sc && lf && lf === b.lado ? 0.5 : 0) };
      }).sort((a, b) => b.sc - a.sc);
      if (ranks[0]?.sc > 0 && ranks[0].sc > (ranks[1]?.sc || 0)) ranks[0].b.fs.push(f); else sobras.push(f);
      refs.push({ f, frases: pickPhrases(f, 3) });
    }
    for (const b of bases) if (b.fs.length) b.p.innerHTML = '<span class="chg usg-origem">' + esc(b.fs.join(" ")) + '</span>';
    for (const f of sobras) ps[ci].insertAdjacentHTML("beforebegin", P('<span class="chg usg-nao-encaixado" title="Sem topografia única na máscara: revisar">' + esc(f) + '</span>'));
    // É uma máscara recém-aberta: a conclusão normal dela deve dar lugar aos achados recebidos.
    if (achados.length) {
      for (let i = ci + 1; i < ps.length && !isHeading(ps[i].textContent.trim()); i++) ps[i].remove();
      suggestConclusion();
    }
    sugestoes.replaceChildren(el("summary", {}, "Redação sugerida pelo banco — conferir antes de usar"));
    for (const r of refs) if (r.frases.length) { sugestoes.append(el("p", {}, r.f)); for (const s of r.frases) sugestoes.append(el("blockquote", {}, s)); }
    return sobras.length;
  }
  async function abrir(id, d) {
    try {
      if (!ui.initialized || genBusy || corrBusy) throw Error("Aguarde a operação na folha.");
      const ex = EXAMS.find(e => e.id === d.exame); if (!ex) throw Error("Sincronize a máscara deste exame primeiro.");
      const fresh = filtrar(d.texto, ex), antes = ui.activeId(); ui.newTab(ex.id);
      const caso = ui.activeId(), pedido = id;
      if (caso === antes) throw Error("Aguarde a operação na folha.");
      if (d.laudo) {   // laudo organizado pela IA (tools/ia_laudo.py no repo de dados)
        sheet.innerHTML = modelSheetHtml({ ...ex, mask: d.laudo });
        updateCount(); renderAlerts();
        await mudarVinculos(vinculos => { vinculos[caso] = pedido; });
        await ui.flush();
        setStatus("Laudo organizado pela IA. Confira os trechos [<conferir>] e copie.", "ok");
        return;
      }
      const n = organizar(fresh);
      updateCount(); renderAlerts();
      await mudarVinculos(vinculos => { vinculos[caso] = pedido; });
      await ui.flush();
      setStatus("Laudo organizado localmente. Revise os destaques e a conclusão." + (n ? " Há " + n + " achado(s) sem encaixe ao fim de Achados." : ""), "ok");
    } catch (e) { inboxMsg.textContent = e.message; }
  }
  async function apagar(id, sha) {
    const r = await fetch("https://api.github.com/repos/" + G.repo + "/contents/fila-usg/" + id + ".json", {
      method: "DELETE", headers: { Authorization: "Bearer " + G.token, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "USG: remover texto da fila", sha, branch: "main" })
    });
    if (!r.ok && r.status !== 404) throw Error("Não foi possível apagar da fila.");
    cachePedidos.delete(id + ".json");
  }
  /* Aprendizado de voz com a IA: ditado bruto x laudo copiado -> trocas curtas (ex.: "terapublica" -> "poplítea") viram correções de voz.
     Mesma regra de 90-inicio-eventos.js: palavra que já existe no português só vira automática na 2ª vez (learnPairs, limite 2). */
  async function aprenderVoz(ditado, final) {
    const voc = typeof VOCAB !== "undefined" ? VOCAB : [], trocas = TutuV2Core.trocasVoz(ditado, final, voc);
    for (const t of trocas) {
      const ws = fold(t.de).split(/[^a-z0-9]+/).filter(Boolean);
      if (typeof KNOWN !== "undefined" && ws.length && ws.every(w => w.length < 3 || KNOWN.has(w))) await learnPairs([{ de: t.de, para: t.para, antes: t.antes, depois: t.depois, comContexto: true }], 2);
      else await addCorrecao(t.de, t.para);
      if (typeof VOCAB !== "undefined") for (const w of t.para.toLowerCase().split(/[^a-zà-úç-]+/)) if (w.length >= 5 && !VOCAB.includes(w)) VOCAB.unshift(w);
    }
    if (trocas.length) publishVoice();
  }
  /* Aprendizado também nos ajustes da IA fora do Áudio (Conversar com a IA e Gerar): ui.registrarIA(texto) guarda a última versão da IA
     aceita no caso aberto (116 chama depois do diff; applyGenerated, abaixo, no Gerar); ao copiar, se o texto copiado difere dela,
     grava a mesma correção ia/correcoes/<exame>/<id>.json, uma vez por versão. Desfazer a IA esquece a proposta. */
  const propostasIA = new Map();
  const mesmoTexto = (a, b) => String(a).replace(/\s+/g, " ").trim() === String(b).replace(/\s+/g, " ").trim();
  ui.registrarIA = texto => {
    const caso = ui.activeId(), exame = typeof current !== "undefined" ? current?.id : "";
    if (!caso) return;
    if (texto && String(texto).trim()) propostasIA.set(caso, { proposta: texto, exame, id: crypto.randomUUID(), enviada: false }); else propostasIA.delete(caso);
  };
  ui.propostaIA = () => propostasIA.get(ui.activeId())?.proposta || "";
  const gravarCorrecao = (exame, id, proposta, final) => !/^[a-z0-9-]{1,60}$/.test(exame || "") || mesmoTexto(proposta, final) ? Promise.resolve(false)
    : G.putJson("ia/correcoes/" + exame + "/" + id + ".json", { exame, proposta, final, quando: new Date().toISOString() }, null, "IA: correção do Artur").then(() => true, () => false);
  if (typeof applyGenerated === "function") { const antigoGerado = applyGenerated; applyGenerated = (...a) => { const r = antigoGerado(...a); ui.registrarIA(laudoTagged()); return r; }; }
  if (typeof undoAllClaude === "function") { const antigoDesfazer = undoAllClaude; undoAllClaude = (...a) => { ui.registrarIA(null); return antigoDesfazer(...a); }; const b = document.getElementById("undoAllBtn"); if (b) b.onclick = undoAllClaude; }
  const antigoClipboard = copyToClipboard;
  copyToClipboard = async (...args) => {
    const caso = ui.activeId(), finalTexto = laudoTagged(), vinculo = T.sync.kvGet("_usg/vinculos").then(v => ({ id: v?.[caso] }), () => ({ erro: true }));
    const reg = propostasIA.get(caso);
    // Inicia a cópia na folha atual antes que qualquer await permita trocar de aba.
    const ok = await antigoClipboard(...args);
    if (ok && reg && !reg.enviada && !mesmoTexto(reg.proposta, finalTexto)) {
      reg.enviada = true;   // uma vez por versão da IA
      gravarCorrecao(reg.exame, reg.id, reg.proposta, finalTexto).then(g => { if (!g) reg.enviada = false; });
    }
    if (ok) {
      try {
        const { id, erro } = await vinculo;
        if (erro) throw Error("Vínculo indisponível.");
        if (id) {
          const r = await G.getJson("fila-usg/" + id + ".json");
          // Aprendizado: proposta da IA → laudo que o Artur copiou (tools/ia_laudo.py usa nas próximas e no guia).
          // Se a IA ajustou depois (Conversar/Gerar), essa versão é a proposta e já foi gravada acima.
          if (r?.json?.laudo && !reg) await gravarCorrecao(r.json.exame, id, r.json.laudo, finalTexto);
          if (r?.json?.laudo) await aprenderVoz(r.json.texto, finalTexto).catch(() => {});
          if (r) await apagar(id, r.sha);
          await mudarVinculos(vinculos => { if (vinculos[caso] === id) delete vinculos[caso]; }); await atualizar();
        }
      } catch (_) { inboxMsg.textContent = "Laudo copiado; remoção da fila pendente. Copie de novo quando a rede voltar."; }
    }
    return ok;
  };
  async function atualizar() {
    if (listBusy || !G.token) return; listBusy = true;
    try {
      const arquivos = (await G.list("fila-usg")).filter(f => /^[a-f0-9-]{36}\.json$/.test(f.name)), rows = [];
      for (const f of arquivos) {
        let r = cachePedidos.get(f.name);
        if (!r || r.sha !== f.sha) { r = await G.getJson("fila-usg/" + f.name); if (r) cachePedidos.set(f.name, r); }
        if (!r) continue;
        const d = r.json, id = f.name.slice(0, -5), criado = Date.parse(d.criado);
        const expirado = Number.isFinite(criado) && Date.now() - criado >= 30 * 86400000;
        const row = el("div", { class: "usg-pedido", "data-id": id, "data-state": expirado ? "expirado" : "recebido" }), ex = EXAMS.find(e => e.id === d.exame);
        const selo = expirado ? ["expirado", "expirado"] : d.laudo ? ["pronto", "laudo pronto (IA) ✓"] : d.ia === "erro" ? ["erro", "IA falhou (abre organizado localmente)"] : d.ia === "pendente" ? ["pendente", "IA organizando…"] : ["recebido", "recebido"];
        row.append(el("span", { class: "usg-nome" }, ex?.name || "Exame"), el("span", { class: "usg-selo", "data-k": selo[0] }, selo[1]), button("Abrir como exame novo", () => abrir(id, d)), button("Descartar pedido", async () => {
          try { await apagar(id, r.sha); await atualizar(); }
          catch (e) { inboxMsg.textContent = e.message; }
        })); rows.push(row);
      }
      lista.replaceChildren(...rows); inboxMsg.textContent = rows.length ? "Organização neste navegador. Revise antes de copiar." : "Nenhum pedido.";
    } catch (_) { inboxMsg.textContent = "Fila indisponível; confira rede e chave em Sincronização."; }
    finally { listBusy = false; }
  }
  T.onChave(atualizar); setInterval(() => { if (!document.hidden) atualizar(); }, 15000);
  window.addEventListener("focus", atualizar); document.addEventListener("visibilitychange", () => { if (!document.hidden) atualizar(); }); atualizar();
  ui.actions.ditarusg = { label: "Audio", run: abrirDialog }; ui.usg = { atualizar, preencher };
})();

/* Ditado híbrido no PC: a extensão tem prioridade; sem ela, a própria página dita na folha (#laudo).
   Detecção da extensão (sem alterar extensao/):
   - content.js cancela Alt+S em CAPTURA no document (preventDefault + stopPropagation) e o atalho do Chrome
     nem entrega a tecla à página. Por isso o site escuta Alt+S só na fase de BOLHA da window: com a extensão,
     a tecla nunca chega aqui (sem ditado duplicado); se chegou cancelada sem passar pela bolha, é a extensão.
   - qualquer evento laudos-mic/provisorio/final/voz/correcao/ditado sem a marca source=ditado-site vem da
     extensão (ou da ponte): o ditado do site desliga e devolve tudo ao fluxo antigo.
   - laudos-extensao-ping é opcional: se uma versão futura da extensão responder laudos-extensao-pong, a
     detecção passa a valer desde a abertura, mesmo com o microfone desligado.
   Pós-processamento: o mesmo usgVoice do modo Áudio (punct, bestAlternative, posTexto: correções, autotextos,
   macros). Comandos da página saem pelo evento laudos-voz, tratado pelo handler já existente. */
(() => {
  "use strict";
  const ui = window.tutuV2, pill = document.getElementById("voicePill");
  if (!ui || !pill) return;
  const label = document.getElementById("voiceLabel"), originalDictate = ui.dictate;
  const source = "ditado-site", pingTimeout = 180;
  let extension = pill.hasAttribute("data-mic"), checked = extension, engaged = false;
  let on = false, paused = false, speech = null, restart = null, anchor = null, pendingToggle = false;
  const ANDROID = /Android/i.test(navigator.userAgent);
  let tela = null;   // tela acesa enquanto dita (Wake Lock)
  const manterTela = async () => { try { if (on && !tela && navigator.wakeLock && document.visibilityState === "visible") { tela = await navigator.wakeLock.request("screen"); tela.addEventListener("release", () => { tela = null; }); } } catch (_) { tela = null; } };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") manterTela(); });
  let fails = 0, ignoreUntil = 0, lastInsert = null, lastReached = null;
  const note = ui.el("small", { id: "siteDictationNote", title: "Extensão não detectada: o reconhecimento roda nesta página." }, "ditado do site (sem extensão)");
  note.style.cssText = "color:var(--muted);font-size:11px;margin-left:6px"; note.hidden = true; label.after(note);
  const parse = e => { try { return typeof e.detail === "string" ? JSON.parse(e.detail) : e.detail; } catch (_) { return null; } };
  const emit = (name, data) => document.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify({ ...data, source }) }));
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.,;:!?"]/g, " ").replace(/\s+/g, " ").trim();
  const config = () => { try { return JSON.parse(document.getElementById("voiceConfig").textContent) || {}; } catch (_) { return {}; } };
  const destination = () => ({ id: "laudo", caso: anchor?.caseId || ui.activeId() });
  const isAltS = e => e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.code === "KeyS" || String(e.key || "").toLowerCase() === "s");

  /* ---------- pílula ---------- */
  function render() {
    note.hidden = extension || !on;   // aviso só enquanto o motor do site está ligado
    // Antes do primeiro uso do ditado do site a pílula fica inteiramente com 102/106 (fluxo da extensão).
    if (extension || !engaged) return;
    const text = !on ? "Voz · Alt S" : paused ? "Ditado pausado · Alt S" : "Ditando · Alt S", rec = on && !paused;
    if (label.textContent !== text) label.textContent = text;
    if (pill.classList.contains("recording") !== rec) pill.classList.toggle("recording", rec);
    const vc = rec ? ui.activeId() : null;
    if (ui.voiceCase !== vc) { ui.voiceCase = vc; ui.renderTabs?.(); }
  }
  // 102 escreve atividade na pílula ("Texto recebido na folha"...); enquanto o site detém o motor, vale o estado real.
  new MutationObserver(render).observe(label, { childList: true, characterData: true, subtree: true });
  function state() { emit("laudos-mic", { on, paused }); render(); ui.updateHUD?.(); }
  function clearInterim() { emit("laudos-provisorio", { texto: "", destino: destination() }); anchor = null; }
  function stop(publish = true) {
    const was = on || !!speech;
    on = false; paused = false; pendingToggle = false; clearTimeout(restart); restart = null;
    const s = speech; speech = null; try { tela?.release(); } catch (_) {} tela = null;
    // Desliga os callbacks antes de abortar: finais atrasados não entram na folha.
    if (s) { s.onresult = s.onend = s.onerror = null; try { s.abort(); } catch (_) {} }
    if (was) clearInterim(); anchor = null;
    if (publish && was) state(); else render();
  }
  function foundExtension() {
    if (extension) return;
    if (on || speech) stop(true);   // publica "desligado" enquanto ainda é dono da pílula
    extension = true; checked = true; pendingToggle = false; note.hidden = true;
    ui.dictate = originalDictate;
  }
  for (const name of ["laudos-mic", "laudos-provisorio", "laudos-final", "laudos-voz", "laudos-correcao", "laudos-ditado", "laudos-chave", "laudos-tasy", "laudos-treino-status", "laudos-extensao-pong"]) {
    document.addEventListener(name, e => { const d = parse(e); if (d && d.source !== source) foundExtension(); }, true);
  }
  const ping = () => { if (!extension) emit("laudos-extensao-ping", {}); };
  ping();
  setTimeout(() => { checked = true; if (pendingToggle && !extension) { pendingToggle = false; toggle(); } }, pingTimeout);
  window.addEventListener("focus", ping);

  /* ---------- vocabulário (SpeechRecognitionPhrase, como mic.js e o modo Áudio) ---------- */
  function phrases(s, cfg) {
    if (!window.SpeechRecognitionPhrase || !("phrases" in s)) return;
    const exam = cfg.vocabExame || [];
    try { s.phrases = [...new Set([...exam, ...(cfg.vocab || [])])].slice(0, 300)
      .map(w => new SpeechRecognitionPhrase(w, exam.includes(w) ? 5 : 2.5)); } catch (_) {}
  }
  // Novo vocabulário vale a partir da próxima sessão do reconhecedor (reinício em onend).
  const vc = document.getElementById("voiceConfig");
  if (vc) new MutationObserver(() => { if (speech && on) phrases(speech, config()); })
    .observe(vc, { childList: true, characterData: true, subtree: true });

  /* ---------- comandos ---------- */
  // Comandos do microfone (mic.js detectarComando; o build não o leva ao site): fala isolada, nunca no meio do laudo.
  const MIC = { "pausar": "pausar", "pausa": "pausar", "retomar": "retomar", "continuar": "retomar", "reiniciar": "retomar",
    "apagar isso": "apagar_isso", "apaga isso": "apagar_isso", "desfazer": "apagar_isso", "cancelar frase": "cancelar",
    "apagar frase": "apagar_frase", "proximo campo": "proximo_campo", "gerar laudo": "gerar", "gerar o laudo": "gerar" };
  function findExam(spoken, exams) {
    const stop = ["de", "do", "da", "dos", "das", "e", "o", "a", "tc", "tomografia", "computadorizada", "exame", "com", "sem", "contraste"];
    const words = spoken.split(" ").filter(w => w && !stop.includes(w));
    const aliases = ex => [ex.id, ex.nome, ...(ex.voz || [])].filter(Boolean).map(norm);
    return exams.find(e => aliases(e).includes(spoken)) ||
      (words.length ? exams.find(e => aliases(e).some(a => words.every(w => a.split(" ").includes(w)))) : null);
  }
  function runLocal(acao) {
    if (acao === "pausar" || acao === "retomar") { paused = acao === "pausar"; clearInterim(); state(); return true; }
    if (acao === "cancelar") { clearInterim(); ignoreUntil = Date.now() + 4000; return true; }
    if (acao === "apagar_isso") { undoLast(); return true; }
    if (acao === "apagar_frase") {
      const sel = getSelection();
      if (selectLastSentence() && sel.rangeCount && !sel.isCollapsed && sheet.contains(sel.anchorNode)) document.execCommand("delete");
      return true;
    }
    return false;
  }
  function command(text, cfg) {
    const n = norm(text);
    if (!n) return false;
    const cmd = (cfg.commands || []).find(c => norm(c.fala) === n);
    const acao = cmd ? cmd.acao : MIC[n];
    if (acao) {
      if (paused && acao !== "retomar" && acao !== "pausar") return true;   // pausado: só "retomar" vale (como mic.js)
      clearInterim(); if (!runLocal(acao)) emit("laudos-voz", { acao }); return true;
    }
    if (paused) return false;
    if (/^(corrigir|corrige|corrija)( |$)/.test(n)) { setStatus("Correção falada é da extensão. Selecione a palavra e use o ícone de corrigir."); return true; }
    const m = n.match(/^(?:mascaras?|exames?|modelos?) (.+)$/);
    if (!m) return false;
    // "máscara X e máscara Y" / "máscaras X, Y": a primeira abre, as outras entram juntas (add), como na extensão.
    const parts = m[1].split(/ (?:e|mais) (?:(?:a|o) )?(?:(?:mascaras?|exames?|modelos?) )?(?:(?:de|do) )?/).filter(Boolean);
    const found = []; for (const p of parts) { const ex = findExam(p, cfg.exams || []); if (ex && !found.includes(ex)) found.push(ex); }
    if (!found.length) { setStatus("Máscara não encontrada. Confira o nome no painel."); return true; }
    clearInterim(); found.forEach((ex, i) => emit("laudos-voz", { acao: "exame", id: ex.id, add: i > 0 }));
    return true;
  }

  /* ---------- escrita na folha (posição do cursor, como content.js) ---------- */
  function caretRange() {
    const sel = getSelection();
    if (sel.rangeCount && sheet.contains(sel.anchorNode)) return sel.getRangeAt(0).cloneRange();
    if (sheetRange && sheet.contains(sheetRange.startContainer) && sheet.contains(sheetRange.endContainer)) return sheetRange.cloneRange();
    return sheet.lastElementChild ? rangeAtEnd(sheet.lastElementChild) : null;
  }
  function remember() {   // âncora no início da frase: o final entra onde o provisório começou
    if (anchor) return;
    const r = caretRange();
    if (r) anchor = { range: r, caseId: ui.activeId() };
  }
  const MAIUSC = new Set(["hounsfield", "willis", "bosniak", "fleischner", "gleason", "glasgow", "tanner", "sylvius", "wirsung", "santorini", "meckel", "morgagni", "bochdalek",
    "hartmann", "hashimoto", "crohn", "graves", "paget", "parkinson", "alzheimer", "chiari", "dandy", "walker", "borrmann", "tarlov", "rathke", "gerota", "douglas", "glisson",
    "spiegel", "riedel", "caroli", "mirizzi", "zenker", "barrett", "baker", "bankart", "hill", "sachs", "morton", "lisfranc", "chopart", "salter", "harris", "colles", "pott",
    "weber", "pugh", "child", "lauren", "forrest", "virchow", "schmorl", "retzius", "treitz", "kocher", "monro", "covid", "sars"]);
  function pickOption(orig, text) {
    const m = String(orig || "").match(/^\{([^{}]*\|[^{}]*)\}$/);
    if (!m) return null;
    const opts = m[1].split("|").map(o => o.trim()).filter(Boolean), said = norm(text);
    return opts.find(o => norm(o) === said) || opts.find(o => said.includes(norm(o))) || null;
  }
  function insert(text, original, alts, confidence) {
    remember();
    if (!anchor || anchor.caseId !== ui.activeId() || !sheet.contains(anchor.range.commonAncestorContainer)) {
      clearInterim(); setStatus("A folha mudou durante a frase. Posicione o cursor e continue ditando."); return;
    }
    const r = anchor.range, node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const block = node.closest("p,div,li"), container = block && sheet.contains(block) ? block : sheet;
    const before = document.createRange(); before.selectNodeContents(container); before.setEnd(r.startContainer, r.startOffset);
    const after = document.createRange(); after.selectNodeContents(container); after.setStart(r.endContainer, r.endOffset);
    const prior = before.toString().replace(/\u00a0/g, " "), opt = !r.collapsed ? pickOption(r.toString(), text) : null;
    let t = opt !== null ? opt : text;
    if (!prior.trim() || /[.!?:]\s*$/.test(prior)) t = t.charAt(0).toUpperCase() + t.slice(1);
    else {
      const w = (t.match(/^[\p{L}\p{N}][\p{L}\p{N}'’-]*/u) || [])[0] || "", f = norm(w);
      const caps = (config().maiusculas || []).map(norm);
      if (/^\p{Lu}\p{Ll}+$/u.test(w) && !MAIUSC.has(f) && !caps.includes(f)) t = t.charAt(0).toLowerCase() + t.slice(1);
    }
    t = t.replace(/([.!?]\s+|\n)([a-zà-ú])/g, (_, a, b) => a + b.toUpperCase());
    if (prior && !/\s$/.test(prior) && !/^[.,;:!?\n]/.test(t)) t = " " + t;
    if (/^[\p{L}\p{N}]/u.test(after.toString()) && !/\s$/.test(t)) t += " ";
    const dest = destination(), start = offsetOf(sheet, r.startContainer, r.startOffset);
    sheetRange = r.cloneRange();
    insertAtCaret(t);   // execCommand: dispara o input nativo, entra no desfazer do navegador e nas versões
    const sel = getSelection();
    if (sel.rangeCount && sheet.contains(sel.anchorNode)) sheetRange = sel.getRangeAt(0).cloneRange();
    lastInsert = sel.rangeCount && sheet.contains(sel.focusNode)
      ? { caseId: ui.activeId(), start, end: offsetOf(sheet, sel.focusNode, sel.focusOffset) } : null;
    scheduleCaseSave();
    const T = globalThis.TextoV2;
    emit("laudos-final", { texto: t.trim(), original, conf: confidence,
      baixas: T?.palavrasBaixas ? T.palavrasBaixas(t.trim(), alts, original, confidence) : [], destino: dest });
    clearInterim(); render();
  }
  function undoLast() {
    const li = lastInsert; lastInsert = null;
    if (!li || li.caseId !== ui.activeId() || li.end <= li.start) return;
    const r = rangeFromOffsets(sheet, li.start, li.end); if (!r) return;
    sheet.focus({ preventScroll: true });
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.execCommand("delete");
    if (sel.rangeCount && sheet.contains(sel.anchorNode)) sheetRange = sel.getRangeAt(0).cloneRange();
  }

  /* ---------- motor ---------- */
  function audioOpen() { return !!document.getElementById("usgDialog")?.open; }
  function toggle() {
    if (extension) return;
    if (!checked) { pendingToggle = !pendingToggle; return; }
    if (on) { stop(); return; }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition, voice = window.usgVoice;
    if (!Speech || !voice) { setStatus(!Speech ? "Ditado indisponível neste navegador. Use o Chrome (Web Speech) ou a extensão." : "Motor de voz não carregado. Reconstrua o site com tools/build_site.py."); return; }
    if (audioOpen()) { setStatus("Feche o Áudio antes de ditar na folha."); return; }
    engaged = true; fails = 0; paused = false;
    ui.closePalette?.(); focusSheet();
    const s = speech = new Speech();
    s.lang = "pt-BR"; s.continuous = true; s.interimResults = true; s.maxAlternatives = 5;
    phrases(s, config()); on = true;
    let sessao = "";   // Android repete o acumulado da sessão em cada final (TutuV2Core.speechDelta)
    s.onstart = () => { sessao = ""; manterTela(); };
    s.onresult = ev => {
      if (!on || extension || speech !== s) return;
      fails = 0;
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length && on && speech === s; i++) {
        const r = ev.results[i], cfg = config();
        // Mesma ordem da extensão: pontuação falada nas alternativas (mic.js), depois a melhor pelo vocabulário (content.js).
        const alts = []; for (const a of Array.from(r, x => voice.punct(x.transcript || ""))) if (a && !alts.includes(a)) alts.push(a);
        if (!alts.length) continue;
        let best = voice.bestAlternative(alts[0], alts, cfg);
        if (r.isFinal && ANDROID) { const d = TutuV2Core.speechDelta(sessao, best); sessao = d.sessao; best = d.novo; if (!best) { clearInterim(); continue; } }
        if (!r.isFinal) { if (!paused && Date.now() >= ignoreUntil) { remember(); interim += (interim ? " " : "") + best; } continue; }
        if (Date.now() < ignoreUntil) { ignoreUntil = 0; clearInterim(); continue; }
        if (command(best, cfg) || paused) { if (paused) clearInterim(); continue; }
        const text = TutuV2Core.fixFala(voice.posTexto(best, cfg)).trim();
        if (text) insert(text, best, alts, typeof r[0]?.confidence === "number" ? r[0].confidence : null); else clearInterim();
      }
      if (on && speech === s && interim) emit("laudos-provisorio", { texto: interim, destino: destination() });
      render();
    };
    s.onerror = ev => {
      if (speech !== s) return;
      if (/not-allowed|audio-capture|service-not-allowed|language-not-supported/.test(ev.error)) { stop(); setStatus("Voz: " + ev.error + ". Libere o microfone para este site."); }
      else if (ev.error !== "no-speech" && ev.error !== "aborted") fails++;
    };
    s.onend = () => {
      if (speech !== s) return;
      clearInterim();
      if (!on || extension) return;
      if (fails > 5) { stop(); setStatus("Ditado do site parou após erros seguidos. Alt+S para tentar de novo."); return; }
      restart = setTimeout(() => {   // Chrome encerra sessões longas/silenciosas: religa enquanto estiver ligado
        if (!on || extension || speech !== s) return;
        try { phrases(s, config()); s.start(); } catch (e) { stop(); setStatus("Voz: " + e.message); }
      }, 250);
    };
    try { s.start(); state(); } catch (e) { stop(); setStatus("Voz: " + e.message); }
  }

  /* ---------- Alt+S, F1, paleta e botão "F1 · Ditar" ---------- */
  // Captura: só observa. Se a tecla foi cancelada e não chegou à bolha, outro dono (content.js) a consumiu.
  window.addEventListener("keydown", e => {
    if (extension || !isAltS(e)) return;
    setTimeout(() => { if (!extension && lastReached !== e && e.defaultPrevented) foundExtension(); }, 0);
  }, true);
  window.addEventListener("keydown", e => {
    if (extension || !isAltS(e)) return;
    lastReached = e; checked = true;
    // Sem checar defaultPrevented: o handler antigo da página (document, bolha) já cancela Alt+S só para
    // manter o foco na folha. Quem consome a tecla de verdade (content.js) para a propagação e ela não chega aqui.
    e.preventDefault();               // não insere caractere (ex.: Option+S no Mac)
    if (!e.repeat) toggle();
  });
  ui.dictate = () => {
    if (extension) return originalDictate();
    ui.closePalette?.(); focusSheet();
    // Mesmo caminho do 102: com a extensão (content.js) a tecla sintética liga o microfone dela.
    const ev = new KeyboardEvent("keydown", { key: "s", code: "KeyS", altKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    if (!extension && lastReached !== ev) { foundExtension(); label.textContent = "Comando enviado · Alt S"; }
  };
  // O modo Áudio usa outro reconhecedor: os dois não podem disputar o microfone.
  document.addEventListener("click", e => { if (on && e.target.closest?.("#usgOpen")) stop(); }, true);
  window.addEventListener("pagehide", () => { if (!extension) stop(false); });
  ui.siteDictation = { get on() { return on; }, get extension() { return extension; }, toggle: () => ui.dictate() };
})();

/* Conversar com a IA (12/11/2026): na folha do laudo, o Artur fala ou escreve um ajuste ("o lado é direito", "conclusão um item por achado").
   A IA recebe o laudo numerado + o pedido e devolve só o DIFF (mesmo protocolo do Gerar: applyDiff/diffLaudoHtml); a folha mostra
   vermelho riscado / verde, com Aceitar tudo e Desfazer. Se o pedido valer para os próximos laudos ("da próxima vez", "sempre", "nunca",
   "gostei"), a IA manda no mesmo retorno "REGRA: ..." -> regra do exame (coleção regras) + ia/regras/<exame>.md no repo de dados
   (seção "Ajustes ditados no Conversar"), que o áudio do celular (tools/ia_laudo.py) também lê. "Lembrei: ..." tem desfazer.
   Motor: sample da plataforma (ponte /ia2: Antigravity, Claude de reserva). Só o laudo + o pedido vão para a IA (pedido filtrado).
   Sem a ponte (celular, PCs do hospital): 13/11/2026, pela fila do repo de dados (fila-conversa/<uuid>.json, mesmo desenho do áudio):
   o laudo e o pedido passam pelo anonimizar do 114 ANTES de ir ao GitHub; a ponte do PC (Antigravity) ou a Action (Claude) grava
   `resposta`; o site espera (polling) e segue o mesmo caminho do /ia2. */
(function (root) {
  "use strict";
  const SECAO = "## Ajustes ditados no Conversar";
  /* "REGRA: ..." no retorno da IA. Devolve { regra, resto } (regra "" se não veio ou veio vazia/"nenhuma"). */
  function extrairRegra(resposta) {
    let regra = "";
    const resto = String(resposta || "").replace(/\r/g, "").split("\n").filter(l => {
      const m = l.match(/^\s*(?:[*•-]\s*)?\**\s*REGRA\s*\**\s*:\s*(.*)$/i);
      if (!m) return true;
      const t = m[1].replace(/\*+/g, "").trim();
      if (!regra && t && !/^(?:nenhuma|n[aã]o|-|—)\.?$/i.test(t)) regra = t.slice(0, 240);
      return false;
    }).join("\n");
    return { regra, resto };
  }
  /* Filtro leve do pedido (não do laudo): números longos, datas e "paciente Fulano" não saem do PC. */
  function limparPedido(t) {
    return String(t || "").replace(/\0/g, "")
      .replace(/\b(?:[Pp]aciente|PACIENTE|[Ss]ra?|[Ss]enhora?)\b(?:\(a\))?\.?\s*[:=-]?\s*(?:[A-ZÀ-Ý][a-zà-ÿ]+\s*){1,4}/g, "[identidade] ")
      .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, "[data]")
      .replace(/\d{6,}/g, "[identificador]").replace(/[ \t]+/g, " ").trim().slice(0, 2000);
  }
  /* Linhas numeradas COMPLETAS (o pedido pode mexer em frases normais). Devolve { linhas: [{raw, n}], texto }.
     filtro (opcional): aplicado a cada linha só no `texto` enviado (a numeração e `linhas` ficam do original). */
  function numerar(rascunho, filtro) {
    const linhas = [], out = []; let n = 0;
    for (const raw of String(rascunho || "").split("\n")) {
      if (!raw.trim()) { linhas.push({ raw, n: 0 }); continue; }
      n++; linhas.push({ raw, n }); out.push("L" + n + " " + (filtro ? filtro(raw.trim()) : raw.trim()));
    }
    return { linhas, texto: out.join("\n") };
  }
  function montarPrompt({ exame = "", regras = "", numerado = "", pedido = "" }) {
    return `Assistente de laudos de um radiologista brasileiro (português do Brasil). O médico pediu um AJUSTE no laudo abaixo.
EXAME: ${exame}
${regras ? `REGRAS DE ESTILO DO MÉDICO PARA ESTE EXAME:
${regras}
` : ""}LAUDO (linhas numeradas):
"""
${numerado}
"""
PEDIDO DO MÉDICO (falado ou escrito; pode ter erros do reconhecimento de voz):
"""
${pedido}
"""
REGRAS:
1. Faça só o que o pedido diz; o resto do laudo fica igual. Nunca invente achados, medidas ou lateralidade que o pedido não trouxe.
2. Mantenha as marcações <b>, <u>, <i>, {{centro}} e os títulos como estão. Texto puro, sem markdown.
3. Se o pedido mexer em achados, deixe a conclusão coerente com eles.
FORMATO DA RESPOSTA: DIFF, só as linhas que mudam, uma operação por linha, sem comentários:
Ln: texto novo   (substitui a linha n)
+Ln: texto       (insere depois da linha n; várias seguidas ficam nessa ordem)
-Ln              (apaga a linha n)
Linhas não citadas ficam como estão; nunca repita uma linha sem mudança. Se nada mudar, responda só: OK
MEMÓRIA: se o pedido valer também para os PRÓXIMOS laudos deste exame (ex.: "da próxima vez", "sempre", "nunca", "prefiro", "gostei", "não gostei"), acrescente no fim UMA linha "REGRA: <regra curta e geral de redação, sem dados deste paciente>". Se for só deste laudo, não escreva REGRA.`;
  }
  /* ia/regras/<exame>.md: acrescenta a regra na seção (cria a seção/arquivo se faltar); não duplica. */
  function regraMd(atual, regra, data) {
    const linha = "- " + regra + (data ? " (" + data + ")" : "");
    let t = String(atual || "").replace(/\r/g, "");
    if (t.split("\n").some(l => l.replace(/\s*\(\d{2}\/\d{2}\/\d{4}\)\s*$/, "") === "- " + regra)) return t;
    if (!t.trim()) t = "# Regras do exame\n";
    const i = t.indexOf(SECAO);
    if (i < 0) return t.replace(/\n*$/, "\n\n") + SECAO + "\n" + linha + "\n";
    const fim = t.indexOf("\n## ", i + SECAO.length), corte = fim < 0 ? t.length : fim;
    return t.slice(0, corte).replace(/\n*$/, "\n") + linha + "\n" + (fim < 0 ? "" : "\n" + t.slice(fim + 1));
  }
  function tirarRegraMd(atual, regra) {
    return String(atual || "").replace(/\r/g, "").split("\n").filter(l => l.replace(/\s*\(\d{2}\/\d{2}\/\d{4}\)\s*$/, "") !== "- " + regra).join("\n");
  }
  const api = { extrairRegra, limparPedido, numerar, montarPrompt, regraMd, tirarRegraMd, SECAO };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TutuConversa = api;
})(globalThis);

(() => {
  "use strict";
  if (typeof document === "undefined") return;
  const ui = window.tutuV2, C = window.TutuConversa, T = window.tutuSite;
  if (!ui || !ui.footerActions || !C) return;
  const el = ui.el, button = ui.button, ANDROID = /Android/i.test(navigator.userAgent);
  let busy = false, speech = null, ouvindo = false, tela = null, ultimaRegra = null, ctlConversa = null;

  const box = el("section", { id: "conversaBox", class: "conversa", "aria-label": "Conversar com a IA", hidden: "" });
  const texto = el("textarea", { id: "conversaTexto", rows: "3", "aria-label": "Pedido de ajuste para a IA",
    placeholder: "Fale ou escreva o ajuste: \"o lado é direito\", \"conclusão um item por achado\", \"da próxima vez, fluxo em todas as frases\"." });
  const msg = el("p", { id: "conversaMsg", role: "status", "aria-live": "polite" });
  const mic = button("🎤", () => (ouvindo ? parar() : ouvir()), { id: "conversaMic", "aria-label": "Ditar o pedido", title: "Ditar o pedido (voz)" });
  const enviar = button("Enviar", () => mandar(), { id: "conversaEnviar", title: "Enviar à IA · Ctrl Enter" });
  const fechar = button("×", () => abrir(false), { id: "conversaFechar", "aria-label": "Fechar", title: "Fechar" });
  const aceitar = button("Aceitar tudo", () => { acceptAllEdits(); scheduleCaseSave(); acoes.hidden = true; dizer("Ajustes aceitos."); }, { id: "conversaAceitar" });
  const desfazer = button("Desfazer", () => { undoAllClaude(); acoes.hidden = true; dizer("Ajuste desfeito."); }, { id: "conversaDesfazer" });
  const acoes = el("div", { class: "conversa-acoes", hidden: "" }); acoes.append(aceitar, desfazer);
  const lembrei = el("p", { id: "conversaLembrei", hidden: "" });
  const cab = el("div", { class: "conversa-cab" }); cab.append(el("b", {}, "Conversar com a IA"), fechar);
  const linha = el("div", { class: "conversa-linha" }); linha.append(texto, el("div", { class: "conversa-botoes" }));
  linha.lastChild.append(mic, enviar);
  box.append(cab, linha, msg, acoes, lembrei);
  document.body.append(box);
  const abrirBtn = button("Conversar", () => abrir(box.hidden), { id: "conversaAbrir", title: "Conversar com a IA: pedir ajustes no laudo (voz ou texto)" });
  const copiar = document.getElementById("copiar");
  if (copiar && copiar.parentNode === ui.footerActions) copiar.after(abrirBtn); else ui.footerActions.append(abrirBtn);
  /* Áudio (celular): depois de abrir um laudo pronto, o botão fecha o Áudio e abre a conversa sobre a folha. */
  const usg = document.getElementById("usgDialog");
  if (usg) {
    const doAudio = button("Conversar com a IA sobre o laudo aberto", () => { try { usg.close(); } catch (_) {} abrir(true); }, { id: "conversaDoAudio", hidden: "" });
    usg.append(doAudio);
    const vigiar = () => { doAudio.hidden = !temLaudo(); };
    const folha = document.getElementById("laudo"); if (folha) new MutationObserver(vigiar).observe(folha, { childList: true, subtree: true, characterData: true });
    usg.addEventListener("close", vigiar); vigiar();
  }

  function dizer(t) { msg.textContent = t; }
  function temLaudo() { try { return !!laudoTagged().trim(); } catch (_) { return false; } }
  function abrir(on) {
    box.hidden = !on; abrirBtn.setAttribute("aria-pressed", String(!!on));
    if (on) { dizer(temLaudo() ? "" : "Abra ou escreva um laudo na folha primeiro."); texto.focus(); }
    else parar();
  }
  texto.addEventListener("keydown", e => {
    // stopPropagation: Ctrl+Enter no documento é o Gerar (31-chat-ensinar.js); Esc fecha só esta caixa
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); mandar(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); abrir(false); }
  });

  /* ---------- voz: mesmo motor do site (Web Speech + usgVoice + fixFala); Android: speechDelta e Wake Lock ---------- */
  const manterTela = async () => { try { if (ouvindo && !tela && navigator.wakeLock && document.visibilityState === "visible") { tela = await navigator.wakeLock.request("screen"); tela.addEventListener("release", () => { tela = null; }); } } catch (_) { tela = null; } };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") manterTela(); });
  const cfgVoz = () => { try { return JSON.parse(document.getElementById("voiceConfig").textContent) || {}; } catch (_) { return {}; } };
  function ouvir() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition, V = window.usgVoice;
    if (!Speech || !V) { dizer("Voz indisponível neste navegador: escreva o pedido."); return; }
    const s = speech = new Speech(); s.lang = "pt-BR"; s.continuous = true; s.interimResults = true; s.maxAlternatives = 5;
    let sessao = "";
    s.onstart = () => { sessao = ""; };
    s.onresult = ev => {
      let parcial = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i], cfg = cfgVoz(), alts = Array.from(r, a => V.punct(a.transcript || "")).filter(Boolean);
        if (!alts.length) continue;
        let best = V.bestAlternative(alts[0], alts, cfg);
        if (r.isFinal && ANDROID && window.TutuV2Core?.speechDelta) { const d = TutuV2Core.speechDelta(sessao, best); sessao = d.sessao; best = d.novo; if (!best) continue; }
        const t = (window.TutuV2Core?.fixFala || String)(V.posTexto(best, cfg));
        if (r.isFinal) texto.value += (texto.value && !/\s$/.test(texto.value) ? " " : "") + t;
        else parcial += t;
      }
      dizer(parcial ? "… " + parcial : "Ouvindo. Toque no microfone para parar.");
    };
    s.onerror = ev => { dizer("Voz: " + ev.error); if (/not-allowed|audio-capture|service-not-allowed/.test(ev.error)) parar(); };
    s.onend = () => { if (ouvindo && speech === s) { try { s.start(); } catch (_) { parar(); } } };
    try { s.start(); } catch (_) { dizer("Não consegui ligar o microfone."); return; }
    ouvindo = true; mic.classList.add("on"); mic.setAttribute("aria-pressed", "true"); manterTela();
    dizer("Ouvindo. Toque no microfone para parar.");
  }
  function parar() {
    const s = speech; speech = null; ouvindo = false;
    if (s) { s.onresult = s.onend = s.onerror = null; try { s.stop(); } catch (_) {} }
    try { tela?.release(); } catch (_) {} tela = null;
    mic.classList.remove("on"); mic.setAttribute("aria-pressed", "false");
  }

  /* ---------- sem a ponte: fila do repo de dados (fila-conversa/<uuid>.json), processada pela ponte do PC ou pela Action ---------- */
  const fila = { intervalo: 5000, limite: 6 * 60 * 1000 };   // polling a cada 5 s, até 6 min
  const anon = t => {   // mesmo anonimizar do Áudio (114); sem ele nada vai ao GitHub
    if (typeof ui.anonimizar !== "function") throw Error("bloqueado: filtro de privacidade indisponível");
    return ui.anonimizar(String(t));
  };
  const esperar = (ms, signal) => new Promise((ok, no) => {
    if (signal?.aborted) return no(new DOMException("Pedido cancelado.", "AbortError"));
    const t = setTimeout(() => { signal?.removeEventListener("abort", ab); ok(); }, ms);
    const ab = () => { clearTimeout(t); no(new DOMException("Pedido cancelado.", "AbortError")); };
    signal?.addEventListener("abort", ab, { once: true });
  });
  async function apagarFila(caminho) {   // best effort, como o 114 ao copiar o laudo do áudio
    const G = T?.gh;
    try {
      const r = await G.getJson(caminho); if (!r) return;
      await fetch("https://api.github.com/repos/" + G.repo + "/contents/" + caminho, {
        method: "DELETE", headers: { Authorization: "Bearer " + G.token, "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Conversar: remover pedido da fila", sha: r.sha, branch: "main" })
      });
    } catch (_) {}
  }
  async function viaFila(montarAnonimo, signal) {
    const G = T?.gh;
    if (!G?.token || !G.putJson || !G.getJson) throw Error("Sem a ponte do PC (127.0.0.1:47831) e sem a chave do repo de dados: salve-a em Configurações › Sincronização.");
    const prompt = montarAnonimo();   // lança "bloqueado" antes de qualquer envio
    const caminho = "fila-conversa/" + crypto.randomUUID() + ".json";
    await G.putJson(caminho, { prompt, modelTier: "balanced", ia: "pendente", criado: new Date().toISOString() }, null, "Conversar: pedido anônimo");
    dizer("Sem a ponte do PC: enviado pela fila (até ~3 min)…");
    const fim = Date.now() + fila.limite;
    try {
      while (Date.now() < fim) {
        await esperar(fila.intervalo, signal);
        let d = null;
        try { d = (await G.getJson(caminho))?.json; } catch (_) { continue; }   // rede falhou: tenta de novo no próximo ciclo
        if (d?.ia === "erro") throw Error("A IA não conseguiu responder pela fila" + (d.erro ? " (" + String(d.erro).slice(0, 120) + ")" : "") + ". O laudo ficou como estava.");
        if (typeof d?.resposta === "string" && d.resposta.trim()) return { text: d.resposta, motor: d.motor || "claude", aviso: "pela fila" };
      }
      throw Error("A IA não respondeu em 6 min pela fila; o laudo ficou como estava. Tente de novo.");
    } finally { await apagarFila(caminho); }
  }
  /* Com a ponte: nada muda (local, sem GitHub). Sem ponte (ou sem sample): fila. */
  async function pedirIA(prompt, signal, montarAnonimo) {
    if (typeof sample === "function" && sample) {
      try { return await sample(prompt, { signal, cache: false, modelTier: "balanced" }); }
      catch (e) { if (e?.code !== "ponte_indisponivel") throw e; }
    }
    return viaFila(montarAnonimo, signal);
  }

  /* ---------- envio: laudo numerado + pedido -> DIFF (+ REGRA opcional) ---------- */
  async function mandar() {
    if (busy) return;
    if (ouvindo) parar();
    const pedido = C.limparPedido(texto.value);
    if (!pedido) { dizer("Fale ou escreva o que ajustar."); texto.focus(); return; }
    if (typeof genBusy !== "undefined" && genBusy) { dizer("Aguarde o Gerar terminar."); return; }
    const draft = laudoTagged();
    if (!draft.trim()) { dizer("A folha está vazia: abra ou escreva um laudo primeiro."); return; }
    const num = C.numerar(draft);
    genLines = num.linhas;   // applyDiff (30-claude-gerar.js) lê estas linhas
    const prompt = C.montarPrompt({ exame: nameAll(), regras: rulesBlock(), numerado: num.texto, pedido });
    busy = true; enviar.disabled = true; acoes.hidden = true; lockSheet(true); ctlConversa = new AbortController();
    dizer("Enviando à IA…");
    const t0 = performance.now();
    try {
      const r = await pedirIA(prompt, ctlConversa.signal, () => C.montarPrompt({ exame: nameAll(), regras: rulesBlock(), numerado: C.numerar(draft, anon).texto, pedido: anon(pedido) }));
      const motor = r?.motor === "antigravity" ? "Antigravity" : "Claude", secs = ((performance.now() - t0) / 1000).toFixed(0);
      const { regra, resto } = C.extrairRegra(r?.text || "");
      lockSheet(false);
      if (laudoTagged() !== draft) { dizer("A folha mudou enquanto a IA respondia: nada foi aplicado. Envie de novo."); return; }
      genLines = num.linhas;
      const novo = /^\s*ok\.?\s*$/i.test(resto.trim()) ? draft : applyDiff(resto);
      if (novo === null) { dizer(`A resposta (${motor}) veio fora do formato; o laudo ficou como estava. Tente de novo.`); return; }
      if (novo !== draft) {
        pushVersion("Antes da correção");   // "Desfazer IA" (undoAllClaude) volta até aqui
        sheet.innerHTML = diffLaudoHtml(draft, novo);
        pushVersion("Ajustado na conversa (" + motor + ")");
        ui.registrarIA?.(laudoTagged());   // última versão da IA: ao copiar com edições manuais vira ia/correcoes (114)
        renderAlerts(); updateCount(); scheduleCaseSave();
        acoes.hidden = false;
      }
      texto.value = "";
      dizer((novo === draft ? "Nada a mudar no laudo" : "Ajustado: verde = novo, vermelho = apagado") + ` · ${motor}, ${secs} s` + (r?.aviso ? " · " + r.aviso : "") + ".");
      if (regra) await lembrar(regra);
    } catch (e) {
      lockSheet(false);
      dizer(e?.name === "AbortError" ? "Pedido cancelado." : /^bloqueado/i.test(e?.message || "") ? "Bloqueado pelo filtro de privacidade: nada foi enviado ao GitHub. " + e.message : (e?.message || "Falha ao falar com a IA."));
    } finally { busy = false; enviar.disabled = false; lockSheet(false); }
  }

  /* ---------- memória: regra do exame (coleção regras) + ia/regras/<exame>.md no repo de dados ---------- */
  const hoje = () => new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  async function gravarMd(exame, muda) {
    const G = T?.gh; if (!G?.token || !G.getText || !/^[a-z0-9-]{1,60}$/.test(exame)) return false;
    const caminho = "ia/regras/" + exame + ".md";
    for (let i = 0; i < 2; i++) {
      try {
        const atual = await G.getText(caminho), novo = muda(atual?.text || "");
        if (novo === (atual?.text || "")) return true;
        await G.putText(caminho, novo, atual?.sha || null, "IA: regra ditada no Conversar");
        return true;
      } catch (e) { if (!e?.conflito) return false; }   // outro aparelho gravou antes: relê e tenta de novo
    }
    return false;
  }
  async function lembrar(regra) {
    const exame = current?.id || "todos", data = hoje();
    let id = null;
    try { if (db) id = (await db.collection("regras").add({ texto: regra, exame, origem: "conversa", criadoEm: new Date().toISOString() }))?.id || null; } catch (_) {}
    ultimaRegra = { regra, exame, id };
    lembrei.replaceChildren(el("span", {}, "Lembrei: " + regra + " "), button("Desfazer", () => esquecer(), { id: "conversaEsquecer" }), el("small", { id: "conversaLembreiNota" }, " salvando…"));
    lembrei.hidden = false;
    const ok = await gravarMd(exame, md => C.regraMd(md, regra, data));
    const nota = document.getElementById("conversaLembreiNota");
    if (nota && ultimaRegra?.regra === regra) nota.textContent = ok ? " (vale também no áudio do celular)" : " (só neste aparelho: sem chave do repo de dados ou sem rede)";
  }
  async function esquecer() {
    const r = ultimaRegra; if (!r) return;
    ultimaRegra = null; lembrei.hidden = true;
    try { if (db && r.id) await db.doc("regras/" + r.id).delete(); } catch (_) {}
    const ok = await gravarMd(r.exame, md => C.tirarRegraMd(md, r.regra));
    dizer("Esqueci: " + r.regra + (ok ? "" : " (o arquivo do repo de dados não foi alterado)"));
  }
  ui.conversa = { abrir, mandar, fila, pedirIA, anon, limparPedido: C.limparPedido };   // pedirIA/anon: o modo Frase (@) usa o mesmo caminho para ajustar a frase ao que foi ditado
})();

/* Modo Frase (@): enquanto dita ou digita na folha, "@" (ou "arroba") abre uma BUSCA no banco de laudos; o que vier depois
   não é texto do laudo. Painel junto ao cursor com as 3 melhores frases; Enter/"parágrafo" insere a destacada.
   Parte 1 (pura, testada em Node): pares achado/conclusão, busca SÓ na modalidade da máscara (TC/RM/US/RX), ordem por incidência (descrições parecidas
   formam um grupo; vale o tamanho do grupo), variante que melhor cobre os achados ditados depois do diagnóstico, ajuste de lado e medida, negativos,
   aprendizado; mais prompt, validação e fluxo do ajuste pela IA (dependências injetadas: a rede fica na tela, via 116). Sem IA no caminho local.
   Parte 2 (tela): gatilho na folha, painel, teclas, inserção (parecer: frase única; laudo completo: achados + Conclusão). */
(function (root) {
  "use strict";
  const fold = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const Core = root.TutuV2Core || (typeof require !== "undefined" ? require("./98-v2-core.js") : null);

  /* ---------- palavras ---------- */
  const STOP = new Set(("de do da dos das com sem nao em no na nos nas e ou o a os as um uma uns umas por para ao aos pelo pela sobre entre ate que se como mais menos " +
    "sinais sinal aspecto aspectos achado achados compativel compativeis sugestivo sugestivos sugestiva sugerindo provavel possivel cerca imagem lado " +
    "direito direita direitos direitas esquerdo esquerda esquerdos esquerdas bilateral bilaterais ambos medindo mede medida aproximadamente tc rm usg rx").split(" "));
  const stem = w => {
    if (w.length < 5) return w;
    return w.replace(/(?:oes|aes)$/, "ao").replace(/ais$/, "al").replace(/[aeo]s?$/, "");
  };
  const palavras = t => fold(t).split(/[^a-z0-9]+/).filter(w => w && !/^\d+$/.test(w));
  function tokens(texto) {
    const out = new Set();
    for (const w of palavras(texto)) if (!STOP.has(w) && (w.length >= 3)) out.add(stem(w));
    return out;
  }
  const SINONIMOS = [
    ["tep", ["tromboembol", "embol"]], ["embolia", ["tromboembol"]], ["tromboembolismo", ["tep"]],
    ["litiase", ["calcul", "nefrolitias", "ureterolitias", "colelitias"]], ["calculo", ["litias"]],
    ["hepatica", ["figado"]], ["hepatico", ["figado"]], ["figado", ["hepatic"]],
    ["avc", ["isquemi", "acidente"]], ["hernia", ["hern"]],
  ].map(([a, b]) => [stem(a), b.map(x => stem(x))]);
  const SIN = new Map(SINONIMOS);

  /* ---------- classificação das linhas do banco (sem e[4]) ---------- */
  const NEG = /^(sem|ausencia|nao (ha|se|foram|foi|existe|existem|observ|evidenc|visualiz)|nenhum|inexistencia)\b/;
  const NORMAL = /\bnormai?s?\b|\bperv\w+|\bpreservad\w+|\bhabituais?\b/;
  const ehNeg = l => { const f = fold(l).trim(); return f.length <= 130 && NEG.test(f); };
  const ANAT = /\b(dimensoes|contornos|atenuacao|ecogenicidade|realce|paredes?|calibre|hiperdens\w*|hipodens\w*|hipoecog\w*|hiperecog\w*|espessament\w*|densificac\w*|densidade|planos|parenquima|topografia|segmento|lobo)\b/;
  const VERBO = /\b(observ\w+|apresent\w+|medind\w+|mede[m]?|nota-se|notam-se|identific\w+|visualiz\w+|contend\w+|determinand\w+|encontra-se|encontram-se|exibe\w*|mostra\w*|associad\w+)\b|\d+(?:[.,]\d+)?\s*(?:mm|cm|hu)\b/;
  const CONCL = /\b(compativel|compativeis|sugestiv\w+|sugerind\w+|infer\w+|provavel|possivel|sinais de|aspectos?|hipotese|representar|consistente)\b/;
  function classe(linha) {
    const f = fold(linha).replace(/\s+/g, " ").trim();
    if (!f || /^[\W_]+$/.test(f)) return null;
    if (ehNeg(linha)) return "N";
    if (VERBO.test(f)) return "A";
    if (CONCL.test(f) && f.length <= 220 && (f.length <= 110 || !ANAT.test(f))) return "C";
    if (ANAT.test(f) && f.length > 60) return "A";
    if (f.length <= 90) return "C";
    return "A";
  }
  const limpaLinha = l => String(l).replace(/^[\s*\\•-]+/, "").replace(/\s+/g, " ").trim();
  const ultimoTitulo = t => String(t || "").split("›").pop().trim();
  /* várias descrições do mesmo diagnóstico na mesma página (cada uma já cita a conclusão) são formas alternativas, não achados do mesmo caso: um par por forma */
  function alternativas(a, c) {
    const ck = tokens(c.join(" "));
    if (a.length >= 2 && a.length <= 4 && ck.size >= 2) {
      const cobre = l => { const t = tokens(l); let k = 0; for (const x of ck) if (t.has(x)) k++; return k / ck.size; };
      if (a.every(l => l.length >= 40 && cobre(l) >= 0.6)) return a.map(l => ({ a: [l], c, origem: "banco" }));
    }
    return [{ a: a.slice(0, 3), c, origem: "banco" }];
  }
  /* [{a:[...], c:[...], origem}] de uma entrada [área, seção, título, texto, pares?]; negativos = linhas "sem..." da mesma entrada */
  function paresDe(e) {
    const extras = Array.isArray(e[4]) ? e[4].filter(p => p && Array.isArray(p.a) && Array.isArray(p.c) && p.c.some(x => String(x).trim())) : null;
    const negs = [];
    const linhas = String(e[3] == null ? "" : e[3]).split("\n").map(limpaLinha).filter(Boolean);
    for (const l of linhas) if (classe(l) === "N") negs.push(l);
    if (extras && extras.length) {
      return { pares: extras.flatMap(p => alternativas(p.a.map(limpaLinha).filter(Boolean), p.c.map(limpaLinha).filter(Boolean).slice(0, 2))), negs };
    }
    const pares = []; let buf = [], run = [];
    const fecha = () => { const ach = buf.filter(x => !NORMAL.test(fold(x))).slice(-3); for (const c of run.slice().sort((x, y) => ehNeg(x) - ehNeg(y)).slice(0, 3)) pares.push({ a: ach, c: [c], origem: "banco" }); if (run.length) { buf = []; run = []; } };
    for (const l of linhas) {
      const k = classe(l);
      if (!k) continue;
      if (k === "N") { if (buf.length || run.length) run.push(l); continue; }
      if (k === "A") { fecha(); buf.push(l); } else run.push(l);
    }
    fecha();
    const t = ultimoTitulo(e[2]) || ultimoTitulo(e[1]);
    if (buf.length && t && t.length <= 80) pares.push({ a: buf.slice(-3), c: [t], origem: "titulo" });
    return { pares, negs };
  }
  const AREA_IGNORADA = /^(exames?|estudo|acompanhar|geral)\b/;
  const entradaValida = e => Array.isArray(e) && e.length >= 4 && !AREA_IGNORADA.test(fold(e[0]).trim()) && !AREA_IGNORADA.test(fold(e[1]).trim());
  const chaveConc = c => [...tokens(c[0] || "")].sort().join(" ");

  /* ---------- modalidade e contraste da máscara ---------- */
  const modalNorm = m => { m = String(m || "").toUpperCase(); return m === "USG" ? "US" : m; };
  /* TC | RM | US | RX, pelo nome/tipo/título da máscara; null se não der para saber (aí vale todo o banco) */
  function modalidadeDe(ex) {
    if (!ex) return null;
    const mask = String(ex.mask || "").split("\n").find(l => l.trim()) || "";
    for (const src of [ex.name, ex.proto, mask, ex.id]) {
      for (const w of fold(src).split(/[^a-z0-9]+/)) {
        if (/^(usg|ultrassom|ultrassonografia|ultrassonografico|doppler|ecografia)$/.test(w)) return "US";
        if (/^(rm|ressonancia|rnm)$/.test(w)) return "RM";
        if (/^(rx|radiografia|radiografias|raio|raios)$/.test(w)) return "RX";
        if (/^(tc|tomografia|angiotc|politrauma)$/.test(w)) return "TC";
      }
    }
    return null;
  }
  /* máscara sem contraste (nome, tipo ou linha de técnica); "com contraste" na técnica vence */
  function semContrasteDe(ex) {
    if (!ex) return false;
    const linhas = String(ex.mask || "").split("\n"), i = linhas.findIndex(l => /^\s*t[eé]cnica/i.test(l));
    let tec = ""; if (i >= 0) for (let k = i + 1; k < linhas.length && !/^\s*(achados|conclus)/i.test(linhas[k]); k++) tec += " " + linhas[k];
    const f = fold([ex.name, ex.proto, tec].join(" "));
    const sem = /\bsem\b[^.;]{0,50}\bcontraste\b/.test(f), com = /\b(antes|durante|apos)\b[^.]{0,40}\b(injecao|contraste)|\bcom (uso de |injecao de )?contraste|\bcontrastad/.test(f);
    return sem && !com;
  }
  const CONTRASTE = /(realc|contrast|captan|captac|impregnac)/;   // realce, hiperrealce, contraste, pós-contraste, hipercaptante, captação
  const GRAVES = [/complicad|perfurad/, /abscess/, /necros/, /gangren/, /obstrutiv/, /enfisemat/, /grave|acentuad/];
  const flagDe = (c, t) => { const f = fold(c.join(" ") + " " + t); return (/\bnao complicad/.test(f) ? "n" : "") + GRAVES.map((g, i) => (g.test(f) ? i : "")).join(""); };

  /* ---------- índice ---------- */
  /* opts: { origem, modal (padrão das entradas sem e[5]), peso (ocorrências de cada par), laudos: [[área, seção, achado, conclusão, n]] (pares do notas-tomografia) } */
  function buildIndex(entradas, opts) {
    opts = opts || {};
    const pares = [], porChave = new Map(), post = new Map(), df = new Map(), dfa = new Map(), vocab = new Map();
    let ei = 0;
    const incluir = (p, e, entrada, modal, w) => {
      if (!p.c.length) return;
      const titulo = ultimoTitulo(e[2]) || ultimoTitulo(e[1]), neutra = l => !ehNeg(l);
      const o = { id: pares.length, a: p.a, c: p.c, origem: opts.origem || p.origem, titulo, sub: String(e[1] || ""), area: String(e[0] || ""), modal, entrada, w: Math.max(1, +w || 1),
        cTk: tokens(p.c.join(" ")), tTk: tokens(titulo), sTk: tokens(e[1] + " " + e[0]), aTk: tokens(p.a.join(" ")),
        aAff: tokens(p.a.filter(neutra).join(" ")), aNeg: tokens(p.a.filter(ehNeg).join(" ")) };
      o.chave = chaveConc(p.c);
      o.negConc = ehNeg(p.c[0]);
      o.flag = flagDe(p.c, titulo);
      o.contr = CONTRASTE.test(fold(p.a.concat(p.c).join(" ")));
      if (!o.cTk.size && !o.tTk.size) return;
      pares.push(o);
      const kk = modal + "|" + o.chave, lista = porChave.get(kk) || new Set(); lista.add(entrada); porChave.set(kk, lista);
      const todos = new Set([...o.cTk, ...o.tTk, ...o.sTk, ...o.aTk]);
      for (const k of todos) { let l = post.get(k); if (!l) post.set(k, l = []); l.push(o.id); }
      for (const k of new Set([...o.cTk, ...o.tTk])) df.set(k, (df.get(k) || 0) + 1);
      for (const k of new Set([...o.aAff, ...o.aNeg])) dfa.set(k, (dfa.get(k) || 0) + 1);   // vocabulário dos achados (para os achados ditados)
      for (const w of palavras(p.c.join(" ") + " " + o.titulo)) if (w.length >= 4) vocab.set(w, (vocab.get(w) || 0) + 1);
    };
    for (const e of entradas || []) {
      if (!entradaValida(e)) continue;
      const { pares: ps, negs } = paresDe(e), modal = modalNorm(e[5] || opts.modal || "TC");
      const entrada = { negs, ei: ei++ };
      for (const p of ps) incluir(p, e, entrada, modal, opts.peso);
    }
    for (const l of opts.laudos || []) {   // pares dos laudos (achado -> conclusão) com contagem própria
      if (!Array.isArray(l) || l.length < 4 || !String(l[2] || "").trim() || !String(l[3] || "").trim()) continue;
      incluir({ a: [limpaLinha(l[2])], c: [limpaLinha(l[3])], origem: "banco" }, [l[0], l[1], "", ""], { negs: [], ei: ei++ }, "TC", +l[4] || 1);
    }
    return { pares, porChave, post, df, dfa, vocab, N: pares.length || 1 };
  }

  /* ---------- consulta ---------- */
  const ladoDe = f => {
    const d = /\bdireit[oa]s?\b/.test(f), e = /\besquerd[oa]s?\b/.test(f), b = /\bbilateral|bilaterais|ambos\b/.test(f);
    return b || (d && e) ? "b" : d ? "d" : e ? "e" : null;
  };
  function parseQuery(q) {
    let s = " " + fold(q).replace(/^\s*(@|arroba)\s*/, "").replace(/[.,;:!?]+/g, " ") + " ";
    const r = { lado: ladoDe(s), medida: null, complic: 0, neg: false, com: [], sem: [], semContraste: false, orig: new Map() };
    for (const w of String(q).normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}]+/u)) { const f = fold(w); if (f && !r.orig.has(stem(f))) r.orig.set(stem(f), w); }
    if (/\bsem\s+(?:(?:o|uso|injecao|endovenosa|administracao|meio|de|do|da)\s+)*contraste(?:\s+(?:endovenoso|iodado|venoso))?\b/.test(s)) {
      r.semContraste = true; s = s.replace(/\bsem\s+(?:(?:o|uso|injecao|endovenosa|administracao|meio|de|do|da)\s+)*contraste(?:\s+(?:endovenoso|iodado|venoso))?\b/g, " ");
    }
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*(mm|milimetros?|cm|centimetros?)\b/);
    if (m) { r.medida = { n: m[1], un: /^c/.test(m[2]) ? "cm" : "mm" }; s = s.replace(m[0], " "); }
    s = s.replace(/\b(medindo|mede|medida|cerca de|aproximadamente)\b/g, " ");
    if (/\bnao complicad[oa]s?\b|\bsem complicac(?:ao|oes)\b/.test(s)) { r.complic = -1; s = s.replace(/\bnao complicad[oa]s?\b|\bsem complicac(?:ao|oes)\b/g, " "); }
    else if (/\bcomplicad[oa]s?\b/.test(s)) { r.complic = 1; s = s.replace(/\bcomplicad[oa]s?\b/g, " "); }
    s = s.replace(/\s+/g, " ");
    if (/^ (sem|ausencia de|nao ha|nao se observa) /.test(s)) { r.neg = true; s = s.replace(/^ (sem|ausencia de|nao ha|nao se observa) /, " "); }
    const partes = s.split(/ (com|sem) /);
    r.core = [...tokens(partes[0])];
    for (let i = 1; i < partes.length; i += 2) (partes[i] === "com" ? r.com : r.sem).push(...tokens(partes[i + 1] || ""));
    r.chave = [...r.core].sort().join(" ") + "|" + (r.lado || "") + "|" + r.complic + "|" + (r.neg ? "n" : "");
    return r;
  }
  /* grupos de busca: cada termo da consulta -> radicais aceitos (igual, prefixo >=5, sinônimo, fonética do reconhecedor) */
  function gruposDe(idx, termos, amplo) {   // amplo: também o vocabulário dos achados (achados ditados); senão só conclusões/títulos
    const dfk = k => idx.df.get(k) || (amplo && idx.dfa.get(k)) || 0;
    const chaves = amplo ? [...new Set([...idx.df.keys(), ...idx.dfa.keys()])] : [...idx.df.keys()];
    return termos.map(t => {
      const alvo = new Set([t, ...(SIN.get(t) || [])]), ok = new Set(), ex = new Set();
      const casa = (k, q) => k === q || (Math.min(k.length, q.length) >= 5 && (k.startsWith(q) || q.startsWith(k)));
      for (const k of chaves) for (const q of alvo) if (casa(k, q)) { ok.add(k); if (k === q) ex.add(k); }
      if (!ok.size && Core && t.length >= 4) {   // erro do reconhecedor: palavra parecida em letras/som
        const pk = Core.phoneKey(t);
        let melhor = null, nota = 1e9;
        for (const k of chaves) {
          if (Math.abs(k.length - t.length) > 3) continue;
          const d = Math.min(Core.distance(t, k), Core.distance(pk, Core.phoneKey(k)) + 0.5), lim = Math.max(1, Math.floor(t.length * 0.3));
          if (d <= lim && d - Math.log(1 + (dfk(k) || 1)) * 0.01 < nota) { melhor = k; nota = d; }
        }
        if (melhor) ok.add(melhor);
      }
      const w = ok.size ? Math.max(...[...ok].map(k => Math.log(1 + idx.N / (dfk(k) || 1)))) : 0;
      return { t, ok, ex, w };
    }).filter(g => g.ok.size);
  }
  const cobertura = (grupos, F) => {
    let tot = 0, hit = 0, n = 0;
    for (const g of grupos) { tot += g.w; if ([...g.ok].some(k => F.has(k))) { hit += g.w; n++; } }
    return { cov: tot ? hit / tot : 0, n };
  };
  const lacunas = t => { const f = fold(t); return { d: /\bdireit[oa]s?\b/.test(f), e: /\besquerd[oa]s?\b/.test(f), b: /\bbilateral|bilaterais\b/.test(f) }; };
  const CARDIACO = /\b(ventricul\w+|atri\w+|camaras?|cardiac\w+|coronari\w+)\b/;

  function pontuar(idx, p, pq, grupos, ctx) {
    const cc = cobertura(grupos, p.cTk), tt = cobertura(grupos, p.tTk), ss = cobertura(grupos, p.sTk), aa = cobertura(grupos, p.aTk);
    const uni = cobertura(grupos, new Set([...p.cTk, ...p.tTk, ...p.sTk, ...p.aTk]));
    if (!grupos.length || uni.cov < 0.6) return { s: -1, cm: 0 };
    const prec = (n, F) => F.size ? Math.min(1, n / F.size) : 0;
    const base = Math.max(cc.cov * (0.7 + 0.3 * prec(cc.n, p.cTk)), tt.cov * (0.5 + 0.3 * prec(tt.n, p.tTk)), 0.4 * ss.cov);
    let s = base + 0.2 * aa.cov * (1 - base) + 0.1 * uni.cov;
    if (p.origem === "titulo") s -= 0.1;
    if (!p.a.length && p.origem !== "exemplo") s -= 0.15;   // sem descrição: só a conclusão
    if (p.a.length && p.cTk.size) { let k = 0; for (const t of p.cTk) if (p.aTk.has(t)) k++; s += 0.08 * k / p.cTk.size; }
    if (ctx.areaTk && ctx.areaTk.size) for (const k of p.sTk) if (ctx.areaTk.has(k)) { s += 0.05; break; }
    const textoCT = fold(p.c.join(" ") + " " + p.titulo), nc = /\bnao complicad/.test(textoCT), comp = /complicad|perfurad/.test(textoCT) && !nc;
    if (pq.complic === -1) s += nc ? 0.25 : comp ? -0.35 : 0;
    else if (pq.complic === 1) s += comp ? 0.25 : nc ? -0.35 : 0;
    else { if (nc) s += 0.05; const qs = pq.core.join(" "); let pen = 0; for (const g of GRAVES) if (g.test(textoCT) && !g.test(qs) && !nc) pen += 0.1; s -= Math.min(0.25, pen); }
    if (pq.lado) {
      const l = lacunas(p.a.join(" ") + " " + p.c.join(" ")), um = l.d !== l.e && !l.b;
      if (pq.lado === "b") s += l.b ? 0.1 : -0.1;
      else if (l.b) s -= 0.1;
      else if (l.d && l.e) s -= 0.1;
      else if (um && ((pq.lado === "d") === l.d)) s += 0.08;
      else if (um) s -= 0.04;
    }
    if (pq.neg !== p.negConc) s -= 0.6;
    if (ctx.semC && p.contr) s -= 0.25;   // sem contraste: entre variantes do mesmo diagnóstico, prefere a sem realce
    if (p.c.join(" ").length <= 90 || p.tTk.size) {   // qualificador extra na conclusão/título que a consulta não tem (ex.: "epiploica") = penalidade
      const qs = new Set(); for (const g of grupos) { qs.add(g.t); for (const k of g.ok) qs.add(k); }
      let ex = 0; for (const k of new Set([...p.tTk, ...(p.c.join(" ").length <= 90 ? p.cTk : [])])) if (!qs.has(k) && !MODIFICADOR.test(k) && !ESPECIFICO.test(k) && !/^complicad/.test(k)) ex++;
      s -= Math.min(0.36, 0.12 * ex);
    }
    for (const t of pq.sem) { const gs = gruposDe(idx, [t]); if (gs.length && cobertura(gs, p.cTk).n && !p.negConc) s -= 0.3; }
    const it = ctx.aprendido && ctx.aprendido.itens && ctx.aprendido.itens[pq.chave];
    if (it && it.chave === p.chave) s += 0.5 + 0.1 * Math.min(4, it.n || 1);
    if (ctx.parecer && p.origem === "exemplo") s += 0.3;
    if (!ctx.parecer && p.origem === "exemplo") return { s: -1, cm: 0 };
    const gEx = grupos.map(g => (g.ex && g.ex.size ? { ok: g.ex, w: g.w } : g));   // "casa com a consulta": radical igual (ou sinônimo), não só prefixo
    return { s, cm: Math.max(cobertura(gEx, p.cTk).cov, cobertura(gEx, p.tTk).cov) };
  }

  /* ---------- incidência: formas parecidas viram um grupo; vale o tamanho do grupo ---------- */
  const PESO_INCIDENCIA = 0.3, LIMITE_GRUPO = 0.45, PESO_ACHADOS = 0.9;
  const dice = (A, B) => { if (!A.size || !B.size) return 0; let k = 0; for (const x of A) if (B.has(x)) k++; return 2 * k / (A.size + B.size); };
  /* parecença de duas descrições do mesmo padrão (a complicação/gravidade diferente nunca junta) */
  const simPar = (p, q) => {
    if (p.flag !== q.flag || p.modal !== q.modal) return 0;
    if (p.aAff.size && q.aAff.size) return 0.6 * dice(p.aAff, q.aAff) + 0.4 * dice(p.cTk, q.cTk);
    return dice(p.cTk, q.cTk);
  };
  /* quantos termos do início da fala (em ordem) formam o diagnóstico: o prefixo que ainda casa com conclusão/título de várias entradas */
  const MODIFICADOR = /^(agud|cronic|subagud|incipient|leve|moderad|acentuad|grave|extens|simples|compensad)/;
  function dividirDx(idx, grupos, ok) {
    if (grupos.length <= 1) return grupos.length;
    const temC = (p, g) => { for (const k of g.ok) if (p.cTk.has(k) || p.tTk.has(k)) return true; return false; };
    const ids = new Set(); for (const k of grupos[0].ok) for (const id of idx.post.get(k) || []) ids.add(id);
    let S = []; for (const id of ids) { const p = idx.pares[id]; if (ok(p) && temC(p, grupos[0])) S.push(p); }
    let k = 1;
    while (k < grupos.length) {
      const S2 = S.filter(p => temC(p, grupos[k]));
      if (S2.length < (MODIFICADOR.test(grupos[k].t) ? 1 : Math.max(2, Math.ceil(0.1 * S.length)))) break;
      S = S2; k++;
    }
    return k;
  }
  /* termos de variante rara/grave: só entram se ele disse algo relacionado */
  const ESPECIFICO = /^(apendicolit|perfur|abscess|litiasic|necros|gangren|enfisemat|obstrut|hemorrag|ruptur|fistul|empiem|cavitac)/;
  const penEspecifico = (p, A) => { let n = 0; for (const k of new Set([...p.aAff, ...p.cTk, ...p.tTk])) if (ESPECIFICO.test(k) && !A.qtk.has(k) && ![...A.qtk].some(q => ESPECIFICO.test(q) && (q.startsWith(k) || k.startsWith(q)))) n++; return Math.min(0.5, 0.25 * n); };
  const setCobre = p => new Set([...p.aAff, ...(p.negConc ? [] : p.cTk), ...p.tTk]);
  /* o que a variante faz com os achados ditados: cobertura dos presentes, extras que afirma sem ele dizer, ausentes afirmados/negados */
  function ajusteAchados(p, A) {
    const out = { cov: 0, extras: 0, fortes: 0, ausAfirm: 0, ausNeg: 0, ausFalta: 0, bonus: 0 };
    if (!A.pres.length && !A.aus.length) return out;
    const cobre = setCobre(p);
    if (A.pres.length) out.cov = cobertura(A.pres, cobre).cov;
    if (A.desconhecidos) out.cov = out.cov * A.pres.length / (A.pres.length + A.desconhecidos);
    for (const g of A.aus) {
      const afirma = [...g.ok].some(k => cobre.has(k)), nega = [...g.ok].some(k => p.aNeg.has(k) || (p.negConc && p.cTk.has(k)));
      if (afirma) out.ausAfirm++; else if (nega) out.ausNeg++; else out.ausFalta++;
    }
    for (const k of cobre) if (!A.qtk.has(k)) { const f = (A.share.get(k) || 0) / A.nR; if (f < 0.35) out.extras++; if (f < 0.2 || ESPECIFICO.test(k)) out.fortes++; }
    out.bonus = (A.pres.length ? PESO_ACHADOS * out.cov : 0) + 0.12 * out.ausNeg - 0.35 * out.ausAfirm - Math.min(0.3, 0.06 * out.extras);
    return out;
  }

  /* ---------- ajuste do texto: lado, medida, negação nunca mexe ---------- */
  const TROCA_LADO = { direita: "esquerda", direito: "esquerdo", direitas: "esquerdas", direitos: "esquerdos", esquerda: "direita", esquerdo: "direito", esquerdas: "direitas", esquerdos: "direitos" };
  function trocarLado(texto, de, para) {
    const f = fold(texto), l = lacunas(f);
    if (!(para === "d" || para === "e") || de === para || (l.d && l.e) || l.b || CARDIACO.test(f)) return texto;
    if (para === "d" ? !l.e : !l.d) return texto;
    return texto.replace(/\b(direit[oa]s?|esquerd[oa]s?)\b/gi, w => {
      const novo = TROCA_LADO[fold(w)] || w;
      return w[0] !== w[0].toLowerCase() ? novo[0].toUpperCase() + novo.slice(1) : novo;
    });
  }
  const MEDIDA = /(\d+(?:[.,]\d+)?(?:\s*(?:x|X|por)\s*\d+(?:[.,]\d+)?)*)(\s*)(mm|cm|ml|cc|HU)\b/g;
  /* usa a medida dita na 1ª ocorrência (achado, depois conclusão) e troca as demais por ___; nunca inventa número */
  function ajustarMedidas(achados, concl, medida) {
    let usada = false;
    const troca = (m, n, sp, un) => {
      if (medida && !usada && !/^HU$/i.test(un)) { usada = true; return medida.n + " " + medida.un; }
      return "___ " + un;
    };
    const a = achados.map(l => l.replace(MEDIDA, troca));
    const c = concl.map(l => l.replace(MEDIDA, (m, n, sp, un) => (medida && usada && !/^HU$/i.test(un)) ? medida.n + " " + medida.un : "___ " + un));
    if (medida && !usada && a.length) { a[0] = a[0].replace(/[.\s]*$/, "") + ", medindo " + medida.n + " " + medida.un + "."; }
    return { a, c };
  }
  const minuscula = t => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
  const semPonto = t => String(t).replace(/[.\s]+$/, "");
  const INFERE = /(compat[ií]ve(?:l|is)|sugestiv\w*|inferindo|infere\w*|relacionad\w*|represent\w*|suspeit\w*|sugerindo)\b[^()]{0,80}$/i;
  function resumirAchado(t) {
    t = semPonto(t);
    if (t.length <= 190) return t;
    const partes = t.split(/,\s+/); let k = -1;
    partes.forEach((p, i) => { if (i > 0 && INFERE.test(p)) k = i; });
    if (k > 0) return partes[0] + ", " + partes.slice(k).join(", ");
    let out = partes[0]; for (let i = 1; i < partes.length && (out + ", " + partes[i]).length <= 190; i++) out += ", " + partes[i];
    return out;
  }
  /* parecer: uma frase só, achado + conclusão (o parecer termina com o diagnóstico entre parênteses) */
  function fraseParecer(a, c) {
    const conc = semPonto((c || []).join("; "));
    if (!a || !a.length) return conc ? conc + "." : "";
    const ach = resumirAchado(a[0]);
    if (!conc || cobertura([{ w: 1, ok: tokens(conc) }], tokens(ach)).cov >= 0.99 && tokens(conc).size) return ach + ".";
    if (INFERE.test(ach)) return ach + " (" + minuscula(conc) + ").";
    return ach + ", " + minuscula(conc) + ".";
  }
  function montar(p, pq, parecer) {
    let a = p.a.slice(), c = p.c.slice();
    if (pq.lado === "d" || pq.lado === "e") {
      const juntos = a.concat(c).join(" "), l = lacunas(juntos), de = l.d ? "d" : l.e ? "e" : null;
      if (de && de !== pq.lado) { a = a.map(x => trocarLado(juntos.includes("\u0001") ? x : x, de, pq.lado)); c = c.map(x => trocarLado(x, de, pq.lado)); }
    }
    const aj = ajustarMedidas(a, c, pq.medida);
    return { a: aj.a, c: aj.c, frase: fraseParecer(aj.a, aj.c) };
  }

  /* ---------- busca ---------- */
  function buscar(idx, consulta, opts) {
    opts = opts || {};
    const pq0 = parseQuery(consulta), t0 = Date.now(), modal = modalNorm(opts.modal), max = opts.max || 3;
    const semC = !!(opts.semContraste || pq0.semContraste);
    const ok = p => !modal || p.modal === modal;   // só a mesma modalidade (sem contraste NÃO descarta: o diagnóstico manda; só penaliza a variante com realce)
    // diagnóstico = início da fala; o que vem depois são achados ditados (presentes: o resto e "com ..."; ausentes: "sem ...")
    const todos = gruposDe(idx, pq0.core), nDx = dividirDx(idx, todos, ok), dx = todos.slice(0, nDx);
    const dxTok = new Set(dx.map(g => g.t)), restoTok = pq0.core.filter(t => !dxTok.has(t)).concat(pq0.com.filter(t => !pq0.core.includes(t)));
    const presTodos = gruposDe(idx, restoTok, true), aus = gruposDe(idx, pq0.sem, true);
    const pq = Object.assign({}, pq0, { core: dx.map(g => g.t) });
    pq.chave = [...pq.core].sort().join(" ") + "|" + (pq.lado || "") + "|" + pq.complic + "|" + (pq.neg ? "n" : "");
    const A = { pres: presTodos, aus, desconhecidos: restoTok.length - presTodos.length, qtk: new Set(), share: new Map(), nR: 1 };
    for (const g of [...dx, ...presTodos, ...aus]) { A.qtk.add(g.t); for (const k of g.ok) A.qtk.add(k); }
    const achados = { dx: dx.map(g => pq0.orig.get(g.t) || g.t), presentes: restoTok.map(t => pq0.orig.get(t) || t), ausentes: pq0.sem.map(t => pq0.orig.get(t) || t), semContraste: semC };
    let lista = [];
    if (dx.length) {
      const cand = new Set();
      for (const g of dx) for (const k of g.ok) for (const id of idx.post.get(k) || []) cand.add(id);
      const ctx = { areaTk: opts.area ? tokens(opts.area) : null, aprendido: opts.aprendido, parecer: !!opts.parecer, semC };
      for (const id of cand) {
        const p = idx.pares[id]; if (!ok(p)) continue;
        const r = pontuar(idx, p, pq, dx, ctx);
        if (r.s > 0) lista.push({ p, s: r.s, cm: r.cm });
      }
    }
    lista.sort((x, y) => y.s - x.s || x.p.id - y.p.id);
    if (lista.length > 600) lista.length = 600;
    const temAchados = A.pres.length || A.aus.length || A.desconhecidos > 0;
    // grupos de descrições parecidas (a semente é a de maior pontuação) -> candidatos com a contagem do grupo
    const candidatos = (itens, offset) => {
      A.nR = itens.length || 1; A.share = new Map();   // frequência dentro da família: o que é raro não sobe sem o Artur pedir
      for (const x of itens) for (const k of setCobre(x.p)) A.share.set(k, (A.share.get(k) || 0) + 1);
      const grupos = [];
      for (const x of itens) {
        let alvo = null, melhor = 0;
        for (const g of grupos) { const v = simPar(x.p, g.semente); if (v >= LIMITE_GRUPO && v > melhor) { melhor = v; alvo = g; } }
        if (alvo) { alvo.m.push(x); alvo.n += x.p.w; } else grupos.push({ semente: x.p, m: [x], n: x.p.w });
      }
      return grupos.map(g => {
        for (const x of g.m) {
          let t = 0, w = 0; for (const o of g.m.length > 120 ? g.m.slice(0, 120) : g.m) if (o !== x) { t += o.p.w * simPar(x.p, o.p); w += o.p.w; }
          x.tip = w ? t / w : 1; x.aj = ajusteAchados(x.p, A); x.adj = x.s + (temAchados ? x.aj.bonus : 0) - penEspecifico(x.p, A);
        }
        let rep = g.m[0];
        for (const x of g.m) if (temAchados ? x.adj + 0.15 * x.tip > rep.adj + 0.15 * rep.tip : x.tip + 0.3 * x.adj > rep.tip + 0.3 * rep.adj) rep = x;
        let rara = 0;
        if (!temAchados) { for (const k of setCobre(rep.p)) if (!A.qtk.has(k) && (A.share.get(k) || 0) / A.nR < 0.12) rara++; }
        return { g, rep, n: g.n, score: offset + rep.adj + PESO_INCIDENCIA * Math.log(g.n) - Math.min(0.15, 0.03 * rara) };
      });
    };
    const exatos = lista.filter(x => x.cm >= 0.99);   // conclusão/título casando com a consulta: só eles entram na contagem
    let cands = candidatos(exatos.length ? exatos : lista, 0);
    if (exatos.length && cands.length < max) cands = cands.concat(candidatos(lista.filter(x => x.cm < 0.99), -1));   // completa com parecidos
    cands.sort((x, y) => y.score - x.score || x.rep.p.id - y.rep.p.id);
    const aprendido = opts.aprendido && opts.aprendido.itens && opts.aprendido.itens[pq.chave];
    let usouEdicao = false;
    const res = cands.slice(0, max).map(({ g, rep, n, score }) => {
      const p = rep.p, m = montar(p, pq, !!opts.parecer);
      const editada = !!(aprendido && !usouEdicao && aprendido.chave === p.chave && aprendido.edit && aprendido.edit.modo === (opts.parecer ? "parecer" : "laudo"));
      if (editada) usouEdicao = true;
      let { a, c, frase } = m;
      if (editada) { if (opts.parecer) frase = aprendido.edit.texto; else a = aprendido.edit.a.slice(); }
      const vistos = new Set([fold(p.a.join(" ") + "|" + p.c.join(" "))]), variantes = [];
      for (const x of g.m) {   // outras formas do mesmo grupo (exemplos para a IA)
        const k = fold(x.p.a.join(" ") + "|" + x.p.c.join(" ")); if (vistos.has(k)) continue; vistos.add(k);
        const v = montar(x.p, pq, !!opts.parecer); variantes.push({ a: v.a, c: v.c, frase: v.frase });
        if (variantes.length >= 2) break;
      }
      return { p, score, a, c, frase, chave: p.chave, qkey: pq.chave, editada, titulo: p.titulo, origem: p.origem, previa: opts.parecer ? frase : (a[0] || c[0] || ""),
        n, ajuste: temAchados ? rep.aj : null, variantes, contrasteResidual: semC && p.contr };
    });
    res.ms = Date.now() - t0; res.pq = pq; res.achados = achados; res.temAchados = !!temAchados;
    return res;
  }
  /* a frase local ainda deixa a desejar frente ao que ele ditou? (então vale pedir o ajuste à IA) */
  function precisaIA(r, achados) {
    if (!r || !achados) return false;
    if (r.contrasteResidual) return true;   // sem contraste, mas a frase tem realce/contraste: a IA tira
    if (!(achados.presentes.length || achados.ausentes.length)) return false;
    const a = r.ajuste; if (!a) return true;
    return a.cov < 0.999 || a.fortes > 0 || a.ausAfirm > 0 || a.ausFalta > 0 || !!r.contrasteResidual;
  }

  /* ---------- negativos pertinentes (mesma conclusão -> "sem ..." que costumam vir junto) ---------- */
  function negativos(idx, res, textoFolha, max) {
    if (!res || !res.p) return [];
    const ents = idx.porChave.get(res.p.modal + "|" + res.p.chave) || new Set([res.p.entrada]);
    const cont = new Map();
    for (const e of ents) for (const l of new Set(e.negs.map(x => fold(x).replace(/[^a-z0-9 ]+/g, "").trim()))) {
      const orig = e.negs.find(x => fold(x).replace(/[^a-z0-9 ]+/g, "").trim() === l);
      const o = cont.get(l) || { l: orig, n: 0 }; o.n++; cont.set(l, o);
    }
    const minimo = ents.size >= 3 ? 2 : 1;
    const visto = new Set([...tokens(textoFolha || ""), ...tokens((res.a || []).concat(res.c || []).join(" "))]);
    const GENERICO = new Set(["livr", "alteraco", "sinai", "evidenc", "area", "foc", "outr"]);
    return [...cont.values()].filter(o => o.n >= minimo).sort((x, y) => y.n - x.n || x.l.length - y.l.length).filter(o => {
      const ks = [...tokens(o.l)].filter(k => !GENERICO.has(k));
      return ks.length && !ks.some(k => visto.has(k));
    }).slice(0, max || 3).map(o => /[.!?]$/.test(o.l) ? o.l : o.l + ".");
  }

  /* ---------- gatilho e comandos de voz ---------- */
  function detectar(head) {
    const re = /(^|[\s(\[])(?:@|arroba(?=\s|$))/giu; let m, ult = null;
    while ((m = re.exec(head))) ult = m;
    if (!ult) return null;
    const inicio = ult.index + ult[1].length, tok = ult[0].length - ult[1].length;
    return { inicio, token: head.slice(inicio, inicio + tok), query: head.slice(inicio + tok).replace(/^\s+/, "") };
  }
  const CMD = { primeira: 1, primeiro: 1, segunda: 2, segundo: 2, terceira: 3, terceiro: 3, cancela: "cancelar", cancelar: "cancelar", completar: "completar", completa: "completar" };
  function comandoFinal(query) {
    const m = String(query).match(/^([\s\S]*?)(?:^|\s)([\p{L}]+)\s*$/u);
    if (!m) return { query, cmd: null };
    const w = fold(m[2]), cmd = CMD[w];
    if (cmd === undefined) return { query, cmd: null };
    if (cmd !== "cancelar" && !m[1].trim()) return { query, cmd: null };
    return { query: m[1].trim(), cmd, palavra: m[2] };
  }

  /* ---------- aprendizado (por consulta) ---------- */
  const vazio = () => ({ versao: 1, itens: {} });
  const limparNumeros = t => String(t).replace(MEDIDA, (m, n, sp, un) => "___ " + un);
  function aprender(ap, qkey, chave, quando, edit) {
    if (!qkey || !chave) return ap;
    const it = ap.itens[qkey] && ap.itens[qkey].chave === chave ? ap.itens[qkey] : { chave, n: 0 };
    it.n = Math.min(50, (it.n || 0) + (edit ? 0 : 1)); it.atualizado = quando || it.atualizado || "";
    if (edit) it.edit = { modo: edit.modo, texto: limparNumeros(edit.texto || ""), a: (edit.a || []).map(limparNumeros) };
    ap.itens[qkey] = it;
    const ks = Object.keys(ap.itens);
    if (ks.length > 400) for (const k of ks.sort((x, y) => String(ap.itens[x].atualizado).localeCompare(String(ap.itens[y].atualizado))).slice(0, ks.length - 400)) delete ap.itens[k];
    return ap;
  }
  function mesclar(a, b) {
    const out = vazio();
    for (const src of [a, b]) for (const [k, v] of Object.entries((src && src.itens) || {})) {
      const o = out.itens[k];
      if (!o || String(v.atualizado || "") >= String(o.atualizado || "")) out.itens[k] = v;
    }
    return out;
  }

  /* ---------- texto: troca do trecho "@ consulta" (usado pela tela e testado em Node) ---------- */
  function aplicarNoTexto(texto, caret, res, opts) {
    opts = opts || {};
    const d = detectar(texto.slice(0, caret));
    if (!d) return null;
    const dep = texto.slice(caret), novo = opts.parecer ? [res.frase + (opts.neg && opts.neg.length ? " " + opts.neg.join(" ") : "")] : res.a.concat(opts.neg || []);
    return { antes: texto.slice(0, d.inicio), linhas: novo, depois: dep };
  }

  /* ---------- ajuste pela IA (depois que a frase local já entrou na folha) ---------- */
  const IA_TIMEOUT = 150000;
  /* d: { exame, parecer, fala, dx, presentes, ausentes, semContraste, local: {a, c, frase}, exemplos: [{a, c, frase}] } */
  function montarPromptIA(d) {
    const lista = v => (v && v.length ? v.join(", ") : "nenhum");
    const forma = x => (d.parecer ? x.frase : "ACHADO: " + (x.a || []).join(" ") + "\nCONCLUSÃO: " + (x.c || []).join(" "));
    const ex = (d.exemplos || []).map((x, i) => `Forma ${i + 1}:\n${forma(x)}`).join("\n");
    return `Assistente de laudos de um radiologista brasileiro (português do Brasil). O médico buscou uma frase no banco e ditou os achados que valem para ESTE exame. Reescreva a frase do banco para refletir exatamente o que ele ditou.
EXAME: ${d.exame || "(sem nome)"}
FORMATO: ${d.parecer ? "parecer provisório: uma frase única, com o achado e a conclusão entre parênteses no fim" : "laudo completo: achado e conclusão separados"}
FALA DO MÉDICO (pode ter erros do reconhecimento de voz): ${d.fala}
DIAGNÓSTICO: ${d.dx || "(ver fala)"}
ACHADOS PRESENTES DITADOS: ${lista(d.presentes)}
ACHADOS AUSENTES DITADOS (devem constar como negados): ${lista(d.ausentes)}${d.semContraste ? "\nEXAME SEM CONTRASTE: não cite realce, captação nem contraste." : ""}
FRASE DO BANCO (ponto de partida):
${forma(d.local)}
${ex ? "OUTRAS FORMAS DO BANCO (só como exemplo de estilo):\n" + ex + "\n" : ""}REGRAS:
1. Escreva no estilo das frases do banco. Inclua SÓ os achados presentes que ele ditou (mais o que define o diagnóstico); tire da frase os achados que ele não ditou.
2. Os ausentes ditados entram como negação ("sem ...", "ausência de ..."); mantenha as negações que a frase já tem.
3. Nunca invente número, medida, lado ou achado que ele não disse; onde faltar medida use "___".
4. Texto puro, sem markdown, sem comentários, sem explicar.
FORMATO DA RESPOSTA: ${d.parecer ? "uma única linha, só a frase." : "duas partes, exatamente assim:\nACHADO: <texto do achado, uma ou mais linhas>\nCONCLUSÃO: <conclusão em uma linha>"}`;
  }
  const limpaIA = t => String(t || "").replace(/```[a-z]*/gi, "").replace(/\*\*/g, "").replace(/^[\s"“”'`]+|[\s"“”'`]+$/g, "").replace(/\s+/g, " ").trim();
  /* texto da IA -> { a, c, frase } (null se vier fora do formato) */
  function lerRespostaIA(texto, parecer) {
    const linhas = String(texto || "").replace(/\r/g, "").split("\n").map(l => l.trim()).filter(l => l && !/^```\w*$/.test(l));
    if (!linhas.length) return null;
    if (parecer) {
      const l = limpaIA(linhas[0].replace(/^(frase|resposta)\s*:\s*/i, ""));
      if (l.length < 12 || l.length > 700 || /^(ok|n[aã]o|desculpe)/i.test(l)) return null;
      return { a: [], c: [], frase: /[.!?]$/.test(l) ? l : l + "." };
    }
    const a = [], c = []; let alvo = null;
    for (const l of linhas) {
      const m = l.match(/^\**\s*(ACHADOS?|CONCLUS[ÃA]O|CONCLUS[ÕO]ES)\s*\**\s*:\s*(.*)$/i);
      if (m) { alvo = /^ACHADO/i.test(m[1]) ? a : c; if (limpaIA(m[2])) alvo.push(limpaIA(m[2])); } else if (alvo) { const t = limpaIA(l); if (t) alvo.push(t); }
    }
    if (!a.length || !c.length || a.join(" ").length > 1200 || c.join(" ").length > 400) return null;
    return { a, c: [c.join(" ")], frase: "" };
  }
  /* trava de segurança: nada de número, lado ou contraste que ele não deu; ctx: { permitido (texto local + fala), semContraste } */
  function validarIA(r, ctx) {
    ctx = ctx || {};
    const txt = [r.frase || "", ...(r.a || []), ...(r.c || [])].join(" "), perm = fold(ctx.permitido || ""), f = fold(txt);
    if (!txt.trim()) return { ok: false, motivo: "vazio" };
    const nums = new Set((perm.match(/\d+(?:[.,]\d+)?/g) || []).map(n => n.replace(",", ".")));
    for (const n of f.match(/\d+(?:[.,]\d+)?/g) || []) if (!nums.has(n.replace(",", "."))) return { ok: false, motivo: "número novo: " + n };
    for (const [re, nome] of [[/\bdireit[oa]s?\b/, "direito"], [/\besquerd[oa]s?\b/, "esquerdo"]]) if (re.test(f) && !re.test(perm)) return { ok: false, motivo: "lado novo: " + nome };
    if (ctx.semContraste && CONTRASTE.test(f)) return { ok: false, motivo: "citou contraste" };
    return { ok: true };
  }
  /* fluxo do ajuste (as dependências vêm de fora: a tela passa a ponte/fila e a folha; o teste passa respostas falsas).
     dep: { prompt, parecer, pedir(prompt, signal), validar: {permitido, semContraste}, originais: [texto inserido], lerAtual(): [texto]|null, emUso(): bool,
            aplicar(novo), sugerir(novo), avisar(msg, tipo), timeoutMs }  -> "substituiu" | "sugeriu" | "manteve" */
  async function fluxoAjusteIA(dep) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer;
    const limite = new Promise((_, no) => { timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (_) {} no(Object.assign(new Error("tempo"), { tempo: true })); }, dep.timeoutMs || IA_TIMEOUT); });
    limite.catch(() => {});
    try {
      const resp = await Promise.race([Promise.resolve().then(() => dep.pedir(dep.prompt, ctl && ctl.signal)), limite]);
      const novo = lerRespostaIA(resp && resp.text, dep.parecer), v = novo && validarIA(novo, dep.validar);
      if (!v || !v.ok) { dep.avisar("A IA devolveu algo fora do combinado" + (v && v.motivo ? " (" + v.motivo + ")" : "") + "; mantive a frase do banco.", "falha"); return "manteve"; }
      const atual = dep.lerAtual();
      if (!atual) { dep.avisar("O trecho saiu da folha; não apliquei o ajuste da IA.", "falha"); return "manteve"; }
      const igual = atual.length === dep.originais.length && atual.every((t, i) => String(t).trim() === String(dep.originais[i]).trim());
      if (igual && !(dep.emUso && dep.emUso())) { dep.aplicar(novo); dep.avisar("Frase ajustada pela IA · Ctrl+Z volta à do banco.", "ok"); return "substituiu"; }
      dep.sugerir(novo); return "sugeriu";   // ele mexeu no trecho (ou o cursor está nele): sugestão no painel
    } catch (e) {
      dep.avisar(e && e.tempo ? "A IA demorou; mantive a frase do banco." : e && e.name === "AbortError" ? "Ajuste da IA cancelado." : e && /^bloqueado/i.test(e.message || "") ? "Filtro de privacidade bloqueou o envio; mantive a frase do banco." : "IA indisponível agora; mantive a frase do banco.", "falha");
      return "manteve";
    } finally { clearTimeout(timer); }
  }

  const api = { fold, tokens, classe, paresDe, buildIndex, parseQuery, buscar, precisaIA, modalidadeDe, semContrasteDe, montarPromptIA, lerRespostaIA, validarIA, fluxoAjusteIA, montar, fraseParecer, trocarLado, ajustarMedidas, negativos, detectar, comandoFinal,
    vazio, aprender, mesclar, aplicarNoTexto, ehNeg, limparNumeros };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TutuFrase = api;
})(globalThis);

/* ====================== Tela ====================== */
(() => {
  "use strict";
  /* ui.el do site só aceita texto; aqui os filhos podem ser elementos */
  const h = (tag, attrs = {}, ...kids) => { const n = ui.el(tag, attrs); for (const k of kids) if (k !== "" && k != null) n.append(k); return n; };
  if (typeof document === "undefined" || !window.tutuV2 || typeof sheet === "undefined") return;
  const ui = window.tutuV2, F = window.TutuFrase, DOC = "config/frase-v1";
  let idx = null, idxKey = "", idxEx = null, idxExKey = "", aprendido = F.vazio(), carregado = false;
  let ultimoPar = 0, modo = null, dispensado = null, ocupado = false, pendenteEdicao = null, rafId = 0, ajusteDepois = null;

  /* ---------- bancos ---------- */
  const sigBanco = () => BANK.length + ":" + (BANK.length ? BANK[BANK.length - 1][3].length : 0) + ":" + (window.BANK_PARES || []).length;
  function indice() {
    const k = sigBanco();
    if (!idx || k !== idxKey) { idx = F.buildIndex(BANK, { laudos: window.BANK_PARES || [] }); idxKey = k; }
    return idx;
  }
  function indiceExemplos() {
    const lista = (examples && current && examples[current.id]) || [], k = current.id + ":" + lista.length + ":" + (lista[0] || "").length;
    if (!idxEx || k !== idxExKey) {
      const linhas = lista.flatMap(t => String(t).split("\n")).map(l => l.trim()).filter(l => l.length >= 25 && l.length <= 400 && !isHeading(l) && !/^parecer provis/i.test(l) && !/^\W*(tc|angiotc|rm|usg)\b.*\d{4}\s*$/i.test(l));
      idxEx = F.buildIndex([["EXEMPLO", "", "", linhas.join("\n"), linhas.map(l => ({ a: [], c: [l] }))]], { origem: "exemplo", modal: F.modalidadeDe(current) || "TC", peso: 3 }); idxExKey = k;
    }
    return idxEx;
  }
  document.addEventListener("tutu-bancos", () => { idx = null; idxEx = null; });
  async function carregar() {
    if (carregado) return; carregado = true;
    try { const s = await window.tutuSite.db.doc(DOC).get(); if (s && s.exists) aprendido = F.mesclar(s.data(), aprendido); } catch (_) {}
  }
  let gravando = Promise.resolve();
  function salvar() {
    gravando = gravando.catch(() => {}).then(async () => {
      try {
        const d = window.tutuSite.db.doc(DOC), s = await d.get();
        if (s && s.exists) aprendido = F.mesclar(s.data(), aprendido);
        await d.set(aprendido);
      } catch (_) {}
    });
  }

  /* ---------- busca na máscara atual ---------- */
  const parecer = () => !!current && (current.tipo === "parecer" || /^parecer/i.test(current.name || ""));
  function pesquisar(query) {
    // só a mesma modalidade da máscara (null = não deu para saber: vale todo o banco); máscara sem contraste descarta realce/contraste
    const opts = { modal: F.modalidadeDe(current), semContraste: F.semContrasteDe(current), area: current && current.name, parecer: parecer(), aprendido, max: 3 };
    let res = F.buscar(indice(), query, opts);
    if (opts.parecer) {
      const ex = F.buscar(indiceExemplos(), query, opts), vistos = new Set();
      const junto = res.concat(ex).sort((x, y) => y.score - x.score).filter(r => { const k = fold(r.frase); if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(0, 3);
      res = Object.assign(junto, { ms: res.ms, pq: res.pq, achados: (res.length || !ex.length ? res : ex).achados, temAchados: res.temAchados });
    }
    return res;
  }

  /* ---------- painel ---------- */
  const box = h("section", { id: "fraseBox", role: "listbox", "aria-label": "Frases do banco para a consulta @" });
  box.hidden = true; document.body.append(box);
  box.addEventListener("mousedown", e => e.preventDefault());   // nunca tira o cursor da folha (o ditado continua)
  const HL = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined" ? new Highlight() : null;
  if (HL) CSS.highlights.set("tutu-frase", HL);
  const abrevia = (t, n) => { t = String(t); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
  function desenhar() {
    if (!modo) { box.hidden = true; box.replaceChildren(); HL && HL.clear(); return; }
    const head = h("div", { class: "fr-head" }, h("span", { class: "fr-chip" }, "@ Frase"),
      h("span", { class: "fr-q" }, modo.query ? modo.query : "diga ou digite o achado…"),
      h("small", {}, parecer() ? "parecer" : "laudo"));
    const linhas = modo.res.map((r, i) => {
      const li = h("div", { class: "fr-op", role: "option", "aria-selected": String(i === modo.sel), "data-i": String(i) },
        h("kbd", {}, String(i + 1)), h("span", { class: "fr-t" }, abrevia(parecer() ? r.frase : (r.c[0] || r.titulo), 150), h("em", { class: "fr-n", title: "quantas vezes esta forma aparece no banco" }, " ×" + (r.n || 1))),
        parecer() ? "" : h("small", {}, abrevia(r.a[0] || "", 110)));
      if (r.editada) li.append(h("small", { class: "fr-ed" }, "sua edição"));
      li.addEventListener("click", () => { modo.sel = i; confirmar(); });
      return li;
    });
    const out = [head, ...linhas];
    if (modo.query && !modo.res.length) out.push(h("div", { class: "fr-vazio" }, "Nada parecido no banco para esta busca."));
    if (modo.neg.length) out.push(h("div", { class: "fr-neg" }, (modo.negOn ? "✓ " : "＋ ") + "negativos: " + modo.neg.join(" ")));
    out.push(h("div", { class: "fr-dica" }, "↑ ↓ escolher · Enter ou “parágrafo” inserir · “segunda”/“terceira” · Tab ou “completar” negativos · Esc ou “cancela”"));
    box.replaceChildren(...out); box.hidden = false;
    posicionar();
  }
  function posicionar() {
    if (!modo || box.hidden) return;
    let rect = null;
    try { const r = getSelection().getRangeAt(0); rect = r.getClientRects()[0] || r.getBoundingClientRect(); } catch (_) {}
    if (!rect || !rect.height) rect = (modo.block.getBoundingClientRect());
    rect = { left: rect.left, top: Math.max(8, Math.min(innerHeight - 28, rect.top)), bottom: Math.max(28, Math.min(innerHeight - 8, rect.bottom)) };
    const p = TutuV2Core.placePalette(rect, innerWidth, innerHeight, 260);
    Object.assign(box.style, { left: p.left + "px", top: p.top + "px", width: p.width + "px", maxHeight: p.height + "px" });
  }

  /* ---------- ajuste pela IA: a frase local entra na hora; a IA reescreve conforme os achados ditados ---------- */
  const ajBox = h("div", { id: "fraseAjuste", role: "status", "aria-live": "polite" });
  ajBox.hidden = true; document.body.append(ajBox);
  ajBox.addEventListener("mousedown", e => { if (e.target.tagName !== "BUTTON") e.preventDefault(); });
  const HL2 = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined" ? new Highlight() : null;
  if (HL2) CSS.highlights.set("tutu-frase-ajuste", HL2);
  const ajustes = new Set();
  let ajMsg = "", ajTimer = 0, sugestao = null;
  function pintarAjuste() {
    ajBox.replaceChildren();
    if (sugestao) {
      ajBox.append(h("span", { class: "fa-t" }, "A IA sugere: " + abrevia(sugestao.texto, 170) + " "),
        ui.button("Aceitar", () => { const sg = sugestao; sugestao = null; pintarAjuste(); try { aplicarIA(sg.info, sg.nova, true); } catch (_) { avisarAjuste("Não consegui aplicar a sugestão."); } }, { class: "fa-b" }),
        ui.button("Ignorar", () => { sugestao = null; pintarAjuste(); }, { class: "fa-b" }));
      ajBox.hidden = false; return;
    }
    const t = ajMsg || (ajustes.size ? "ajustando…" : "");
    if (!t) { ajBox.hidden = true; return; }
    ajBox.append(h("span", { class: "fa-t" }, t)); ajBox.hidden = false;
  }
  function avisarAjuste(msg) { ajMsg = msg; clearTimeout(ajTimer); ajTimer = setTimeout(() => { ajMsg = ""; pintarAjuste(); }, 7000); pintarAjuste(); }
  function marcarAjuste(info) {
    ajustes.add(info); info.ranges = [];
    if (HL2) for (const b of info.blocks) { const r = document.createRange(); r.selectNodeContents(b); info.ranges.push(r); HL2.add(r); }
    pintarAjuste();
  }
  function desmarcarAjuste(info) { if (HL2) for (const r of info.ranges || []) HL2.delete(r); ajustes.delete(info); pintarAjuste(); }
  function emUsoPor(info) { const s = getSelection(); return !!(s.rangeCount && info.blocks.some(b => b.contains(s.anchorNode))); }
  /* troca o conteúdo dos blocos por linhas novas pelo caminho nativo (Ctrl+Z volta à frase do banco) e devolve o cursor onde estava */
  function trocarBlocos(blocks, linhas) {
    const s = getSelection(), salvo = s.rangeCount ? s.getRangeAt(0).cloneRange() : null, foco = document.activeElement;
    ocupado = true;
    try {
      const rg = document.createRange(), ult = blocks[blocks.length - 1];
      rg.setStart(blocks[0], 0); rg.setEnd(ult, ult.childNodes.length);
      sheet.focus({ preventScroll: true }); s.removeAllRanges(); s.addRange(rg);
      escrever(linhas);
      if (salvo && salvo.startContainer.isConnected) { s.removeAllRanges(); s.addRange(salvo); }
      if (foco && foco !== document.activeElement && foco.isConnected && foco.focus) foco.focus({ preventScroll: true });
    } finally { ocupado = false; }
    agendar();
  }
  function trocarConclusao(antes, depois) {
    if (!antes || !antes[0] || !depois || !depois[0]) return false;
    const ps = [...sheet.children], hi = ps.findIndex(p => fold(p.textContent).trim() === "conclusao"); if (hi < 0) return false;
    const norm = t => fold(t).replace(/^\s*\d+\s*[.)]\s*/, "").replace(/\s+/g, " ").trim();
    for (let i = hi + 1; i < ps.length && !isHeading(ps[i].textContent.trim()); i++) {
      if (norm(ps[i].textContent) === norm(antes[0])) { const num = ps[i].textContent.match(/^\s*\d+\s*[.)]\s*/); ps[i].textContent = (num ? num[0] : "") + depois[0]; return true; }
    }
    return false;
  }
  function aplicarIA(info, nova, forcar) {
    if (!info.blocks.every(b => b.isConnected)) { avisarAjuste("O trecho saiu da folha; não apliquei o ajuste."); return; }
    pushVersion("Antes do ajuste da IA");
    const linhas = info.par ? [nova.frase + (info.neg.length ? " " + info.neg.join(" ") : "")] : nova.a.slice();
    trocarBlocos(info.blocks, linhas);
    if (!info.par) trocarConclusao(info.concl, nova.c);
    if (forcar) avisarAjuste("Frase ajustada pela IA · Ctrl+Z volta à do banco.");
    scheduleCaseSave(); try { renderAlerts(); updateCount(); } catch (_) {}
    pushVersion("Frase ajustada pela IA");
  }
  /* devolve o ajuste a pedir (ou null): só quando ele ditou achados além do diagnóstico e a frase local não os cobre */
  function planejarIA(m, r) {
    const C = ui.conversa;
    if (!C || !C.pedirIA || !F.precisaIA(r, m.res.achados)) return null;
    return { achados: m.res.achados, query: m.query };
  }
  function iniciarAjuste(plano, r, par, neg, blocks, originais, concl) {
    const C = ui.conversa, A = plano.achados, info = { blocks, par, neg, concl, ranges: [] };
    const dados = fala => ({ exame: typeof nameAll === "function" ? nameAll() : (current && current.name) || "", parecer: par, fala, dx: A.dx.join(" "), presentes: A.presentes, ausentes: A.ausentes, semContraste: A.semContraste,
      local: { a: r.a, c: r.c, frase: r.frase }, exemplos: r.variantes || [] });
    const fala = C.limparPedido ? C.limparPedido(plano.query) : plano.query;
    const anonDados = () => { const an = C.anon, d = dados(an(fala)), lin = v => v.map(an); return { ...d, dx: an(d.dx), presentes: lin(d.presentes), ausentes: lin(d.ausentes), local: { a: lin(r.a), c: lin(r.c), frase: an(r.frase) },
      exemplos: (r.variantes || []).map(v => ({ a: lin(v.a), c: lin(v.c), frase: an(v.frase) })) }; };
    marcarAjuste(info);
    F.fluxoAjusteIA({
      prompt: F.montarPromptIA(dados(fala)), parecer: par,
      pedir: (prompt, signal) => C.pedirIA(prompt, signal, () => F.montarPromptIA(anonDados())),
      validar: { permitido: [r.frase, ...r.a, ...r.c, fala].join(" "), semContraste: A.semContraste },
      originais, lerAtual: () => (blocks.every(b => b.isConnected) ? blocks.map(b => blockText(b)) : null), emUso: () => emUsoPor(info),
      aplicar: nova => aplicarIA(info, nova, false),
      sugerir: nova => { sugestao = { info, nova, texto: par ? nova.frase : nova.a.join(" ") + " → " + nova.c.join(" ") }; pintarAjuste(); },
      avisar: msg => avisarAjuste(msg),
    }).finally(() => desmarcarAjuste(info));
  }

  /* ---------- gatilho ---------- */
  function contexto() {
    const s = getSelection();
    if (!s.rangeCount || !s.isCollapsed || !sheet.contains(s.anchorNode)) return null;
    const block = caretBlock(); if (!block) return null;
    const r = s.getRangeAt(0), head = document.createRange(); head.selectNodeContents(block); head.setEnd(r.startContainer, r.startOffset);
    return { block, caret: offsetOf(block, r.startContainer, r.startOffset), texto: blockText(block) };
  }
  const contaGatilhos = t => (String(t).match(/(^|[\s(\[])(?:@|arroba(?=\s|$))/giu) || []).length;
  function fechar() { modo = null; desenhar(); }
  function agendar() { if (rafId) return; rafId = requestAnimationFrame(() => { rafId = 0; avaliar(); }); }
  function avaliar() {
    if (ocupado) return;
    const c = contexto();
    // "parágrafo" falado: o texto da folha já abriu um parágrafo novo logo abaixo do @ -> é a confirmação (a frase entra no parágrafo anterior)
    if (modo && c && c.block !== modo.block && modo.block.isConnected && Date.now() - ultimoPar < 1500 && c.block === modo.block.nextElementSibling && modo.res.length) { confirmar(c.block); return; }
    if (!c || isHeading(c.texto.trim())) { if (modo) fechar(); return; }
    verificarEdicao(c.block);
    const d = F.detectar(c.texto.slice(0, c.caret));
    if (!d) { if (modo) fechar(); return; }
    if (dispensado && dispensado.block === c.block && contaGatilhos(c.texto) <= dispensado.n) { if (modo) fechar(); return; }
    const { query, cmd, palavra } = F.comandoFinal(d.query);
    if (cmd) { comandoDeVoz(c, d, query, cmd, palavra); return; }
    carregar();
    const chave = c.block === (modo && modo.block) ? modo.query : null;
    if (!modo || chave !== query || modo.inicio !== d.inicio || modo.block !== c.block) {
      const res = query.trim() ? pesquisar(query) : [];
      modo = { block: c.block, inicio: d.inicio, query, res, sel: 0, neg: [], negOn: false };
      if (res.length) { try { modo.neg = F.negativos(indice(), res[0], fold(sheet.textContent), 3); } catch (_) {} }
    }
    modo.caret = c.caret;
    if (HL) { HL.clear(); const r = rangeFromOffsets(c.block, d.inicio, c.caret); if (r) HL.add(r); }
    desenhar();
  }
  function removerPalavra(c, palavra) {
    // apaga o comando falado (e o espaço antes) do fim do trecho
    const fim = c.caret, ini = c.texto.slice(0, fim).toLowerCase().lastIndexOf(String(palavra).toLowerCase());
    if (ini < 0) return;
    let a = ini; while (a > 0 && /\s/.test(c.texto[a - 1])) a--;
    const r = rangeFromOffsets(c.block, a, fim); if (!r) return;
    ocupado = true;
    try { const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand("delete"); } finally { ocupado = false; }
  }
  function comandoDeVoz(c, d, query, cmd, palavra) {
    removerPalavra(c, palavra);
    const c2 = contexto(), d2 = c2 && F.detectar(c2.texto.slice(0, c2.caret));
    if (cmd === "cancelar") { dispensado = { block: c.block, n: contaGatilhos(c2 ? c2.texto : c.texto) }; fechar(); return; }
    if (!d2) return;
    modo = null; avaliar();
    if (!modo) return;
    if (cmd === "completar") { if (modo.neg.length) { modo.negOn = !modo.negOn; desenhar(); } return; }
    if (typeof cmd === "number" && modo.res[cmd - 1]) { modo.sel = cmd - 1; desenhar(); }
  }

  /* ---------- inserir ---------- */
  function escrever(linhas) {
    // linhas -> parágrafos a partir da seleção atual (mesmo caminho do ditado: insertText + insertParagraph)
    linhas.forEach((ln, i) => { if (i) document.execCommand("insertParagraph"); if (ln) document.execCommand("insertText", false, ln); });
  }
  function confirmar(novoBloco) {
    if (!modo || !modo.res.length) return false;
    const m = modo, r = m.res[m.sel], par = parecer();
    let c = contexto(); if (novoBloco && novoBloco.nodeType === 1) { const t = blockText(m.block); c = { block: m.block, caret: t.length, texto: t }; } else novoBloco = null;
    if (!c || c.block !== m.block) { fechar(); return false; }
    const ini = F.detectar(c.texto.slice(0, c.caret)); if (!ini) { fechar(); return false; }
    const neg = m.negOn ? m.neg : [], plano = planejarIA(m, r);
    pushVersion("Antes da frase @");
    ocupado = true;
    try {
      // 1) conclusão na Impressão (laudo completo): antes de mexer no cursor
      if (!par) {
        const info = ui.conclusao && ui.conclusao.escrever;
        if (info && r.c.length) { try { ui.conclusao.escrever(r.c); } catch (_) {} }
      }
      const rg = rangeFromOffsets(c.block, ini.inicio, c.caret);
      const s = getSelection(); sheet.focus({ preventScroll: true }); s.removeAllRanges(); if (rg) s.addRange(rg);
      const textoPar = r.frase + (neg.length ? " " + neg.join(" ") : "");
      const linhas = par ? [textoPar] : r.a.concat(neg);
      escrever(linhas.length ? linhas : [r.c.join(" ")]);
      if (novoBloco && novoBloco.isConnected) caretAtStart(novoBloco); else document.execCommand("insertParagraph");     // cursor num parágrafo novo, pronto para o próximo achado
      const sel2 = getSelection(); sheetRange = sel2.rangeCount ? sel2.getRangeAt(0).cloneRange() : sheetRange;
      const blocos = inseridos(c.block, linhas.length);
      // frase que vai ser ajustada pela IA é sob medida: a edição dela não vira a preferida da consulta
      pendenteEdicao = plano ? null : { qkey: r.qkey, chave: r.chave, modo: par ? "parecer" : "laudo", blocks: blocos, textos: linhas.slice() };
      if (plano) { const nA = par ? 1 : Math.max(1, r.a.length); ajusteDepois = () => iniciarAjuste(plano, r, par, neg, blocos.slice(0, nA), linhas.slice(0, nA), r.c); }
    } finally { ocupado = false; }
    if (ajusteDepois) { const f = ajusteDepois; ajusteDepois = null; f(); }
    F.aprender(aprendido, r.qkey, r.chave, new Date().toISOString()); salvar();
    modo = null; dispensado = null; desenhar();
    scheduleCaseSave(); try { renderAlerts(); updateCount(); } catch (_) {}
    return true;
  }
  const caretAtStart = el => { const r = document.createRange(); r.selectNodeContents(el); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
  const inseridos = (b0, n) => { const out = []; let b = b0; for (let i = 0; i < n && b; i++) { out.push(b); b = b.nextElementSibling; } return out; };
  // se ele editar a frase inserida, a versão editada vira a preferida para a consulta
  function verificarEdicao(blocoAtual) {
    const p = pendenteEdicao; if (!p) return;
    if (p.blocks.includes(blocoAtual)) return;
    pendenteEdicao = null;
    if (p.blocks.some(b => !b.isConnected)) return;
    const atual = p.blocks.map(b => blockText(b).trim()), antes = p.textos.map(t => t.trim());
    if (atual.join("\n") === antes.join("\n") || !atual.join("").trim()) return;
    F.aprender(aprendido, p.qkey, p.chave, new Date().toISOString(), { modo: p.modo, texto: atual.join(" "), a: atual });
    salvar();
  }

  /* ---------- teclas (o painel manda nas setas/Enter enquanto aberto; o ditado segue ligado) ---------- */
  window.addEventListener("keydown", e => {
    if (!modo || box.hidden || (e.target !== sheet && !sheet.contains(e.target))) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key, tomar = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if ((k === "ArrowDown" || k === "ArrowUp") && modo.res.length) {
      tomar(); const n = modo.res.length; modo.sel = (modo.sel + (k === "ArrowDown" ? 1 : n - 1)) % n; desenhar();
    } else if (k === "Enter" && !e.shiftKey && modo.res.length) { tomar(); if (!e.repeat) confirmar(); }
    else if (k === "Tab" && !e.shiftKey && modo.neg.length) { tomar(); modo.negOn = !modo.negOn; desenhar(); }
    else if (k === "Escape") { tomar(); const c = contexto(); dispensado = { block: modo.block, n: c ? contaGatilhos(c.texto) : 1 }; fechar(); }
  }, true);
  // "parágrafo" falado vira insertParagraph: é a confirmação da frase (cancela o parágrafo comum e insere a destacada)
  sheet.addEventListener("beforeinput", e => {
    if (ocupado || !modo || e.inputType !== "insertParagraph" || !modo.res.length) return;
    e.preventDefault(); confirmar();
  }, true);
  sheet.addEventListener("input", e => { if (e.inputType === "insertParagraph") ultimoPar = Date.now(); agendar(); });
  document.addEventListener("selectionchange", agendar);
  new MutationObserver(agendar).observe(sheet, { childList: true, subtree: true, characterData: true });
  window.addEventListener("resize", posicionar);
  ui.center && ui.center.addEventListener("scroll", posicionar, { passive: true });
  if (typeof learnFromEdit === "function") {
    const original = learnFromEdit;
    learnFromEdit = function () { try { verificarEdicao(null); } catch (_) {} return original.apply(this, arguments); };
  }
  ui.frase = { avaliar, confirmar, estado: () => modo && { query: modo.query, sel: modo.sel, n: modo.res.length, textos: modo.res.map(r => r.frase), contagens: modo.res.map(r => r.n) }, indice,
    ajuste: () => ({ pendentes: ajustes.size, sugestao: !!sugestao }) };
})();
