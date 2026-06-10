// Renderer for the reMarkable "Methods" template format -> SVG.
// Faithful port of generators/render_previews.py (item_to_svg), upgraded to
// evaluate `constants` generically (a tiny safe arithmetic evaluator) instead
// of string-stripping. One source of truth for thumbnails and zoom previews.

export interface TemplateItem {
  type?: string;
  data: (string | number)[];
  fillColor?: string;
  strokeWidth?: number;
}
export interface TemplateDoc {
  constants: Record<string, string>[]; // [{ "sx": "templateWidth / 2160" }, ...]
  items: TemplateItem[];
}

// ---- tiny safe arithmetic evaluator: numbers, idents, + - * /, parens ----
// No eval(). Recursive descent over a token stream.
function evalExpr(expr: string, env: Record<string, number>): number {
  const tokens = expr.match(/[A-Za-z_]\w*|\d+\.?\d*|[()+\-*/]/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  function atom(): number {
    const t = peek();
    if (t === "(") {
      next();
      const v = expression();
      next(); // ")"
      return v;
    }
    next();
    if (t in env) return env[t];
    return parseFloat(t);
  }
  function term(): number {
    let v = atom();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const r = atom();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function expression(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  return expression();
}

export interface RenderOpts {
  width?: number; // design space; defaults to 2160 x 2880 (sx = sy = 1)
  height?: number;
  stroke?: string; // colour for stroked (grid/notes) lines
  background?: string;
}

export function renderTemplateSvg(doc: TemplateDoc, opts: RenderOpts = {}): string {
  const width = opts.width ?? 2160;
  const height = opts.height ?? 2880;
  const stroke = opts.stroke ?? "#3a3a3a";
  const background = opts.background ?? "#ffffff";

  const env: Record<string, number> = { templateWidth: width, templateHeight: height };
  for (const c of doc.constants) {
    for (const [k, ex] of Object.entries(c)) env[k] = evalExpr(ex, env);
  }

  const paths: string[] = [];
  for (const it of doc.items) {
    const data = it.data;
    const d: string[] = [];
    for (let i = 0; i < data.length; ) {
      const cmd = String(data[i]);
      if (cmd === "M" || cmd === "L") {
        const x = evalExpr(String(data[i + 1]), env);
        const y = evalExpr(String(data[i + 2]), env);
        d.push(`${cmd}${x.toFixed(2)} ${y.toFixed(2)}`);
        i += 3;
      } else if (cmd === "Z") {
        d.push("Z");
        i += 1;
      } else {
        i += 1;
      }
    }
    const dd = d.join("");
    if (it.fillColor) {
      paths.push(`<path d="${dd}" fill="${it.fillColor}" fill-rule="evenodd"/>`);
    } else {
      paths.push(`<path d="${dd}" fill="none" stroke="${stroke}" stroke-width="${it.strokeWidth ?? 1}"/>`);
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `preserveAspectRatio="xMidYMid meet">` +
    `<rect width="${width}" height="${height}" fill="${background}"/>` +
    paths.join("") +
    `</svg>`
  );
}
