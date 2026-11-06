(function(){
  const SUPABASE_URL="https://pzabrkbtwuzrzhmvksri.supabase.co";
  const SUPABASE_KEY="sb_publishable_xk7ewXc84jJh8Ej6kBzMYA_7GLAUpOo";
  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  const GOOGLE_READY=true; // Googleログインの設定が終わったら true にする
  document.getElementById("google-row").hidden=!GOOGLE_READY;
  document.getElementById("login-soon").hidden=GOOGLE_READY;

  const $=s=>document.querySelector(s);
  const CFG=window.JSY||{}, BASE=CFG.base||"./";
  const m0=location.pathname.match(/\/film\/(\d+)\/?(index\.html)?$/);
  const FILM_ID=CFG.filmId!=null?CFG.filmId:(m0?+m0[1]:null);
  const filmUrl=id=>BASE+"film/"+id+"/";
  if(FILM_ID!=null){ ["section.now",".tools"].forEach(q=>{const e=document.querySelector(q);if(e)e.hidden=true}); }
  const LV={1:"ちょっと",2:"けっこう",3:"かなり"};
  let me=null, isAnon=false, isAdmin=false, banned=false;
  let films=[], filmById=new Map(), rows=[], myReports=new Set(), muted=new Set(), bans=[];
  let loaded=false, revealed=new Set();
  try{ $("#showcue").checked = localStorage.getItem("js-showcue")==="1"; }catch(e){}

  const SAMPLE=[{movie:"（サンプル）夜の団地",year:"2099",t:754,lv:1,kinds:["肩すかし"],cue:"冷蔵庫を開ける場面",approx:true},{movie:"（サンプル）夜の団地",year:"2099",t:2950,lv:3,kinds:["大きな音","急に映る"],cue:"停電して懐中電灯をつけた直後",approx:true}];

  function fmt(s){s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;const p=n=>String(n).padStart(2,"0");return h?`${h}:${p(m)}:${p(x)}`:`${m}:${p(x)}`}
  function parse(str){str=(str||"").trim().replace(/[：]/g,":").replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248));
    if(/^\d+$/.test(str)) return +str*60;
    const p=str.split(":"); if(p.length<2||p.length>3||p.some(v=>!/^\d+$/.test(v))) return null;
    const n=p.map(Number); if(n[n.length-1]>59) return null; if(p.length===3&&n[1]>59) return null;
    return p.length===3? n[0]*3600+n[1]*60+n[2] : n[0]*60+n[1]}
  const PHASE_POS={"序盤":0.15,"中盤":0.5,"終盤":0.85};
  function whenLabel(i){return i.t!=null?((i.approx?"約":"")+fmt(i.t)):i.phase}
  function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
  const norm=s=>(s||"").normalize("NFKC").toLowerCase().replace(/[\s・／/：:〜~「」『』!！?？、,.。“”"-]/g,"");
  function hue(s){let h=0;for(const ch of s)h=(h*31+ch.codePointAt(0))%360;return h}
  const pending=new Map();
  function twoTap(btn,id,label,confirmLabel){
    if(pending.get(btn)!==id){pending.set(btn,id);btn.textContent=confirmLabel;setTimeout(()=>{if(pending.get(btn)===id){pending.delete(btn);btn.textContent=label}},4000);return false}
    pending.delete(btn);return true}
  const errText=e=>(e&&e.message)||"うまくいきませんでした。少し待ってからもう一度お試しください。";

  /* ---------- data ---------- */
  async function loadFilms(){
    const {data,error}=await sb.from("films").select("id,title,year,release_date,now_showing,verified,created_by,runtime_min").order("title");
    if(!error){films=data||[];filmById=new Map(films.map(f=>[f.id,f]))}
  }
  async function loadScares(){
    const {data,error}=await sb.from("scares").select("id,film_id,t,phase,approx,lv,kinds,cue,author,hidden,report_count,created_at").order("created_at",{ascending:false}).limit(3000);
    if(!error){rows=(data||[]).map(r=>{const f=filmById.get(r.film_id)||{};return {...r,movie:f.title||"",year:f.year?String(f.year):"",pending:f.verified===false}})}
    loaded=true;
  }
  async function loadMine(){
    myReports=new Set(); muted=new Set(); isAdmin=false; banned=false;
    if(!me) return;
    const [r,m,a,b]=await Promise.all([
      sb.from("reports").select("scare_id").eq("reporter",me),
      sb.from("mutes").select("muted_user_id"),
      sb.rpc("is_admin"), sb.rpc("is_banned")]);
    (r.data||[]).forEach(x=>myReports.add(x.scare_id));
    (m.data||[]).forEach(x=>muted.add(x.muted_user_id));
    isAdmin=!!a.data; banned=!!b.data;
    if(isAdmin) await loadAdmin();
  }
  async function loadAdmin(){
    const b=await sb.from("bans").select("user_id,created_at").order("created_at");
    bans=b.data||[];
  }
  async function refresh(){await loadScares();render()}

  function visible(){return rows.filter(r=>!muted.has(r.author)&&(!r.hidden||r.author===me))}

  /* ---------- auth ---------- */
  function renderAuth(){
    const st=$("#authstate"), bt=$("#authbtns"); bt.replaceChildren();
    if(me&&!isAnon){
      st.textContent="ログイン中"+(isAdmin?"（管理者）":"");
      const o=el("button","ghost","ログアウト");o.type="button";o.onclick=async()=>{await sb.auth.signOut()};bt.append(o);
      $("#loginbox").hidden=true;
    }else{
      st.textContent=isAnon?"ゲストとして投稿中（自分の投稿はこの端末から削除できます）":"見るのも投稿も、ログインなしでできます";
      const i=el("button","btn sub","Googleでログイン");i.type="button";i.onclick=()=>{$("#loginbox").hidden=!$("#loginbox").hidden};bt.append(i);
    }
    $("#bannedbox").hidden=!banned;
    $("#addbox").hidden=banned;
  }
  $("#login-google").addEventListener("click",async()=>{
    try{sessionStorage.setItem("jsy-return",location.pathname)}catch(e){}
    const root=new URL(BASE,location.href).href;
    const {error}=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:root}});
    if(error){$("#login-msg").className="msg err";$("#login-msg").textContent="Googleログインは準備中です。メールでのログインをお使いください。"}
  });
  function needLogin(why){ if(why)$("#login-why").textContent=why; $("#loginbox").hidden=false; $("#loginbox").scrollIntoView({block:"center"}) }
  // 投稿などの前に呼ぶ：未ログインならゲスト（匿名）として自動でログインする
  async function ensureUser(){
    if(me) return true;
    const {data,error}=await sb.auth.signInAnonymously();
    if(error||!data||!data.user){ needLogin("いまはゲスト投稿を受け付けていません。Googleでログインしてから投稿してください。"); return false }
    me=data.user.id; isAnon=true; await loadMine(); renderAuth(); return true;
  }

  /* ---------- shelf ---------- */
  function renderShelf(){
    if(FILM_ID!=null) return;
    const shelf=$("#shelf"), meta=$("#nowmeta"); shelf.replaceChildren();
    const now=films.filter(f=>f.now_showing);
    if(!now.length){ $(".now").hidden=loaded; meta.textContent="読み込み中…"; return }
    $(".now").hidden=false; meta.textContent=now.length+"作品";
    const cnt=new Map(); visible().forEach(r=>cnt.set(r.film_id,(cnt.get(r.film_id)||0)+1));
    const qn=norm($("#q").value);
    now.sort((a,b)=>(cnt.get(b.id)||0)-(cnt.get(a.id)||0)||String(b.release_date).localeCompare(String(a.release_date)));
    now.forEach(f=>{
      const h=hue(f.title), n=cnt.get(f.id)||0;
      const b=el("a","tcard"); b.href=filmUrl(f.id);
      const H=205+h%70; b.style.setProperty("--c1",`hsl(${H} 42% 30%)`); b.style.setProperty("--c2",`hsl(${H+25} 52% 52%)`);
      b.setAttribute("aria-pressed", String(!!qn && qn===norm(f.title)));
      b.append(el("span","rel",(f.release_date||"").replace(/-/g,".")+" 公開"), el("span","ttl",f.title), el("span","badge"+(n?"":" none"), n? `${n}件の投稿` : "情報まだなし"));
      shelf.append(b);
    });
  }

  /* ---------- list ---------- */
  function render(){
    renderAuth(); renderShelf(); renderMod(); renderMuted();
    const chipOn=!!$("#q").value.trim(); $("#chip").hidden=!chipOn; if(chipOn) $("#chiptext").textContent="「"+$("#q").value.trim()+"」で絞り込み中";
    const list=$("#list"); list.replaceChildren();
    const qn=norm($("#q").value), showAll=$("#showcue").checked;
    const vis=visible(), groups=new Map();
    vis.forEach(r=>{if(!groups.has(r.film_id))groups.set(r.film_id,{movie:r.movie,year:r.year,pending:r.pending,film_id:r.film_id,items:[]});groups.get(r.film_id).items.push(r)});
    let gs=[...groups.values()].filter(g=>FILM_ID!=null?g.film_id===FILM_ID:(!qn||norm(g.movie).includes(qn)));
    if(FILM_ID!=null&&!gs.length){
      const f=filmById.get(FILM_ID), e=el("div","empty");
      e.append(el("h3",null, !loaded? "読み込み中…" : (f? "この作品の情報はまだありません" : "作品が見つかりません")));
      if(loaded&&f){e.append(el("p",null,"観た方は、急に驚かされる場面が「いつ」来たかを教えてください。「中盤あたり」くらいの記憶でも大歓迎です。"));
        const b=el("button","btn","この作品の場面を投稿する");b.type="button";b.style.marginTop="8px";b.onclick=()=>{$("#addbox").open=true;$("#addbox").scrollIntoView({block:"start"})};if(!banned)e.append(b)}
      if(loaded&&!f){const a=el("a",null,"作品一覧に戻る");a.href=BASE;e.append(a)}
      list.append(e); return;
    }
    if(!vis.length&&!qn){
      const e=el("div","empty");
      e.append(el("h3",null, loaded? "まだ投稿がありません" : "読み込み中…"));
      e.append(el("p",null,"観た映画のジャンプスケアの時刻を「場面を投稿する」から登録してください。下は表示イメージです（架空の作品）。"));
      list.append(e); list.append(card({movie:SAMPLE[0].movie,year:SAMPLE[0].year,runtime:100,items:SAMPLE},true,true)); return;
    }
    if(!gs.length){const e=el("div","empty");e.append(el("h3",null,"まだ投稿がありません"));e.append(el("p",null,"「"+$("#q").value.trim()+"」の情報はまだありません。観た方は「場面を投稿する」から最初の投稿をお願いします。"));
      const b=el("button","btn","この作品の場面を投稿する");b.type="button";b.style.marginTop="8px";b.onclick=()=>{$("#addbox").open=true;$("#addbox").scrollIntoView({block:"start"})};if(!banned)e.append(b);list.append(e);return}
    gs.forEach(g=>list.append(card(g,showAll,false)));
  }

  function card(g,showAll,sample){
    const timed=g.items.filter(i=>i.t!=null);
    const maxT=timed.length?Math.max(...timed.map(i=>i.t)):0;
    // 上映時間がわかる作品はその長さを帯の右端にする。わからない作品（仮登録など）は右端を「--:--」にする
    const f=g.film_id!=null?filmById.get(g.film_id):null;
    const runtime=(g.runtime||(f&&f.runtime_min)||0)*60;
    const end=runtime? Math.max(runtime,maxT) : Math.max(5400,Math.ceil((maxT+300)/1800)*1800);
    const pos=i=>i.t!=null?i.t:PHASE_POS[i.phase]*end;
    const items=[...g.items].sort((a,b)=>pos(a)-pos(b));
    const c=el("article","film"+(sample?" sample":""));
    const h=el("div","filmhead");
    const h3=el("h3"); if(!sample&&g.film_id!=null&&FILM_ID==null){const a=el("a",null,g.movie);a.href=filmUrl(g.film_id);h3.append(a)}else{h3.textContent=g.movie} {const rm=runtime?Math.round(runtime/60):0; const meta=[g.year,rm?rm+"分":""].filter(Boolean).join("・"); if(meta)h3.append(el("span","yr",meta))} if(g.pending){h3.append(el("span","pend","作品確認中"))}
    if(sample){c.append(el("div","tag","表示イメージ"))}
    const cnt=el("div","count"); const big=items.filter(i=>i.lv==3).length;
    cnt.append(el("b",null,String(items.length)),document.createTextNode(" 件"+(big?"・かなり ":"")),...(big?[el("b",null,String(big)),document.createTextNode(" 件")]:[]));
    h.append(h3,cnt); c.append(h);
    const strip=el("div","strip"); strip.setAttribute("aria-hidden","true");
    items.forEach(i=>{const m=el("i");m.style.left=Math.min(98.5,Math.max(1.5,pos(i)/end*100))+"%";if(i.t==null)m.style.opacity=".55";m.style.background=`var(--lv${i.lv})`;strip.append(m)});
    const axis=el("div","stripaxis"); axis.setAttribute("aria-hidden","true"); axis.append(el("span",null,"0:00"),el("span",null,runtime?fmt(end/2):""),el("span",null,runtime?fmt(end):"--:--"));
    if(runtime) axis.title="上映時間 "+Math.round(runtime/60)+"分";
    c.append(strip,axis);
    const ul=el("ul","scares");
    items.forEach(i=>{
      const li=el("li");
      const tc=el("span","tc"); if(i.t==null){tc.classList.add("phase");tc.textContent=i.phase}else{if(i.approx){tc.append(el("span","approx","約"))} tc.append(document.createTextNode(fmt(i.t)))}
      li.append(tc, el("span","lv lv"+i.lv,LV[i.lv]||""), el("span","meta",(i.kinds||[]).join("・")));
      const right=el("span","acts");
      if(!sample){
        if(me&&(i.author===me||isAdmin)){const d=el("button","ghost","削除");d.type="button";d.onclick=()=>delScare(i,d);right.append(d)}
        if(i.author!==me){
          const mine=myReports.has(i.id);
          const r=el("button","ghost warn",mine?"通報済み":"通報");r.type="button";r.disabled=mine;if(!mine)r.onclick=()=>report(i,r);
          const m=el("button","ghost","この人を非表示");m.type="button";m.onclick=()=>mute(i.author,m);
          right.append(r,m);
        }
      }
      li.append(right);
      if(!sample&&i.author===me&&i.hidden){li.append(el("div","flagnote","この投稿は通報が多いため、ほかの人には表示されていません。"))}
      if(i.cue){
        const cue=el("div","cue"), rid=i.id||("s"+pos(i));
        if(showAll||revealed.has(rid)){cue.textContent="目印："+i.cue}
        else{cue.classList.add("hidden");const b=el("button",null,"直前の目印を見る");b.type="button";b.onclick=()=>{revealed.add(rid);cue.classList.remove("hidden");cue.textContent="目印："+i.cue};cue.append(b)}
        li.append(cue);
      }
      ul.append(li);
    });
    c.append(ul);
    return c;
  }

  /* ---------- actions ---------- */
  async function delScare(i,btn){
    if(!twoTap(btn,i.id,"削除","本当に削除"))return; btn.disabled=true;
    const {error}=await sb.from("scares").delete().eq("id",i.id);
    if(error){btn.disabled=false;btn.textContent="削除できませんでした";return}
    await refresh();
  }
  async function report(i,btn){
    if(!me||isAnon){needLogin("ネタバレの通報は、Googleでログインした人だけができます（いたずら防止のため）。");return}
    if(!twoTap(btn,i.id,"通報","ネタバレとして通報する"))return; btn.disabled=true;
    const {error}=await sb.from("reports").insert({scare_id:i.id});
    if(error&&error.code!=="23505"){btn.disabled=false;btn.textContent="通報できませんでした";return}
    myReports.add(i.id); btn.textContent="通報済み";
  }
  async function mute(author,btn){
    if(!twoTap(btn,author,"この人を非表示","この人の投稿をすべて隠す"))return;
    if(!(await ensureUser()))return;
    muted.add(author); render();
    await sb.from("mutes").insert({muted_user_id:author});
  }
  function renderMuted(){const n=muted.size; $("#mutednote").hidden=!n; if(n) $("#mutedtext").textContent=`${n}人の投稿を非表示にしています。`}
  $("#unmute").addEventListener("click",async()=>{await sb.from("mutes").delete().eq("user_id",me);muted=new Set();render()});

  /* ---------- admin ---------- */
  function renderMod(){
    const panel=$("#modpanel"); panel.hidden=!isAdmin; if(!isAdmin)return;
    const ul=$("#modlist"); ul.replaceChildren();
    const banSet=new Set(bans.map(b=>b.user_id));
    const flagged=rows.filter(r=>r.report_count>0||r.hidden).sort((a,b)=>b.report_count-a.report_count);
    if(!flagged.length) ul.append(el("li",null,"通報された投稿はありません。"));
    flagged.forEach(r=>{
      const li=el("li"), w=el("span","what");
      w.append(document.createTextNode(`${r.movie}　${whenLabel(r)}　目印：${r.cue||"（なし）"}`));
      w.append(el("small",null,`通報 ${r.report_count}件${r.hidden?"・全員に非表示中":""}${banSet.has(r.author)?"・BAN済みのアカウント":""}`));
      const a=el("span","acts");
      const d=el("button","ghost warn","投稿を削除");d.type="button";d.onclick=()=>delScare(r,d);
      const ok=el("button","ghost","問題なし（表示に戻す）");ok.type="button";
      ok.onclick=async()=>{ok.disabled=true;await sb.from("reports").delete().eq("scare_id",r.id);const {error}=await sb.from("scares").update({hidden:false,report_count:0}).eq("id",r.id);if(error){ok.disabled=false;ok.textContent="失敗";return}await refresh()};
      a.append(d,ok);
      if(r.author!==me&&!banSet.has(r.author)){
        const ban=el("button","ghost warn","このアカウントをBAN");ban.type="button";
        ban.onclick=async()=>{if(!twoTap(ban,r.author,"このアカウントをBAN","BANする（投稿禁止）"))return;ban.disabled=true;const {error}=await sb.from("bans").insert({user_id:r.author,reason:"ネタバレ投稿"});if(error){ban.disabled=false;ban.textContent="失敗";return}await loadAdmin();await refresh()};
        a.append(ban);
      }
      li.append(w,a); ul.append(li);
    });
    const rl=$("#reqlist"); rl.replaceChildren();
    const pend=films.filter(f=>f.verified===false);
    if(!pend.length) rl.append(el("li",null,"確認待ちの作品はありません。"));
    pend.forEach(f=>{
      const li=el("li"), box=el("span","pendedit");
      const ti=el("input");ti.value=f.title;ti.setAttribute("aria-label","作品名");ti.id="pt-"+f.id;
      const yi=el("input","yr");yi.value=f.year?String(f.year):"";yi.placeholder="公開年";yi.setAttribute("aria-label","公開年");yi.id="py-"+f.id;
      box.append(ti,yi);
      const n=rows.filter(r=>r.film_id===f.id).length;
      const a=el("span","acts");
      const ok=el("button","ghost","確認済みにする");ok.type="button";
      ok.onclick=async()=>{const t=ti.value.trim(),y=yi.value.trim();if(!t||(y&&!/^\d{4}$/.test(y))){ok.textContent="作品名・公開年を確認";return}
        ok.disabled=true;const {error}=await sb.from("films").update({title:t,year:y?+y:null,verified:true}).eq("id",f.id);
        if(error){ok.disabled=false;ok.textContent=error.code==="23505"?"同名の作品があります":"失敗";return}await loadFilms();await refresh()};
      const ng=el("button","ghost warn",`作品ごと削除（投稿${n}件）`);ng.type="button";
      ng.onclick=async()=>{if(!twoTap(ng,f.id,`作品ごと削除（投稿${n}件）`,"本当に削除"))return;ng.disabled=true;const {error}=await sb.from("films").delete().eq("id",f.id);if(error){ng.disabled=false;ng.textContent="失敗";return}await loadFilms();await refresh()};
      a.append(ok,ng); li.append(box,a); rl.append(li);
    });
    const bl=$("#banlist"); bl.replaceChildren();
    if(!bans.length) bl.append(el("li",null,"BAN中のアカウントはありません。"));
    bans.forEach((b,idx)=>{
      const li=el("li"); li.append(el("span","what",`アカウント ${idx+1}（投稿 ${rows.filter(r=>r.author===b.user_id).length}件・${new Date(b.created_at).toLocaleDateString("ja-JP")}）`));
      const un=el("button","ghost","BANを解除");un.type="button";
      un.onclick=async()=>{un.disabled=true;await sb.from("bans").delete().eq("user_id",b.user_id);await loadAdmin();await refresh()};
      li.append(un); bl.append(li);
    });
  }

  /* ---------- film search ---------- */
  let selected=null, hits=[], active=-1;
  function choose(f){
    selected=f;
    $("#f-movie").value=f.title; $("#f-year").textContent=f.year||"—"; $("#yearfield").hidden=false;
    $("#f-movie").classList.add("picked"); $("#f-movie-note").textContent="選択済み：「"+f.title+"」"+(f.verified===false?"（作品の存在を確認中）":"");
    closeResults(); syncNew();
  }
  // 候補から選ばずに入力された作品名は「新しい作品」として扱い、公開年（任意）の欄と説明を出す
  function syncNew(){
    const typed=$("#f-movie").value.trim(), isNew=!selected&&!!typed;
    $("#newyearfield").hidden=!isNew; $("#newnote").hidden=!isNew;
  }
  function closeResults(){$("#f-results").hidden=true;$("#f-movie").setAttribute("aria-expanded","false");active=-1}
  function showResults(){
    const q=norm($("#f-movie").value), ul=$("#f-results"); ul.replaceChildren();
    if(!q){closeResults();return}
    hits=films.filter(f=>norm(f.title).includes(q)).sort((a,b)=>(norm(a.title).startsWith(q)?0:1)-(norm(b.title).startsWith(q)?0:1)||(b.now_showing-a.now_showing)).slice(0,12);
    hits.forEach((f,i)=>{
      const li=el("li"); li.id="opt"+i; li.setAttribute("role","option"); li.setAttribute("aria-selected",String(i===active));
      const name=el("span",null,f.title); if(f.now_showing) name.append(el("span","now","公開中")); if(f.verified===false) name.append(el("span","pend","確認中"));
      li.append(name, el("span","y",f.year?String(f.year):"")); li.onmousedown=e=>{e.preventDefault();choose(f)}; ul.append(li);
    });
    const miss=el("li","miss");
    miss.textContent=hits.length? "この中にない場合は、そのまま入力して投稿できます" : "「"+$("#f-movie").value.trim()+"」はまだ登録されていません。このまま投稿できます";
    ul.append(miss);
    ul.hidden=false; $("#f-movie").setAttribute("aria-expanded","true");
  }
  $("#f-movie").addEventListener("input",()=>{
    if(selected){selected=null;$("#f-year").textContent="";$("#yearfield").hidden=true;$("#f-movie").classList.remove("picked");$("#f-movie-note").textContent="候補から選んでください。見つからない作品も、そのまま作品名を入れれば投稿できます。"}
    active=-1; showResults(); syncNew();
  });
  $("#f-movie").addEventListener("keydown",e=>{
    if($("#f-results").hidden) return;
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();active=hits.length?(active+(e.key==="ArrowDown"?1:-1)+hits.length)%hits.length:-1;
      [...$("#f-results").querySelectorAll("li[role=option]")].forEach((li,i)=>li.setAttribute("aria-selected",String(i===active)));
      $("#f-movie").setAttribute("aria-activedescendant",active>=0?"opt"+active:"")}
    else if(e.key==="Enter"&&active>=0){e.preventDefault();choose(hits[active])}
    else if(e.key==="Escape"){closeResults()}
  });
  $("#f-movie").addEventListener("blur",()=>setTimeout(closeResults,120));
  $("#f-movie").addEventListener("focus",()=>{if(!selected&&$("#f-movie").value.trim())showResults()});

  // 未登録の作品を「確認中」として登録する（同じ作品がすでにあればそれを使う）
  async function provisionalFilm(title, year){
    const same=films.find(f=>norm(f.title)===norm(title)&&(!year||String(f.year||"")===String(year)));
    if(same) return {film:same};
    const cols="id,title,year,release_date,now_showing,verified,created_by,runtime_min";
    let {data,error}=await sb.from("films").insert({title,year:year||null,verified:false,created_by:me}).select(cols).single();
    if(error&&error.code==="23505"){
      let q=sb.from("films").select(cols).eq("title",title); q=year?q.eq("year",year):q.is("year",null);
      ({data,error}=await q.maybeSingle());
    }
    if(error||!data) return {error};
    if(!filmById.has(data.id)){films.push(data);filmById.set(data.id,data)}
    return {film:data};
  }

  /* ---------- post ---------- */
  $("#form").addEventListener("submit",async ev=>{
    ev.preventDefault();
    const msg=$("#msg"); msg.className="msg";
    if(banned){msg.className="msg err";msg.textContent="このアカウントは投稿できません。";return}
    const typedTitle=$("#f-movie").value.trim().replace(/\s+/g," ");
    const newYear=$("#f-newyear").value.trim().replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248));
    if(!selected&&!typedTitle){msg.className="msg err";msg.textContent="作品名を入れてください。";$("#f-movie").focus();return}
    if(!selected&&newYear&&!/^\d{4}$/.test(newYear)){msg.className="msg err";msg.textContent="公開年は4桁の数字で入れてください（わからなければ空欄で大丈夫です）。";$("#f-newyear").focus();return}
    const when=(document.querySelector("input[name=when]:checked")||{}).value||"time";
    const t=when==="time"?parse($("#f-time").value):null, phase=when==="time"?null:when, cue=$("#f-cue").value.trim();
    const lv=+(document.querySelector("input[name=lv]:checked")||{}).value||2;
    const kinds=[...document.querySelectorAll("input[name=kind]:checked")].map(x=>x.value);
    const approx=(document.querySelector("input[name=acc]:checked")||{}).value!=="exact";
    if(when==="time"&&(t==null||t>6*3600)){msg.className="msg err";msg.textContent=$("#f-time").value.trim()?"時間は「45」（分）や「1:02:15」の形で入れてください。":"何分ごろか入れるか、序盤・中盤・終盤から選んでください。";$("#f-time").focus();return}
    const b=$("#submit"); b.disabled=true; msg.textContent="投稿中…";
    if(!(await ensureUser())){b.disabled=false;msg.textContent="";return}
    let film=selected;
    if(!film){
      const r=await provisionalFilm(typedTitle,newYear?+newYear:null);
      if(r.error){b.disabled=false;msg.className="msg err";msg.textContent=errText(r.error);return}
      film=r.film; choose(film); $("#f-newyear").value="";
    }
    const {error}=await sb.from("scares").insert({film_id:film.id,t,phase,approx:t==null?true:approx,lv,kinds,cue});
    b.disabled=false;
    if(error){msg.className="msg err";msg.textContent=errText(error);return}
    msg.textContent=film.verified===false
      ? "投稿しました。「"+film.title+"」はまだ登録されていない作品のため、実在するかをこちらで確認します。確認が済むまでは、作品名の横に「作品確認中」と表示されます。"
      : "投稿しました。ありがとうございます！";
    $("#f-time").value=""; $("#f-cue").value="";
    document.querySelectorAll("input[name=kind]").forEach(x=>x.checked=false);
    await refresh();
  });

  function syncWhen(){const isTime=((document.querySelector("input[name=when]:checked")||{}).value||"time")==="time";$("#timebox").hidden=!isTime;$("#accbox").hidden=!isTime}
  document.querySelectorAll("input[name=when]").forEach(x=>x.addEventListener("change",syncWhen)); syncWhen();
  $("#q").addEventListener("input",render);
  $("#clearq").addEventListener("click",()=>{$("#q").value="";render()});
  $("#showcue").addEventListener("change",()=>{try{localStorage.setItem("js-showcue",$("#showcue").checked?"1":"0")}catch(e){};render()});

  /* ---------- boot ---------- */
  render();
  // 注意: onAuthStateChange の中で Supabase を await するとログイン処理と取り合って固まるため、
  // 中では状態だけ受け取り、読み込みは setTimeout で外に出す。
  let booted=false;
  sb.auth.onAuthStateChange((_ev,session)=>{
    const id=session&&session.user?session.user.id:null;
    setTimeout(async()=>{
      isAnon=!!(session&&session.user&&session.user.is_anonymous);
      if(!booted||id===me){renderAuth();return}
      me=id; await loadMine(); await refresh();
    },0);
  });
  (async()=>{
    await loadFilms();
    if(FILM_ID!=null&&filmById.get(FILM_ID)) choose(filmById.get(FILM_ID));
    const {data}=await sb.auth.getSession(); me=data.session?data.session.user.id:null; isAnon=!!(data.session&&data.session.user.is_anonymous);
    // Googleログイン後はトップに戻ってくるので、ログイン前に見ていた作品ページへ戻す
    try{const back=sessionStorage.getItem("jsy-return");sessionStorage.removeItem("jsy-return");
      if(back&&me&&FILM_ID==null&&back!==location.pathname&&/\/film\/\d+\/?$/.test(back)){location.replace(back);return}}catch(e){}
    await loadMine(); await refresh(); booted=true;
  })();
})();
