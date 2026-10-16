// Aplica el tema antes de que se pinte la página (sin destello).
// "claro" u "oscuro" se fijan en <html data-tema>; "sistema" no pone nada y
// manda prefers-color-scheme. La elección vive solo en este navegador.
// ?tema=claro|oscuro en la dirección lo fija solo para esa visita (lo usa
// scripts/tarjeta-social.mjs para la tarjeta en modo claro).
(function () {
  var tema = "sistema";
  try {
    tema = localStorage.getItem("tema") || "sistema";
  } catch (e) {}
  var enUrl = /[?&]tema=(claro|oscuro)\b/.exec(location.search);
  if (enUrl) tema = enUrl[1];
  if (tema === "claro" || tema === "oscuro") document.documentElement.dataset.tema = tema;
})();
