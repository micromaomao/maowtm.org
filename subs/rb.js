const express = require('express')
const _pages = require('../pages')
let pages

module.exports = function (db, lock) {
  let mongoose = db
  pages = _pages(db)
  mongoose.Schema = require('mongoose').Schema

  let rbAnoyMessageSchema = new mongoose.Schema({
    message: 'String',
    time: 'Number',
    deleted: {type: 'Boolean', default: false}
  })
  let RbAnoyMessage = mongoose.model('rbAnoyMessage', rbAnoyMessageSchema)

  let rRb = express.Router()

  rRb.get('/', function (req, res, next) {
    RbAnoyMessage.find({deleted: false}).sort({time: -1}).exec((err, msgs) => {
      if (err) {
        next(err)
        return
      }
      res.send(pages.rbIndex({msgs}))
    })
  })
  rRb.post('/', function (req, res, next) {
    let ctype = req.get('Content-Type')
    if (ctype !== 'text/plain') {
      res.status(415)
      res.send('Content type incorrect.')
      return
    }
    let body = ''
    req.setEncoding('utf8')
    let done = false
    req.on('data', chunk => {
      if (done) return
      if (body.length + chunk.length > 255) {
        res.status(413)
        res.send('Content excess the character limit of 255.')
        done = true
        return
      }
      body += chunk
    })
    req.on('end', () => {
      if (done) return
      done = true
      body = body.trim()
      if (body.length === 0) {
        res.status(403)
        res.send('Content is empty.')
        return
      }
      let msg = new RbAnoyMessage({message: body, time: Date.now()})
      msg.save(err => {
        if (err) {
          next(err)
        } else {
          res.end()
        }
      })
    })
  })

  return function (req, res, next) {
    if (req.hostname === 'rb.maowtm.org') {
      rRb(req, res, next)
    } else {
      next()
    }
  }
}
