// TODO: Fix neg problem on page.
const express = require('express')
const http = require('http')
const spdy = require('spdy')
const fs = require('fs')
const url = require('url')
const mongoose = require('mongoose')
mongoose.Promise = global.Promise
const redis = require('redis')
const redislock = require('redis-lock')
const compression = require('compression')
const path = require('path')
let pages

// This file will be launched with launcher.js.

var maowtm = function (config) {
  var app = express()
  config = config || {}
  this.config = config
  this._mongodb = config.db || 'mongodb://127.0.0.1'
  this.db = mongoose.createConnection(this._mongodb)
  this._redis = config.redis || '127.0.0.1'
  this.redis = redis.createClient({
    host: this._redis
  })
  this.lock = redislock(this.redis)
  // this._listen can be a array of address.
  this._listen = config.listen || []
  this._ssl = config.ssl
  this.acme = config.acme || null
  this.destory = false
  this.mockSecure = config.mockSecure || false
  this.noInitImages = config.noInitImages || false
  app.mockSecure = this.mockSecure
  var callback = config.callback
  function fail (error) {
    if (callback) {
      this.destory = true
      if (this.db) {
        this.db.close()
      }
      callback(error, null, function () {})
    } else {
      console.error('Error initalizing server:')
      console.error(error)
      process.exit(2)
    }
  }
  if ((!Array.isArray(this._listen) || this._listen.length > 0) && !this.mockSecure && !(this._ssl && this._ssl.cert && this._ssl.key)) {
    fail(new Error('No SSL certificate provided'))
    return
  }
  var _this = this

  this.db.on('error', function (err) {
    fail(err)
    return
  })
  this.db.on('open', function () {
    pages = require('./pages')(this.db)
    let acme = _this.acme
    if (!acme) {
      try {
        fs.accessSync('acme-challenge', fs.R_OK)
        console.log('ACME challenge file found.')
        acme = true
      } catch (e) {}
    }
    if (acme) {
      app.get('/.well-known/acme-challenge/*', function (req, res, next) {
        if (typeof acme === 'string') {
          res.send(acme)
          return
        }
        fs.readFile('acme-challenge', {encoding: 'utf-8'}, (err, data) => {
          if (err) {
            next(err)
          } else {
            res.type('text')
            res.send(data)
          }
        })
      })
    }

    app.use(compression())
    app.use(function (req, res, next) {
      if (!(req.secure || app.mockSecure)) {
        res.redirect(302, 'https://' + req.hostname + req.originalUrl)
      } else {
        res.set('Strict-Transport-Security', 'max-age=10886400; includeSubdomains; preload')
        res.set('X-XSS-Protection', '1; mode=block')
        res.set('X-Frame-Options', 'sameorigin')
        res.set('X-Content-Type-Options', 'nosniff')
        next()
      }
    })

    app.use(require('./subs/static')(_this.db, _this.lock))

    // Add trailing / for all GET for all router below. ( i.e. Not including static and img )
    app.use(function (req, res, next) {
      if (req.hostname.match(/^(img|static|file)/)) {
        next()
        return
      }
      var prasedUrl = url.parse(req.originalUrl, false)
      if (req.method === 'GET' && prasedUrl.pathname.substr(-1) !== '/') {
        prasedUrl.pathname += '/'
        res.redirect(302, url.format(prasedUrl))
      } else {
        next()
      }
    })

    app.use(require('./subs/main')(_this.db, _this.lock))
    app.use(require('./subs/rb')(_this.db, _this.lock))
    app.use(require('./subs/schsrch/main')(_this.db, _this.lock))
    app.use(require('./subs/misc')(_this.db, _this.lock))
    let nodeenv = process.env.NODE_ENV || ''
    app.use(function (err, req, res, next) {
      res.status(500)
      let pageObj = {err, req}
      if (typeof err !== 'string') {
        pageObj.err = err.message
        if (err.stack) {
          pageObj.stack = err.stack.replace(new RegExp(__dirname.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'), 'g'), '.../maowtm.org') +
            `\nServer running in NODE_ENV=${nodeenv}\nTime: ${Date.now() / 1000}`
        }
      }
      res.send(pages.error(pageObj))
    })

    function doSetupServer () {
      return new Promise((resolve, reject) => {
        const httpsopts = (_this._ssl ? {
          key: fs.readFileSync(_this._ssl.key),
          cert: fs.readFileSync(_this._ssl.cert)
        } : null)
        if (httpsopts && _this._ssl.ca) {
          httpsopts.ca = fs.readFileSync(_this._ssl.ca)
        }
        _this._servers = {
          http: [],
          http2: []
        }
        doAddImage().then(() => {
          if (!Array.isArray(_this._listen)) {
            if (httpsopts) {
              _this._servers.http2.push(spdy.createServer(httpsopts, app).listen(443, _this._listen))
            }
            _this._servers.http.push(http.createServer(app).listen(80, _this._listen))
          } else {
            _this._listen.forEach(function (address) {
              if (httpsopts) {
                _this._servers.http2.push(spdy.createServer(httpsopts, app).listen(443, address))
              }
              _this._servers.http.push(http.createServer(app).listen(80, address))
            })
          }
          resolve()
        }).catch(reject)
      })
    }
    const Image = _this.db.model('image')
    function doAddImage () {
      return new Promise((resolve, reject) => {
        function addImage (name, path) {
          return new Promise((resolve, reject) => {
            let distName = 's/' + name
            let query = Image.findOne({name: distName}, 'name')
            query.then(img => {
              if (!img) {
                console.log(`Adding image: ${distName}...`)
                fs.readFile(path, {encoding: null}, (err, data) => {
                  if (err) {
                    reject(err)
                    return
                  }
                  Image.addImage(distName, data, err => {
                    if (err) {
                      reject(`error when trying to add image ${name}: ${err.toString()}`)
                      return
                    }
                    resolve()
                  })
                })
              } else {
                resolve()
              }
            }).catch(err => {
              console.error('..')
              reject(`Can't check image cache: ${err}`)
              return
            })
          })
        }
        function addImageInDir (dir) {
          return new Promise((resolve, reject) => {
            let currentDirPath = path.join(__dirname, 'static', 'imgs', dir)
            fs.readdir(currentDirPath, (err, imgFiles) => {
              if (err) {
                reject(err)
                return
              }
              let promises = []
              imgFiles.forEach(name => {
                promises.push(new Promise((resolve, reject) => {
                  let currentName = path.join(dir, name)
                  let currentFileName = path.join(currentDirPath, name)
                  fs.stat(currentFileName, (err, stat) => {
                    if (err) {
                      reject(err)
                      return
                    }
                    if (stat.isFile()) {
                      addImage(currentName, currentFileName).then(resolve, reject)
                    } else if (stat.isDirectory()) {
                      addImageInDir(currentName).then(resolve, reject)
                    } else {
                      resolve()
                    }
                  })
                }))
              })
              Promise.all(promises).then(resolve, reject)
            })
          })
        }
        if (_this.noInitImages) {
          resolve()
        } else {
          addImageInDir('').then(resolve, reject)
        }
      })
    }
    doSetupServer().then(() => {
      console.log('Server ready.')
      if (callback) {
        callback(null, app, function () {
          _this._servers.http2.forEach(function (s) {
            s.close()
          })
          _this._servers.http.forEach(function (s) {
            s.close()
          })
          _this.destory = true
          _this.db.close()
        })
      }
    }).catch(err => { fail(err) })
  })
}

module.exports = maowtm
