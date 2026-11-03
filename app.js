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
function examModality(ex){
  if (["TC", "USG", "RM"].includes(ex.modalidade)) return ex.modalidade;
  const text = fold([ex.name, ex.mask].join(" "));
  if (/\b(usg|us|ultrassom|ultrassonografia|ultrassonografico|ecografia)\b/.test(text)) return "USG";
  if (/\b(rm|ressonancia|ressonancia magnetica)\b/.test(text)) return "RM";
  return "TC";
}
function examGroups(){
  return ["TC", "USG", "RM"].flatMap(mod => [false, true].map(parecer => [
    mod + (parecer ? " · Pareceres provisórios" : " · Laudos"),
    EXAMS.filter(ex => examModality(ex) === mod && (ex.tipo === "parecer") === parecer)
  ]));
}
function renderExams(){
  const wrap = $("exams"); wrap.textContent = ""; updMaskChip();
  const groups = examGroups();
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
function modelSheetHtml(ex){
  const parecer = ex.tipo === "parecer";
  return maskOf(ex).split("\n").map(l => l.trim()).filter(Boolean).map((raw, i) => {
    const { al, t } = splitAlign(raw);
    if (!parecer && i === 0) return P(fmt(fmtInline(stripTags(t)), FORMAT.title), al);
    if (!parecer && isHeading(t)) return BLANK + P(fmt(fmtInline(stripTags(t)), FORMAT.heading), al);
    if (t === "[<>]") return P(esc(t), al);
    let m;
    if ((m = t.match(/^\[<(.*)>\]$/)) || (m = t.match(/^\[(.*)\]$/))) return P(fmtInline(m[1]), al);
    return P(fmtInline(t), al);
  }).join("");
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
  const lines = maskOf(ex).split("\n").map(l => l.trim()).filter(Boolean);
  const parecer = ex.tipo === "parecer";
  let out = "";
  lines.forEach((raw,i) => {
    const { al, t } = splitAlign(raw);
    if (!parecer && i === 0){ out += P(fmt(fmtInline(stripTags(t)), FORMAT.title), al); return; }
    if (!parecer && isHeading(t)){ out += BLANK + P(fmt(fmtInline(stripTags(t)), FORMAT.heading), al); return; }
    if (t === "[<>]"){ out += P(`<span class="fill">[campo a preencher]</span>`, al); return; }
    let m;
    if ((m = t.match(/^\[<(.*)>\]$/))){ out += P(fmtInline(m[1]), al); return; }
    if ((m = t.match(/^\[(.*)\]$/))){ out += P(`<span class="opt">${fmtInline(m[1])} (opcional)</span>`, al); return; }
    out += P(fmtInline(t), al);
  });
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
  try{ add(stripTags(maskAll())); }catch(e){}
  for (const c of correcoes) add(c.para);
  return out.slice(0, 150);
}
function publishVoice(){
  const cfg = {
    commands: [...BUILTIN_CMDS, ...comandos.map(c => ({ fala:c.fala, acao:c.acao })),
      ...EXAMS.flatMap(e => (e.voz || []).filter(v => /^parecer\b/i.test(v)).map(v => ({ fala:v, acao:"exame:" + e.id })))],
    exams: EXAMS.map(e => ({ id:e.id, voz:e.voz || [], nome:shortName(e), parecer:e.tipo === "parecer" })),
    frases: frases.map(f => ({ nome:f.nome, texto:f.texto })),
    vocab: window.__VOCAB || [],
    vocabExame: vocabExame(),
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
  de = String(de || "").trim(); para = String(para || "").trim();
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
  tmp.querySelectorAll("p,div,li").forEach(n => { const a = n.style.textAlign; n.setAttribute("style", PSTYLE + (a ? ";text-align:" + a : "")); });
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
    modalidade:["TC", "USG", "RM"].includes(d.modalidade) ? d.modalidade : "", criadoEm:d.criadoEm || "" };
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
  const ordered = examGroups().flatMap(([, list]) => list);
  let lastT = null;
  for (const ex of ordered){
    const t = examModality(ex) + (ex.tipo === "parecer" ? " · Pareceres provisórios" : " · Laudos");
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
  $("mModalidade").value = ex ? examModality(ex) : "TC";
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
      name, code: autoCode(name), modalidade: $("mModalidade").value,
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
const FIELD_RE = /\[<>\]|\[[^\[\]<>\n]{1,40}\]|\{[^{}\n]*\|[^{}\n]*\}/g;
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
  sheetRange = r.cloneRange();
  (r.startContainer.parentElement || sheet).scrollIntoView({ block: "nearest" });
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
  bar.innerHTML = `<button type="button" data-m="fix" title="Corrigir esta palavra e adicionar às correções" aria-label="Corrigir palavra">${ICON.fix}</button><button type="button" data-m="auto" title="Criar autotexto com o trecho selecionado" aria-label="Criar autotexto">${ICON.auto}</button><button type="button" class="cl" data-m="style" title="Ensinar um estilo de escrita ao Claude" aria-label="Ensinar estilo">${ICON.style}</button>`;
  const box = document.createElement("div"); box.id = "qfix"; box.hidden = true;
  box.innerHTML = '<span class="qf-lab" id="qfLab"></span><select id="qfSc" hidden aria-label="Vale para"><option value="todos">Todos os exames</option><option value="este">Só este exame</option></select><input type="text" id="qfIn" autocomplete="off" spellcheck="false"><button class="btn primary small" id="qfOk" type="button">Salvar</button><button class="icon-btn" id="qfX" type="button" aria-label="Fechar" title="Fechar (Esc)">×</button>';
  document.body.append(bar, box);
  const inp = box.querySelector("#qfIn"), lab = box.querySelector("#qfLab"), sc = box.querySelector("#qfSc");
  let rng = null, orig = "", full = "", mode = "";
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
  function open(m){
    if (!rng) return;
    mode = m; const rc = rng.getBoundingClientRect();
    hideBar(); sc.hidden = m !== "style";
    if (m === "fix"){ lab.textContent = "Corrigir para"; inp.value = orig; inp.placeholder = ""; inp.style.width = "190px"; box.querySelector("#qfOk").textContent = "Salvar"; }
    else if (m === "auto"){ lab.textContent = "Autotexto:"; inp.value = ""; inp.placeholder = "nome (ex.: apendicectomia)"; inp.style.width = "210px"; box.querySelector("#qfOk").textContent = "Salvar"; }
    else { lab.textContent = "Estilo"; inp.value = ""; inp.placeholder = "Ex.: escrever sempre assim… / nunca usar…"; inp.style.width = "300px"; box.querySelector("#qfOk").textContent = "Salvar"; }
    place(box, rc); inp.focus(); inp.select();
  }
  bar.addEventListener("mousedown", e => e.preventDefault());
  bar.addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (b) open(b.dataset.m); });
  sheet.addEventListener("mouseup", () => setTimeout(show, 0));
  sheet.addEventListener("keyup", e => { if (e.shiftKey && e.key.startsWith("Arrow")) show(); });
  sheet.addEventListener("mousedown", hideAll);
  sheet.addEventListener("input", hideAll);
  addEventListener("scroll", e => { if (e.target && e.target.classList && e.target.classList.contains("sheet-wrap")) hideAll(); }, true);
  document.addEventListener("mousedown", e => { if (!box.hidden && !box.contains(e.target) && !bar.contains(e.target) && !sheet.contains(e.target)) hideAll(); });
  box.addEventListener("mousedown", e => { if (!/^(INPUT|SELECT|OPTION)$/.test(e.target.tagName)) e.preventDefault(); });
  const close = () => { hideAll(); sheet.focus(); };
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
      hideAll(); setStatus(ok ? `Autotexto "${nome}" salvo. No ditado, diga "autotexto ${nome}".` : "Não consegui salvar o autotexto (a página precisa estar dentro do claude.ai).", ok ? "ok" : "err");
    } else {
      const texto = val + (full.length <= 200 ? ` (exemplo do trecho: "${full.replace(/\s+/g, " ")}")` : "");
      let n = 0; try{ n = await addRules([{ texto, exame: sc.value === "este" ? current.id : "todos" }], "estilo"); }catch(e){}
      hideAll(); setStatus(n ? "Regra de estilo salva (sem usar o Claude). Vale a partir do próximo Gerar laudo." : "Não consegui salvar a regra (a página precisa estar dentro do claude.ai).", n ? "ok" : "err");
    }
  }
  box.querySelector("#qfOk").onclick = apply;
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter"){ e.preventDefault(); e.stopPropagation(); apply(); }
    else if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); close(); }
  });
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
  const api = { normalize, distance, score, placePalette, validSession };
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
  app.id = "tutuApp";
  const top = el("header", { id: "v2Top" });
  top.append(el("span", { class: "v2-brand" }, "Tutu"));
  const tabs = el("nav", { id: "caseTabs", role: "tablist", "aria-label": "Casos abertos" });
  top.append(tabs, button("+", () => ui.newTab(), { id: "newCaseTab", title: "Novo caso", "aria-label": "Novo caso" }));
  const actions = el("div", { class: "v2-top-actions" });
  actions.append(el("span", { id: "saveState", role: "status" }, "salvando…"), button("Ctrl K", () => ui.openPalette(), { title: "Buscar ações · Ctrl+K" }));
  move("copiar", actions); $("copiar").textContent = "Copiar laudo";
  $("copiar").append(el("kbd", {}, "Ctrl ⇧ 1")); top.append(actions);
  const left = ui.left = el("aside", { id: "v2Left", "aria-label": "Máscaras e histórico" });
  const leftToggle = button("Máscaras · Ctrl [", () => ui.toggleLeft(), { id: "leftToggle", "aria-expanded": "true", title: "Recolher/expandir máscaras · Ctrl+[", "aria-keyshortcuts": "Control+[" });
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
  right.append(button("Recolher · Ctrl ]", () => ui.toggleRight(), { id: "rightToggle", "aria-expanded": "true", title: "Recolher/expandir ferramentas · Ctrl+]", "aria-keyshortcuts": "Control+]" }), rnav, ...Object.values(ui.panels));
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
  const voice = el("div", { id: "voicePill", role: "status", "aria-live": "polite" });
  voice.append(el("span", { id: "voiceDot", "aria-hidden": "true" }, "●"), el("span", { id: "voiceLabel" }, "Voz · Alt S"));
  const outline = el("div", { id: "activeOutline", "aria-hidden": "true" }); outline.hidden = true;
  const settings = $("setModal"); settings.classList.add("v2-settings"); settings.removeAttribute("aria-modal"); settings.setAttribute("role", "region");
  const settingsExtras = el("div", { class: "v2-settings-extras" });
  settings.querySelector(".calc-body").prepend(settingsExtras);
  settingsExtras.append(el("h2", {}, "Tutu · Configurações"));
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
  document.body.append(voice, outline);
  ui.settings = on => { settings.hidden = !on; app.classList.toggle("settings-open", on); if (on) { renderKeys(); $("setTitle").focus(); } else focusSheet(); ui.updateOutline?.(); };
  $("setTitle").tabIndex = -1; $("setBtn").onclick = () => ui.settings(true);
  const oldOpen = openModal, oldClose = closeModal;
  openModal = id => id === "setModal" ? ui.settings(true) : oldOpen(id);
  closeModal = id => id === "setModal" ? ui.settings(false) : oldClose(id);
  ui.panel = name => {
    if (app.classList.contains("focus-mode")) setFoco(false);
    app.classList.remove("right-mini"); store.set("v2RightMini", "0");
    Object.entries(ui.panels).forEach(([n, p]) => { p.hidden = n !== name; $(p.getAttribute("aria-labelledby")).setAttribute("aria-selected", String(n === name)); });
    $("rightToggle").setAttribute("aria-expanded", "true");
    $("rightToggle").textContent = "Recolher · Ctrl ]";
  };
  ui.toggleLeft = () => { const mini = app.classList.toggle("left-mini"); store.set("v2LeftMini", mini ? "1" : "0"); leftToggle.setAttribute("aria-expanded", String(!mini)); };
  ui.toggleRight = () => { const mini = app.classList.toggle("right-mini"); store.set("v2RightMini", mini ? "1" : "0"); $("rightToggle").setAttribute("aria-expanded", String(!mini)); $("rightToggle").textContent = (mini ? "Expandir" : "Recolher") + " · Ctrl ]"; };
  ui.compact = () => { app.classList.toggle("compact"); ui.settings(false); ui.positionPalette?.(); };
  ui.night = () => { const night = document.body.classList.toggle("sepia-night"); store.set("v2Night", night ? "1" : "0"); $("nightToggle").textContent = night ? "Sépia dia" : "Sépia noite"; $("nightToggle").setAttribute("aria-pressed", String(night)); $("themeButton").textContent = night ? "☀" : "☾"; };
  top.append(button("☾", () => ui.night(), { id: "themeButton", title: "Alternar sépia dia/noite", "aria-label": "Alternar sépia dia/noite" }));
  if (store.get("v2Night") === "1") ui.night();
  if (store.get("v2LeftMini") === "1" || innerWidth < 760) ui.toggleLeft();
  if (store.get("v2RightMini") === "1" || innerWidth < 760) ui.toggleRight();
  $("maskSearch").oninput = () => {
    document.querySelectorAll("#exams .exam").forEach(b => b.hidden = !TutuV2Core.score($("maskSearch").value, b.textContent));
    document.querySelectorAll("#exams .exam-group").forEach(h => {
      let visible = false;
      for (let b = h.nextElementSibling; b && !b.classList.contains("exam-group"); b = b.nextElementSibling) if (!b.hidden) visible = true;
      h.hidden = !visible;
    });
  };
  const render = renderExams;
  renderExams = () => { render(); $("maskSearch").oninput(); };
  // Os atalhos antigos de foco/plantão passam a usar as disposições da casca.
  setCollapsed = on => { if (app.classList.contains("left-mini") !== on) ui.toggleLeft(); };
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
    const r = sheetRange;
    if (!r || !sheet.contains(r.startContainer) || !settings.hidden) { outline.hidden = true; return; }
    const node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const block = node.closest("#laudo > p, #laudo > div, #laudo li") || sheet;
    const rect = block.getBoundingClientRect(), clip = center.getBoundingClientRect();
    outline.hidden = rect.bottom < clip.top || rect.top > clip.bottom;
    Object.assign(outline.style, { top: Math.max(rect.top, clip.top) + "px", left: rect.left - 3 + "px", width: rect.width + 6 + "px", height: Math.max(1, Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top)) + "px" });
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
  let tabs = [], active = "", restoring = true, writes = Promise.resolve(), revision = 0, reviewBusy = false, copying = false;
  const oldConferir = conferir;
  conferir = async (...args) => { reviewBusy = true; try { return await oldConferir(...args); } finally { reviewBusy = false; confCtl = null; } };
  const oldCopy = doCopy;
  doCopy = async () => { if (copying) return; copying = true; try { return await oldCopy(); } finally { copying = false; } };
  const clone = value => structuredClone(value);
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
    catch (_) { $("saveState").textContent = "falha no salvamento local"; return false; }
  }
  function persist() {
    if (restoring || !active) return writes;
    const item = captureActive(); const localOK = journal(), rev = ++revision;
    const list = { version: 2, active, ids: tabs.map(t => t.id) };
    $("saveState").textContent = "salvando…";
    // Captura antes de enfileirar: uma troca de aba não pode mudar o destino da escrita.
    const plain = laudoTagged();
    writes = writes.catch(() => {}).then(async () => {
      await tutuSite.db.doc("casos/" + item.id).set({
        dia: dayKey(new Date(item.started)), inicio: item.started, atualizado: item.updated,
        hora: new Date(item.started).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        exame: fullName(item.exam), exameId: item.examId, laudo: plain, laudoHtml: item.html,
        achados: "", versoes: item.versions, copiado: item.copied, v2: item
      });
      await tutuSite.db.doc("config/abas-v2").set(list);
      if (rev === revision) $("saveState").textContent = "salvo agora";
    }).catch(() => { if (rev === revision) $("saveState").textContent = localOK ? "salvo localmente · banco indisponível" : "falha ao salvar"; });
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
        "aria-selected": String(t.id === active), "aria-controls": "v2Center", title: fullName(t.exam || { name: t.examId }) + " · Criado em " + (t.started && !isNaN(Date.parse(t.started)) ? new Date(t.started).toLocaleString("pt-BR") : "data não disponível") + " · Ctrl+Tab", tabindex: t.id === active ? "0" : "-1" });
      const dot = ui.el("i", { class: "case-rec", "aria-label": "Ditado neste caso" }); dot.hidden = ui.voiceCase !== t.id;
      b.append(dot, ui.el("span", {}, shortName(t.exam || { name: t.examId })));
      const item = ui.el("div", { class: "case-tab" });
      const del = ui.button("", () => ui.deleteTab(t.id), { class: "case-delete", title: "Excluir laudo", "aria-label": "Excluir laudo: " + shortName(t.exam || { name: t.examId }) });
      del.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
      item.append(b, del); nav.append(item);
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
  ui.deleteTab = id => {
    const index = tabs.findIndex(t => t.id === id);
    if (restoring || index < 0 || !canSwitch()) return;
    if (!confirm("Excluir este laudo e removê-lo do histórico? Esta ação não pode ser desfeita.")) return;
    persist();
    const wasActive = id === active;
    tabs.splice(index, 1);
    if (!tabs.length) tabs.push({ id: newId(), examId: current.id, exam: clone(current), html: modelSheetHtml(current), started: stamp(), versions: [] });
    if (wasActive) load(tabs[Math.min(index, tabs.length - 1)]); else renderTabs();
    writes = writes.catch(() => {}).then(() => tutuSite.db.doc("casos/" + id).delete()).catch(() => {
      setStatus("Não foi possível excluir o laudo do histórico. Tente novamente pelo histórico.", "err");
    });
    persist();
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
    const t = item.v2 || { id, examId: item.exameId || current.id, exam: EXAMS.find(e => e.id === item.exameId) || current,
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
    if (!TutuV2Core.validSession(saved)) {
      const index = await tutuSite.db.doc("config/abas-v2").get();
      if (index.exists && Array.isArray(index.data().ids)) {
        const meta = index.data(), rows = await Promise.all(meta.ids.map(id => tutuSite.db.doc("casos/" + id).get()));
        const recovered = rows.filter(r => r.exists && r.data().v2).map(r => r.data().v2);
        saved = { version: 2, active: recovered.some(t => t.id === meta.active) ? meta.active : recovered[0]?.id, tabs: recovered };
      }
    }
    if (TutuV2Core.validSession(saved)) { tabs = saved.tabs; load(tabs.find(t => t.id === saved.active)); await persist(); }
    // Sessão nova: só diário local; o banco recebe o caso na primeira edição (instalação nova fica vazia).
    else { active = caseId || newId(); caseId = active; caseStart = caseStart || stamp(); tabs = [capture()]; restoring = false; renderTabs(); journal(); }
    focusSheet(); ui.updateOutline(); ui.initialized = true;
  })().catch(error => { $("saveState").textContent = "falha ao recuperar abas"; setStatus(error.message, "err"); throw error; });
})();

