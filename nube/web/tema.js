// Aplica el tema guardado antes de que se pinte la página (sin destello).
// "claro" u "oscuro" se fijan en <html data-tema>; "sistema" no pone nada y
// manda prefers-color-scheme. La elección vive solo en este navegador.
(function () {
  var tema = "sistema";
  try {
    tema = localStorage.getItem("tema") || "sistema";
  } catch (e) {}
  if (tema === "claro" || tema === "oscuro") document.documentElement.dataset.tema = tema;
})();
