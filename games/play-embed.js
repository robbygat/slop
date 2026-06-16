// Loaded by launch games when embedded on play.html (?play=1).
// Hides the in-game back link, centers the stage at its native aspect ratio,
// and breaks out to the top window if a legacy back link is clicked.
(function () {
  if (!new URLSearchParams(location.search).has('play')) return;

  const css = `
    html.slop-play-embed, body.slop-play-embed {
      margin: 0 !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }
    body.slop-play-embed {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    body.slop-play-embed .back-link {
      display: none !important;
    }
    body.slop-play-embed #shell,
    body.slop-play-embed #stage-wrap {
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      max-width: 100% !important;
      max-height: 100% !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    /* Preserve each game's own aspect-ratio rules — only cap to the iframe box */
    body.slop-play-embed #stage {
      max-width: 100% !important;
      max-height: 100% !important;
      box-sizing: border-box !important;
      flex-shrink: 0 !important;
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  document.documentElement.classList.add('slop-play-embed');

  function markBody() {
    document.body?.classList.add('slop-play-embed');
    document.querySelectorAll('.back-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const dest = link.getAttribute('href') || '/index.html#games';
        if (window.top && window.top !== window) window.top.location.href = dest;
        else location.href = dest;
      });
    });
  }

  if (document.body) markBody();
  else document.addEventListener('DOMContentLoaded', markBody, { once: true });
})();
