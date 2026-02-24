"""Build SCORM 1.2 packages from AI-generated training content.

Generates a self-contained HTML page styled with the Gruppen Academy brand
colors (indigo palette) and a minimal imsmanifest.xml so the module can be
played inside the platform's SCORM launcher.
"""

import os
import textwrap
from xml.etree.ElementTree import Element, SubElement, tostring

# ── Brand colour tokens (from tailwind.config.js) ──────────────────────
BRAND = {
    "50": "#eef2ff",
    "100": "#e0e7ff",
    "200": "#c7d2fe",
    "300": "#a5b4fc",
    "400": "#818cf8",
    "500": "#6366f1",
    "600": "#4f46e5",
    "700": "#4338ca",
    "800": "#3730a3",
    "900": "#312e81",
    "950": "#1e1b4b",
}


def _escape_html(text: str) -> str:
    """Escape HTML special characters."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _markdown_to_html(md: str) -> str:
    """Very lightweight Markdown → HTML (covers the patterns the LLM uses).

    Handles: **bold**, *italic*, headings (##/###), bullet lists (- / *),
    numbered lists (1.), inline `code`, code blocks (```), and paragraphs.
    """
    import re

    lines = md.split("\n")
    html_parts: list[str] = []
    in_ul = False
    in_ol = False
    in_code_block = False
    code_block_lines: list[str] = []

    def close_list():
        nonlocal in_ul, in_ol
        if in_ul:
            html_parts.append("</ul>")
            in_ul = False
        if in_ol:
            html_parts.append("</ol>")
            in_ol = False

    for raw_line in lines:
        line = raw_line

        # Code blocks (```)
        if line.strip().startswith("```"):
            if in_code_block:
                html_parts.append(
                    '<pre style="background:{bg};padding:16px;border-radius:8px;'
                    'overflow-x:auto;font-size:13px;line-height:1.5;color:#374151">'
                    "{code}</pre>".format(
                        bg="#f3f4f6",
                        code="\n".join(code_block_lines),
                    )
                )
                code_block_lines = []
                in_code_block = False
            else:
                close_list()
                in_code_block = True
            continue

        if in_code_block:
            code_block_lines.append(_escape_html(line))
            continue

        stripped = line.strip()

        # Empty line → close lists
        if not stripped:
            close_list()
            continue

        # Headings
        if stripped.startswith("### "):
            close_list()
            html_parts.append(
                f'<h4 style="font-size:16px;font-weight:600;color:{BRAND["800"]};'
                f'margin:20px 0 8px">{_escape_html(stripped[4:])}</h4>'
            )
            continue
        if stripped.startswith("## "):
            close_list()
            html_parts.append(
                f'<h3 style="font-size:18px;font-weight:700;color:{BRAND["800"]};'
                f'margin:24px 0 10px">{_escape_html(stripped[3:])}</h3>'
            )
            continue

        # Bullet list
        bullet_match = re.match(r"^[-*]\s+(.+)$", stripped)
        if bullet_match:
            if in_ol:
                html_parts.append("</ol>")
                in_ol = False
            if not in_ul:
                html_parts.append(
                    '<ul style="margin:8px 0;padding-left:24px;color:#374151">'
                )
                in_ul = True
            html_parts.append(
                f'<li style="margin-bottom:6px;line-height:1.6">'
                f"{_inline_format(bullet_match.group(1))}</li>"
            )
            continue

        # Numbered list
        ol_match = re.match(r"^\d+\.\s+(.+)$", stripped)
        if ol_match:
            if in_ul:
                html_parts.append("</ul>")
                in_ul = False
            if not in_ol:
                html_parts.append(
                    '<ol style="margin:8px 0;padding-left:24px;color:#374151">'
                )
                in_ol = True
            html_parts.append(
                f'<li style="margin-bottom:6px;line-height:1.6">'
                f"{_inline_format(ol_match.group(1))}</li>"
            )
            continue

        # Regular paragraph
        close_list()
        html_parts.append(
            f'<p style="margin:10px 0;line-height:1.7;color:#374151">'
            f"{_inline_format(stripped)}</p>"
        )

    close_list()
    return "\n".join(html_parts)


def _inline_format(text: str) -> str:
    """Apply inline Markdown formatting (bold, italic, code)."""
    import re

    escaped = _escape_html(text)
    # Bold
    escaped = re.sub(
        r"\*\*(.+?)\*\*",
        r'<strong style="color:#1f2937">\1</strong>',
        escaped,
    )
    # Italic
    escaped = re.sub(r"\*(.+?)\*", r"<em>\1</em>", escaped)
    # Inline code
    escaped = re.sub(
        r"`(.+?)`",
        r'<code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;'
        r'font-size:0.9em">\1</code>',
        escaped,
    )
    return escaped


# ── HTML Template ───────────────────────────────────────────────────────

_HTML_TEMPLATE = textwrap.dedent("""\
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    html {{ scroll-behavior: smooth; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                   "Helvetica Neue", Arial, sans-serif;
      background: #f8fafc;
      color: #1f2937;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }}

    /* ── header ── */
    .header {{
      background: linear-gradient(135deg, {brand_700}, {brand_600});
      color: #fff;
      padding: 48px 32px 40px;
      text-align: center;
    }}
    .header .badge {{
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      background: rgba(255,255,255,0.18);
      padding: 4px 14px;
      border-radius: 999px;
      margin-bottom: 16px;
    }}
    .header h1 {{
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 8px;
    }}
    .header .subtitle {{
      font-size: 15px;
      opacity: 0.85;
      max-width: 600px;
      margin: 0 auto;
    }}

    /* ── container ── */
    .container {{
      max-width: 800px;
      margin: 0 auto;
      padding: 32px 24px 80px;
    }}

    /* ── section card ── */
    .section-card {{
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      padding: 32px;
      margin-bottom: 24px;
      border: 1px solid #e5e7eb;
    }}
    .section-card h2 {{
      font-size: 20px;
      font-weight: 700;
      color: {brand_800};
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid {brand_100};
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    .section-card h2::before {{
      content: "";
      display: inline-block;
      width: 4px;
      height: 22px;
      background: {brand_500};
      border-radius: 2px;
      flex-shrink: 0;
    }}

    /* ── summary box ── */
    .summary-box {{
      background: linear-gradient(135deg, {brand_50}, {brand_100});
      border: 1px solid {brand_200};
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }}
    .summary-box .label {{
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: {brand_600};
      margin-bottom: 8px;
    }}
    .summary-box p {{
      color: {brand_900};
      font-size: 15px;
      line-height: 1.6;
    }}

    /* ── concepts ── */
    .concepts {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 24px;
    }}
    .concept-tag {{
      display: inline-block;
      background: {brand_50};
      color: {brand_700};
      font-size: 13px;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 999px;
      border: 1px solid {brand_200};
    }}

    /* ── reading time ── */
    .meta-bar {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
      padding: 12px 20px;
      background: #fff;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      font-size: 13px;
      color: #6b7280;
    }}
    .meta-bar .dot {{
      width: 6px; height: 6px;
      border-radius: 50%;
      background: {brand_500};
      display: inline-block;
      margin-right: 8px;
    }}

    /* ── progress bar ── */
    .progress-wrap {{
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: {brand_100};
      z-index: 100;
    }}
    .progress-bar {{
      height: 100%;
      background: linear-gradient(90deg, {brand_500}, {brand_400});
      width: 0%;
      transition: width 0.2s ease-out;
    }}

    /* ── footer ── */
    .footer {{
      text-align: center;
      padding: 32px;
      color: #9ca3af;
      font-size: 13px;
    }}
    .footer .brand {{
      color: {brand_600};
      font-weight: 600;
    }}

    /* ── complete button ── */
    .complete-section {{
      text-align: center;
      padding: 40px 20px;
    }}
    .complete-btn {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, {brand_600}, {brand_500});
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      padding: 14px 32px;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
      box-shadow: 0 4px 14px rgba(79,70,229,0.3);
    }}
    .complete-btn:hover {{
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(79,70,229,0.35);
    }}
    .complete-btn:active {{
      transform: translateY(0);
    }}
    .complete-btn.done {{
      background: #10b981;
      box-shadow: 0 4px 14px rgba(16,185,129,0.3);
      cursor: default;
    }}

    /* ── video suggestion ── */
    .video-suggestion {{
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      padding: 10px 14px;
      background: #faf5ff;
      border: 1px solid #e9d5ff;
      border-radius: 8px;
      font-size: 13px;
      color: #7c3aed;
    }}
    .video-suggestion svg {{
      flex-shrink: 0;
    }}

    @media (max-width: 640px) {{
      .header {{ padding: 32px 20px 28px; }}
      .header h1 {{ font-size: 22px; }}
      .container {{ padding: 20px 16px 60px; }}
      .section-card {{ padding: 20px; }}
    }}
  </style>
</head>
<body>

<div class="progress-wrap"><div class="progress-bar" id="progressBar"></div></div>

<header class="header">
  <div class="badge">Gruppen Academy</div>
  <h1>{title}</h1>
  <p class="subtitle">{subtitle}</p>
</header>

<div class="container">

  <div class="meta-bar">
    <span><span class="dot"></span> {training_title}</span>
    <span>{reading_time} min de leitura</span>
  </div>

  {summary_html}

  {concepts_html}

  {sections_html}

  <div class="complete-section" id="completeSection">
    <button class="complete-btn" id="completeBtn" onclick="markComplete()">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
           viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
      Concluir leitura
    </button>
  </div>

</div>

<footer class="footer">
  <span class="brand">Gruppen Academy</span> &mdash; Plataforma de aprendizagem corporativa
</footer>

<script>
// ── Reading progress bar ──
(function() {{
  var bar = document.getElementById('progressBar');
  window.addEventListener('scroll', function() {{
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    var pct = docH > 0 ? (window.scrollY / docH) * 100 : 100;
    bar.style.width = Math.min(pct, 100) + '%';
  }});
}})();

// ── SCORM 1.2 communication ──
var _completed = false;

function getAPI() {{
  // Walk up the window hierarchy to find API
  var win = window;
  for (var i = 0; i < 10; i++) {{
    if (win.API) return win.API;
    if (win === win.parent) break;
    win = win.parent;
  }}
  return null;
}}

function scormInit() {{
  var api = getAPI();
  if (api) {{
    try {{ api.LMSInitialize(""); }} catch(e) {{}}
  }}
}}

function markComplete() {{
  if (_completed) return;
  _completed = true;

  var btn = document.getElementById('completeBtn');
  btn.classList.add('done');
  btn.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg> Concluido!';

  var api = getAPI();
  if (api) {{
    try {{
      api.LMSSetValue("cmi.core.lesson_status", "completed");
      api.LMSSetValue("cmi.core.score.raw", "100");
      api.LMSCommit("");
    }} catch(e) {{}}
  }}

  // Also notify parent via postMessage (for the platform wrapper)
  try {{
    window.parent.postMessage({{
      type: "scorm_status",
      lesson_status: "completed",
      score_raw: 100,
      score_max: 100,
    }}, "*");
  }} catch(e) {{}}
}}

scormInit();
</script>
</body>
</html>
""")


# ── Manifest Template ───────────────────────────────────────────────────

def _build_manifest_xml(title: str) -> str:
    """Build a minimal SCORM 1.2 imsmanifest.xml."""
    manifest = Element("manifest", {
        "identifier": "gruppen_academy_ai_content",
        "version": "1.0",
        "xmlns": "http://www.imsproject.org/xsd/imscp_rootv1p1p2",
        "xmlns:adlcp": "http://www.adlnet.org/xsd/adlcp_rootv1p2",
    })

    metadata = SubElement(manifest, "metadata")
    schema = SubElement(metadata, "schema")
    schema.text = "ADL SCORM"
    schema_ver = SubElement(metadata, "schemaversion")
    schema_ver.text = "1.2"

    organizations = SubElement(manifest, "organizations", {
        "default": "org_default",
    })
    org = SubElement(organizations, "organization", {"identifier": "org_default"})
    org_title = SubElement(org, "title")
    org_title.text = title
    item = SubElement(org, "item", {
        "identifier": "item_1",
        "identifierref": "res_1",
    })
    item_title = SubElement(item, "title")
    item_title.text = title

    resources = SubElement(manifest, "resources")
    SubElement(resources, "resource", {
        "identifier": "res_1",
        "type": "webcontent",
        "adlcp:scormtype": "sco",
        "href": "index.html",
    })

    xml_bytes = tostring(manifest, encoding="unicode", xml_declaration=False)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_bytes


# ── Public API ──────────────────────────────────────────────────────────

def build_scorm_from_ai_content(
    content: dict,
    output_dir: str,
    module_id: str,
    training_title: str,
    module_title: str,
) -> dict:
    """Convert AI-generated content JSON into a SCORM 1.2 package on disk.

    Parameters
    ----------
    content : dict
        The JSON returned by ``generate_training_content`` (title, sections,
        summary, key_concepts, estimated_reading_minutes).
    output_dir : str
        Base upload directory for this training
        (e.g. ``{upload_dir}/trainings/{training_id}``).
    module_id : str
        Used to namespace the extracted directory.
    training_title : str
        The parent training's title (shown in meta bar).
    module_title : str
        Fallback title if not present in ``content``.

    Returns
    -------
    dict
        ``content_data`` suitable for a SCORM TrainingModule, including the
        original AI fields (``sections``, ``summary``, ``key_concepts``) so the
        admin preview still works.
    """
    title = content.get("title") or module_title
    sections = content.get("sections", [])
    summary = content.get("summary", "")
    key_concepts = content.get("key_concepts", [])
    reading_time = content.get("estimated_reading_minutes", 5)
    video_suggestions_seen = False

    # ── Build sections HTML ──
    sections_html_parts: list[str] = []
    for sec in sections:
        heading = _escape_html(sec.get("heading", ""))
        raw_content = sec.get("content", "")
        # If content is already HTML (from manual editor), use it directly;
        # otherwise convert from markdown.
        if raw_content.strip().startswith("<"):
            body = raw_content
        else:
            body = _markdown_to_html(raw_content)
        vs = sec.get("video_suggestions", [])

        video_html = ""
        if vs:
            video_suggestions_seen = True
            for v in vs:
                video_html += (
                    '<div class="video-suggestion">'
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" '
                    'stroke="currentColor" stroke-width="2"><polygon points='
                    '"5 3 19 12 5 21 5 3"/></svg>'
                    f'<span>{_escape_html(v)}</span></div>'
                )

        sections_html_parts.append(
            f'<div class="section-card">'
            f"<h2>{heading}</h2>"
            f"{body}"
            f"{video_html}"
            f"</div>"
        )

    sections_html = "\n".join(sections_html_parts)

    # ── Summary box ──
    summary_html = ""
    if summary:
        summary_html = (
            '<div class="summary-box">'
            '<div class="label">Resumo</div>'
            f"<p>{_escape_html(summary)}</p>"
            "</div>"
        )

    # ── Key concepts ──
    concepts_html = ""
    if key_concepts:
        tags = "".join(
            f'<span class="concept-tag">{_escape_html(c)}</span>'
            for c in key_concepts
        )
        concepts_html = f'<div class="concepts">{tags}</div>'

    # ── Render full HTML ──
    html = _HTML_TEMPLATE.format(
        title=_escape_html(title),
        subtitle=_escape_html(summary) if summary else "",
        training_title=_escape_html(training_title),
        reading_time=reading_time,
        summary_html=summary_html,
        concepts_html=concepts_html,
        sections_html=sections_html,
        brand_50=BRAND["50"],
        brand_100=BRAND["100"],
        brand_200=BRAND["200"],
        brand_300=BRAND["300"],
        brand_400=BRAND["400"],
        brand_500=BRAND["500"],
        brand_600=BRAND["600"],
        brand_700=BRAND["700"],
        brand_800=BRAND["800"],
        brand_900=BRAND["900"],
        brand_950=BRAND["950"],
    )

    # ── Write files to disk ──
    extract_dir = os.path.join(output_dir, f"scorm_{module_id}")
    os.makedirs(extract_dir, exist_ok=True)

    with open(os.path.join(extract_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)

    manifest = _build_manifest_xml(title)
    with open(os.path.join(extract_dir, "imsmanifest.xml"), "w", encoding="utf-8") as f:
        f.write(manifest)

    # ── Return content_data (SCORM fields + original AI fields) ──
    return {
        # SCORM fields
        "entry_point": "index.html",
        "extract_dir": extract_dir,
        "scorm_version": "1.2",
        # Original AI fields (so admin preview keeps working)
        "title": title,
        "sections": sections,
        "summary": summary,
        "key_concepts": key_concepts,
        "estimated_reading_minutes": reading_time,
        "generated_as_scorm": True,
    }
