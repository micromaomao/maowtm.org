const express = require('express')
const _pages = require('../pages')
let pages

module.exports = function (db, lock) {
  let mongoose = db
  pages = _pages(db)
  mongoose.Schema = require('mongoose').Schema

  let rMww = express.Router()

  rMww.get('/', function (req, res, next) {
    res.send(pages.moe())
  })

  rMww.get('/get-204/', function (req, res, next) {
    res.status(204)
    res.end()
  })

  return function (req, res, next) {
    if (req.hostname === 'mww.moe') {
      rMww(req, res, next)
    } else {
      next()
    }
  }
}
