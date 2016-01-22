const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const app = express();

// HTTP Redirect to HTTPS
app.use(function(req, res, next) {
    if(!req.secure) {
        res.redirect(302, 'https://' + req.hostname + req.originalUrl);
    } else {
        res.set('Strict-Transport-Security', 'max-age=10886400; includeSubdomains; preload');
        next();
    }
});

app.use(require('./subs/main'));
app.use(require('./subs/static'));

http.createServer(app).listen(80, process.env.N_LISTEN);
const httpsopts = {
    key: fs.readFileSync(process.env.N_SSLKEY),
    cert: fs.readFileSync(process.env.N_SSLCERT),
    ciphers: [
        "ECDHE-RSA-AES256-SHA384",
        "DHE-RSA-AES256-SHA384",
        "ECDHE-RSA-AES256-SHA256",
        "DHE-RSA-AES256-SHA256",
        "ECDHE-RSA-AES128-SHA256",
        "DHE-RSA-AES128-SHA256",
        "HIGH",
        "!aNULL", "!eNULL", "!EXPORT", "!DES", "!RC4", "!MD5", "!PSK", "!SRP", "!CAMELLIA"
    ].join(':'),
    honorCipherOrder: true
};
https.createServer(httpsopts, app).listen(443, process.env.N_LISTEN);
if(process.env.N_LISTEN2) {
    http.createServer(app).listen(80, process.env.N_LISTEN2);
    https.createServer(httpsopts, app).listen(443, process.env.N_LISTEN2);
}
