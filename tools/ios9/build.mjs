// Construit ios9.html : NOMAD-16 pour les vieux iPad (iOS 9, Safari 9.1) à partir de index.html.
// JavaScript converti en ES5 (Babel) + polyfills, mise en page en grille réécrite en flexbox, petites cales Web Audio.
// Usage : node build.mjs <repo>
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const babel = require("@babel/core");

const repo = process.argv[2];
let html = fs.readFileSync(path.join(repo, "index.html"), "utf8");
const nm = p => fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "node_modules", p), "utf8");

// ---------- CSS ----------
const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
const px = v => parseFloat(v) || 0;
function tracks(t) {
  t = t.replace(/repeat\((\d+),\s*([^)]+)\)/g, (m, n, v) => Array(+n).fill(v.trim()).join(" "));
  return t.trim().split(/\s+/);
}
function gridRules(sel, tpl, gap, extra) {
  const tr = tracks(tpl);
  if (tr.some(x => x === "auto" || x.includes("min"))) return "";
  const g = (gap || "0").trim().split(/\s+/), rg = px(g[0]), cg = px(g[1] ?? g[0]);
  const N = tr.length, fixed = tr.filter(x => x.endsWith("px")).reduce((a, x) => a + px(x), 0), F = tr.filter(x => x.endsWith("fr")).reduce((a, x) => a + px(x), 0);
  let o = `${sel}{display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;${extra || ""}}\n`;
  o += `${sel}>*{box-sizing:border-box;-webkit-flex:none;flex:none;min-width:0}\n`;
  o += `${sel}>:nth-child(n){margin-right:${cg}px;margin-top:0}\n`;
  tr.forEach((t, k) => {
    const w = t.endsWith("px") ? t : `calc((100% - ${fixed + (N - 1) * cg + 0.6}px) * ${(px(t) / F).toFixed(5)})`;
    o += `${sel}>:nth-child(${N}n+${k + 1}){width:${w}}\n`;
  });
  o += `${sel}>:nth-child(${N}n){margin-right:0}\n`;
  if (rg) o += `${sel}>:nth-child(n+${N + 1}){margin-top:${rg}px}\n`;
  return o;
}
let legacyCss = "\n/* ---- iOS 9 : grilles réécrites en flexbox ---- */\n[hidden]{display:none !important}\n";
const touchSel = [];
const re = /([^{}]+)\{([^{}]*)\}/g;
let m;
while ((m = re.exec(css))) {
  const sel = m[1].trim(), body = m[2];
  if (sel.startsWith("@") || /^\d+%|^from|^to$/.test(sel)) continue;
  const get = p => { const r = new RegExp("(?:^|;|\\s)" + p + "\\s*:\\s*([^;]+)"); const x = body.match(r); return x ? x[1].trim() : null; };
  const disp = get("display"), tpl = get("grid-template-columns"), gap = get("gap"), dir = get("flex-direction"), wrap = get("flex-wrap"), ta = get("touch-action");
  if (ta && ta !== "auto") touchSel.push([sel, ta.split(/\s+/)[0]]);
  if (disp === "grid" && tpl) legacyCss += gridRules(sel, tpl, gap, get("place-items") === "center" ? "-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;" : "");
  else if (disp === "grid" && get("place-items") === "center") legacyCss += `${sel}{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center}\n`;
  else if (!disp && tpl) legacyCss += gridRules(sel, tpl, gap || "5px");
  else if ((disp === "flex" || disp === "inline-flex") && gap) {
    const g = gap.split(/\s+/), rg = px(g[0]), cg = px(g[1] ?? g[0]);
    if (dir === "column") legacyCss += sel.split(",").map(s => `${s.trim()}>*+*{margin-top:${rg}px}`).join("\n") + "\n";
    else if (wrap === "wrap") legacyCss += sel.split(",").map(s => `${s.trim()}>*{margin-right:${cg}px;margin-bottom:${rg}px}`).join("\n") + "\n";
    else legacyCss += sel.split(",").map(s => `${s.trim()}>*+*{margin-left:${cg}px}`).join("\n") + "\n";
  }
}
// grilles définies directement dans le HTML (style="grid-template-columns:...")
let lg = 0;
html = html.replace(/class="([^"]*)" style="grid-template-columns:([^";]+)"/g, (all, cls, tpl) => {
  const c = "lg" + (++lg);
  legacyCss += gridRules("." + c, tpl, "6px");
  return `class="${cls} ${c}"`;
});
html = html.replace(/style="grid-template-columns:([^";]+)"\s+class="([^"]*)"/g, (all, tpl, cls) => {
  const c = "lg" + (++lg);
  legacyCss += gridRules("." + c, tpl, "6px");
  return `class="${cls} ${c}"`;
});
// grilles avec colonnes « auto » : à la main
legacyCss += `
.lcd{display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;-webkit-align-items:baseline;align-items:baseline}
.lcd>*{width:100%;margin-top:2px}
#lcdLast{width:auto;-webkit-flex:1 1 55%;flex:1 1 55%;min-width:0;white-space:nowrap;overflow:hidden}
#lcdVel{width:auto;-webkit-flex:none;flex:none;margin-left:10px}
.lcdstrip{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center}
#lcdScope{-webkit-flex:1 1 0;flex:1 1 0;min-width:0}
.lcdstrip .trow{-webkit-flex:none;flex:none;margin-left:8px}
.tuner{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center}
.tuner .tbar{-webkit-flex:1 1 0;flex:1 1 0;margin:0 10px}
.diginfo{display:block}.diginfo>*{display:inline-block;margin-right:10px}.diginfo a{display:block}
/* potards : pas de dégradé conique sous iOS 9, on dessine une aiguille */
.dial{background:#33302c;position:relative}
.dial::before{content:"";position:absolute;left:50%;top:3px;width:3px;height:17px;margin-left:-1.5px;border-radius:2px;background:var(--kc, #d92b2f);-webkit-transform-origin:50% 17px;transform-origin:50% 17px;-webkit-transform:rotate(calc(-135deg + var(--v, 0) * 270deg));transform:rotate(calc(-135deg + var(--v, 0) * 270deg));z-index:2}
.dial::after{position:relative;z-index:1}
`;
html = html.replace("</style>", legacyCss + "</style>");

// ---------- JavaScript ----------
const js0 = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
const out = babel.transformSync(js0, {
  babelrc: false, configFile: false, compact: true, comments: false,
  presets: [[require.resolve("@babel/preset-env"), { targets: { safari: "9" }, modules: false }]]
}).code;

const shims = `
(function(){
var W=window;
if(!W.AudioContext&&W.webkitAudioContext)W.AudioContext=W.webkitAudioContext;
if(!W.OfflineAudioContext&&W.webkitOfflineAudioContext)W.OfflineAudioContext=W.webkitOfflineAudioContext;
var Orig=W.AudioContext;
function patch(c){
  try{var P=Object.getPrototypeOf(c);
    if(!P.resume)P.resume=function(){return Promise.resolve();};
    if(!P.__nomadDec){var dec=P.decodeAudioData;P.__nomadDec=1;P.decodeAudioData=function(buf,ok,err){var s=this;return new Promise(function(res,rej){var r=dec.call(s,buf,function(b){if(ok)ok(b);res(b);},function(e){if(err)err(e);rej(e||new Error("decode"));});if(r&&r.then)r.then(res,rej);});};}
    var B=Object.getPrototypeOf(c.createBuffer(1,1,c.sampleRate||44100));
    if(!B.copyToChannel)B.copyToChannel=function(src,ch,st){this.getChannelData(ch).set(src,st||0);};
    if(!B.copyFromChannel)B.copyFromChannel=function(dst,ch,st){dst.set(this.getChannelData(ch).subarray(st||0,(st||0)+dst.length));};
    var A=Object.getPrototypeOf(c.createAnalyser());
    if(!A.getFloatTimeDomainData)A.getFloatTimeDomainData=function(a){var b=new Uint8Array(a.length);this.getByteTimeDomainData(b);for(var i=0;i<a.length;i++)a[i]=(b[i]-128)/128;};
  }catch(e){}
}
if(Orig){
  var Wr=function(){var c=new Orig();patch(c);try{var b=c.createBuffer(1,1,22050),s=c.createBufferSource();s.buffer=b;s.connect(c.destination);s.start(0);}catch(e){}return c;};
  Wr.prototype=Orig.prototype;W.AudioContext=Wr;
}
var O=W.OfflineAudioContext;
if(O&&O.prototype.startRendering&&!O.prototype.__nomad){var sr=O.prototype.startRendering;O.prototype.__nomad=1;O.prototype.startRendering=function(){var s=this;return new Promise(function(res,rej){s.oncomplete=function(e){res(e.renderedBuffer);};var r=sr.call(s);if(r&&r.then)r.then(res,rej);});};}
if(!W.TextEncoder){W.TextEncoder=function(){};W.TextEncoder.prototype.encode=function(s){var u=unescape(encodeURIComponent(s)),a=new Uint8Array(u.length);for(var i=0;i<u.length;i++)a[i]=u.charCodeAt(i);return a;};}
if(!String.prototype.normalize)String.prototype.normalize=function(){return String(this);};
if(!Element.prototype.matches)Element.prototype.matches=Element.prototype.webkitMatchesSelector;
if(!Element.prototype.closest)Element.prototype.closest=function(s){var e=this;while(e&&e.nodeType===1){if(e.matches(s))return e;e=e.parentNode;}return null;};
try{new File([],"x");}catch(e){W.File=function(p,n,o){var b=new Blob(p,o);b.name=n;return b;};}
// proportions (aspect-ratio n'existe pas sous iOS 9)
var AR=[[".pad",1],["#loopCanvas",1.5],[".fxpad",1.25],["#digCanvas",16/11]];
var TS=${JSON.stringify(touchSel)};
function fix(){
  AR.forEach(function(x){[].forEach.call(document.querySelectorAll(x[0]),function(el){var w=el.getBoundingClientRect().width;if(w>0){var h=Math.round(w/x[1])+"px";if(el.style.height!==h)el.style.height=h;}});});
  TS.forEach(function(x){try{[].forEach.call(document.querySelectorAll(x[0]),function(el){if(el.getAttribute("touch-action")!==x[1])el.setAttribute("touch-action",x[1]);});}catch(e){}});
}
document.addEventListener("DOMContentLoaded",function(){document.body.setAttribute("touch-action","pan-y");fix();});
setInterval(fix,400);W.addEventListener("resize",fix);
})();
`;
const head = [
  nm("core-js-bundle/minified.js"),
  nm("regenerator-runtime/runtime.js"),
  nm("whatwg-fetch/dist/fetch.umd.js"),
  nm("pepjs/dist/pep.js"),
  shims
].map(x => "<script>" + x.replace(/<\/script/gi, "<\\/script") + "</script>").join("\n");

html = html.slice(0, html.indexOf("<script>")) + head + "\n<script>" + out.replace(/<\/script/gi, "<\\/script") + "</script>" + html.slice(html.lastIndexOf("</script>") + 9);
html = html.replace("<title>", "<title>[iOS 9] ");
fs.writeFileSync(path.join(repo, "ios9.html"), html);
console.log("ios9.html", (html.length / 1024).toFixed(0) + " Ko", "grilles:", (legacyCss.match(/display:flex/g) || []).length, "touch:", touchSel.length);
