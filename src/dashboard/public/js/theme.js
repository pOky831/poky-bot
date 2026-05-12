// Shared theme switcher - loaded on all dashboard pages
(function() {
  var saved = localStorage.getItem('poky-theme') || 'pink';
  document.documentElement.setAttribute('data-theme', saved);

  document.addEventListener('DOMContentLoaded', function() {
    var dots = document.querySelectorAll('.theme-dot');
    dots.forEach(function(d) {
      if (d.getAttribute('data-theme') === saved) {
        d.classList.add('active');
      } else {
        d.classList.remove('active');
      }
      d.addEventListener('click', function() {
        var theme = this.getAttribute('data-theme');
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('poky-theme', theme);
        dots.forEach(function(dd) { dd.classList.remove('active'); });
        this.classList.add('active');
      });
    });
  });
})();
