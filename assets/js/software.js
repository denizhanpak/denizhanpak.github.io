/* Software page (_pages/software.html): fills in live data from the GitHub REST API. Everything on the page is
   already rendered from _data/software.yml, so if a request fails (e.g. the unauthenticated limit of 60 an hour is
   used up) the page keeps its static content. */
(function () {
  "use strict";

  var API = "https://api.github.com";
  var HTML = "application/vnd.github.html+json";

  function get(path, accept) {
    return fetch(API + path, { headers: { Accept: accept || "application/vnd.github+json" } }).then(function (r) {
      if (!r.ok) throw new Error(r.status + " " + path);
      return accept === HTML ? r.text() : r.json();
    });
  }

  function ago(iso) {
    var days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
    if (days < 1) return "today";
    if (days < 2) return "yesterday";
    if (days < 60) return days + " days ago";
    var months = Math.floor(days / 30.4);
    if (months < 24) return months + " months ago";
    return Math.floor(months / 12) + " years ago";
  }

  // Language, stars and last push on each card.
  document.querySelectorAll(".sw-card").forEach(function (card) {
    get("/repos/" + card.getAttribute("data-repo")).then(function (d) {
      var bits = [];
      var lang = card.getAttribute("data-language") || d.language;  // override for repos GitHub misclassifies
      if (lang) bits.push(lang);
      bits.push("★ " + d.stargazers_count);
      bits.push("updated " + ago(d.pushed_at));
      card.querySelector(".sw-card__meta").textContent = bits.join(" · ");
    }).catch(function () {});
  });

  // README, fetched the first time its <details> is opened. GitHub renders and sanitizes the markdown; relative links
  // and images are pointed back at the repository.
  document.querySelectorAll(".sw-readme").forEach(function (det) {
    var loaded = false;
    det.addEventListener("toggle", function () {
      if (!det.open || loaded) return;
      loaded = true;
      var repo = det.closest(".sw-card").getAttribute("data-repo");
      var body = det.querySelector(".sw-readme__body");
      get("/repos/" + repo + "/readme", HTML).then(function (html) {
        body.innerHTML = html;
        // The README's own title repeats the card's name.
        var article = body.querySelector("article") || body;
        var first = article.firstElementChild;
        if (first && (first.tagName === "H1" || first.querySelector(":scope > h1"))) first.remove();

        body.querySelectorAll("a[href]").forEach(function (a) {
          var href = a.getAttribute("href");
          if (href.charAt(0) === "#") {
            var target = body.querySelector('[id="user-content-' + href.slice(1) + '"], [id="' + href.slice(1) + '"]');
            // GitHub puts the id on the heading's (hidden) permalink icon; scroll to the heading itself.
            if (target) target = target.closest(".markdown-heading") || target;
            if (target) {
              a.addEventListener("click", function (e) { e.preventDefault(); target.scrollIntoView({ block: "start" }); });
              return;
            }
            href = "https://github.com/" + repo + "#" + href.slice(1);
          } else if (!/^(https?:|mailto:)/.test(href)) {
            href = "https://github.com/" + repo + "/blob/HEAD/" + href.replace(/^\.?\//, "");
          }
          a.setAttribute("href", href);
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener");
        });
        body.querySelectorAll("img[src]").forEach(function (img) {
          var src = img.getAttribute("src");
          if (!/^(https?:|data:)/.test(src)) {
            img.setAttribute("src", "https://raw.githubusercontent.com/" + repo + "/HEAD/" + src.replace(/^\.?\//, ""));
          }
          img.setAttribute("loading", "lazy");
        });
      }).catch(function () {
        body.innerHTML = '<p class="sw-note">Could not load the README from GitHub. <a href="https://github.com/' +
          repo + '#readme">Read it on GitHub</a>.</p>';
        loaded = false;
      });
    });
  });

  // Pull-request states, in one search request.
  var prs = document.querySelectorAll(".sw-pr");
  if (prs.length) {
    get("/search/issues?q=" + encodeURIComponent("author:denizhanpak type:pr org:JuliaDynamics") + "&per_page=100")
      .then(function (d) {
        var byUrl = {};
        d.items.forEach(function (it) { byUrl[it.html_url] = it; });
        prs.forEach(function (li) {
          var it = byUrl[li.getAttribute("data-pr")];
          if (!it) return;
          var merged = it.pull_request && it.pull_request.merged_at;
          var state = merged ? "merged" : it.state === "open" ? "open" : "closed";
          var tag = li.querySelector(".sw-pr__state");
          tag.textContent = state === "open" ? "in review" : state;
          tag.className = "sw-pr__state is-" + state;
        });
      }).catch(function () {});
  }
})();
