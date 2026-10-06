// Poster & slide export — self-contained CSS + document wrappers so a
// conference poster or a printable slide deck can be saved as one HTML file
// (print-to-PDF). Everything is scoped under .poster / .deck so the same CSS
// styles the on-screen preview and the exported file.

export const POSTER_CSS = `
.poster{--navy:#171a1e;--blue:#3b5ff0;--red:#b23b3b;--yellow:#94650f;--green:#2e7d4f;--amber:#94650f;--violet:#5f54b8;--research:#23766f;
--ink:#121417;--ink-2:#454b54;--muted:#5f6670;--line:#e1e4e8;--card-2:#f7f8f9;
--sans:'Geist',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;--mono:'Geist Mono',ui-monospace,Menlo,Consolas,monospace}
.poster{width:1160px;background:#fff;color:var(--ink);font-family:var(--sans);line-height:1.42;margin:0 auto}
.poster *{box-sizing:border-box}
.poster-head{background:var(--navy);position:relative;color:#fff;padding:26px 30px;border-bottom:4px solid var(--blue)}
.poster-head .livery{position:absolute;top:0;right:0;height:100%;display:flex}
.poster-head .livery i{width:14px}.poster-head .livery i.r{background:var(--blue)}.poster-head .livery i.y{background:var(--research)}
.poster-head h1{margin:0 0 8px;font-size:30px;line-height:1.15;max-width:1000px}
.poster-head .auth{font-size:15px;opacity:.9;font-family:var(--mono)}
.poster-head .badge{display:inline-block;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;background:rgba(255,255,255,.15);padding:4px 10px;border-radius:6px;margin-bottom:10px}
.poster-cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;padding:20px 22px 26px}
.pblock{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:#fff;break-inside:avoid;margin-bottom:18px}
.pblock h2{margin:0 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:.04em;color:var(--navy);border-bottom:1px solid var(--line);padding-bottom:6px;display:flex;align-items:center;gap:8px}
.pblock h2 .sq{width:11px;height:11px;border-radius:3px;flex:none}
.pblock p{margin:7px 0;font-size:13.5px}.pblock ul{margin:6px 0;padding-left:18px;font-size:13px}
.pblock li{margin:3px 0}.pblock .small{font-size:11.5px;color:var(--muted)}.pblock .mono{font-family:var(--mono)}
.poster figure{margin:6px 0;background:var(--card-2);border:1px solid var(--line);border-radius:10px;padding:10px}
.poster figure svg{width:100%;height:auto;display:block}
.bigstat{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0}
.bigstat .s{flex:1;min-width:104px;background:var(--card-2);border:1px solid var(--line);border-top:3px solid var(--blue);border-radius:9px;padding:9px 11px}
.bigstat .s b{display:block;font-size:22px;line-height:1.1;color:var(--navy)}
.bigstat .s span{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-family:var(--mono)}
.pill-row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.pill{font-family:var(--mono);font-size:11px;font-weight:700;padding:4px 8px;border-radius:7px;border:1px solid var(--line);color:var(--navy)}
.reflist{font-size:10.5px;color:var(--ink-2);margin:4px 0;padding-left:16px}.reflist li{margin:2px 0}
`

export const SLIDES_CSS = `
.deck{--navy:#171a1e;--blue:#3b5ff0;--red:#b23b3b;--yellow:#94650f;--green:#2e7d4f;--amber:#94650f;--violet:#5f54b8;--research:#23766f;--ink:#121417;--muted:#5f6670;--line:#e1e4e8;--card-2:#f7f8f9;
--sans:'Geist',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;--mono:'Geist Mono',ui-monospace,Menlo,Consolas,monospace}
.deck{--slidew:960px}
.deck *{box-sizing:border-box}
.slide{width:960px;height:540px;background:#fff;color:var(--ink,#0a1230);font-family:var(--sans);margin:0 auto 22px;padding:44px 52px;position:relative;border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.slide .kick{font-family:var(--mono);font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--blue);font-weight:700}
.slide h2{font-size:30px;margin:6px 0 14px;color:var(--navy);line-height:1.15}
.slide.title{background:var(--navy);color:#fff;justify-content:center}
.slide.title h2{color:#fff;font-size:36px;max-width:800px}
.slide.title .kick{color:#aebeff}
.slide.title .auth{font-family:var(--mono);opacity:.85;margin-top:14px}
.slide .livery{position:absolute;top:0;left:0;width:100%;height:8px;display:flex}
.slide .livery i{flex:1}.slide .livery i.n{background:#30363d}.slide .livery i.r{background:var(--blue)}.slide .livery i.y{background:var(--research)}
.slide ul{font-size:19px;line-height:1.6;margin:6px 0;padding-left:24px}.slide li{margin:6px 0}
.slide p{font-size:18px;margin:8px 0}
.slide .grow{flex:1;display:flex;gap:22px;align-items:center;min-height:0}
.slide figure{margin:0;flex:1;min-width:0}.slide figure svg{width:100%;height:auto;max-height:330px}
.slide .stats{display:flex;gap:14px;flex-wrap:wrap}
.slide .stats .s{background:var(--card-2);border:1px solid var(--line);border-top:3px solid var(--blue);border-radius:10px;padding:12px 16px}
.slide .stats .s b{display:block;font-size:30px;color:var(--navy)}.slide .stats .s span{font-size:12px;color:var(--muted);font-family:var(--mono)}
.slide .foot{position:absolute;bottom:16px;left:52px;right:52px;font-size:11px;color:var(--muted);font-family:var(--mono);display:flex;justify-content:space-between}
@media print{@page{size:960px 540px;margin:0}body{margin:0}.slide{margin:0;border:none;border-radius:0;page-break-after:always;break-after:page}}
`

export function posterDoc(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')} — poster</title><style>@page{size:A1 landscape;margin:8mm}body{margin:0;background:#eef0f2;padding:20px}${POSTER_CSS}</style></head><body>${inner}</body></html>`
}
export function slidesDoc(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')} — slides</title><style>body{margin:0;background:#eef0f2;padding:20px}${SLIDES_CSS}</style></head><body><div class="deck">${inner}</div></body></html>`
}
