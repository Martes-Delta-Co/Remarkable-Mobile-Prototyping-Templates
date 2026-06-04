# Installing the UX Templates on a reMarkable Paper Pro — Absolute Beginner Guide

This walks you through copying the template files onto a reMarkable Paper Pro, step by step,
assuming you've never used a command line or SSH before. Budget ~30–40 minutes the first time.

You'll do it once to set up, then copying updated templates later takes about 2 minutes.

---

## ⚠️ Read this first (important)

To put files on a reMarkable Paper Pro you must turn on **Developer Mode**, and **turning on
Developer Mode ERASES the tablet** — all your notebooks and settings are wiped and you redo
the first-time setup. So:

1. **Sync everything first.** Make sure your notebooks are backed up to the reMarkable cloud
   / the desktop & mobile apps before you start. (Settings → check that sync is on and finished.)
2. Developer Mode is a one-time switch. Once it's on, you can copy files anytime without
   wiping again.

If you're not willing to reset the device, stop here — there's no supported way to add custom
templates without Developer Mode on the Paper Pro.

---

## What you need

- Your reMarkable Paper Pro and its **USB-C cable**.
- A **computer** (Mac or Windows).
- The template files, **unzipped** into a folder on your computer (e.g. a folder called
  `uxtpl` in your Downloads). They are files named `uxtpl_..._.content`, `..._.metadata`,
  `..._.template`. Unzip the archive first — don't copy the `.zip` itself.

We'll connect the tablet to the computer with the USB cable (no Wi-Fi needed — simplest and
most reliable).

---

## Step 1 — Turn on Developer Mode (one time; this wipes the tablet)

On the reMarkable:

1. Open **Settings**.
2. Go to **General → Software** (look for an **Advanced** section).
3. Find **Developer mode** and turn it on.
4. Confirm. The tablet resets and walks you through setup again. (Menu wording can vary
   slightly by software version — you're looking for "Developer mode" under Software/Advanced.)

After it reboots and you finish setup, Developer Mode is on and SSH is available over USB.

---

## Step 2 — Find your password and address

Still on the reMarkable:

1. **Settings → General → Help → About → Copyrights and licenses.**
2. Scroll to the bottom, to the **"GPLv3 Compliance"** section.
3. You'll see something like a **username (`root`)**, a **password** (a random string of
   letters/numbers), and one or more **IP addresses**.

Write down the **password** exactly (it's case-sensitive). Note:
- The USB address is always **`10.11.99.1`** — that's what we'll use.
- This password is unique to your device and **changes every time the software updates or you
  reset**, so if it stops working later, come back here and get the new one.

---

## Step 3 — Plug in and open a terminal

1. Connect the tablet to the computer with the **USB-C cable**.
2. Open the terminal program:
   - **Mac:** press ⌘+Space, type **Terminal**, press Enter.
   - **Windows:** click Start, type **PowerShell**, press Enter.

A window with a text prompt opens. You type commands here and press Enter to run them.

---

## Step 4 — Copy the template files onto the tablet

In the terminal, type the command below **as one line**, then press Enter.
Replace `PATH_TO_FOLDER` with the folder where you unzipped the files.

**Mac example** (files unzipped to `~/Downloads/uxtpl`):
```
scp -O ~/Downloads/uxtpl/uxtpl_* root@10.11.99.1:/home/root/.local/share/remarkable/xochitl/
```

**Windows (PowerShell) example** (files in `C:\Users\You\Downloads\uxtpl`):
```
scp -O C:\Users\You\Downloads\uxtpl\uxtpl_* root@10.11.99.1:/home/root/.local/share/remarkable/xochitl/
```

What happens:
- The **first time** it asks something like *"Are you sure you want to continue connecting
  (yes/no)?"* — type **`yes`** and press Enter.
- It asks for a **password** — paste/type the one from Step 2 and press Enter. (The password
  does **not** show as you type — that's normal. Just type it and press Enter.)
- It copies 108 files. When it finishes you're back at the prompt.

`/home/root/.local/share/remarkable/xochitl/` is where the tablet keeps its notebooks and
templates — that's exactly where these need to go.

> Tip: the `-O` in the command tells it to use the older copy method the reMarkable expects.
> If you ever see an error mentioning *"sftp"* or *"subsystem"*, the `-O` is what fixes it.

---

## Step 5 — Restart the tablet's interface

The tablet needs a nudge to notice the new templates. Easiest: **restart the device**
(hold the power button → Restart, or turn it off and on).

*Or*, if you want to do it from the terminal: connect, then restart just the interface:
```
ssh root@10.11.99.1
```
(enter the password again), then:
```
systemctl restart xochitl
```
then:
```
exit
```

---

## Step 6 — Use them

On the reMarkable: create a **new page**, open the **Template** picker, and you'll see the
templates (named like **`1UP COL iPhone`**, **`1UP LS COL GRD iPhone`**, **`4UP LS COL
Android`**). Each shows a small thumbnail (platform logo + screens + a swatch for grid /
columns).

Done. 🎉

---

## Doing it again later (updating the templates)

When you have a new/updated set, you don't reset anything — Developer Mode stays on. Just:

1. Plug in USB, open the terminal.
2. **Remove the old set** (so updated icons/lines aren't cached):
   ```
   ssh root@10.11.99.1
   rm -rf /home/root/.local/share/remarkable/xochitl/uxtpl_*
   exit
   ```
3. **Copy the new files** (same command as Step 4).
4. **Restart** (Step 5).

The `uxtpl_` prefix means that delete command only touches these templates, nothing else.

---

## Prefer not to use the terminal? (drag-and-drop option)

You can use a free file app with a friendly window instead of typing commands:

- **Windows: [WinSCP](https://winscp.net)** — New Session → **File protocol: SCP** →
  Host name `10.11.99.1`, User name `root`, Password from Step 2 → Login → navigate to
  `/home/root/.local/share/remarkable/xochitl/` → drag the `uxtpl_*` files in.
- **Mac: [Cyberduck](https://cyberduck.io)** — Open Connection → **SFTP** → Server
  `10.11.99.1`, Username `root`, Password from Step 2 → connect → go to the same folder →
  drag the files in.

Then restart the tablet (Step 5).

---

## Troubleshooting

- **"Permission denied" / wrong password:** re-check the password in Step 2 (it's
  case-sensitive and changes after any software update or reset).
- **Error mentioning "sftp" or it copies 0 files:** add `-O` to the `scp` command (already in
  the examples above), or in WinSCP make sure the protocol is **SCP**.
- **"WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED":** this happens after a reset/update.
  Run `ssh-keygen -R 10.11.99.1` once, then try again.
- **Can't connect to 10.11.99.1:** make sure the USB cable is plugged in, Developer Mode is
  on, and you're using `10.11.99.1` (the USB address).
- **Templates don't show up, or show old thumbnails:** remove them and re-copy
  (`rm -rf /home/root/.local/share/remarkable/xochitl/uxtpl_*`, copy again, restart). The
  tablet caches template thumbnails by filename.
- **Files seem to vanish after a reMarkable software update:** these Methods-format templates
  normally survive updates (they live in your data folder, not the system folder). If they
  ever don't, just re-copy them.

---

### Sources
- reMarkable Guide — SSH Access: https://remarkable.guide/guide/access/ssh.html
- reMarkable support — Developer mode: https://support.remarkable.com/s/article/Developer-mode
- Connect to reMarkable Paper Pro via SSH: https://www.informaticar.net/how-to-connect-to-remarkable-paper-pro-via-ssh/
