"""
Artikler («Råd om ved»). Hver artikkel er en Markdown-fil i artikler/ med et hode:

    ---
    title: Hvor mye ved trenger jeg i vinter?
    description: Kort tekst til Google (maks ca. 155 tegn).
    date: 2026-09-25
    updated: 2026-09-25          (valgfri)
    kort: Kort svar som vises øverst og som Google/KI kan sitere.
    faq: Spørsmål? || Svar.       (valgfri, kan gjentas)
    ---
    Markdown-tekst …

Støttet Markdown: ## / ### overskrifter, avsnitt, - og 1. lister, tabeller med |,
**fet**, *kursiv*, [lenke](url), > sitat/faktaboks, og disse spesialblokkene på egen linje:
    [[bestill]]      – knapp/boks som leder til bestillingsskjemaet
    [[kalkulator]]   – «hvor mye ved trenger jeg»-kalkulator
    [[kilder]]       – (ikke nødvendig) kilder skrives som vanlig liste under «## Kilder»
"""
import html
import re
from pathlib import Path

ROOT = Path(__file__).parent
DIR = ROOT / "artikler"
esc = html.escape


def inline(t):
    t = esc(t, quote=False)
    t = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: _link(m.group(1), m.group(2)), t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\w)", r"<em>\1</em>", t)
    return t


def _link(text, url):
    ext = url.startswith("http")
    rel = ' rel="noopener"' if ext else ""
    return f'<a href="{url}"{rel}>{text}</a>'


def markdown(md, blocks):
    lines = md.strip("\n").split("\n")
    out, i = [], 0
    while i < len(lines):
        ln = lines[i]
        s = ln.strip()
        if not s:
            i += 1
            continue
        m = re.fullmatch(r"\[\[(\w+)\]\]", s)
        if m:
            out.append(blocks.get(m.group(1), ""))
            i += 1
            continue
        m = re.match(r"(#{2,3}) (.+)", s)
        if m:
            lvl = len(m.group(1))
            text = m.group(2)
            hid = slugify(text)
            out.append(f'<h{lvl} id="{hid}">{inline(text)}</h{lvl}>')
            i += 1
            continue
        if s.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head, body = rows[0], [r for r in rows[1:] if not all(re.fullmatch(r":?-+:?", c) for c in r)]
            th = "".join(f"<th>{inline(c)}</th>" for c in head)
            tb = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body)
            out.append(f'<div class="table-wrap"><table><thead><tr>{th}</tr></thead><tbody>{tb}</tbody></table></div>')
            continue
        if re.match(r"[-*] ", s) or re.match(r"\d+\. ", s):
            ordered = bool(re.match(r"\d+\. ", s))
            items = []
            while i < len(lines) and (re.match(r"\s*[-*] ", lines[i]) if not ordered else re.match(r"\s*\d+\. ", lines[i])):
                items.append(re.sub(r"^\s*([-*]|\d+\.) ", "", lines[i]))
                i += 1
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
            continue
        if s.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip()[1:].strip())
                i += 1
            out.append('<aside class="callout">' + "".join(f"<p>{inline(x)}</p>" for x in buf if x) + "</aside>")
            continue
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r"(#{2,3} |[-*] |\d+\. |\||>|\[\[)", lines[i].strip()):
            buf.append(lines[i].strip())
            i += 1
        out.append(f"<p>{inline(' '.join(buf))}</p>")
    return "\n".join(out)


def slugify(t):
    t = t.lower()
    for a, b in (("æ", "ae"), ("ø", "o"), ("å", "a")):
        t = t.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:60]


def load():
    arts = []
    for f in sorted(DIR.glob("*.md")):
        raw = f.read_text(encoding="utf-8")
        m = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.S)
        if not m:
            raise ValueError(f"{f.name}: mangler hode (---)")
        meta, faq = {}, []
        for line in m.group(1).splitlines():
            if ":" not in line:
                continue
            k, v = line.split(":", 1)
            k, v = k.strip(), v.strip()
            if k == "faq":
                q, a = v.split("||", 1)
                faq.append((q.strip(), a.strip()))
            else:
                meta[k] = v
        for req in ("title", "description", "date"):
            if req not in meta:
                raise ValueError(f"{f.name}: mangler «{req}»")
        meta.setdefault("updated", meta["date"])
        meta["order"] = int(meta.get("order", 50))
        arts.append(dict(meta, slug=f.stem, body=m.group(2), faq=faq))
    arts.sort(key=lambda a: (a["order"], a["title"]))
    return arts
