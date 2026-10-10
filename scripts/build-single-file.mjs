// Builds one self-contained HTML file (everything inlined) for hosts that block outside files.
// Usage: node scripts/build-single-file.mjs out.html
import fs from 'node:fs';
const r = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const snap = JSON.parse(r('data/snapshot.json'));
let html = r('index.html');
const sat = 'data:image/jpeg;base64,' + fs.readFileSync(new URL('../img/satellite.jpg', import.meta.url)).toString('base64');
const loader = r('js/loader.js')
  .replace("getJson('data/world.json')", 'Promise.resolve(window.__WORLD)')
  .replace("getJson('data/pipelines.json')", 'Promise.resolve(window.__GEM)')
  .replace("getJson('data/snapshot.json')", 'Promise.resolve(window.__SNAP)')
  .replace("window.SAT = 'img/satellite.jpg';", 'window.SAT = window.__SAT;')
  .replace(/const s = document\.createElement\('script'\);[\s\S]*?document\.body\.appendChild\(s\);/, 'window.__startApp();');
const app = 'window.__startApp=function(){\n' + r('js/app.js') + '\n};';
html = html
  .replace('<script src="vendor/d3.min.js"></script>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>')
  .replace('<script src="vendor/topojson-client.min.js"></script>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js"></script>')
  .replace('<script src="js/config.js"></script>', () => '<script>window.TRACKER_CONFIG={};window.__SNAP=' + JSON.stringify(snap).replace(/</g, '\\u003c') + ';\nwindow.__WORLD=' + r('data/world.json') + ';\nwindow.__GEM=' + r('data/pipelines.json') + ';\nwindow.__SAT="' + sat + '";\n' + app.replace(/<\/script/g, '<\\/script') + '</script>')
  .replace('<script src="js/loader.js"></script>', () => '<script>' + loader + '</script>');
fs.writeFileSync(process.argv[2], html);
console.log((html.length / 1e6).toFixed(2) + ' MB');
