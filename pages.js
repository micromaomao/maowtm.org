const pug = require('pug');
const fs = require('fs');
const sass = require('node-sass');
const path = require('path');

var pages = {};
var pagesfo = __dirname + '/pages/';
var list = fs.readdirSync(pagesfo);
const ghUrl = "https://github.com/micromaomao/maowtm.org/tree/master/";
function mapStatic(url) {
    url = url.getValue();
    if (url[0] !== "/")
        url = "/" + url;
    return sass.types.String("url(https://static.maowtm.org" + url + ")");
}
function preProcess(html, pugFile, sassFile) {
    return "<!-- Mixed and minified html + css:\n" +
           "     Source:      " + ghUrl + "pages/" + pugFile + "\n" +
           "     Style sheet: " + (sassFile ? (ghUrl + "style/" + sassFile) : "none") + " -->\n\n" + html.replace(/\s{0,}\n\s{0,}/g, " ");
}
list.forEach(function (fname) {
    var fnmatch = fname.match(/^([A-Za-z0-9\-_]+)\.pug/);
    if (fnmatch) {
        var name = fnmatch[1];
        var sassFile = path.join(__dirname, 'style', name + '.sass');
        var pugfn = pug.compileFile(pagesfo + fname);
        fs.access(sassFile, fs.R_OK, function(err) {
            if (!err) {
                sass.render({
                    file: sassFile,
                    outputStyle: "compressed",
                    functions: {
                        'mapStatic($url)': mapStatic
                    }
                }, function(err, sassResult) {
                    if (err) {
                        console.error(err);
                        css = false;
                    }
                    pages[name] = function(o) {
                        o = o || {};
                        var n = Object.create(o);
                        n.style = sassResult.css;
                        return preProcess(pugfn(n), fname, name + '.sass');
                    };
                });
            } else {
                pages[name] = function(o) {
                    return preProcess(pugfn(o), fname);
                };
                console.log('pages: style for ' + fname + ' not find.');
            }
        });
    } else {
        console.log('pages: skipped ' + fname + ' .');
    }
});

module.exports = pages;
