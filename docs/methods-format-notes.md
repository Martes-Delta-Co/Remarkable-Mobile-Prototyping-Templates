# reMarkable "Methods" Template Format — Field Notes

Reference for authoring page templates in the **Methods** format (reMarkable Paper Pro
and rM2 on software >= 3.17). Sources: the spacepanda.se reverse-engineering writeup plus
**direct on-device probing** done while building these templates. Where they conflict, the
probes win.

> The format is undocumented by reMarkable and community-reverse-engineered. Empirical.

## Location & registration
- Methods templates live in `/home/root/.local/share/remarkable/xochitl/` (where notebooks
  live). They **survive software updates**. The old `.svg` + `templates.json` system in
  `/usr/share/remarkable/templates/` got wiped on every update — Methods replaces it.
- **No `templates.json`.** A file set registers as a template purely via
  `"type": "TemplateType"` in its `.metadata`.
- Install = copy files in, then `systemctl restart xochitl` (or reboot).

## The three files (shared base filename; UUID4 by default, readable stem works)
- `base.content` -> `{}`
- `base.metadata` -> JSON: `createdTime`,`lastModified` (ms strings), `parent` (""),
  `pinned` (false), `type` ("TemplateType"), `visibleName`, `source`, `new`.
- `base.template` -> the drawing (below).

## `.template` fields
`name` (shown in picker), `author`, `iconData` (optional; base64 of a 150x200 SVG used as
the picker thumbnail), `templateVersion`, `formatVersion` (**must be 1**),
`categories` (**non-empty list**), `labels` (**non-empty list**),
`orientation` ("portrait"/"landscape" — picker filter), `supportedScreens`
(e.g. `["rmPP"]`), `constants`, `items`.

## Coordinates — the gotcha
Coordinates are pixels in the device's **logical page canvas**, which is NOT the physical
panel resolution. The Paper Pro panel is 2160x2880 but the template canvas behaves like the
classic ~**1404x1872** space. Hardcoding 2160x2880 renders ~1.5x too big (you see ~2/3 of
the page).
**Fix:** never hardcode. The device injects `templateWidth`/`templateHeight` (and inside a
`group`, `parentWidth`/`parentHeight`). Define scale constants and multiply:
```json
"constants": [{"sx": "templateWidth / 2160"}, {"sy": "templateHeight / 2880"}]
```
then emit each x as `"<v> * sx"`, each y as `"<v> * sy"`. Fits exactly on any device.

## items — drawing instructions (each needs a unique `id`)
- `path`: `{"data": ["M",x,y,"L",x,y,...,"Z"], "strokeWidth": n }` and/or
  `{"fillColor": "#RRGGBB"}`. Numbers may be literals or expression strings.
- `text`: `{"text","fontSize","position":{x,y},"bold"?}`.
- `group`: `{"boundingBox":{x,y,width,height}, "children":[...]}` (child coords relative).

## PROBED CAPABILITIES (rmPP) — authoritative
| thing | result |
|---|---|
| `path` M/L/Z + `strokeWidth` strokes | YES (renders, single crisp line) |
| **fill via `fillColor` hex** | YES — the fill property |
| fill via `fill` or `color` | NO (ignored) |
| **grayscale fills** (`#BFBFBF`,`#808080`,`#E2E2E2`) | YES, distinct shades |
| white fill over black | YES (knocks out) |
| **even-odd hole** (one path, outer `...Z` + inner `...Z`) | YES (donut / screen cutout) |
| **curve cmds `C`/`A` in data** | NO — they BLANK the whole template. Use only M/L/Z. |
| stroke colour (`stroke`/`strokeColor`/`color`) | ignored — strokes render dark/black |
| `text` | YES |

### Recipes that follow from the above
- Solid shape: closed M/L/Z path + `fillColor`.
- Rounded corners: approximate arcs with short straight `L` segments (no `C`/`A`).
- Screen-in-bezel: one black `fillColor` path, `data` = outer rounded-rect `...Z` then inner
  rounded-rect `...Z` (even-odd hole).
- Gray shading (no opacity needed): a gray `fillColor`.
- Fine lines (grid / rules): real **stroked** paths (`strokeWidth` ~1-1.5), NOT thin filled
  rectangles. Filled-rect "lines" read as fuzzy double lines on e-ink; strokes are single &
  crisp. They render dark (stroke colour isn't settable), which is usually what you want.
- Circle: approximate with a filled polygon (~12-14 sides).

## Thumbnails (`iconData`)
The picker icon is the optional base64 150x200 SVG in `iconData` (normal SVG — the M/L/Z
restriction is only for `items`, so rounded corners/paths are fine here). **The device caches
the thumbnail by filename.** Overwriting files with the same base name keeps the OLD cached
icon. To force a refresh: give the files a NEW base filename (or delete the old set +
its generated `*.thumbnails` folders, then reinstall).

## Open / unconfirmed
- Whether stroke colour is settable at all (rendered dark in tests).
- Exact `templateWidth`/`templateHeight` per device (scale-by-expression avoids needing it).
- Whether more item types/props (rect, circle, opacity) exist but were unseen.
- Whether `parent` (folder nesting) works for templates (untested as of these notes).
