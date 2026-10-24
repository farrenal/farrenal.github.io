# Visitor counter

A free, cookie-free visitor counter for alexfarren.com, replacing Plausible. It has two parts:

- **`/count.js`** (in the site's root folder) runs on each page and sends one small message per page view:
  the page and the site the visitor came from. The pages that load it are the homepage, CloudChamber,
  Potts, Solitons and TodayInPhysics.
- **`worker.js`** (this folder) runs on Cloudflare. It stores daily totals in a D1 database and shows them
  on a password-protected stats page.

GitHub Pages doesn't publish folders whose names start with `_`, so this folder stays off the website.

## What it records

For each day and page: views, unique visitors, the referring site, the country, the city and region, and
the device type (desktop, mobile or tablet). Cloudflare works out the country and city from the IP address,
which is then discarded. The city is approximate (often the nearest large town or the internet provider's
hub), and is sometimes unknown. It uses no cookies and stores no IP addresses. A visitor is recognised within
one day by a scrambled code made from their IP address, browser and a random value that is replaced
every day, and the previous day's codes are deleted. This is the same approach Plausible uses.
Bots, other websites, and visits from `localhost` or files opened directly are ignored.

It also records:

- **Time on page:** how long each page was actually on screen (time in a background tab doesn't
  count). Each page load gets a fresh random code, which is used only to update its own total.
- **Outgoing links, downloads and email links:** found automatically. A link counts as a download
  if it ends in `.pdf`, `.zip`, `.pptx`, `.mp4` or similar.
- **Interactions:** any button or slider with a `data-count` attribute, for example
  `<button data-count="source" data-count-label="Am-241">`. Sliders count once when let go.
  Page code can also call `countEvent("name", "label")`. Clicks made by the page's own code
  (like Solitons opening its first tab) are ignored, and each page view sends at most 60 events.

## Setting it up (Cloudflare dashboard, about 10 minutes)

The names of buttons may differ slightly from these.

1. **Create the database.** Go to *Storage & Databases → D1 SQL Database → Create*, and name it `site-counter`.
   You don't need to create any tables: the worker does that itself.
2. **Create the worker.** Go to *Workers & Pages → Create → Worker*, start from "Hello World" and name it
   `site-counter`, then *Deploy*. Open *Edit code*, replace everything with the contents of `worker.js`,
   and *Deploy* again.
3. **Connect the database.** In the worker, open *Settings → Bindings → Add → D1 database*. Set the variable
   name to `DB`, choose `site-counter`, and save.
4. **Set the stats password.** Open *Settings → Variables and Secrets → Add*. Set the type to *Secret*, the name
   to `STATS_PASSWORD` and the value to a password you choose, then save.
5. **Point the site at the worker.** Copy the worker's address from its overview page. In `/count.js`,
   put it on the `ENDPOINT` line with `/c` on the end. (Done: the worker is called `implausible`, and
   `ENDPOINT` is `https://implausible.alexanderfarren23.workers.dev/c`.)
6. **Push the website.**
7. **Stop counting yourself.** Open `https://alexfarren.com/?notrack` once in each browser you use.
   `?track` turns counting back on.

## Adding counting to a new page

Put `<script defer src="/count.js"></script>` in the page's `<head>`, and give the controls you want
counted a `data-count="..."` attribute (plus `data-count-label="..."` to tell similar buttons apart).

## Seeing the stats

Open https://implausible.alexanderfarren23.workers.dev/ in a browser. Any username works, with the password from step 4.
You can choose 7 days, 30 days, 90 days, 1 year or all time, and click a page to see its numbers alone.
`/stats.json` gives the same numbers as data.

## Notes

- **Free limits:** Workers allows 100,000 requests a day. D1 allows 100,000 rows written a day, and each
  page view writes about 4, so roughly 25,000 page views a day fit within the free tier.
- **Visitors:** "Visitors" is counted once per day. A whole-site total counts someone who reads three pages
  once. The per-page, country and device tables count a visitor once for each page they open.
- **Time zone:** days are in UTC.
- **Daily tidy-up:** deleting old visitor codes happens with the first visit of each day. If you also want
  it at a fixed time, add a cron trigger such as `5 0 * * *` under *Settings → Trigger events*.
- **Fake visits:** someone could deliberately send fake page views. For a personal site that isn't worth
  defending against, but the numbers aren't tamper-proof.
- **Updating the worker:** paste the new `worker.js` into *Edit code* and deploy. The data is kept.
  New tables and columns are added automatically the first time the new version runs.
  **Deploy the worker before pushing a newer `count.js`.** An older worker counts the newer message
  types as extra page views.
