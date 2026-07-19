/* ==========================================================
   MASTER MUSIC · Shared Utilities
   Cargado antes que el resto de scripts. Elimina código
   duplicado en app.js, seven.js, spotify.js, visualizer.js
   y colors.js.
   ========================================================== */
(function () {
  'use strict';

  const w = window;

  w.$ = function (id) { return document.getElementById(id); };

  w.formatTime = function (s) {
    if (!isFinite(s) || s < 0) return '0:00';
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + sec.toString().padStart(2, '0');
  };

  w.escapeHtml = function (s) {
    s = String(s || '');
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  w.hexToRgb = function (hex) {
    if (hex.startsWith('rgb')) {
      var m = hex.match(/\d+/g);
      return { r: +m[0], g: +m[1], b: +m[2] };
    }
    var c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(function (x) { return x + x; }).join('');
    return {
      r: parseInt(c.substring(0, 2), 16),
      g: parseInt(c.substring(2, 4) || c.substring(2, 2), 16),
      b: parseInt(c.substring(4, 6) || c.substring(4, 2), 16),
    };
  };

  w.rgbToHex = function (rgb) {
    var p = function (v) {
      return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    };
    return '#' + p(rgb.r) + p(rgb.g) + p(rgb.b);
  };

  w.darken = function (hex, factor) {
    var c = w.hexToRgb(hex);
    return w.rgbToHex({ r: c.r * (1 - factor), g: c.g * (1 - factor), b: c.b * (1 - factor) });
  };

  w.lighten = function (hex, factor) {
    var c = w.hexToRgb(hex);
    return w.rgbToHex({
      r: c.r + (255 - c.r) * factor,
      g: c.g + (255 - c.g) * factor,
      b: c.b + (255 - c.b) * factor,
    });
  };

  w.rgbStr = function (c) { return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')'; };

  w.rgbaStr = function (c, a) {
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (a === undefined ? 1 : a) + ')';
  };

  w.cssVar = function (name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || (fallback || '');
  };
})();
