# MoCa — Money Tracker

A small **iPhone home-screen app** (PWA) for tracking money month by month —
modelled on your `Financial.xlsx` and built in the same style as the `Taj` app.

## What it does

Each month is one card. Open a month to manage three lists:

- **Income** — salary (GAJI), bonus, anything coming in.
- **To Pay** — your bills / commitments. Each has an amount, a "pay to"
  (account or app), notes, and a **paid** checkbox. The progress bar on the
  home screen fills as you tick them off.
- **Spending Log** — actual day-to-day expenses with a date (like the credit
  card breakdown in the spreadsheet).

The month view shows a live summary: total income, total to pay, paid so far,
still unpaid, **balance** (income − to pay), and total logged spending.

When you create a new month it can **copy the "To Pay" list** from your latest
month — so recurring bills (TNB, Wifi, Groceries, instalments…) carry over and
you just adjust the amounts.

All data is stored **on the device** (IndexedDB). Nothing is uploaded.

## Run it locally (to test on this PC)

From this folder:

```powershell
npx serve .
```

…or any static server, then open the printed `http://localhost:…` URL.

## Install it on your iPhone

The app must be served over **https** (or `localhost`) for iOS to install it.
Easiest free options: push this folder to GitHub Pages, Netlify, or Vercel.

Then on the iPhone:

1. Open the URL in **Safari**.
2. Tap the **Share** button → **Add to Home Screen**.
3. Launch it from the home screen — it runs full-screen like a native app and
   works offline.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell — home view, month view, modals |
| `style.css` | Styling (light + dark mode, iOS safe areas) |
| `app.js` | All logic + IndexedDB storage |
| `sw.js` | Service worker — offline support |
| `manifest.json` | PWA metadata (name, icons, colours) |
| `icon-*.png` | App icons |
| `gen-icons.js` | One-off script that generates the icons (`node gen-icons.js`) |

## Possible next steps

- Cloud sync across devices (the `Taj` app does this with Firebase — the same
  `sync.js` pattern would drop in here).
- A one-time importer that reads `Financial.xlsx` and pre-fills past months.
- Categories / charts for the spending log.