/* Paleta, atalhos editáveis e integração de eventos com a extensão. */
(() => {
  "use strict";
  const ui = window.tutuV2;
  ui.actions = {
    ditar: { label: "Ditar", run: () => ui.dictate() },
    proximo: { label: "Próximo campo", run: () => nextField() },
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
    foot.replaceChildren();
    for (const [key, action] of Object.entries(ui.shortcuts)) {
      const b = ui.button("", () => ui.actions[action].run(), { title: ui.actions[action].label + " · " + key });
      b.append(ui.el("kbd", {}, key), ui.el("span", {}, ui.actions[action].label)); foot.append(b);
    }
    foot.append(ui.button("⚙", () => ui.settings(true), { title: "Configurações · Ctrl+,", "aria-label": "Configurações" }));
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
  let paletteRange = null, previousFocus = null, results = [], selected = 0, history = [], paletteEpoch = 0;
  const pal = ui.el("section", { id: "commandPalette", role: "dialog", "aria-label": "Buscar máscaras e ações" }); pal.hidden = true;
  const input = ui.el("input", { id: "commandSearch", type: "search", role: "combobox", "aria-controls": "commandResults", "aria-expanded": "false", "aria-autocomplete": "list", "aria-label": "Buscar máscaras, autotextos, comandos, calculadoras e histórico", placeholder: "Máscara, autotexto, comando, cálculo…", autocomplete: "off" });
  const list = ui.el("div", { id: "commandResults", role: "listbox" });
  pal.append(input, list, ui.el("small", {}, "↑ ↓ escolher · Enter executar · Esc voltar")); document.body.append(pal);
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
    results = catalog().map((entry, order) => ({ ...entry, order, score: TutuV2Core.score(q, entry.label + " " + entry.kind + " " + entry.search) }))
      .filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 30);
    selected = Math.max(0, Math.min(selected, results.length - 1)); list.replaceChildren();
    results.forEach((entry, i) => {
      const b = ui.button("", () => execute(i), { id: "commandOption" + i, role: "option", "aria-selected": String(i === selected), tabindex: "-1" });
      b.append(ui.el("small", {}, entry.kind), ui.el("span", {}, entry.label)); list.append(b);
    });
    if (!results.length) list.append(ui.el("p", {}, "Nenhum resultado."));
    if (results.length) input.setAttribute("aria-activedescendant", "commandOption" + selected); else input.removeAttribute("aria-activedescendant");
    ui.positionPalette();
  }
  function execute(index) { const item = results[index]; if (!item) return; close(); item.run(); }
  input.oninput = () => { selected = 0; draw(); };
  ui.openPalette = async () => {
    if (!pal.hidden) { close(); return; }
    previousFocus = document.activeElement;
    const s = getSelection(); paletteRange = s.rangeCount && sheet.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : sheetRange?.cloneRange();
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
    else if (!pal.hidden && ["escape", "enter", "arrowdown", "arrowup"].includes(k)) action = () => {
      if (k === "escape") close(); else if (k === "enter") execute(selected);
      else { selected = (selected + (k === "arrowdown" ? 1 : -1) + results.length) % (results.length || 1); draw(); $("commandOption" + selected)?.scrollIntoView({ block: "nearest" }); }
    };
    else if (e.ctrlKey && !e.altKey && k === "tab") action = () => ui.cycleTabs(e.shiftKey ? -1 : 1);
    else if (e.ctrlKey && !e.altKey && !e.shiftKey && k === "e") action = () => ui.toggleLeft();
    else if (e.ctrlKey && !e.altKey && (k === "[" || e.code === "BracketLeft")) action = () => ui.toggleLeft();
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
      doc.title = "Tutu · sobre o PACS"; doc.documentElement.lang = "pt-BR";
      // Só CSS local já carregado; não busca fontes ou estilos externos.
      for (const sheet of document.styleSheets) {
        try { doc.head.append(ui.el("style", {}, [...sheet.cssRules].map(r => r.cssText).join("\n"))); }
        catch (_) { /* Fontes remotas podem impedir a leitura de cssRules. */ }
      }
      doc.body.className = "tutu-v2 v2-hud";
      const card = ui.el("main", { id: "hudCard", "aria-label": "Laudo ativo" });
      const header = ui.el("header", { class: "hud-header" });
      header.append(ui.el("span", { class: "hud-brand" }, "Tutu"), ui.el("strong", { id: "hudExam" }));
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
