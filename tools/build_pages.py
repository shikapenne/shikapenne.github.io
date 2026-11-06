#!/usr/bin/env python3
"""作品ごとのページ (film/<id>/index.html)、404.html、sitemap.xml を生成する。

index.html をひな形にして、<!--META--> <!--HEADER--> <!--STATIC--> の部分を作品ごとに差し替える。
データは Supabase の公開APIから取得する（公開用キーなので、見えるのは一般公開されている投稿だけ）。
ローカルで試すときは  DATA_JSON=data.json python3 tools/build_pages.py  のように JSON を渡せる。
"""
import datetime
import html
import json
import os
import pathlib
import re
import shutil
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://shikapenne.github.io/"
SUPABASE_URL = "https://pzabrkbtwuzrzhmvksri.supabase.co"
SUPABASE_KEY = "sb_publishable_xk7ewXc84jJh8Ej6kBzMYA_7GLAUpOo"
LV = {1: "ちょっと", 2: "けっこう", 3: "かなり"}


def fetch(path):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def load_data():
    if os.environ.get("DATA_JSON"):
        return json.load(open(os.environ["DATA_JSON"], encoding="utf-8"))
    films = fetch("films?select=id,title,year,release_date,now_showing,verified,runtime_min&order=id")
    scares = fetch("scares?select=film_id,t,phase,approx,lv,kinds,created_at&limit=10000")
    return {"films": films, "scares": scares}


def fmt(s):
    s = int(s)
    h, m, x = s // 3600, s % 3600 // 60, s % 60
    return f"{h}:{m:02d}:{x:02d}" if h else f"{m}:{x:02d}"


def when(sc):
    if sc.get("t") is None:
        return sc.get("phase") or ""
    return ("約" if sc.get("approx") else "") + fmt(sc["t"])


PHASE_ORDER = {"序盤": 0.15, "中盤": 0.5, "終盤": 0.85}


def sort_key(sc):
    if sc.get("t") is not None:
        return sc["t"]
    return PHASE_ORDER.get(sc.get("phase"), 0.5) * 5400


def esc(s):
    return html.escape(str(s), quote=True)


def section(src, name):
    m = re.search(rf"<!--{name}-->.*?<!--/{name}-->", src, re.S)
    if not m:
        raise SystemExit(f"index.html に <!--{name}--> の目印がありません")
    return m


def relink(page, base):
    """ひな形の相対リンクを、深い階層のページ用に付け替える。"""
    for attr in ("href", "src"):
        page = page.replace(f'{attr}="assets/', f'{attr}="{base}assets/')
    page = page.replace('href="privacy.html"', f'href="{base}privacy.html"')
    page = page.replace('window.JSY={base:"./"}', "window.JSY={base:%s}" % json.dumps(base))
    return page


