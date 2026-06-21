// Shared chrome for the screen-map recorder test site (Northwind shop).
// Builds the top nav on every page + a tiny SPA push helper. Absolute paths so
// relative resolution never breaks after an SPA pushState changes the pathname.
(function () {
  var NAV = [
    ['Home', '/sm-home.html'],
    ['Shop', '/sm-shop.html'],
    ['Search', '/sm-search.html'],
    ['Cart', '/sm-cart.html'],
    ['Account', '/sm-account.html'],
    ['Help', '/sm-help.html'],
  ];

  var css =
    '.sm-nav{display:flex;gap:14px;align-items:center;padding:14px 24px;background:#111;color:#fff;position:sticky;top:0;z-index:10}' +
    '.sm-nav a{color:#fff;text-decoration:none;font-size:14px}' +
    '.sm-nav .sm-brand{font-weight:700;margin-right:auto;font-size:16px}' +
    'body{font-family:system-ui,sans-serif;margin:0;color:#111;background:#f5f5f7}' +
    'main{padding:32px 24px;max-width:920px}' +
    'main a,button{display:inline-block;margin:6px 10px 0 0;padding:9px 14px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#111;text-decoration:none;font:inherit;cursor:pointer}' +
    'h1{margin-top:0}h2{margin:24px 0 8px}.grid{display:flex;flex-wrap:wrap;gap:12px}' +
    '.card{border:1px solid #ddd;border-radius:10px;padding:14px;background:#fff;width:200px}' +
    'input,select{display:block;margin:6px 0;padding:9px 12px;border:1px solid #ccc;border-radius:8px;width:280px;font:inherit}' +
    '.muted{color:#666;font-size:13px}';

  function build() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var header = document.createElement('header');
    header.className = 'sm-nav';
    var brand = document.createElement('a');
    brand.href = '/sm-home.html';
    brand.textContent = 'Northwind';
    brand.className = 'sm-brand';
    header.appendChild(brand);
    NAV.forEach(function (n) {
      var a = document.createElement('a');
      a.href = n[1];
      a.textContent = n[0];
      header.appendChild(a);
    });
    document.body.insertBefore(header, document.body.firstChild);
  }

  // SPA navigation helper — pushState (recorder observes it) then re-render.
  window.smPush = function (path, render) {
    history.pushState({}, '', path);
    if (typeof render === 'function') render();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
