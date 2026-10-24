// Sends one anonymous page view to the visitor counter (see _counter/README.md).
// No cookies. Visit any page with ?notrack to stop counting your own visits in this browser,
// and with ?track to start again.
(function () {
    var ENDPOINT = "https://implausible.alexanderfarren23.workers.dev/c";
    if (ENDPOINT.indexOf("REPLACE-ME") !== -1) return; // not set up yet

    var host = location.hostname;
    if (location.protocol === "file:" || host === "localhost" || host === "127.0.0.1") return;
    try {
        if (/[?&]notrack\b/.test(location.search)) localStorage.setItem("count-ignore", "1");
        if (/[?&]track\b/.test(location.search)) localStorage.removeItem("count-ignore");
        if (localStorage.getItem("count-ignore")) return;
    } catch (e) {}

    // the page, without index.html or a trailing slash; Today in Physics also keeps its ?day=
    var path = location.pathname.replace(/index\.html$/, "").replace(/\/+$/, "") || "/";
    var day = location.search.match(/[?&]day=(\d\d-\d\d)/);
    if (day) path += "?day=" + day[1];

    // where the visitor came from: another site's name, or a ?utm_source= tag on the link
    var ref = "";
    try {
        var r = new URL(document.referrer);
        if (r.hostname !== host) ref = r.hostname.replace(/^www\./, "");
    } catch (e) {}
    var utm = location.search.match(/[?&]utm_source=([^&]+)/);
    if (utm) ref = decodeURIComponent(utm[1]);

    var body = JSON.stringify({ p: path, r: ref });
    if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, body);
    else fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, mode: "no-cors" });
})();
