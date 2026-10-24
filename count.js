// Anonymous visitor counter (see _counter/README.md). No cookies, nothing stored on the visitor's device.
//
// Sends three kinds of message to the counter:
//   - one page view when the page loads;
//   - how long the page was on screen, when the visitor switches away or leaves;
//   - events: clicks on links to other sites, file downloads (PDFs etc.), email links, and any button or
//     slider marked with data-count="name" (optionally data-count-label="..."). Pages can also call
//     window.countEvent("name", "label") themselves.
//
// Visit any page with ?notrack to stop counting your own visits in this browser, and ?track to start again.
(function () {
    var ENDPOINT = "https://implausible.alexanderfarren23.workers.dev/c";
    var noop = function () {};
    window.countEvent = noop;

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

    function send(msg) {
        msg.p = path;
        var body = JSON.stringify(msg);
        try {
            if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
        } catch (e) {}
        try { fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, mode: "no-cors" }); } catch (e) {}
    }

    // ---- page view
    var ref = "";
    try {
        var r = new URL(document.referrer);
        if (r.hostname !== host) ref = r.hostname.replace(/^www\./, "");
    } catch (e) {}
    var utm = location.search.match(/[?&]utm_source=([^&]+)/);
    if (utm) ref = decodeURIComponent(utm[1]);
    send({ t: "pv", r: ref });

    // ---- time on page: only time the page is actually visible counts
    var id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
    var visibleMs = 0, since = document.visibilityState === "visible" ? Date.now() : null, lastSent = -1;
    function flushTime() {
        if (since !== null) { visibleMs += Date.now() - since; since = null; }
        var s = Math.round(visibleMs / 1000);
        if (s !== lastSent) { lastSent = s; send({ t: "time", id: id, s: s }); }
    }
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") flushTime();
        else since = Date.now();
    });
    window.addEventListener("pagehide", flushTime);

    // ---- events, with limits so a busy clicker can't flood the counter
    var sentCount = 0, lastAt = {};
    function countEvent(name, label) {
        name = String(name || "").slice(0, 40);
        label = label == null ? "" : String(label).slice(0, 120);
        if (!name || sentCount >= 60) return;
        var key = name + "|" + label, now = Date.now();
        if (lastAt[key] && now - lastAt[key] < 1500) return;
        lastAt[key] = now;
        sentCount++;
        send({ t: "e", e: name, l: label });
    }
    window.countEvent = countEvent;

    var FILES = /\.(pdf|zip|tar|gz|pptx?|key|docx?|xlsx?|csv|tex|ipynb|mp4|mov|m4v|webm|mp3)$/i;
    function onLinkClick(ev) {
        if (!ev.isTrusted) return;
        var a = ev.target.closest && ev.target.closest("a[href]");
        if (!a) return;
        var href = a.getAttribute("href") || "";
        if (/^mailto:/i.test(href)) return countEvent("email", href.replace(/^mailto:/i, "").split("?")[0]);
        var u;
        try { u = new URL(a.href, location.href); } catch (e) { return; }
        if (!/^https?:$/.test(u.protocol)) return;
        if (FILES.test(u.pathname)) {
            var label = u.hostname === host ? u.pathname : u.hostname.replace(/^www\./, "") + u.pathname;
            return countEvent("download", label);
        }
        if (u.hostname !== host) {
            return countEvent("outbound", (u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/$/, ""));
        }
    }
    document.addEventListener("click", onLinkClick, true);
    document.addEventListener("auxclick", onLinkClick, true); // middle-click to open in a new tab

    // buttons and other elements marked with data-count="..."
    document.addEventListener("click", function (ev) {
        if (!ev.isTrusted) return; // ignore clicks made by the page's own code
        var el = ev.target.closest && ev.target.closest("[data-count]");
        if (!el || el.tagName === "INPUT" && el.type === "range") return;
        countEvent(el.getAttribute("data-count"), el.getAttribute("data-count-label"));
    }, true);
    // sliders marked with data-count="...": counted once when let go
    document.addEventListener("change", function (ev) {
        var el = ev.target;
        if (!ev.isTrusted || !el.matches || !el.matches("input[type=range][data-count]")) return;
        countEvent(el.getAttribute("data-count"), el.getAttribute("data-count-label"));
    }, true);
})();
