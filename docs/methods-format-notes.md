# Notes from reverse engineering the new reMarkable Methods template format

Reference for authoring page templates in the Methods format (reMarkable Paper Pro and rM2 on
software 3.17 and up). Two sources fed these notes: the spacepanda.se reverse-engineering
writeup, and direct on-device probing I did while building these templates. Where the two
disagree, the probes win.

None of this is documented by reMarkable. It's all community reverse engineering, and
everything below is empirical.

## Location & registration
- Methods templates live in `/home/root/.local/share/remarkable/xochitl/`, the same place your
  notebooks live. They survive software updates. The old `.svg` + `templates.json` system under
  `/usr/share/remarkable/templates/` got wiped on every update, and Methods replaces it.
- There's no `templates.json`. A file set registers as a template purely by carrying
  `"type": "TemplateType"` in its `.metadata`.
- To install, copy the files in and then run `systemctl restart xochitl` (or reboot).

## The three files
Each template is three files sharing one base filename. The default is a UUID4, but a readable
stem works just as well.
- `base.content` holds `{}`.
- `base.metadata` holds JSON: `createdTime`, `lastModified` (ms strings), `parent` (""),
  `pinned` (false), `type` ("TemplateType"), `visibleName`, `source`, `new`.
- `base.template` holds the drawing, covered below.

## `.template` fields
`name` (shown in the picker), `author`, `iconData` (optional base64 of a 150x200 SVG used as the
picker thumbnail), `templateVersion`, `formatVersion` (must be 1), `categories` (non-empty list),
`labels` (non-empty list), `orientation` ("portrait" or "landscape", used as a picker filter),
`supportedScreens` (e.g. `["rmPP"]`), `constants`, and `items`.

`supportedScreens` is also how you target a device. Each tablet's picker only shows templates
whose `supportedScreens` lists that device, so you can drop several variants into one install
directory and each device picks up only the ones meant for it. That's the infrastructure that
makes the rM2 rotation fix below work without a separate installer: one folder, two coordinate
sets, routed by this field.

## The coordinate gotcha
Coordinates are pixels in the device's logical page canvas, which is not the physical panel
resolution. The Paper Pro panel is 2160x2880, but the template canvas behaves like the classic
~1404x1872 space. Hardcode 2160x2880 and everything renders about 1.5x too big, so you only see
roughly two thirds of the page.

The fix is to never hardcode. The device injects `templateWidth` and `templateHeight` (and inside
a `group`, `parentWidth` and `parentHeight`). Define scale constants and multiply:
```json
"constants": [{"sx": "templateWidth / 2160"}, {"sy": "templateHeight / 2880"}]
```
Then emit each x as `"<v> * sx"` and each y as `"<v> * sy"`. That fits exactly on any device.

## The rM2 rotation gotcha
The rM2 interprets the template canvas rotated 90° from the Paper Pro (confirmed on rM2 firmware
3.25). The same `items` JSON that sits upright on a Paper Pro renders sideways on an rM2. It's a
clean 90° rotation, not a squish, so the scale stays uniform. Since `items` is static JSON and
can't branch on the device, the answer is to ship two coordinate sets and let `supportedScreens`
route each one to the right tablet.

To build the rM2 set, pre-rotate every path coordinate 90° clockwise: map each `(x, y)` in the
2160×2880 design space to `(y, 2160 − x)`, and leave the `sx`/`sy` constants alone. Keeping the
constants is the whole trick. The transform is orthonormal, so the uniform ~0.65x scale survives
(the art fills the page instead of distorting), and the device's own canvas rotation brings it
back upright. `iconData` is a separate preview image, so leave it unrotated. See `ROTATE_90` in
`src/gen_methods.py`.

## Drawing instructions (`items`)
Each item needs a unique `id`.
- `path`: `{"data": ["M",x,y,"L",x,y,...,"Z"], "strokeWidth": n }` and/or
  `{"fillColor": "#RRGGBB"}`. Numbers can be literals or expression strings.
- `text`: `{"text","fontSize","position":{x,y},"bold"?}`.
- `group`: `{"boundingBox":{x,y,width,height}, "children":[...]}`, where child coords are relative.

## Probed capabilities (rmPP)
These are what I actually confirmed on a device, so treat them as authoritative.

| thing | result |
|---|---|
| `path` M/L/Z + `strokeWidth` strokes | YES (renders as a single crisp line) |
| fill via `fillColor` hex | YES, this is the fill property |
| fill via `fill` or `color` | NO (ignored) |
| grayscale fills (`#BFBFBF`, `#808080`, `#E2E2E2`) | YES, distinct shades |
| white fill over black | YES (knocks out) |
| even-odd hole (one path, outer `...Z` + inner `...Z`) | YES (donut / screen cutout) |
| curve cmds `C`/`A` in data | NO. They blank the whole template. Use only M/L/Z. |
| stroke colour (`stroke`/`strokeColor`/`color`) | ignored; strokes render dark/black |
| `text` | YES |

### Recipes that follow from the above
- Solid shape: a closed M/L/Z path plus `fillColor`.
- Rounded corners: approximate the arcs with short straight `L` segments (no `C`/`A`).
- Screen-in-bezel: one black `fillColor` path whose `data` is the outer rounded-rect `...Z`
  followed by the inner rounded-rect `...Z` (the even-odd hole).
- Gray shading (no opacity needed): a gray `fillColor`.
- Fine lines (grid or rules): use real stroked paths (`strokeWidth` around 1 to 1.5), not thin
  filled rectangles. Filled-rect "lines" read as fuzzy double lines on e-ink; strokes come out
  single and crisp. They render dark, since stroke colour isn't settable, which is usually what
  you want anyway.
- Circle: approximate with a filled polygon of 12 to 14 sides.

## Thumbnails (`iconData`)
The picker icon is the optional base64 150x200 SVG in `iconData`. It's a normal SVG, so the
M/L/Z restriction doesn't apply here and rounded corners and real curves are fine. The catch is
that the device caches the thumbnail by filename. Overwrite files with the same base name and you
keep the old cached icon. To force a refresh, give the files a new base filename, or delete the
old set plus its generated `*.thumbnails` folders and reinstall.

## Open / unconfirmed
- Whether stroke colour is settable at all (it rendered dark in every test).
- The exact `templateWidth`/`templateHeight` per device (scaling by expression avoids needing it).
- Whether more item types or props (rect, circle, opacity) exist but went unseen.
- Whether `parent` (folder nesting) works for templates (untested as of these notes).
