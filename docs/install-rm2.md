# Installing the UX Templates on a reMarkable 2 — Absolute Beginner Guide

Step-by-step for copying the template files onto a **reMarkable 2 (rM2)**, assuming you've
never used a command line. Budget ~20 minutes the first time; ~2 minutes for future updates.

**Good news vs. the Paper Pro:** the rM2 does **NOT** need Developer Mode and does **NOT** get
wiped. SSH access is available out of the box — you just need the password.

---

## Before you start (one requirement)

Your rM2 must be on **software version 3.17 or newer**. These templates use the newer
"Methods" template format, which older software doesn't understand.
Check/update: **Settings → General → Software → (update if available).**
If your rM2 is on an older version and you can't update, these particular files won't work.

---

## What you need

- Your reMarkable 2 and its **USB cable**.
- A **computer** (Mac or Windows).
- The template files, **unzipped** into a folder on your computer (e.g. `uxtpl` in Downloads).
  They're named `uxtpl_..._.content`, `..._.metadata`, `..._.template`. Unzip the archive —
  don't copy the `.zip` itself.
- Use the **universal** template set (it's tagged to work on both the rM2 and the Paper Pro).

We'll connect over the **USB cable** — simplest and most reliable.

---

## Step 1 — Find your password and address

On the reMarkable 2:

1. **Settings → General → Help → About → Copyrights and licenses.**
2. Scroll to the bottom, to the **"GPLv3 Compliance"** section.
3. You'll see a **username (`root`)**, a **password** (a random string), and **IP addresses**.

Write down the **password** exactly (case-sensitive). Notes:
- The USB address is always **`10.11.99.1`** — that's what we'll use.
- The password is unique to your device and **changes after each software update**, so if it
  ever stops working, come back here for the new one.

(No Developer Mode step — the rM2 already allows this.)

---

## Step 2 — Plug in and open a terminal

1. Connect the rM2 to the computer with the **USB cable**.
2. Open the terminal program:
   - **Mac:** ⌘+Space, type **Terminal**, Enter.
   - **Windows:** Start, type **PowerShell**, Enter.

You type commands at the prompt and press Enter to run them.

---

## Step 3 — Copy the template files onto the tablet

Type the command below **as one line**, then press Enter. Replace the folder path with where
you unzipped the files.

**Mac example** (files in `~/Downloads/uxtpl`):
```
scp -O ~/Downloads/uxtpl/uxtpl_* root@10.11.99.1:/home/root/.local/share/remarkable/xochitl/
```

**Windows (PowerShell) example** (files in `C:\Users\You\Downloads\uxtpl`):
```
scp -O C:\Users\You\Downloads\uxtpl\uxtpl_* root@10.11.99.1:/home/root/.local/share/remarkable/xochitl/
```

What happens:
- **First time only:** it asks *"Are you sure you want to continue connecting (yes/no)?"* —
  type **`yes`**, Enter.
- It asks for the **password** — type the one from Step 1, Enter. (It won't show as you type;
  that's normal.)
- It copies 108 files and returns to the prompt.

`/home/root/.local/share/remarkable/xochitl/` is where the tablet stores notebooks and
templates — exactly where these belong.

> Tip: the `-O` tells it to use the copy method the reMarkable expects. If you ever see an
> error mentioning *"sftp"* or *"subsystem,"* the `-O` is the fix.

---

## Step 4 — Restart the tablet's interface

Easiest: **restart the device** (hold the power button → Restart, or off and on).

Or from the terminal:
```
ssh root@10.11.99.1
```
(enter password), then:
```
systemctl restart xochitl
```
then:
```
exit
```

---

## Step 5 — Use them

On the rM2: new **page → Template** picker. You'll see templates named like **`1UP COL
iPhone`**, **`1UP LS COL GRD iPhone`**, **`4UP LS COL Android`**, each with a small thumbnail.

Done. 🎉

> Note on look: the rM2 screen is grayscale and a bit lower resolution than the Paper Pro.
> The templates scale to fit automatically, so they'll be the right size; the only difference
> is the rM2 renders the grays as fine dither patterns rather than smooth tones.

---

## Doing it again later (updating)

1. Plug in USB, open the terminal.
2. Remove the old set:
   ```
   ssh root@10.11.99.1
   rm -rf /home/root/.local/share/remarkable/xochitl/uxtpl_*
   exit
   ```
3. Copy the new files (same command as Step 3).
4. Restart (Step 4).

The `uxtpl_` prefix means that delete only touches these templates.

---

## Prefer not to use the terminal? (drag-and-drop)

- **Windows: [WinSCP](https://winscp.net)** — New Session → **File protocol: SCP** → Host
  `10.11.99.1`, User `root`, Password from Step 1 → Login → go to
  `/home/root/.local/share/remarkable/xochitl/` → drag the `uxtpl_*` files in.
- **Mac: [Cyberduck](https://cyberduck.io)** — Open Connection → **SFTP** → Server
  `10.11.99.1`, Username `root`, Password from Step 1 → connect → same folder → drag files in.

Then restart (Step 4).

---

## Troubleshooting

- **Wrong password / "Permission denied":** re-check Step 1 (case-sensitive; changes after
  software updates).
- **Error mentioning "sftp" / copies 0 files:** add `-O` to `scp` (already in the examples),
  or in WinSCP choose the **SCP** protocol.
- **"REMOTE HOST IDENTIFICATION HAS CHANGED":** after an update, run `ssh-keygen -R 10.11.99.1`
  once, then retry.
- **Can't reach 10.11.99.1:** check the USB cable is connected; make sure you typed the USB
  address `10.11.99.1`.
- **Templates missing or showing old thumbnails:** remove and re-copy
  (`rm -rf /home/root/.local/share/remarkable/xochitl/uxtpl_*`, copy again, restart) — the
  tablet caches thumbnails by filename.
- **Nothing shows after install:** confirm the rM2 is on software **3.17+** (older versions
  don't support this template format).

---

### Sources
- reMarkable Guide — SSH Access: https://remarkable.guide/guide/access/ssh.html
- reMarkable Guide — Custom Templates: https://remarkable.guide/guide/config/templates.html