def film_page(tpl, f, items):
    title = f["title"]
    yr = f.get("year")
    name = f"{title}（{yr}）" if yr else title
    url = f"{SITE}film/{f['id']}/"
    n = len(items)
    strong = sum(1 for i in items if i.get("lv") == 3)
    if n:
        desc = f"映画『{title}』で急に驚かされる場面（ジャンプスケア）がいつ来るかを、ネタバレなしでまとめています。投稿{n}件" + (f"、うち「かなり」{strong}件。" if strong else "。")
    else:
        desc = f"映画『{title}』で急に驚かされる場面（ジャンプスケア）がいつ来るかを、ネタバレなしで共有するページです。観た方の投稿を募集しています。"
    indexable = bool(n) or bool(f.get("now_showing"))
    page_title = f"{title}のジャンプスケアはいつ？何分に来る？｜ジャンプスケア予報"

    meta = f"""<!--META-->
<title>{esc(page_title)}</title>
<meta name="description" content="{esc(desc)}">
{'' if indexable else '<meta name="robots" content="noindex">'}
<link rel="canonical" href="{url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="ジャンプスケア予報">
<meta property="og:title" content="{esc(title)}のジャンプスケアはいつ来る？">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}og.png">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}のジャンプスケアはいつ来る？">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{SITE}og.png">
<!--/META-->"""

    rt = f"上映時間{f['runtime_min']}分。" if f.get("runtime_min") else ""
    summary = rt + (
        f"『{esc(title)}』で急に驚かされる場面がいつ来るかの情報です。投稿{n}件" + (f"（うち「かなり」{strong}件）" if strong else "") + "。何が出るかは書いていません。"
        if n
        else f"『{esc(title)}』で急に驚かされる場面の情報は、まだありません。観た方は「いつ」来たかを教えてください。"
    )
    header = f"""<!--HEADER-->
  <header>
    <p class="crumb"><a class="logo" href="../../"><img src="../../assets/logo.svg" alt="ジャンプスケア予報（トップへ）" width="558" height="80"></a></p>
    <h1>{esc(name)}のジャンプスケア</h1>
    <p>{summary}</p>
    <ul class="rules">
      <li>何が出るかは書かない</li>
      <li>誰が・どうなるかも書かない</li>
      <li>直前の目印だけを書く</li>
    </ul>
  </header>
  <!--/HEADER-->"""

    if items:
        lis = "".join(
            f"<li>{esc(when(i))}　強さ：{esc(LV.get(i.get('lv'), ''))}"
            + (f"　{esc('・'.join(i.get('kinds') or []))}" if i.get("kinds") else "")
            + "</li>"
            for i in sorted(items, key=sort_key)
        )
        static = f'<ul class="static-list">{lis}</ul>'
    else:
        static = ""

    page = tpl
    page = page.replace(section(page, "META").group(0), meta)
    page = page.replace(section(page, "HEADER").group(0), header)
    page = page.replace("<!--STATIC-->", static)
    page = page.replace('window.JSY={base:"./"}', 'window.JSY={base:"../../",filmId:%d}' % f["id"])
    return relink(page, "../../"), indexable


def not_found_page(tpl):
    """まだページが作られていない作品用。URLから作品IDを読み取ってその場で表示する。"""
    meta = """<!--META-->
<title>ジャンプスケア予報</title>
<meta name="robots" content="noindex">
<!--/META-->"""
    header = """<!--HEADER-->
  <header>
    <h1 class="logo"><a href="/"><img src="/assets/logo.svg" alt="ジャンプスケア予報" width="558" height="80"></a></h1>
    <p>映画の「急に驚かされる場面」がいつ来るかを、ネタバレなしで共有するサイトです。</p>
  </header>
  <!--/HEADER-->"""
    page = tpl
    page = page.replace(section(page, "META").group(0), meta)
    page = page.replace(section(page, "HEADER").group(0), header)
    page = page.replace("<!--STATIC-->", "")
    return relink(page, "/")


def main():
    tpl = (ROOT / "index.html").read_text(encoding="utf-8")
    data = load_data()
    films = data["films"]
    by_film = {}
    for s in data["scares"]:
        by_film.setdefault(s["film_id"], []).append(s)

    out = ROOT / "film"
    if out.exists():
        shutil.rmtree(out)
    today = datetime.date.today().isoformat()
    urls = [(SITE, today), (SITE + "privacy.html", "2026-10-20")]
    for f in films:
        items = by_film.get(f["id"], [])
        page, indexable = film_page(tpl, f, items)
        d = out / str(f["id"])
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(page, encoding="utf-8")
        if indexable:
            last = max((i.get("created_at") or "")[:10] for i in items) if items else (f.get("release_date") or today)
            urls.append((f"{SITE}film/{f['id']}/", last))

    (ROOT / "404.html").write_text(not_found_page(tpl), encoding="utf-8")
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sm += [f"  <url><loc>{u}</loc><lastmod>{d}</lastmod></url>" for u, d in urls]
    sm.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(sm) + "\n", encoding="utf-8")
    print(f"作品ページ {len(films)} 件（検索対象 {len(urls) - 2} 件）を生成しました")


if __name__ == "__main__":
    main()
